// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o botão "Entrar com Google" (ou Microsoft, GitHub, LinkedIn, Adobe). Em vez de criar uma senha
// nova, a pessoa pede ao Google: "diz para a Osmo que eu sou eu".
// Funciona como pegar um bilhete na portaria:
//   1. A Osmo manda a pessoa até a "portaria do Google", com um bilhete secreto (state);
//   2. a pessoa faz login lá no Google (a Osmo nunca vê a senha do Google);
//   3. o Google devolve a pessoa para a Osmo com um "código" de uso único;
//   4. a Osmo troca esse código, direto com o Google, pelos dados da pessoa (nome, e-mail).
// Os segredos extras (state, nonce, PKCE) servem para ninguém conseguir "pegar carona"
// no meio do caminho e entrar na conta de outra pessoa.
// Login com Google, Microsoft, LinkedIn, Adobe e GitHub (OAuth 2.0 / OpenID Connect, sem dependências)
import crypto from "node:crypto";
import { record } from "./service-values.js";

export interface OAuthProvider {
  name: string; issuer: string[]; issuerRe?: RegExp; auth: string; token: string; userinfo: string;
  emails?: string; scope: string; id?: string; secret?: string; pkce: boolean; nonce: boolean;
  extra?: Record<string, string>; basicAuth?: boolean; microsoft?: boolean; github?: boolean;
}
export interface OAuthState { verifier?: string; nonce?: string }
export interface OAuthProfile { sub: string; email: string; emailVerified: boolean; name: string }
export interface OAuthStart { url: string; state: string; verifier: string; nonce: string }
interface GithubEmail { primary?: boolean; verified?: boolean; email?: string }

// PUBLIC_URL é o endereço do site (ex.: https://osmo.com.br). O Google precisa saber para
// onde devolver a pessoa depois do login. TEST_BASE só é usado em testes no computador.
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
// Keep OAuth callbacks on the legacy host when providers are already configured there.
const REDIRECT_URL = (process.env.OAUTH_REDIRECT_URL || PUBLIC_URL).replace(/\/$/, "");
const TEST_BASE = process.env.OAUTH_TEST_BASE || ""; // só para testes locais: troca o endereço dos provedores

// A "agenda de endereços" de cada portaria: onde mandar a pessoa (auth), onde trocar o código
// (token), onde pedir os dados (userinfo), o que pedimos (scope) e a identificação da Osmo
// naquele serviço (id e secret, que vêm do .env). Cada serviço tem umas manias diferentes,
// anotadas nos campos pkce, nonce, basicAuth e github.
const P: Record<string, OAuthProvider> = {
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
    userinfo: "https://ims-na1.adobelogin.com/ims/userinfo/v2", scope: "openid,email,profile",
    id: process.env.ADOBE_CLIENT_ID, secret: process.env.ADOBE_CLIENT_SECRET, pkce: true, nonce: true, basicAuth: true,
  },
  // Microsoft: contas pessoais (Outlook, Hotmail, Xbox) e de trabalho/escola, pelo endpoint "common".
  // O emissor muda conforme a organização (tid), por isso a conferência usa um molde.
  microsoft: {
    name: "Microsoft", issuer: [], issuerRe: /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/,
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userinfo: "https://graph.microsoft.com/oidc/userinfo", scope: "openid email profile",
    id: process.env.MICROSOFT_CLIENT_ID, secret: process.env.MICROSOFT_CLIENT_SECRET, pkce: true, nonce: true, microsoft: true, extra: { prompt: "select_account" },
  },
  github: {
    name: "GitHub", issuer: [],
    auth: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token",
    userinfo: "https://api.github.com/user", emails: "https://api.github.com/user/emails", scope: "read:user user:email",
    id: process.env.GITHUB_CLIENT_ID, secret: process.env.GITHUB_CLIENT_SECRET, pkce: false, nonce: false, github: true,
  },
};
if (TEST_BASE) for (const [k, p] of Object.entries(P)) for (const f of ["auth", "token", "userinfo", "emails"] as const) if (p[f]) p[f] = `${TEST_BASE}/${k}/${f}`;

// - enabled: um botão só aparece se o serviço estiver configurado no .env;
// - list: a lista de botões que vão aparecer, nesta ordem;
// - redirectUri: o endereço de volta (ex.: /auth/google/callback);
// - b64u: um jeito de escrever bytes como texto que pode ir num endereço da internet.
const ORDER = ["google", "microsoft", "linkedin", "adobe", "github"];
const enabled = (k: string) => { const p = P[k]; return !!(p && p.id && p.secret && PUBLIC_URL); };
const list = () => ORDER.filter(enabled);
const redirectUri = (k: string) => `${REDIRECT_URL}/auth/${k}/callback`;
const b64u = (buf: Uint8Array) => Buffer.from(buf).toString("base64url");

// Passo 1 (ida): prepara o endereço da portaria. Inventa números aleatórios:
// - state: "senha da ida e volta". Quando a pessoa voltar, conferimos se é a mesma;
// - verifier (PKCE): guardamos um segredo e mandamos só o "embaralhado" dele. Na hora de
//   trocar o código, mostramos o segredo original: só quem começou o login consegue terminar;
// - nonce: um número que tem de voltar igualzinho dentro da resposta do Google.
function start(k: string): OAuthStart {
  const p = P[k];
  const state = crypto.randomBytes(24).toString("hex");
  const verifier = p.pkce ? crypto.randomBytes(48).toString("base64url") : "";
  const nonce = p.nonce ? crypto.randomBytes(16).toString("hex") : "";
  const q = new URLSearchParams({ client_id: String(p.id), redirect_uri: redirectUri(k), response_type: "code", scope: p.scope, state, ...(p.extra || {}) });
  if (nonce) q.set("nonce", nonce);
  if (verifier) { q.set("code_challenge", b64u(crypto.createHash("sha256").update(verifier).digest())); q.set("code_challenge_method", "S256"); }
  return { url: `${p.auth}?${q}`, state, verifier, nonce };
}

