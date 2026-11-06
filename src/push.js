// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o carteiro das NOTIFICAÇÕES PUSH (aquelas que aparecem no celular ou no computador
// mesmo com o site fechado). Ele não entrega direto no aparelho: entrega na "agência"
// do navegador (Google para Chrome, Apple para Safari, Mozilla para Firefox), que leva
// até o aparelho. Duas regras dessas agências:
// 1. CARIMBO (VAPID): cada envio vai assinado com a nossa chave privada. A agência confere
//    com a chave pública, que o navegador recebeu quando a pessoa ligou as notificações.
//    Assim só o Osmo consegue mandar para quem se inscreveu no Osmo.
// 2. ENVELOPE LACRADO (aes128gcm, RFC 8291): o texto vai criptografado com as chaves do
//    próprio aparelho. A agência leva o envelope, mas não consegue ler o que tem dentro.
// Tudo com o node:crypto que já vem no Node, sem pacotes de fora.
// As chaves ficam no .env (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY); gere com configurar-push.sh.
const crypto = require("node:crypto");

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
// quem a agência deve procurar se algo der errado com os envios (um e-mail ou o site)
const SUBJECT = process.env.VAPID_SUBJECT || (process.env.PUBLIC_URL || "").replace(/\/$/, "") || "mailto:contato@osmo.com.br";
const ENABLED = !!(PUBLIC_KEY && PRIVATE_KEY);

const b64u = buf => Buffer.from(buf).toString("base64url");
const unb64u = s => Buffer.from(String(s), "base64url");

// As agências de push conhecidas. O servidor só manda para elas: um endereço qualquer
// vindo do navegador poderia apontar para dentro da nossa própria rede.
const HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^(?:[\w-]+\.)*push\.apple\.com$/, /^[\w-]+\.notify\.windows\.com$/];
function validEndpoint(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && !u.port && String(url).length <= 1000 && HOSTS.some(h => h.test(u.hostname));
  } catch { return false; }
}

// Um par de chaves novo (P-256), no formato que o navegador e o .env usam.
function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" }), priv = privateKey.export({ format: "jwk" });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])), privateKey: priv.d };
}

// A chave privada guardada como texto vira um objeto que o node:crypto sabe usar para assinar.
let signer = null;
function signingKey() {
  if (signer) return signer;
  const raw = unb64u(PUBLIC_KEY);
  signer = crypto.createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: PRIVATE_KEY, x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) } });
  return signer;
}

// O CARIMBO: um bilhete (JWT) dizendo "para a agência tal, válido por 12 horas, de quem é",
// assinado com a chave privada (ES256).
function vapidHeader(endpoint) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${claims}`), { key: signingKey(), dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${PUBLIC_KEY}`;
}

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

// O ENVELOPE LACRADO (RFC 8291 + RFC 8188, "aes128gcm"):
// - criamos um par de chaves só para esta mensagem e combinamos com a chave do aparelho (ECDH);
// - misturamos com o segredo "auth" do aparelho e um sal aleatório (HKDF) para tirar a chave e o nonce;
// - lacramos o texto com AES-128-GCM. O cabeçalho leva o sal e a nossa chave pública da mensagem.
function encrypt(text, p256dh, auth) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error("Chaves do aparelho inválidas.");
  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  // o byte 2 no fim marca "este é o último (e único) pedaço"
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text, "utf8"), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// ENVIAR para uma inscrição { endpoint, p256dh, auth }.
// data: o que o sw.js vai mostrar ({ title, body, url, tag }). Responde com o código da agência:
// 201 = entregue; 404 ou 410 = esse aparelho não quer mais (a inscrição deve ser apagada).
// ttl: por quanto tempo a agência guarda se o aparelho estiver desligado (segundos).
async function send(sub, data, { ttl = 24 * 3600, urgency = "normal", topic } = {}) {
  if (!ENABLED) throw new Error("Notificações não configuradas (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY).");
  const payload = JSON.stringify(data);
  if (Buffer.byteLength(payload) > 3000) throw new Error("Notificação grande demais.");
  const headers = {
    "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm",
    TTL: String(ttl), Urgency: urgency, Authorization: vapidHeader(sub.endpoint),
  };
  // Topic: uma notificação nova com o mesmo tópico substitui a antiga que ainda não foi entregue
  if (topic) headers.Topic = String(topic).replace(/[^\w-]/g, "").slice(0, 32);
  const res = await fetch(sub.endpoint, { method: "POST", headers, body: encrypt(payload, sub.p256dh, sub.auth), signal: AbortSignal.timeout(15_000) });
  return res.status;
}

module.exports = { ENABLED, PUBLIC_KEY, validEndpoint, generateKeys, send, encrypt, vapidHeader };
