// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// Este é o "cérebro" da plataforma, que mora num computador lá longe (o servidor).
// Pense num restaurante:
// - o SITE que a pessoa vê no celular (public/app.js) é o garçom;
// - este arquivo é a COZINHA;
// - o banco de dados (src/db.js) é a despensa onde tudo fica guardado.
// O garçom anota o pedido ("quero ver as vagas", "quero mandar uma proposta") e leva
// para a cozinha por um endereço chamado ROTA (ex.: GET /api/jobs). A cozinha confere
// se o pedido faz sentido e se a pessoa pode pedir aquilo, pega as coisas na despensa,
// prepara e devolve a resposta em JSON (um formato de texto organizado em "chave: valor").
// O arquivo está dividido assim:
//   1. ferramentas pequenas (limpar textos, embaralhar senhas, nota de clareza);
//   2. sessão: como o servidor sabe quem você é;
//   3. ROTAS: cada pedido possível (cadastro, vagas, propostas, contratos, pagamentos...);
//   4. arquivos e fotos;
//   5. o "porteiro" (createServer), que recebe cada pedido e manda para a rota certa.
// Osmo Talents: servidor HTTP nativo (node:http) + API REST + SQLite
// Requer Node.js 22.13 ou mais novo.
// "require" é pegar uma ferramenta emprestada. As que começam com "node:" já vêm com o Node
// (o programa que roda JavaScript no servidor); as que começam com "./src/" foram feitas
// para este projeto (banco, pagamentos, login social, e-mail e o detetive de laudos).
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { one as dbOne, all as dbAll, run, tx } from "./src/db";
import * as asaas from "./src/asaas";
import * as stripe from "./src/stripe";
const PAYMENTS = stripe.SELECTED || asaas.ENABLED;
import * as oauth from "./src/oauth";
import * as mail from "./src/mail";
import * as push from "./src/push";
import * as icp from "./src/icp";
import * as i18n from "./src/i18n";
import * as wa from "./src/whatsapp";
import * as tvRemote from "./src/tv-remote";
import { createRouter } from "./src/router";
import { PROJECT_ROOT } from "./src/paths";
import { record } from "./src/service-values";
import { renderDocument } from "./src/seo-document";
import { createSeo } from "./src/seo";
import { pages as editorialPages } from "./src/seo-content";
import type { AppRow, Role, SessionUser, JsonBody, RouteContext, Handler, PublicHandler, AppRouteOptions, HttpMethod, SQLInputValue, ClarityInput, ProposalMilestone, MilestoneFlow, AdminOption, AdminField, AdminValues, AdminEntity, TmdbItem, TmdbResponse, VideoMetadata, ContractOutput, MilestoneOutput, OAuthRegistration, AdminUserValues, AdminJobValues, TaskUpdate, ProposalRow } from "./src/server-types";
import type { DatabaseRow } from "./src/seo-types";
const one = <T = AppRow>(sql: string, ...params: SQLInputValue[]): T | undefined => dbOne<T>(sql, ...params);
const all = <T = AppRow>(sql: string, ...params: SQLInputValue[]): T[] => dbAll<T>(sql, ...params);
const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T => options.includes(value as T);
const errorStatus = (error: unknown): number | undefined => { const value = record(error).status; return typeof value === "number" ? value : undefined; };
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const header = (req: http.IncomingMessage, name: string): string => { const value = req.headers[name]; return Array.isArray(value) ? value.join(",") : value || ""; };


// Configurações gerais:
// - PORT/HOST: em qual "porta" do computador o servidor fica escutando os pedidos;
// - COOKIE_SECURE: no site de verdade (https), o crachá de login só viaja por conexão segura;
// - PUBLIC_DIR: a pasta com os arquivos que vão para o navegador (HTML, CSS, JS);
// - FEE: a taxa da Osmo como número (10% vira 0.1);
// - SESSION_DAYS: quantos dias você fica logado sem precisar entrar de novo.
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const FEE = stripe.SELECTED ? 0.1 : asaas.FEE_PCT / 100; // taxa da plataforma (FEE_PCT no .env)
const SESSION_DAYS = 30;
// Google Analytics: o código de medição (G-XXXXXXX) vem do .env; vazio = Analytics desligado
const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(process.env.GA_MEASUREMENT_ID || "") ? process.env.GA_MEASUREMENT_ID : "";

// categorias importadas do Upwork (public/taxonomia.json); as vagas guardam só o id
const taxonomy = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "public", "taxonomia.json"), "utf8")) as {categorias: {id: string}[]};
const CATS = taxonomy.categorias.map(c => c.id);
const ENERGY = ["baixa", "media", "alta"];

// Ferramentas de limpeza: NUNCA confiamos no que chega do navegador (alguém pode mandar
// qualquer coisa). Então:
// - str: garante que é texto, tira espaços das pontas e corta no tamanho máximo;
// - int: garante que é número inteiro dentro de um mínimo e um máximo;
// - list: transforma em lista de textos limpos (no máximo tantos itens);
// - parse: lê um texto JSON guardado no banco; se estiver estragado, devolve lista vazia.
// fail(status, msg) é o jeito de dizer "não dá" com o código certo
// (400 = pedido errado, 401 = não está logado, 404 = não existe, 409 = conflito...).
/* ---------------- utilidades ---------------- */
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
function fail(status: number, msg: string): never { throw new HttpError(status, msg); }

function str(v: unknown, max = 2000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function int(v: unknown, min = 0, max = 10_000_000) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; }
function list(v: unknown, maxItems = 20, maxLen = 120) {
  const arr: unknown[] = Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [];
  return arr.map(x => str(String(x), maxLen)).filter(Boolean).slice(0, maxItems);
}
const parse = <T = string[]>(s: unknown): T => { try { return JSON.parse(String(s)) as T; } catch { return [] as T; } };

// SENHAS: nunca guardamos a senha. Misturamos a senha com um "sal" aleatório e passamos
// por uma máquina de embaralhar bem lenta (scrypt). Lenta de propósito: para quem tenta
// adivinhar milhões de senhas, cada tentativa custa caro.
// Para conferir no login, embaralhamos a senha digitada do mesmo jeito e comparamos
// os dois embaralhados (sempre no mesmo tempo, com timingSafeEqual).
// sha() faz um "resumo" curto e único de um texto (usado para guardar crachás e códigos).
function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
const scryptAsync = (password: string, salt: crypto.BinaryLike, length: number, options: crypto.ScryptOptions): Promise<Buffer> => new Promise((resolve, reject) => crypto.scrypt(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key)));
async function hashPasswordAsync(pw: string) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
async function checkPassword(pw: string, stored: string) {
  const [, saltHex, hashHex] = String(stored).split("$");
  if (!saltHex || !hashHex) return false;
  const hash = await scryptAsync(pw, Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}
const sha = (s: string | Uint8Array) => crypto.createHash("sha256").update(s).digest("hex");

// NOTA DE CLAREZA da vaga: uma lista de 9 perguntas de sim ou não (tem título bom? tem
// objetivo? tem pelo menos 2 entregas? diz o que está fora? diz o valor?...).
// A nota é a porcentagem de "sim". Vaga com menos de 50% não pode ser publicada.
function clarity(j: ClarityInput) {
  const checks = [
    j.title.length > 8, CATS.includes(j.cat), j.obj.length > 20, j.ent.length >= 2,
    j.fora.length >= 1, j.com.length > 3, j.fb.length > 3, j.budget > 0, j.duration.length > 1,
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

// LIMITE DE PROPOSTAS: para ninguém se enrolar com trabalho demais, quem trabalha pode ter
// 1 proposta esperando resposta para cada 5 horas livres por semana (mínimo 2).
// Se a pessoa disse que está com energia baixa, o limite diminui; com energia alta, aumenta 1.
// limite de propostas abertas pela capacidade declarada
function proposalCap(user: {energy: string}, hours: number | null | undefined) {
  let cap = Math.max(2, Math.floor((hours || 20) / 5));
  if (user.energy === "baixa") cap = Math.max(1, cap - 2);
  if (user.energy === "alta") cap += 1;
  return cap;
}

// FREIO CONTRA ROBÔS: anotamos quantas vezes cada endereço tentou algo (ex.: login).
// Se passar do limite numa janela de tempo, respondemos "muitas tentativas, espere".
// De 10 em 10 minutos, apagamos anotações velhas para a memória não encher.
/* ---------------- rate limit simples ---------------- */
const hits = new Map<string, number[]>();
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const h = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (h.length >= max) fail(429, "Muitas tentativas. Espere alguns minutos e tente de novo.");
  h.push(now); hits.set(key, h);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 3600_000)) hits.delete(k); }, 600_000).unref();

// O CRACHÁ (sessão): quando você entra, o servidor inventa um código secreto enorme e
// manda para o navegador guardar num "cookie" (osmo_sid). No banco guardamos só o resumo
// desse código. A cada pedido, o navegador mostra o crachá; o servidor confere o resumo
// no banco e descobre quem é você (currentUser).
// HttpOnly: o JavaScript da página não consegue ler o crachá (protege contra roubo).
// SameSite=Lax: outros sites não conseguem usar seu crachá escondido.
/* ---------------- sessão ---------------- */
function readCookie(req: http.IncomingMessage, name: string) {
  const m = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function sessionCookie(token: string, maxAge: number) {
  return `osmo_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE ? "; Secure" : ""}`;
}
function appendCookie(res: http.ServerResponse, c: string) {
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", prev ? [...(Array.isArray(prev) ? prev.map(String) : [String(prev)]), c] : c);
}
// PAPÉIS: uma conta pode ser de freelancer, de cliente ou das duas coisas. "role" é o papel ativo.
const ROLES: Role[] = ["freela", "cliente"];
const rolesOf = (u: {role: string; roles?: string | Role[]}) => ROLES.filter(r => u.role === r || ("," + (u.roles || "") + ",").includes("," + r + ","));
// pedaço de SQL: "esta pessoa tem o papel r?" (vale para quem só tem um papel e para quem tem os dois)
const HAS = (r: Role, a = "u") => `(${a}.role = '${r}' OR instr(',' || ${a}.roles || ',', ',${r},') > 0)`;
function currentUser(req: http.IncomingMessage): SessionUser | null {
  const tok = readCookie(req, "osmo_sid");
  if (!tok) return null;
  const s = one("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", sha(tok));
  if (!s || s.expires_at < new Date().toISOString()) return null;
  const u = one("SELECT id, name, email, role, roles, energy, notify_level notify, lang, phone FROM users WHERE id = ?", s.user_id);
  if (!u) return null;
  return { ...u, role: u.role as Role, roles: rolesOf(u) };
}
function createSession(res: http.ServerResponse, userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)", sha(token), userId, exp);
  run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
  appendCookie(res, sessionCookie(token, SESSION_DAYS * 86400));
}

// Funções que "montam" as respostas: pegam os dados crus do banco e entregam arrumadinhos
// para o site (perfil completo, vaga com briefing, nota média de avaliações...).
/* ---------------- formatação ---------------- */
const avatarUrl = (id: number, v: unknown) => v ? `/avatar/${id}?v=${v}` : "";

// AVALIAÇÕES JUSTAS: uma avaliação só aparece quando os DOIS lados já avaliaram (ou depois
// de 14 dias). Assim ninguém vê a nota que recebeu antes de dar a sua, e ninguém avalia
// "por vingança".
// avaliações: ficam públicas quando os dois lados avaliaram o contrato, ou 14 dias depois (ninguém avalia "em resposta")
const REVIEW_TAGS = {
  freela: ["Comunicação clara", "Cumpriu os prazos", "Entrega caprichada", "Respeitou o combinado"],
  cliente: ["Briefing claro", "Feedback objetivo", "Pagou em dia", "Respeitou o ritmo combinado"],
};
const REVIEW_VISIBLE = `(r.created_at <= datetime('now', '-14 days') OR EXISTS (SELECT 1 FROM reviews o WHERE o.contract_id = r.contract_id AND o.author_id = r.target_id))`;
function ratingOf(userId: number) {
  const rows = all(`SELECT r.rating, r.tags FROM reviews r WHERE r.target_id = ? AND ${REVIEW_VISIBLE}`, userId);
  if (!rows.length) return { avg: 0, n: 0, tags: [] };
  const count: Record<string, number> = {};
  rows.forEach(r => parse(r.tags).forEach(t => { count[t] = (count[t] || 0) + 1; }));
  return { avg: Math.round(rows.reduce((a, r) => a + r.rating, 0) / rows.length * 10) / 10, n: rows.length,
    tags: Object.entries(count).sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, n })) };
}
function reviewsOf(userId: number) {
  return all(`SELECT r.rating, r.tags, r.comment, r.created_at, u.name author, j.title job FROM reviews r
    JOIN users u ON u.id = r.author_id JOIN contracts c ON c.id = r.contract_id JOIN jobs j ON j.id = c.job_id
    WHERE r.target_id = ? AND ${REVIEW_VISIBLE} ORDER BY r.created_at DESC LIMIT 30`, userId).map(r => ({ ...r, tags: parse(r.tags) }));
}
// profileOf junta tudo o que aparece num perfil: dados da pessoa, foto, selo, habilidades,
// portfólio, "como eu trabalho melhor", quantos trabalhos já concluiu e a nota média.
// jobOut faz o mesmo para uma vaga. JOB_SELECT é a "pergunta padrão" ao banco para buscar
// vagas já com o nome de quem contratou e quantas propostas a vaga tem.
const portfolioOf = (userId: number) => all("SELECT id, title, link, v FROM portfolio_items WHERE user_id = ? ORDER BY pos, id", userId)
  .map(p => ({ id: p.id, title: p.title, link: p.link, image: p.v ? `/portfolio/${p.id}?v=${p.v}` : "" }));
function profileOf(userId: number) {
  const u = one(`SELECT u.id, u.name, u.role, u.roles, a.v avatar_v, vf.verified_at, p.* FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN avatars a ON a.user_id = u.id LEFT JOIN verifications vf ON vf.user_id = u.id WHERE u.id = ?`, userId);
  if (!u) return null;
  const stats = one("SELECT COUNT(*) n FROM contracts WHERE freela_id = ? AND status = 'concluido'", userId);
  return {
    id: u.id, name: u.name, role: u.role, roles: rolesOf(u), title: u.title || "", bio: u.bio || "", location: u.location || "",
    rate: u.rate || 0, hours: u.hours || 20, skills: parse(u.skills || "[]"), portfolio: portfolioOf(u.id),
    how: { com: u.ws_com || "", resp: u.ws_resp || "", fb: u.ws_fb || "", foco: u.ws_foco || "" },
    searchVisible: !!u.search_visible,
    tag: u.tag || "", company: u.company || "", done: stats!.n, avatar: avatarUrl(u.id, u.avatar_v), rating: ratingOf(u.id), verified: u.verified_at || "",
  };
}
function jobOut(j: AppRow) {
  return {
    id: j.id, client_id: j.client_id, client: j.client_name, company: j.company || "", title: j.title, cat: j.cat,
    brief: { obj: j.obj, ent: parse(j.ent), fora: parse(j.fora), com: j.com, fb: j.fb, ref: j.ref },
    budget_type: j.budget_type, budget: j.budget, duration: j.duration, skills: parse(j.skills),
    async: !!j.is_async, flex: !!j.is_flex, clarity: j.clarity, status: j.status, created_at: j.created_at,
    proposals: j.n_props ?? undefined,
  };
}
const JOB_SELECT = `SELECT j.*, u.name client_name, p.company,
  (SELECT COUNT(*) FROM proposals x WHERE x.job_id = j.id) n_props
  FROM jobs j JOIN users u ON u.id = j.client_id LEFT JOIN profiles p ON p.user_id = j.client_id`;

// CONVERSAS: threadFor acha a conversa entre um cliente e um freela sobre uma vaga; se não
// existir, cria. postMessage escreve uma mensagem nela. Quando "senderId" é vazio, a mensagem
// é do SISTEMA (ex.: "Proposta aceita."), que aparece no meio da conversa.
// Quem fez a ação já fica marcado como "leu", para não receber aviso da própria ação.
function threadFor(jobId: number | null, clientId: number, freelaId: number) {
  let t = one<{id: number}>("SELECT id FROM threads WHERE job_id IS ? AND client_id = ? AND freela_id = ? AND kind = ''", jobId, clientId, freelaId);
  if (!t) t = { id: Number(run("INSERT INTO threads (job_id, client_id, freela_id) VALUES (?,?,?)", jobId, clientId, freelaId).lastInsertRowid) };
  return t.id;
}
function postMessage(threadId: number, senderId: number | null, body: string, actorId?: number | null) {
  const id = Number(run("INSERT INTO messages (thread_id, sender_id, body) VALUES (?,?,?)", threadId, senderId, body).lastInsertRowid);
  run("UPDATE threads SET updated_at = datetime('now') WHERE id = ?", threadId);
  const who = actorId || senderId;
  if (who) run(`UPDATE threads SET client_read_at = CASE WHEN client_id = ? THEN datetime('now', '+1 second') ELSE client_read_at END,
    freela_read_at = CASE WHEN freela_id = ? THEN datetime('now', '+1 second') ELSE freela_read_at END WHERE id = ?`, who, who, threadId);
  return id;
}
const brl = (n: number) => "R$ " + Number(n).toLocaleString("pt-BR");

