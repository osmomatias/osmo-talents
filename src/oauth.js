// Login com Google, LinkedIn, Adobe e GitHub (OAuth 2.0 / OpenID Connect, sem dependências)
const crypto = require("node:crypto");

const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const TEST_BASE = process.env.OAUTH_TEST_BASE || ""; // só para testes locais: troca o endereço dos provedores

const P = {
  google: {
    name: "Google", issuer: ["https://accounts.google.com", "accounts.google.com"],
    auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo", scope: "openid email profile",
    id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, pkce: true, nonce: true, extra: { prompt: "select_account" },
  },
  linkedin: {
    name: "LinkedIn", issuer: ["https://www.linkedin.com/oauth"],
    auth: "https://www.linkedin.com/oauth/v2/authorization", token: "https://www.linkedin.com/oauth/v2/accessToken",
    userinfo: "https://api.linkedin.com/v2/userinfo", scope: "openid profile email",
    id: process.env.LINKEDIN_CLIENT_ID, secret: process.env.LINKEDIN_CLIENT_SECRET, pkce: false, nonce: true,
  },
  adobe: {
    name: "Adobe", issuer: ["https://ims-na1.adobelogin.com"],
    auth: "https://ims-na1.adobelogin.com/ims/authorize/v2", token: "https://ims-na1.adobelogin.com/ims/token/v3",
    userinfo: "https://ims-na1.adobelogin.com/ims/userinfo/v2", scope: "openid,AdobeID,email,profile",
    id: process.env.ADOBE_CLIENT_ID, secret: process.env.ADOBE_CLIENT_SECRET, pkce: true, nonce: true, basicAuth: true,
  },
  github: {
    name: "GitHub", issuer: [],
    auth: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token",
    userinfo: "https://api.github.com/user", emails: "https://api.github.com/user/emails", scope: "read:user user:email",
    id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET, pkce: false, nonce: false, github: true,
  },
};
if (TEST_BASE) for (const [k, p] of Object.entries(P)) for (const f of ["auth", "token", "userinfo", "emails"]) if (p[f]) p[f] = `${TEST_BASE}/${k}/${f}`;

const ORDER = ["google", "linkedin", "adobe", "github"];
const enabled = k => { const p = P[k]; return !!(p && p.id && p.secret && PUBLIC_URL); };
const list = () => ORDER.filter(enabled);
const redirectUri = k => `${PUBLIC_URL}/auth/${k}/callback`;
const b64u = buf => Buffer.from(buf).toString("base64url");

function start(k) {
  const p = P[k];
  const state = crypto.randomBytes(24).toString("hex");
  const verifier = p.pkce ? crypto.randomBytes(48).toString("base64url") : "";
  const nonce = p.nonce ? crypto.randomBytes(16).toString("hex") : "";
  const q = new URLSearchParams({ client_id: p.id, redirect_uri: redirectUri(k), response_type: "code", scope: p.scope, state, ...(p.extra || {}) });
  if (nonce) q.set("nonce", nonce);
  if (verifier) { q.set("code_challenge", b64u(crypto.createHash("sha256").update(verifier).digest())); q.set("code_challenge_method", "S256"); }
  return { url: `${p.auth}?${q}`, state, verifier, nonce };
}

function decodeJwt(t) {
  try { return JSON.parse(Buffer.from(String(t).split(".")[1], "base64url").toString("utf8")); } catch { return null; }
}

async function postForm(url, form, headers = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers }, body: new URLSearchParams(form), signal: AbortSignal.timeout(15000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || `HTTP ${r.status}`);
  return d;
}

// troca o código pelo perfil verificado da pessoa
async function finish(k, code, saved) {
  const p = P[k];
  const form = { grant_type: "authorization_code", code, redirect_uri: redirectUri(k) };
  const headers = {};
  if (p.basicAuth) { headers.Authorization = "Basic " + Buffer.from(`${p.id}:${p.secret}`).toString("base64"); }
  else { form.client_id = p.id; form.client_secret = p.secret; }
  if (saved.verifier) { form.code_verifier = saved.verifier; form.client_id = p.id; }
  const tok = await postForm(p.token, form, headers);
  if (!tok.access_token) throw new Error(tok.error_description || tok.error || "sem access_token");

  if (p.github) {
    // GitHub não usa OpenID: lemos o perfil e a lista de e-mails pela API
    const h = { Authorization: `Bearer ${tok.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "osmo-talents" };
    const get = async u => { const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`github HTTP ${r.status}`); return r.json(); };
    const [user, emails] = await Promise.all([get(p.userinfo), get(p.emails)]);
    const list = Array.isArray(emails) ? emails : [];
    const primary = list.find(e => e.primary && e.verified) || list.find(e => e.verified);
    if (!user || !user.id) throw new Error("perfil do GitHub incompleto");
    return { sub: String(user.id), email: primary ? String(primary.email).toLowerCase() : "", emailVerified: !!primary, name: String(user.name || user.login || "").trim() };
  }

  // id_token recebido direto do provedor por TLS: conferimos destinatário, validade e nonce
  const claims = tok.id_token ? decodeJwt(tok.id_token) : null;
  if (claims) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(p.id)) throw new Error("id_token para outro aplicativo");
    if (claims.exp && claims.exp * 1000 < Date.now() - 60000) throw new Error("id_token expirado");
    if (!TEST_BASE && claims.iss && !p.issuer.includes(claims.iss)) throw new Error("emissor inesperado");
    if (saved.nonce && claims.nonce && claims.nonce !== saved.nonce) throw new Error("nonce não confere");
  }
  const r = await fetch(p.userinfo, { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`userinfo HTTP ${r.status}`);
  const src = { ...(claims || {}), ...(await r.json()) };
  const name = src.name || [src.given_name, src.family_name].filter(Boolean).join(" ");
  const sub = String(src.sub || "");
  if (!sub) throw new Error("identificador ausente");
  return { sub, email: String(src.email || "").toLowerCase(), emailVerified: src.email_verified === true || src.email_verified === "true", name: String(name).trim() };
}

module.exports = { P, enabled, list, start, finish };
