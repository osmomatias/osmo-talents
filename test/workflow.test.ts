import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { IncomingHttpHeaders, OutgoingHttpHeader, OutgoingHttpHeaders } from "node:http";

// Import the application only after isolating its database and disabling delivery providers.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "osmo-workflow-"));
const environment: Record<string, string> = {
  DB_PATH: path.join(directory, "workflow.sqlite"),
  PUBLIC_URL: "http://workflow.example.test",
  ASAAS_API_KEY: "", FEE_PCT: "10", SMTP_HOST: "", MAIL_DEV: "false",
  VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", PHONE_DEV: "false",
  WHATSAPP_NUMBER: "", WHATSAPP_VERIFY_TOKEN: "", WHATSAPP_APP_SECRET: "",
  WHATSAPP_TOKEN: "", WHATSAPP_PHONE_ID: "", ADMIN_EMAIL: "",
  GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "",
  LINKEDIN_CLIENT_ID: "", LINKEDIN_CLIENT_SECRET: "",
  ADOBE_CLIENT_ID: "", ADOBE_CLIENT_SECRET: "",
  MICROSOFT_CLIENT_ID: "", MICROSOFT_CLIENT_SECRET: "",
  GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "", TMDB_TOKEN: "",
};
const previousEnvironment = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
Object.assign(process.env, environment);
const { server } = require("../server") as typeof import("../server");
const { db } = require("../src/db") as typeof import("../src/db");

