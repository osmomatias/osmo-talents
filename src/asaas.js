// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// O Asaas é como um "banco de mentirinha que é de verdade": ele cobra o cliente
// (Pix, boleto, cartão) e repassa o dinheiro para o freela. A plataforma não toca
// no dinheiro; ela só pede coisas ao Asaas, mandando "cartinhas" pela internet.
// Este arquivo é o "carteiro" que escreve e manda essas cartinhas.
// Duas ideias importantes:
// - SPLIT (dividir): numa cobrança de R$ 100, o Asaas já manda R$ 90 para o freela
//   e R$ 10 (a taxa) para a Osmo, sozinho.
// - ESCROW (garantia): o dinheiro do freela fica "num cofre" até o cliente aprovar
//   a etapa. Assim o cliente sabe que só paga por trabalho entregue, e o freela sabe
//   que o dinheiro já existe antes de começar.
// Cliente da API do Asaas (pagamentos com split e Conta Escrow)
// Documentação: https://docs.asaas.com
const crypto = require("node:crypto");

// Configurações que vêm do arquivo .env (um arquivo de segredos que não vai para o GitHub):
// - KEY: a "senha" da Osmo no Asaas. Sem ela, os pagamentos ficam desligados (ENABLED = false)
//   e o site funciona em modo simulado.
// - BASE: o endereço do Asaas. O padrão é o "sandbox", um Asaas de treino onde nada é dinheiro real.
// - FEE_PCT: a taxa da Osmo em %, entre 0 e 50 (padrão 10).
// - AUTO_RELEASE_DAYS: se o cliente sumir depois da entrega, em quantos dias o dinheiro é
//   liberado sozinho (padrão 7), para o freela não ficar esperando para sempre.
// - WEBHOOK_TOKEN: uma senha que o Asaas manda junto com os avisos, para sabermos que
//   o aviso veio mesmo do Asaas e não de alguém fingindo ser ele.
const KEY = process.env.ASAAS_API_KEY || "";
const BASE = (process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");
const ENABLED = !!KEY;
const FEE_PCT = Math.min(50, Math.max(0, Number(process.env.FEE_PCT || 10)));
const AUTO_RELEASE_DAYS = Math.max(1, Number(process.env.AUTO_RELEASE_DAYS || 7));
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || "";

// Um tipo de erro especial, que além da mensagem guarda o "código" do problema (status),
// para o servidor responder certinho (ex.: 400 = você mandou algo errado; 502 = o Asaas falhou).
class AsaasError extends Error { constructor(msg, status, detail) { super(msg); this.status = status; this.detail = detail; } }

// A função que manda UMA cartinha ao Asaas e espera a resposta.
// - method: o tipo de pedido (GET = "me mostra", POST = "faça isto").
// - path: para qual "setor" do Asaas vai (ex.: /payments = cobranças).
// - body: o conteúdo da cartinha.
// Se o Asaas demorar mais de 20 segundos, desistimos. Se ele responder com erro,
// juntamos as explicações que ele deu numa frase só e avisamos quem pediu.
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

// COFRE DE SEGREDOS: cada freela ganha uma subconta no Asaas com uma chave própria, que o
// Asaas mostra UMA vez só. Precisamos guardar essa chave, mas não podemos deixá-la à vista.
// Então trancamos (seal) com um cadeado AES-256-GCM, cuja "chave do cadeado" sai do APP_SECRET
// do .env. Para usar, destrancamos (open). Se alguém roubar o banco sem o .env, só vê rabiscos.
// O "iv" é um número aleatório novo a cada tranca (assim duas chaves iguais não ficam iguais
// trancadas) e o "tag" é um lacre: se alguém mexer no texto trancado, o lacre quebra e dá erro.
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

// Confere se o aviso que chegou trouxe a senha certa. timingSafeEqual compara as duas senhas
// sempre no mesmo tempo, para um espertinho não conseguir adivinhar letra por letra medindo
// quanto tempo a comparação demora.
function checkWebhookToken(got) {
  if (!WEBHOOK_TOKEN || typeof got !== "string") return false;
  const a = Buffer.from(got), b = Buffer.from(WEBHOOK_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// O "cardápio" de pedidos que sabemos fazer ao Asaas:
// - createSubaccount: abrir a conta de recebimento de um freela;
// - enableEscrow: ligar o "cofre" (garantia) nessa conta;
// - createCustomer: cadastrar quem vai pagar (o cliente);
// - createPayment: criar uma cobrança (já com o split dentro);
// - getPayment: perguntar "essa cobrança já foi paga?";
// - getPaymentEscrow / finishEscrow: ver o cofre de uma cobrança e abri-lo (liberar o dinheiro);
// - refundPayment: devolver o dinheiro;
// - createWebhook: pedir ao Asaas para nos avisar quando algo acontecer.
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
