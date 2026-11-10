import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeRequest, type TestResponse } from "./http-fixture";

// Use the real request listener and OAuth implementation, with no socket or provider traffic.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "osmo-oauth-language-"));
process.env.DB_PATH = path.join(dir, "test.sqlite");
process.env.PUBLIC_URL = "https://osmo.com.br";
process.env.OAUTH_REDIRECT_URL = "https://osmo.com.br";
process.env.OAUTH_TEST_BASE = "https://oauth.example.test";
process.env.GOOGLE_CLIENT_ID = "oauth-language-test";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.COOKIE_SECURE = "true";
process.env.ASAAS_API_KEY = "";
const { server } = require("../server") as typeof import("../server");
const { db, run } = require("../src/db") as typeof import("../src/db");
const request = makeRequest(server, { host: "osmo.com.br" });

interface Flow { state: string; nonce: string; verifier: string; challenge: string; cookie: string; response: TestResponse }
interface Profile { sub: string; email: string; name: string; badNonce?: boolean }
interface Reply { flow: Flow; profile: Profile }
const replies = new Map<string, Reply>();
const providerCalls: string[] = [];
const originalFetch = globalThis.fetch;
let sequence = 0;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.equal(url.origin, "https://oauth.example.test", "the fixture must never contact an external service");
  providerCalls.push(url.pathname);
  if (url.pathname === "/google/token") {
    assert.equal(init?.method, "POST");
    const form = new URLSearchParams(String(init?.body));
    const code = form.get("code") || "";
    const reply = replies.get(code);
    assert.ok(reply, "unexpected provider code");
    assert.equal(form.get("redirect_uri"), "https://osmo.com.br/auth/google/callback");
    assert.equal(form.get("code_verifier"), reply.flow.verifier);
    assert.equal(crypto.createHash("sha256").update(reply.flow.verifier).digest("base64url"), reply.flow.challenge);
    const claims = { aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 300,
      nonce: reply.profile.badNonce ? "incorrect-nonce" : reply.flow.nonce };
    const idToken = "fixture." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".fixture";
    return Response.json({ access_token: code, id_token: idToken });
  }
  assert.equal(url.pathname, "/google/userinfo");
  const code = new Headers(init?.headers).get("Authorization")?.replace(/^Bearer /, "") || "";
  const reply = replies.get(code);
  assert.ok(reply, "unexpected userinfo token");
  return Response.json({ sub: reply.profile.sub, email: reply.profile.email, name: reply.profile.name, email_verified: true });
};

const cookies = (response: TestResponse) => (response.headers["set-cookie"] || "").split("\n").filter(Boolean);
const cookieHeader = (response: TestResponse) => cookies(response).map(cookie => cookie.split(";")[0]).join("; ");
function replaceCookie(header: string, name: string, value?: string): string {
  const entries = header.split(/;\s*/).filter(cookie => !cookie.startsWith(name + "="));
  if (value !== undefined) entries.push(name + "=" + value);
  return entries.join("; ");
}
function assertLanguageCleared(response: TestResponse) {
  const cleared = cookies(response).find(cookie => cookie.startsWith("osmo_oauth_lang="));
  assert.ok(cleared, "the callback clears its temporary language cookie");
  assert.match(cleared, /; Path=\/auth(?:;|$)/);
  assert.match(cleared, /; Max-Age=0(?:;|$)/);
}
async function begin(lang?: string, role?: "freela" | "cliente"): Promise<Flow> {
  const query = new URLSearchParams();
  if (lang !== undefined) query.set("lang", lang);
  if (role) query.set("role", role);
  const response = await request("/auth/google?" + query, { ip: "203.0.113." + (++sequence + 10) });
  assert.equal(response.status, 302);
  const provider = new URL(response.headers.location);
  assert.equal(provider.origin, "https://oauth.example.test");
  assert.equal(provider.pathname, "/google/auth");
  const state = provider.searchParams.get("state") || "";
  assert.match(state, /^[a-f0-9]{48}$/);
  const saved = db.prepare("SELECT verifier,nonce FROM oauth_states WHERE state = ? AND provider = 'google'").get(state) as { verifier: string; nonce: string } | undefined;
  assert.ok(saved);
  assert.ok(saved.verifier);
  assert.equal(provider.searchParams.get("nonce"), saved.nonce);
  assert.equal(provider.searchParams.get("code_challenge_method"), "S256");
  return { state, nonce: saved.nonce, verifier: saved.verifier, challenge: provider.searchParams.get("code_challenge") || "", cookie: cookieHeader(response), response };
}
const existing: Profile = { sub: "existing-user", email: "existing@oauth.example.test", name: "Existing User" };
const existingId = Number(run("INSERT INTO users(name,email,pass_hash,role) VALUES(?,?,'fixture','freela')", existing.name, existing.email).lastInsertRowid);
run("INSERT INTO profiles(user_id) VALUES(?)", existingId);
run("INSERT INTO oauth_identities(provider,sub,user_id,email) VALUES('google',?,?,?)", existing.sub, existingId, existing.email);
async function finish(flow: Flow, profile = existing, cookie = flow.cookie, state = flow.state) {
  const code = "code-" + (++sequence);
  replies.set(code, { flow, profile });
  return request("/auth/google/callback?" + new URLSearchParams({ state, code }), { cookie });
}
function sessions() { return Number(db.prepare("SELECT COUNT(*) n FROM sessions").get()?.n); }

