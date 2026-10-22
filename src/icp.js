// Confere laudos em PDF assinados digitalmente por médicos (ICP-Brasil), só com node:crypto.
//
// O que é conferido, nesta ordem:
//  1. o PDF tem uma assinatura digital (PAdES / CMS destacado) e ela cobre o arquivo inteiro
//     (nada foi acrescentado ou alterado depois de assinar);
//  2. o resumo (hash) do conteúdo bate com o que foi assinado e a assinatura confere com a chave do certificado;
//  3. o certificado encadeia até uma das raízes oficiais da ICP-Brasil (certs/icp-brasil) e estava válido na data da assinatura;
//  4. é um certificado de pessoa da ICP-Brasil (política 2.16.76.1.2.*) com uso para assinatura;
//  5. o certificado traz o registro no CRM (OID 2.16.76.1.4.2.2.*, atribuído pelo ITI ao Conselho Federal de Medicina);
//  6. o certificado não aparece na lista de revogados (LCR) da AC emissora, quando a lista pode ser baixada.
// Não dá para conferir o conteúdo do laudo (diagnóstico, nome do paciente): isso fica como declaração da pessoa.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// stage: até onde a conferência chegou (quanto maior, mais útil é a mensagem para a pessoa)
class IcpError extends Error { constructor(msg, stage = 0) { super(msg); this.stage = stage; } }
let STAGE = 0;
const no = msg => { throw new IcpError(msg, STAGE); };

/* ---------- DER/BER mínimo ---------- */
function tlv(buf, pos, limit = buf.length) {
  const start = pos;
  if (pos + 2 > limit) no("Estrutura da assinatura corrompida.");
  const tag = buf[pos++];
  let num = tag & 0x1f;
  if (num === 0x1f) { num = 0; let b; do { b = buf[pos++]; num = num * 128 + (b & 0x7f); } while (b & 0x80 && pos < limit); }
  let len = buf[pos++], indefinite = false;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0) indefinite = true;
    else { if (n > 4) no("Estrutura da assinatura corrompida."); len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[pos++]; }
  }
  const node = { buf, tag, cls: tag >> 6, cons: !!(tag & 0x20), num, start, hstart: pos };
  if (indefinite) { // BER: filhos até o marcador 00 00
    const kids = []; let p = pos;
    while (!(buf[p] === 0 && buf[p + 1] === 0)) { if (p >= limit) no("Estrutura da assinatura corrompida."); const k = tlv(buf, p, limit); kids.push(k); p = k.end; }
    node.end = p + 2; node.vend = p; node._kids = kids;
  } else {
    node.end = pos + len; node.vend = node.end;
    if (node.end > limit) no("Estrutura da assinatura corrompida.");
  }
  return node;
}
const der = buf => tlv(buf, 0);
const raw = n => n.buf.subarray(n.start, n.end);
const val = n => n.buf.subarray(n.hstart, n.vend);
function kids(n) {
  if (n._kids) return n._kids;
  const out = []; let p = n.hstart;
  while (p < n.vend) { const k = tlv(n.buf, p, n.vend); out.push(k); p = k.end; }
  return (n._kids = out);
}
function oid(n) {
  const b = val(n); const parts = [Math.floor(b[0] / 40), b[0] % 40]; let v = 0;
  for (let i = 1; i < b.length; i++) { v = v * 128 + (b[i] & 0x7f); if (!(b[i] & 0x80)) { parts.push(v); v = 0; } }
  return parts.join(".");
}
const intHex = n => val(n).toString("hex").replace(/^(00)+(?=.)/, "").toUpperCase();
function time(n) {
  const s = val(n).toString("latin1");
  const m = n.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(s);
  if (!m) return null;
  const y = n.tag === 0x17 ? (Number(m[1]) < 50 ? 2000 : 1900) + Number(m[1]) : Number(m[1]);
  return new Date(Date.UTC(y, m[2] - 1, m[3], m[4], m[5], m[6]));
}
// texto de qualquer tipo de string ASN.1 (ou OCTET STRING), procurando dentro de wrappers
function text(n) {
  if (n.cons) { const k = kids(n); return k.length ? text(k[0]) : ""; }
  const b = val(n);
  if (n.tag === 0x1e) { let s = ""; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b.readUInt16BE(i)); return s.trim(); } // BMPString
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b).trim(); } catch { return b.toString("latin1").trim(); }
}

