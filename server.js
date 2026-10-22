// Osmo Talents: servidor HTTP nativo (node:http) + API REST + SQLite
// Requer Node.js 22.13 ou mais novo.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { one, all, run, tx } = require("./src/db");
const asaas = require("./src/asaas");
const oauth = require("./src/oauth");
const mail = require("./src/mail");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const PUBLIC_DIR = path.join(__dirname, "public");
const FEE = asaas.FEE_PCT / 100; // taxa da plataforma (FEE_PCT no .env)
const SESSION_DAYS = 30;

const CATS = ["design", "dev", "texto", "dados"];
const ENERGY = ["baixa", "media", "alta"];

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

function clarity(j) {
  const checks = [
    j.title.length > 8, CATS.includes(j.cat), j.obj.length > 20, j.ent.length >= 2,
    j.fora.length >= 1, j.com.length > 3, j.fb.length > 3, j.budget > 0, j.duration.length > 1,
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

// limite de propostas abertas pela capacidade declarada
function proposalCap(user, hours) {
  let cap = Math.max(2, Math.floor((hours || 20) / 5));
  if (user.energy === "baixa") cap = Math.max(1, cap - 2);
  if (user.energy === "alta") cap += 1;
  return cap;
}

/* ---------------- rate limit simples ---------------- */
const hits = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  const h = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (h.length >= max) fail(429, "Muitas tentativas. Espere alguns minutos e tente de novo.");
  h.push(now); hits.set(key, h);
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 3600_000)) hits.delete(k); }, 600_000).unref();

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
  return one("SELECT id, name, email, role, energy FROM users WHERE id = ?", s.user_id) || null;
}
function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)", sha(token), userId, exp);
  run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
  appendCookie(res, sessionCookie(token, SESSION_DAYS * 86400));
}

/* ---------------- formatação ---------------- */
function profileOf(userId) {
  const u = one("SELECT u.id, u.name, u.role, p.* FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?", userId);
  if (!u) return null;
  const stats = one("SELECT COUNT(*) n FROM contracts WHERE freela_id = ? AND status = 'concluido'", userId);
  return {
    id: u.id, name: u.name, role: u.role, title: u.title || "", bio: u.bio || "", location: u.location || "",
    rate: u.rate || 0, hours: u.hours || 20, skills: parse(u.skills || "[]"), portfolio: parse(u.portfolio || "[]"),
    how: { com: u.ws_com || "", resp: u.ws_resp || "", fb: u.ws_fb || "", foco: u.ws_foco || "" },
    tag: u.tag || "", company: u.company || "", done: stats.n,
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

/* ---------------- rotas ---------------- */
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = []; const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "(\\d+)"; }) + "$");
  routes.push({ method, re, keys, handler, auth: opts.auth !== false, role: opts.role });
};

// --- autenticação
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

route("POST", "/api/auth/login", ({ body, res, ip }) => {
  limit("login:" + ip, 10, 600_000);
  const email = str(body.email, 160).toLowerCase(), password = typeof body.password === "string" ? body.password : "";
  const u = one("SELECT id, pass_hash FROM users WHERE email = ?", email);
  if (!u || !checkPassword(password, u.pass_hash)) fail(401, "E-mail ou senha não conferem.");
  createSession(res, u.id);
  return { ok: true };
}, { auth: false });

route("POST", "/api/auth/logout", ({ req, res }) => {
  const tok = readCookie(req, "osmo_sid");
  if (tok) run("DELETE FROM sessions WHERE token_hash = ?", sha(tok));
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  return { ok: true };
}, { auth: false });

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

route("GET", "/api/me", ({ user }) => {
  const pub = { payments: { enabled: asaas.ENABLED, fee: asaas.FEE_PCT, autoRelease: asaas.AUTO_RELEASE_DAYS }, oauth: oauth.list(), mail: mail.ENABLED };
  if (!user) return { user: null, ...pub };
  const unread = one(`SELECT COUNT(*) n FROM messages m JOIN threads t ON t.id = m.thread_id
    WHERE (t.client_id = ? AND m.created_at > t.client_read_at OR t.freela_id = ? AND m.created_at > t.freela_read_at)
    AND (m.sender_id IS NULL OR m.sender_id != ?)`, user.id, user.id, user.id).n;
  const pr = one("SELECT cpf_cnpj FROM profiles WHERE user_id = ?", user.id) || {};
  const payout = one("SELECT wallet_id, escrow FROM payout_accounts WHERE user_id = ?", user.id);
  return { user: { ...user, profile: profileOf(user.id), unread, hasDoc: !!pr.cpf_cnpj, payout: payout ? { active: true, escrow: !!payout.escrow } : null },
    ...pub };
}, { auth: false });

