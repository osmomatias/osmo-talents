// EXPLICANDO COMO PARA UMA CRIANÇA: este script "instala a campainha".
// Ele pede ao Asaas: "toda vez que um pagamento for criado, pago, vencido, apagado ou
// devolvido, toque a campainha neste endereço do nosso site (/api/webhooks/asaas)".
// Antes, confere se as configurações necessárias estão no .env: a chave do Asaas, o
// endereço público do site (precisa ser https) e uma senha comprida para a campainha.
// Registra o webhook do Osmo Talents no Asaas. Uso: npm run asaas:setup
const { api, ENABLED, BASE } = require("../src/asaas");
(async () => {
  const url = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
  const token = process.env.ASAAS_WEBHOOK_TOKEN || "";
  const email = process.env.ASAAS_WEBHOOK_EMAIL || "";
  if (!ENABLED) return console.log("Defina ASAAS_API_KEY no .env primeiro.");
  if (!url.startsWith("https://")) return console.log("Defina PUBLIC_URL no .env (ex.: https://osmo.com.br).");
  if (token.length < 32) return console.log("Defina ASAAS_WEBHOOK_TOKEN no .env com 32 caracteres ou mais.");
  try {
    const r = await api.createWebhook({
      name: "Osmo Talents", url: url + "/api/webhooks/asaas", email, enabled: true, interrupted: false, apiVersion: 3,
      authToken: token, sendType: "SEQUENTIALLY",
      events: ["PAYMENT_CREATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"],
    });
    console.log("Webhook criado no Asaas (" + BASE + "):", r.id || "ok");
  } catch (e) { console.log("Não deu certo:", e.message); process.exitCode = 1; }
})();