/* ---------- algoritmos ---------- */
const HASH = { "1.3.14.3.2.26": "sha1", "2.16.840.1.101.3.4.2.1": "sha256", "2.16.840.1.101.3.4.2.2": "sha384", "2.16.840.1.101.3.4.2.3": "sha512" };
const SIG = { "1.2.840.113549.1.1.11": "sha256", "1.2.840.113549.1.1.12": "sha384", "1.2.840.113549.1.1.13": "sha512", "1.2.840.113549.1.1.5": "sha1",
  "1.2.840.10045.4.3.2": "sha256", "1.2.840.10045.4.3.3": "sha384", "1.2.840.10045.4.3.4": "sha512" };
function verifySig(algNode, digestName, data, key, signature) {
  const a = kids(algNode), id = oid(a[0]);
  if (id === "1.2.840.113549.1.1.10") { // RSASSA-PSS: parâmetros dizem o hash e o tamanho do sal
    let hash = "sha1", salt = 20;
    for (const p of a[1] ? kids(a[1]) : []) {
      if (p.num === 0) hash = HASH[oid(kids(kids(p)[0])[0])] || hash;
      if (p.num === 2) salt = parseInt(val(kids(p)[0]).toString("hex"), 16);
    }
    return crypto.verify(hash, data, { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: salt }, signature);
  }
  const hash = id === "1.2.840.113549.1.1.1" ? digestName : SIG[id];
  if (!hash) no("A assinatura usa um algoritmo que não é aceito.");
  if (hash === "sha1") no("A assinatura usa SHA-1, que não é mais aceito pela ICP-Brasil.");
  return crypto.verify(hash, data, id.startsWith("1.2.840.10045") ? { key, dsaEncoding: "der" } : key, signature);
}

