// Cliente da API do Asaas (pagamentos com split e Conta Escrow)
// Documentação: https://docs.asaas.com
const crypto = require("node:crypto");

const KEY = process.env.ASAAS_API_KEY || "";
const BASE = (process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");
const ENABLED = !!KEY;
const FEE_PCT = Math.min(50, Math.max(0, Number(process.env.FEE_PCT || 10)));
const AUTO_RELEASE_DAYS = Math.max(1, Number(process.env.AUTO_RELEASE_DAYS || 7));
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || "";

class AsaasError extends Error { constructor(msg, status, detail) { super(msg); this.status = status; this.detail = detail; } }

async function call(method, path, body, apiKey = KEY) {
  if (!apiKey) throw new AsaasError("Pagamentos não configurados no servidor.", 503);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { "access_token": apiKey, "Content-Type": "application/json", "User-Agent": "osmo-talents/1.0 (marketplace)" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) { throw new AsaasError("Não foi possível falar com o Asaas agora. Tente de novo em instantes.", 502, e.message); }
  const text = await res.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const desc = (data.errors && data.errors.map(e => e.description).join(" ")) || `Erro ${res.status} no Asaas.`;
    throw new AsaasError(desc, res.status, data);
  }
  return data;
}

// --- cifra para guardar a apiKey das subcontas (exibida pelo Asaas uma única vez)
function encKey() {
  const s = process.env.APP_SECRET || "";
  if (s.length < 24) throw new AsaasError("Defina APP_SECRET (24 caracteres ou mais) no .env para ativar pagamentos.", 503);
  return crypto.createHash("sha256").update(s).digest();
}
function seal(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const out = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), out.toString("base64")].join(".");
}
function open(sealed) {
  const [iv, tag, data] = String(sealed).split(".").map(x => Buffer.from(x, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", encKey(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

function checkWebhookToken(got) {
  if (!WEBHOOK_TOKEN || typeof got !== "string") return false;
  const a = Buffer.from(got), b = Buffer.from(WEBHOOK_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const api = {
  createSubaccount: body => call("POST", "/accounts", body),
  enableEscrow: (accountId, days) => call("POST", `/accounts/${encodeURIComponent(accountId)}/escrow`, { enabled: true, isFeePayer: false, daysToExpire: days }),
  createCustomer: body => call("POST", "/customers", body),
  createPayment: body => call("POST", "/payments", body),
  getPayment: id => call("GET", `/payments/${encodeURIComponent(id)}`),
  getPaymentEscrow: (id, apiKey) => call("GET", `/payments/${encodeURIComponent(id)}/escrow`, null, apiKey),
  finishEscrow: (escrowId, apiKey) => call("POST", `/escrow/${encodeURIComponent(escrowId)}/finish`, {}, apiKey),
  refundPayment: id => call("POST", `/payments/${encodeURIComponent(id)}/refund`, {}),
  createWebhook: body => call("POST", "/webhooks", body),
};

module.exports = { ENABLED, BASE, FEE_PCT, AUTO_RELEASE_DAYS, AsaasError, api, seal, open, checkWebhookToken };