route("PUT", "/api/me/profile", ({ user, body }) => {
  const how = body.how || {};
  run(`UPDATE profiles SET title=?, bio=?, location=?, rate=?, hours=?, skills=?, portfolio=?, ws_com=?, ws_resp=?, ws_fb=?, ws_foco=?, tag=?, company=? WHERE user_id=?`,
    str(body.title, 100), str(body.bio, 1200), str(body.location, 80), int(body.rate, 0, 100000), int(body.hours, 1, 60),
    JSON.stringify(list(body.skills, 12, 40)), JSON.stringify(list(body.portfolio, 12, 80)),
    str(how.com, 200), str(how.resp, 200), str(how.fb, 200), str(how.foco, 200), str(body.tag, 80), str(body.company, 100), user.id);
  const name = str(body.name, 80);
  if (name.length >= 2) run("UPDATE users SET name = ? WHERE id = ?", name, user.id);
  if (typeof body.cpfCnpj === "string" && body.cpfCnpj.trim()) {
    const doc = body.cpfCnpj.replace(/\D/g, "");
    if (!validDoc(doc)) fail(400, "CPF ou CNPJ inválido. Confira os números.");
    run("UPDATE profiles SET cpf_cnpj = ?, asaas_customer_id = '' WHERE user_id = ?", doc, user.id);
  }
  return { profile: profileOf(user.id) };
});

route("PUT", "/api/me/energy", ({ user, body }) => {
  if (!ENERGY.includes(body.energy)) fail(400, "Escolha baixa, média ou alta.");
  run("UPDATE users SET energy = ? WHERE id = ?", body.energy, user.id);
  return { ok: true };
});

// --- talentos
route("GET", "/api/talents", ({ query }) => {
  const q = str(query.get("q") || "", 80).toLowerCase();
  const rows = all("SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.role = 'freela' ORDER BY (p.title != '') DESC, u.id DESC LIMIT 200");
  let out = rows.map(r => profileOf(r.id));
  if (q) out = out.filter(t => [t.name, t.title, t.bio, t.skills.join(" "), t.how.com].join(" ").toLowerCase().includes(q));
  return { talents: out };
}, { auth: false });

route("GET", "/api/talents/:id", ({ params }) => {
  const t = profileOf(params.id);
  if (!t || t.role !== "freela") fail(404, "Perfil não encontrado.");
  return { talent: t };
}, { auth: false });

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