// O Google responde com um "id_token", um bilhete em 3 partes separadas por ponto.
// A parte do meio tem os dados da pessoa; aqui só abrimos e lemos essa parte.
function decodeJwt(t: unknown): Record<string, unknown> | null {
  try {
    const claims: unknown = JSON.parse(Buffer.from(String(t).split(".")[1], "base64url").toString("utf8"));
    return claims ? record(claims) : null;
  } catch { return null; }
}

// Manda um formulário para o serviço (como apertar "enviar" num site) e lê a resposta.
// Se demorar mais de 15 segundos ou vier erro, avisa.
async function postForm(url: string, form: Record<string, string>, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers }, body: new URLSearchParams(form), signal: AbortSignal.timeout(15000) });
  const d = record(await r.json().catch(() => ({})) as unknown);
  if (!r.ok) throw new Error(String(d.error_description || d.error || `HTTP ${r.status}`));
  return d;
}

// Passo 4 (volta): troca o código de uso único pela "chave de acesso" (access_token) e,
// com ela, pega nome e e-mail da pessoa. "sub" é o número que identifica a pessoa naquele
// serviço para sempre, mesmo se ela trocar de e-mail.
// troca o código pelo perfil verificado da pessoa
async function finish(k: string, code: string, saved: OAuthState): Promise<OAuthProfile> {
  const p = P[k];
  const form: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: redirectUri(k) };
  const headers: Record<string, string> = {};
  if (p.basicAuth) { headers.Authorization = "Basic " + Buffer.from(`${p.id}:${p.secret}`).toString("base64"); }
  else { form.client_id = String(p.id); form.client_secret = String(p.secret); }
  if (saved.verifier) { form.code_verifier = saved.verifier; form.client_id = String(p.id); }
  const tok = await postForm(p.token, form, headers);
  if (!tok.access_token) throw new Error(String(tok.error_description || tok.error || "sem access_token"));

  if (p.github) {
    // GitHub não usa OpenID: lemos o perfil e a lista de e-mails pela API
    const h = { Authorization: `Bearer ${tok.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "osmo-talents" };
    const get = async (u: string): Promise<unknown> => { const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`github HTTP ${r.status}`); return r.json() as Promise<unknown>; };
    const [profile, emails] = await Promise.all([get(p.userinfo), get(p.emails!)]);
    const user = record(profile);
    const list = Array.isArray(emails) ? emails as GithubEmail[] : [];
    const primary = list.find(e => e.primary && e.verified) || list.find(e => e.verified);
    if (!user || !user.id) throw new Error("perfil do GitHub incompleto");
    return { sub: String(user.id), email: primary ? String(primary.email).toLowerCase() : "", emailVerified: !!primary, name: String(user.name || user.login || "").trim() };
  }

  // Conferências de segurança no bilhete:
  // - aud: o bilhete foi feito para a Osmo (e não para outro site)?
  // - exp: o bilhete ainda está na validade?
  // - iss: foi o Google mesmo que fez o bilhete?
  // - nonce: é o mesmo número que mandamos na ida?
  // Se qualquer coisa não bater, o login é recusado.
  // id_token recebido direto do provedor por TLS: conferimos destinatário, validade e nonce
  const claims = tok.id_token ? decodeJwt(tok.id_token) : null;
  if (claims) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(p.id)) throw new Error("id_token para outro aplicativo");
    if (claims.exp && Number(claims.exp) * 1000 < Date.now() - 60000) throw new Error("id_token expirado");
    if (!TEST_BASE && claims.iss && !p.issuer.some(issuer => issuer === claims.iss) && !(p.issuerRe && p.issuerRe.test(String(claims.iss)))) throw new Error("emissor inesperado");
    if (saved.nonce && claims.nonce && claims.nonce !== saved.nonce) throw new Error("nonce não confere");
  }
  const r = await fetch(p.userinfo, { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`userinfo HTTP ${r.status}`);
  const src = { ...(claims || {}), ...record(await r.json() as unknown) };
  const name = src.name || [src.given_name, src.family_name].filter(Boolean).join(" ");
  const sub = String(src.sub || "");
  if (!sub) throw new Error("identificador ausente");
  let emailVerified = src.email_verified === true || src.email_verified === "true";
  if (p.microsoft) {
    // A Microsoft não manda email_verified. Só confiamos no e-mail de conta pessoal (a própria
    // Microsoft confirma) ou quando ela garante que a organização é dona do domínio (xms_edov).
    // Sem isso, alguém poderia pôr o e-mail de outra pessoa numa organização de teste e
    // entrar na conta dela aqui (o golpe conhecido como "nOAuth").
    const consumer = (claims && claims.tid) === "9188040d-6c67-4c5b-b112-36a304b66dad";
    emailVerified = !!(claims && claims.email) && (consumer || claims.xms_edov === true || claims.xms_edov === "1" || claims.xms_edov === 1);
    if (claims && claims.email) src.email = claims.email;
  }
  return { sub, email: String(src.email || "").toLowerCase(), emailVerified, name: String(name).trim() };
}

export { P, enabled, list, start, finish };
