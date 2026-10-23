// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// Este é o "carteiro de e-mails" da plataforma. Ele manda avisos como
// "você recebeu uma mensagem" ou "aqui está o link para trocar sua senha".
// Para mandar um e-mail, o programa conversa com um "servidor de correio" (SMTP)
// usando frases combinadas, quase como um jogo de perguntas e respostas:
//   nós: "Olá, sou a Osmo"          (EHLO)
//   ele: "Oi! Pode falar."          (250)
//   nós: "Vou mandar de fulano..."  (MAIL FROM)
//   nós: "...para ciclano"          (RCPT TO)
//   nós: "Lá vai o texto"           (DATA) ... e um ponto final sozinho para terminar.
// Cada resposta começa com um número de 3 dígitos: 2xx quer dizer "tudo certo".
// Envio de e-mail por SMTP (node:net/node:tls, sem dependências externas)
// Porta 465 usa TLS direto; 587 (ou 25) começa sem TLS e sobe com STARTTLS.
const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");

// Os dados do servidor de correio vêm do .env: endereço (HOST), porta, usuário, senha e
// quem aparece como remetente (FROM).
const HOST = process.env.SMTP_HOST || "";
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.MAIL_FROM || USER;
// MAIL_DEV=true: sem SMTP, só mostra o e-mail no terminal (para testar no computador)
const DEV = process.env.MAIL_DEV === "true" && !HOST;
const ENABLED = !!(HOST && FROM) || DEV;

// Ferramentinhas para montar o e-mail:
// - b64: transforma o texto em "base64", um jeito de escrever qualquer letra (acentos, emojis)
//   só com letras e números simples, que todo servidor de e-mail entende;
// - wrap: quebra o texto em linhas de 76 letras (regra antiga dos e-mails);
// - header: se o assunto tiver acento, embrulha ele num formato especial para não virar "Ã§";
// - addr / fromHeader: tiram só o endereço de "Osmo <oi@osmo.com.br>".
const b64 = s => Buffer.from(s, "utf8").toString("base64");
const wrap = s => s.replace(/.{1,76}/g, "$&\r\n");
const header = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const addr = s => (String(s).match(/<([^>]+)>/) || [, s])[1].trim();
function fromHeader(s) {
  const m = String(s).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m && m[1] ? `${header(m[1])} <${m[2]}>` : addr(s);
}

// O "ouvido" da conversa: junta o que o servidor vai falando, espera ele terminar a frase
// (uma linha que começa com 3 números e um espaço) e confere se o número é o esperado.
// Se a conexão cair ou passar de 20 segundos calado, dá erro em vez de ficar esperando para sempre.
// lê respostas do servidor (inclui as de várias linhas, "250-...", até "250 ...")
function reader(sock) {
  let buf = "", waiting = null, error = null;
  const check = () => {
    if (!waiting) return;
    if (error) { const w = waiting; waiting = null; return w.reject(error); }
    const m = buf.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/);
    if (!m) return;
    const text = buf; buf = "";
    const w = waiting; waiting = null; w.resolve({ code: Number(m[1]), text });
  };
  sock.setEncoding("utf8");
  sock.on("data", d => { buf += d; check(); });
  sock.on("error", e => { error = e; check(); });
  sock.on("close", () => { error = error || new Error("SMTP: conexão fechada"); check(); });
  sock.setTimeout(20_000, () => sock.destroy(new Error("SMTP: tempo esgotado")));
  return async (line, expect) => {
    const p = new Promise((resolve, reject) => { waiting = { resolve, reject }; });
    if (line !== null) sock.write(line + "\r\n");
    check();
    const r = await p;
    if (!String(r.code).startsWith(String(expect))) throw new Error(`SMTP ${line === null ? "conexão" : line.split(" ")[0]}: ${r.text.trim()}`);
    return r;
  };
}

// Liga para o servidor de correio. Na porta 465 a ligação já começa "com cadeado" (TLS);
// nas outras, começa aberta e depois pede o cadeado (STARTTLS).
function connect() {
  return new Promise((resolve, reject) => {
    const sock = PORT === 465 ? tls.connect({ host: HOST, port: PORT, servername: HOST }) : net.connect({ host: HOST, port: PORT });
    sock.once(PORT === 465 ? "secureConnect" : "connect", () => resolve(sock));
    sock.once("error", reject);
  });
}

// Manda um e-mail de verdade. O e-mail vai em duas versões juntas (texto simples e HTML
// bonitinho); o programa de e-mail de quem recebe escolhe qual mostrar.
// No modo DEV (testes no computador), não manda nada: só imprime o e-mail na tela.
async function send({ to, subject, text, html, headers = {} }) {
  if (DEV) { console.log(`\n--- e-mail (MAIL_DEV) para ${to}\nAssunto: ${subject}\n\n${text}\n---\n`); return; }
  if (!ENABLED) throw new Error("E-mail não configurado (SMTP_HOST e MAIL_FROM).");
  const domain = addr(FROM).split("@")[1] || "localhost";
  const boundary = "osmo-" + crypto.randomBytes(12).toString("hex");
  const msg = [
    `From: ${fromHeader(FROM)}`, `To: ${to}`, `Subject: ${header(subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(16).toString("hex")}@${domain}>`, "MIME-Version: 1.0",
    ...Object.entries(headers).map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]/g, "")}`),
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", wrap(b64(text)),
    `--${boundary}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", wrap(b64(html)),
    `--${boundary}--`, "",
  ].join("\r\n");

  // O "jogo de perguntas e respostas" com o servidor, passo a passo (veja o topo do arquivo).
  // Se a porta não for 465, pedimos o cadeado (STARTTLS) e recomeçamos a conversa já protegida.
  // AUTH PLAIN = entregar usuário e senha; o "finally" garante que a ligação é desligada
  // mesmo se algo der errado no meio.
  let sock = await connect();
  try {
    let cmd = reader(sock);
    await cmd(null, 2);
    let ehlo = await cmd(`EHLO ${domain}`, 2);
    if (PORT !== 465) {
      if (!/STARTTLS/i.test(ehlo.text)) throw new Error("SMTP: o servidor não oferece STARTTLS");
      await cmd("STARTTLS", 2);
      sock.removeAllListeners("data"); sock.removeAllListeners("close"); sock.removeAllListeners("error"); sock.setTimeout(0);
      sock = await new Promise((resolve, reject) => {
        const s = tls.connect({ socket: sock, servername: HOST }, () => resolve(s));
        s.once("error", reject);
      });
      cmd = reader(sock);
      ehlo = await cmd(`EHLO ${domain}`, 2);
    }
    if (USER) await cmd(`AUTH PLAIN ${b64(`\0${USER}\0${PASS}`)}`, 235);
    await cmd(`MAIL FROM:<${addr(FROM)}>`, 2);
    await cmd(`RCPT TO:<${addr(to)}>`, 2);
    await cmd("DATA", 354);
    await cmd(msg + "\r\n.", 2);
    await cmd("QUIT", 2).catch(() => {});
  } finally {
    sock.destroy();
  }
}

module.exports = { ENABLED, send };
