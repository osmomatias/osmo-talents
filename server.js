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
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { one, all, run, tx } = require("./src/db");
const asaas = require("./src/asaas");
const oauth = require("./src/oauth");
const mail = require("./src/mail");
const icp = require("./src/icp");

// Configurações gerais:
// - PORT/HOST: em qual "porta" do computador o servidor fica escutando os pedidos;
// - COOKIE_SECURE: no site de verdade (https), o crachá de login só viaja por conexão segura;
// - PUBLIC_DIR: a pasta com os arquivos que vão para o navegador (HTML, CSS, JS);
// - FEE: a taxa da Osmo como número (10% vira 0.1);
// - SESSION_DAYS: quantos dias você fica logado sem precisar entrar de novo.
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const PUBLIC_DIR = path.join(__dirname, "public");
const FEE = asaas.FEE_PCT / 100; // taxa da plataforma (FEE_PCT no .env)
const SESSION_DAYS = 30;

// categorias importadas do Upwork (public/taxonomia.json); as vagas guardam só o id
const CATS = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "taxonomia.json"), "utf8")).categorias.map(c => c.id);
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
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function str(v, max = 2000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function int(v, min = 0, max = 10_000_000) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; }
function list(v, maxItems = 20, maxLen = 120) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [];
  return arr.map(x => str(String(x), maxLen)).filter(Boolean).slice(0, maxItems);
}
const parse = s => { try { return JSON.parse(s); } catch { return []; } };

// SENHAS: nunca guardamos a senha. Misturamos a senha com um "sal" aleatório e passamos
// por uma máquina de embaralhar bem lenta (scrypt). Lenta de propósito: para quem tenta
// adivinhar milhões de senhas, cada tentativa custa caro.
// Para conferir no login, embaralhamos a senha digitada do mesmo jeito e comparamos
// os dois embaralhados (sempre no mesmo tempo, com timingSafeEqual).
// sha() faz um "resumo" curto e único de um texto (usado para guardar crachás e códigos).
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split("$");
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}
const sha = s => crypto.createHash("sha256").update(s).digest("hex");

// NOTA DE CLAREZA da vaga: uma lista de 9 perguntas de sim ou não (tem título bom? tem
// objetivo? tem pelo menos 2 entregas? diz o que está fora? diz o valor?...).
// A nota é a porcentagem de "sim". Vaga com menos de 50% não pode ser publicada.
function clarity(j) {
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
function proposalCap(user, hours) {
  let cap = Math.max(2, Math.floor((hours || 20) / 5));
  if (user.energy === "baixa") cap = Math.max(1, cap - 2);
  if (user.energy === "alta") cap += 1;
  return cap;
}

// FREIO CONTRA ROBÔS: anotamos quantas vezes cada endereço tentou algo (ex.: login).
// Se passar do limite numa janela de tempo, respondemos "muitas tentativas, espere".
// De 10 em 10 minutos, apagamos anotações velhas para a memória não encher.
/* ---------------- rate limit simples ---------------- */
const hits = new Map();
function limit(key, max, windowMs) {
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
function readCookie(req, name) {
  const m = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function sessionCookie(token, maxAge) {
  return `osmo_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE ? "; Secure" : ""}`;
}
function appendCookie(res, c) {
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", prev ? [].concat(prev, c) : c);
}
function currentUser(req) {
  const tok = readCookie(req, "osmo_sid");
  if (!tok) return null;
  const s = one("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", sha(tok));
  if (!s || s.expires_at < new Date().toISOString()) return null;
  return one("SELECT id, name, email, role, energy, notify_level notify FROM users WHERE id = ?", s.user_id) || null;
}
function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)", sha(token), userId, exp);
  run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
  appendCookie(res, sessionCookie(token, SESSION_DAYS * 86400));
}

// Funções que "montam" as respostas: pegam os dados crus do banco e entregam arrumadinhos
// para o site (perfil completo, vaga com briefing, nota média de avaliações...).
/* ---------------- formatação ---------------- */
const avatarUrl = (id, v) => v ? `/avatar/${id}?v=${v}` : "";

// AVALIAÇÕES JUSTAS: uma avaliação só aparece quando os DOIS lados já avaliaram (ou depois
// de 14 dias). Assim ninguém vê a nota que recebeu antes de dar a sua, e ninguém avalia
// "por vingança".
// avaliações: ficam públicas quando os dois lados avaliaram o contrato, ou 14 dias depois (ninguém avalia "em resposta")
const REVIEW_TAGS = {
  freela: ["Comunicação clara", "Cumpriu os prazos", "Entrega caprichada", "Respeitou o combinado"],
  cliente: ["Briefing claro", "Feedback objetivo", "Pagou em dia", "Respeitou o ritmo combinado"],
};
const REVIEW_VISIBLE = `(r.created_at <= datetime('now', '-14 days') OR EXISTS (SELECT 1 FROM reviews o WHERE o.contract_id = r.contract_id AND o.author_id = r.target_id))`;
function ratingOf(userId) {
  const rows = all(`SELECT r.rating, r.tags FROM reviews r WHERE r.target_id = ? AND ${REVIEW_VISIBLE}`, userId);
  if (!rows.length) return { avg: 0, n: 0, tags: [] };
  const count = {};
  rows.forEach(r => parse(r.tags).forEach(t => { count[t] = (count[t] || 0) + 1; }));
  return { avg: Math.round(rows.reduce((a, r) => a + r.rating, 0) / rows.length * 10) / 10, n: rows.length,
    tags: Object.entries(count).sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, n })) };
}
function reviewsOf(userId) {
  return all(`SELECT r.rating, r.tags, r.comment, r.created_at, u.name author, j.title job FROM reviews r
    JOIN users u ON u.id = r.author_id JOIN contracts c ON c.id = r.contract_id JOIN jobs j ON j.id = c.job_id
    WHERE r.target_id = ? AND ${REVIEW_VISIBLE} ORDER BY r.created_at DESC LIMIT 30`, userId).map(r => ({ ...r, tags: parse(r.tags) }));
}
// profileOf junta tudo o que aparece num perfil: dados da pessoa, foto, selo, habilidades,
// portfólio, "como eu trabalho melhor", quantos trabalhos já concluiu e a nota média.
// jobOut faz o mesmo para uma vaga. JOB_SELECT é a "pergunta padrão" ao banco para buscar
// vagas já com o nome de quem contratou e quantas propostas a vaga tem.
const portfolioOf = userId => all("SELECT id, title, link, v FROM portfolio_items WHERE user_id = ? ORDER BY pos, id", userId)
  .map(p => ({ id: p.id, title: p.title, link: p.link, image: p.v ? `/portfolio/${p.id}?v=${p.v}` : "" }));
function profileOf(userId) {
  const u = one(`SELECT u.id, u.name, u.role, a.v avatar_v, vf.verified_at, p.* FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN avatars a ON a.user_id = u.id LEFT JOIN verifications vf ON vf.user_id = u.id WHERE u.id = ?`, userId);
  if (!u) return null;
  const stats = one("SELECT COUNT(*) n FROM contracts WHERE freela_id = ? AND status = 'concluido'", userId);
  return {
    id: u.id, name: u.name, role: u.role, title: u.title || "", bio: u.bio || "", location: u.location || "",
    rate: u.rate || 0, hours: u.hours || 20, skills: parse(u.skills || "[]"), portfolio: portfolioOf(u.id),
    how: { com: u.ws_com || "", resp: u.ws_resp || "", fb: u.ws_fb || "", foco: u.ws_foco || "" },
    tag: u.tag || "", company: u.company || "", done: stats.n, avatar: avatarUrl(u.id, u.avatar_v), rating: ratingOf(u.id), verified: u.verified_at || "",
  };
}
function jobOut(j) {
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
function threadFor(jobId, clientId, freelaId) {
  let t = one("SELECT id FROM threads WHERE job_id IS ? AND client_id = ? AND freela_id = ?", jobId, clientId, freelaId);
  if (!t) t = { id: Number(run("INSERT INTO threads (job_id, client_id, freela_id) VALUES (?,?,?)", jobId, clientId, freelaId).lastInsertRowid) };
  return t.id;
}
function postMessage(threadId, senderId, body, actorId) {
  run("INSERT INTO messages (thread_id, sender_id, body) VALUES (?,?,?)", threadId, senderId, body);
  run("UPDATE threads SET updated_at = datetime('now') WHERE id = ?", threadId);
  const who = actorId || senderId;
  if (who) run(`UPDATE threads SET client_read_at = CASE WHEN client_id = ? THEN datetime('now', '+1 second') ELSE client_read_at END,
    freela_read_at = CASE WHEN freela_id = ? THEN datetime('now', '+1 second') ELSE freela_read_at END WHERE id = ?`, who, who, threadId);
}
const brl = n => "R$ " + Number(n).toLocaleString("pt-BR");

// Confere se um CPF (11 números) ou CNPJ (14 números) é válido de verdade, usando a conta dos
// "dígitos verificadores" (os dois últimos números são calculados a partir dos outros).
// Números todos iguais (111.111.111-11) são recusados.
// dateBR dá a data de hoje (ou daqui a X dias) no horário de Brasília.
function validDoc(d) {
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    const calc = len => { const w = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; let s = 0; for (let i = 0; i < len; i++) s += Number(d[i]) * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
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
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = []; const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "(\\d+)"; }) + "$");
  routes.push({ method, re, keys, handler, auth: opts.auth !== false, role: opts.role, raw: opts.raw });
};