route("GET", "/api/jobs/:id", ({ params, user }) => {
  const j = one(JOB_SELECT + " WHERE j.id = ?", params.id);
  if (!j) fail(404, "Vaga não encontrada.");
  const out = { job: jobOut(j) };
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

route("POST", "/api/jobs/:id/close", ({ user, params }) => {
  const j = one("SELECT * FROM jobs WHERE id = ? AND client_id = ?", params.id, user.id);
  if (!j) fail(404, "Vaga não encontrada.");
  run("UPDATE jobs SET status = 'fechada' WHERE id = ?", j.id);
  return { ok: true };
}, { role: "cliente" });

route("POST", "/api/jobs/:id/invite", ({ user, params, body }) => {
  const j = one("SELECT * FROM jobs WHERE id = ? AND client_id = ? AND status = 'aberta'", params.id, user.id);
  if (!j) fail(404, "Vaga aberta não encontrada.");
  const t = one("SELECT id FROM users WHERE id = ? AND role = 'freela'", int(body.talentId));
  if (!t) fail(404, "Talento não encontrado.");
  const th = threadFor(j.id, user.id, t.id);
  postMessage(th, null, `${user.name} convidou você para a vaga "${j.title}". Leia o briefing e, se fizer sentido, envie uma proposta.`, user.id);
  return { thread: th };
}, { role: "cliente" });

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

route("GET", "/api/me/proposals", ({ user }) => {
  const prof = one("SELECT hours FROM profiles WHERE user_id = ?", user.id);
  const rows = all(`SELECT pr.*, j.title job_title, u.name client_name FROM proposals pr JOIN jobs j ON j.id = pr.job_id JOIN users u ON u.id = j.client_id
    WHERE pr.freela_id = ? ORDER BY pr.created_at DESC`, user.id);
  return { proposals: rows, cap: proposalCap(user, prof && prof.hours), open: rows.filter(r => r.status === "enviada").length };
}, { role: "freela" });

function ownProposalAsClient(user, id) {
  const p = one("SELECT pr.*, j.client_id, j.title job_title, j.status job_status FROM proposals pr JOIN jobs j ON j.id = pr.job_id WHERE pr.id = ?", id);
  if (!p || p.client_id !== user.id) fail(404, "Proposta não encontrada.");
  return p;
}
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

// --- contratos e etapas
route("GET", "/api/contracts", ({ user }) => {
  const cs = all(`SELECT c.*, j.title job_title, uc.name client_name, uf.name freela_name FROM contracts c
    JOIN jobs j ON j.id = c.job_id JOIN users uc ON uc.id = c.client_id JOIN users uf ON uf.id = c.freela_id
    WHERE c.client_id = ? OR c.freela_id = ? ORDER BY c.status = 'concluido', c.created_at DESC`, user.id, user.id);
  for (const c of cs) {
    c.milestones = all("SELECT * FROM milestones WHERE contract_id = ? ORDER BY pos", c.id);
    c.thread = threadFor(c.job_id, c.client_id, c.freela_id);
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

const MS_FLOW = {
  start: { who: "freela", from: ["pendente", "ajustes"], to: "andamento", msg: m => `Etapa "${m.title}" em andamento.` },
  deliver: { who: "freela", from: ["andamento"], to: "entregue", msg: m => `Etapa "${m.title}" entregue. Aguardando aprovação.` + (asaas.ENABLED ? ` Se não houver resposta em ${asaas.AUTO_RELEASE_DAYS} dias, o valor é liberado automaticamente.` : "") },
  approve: { who: "cliente", from: ["entregue"], to: "aprovada", msg: m => `Etapa "${m.title}" aprovada. ${brl(m.value)} liberado.` },
  changes: { who: "cliente", from: ["entregue"], to: "ajustes", msg: m => `Pedido de ajustes na etapa "${m.title}".` },
};
const MS_SELECT = "SELECT ms.*, c.client_id, c.freela_id, c.job_id, c.id cid FROM milestones ms JOIN contracts c ON c.id = ms.contract_id WHERE ms.id = ?";

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

// --- mensagens
route("GET", "/api/threads", ({ user }) => {
  const rows = all(`SELECT t.*, j.title job_title, uc.name client_name, uf.name freela_name,
      (SELECT body FROM messages WHERE thread_id = t.id ORDER BY id DESC LIMIT 1) last,
      (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id AND (m.sender_id IS NULL OR m.sender_id != ?)
         AND m.created_at > CASE WHEN t.client_id = ? THEN t.client_read_at ELSE t.freela_read_at END) unread
    FROM threads t LEFT JOIN jobs j ON j.id = t.job_id JOIN users uc ON uc.id = t.client_id JOIN users uf ON uf.id = t.freela_id
    WHERE t.client_id = ? OR t.freela_id = ? ORDER BY t.updated_at DESC`, user.id, user.id, user.id, user.id);
  return { threads: rows.map(t => ({ id: t.id, job: t.job_title || "Conversa direta", with: t.client_id === user.id ? t.freela_name : t.client_name,
    withId: t.client_id === user.id ? t.freela_id : t.client_id, last: t.last || "", unread: t.unread, updated_at: t.updated_at })) };
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

/* ---------------- servidor ---------------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function send(res, status, data, headers = {}) {
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, { ...SECURITY_HEADERS, ...(typeof data === "object" && !Buffer.isBuffer(data) ? { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } : {}), ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 200_000) { reject(new HttpError(413, "Conteúdo grande demais.")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "JSON inválido.")); } });
    req.on("error", reject);
  });
}

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
      // carimba app.js e styles.css com a data do arquivo: navegador e Cloudflare sempre pegam a versão nova
      return fs.readFile(file, "utf8", (err2, html) => {
        if (err2) return send(res, 404, "Não encontrado");
        const stamp = name => { try { return Math.floor(fs.statSync(path.join(PUBLIC_DIR, name)).mtimeMs).toString(36); } catch { return "0"; } };
        html = html.replace(/(src|href)="\/(app\.js|styles\.css|fonts\.css)"/g, (m, attr, name) => `${attr}="/${name}?v=${stamp(name)}"`);
        send(res, 200, html, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
      });
    }
    fs.readFile(file, (err2, buf) => err2 ? send(res, 404, "Não encontrado") : send(res, 200, buf, headers));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // o nginx acrescenta o IP real no fim de X-Forwarded-For; o começo pode vir do próprio visitante
  const ip = (req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress;
  if (url.pathname.startsWith("/auth/")) {
    return handleAuth(req, res, url, ip).catch(e => { console.error("auth", e); if (!res.headersSent) redirect(res, "/?oauth_error=falhou#entrar"); });
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
    const body = req.method === "GET" ? {} : await readBody(req);
    const out = await r.handler({ req, res, user, params, body, query: url.searchParams, ip });
    send(res, 200, out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(new Date().toISOString(), req.method, url.pathname, e);
    send(res, 500, { error: "Algo deu errado do nosso lado. Tente de novo em instantes." });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`Osmo Talents rodando em http://${HOST}:${PORT}`));
}
module.exports = { server, hashPassword, clarity, autoRelease };