// Confere se um CPF (11 números) ou CNPJ (14 números) é válido de verdade, usando a conta dos
// "dígitos verificadores" (os dois últimos números são calculados a partir dos outros).
// Números todos iguais (111.111.111-11) são recusados.
// dateBR dá a data de hoje (ou daqui a X dias) no horário de Brasília.
function validDoc(d: string) {
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    const calc = (len: number) => { const w = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; let s = 0; for (let i = 0; i < len; i++) s += Number(d[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}
function dateBR(addDays = 0) { const d = new Date(Date.now() - 3 * 3600e3 + addDays * 864e5); return d.toISOString().slice(0, 10); }

// O CARDÁPIO DE PEDIDOS: route() cadastra cada pedido possível com
//   - o método (GET = ler, POST = criar/fazer, PUT = trocar, DELETE = apagar);
//   - o endereço (ex.: /api/jobs/:id, onde :id é o número da vaga);
//   - a função que resolve o pedido;
//   - opções: auth:false (não precisa estar logado), role (só freela ou só cliente).
/* ---------------- rotas ---------------- */
const router = createRouter<RouteContext<JsonBody | Buffer, SessionUser | null>, unknown, Role>();
function route(method: HttpMethod, pattern: string, handler: PublicHandler<Buffer>, opts: AppRouteOptions & {auth: false; raw: number}): void;
function route(method: HttpMethod, pattern: string, handler: Handler<Buffer>, opts: AppRouteOptions & {raw: number}): void;
function route(method: HttpMethod, pattern: string, handler: PublicHandler, opts: AppRouteOptions & {auth: false}): void;
function route(method: HttpMethod, pattern: string, handler: Handler, opts?: AppRouteOptions): void;
function route(method: HttpMethod, pattern: string, handler: Handler | PublicHandler | Handler<Buffer> | PublicHandler<Buffer>, opts: AppRouteOptions = {}): void {
  // The dispatcher below validates auth and chooses raw versus JSON bodies before invocation.
  const invoke = handler as Handler<JsonBody | Buffer, SessionUser | null>;
  router.route(method, pattern, invoke, opts);
}

// --- autenticação
// CONFIRMAR O CELULAR PELO WHATSAPP, DE GRAÇA ("WhatsApp ao contrário", ver src/whatsapp.js):
// 1. phone/start: criamos um código (OSMO-XXXXXX) e um "número de espera" (pid) secreto do navegador;
// 2. a pessoa manda o código pelo WhatsApp para o número da Osmo; a Meta avisa o webhook
//    /api/webhooks/whatsapp, que anota o celular de quem mandou;
// 3. phone/status: o site pergunta de tempos em tempos "já chegou?". Chegou, entregamos um
//    "comprovante" (ticket) que vale 30 minutos e serve uma vez só;
// 4. register: o cadastro só sai com esse comprovante, e o celular fica guardado na conta.
const PHONE_TICKET_MIN = 30, PHONE_CODE_MIN = 15;
const phoneTaken = (phone: string) => !!one("SELECT 1 FROM users WHERE phone = ?", phone);
const nowISO = () => new Date().toISOString();
route("POST", "/api/auth/phone/start", ({ ip }) => {
  if (!wa.ENABLED) fail(503, "A confirmação por celular ainda não está ativa.");
  limit("phone:" + ip, 10, 3600_000);
  run("DELETE FROM phone_checks WHERE expires_at < ?", nowISO());
  let code; do code = wa.newCode(); while (one("SELECT 1 FROM phone_checks WHERE code = ?", code));
  const pid = crypto.randomBytes(24).toString("hex");
  run("INSERT INTO phone_checks (token_hash, code, expires_at) VALUES (?,?,?)", sha(pid), code, new Date(Date.now() + PHONE_CODE_MIN * 60e3).toISOString());
  return { pid, code, link: wa.link(code), message: wa.message(code), number: wa.pretty("+" + wa.NUMBER), minutes: PHONE_CODE_MIN, dev: wa.DEV };
}, { auth: false });
// "Já chegou a mensagem?" O site pergunta a cada poucos segundos enquanto espera.
route("GET", "/api/auth/phone/status", ({ query, ip }) => {
  limit("phone-st:" + ip, 900, 600_000);
  const pid = String(query.get("pid") || "");
  const c = /^[a-f0-9]{48}$/.test(pid) && one("SELECT * FROM phone_checks WHERE token_hash = ?", sha(pid));
  if (!c || c.expires_at < nowISO()) return { state: "expired" };
  if (c.state !== "ok") return { state: c.state, pretty: c.phone ? wa.pretty(c.phone) : "" };
  if (phoneTaken(c.phone)) { run("UPDATE phone_checks SET state = 'taken' WHERE token_hash = ?", c.token_hash); return { state: "taken", pretty: wa.pretty(c.phone) }; }
  const ticket = crypto.randomBytes(24).toString("hex");
  run("DELETE FROM phone_tickets WHERE expires_at < ?", nowISO());
  tx(() => {
    run("INSERT INTO phone_tickets (token_hash, phone, expires_at) VALUES (?,?,?)", sha(ticket), c.phone, new Date(Date.now() + PHONE_TICKET_MIN * 60e3).toISOString());
    run("DELETE FROM phone_checks WHERE token_hash = ?", c.token_hash);
  });
  return { state: "ok", ticket, pretty: wa.pretty(c.phone) };
}, { auth: false });
// Chegou uma mensagem com código: anota o celular de quem mandou (e responde, se der).
function phoneArrived({ from, waId, code }: {from: string; waId: string; code: string}) {
  const c = one("SELECT token_hash, state FROM phone_checks WHERE code = ? AND expires_at > ?", code, nowISO());
  if (!c || c.state !== "pending") return;
  const taken = phoneTaken(from);
  run("UPDATE phone_checks SET state = ?, phone = ? WHERE token_hash = ?", taken ? "taken" : "ok", from, c.token_hash);
  wa.reply(waId, taken ? "Este celular já está em outra conta da Osmo. Volte ao site para entrar ou usar outro número." : "Pronto! Seu celular foi confirmado. Pode voltar para a Osmo para terminar o cadastro.");
}
// WEBHOOK DA META: GET liga o aviso (a Meta manda a senha VERIFY_TOKEN e um "desafio" que
// devolvemos); POST traz as mensagens. Só aceitamos avisos com a assinatura certa da Meta.
route("GET", "/api/webhooks/whatsapp", ({ query, res }) => {
  if (!wa.VERIFY_TOKEN || query.get("hub.mode") !== "subscribe" || query.get("hub.verify_token") !== wa.VERIFY_TOKEN) fail(403, "Senha do webhook não confere.");
  send(res, 200, String(query.get("hub.challenge") || ""), { "Content-Type": "text/plain; charset=utf-8" });
}, { auth: false });
route("POST", "/api/webhooks/whatsapp", ({ req, body }) => {
  if (!wa.signatureOk(body, req.headers["x-hub-signature-256"])) fail(401, "Assinatura inválida.");
  let data: unknown; try { data = JSON.parse(body.toString("utf8")) as unknown; } catch { fail(400, "JSON inválido."); }
  for (const m of wa.incoming(data)) phoneArrived(m);
  return { received: true };
}, { auth: false, raw: 1_000_000 });
// Só no teste (PHONE_DEV): faz de conta que a mensagem chegou de um celular.
route("POST", "/api/auth/phone/simulate", ({ body }) => {
  if (!wa.DEV) fail(404, "Rota não encontrada.");
  const from = wa.normalize(body.phone || "11912345678"), code = wa.findCode(body.code);
  if (!from || !code) fail(400, "Faltou o celular ou o código.");
  phoneArrived({ from, waId: "", code });
  return { ok: true };
}, { auth: false });

// CADASTRO: confere nome, e-mail e senha (mínimo 8 letras), vê se o e-mail já existe,
// cria a pessoa e o perfil vazio JUNTOS (tx = tudo ou nada) e já entrega o crachá.
// Com a confirmação por celular ligada, também exige o comprovante do código (phoneTicket).
// check:true só confere os dados, sem criar nada (o site usa antes de pedir o WhatsApp,
// para a pessoa não confirmar o celular à toa com um e-mail que já tem conta).
// O "limit" impede alguém de criar mil contas seguidas do mesmo endereço.
route("POST", "/api/auth/register", async ({ body, res, ip }) => {
  limit("reg:" + ip, 10, 600_000);
  const name = str(body.name, 80), email = str(body.email, 160).toLowerCase(), password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "cliente" ? "cliente" : "freela";
  if (name.length < 2) fail(400, "Escreva seu nome.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Esse e-mail não parece válido.");
  if (password.length < 8) fail(400, "A senha precisa ter pelo menos 8 caracteres.");
  if (one("SELECT 1 FROM users WHERE email = ?", email)) fail(409, "Já existe uma conta com esse e-mail. Tente entrar.");
  if (wa.ENABLED && body.check) return { ok: true };
  let phone = "";
  if (wa.ENABLED) {
    const t = /^[a-f0-9]{48}$/.test(String(body.phoneTicket || "")) && one("SELECT phone FROM phone_tickets WHERE token_hash = ? AND expires_at > ?", sha(body.phoneTicket as string), new Date().toISOString());
    if (!t) fail(400, "Confirme seu celular pelo WhatsApp antes de criar a conta.");
    phone = t.phone;
    if (phoneTaken(phone)) fail(409, "Esse celular já está em outra conta. Tente entrar.");
  }
  const passHash = await hashPasswordAsync(password);
  const id = tx(() => {
    const uid = Number(run("INSERT INTO users (name, email, pass_hash, role, phone, phone_verified_at) VALUES (?,?,?,?,?,?)", name, email, passHash, role, phone, phone ? new Date().toISOString() : "").lastInsertRowid);
    run("INSERT INTO profiles (user_id) VALUES (?)", uid);
    if (phone) run("DELETE FROM phone_tickets WHERE phone = ?", phone);
    return uid;
  });
  createSession(res, id);
  return { ok: true };
}, { auth: false });

// ENTRAR: procura o e-mail e confere a senha. A mensagem de erro é a mesma para "e-mail não
// existe" e "senha errada", para um espertinho não descobrir quais e-mails têm conta.
route("POST", "/api/auth/login", async ({ body, res, ip }) => {
  limit("login:" + ip, 10, 600_000);
  const email = str(body.email, 160).toLowerCase(), password = typeof body.password === "string" ? body.password : "";
  const u = one("SELECT id, pass_hash FROM users WHERE email = ?", email);
  if (!u || !(await checkPassword(password, u.pass_hash))) fail(401, "E-mail ou senha não conferem.");
  createSession(res, u.id);
  return { ok: true };
}, { auth: false });

// SAIR: apaga o crachá do banco e manda o navegador jogar o cookie fora.
route("POST", "/api/auth/logout", ({ req, res }) => {
  const tok = readCookie(req, "osmo_sid");
  if (tok) run("DELETE FROM sessions WHERE token_hash = ?", sha(tok));
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  return { ok: true };
}, { auth: false });

// ESQUECI MINHA SENHA:
// 1. a pessoa digita o e-mail (forgot). Se a conta existe, mandamos um link com um código
//    secreto que vale 1 hora e funciona uma vez só. A resposta é sempre "ok", exista a conta
//    ou não, para não entregar quem tem cadastro;
// 2. ao abrir o link, o site pergunta se o código ainda vale (GET reset);
// 3. a pessoa escolhe a senha nova (POST reset): trocamos a senha, apagamos o código e
//    desconectamos todos os outros aparelhos (por segurança).
// --- recuperar senha: link por e-mail, válido por 1 hora e de uso único
const RESET_MIN = 60;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
function resetRow(token: unknown) {
  const t = String(token || "");
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  run("DELETE FROM password_resets WHERE expires_at < ?", new Date().toISOString());
  return one("SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?", sha(t));
}
route("POST", "/api/auth/forgot", ({ req, body, ip }) => {
  if (!mail.ENABLED) fail(503, "A recuperação de senha ainda não está ativa. Fale com a Osmo.");
  limit("forgot:" + ip, 5, 900_000);
  const email = str(body.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Esse e-mail não parece válido.");
  // a resposta é sempre a mesma, para não revelar quais e-mails têm conta
  const u = one("SELECT id, name, email, lang FROM users WHERE email = ?", email);
  if (!u) return { ok: true };
  try { limit("forgot-mail:" + u.id, 3, 3600_000); } catch { return { ok: true }; }
  const token = crypto.randomBytes(32).toString("hex");
  run("DELETE FROM password_resets WHERE user_id = ?", u.id);
  run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)", sha(token), u.id, new Date(Date.now() + RESET_MIN * 60e3).toISOString());
  const link = `${PUBLIC_URL}/recuperar#${token}`, first = u.name.split(" ")[0];
  // idioma do e-mail: o da tela de quem pediu (ou o último que a pessoa usou)
  const lang = i18n.pick(req.headers["x-osmo-lang"]) || u.lang, T = (k: string, ...a: unknown[]) => i18n.T(lang, k, ...a);
  const subject = T("Criar uma senha nova na Osmo Talents");
  mail.send({
    to: u.email, subject,
    text: `${T("Olá, {1}.", first)}\n\n${T("Recebemos um pedido para criar uma senha nova na sua conta da Osmo Talents.")}\n\n${T("Para escolher a senha nova, abra este link (vale por {1} minutos e funciona uma vez só):", RESET_MIN)}\n${link}\n\n${T("Se não foi você, pode ignorar este e-mail. Sua senha atual continua a mesma.")}\n\nOsmo Talents`,
    html: mail.renderEmailTemplate({
      eyebrow: "Segurança da conta",
      title: subject,
      greeting: T("Olá, {1}.", first),
      intro: T("Recebemos um pedido para criar uma senha nova na sua conta da Osmo Talents."),
      ctaLabel: T("Criar senha nova"),
      ctaUrl: link,
      outro: `${T("O link vale por {1} minutos e funciona uma vez só.", RESET_MIN)}\n${T("Se não foi você, pode ignorar este e-mail. Sua senha atual continua a mesma.")}`,
      publicUrl: PUBLIC_URL,
    }),
  }).catch(e => console.error(new Date().toISOString(), "mail", e.message));
  return { ok: true };
}, { auth: false });
route("GET", "/api/auth/reset", ({ query }) => {
  const r = resetRow(query.get("token"));
  if (!r) fail(404, "Esse link expirou ou já foi usado. Peça um novo.");
  return { email: r.email };
}, { auth: false });
route("POST", "/api/auth/reset", async ({ body, res, ip }) => {
  limit("reset:" + ip, 10, 600_000);
  const password = typeof body.password === "string" ? body.password : "";
  const r = resetRow(body.token);
  if (!r) fail(404, "Esse link expirou ou já foi usado. Peça um novo.");
  if (password.length < 8) fail(400, "A senha precisa ter pelo menos 8 caracteres.");
  const passHash = await hashPasswordAsync(password);
  if (!resetRow(body.token)) fail(404, "Esse link expirou ou já foi usado. Peça um novo.");
  tx(() => {
    run("UPDATE users SET pass_hash = ? WHERE id = ?", passHash, r.user_id);
    run("DELETE FROM password_resets WHERE user_id = ?", r.user_id);
    run("DELETE FROM sessions WHERE user_id = ?", r.user_id); // encerra a conta em outros aparelhos
  });
  createSession(res, r.user_id);
  return { ok: true };
}, { auth: false });

// Quem entra pela primeira vez com o Google ainda precisa dizer se quer TRABALHAR ou
// CONTRATAR. O cadastro fica "pendente" por até 20 minutos até a pessoa escolher.
// --- login social: conta nova escolhe o perfil (freelancer ou cliente)
function pendingRow(token: unknown) {
  const t = String(token || "");
  if (!/^[a-f0-9]{48}$/.test(t)) return null;
  run("DELETE FROM oauth_pending WHERE created_at < datetime('now', '-20 minutes')");
  return one("SELECT * FROM oauth_pending WHERE token = ?", t);
}
route("GET", "/api/auth/oauth/pending", ({ query, ip }) => {
  limit("oauth-pend:" + ip, 30, 60_000);
  const r = pendingRow(query.get("token"));
  if (!r) fail(404, "Esse link expirou. Entre de novo pelo botão do provedor.");
  return { name: r.name, email: r.email, provider: (oauth.P[r.provider] || {}).name || r.provider };
}, { auth: false });
route("POST", "/api/auth/oauth/complete", ({ body, res, ip }) => {
  limit("oauth-pend:" + ip, 30, 60_000);
  const r = pendingRow(body.token);
  if (!r) fail(404, "Esse link expirou. Entre de novo pelo botão do provedor.");
  const role = body.role === "cliente" ? "cliente" : body.role === "freela" ? "freela" : "";
  if (!role) fail(400, "Escolha se você quer trabalhar ou contratar.");
  const id = tx(() => createOAuthUser(r, role));
  run("DELETE FROM oauth_pending WHERE token = ?", r.token);
  createSession(res, id);
  return { ok: true, role };
}, { auth: false });

// "QUEM SOU EU?": o site pergunta isso ao abrir. Devolvemos a pessoa logada (ou ninguém) e
// também como a plataforma está configurada: pagamentos ligados? quais botões de login?
// e-mail ligado? e a versão dos arquivos (para o site perceber quando saiu versão nova).
// Quantas mensagens a pessoa ainda não leu (em todas as conversas). É o número vermelho do
// menu, da barra de baixo e do ícone do app instalado (como o do Mail no iPhone).
const unreadCount = (id: number) => one(`SELECT COUNT(*) n FROM messages m JOIN threads t ON t.id = m.thread_id
    WHERE (t.client_id = ? AND m.created_at > t.client_read_at OR t.freela_id = ? AND m.created_at > t.freela_read_at)
    AND (m.sender_id IS NULL OR m.sender_id != ?)`, id, id, id)!.n;
route("GET", "/api/me", ({ user }) => {
  const pub = { payments: { enabled: PAYMENTS, provider: stripe.SELECTED ? "stripe" : "asaas", sandbox: stripe.SELECTED ? stripe.SANDBOX : /sandbox/.test(asaas.BASE), fee: stripe.SELECTED ? 10 : asaas.FEE_PCT, autoRelease: stripe.SELECTED ? 0 : asaas.AUTO_RELEASE_DAYS }, oauth: oauth.list(), mail: mail.ENABLED, phone: wa.ENABLED, push: push.ENABLED ? push.PUBLIC_KEY : "", analytics: GA_ID, v: appVersion() };
  if (!user) return { user: null, ...pub };
  const unread = unreadCount(user.id);
  const pr = one("SELECT cpf_cnpj FROM profiles WHERE user_id = ?", user.id);
  const payout = stripe.SELECTED ? stripe.accountStatus(user.id) : (() => {
    const p = one("SELECT wallet_id, escrow FROM payout_accounts WHERE user_id = ?", user.id);
    return p ? { active: !!p.escrow, escrow: !!p.escrow } : null;
  })();
  // needPhone: a conta ainda não tem celular confirmado (login social ou conta antiga).
  // Com o WhatsApp ligado, o site trava numa caixa até a pessoa confirmar.
  const needPhone = wa.ENABLED && !user.phone;
  return { user: { ...user, isAdmin: isAdmin(user), profile: profileOf(user.id), unread, hasDoc: !!pr?.cpf_cnpj, payout, needPhone },
    ...pub };
}, { auth: false });

// CELULAR DE QUEM JÁ ESTÁ NA CONTA (ex.: entrou com login social): mesmo caminho do cadastro
// (phone/start, a mensagem no WhatsApp, phone/status), e aqui o comprovante vira o celular da conta.
route("POST", "/api/me/phone", ({ user, body }) => {
  if (!wa.ENABLED) fail(503, "A confirmação por celular ainda não está ativa.");
  const t = /^[a-f0-9]{48}$/.test(String(body.ticket || "")) && one("SELECT phone FROM phone_tickets WHERE token_hash = ? AND expires_at > ?", sha(body.ticket as string), new Date().toISOString());
  if (!t) fail(400, "Esse comprovante venceu. Mande a mensagem pelo WhatsApp de novo.");
  if (one("SELECT 1 FROM users WHERE phone = ? AND id != ?", t.phone, user.id)) fail(409, "Esse celular já está em outra conta.");
  tx(() => {
    run("UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?", t.phone, new Date().toISOString(), user.id);
    run("DELETE FROM phone_tickets WHERE phone = ?", t.phone);
  });
  return { ok: true, pretty: wa.pretty(t.phone) };
});

// TROCAR DE PAPEL: a mesma conta pode ser de freelancer e de cliente. Aqui a pessoa escolhe qual
// papel está usando agora (o site inteiro se ajusta a ele). Se ainda não tinha o outro papel,
// ele é ativado na hora: as vagas, propostas e contratos de cada lado continuam onde estavam.
route("POST", "/api/me/role", ({ user, body }) => {
  const role = isOneOf(body.role, ROLES) ? body.role : user.roles.find(r => r !== user.role)!;
  const roles = [...new Set([...user.roles, role])];
  run("UPDATE users SET role = ?, roles = ? WHERE id = ?", role, roles.join(","), user.id);
  return { ok: true, role, roles, added: !user.roles.includes(role) };
});

// SALVAR PERFIL: limpa e corta cada campo no tamanho certo (título até 100 letras, bio até
// 1200, no máximo 12 habilidades...) e grava. Se veio CPF/CNPJ, confere se é válido antes.
route("PUT", "/api/me/profile", ({ user, body }) => {
  if (typeof body.searchVisible === "boolean") run("UPDATE profiles SET search_visible = ? WHERE user_id = ?", body.searchVisible ? 1 : 0, user.id);
  const how = record(body.how);
  run(`UPDATE profiles SET title=?, bio=?, location=?, rate=?, hours=?, skills=?, ws_com=?, ws_resp=?, ws_fb=?, ws_foco=?, tag=?, company=? WHERE user_id=?`,
    str(body.title, 100), str(body.bio, 1200), str(body.location, 80), int(body.rate, 0, 100000), int(body.hours, 1, 60),
    JSON.stringify(list(body.skills, 12, 40)),
    str(how.com, 200), str(how.resp, 200), str(how.fb, 200), str(how.foco, 200), str(body.tag, 80), str(body.company, 100), user.id);
  const name = str(body.name, 80);
  if (body.name !== undefined && name.length < 2) fail(400, "O nome precisa ter pelo menos 2 letras.");
  if (name.length >= 2) run("UPDATE users SET name = ? WHERE id = ?", name, user.id);
  if (isOneOf(body.notify, NOTIFY)) run("UPDATE users SET notify_level = ? WHERE id = ?", body.notify, user.id);
  if (typeof body.cpfCnpj === "string" && body.cpfCnpj.trim()) {
    const doc = body.cpfCnpj.replace(/\D/g, "");
    if (!validDoc(doc)) fail(400, "CPF ou CNPJ inválido. Confira os números.");
    run("UPDATE profiles SET cpf_cnpj = ?, asaas_customer_id = '' WHERE user_id = ?", doc, user.id);
  }
  return { profile: profileOf(user.id) };
});

// FOTO DE PERFIL: o navegador já manda a foto recortada e pequena, escrita como texto (base64).
// Aqui conferimos os primeiros bytes ("a assinatura do arquivo"): todo JPG começa com FF D8 FF
// e todo PNG com 89 50 4E 47. Assim ninguém manda um vírus fingindo ser foto.
// "v" é um número de versão: quando a foto muda, o endereço muda e o navegador baixa a nova.
// --- foto de perfil: o navegador já envia recortada e reduzida (JPEG ou PNG, quadrada)
const IMG_SIG: Record<string, number[]> = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47] };
function decodeImage(dataUrl: unknown, maxBytes: number) {
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === "string" ? dataUrl : "");
  if (!m) fail(400, "Envie uma imagem JPG ou PNG.");
  const buf = Buffer.from(m[2], "base64");
  if (!IMG_SIG[m[1]].every((b, i) => buf[i] === b)) fail(400, "Esse arquivo não parece uma imagem válida.");
  if (buf.length > maxBytes) fail(413, "Imagem grande demais. Tente outra.");
  return { mime: m[1], buf };
}
route("PUT", "/api/me/avatar", ({ user, body, ip }) => {
  limit("avatar:" + ip, 20, 600_000);
  const img = decodeImage(body.image, 500_000);
  const v = Date.now();
  run("INSERT INTO avatars (user_id, mime, data, v) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, v = excluded.v", user.id, img.mime, img.buf, v);
  return { avatar: avatarUrl(user.id, v) };
});
route("DELETE", "/api/me/avatar", ({ user }) => {
  run("DELETE FROM avatars WHERE user_id = ?", user.id);
  return { avatar: "" };
});

// SELO DE VERIFICADO: recebe o PDF, chama o detetive (src/icp.js) e, se passar:
// - recusa se o laudo foi assinado pela própria pessoa da conta;
// - recusa se o mesmo laudo já verificou outra conta;
// - anota só o CRM, a data e o resumo do arquivo. O PDF em si é jogado fora.
// "x-consent" é a caixinha "o laudo é meu e eu concordo" que a pessoa marcou no site.
// --- selo de verificado: laudo em PDF assinado por médico com certificado ICP-Brasil (ver src/icp.js)
// O PDF é conferido na memória e descartado. A pessoa declara que o laudo é dela.
const plain = (s: string) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim();
route("POST", "/api/me/verify", async ({ user, req, body }) => {
  limit("verify:" + user.id, 10, 3600_000);
  if (req.headers["x-consent"] !== "1") fail(400, "Confirme que o laudo é seu e que você concorda com a conferência.");
  let r;
  try { r = await icp.verifyMedicalPdf(body); }
  catch (e) { if (e instanceof icp.IcpError) fail(400, e.message); throw e; }
  if (plain(r.doctor) && plain(r.doctor) === plain(user.name)) fail(400, "O laudo precisa ser assinado por outra pessoa, não pela própria dona da conta.");
  const other = one("SELECT user_id FROM verifications WHERE doc_sha256 = ?", r.sha256);
  if (other && other.user_id !== user.id) fail(409, "Esse laudo já foi usado para verificar outra conta.");
  run(`INSERT INTO verifications (user_id, doc_sha256, crm, signed_at, revocation) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET doc_sha256 = excluded.doc_sha256, crm = excluded.crm, signed_at = excluded.signed_at,
    revocation = excluded.revocation, verified_at = datetime('now')`,
    user.id, r.sha256, r.crm ? `CRM${r.uf ? "-" + r.uf : ""} ${r.crm}` : `${r.ar} (sem número do CRM no certificado)`, r.signedAt.toISOString(), r.revocation);
  return { verified: true, revocation: r.revocation };
}, { role: "freela", raw: 10 * 1024 * 1024 });
route("DELETE", "/api/me/verify", ({ user }) => {
  run("DELETE FROM verifications WHERE user_id = ?", user.id);
  return { verified: false };
}, { role: "freela" });

// PORTFÓLIO: criar, editar, apagar e mudar a ordem dos projetos (até 12). ownItem garante
// que você só mexe nos SEUS projetos. Mudar a ordem = trocar o projeto de lugar com o vizinho
// de cima ou de baixo e regravar as posições.
// --- portfólio: até 12 projetos, cada um com título, link e imagem opcionais (reduzida no navegador)
const PORT_MAX = 12;
function portfolioFields(body: JsonBody) {
  const title = str(body.title, 80), link = str(body.link, 300);
  if (title.length < 2) fail(400, "Dê um nome ao projeto.");
  if (link && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(link)) fail(400, "O link precisa começar com https:// (ou deixe em branco).");
  return { title, link };
}
const ownItem = (user: SessionUser, id: number) => one("SELECT * FROM portfolio_items WHERE id = ? AND user_id = ?", id, user.id) || fail(404, "Projeto não encontrado.");
route("POST", "/api/me/portfolio", ({ user, body, ip }) => {
  limit("port:" + ip, 60, 600_000);
  const { title, link } = portfolioFields(body);
  const n = one("SELECT COUNT(*) n, COALESCE(MAX(pos), -1) last FROM portfolio_items WHERE user_id = ?", user.id)!;
  if (n.n >= PORT_MAX) fail(409, `O portfólio tem espaço para ${PORT_MAX} projetos. Remova um para adicionar outro.`);
  const img = body.image ? decodeImage(body.image, 1_500_000) : null;
  run("INSERT INTO portfolio_items (user_id, pos, title, link, mime, image, v) VALUES (?,?,?,?,?,?,?)",
    user.id, n.last + 1, title, link, img ? img.mime : "", img ? img.buf : null, img ? Date.now() : 0);
  return { portfolio: portfolioOf(user.id) };
}, { role: "freela" });
route("PUT", "/api/me/portfolio/:id", ({ user, params, body, ip }) => {
  limit("port:" + ip, 60, 600_000);
  const it = ownItem(user, params.id);
  const { title, link } = portfolioFields(body);
  run("UPDATE portfolio_items SET title = ?, link = ? WHERE id = ?", title, link, it.id);
  if (body.image) { const img = decodeImage(body.image, 1_500_000); run("UPDATE portfolio_items SET mime = ?, image = ?, v = ? WHERE id = ?", img.mime, img.buf, Date.now(), it.id); }
  else if (body.removeImage) run("UPDATE portfolio_items SET mime = '', image = NULL, v = 0 WHERE id = ?", it.id);
  return { portfolio: portfolioOf(user.id) };
}, { role: "freela" });
route("DELETE", "/api/me/portfolio/:id", ({ user, params }) => {
  run("DELETE FROM portfolio_items WHERE id = ?", ownItem(user, params.id).id);
  return { portfolio: portfolioOf(user.id) };
}, { role: "freela" });
route("POST", "/api/me/portfolio/:id/move", ({ user, params, body }) => {
  ownItem(user, params.id);
  const ids = all("SELECT id FROM portfolio_items WHERE user_id = ? ORDER BY pos, id", user.id).map(r => r.id);
  const i = ids.indexOf(params.id), j = i + (Number(body.dir) < 0 ? -1 : 1);
  if (j >= 0 && j < ids.length) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    tx(() => ids.forEach((id, pos) => run("UPDATE portfolio_items SET pos = ? WHERE id = ?", pos, id)));
  }
  return { portfolio: portfolioOf(user.id) };
}, { role: "freela" });

// ENERGIA: a pessoa diz como está hoje (baixa, média, alta). Isso muda quantas propostas ela
// pode ter abertas ao mesmo tempo (veja proposalCap lá em cima).
route("PUT", "/api/me/energy", ({ user, body }) => {
  if (!isOneOf(body.energy, ENERGY)) fail(400, "Escolha baixa, média ou alta.");
  run("UPDATE users SET energy = ? WHERE id = ?", body.energy, user.id);
  return { ok: true };
});

// TALENTOS: lista de freelas (quem tem título aparece primeiro) e busca por palavra em nome,
// título, bio, habilidades e jeito de se comunicar. A outra rota mostra um perfil com avaliações.
// --- talentos
route("GET", "/api/talents", ({ query }) => {
  const { talents, pagination } = seo.listTalents(query);
  return { talents, pagination };
}, { auth: false });

route("GET", "/api/talents/:id", ({ params }) => {
  const t = profileOf(params.id);
  if (!t || !t.roles.includes("freela")) fail(404, "Perfil não encontrado.");
  return { talent: { ...t, reviews: reviewsOf(t.id) } };
}, { auth: false });

// VAGAS: a lista pública só mostra vagas ABERTAS. Os filtros vêm do endereço:
// q (palavra), cat (área), clear (só briefing claro, 80%+), async (sem reuniões), flex (prazo
// flexível) e sort (ordenar por clareza ou por valor; valor por hora conta como 15 horas).
// --- vagas
route("GET", "/api/jobs", ({ query }) => {
  const { jobs, pagination } = seo.listJobs(query);
  return { jobs, pagination };
}, { auth: false });

route("GET", "/api/me/jobs", ({ user }) => ({ jobs: all(JOB_SELECT + " WHERE j.client_id = ? ORDER BY j.created_at DESC", user.id).map(jobOut) }), { role: "cliente" });

// UMA VAGA: todo mundo vê o briefing. Só quem está logado vê os arquivos. O DONO da vaga vê
// também todas as propostas recebidas; um freela vê a proposta que ele mesmo mandou.
route("GET", "/api/jobs/:id", ({ params, user }) => {
  const j = one(JOB_SELECT + " WHERE j.id = ?", params.id);
  if (!j) fail(404, "Vaga não encontrada.");
  const files = filesOf(j.id);
  type ProposalOutput = Omit<ProposalRow, "milestones"> & {milestones: ProposalMilestone[];files: AppRow[];freela?: ReturnType<typeof profileOf>};
  const out: {job: ReturnType<typeof jobOut> & {clientRating: ReturnType<typeof ratingOf>;clientReviews: ReturnType<typeof reviewsOf>;files: AppRow[];filesCount: number};proposals?: ProposalOutput[];mine?: ProposalOutput} = { job: { ...jobOut(j), clientRating: ratingOf(j.client_id), clientReviews: reviewsOf(j.client_id).slice(0, 5),
    files: user ? files : [], filesCount: files.length } };
  if (user && (user.id === j.client_id || isAdmin(user))) {
    out.proposals = all<ProposalRow>(`SELECT pr.*, u.name freela_name FROM proposals pr JOIN users u ON u.id = pr.freela_id WHERE pr.job_id = ? ORDER BY pr.created_at`, j.id)
      .map(p => ({ ...p, milestones: parse<ProposalMilestone[]>(p.milestones), freela: profileOf(p.freela_id), files: attsOf("proposal_id", p.id) }));
  }
  if (user) {
    const mine = one<ProposalRow>("SELECT * FROM proposals WHERE job_id = ? AND freela_id = ?", j.id, user.id);
    if (mine) out.mine = { ...mine, milestones: parse<ProposalMilestone[]>(mine.milestones), files: attsOf("proposal_id", mine.id) };
  }
  return out;
}, { auth: false });

