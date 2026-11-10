/** Stripe Connect: platform charges, transfers only after explicit client approval.
 * No live payments until the Brazilian funds flow and operating policy are reviewed. */
import crypto from 'node:crypto';
import { db, one, run, tx } from './db';
export const SELECTED = process.env.PAYMENT_PROVIDER === 'stripe';
const key = process.env.STRIPE_SECRET_KEY || '';
export const LIVE = SELECTED && /^sk_live_/.test(key);
export const ENABLED = SELECTED && /^sk_(?:test|live)_/.test(key);
export const SANDBOX = !LIVE;
export const PIX = process.env.STRIPE_PIX_ENABLED === 'true';
export class PaymentError extends Error { constructor(message: string, public status = 409) { super(message); } }
type Account = {id: string; identity?: {country?: string}; configuration?: {
 merchant?: {capabilities?: {stripe_balance?: {payouts?: {status?: string}}}};
 recipient?: {capabilities?: {stripe_balance?: {stripe_transfers?: {status?: string}}}};
}};
type Session = {id: string; url: string; status: string; payment_status: string; amount_total: number; currency: string; payment_intent: string};
type Intent = {id: string; status: string; amount_received: number; currency: string; latest_charge: string};
type Charge = {id: string; refunded: boolean; amount_refunded: number; disputed: boolean};
type Payment = {milestone_id: number; account: string; amount: number; session: string; url: string; intent: string; charge: string; transfer: string; blocked: number; checkout_started: number; release_started: number};
db.exec(`CREATE TABLE IF NOT EXISTS stripe_accounts (user_id INTEGER PRIMARY KEY REFERENCES users(id), account TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS stripe_payments (
 milestone_id INTEGER PRIMARY KEY REFERENCES milestones(id), account TEXT NOT NULL, amount INTEGER NOT NULL,
 session TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', intent TEXT NOT NULL DEFAULT '', charge TEXT NOT NULL DEFAULT '',
 transfer TEXT NOT NULL DEFAULT '', blocked INTEGER NOT NULL DEFAULT 0, checkout_started INTEGER NOT NULL, release_started INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS stripe_account_attempts (user_id INTEGER PRIMARY KEY REFERENCES users(id), started INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, received_at TEXT NOT NULL DEFAULT (datetime('now')));`);
