// Envio de e-mail por SMTP (node:net/node:tls, sem dependências externas)
// Porta 465 usa TLS direto; 587 (ou 25) começa sem TLS e sobe com STARTTLS.
const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");

const HOST = process.env.SMTP_HOST || "";
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER || "";
const PASS = process.env.SMTP_PASS || "";
const FROM = process.env.MAIL_FROM || USER;
// MAIL_DEV=true: sem SMTP, só mostra o e-mail no terminal (para testar no computador)
const DEV = process.env.MAIL_DEV === "true" && !HOST;
const ENABLED = !!(HOST && FROM) || DEV;

const b64 = s => Buffer.from(s, "utf8").toString("base64");
const wrap = s => s.replace(/.{1,76}/g, "$&\r\n");
const header = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const addr = s => (String(s).match(/<([^>]+)>/) || [, s])[1].trim();
function fromHeader(s) {
  const m = String(s).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m && m[1] ? `${header(m[1])} <${m[2]}>` : addr(s);
}

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

function connect() {
  return new Promise((resolve, reject) => {
    const sock = PORT === 465 ? tls.connect({ host: HOST, port: PORT, servername: HOST }) : net.connect({ host: HOST, port: PORT });
    sock.once(PORT === 465 ? "secureConnect" : "connect", () => resolve(sock));
    sock.once("error", reject);
  });
}

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