// PUBLICAR VAGA: limpa cada campo, exige título e área, calcula a nota de clareza e só
// publica com 50% ou mais.
route("POST", "/api/jobs", ({ user, body }) => {
  const j = {
    title: str(body.title, 120), cat: isOneOf(body.cat, CATS) ? body.cat : "", obj: str(body.obj, 1200),
    ent: list(body.ent, 15, 200), fora: list(body.fora, 10, 200), com: str(body.com, 200), fb: str(body.fb, 300), ref: str(body.ref, 500),
    budget_type: body.budget_type === "hora" ? "hora" : "fixo", budget: int(body.budget, 0, 10_000_000), duration: str(body.duration, 60),
    skills: list(body.skills, 8, 40), async: body.async ? 1 : 0, flex: body.flex ? 1 : 0,
  };
  if (j.title.length < 5) fail(400, "Dê um título com pelo menos 5 letras.");
  if (!j.cat) fail(400, "Escolha uma área.");
  const c = clarity(j);
  if (c < 50) fail(400, `O briefing está com ${c}% de clareza. Complete pelo menos metade dos campos para publicar.`);
  const id = Number(run(`INSERT INTO jobs (client_id,title,cat,obj,ent,fora,com,fb,ref,budget_type,budget,duration,skills,is_async,is_flex,clarity)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, user.id, j.title, j.cat, j.obj, JSON.stringify(j.ent), JSON.stringify(j.fora), j.com, j.fb, j.ref,
    j.budget_type, j.budget, j.duration, JSON.stringify(j.skills), j.async, j.flex, c).lastInsertRowid);
  return { id, clarity: c };
}, { role: "cliente" });

// FECHAR VAGA: o dono decide que não quer mais propostas.
route("POST", "/api/jobs/:id/close", ({ user, params }) => {
  const j = one("SELECT * FROM jobs WHERE id = ? AND client_id = ?", params.id, user.id);
  if (!j) fail(404, "Vaga não encontrada.");
  run("UPDATE jobs SET status = 'fechada' WHERE id = ?", j.id);
  return { ok: true };
}, { role: "cliente" });

// ARQUIVOS DA VAGA: até 6 por vaga, 10 MB cada. FILE_TYPES é uma lista fechada de tipos
// aceitos e, para cada um, um teste dos primeiros bytes: um "foto.png" que por dentro não é
// PNG é recusado. Arquivos do Word/Excel novos são ZIPs por dentro (começam com "PK").
// --- arquivos do briefing: até 6 por vaga, 10 MB cada; só quem tem conta baixa
// O tipo é conferido pelo conteúdo do arquivo (não só pelo nome) e a lista de tipos é fechada.
const FILE_MAX = 10 * 1024 * 1024, FILES_PER_JOB = 6;
const starts = (b: Uint8Array, ...sig: number[]) => sig.every((x, i) => b[i] === x);
const zipOffice = (b: Buffer) => starts(b, 0x50, 0x4b, 0x03, 0x04);
const isText = (b: Buffer) => !b.subarray(0, 8192).includes(0) && (() => { try { new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, 8192)); return true; } catch { return false; } })();
const FILE_TYPES: Record<string, [string, (bytes: Buffer) => boolean]> = {
  pdf: ["application/pdf", b => starts(b, 0x25, 0x50, 0x44, 0x46)],
  ai: ["application/pdf", b => starts(b, 0x25, 0x50, 0x44, 0x46) || starts(b, 0x25, 0x21)],
  psd: ["image/vnd.adobe.photoshop", b => starts(b, 0x38, 0x42, 0x50, 0x53)],
  png: ["image/png", b => starts(b, 0x89, 0x50, 0x4e, 0x47)],
  jpg: ["image/jpeg", b => starts(b, 0xff, 0xd8, 0xff)], jpeg: ["image/jpeg", b => starts(b, 0xff, 0xd8, 0xff)],
  webp: ["image/webp", b => starts(b, 0x52, 0x49, 0x46, 0x46) && b.subarray(8, 12).toString() === "WEBP"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", zipOffice],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zipOffice],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", zipOffice],
  odt: ["application/vnd.oasis.opendocument.text", zipOffice], ods: ["application/vnd.oasis.opendocument.spreadsheet", zipOffice],
  odp: ["application/vnd.oasis.opendocument.presentation", zipOffice],
  txt: ["text/plain; charset=utf-8", isText], csv: ["text/csv; charset=utf-8", isText], md: ["text/markdown; charset=utf-8", isText],
};
// A CONFERÊNCIA DE TODO ARQUIVO QUE CHEGA (vaga, proposta, mensagem ou etapa): limpa o nome
// (tira barras e caracteres invisíveis), pega a extensão, confere se o tipo está na lista e se
// os primeiros bytes combinam com o tipo. Devolve o nome limpo e a extensão.
function checkUpload(req: http.IncomingMessage, body: Buffer) {
  let name = ""; try { name = decodeURIComponent(String(req.headers["x-filename"] || "")); } catch {}
  name = name.replace(/[\x00-\x1f\x7f/\\]/g, "").trim().slice(-120);
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
  const type = FILE_TYPES[ext];
  if (!type) fail(400, "Tipo de arquivo não aceito. Envie PDF, imagem (JPG, PNG, WebP), PSD, AI, Word, Excel, PowerPoint ou texto.");
  if (!body.length) fail(400, "O arquivo está vazio.");
  if (!type[1](body)) fail(400, `Esse arquivo não parece um .${ext} de verdade.`);
  return { name, ext };
}
const filesOf = (jobId: number) => all("SELECT id, name, ext, size FROM job_files WHERE job_id = ? ORDER BY id", jobId);
route("POST", "/api/jobs/:id/files", ({ user, params, req, body, ip }) => {
  limit("files:" + ip, 40, 600_000);
  const j = one("SELECT id FROM jobs WHERE id = ? AND client_id = ?", params.id, user.id);
  if (!j) fail(404, "Vaga não encontrada.");
  if (one("SELECT COUNT(*) n FROM job_files WHERE job_id = ?", j.id)!.n >= FILES_PER_JOB) fail(409, `Cada vaga aceita até ${FILES_PER_JOB} arquivos. Remova um para enviar outro.`);
  const { name, ext } = checkUpload(req, body);
  run("INSERT INTO job_files (job_id, name, ext, size, data) VALUES (?,?,?,?,?)", j.id, name, ext, body.length, body);
  return { files: filesOf(j.id) };
}, { role: "cliente", raw: FILE_MAX });
route("DELETE", "/api/jobs/:id/files/:fid", ({ user, params }) => {
  const f = one("SELECT f.id FROM job_files f JOIN jobs j ON j.id = f.job_id WHERE f.id = ? AND j.id = ? AND j.client_id = ?", params.fid, params.id, user.id);
  if (!f) fail(404, "Arquivo não encontrado.");
  run("DELETE FROM job_files WHERE id = ?", f.id);
  return { files: filesOf(params.id) };
}, { role: "cliente" });
// BAIXAR ARQUIVO DA VAGA: só quem está logado. Imagens e PDF abrem no navegador; o resto
// sempre é baixado. O "Content-Security-Policy ... sandbox" prende o arquivo numa caixinha,
// para ele nunca conseguir rodar como se fosse parte do site.
function serveFile(req: http.IncomingMessage, res: http.ServerResponse, id: number) {
  if (!currentUser(req)) return send(res, 401, "Entre na sua conta para baixar os arquivos da vaga.", { "Content-Type": "text/plain; charset=utf-8" });
  const f = one("SELECT name, ext, data FROM job_files WHERE id = ?", id);
  if (!f) return send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" });
  sendBlob(res, f);
}
// BAIXAR ANEXO (proposta, mensagem ou etapa): diferente do briefing, que qualquer pessoa com
// conta vê, um anexo é PARTICULAR. Só os dois lados envolvidos abrem: o cliente e o freela da
// proposta, da conversa ou do contrato. Para qualquer outra pessoa, o anexo "não existe" (404).
function serveAttachment(req: http.IncomingMessage, res: http.ServerResponse, id: number) {
  const user = currentUser(req);
  if (!user) return send(res, 401, "Entre na sua conta para baixar este arquivo.", { "Content-Type": "text/plain; charset=utf-8" });
  const f = one(ATT_OWNERS + " WHERE a.id = ?", id);
  if (!f || (f.client_id !== user.id && f.freela_id !== user.id && !(f.proposal_id && isAdmin(user)))) return send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" });
  sendBlob(res, f);
}
function sendBlob(res: http.ServerResponse, f: AppRow) {
  // imagens e PDF abrem no navegador; o resto sempre baixa. O arquivo nunca roda como página do site.
  const inline = ["pdf", "png", "jpg", "jpeg", "webp"].includes(f.ext);
  const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  send(res, 200, Buffer.from(f.data), {
    "Content-Type": FILE_TYPES[f.ext][0], "Cache-Control": "private, no-cache",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    ...(f.ext === "pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
  });
}

// ANEXOS DAS PROPOSTAS, MENSAGENS E ETAPAS: mesma conferência e mesmo limite de 10 MB dos
// arquivos do briefing, mas cada anexo é particular dos dois lados envolvidos.
// - proposta: o freela anexa até 6 arquivos (portfólio, orçamento detalhado) enquanto a
//   proposta espera resposta; o cliente dono da vaga vê;
// - mensagem: um arquivo vira uma mensagem na conversa ("📎 nome do arquivo");
// - etapa: cliente e freela anexam até 10 arquivos (a entrega, referências, correções) enquanto
//   a etapa não foi aprovada. Quem enviou pode remover, mas não depois que a etapa foi entregue.
// ATT_OWNERS descobre, para qualquer anexo, quem é o cliente e quem é o freela daquela coisa.
// --- anexos de propostas, mensagens e etapas
const FILES_PER_PROPOSAL = 6, FILES_PER_MILESTONE = 10, FILES_PER_THREAD = 200;
const ATT_OWNERS = `SELECT a.*, COALESCE(j.client_id, t.client_id, c.client_id) client_id, COALESCE(pr.freela_id, t.freela_id, c.freela_id) freela_id
  FROM attachments a
  LEFT JOIN proposals pr ON pr.id = a.proposal_id LEFT JOIN jobs j ON j.id = pr.job_id
  LEFT JOIN messages m ON m.id = a.message_id LEFT JOIN threads t ON t.id = m.thread_id
  LEFT JOIN milestones ms ON ms.id = a.milestone_id LEFT JOIN contracts c ON c.id = ms.contract_id`;
const attsOf = (col: string, id: number) => all(`SELECT id, name, ext, size, user_id FROM attachments WHERE ${col} = ? ORDER BY id`, id);
const addAtt = (col: string, id: number, user: SessionUser, name: string, ext: string, body: Buffer) =>
  Number(run(`INSERT INTO attachments (${col}, user_id, name, ext, size, data) VALUES (?,?,?,?,?,?)`, id, user.id, name, ext, body.length, body).lastInsertRowid);

route("POST", "/api/proposals/:id/files", ({ user, params, req, body }) => {
  limit("files:" + user.id, 40, 600_000);
  const p = one("SELECT id, status FROM proposals WHERE id = ? AND freela_id = ?", params.id, user.id);
  if (!p) fail(404, "Proposta não encontrada.");
  if (p.status !== "enviada") fail(409, "Só dá para anexar arquivos enquanto a proposta aguarda resposta.");
  if (one("SELECT COUNT(*) n FROM attachments WHERE proposal_id = ?", p.id)!.n >= FILES_PER_PROPOSAL) fail(409, `Cada proposta aceita até ${FILES_PER_PROPOSAL} arquivos. Remova um para enviar outro.`);
  const { name, ext } = checkUpload(req, body);
  addAtt("proposal_id", p.id, user, name, ext, body);
  return { files: attsOf("proposal_id", p.id) };
}, { role: "freela", raw: FILE_MAX });
route("DELETE", "/api/proposals/:id/files/:fid", ({ user, params }) => {
  const p = one("SELECT id, status FROM proposals WHERE id = ? AND freela_id = ?", params.id, user.id);
  if (!p) fail(404, "Proposta não encontrada.");
  if (p.status !== "enviada") fail(409, "A proposta já foi respondida: os arquivos ficam como estão.");
  if (!run("DELETE FROM attachments WHERE id = ? AND proposal_id = ?", params.fid, p.id).changes) fail(404, "Arquivo não encontrado.");
  return { files: attsOf("proposal_id", p.id) };
}, { role: "freela" });

route("POST", "/api/threads/:id/files", ({ user, params, req, body }) => {
  limit("files:" + user.id, 40, 600_000);
  limit("msg:" + user.id, 60, 60_000);
  const t = threadAccess(user, params.id);
  if (one("SELECT COUNT(*) n FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.thread_id = ?", t.id)!.n >= FILES_PER_THREAD)
    fail(409, `Esta conversa chegou ao limite de ${FILES_PER_THREAD} arquivos.`);
  const { name, ext } = checkUpload(req, body);
  tx(() => { addAtt("message_id", postMessage(t.id, user.id, "📎 " + name), user, name, ext, body); });
  run(`UPDATE threads SET ${t.client_id === user.id ? "client_read_at" : "freela_read_at"} = datetime('now') WHERE id = ?`, t.id);
  if (t.kind === "suporte") supportNotify(t, user, "📎 " + name);
  return { ok: true };
}, { raw: FILE_MAX });

// Etapa que a pessoa pode ver: ela precisa ser o cliente ou o freela do contrato.
function msAccess(user: SessionUser, id: number) {
  const m = one(MS_SELECT, id);
  if (!m || (m.client_id !== user.id && m.freela_id !== user.id)) fail(404, "Etapa não encontrada.");
  return m;
}
route("POST", "/api/milestones/:id/files", ({ user, params, req, body }) => {
  limit("files:" + user.id, 40, 600_000);
  const m = msAccess(user, params.id);
  if (m.status === "aprovada") fail(409, "Esta etapa já foi aprovada. Mande o arquivo pela conversa.");
  if (one("SELECT COUNT(*) n FROM attachments WHERE milestone_id = ?", m.id)!.n >= FILES_PER_MILESTONE) fail(409, `Cada etapa aceita até ${FILES_PER_MILESTONE} arquivos. Remova um para enviar outro.`);
  const { name, ext } = checkUpload(req, body);
  tx(() => {
    addAtt("milestone_id", m.id, user, name, ext, body);
    postMessage(threadFor(m.job_id, m.client_id, m.freela_id), null, `${user.name} anexou "${name}" à etapa "${m.title}".`, user.id);
  });
  return { files: attsOf("milestone_id", m.id) };
}, { raw: FILE_MAX });
route("DELETE", "/api/milestones/:id/files/:fid", ({ user, params }) => {
  const m = msAccess(user, params.id);
  if (["entregue", "aprovada"].includes(m.status)) fail(409, "A etapa já foi entregue: os arquivos ficam como estão até o cliente responder.");
  if (!run("DELETE FROM attachments WHERE id = ? AND milestone_id = ? AND user_id = ?", params.fid, m.id, user.id).changes) fail(404, "Arquivo não encontrado.");
  return { files: attsOf("milestone_id", m.id) };
});

// CONVIDAR: o cliente chama um talento para a vaga. Isso abre (ou reaproveita) a conversa
// entre os dois com uma mensagem de convite.
route("POST", "/api/jobs/:id/invite", ({ user, params, body }) => {
  const j = one("SELECT * FROM jobs WHERE id = ? AND client_id = ? AND status = 'aberta'", params.id, user.id);
  if (!j) fail(404, "Vaga aberta não encontrada.");
  const t = one(`SELECT id FROM users u WHERE id = ? AND ${HAS("freela")}`, int(body.talentId));
  if (!t) fail(404, "Talento não encontrado.");
  if (t.id === user.id) fail(400, "Você não pode convidar a si mesmo.");
  const th = threadFor(j.id, user.id, t.id);
  postMessage(th, null, `${user.name} convidou você para a vaga "${j.title}". Leia o briefing e, se fizer sentido, envie uma proposta.`, user.id);
  return { thread: th };
}, { role: "cliente" });

// MANDAR PROPOSTA (o freela responde a uma vaga). Conferências, uma por uma:
// - a vaga ainda está aberta? a pessoa ainda não mandou proposta para ela?
// - a pessoa não passou do limite de propostas abertas (proposalCap)?
// - o texto tem pelo menos 10 palavras, o valor é pelo menos R$ 50 e tem prazo?
// ETAPAS: o freela pode dividir o valor em até 8 etapas. Se a soma das etapas não for igual
// ao valor total, ignoramos e criamos uma etapa só ("Entrega completa").
// Tudo é gravado junto (tx) e uma mensagem do sistema avisa o cliente na conversa.
// --- propostas
route("POST", "/api/jobs/:id/proposals", ({ user, params, body }) => {
  const j = one("SELECT * FROM jobs WHERE id = ? AND status = 'aberta'", params.id);
  if (!j) fail(404, "Essa vaga não está mais aberta.");
  if (j.client_id === user.id) fail(400, "Esta vaga é sua: você não pode mandar proposta para ela.");
  if (one("SELECT 1 FROM proposals WHERE job_id = ? AND freela_id = ?", j.id, user.id)) fail(409, "Você já enviou uma proposta para esta vaga.");
  const prof = one("SELECT hours FROM profiles WHERE user_id = ?", user.id);
  const open = one("SELECT COUNT(*) n FROM proposals WHERE freela_id = ? AND status = 'enviada'", user.id)!.n;
  const cap = proposalCap(user, prof && prof.hours);
  if (open >= cap) fail(409, `Você já tem ${open} propostas aguardando resposta, o limite para sua capacidade atual. Espere uma resposta ou retire uma proposta.`);
  const text = str(body.text, 4000), value = int(body.value, 0), days = int(body.days, 0, 365), questions = str(body.questions, 2000);
  if (text.split(/\s+/).filter(Boolean).length < 10) fail(400, "Escreva pelo menos 10 palavras sobre como faria o trabalho.");
  if (value < 50) fail(400, "Informe um valor de pelo menos R$ 50.");
  if (days < 1) fail(400, "Informe o prazo em dias úteis.");
  let ms = Array.isArray(body.milestones) ? (body.milestones as {title?: unknown;value?: unknown}[]).map(m => ({ title: str(m.title, 120), value: int(m.value, 0) })).filter(m => m.title && m.value > 0).slice(0, 8) : [];
  if (!ms.length || ms.reduce((a, m) => a + m.value, 0) !== value) ms = [{ title: "Entrega completa", value }];
  const id = tx(() => {
    const pid = Number(run("INSERT INTO proposals (job_id, freela_id, text, value, days, questions, milestones) VALUES (?,?,?,?,?,?,?)",
      j.id, user.id, text, value, days, questions, JSON.stringify(ms)).lastInsertRowid);
    const th = threadFor(j.id, j.client_id, user.id);
    postMessage(th, null, `${user.name} enviou uma proposta de ${brl(value)} em ${days} dias úteis.`, user.id);
    if (questions) postMessage(th, user.id, questions);
    return pid;
  });
  return { id };
}, { role: "freela" });

// MINHAS PROPOSTAS: a lista de propostas do freela, mais o limite atual e quantas estão abertas.
route("GET", "/api/me/proposals", ({ user }) => {
  const prof = one("SELECT hours FROM profiles WHERE user_id = ?", user.id);
  const rows = all(`SELECT pr.*, j.title job_title, u.name client_name FROM proposals pr JOIN jobs j ON j.id = pr.job_id JOIN users u ON u.id = j.client_id
    WHERE pr.freela_id = ? ORDER BY pr.created_at DESC`, user.id);
  return { proposals: rows, cap: proposalCap(user, prof && prof.hours), open: rows.filter(r => r.status === "enviada").length };
}, { role: "freela" });

// Garante que a proposta é de uma vaga DO cliente que está pedindo (ninguém aceita proposta
// de vaga dos outros).
function ownProposalAsClient(user: SessionUser, id: number) {
  const p = one("SELECT pr.*, j.client_id, j.title job_title, j.status job_status FROM proposals pr JOIN jobs j ON j.id = pr.job_id WHERE pr.id = ?", id);
  if (!p || (p.client_id !== user.id && !isAdmin(user))) fail(404, "Proposta não encontrada.");
  return p;
}
function ensureContractForProposal(p: AppRow, actorId: number | null = p.client_id): number {
  const existing = one<{ id: number }>("SELECT id FROM contracts WHERE proposal_id = ?", p.id);
  if (existing) {
    run("UPDATE proposals SET status = 'aceita' WHERE id = ?", p.id);
    run("UPDATE jobs SET status = 'em_andamento' WHERE id = ? AND status IN ('aberta', 'fechada')", p.job_id);
    return existing.id;
  }
  return tx(() => {
    run("UPDATE proposals SET status = 'aceita' WHERE id = ?", p.id);
    const c = Number(run("INSERT INTO contracts (job_id, proposal_id, client_id, freela_id, value) VALUES (?,?,?,?,?)", p.job_id, p.id, p.client_id, p.freela_id, p.value).lastInsertRowid);
    parse<ProposalMilestone[]>(p.milestones).forEach((m, i) => run("INSERT INTO milestones (contract_id, pos, title, value) VALUES (?,?,?,?)", c, i, m.title, m.value));
    run("UPDATE jobs SET status = 'em_andamento' WHERE id = ?", p.job_id);
    const th = threadFor(p.job_id, p.client_id, p.freela_id);
    postMessage(th, null, `Proposta aceita. Contrato criado com ${parse(p.milestones).length} etapa(s). Cada etapa é paga antecipadamente e o repasse depende da aprovação do cliente.`, actorId);
    if (PAYMENTS) {
      const hasPayout = stripe.SELECTED
        ? one("SELECT 1 FROM stripe_accounts WHERE user_id = ? AND charges_enabled = 1 AND payouts_enabled = 1", p.freela_id)
        : one("SELECT 1 FROM payout_accounts WHERE user_id = ?", p.freela_id);
      postMessage(th, null, "Próximo passo: o cliente paga a primeira etapa pelo Painel. O trabalho começa quando o pagamento for confirmado."
        + (hasPayout ? "" : " Freelancer: ative sua conta de recebimento em Meu perfil para a cobrança poder ser gerada."), actorId);
    }
    return c;
  });
}
// ACEITAR PROPOSTA = nasce o CONTRATO. Numa tacada só (tx):
// 1. a proposta vira "aceita";
// 2. cria o contrato e uma linha para cada etapa;
// 3. a vaga vira "em andamento" (sai da lista de vagas abertas);
// 4. avisa na conversa. Se os pagamentos estão ligados, explica o próximo passo:
//    o cliente paga a primeira etapa antes do trabalho começar.
route("POST", "/api/proposals/:id/accept", ({ user, params }) => {
  const p = ownProposalAsClient(user, params.id);
  if (!["enviada", "recusada"].includes(p.status) && !(isAdmin(user) && p.status === "retirada")) fail(409, "Essa proposta não pode mais ser escolhida.");
  const cid = ensureContractForProposal(p, user.id);
  if (isAdmin(user)) adminLog(user, "escolher-proposta", "proposals", p.id, { status: "aceita", contract: cid });
  return { contract: cid };
});

// RECUSAR (cliente) ou RETIRAR (freela) uma proposta que ainda espera resposta.
route("POST", "/api/proposals/:id/decline", ({ user, params }) => {
  const p = ownProposalAsClient(user, params.id);
  if (p.status !== "enviada" && !(isAdmin(user) && p.status === "retirada")) fail(409, "Essa proposta não está mais aguardando resposta.");
  run("UPDATE proposals SET status = 'recusada' WHERE id = ?", p.id);
  postMessage(threadFor(p.job_id, p.client_id, p.freela_id), null, "A proposta não foi escolhida desta vez. Obrigado pelo tempo dedicado.", user.id);
  if (isAdmin(user)) adminLog(user, "recusar-proposta", "proposals", p.id, { antes: p.status, depois: "recusada" });
  return { ok: true };
});

// REABRIR (cliente): volta uma proposta marcada como "não escolhida" para "aguardando resposta".
route("POST", "/api/proposals/:id/reopen", ({ user, params }) => {
  const p = ownProposalAsClient(user, params.id);
  if (p.status !== "recusada" && !(isAdmin(user) && p.status === "retirada")) fail(409, "Essa proposta não está marcada como não escolhida.");
  run("UPDATE proposals SET status = 'enviada' WHERE id = ?", p.id);
  run("UPDATE jobs SET status = 'aberta' WHERE id = ? AND status = 'fechada'", p.job_id);
  postMessage(threadFor(p.job_id, p.client_id, p.freela_id), null, "A proposta voltou para análise pelo cliente.", user.id);
  if (isAdmin(user)) adminLog(user, "reabrir-proposta", "proposals", p.id, { antes: p.status, depois: "enviada" });
  return { ok: true };
});

route("POST", "/api/proposals/:id/withdraw", ({ user, params }) => {
  const p = one("SELECT * FROM proposals WHERE id = ? AND freela_id = ?", params.id, user.id);
  if (!p) fail(404, "Proposta não encontrada.");
  if (p.status !== "enviada") fail(409, "Só dá para retirar propostas que ainda aguardam resposta.");
  run("UPDATE proposals SET status = 'retirada' WHERE id = ?", p.id);
  return { ok: true };
}, { role: "freela" });

// PAINEL DE CONTRATOS: lista os contratos da pessoa com as etapas, a conversa e a avaliação.
// Também soma o dinheiro em três potes:
// - paid (já liberado), held (pago e guardado no cofre, esperando aprovação),
// - toPay (ainda falta pagar).
// Sem pagamentos ligados, é uma simulação: etapa aprovada conta como paga.
// --- contratos e etapas
route("GET", "/api/contracts", ({ user }) => {
  const cs = all<ContractOutput>(`SELECT c.*, j.title job_title, uc.name client_name, uf.name freela_name FROM contracts c
    JOIN jobs j ON j.id = c.job_id JOIN users uc ON uc.id = c.client_id JOIN users uf ON uf.id = c.freela_id
    WHERE c.client_id = ? OR c.freela_id = ? ORDER BY c.status = 'concluido', c.created_at DESC`, user.id, user.id);
  for (const c of cs) {
    c.milestones = all<MilestoneOutput>("SELECT * FROM milestones WHERE contract_id = ? ORDER BY pos", c.id);
    for (const m of c.milestones) m.files = attsOf("milestone_id", m.id).map(f => ({ ...f, mine: f.user_id === user.id }));
    c.thread = threadFor(c.job_id, c.client_id, c.freela_id);
    const mine = one("SELECT rating, created_at FROM reviews WHERE contract_id = ? AND author_id = ?", c.id, user.id);
    const theirs = one("SELECT 1 FROM reviews WHERE contract_id = ? AND author_id != ?", c.id, user.id);
    c.review = { mine: mine ? mine.rating : 0, theirs: !!theirs, tags: REVIEW_TAGS[c.freela_id === user.id ? "cliente" : "freela"] };
  }
  const mine = cs.flatMap(c => c.milestones.map(m => ({ ...m, side: c.freela_id === user.id ? "freela" : "cliente" })));
  const sum = (arr: {value: number}[]) => arr.reduce((a, m) => a + m.value, 0);
  let paid, held, toPay;
  if (PAYMENTS) {
    paid = sum(mine.filter(m => m.pay_status === "liberado"));
    held = sum(mine.filter(m => m.pay_status === "pago"));
    toPay = sum(mine.filter(m => m.pay_status === "a_pagar" || m.pay_status === "aguardando"));
  } else {
    paid = sum(mine.filter(m => m.status === "aprovada")); held = sum(mine.filter(m => m.status !== "aprovada")); toPay = 0;
  }
  for (const c of cs) for (const m of c.milestones) { delete m.pay_id; }
  return { contracts: cs, stats: { paid, held, toPay, net: Math.round(paid * (1 - FEE)), fee: FEE, payments: PAYMENTS } };
});

// AS REGRAS DO JOGO DAS ETAPAS. Cada etapa anda por casinhas, como num tabuleiro:
//   pendente --(freela: começar)--> andamento --(freela: entregar)--> entregue
//   entregue --(cliente: aprovar)--> aprovada            (fim da etapa, dinheiro liberado)
//   entregue --(cliente: pedir ajustes)--> ajustes --(freela: começar)--> andamento ...
// "who" diz quem pode mexer, "from" de quais casinhas pode sair e "to" para qual vai.
// "msg" é a frase que aparece na conversa.
const MS_FLOW: Record<string, MilestoneFlow> = {
  start: { who: "freela", from: ["pendente", "ajustes"], to: "andamento", msg: m => `Etapa "${m.title}" em andamento.` },
  deliver: { who: "freela", from: ["andamento"], to: "entregue", msg: m => `Etapa "${m.title}" entregue. Aguardando aprovação.` + (!stripe.SELECTED && asaas.ENABLED ? ` Se não houver resposta em ${asaas.AUTO_RELEASE_DAYS} dias, o valor é liberado automaticamente.` : "") },
  approve: { who: "cliente", from: ["entregue"], to: "aprovada", msg: m => `Etapa "${m.title}" aprovada. ${brl(m.value)} liberado.` },
  changes: { who: "cliente", from: ["entregue"], to: "ajustes", msg: m => `Pedido de ajustes na etapa "${m.title}".` },
};
const MS_SELECT = "SELECT ms.*, c.client_id, c.freela_id, c.job_id, c.id cid FROM milestones ms JOIN contracts c ON c.id = ms.contract_id WHERE ms.id = ?";

// ABRIR O COFRE: quando a etapa é aprovada, pedimos ao Asaas para liberar o dinheiro guardado
// (escrow) para o freela. Tentamos com a chave da Osmo e, se precisar, com a do freela.
// libera a garantia (Conta Escrow) no Asaas; sem garantia ativa, não há o que liberar
async function releaseEscrow(m: AppRow) {
  if (!asaas.ENABLED || m.pay_status !== "pago" || !m.pay_id) return;
  const acc = one("SELECT api_key_enc FROM payout_accounts WHERE user_id = ?", m.freela_id);
  const keys: (string | undefined)[] = [undefined]; if (acc) { try { keys.push(asaas.open(acc.api_key_enc)); } catch {} }
  let lastErr: unknown = null;
  for (const k of keys) {
    try {
      const e = await asaas.api.getPaymentEscrow(m.pay_id, k);
      const id = e && (e.id || (e.data && e.data[0] && e.data[0].id));
      if (e.status === "DONE" || e.status === "FINISHED") return;
      if (!id) throw new HttpError(502, "Garantia da cobrança não encontrada no Asaas.");
      await asaas.api.finishEscrow(id, k);
      return;
    } catch (err) { lastErr = err; }
  }
  if (lastErr) throw new HttpError(502, "Não foi possível liberar o valor no Asaas: " + errorMessage(lastErr));
}

// MOVER A ETAPA DE CASINHA: grava a casinha nova, marca a data de entrega, marca o dinheiro
// como liberado, escreve na conversa e, se TODAS as etapas estiverem aprovadas, conclui o
// contrato e a vaga.
function applyMilestone(m: AppRow, f: MilestoneFlow, actorId: number | null, note: string, extraMsg = "") {
  tx(() => {
    run("UPDATE milestones SET status = ?, updated_at = datetime('now') WHERE id = ?", f.to, m.id);
    if (f.to === "entregue") run("UPDATE milestones SET delivered_at = datetime('now') WHERE id = ?", m.id);
    if (f.to === "aprovada" && asaas.ENABLED && m.pay_status === "pago") run("UPDATE milestones SET pay_status = 'liberado' WHERE id = ?", m.id);
    const th = threadFor(m.job_id, m.client_id, m.freela_id);
    postMessage(th, null, f.msg(m) + (extraMsg || ""), actorId);
    if (note) postMessage(th, actorId, note);
    const left = one("SELECT COUNT(*) n FROM milestones WHERE contract_id = ? AND status != 'aprovada'", m.cid)!.n;
    if (left === 0) { run("UPDATE contracts SET status = 'concluido' WHERE id = ?", m.cid); run("UPDATE jobs SET status = 'concluida' WHERE id = ?", m.job_id); postMessage(th, null, "Todas as etapas aprovadas. Contrato concluído.", actorId); }
  });
}

// Cria uma rota para cada jogada (start, deliver, approve, changes) a partir das regras acima.
// Antes de mexer, confere: é a pessoa certa? a etapa está numa casinha de onde pode sair?
// REGRA DE OURO: com pagamentos ligados, o freela só pode COMEÇAR depois que o cliente pagou
// aquela etapa (o dinheiro já está guardado no cofre).
for (const [action, f] of Object.entries(MS_FLOW)) {
  route("POST", `/api/milestones/:id/${action}`, async ({ user, params, body }) => {
    const m = one(MS_SELECT, params.id);
    if (!m || (f.who === "freela" ? m.freela_id : m.client_id) !== user.id) fail(404, "Etapa não encontrada.");
    if (stripe.SELECTED && action !== "approve" && one("SELECT 1 FROM stripe_payments WHERE milestone_id=? AND release_started>0", m.id)) fail(409, "Repasse em processamento. Aguarde a conclusão ou conciliação.");
    if (!f.from.includes(m.status)) fail(409, "Essa ação não vale para o estado atual da etapa.");
    if (action === "start" && PAYMENTS && m.pay_status !== "pago") fail(409, "Espere a confirmação do pagamento desta etapa antes de começar.");
    if (action === "approve") {
      if (stripe.SELECTED) await stripe.release(m.id); else await releaseEscrow(m);
    }
    applyMilestone(m, f, user.id, str(body && body.note, 1000));
    return { ok: true };
  });
}

// LIBERAÇÃO AUTOMÁTICA: de hora em hora, procuramos etapas entregues há mais de 7 dias sem
// resposta do cliente e aprovamos sozinhos, liberando o dinheiro. Assim o freela nunca fica
// sem receber porque o cliente sumiu.
// liberação automática: etapa entregue sem resposta do cliente
async function autoRelease() {
  if (stripe.SELECTED) return;
  const due = all(`SELECT id FROM milestones WHERE status = 'entregue' AND delivered_at != '' AND delivered_at < datetime('now', ?)`, `-${asaas.AUTO_RELEASE_DAYS} days`);
  for (const { id } of due) {
    const m = one(MS_SELECT, id)!;
    try { await releaseEscrow(m); applyMilestone(m, MS_FLOW.approve, null, "", ` Liberação automática: ${asaas.AUTO_RELEASE_DAYS} dias sem resposta do cliente.`); }
    catch (e) { console.error("auto-release", id, errorMessage(e)); }
  }
}
setInterval(() => autoRelease().catch(e => console.error("auto-release", e)), 3600_000).unref();

// ATIVAR CONTA DE RECEBIMENTO (freela): confere CPF/CNPJ, CEP, celular, data de nascimento e
// endereço, cria a subconta no Asaas e liga o cofre (escrow). A chave da subconta é guardada
// trancada (asaas.seal).
route("POST", "/api/webhooks/stripe", async ({req, body}) => {
  const out = await stripe.webhook(Buffer.isBuffer(body) ? body : Buffer.from(""), header(req, "stripe-signature"));
  if (out?.milestoneId && out.status) {
    const m = one(MS_SELECT, out.milestoneId);
    if (m) {
      const th = threadFor(m.job_id, m.client_id, m.freela_id);
      if (out.status === "pago") postMessage(th, null, `Pagamento da etapa "${m.title}" confirmado via Stripe. O trabalho pode começar.`);
      else if (out.status === "estornado") postMessage(th, null, `O pagamento da etapa "${m.title}" foi estornado ou contestado na Stripe.`);
    }
  }
  return {received: true};
}, {auth: false, raw: 200_000});

route("POST", "/api/me/payout/sync", async ({ user }) => {
  if (!stripe.SELECTED) fail(400, "Rota exclusiva para Stripe.");
  return { payout: await stripe.syncAccount(user.id) };
}, { role: "freela" });

// --- pagamentos (Asaas)
route("POST", "/api/me/payout", async ({ user, body }) => {
  if (stripe.SELECTED) return stripe.onboarding(user.id, PUBLIC_URL);
  if (!asaas.ENABLED) fail(503, "Pagamentos ainda não estão ativos na plataforma.");
  const existing = one("SELECT * FROM payout_accounts WHERE user_id = ?", user.id);
  if (existing?.escrow) fail(409, "Sua conta de recebimento já está ativa.");
  // Retry the same subaccount after a failure; its one-time API key is already encrypted.
  if (existing) {
    try { await asaas.api.enableEscrow(String(existing.asaas_account_id), Math.max(30, asaas.AUTO_RELEASE_DAYS * 6)); }
    catch { fail(502, "Não foi possível ativar a garantia no Asaas. Os recebimentos continuam bloqueados. Tente novamente."); }
    run("UPDATE payout_accounts SET escrow = 1 WHERE user_id = ?", user.id);
    return { ok: true, escrow: true };
  }
  try { asaas.assertEncryptionConfigured(); }
  catch { fail(503, "Configure APP_SECRET com pelo menos 24 caracteres antes de ativar recebimentos."); }
  const doc = String(body.cpfCnpj || "").replace(/\D/g, "");
  if (!validDoc(doc)) fail(400, "CPF ou CNPJ inválido. Confira os números.");
  const cep = String(body.postalCode || "").replace(/\D/g, ""), phone = String(body.mobilePhone || "").replace(/\D/g, "");
  if (cep.length !== 8) fail(400, "Informe o CEP com 8 números.");
  if (phone.length < 10) fail(400, "Informe o celular com DDD.");
  const email = one("SELECT email FROM users WHERE id = ?", user.id)!.email;
  const payload: asaas.SubaccountRequest = {
    name: str(body.name, 120) || user.name, email, cpfCnpj: doc, mobilePhone: phone, incomeValue: int(body.incomeValue, 1, 100_000_000),
    address: str(body.address, 120), addressNumber: str(body.addressNumber, 20), complement: str(body.complement, 60), province: str(body.province, 80), postalCode: cep,
  };
  if (doc.length === 11) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.birthDate || ""))) fail(400, "Informe a data de nascimento."); payload.birthDate = body.birthDate as string; }
  else payload.companyType = isOneOf(body.companyType, ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"]) ? body.companyType : "MEI";
  if (!payload.address || !payload.addressNumber || !payload.province) fail(400, "Complete o endereço: rua, número e bairro.");
  let acc;
  try { acc = await asaas.api.createSubaccount(payload); } catch (e) { fail(errorStatus(e) === 400 ? 400 : 502, errorMessage(e)); }
  if (!acc.id || !acc.walletId || !acc.apiKey) fail(502, "O Asaas não devolveu os dados da conta. Tente de novo.");
  // Preserve the one-time key before requesting escrow, so a failed activation can be retried.
  run("INSERT INTO payout_accounts (user_id, asaas_account_id, wallet_id, api_key_enc, escrow) VALUES (?,?,?,?,0)", user.id, acc.id, acc.walletId, asaas.seal(acc.apiKey));
  run("UPDATE profiles SET cpf_cnpj = ? WHERE user_id = ?", doc, user.id);
  try { await asaas.api.enableEscrow(acc.id, Math.max(30, asaas.AUTO_RELEASE_DAYS * 6)); }
  catch { fail(502, "Não foi possível ativar a garantia no Asaas. Os recebimentos continuam bloqueados. Tente novamente."); }
  run("UPDATE payout_accounts SET escrow = 1 WHERE user_id = ?", user.id);
  return { ok: true, escrow: true };
}, { role: "freela" });

// PAGAR UMA ETAPA (cliente):
// 1. confere se a etapa é dele e ainda não foi paga (se já tem cobrança aberta, devolve o link);
// 2. o freela precisa ter conta de recebimento e o cliente precisa ter CPF/CNPJ;
// 3. cadastra o cliente no Asaas (só na primeira vez);
// 4. cria a cobrança com vencimento em 3 dias e o SPLIT: 90% para o freela, 10% para a Osmo;
// 5. devolve o link da fatura, onde o cliente escolhe Pix, boleto ou cartão.
route("POST", "/api/milestones/:id/pay", async ({ user, params }) => {
  if (stripe.SELECTED) {
    const m = one(MS_SELECT, params.id);
    if (!m || m.client_id !== user.id) fail(404, "Etapa não encontrada.");
    if (m.status !== "pendente" || !["a_pagar", "aguardando"].includes(m.pay_status)) fail(409, "Etapa indisponível para cobrança.");
    const wasUnpaid = m.pay_status === "a_pagar";
    const out = await stripe.checkout(m.id, m.freela_id, m.value, m.title, PUBLIC_URL);
    if (wasUnpaid) postMessage(threadFor(m.job_id, m.client_id, m.freela_id), null, `Cobrança da etapa "${m.title}" gerada na Stripe (${brl(m.value)}).`, user.id);
    return out;
  }
  if (!asaas.ENABLED) fail(503, "Pagamentos ainda não estão ativos na plataforma.");
  const m = one(MS_SELECT, params.id);
  if (!m || m.client_id !== user.id) fail(404, "Etapa não encontrada.");
  const acc = one("SELECT wallet_id, escrow FROM payout_accounts WHERE user_id = ?", m.freela_id);
  if (!acc) fail(409, "O freelancer ainda não ativou a conta de recebimento. Avisamos na conversa.");
  if (!acc.escrow) fail(409, "A garantia da conta do freelancer ainda não foi ativada. A cobrança está bloqueada.");
  if (m.pay_status === "aguardando" && m.invoice_url) return { invoiceUrl: m.invoice_url };
  if (m.pay_status !== "a_pagar") fail(409, "Esta etapa já foi paga.");
  const pr = one("SELECT cpf_cnpj, asaas_customer_id, company FROM profiles WHERE user_id = ?", user.id)!;
  if (!pr.cpf_cnpj) fail(400, "Informe seu CPF ou CNPJ em Meu perfil para gerar a cobrança.");
  let customer = pr.asaas_customer_id;
  if (!customer) {
    const u = one("SELECT name, email FROM users WHERE id = ?", user.id)!;
    try { customer = (await asaas.api.createCustomer({ name: pr.company || u.name, email: u.email, cpfCnpj: pr.cpf_cnpj, externalReference: "user:" + user.id, notificationDisabled: false })).id; }
    catch (e) { fail(errorStatus(e) === 400 ? 400 : 502, errorMessage(e)); }
    run("UPDATE profiles SET asaas_customer_id = ? WHERE user_id = ?", customer, user.id);
  }
  const job = one("SELECT title FROM jobs WHERE id = ?", m.job_id)!;
  let pay;
  try {
    pay = await asaas.api.createPayment({
      customer, billingType: "UNDEFINED", value: m.value, dueDate: dateBR(3),
      description: `Osmo Talents · ${job.title} · etapa: ${m.title}`.slice(0, 500), externalReference: "ms:" + m.id,
      split: [{ walletId: acc.wallet_id, percentualValue: 100 - asaas.FEE_PCT }],
    });
  } catch (e) { fail(errorStatus(e) === 400 ? 400 : 502, errorMessage(e)); }
  run("UPDATE milestones SET pay_id = ?, invoice_url = ?, pay_status = 'aguardando' WHERE id = ?", pay.id, pay.invoiceUrl || "", m.id);
  postMessage(threadFor(m.job_id, m.client_id, m.freela_id), null, `Cobrança da etapa "${m.title}" gerada (${brl(m.value)}). O valor fica protegido até a aprovação.`, user.id);
  return { invoiceUrl: pay.invoiceUrl };
}, { role: "cliente" });

// AVISOS DO ASAAS (webhook): quando algo acontece com uma cobrança, o Asaas "toca a campainha"
// neste endereço. Por segurança:
// - conferimos a senha do aviso;
// - ignoramos avisos repetidos (cada aviso tem um id que anotamos);
// - NÃO acreditamos só no aviso: perguntamos ao Asaas como a cobrança está de verdade.
// Pago => etapa "paga" e o freela pode começar. Estornado => avisa. Cobrança apagada => volta a "a pagar".
const PAID = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];
route("POST", "/api/webhooks/asaas", async ({ req, body }) => {
  if (!asaas.checkWebhookToken(req.headers["asaas-access-token"])) fail(401, "Token inválido.");
  const evId = str(body.id, 120) || null, ev = str(body.event, 60);
  if (evId) { if (one("SELECT 1 FROM webhook_events WHERE id = ?", evId)) return { received: true }; }
  const payId = body.payment ? str(record(body.payment).id, 80) : "";
  if (payId && ev.startsWith("PAYMENT_")) {
    const m = one("SELECT ms.*, c.client_id, c.freela_id, c.job_id, c.id cid FROM milestones ms JOIN contracts c ON c.id = ms.contract_id WHERE ms.pay_id = ?", payId);
    if (m) {
      const p = await asaas.api.getPayment(payId); // confirma o estado direto no Asaas, sem confiar só no aviso
      const th = threadFor(m.job_id, m.client_id, m.freela_id);
      if (PAID.includes(p.status) && m.pay_status === "aguardando") {
        run("UPDATE milestones SET pay_status = 'pago' WHERE id = ?", m.id);
        postMessage(th, null, `Pagamento da etapa "${m.title}" confirmado. O valor está protegido e o trabalho pode começar.`);
      } else if (/REFUND/.test(p.status) && m.pay_status !== "estornado") {
        run("UPDATE milestones SET pay_status = 'estornado' WHERE id = ?", m.id);
        postMessage(th, null, `O pagamento da etapa "${m.title}" foi estornado.`);
      } else if ((p.deleted || ev === "PAYMENT_DELETED") && m.pay_status === "aguardando") {
        run("UPDATE milestones SET pay_status = 'a_pagar', pay_id = '', invoice_url = '' WHERE id = ?", m.id);
      }
    }
  }
  if (evId) run("INSERT OR IGNORE INTO webhook_events (id, event) VALUES (?,?)", evId, ev);
  return { received: true };
}, { auth: false });

// AVALIAR (no fim do contrato): só depois que todas as etapas foram aprovadas, uma vez por
// pessoa, nota de 1 a 5 e só as "etiquetas" permitidas para aquele lado. Se os dois já
// avaliaram, as duas notas aparecem nos perfis; senão, a primeira espera (até 14 dias).
// --- avaliações
route("POST", "/api/contracts/:id/review", ({ user, params, body }) => {
  const c = one("SELECT * FROM contracts WHERE id = ? AND (client_id = ? OR freela_id = ?)", params.id, user.id, user.id);
  if (!c) fail(404, "Contrato não encontrado.");
  if (c.status !== "concluido") fail(409, "Dá para avaliar quando todas as etapas forem aprovadas.");
  if (one("SELECT 1 FROM reviews WHERE contract_id = ? AND author_id = ?", c.id, user.id)) fail(409, "Você já avaliou este contrato.");
  const rating = int(body.rating, 0, 5);
  if (rating < 1) fail(400, "Escolha uma nota de 1 a 5.");
  const targetId = c.freela_id === user.id ? c.client_id : c.freela_id;
  const allowed = REVIEW_TAGS[c.freela_id === user.id ? "cliente" : "freela"];
  const tags = (Array.isArray(body.tags) ? body.tags : []).filter(t => allowed.includes(t));
  tx(() => {
    run("INSERT INTO reviews (contract_id, author_id, target_id, rating, tags, comment) VALUES (?,?,?,?,?,?)",
      c.id, user.id, targetId, rating, JSON.stringify([...new Set(tags)]), str(body.comment, 600));
    const both = one("SELECT COUNT(*) n FROM reviews WHERE contract_id = ?", c.id)!.n === 2;
    postMessage(threadFor(c.job_id, c.client_id, c.freela_id), null, both
      ? `${user.name} avaliou o contrato. As duas avaliações já estão publicadas nos perfis.`
      : `${user.name} avaliou o contrato. A avaliação fica guardada até você avaliar também (pelo Painel), ou por 14 dias.`, user.id);
  });
  return { ok: true };
});

// CONVERSAS:
// - GET /api/threads: a caixa de entrada (com quem, sobre qual vaga, última mensagem e
//   quantas não lidas);
// - threadAccess garante que só os dois participantes enxergam a conversa;
// - abrir a conversa marca como lida; mandar mensagem tem freio (60 por minuto);
// - "pin" é o "Combinado até agora": um resumo fixado no topo da conversa;
// - POST /api/threads abre uma conversa direta (sem vaga) entre um cliente e um freela.
// --- mensagens
route("GET", "/api/threads", ({ user }) => {
  const rows = all(`SELECT t.*, j.title job_title, uc.name client_name, uf.name freela_name,
      (SELECT v FROM avatars WHERE user_id = CASE WHEN t.client_id = ? THEN t.freela_id ELSE t.client_id END) with_v,
      (SELECT 1 FROM verifications WHERE user_id = t.freela_id) freela_verified,
      (SELECT body FROM messages WHERE thread_id = t.id ORDER BY id DESC LIMIT 1) last,
      (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id AND (m.sender_id IS NULL OR m.sender_id != ?)
         AND m.created_at > CASE WHEN t.client_id = ? THEN t.client_read_at ELSE t.freela_read_at END) unread
    FROM threads t LEFT JOIN jobs j ON j.id = t.job_id JOIN users uc ON uc.id = t.client_id JOIN users uf ON uf.id = t.freela_id
    WHERE t.client_id = ? OR t.freela_id = ? ORDER BY t.updated_at DESC`, user.id, user.id, user.id, user.id, user.id);
  return { threads: rows.map(t => ({ id: t.id, support: t.kind === "suporte",
    job: t.kind === "suporte" ? "Suporte Osmo" : t.job_title || "Conversa direta",
    with: t.kind === "suporte" && t.client_id === user.id ? SUPPORT_NAME : t.client_id === user.id ? t.freela_name : t.client_name,
    withId: t.client_id === user.id ? t.freela_id : t.client_id, withAvatar: t.kind === "suporte" && t.client_id === user.id ? "" : avatarUrl(t.client_id === user.id ? t.freela_id : t.client_id, t.with_v),
    withVerified: t.client_id === user.id && !!t.freela_verified, last: t.last || "", unread: t.unread, updated_at: t.updated_at })) };
});

function threadAccess(user: SessionUser, id: number) {
  const t = one("SELECT * FROM threads WHERE id = ?", id);
  if (!t || (t.client_id !== user.id && t.freela_id !== user.id)) fail(404, "Conversa não encontrada.");
  return t;
}
route("GET", "/api/threads/:id", ({ user, params }) => {
  const t = threadAccess(user, params.id);
  run(`UPDATE threads SET ${t.client_id === user.id ? "client_read_at" : "freela_read_at"} = datetime('now') WHERE id = ?`, t.id);
  const other = profileOf(t.client_id === user.id ? t.freela_id : t.client_id);
  const job = t.job_id ? one("SELECT id, title FROM jobs WHERE id = ?", t.job_id) : null;
  const msgs = all(`SELECT m.id, m.sender_id, m.body, m.created_at, a.id file_id, a.name file_name, a.ext file_ext, a.size file_size
      FROM messages m LEFT JOIN attachments a ON a.message_id = m.id WHERE m.thread_id = ? ORDER BY m.id LIMIT 500`, t.id)
    .map(({ file_id, file_name, file_ext, file_size, ...m }) => ({ ...m, mine: m.sender_id === user.id, system: m.sender_id === null,
      file: file_id ? { id: file_id, name: file_name, ext: file_ext, size: file_size } : null }));
  const support = t.kind === "suporte", withOut = other && { ...other, role: t.client_id === user.id ? "freela" : "cliente" };
  // no suporte, o cliente vê "Equipe Osmo" (e não a conta pessoal do admin)
  if (support && withOut && t.client_id === user.id) Object.assign(withOut, { name: SUPPORT_NAME, role: "suporte", verified: "", how: null });
  return { thread: { id: t.id, pin: t.pin, job, support, with: withOut }, messages: msgs };
});
route("POST", "/api/threads/:id/messages", ({ user, params, body, ip }) => {
  limit("msg:" + user.id, 60, 60_000);
  const t = threadAccess(user, params.id);
  const text = str(body.body, 3000);
  if (!text) fail(400, "A mensagem está vazia.");
  postMessage(t.id, user.id, text);
  run(`UPDATE threads SET ${t.client_id === user.id ? "client_read_at" : "freela_read_at"} = datetime('now') WHERE id = ?`, t.id);
  if (t.kind === "suporte") supportNotify(t, user, text);
  return { ok: true };
});
route("PUT", "/api/threads/:id/pin", ({ user, params, body }) => {
  const t = threadAccess(user, params.id);
  if (t.kind === "suporte") fail(409, "Conversas com o suporte não têm resumo do combinado.");
  run("UPDATE threads SET pin = ? WHERE id = ?", str(body.pin, 600), t.id);
  postMessage(t.id, null, `${user.name} atualizou o resumo do combinado.`, user.id);
  return { ok: true };
});
route("POST", "/api/threads", ({ user, body }) => {
  const other = one("SELECT id, role, roles FROM users WHERE id = ?", int(body.withId));
  if (!other || other.id === user.id) fail(400, "Escolha outra pessoa para conversar.");
  const jobId = body.jobId ? int(body.jobId) : null;
  if (jobId) {
    const j = one("SELECT id, client_id FROM jobs WHERE id = ?", jobId);
    if (!j || (j.client_id !== user.id && j.client_id !== other.id)) fail(400, "Conversas sobre uma vaga são entre quem publicou e quem trabalha.");
    const freelaId = j.client_id === user.id ? other.id : user.id;
    return { thread: threadFor(j.id, j.client_id, freelaId) };
  }
  const existing = one<{id: number}>("SELECT id FROM threads WHERE job_id IS NULL AND kind = '' AND ((client_id = ? AND freela_id = ?) OR (client_id = ? AND freela_id = ?))", user.id, other.id, other.id, user.id);
  if (existing) return { thread: existing.id };
  const [cId, fId] = user.role === "cliente" ? [user.id, other.id] : other.role === "cliente" ? [other.id, user.id] : [user.id, other.id];
  return { thread: threadFor(null, cId, fId) };
});

// SUPORTE OSMO: conversa entre o admin (a Osmo) e um contratante (cliente). Usa o mesmo sistema de
// conversas: aparece na caixa de entrada dos dois, com bolinha de não lidas, anexos etc.
// A diferença está nos avisos: cada mensagem do suporte vai NA HORA por notificação (push) e com uma
// CÓPIA por e-mail para o outro lado (sem esperar os 2 minutos do carteiro paciente lá embaixo).
// - POST /api/support: o cliente abre (ou reabre) a conversa dele com a Osmo;
// - POST /api/admin/support/:id: o admin abre a conversa com um cliente específico.
const SUPPORT_NAME = "Equipe Osmo";
const adminAccount = () => one("SELECT id, name, email FROM users WHERE lower(email) = ?", ADMIN_EMAIL);
function supportThread(clientId: number) {
  const adm = adminAccount();
  if (!adm) fail(503, "O suporte ainda não está disponível. Tente de novo mais tarde.");
  if (adm.id === clientId) fail(400, "Essa conta é a do próprio suporte.");
  let t = one<{id: number}>("SELECT id FROM threads WHERE kind = 'suporte' AND client_id = ?", clientId);
  if (!t) t = { id: Number(run("INSERT INTO threads (job_id, client_id, freela_id, kind) VALUES (NULL,?,?,'suporte')", clientId, adm.id).lastInsertRowid) };
  return t.id;
}
route("POST", "/api/support", ({ user }) => {
  if (isAdmin(user)) fail(400, "Você é o suporte: abra a conversa pela lista de pessoas na área do admin.");
  if (!rolesOf(user).includes("cliente")) fail(403, "O canal com a Osmo é para quem contrata.");
  return { thread: supportThread(user.id) };
});
route("POST", "/api/admin/support/:id", ({ user, params }) => {
  if (!isAdmin(user)) fail(404, "Rota não encontrada.");
  const other = one("SELECT id, role, roles FROM users WHERE id = ?", int(params.id));
  if (!other) fail(404, "Pessoa não encontrada.");
  if (!rolesOf(other).includes("cliente")) fail(400, "Essa pessoa não é contratante (cliente).");
  return { thread: supportThread(other.id) };
});
// Aviso imediato de uma mensagem do suporte: push nos aparelhos do outro lado + cópia por e-mail.
// O e-mail sai sempre (é a cópia da conversa); o push só se a pessoa ligou em algum aparelho.
// Roda "por fora" (sem await): a mensagem já foi gravada, e um e-mail lento não segura a resposta.
function supportNotify(t: AppRow, sender: SessionUser, text: string) {
  const toId = t.client_id === sender.id ? t.freela_id : t.client_id;
  const to = one("SELECT id, name, email, lang FROM users WHERE id = ?", toId);
  if (!to) return;
  const fromAdmin = t.freela_id === sender.id;
  const T = (k: string, ...a: unknown[]) => i18n.T(to.lang, k, ...a);
  const who = fromAdmin ? SUPPORT_NAME : sender.name;
  const subject = fromAdmin ? T("Nova mensagem da Equipe Osmo") : T("{1} mandou mensagem ao suporte", sender.name);
  const link = `${PUBLIC_URL}/mensagens/${t.id}`;
  if (push.ENABLED) {
    const subs = all("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", to.id);
    if (subs.length) pushTo(subs, { title: subject, body: `${who}: ${text.length > 120 ? text.slice(0, 120) + "…" : text}`, url: `/mensagens/${t.id}`, tag: `thread-${t.id}`, badge: unreadCount(to.id) })
      .catch(e => console.error(new Date().toISOString(), "push suporte", e.message));
  }
  if (!mail.ENABLED) return;
  const first = to.name.split(" ")[0];
  const reply = T("Para responder, abra a conversa (responder este e-mail não chega até nós):");
  const text2 = `${T("Olá, {1}.", first)}\n\n${who}:\n${text}\n\n${reply}\n${link}\n\n--\nOsmo Talents · ${T("Cópia de uma mensagem do suporte.")}`;
  const html = mail.renderEmailTemplate({
    eyebrow: "Suporte Osmo",
    title: subject,
    greeting: T("Olá, {1}.", first),
    items: [{ sender: who, body: text, system: false }],
    ctaLabel: T("Abrir conversa"),
    ctaUrl: link,
    outro: reply,
    footerNote: T("Cópia de uma mensagem do suporte."),
    publicUrl: PUBLIC_URL,
  });
  mail.send({ to: to.email, subject, text: text2, html }).catch(e => console.error(new Date().toISOString(), "e-mail suporte", e.message));
}

// PAINEL DO DONO (panorama da plataforma): só UMA pessoa em todo o site é administradora, e ela está fixada
// aqui no código — não vem do .env, então ninguém ganha acesso editando variáveis no servidor. O antigo
// ADMIN_EMAILS é ignorado. Para todo mundo, inclusive quem está logado, as rotas de admin respondem "não encontrada".
// Junta numa resposta só os números gerais, a evolução das últimas 12 semanas, o funil de contratação,
// o dinheiro que passou pela plataforma, os pontos que precisam de atenção e as últimas novidades.
const ADMIN_EMAIL = "matias@osmo.com.br";
const ADMINS = [ADMIN_EMAIL];
if (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL) console.warn(`[admin] ADMIN_EMAILS/ADMIN_EMAIL no .env é ignorado: o único administrador é ${ADMIN_EMAIL}.`);
const isAdmin = (user: SessionUser | null) => !!user && String(user.email || "").trim().toLowerCase() === ADMIN_EMAIL;
route("GET", "/api/admin/overview", ({ user }) => {
  if (!isAdmin(user)) fail(404, "Rota não encontrada.");
  const count = (sql: string, ...p: SQLInputValue[]) => one<{n:number}>(sql, ...p)!.n;
  const byKey = (sql: string, ...p: SQLInputValue[]) => Object.fromEntries(all(sql, ...p).map(r => [r.k, r.n]));
  // semana começa na segunda: "weekday 0" leva ao domingo seguinte (ou fica, se já é domingo) e voltamos 6 dias
  const weekly = (table: string, extra = "") => byKey(`SELECT date(created_at, 'weekday 0', '-6 days') k, COUNT(*) n FROM ${table}
    WHERE created_at >= date('now', '-84 days') ${extra} GROUP BY k`);
  const weeks = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - (11 - i) * 7); return d.toISOString().slice(0, 10); });
  const [wUsers, wJobs, wContracts] = [weekly("users"), weekly("jobs"), weekly("contracts")];
  const wMoney = byKey(`SELECT date(created_at, 'weekday 0', '-6 days') k, SUM(value) n FROM contracts WHERE created_at >= date('now', '-84 days') GROUP BY k`);

  // dinheiro: com pagamentos ligados vale o que o Asaas confirmou; sem eles, etapa aprovada conta como paga (simulação)
  const ms = all("SELECT status, pay_status, value FROM milestones");
  const sum = (f: (milestone: AppRow) => boolean) => ms.filter(f).reduce((a, m) => a + m.value, 0);
  const released = PAYMENTS ? sum(m => m.pay_status === "liberado") : sum(m => m.status === "aprovada");
  const held = PAYMENTS ? sum(m => m.pay_status === "pago") : sum(m => m.status !== "aprovada");
  const toPay = PAYMENTS ? sum(m => ["a_pagar", "aguardando"].includes(m.pay_status)) : 0;

  const jobsTotal = count("SELECT COUNT(*) n FROM jobs");
  return {
    generatedAt: new Date().toISOString(),
    config: { payments: PAYMENTS, fee: FEE * 100, autoRelease: stripe.SELECTED ? 0 : asaas.AUTO_RELEASE_DAYS, mail: mail.ENABLED, oauth: oauth.list(), version: appVersion() },
    people: {
      freelas: count(`SELECT COUNT(*) n FROM users u WHERE ${HAS("freela")}`), clientes: count(`SELECT COUNT(*) n FROM users u WHERE ${HAS("cliente")}`),
      both: count(`SELECT COUNT(*) n FROM users u WHERE ${HAS("freela")} AND ${HAS("cliente")}`),
      new7: count("SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now', '-7 days')"),
      new30: count("SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now', '-30 days')"),
      active7: count("SELECT COUNT(DISTINCT sender_id) n FROM messages WHERE sender_id IS NOT NULL AND created_at >= datetime('now', '-7 days')"),
      verified: count("SELECT COUNT(*) n FROM verifications"),
      withPayout: count(stripe.SELECTED ? "SELECT COUNT(*) n FROM stripe_accounts" : "SELECT COUNT(*) n FROM payout_accounts"),
      profilesReady: count(`SELECT COUNT(*) n FROM users u JOIN profiles p ON p.user_id = u.id WHERE ${HAS("freela")} AND p.title != '' AND p.skills NOT IN ('', '[]') AND p.bio != ''`),
    },
    jobs: { byStatus: byKey("SELECT status k, COUNT(*) n FROM jobs GROUP BY status"), total: jobsTotal,
      avgClarity: Math.round(one("SELECT AVG(clarity) n FROM jobs")!.n || 0),
      byCat: byKey("SELECT cat k, COUNT(*) n FROM jobs GROUP BY cat") },
    proposals: { byStatus: byKey("SELECT status k, COUNT(*) n FROM proposals GROUP BY status"),
      perJob: jobsTotal ? Math.round(count("SELECT COUNT(*) n FROM proposals") / jobsTotal * 10) / 10 : 0 },
    // funil: de todas as vagas publicadas, quantas receberam proposta, viraram contrato e foram concluídas
    funnel: { published: jobsTotal, withProposal: count("SELECT COUNT(DISTINCT job_id) n FROM proposals"),
      hired: count("SELECT COUNT(DISTINCT job_id) n FROM contracts"), done: count("SELECT COUNT(*) n FROM contracts WHERE status = 'concluido'") },
    money: { contracted: one("SELECT COALESCE(SUM(value), 0) n FROM contracts")!.n, released, held, toPay, feeEarned: Math.round(released * FEE),
      contracts: byKey("SELECT status k, COUNT(*) n FROM contracts GROUP BY status"),
      milestones: byKey("SELECT status k, COUNT(*) n FROM milestones GROUP BY status") },
    talk: { messages7: count("SELECT COUNT(*) n FROM messages WHERE sender_id IS NOT NULL AND created_at >= datetime('now', '-7 days')"),
      threads7: count("SELECT COUNT(*) n FROM threads WHERE updated_at >= datetime('now', '-7 days')"),
      reviews: one("SELECT COUNT(*) n, ROUND(AVG(rating), 1) avg FROM reviews") },
    // tarefas (estilo Asana): quantas abertas, concluídas e atrasadas, somando todos os projetos
    tasks: { open: count("SELECT COUNT(*) n FROM tasks WHERE done = 0"), done: count("SELECT COUNT(*) n FROM tasks WHERE done = 1"),
      late: count("SELECT COUNT(*) n FROM tasks WHERE done = 0 AND due_date != '' AND due_date < date('now', '-3 hours')"),
      projects: count("SELECT COUNT(*) n FROM projects") },
    weekly: weeks.map(w => ({ week: w, users: wUsers[w] || 0, jobs: wJobs[w] || 0, contracts: wContracts[w] || 0, value: wMoney[w] || 0 })),
    // o que precisa de alguém olhando: coisas paradas há mais tempo do que deveriam
    attention: {
      deliveredWaiting: all(`SELECT ms.id, ms.title, ms.value, ms.delivered_at at, j.title job, uc.name client, uf.name freela FROM milestones ms
        JOIN contracts c ON c.id = ms.contract_id JOIN jobs j ON j.id = c.job_id JOIN users uc ON uc.id = c.client_id JOIN users uf ON uf.id = c.freela_id
        WHERE ms.status = 'entregue' AND ms.delivered_at != '' AND ms.delivered_at < datetime('now', '-3 days') ORDER BY ms.delivered_at LIMIT 20`),
      proposalsWaiting: all(`SELECT pr.id, pr.value, pr.created_at at, j.id job_id, j.title job, u.name freela FROM proposals pr
        JOIN jobs j ON j.id = pr.job_id JOIN users u ON u.id = pr.freela_id
        WHERE pr.status = 'enviada' AND pr.created_at < datetime('now', '-7 days') ORDER BY pr.created_at LIMIT 20`),
      jobsNoProposal: all(`SELECT j.id, j.title, j.clarity, j.created_at at, u.name client FROM jobs j JOIN users u ON u.id = j.client_id
        WHERE j.status = 'aberta' AND j.created_at < datetime('now', '-7 days') AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.job_id = j.id)
        ORDER BY j.created_at LIMIT 20`),
      unpaid: PAYMENTS ? all(`SELECT ms.id, ms.title, ms.value, j.title job, uc.name client FROM milestones ms JOIN contracts c ON c.id = ms.contract_id
        JOIN jobs j ON j.id = c.job_id JOIN users uc ON uc.id = c.client_id WHERE ms.pay_status = 'aguardando' LIMIT 20`) : [],
    },
    recent: {
      users: all("SELECT u.id, u.name, u.email, u.role, u.created_at at, (SELECT 1 FROM verifications v WHERE v.user_id = u.id) verified FROM users u ORDER BY u.id DESC LIMIT 10"),
      jobs: all(`SELECT j.id, j.title, j.status, j.clarity, j.cat, j.created_at at, u.name client, (SELECT COUNT(*) FROM proposals p WHERE p.job_id = j.id) props
        FROM jobs j JOIN users u ON u.id = j.client_id ORDER BY j.id DESC LIMIT 10`),
      contracts: all(`SELECT c.id, c.value, c.status, c.created_at at, j.title job, uc.name client, uf.name freela,
        (SELECT COUNT(*) FROM milestones m WHERE m.contract_id = c.id AND m.status = 'aprovada') done, (SELECT COUNT(*) FROM milestones m WHERE m.contract_id = c.id) total
        FROM contracts c JOIN jobs j ON j.id = c.job_id JOIN users uc ON uc.id = c.client_id JOIN users uf ON uf.id = c.freela_id ORDER BY c.id DESC LIMIT 10`),
    },
  };
}, { auth: false }); // auth:false para quem não entrou também receber "não encontrada" (e não "entre na sua conta")

// GESTÃO PELO DONO (CRUD = criar, ler, editar e apagar): o dono (ADMIN_EMAIL, único) mexe direto nos registros da
// plataforma. Cada "entidade" abaixo diz qual tabela usa, quais campos podem ser vistos e editados, como
// listar e buscar, e o que precisa ser conferido antes de apagar. Tudo o que o dono faz vai para o admin_log.
// As conversas (mensagens) ficam de fora de propósito: são privadas entre cliente e freela (LGPD).
const needAdmin: (user: SessionUser | null) => asserts user is SessionUser = user => { if (!isAdmin(user)) fail(404, "Rota não encontrada."); };
const adminLog = (user: SessionUser, action: string, entity: string, id: number, detail: unknown) =>
  run("INSERT INTO admin_log (admin_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)", user.id, action, entity, id, JSON.stringify(detail || {}).slice(0, 4000));
const opt = (...pairs: [string, string][]) => pairs.map(([v, l]) => ({ v, l }));
const ST_JOB = opt(["aberta", "Aberta"], ["em_andamento", "Em andamento"], ["concluida", "Concluída"], ["fechada", "Fechada"]);
const ST_PROP = opt(["enviada", "Aguardando resposta"], ["aceita", "Escolhida"], ["recusada", "Não escolhida"], ["retirada", "Retirada"]);
const ST_MS = opt(["pendente", "A seguir"], ["andamento", "Em andamento"], ["entregue", "Entregue"], ["ajustes", "Ajustes pedidos"], ["aprovada", "Aprovada"]);
const ST_PAY = opt(["a_pagar", "A pagar"], ["aguardando", "Aguardando pagamento"], ["pago", "Pago (protegido)"], ["liberado", "Liberado"], ["estornado", "Estornado"]);
// dinheiro de verdade envolvido? (com Asaas ligado, etapa cobrada, paga ou liberada não pode sumir do banco)
const MONEY = "pay_status IN ('aguardando','pago','liberado')";
const moneyGuard = (where: string, ...p: SQLInputValue[]) => {
  if (PAYMENTS && one(`SELECT 1 FROM milestones WHERE ${MONEY} AND ${where}`, ...p))
    fail(409, "Tem etapa com cobrança gerada, paga ou liberada no Asaas. Resolva o pagamento (estorno) antes de apagar.");
};
// campos: k = nome, label = rótulo, type = text | textarea | email | int | select | bool | list,
// tbl = "profiles" quando o campo mora no perfil, json = guardado como lista em JSON, create = só ao criar
const ADMIN_ENT: Record<string, AdminEntity> = {
  users: {
    label: "Pessoas", table: "users", canCreate: true,
    fields: [
      { k: "name", label: "Nome", type: "text", max: 80, req: true, ph: "Nome e sobrenome" }, { k: "email", label: "E-mail", type: "email", req: true, ph: "pessoa@email.com" },
      { k: "role", label: "Perfil", type: "select", options: opt(["freela", "Freelancer"], ["cliente", "Cliente"]), req: true },
      { k: "energy", label: "Energia", type: "select", options: opt(["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]) },
      { k: "title", label: "O que faz", type: "text", max: 100, tbl: "profiles", ph: "Ex.: Designer de marca e embalagem" }, { k: "company", label: "Empresa", type: "text", max: 100, tbl: "profiles", ph: "Ex.: Padaria Trigal" },
      { k: "location", label: "Cidade", type: "text", max: 80, tbl: "profiles", ph: "Ex.: Recife, PE" },
      { k: "rate", label: "Valor por hora (R$)", type: "int", min: 0, max: 100000, tbl: "profiles", ph: "Ex.: 80" }, { k: "hours", label: "Horas por semana", type: "int", min: 1, max: 60, tbl: "profiles", ph: "De 1 a 60" },
      { k: "skills", label: "Habilidades (uma por linha)", type: "list", max: 12, len: 40, tbl: "profiles", json: true, ph: "Logotipo\nIdentidade visual\nFigma" },
      { k: "tag", label: "Identificação", type: "text", max: 80, tbl: "profiles", ph: "Ex.: TDAH · entregas curtas" }, { k: "bio", label: "Sobre", type: "textarea", max: 1200, tbl: "profiles", ph: "O que a pessoa faz, para quem e um trabalho de destaque" },
    ],
    list: (q, off) => all(`SELECT u.id, u.name, u.email, u.role, u.created_at, p.title, p.company FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE ? = '' OR u.name LIKE ? OR u.email LIKE ? OR p.title LIKE ? ORDER BY u.id DESC LIMIT 50 OFFSET ?`, q, `%${q}%`, `%${q}%`, `%${q}%`, off),
    cols: [["name", "Nome"], ["email", "E-mail"], ["role", "Perfil"], ["title", "O que faz"], ["created_at", "Desde"]],
    get: id => one("SELECT u.*, p.* , u.id id FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?", id),
    create: async (values, user) => {
      const v = values as unknown as AdminUserValues;
      if (one("SELECT 1 FROM users WHERE email = ?", v.email)) fail(409, "Já existe uma conta com esse e-mail.");
      const pass = crypto.randomBytes(9).toString("base64url");
      const passHash = await hashPasswordAsync(pass);
      const id = tx(() => { const uid = Number(run("INSERT INTO users (name, email, pass_hash, role) VALUES (?,?,?,?)", v.name, v.email, passHash, v.role).lastInsertRowid);
        run("INSERT INTO profiles (user_id) VALUES (?)", uid); return uid; });
      return { id, tempPassword: pass };
    },
    check: (v, id) => { if (v.email !== undefined && one("SELECT 1 FROM users WHERE email = ? AND id != ?", v.email as string, id || 0)) fail(409, "Esse e-mail já é de outra conta."); },
    beforeDelete: (id, user) => {
      if (id === user.id) fail(409, "Você não pode apagar a sua própria conta por aqui.");
      if (one("SELECT 1 FROM contracts WHERE client_id = ? OR freela_id = ?", id, id)) fail(409, "Essa pessoa tem contratos. Apague os contratos antes (ou mantenha a conta).");
    },
  },
  jobs: {
    label: "Vagas", table: "jobs", canCreate: true,
    fields: [
      { k: "client_id", label: "Id do cliente dono da vaga", type: "int", min: 1, req: true, create: true, ph: "Número que aparece na aba Pessoas" },
      { k: "title", label: "Título", type: "text", max: 120, req: true, ph: "Ex.: Identidade visual para cafeteria de bairro" }, { k: "cat", label: "Área", type: "select", options: () => CATS.map(c => ({ v: c, l: c })), req: true },
      { k: "status", label: "Situação", type: "select", options: ST_JOB }, { k: "obj", label: "Objetivo", type: "textarea", max: 1200, ph: "O que o cliente quer alcançar, em 1 ou 2 frases" },
      { k: "ent", label: "Entregas (uma por linha)", type: "list", max: 15, len: 200, json: true, ph: "Logotipo principal\nPaleta de cores" }, { k: "fora", label: "Fora do escopo (uma por linha)", type: "list", max: 10, len: 200, json: true, ph: "Não precisa de site" },
      { k: "com", label: "Comunicação", type: "text", max: 200, ph: "Ex.: Somente texto, pelo chat da plataforma." }, { k: "fb", label: "Feedback", type: "text", max: 300, ph: "Ex.: Duas rodadas de ajustes por escrito" }, { k: "ref", label: "Referências", type: "text", max: 500, ph: "Ex.: Painel de referências enviado após contratar" },
      { k: "budget_type", label: "Tipo de valor", type: "select", options: opt(["fixo", "Valor fixo"], ["hora", "Por hora"]) },
      { k: "budget", label: "Valor (R$)", type: "int", min: 0, max: 10_000_000, ph: "Ex.: 4200" }, { k: "duration", label: "Prazo", type: "text", max: 60, ph: "Ex.: 3 semanas" },
      { k: "skills", label: "Habilidades (uma por linha)", type: "list", max: 8, len: 40, json: true, ph: "Logotipo\nIdentidade visual" },
      { k: "is_async", label: "Sem reuniões obrigatórias", type: "bool" }, { k: "is_flex", label: "Prazo flexível", type: "bool" },
    ],
    list: (q, off) => all(`SELECT j.id, j.title, j.status, j.clarity, j.cat, j.created_at, u.name client FROM jobs j JOIN users u ON u.id = j.client_id
      WHERE ? = '' OR j.title LIKE ? OR u.name LIKE ? ORDER BY j.id DESC LIMIT 50 OFFSET ?`, q, `%${q}%`, `%${q}%`, off),
    cols: [["title", "Vaga"], ["client", "Cliente"], ["status", "Situação"], ["clarity", "Clareza %"], ["created_at", "Publicada"]],
    get: id => one("SELECT * FROM jobs WHERE id = ?", id),
    create: values => {
      const v = values as unknown as AdminJobValues;
      if (!one(`SELECT 1 FROM users u WHERE id = ? AND ${HAS("cliente")}`, v.client_id)) fail(400, "Esse id não é de uma conta de cliente.");
      const j = { title: v.title, cat: v.cat, obj: v.obj || "", ent: v.ent || [], fora: v.fora || [], com: v.com || "", fb: v.fb || "", budget: v.budget || 0, duration: v.duration || "" };
      const id = Number(run(`INSERT INTO jobs (client_id, title, cat, obj, ent, fora, com, fb, ref, budget_type, budget, duration, skills, is_async, is_flex, clarity, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, v.client_id, j.title, j.cat, j.obj, JSON.stringify(j.ent), JSON.stringify(j.fora), j.com, j.fb, v.ref || "",
        v.budget_type || "fixo", j.budget, j.duration, JSON.stringify(v.skills || []), v.is_async ?? 1, v.is_flex ?? 0, clarity(j), v.status || "aberta").lastInsertRowid);
      return { id };
    },
    // depois de editar, a nota de clareza é recalculada com os campos novos
    after: id => { const j = one("SELECT * FROM jobs WHERE id = ?", id)!;
      run("UPDATE jobs SET clarity = ? WHERE id = ?", clarity({ ...j, ent: parse(j.ent), fora: parse(j.fora) }), id); },
    beforeDelete: id => moneyGuard("contract_id IN (SELECT id FROM contracts WHERE job_id = ?)", id),
  },
  proposals: {
    label: "Propostas", table: "proposals",
    fields: [{ k: "status", label: "Situação", type: "select", options: ST_PROP }, { k: "value", label: "Valor (R$)", type: "int", min: 0, max: 10_000_000 },
      { k: "days", label: "Prazo (dias úteis)", type: "int", min: 0, max: 365, ph: "Ex.: 15" }, { k: "text", label: "Texto da proposta", type: "textarea", max: 4000 },
      { k: "questions", label: "Perguntas", type: "textarea", max: 2000 }],
    list: (q, off, query) => {
      const st = query ? str(query.get("status") || "", 20) : "";
      const jid = query ? int(query.get("job_id"), 0) : 0;
      const cleanId = q.replace(/^#/, "");
      return all(`SELECT pr.id, pr.job_id, j.title job, j.status job_status, j.client_id, uc.name client,
        pr.freela_id, u.name freela, (SELECT v.provider FROM verifications v WHERE v.user_id = u.id LIMIT 1) verified,
        CASE WHEN p.avatar IS NOT NULL THEN '/avatar/' || u.id ELSE '' END avatar,
        pr.value, pr.days, pr.status, pr.text, pr.questions, pr.milestones, pr.created_at,
        (SELECT c.id FROM contracts c WHERE c.proposal_id = pr.id LIMIT 1) contract_id
        FROM proposals pr
        JOIN jobs j ON j.id = pr.job_id
        JOIN users u ON u.id = pr.freela_id
        LEFT JOIN profiles p ON p.user_id = pr.freela_id
        JOIN users uc ON uc.id = j.client_id
        WHERE (? = '' OR pr.status = ?)
          AND (? = 0 OR pr.job_id = ?)
          AND (? = '' OR j.title LIKE ? OR u.name LIKE ? OR uc.name LIKE ? OR pr.text LIKE ? OR CAST(pr.id AS TEXT) = ?)
        ORDER BY pr.id DESC LIMIT 50 OFFSET ?`,
        st, st, jid, jid, q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, cleanId, off).map(r => ({
          ...r,
          milestones_list: parse<ProposalMilestone[]>(r.milestones),
          files: attsOf("proposal_id", Number(r.id)),
        }));
    },
    summary: () => {
      const byStatus: Record<string, number> = { enviada: 0, aceita: 0, recusada: 0, retirada: 0 };
      let total = 0, totalValue = 0;
      for (const r of all("SELECT status, COUNT(*) n, COALESCE(SUM(value), 0) v FROM proposals GROUP BY status")) {
        byStatus[String(r.status)] = Number(r.n) || 0;
        total += Number(r.n) || 0;
        totalValue += Number(r.v) || 0;
      }
      return { total, totalValue, byStatus };
    },
    cols: [["job", "Vaga"], ["client", "Cliente"], ["freela", "Freela"], ["value", "Valor R$"], ["days", "Prazo (dias)"], ["status", "Situação"], ["created_at", "Enviada"]],
    get: id => one("SELECT * FROM proposals WHERE id = ?", id),
    after: id => {
      const p = one("SELECT pr.*, j.client_id FROM proposals pr JOIN jobs j ON j.id = pr.job_id WHERE pr.id = ?", id);
      if (p && p.status === "aceita") ensureContractForProposal(p, p.client_id);
    },
    beforeDelete: id => { if (one("SELECT 1 FROM contracts WHERE proposal_id = ?", id)) fail(409, "Essa proposta virou contrato. Apague o contrato antes."); },
  },
  contracts: {
    label: "Contratos", table: "contracts",
    fields: [{ k: "status", label: "Situação", type: "select", options: opt(["ativo", "Ativo"], ["concluido", "Concluído"]) },
      { k: "value", label: "Valor total (R$)", type: "int", min: 0, max: 10_000_000 }],
    list: (q, off) => all(`SELECT c.id, j.title job, uc.name client, uf.name freela, c.value, c.status, c.created_at FROM contracts c JOIN jobs j ON j.id = c.job_id
      JOIN users uc ON uc.id = c.client_id JOIN users uf ON uf.id = c.freela_id WHERE ? = '' OR j.title LIKE ? OR uc.name LIKE ? OR uf.name LIKE ?
      ORDER BY c.id DESC LIMIT 50 OFFSET ?`, q, `%${q}%`, `%${q}%`, `%${q}%`, off),
    cols: [["job", "Vaga"], ["client", "Cliente"], ["freela", "Freela"], ["value", "Valor R$"], ["status", "Situação"], ["created_at", "Início"]],
    get: id => one("SELECT * FROM contracts WHERE id = ?", id),
    beforeDelete: id => moneyGuard("contract_id = ?", id),
  },
  milestones: {
    label: "Etapas", table: "milestones",
    fields: [{ k: "title", label: "Etapa", type: "text", max: 120, req: true, ph: "Ex.: Primeiras propostas de logotipo" }, { k: "value", label: "Valor (R$)", type: "int", min: 0, max: 10_000_000 },
      { k: "status", label: "Situação", type: "select", options: ST_MS },
      // com o Asaas ligado, a situação do pagamento só muda pelo próprio Asaas (o banco não pode mentir sobre dinheiro)
      { k: "pay_status", label: "Pagamento", type: "select", options: ST_PAY, locked: () => PAYMENTS }],
    list: (q, off) => all(`SELECT ms.id, j.title job, ms.title, ms.value, ms.status, ms.pay_status FROM milestones ms JOIN contracts c ON c.id = ms.contract_id
      JOIN jobs j ON j.id = c.job_id WHERE ? = '' OR j.title LIKE ? OR ms.title LIKE ? ORDER BY ms.id DESC LIMIT 50 OFFSET ?`, q, `%${q}%`, `%${q}%`, off),
    cols: [["job", "Vaga"], ["title", "Etapa"], ["value", "Valor R$"], ["status", "Situação"], ["pay_status", "Pagamento"]],
    get: id => one("SELECT * FROM milestones WHERE id = ?", id),
    beforeDelete: id => moneyGuard("id = ?", id),
  },
  reviews: {
    label: "Avaliações", table: "reviews",
    fields: [{ k: "rating", label: "Nota (1 a 5)", type: "int", min: 1, max: 5, req: true, ph: "De 1 a 5" }, { k: "comment", label: "Comentário", type: "textarea", max: 600 }],
    list: (q, off) => all(`SELECT r.id, a.name author, t.name target, r.rating, r.comment, r.created_at FROM reviews r JOIN users a ON a.id = r.author_id JOIN users t ON t.id = r.target_id
      WHERE ? = '' OR a.name LIKE ? OR t.name LIKE ? OR r.comment LIKE ? ORDER BY r.id DESC LIMIT 50 OFFSET ?`, q, `%${q}%`, `%${q}%`, `%${q}%`, off),
    cols: [["author", "Quem avaliou"], ["target", "Avaliado"], ["rating", "Nota"], ["comment", "Comentário"], ["created_at", "Quando"]],
    get: id => one("SELECT * FROM reviews WHERE id = ?", id),
  },
};
// limpa e confere um valor vindo do formulário, de acordo com o tipo do campo
function adminValue(f: AdminField, raw: unknown) {
  if (f.type === "int") { const n = int(raw, f.min ?? 0, f.max ?? 10_000_000); return n; }
  if (f.type === "bool") return raw === true || raw === 1 || raw === "1" ? 1 : 0;
  if (f.type === "list") return list(raw, f.max, f.len);
  const s = str(raw, f.max || 2000);
  if (f.req && !s) fail(400, `Preencha "${f.label}".`);
  if (f.type === "email") { const e = s.toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail(400, "Esse e-mail não parece válido."); return e; }
  if (f.type === "select") { const ok = (typeof f.options === "function" ? f.options() : f.options!).map(o => o.v); if (!ok.includes(s)) fail(400, `Escolha uma opção válida em "${f.label}".`); }
  return s;
}
const adminFields = (ent: AdminEntity, mode: "create" | "edit") => ent.fields.filter(f => mode === "create" ? true : !f.create).filter(f => !(f.locked && f.locked()));
// o que a tela precisa para desenhar cada aba: rótulos, colunas e campos (com as opções já resolvidas)
route("GET", "/api/admin/schema", ({ user }) => {
  needAdmin(user);
  return { entities: Object.entries(ADMIN_ENT).map(([k, e]) => ({ k, label: e.label, canCreate: !!e.canCreate, cols: e.cols,
    fields: e.fields.map(f => ({ k: f.k, label: f.label, type: f.type, ph: f.ph || "", req: !!f.req, create: !!f.create, locked: !!(f.locked && f.locked()),
      options: f.options ? (typeof f.options === "function" ? f.options() : f.options) : undefined })) })) };
}, { auth: false });
route("GET", "/api/admin/log", ({ user }) => {
  needAdmin(user);
  return { log: all(`SELECT l.*, u.name admin FROM admin_log l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 200`) };
}, { auth: false });
for (const [key, ent] of Object.entries(ADMIN_ENT)) {
  // LER: lista com busca e páginas de 50
  route("GET", `/api/admin/${key}`, ({ user, query }) => {
    needAdmin(user);
    const page = int(query.get("page"), 0, 10_000);
    return { rows: ent.list(str(query.get("q") || "", 80), page * 50, query), page, ...(ent.summary ? { summary: ent.summary() } : {}) };
  }, { auth: false });
  // LER UM: todos os campos editáveis de um registro
  route("GET", `/api/admin/${key}/:id`, ({ user, params }) => {
    needAdmin(user);
    const r = ent.get(params.id); if (!r) fail(404, "Registro não encontrado.");
    const values: Record<string, unknown> = {}; for (const f of ent.fields) values[f.k] = f.json ? parse(r[f.k as keyof AppRow] || "[]") : r[f.k as keyof AppRow];
    return { id: params.id, values };
  }, { auth: false });
  // EDITAR: só os campos que vieram, cada um limpo e conferido, gravados na tabela certa
  route("PUT", `/api/admin/${key}/:id`, ({ user, body, params }) => {
    needAdmin(user);
    if (!ent.get(params.id)) fail(404, "Registro não encontrado.");
    const v: AdminValues = {}, before: Record<string, unknown> = {};
    for (const f of adminFields(ent, "edit")) if (body[f.k] !== undefined) v[f.k] = adminValue(f, body[f.k]);
    if (ent.check) ent.check(v, params.id);
    const old = ent.get(params.id)!;
    tx(() => {
      for (const f of adminFields(ent, "edit")) {
        if (v[f.k] === undefined) continue;
        before[f.k] = old[f.k as keyof AppRow];
        const val = (f.json ? JSON.stringify(v[f.k]) : v[f.k]) as SQLInputValue;
        if (f.tbl === "profiles") run(`UPDATE profiles SET ${f.k} = ? WHERE user_id = ?`, val, params.id);
        else run(`UPDATE ${ent.table} SET ${f.k} = ? WHERE id = ?`, val, params.id);
      }
      if (ent.after) ent.after(params.id);
      adminLog(user, "editar", key, params.id, { antes: before, depois: v });
    });
    return { ok: true };
  }, { auth: false });
  // CRIAR: só onde faz sentido (pessoas e vagas); propostas, contratos e etapas nascem pelo fluxo normal
  if (ent.canCreate) route("POST", `/api/admin/${key}`, async ({ user, body }) => {
    needAdmin(user);
    const v: AdminValues = {}; for (const f of adminFields(ent, "create")) if (body[f.k] !== undefined && body[f.k] !== "") v[f.k] = adminValue(f, body[f.k]);
    for (const f of ent.fields) if (f.req && (v[f.k] === undefined || v[f.k] === "")) fail(400, `Preencha "${f.label}".`);
    if (ent.check) ent.check(v, 0);
    const out = await ent.create!(v, user);
    const rest = adminFields(ent, "edit").filter(f => f.tbl === "profiles" && v[f.k] !== undefined);
    for (const f of rest) run(`UPDATE profiles SET ${f.k} = ? WHERE user_id = ?`, (f.json ? JSON.stringify(v[f.k]) : v[f.k]) as SQLInputValue, out.id);
    adminLog(user, "criar", key, out.id, v);
    return out;
  }, { auth: false });
  // APAGAR: confere as travas (dinheiro, contratos ligados, a própria conta) e registra o que havia antes
  route("DELETE", `/api/admin/${key}/:id`, ({ user, params }) => {
    needAdmin(user);
    const r = ent.get(params.id); if (!r) fail(404, "Registro não encontrado.");
    if (ent.beforeDelete) ent.beforeDelete(params.id, user);
    tx(() => {
      // contrato apagado: a proposta deixa de valer e a vaga volta a aceitar propostas
      if (key === "contracts") { run("UPDATE proposals SET status = 'recusada' WHERE id = ?", r.proposal_id); run("UPDATE jobs SET status = 'aberta' WHERE id = ? AND status = 'em_andamento'", r.job_id); }
      run(`DELETE FROM ${ent.table} WHERE id = ?`, params.id);
      adminLog(user, "apagar", key, params.id, Object.fromEntries(Object.entries(r).filter(([k, x]) => !["pass_hash", "data", "image"].includes(k) && typeof x !== "object")));
    });
    return { ok: true };
  }, { auth: false });
}
// TROCAR SENHA de alguém (ex.: pessoa sem acesso ao e-mail): gera uma senha temporária, mostrada uma vez, e desconecta os aparelhos
route("POST", "/api/admin/users/:id/password", async ({ user, params }) => {
  needAdmin(user);
  if (!one("SELECT 1 FROM users WHERE id = ?", params.id)) fail(404, "Registro não encontrado.");
  const pass = crypto.randomBytes(9).toString("base64url");
  const passHash = await hashPasswordAsync(pass);
  tx(() => { run("UPDATE users SET pass_hash = ? WHERE id = ?", passHash, params.id); run("DELETE FROM sessions WHERE user_id = ?", params.id);
    adminLog(user, "trocar senha", "users", params.id, {}); });
  return { tempPassword: pass };
}, { auth: false });

