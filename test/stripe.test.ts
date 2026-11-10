import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRequest } from './http-fixture';
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'osmo-stripe-'));
Object.assign(process.env,{DB_PATH: path.join(dir,'test.sqlite'), PAYMENT_PROVIDER:'stripe',STRIPE_SECRET_KEY:'sk_test_mock',STRIPE_WEBHOOK_SECRET:'whsec_test',PUBLIC_URL:'https://osmo.example.test', ASAAS_API_KEY:'',SMTP_HOST:'',MAIL_DEV:'false',WHATSAPP_TOKEN:'',VAPID_PRIVATE_KEY:''});
const {server} = require('../server') as typeof import('../server');
const stripe = require('../src/stripe') as typeof import('../src/stripe');
const {db,run,one} = require('../src/db') as typeof import('../src/db');
const request = makeRequest(server);
const originalFetch = global.fetch;
let transfers = 0, sessions = 0, accounts = 0, accountLinks = 0, paid = false, refunded = false;
const accountState: {country?: string; transfers?: string; payouts?: string} = {country:'br',transfers:'active',payouts:'active'};
global.fetch = async (input,options) => {
 const url = String(input), parsed = new URL(url), headers = new Headers(options?.headers), form = new URLSearchParams(String(options?.body || ''));
 if (parsed.pathname.startsWith('/v2/core/')) {
  assert.equal(headers.get('Content-Type'),'application/json');
  assert.equal(headers.get('Stripe-Version'),'2026-10-28.endive');
 }
 if (parsed.pathname === '/v2/core/accounts') {
  accounts++; assert.equal(options?.method,'POST');
  const body=JSON.parse(String(options?.body));
  assert.equal(body.contact_email,'freela@example.test','use the authenticated designer email');
  assert.equal(body.dashboard,'express');assert.equal(body.identity.country,'br');
  assert.deepEqual(body.defaults.responsibilities,{fees_collector:'application',losses_collector:'application'});
  assert.equal(body.configuration.merchant.capabilities.card_payments.requested,true);
  assert.equal(body.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested,true);
  assert.match(headers.get('Idempotency-Key') || '',/^osmo-account-v2-\d+-\d+$/);
  return Response.json({id:'acct_test'});
 }
 if (parsed.pathname === '/v2/core/account_links') {
  accountLinks++;assert.equal(options?.method,'POST');
  const body=JSON.parse(String(options?.body));
  assert.equal(body.account,'acct_test');assert.equal(body.use_case.type,'account_onboarding');
  assert.equal(Object.hasOwn(body.use_case.account_onboarding,'configurations'),false,'endive accepts configurations only in the response, not the account-link request');
  assert.equal(body.use_case.account_onboarding.refresh_url,'https://osmo.example.test/perfil');
  assert.equal(body.use_case.account_onboarding.return_url,'https://osmo.example.test/perfil');
  return Response.json({url:'https://connect.stripe.com/test'});
 }
 if (parsed.pathname === '/v2/core/accounts/acct_test') {
  assert.equal(options?.method,'GET');assert.equal(options?.body,undefined);
  assert.deepEqual([...parsed.searchParams.values()].sort(),['configuration.merchant','configuration.recipient','identity']);
  // Accounts v2 exposes payouts under merchant, not recipient.
  return Response.json({id:'acct_test',identity:{country:accountState.country},configuration:{
   merchant:{capabilities:{stripe_balance:{payouts:{status:accountState.payouts}}}},
   recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:accountState.transfers}}}},
  }});
 }
 if (url.endsWith('/checkout/sessions')) {
  sessions++; assert.equal(form.get('line_items[0][price_data][unit_amount]'),'10000');
  assert.equal(form.get('payment_method_types[1]'),null,'Pix must be opt-in');
  assert.equal(form.get('payment_intent_data[transfer_data][destination]'),null,'no transfer before approval');
  assert.equal(new Headers(options?.headers).get('Idempotency-Key'),'osmo-checkout-1');
  return Response.json({id:'cs_test',url:'https://checkout.stripe.com/test'});
 }
 if (url.endsWith('/checkout/sessions/cs_test')) return Response.json({id:'cs_test',status:paid?'complete':'open',payment_status:paid?'paid':'unpaid',amount_total:10000,currency:'brl',payment_intent:'pi_test'});
 if (url.endsWith('/payment_intents/pi_test')) return Response.json({id:'pi_test',status:'succeeded',amount_received:10000,currency:'brl',latest_charge:'ch_test'});
 if (url.endsWith('/charges/ch_test')) return Response.json({id:'ch_test',refunded,amount_refunded:refunded?10000:0,disputed:false});
 if (url.endsWith('/transfers')) {transfers++; assert.equal(form.get('amount'),'9000');assert.equal(form.get('source_transaction'),'ch_test');assert.equal(new Headers(options?.headers).get('Idempotency-Key'),'osmo-release-1');return Response.json({id:'tr_test'});}
 throw new Error('Unexpected mocked Stripe request: '+url);
};
test.after(()=>{global.fetch=originalFetch;db.close();fs.rmSync(dir,{recursive:true,force:true});});
function signed(event: object) {
 const raw = Buffer.from(JSON.stringify(event)), t = Math.floor(Date.now()/1000);
 return {raw,signature:`t=${t},v1=${crypto.createHmac('sha256','whsec_test').update(t+'.').update(raw).digest('hex')}`};
}
async function actor(role: 'freela'|'cliente',suffix='') {
 const credentials = {name:'Stripe test',email:role+suffix+'@example.test',password:'test-password-123',role};
 assert.equal((await request('/api/auth/register',{method:'POST',body:credentials})).status,200);
 const login=await request('/api/auth/login',{method:'POST',body:credentials});
 return {id:Number(one<{id:number}>('SELECT id FROM users WHERE email=?',credentials.email)!.id),cookie:login.headers['set-cookie'].split(';')[0]};
}
test('Stripe: authorization, advance payment, signed confirmation, explicit approval, fixed gross split, retries and refunds',async()=>{
 const designer=await actor('freela'),client=await actor('cliente'),stranger=await actor('cliente','2');
 const job=Number(run('INSERT INTO jobs (client_id,title,cat) VALUES (?,?,?)',client.id,'Test','design').lastInsertRowid);
 const prop=Number(run('INSERT INTO proposals (job_id,freela_id,text,value,days) VALUES (?,?,?,?,?)',job,designer.id,'Test',100,1).lastInsertRowid);
 const contract=Number(run('INSERT INTO contracts (job_id,proposal_id,client_id,freela_id,value) VALUES (?,?,?,?,?)',job,prop,client.id,designer.id,100).lastInsertRowid);
 run('INSERT INTO milestones (id,contract_id,pos,title,value) VALUES (1,?,0,?,100)',contract,'Stage');
 assert.equal((await request('/api/me/payout',{method:'POST',cookie:designer.cookie,body:{}})).status,200);
 assert.equal((await request('/api/me/payout',{method:'POST',cookie:designer.cookie,body:{}})).status,200);
 assert.equal(accounts,1,'refreshing onboarding reuses the connected account');assert.equal(accountLinks,2);
 const meBefore=JSON.parse((await request('/api/me',{cookie:designer.cookie})).body);
 assert.deepEqual(meBefore.user.payout,{active:false,escrow:false,connected:true});
 const syncRes=JSON.parse((await request('/api/me/payout/sync',{method:'POST',cookie:designer.cookie,body:{}})).body);
 assert.deepEqual(syncRes.payout,{active:true,escrow:false,connected:true});
 const action=(name:string,cookie=client.cookie)=>request('/api/milestones/1/'+name,{method:'POST',cookie,body:{}});
 assert.equal((await action('pay',stranger.cookie)).status,404);
 assert.equal((await action('start',designer.cookie)).status,409);
 for (const invalid of [
  {country:'US',transfers:'active',payouts:'active'},
  {country:undefined,transfers:'active',payouts:'active'},
  {country:'BR',transfers:'pending',payouts:'active'},
  {country:'BR',transfers:undefined,payouts:'active'},
  {country:'BR',transfers:'active',payouts:'inactive'},
  {country:'BR',transfers:'active',payouts:undefined},
 ]) {
  Object.assign(accountState,invalid);
  assert.equal((await action('pay')).status,409,'non-BR or incomplete accounts cannot collect a stage payment');
  assert.equal(sessions,0);assert.equal(one('SELECT milestone_id FROM stripe_payments WHERE milestone_id=1'),undefined);
 }
 Object.assign(accountState,{country:'br',transfers:'active',payouts:'active'});
 assert.equal((await action('pay')).status,200);assert.equal((await action('pay')).status,200);assert.equal(sessions,1);
 assert.equal((await action('approve')).status,409);assert.equal(transfers,0);
 const evt={id:'evt_paid',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test'}}};
 let signedEvent=signed(evt);
 assert.throws(()=>stripe.verifySignature(signedEvent.raw,'t=1,v1='+'0'.repeat(64)));
 assert.throws(()=>stripe.verifySignature(Buffer.from('{}'),signedEvent.signature));
 await stripe.webhook(signedEvent.raw,signedEvent.signature);
 assert.equal(one<{pay_status:string}>('SELECT pay_status FROM milestones WHERE id=1')!.pay_status,'aguardando','completed is not proof of payment');
 paid=true; signedEvent=signed({...evt,id:'evt_async',type:'checkout.session.async_payment_succeeded'});
 await stripe.webhook(signedEvent.raw,signedEvent.signature);await stripe.webhook(signedEvent.raw,signedEvent.signature);
 assert.equal((await action('start',designer.cookie)).status,200);
 assert.equal((await action('deliver',designer.cookie)).status,200);
 assert.equal((await action('approve',designer.cookie)).status,404);
 assert.equal(transfers,0,'delivery alone must never release');
 accountState.payouts='inactive';
 assert.equal((await action('approve')).status,409,'revalidate payout readiness after payment and delivery');
 assert.equal(transfers,0);assert.equal(one<{status:string}>('SELECT status FROM milestones WHERE id=1')!.status,'entregue');
 accountState.payouts='active';
 run('UPDATE stripe_payments SET release_started=? WHERE milestone_id=1',Date.now()-24*3600_000);
 assert.equal((await action('approve')).status,409,'expired idempotency window must require reconciliation');assert.equal(transfers,0);
 run('UPDATE stripe_payments SET release_started=0 WHERE milestone_id=1');
 assert.equal((await action('approve')).status,200);await stripe.release(1);assert.equal(transfers,1);
 assert.equal(one<{pay_status:string}>('SELECT pay_status FROM milestones WHERE id=1')!.pay_status,'liberado');
 refunded=true;signedEvent=signed({id:'evt_refund',type:'charge.refunded',livemode:false,data:{object:{id:'ch_test'}}});
 await stripe.webhook(signedEvent.raw,signedEvent.signature);
 await assert.rejects(stripe.release(1));assert.equal(transfers,1);
});