// --- autenticação
// CADASTRO: confere nome, e-mail e senha (mínimo 8 letras), vê se o e-mail já existe,
// cria a pessoa e o perfil vazio JUNTOS (tx = tudo ou nada) e já entrega o crachá.
// O "limit" impede alguém de criar mil contas seguidas do mesmo endereço.
route("POST", "/api/auth/register", ({ body, res, ip }) => {
  limit("reg:" + ip, 10, 600_000);
  const name = str(body.name, 80), email = str(body.email, 160).toLowerCase(), password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "cliente" ? "cliente" : "freela";
  if (name.length < 2) fail(400, "Escreva seu nome.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Esse e-mail não parece válido.");
  if (password.length < 8) fail(400, "A senha precisa ter pelo menos 8 caracteres.");
  if (one("SELECT 1 FROM users WHERE email = ?", email)) fail(409, "Já existe uma conta com esse e-mail. Tente entrar.");
  const id = tx(() => {
    const uid = Number(run("INSERT INTO users (name, email, pass_hash, role) VALUES (?,?,?,?)", name, email, hashPassword(password), role).lastInsertRowid);
    run("INSERT INTO profiles (user_id) VALUES (?)", uid);
    return uid;
  });
  createSession(res, id);
  return { ok: true };
}, { auth: false });