// PROJETOS E TAREFAS (no estilo Asana): cada contrato ganha um projeto, criado sozinho na primeira vez que
// alguém do contrato abre as tarefas, já com as seções "A fazer / Fazendo / Feito" e uma tarefa por etapa.
// Projetos internos são só da equipe da Osmo (o admin único, ADMIN_EMAIL). Regra de ouro: só os membros do projeto
// enxergam e mexem nele; para qualquer outra pessoa ele "não existe" (404). O dono vê tudo.
// As tarefas organizam o trabalho, mas não mexem em dinheiro: pagamento continua nas etapas do contrato.
const SECTIONS0 = ["A fazer", "Fazendo", "Feito"];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
function newProject(kind: string, name: string, userId: number | null, contractId: number | null = null) {
  return tx(() => {
    const pid = Number(run("INSERT INTO projects (kind, contract_id, name, created_by) VALUES (?,?,?,?)", kind, contractId, name, userId).lastInsertRowid);
    SECTIONS0.forEach((n, i) => run("INSERT INTO project_sections (project_id, name, pos) VALUES (?,?,?)", pid, n, i));
    return pid;
  });
}
// projeto do contrato: nasce na primeira visita, com uma tarefa por etapa (o valor vai no título)
function contractProject(c: AppRow) {
  const p = one("SELECT id FROM projects WHERE contract_id = ?", c.id);
  if (p) return p.id;
  const job = one("SELECT title FROM jobs WHERE id = ?", c.job_id);
  const pid = newProject("contrato", job ? job.title : `Contrato ${c.id}`, null, c.id);
  // cada etapa já nasce na coluna certa: aprovada vai para "Feito" (concluída), em andamento ou entregue para "Fazendo"
  const [todo, doing, done] = all("SELECT id FROM project_sections WHERE project_id = ? ORDER BY pos", pid).map(r => r.id);
  all("SELECT title, value, status FROM milestones WHERE contract_id = ? ORDER BY pos", c.id).forEach((m, i) => {
    const sec = m.status === "aprovada" ? done : ["andamento", "entregue", "ajustes"].includes(m.status) ? doing : todo;
    run("INSERT INTO tasks (project_id, section_id, title, assignee_id, pos, done) VALUES (?,?,?,?,?,?)", pid, sec, `${m.title} (${brl(m.value)})`, c.freela_id, i, m.status === "aprovada" ? 1 : 0);
  });
  return pid;
}
// quem participa: no contrato, cliente e freela; no interno, a equipe da Osmo
function projectMembers(p: AppRow) {
  if (p.kind === "contrato") { const c = one("SELECT client_id, freela_id FROM contracts WHERE id = ?", p.contract_id);
    return c ? all("SELECT id, name, role FROM users WHERE id IN (?, ?)", c.client_id, c.freela_id) : []; }
  return ADMINS.length ? all(`SELECT id, name, role FROM users WHERE lower(email) IN (${ADMINS.map(() => "?").join(",")})`, ...ADMINS) : [];
}
function canSee(user: SessionUser, p: AppRow) {
  if (isAdmin(user)) return true;
  if (p.kind !== "contrato") return false;
  return !!one("SELECT 1 FROM contracts WHERE id = ? AND (client_id = ? OR freela_id = ?)", p.contract_id, user.id, user.id);
}
function projectAccess(user: SessionUser, id: number) {
  const p = one("SELECT * FROM projects WHERE id = ?", id);
  if (!p || !canSee(user, p)) fail(404, "Projeto não encontrado.");
  return p;
}
function taskAccess(user: SessionUser, id: number) {
  const t = one("SELECT * FROM tasks WHERE id = ?", id);
  if (!t) fail(404, "Tarefa não encontrada.");
  projectAccess(user, t.project_id);
  return t;
}
const memberId = (p: AppRow, v: unknown) => {
  if (v === null || v === "" || v === undefined) return null;
  const id = int(v, 1); if (!projectMembers(p).some(m => m.id === id)) fail(400, "O responsável precisa ser alguém do projeto.");
  return id;
};
const sectionOf = (p: AppRow, v: unknown) => { const s = one("SELECT id FROM project_sections WHERE id = ? AND project_id = ?", int(v, 1), p.id); if (!s) fail(400, "Seção inválida."); return s.id; };
const taskOut = (t: AppRow) => ({ id: t.id, project_id: t.project_id, section_id: t.section_id, parent_id: t.parent_id, title: t.title, notes: t.notes,
  assignee_id: t.assignee_id, assignee: t.assignee || "", due_date: t.due_date, done: !!t.done, done_at: t.done_at, pos: t.pos, comments: t.n_comments || 0 });
