// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É a "caixa de correio do WhatsApp" que confirma o celular no cadastro, DE GRAÇA.
// Em vez de a Osmo MANDAR um código (o que custa dinheiro por mensagem), é a pessoa
// que manda uma mensagem para a Osmo — "WhatsApp ao contrário":
//   1. o site inventa um código (ex.: OSMO-4K7P2Q) e mostra um botão;
//   2. o botão abre o WhatsApp da pessoa com a mensagem pronta para o número da Osmo;
//   3. ela toca em Enviar. A Meta (dona do WhatsApp) "toca a campainha" do nosso
//      servidor (webhook) contando quem mandou e o que estava escrito;
//   4. o número de quem mandou é o celular confirmado: só o dono do WhatsApp consegue
//      mandar uma mensagem dele.
// Receber mensagens na API oficial do WhatsApp (WhatsApp Cloud API) não tem custo, e
// responder em até 24 horas para quem escreveu primeiro também não.
//
// Sem as chaves da Meta, PHONE_DEV=true deixa testar no computador: a tela ganha um
// botão "Simular a mensagem" que faz de conta que o WhatsApp chegou.

const crypto = require("node:crypto");

const NUMBER = String(process.env.WHATSAPP_NUMBER || "").replace(/\D/g, ""); // número da Osmo, ex.: 5511912345678
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || ""; // senha que a Meta repete ao ligar o webhook
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || ""; // assina cada aviso da Meta (confere que veio dela)
const TOKEN = process.env.WHATSAPP_TOKEN || ""; // opcional: para responder "Pronto, confirmado"
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || ""; // opcional: id do número na Meta (para responder)
const LIVE = !!(NUMBER && VERIFY_TOKEN && APP_SECRET);
const DEV = process.env.PHONE_DEV === "true" && !LIVE;
const ENABLED = LIVE || DEV;
const SHOWN = NUMBER || "5511900000000"; // no teste, um número de mentira só para a tela

// Deixa o número no formato internacional (+5511912345678).
// Sem "+" na frente, entendemos como número do Brasil: DDD + número.
function normalize(raw) {
  const s = String(raw || "").trim();
  let d = s.replace(/\D/g, "");
  if (s.startsWith("+") || s.startsWith("00")) {
    if (s.startsWith("00")) d = d.slice(2);
    if (d.startsWith("55")) return /^55[1-9][1-9]9\d{8}$/.test(d) ? "+" + d : "";
    return /^[1-9]\d{7,14}$/.test(d) ? "+" + d : "";
  }
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("0")) d = d.slice(1); // 0 + DDD + número
  return /^[1-9][1-9]9\d{8}$/.test(d) ? "+55" + d : "";
}
// O WhatsApp diz quem mandou sem o "+" (wa_id). Celulares do Brasil cadastrados no WhatsApp
// antes do "9 na frente" chegam com 8 números depois do DDD (5511 8123-4567): devolvemos o 9.
function fromWaId(waId) {
  const d = String(waId || "").replace(/\D/g, "");
  if (/^55[1-9][1-9][6-9]\d{7}$/.test(d)) return "+" + d.slice(0, 4) + "9" + d.slice(4);
  return normalize("+" + d);
}
// +5511912345678 -> +55 11 91234-5678 (para mostrar na tela)
function pretty(e164) {
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : e164;
}

// Código da mensagem: OSMO- e 6 letras/números sem os que confundem (0/O, 1/I/L).
const ABC = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const newCode = () => "OSMO-" + Array.from({ length: 6 }, () => ABC[crypto.randomInt(ABC.length)]).join("");
const findCode = text => { const m = /OSMO\s*-?\s*([A-Z0-9]{6})/i.exec(String(text || "")); return m ? "OSMO-" + m[1].toUpperCase() : ""; };
const message = code => `Quero confirmar meu celular na Osmo. Código: ${code}`;
const link = code => `https://wa.me/${SHOWN}?text=${encodeURIComponent(message(code))}`;

// A Meta assina cada aviso com a chave secreta do app (X-Hub-Signature-256: sha256=...).
// Se a assinatura não bater, o aviso não veio da Meta e é ignorado.
function signatureOk(raw, header) {
  if (!APP_SECRET) return false;
  const want = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(raw).digest("hex");
  const got = String(header || "");
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
// Tira do aviso da Meta só as mensagens de texto: [{ from: "+55...", code: "OSMO-..." }]
function incoming(body) {
  const out = [];
  for (const e of (body && body.entry) || []) for (const c of e.changes || []) for (const m of (c.value && c.value.messages) || []) {
    const text = m.type === "text" ? m.text && m.text.body : m.type === "button" ? m.button && m.button.text : "";
    const code = findCode(text), from = fromWaId(m.from);
    if (code && from) out.push({ from, waId: m.from, code });
  }
  return out;
}

// Responde no WhatsApp (grátis: é resposta a quem escreveu primeiro). Opcional e sem esperar.
function reply(waId, text) {
  if (!TOKEN || !PHONE_ID || !waId) return;
  fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: waId, type: "text", text: { body: text } }),
    signal: AbortSignal.timeout(15_000),
  }).then(async r => { if (r.status >= 300) console.error(new Date().toISOString(), "whatsapp reply", r.status, (await r.text()).slice(0, 300)); })
    .catch(e => console.error(new Date().toISOString(), "whatsapp reply", e.message));
}

module.exports = { ENABLED, DEV, VERIFY_TOKEN, NUMBER: SHOWN, normalize, fromWaId, pretty, newCode, findCode, message, link, signatureOk, incoming, reply };