test.after(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
  for (const [key, value] of previousEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

type Role = "cliente" | "freela";
interface Credentials { name: string; email: string; password: string; role: Role }
interface Actor { id: number; cookie: string }
interface JobRequest {
  title: string; cat: string; obj: string; ent: string[]; fora: string[];
  com: string; fb: string; ref: string; budget_type: "fixo"; budget: number;
  duration: string; skills: string[]; async: boolean; flex: boolean;
}
interface ProposalRequest {
  text: string; value: number; days: number; questions: string;
  milestones: { title: string; value: number }[];
}
interface ResponseFixture { status: number; headers: Map<string, OutgoingHttpHeader>; body: string }
interface MilestoneSnapshot { id: number; title: string; value: number; status: string }
interface ContractSnapshot {
  id: number; client_id: number; freela_id: number; value: number;
  status: string; thread: number; milestones: MilestoneSnapshot[];
}

// Exercise the real HTTP dispatcher and Readable body parsing without opening a socket.
function request(method: "GET" | "POST", url: string, cookie = "", body?: object): Promise<ResponseFixture> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Request did not finish: ${method} ${url}`)), 5_000);
    const headers = new Map<string, OutgoingHttpHeader>();
    const requestHeaders: IncomingHttpHeaders = { "x-osmo": "1", cookie, "content-type": "application/json" };
    const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), {
      method, url, headers: requestHeaders, socket: { remoteAddress: "203.0.113.70" },
    });
    const res = {
      statusCode: 200,
      headersSent: false,
      getHeader(name: string): OutgoingHttpHeader | undefined { return headers.get(name.toLowerCase()); },
      setHeader(name: string, value: OutgoingHttpHeader) { headers.set(name.toLowerCase(), value); return this; },
      writeHead(status: number, outgoing: OutgoingHttpHeaders = {}) {
        this.statusCode = status;
        this.headersSent = true;
        for (const [name, value] of Object.entries(outgoing)) if (value !== undefined) this.setHeader(name, value);
        return this;
      },
      end(data?: string | Uint8Array) {
        clearTimeout(timer);
        resolve({ status: this.statusCode, headers, body: data === undefined ? "" : Buffer.from(data).toString("utf8") });
      },
      destroy(error?: Error) { clearTimeout(timer); reject(error || new Error(`Response destroyed: ${url}`)); },
    };
    server.emit("request", req, res);
  });
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), "expected a JSON object");
  return value as Record<string, unknown>;
}
function number(value: unknown): number { assert.equal(typeof value, "number"); return value as number; }
function string(value: unknown): string { assert.equal(typeof value, "string"); return value as string; }
function array(value: unknown): unknown[] { assert.ok(Array.isArray(value)); return value; }
function json(response: ResponseFixture, status = 200): Record<string, unknown> {
  assert.equal(response.status, status, response.body);
  const value: unknown = JSON.parse(response.body);
  return record(value);
}
function contracts(response: ResponseFixture): ContractSnapshot[] {
  return array(json(response).contracts).map(value => {
    const contract = record(value);
    return {
      id: number(contract.id), client_id: number(contract.client_id), freela_id: number(contract.freela_id),
      value: number(contract.value), status: string(contract.status), thread: number(contract.thread),
      milestones: array(contract.milestones).map(value => {
        const milestone = record(value);
        return { id: number(milestone.id), title: string(milestone.title), value: number(milestone.value), status: string(milestone.status) };
      }),
    };
  });
}
async function registerAndLogin(credentials: Credentials): Promise<Actor> {
  assert.equal(json(await request("POST", "/api/auth/register", "", credentials)).ok, true);
  const login = await request("POST", "/api/auth/login", "", { email: credentials.email, password: credentials.password });
  assert.equal(json(login).ok, true);
  const cookieHeader = login.headers.get("set-cookie");
  assert.equal(typeof cookieHeader, "string");
  assert.match(String(cookieHeader), /HttpOnly; SameSite=Lax/);
  const cookie = String(cookieHeader).split(";")[0];
  const me = json(await request("GET", "/api/me", cookie));
  const user = record(me.user);
  assert.equal(user.role, credentials.role);
  assert.equal(user.email, credentials.email);
  assert.equal(record(me.payments).enabled, false, "the workflow must never call a payment provider");
  return { id: number(user.id), cookie };
}
async function ownContract(actor: Actor, id: number): Promise<ContractSnapshot> {
  const found = contracts(await request("GET", "/api/contracts", actor.cookie));
  assert.equal(found.length, 1);
  assert.equal(found[0].id, id);
  return found[0];
}

test("marketplace contract completes only through its participants and ordered milestone actions", async () => {
  const client = await registerAndLogin({ name: "Cliente do fluxo", email: "workflow-client@example.test", password: "senha-cliente-123", role: "cliente" });
  const freelancer = await registerAndLogin({ name: "Freelancer do fluxo", email: "workflow-freela@example.test", password: "senha-freela-123", role: "freela" });
  const outsider = await registerAndLogin({ name: "Outra cliente", email: "workflow-outsider@example.test", password: "senha-outsider-123", role: "cliente" });
  const briefing: JobRequest = {
    title: "Identidade visual para uma cafeteria de bairro", cat: "design",
    obj: "Criar uma identidade visual reconhecível para a fachada e o cardápio da cafeteria.",
    ent: ["Logotipo e variações", "Guia de cores e tipografia"], fora: ["Desenvolvimento de site"],
    com: "Mensagens assíncronas pela plataforma", fb: "Uma rodada de feedback escrito por etapa",
    ref: "Referências serão enviadas na conversa", budget_type: "fixo", budget: 1_200,
    duration: "10 dias úteis", skills: ["Identidade visual"], async: true, flex: true,
  };
  json(await request("POST", "/api/jobs", freelancer.cookie, briefing), 403);
  const created = json(await request("POST", "/api/jobs", client.cookie, briefing));
  const jobId = number(created.id);
  assert.equal(created.clarity, 100);
  const proposal: ProposalRequest = {
    text: "Vou estudar as referências da cafeteria, apresentar dois caminhos visuais e finalizar o logotipo com um guia completo para aplicação.",
    value: 1_200, days: 10, questions: "Quem aprovará as entregas de cada etapa?",
    milestones: [{ title: "Direção visual", value: 400 }, { title: "Identidade final", value: 800 }],
  };
  json(await request("POST", `/api/jobs/${jobId}/proposals`, client.cookie, proposal), 403);
  const proposalId = number(json(await request("POST", `/api/jobs/${jobId}/proposals`, freelancer.cookie, proposal)).id);
  const received = array(json(await request("GET", `/api/jobs/${jobId}`, client.cookie)).proposals);
  assert.equal(received.length, 1);
  assert.equal(record(received[0]).text, proposal.text);
  assert.deepEqual(record(received[0]).milestones, proposal.milestones);
  const publicDetail = json(await request("GET", `/api/jobs/${jobId}`, outsider.cookie));
  assert.equal("proposals" in publicDetail, false, "other clients must not see private proposals");
  json(await request("POST", `/api/proposals/${proposalId}/accept`, outsider.cookie, {}), 404);
  json(await request("POST", `/api/jobs/${jobId}/close`, outsider.cookie, {}), 404);
  const contractId = number(json(await request("POST", `/api/proposals/${proposalId}/accept`, client.cookie, {})).contract);
  let contract = await ownContract(client, contractId);
  assert.equal(contract.client_id, client.id);
  assert.equal(contract.freela_id, freelancer.id);
  assert.equal(contract.status, "ativo");
  assert.equal(contract.value, proposal.value);
  assert.deepEqual(contract.milestones.map(({ title, value, status }) => ({ title, value, status })), proposal.milestones.map(milestone => ({ ...milestone, status: "pendente" })));
  assert.deepEqual(await ownContract(freelancer, contractId), contract);
  assert.deepEqual(contracts(await request("GET", "/api/contracts", outsider.cookie)), []);
  json(await request("GET", "/api/contracts"), 401);
  json(await request("GET", `/api/threads/${contract.thread}`, outsider.cookie), 404);
  json(await request("GET", `/api/contracts/${contractId}/project`, outsider.cookie), 404);
  json(await request("POST", `/api/threads/${contract.thread}/messages`, outsider.cookie, { body: "Não sou participante" }), 404);
  assert.equal(record(json(await request("GET", `/api/threads/${contract.thread}`, freelancer.cookie)).thread).id, contract.thread);

  for (const [index, milestone] of contract.milestones.entries()) {
    const endpoint = `/api/milestones/${milestone.id}`;
    json(await request("POST", `${endpoint}/start`, outsider.cookie, {}), 404);
    json(await request("POST", `${endpoint}/start`, client.cookie, {}), 404);
    json(await request("POST", `${endpoint}/approve`, client.cookie, {}), 409);
    assert.equal((await ownContract(client, contractId)).milestones[index].status, "pendente");
    assert.equal(json(await request("POST", `${endpoint}/start`, freelancer.cookie, {})).ok, true);
    assert.equal((await ownContract(client, contractId)).milestones[index].status, "andamento");
    assert.equal(json(await request("POST", `${endpoint}/deliver`, freelancer.cookie, {})).ok, true);
    assert.equal((await ownContract(client, contractId)).milestones[index].status, "entregue");
    json(await request("POST", `${endpoint}/approve`, freelancer.cookie, {}), 404);
    json(await request("POST", `${endpoint}/approve`, outsider.cookie, {}), 404);
    assert.equal(json(await request("POST", `${endpoint}/approve`, client.cookie, {})).ok, true);
    const current = await ownContract(client, contractId);
    assert.equal(current.milestones[index].status, "aprovada");
    assert.equal(current.status, index === contract.milestones.length - 1 ? "concluido" : "ativo");
  }

  contract = await ownContract(freelancer, contractId);
  assert.equal(contract.status, "concluido");
  const finalJob = json(await request("GET", `/api/jobs/${jobId}`, client.cookie));
  assert.equal(record(finalJob.job).status, "concluida");
  assert.equal(record(array(finalJob.proposals)[0]).status, "aceita");
  const stats = record(json(await request("GET", "/api/contracts", freelancer.cookie)).stats);
  assert.equal(stats.paid, 1_200);
  assert.equal(stats.held, 0);
  assert.equal(stats.net, 1_080);
  json(await request("POST", `/api/milestones/${contract.milestones[0].id}/start`, freelancer.cookie, {}), 409);
  assert.equal(server.listening, false, "the integration harness must not open a network listener");
});