const TASK_SELECT = `SELECT t.*, u.name assignee, (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) n_comments FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id`;

// LISTA DE PROJETOS: os dos contratos da pessoa (criados aqui se ainda não existirem) e, para o dono, os internos
route("GET", "/api/projects", ({ user }) => {
  for (const c of all("SELECT * FROM contracts WHERE client_id = ? OR freela_id = ?", user.id, user.id)) contractProject(c);
  const rows = all(`SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL AND t.done = 0) open,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.parent_id IS NULL AND t.done = 1) done,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.done = 0 AND t.due_date != '' AND t.due_date < date('now', '-3 hours')) late
    FROM projects p ORDER BY p.kind, p.id DESC`).filter(p => canSee(user, p));
  return { projects: rows.map(p => ({ id: p.id, kind: p.kind, name: p.name, open: p.open, done: p.done, late: p.late })), canCreate: isAdmin(user) };
});
// PROJETO INTERNO NOVO (só o dono)
route("POST", "/api/projects", ({ user, body }) => {
  if (!isAdmin(user)) fail(404, "Rota não encontrada.");
  const name = str(body.name, 80); if (name.length < 2) fail(400, "Dê um nome ao projeto.");
  return { id: newProject("interno", name, user.id) };
});
// UM PROJETO COMPLETO: seções, todas as tarefas (com subtarefas) e os membros, para a tela montar lista, quadro e calendário
route("GET", "/api/projects/:id", ({ user, params }) => {
  const p = projectAccess(user, params.id);
  return { project: { id: p.id, kind: p.kind, name: p.name, contract_id: p.contract_id },
    sections: all("SELECT id, name, pos FROM project_sections WHERE project_id = ? ORDER BY pos, id", p.id),
    tasks: all(TASK_SELECT + " WHERE t.project_id = ? ORDER BY t.pos, t.id", p.id).map(taskOut),
    members: projectMembers(p), canManage: isAdmin(user) && p.kind === "interno" };
});
route("PUT", "/api/projects/:id", ({ user, params, body }) => {
  const p = projectAccess(user, params.id);
  const name = str(body.name, 80); if (name.length < 2) fail(400, "Dê um nome ao projeto.");
  run("UPDATE projects SET name = ? WHERE id = ?", name, p.id);
  return { ok: true };
});
route("DELETE", "/api/projects/:id", ({ user, params }) => {
  const p = projectAccess(user, params.id);
  if (p.kind !== "interno" || !isAdmin(user)) fail(409, "Projetos de contrato acompanham o contrato e não podem ser apagados.");
  run("DELETE FROM projects WHERE id = ?", p.id);
  return { ok: true };
});
// SEÇÕES (colunas do quadro): criar, renomear, mudar de lugar e apagar (as tarefas vão para a primeira seção que sobrar)
route("POST", "/api/projects/:id/sections", ({ user, params, body }) => {
  const p = projectAccess(user, params.id);
  const name = str(body.name, 60); if (!name) fail(400, "Dê um nome à seção.");
  const pos = one("SELECT COALESCE(MAX(pos), -1) + 1 n FROM project_sections WHERE project_id = ?", p.id)!.n;
  return { id: Number(run("INSERT INTO project_sections (project_id, name, pos) VALUES (?,?,?)", p.id, name, pos).lastInsertRowid) };
});
route("PUT", "/api/sections/:id", ({ user, params, body }) => {
  const s = one("SELECT * FROM project_sections WHERE id = ?", params.id); if (!s) fail(404, "Seção não encontrada.");
  projectAccess(user, s.project_id);
  if (body.name !== undefined) { const name = str(body.name, 60); if (!name) fail(400, "Dê um nome à seção."); run("UPDATE project_sections SET name = ? WHERE id = ?", name, s.id); }
  if (body.dir) {
    const ids = all("SELECT id FROM project_sections WHERE project_id = ? ORDER BY pos, id", s.project_id).map(r => r.id);
    const i = ids.indexOf(s.id), j = i + (Number(body.dir) < 0 ? -1 : 1);
    if (j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; tx(() => ids.forEach((id, pos) => run("UPDATE project_sections SET pos = ? WHERE id = ?", pos, id))); }
  }
  return { ok: true };
});
route("DELETE", "/api/sections/:id", ({ user, params }) => {
  const s = one("SELECT * FROM project_sections WHERE id = ?", params.id); if (!s) fail(404, "Seção não encontrada.");
  projectAccess(user, s.project_id);
  const other = one("SELECT id FROM project_sections WHERE project_id = ? AND id != ? ORDER BY pos LIMIT 1", s.project_id, s.id);
  if (!other) fail(409, "O projeto precisa ter pelo menos uma seção.");
  tx(() => { run("UPDATE tasks SET section_id = ? WHERE section_id = ?", other.id, s.id); run("DELETE FROM project_sections WHERE id = ?", s.id); });
  return { ok: true };
});
// TAREFAS: criar (ou subtarefa, com parent_id), abrir com subtarefas e comentários, editar, mover e apagar
route("POST", "/api/projects/:id/tasks", ({ user, params, body }) => {
  const p = projectAccess(user, params.id);
  const title = str(body.title, 200); if (!title) fail(400, "Escreva o nome da tarefa.");
  let parent = null, section = null;
  if (body.parent_id) {
    parent = one("SELECT id, section_id, parent_id FROM tasks WHERE id = ? AND project_id = ?", int(body.parent_id, 1), p.id);
    if (!parent) fail(400, "Tarefa principal inválida."); if (parent.parent_id) fail(400, "Subtarefas têm um nível só.");
    section = parent.section_id;
  } else section = body.section_id ? sectionOf(p, body.section_id) : one<{id:number}>("SELECT id FROM project_sections WHERE project_id = ? ORDER BY pos LIMIT 1", p.id)!.id;
  const due = str(body.due_date || "", 10); if (due && !isDate(due)) fail(400, "Data de prazo inválida.");
  const pos = one("SELECT COALESCE(MAX(pos), -1) + 1 n FROM tasks WHERE project_id = ? AND section_id IS ? AND parent_id IS ?", p.id, section, parent ? parent.id : null)!.n;
  const id = Number(run("INSERT INTO tasks (project_id, section_id, parent_id, title, assignee_id, due_date, pos, created_by) VALUES (?,?,?,?,?,?,?,?)",
    p.id, section, parent ? parent.id : null, title, memberId(p, body.assignee_id), due, pos, user.id).lastInsertRowid);
  return { task: taskOut(one(TASK_SELECT + " WHERE t.id = ?", id)!) };
});
route("GET", "/api/tasks/:id", ({ user, params }) => {
  const t = taskAccess(user, params.id);
  return { task: taskOut(one(TASK_SELECT + " WHERE t.id = ?", t.id)!),
    subtasks: all(TASK_SELECT + " WHERE t.parent_id = ? ORDER BY t.pos, t.id", t.id).map(taskOut),
    comments: all("SELECT c.id, c.body, c.created_at, c.author_id, u.name author FROM task_comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.id", t.id) };
});
route("PUT", "/api/tasks/:id", ({ user, params, body }) => {
  const t = taskAccess(user, params.id), p = one("SELECT * FROM projects WHERE id = ?", t.project_id)!;
  const set: TaskUpdate = {};
  if (body.title !== undefined) { set.title = str(body.title, 200); if (!set.title) fail(400, "Escreva o nome da tarefa."); }
  if (body.notes !== undefined) set.notes = str(body.notes, 4000);
  if (body.assignee_id !== undefined) set.assignee_id = memberId(p, body.assignee_id);
  if (body.due_date !== undefined) { set.due_date = str(body.due_date, 10); if (set.due_date && !isDate(set.due_date)) fail(400, "Data de prazo inválida."); }
  if (body.done !== undefined) { set.done = body.done ? 1 : 0; set.done_at = body.done ? new Date().toISOString().slice(0, 19).replace("T", " ") : ""; }
  // mover: para outra seção (e/ou outra posição dentro dela); as outras tarefas da seção se reorganizam
  if (body.section_id !== undefined && !t.parent_id) {
    const sec = sectionOf(p, body.section_id);
    const ids = all("SELECT id FROM tasks WHERE project_id = ? AND section_id IS ? AND parent_id IS NULL AND id != ? ORDER BY pos, id", p.id, sec, t.id).map(r => r.id);
    const at = body.index === undefined ? ids.length : int(body.index, 0, ids.length);
    ids.splice(at, 0, t.id);
    tx(() => { run("UPDATE tasks SET section_id = ? WHERE id = ? OR parent_id = ?", sec, t.id, t.id); ids.forEach((id, pos) => run("UPDATE tasks SET pos = ? WHERE id = ?", pos, id)); });
  }
  const keys = Object.keys(set) as (keyof TaskUpdate)[];
  if (keys.length) run(`UPDATE tasks SET ${keys.map(k => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`, ...keys.map(k => set[k]!), t.id);
  return { task: taskOut(one(TASK_SELECT + " WHERE t.id = ?", t.id)!) };
});
route("DELETE", "/api/tasks/:id", ({ user, params }) => {
  const t = taskAccess(user, params.id);
  run("DELETE FROM tasks WHERE id = ?", t.id);
  return { ok: true };
});
route("POST", "/api/tasks/:id/comments", ({ user, params, body, ip }) => {
  limit("tcom:" + user.id, 60, 60_000);
  const t = taskAccess(user, params.id);
  const text = str(body.body, 2000); if (!text) fail(400, "O comentário está vazio.");
  run("INSERT INTO task_comments (task_id, author_id, body) VALUES (?,?,?)", t.id, user.id, text);
  return { ok: true };
});
// PROJETO DE UM CONTRATO: o botão "Tarefas" do Painel pergunta aqui qual é o projeto (e ele nasce se ainda não existir)
route("GET", "/api/contracts/:id/project", ({ user, params }) => {
  const c = one("SELECT * FROM contracts WHERE id = ?", params.id);
  if (!c || (c.client_id !== user.id && c.freela_id !== user.id && !isAdmin(user))) fail(404, "Contrato não encontrado.");
  return { id: contractProject(c) };
});
// MINHAS TAREFAS: tudo o que está com a pessoa e ainda não foi concluído, em todos os projetos que ela vê
route("GET", "/api/me/tasks", ({ user }) => {
  for (const c of all("SELECT * FROM contracts WHERE client_id = ? OR freela_id = ?", user.id, user.id)) contractProject(c);
  const rows = all(`SELECT t.*, p.name project, p.kind, p.contract_id, (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) n_comments
    FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.assignee_id = ? AND t.done = 0
    ORDER BY t.due_date = '', t.due_date, t.id`, user.id).filter(t => canSee(user, t));
  return { tasks: rows.map(t => ({ ...taskOut(t), project: t.project })) };
});