// ENTRAR: procura o e-mail e confere a senha. A mensagem de erro é a mesma para "e-mail não
// existe" e "senha errada", para um espertinho não descobrir quais e-mails têm conta.
route("POST", "/api/auth/login", ({ body, res, ip }) => {
  limit("login:" + ip, 10, 600_000);
  const email = str(body.email, 160).toLowerCase(), password = typeof body.password === "string" ? body.password : "";
  const u = one("SELECT id, pass_hash FROM users WHERE email = ?", email);
  if (!u || !checkPassword(password, u.pass_hash)) fail(401, "E-mail ou senha não conferem.");
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
function resetRow(token) {
  const t = String(token || "");
  if (!/^[a-f0-9]{64}$/.test(t)) return null;
  run("DELETE FROM password_resets WHERE expires_at < ?", new Date().toISOString());
  return one("SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?", sha(t));
}
route("POST", "/api/auth/forgot", ({ body, ip }) => {
  if (!mail.ENABLED) fail(503, "A recuperação de senha ainda não está ativa. Fale com a Osmo.");
  limit("forgot:" + ip, 5, 900_000);
  const email = str(body.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Esse e-mail não parece válido.");
  // a resposta é sempre a mesma, para não revelar quais e-mails têm conta
  const u = one("SELECT id, name, email FROM users WHERE email = ?", email);
  if (!u) return { ok: true };
  try { limit("forgot-mail:" + u.id, 3, 3600_000); } catch { return { ok: true }; }
  const token = crypto.randomBytes(32).toString("hex");
  run("DELETE FROM password_resets WHERE user_id = ?", u.id);
  run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)", sha(token), u.id, new Date(Date.now() + RESET_MIN * 60e3).toISOString());
  const link = `${PUBLIC_URL}/#recuperar-${token}`, first = u.name.split(" ")[0];
  const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  mail.send({
    to: u.email, subject: "Criar uma senha nova na Osmo Talents",
    text: `Olá, ${first}.\n\nRecebemos um pedido para criar uma senha nova na sua conta da Osmo Talents.\n\nPara escolher a senha nova, abra este link (vale por ${RESET_MIN} minutos e funciona uma vez só):\n${link}\n\nSe não foi você, pode ignorar este e-mail. Sua senha atual continua a mesma.\n\nOsmo Talents`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;color:#1C0B12;max-width:520px">
<p>Olá, ${escHtml(first)}.</p>
<p>Recebemos um pedido para criar uma senha nova na sua conta da Osmo Talents.</p>
<p><a href="${link}" style="display:inline-block;background:#7A0B3C;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Criar senha nova</a></p>
<p style="color:#666">O link vale por ${RESET_MIN} minutos e funciona uma vez só.<br>Se não foi você, pode ignorar este e-mail. Sua senha atual continua a mesma.</p>
<p>Osmo Talents</p></div>`,
  }).catch(e => console.error(new Date().toISOString(), "mail", e.message));
  return { ok: true };
}, { auth: false });
route("GET", "/api/auth/reset", ({ query }) => {
  const r = resetRow(query.get("token"));
  if (!r) fail(404, "Esse link expirou ou já foi usado. Peça um novo.");
  return { email: r.email };
}, { auth: false });
route("POST", "/api/auth/reset", ({ body, res, ip }) => {
  limit("reset:" + ip, 10, 600_000);
  const password = typeof body.password === "string" ? body.password : "";
  const r = resetRow(body.token);
  if (!r) fail(404, "Esse link expirou ou já foi usado. Peça um novo.");
  if (password.length < 8) fail(400, "A senha precisa ter pelo menos 8 caracteres.");
  tx(() => {
    run("UPDATE users SET pass_hash = ? WHERE id = ?", hashPassword(password), r.user_id);
    run("DELETE FROM password_resets WHERE user_id = ?", r.user_id);
    run("DELETE FROM sessions WHERE user_id = ?", r.user_id); // encerra a conta em outros aparelhos
  });
  createSession(res, r.user_id);
  return { ok: true };
}, { auth: false });

// Quem entra pela primeira vez com o Google ainda precisa dizer se quer TRABALHAR ou
// CONTRATAR. O cadastro fica "pendente" por até 20 minutos até a pessoa escolher.
// --- login social: conta nova escolhe o perfil (freelancer ou cliente)
function pendingRow(token) {
  const t = String(token || "");
  if (!/^[a-f0-9]{48}$/.test(t)) return null;
  run("DELETE FROM oauth_pending WHERE created_at < datetime('now', '-20 minutes')");
  return one("SELECT * FROM oauth_pending WHERE token = ?", t);
}
route("GET", "/api/auth/oauth/pending", ({ query }) => {
  const r = pendingRow(query.get("token"));
  if (!r) fail(404, "Esse link expirou. Entre de novo pelo botão do provedor.");
  return { name: r.name, email: r.email, provider: (oauth.P[r.provider] || {}).name || r.provider };
}, { auth: false });
route("POST", "/api/auth/oauth/complete", ({ body, res }) => {
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
route("GET", "/api/me", ({ user }) => {
  const pub = { payments: { enabled: asaas.ENABLED, fee: asaas.FEE_PCT, autoRelease: asaas.AUTO_RELEASE_DAYS }, oauth: oauth.list(), mail: mail.ENABLED, v: appVersion() };
  if (!user) return { user: null, ...pub };
  const unread = one(`SELECT COUNT(*) n FROM messages m JOIN threads t ON t.id = m.thread_id
    WHERE (t.client_id = ? AND m.created_at > t.client_read_at OR t.freela_id = ? AND m.created_at > t.freela_read_at)
    AND (m.sender_id IS NULL OR m.sender_id != ?)`, user.id, user.id, user.id).n;
  const pr = one("SELECT cpf_cnpj FROM profiles WHERE user_id = ?", user.id) || {};
  const payout = one("SELECT wallet_id, escrow FROM payout_accounts WHERE user_id = ?", user.id);
  return { user: { ...user, profile: profileOf(user.id), unread, hasDoc: !!pr.cpf_cnpj, payout: payout ? { active: true, escrow: !!payout.escrow } : null },
    ...pub };
}, { auth: false });

// SALVAR PERFIL: limpa e corta cada campo no tamanho certo (título até 100 letras, bio até
// 1200, no máximo 12 habilidades...) e grava. Se veio CPF/CNPJ, confere se é válido antes.
route("PUT", "/api/me/profile", ({ user, body }) => {
  const how = body.how || {};
  run(`UPDATE profiles SET title=?, bio=?, location=?, rate=?, hours=?, skills=?, ws_com=?, ws_resp=?, ws_fb=?, ws_foco=?, tag=?, company=? WHERE user_id=?`,
    str(body.title, 100), str(body.bio, 1200), str(body.location, 80), int(body.rate, 0, 100000), int(body.hours, 1, 60),
    JSON.stringify(list(body.skills, 12, 40)),
    str(how.com, 200), str(how.resp, 200), str(how.fb, 200), str(how.foco, 200), str(body.tag, 80), str(body.company, 100), user.id);
  const name = str(body.name, 80);
  if (body.name !== undefined && name.length < 2) fail(400, "O nome precisa ter pelo menos 2 letras.");
  if (name.length >= 2) run("UPDATE users SET name = ? WHERE id = ?", name, user.id);
  if (NOTIFY.includes(body.notify)) run("UPDATE users SET notify_level = ? WHERE id = ?", body.notify, user.id);
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
const IMG_SIG = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47] };
function decodeImage(dataUrl, maxBytes) {
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
const plain = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ").trim();
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
function portfolioFields(body) {
  const title = str(body.title, 80), link = str(body.link, 300);
  if (title.length < 2) fail(400, "Dê um nome ao projeto.");
  if (link && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(link)) fail(400, "O link precisa começar com https:// (ou deixe em branco).");
  return { title, link };
}
const ownItem = (user, id) => one("SELECT * FROM portfolio_items WHERE id = ? AND user_id = ?", id, user.id) || fail(404, "Projeto não encontrado.");
route("POST", "/api/me/portfolio", ({ user, body, ip }) => {
  limit("port:" + ip, 60, 600_000);
  const { title, link } = portfolioFields(body);
  const n = one("SELECT COUNT(*) n, COALESCE(MAX(pos), -1) last FROM portfolio_items WHERE user_id = ?", user.id);
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
  const i = ids.indexOf(params.id), j = i + (body.dir < 0 ? -1 : 1);
  if (j >= 0 && j < ids.length) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    tx(() => ids.forEach((id, pos) => run("UPDATE portfolio_items SET pos = ? WHERE id = ?", pos, id)));
  }
  return { portfolio: portfolioOf(user.id) };
}, { role: "freela" });

// ENERGIA: a pessoa diz como está hoje (baixa, média, alta). Isso muda quantas propostas ela
// pode ter abertas ao mesmo tempo (veja proposalCap lá em cima).
route("PUT", "/api/me/energy", ({ user, body }) => {
  if (!ENERGY.includes(body.energy)) fail(400, "Escolha baixa, média ou alta.");
  run("UPDATE users SET energy = ? WHERE id = ?", body.energy, user.id);
  return { ok: true };
});

// TALENTOS: lista de freelas (quem tem título aparece primeiro) e busca por palavra em nome,
// título, bio, habilidades e jeito de se comunicar. A outra rota mostra um perfil com avaliações.
// --- talentos
route("GET", "/api/talents", ({ query }) => {
  const q = str(query.get("q") || "", 80).toLowerCase();
  const rows = all("SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.role = 'freela' ORDER BY (p.title != '') DESC, u.id DESC LIMIT 200");
  let out = rows.map(r => profileOf(r.id)).filter(Boolean);
  if (q) out = out.filter(t => [t.name, t.title, t.bio, t.skills.join(" "), t.how.com].join(" ").toLowerCase().includes(q));
  return { talents: out };
}, { auth: false });

route("GET", "/api/talents/:id", ({ params }) => {
  const t = profileOf(params.id);
  if (!t || t.role !== "freela") fail(404, "Perfil não encontrado.");
  return { talent: { ...t, reviews: reviewsOf(t.id) } };
}, { auth: false });

// VAGAS: a lista pública só mostra vagas ABERTAS. Os filtros vêm do endereço:
// q (palavra), cat (área), clear (só briefing claro, 80%+), async (sem reuniões), flex (prazo
// flexível) e sort (ordenar por clareza ou por valor; valor por hora conta como 15 horas).
// --- vagas
route("GET", "/api/jobs", ({ query }) => {
  const rows = all(JOB_SELECT + " WHERE j.status = 'aberta' ORDER BY j.created_at DESC, j.id DESC LIMIT 300").map(jobOut);
  const q = str(query.get("q") || "", 80).toLowerCase(), cat = query.get("cat") || "";
  let r = rows.filter(j => (!cat || j.cat === cat)
    && (query.get("clear") !== "1" || j.clarity >= 80) && (query.get("async") !== "1" || j.async) && (query.get("flex") !== "1" || j.flex)
    && (!q || (j.title + " " + j.skills.join(" ") + " " + j.client + " " + j.company).toLowerCase().includes(q)));
  const sort = query.get("sort");
  if (sort === "clareza") r.sort((a, b) => b.clarity - a.clarity);
  if (sort === "valor") r.sort((a, b) => (b.budget_type === "hora" ? b.budget * 15 : b.budget) - (a.budget_type === "hora" ? a.budget * 15 : a.budget));
  return { jobs: r };
}, { auth: false });

route("GET", "/api/me/jobs", ({ user }) => ({ jobs: all(JOB_SELECT + " WHERE j.client_id = ? ORDER BY j.created_at DESC", user.id).map(jobOut) }), { role: "cliente" });

// UMA VAGA: todo mundo vê o briefing. Só quem está logado vê os arquivos. O DONO da vaga vê
// também todas as propostas recebidas; um freela vê a proposta que ele mesmo mandou.
route("GET", "/api/jobs/:id", ({ params, user }) => {
  const j = one(JOB_SELECT + " WHERE j.id = ?", params.id);
  if (!j) fail(404, "Vaga não encontrada.");
  const files = filesOf(j.id);
  const out = { job: { ...jobOut(j), clientRating: ratingOf(j.client_id), clientReviews: reviewsOf(j.client_id).slice(0, 5),
    files: user ? files : [], filesCount: files.length } };
  if (user && user.id === j.client_id) {
    out.proposals = all(`SELECT pr.*, u.name freela_name FROM proposals pr JOIN users u ON u.id = pr.freela_id WHERE pr.job_id = ? ORDER BY pr.created_at`, j.id)
      .map(p => ({ ...p, milestones: parse(p.milestones), freela: profileOf(p.freela_id) }));
  }
  if (user && user.role === "freela") {
    const mine = one("SELECT * FROM proposals WHERE job_id = ? AND freela_id = ?", j.id, user.id);
    if (mine) out.mine = { ...mine, milestones: parse(mine.milestones) };
  }
  return out;
}, { auth: false });

// PUBLICAR VAGA: limpa cada campo, exige título e área, calcula a nota de clareza e só
// publica com 50% ou mais.
route("POST", "/api/jobs", ({ user, body }) => {
  const j = {
    title: str(body.title, 120), cat: CATS.includes(body.cat) ? body.cat : "", obj: str(body.obj, 1200),
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
const starts = (b, ...sig) => sig.every((x, i) => b[i] === x);
const zipOffice = b => starts(b, 0x50, 0x4b, 0x03, 0x04);
const isText = b => !b.subarray(0, 8192).includes(0) && (() => { try { new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, 8192)); return true; } catch { return false; } })();
const FILE_TYPES = {
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
const filesOf = jobId => all("SELECT id, name, ext, size FROM job_files WHERE job_id = ? ORDER BY id", jobId);
route("POST", "/api/jobs/:id/files", ({ user, params, req, body, ip }) => {
  limit("files:" + ip, 40, 600_000);
  const j = one("SELECT id FROM jobs WHERE id = ? AND client_id = ?", params.id, user.id);
  if (!j) fail(404, "Vaga não encontrada.");
  if (one("SELECT COUNT(*) n FROM job_files WHERE job_id = ?", j.id).n >= FILES_PER_JOB) fail(409, `Cada vaga aceita até ${FILES_PER_JOB} arquivos. Remova um para enviar outro.`);
  let name = ""; try { name = decodeURIComponent(String(req.headers["x-filename"] || "")); } catch {}
  name = name.replace(/[\x00-\x1f\x7f/\\]/g, "").trim().slice(-120);
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
  const type = FILE_TYPES[ext];
  if (!type) fail(400, "Tipo de arquivo não aceito. Envie PDF, imagem (JPG, PNG, WebP), PSD, AI, Word, Excel, PowerPoint ou texto.");
  if (!body.length) fail(400, "O arquivo está vazio.");
  if (!type[1](body)) fail(400, `Esse arquivo não parece um .${ext} de verdade.`);
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
function serveFile(req, res, id) {
  if (!currentUser(req)) return send(res, 401, "Entre na sua conta para baixar os arquivos da vaga.", { "Content-Type": "text/plain; charset=utf-8" });
  const f = one("SELECT name, ext, data FROM job_files WHERE id = ?", id);
  if (!f) return send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" });
  // imagens e PDF abrem no navegador; o resto sempre baixa. O arquivo nunca roda como página do site.
  const inline = ["pdf", "png", "jpg", "jpeg", "webp"].includes(f.ext);
  const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  send(res, 200, Buffer.from(f.data), {
    "Content-Type": FILE_TYPES[f.ext][0], "Cache-Control": "private, no-cache",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    ...(f.ext === "pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
  });
}

// CONVIDAR: o cliente chama um talento para a vaga. Isso abre (ou reaproveita) a conversa
// entre os dois com uma mensagem de convite.
route("POST", "/api/jobs/:id/invite", ({ user, params, body }) => {
  const j = one("SELECT * FROM jobs WHERE id = ? AND client_id = ? AND status = 'aberta'", params.id, user.id);
  if (!j) fail(404, "Vaga aberta não encontrada.");
  const t = one("SELECT id FROM users WHERE id = ? AND role = 'freela'", int(body.talentId));
  if (!t) fail(404, "Talento não encontrado.");
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
  if (one("SELECT 1 FROM proposals WHERE job_id = ? AND freela_id = ?", j.id, user.id)) fail(409, "Você já enviou uma proposta para esta vaga.");
  const prof = one("SELECT hours FROM profiles WHERE user_id = ?", user.id);
  const open = one("SELECT COUNT(*) n FROM proposals WHERE freela_id = ? AND status = 'enviada'", user.id).n;
  const cap = proposalCap(user, prof && prof.hours);
  if (open >= cap) fail(409, `Você já tem ${open} propostas aguardando resposta, o limite para sua capacidade atual. Espere uma resposta ou retire uma proposta.`);
  const text = str(body.text, 4000), value = int(body.value, 0), days = int(body.days, 0, 365), questions = str(body.questions, 2000);
  if (text.split(/\s+/).filter(Boolean).length < 10) fail(400, "Escreva pelo menos 10 palavras sobre como faria o trabalho.");
  if (value < 50) fail(400, "Informe um valor de pelo menos R$ 50.");
  if (days < 1) fail(400, "Informe o prazo em dias úteis.");
  let ms = Array.isArray(body.milestones) ? body.milestones.map(m => ({ title: str(m.title, 120), value: int(m.value, 0) })).filter(m => m.title && m.value > 0).slice(0, 8) : [];
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
function ownProposalAsClient(user, id) {
  const p = one("SELECT pr.*, j.client_id, j.title job_title, j.status job_status FROM proposals pr JOIN jobs j ON j.id = pr.job_id WHERE pr.id = ?", id);
  if (!p || p.client_id !== user.id) fail(404, "Proposta não encontrada.");
  return p;
}
// ACEITAR PROPOSTA = nasce o CONTRATO. Numa tacada só (tx):
// 1. a proposta vira "aceita";
// 2. cria o contrato e uma linha para cada etapa;
// 3. a vaga vira "em andamento" (sai da lista de vagas abertas);
// 4. avisa na conversa. Se os pagamentos estão ligados, explica o próximo passo:
//    o cliente paga a primeira etapa antes do trabalho começar.
route("POST", "/api/proposals/:id/accept", ({ user, params }) => {
  const p = ownProposalAsClient(user, params.id);
  if (p.status !== "enviada") fail(409, "Essa proposta não está mais aguardando resposta.");
  const cid = tx(() => {
    run("UPDATE proposals SET status = 'aceita' WHERE id = ?", p.id);
    const c = Number(run("INSERT INTO contracts (job_id, proposal_id, client_id, freela_id, value) VALUES (?,?,?,?,?)", p.job_id, p.id, user.id, p.freela_id, p.value).lastInsertRowid);
    parse(p.milestones).forEach((m, i) => run("INSERT INTO milestones (contract_id, pos, title, value) VALUES (?,?,?,?)", c, i, m.title, m.value));
    run("UPDATE jobs SET status = 'em_andamento' WHERE id = ?", p.job_id);
    const th = threadFor(p.job_id, user.id, p.freela_id);
    postMessage(th, null, `Proposta aceita. Contrato criado com ${parse(p.milestones).length} etapa(s). O valor fica protegido e é liberado a cada etapa aprovada.`, user.id);
    if (asaas.ENABLED) {
      const hasPayout = one("SELECT 1 FROM payout_accounts WHERE user_id = ?", p.freela_id);
      postMessage(th, null, "Próximo passo: o cliente paga a primeira etapa pelo Painel. O trabalho começa quando o pagamento for confirmado."
        + (hasPayout ? "" : " Freelancer: ative sua conta de recebimento em Meu perfil para a cobrança poder ser gerada."), user.id);
    }
    return c;
  });
  return { contract: cid };
}, { role: "cliente" });

// RECUSAR (cliente) ou RETIRAR (freela) uma proposta que ainda espera resposta.
route("POST", "/api/proposals/:id/decline", ({ user, params }) => {
  const p = ownProposalAsClient(user, params.id);
  if (p.status !== "enviada") fail(409, "Essa proposta não está mais aguardando resposta.");
  run("UPDATE proposals SET status = 'recusada' WHERE id = ?", p.id);
  postMessage(threadFor(p.job_id, user.id, p.freela_id), null, "A proposta não foi escolhida desta vez. Obrigado pelo tempo dedicado.", user.id);
  return { ok: true };
}, { role: "cliente" });

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
  const cs = all(`SELECT c.*, j.title job_title, uc.name client_name, uf.name freela_name FROM contracts c
    JOIN jobs j ON j.id = c.job_id JOIN users uc ON uc.id = c.client_id JOIN users uf ON uf.id = c.freela_id
    WHERE c.client_id = ? OR c.freela_id = ? ORDER BY c.status = 'concluido', c.created_at DESC`, user.id, user.id);
  for (const c of cs) {
    c.milestones = all("SELECT * FROM milestones WHERE contract_id = ? ORDER BY pos", c.id);
    c.thread = threadFor(c.job_id, c.client_id, c.freela_id);
    const mine = one("SELECT rating, created_at FROM reviews WHERE contract_id = ? AND author_id = ?", c.id, user.id);
    const theirs = one("SELECT 1 FROM reviews WHERE contract_id = ? AND author_id != ?", c.id, user.id);
    c.review = { mine: mine ? mine.rating : 0, theirs: !!theirs, tags: REVIEW_TAGS[c.freela_id === user.id ? "cliente" : "freela"] };
  }
  const mine = cs.flatMap(c => c.milestones.map(m => ({ ...m, side: c.freela_id === user.id ? "freela" : "cliente" })));
  const sum = arr => arr.reduce((a, m) => a + m.value, 0);
  let paid, held, toPay;
  if (asaas.ENABLED) {
    paid = sum(mine.filter(m => m.pay_status === "liberado"));
    held = sum(mine.filter(m => m.pay_status === "pago"));
    toPay = sum(mine.filter(m => m.pay_status === "a_pagar" || m.pay_status === "aguardando"));
  } else {
    paid = sum(mine.filter(m => m.status === "aprovada")); held = sum(mine.filter(m => m.status !== "aprovada")); toPay = 0;
  }
  for (const c of cs) for (const m of c.milestones) { delete m.pay_id; }
  return { contracts: cs, stats: { paid, held, toPay, net: Math.round(paid * (1 - FEE)), fee: FEE, payments: asaas.ENABLED } };
});

// AS REGRAS DO JOGO DAS ETAPAS. Cada etapa anda por casinhas, como num tabuleiro:
//   pendente --(freela: começar)--> andamento --(freela: entregar)--> entregue
//   entregue --(cliente: aprovar)--> aprovada            (fim da etapa, dinheiro liberado)
//   entregue --(cliente: pedir ajustes)--> ajustes --(freela: começar)--> andamento ...
// "who" diz quem pode mexer, "from" de quais casinhas pode sair e "to" para qual vai.
// "msg" é a frase que aparece na conversa.
const MS_FLOW = {
  start: { who: "freela", from: ["pendente", "ajustes"], to: "andamento", msg: m => `Etapa "${m.title}" em andamento.` },
  deliver: { who: "freela", from: ["andamento"], to: "entregue", msg: m => `Etapa "${m.title}" entregue. Aguardando aprovação.` + (asaas.ENABLED ? ` Se não houver resposta em ${asaas.AUTO_RELEASE_DAYS} dias, o valor é liberado automaticamente.` : "") },
  approve: { who: "cliente", from: ["entregue"], to: "aprovada", msg: m => `Etapa "${m.title}" aprovada. ${brl(m.value)} liberado.` },
  changes: { who: "cliente", from: ["entregue"], to: "ajustes", msg: m => `Pedido de ajustes na etapa "${m.title}".` },
};
const MS_SELECT = "SELECT ms.*, c.client_id, c.freela_id, c.job_id, c.id cid FROM milestones ms JOIN contracts c ON c.id = ms.contract_id WHERE ms.id = ?";

// ABRIR O COFRE: quando a etapa é aprovada, pedimos ao Asaas para liberar o dinheiro guardado
// (escrow) para o freela. Tentamos com a chave da Osmo e, se precisar, com a do freela.
// libera a garantia (Conta Escrow) no Asaas; sem garantia ativa, não há o que liberar
async function releaseEscrow(m) {
  if (!asaas.ENABLED || m.pay_status !== "pago" || !m.pay_id) return;
  const acc = one("SELECT api_key_enc FROM payout_accounts WHERE user_id = ?", m.freela_id);
  const keys = [undefined]; if (acc) { try { keys.push(asaas.open(acc.api_key_enc)); } catch {} }
  let lastErr = null;
  for (const k of keys) {
    try {
      const e = await asaas.api.getPaymentEscrow(m.pay_id, k);
      const id = e && (e.id || (e.data && e.data[0] && e.data[0].id));
      if (!id || e.status === "DONE" || e.status === "FINISHED") return;
      await asaas.api.finishEscrow(id, k);
      return;
    } catch (err) { if (err.status === 404) return; lastErr = err; }
  }
  if (lastErr) throw new HttpError(502, "Não foi possível liberar o valor no Asaas: " + lastErr.message);
}

// MOVER A ETAPA DE CASINHA: grava a casinha nova, marca a data de entrega, marca o dinheiro
// como liberado, escreve na conversa e, se TODAS as etapas estiverem aprovadas, conclui o
// contrato e a vaga.
function applyMilestone(m, f, actorId, note, extraMsg) {
  tx(() => {
    run("UPDATE milestones SET status = ?, updated_at = datetime('now') WHERE id = ?", f.to, m.id);
    if (f.to === "entregue") run("UPDATE milestones SET delivered_at = datetime('now') WHERE id = ?", m.id);
    if (f.to === "aprovada" && asaas.ENABLED && m.pay_status === "pago") run("UPDATE milestones SET pay_status = 'liberado' WHERE id = ?", m.id);
    const th = threadFor(m.job_id, m.client_id, m.freela_id);
    postMessage(th, null, f.msg(m) + (extraMsg || ""), actorId);
    if (note) postMessage(th, actorId, note);
    const left = one("SELECT COUNT(*) n FROM milestones WHERE contract_id = ? AND status != 'aprovada'", m.cid).n;
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
    if (!f.from.includes(m.status)) fail(409, "Essa ação não vale para o estado atual da etapa.");
    if (action === "start" && asaas.ENABLED && m.pay_status !== "pago") fail(409, "Espere o cliente pagar esta etapa. O valor fica protegido antes de você começar.");
    if (action === "approve") await releaseEscrow(m);
    applyMilestone(m, f, user.id, str(body && body.note, 1000));
    return { ok: true };
  });
}

// LIBERAÇÃO AUTOMÁTICA: de hora em hora, procuramos etapas entregues há mais de 7 dias sem
// resposta do cliente e aprovamos sozinhos, liberando o dinheiro. Assim o freela nunca fica
// sem receber porque o cliente sumiu.
// liberação automática: etapa entregue sem resposta do cliente
async function autoRelease() {
  const due = all(`SELECT id FROM milestones WHERE status = 'entregue' AND delivered_at != '' AND delivered_at < datetime('now', ?)`, `-${asaas.AUTO_RELEASE_DAYS} days`);
  for (const { id } of due) {
    const m = one(MS_SELECT, id);
    try { await releaseEscrow(m); applyMilestone(m, MS_FLOW.approve, null, "", ` Liberação automática: ${asaas.AUTO_RELEASE_DAYS} dias sem resposta do cliente.`); }
    catch (e) { console.error("auto-release", id, e.message); }
  }
}
setInterval(() => autoRelease().catch(e => console.error("auto-release", e)), 3600_000).unref();

// ATIVAR CONTA DE RECEBIMENTO (freela): confere CPF/CNPJ, CEP, celular, data de nascimento e
// endereço, cria a subconta no Asaas e liga o cofre (escrow). A chave da subconta é guardada
// trancada (asaas.seal).
// --- pagamentos (Asaas)
route("POST", "/api/me/payout", async ({ user, body }) => {
  if (!asaas.ENABLED) fail(503, "Pagamentos ainda não estão ativos na plataforma.");
  if (one("SELECT 1 FROM payout_accounts WHERE user_id = ?", user.id)) fail(409, "Sua conta de recebimento já está ativa.");
  const doc = String(body.cpfCnpj || "").replace(/\D/g, "");
  if (!validDoc(doc)) fail(400, "CPF ou CNPJ inválido. Confira os números.");
  const cep = String(body.postalCode || "").replace(/\D/g, ""), phone = String(body.mobilePhone || "").replace(/\D/g, "");
  if (cep.length !== 8) fail(400, "Informe o CEP com 8 números.");
  if (phone.length < 10) fail(400, "Informe o celular com DDD.");
  const email = one("SELECT email FROM users WHERE id = ?", user.id).email;
  const payload = {
    name: str(body.name, 120) || user.name, email, cpfCnpj: doc, mobilePhone: phone, incomeValue: int(body.incomeValue, 1, 100_000_000),
    address: str(body.address, 120), addressNumber: str(body.addressNumber, 20), complement: str(body.complement, 60), province: str(body.province, 80), postalCode: cep,
  };
  if (doc.length === 11) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.birthDate || ""))) fail(400, "Informe a data de nascimento."); payload.birthDate = body.birthDate; }
  else payload.companyType = ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"].includes(body.companyType) ? body.companyType : "MEI";
  if (!payload.address || !payload.addressNumber || !payload.province) fail(400, "Complete o endereço: rua, número e bairro.");
  let acc;
  try { acc = await asaas.api.createSubaccount(payload); } catch (e) { fail(e.status === 400 ? 400 : 502, e.message); }
  if (!acc.walletId || !acc.apiKey) fail(502, "O Asaas não devolveu os dados da conta. Tente de novo.");
  let escrow = 0;
  try { await asaas.api.enableEscrow(acc.id, Math.max(30, asaas.AUTO_RELEASE_DAYS * 6)); escrow = 1; } catch (e) { console.error("escrow", e.message); }
  run("INSERT INTO payout_accounts (user_id, asaas_account_id, wallet_id, api_key_enc, escrow) VALUES (?,?,?,?,?)", user.id, String(acc.id || ""), acc.walletId, asaas.seal(acc.apiKey), escrow);
  run("UPDATE profiles SET cpf_cnpj = ? WHERE user_id = ?", doc, user.id);
  return { ok: true, escrow: !!escrow };
}, { role: "freela" });

// PAGAR UMA ETAPA (cliente):
// 1. confere se a etapa é dele e ainda não foi paga (se já tem cobrança aberta, devolve o link);
// 2. o freela precisa ter conta de recebimento e o cliente precisa ter CPF/CNPJ;
// 3. cadastra o cliente no Asaas (só na primeira vez);
// 4. cria a cobrança com vencimento em 3 dias e o SPLIT: 90% para o freela, 10% para a Osmo;
// 5. devolve o link da fatura, onde o cliente escolhe Pix, boleto ou cartão.
route("POST", "/api/milestones/:id/pay", async ({ user, params }) => {
  if (!asaas.ENABLED) fail(503, "Pagamentos ainda não estão ativos na plataforma.");
  const m = one(MS_SELECT, params.id);
  if (!m || m.client_id !== user.id) fail(404, "Etapa não encontrada.");
  if (m.pay_status === "aguardando" && m.invoice_url) return { invoiceUrl: m.invoice_url };
  if (m.pay_status !== "a_pagar") fail(409, "Esta etapa já foi paga.");
  const acc = one("SELECT wallet_id FROM payout_accounts WHERE user_id = ?", m.freela_id);
  if (!acc) fail(409, "O freelancer ainda não ativou a conta de recebimento. Avisamos na conversa.");
  const pr = one("SELECT cpf_cnpj, asaas_customer_id, company FROM profiles WHERE user_id = ?", user.id);
  if (!pr.cpf_cnpj) fail(400, "Informe seu CPF ou CNPJ em Meu perfil para gerar a cobrança.");
  let customer = pr.asaas_customer_id;
  if (!customer) {
    const u = one("SELECT name, email FROM users WHERE id = ?", user.id);
    try { customer = (await asaas.api.createCustomer({ name: pr.company || u.name, email: u.email, cpfCnpj: pr.cpf_cnpj, externalReference: "user:" + user.id, notificationDisabled: false })).id; }
    catch (e) { fail(e.status === 400 ? 400 : 502, e.message); }
    run("UPDATE profiles SET asaas_customer_id = ? WHERE user_id = ?", customer, user.id);
  }
  const job = one("SELECT title FROM jobs WHERE id = ?", m.job_id);
  let pay;
  try {
    pay = await asaas.api.createPayment({
      customer, billingType: "UNDEFINED", value: m.value, dueDate: dateBR(3),
      description: `Osmo Talents · ${job.title} · etapa: ${m.title}`.slice(0, 500), externalReference: "ms:" + m.id,
      split: [{ walletId: acc.wallet_id, percentualValue: 100 - asaas.FEE_PCT }],
    });
  } catch (e) { fail(e.status === 400 ? 400 : 502, e.message); }
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
  const payId = body.payment && str(body.payment.id, 80);
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
    const both = one("SELECT COUNT(*) n FROM reviews WHERE contract_id = ?", c.id).n === 2;
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
  return { threads: rows.map(t => ({ id: t.id, job: t.job_title || "Conversa direta", with: t.client_id === user.id ? t.freela_name : t.client_name,
    withId: t.client_id === user.id ? t.freela_id : t.client_id, withAvatar: avatarUrl(t.client_id === user.id ? t.freela_id : t.client_id, t.with_v),
    withVerified: t.client_id === user.id && !!t.freela_verified, last: t.last || "", unread: t.unread, updated_at: t.updated_at })) };
});

function threadAccess(user, id) {
  const t = one("SELECT * FROM threads WHERE id = ?", id);
  if (!t || (t.client_id !== user.id && t.freela_id !== user.id)) fail(404, "Conversa não encontrada.");
  return t;
}
route("GET", "/api/threads/:id", ({ user, params }) => {
  const t = threadAccess(user, params.id);
  run(`UPDATE threads SET ${t.client_id === user.id ? "client_read_at" : "freela_read_at"} = datetime('now') WHERE id = ?`, t.id);
  const other = profileOf(t.client_id === user.id ? t.freela_id : t.client_id);
  const job = t.job_id ? one("SELECT id, title FROM jobs WHERE id = ?", t.job_id) : null;
  const msgs = all("SELECT id, sender_id, body, created_at FROM messages WHERE thread_id = ? ORDER BY id LIMIT 500", t.id)
    .map(m => ({ ...m, mine: m.sender_id === user.id, system: m.sender_id === null }));
  return { thread: { id: t.id, pin: t.pin, job, with: other }, messages: msgs };
});
route("POST", "/api/threads/:id/messages", ({ user, params, body, ip }) => {
  limit("msg:" + user.id, 60, 60_000);
  const t = threadAccess(user, params.id);
  const text = str(body.body, 3000);
  if (!text) fail(400, "A mensagem está vazia.");
  postMessage(t.id, user.id, text);
  run(`UPDATE threads SET ${t.client_id === user.id ? "client_read_at" : "freela_read_at"} = datetime('now') WHERE id = ?`, t.id);
  return { ok: true };
});
route("PUT", "/api/threads/:id/pin", ({ user, params, body }) => {
  const t = threadAccess(user, params.id);
  run("UPDATE threads SET pin = ? WHERE id = ?", str(body.pin, 600), t.id);
  postMessage(t.id, null, `${user.name} atualizou o resumo do combinado.`, user.id);
  return { ok: true };
});
route("POST", "/api/threads", ({ user, body }) => {
  const other = one("SELECT id, role FROM users WHERE id = ?", int(body.withId));
  if (!other || other.role === user.role) fail(400, "Conversas são entre quem contrata e quem trabalha.");
  const th = user.role === "cliente" ? threadFor(null, user.id, other.id) : threadFor(null, other.id, user.id);
  return { thread: th };
});

// CARTEIRO PACIENTE: em vez de mandar um e-mail a cada mensagem (seria chato!), uma vez por
// minuto ele olha as conversas e só manda se:
// - tem coisa não lida há pelo menos 2 minutos sem nada novo (junta tudo num e-mail só);
// - não mandou e-mail daquela conversa nos últimos 15 minutos;
// - a pessoa quer avisos ("importante" = só avisos do sistema, sem conversa das pessoas).
// O link do rodapé usa um código pessoal (notifyToken) para mudar os avisos sem precisar entrar.
/* ---------------- avisos por e-mail ---------------- */
// Uma varredura por minuto: quem tem mensagens não lidas numa conversa recebe um e-mail só, com o resumo.
// Espera 2 minutos sem mensagens novas (junta tudo que chegou junto), pula quem já leu
// e manda no máximo um e-mail por conversa a cada 15 minutos.
// "importante" = só avisos do sistema (propostas, contratos, etapas, pagamentos); "tudo" inclui mensagens das pessoas.
const NOTIFY = ["tudo", "importante", "nada"];
function notifyToken(userId) {
  const u = one("SELECT notify_token FROM users WHERE id = ?", userId);
  if (u.notify_token) return u.notify_token;
  const t = crypto.randomBytes(24).toString("hex");
  run("UPDATE users SET notify_token = ? WHERE id = ?", t, userId);
  return t;
}
function notifySweep() {
  const pairs = all(`SELECT t.id thread_id, u.id user_id, u.name, u.email, u.notify_level, j.title job_title, n.last_at,
      CASE WHEN u.id = t.client_id THEN t.client_read_at ELSE t.freela_read_at END read_at
    FROM threads t JOIN users u ON u.id IN (t.client_id, t.freela_id) LEFT JOIN jobs j ON j.id = t.job_id
    LEFT JOIN notify_log n ON n.thread_id = t.id AND n.user_id = u.id
    WHERE t.updated_at > datetime('now', '-30 minutes') AND u.notify_level != 'nada'
      AND (n.last_at IS NULL OR n.last_at < datetime('now', '-15 minutes'))`);
  for (const p of pairs) {
    const msgs = all(`SELECT m.body, m.sender_id, m.created_at, s.name sender FROM messages m LEFT JOIN users s ON s.id = m.sender_id
      WHERE m.thread_id = ? AND (m.sender_id IS NULL OR m.sender_id != ?) AND m.created_at > ? AND m.created_at > ?
        AND m.created_at > datetime('now', '-30 minutes') ${p.notify_level === "importante" ? "AND m.sender_id IS NULL" : ""}
      ORDER BY m.id`, p.thread_id, p.user_id, p.read_at, p.last_at || "1970-01-01");
    if (!msgs.length || msgs.some(m => m.created_at > new Date(Date.now() - 120e3).toISOString().replace("T", " ").slice(0, 19))) continue;
    run("INSERT INTO notify_log (thread_id, user_id, last_at) VALUES (?,?,datetime('now')) ON CONFLICT(thread_id, user_id) DO UPDATE SET last_at = excluded.last_at", p.thread_id, p.user_id);
    sendNotice(p, msgs).catch(e => console.error(new Date().toISOString(), "aviso", e.message));
  }
}
async function sendNotice(p, msgs) {
  const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const link = `${PUBLIC_URL}/#mensagens-${p.thread_id}`, prefs = `${PUBLIC_URL}/#avisos-${notifyToken(p.user_id)}`;
  const people = [...new Set(msgs.filter(m => m.sender).map(m => m.sender))];
  const about = p.job_title ? `"${p.job_title}"` : "sua conversa";
  const subject = people.length && msgs.every(m => m.sender) ? `${people[0]} mandou mensagem sobre ${about}` : `Novidade em ${about}`;
  const shown = msgs.slice(-5), more = msgs.length - shown.length;
  const line = m => (m.sender ? `${m.sender}: ` : "") + (m.body.length > 400 ? m.body.slice(0, 400) + "…" : m.body);
  const first = p.name.split(" ")[0];
  const text = `Olá, ${first}.\n\n${more ? `(e mais ${more} mensagem${more > 1 ? "s" : ""} antes)\n` : ""}${shown.map(line).join("\n\n")}\n\nAbrir a conversa: ${link}\n\n--\nOsmo Talents. Para mudar ou desligar estes avisos: ${prefs}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;color:#1C0B12;max-width:520px">
<p>Olá, ${escHtml(first)}.</p>${more ? `<p style="color:#666">(e mais ${more} mensagem${more > 1 ? "s" : ""} antes)</p>` : ""}
${shown.map(m => `<p style="margin:0 0 12px;padding:12px 14px;border-radius:12px;background:#F6EEF1">${m.sender ? `<b>${escHtml(m.sender)}</b><br>` : ""}${escHtml(line({ ...m, sender: "" })).replace(/\n/g, "<br>")}</p>`).join("")}
<p><a href="${link}" style="display:inline-block;background:#7A0B3C;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Abrir conversa</a></p>
<p style="color:#666;font-size:13px">Osmo Talents · <a href="${prefs}" style="color:#666">Mudar ou desligar estes avisos</a></p></div>`;
  await mail.send({ to: p.email, subject, text, html, headers: { "List-Unsubscribe": `<${prefs}>` } });
}
if (mail.ENABLED) setInterval(() => { try { notifySweep(); } catch (e) { console.error("aviso", e); } }, 60_000).unref();

// Rotas desse link do rodapé: ver e trocar a preferência de avisos.
// preferências pelo link do e-mail (sem precisar entrar na conta)
const byNotifyToken = t => /^[a-f0-9]{48}$/.test(String(t || "")) ? one("SELECT id, name, notify_level FROM users WHERE notify_token = ?", String(t)) : null;
route("GET", "/api/notify", ({ query }) => {
  const u = byNotifyToken(query.get("token"));
  if (!u) fail(404, "Esse link não funciona mais. Entre na sua conta e ajuste os avisos em Meu perfil.");
  return { name: u.name, level: u.notify_level };
}, { auth: false });
route("POST", "/api/notify", ({ body }) => {
  const u = byNotifyToken(body.token);
  if (!u) fail(404, "Esse link não funciona mais. Entre na sua conta e ajuste os avisos em Meu perfil.");
  if (!NOTIFY.includes(body.level)) fail(400, "Escolha uma opção.");
  run("UPDATE users SET notify_level = ? WHERE id = ?", body.level, u.id);
  return { level: body.level };
}, { auth: false });

// O CAMINHO DO "ENTRAR COM GOOGLE" (a parte do servidor):
// - /auth/google: guarda o bilhete secreto (state) no banco e num cookie e manda a pessoa ao Google;
// - /auth/google/callback: a volta. Confere se o bilhete é o mesmo, troca o código pelos dados
//   da pessoa e decide:
//   * já conhecemos essa conta do Google? entra direto;
//   * o e-mail (confirmado pelo Google) já tem conta aqui? liga as duas e entra;
//   * é gente nova? cria a conta (se já escolheu freela/cliente) ou manda escolher.
// Qualquer problema volta para a tela de entrar com um código de erro.
/* ---------------- login social (/auth/...) ---------------- */
function createOAuthUser(r, role) {
  if (one("SELECT 1 FROM users WHERE email = ?", r.email)) fail(409, "Já existe uma conta com esse e-mail. Entre com e-mail e senha.");
  const name = r.name || r.email.split("@")[0];
  const uid = Number(run("INSERT INTO users (name, email, pass_hash, role) VALUES (?,?,?,?)", name.slice(0, 80), r.email, "oauth$" + r.provider, role).lastInsertRowid);
  run("INSERT INTO profiles (user_id) VALUES (?)", uid);
  run("INSERT INTO oauth_identities (provider, sub, user_id, email) VALUES (?,?,?,?)", r.provider, r.sub, uid, r.email);
  return uid;
}
function redirect(res, to) { res.writeHead(302, { ...SECURITY_HEADERS, Location: to, "Cache-Control": "no-store" }); res.end(); }
const stateCookie = (v, age) => `osmo_oauth=${v}; Path=/auth; HttpOnly; Max-Age=${age}; SameSite=Lax${COOKIE_SECURE ? "; Secure" : ""}`;
async function handleAuth(req, res, url, ip) {
  const m = url.pathname.match(/^\/auth\/(google|linkedin|adobe|github)(\/callback)?$/);
  const fail2 = code => redirect(res, `/?oauth_error=${code}#entrar`);
  if (!m) return send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" });
  const k = m[1];
  if (!oauth.enabled(k)) return fail2("indisponivel");
  if (!m[2]) {
    if (req.method !== "GET") return send(res, 405, "Método não permitido");
    try { limit("oauth:" + ip, 30, 600_000); } catch { return fail2("tentativas"); }
    const role = ["freela", "cliente"].includes(url.searchParams.get("role")) ? url.searchParams.get("role") : "";
    const s = oauth.start(k);
    run("DELETE FROM oauth_states WHERE created_at < datetime('now', '-15 minutes')");
    run("INSERT INTO oauth_states (state, provider, verifier, nonce, role) VALUES (?,?,?,?,?)", s.state, k, s.verifier, s.nonce, role);
    appendCookie(res, stateCookie(s.state, 600));
    return redirect(res, s.url);
  }
  // retorno do provedor
  if (req.method !== "GET") return send(res, 405, "Método não permitido");
  const params = url.searchParams;
  appendCookie(res, stateCookie("", 0));
  if (params.get("error")) return fail2(params.get("error") === "access_denied" || params.get("error") === "user_cancelled_authorize" ? "cancelado" : "falhou");
  const state = params.get("state") || "", code = params.get("code") || "";
  const saved = /^[a-f0-9]{48}$/.test(state) ? one("SELECT * FROM oauth_states WHERE state = ? AND provider = ? AND created_at > datetime('now', '-15 minutes')", state, k) : null;
  const cookie = readCookie(req, "osmo_oauth");
  if (!saved || !code || cookie !== state) return fail2("expirou");
  run("DELETE FROM oauth_states WHERE state = ?", state);
  let prof;
  try { prof = await oauth.finish(k, code, saved); }
  catch (e) { console.error("oauth", k, e.message); return fail2("falhou"); }

  let uid = (one("SELECT user_id FROM oauth_identities WHERE provider = ? AND sub = ?", k, prof.sub) || {}).user_id;
  if (!uid && prof.email && prof.emailVerified) {
    const u = one("SELECT id FROM users WHERE email = ?", prof.email);
    if (u) { uid = u.id; run("INSERT OR IGNORE INTO oauth_identities (provider, sub, user_id, email) VALUES (?,?,?,?)", k, prof.sub, uid, prof.email); }
  }
  if (!uid) {
    if (!prof.email || !prof.emailVerified) return fail2("sem_email");
    const r = { provider: k, sub: prof.sub, email: prof.email, name: prof.name };
    if (saved.role) { try { uid = tx(() => createOAuthUser(r, saved.role)); } catch { return fail2("falhou"); } createSession(res, uid); return redirect(res, saved.role === "freela" ? "/#perfil" : "/#publicar"); }
    const token = crypto.randomBytes(24).toString("hex");
    run("INSERT INTO oauth_pending (token, provider, sub, email, name) VALUES (?,?,?,?,?)", token, k, prof.sub, prof.email, prof.name);
    return redirect(res, `/#escolher-${token}`);
  }
  createSession(res, uid);
  return redirect(res, "/#painel");
}

// MIME: a "etiqueta" que diz ao navegador que tipo de arquivo está chegando (página, estilo,
// script, imagem...). Sem a etiqueta certa, o navegador pode não saber o que fazer.
/* ---------------- servidor ---------------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

// CAPACETES DE SEGURANÇA que vão em toda resposta:
// - nosniff: o navegador não "adivinha" tipo de arquivo;
// - X-Frame-Options DENY: ninguém coloca nosso site escondido dentro do site deles;
// - Permissions-Policy: o site não pede câmera, microfone nem localização;
// - Content-Security-Policy: a lista de lugares de onde a página pode carregar coisas.
//   Se alguém conseguir enfiar um script malvado, o navegador se recusa a rodar.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

// Responde ao navegador: se for objeto, vira JSON; sempre com os capacetes de segurança.
function send(res, status, data, headers = {}) {
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, { ...SECURITY_HEADERS, ...(typeof data === "object" && !Buffer.isBuffer(data) ? { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } : {}), ...headers });
  res.end(body);
}

// LER O QUE O NAVEGADOR MANDOU: readRaw lê arquivos (PDF, anexos) até um tamanho máximo;
// readBody lê o JSON dos formulários (até 200 KB) e avisa se vier quebrado ou grande demais.
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    // passou do limite: descarta o resto mas lê até o fim, para conseguir responder com a mensagem certa
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size <= max) chunks.push(c); else chunks.length = 0; });
    req.on("end", () => size > max ? reject(new HttpError(413, `Arquivo grande demais. O limite é ${Math.round(max / 1048576)} MB.`)) : resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function readBody(req, max = 200_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > max) { reject(new HttpError(413, "Conteúdo grande demais.")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "JSON inválido.")); } });
    req.on("error", reject);
  });
}

// ARQUIVOS DO SITE (HTML, CSS, JS): serveStatic entrega o arquivo pedido da pasta public.
// - Endereços sem extensão (#vagas, /perfil...) recebem o index.html: o resto o app.js resolve;
// - path.normalize + startsWith impede truques como "/../../senhas" para sair da pasta;
// - ETag é a "impressão digital" do arquivo: se o navegador já tem a mesma, respondemos
//   "304, nada mudou" e economizamos internet;
// - no HTML, colocamos "?v=..." no endereço do CSS e do JS. Quando o arquivo muda, o número
//   muda, e o navegador baixa a versão nova em vez de usar a velha guardada.
// carimbo de versão de cada arquivo (data de modificação): vai no endereço do arquivo e em /api/me,
// para a página aberta perceber que saiu versão nova
const stamp = name => { try { return Math.floor(fs.statSync(path.join(PUBLIC_DIR, name)).mtimeMs).toString(36); } catch { return "0"; } };
const appVersion = () => stamp("app.js") + "." + stamp("styles.css");
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/privacidade" || rel === "/termos") rel += ".html";
  else if (rel === "/" || !path.extname(rel)) rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "Proibido");
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" });
    const ext = path.extname(file);
    // o navegador sempre confere se há versão nova; se nada mudou, responde 304 sem reenviar o arquivo
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": [".svg", ".png", ".jpg", ".ico", ".woff2"].includes(ext) ? "public, max-age=86400" : "no-cache", "ETag": etag };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, { ...SECURITY_HEADERS, ...headers }); return res.end(); }
    if (ext === ".html") {
      // carimba app.js, theme.js e styles.css com a data do arquivo: navegador e Cloudflare sempre pegam a versão nova
      return fs.readFile(file, "utf8", (err2, html) => {
        if (err2) return send(res, 404, "Não encontrado");
        html = html.replace(/(src|href)="\/(app\.js|theme\.js|styles\.css|fonts\.css)"/g, (m, attr, name) => `${attr}="/${name}?v=${stamp(name)}"`);
        send(res, 200, html, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
      });
    }
    fs.readFile(file, (err2, buf) => err2 ? send(res, 404, "Não encontrado") : send(res, 200, buf, headers));
  });
}

// O PORTEIRO: TODO pedido que chega passa por aqui e é encaminhado:
// 1. /auth/... -> login social;
// 2. /arquivo/N -> anexo da vaga; /avatar/N e /portfolio/N -> imagens;
// 3. qualquer outro endereço fora de /api/ -> arquivos do site;
// 4. /api/... -> procura a rota certa no cardápio e, antes de chamar:
//    - CSRF: pedidos que mudam algo precisam do cabeçalho "x-osmo: 1", que só o nosso
//      próprio site manda (um site malvado não consegue fingir isso);
//    - descobre quem é a pessoa pelo crachá; barra quem não está logado ou não tem o papel certo;
//    - lê o corpo do pedido, chama a rota e responde.
//    Erros esperados viram mensagens amigáveis; erros inesperados viram "algo deu errado"
//    (e o detalhe vai só para o registro do servidor, nunca para a pessoa).
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // o nginx acrescenta o IP real no fim de X-Forwarded-For; o começo pode vir do próprio visitante
  const ip = (req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress;
  if (url.pathname.startsWith("/auth/")) {
    return handleAuth(req, res, url, ip).catch(e => { console.error("auth", e); if (!res.headersSent) redirect(res, "/?oauth_error=falhou#entrar"); });
  }
  const fm = url.pathname.match(/^\/arquivo\/(\d+)$/);
  if (fm && (req.method === "GET" || req.method === "HEAD")) return serveFile(req, res, Number(fm[1]));
  const av = url.pathname.match(/^\/(avatar|portfolio)\/(\d+)$/);
  if (av && (req.method === "GET" || req.method === "HEAD")) {
    const a = av[1] === "avatar" ? one("SELECT mime, data, v FROM avatars WHERE user_id = ?", Number(av[2]))
      : one("SELECT mime, image data, v FROM portfolio_items WHERE id = ? AND v > 0", Number(av[2]));
    if (!a) return send(res, 404, "Não encontrado", { "Content-Type": "text/plain; charset=utf-8" });
    // o endereço muda (?v=) a cada foto nova, então pode ficar em cache por muito tempo
    return send(res, 200, Buffer.from(a.data), { "Content-Type": a.mime, "Cache-Control": url.searchParams.get("v") === String(a.v) ? "public, max-age=31536000, immutable" : "no-cache" });
  }
  if (!url.pathname.startsWith("/api/")) {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Método não permitido");
    return serveStatic(req, res, url.pathname);
  }
  try {
    // proteção CSRF: toda escrita exige o cabeçalho próprio do app (formulários de outros sites não conseguem enviá-lo)
    if (req.method !== "GET" && req.headers["x-osmo"] !== "1" && url.pathname !== "/api/webhooks/asaas") fail(403, "Requisição recusada.");
    const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!r) fail(404, "Rota não encontrada.");
    const m = url.pathname.match(r.re); const params = {}; r.keys.forEach((k, i) => params[k] = Number(m[i + 1]));
    const user = currentUser(req);
    if (r.auth && !user) fail(401, "Entre na sua conta para continuar.");
    if (r.role && user.role !== r.role) fail(403, r.role === "cliente" ? "Esta ação é para contas de cliente." : "Esta ação é para contas de freelancer.");
    const body = req.method === "GET" ? {} : r.raw ? await readRaw(req, r.raw) : await readBody(req, url.pathname === "/api/me/avatar" ? 800_000 : url.pathname.startsWith("/api/me/portfolio") ? 2_200_000 : 200_000);
    const out = await r.handler({ req, res, user, params, body, query: url.searchParams, ip });
    send(res, 200, out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(new Date().toISOString(), req.method, url.pathname, e);
    send(res, 500, { error: "Algo deu errado do nosso lado. Tente de novo em instantes." });
  }
});

// Liga o servidor (só quando este arquivo é rodado direto; scripts como o seed só pegam
// as ferramentas emprestadas sem ligar o servidor).
if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`Osmo Talents rodando em http://${HOST}:${PORT}`));
}
module.exports = { server, hashPassword, clarity, autoRelease, notifySweep };
