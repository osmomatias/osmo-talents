// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "carteiro de códigos" do celular. No cadastro, a pessoa diz o número dela e a
// gente manda um código de 6 números pelo WhatsApp ou por SMS. Ela digita o código
// no site e assim prova que o celular é dela mesmo.
// Quem manda a mensagem de verdade é o Twilio Verify (um serviço pago, por mensagem):
//   - start(): pede ao Twilio "manda um código para este número, por este canal";
//   - check(): pergunta ao Twilio "o código que a pessoa digitou está certo?".
// O próprio Twilio inventa o código, guarda, controla o prazo (10 minutos) e as tentativas.
// Sem Twilio configurado, PHONE_DEV=true deixa testar no computador: o código aparece
// no terminal em vez de ir para o celular.

const SID = process.env.TWILIO_ACCOUNT_SID || "";
const TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const SERVICE = process.env.TWILIO_VERIFY_SID || "";
const LIVE = !!(SID && TOKEN && SERVICE);
const DEV = process.env.PHONE_DEV === "true" && !LIVE;
const ENABLED = LIVE || DEV;
// canais ligados, na ordem em que aparecem na tela (o primeiro é o já marcado)
const CHANNELS = String(process.env.PHONE_CHANNELS || "whatsapp,sms").split(",").map(s => s.trim()).filter(c => c === "whatsapp" || c === "sms");
if (!CHANNELS.length) CHANNELS.push("sms");

// Deixa o número no formato internacional (+5511912345678).
// Sem "+" na frente, entendemos como número do Brasil: DDD + número.
// Celular do Brasil tem 11 números (DDD + 9 + 8 números).
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
// +5511912345678 -> +55 11 91234-5678 (para mostrar na tela)
function pretty(e164) {
  const m = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : e164;
}

// idioma da mensagem do Twilio (ele conhece pt-BR, en, es, fr)
const LOCALE = { "pt-BR": "pt-BR", "en-US": "en", "es-419": "es", "fr-CA": "fr" };

class SmsError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function twilio(path, params) {
  const r = await fetch(`https://verify.twilio.com/v2/Services/${SERVICE}/${path}`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => ({}));
  return { ...j, http: r.status }; // j.status é o estado da verificação (pending, approved)
}

// --- modo de teste (PHONE_DEV): os códigos ficam na memória por 10 minutos, 5 tentativas
const devCodes = new Map();

async function start(phone, channel, lang) {
  if (!CHANNELS.includes(channel)) channel = CHANNELS[0];
  if (DEV) {
    const code = String(require("node:crypto").randomInt(0, 1e6)).padStart(6, "0");
    devCodes.set(phone, { code, exp: Date.now() + 600_000, tries: 0 });
    console.log(`\n--- código de verificação (PHONE_DEV, ${channel}) ---\nPara: ${phone}\nCódigo: ${code}\n---\n`);
    return { channel };
  }
  const r = await twilio("Verifications", { To: phone, Channel: channel, Locale: LOCALE[lang] || "pt-BR" });
  if (r.http < 300) return { channel };
  console.error(new Date().toISOString(), "twilio verify", r.http, r.code, r.message);
  // 60200: número inválido; 60203/429: muitos envios para o mesmo número;
  // 60205: o número não recebe SMS (fixo); 60410: bloqueado por suspeita de fraude
  if (r.code === 60200 || r.code === 21211 || r.code === 60205) throw new SmsError(400, channel === "whatsapp" ? "Não conseguimos mandar para esse número pelo WhatsApp. Confira o número ou peça por SMS." : "Esse número não recebe SMS. Confira se é um celular.");
  if (r.code === 60203 || r.http === 429) throw new SmsError(429, "Mandamos códigos demais para esse número. Espere alguns minutos e tente de novo.");
  if (channel === "whatsapp") throw new SmsError(502, "Não deu para mandar pelo WhatsApp agora. Tente receber por SMS.");
  throw new SmsError(502, "Não deu para mandar o código agora. Tente de novo em instantes.");
}

// true = código certo (e ainda dentro do prazo)
async function check(phone, code) {
  code = String(code || "").replace(/\D/g, "");
  if (!/^\d{4,10}$/.test(code)) return false;
  if (DEV) {
    const c = devCodes.get(phone);
    if (!c || c.exp < Date.now() || c.tries >= 5) { devCodes.delete(phone); return false; }
    c.tries++;
    if (c.code !== code) return false;
    devCodes.delete(phone);
    return true;
  }
  const r = await twilio("VerificationCheck", { To: phone, Code: code });
  // 404 = não há código pendente (venceu, já foi usado ou passou do número de tentativas)
  if (r.http === 404) return false;
  if (r.http >= 300) {
    console.error(new Date().toISOString(), "twilio verify check", r.http, r.code, r.message);
    throw new SmsError(502, "Não deu para conferir o código agora. Tente de novo em instantes.");
  }
  return r.status === "approved" || r.valid === true;
}

module.exports = { ENABLED, DEV, CHANNELS, normalize, pretty, start, check, SmsError };