// SQUADS (os "círculos" do Google+): cada pessoa junta outras pessoas em squads com nome e cor, para
// montar equipes. Só o dono vê e mexe nos squads dele; quem está dentro só vê que está naquele squad.
// Quem pode entrar num squad: qualquer freelancer (o perfil já é público) ou alguém com quem você já
// conversou ou fechou contrato. Assim ninguém descobre clientes desconhecidos pelo número da conta.
/* ---------------- squads ---------------- */
const SQUAD_MAX = 30, SQUAD_MEMBERS_MAX = 50, SQUAD_COLORS = 6;
const PERSON_SELECT = `SELECT u.id, u.name, p.title, a.v avatar_v, vf.verified_at FROM users u LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN avatars a ON a.user_id = u.id LEFT JOIN verifications vf ON vf.user_id = u.id`;
const personOut = (u: AppRow) => ({ id: u.id, name: u.name, title: u.title || "", avatar: avatarUrl(u.id, u.avatar_v), verified: u.verified_at || "" });
// "contatos": todo mundo do outro lado das suas conversas e contratos
const contactIds = (userId: number) => all(`SELECT freela_id id FROM threads WHERE client_id = ? AND kind = '' UNION SELECT client_id FROM threads WHERE freela_id = ? AND kind = ''
  UNION SELECT freela_id FROM contracts WHERE client_id = ? UNION SELECT client_id FROM contracts WHERE freela_id = ?`, userId, userId, userId, userId).map(r => r.id);