test("OAuth start binds normalized language to the random state in a private temporary cookie", async () => {
  for (const [input, expected] of [["en-GB", "en-US"], ["pt", "pt-BR"], [undefined, "pt-BR"], ["es-419", "pt-BR"]] as const) {
    const flow = await begin(input);
    const cookie = cookies(flow.response).find(value => value.startsWith("osmo_oauth_lang="));
    assert.ok(cookie);
    assert.equal(cookie.split(";")[0], "osmo_oauth_lang=" + flow.state + "." + expected);
    for (const attribute of ["Path=/auth", "HttpOnly", "Max-Age=600", "SameSite=Lax", "Secure"]) assert.ok(cookie.split(/;\s*/).includes(attribute), attribute);
    assert.ok(flow.cookie.includes("osmo_oauth=" + flow.state));
  }
});

test("English callbacks preserve language for existing users, both new roles and pending registration", async () => {
  for (const role of [undefined, "freela", "cliente"] as const) {
    const flow = await begin("en-US", role);
    const profile = role ? { sub: "new-" + role, email: role + "@oauth.example.test", name: "New " + role } : existing;
    const response = await finish(flow, profile);
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, (role === "freela" ? "/perfil" : role === "cliente" ? "/publicar" : "/painel") + "?lang=en-US");
    assert.match(response.headers["set-cookie"], /osmo_sid=[^;\n]+; Path=\//);
    assertLanguageCleared(response);
  }
  const pending = await finish(await begin("en-US"), { sub: "new-pending", email: "pending@oauth.example.test", name: "Pending User" });
  assert.equal(pending.status, 302);
  assert.match(pending.headers.location, /^\/escolher\?lang=en-US#[a-f0-9]{48}$/);
  assert.doesNotMatch(pending.headers["set-cookie"], /osmo_sid=/);
  const token = new URL(pending.headers.location, "https://osmo.com.br").hash.slice(1);
  assert.ok(db.prepare("SELECT 1 FROM oauth_pending WHERE token = ?").get(token));
  assertLanguageCleared(pending);
});

test("Portuguese and legacy OAuth starts keep the original unqualified destinations", async () => {
  for (const language of [undefined, "pt-BR"]) {
    const response = await finish(await begin(language));
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, "/painel");
    assert.match(response.headers["set-cookie"], /osmo_sid=/);
    assertLanguageCleared(response);
  }
});

test("missing or invalid optional language cookies cannot alter successful OAuth authentication", async () => {
  const invalid = [undefined, "0".repeat(48) + ".en-US", "{state}.es-419", "{state}.en-US.extra", "%ZZ"];
  for (const value of invalid) {
    const flow = await begin("en-US");
    const languageCookie = value?.replace("{state}", flow.state);
    const response = await finish(flow, existing, replaceCookie(flow.cookie, "osmo_oauth_lang", languageCookie));
    assert.equal(response.status, 302, String(value));
    assert.equal(response.headers.location, "/painel", String(value));
    assert.match(response.headers["set-cookie"], /osmo_sid=/, String(value));
    assertLanguageCleared(response);
  }
});

test("language cookies never replace the OAuth state cookie or the stored state", async () => {
  for (const scenario of ["missing-cookie", "wrong-cookie", "wrong-state", "expired-state"]) {
    const flow = await begin("en-US");
    const before = sessions(), calls = providerCalls.length;
    const cookie = scenario === "missing-cookie" ? replaceCookie(flow.cookie, "osmo_oauth")
      : scenario === "wrong-cookie" ? replaceCookie(flow.cookie, "osmo_oauth", "0".repeat(48)) : flow.cookie;
    if (scenario === "expired-state") run("UPDATE oauth_states SET created_at=datetime('now','-20 minutes') WHERE state=?", flow.state);
    const response = await finish(flow, existing, cookie, scenario === "wrong-state" ? "0".repeat(48) : flow.state);
    assert.equal(response.status, 302, scenario);
    const destination = new URL(response.headers.location, "https://osmo.com.br");
    assert.equal(destination.pathname, "/entrar", scenario);
    assert.equal(destination.searchParams.get("oauth_error"), "expirou", scenario);
    assert.doesNotMatch(response.headers["set-cookie"], /osmo_sid=/, scenario);
    assert.equal(sessions(), before, scenario);
    assert.equal(providerCalls.length, calls, scenario);
    assertLanguageCleared(response);
  }
});

test("English provider cancellation and nonce failures keep their errors without creating a session", async () => {
  const canceledFlow = await begin("en-US");
  const canceled = await request("/auth/google/callback?" + new URLSearchParams({ state: canceledFlow.state, error: "access_denied" }), { cookie: canceledFlow.cookie });
  assert.equal(canceled.headers.location, "/entrar?oauth_error=cancelado&lang=en-US");
  assert.doesNotMatch(canceled.headers["set-cookie"], /osmo_sid=/);
  assertLanguageCleared(canceled);
  const before = sessions();
  const rejected = await finish(await begin("en-US"), { ...existing, badNonce: true });
  assert.equal(rejected.headers.location, "/entrar?oauth_error=falhou&lang=en-US");
  assert.doesNotMatch(rejected.headers["set-cookie"], /osmo_sid=/);
  assert.equal(sessions(), before);
  assertLanguageCleared(rejected);
});

test.after(() => {
  globalThis.fetch = originalFetch;
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
