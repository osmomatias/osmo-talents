// Login com Google, Apple, LinkedIn e Adobe (OAuth 2.0 / OpenID Connect, sem dependências)
const crypto = require("node:crypto");
const fs = require("node:fs");

const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const TEST_BASE = process.env.OAUTH_TEST_BASE || ""; // só para testes locais: troca o endereço dos provedores

function appleKey() {
  if (process.env.APPLE_PRIVATE_KEY_FILE) { try { return fs.readFileSync(process.env.APPLE_PRIVATE_KEY_FILE, "utf8"); } catch { return ""; } }
  return (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

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
  apple: {
    name: "Apple", issuer: ["https://appleid.apple.com"],
    auth: "https://appleid.apple.com/auth/authorize", token: "https://appleid.apple.com/auth/token",
    userinfo: null, scope: "name email", formPost: true,
    id: process.env.APPLE_CLIENT_ID, secret: null, pkce: false, nonce: true,
  },
};
if (TEST_BASE) for (const [k, p] of Object.entries(P)) for (const f of ["auth", "token", "userinfo"]) if (p[f]) p[f] = `${TEST_BASE}/${k}/${f}`;

function enabled(k) {
  const p = P[k]; if (!p || !p.id || !PUBLIC_URL) return false;
  if (k === "apple") return !!(process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && appleKey());
  return !!p.secret;
}
const list = () => ["google", "apple", "linkedin", "adobe"].filter(enabled);
const redirectUri = k => `${PUBLIC_URL}/auth/${k}/callback`;
const b64u = buf => Buffer.from(buf).toString("base64url");

// client_secret da Apple: um JWT ES256 assinado com a chave .p8
function appleSecret() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "ES256", kid: process.env.APPLE_KEY_ID }));
  const body = b64u(JSON.stringify({ iss: process.env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: P.apple.id }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: appleKey(), dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

function start(k) {
  const p = P[k];
  const state = crypto.randomBytes(24).toString("hex");
  const verifier = p.pkce ? crypto.randomBytes(48).toString("base64url") : "";
  const nonce = p.nonce ? crypto.randomBytes(16).toString("hex") : "";
  const q = new URLSearchParams({ client_id: p.id, redirect_uri: redirectUri(k), response_type: "code", scope: p.scope, state, ...(p.extra || {}) });
  if (nonce) q.set("nonce", nonce);
  if (verifier) { q.set("code_challenge", b64u(crypto.createHash("sha256").update(verifier).digest())); q.set("code_challenge_method", "S256"); }
  if (p.formPost) q.set("response_mode", "form_post");
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
async function finish(k, code, saved, appleUser) {
  const p = P[k];
  const form = { grant_type: "authorization_code", code, redirect_uri: redirectUri(k) };
  const headers = {};
  if (p.basicAuth) headers.Authorization = "Basic " + Buffer.from(`${p.id}:${p.secret}`).toString("base64");
  else { form.client_id = p.id; form.client_secret = k === "apple" ? appleSecret() : p.secret; }
  if (saved.verifier) form.code_verifier = saved.verifier;
  if (p.basicAuth && saved.verifier) form.client_id = p.id;
  const tok = await postForm(p.token, form, headers);

  // id_token recebido direto do provedor por TLS: conferimos destinatário, validade e nonce
  const claims = tok.id_token ? decodeJwt(tok.id_token) : null;
  if (claims) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(p.id)) throw new Error("id_token para outro aplicativo");
    if (claims.exp && claims.exp * 1000 < Date.now() - 60000) throw new Error("id_token expirado");
    if (!TEST_BASE && claims.iss && !p.issuer.includes(claims.iss)) throw new Error("emissor inesperado");
    if (saved.nonce && claims.nonce && claims.nonce !== saved.nonce) throw new Error("nonce não confere");
  } else if (!p.userinfo) throw new Error("o provedor não devolveu a identidade");

  let info = {};
  if (p.userinfo) {
    const r = await fetch(p.userinfo, { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`userinfo HTTP ${r.status}`);
    info = await r.json();
  }
  const src = { ...(claims || {}), ...info };
  let name = src.name || [src.given_name, src.family_name].filter(Boolean).join(" ");
  if (!name && appleUser && appleUser.name) name = [appleUser.name.firstName, appleUser.name.lastName].filter(Boolean).join(" ");
  const sub = String(src.sub || "");
  if (!sub) throw new Error("identificador ausente");
  return { sub, email: String(src.email || "").toLowerCase(), emailVerified: src.email_verified === true || src.email_verified === "true", name: name.trim() };
}

module.exports = { P, enabled, list, start, finish };