function squadAccess(user: SessionUser, id: number) {
  const s = one("SELECT * FROM squads WHERE id = ? AND owner_id = ?", id, user.id);
  if (!s) fail(404, "Squad não encontrado.");
  return s;
}
const squadName = (v: unknown) => { const n = str(v, 40); if (!n) fail(400, "Dê um nome ao squad."); return n; };
// TUDO DA TELA DE SQUADS: os seus squads com quem está em cada um, seus contatos e os squads em que você está
route("GET", "/api/squads", ({ user }) => {
  const squads = all("SELECT * FROM squads WHERE owner_id = ? ORDER BY pos, id", user.id).map(s => ({
    id: s.id, name: s.name, color: s.color,
    members: all(PERSON_SELECT + " JOIN squad_members m ON m.user_id = u.id WHERE m.squad_id = ? ORDER BY m.added_at, u.id", s.id).map(personOut),
  }));
  const ids = contactIds(user.id).filter(id => id !== user.id);
  const contacts = ids.length ? all(PERSON_SELECT + ` WHERE u.id IN (${ids.map(() => "?").join(",")}) ORDER BY u.name`, ...ids).map(personOut) : [];
  const memberOf = all(`SELECT s.id, s.name, s.color, o.name owner, o.id owner_id FROM squad_members m JOIN squads s ON s.id = m.squad_id
    JOIN users o ON o.id = s.owner_id WHERE m.user_id = ? ORDER BY m.added_at DESC`, user.id);
  return { squads, contacts, memberOf, colors: SQUAD_COLORS };
});
route("POST", "/api/squads", ({ user, body }) => {
  const name = squadName(body.name);
  const n = one("SELECT COUNT(*) n, COALESCE(MAX(pos), -1) + 1 pos FROM squads WHERE owner_id = ?", user.id)!;
  if (n.n >= SQUAD_MAX) fail(409, `Você chegou ao limite de ${SQUAD_MAX} squads.`);
  const color = body.color === undefined ? n.n % SQUAD_COLORS : int(body.color, 0, SQUAD_COLORS - 1);
  return { id: Number(run("INSERT INTO squads (owner_id, name, color, pos) VALUES (?,?,?,?)", user.id, name, color, n.pos).lastInsertRowid) };
});
route("PUT", "/api/squads/:id", ({ user, params, body }) => {
  const s = squadAccess(user, params.id);
  run("UPDATE squads SET name = ?, color = ? WHERE id = ?", body.name === undefined ? s.name : squadName(body.name),
    body.color === undefined ? s.color : int(body.color, 0, SQUAD_COLORS - 1), s.id);
  return { ok: true };
});
route("DELETE", "/api/squads/:id", ({ user, params }) => {
  run("DELETE FROM squads WHERE id = ?", squadAccess(user, params.id).id);
  return { ok: true };
});
// COLOCAR PESSOAS NO SQUAD: aceita várias de uma vez (arrastar um grupo para o círculo, como no Google+)
route("POST", "/api/squads/:id/members", ({ user, params, body }) => {
  const s = squadAccess(user, params.id);
  const ids = [...new Set((Array.isArray(body.user_ids) ? body.user_ids : [body.user_id]).map(v => int(v, 1)))].slice(0, SQUAD_MEMBERS_MAX);
  if (!ids.length) fail(400, "Escolha quem entra no squad.");
  const contacts = new Set(contactIds(user.id));
  for (const id of ids) {
    if (id === user.id) fail(400, "Você já é o dono do squad.");
    const u = one(`SELECT u.id FROM users u WHERE u.id = ? AND (${HAS("freela")} OR ?)`, id, contacts.has(id) ? 1 : 0);
    if (!u) fail(400, "Só dá para adicionar freelancers ou pessoas com quem você já conversou.");
  }
  return tx(() => {
    for (const id of ids) run("INSERT OR IGNORE INTO squad_members (squad_id, user_id) VALUES (?,?)", s.id, id);
    if (one("SELECT COUNT(*) n FROM squad_members WHERE squad_id = ?", s.id)!.n > SQUAD_MEMBERS_MAX) fail(409, `Um squad tem no máximo ${SQUAD_MEMBERS_MAX} pessoas.`);
    return { ok: true };
  });
});
route("DELETE", "/api/squads/:id/members/:uid", ({ user, params }) => {
  run("DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?", squadAccess(user, params.id).id, params.uid);
  return { ok: true };
});
// SAIR DE UM SQUAD em que outra pessoa te colocou
route("DELETE", "/api/squads/:id/leave", ({ user, params }) => {
  run("DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?", params.id, user.id);
  return { ok: true };
});

// CARTEIRO PACIENTE: em vez de mandar um e-mail a cada mensagem (seria chato!), uma vez por
// minuto ele olha as conversas e só manda se:
// - tem coisa não lida há pelo menos 2 minutos sem nada novo (junta tudo num e-mail só);
// - não mandou e-mail daquela conversa nos últimos 15 minutos;
// - a pessoa quer avisos ("importante" = só avisos do sistema, sem conversa das pessoas).
// O link do rodapé usa um código pessoal (notifyToken) para mudar os avisos sem precisar entrar.
// O MESMO carteiro também manda a notificação no aparelho (push), quando a pessoa ligou em algum:
// as mesmas regras valem para os dois (juntar, esperar, não repetir, respeitar "importante"/"nada").
/* ---------------- avisos por e-mail e no aparelho ---------------- */
// Uma varredura por minuto: quem tem mensagens não lidas numa conversa recebe um e-mail só, com o resumo.
// Espera 2 minutos sem mensagens novas (junta tudo que chegou junto), pula quem já leu
// e manda no máximo um e-mail por conversa a cada 15 minutos.
// "importante" = só avisos do sistema (propostas, contratos, etapas, pagamentos); "tudo" inclui mensagens das pessoas.
const NOTIFY = ["tudo", "importante", "nada"];
function notifyToken(userId: number) {
  const u = one("SELECT notify_token FROM users WHERE id = ?", userId)!;
  if (u.notify_token) return u.notify_token;
  const t = crypto.randomBytes(24).toString("hex");
  run("UPDATE users SET notify_token = ? WHERE id = ?", t, userId);
  return t;
}
function notifySweep() {
  const pairs = all(`SELECT t.id thread_id, u.id user_id, u.name, u.email, u.notify_level, u.lang, j.title job_title, n.last_at,
      CASE WHEN u.id = t.client_id THEN t.client_read_at ELSE t.freela_read_at END read_at
    FROM threads t JOIN users u ON u.id IN (t.client_id, t.freela_id) LEFT JOIN jobs j ON j.id = t.job_id
    LEFT JOIN notify_log n ON n.thread_id = t.id AND n.user_id = u.id
    WHERE t.updated_at > datetime('now', '-30 minutes') AND t.kind = '' AND u.notify_level != 'nada'
      AND (n.last_at IS NULL OR n.last_at < datetime('now', '-15 minutes'))`);
  for (const p of pairs) {
    // aparelhos inscritos dessa pessoa; sem e-mail ligado e sem aparelho, não há por onde avisar
    const subs = push.ENABLED ? all("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", p.user_id) : [];
    if (!mail.ENABLED && !subs.length) continue;
    const msgs = all(`SELECT m.body, m.sender_id, m.created_at, s.name sender FROM messages m LEFT JOIN users s ON s.id = m.sender_id
      WHERE m.thread_id = ? AND (m.sender_id IS NULL OR m.sender_id != ?) AND m.created_at > ? AND m.created_at > ?
        AND m.created_at > datetime('now', '-30 minutes') ${p.notify_level === "importante" ? "AND m.sender_id IS NULL" : ""}
      ORDER BY m.id`, p.thread_id, p.user_id, p.read_at, p.last_at || "1970-01-01");
    if (!msgs.length || msgs.some(m => m.created_at > new Date(Date.now() - 120e3).toISOString().replace("T", " ").slice(0, 19))) continue;
    run("INSERT INTO notify_log (thread_id, user_id, last_at) VALUES (?,?,datetime('now')) ON CONFLICT(thread_id, user_id) DO UPDATE SET last_at = excluded.last_at", p.thread_id, p.user_id);
    if (mail.ENABLED) sendNotice(p, msgs).catch(e => console.error(new Date().toISOString(), "aviso", e.message));
    if (subs.length) sendPushNotice(p, msgs, subs).catch(e => console.error(new Date().toISOString(), "push", e.message));
  }
}
// O "resumo" de um aviso, igual no e-mail e na notificação: título (quem mandou, sobre qual vaga)
// e as linhas das mensagens, tudo no idioma de quem recebe.
function noticeParts(p: AppRow, msgs: AppRow[], max = 400) {
  const people = [...new Set(msgs.filter(m => m.sender).map(m => m.sender))];
  // tudo no idioma de quem recebe; mensagens do sistema ("Proposta aceita...") também são traduzidas
  const T = (k: string, ...a: unknown[]) => i18n.T(p.lang, k, ...a);
  const about = p.job_title ? `"${p.job_title}"` : T("sua conversa");
  const subject = people.length && msgs.every(m => m.sender) ? T("{1} mandou mensagem sobre {2}", people[0], about) : T("Novidade em {1}", about);
  const body = (m: AppRow) => m.sender_id == null ? i18n.tx(p.lang, m.body) : m.body; // só as do sistema; o que as pessoas escrevem fica como está
  const line = (m: AppRow) => (m.sender ? `${m.sender}: ` : "") + (body(m).length > max ? body(m).slice(0, max) + "…" : body(m));
  return { T, subject, line };
}
async function sendNotice(p: AppRow, msgs: AppRow[]) {
  const link = `${PUBLIC_URL}/mensagens/${p.thread_id}`, prefs = `${PUBLIC_URL}/avisos#${notifyToken(p.user_id)}`;
  const { T, subject, line } = noticeParts(p, msgs);
  const shown = msgs.slice(-5), more = msgs.length - shown.length;
  const first = p.name.split(" ")[0];
  const moreTxt = more ? T(more > 1 ? "(e mais {1} mensagens antes)" : "(e mais {1} mensagem antes)", more) : "";
  const text = `${T("Olá, {1}.", first)}\n\n${more ? moreTxt + "\n" : ""}${shown.map(line).join("\n\n")}\n\n${T("Abrir a conversa:")} ${link}\n\n--\nOsmo Talents. ${T("Para mudar ou desligar estes avisos:")} ${prefs}`;
  const html = mail.renderEmailTemplate({
    eyebrow: p.job_title ? p.job_title : "Conversas · Osmo Talents",
    title: subject,
    greeting: T("Olá, {1}.", first),
    intro: moreTxt || undefined,
    items: shown.map(m => ({ sender: m.sender || undefined, body: line({ ...m, sender: "" }), system: m.sender_id == null })),
    ctaLabel: T("Abrir conversa"),
    ctaUrl: link,
    unsubscribeUrl: prefs,
    unsubscribeLabel: T("Mudar ou desligar estes avisos"),
    publicUrl: PUBLIC_URL,
  });
  await mail.send({ to: p.email, subject, text, html, headers: { "List-Unsubscribe": `<${prefs}>` } });
}
// A notificação é curtinha: o mesmo título do e-mail e as últimas 3 mensagens, cada uma com até
// 120 letras (o pacote do push tem limite de tamanho, e a tela do celular também).
// "tag" com o número da conversa: um aviso novo da mesma conversa SUBSTITUI o anterior em vez de empilhar.
// "badge" leva o total de não lidas, para o ícone do app mostrar a bolinha vermelha com o número.
async function sendPushNotice(p: AppRow, msgs: AppRow[], subs: AppRow[]) {
  const { subject, line } = noticeParts(p, msgs, 120);
  await pushTo(subs, { title: subject, body: msgs.slice(-3).map(line).join("\n"), url: `/mensagens/${p.thread_id}`, tag: `thread-${p.thread_id}`, badge: unreadCount(p.user_id) });
}
// Entrega para cada aparelho. O correio respondeu 404/410? A inscrição morreu (notificações
// desligadas, app desinstalado): apagamos a linha para não tentar de novo. Deu certo? Anotamos a data.
// Cada envio deixa uma linha no registro do servidor (journalctl): o código do correio, qual correio
// (Apple, Google...) e o número da inscrição. Nada de conteúdo, nome ou endereço completo.
// Devolve os códigos, para o botão "Enviar um teste" contar à pessoa o que aconteceu.
async function pushTo(subs: AppRow[], data: push.PushMessage) {
  return Promise.all(subs.map(async s => {
    const status = await push.send(s, data).catch(e => { console.error(new Date().toISOString(), "push falhou", e.message); return 0; });
    console.log(new Date().toISOString(), "push", status, new URL(s.endpoint).hostname, "inscrição", s.id);
    if (status === 404 || status === 410) run("DELETE FROM push_subscriptions WHERE id = ?", s.id);
    else if (status >= 200 && status < 300) run("UPDATE push_subscriptions SET last_ok_at = datetime('now') WHERE id = ?", s.id);
    return status;
  }));
}
if (mail.ENABLED || push.ENABLED) setInterval(() => { try { notifySweep(); } catch (e) { console.error("aviso", e); } }, 60_000).unref();

// Rotas desse link do rodapé: ver e trocar a preferência de avisos.
// preferências pelo link do e-mail (sem precisar entrar na conta)
const byNotifyToken = (t: unknown) => /^[a-f0-9]{48}$/.test(String(t || "")) ? one("SELECT id, name, notify_level FROM users WHERE notify_token = ?", String(t)) : null;
route("GET", "/api/notify", ({ query, ip }) => {
  limit("notify:" + ip, 30, 60_000);
  const u = byNotifyToken(query.get("token"));
  if (!u) fail(404, "Esse link não funciona mais. Entre na sua conta e ajuste os avisos em Meu perfil.");
  return { name: u.name, level: u.notify_level };
}, { auth: false });
route("POST", "/api/notify", ({ body, ip }) => {
  limit("notify:" + ip, 30, 60_000);
  const u = byNotifyToken(body.token);
  if (!u) fail(404, "Esse link não funciona mais. Entre na sua conta e ajuste os avisos em Meu perfil.");
  if (!isOneOf(body.level, NOTIFY)) fail(400, "Escolha uma opção.");
  run("UPDATE users SET notify_level = ? WHERE id = ?", body.level, u.id);
  return { level: body.level };
}, { auth: false });

// NOTIFICAÇÕES NESTE APARELHO: o site manda a inscrição que o navegador criou (endereço + chaves).
// Guardamos (ou passamos para esta conta, se o navegador já era de outra) e deixamos no máximo
// 10 aparelhos por pessoa: os mais antigos saem. A escolha tudo/importante/nada continua valendo.
route("POST", "/api/push/subscribe", ({ user, body }) => {
  if (!push.ENABLED) fail(503, "As notificações ainda não estão ativas na plataforma.");
  const s = body.subscription;
  if (!push.validSubscription(s)) fail(400, "Este navegador mandou uma inscrição que não reconhecemos.");
  run(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device) VALUES (?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device`,
    user.id, s.endpoint, s.keys.p256dh, s.keys.auth, str(body.device, 40));
  run(`DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 10)`, user.id, user.id);
  return { ok: true };
});
// desligar neste aparelho (ou ao sair da conta): apaga só a inscrição deste navegador
route("POST", "/api/push/unsubscribe", ({ user, body }) => {
  run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", user.id, str(body.endpoint, 1000));
  return { ok: true };
});
// "Enviar um teste": manda uma notificação na hora (sem esperar o carteiro) só para este aparelho
route("POST", "/api/push/test", async ({ user, body }) => {
  limit("push-test:" + user.id, 5, 600_000);
  const s = one("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", user.id, str(body.endpoint, 1000));
  if (!s) fail(404, "Este aparelho não está inscrito. Ative as notificações de novo.");
  const T = (k: string, ...a: unknown[]) => i18n.T(user.lang, k, ...a);
  const [status] = await pushTo([s], { title: "Osmo Talents", body: T("As notificações estão funcionando neste aparelho."), url: "/perfil", tag: "teste" });
  // ok = o correio aceitou; gone = a inscrição morreu (precisa ativar de novo); status = o código, para diagnóstico
  return { ok: status >= 200 && status < 300, gone: status === 404 || status === 410, status };
});

// O CAMINHO DO "ENTRAR COM GOOGLE" (a parte do servidor):
// - /auth/google: guarda o bilhete secreto (state) no banco e num cookie e manda a pessoa ao Google;
// - /auth/google/callback: a volta. Confere se o bilhete é o mesmo, troca o código pelos dados
//   da pessoa e decide:
//   * já conhecemos essa conta do Google? entra direto;
//   * o e-mail (confirmado pelo Google) já tem conta aqui? liga as duas e entra;
//   * é gente nova? cria a conta (se já escolheu freela/cliente) ou manda escolher.
// Qualquer problema volta para a tela de entrar com um código de erro.
/* ---------------- login social (/auth/...) ---------------- */
function createOAuthUser(r: OAuthRegistration, role: Role) {
  if (one("SELECT 1 FROM users WHERE email = ?", r.email)) fail(409, "Já existe uma conta com esse e-mail. Entre com e-mail e senha.");
  const name = r.name || r.email.split("@")[0];
  const uid = Number(run("INSERT INTO users (name, email, pass_hash, role) VALUES (?,?,?,?)", name.slice(0, 80), r.email, "oauth$" + r.provider, role).lastInsertRowid);
  run("INSERT INTO profiles (user_id) VALUES (?)", uid);
  run("INSERT INTO oauth_identities (provider, sub, user_id, email) VALUES (?,?,?,?)", r.provider, r.sub, uid, r.email);
  return uid;
}
function redirect(res: http.ServerResponse, to: string) { res.writeHead(302, { ...SECURITY_HEADERS, Location: to, "Cache-Control": "no-store" }); res.end(); }
const stateCookie = (v: string, age: number) => `osmo_oauth=${v}; Path=/auth; HttpOnly; Max-Age=${age}; SameSite=Lax${COOKIE_SECURE ? "; Secure" : ""}`;
const oauthLanguageCookie = (v: string, age: number) => `osmo_oauth_lang=${v}; Path=/auth; HttpOnly; Max-Age=${age}; SameSite=Lax${COOKIE_SECURE ? "; Secure" : ""}`;
async function handleAuth(req: http.IncomingMessage, res: http.ServerResponse, url: URL, ip: string) {
  const m = url.pathname.match(/^\/auth\/(google|microsoft|linkedin|adobe|github)(\/callback)?$/);
  let language = i18n.pick(url.searchParams.get("lang")) || "pt-BR";
  if (m && m[2]) {
    const state = url.searchParams.get("state") || "";
    let languageCookie = "";
    try { languageCookie = readCookie(req, "osmo_oauth_lang") || ""; } catch { /* preferência opcional corrompida não bloqueia o login */ }
    const savedLanguage = /^([a-f0-9]{48})\.(pt-BR|en-US)$/.exec(languageCookie);
    if (savedLanguage && savedLanguage[1] === state && readCookie(req, "osmo_oauth") === state) language = i18n.pick(savedLanguage[2]) || "pt-BR";
  }
  const destination = (path: string) => {
    if (language !== "en-US") return path;
    const target = new URL(path, PUBLIC_URL);
    target.searchParams.set("lang", "en-US");
    return target.pathname + target.search + target.hash;
  };
  const fail2 = (code: string) => redirect(res, destination(`/entrar?oauth_error=${code}`));
  if (!m) return send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" });
  const k = m[1];
  if (!oauth.enabled(k)) return fail2("indisponivel");
  if (!m[2]) {
    if (req.method !== "GET") return send(res, 405, "Método não permitido");
    // OAuth começa no domínio canônico para que o cookie de estado seja válido nele.
    const pub = new URL(PUBLIC_URL);
    if (pub.hostname !== "localhost" && (req.headers.host || "").split(":")[0] !== pub.hostname) return redirect(res, PUBLIC_URL + url.pathname + url.search);
    try { limit("oauth:" + ip, 30, 600_000); } catch { return fail2("tentativas"); }
    const role = isOneOf(url.searchParams.get("role"), ["freela", "cliente"]) ? url.searchParams.get("role") : "";
    const s = oauth.start(k);
    run("DELETE FROM oauth_states WHERE created_at < datetime('now', '-15 minutes')");
    run("INSERT INTO oauth_states (state, provider, verifier, nonce, role) VALUES (?,?,?,?,?)", s.state, k, s.verifier, s.nonce, role);
    appendCookie(res, stateCookie(s.state, 600));
    appendCookie(res, oauthLanguageCookie(s.state + "." + language, 600));
    return redirect(res, s.url);
  }
  // retorno do provedor
  if (req.method !== "GET") return send(res, 405, "Método não permitido");
  // O provedor pode devolver para o host app. antigo; volta ao canônico antes de ler o cookie.
  const pub = new URL(PUBLIC_URL);
  if (pub.hostname !== "localhost" && (req.headers.host || "").split(":")[0] !== pub.hostname) return redirect(res, PUBLIC_URL + url.pathname + url.search);
  const params = url.searchParams;
  appendCookie(res, stateCookie("", 0));
  appendCookie(res, oauthLanguageCookie("", 0));
  if (params.get("error")) return fail2(params.get("error") === "access_denied" || params.get("error") === "user_cancelled_authorize" ? "cancelado" : "falhou");
  const state = params.get("state") || "", code = params.get("code") || "";
  const saved = /^[a-f0-9]{48}$/.test(state) ? one("SELECT * FROM oauth_states WHERE state = ? AND provider = ? AND created_at > datetime('now', '-15 minutes')", state, k) : null;
  const cookie = readCookie(req, "osmo_oauth");
  if (!saved || !code || cookie !== state) return fail2("expirou");
  run("DELETE FROM oauth_states WHERE state = ?", state);
  let prof;
  try { prof = await oauth.finish(k, code, saved); }
  catch (e) { console.error("oauth", k, errorMessage(e)); return fail2("falhou"); }

  let uid = (one("SELECT user_id FROM oauth_identities WHERE provider = ? AND sub = ?", k, prof.sub) || {}).user_id;
  if (!uid && prof.email && prof.emailVerified) {
    const u = one("SELECT id FROM users WHERE email = ?", prof.email);
    if (u) { uid = u.id; run("INSERT OR IGNORE INTO oauth_identities (provider, sub, user_id, email) VALUES (?,?,?,?)", k, prof.sub, uid, prof.email); }
  }
  if (!uid) {
    if (!prof.email || !prof.emailVerified) return fail2("sem_email");
    const r = { provider: k, sub: prof.sub, email: prof.email, name: prof.name };
    if (saved.role) { try { uid = tx(() => createOAuthUser(r, saved.role as Role)); } catch { return fail2("falhou"); } createSession(res, uid); return redirect(res, destination(saved.role === "freela" ? "/perfil" : "/publicar")); }
    const token = crypto.randomBytes(24).toString("hex");
    run("INSERT INTO oauth_pending (token, provider, sub, email, name) VALUES (?,?,?,?,?)", token, k, prof.sub, prof.email, prof.name);
    return redirect(res, destination(`/escolher#${token}`));
  }
  createSession(res, uid);
  return redirect(res, destination("/painel"));
}

