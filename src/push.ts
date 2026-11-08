// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "carteiro das notificações": aquele aviso que aparece no celular ou no canto da
// tela do computador mesmo com o site fechado ("Ana mandou mensagem sobre Logo").
// Nós NÃO falamos direto com o aparelho. Cada navegador tem o seu "correio de avisos"
// (o do Chrome é do Google, o do Firefox é da Mozilla, o do iPhone é da Apple). Quando a
// pessoa liga as notificações, o navegador nos entrega um ENDEREÇO nesse correio (endpoint)
// e duas chaves. Para avisar, mandamos um pacote para esse endereço e o correio leva ao aparelho.
// Duas regras do jogo (Web Push):
// 1. CARIMBO (VAPID, RFC 8292): cada pacote vai com uma "assinatura" feita com a nossa chave
//    secreta. Assim o correio sabe que o pacote veio mesmo da Osmo, e mais ninguém consegue
//    mandar avisos para quem se inscreveu aqui.
// 2. CADEADO (aes128gcm, RFC 8291): o conteúdo vai trancado com as chaves do próprio aparelho.
//    O correio do Google/Apple/Mozilla carrega o pacote, mas não consegue ler o que está dentro.
// Tudo feito com node:crypto e fetch, sem bibliotecas de fora.
// Sem as chaves no .env (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY), ENABLED fica false e nada disso liga.
import crypto from "node:crypto";
import { errorMessage, record } from "./service-values.js";

export interface PushSubscription { endpoint: string; keys: { p256dh: string; auth: string } }
export interface StoredPushSubscription { endpoint: string; p256dh: string; auth: string }
export interface PushMessage { title: string; body: string; url: string; tag: string; badge?: number }
export interface EncryptionTestOptions { asPrivate?: string; salt?: string }

const b64u = (buf: string | Uint8Array) => Buffer.from(buf).toString("base64url");
const unb64u = (s: unknown) => Buffer.from(String(s || ""), "base64url");

// As chaves vêm do .env (gere com: bash configurar-push.sh). A pública tem 65 bytes
// (um ponto da curva P-256, começando com 0x04); a secreta tem 32 bytes.
// VAPID_SUBJECT é um contato nosso (mailto: ou https:) para o correio avisar se der problema.
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || `mailto:${(process.env.MAIL_FROM || "").match(/[^<\s]+@[^>\s]+/)?.[0] || "contato@osmo.com.br"}`;

// Transforma as duas chaves (texto) numa "chave de assinar" que o node:crypto entende (formato JWK).
// Se estiverem estragadas, avisamos no registro e deixamos o push desligado em vez de derrubar o site.
let signKey: crypto.KeyObject | null = null;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    const pub = unb64u(PUBLIC_KEY);
    if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY precisa ter 65 bytes");
    signKey = crypto.createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)), d: PRIVATE_KEY } });
  } catch (e) { console.error("push: chaves VAPID inválidas, notificações desligadas:", errorMessage(e)); }
}
const ENABLED = !!signKey;

// Só aceitamos endereços dos correios de verdade (Google, Mozilla, Microsoft, Apple). Sem isso,
// alguém poderia "se inscrever" com um endereço da nossa própria rede interna e usar o servidor
// para bater em lugares onde ele não deveria.
const ENDPOINT_OK = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|apple\.com)\//i;

// O CARIMBO (VAPID): um bilhetinho JSON assinado ("JWT") dizendo para qual correio é (aud),
// até quando vale (exp, 12 horas) e quem somos (sub). A assinatura ES256 é feita com a chave secreta.
// O correio confere com a chave pública, que vai junto no cabeçalho (k=...).
function vapidHeader(endpoint: string) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: signKey!, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${PUBLIC_KEY}`;
}

// O CADEADO (RFC 8291). Passo a passo:
// 1. inventamos um par de chaves descartável só para este pacote (as_private / as_public);
// 2. juntando a nossa chave descartável com a chave pública do aparelho (p256dh), os dois lados
//    chegam ao MESMO segredo sem nunca enviá-lo (é a mágica do "ECDH");
// 3. misturamos esse segredo com o "auth" do aparelho e um sal aleatório (HKDF) e tiramos
//    dele a chave do cadeado (CEK, 16 bytes) e um número único (NONCE, 12 bytes);
// 4. trancamos o texto com AES-128-GCM. O byte 0x02 no fim quer dizer "este é o último pedaço";
// 5. o pacote começa com um cabeçalho: sal (16) + tamanho do pedaço (4) + nossa chave descartável (65).
// "test" só existe para conferir com o exemplo oficial da RFC (chave e sal fixos).
function encrypt(payload: string | Uint8Array, p256dh: string, auth: string, test: EncryptionTestOptions = {}) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const ecdh = crypto.createECDH("prime256v1");
  if (test.asPrivate) ecdh.setPrivateKey(unb64u(test.asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const salt = test.salt ? unb64u(test.salt) : crypto.randomBytes(16);
  const secret = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", secret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPublic.length;
  return Buffer.concat([head, asPublic, sealed]);
}

// Confere se a inscrição que o navegador mandou tem cara de inscrição de verdade.
function validSubscription(value: unknown): value is PushSubscription {
  const s = record(value);
  if (!value || typeof s.endpoint !== "string" || s.endpoint.length > 1000 || !ENDPOINT_OK.test(s.endpoint)) return false;
  const k = record(s.keys), p = unb64u(k.p256dh), a = unb64u(k.auth);
  return p.length === 65 && p[0] === 4 && a.length === 16;
}

// Manda UM aviso para UM aparelho. Devolve o código do correio:
// 201 = entregue ao correio; 404 ou 410 = essa inscrição não existe mais (a pessoa desligou
// as notificações ou desinstalou o app), então quem chamou deve apagá-la do banco.
// TTL = quanto tempo o correio guarda o aviso se o aparelho estiver desligado (1 dia).
async function send(sub: StoredPushSubscription, data: PushMessage): Promise<number> {
  if (!ENABLED) return 0;
  const body = encrypt(JSON.stringify(data), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST", body, signal: AbortSignal.timeout(15_000),
    headers: { Authorization: vapidHeader(sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" },
  });
  if (res.status >= 400 && res.status !== 404 && res.status !== 410) console.error(new Date().toISOString(), "push", res.status, (await res.text().catch(() => "")).slice(0, 200));
  return res.status;
}

export { ENABLED, PUBLIC_KEY, send, encrypt, validSubscription };
