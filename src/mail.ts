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
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

export interface MailMessage {
  to: string; subject: string; text: string; html: string; headers?: Record<string, string>;
}
interface SmtpResponse { code: number; text: string }

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
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const wrap = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");
const header = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const addr = (s: string) => (String(s).match(/<([^>]+)>/)?.[1] ?? s).trim();
function fromHeader(s: string) {
  const m = String(s).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m && m[1] ? `${header(m[1])} <${m[2]}>` : addr(s);
}

// O "ouvido" da conversa: junta o que o servidor vai falando, espera ele terminar a frase
// (uma linha que começa com 3 números e um espaço) e confere se o número é o esperado.
// Se a conexão cair ou passar de 20 segundos calado, dá erro em vez de ficar esperando para sempre.
// lê respostas do servidor (inclui as de várias linhas, "250-...", até "250 ...")
function reader(sock: net.Socket) {
  let buf = "", waiting: { resolve: (response: SmtpResponse) => void; reject: (error: Error) => void } | null = null, error: Error | null = null;
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
  return async (line: string | null, expect: number) => {
    const p = new Promise<SmtpResponse>((resolve, reject) => { waiting = { resolve, reject }; });
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
  return new Promise<net.Socket>((resolve, reject) => {
    const sock = PORT === 465 ? tls.connect({ host: HOST, port: PORT, servername: HOST }) : net.connect({ host: HOST, port: PORT });
    sock.once(PORT === 465 ? "secureConnect" : "connect", () => resolve(sock));
    sock.once("error", reject);
  });
}

// Manda um e-mail de verdade. O e-mail vai em duas versões juntas (texto simples e HTML
// bonitinho); o programa de e-mail de quem recebe escolhe qual mostrar.
// No modo DEV (testes no computador), não manda nada: só imprime o e-mail na tela.
async function send({ to, subject, text, html, headers = {} }: MailMessage): Promise<void> {
  if (DEV) { console.log(`\n--- e-mail (MAIL_DEV) para ${to}\nAssunto: ${subject}\n\n${text}\n---\n`); return; }
  if (!ENABLED) throw new Error("E-mail não configurado (SMTP_HOST e MAIL_FROM).");
  const domain = addr(FROM).split("@")[1] || "localhost";
  const boundary = "osmo-" + crypto.randomBytes(12).toString("hex");
  const cleanTo = String(to).replace(/[\r\n]+/g, "");
  const msg = [
    `From: ${fromHeader(FROM)}`, `To: ${cleanTo}`, `Subject: ${header(subject)}`, `Date: ${new Date().toUTCString()}`,
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
      sock = await new Promise<tls.TLSSocket>((resolve, reject) => {
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

// ============================================================================
// TEMPLATE VISUAL DE MENSAGENS DO SISTEMA (OSMO DESIGN SYSTEM)
// ============================================================================
// Usa os ativos oficiais da Osmo (wordmark SVG, símbolo O recortado do favicon.svg,
// paleta vinho #7A0B3C, rosa #FFB6C1, laranja #E8650F e superfícies quentes #FBF5F1/#F7EAE2).
export const OSMO_WORDMARK_PATH = "M15.12,10.53c-2.49,0-4.5,2.020-4.5,4.5s2.02,4.5,4.5,4.5,4.5-2.02,4.5-4.5-2.02-4.5-4.5-4.5ZM25.84,4.36C22.9,1.45,19.32,0,15.09,0S7.29,1.45,4.37,4.36C1.46,7.27,0,10.8,0,14.97s1.46,7.740,4.37,10.66,6.49,4.37,10.72,4.37,7.79-1.46,10.73-4.37c.65-.65,1.22-1.33,1.73-2.04-1.76-2.49-2.65-5.36-2.65-8.62s.89-6.11,2.66-8.59c-.51-.7-1.07-1.380-1.72-2.03ZM21.930,21.94c-1.890,1.92-4.18,2.89-6.86,2.89s-4.96-.96-6.84-2.87c-1.88-1.91-2.82-4.24-2.82-6.99s.94-5.01,2.82-6.93c1.88-1.91,4.16-2.87,6.84-2.87s4.97.96,6.86,2.87c1.89,1.91,2.84,4.22,2.840,6.93s-.95,5.05-2.84,6.97ZM41.77,7.55c-4.37,0-7.45,3.23-7.45,7.35s3.09,7.55,7.45,7.55,7.45-3.31,7.45-7.55-3.09-7.35-7.45-7.35ZM41.77,20.06c-2.76,0-4.75-2.23-4.75-5.16s1.99-4.95,4.75-4.95,4.75,2.15,4.75,4.95-1.99,5.16-4.75,5.16ZM86.75,7.55c-4.37,0-7.45,3.23-7.45,7.35s3.09,7.55,7.45,7.55,7.45-3.31,7.45-7.55-3.09-7.35-7.45-7.35ZM86.75,20.06c-2.76,0-4.75-2.23-4.75-5.16s1.99-4.95,4.75-4.95,4.75,2.15,4.75,4.95-1.99,5.16-4.75,5.16ZM75.38,7.79h-1.26c-.51,0-.81.22-.97.69l-2.58,6.44c-.32.85-.71,2.11-.71,2.11h-.04s-.41-1.26-.73-2.11l-2.58-6.44c-.16-.47-.47-.69-.95-.69h-1.28c-.53,0-.81.28-.87.81l-1.04,12.73c-.04.55.24.87.81.87h.91c.55,0,.83-.28.87-.81l.55-7.25c.06-.95.02-2.25.02-2.25h.04s.47,1.42.79,2.25l2.07,4.91c.16.45.47.67.97.67h.85c.49,0,.79-.22.95-.67l2.09-4.91c.32-.83.77-2.23.77-2.23h.04s-.04,1.28.02,2.23l.55,7.25c.04.53.34.81.87.81h.91c.57,0,.85-.33.81-.87l-1.04-12.73c-.04-.53-.35-.81-.87-.81ZM53.66,11.59c0-.97.85-1.62,2.19-1.62,1.12,0,1.91.45,2.5.79.43.22.85.3,1.16-.28l.37-.67c.24-.45.18-.83-.26-1.16-.61-.45-2.01-1.1-3.72-1.1-2.74,0-4.85,1.64-4.85,4.180,0,4.49,6.72,3.92,6.72,6.66,0,.98-.81,1.65-2.15,1.65-1.42,0-2.46-.73-2.92-1.06-.51-.28-.85-.26-1.18.18l-.45.65c-.41.55-.2.89.12,1.18.71.55,2.38,1.46,4.43,1.46,3.03,0,4.77-1.930,4.77-4.26,0-4.59-6.72-3.9-6.72-6.6Z";
export const OSMO_SYMBOL_PATH = "M15.12,10.53c-2.49,0-4.5,2.02-4.5,4.5s2.02,4.5,4.5,4.5,4.5-2.02,4.5-4.5-2.02-4.5-4.5-4.5ZM25.84,4.36C22.9,1.45,19.32,0,15.09,0S7.29,1.45,4.37,4.36C1.46,7.27,0,10.8,0,14.97s1.46,7.74,4.37,10.66,6.49,4.37,10.72,4.37,7.79-1.46,10.73-4.37c.65-.65,1.22-1.33,1.73-2.04-1.76-2.49-2.65-5.36-2.65-8.62s.89-6.11,2.66-8.59c-.51-.7-1.07-1.38-1.72-2.03ZM21.93,21.94c-1.89,1.92-4.18,2.89-6.86,2.89s-4.96-.96-6.84-2.87c-1.88-1.91-2.82-4.24-2.82-6.99s.94-5.01,2.82-6.93c1.88-1.91,4.16-2.87,6.84-2.87s4.97.96,6.86,2.87c1.89,1.91,2.84,4.22,2.84,6.93s-.95,5.05-2.84,6.97Z";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface EmailTemplateItem {
  sender?: string;
  body: string;
  system?: boolean;
}
export interface EmailTemplateOptions {
  eyebrow?: string;
  title: string;
  greeting: string;
  intro?: string;
  items?: EmailTemplateItem[];
  ctaLabel?: string;
  ctaUrl?: string;
  outro?: string;
  footerNote?: string;
  unsubscribeUrl?: string;
  unsubscribeLabel?: string;
  publicUrl?: string;
}

export function renderEmailTemplate(opts: EmailTemplateOptions): string {
  const origin = (opts.publicUrl || process.env.PUBLIC_URL || "https://osmo.com.br").replace(/\/+$/, "");
  const font = `'DIN Pro','Barlow','DIN Alternate','Helvetica Neue',system-ui,-apple-system,sans-serif`;
  const itemsHtml = (opts.items || []).map(item => {
    const bodyHtml = esc(item.body).replace(/\n/g, "<br>");
    if (item.system) {
      return `<div style="margin:0 0 12px;padding:14px 16px;border-radius:16px;background:#FBE4E3;border:1px dashed #EBD8CE;border-left:4px solid #7A0B3C;color:#1C0B12">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="18" height="18" style="vertical-align:middle;flex:none"><rect width="32" height="32" rx="8" fill="#7A0B3C"/><g transform="translate(5.5 5.5) scale(.7)" fill="#FFFFFF"><path d="${OSMO_SYMBOL_PATH}"/></g></svg>
          <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7A0B3C">Aviso do sistema · Osmo</span>
        </div>
        <div style="font-size:15px;line-height:1.55;color:#1C0B12">${bodyHtml}</div>
      </div>`;
    }
    return `<div style="margin:0 0 12px;padding:14px 16px;border-radius:18px 18px 18px 6px;background:#F7EAE2;border:1px solid #EBD8CE;color:#1C0B12">
      ${item.sender ? `<div style="font-size:13px;font-weight:700;color:#7A0B3C;margin-bottom:4px">${esc(item.sender)}</div>` : ""}
      <div style="font-size:15.5px;line-height:1.55;color:#1C0B12">${bodyHtml}</div>
    </div>`;
  }).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&display=swap">
</head>
<body style="margin:0;padding:24px 12px;background-color:#FBF5F1;font-family:${font};color:#1C0B12;-webkit-font-smoothing:antialiased">
  <div style="max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #EBD8CE;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(160,60,20,0.08)">
    <!-- Cabeçalho Hero com gradiente oficial do Design System e logo SVG -->
    <div style="background:#7A0B3C;background-image:linear-gradient(135deg,#D85A16 0%,#A3303A 35%,#7A0B3C 75%,#610930 100%);padding:26px 28px;border-bottom:3px solid #E8650F">
      <a href="${esc(origin)}" style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:#FFFFFF">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 94.2 30" width="76" height="24" fill="#FFFFFF" aria-label="Osmo" style="display:block"><path d="${OSMO_WORDMARK_PATH}"/></svg>
        <span style="display:inline-block;width:1px;height:16px;background:rgba(255,255,255,0.35)"></span>
        <span style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FFB6C1">Talents</span>
      </a>
      ${opts.eyebrow ? `<div style="margin-top:16px;font-size:11.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#FFC9A3">${esc(opts.eyebrow)}</div>` : ""}
      <h1 style="margin:6px 0 0;font-size:22px;line-height:1.2;font-weight:700;color:#FFFFFF">${esc(opts.title)}</h1>
    </div>

    <!-- Corpo principal -->
    <div style="padding:28px;font-size:16.5px;line-height:1.6;color:#1C0B12">
      <p style="margin:0 0 14px;font-weight:600;color:#1C0B12">${esc(opts.greeting)}</p>
      ${opts.intro ? `<p style="margin:0 0 18px;color:#1C0B12">${esc(opts.intro)}</p>` : ""}
      ${itemsHtml}
      ${opts.ctaLabel && opts.ctaUrl ? `<div style="margin:24px 0 20px">
        <a href="${esc(opts.ctaUrl)}" style="display:inline-block;background-color:#7A0B3C;color:#FFFFFF;padding:13px 24px;border-radius:999px;border:2px solid #E8650F;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase">${esc(opts.ctaLabel)}</a>
      </div>` : ""}
      ${opts.outro ? `<div style="margin-top:18px;padding:12px 14px;border-radius:12px;background:#F8EBD3;color:#935E11;font-size:14px;line-height:1.5">${esc(opts.outro).replace(/\n/g, "<br>")}</div>` : ""}
    </div>

    <!-- Rodapé com símbolo SVG Osmo -->
    <div style="padding:18px 28px;background-color:#F7EAE2;border-top:1px solid #EBD8CE;font-size:13px;line-height:1.5;color:#6E5560">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="18" height="18" style="vertical-align:middle;flex:none"><rect width="32" height="32" rx="6" fill="#7A0B3C"/><g transform="translate(5.5 5.5) scale(.7)" fill="#FFFFFF"><path d="${OSMO_SYMBOL_PATH}"/></g></svg>
        <strong style="color:#1C0B12">Osmo Talents</strong>
        <span>· Trabalho freelance com regras claras</span>
      </div>
      ${opts.footerNote ? `<p style="margin:4px 0;color:#6E5560">${esc(opts.footerNote)}</p>` : ""}
      <p style="margin:6px 0 0">
        <a href="${esc(origin)}" style="color:#7A0B3C;text-decoration:none;font-weight:600">osmo.com.br</a>
        ${opts.unsubscribeUrl && opts.unsubscribeLabel ? ` · <a href="${esc(opts.unsubscribeUrl)}" style="color:#6E5560;text-decoration:underline">${esc(opts.unsubscribeLabel)}</a>` : ""}
      </p>
    </div>
  </div>
</body>
</html>`;
}

export { ENABLED, send };