// TOP 10 DE FILMES E SÉRIES: os dados vêm do TMDB (themoviedb.org), que tem API oficial e gratuita.
// - lista "em-alta": o que mais está sendo visto na semana; "melhores": os mais bem avaliados;
// - pedimos filmes e séries ao mesmo tempo e guardamos a resposta por 6 horas (TOP10_TTL),
//   para a página abrir rápido e não gastar o limite de pedidos do TMDB;
// - a chave fica só aqui no servidor (TMDB_TOKEN no .env), nunca vai para o navegador.
const TMDB_TOKEN = process.env.TMDB_TOKEN || "";
const TOP10_TTL = 6 * 3600e3;
const TOP10_LISTS: Record<string, [string, string]> = { "em-alta": ["trending/movie/week", "trending/tv/week"], melhores: ["movie/top_rated", "tv/top_rated"] };
type Top10Data = {lista: string;updatedAt: string;filmes: ReturnType<typeof top10Item>[];series: ReturnType<typeof top10Item>[]};
const top10Cache = new Map<string, {at:number;data:Top10Data}>();
async function tmdb(pathname: string): Promise<TmdbResponse> {
  const r = await fetch(`https://api.themoviedb.org/3/${pathname}?language=pt-BR&region=BR`, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json() as Promise<TmdbResponse>;
}
const top10Item = (x: TmdbItem, i: number) => ({
  rank: i + 1, id: x.id,
  title: x.title || x.name || "",
  year: String(x.release_date || x.first_air_date || "").slice(0, 4),
  rating: Math.round((x.vote_average || 0) * 10) / 10,
  poster: x.poster_path ? `https://image.tmdb.org/t/p/w342${x.poster_path}` : "",
  backdrop: x.backdrop_path ? `https://image.tmdb.org/t/p/w1280${x.backdrop_path}` : "", // imagem larga (fundo do app de TV em /tv/)
  overview: String(x.overview || "").slice(0, 280),
});
route("GET", "/api/top10", async ({ query }) => {
  if (!TMDB_TOKEN) fail(503, "O Top 10 ainda não está ligado: falta a chave do TMDB no servidor.");
  const requested = query.get("lista") || "";
  const lista = TOP10_LISTS[requested] ? requested : "em-alta";
  const hit = top10Cache.get(lista);
  if (hit && Date.now() - hit.at < TOP10_TTL) return hit.data;
  try {
    const [movies, tv] = await Promise.all(TOP10_LISTS[lista].map(tmdb));
    const data = { lista, updatedAt: new Date().toISOString(), filmes: movies.results.slice(0, 10).map(top10Item), series: tv.results.slice(0, 10).map(top10Item) };
    top10Cache.set(lista, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.error(new Date().toISOString(), "top10", errorMessage(e));
    if (hit) return hit.data; // o TMDB caiu: mostra a última lista boa que temos
    fail(502, "Não deu para buscar o Top 10 agora. Tente de novo em instantes.");
  }
}, { auth: false });

// OSMO ORIGINAIS (vídeos próprios no app de TV /tv/). Como para uma criança:
// - os vídeos moram numa pasta do servidor (data/videos), fora do código: publicar.sh não mexe nela;
// - cada vídeo é um arquivo .mp4 (ou .webm/.m4v). Junto dele, com o MESMO nome, podem ir:
//     nome.jpg/.png/.webp      -> a capa em pé (cartaz)
//     nome-fundo.jpg/.png/.webp -> a imagem larga do fundo
//     nome.vtt                 -> legenda
//     nome.json                -> {"title":"...","year":"2026","overview":"...","order":1}
//   sem o .json, o título vem do nome do arquivo ("meu-curta_2026.mp4" vira "Meu curta 2026");
// - o vídeo é entregue "em pedaços" (HTTP Range): começa a tocar logo e dá para pular para
//   qualquer ponto sem baixar tudo;
// - só nomes simples (letras, números, ponto, traço) são aceitos: ninguém sai da pasta com "../".
const VIDEO_DIR = path.resolve(process.env.VIDEO_DIR || path.join(PROJECT_ROOT, "data", "videos"));
const VIDEO_EXT: Record<string, string> = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm" };
const VIDEO_IMG: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const VIDEO_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,150}$/;
function videoFile(name: string) {
  if (!VIDEO_NAME.test(name) || name.includes("..")) return null;
  const file = path.join(VIDEO_DIR, name);
  return path.dirname(file) === VIDEO_DIR ? file : null;
}
function listVideos() {
  let names;
  try { names = fs.readdirSync(VIDEO_DIR); } catch { return []; }
  const set = new Set(names);
  const pick = (stem: string, exts: string[]) => exts.map(e => stem + e).find(n => set.has(n));
  const imgs = Object.keys(VIDEO_IMG);
  return names.filter(n => VIDEO_EXT[path.extname(n).toLowerCase()] && VIDEO_NAME.test(n)).map(n => {
    const stem = n.slice(0, -path.extname(n).length);
    let meta: VideoMetadata = {};
    try { meta = record(JSON.parse(fs.readFileSync(path.join(VIDEO_DIR, stem + ".json"), "utf8")) as unknown); } catch {}
    const st = fs.statSync(path.join(VIDEO_DIR, n));
    const url = (f: string | undefined) => f ? "/video/" + encodeURIComponent(f) + "?v=" + Math.floor(fs.statSync(path.join(VIDEO_DIR, f)).mtimeMs).toString(36) : "";
    const nice = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return {
      id: stem, order: Number(meta.order) || 999, added: st.mtimeMs,
      title: String(meta.title || (nice.charAt(0).toUpperCase() + nice.slice(1))).slice(0, 120),
      year: String(meta.year || "").slice(0, 4),
      overview: String(meta.overview || "").slice(0, 400),
      src: "/video/" + encodeURIComponent(n),
      poster: url(pick(stem, imgs)), backdrop: url(pick(stem + "-fundo", imgs)) || url(pick(stem, imgs)),
      subtitles: url(pick(stem, [".vtt"])),
    };
  }).filter(v => !v.id.endsWith("-fundo"))
    .sort((a, b) => a.order - b.order || b.added - a.added)
    .map(({ order, added, ...v }) => v);
}
route("GET", "/api/videos", () => ({ videos: listVideos() }), { auth: false });
// entrega o vídeo (em pedaços), a capa, o fundo ou a legenda
function serveVideo(req: http.IncomingMessage, res: http.ServerResponse, rawName: string) {
  let name; try { name = decodeURIComponent(rawName); } catch { return notFound(res); }
  const file = videoFile(name); if (!file) return notFound(res);
  const ext = path.extname(name).toLowerCase();
  const type = VIDEO_EXT[ext] || VIDEO_IMG[ext] || (ext === ".vtt" ? "text/vtt; charset=utf-8" : null);
  if (!type) return notFound(res);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const size = st.size;
    const etag = `"${size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const base = { ...SECURITY_HEADERS, "Content-Type": type, "Accept-Ranges": "bytes", "ETag": etag,
      "Cache-Control": VIDEO_EXT[ext] ? "public, max-age=3600" : "public, max-age=86400" };
    if (req.headers["if-none-match"] === etag && !req.headers.range) { res.writeHead(304, base); return res.end(); }
    let start = 0, end = size - 1, status = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && size > 0) {
      if (m[1] === "" && m[2] !== "") { start = Math.max(0, size - Number(m[2])); }
      else { start = Number(m[1] || 0); if (m[2] !== "") end = Math.min(end, Number(m[2])); }
      if (start > end || start >= size) { res.writeHead(416, { ...base, "Content-Range": `bytes */${size}` }); return res.end(); }
      status = 206;
    }
    res.writeHead(status, { ...base, "Content-Length": end - start + 1, ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === "HEAD" || size === 0) return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });
}

// MIME: a "etiqueta" que diz ao navegador que tipo de arquivo está chegando (página, estilo,
// script, imagem...). Sem a etiqueta certa, o navegador pode não saber o que fazer.
/* ---------------- servidor ---------------- */
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

// CAPACETES DE SEGURANÇA que vão em toda resposta:
// - nosniff: o navegador não "adivinha" tipo de arquivo;
// - X-Frame-Options DENY: ninguém coloca nosso site escondido dentro do site deles;
// - Permissions-Policy: o site não pede câmera, microfone nem localização;
// - Content-Security-Policy: a lista de lugares de onde a página pode carregar coisas.
//   Se alguém conseguir enfiar um script malvado, o navegador se recusa a rodar.
const SECURITY_HEADERS: http.OutgoingHttpHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  ...(COOKIE_SECURE ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
  // com o Google Analytics configurado, a lista de lugares permitidos ganha os endereços do Google;
  // o Cloudflare Web Analytics (static.cloudflareinsights.com / cloudflareinsights.com) vale nas duas versões
  "Content-Security-Policy": GA_ID
    ? "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://image.tmdb.org https://*.google-analytics.com https://*.googletagmanager.com; script-src 'self' https://www.googletagmanager.com https://static.cloudflareinsights.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    : "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://image.tmdb.org; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

// Responde ao navegador: se for objeto, vira JSON; sempre com os capacetes de segurança.
function send(res: http.ServerResponse, status: number, data: unknown, headers: http.OutgoingHttpHeaders = {}) {
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, { ...SECURITY_HEADERS, ...(typeof data === "object" && !Buffer.isBuffer(data) ? { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } : {}), ...headers });
  res.end(body);
}

// LER O QUE O NAVEGADOR MANDOU: readRaw lê arquivos (PDF, anexos) até um tamanho máximo;
// readBody lê o JSON dos formulários (até 200 KB) e avisa se vier quebrado ou grande demais.
function readRaw(req: http.IncomingMessage, max: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    // passou do limite: descarta o resto mas lê até o fim, para conseguir responder com a mensagem certa
    let size = 0; const chunks: Buffer[] = [];
    req.on("data", c => { size += c.length; if (size <= max) chunks.push(c); else chunks.length = 0; });
    req.on("end", () => size > max ? reject(new HttpError(413, `Arquivo grande demais. O limite é ${Math.round(max / 1048576)} MB.`)) : resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function readBody(req: http.IncomingMessage, max = 200_000): Promise<JsonBody> {
  return new Promise<JsonBody>((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on("data", c => { size += c.length; if (size > max) { reject(new HttpError(413, "Conteúdo grande demais.")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "JSON inválido.")); } });
    req.on("error", reject);
  });
}

// ARQUIVOS DO SITE (HTML, CSS, JS): serveStatic entrega o arquivo pedido da pasta public.
// - "/" e os endereços das telas do app (/vagas, /vagas/12, /painel...: lista APP_PATH, igual à do app.js)
//   recebem o index.html; o app.js desenha a tela certa;
//   endereço que não existe recebe a 404.html com código 404, para o Google não guardar página vazia;
// - path.normalize + startsWith impede truques como "/../../senhas" para sair da pasta;
// - ETag é a "impressão digital" do arquivo: se o navegador já tem a mesma, respondemos
//   "304, nada mudou" e economizamos internet;
// - no HTML, colocamos "?v=..." no endereço do CSS e do JS. Quando o arquivo muda, o número
//   muda, e o navegador baixa a versão nova em vez de usar a velha guardada.
// carimbo de versão de cada arquivo (data de modificação): vai no endereço do arquivo e em /api/me,
// para a página aberta perceber que saiu versão nova
const stamp = (name: string) => {
  try {
    // o i18n.js leva junto a data dos dicionários (public/i18n/*.json): mudou uma tradução, muda o carimbo
    const files = name === "i18n.js" ? ["i18n.js", ...fs.readdirSync(path.join(PUBLIC_DIR, "i18n")).map(f => "i18n/" + f)] : [name];
    return Math.floor(Math.max(...files.map(f => fs.statSync(path.join(PUBLIC_DIR, f)).mtimeMs))).toString(36);
  } catch { return "0"; }
};
const appVersion = () => stamp("app.js") + "." + stamp("styles.css");
const publicPayments = { enabled: PAYMENTS, sandbox: stripe.SELECTED ? stripe.SANDBOX : /sandbox/.test(asaas.BASE), fee: FEE * 100, autoRelease: stripe.SELECTED ? 0 : asaas.AUTO_RELEASE_DAYS };
const seo = createSeo({ one, all, JOB_SELECT, jobOut: row => jobOut(row as unknown as AppRow), profileOf, hasFreelaSQL: HAS("freela"), payments: publicPayments, publicDir: PUBLIC_DIR });
const editorialPaths = new Set(Object.keys(editorialPages));
const stampHtml = (html: string) => html.replace(/(src|href)="\/(app\.js|theme\.js|styles\.css|fonts\.css|i18n-core\.js|i18n\.js|tv\/tv\.js|tv\/tv\.css|tv\/remote-tv\.js|tv\/qrcode\.js|tv\/controle\.js|tv\/controle\.css)"/g, (m, attr, name) => `${attr}="/${name}?v=${stamp(name)}"`);
function servePublicPage(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (url.pathname === "/robots.txt") { send(res, 200, req.method === "HEAD" ? "" : seo.robots(), { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" }); return true; }
  if (url.pathname === "/sitemap.xml") { send(res, 200, req.method === "HEAD" ? "" : seo.sitemap(), { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" }); return true; }
  const page = seo.page(url.pathname, url.searchParams);
  if (!page) return false;
  if (page.status === 404) page.canonicalPath = url.pathname;
  const template = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
  const html = renderDocument(template, page, seo.origin, { standalone: editorialPaths.has(url.pathname), payments: publicPayments });
  send(res, page.status || 200, req.method === "HEAD" ? "" : stampHtml(html), { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...(page.indexable === false ? { "X-Robots-Tag": "noindex, follow" } : {}) });
  return true;
}

const APP_PATH = /^\/(?:(?:vagas|talentos|mensagens|projetos)(?:\/\d+)?|vagas\/\d+\/proposta|contratos\/\d+|entrar|esqueci|recuperar|avisos|escolher|painel|perfil|publicar|panorama|propostas|tarefas|squads|gestao|top10|admin(?:\/(?:dados|propostas))?)\/?$/;
// endereço que não existe: página amigável, mas com código 404 (e sem guardar em cache)
function notFound(res: http.ServerResponse) {
  fs.readFile(path.join(PUBLIC_DIR, "404.html"), (err, buf) => err
    ? send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" })
    : send(res, 404, buf, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" }));
}
function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/privacidade" || rel === "/termos") rel += ".html";
  else if (rel === "/" || APP_PATH.test(rel)) rel = "/index.html";
  else if (rel === "/tv" || rel === "/tv/") rel = "/tv/index.html"; // app de TV separado: só o Top 10 de filmes e séries
  else if (rel === "/tv/controle" || rel === "/tv/controle/") rel = "/tv/controle.html"; // o celular como controle remoto da TV
  else if (rel === "/404.html") return notFound(res);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "Proibido");
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const ext = path.extname(file);
    // o navegador sempre confere se há versão nova; se nada mudou, responde 304 sem reenviar o arquivo
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const reqUrl = new URL(req.url || "/", "http://localhost");
    const versioned = (ext === ".js" || ext === ".css") && reqUrl.searchParams.get("v") === Math.floor(st.mtimeMs).toString(36);
    const cacheControl = versioned ? "public, max-age=31536000, immutable" : [".svg", ".png", ".jpg", ".ico", ".woff2"].includes(ext) ? "public, max-age=86400" : "no-cache";
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": cacheControl, "ETag": etag };
    if (ext !== ".html" && req.headers["if-none-match"] === etag) { res.writeHead(304, { ...SECURITY_HEADERS, ...headers }); return res.end(); }
    if (ext === ".html") {
      // carimba app.js, theme.js e styles.css com a data do arquivo: navegador e Cloudflare sempre pegam a versão nova
      return fs.readFile(file, "utf8", (err2, html) => {
        if (err2) return send(res, 404, "Não encontrado");
        const legal = pathname === "/privacidade" || pathname === "/termos";
        const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "Osmo Talents";
        const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "Área do aplicativo Osmo Talents.";
        html = renderDocument(html, { title, description, canonicalPath: pathname, indexable: legal }, seo.origin, { payments: publicPayments });
        send(res, 200, req.method === "HEAD" ? "" : stampHtml(html), { "Content-Type": MIME[".html"], "Cache-Control": "no-cache", ...(!legal ? { "X-Robots-Tag": "noindex, follow" } : {}) });
      });
    }
    fs.readFile(file, (err2, buf) => err2 ? send(res, 404, "Não encontrado") : send(res, 200, buf, headers));
  });
}

// O PORTEIRO: TODO pedido que chega passa por aqui e é encaminhado:
// 1. /auth/... -> login social;
// 2. /arquivo/N -> anexo da vaga; /arquivo/a/N -> anexo de proposta, mensagem ou etapa; /avatar/N e /portfolio/N -> imagens;
// 3. qualquer outro endereço fora de /api/ -> arquivos do site;
// 4. /api/... -> procura a rota certa no cardápio e, antes de chamar:
//    - CSRF: pedidos que mudam algo precisam do cabeçalho "x-osmo: 1", que só o nosso
//      próprio site manda (um site malvado não consegue fingir isso);
//    - descobre quem é a pessoa pelo crachá; barra quem não está logado ou não tem o papel certo;
//    - lê o corpo do pedido, chama a rota e responde.
//    Erros esperados viram mensagens amigáveis; erros inesperados viram "algo deu errado"
//    (e o detalhe vai só para o registro do servidor, nunca para a pessoa).
const server = http.createServer(async (req, res) => {
  try {
  const url = new URL(req.url || "/", "http://localhost");
  // o nginx acrescenta o IP real no fim de X-Forwarded-For; o começo pode vir do próprio visitante
  const peer = req.socket.remoteAddress || "";
  const trusted = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer);
  const ip = trusted && header(req, "x-forwarded-for").split(",").pop()!.trim() || peer;
  if (url.pathname.startsWith("/auth/")) {
    return handleAuth(req, res, url, ip).catch(e => { console.error("auth", e); if (!res.headersSent) redirect(res, "/entrar?oauth_error=falhou"); });
  }
  const vm = url.pathname.match(/^\/video\/([^/]+)$/);
  if (vm && (req.method === "GET" || req.method === "HEAD")) return serveVideo(req, res, vm[1]);
  const fm = url.pathname.match(/^\/arquivo\/(a\/)?(\d+)$/);
  if (fm && (req.method === "GET" || req.method === "HEAD")) return fm[1] ? serveAttachment(req, res, Number(fm[2])) : serveFile(req, res, Number(fm[2]));
  const av = url.pathname.match(/^\/(avatar|portfolio)\/(\d+)$/);
  if (av && (req.method === "GET" || req.method === "HEAD")) {
    const a = av[1] === "avatar" ? one("SELECT mime, data, v FROM avatars WHERE user_id = ?", Number(av[2]))
      : one("SELECT mime, image data, v FROM portfolio_items WHERE id = ? AND v > 0", Number(av[2]));
    if (!a) return send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" });
    // o endereço muda (?v=) a cada foto nova, então pode ficar em cache por muito tempo
    return send(res, 200, Buffer.from(a.data), { "Content-Type": a.mime, "Cache-Control": url.searchParams.get("v") === String(a.v) ? "public, max-age=31536000, immutable" : "no-cache" });
  }
  // controle pelo celular do app de TV: tem regras próprias (cano aberto, pedidos vindos da Biblioteca da casa)
  if (url.pathname.startsWith("/api/tv/remote/")) return tvRemote.handle(req, res, url, ip, { send, readBody, limit, HttpError });
  if (!url.pathname.startsWith("/api/")) {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Método não permitido");
    const aliases: Record<string, string> = { "/index.html": "/", "/termos.html": "/termos", "/privacidade.html": "/privacidade" };
    const clean = aliases[url.pathname] || (url.pathname.length > 1 && url.pathname.endsWith("/") && (APP_PATH.test(url.pathname) || editorialPaths.has(url.pathname.slice(0, -1))) ? url.pathname.slice(0, -1) : url.pathname);
    const canonicalHost = new URL(seo.origin).hostname;
    const incomingHost = (req.headers.host || "").split(":")[0].toLowerCase();
    const aliasHost = incomingHost === "www." + canonicalHost || incomingHost === "app." + canonicalHost;
    if (clean !== url.pathname || aliasHost) {
      return send(res, 301, "", { Location: seo.origin + clean + url.search, "Cache-Control": "no-cache" });
    }
    if (servePublicPage(req, res, url)) return;
    return serveStatic(req, res, url.pathname);
  }
  try {
    // proteção CSRF: toda escrita exige o cabeçalho próprio do app (formulários de outros sites não conseguem enviá-lo)
    if (req.method !== "GET" && req.headers["x-osmo"] !== "1" && !url.pathname.startsWith("/api/webhooks/")) fail(403, "Requisição recusada.");
    const r = router.match(req.method, url.pathname);
    if (!r) fail(404, "Rota não encontrada.");
    const { params } = r;
    const user = currentUser(req);
    // o site manda o idioma da tela em cada pedido; guardamos para escrever os e-mails nesse idioma
    const hl = i18n.pick(req.headers["x-osmo-lang"]);
    if (user && hl && user.lang !== hl) { run("UPDATE users SET lang = ? WHERE id = ?", hl, user.id); user.lang = hl; }
    if (r.auth && !user) fail(401, "Entre na sua conta para continuar.");
    if (r.role && user?.role !== r.role) fail(403, r.role === "cliente" ? "Esta ação é para contas de cliente." : "Esta ação é para contas de freelancer.");
    const body = req.method === "GET" ? {} : r.raw ? await readRaw(req, r.raw) : await readBody(req, url.pathname === "/api/me/avatar" ? 800_000 : url.pathname.startsWith("/api/me/portfolio") ? 2_200_000 : 200_000);
    const out = await r.handler({ req, res, user, params, body, query: url.searchParams, ip });
    if (!res.headersSent) send(res, 200, out ?? { ok: true }); // a rota pode ter respondido sozinha (ex.: texto puro)
  } catch (e) {
    if (e instanceof HttpError || e instanceof stripe.PaymentError) return send(res, e.status, { error: e.message });
    console.error(new Date().toISOString(), req.method, url.pathname, e);
    send(res, 500, { error: "Algo deu errado do nosso lado. Tente de novo em instantes." });
  }
  } catch (e) {
    if (res.headersSent) return res.destroy();
    const badRequest = e instanceof URIError || (e instanceof Error && "code" in e && e.code === "ERR_INVALID_URL");
    if (!badRequest) console.error("request", e);
    send(res, badRequest ? 400 : 500, { error: badRequest ? "Requisição inválida." : "Algo deu errado do nosso lado." });
  }
});

// Liga o servidor (só quando este arquivo é rodado direto; scripts como o seed só pegam
// as ferramentas emprestadas sem ligar o servidor).
export function start() { return server.listen(PORT, HOST, () => console.log(`Osmo Talents rodando em http://${HOST}:${PORT}`)); }
if (require.main === module) start();
export { server, hashPassword, clarity, autoRelease, notifySweep };