/* ---------- certificados ---------- */
function certInfo(derBuf) {
  const x = new crypto.X509Certificate(derBuf);
  const tbs = kids(kids(der(derBuf))[0]);
  let i = tbs[0].cls === 2 && tbs[0].num === 0 ? 1 : 0;
  const info = { x, der: derBuf, serial: intHex(tbs[i]), issuerRaw: raw(tbs[i + 2]), ski: "", crm: "", crmUf: "", policies: [], keyUsage: 0, crlUrls: [] };
  const extsWrap = tbs.find(t => t.cls === 2 && t.num === 3);
  for (const e of extsWrap ? kids(kids(extsWrap)[0]) : []) {
    const ek = kids(e), id = oid(ek[0]), v = der(val(ek[ek.length - 1]));
    if (id === "2.5.29.14") info.ski = val(v).toString("hex").toUpperCase();
    if (id === "2.5.29.15") { const b = val(v); info.keyUsage = b[1] || 0; }
    if (id === "2.5.29.32") info.policies = kids(v).map(p => oid(kids(p)[0]));
    if (id === "2.5.29.31") (function walk(n) { if (n.cls === 2 && n.num === 6 && !n.cons) { const u = val(n).toString("latin1"); if (/^https?:\/\//i.test(u)) info.crlUrls.push(u); } else if (n.cons) kids(n).forEach(walk); })(v);
    if (id === "2.5.29.17") for (const g of kids(v)) {
      if (!(g.cls === 2 && g.num === 0 && g.cons)) continue; // otherName
      const [t, wrapped] = kids(g); const o = oid(t), s = wrapped ? text(wrapped) : "";
      if (o === "2.16.76.1.4.2.2.1") info.crm = s.replace(/[^0-9A-Za-z]/g, "");
      if (o === "2.16.76.1.4.2.2.2") info.crmUf = s.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
    }
  }
  const cn = (x.subject.match(/(?:^|\n)CN=([^\n]+)/) || [])[1] || "";
  info.name = cn.split(":")[0].trim(); // e-CPF: "NOME COMPLETO:CPF"
  return info;
}
function loadPem(file) {
  const pem = fs.readFileSync(file, "latin1");
  return (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []).map(p => new crypto.X509Certificate(p));
}
const DIR = path.join(__dirname, "..", "certs", "icp-brasil");
let TRUST = null;
function trust() {
  if (!TRUST) TRUST = { roots: loadPem(path.join(DIR, "raizes.pem")), inter: loadPem(path.join(DIR, "intermediarias.pem")) };
  return TRUST;
}
const validAt = (x, t) => new Date(x.validFrom) <= t && t <= new Date(x.validTo);
function buildChain(leaf, pool, roots, at) {
  const chain = [leaf]; let cur = leaf;
  for (let depth = 0; depth < 8; depth++) {
    if (!validAt(cur, at)) no(cur === leaf ? "O certificado do médico não estava válido na data da assinatura." : "Um certificado da cadeia não estava válido na data da assinatura.");
    const root = roots.find(r => cur.checkIssued(r) && cur.verify(r.publicKey));
    if (root) { if (!validAt(root, at)) no("A raiz ICP-Brasil não estava válida na data da assinatura."); return chain.concat(root); }
    const next = pool.find(c => !chain.includes(c) && c.ca && cur.checkIssued(c) && cur.verify(c.publicKey));
    if (!next) no("O certificado de quem assinou não pertence à ICP-Brasil.");
    chain.push(next); cur = next;
  }
  no("Cadeia de certificados longa demais.");
}

/* ---------- LCR (lista de certificados revogados) ---------- */
const crlCache = new Map(); // url -> { at, serials:Set, next }
async function revoked(info, issuer) {
  for (const url of info.crlUrls.filter(u => u.startsWith("http://") || u.startsWith("https://"))) {
    try {
      let c = crlCache.get(url);
      if (!c || (c.next && c.next < new Date()) || Date.now() - c.at > 6 * 3600e3) {
        const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20_000);
        const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 60e6) continue;
        const [tbsN, algN, sigN] = kids(der(buf));
        const sig = val(sigN).subarray(1);
        if (!verifySig(algN, "sha256", raw(tbsN), issuer.publicKey, sig)) continue; // LCR que não é da AC emissora
        const tbs = kids(tbsN); let i = tbs[0].tag === 0x02 ? 1 : 0;
        const next = tbs[i + 3] && (tbs[i + 3].tag === 0x17 || tbs[i + 3].tag === 0x18) ? time(tbs[i + 3]) : null;
        const list = tbs.find((t, k) => k > i + 2 && t.tag === 0x30);
        c = { at: Date.now(), next, serials: new Set(list ? kids(list).map(r => intHex(kids(r)[0])) : []) };
        crlCache.set(url, c);
      }
      return c.serials.has(info.serial) ? "revogado" : "ok";
    } catch { /* tenta a próxima URL */ }
  }
  return "indisponivel";
}

/* ---------- PDF ---------- */
function signaturesOf(pdf) {
  const s = pdf.toString("latin1"), out = [];
  for (const m of s.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)) {
    const [a, b, c, d] = m.slice(1).map(Number);
    if (a !== 0 || b <= 0 || c <= b || c + d > pdf.length || pdf[b] !== 0x3c || pdf[c - 1] !== 0x3e) continue;
    const hex = pdf.subarray(b + 1, c - 1).toString("latin1").replace(/\s/g, "");
    if (!/^[0-9a-fA-F]+$/.test(hex)) continue;
    out.push({ range: [a, b, c, d], cms: Buffer.from(hex, "hex"), whole: c + d === pdf.length });
  }
  return out;
}

async function checkSignature(pdf, sig, opts) {
  const { roots, inter } = opts.trust || trust();
  STAGE = 1;
  const ci = kids(der(sig.cms));
  if (oid(ci[0]) !== "1.2.840.113549.1.7.2") no("O PDF não tem uma assinatura no formato esperado.");
  const sd = kids(kids(ci[1])[0]);
  const encap = kids(sd[2]);
  if (encap[1]) no("Tipo de assinatura não suportado (conteúdo embutido). Use um PDF assinado no padrão PAdES.");
  const certsN = sd.find(n => n.cls === 2 && n.num === 0);
  const embedded = certsN ? kids(certsN).filter(k => k.tag === 0x30).map(k => certInfo(Buffer.from(raw(k)))) : [];
  const si = kids(kids(sd[sd.length - 1])[0]);
  const sid = si[1];
  const digestName = HASH[oid(kids(si[2])[0])];
  if (!digestName) no("A assinatura usa um algoritmo de resumo que não é aceito.");
  if (digestName === "sha1") no("A assinatura usa SHA-1, que não é mais aceito pela ICP-Brasil.");
  let idx = 3; const attrsN = si[3].cls === 2 && si[3].num === 0 ? si[idx++] : null;
  const sigAlg = si[idx++], signature = val(si[idx]);

  // quem assinou
  let signer;
  if (sid.tag === 0x30) { const [iss, ser] = kids(sid); signer = embedded.find(c => c.serial === intHex(ser) && c.issuerRaw.equals(raw(iss))); }
  else signer = embedded.find(c => c.ski && c.ski === val(sid).toString("hex").toUpperCase());
  if (!signer) no("O PDF não traz o certificado de quem assinou.");

  STAGE = 2;
  // conteúdo assinado = arquivo inteiro menos o espaço da própria assinatura
  const [a, b, c, d] = sig.range;
  const content = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
  const digest = crypto.createHash(digestName).update(content).digest();
  let signedAt = null;
  if (attrsN) {
    let md = null;
    for (const at of kids(attrsN)) {
      const [t, set] = kids(at), id = oid(t), v = kids(set)[0];
      if (id === "1.2.840.113549.1.9.4") md = val(v);
      if (id === "1.2.840.113549.1.9.5") signedAt = time(v);
    }
    if (!md || !md.equals(digest)) no("O PDF foi alterado depois de assinado (o conteúdo não bate com a assinatura).");
    const attrsDer = Buffer.from(raw(attrsN)); attrsDer[0] = 0x31; // assina-se o SET, não o [0]
    if (!verifySig(sigAlg, digestName, attrsDer, signer.x.publicKey, signature)) no("A assinatura digital não confere.");
  } else if (!verifySig(sigAlg, digestName, content, signer.x.publicKey, signature)) no("A assinatura digital não confere.");
  STAGE = 3;
  if (!sig.whole) no("O PDF recebeu alterações depois da assinatura do médico. Envie o arquivo exatamente como foi assinado.");

  STAGE = 4;
  const at = signedAt && signedAt <= new Date(Date.now() + 5 * 60e3) ? signedAt : new Date();
  const chain = buildChain(signer.x, embedded.map(e => e.x).concat(inter), roots, at);
  STAGE = 5;
  if (!signer.policies.some(p => p.startsWith("2.16.76.1.2."))) no("O certificado não é um certificado de pessoa da ICP-Brasil.");
  if (!(signer.keyUsage & 0xc0)) no("O certificado não é de uso para assinatura.");
  if (!signer.crm) no("A assinatura é ICP-Brasil, mas o certificado não identifica um médico (não traz o registro no CRM). O laudo precisa ser assinado com o certificado do médico.");
  const rev = opts.skipRevocation ? "indisponivel" : await revoked(signer, chain[1]);
  if (rev === "revogado") no("O certificado do médico foi revogado.");
  return { crm: signer.crm, uf: signer.crmUf, doctor: signer.name, signedAt: at, revocation: rev };
}

// Confere o PDF. Devolve { crm, uf, doctor, signedAt, revocation, sha256 } ou lança IcpError com o motivo.
async function verifyMedicalPdf(pdf, opts = {}) {
  if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") no("Envie o laudo em PDF.");
  const sigs = signaturesOf(pdf);
  if (!sigs.length) no("Esse PDF não tem assinatura digital. Peça ao médico o laudo assinado digitalmente (ICP-Brasil), não um PDF escaneado.");
  let lastErr = null;
  for (const s of sigs.reverse()) { // a última assinatura costuma ser a que cobre o arquivo inteiro
    try { return { ...(await checkSignature(pdf, s, opts)), sha256: crypto.createHash("sha256").update(pdf).digest("hex") }; }
    catch (e) {
      if (!(e instanceof IcpError)) e = new IcpError("Não deu para ler a assinatura deste PDF.", STAGE);
      if (!lastErr || e.stage > lastErr.stage) lastErr = e;
    }
  }
  throw lastErr;
}

module.exports = { verifyMedicalPdf, IcpError, _test: { certInfo, signaturesOf } };