try { db.exec('ALTER TABLE stripe_accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 0'); } catch {}
export function assertConfigured() {
 if (!ENABLED) throw new PaymentError('Configure STRIPE_SECRET_KEY (sk_test_... ou sk_live_...) para ativar pagamentos via Stripe.', 503);
}
async function api<T>(path: string, fields?: Record<string, string | number>, idempotency?: string): Promise<T> {
 assertConfigured();
 const response = await fetch('https://api.stripe.com/v1/' + path, {method: fields ? 'POST' : 'GET', headers: {
 Authorization: `Bearer ${key}`, 'Stripe-Version': '2025-02-24.acacia', ...(idempotency ? {'Idempotency-Key': idempotency} : {}),
 ...(fields ? {'Content-Type': 'application/x-www-form-urlencoded'} : {})}, body: fields ? new URLSearchParams(Object.entries(fields).map(([k,v]) => [k,String(v)] as [string, string])) : undefined, signal: AbortSignal.timeout(20000)});
 if (!response.ok) throw new PaymentError('A Stripe não concluiu a operação. Tente novamente ou confira o Dashboard de testes.', 502);
 return await response.json() as T;
}
async function accountApi<T>(path: string, body?: object, idempotency?: string): Promise<T> {
 assertConfigured();
 const response = await fetch('https://api.stripe.com/v2/core/' + path, {
  method: body ? 'POST' : 'GET', headers: {Authorization: `Bearer ${key}`, 'Stripe-Version': '2026-10-28.endive',
   'Content-Type': 'application/json', ...(idempotency ? {'Idempotency-Key': idempotency} : {})},
  body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
 });
 if (!response.ok) {
  const data = await response.json() as {error?: {code?: string}};
  const code = (data.error?.code || String(response.status)).replace(/[^a-zA-Z0-9_]/g, '').slice(0,100);
  const requestId = (response.headers.get('request-id') || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0,100);
  throw new PaymentError(`A Stripe não concluiu o cadastro (${code}). Referência para suporte: ${requestId}.`,502);
 }
 return await response.json() as T;
}
export async function onboarding(userId: number, base: string) {
 assertConfigured();
 let row = one<{account: string}>('SELECT account FROM stripe_accounts WHERE user_id = ?', userId);
 if (!row) {
  run('INSERT OR IGNORE INTO stripe_account_attempts (user_id,started) VALUES (?,?)',userId,Date.now());
  const attempt = one<{started:number}>('SELECT started FROM stripe_account_attempts WHERE user_id=?',userId)!;
  fresh(attempt.started);
  const user = one<{email: string}>('SELECT email FROM users WHERE id=?',userId);
  if (!user) throw new PaymentError('Usuário não encontrado.',404);
  const acc = await accountApi<Account>('accounts', {
   contact_email: user.email,
   dashboard: 'express', identity: {country: 'br'},
   defaults: {responsibilities: {fees_collector: 'application', losses_collector: 'application'}},
   configuration: {merchant: {capabilities: {card_payments: {requested: true}}}, recipient: {capabilities: {stripe_balance: {stripe_transfers: {requested: true}}}}},
   metadata: {user_id: String(userId)},
  }, `osmo-account-v2-${userId}-${attempt.started}`);
  run('INSERT OR IGNORE INTO stripe_accounts (user_id,account) VALUES (?,?)', userId, acc.id);
  row = one<{account: string}>('SELECT account FROM stripe_accounts WHERE user_id = ?', userId)!;
 }
 return accountApi<{url: string}>('account_links', {account: row.account, use_case: {type: 'account_onboarding', account_onboarding: {refresh_url: base + '/perfil', return_url: base + '/perfil'}}});
}
async function ready(account: string) {
 const a = await accountApi<Account>('accounts/' + encodeURIComponent(account) + '?include[0]=identity&include[1]=configuration.recipient&include[2]=configuration.merchant');
 const transfers = a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
 const payouts = a.configuration?.merchant?.capabilities?.stripe_balance?.payouts;
 const ok = a.identity?.country?.toUpperCase() === 'BR' && transfers?.status === 'active' && payouts?.status === 'active';
 run('UPDATE stripe_accounts SET active = ? WHERE account = ?', ok ? 1 : 0, account);
 if (!ok) throw new PaymentError('O designer precisa concluir a verificação de recebimentos na Stripe.');
}
export function accountStatus(userId: number) {
 const row = one<{account: string; active?: number}>('SELECT account, active FROM stripe_accounts WHERE user_id = ?', userId);
 return row ? { active: !!row.active, escrow: false, connected: true } : null;
}
export async function syncAccount(userId: number) {
 assertConfigured();
 const row = one<{account: string}>('SELECT account FROM stripe_accounts WHERE user_id = ?', userId);
 if (!row) return { active: false, escrow: false, connected: false };
 try { await ready(row.account); return { active: true, escrow: false, connected: true }; }
 catch { return { active: false, escrow: false, connected: true }; }
}
function payment(id: number) { return one<Payment>('SELECT * FROM stripe_payments WHERE milestone_id = ?', id); }
function fresh(start: number) {
 // Stripe may prune idempotency keys after 24 hours. Never retry an ambiguous creation after that window.
 if (Date.now() - start > 23 * 3600_000) throw new PaymentError('Operação antiga exige conciliação no Dashboard Stripe antes de nova tentativa.');
}
export async function checkout(id: number, designer: number, reais: number, title: string, base: string) {
 assertConfigured();
 if (one<{pay_id: string}>('SELECT pay_id FROM milestones WHERE id = ?', id)?.pay_id && !payment(id)) throw new PaymentError('Esta etapa possui cobrança de outro provedor. Concilie antes de migrar.');
 const acc = one<{account: string}>('SELECT account FROM stripe_accounts WHERE user_id = ?', designer);
 if (!acc) throw new PaymentError('O designer ainda não conectou a conta Stripe.');
 await ready(acc.account);
 const amount = reais * 100;
 if (!Number.isSafeInteger(amount) || amount < 50 || amount % 10 !== 0) throw new PaymentError('Valor da etapa inválido para divisão exata de 90% e 10%.');
 run('INSERT OR IGNORE INTO stripe_payments (milestone_id,account,amount,checkout_started) VALUES (?,?,?,?)', id, acc.account, amount, Date.now());
 const p = payment(id)!;
 if (p.amount !== amount || p.account !== acc.account || p.blocked || p.charge || p.transfer) throw new PaymentError('Etapa já paga ou bloqueada para conciliação.');
 if (p.session) {
  const session = await api<Session>('checkout/sessions/' + p.session);
  if (session.status !== 'open') throw new PaymentError('Checkout encerrado. Aguarde confirmação ou solicite conciliação antes de outra cobrança.');
  return {invoiceUrl: p.url};
 }
 fresh(p.checkout_started);
 const s = await api<Session>('checkout/sessions', {mode: 'payment', 'payment_method_types[0]': 'card', ...(PIX ? {'payment_method_types[1]': 'pix'} : {}),
 'line_items[0][price_data][currency]': 'brl', 'line_items[0][price_data][unit_amount]': amount,
 'line_items[0][price_data][product_data][name]': title.slice(0,120), 'line_items[0][quantity]': 1,
 'payment_intent_data[transfer_group]': `osmo-ms-${id}`, 'metadata[milestone_id]': id,
 success_url: base + '/painel', cancel_url: base + '/painel'}, `osmo-checkout-${id}`);
 tx(() => {run('UPDATE stripe_payments SET session=?,url=? WHERE milestone_id=?', s.id,s.url,id);run("UPDATE milestones SET pay_id=?,invoice_url=?,pay_status='aguardando' WHERE id=?",s.id,s.url,id);});
 return {invoiceUrl: s.url};
}
export async function release(id: number) {
 assertConfigured();
 const p = payment(id);
 if (!p || !p.charge || p.blocked) throw new PaymentError('Pagamento não confirmado ou bloqueado para conciliação.');
 if (p.transfer) return;
 const milestone = one<{status:string} >('SELECT status FROM milestones WHERE id=?',id);
 if (milestone?.status !== 'entregue') throw new PaymentError('A etapa precisa estar entregue para aprovação.');
 run('UPDATE stripe_payments SET release_started=? WHERE milestone_id=? AND release_started=0',Date.now(),id);
 fresh(payment(id)!.release_started);
 await ready(p.account);
 const charge = await api<Charge>('charges/' + p.charge);
 if (charge.refunded || charge.amount_refunded || charge.disputed) {run('UPDATE stripe_payments SET blocked=1 WHERE milestone_id=?',id);throw new PaymentError('Pagamento com reembolso ou contestação. Repasse bloqueado.');}
 if (payment(id)!.blocked) throw new PaymentError('Pagamento bloqueado durante aprovação. Concilie antes de continuar.');
 const transfer = await api<{id: string}>('transfers', {amount: p.amount * 9 / 10, currency: 'brl', destination: p.account, source_transaction: p.charge, transfer_group: `osmo-ms-${id}`}, `osmo-release-${id}`);
 tx(() => {run('UPDATE stripe_payments SET transfer=? WHERE milestone_id=?',transfer.id,id);run("UPDATE milestones SET pay_status='liberado' WHERE id=?",id);});
}
export function verifySignature(raw: Buffer, signature: string, secret = process.env.STRIPE_WEBHOOK_SECRET || '', now = Date.now()) {
 const parts = signature.split(','); const t = parts.find(p => p.startsWith('t='))?.slice(2) || '';
 if (!secret || !/^\d+$/.test(t) || Math.abs(now / 1000 - Number(t)) > 300) throw new PaymentError('Assinatura Stripe inválida.',400);
 const expected = crypto.createHmac('sha256',secret).update(t + '.').update(raw).digest('hex');
 if (!parts.some(p => /^v1=[a-f0-9]{64}$/.test(p) && crypto.timingSafeEqual(Buffer.from(p.slice(3),'hex'),Buffer.from(expected,'hex')))) throw new PaymentError('Assinatura Stripe inválida.',400);
}
export async function webhook(raw: Buffer, signature: string): Promise<{milestoneId?: number; status?: 'pago' | 'estornado' | 'expirado'} | void> {
 assertConfigured(); verifySignature(raw,signature);
 const event = JSON.parse(raw.toString()) as {id: string; type: string; livemode: boolean; data: {object: {id: string; charge?: string; metadata?: {milestone_id?: string}}}};
 if (event.livemode !== LIVE || !event.id) throw new PaymentError('Evento fora do ambiente configurado na Stripe.',400);
 if (one('SELECT id FROM stripe_events WHERE id=?',event.id)) return;
 let outcome: {milestoneId?: number; status?: 'pago' | 'estornado' | 'expirado'} | undefined;
 if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
  const p = one<Payment>('SELECT * FROM stripe_payments WHERE session=?',event.data.object.id);
  if (!p && event.data.object.metadata?.milestone_id) throw new PaymentError('Checkout ainda não persistido. Reenvie o evento.',503);
  if (p) {
   const s = await api<Session>('checkout/sessions/' + p.session);
   if (s.payment_status === 'paid') {
    const pi = await api<Intent>('payment_intents/' + s.payment_intent);
    if (s.amount_total !== p.amount || s.currency !== 'brl' || pi.status !== 'succeeded' || pi.amount_received !== p.amount || pi.currency !== 'brl' || !pi.latest_charge) throw new PaymentError('Pagamento divergente.',400);
    const charge = await api<Charge>('charges/' + pi.latest_charge);
    const isBlocked = !!(charge.refunded || charge.amount_refunded || charge.disputed);
    if (isBlocked) run('UPDATE stripe_payments SET blocked=1 WHERE milestone_id=?',p.milestone_id);
    tx(() => {run('UPDATE stripe_payments SET intent=?,charge=? WHERE milestone_id=?',pi.id,pi.latest_charge,p.milestone_id);run("UPDATE milestones SET pay_status='pago' WHERE id=? AND pay_status='aguardando' AND NOT EXISTS (SELECT 1 FROM stripe_payments WHERE milestone_id=? AND blocked=1)",p.milestone_id,p.milestone_id);});
    if (!isBlocked) outcome = { milestoneId: p.milestone_id, status: 'pago' };
   }
  }
 }
 if (event.type === 'checkout.session.expired') {
  const p = one<Payment>('SELECT * FROM stripe_payments WHERE session=?',event.data.object.id);
  if (p && !p.charge && !p.transfer) {
   tx(() => {
    run("UPDATE stripe_payments SET session='', url='', checkout_started=? WHERE milestone_id=?", Date.now(), p.milestone_id);
    run("UPDATE milestones SET pay_status='a_pagar', pay_id='', invoice_url='' WHERE id=? AND pay_status='aguardando'", p.milestone_id);
   });
   outcome = { milestoneId: p.milestone_id, status: 'expirado' };
  }
 }
 if (['charge.refunded','charge.dispute.created','transfer.reversed'].includes(event.type)) {
  const obj = event.data.object;
  const p = one<Payment>(`SELECT * FROM stripe_payments WHERE ${event.type === 'transfer.reversed' ? 'transfer' : 'charge'}=?`, obj.charge || obj.id);
  if (p) {
   tx(() => {run('UPDATE stripe_payments SET blocked=1 WHERE milestone_id=?',p.milestone_id);run("UPDATE milestones SET pay_status='estornado' WHERE id=?",p.milestone_id);});
   outcome = { milestoneId: p.milestone_id, status: 'estornado' };
  }
 }
 run('INSERT OR IGNORE INTO stripe_events (id) VALUES (?)',event.id);
 return outcome;
}
