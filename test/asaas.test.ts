import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeRequest } from "./http-fixture";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "osmo-asaas-"));
Object.assign(process.env, {
  DB_PATH: path.join(directory, "test.sqlite"), ASAAS_API_KEY: "mock-only",
  ASAAS_BASE_URL: "https://api-sandbox.asaas.com/v3", APP_SECRET: "test-secret-with-at-least-24-characters",
  ASAAS_WEBHOOK_TOKEN: "test-token-with-at-least-32-characters", SMTP_HOST: "", MAIL_DEV: "false",
  WHATSAPP_TOKEN: "", WHATSAPP_PHONE_ID: "", VAPID_PRIVATE_KEY: "", VAPID_PUBLIC_KEY: "",
});
const { server } = require("../server") as typeof import("../server");
const { db, one, run } = require("../src/db") as typeof import("../src/db");
const asaas = require("../src/asaas") as typeof import("../src/asaas");
const request = makeRequest(server);
const originalFetch = global.fetch;
const calls: string[] = [];
let failActivation = true;
let missingEscrow = false;
let emptyEscrow = false;
let masterEscrowMissing = false;
global.fetch = async (input, options) => {
  const url = String(input), method = options?.method || "GET";
  calls.push(method + " " + new URL(url).pathname);
  if (url.endsWith("/accounts") && method === "POST") return Response.json({ id: "acc_mock", walletId: "wallet_mock", apiKey: "subaccount-mock-key" });
  if (url.endsWith("/accounts/acc_mock/escrow")) return Response.json(failActivation ? { errors: [{ description: "mock activation failure" }] } : { enabled: true }, { status: failActivation ? 400 : 200 });
  if (url.endsWith("/customers")) return Response.json({ id: "customer_mock" });
  if (url.endsWith("/payments") && method === "POST") {
    const payload = JSON.parse(String(options?.body));
    assert.deepEqual(payload.split, [{ walletId: "wallet_mock", percentualValue: 90 }]);
    return Response.json({ id: "pay_mock", invoiceUrl: "https://example.test/invoice", status: "PENDING" });
  }
  if (url.endsWith("/payments/pay_mock/escrow") && emptyEscrow) return Response.json({});
  if (url.endsWith("/payments/pay_mock/escrow") && masterEscrowMissing && new Headers(options?.headers).get("access_token") === "mock-only") return Response.json({}, { status: 404 });
  if (url.endsWith("/payments/pay_mock/escrow")) return Response.json(missingEscrow ? { errors: [] } : { id: "escrow_mock", status: "ACTIVE" }, { status: missingEscrow ? 404 : 200 });
  if (url.endsWith("/escrow/escrow_mock/finish")) return Response.json({ id: "escrow_mock", status: "FINISHED" });
  throw new Error("Unexpected upstream request in isolated test");
};
test.after(() => { global.fetch = originalFetch; db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

async function actor(role: "freela" | "cliente") {
  const credentials = { name: "Sandbox test", email: `${role}@example.test`, password: "test-password-123", role };
  assert.equal((await request("/api/auth/register", { method: "POST", body: credentials })).status, 200);
  const login = await request("/api/auth/login", { method: "POST", body: credentials });
  assert.equal(login.status, 200);
  return { id: Number(one("SELECT id FROM users WHERE email = ?", credentials.email)!.id), cookie: login.headers["set-cookie"].split(";")[0] };
}

test("escrow failure blocks billing, preserves encrypted key, retries same account and gates release", async () => {
  const freelancer = await actor("freela"), client = await actor("cliente");
  const payoutBody = { cpfCnpj: "52998224725", birthDate: "1990-01-01", mobilePhone: "11999999999", postalCode: "01001000", address: "Test", addressNumber: "1", province: "Test", incomeValue: 1000 };
  const payout = () => request("/api/me/payout", { method: "POST", cookie: freelancer.cookie, body: payoutBody });
  const secret = process.env.APP_SECRET;
  process.env.APP_SECRET = "short";
  assert.equal((await payout()).status, 503);
  assert.equal(calls.length, 0, "invalid encryption configuration must not create an upstream account");
  process.env.APP_SECRET = secret;
  assert.equal((await payout()).status, 502);
  const pending = one("SELECT * FROM payout_accounts WHERE user_id = ?", freelancer.id)!;
  assert.equal(pending.escrow, 0);
  assert.equal(asaas.open(pending.api_key_enc), "subaccount-mock-key");
  const me = JSON.parse((await request("/api/me", { cookie: freelancer.cookie })).body);
  assert.deepEqual(me.user.payout, { active: false, escrow: false });
  const job = Number(run("INSERT INTO jobs (client_id,title,cat) VALUES (?,?,?)", client.id, "Test", "design").lastInsertRowid);
  const proposal = Number(run("INSERT INTO proposals (job_id,freela_id,text,value,days) VALUES (?,?,?,?,?)", job, freelancer.id, "Test", 100, 1).lastInsertRowid);
  const contract = Number(run("INSERT INTO contracts (job_id,proposal_id,client_id,freela_id,value) VALUES (?,?,?,?,?)", job, proposal, client.id, freelancer.id, 100).lastInsertRowid);
  const milestone = Number(run("INSERT INTO milestones (contract_id,pos,title,value) VALUES (?,?,?,?)", contract, 1, "Test", 100).lastInsertRowid);
  const pay = () => request(`/api/milestones/${milestone}/pay`, { method: "POST", cookie: client.cookie, body: {} });
  assert.equal((await pay()).status, 409);
  assert.equal(calls.filter(c => c === "POST /v3/payments").length, 0);
  // Even a previously generated link must not bypass the account's escrow gate.
  run("UPDATE milestones SET pay_status = 'aguardando', invoice_url = 'https://example.test/old' WHERE id = ?", milestone);
  assert.equal((await pay()).status, 409);
  assert.equal((await payout()).status, 502, "retry remains blocked while upstream activation fails");
  assert.equal(one("SELECT escrow FROM payout_accounts WHERE user_id = ?", freelancer.id)!.escrow, 0);
  failActivation = false;
  assert.equal((await payout()).status, 200);
  assert.equal(calls.filter(c => c === "POST /v3/accounts").length, 1);
  assert.equal(one("SELECT escrow FROM payout_accounts WHERE user_id = ?", freelancer.id)!.escrow, 1);
  assert.equal((await payout()).status, 409);
  run("UPDATE profiles SET cpf_cnpj = '52998224725' WHERE user_id = ?", client.id);
  run("UPDATE milestones SET pay_status = 'a_pagar', invoice_url = '' WHERE id = ?", milestone);
  assert.equal((await pay()).status, 200);
  assert.equal((await pay()).status, 200);
  assert.equal(calls.filter(c => c === "POST /v3/payments").length, 1);
  run("UPDATE milestones SET pay_status = 'pago', status = 'entregue' WHERE id = ?", milestone);
  const approve = () => request(`/api/milestones/${milestone}/approve`, { method: "POST", cookie: client.cookie, body: {} });
  missingEscrow = true;
  assert.equal((await approve()).status, 502);
  assert.deepEqual({ ...one("SELECT status, pay_status FROM milestones WHERE id = ?", milestone)! }, { status: "entregue", pay_status: "pago" });
  missingEscrow = false;
  emptyEscrow = true;
  assert.equal((await approve()).status, 502, "an empty success response must not release local funds");
  assert.equal(one("SELECT pay_status FROM milestones WHERE id = ?", milestone)!.pay_status, "pago");
  emptyEscrow = false;
  masterEscrowMissing = true;
  assert.equal((await approve()).status, 200, "a master-account 404 must still try the subaccount key");
  assert.deepEqual({ ...one("SELECT status, pay_status FROM milestones WHERE id = ?", milestone)! }, { status: "aprovada", pay_status: "liberado" });
  assert.equal(server.listening, false);
});
