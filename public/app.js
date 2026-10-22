"use strict";
/* Osmo Talents: aplicação do navegador (sem dependências) */

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = n => "R$ " + Number(n || 0).toLocaleString("pt-BR");
const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const isMobile = () => matchMedia("(max-width:700px)").matches;
// categorias e habilidades vêm de /taxonomia.json (importadas do Upwork); estas quatro valem até o arquivo carregar
let CATS = [
  { id: "design", n: "Design e criação", c: "Marca, interfaces, vídeo, 3D" },
  { id: "dev", n: "Desenvolvimento e TI", c: "Sites, apps, lojas virtuais" },
  { id: "texto", n: "Escrita e conteúdo", c: "Copy, roteiro, revisão" },
  { id: "dados", n: "Dados e análise", c: "Painéis, planilhas, pesquisa" },
];
let SKILLS = { all: [], byCat: {} };
async function loadTaxonomy() {
  try {
    const t = await (await fetch("/taxonomia.json")).json();
    CATS = t.categorias.map(c => ({ id: c.id, n: c.nome, c: c.resumo }));
    const uniq = a => [...new Set(a)];
    t.categorias.forEach(c => { SKILLS.byCat[c.id] = uniq(c.especialidades.flatMap(e => e.habilidades)); });
    SKILLS.all = uniq(Object.values(SKILLS.byCat).flat()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch {}
}
const catName = id => (CATS.find(c => c.id === id) || {}).n || "";

/* sugestões de habilidades: enquanto digita, procura em todas; sem texto, mostra as da área escolhida */
const fold = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function skillSugHTML(value, cat) {
  const parts = String(value || "").split(","), term = fold(parts[parts.length - 1].trim());
  const have = new Set(parts.map(p => fold(p.trim())).filter(Boolean));
  const pool = term ? [...(SKILLS.byCat[cat] || []), ...SKILLS.all] : (SKILLS.byCat[cat] || []);
  // começo do nome primeiro, depois começo de palavra, depois qualquer trecho
  const rank = k => { const f = fold(k); return f.startsWith(term) ? 0 : (" " + f).includes(" " + term) ? 1 : 2; };
  const list = [...new Set(pool)].filter(k => !have.has(fold(k)) && (!term || fold(k).includes(term)))
    .map((k, i) => [k, term ? rank(k) : 0, i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]).slice(0, 8);
  if (!list.length) return term || cat ? "" : `<span class="hint">Comece a digitar para ver sugestões.</span>`;
  return `<span class="hint">Sugestões:</span>${list.map(k => `<button type="button" class="chip sug" data-skill-add="${esc(k)}">+ ${esc(k)}</button>`).join("")}`;
}
function addSkill(k) {
  const inp = $("#p_skills"); if (!inp) return;
  const parts = inp.value.split(",").map(p => p.trim()); parts[parts.length - 1] = k;
  inp.value = parts.filter(Boolean).join(", ") + ", ";
  inp.dispatchEvent(new Event("input", { bubbles: true })); inp.focus();
}
const store = {
  get(k, d) { try { const v = localStorage.getItem("osmo." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { v == null ? localStorage.removeItem("osmo." + k) : localStorage.setItem("osmo." + k, JSON.stringify(v)); } catch {} },
};
function when(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + "Z"), s = (Date.now() - d) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
function hm(iso) { const d = new Date(iso.replace(" ", "T") + "Z"); return d.toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" }); }
function initials(n) { return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
// selo verde de verificado (laudo médico assinado com ICP-Brasil), no formato "roseta" dos selos de redes sociais
const VB_SVG = (() => {
  const bumps = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<circle cx="${(12 + 8.2 * Math.cos(a)).toFixed(2)}" cy="${(12 + 8.2 * Math.sin(a)).toFixed(2)}" r="3"/>`; }).join("");
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="12" r="8.6"/>${bumps}</g><path d="M7.7 12.4l2.9 2.9 5.8-6" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
})();
const VB_TXT = "Verificado: neurodivergência comprovada por laudo médico com assinatura digital ICP-Brasil";
const vbadge = on => on ? `<span class="vbadge" role="img" aria-label="${VB_TXT}" title="${VB_TXT}">${VB_SVG}</span>` : "";
const av = (name, id, size = "", src = "") => src ? `<img class="av ${size}" src="${esc(src)}" alt="" loading="lazy">` : `<div class="av ${size} c${(id || 0) % 4}" aria-hidden="true">${esc(initials(name))}</div>`;
function clarBar(v) { const cls = v >= 80 ? "" : v >= 65 ? "mid" : "low"; return `<span class="clarity" title="Clareza do briefing"><span class="bar ${cls}"><i style="width:${v}%"></i></span>${v}% claro</span>`; }
function toast(m) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

async function api(method, path, body) {
  const opt = { method, headers: { "X-Osmo": "1" }, credentials: "same-origin" };
  if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, opt); } catch { throw Object.assign(new Error("Sem conexão com o servidor. Confira sua internet e tente de novo."), { status: 0 }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Algo deu errado."), { status: res.status });
  return data;
}

const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2"/><path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const eyeBtn = () => `<button type="button" class="eye-btn" data-act="toggle-pass" aria-label="Mostrar senha" aria-pressed="false" aria-controls="a_pass">${EYE}</button>`;

/* ---------- estado ---------- */
let ME = null, PAY = { enabled: false, fee: 10, autoRelease: 7 }, OAUTH = [], MAIL = false;
const S = { q: "", cat: "", clear: false, async: false, flex: false, sort: "recentes", aud: "freela", next: null };
// vidro líquido vem ligado, exceto para quem pediu menos transparência no sistema
const PREFS = Object.assign({ big: false, airy: false, calm: false, focus: false, glass: !matchMedia("(prefers-reduced-transparency: reduce)").matches }, store.get("prefs", {}));
let pollTimer = null, renderSeq = 0;

// versão nova publicada: a página recarrega na próxima troca de tela (nunca no meio de um formulário)
const MY_V = ["app.js", "styles.css"].map(n => {
  const el = document.querySelector(`script[src^="/${n}"], link[href^="/${n}"]`);
  return ((el && (el.getAttribute("src") || el.getAttribute("href"))) || "").match(/[?&]v=([a-z0-9]+)/)?.[1] || "";
}).join(".");
let NEW_VERSION = false, lastVersionCheck = Date.now();
const noteVersion = v => {
  if (!v || !/^\w+\.\w+$/.test(MY_V) || v === MY_V) return;
  try { if (sessionStorage.getItem("osmo-reload") === v) return; sessionStorage.setItem("osmo-reload", v); } catch { return; } // recarrega uma vez só por versão
  NEW_VERSION = true;
};
async function checkVersion() {
  if (Date.now() - lastVersionCheck < 60_000) return;
  lastVersionCheck = Date.now();
  try { noteVersion((await api("GET", "/api/me")).v); } catch {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(); });
async function refreshMe() {
  try { const d = await api("GET", "/api/me"); noteVersion(d.v); ME = d.user; if (d.payments) PAY = d.payments; OAUTH = d.oauth || []; MAIL = !!d.mail; } catch { ME = null; }
  renderChrome();
}

/* ---------- cabeçalho e menu ---------- */
const ICONS = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  vagas: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  talentos: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
  mensagens: '<path d="M4 5h16v11H9l-5 4z"/>',
  painel: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  entrar: '<path d="M10 17l5-5-5-5M15 12H3M14 3h6v18h-6"/>',
};
function renderChrome() {
  const unread = ME ? ME.unread : 0;
  $$("[data-unread]").forEach(b => { b.hidden = !unread; b.textContent = unread; });
  const top = $("#topActions");
  const pub = !ME || ME.role === "cliente" ? `<button class="btn sm hl" data-go="publicar">Publicar<span class="only-d"> vaga</span></button>` : "";
  top.innerHTML = `<button class="btn sm" id="a11yBtn" aria-haspopup="dialog">Conforto</button>
    ${ME ? `<button class="whoami" data-go="perfil" title="Meu perfil">${esc(ME.name.split(" ")[0])}</button>` : `<button class="btn sm" data-go="entrar">Entrar</button>`}
    ${pub}
    <button class="menu-btn" id="menuBtn" aria-label="Abrir menu" aria-expanded="false" aria-controls="mmenu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>`;
  const item = (k, label, extra = "") => `<li><button data-go="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${label}${extra}</span><span class="chev" aria-hidden="true">›</span></button></li>`;
  $("#mmBody").innerHTML = `
    ${ME ? `<p class="mm-user">Olá, ${esc(ME.name.split(" ")[0])} · ${ME.role === "cliente" ? "conta de cliente" : "conta de freelancer"}</p>` : ""}
    <ul class="mm-list">
      ${item("inicio", "Início")}${item("vagas", "Encontrar trabalho")}${item("talentos", "Encontrar talentos")}
      ${ME ? item("mensagens", "Mensagens", unread ? `<span class="badge">${unread}</span>` : "") + item("painel", "Painel") + item("perfil", "Meu perfil") : item("entrar", "Entrar ou criar conta")}
    </ul>
    <div class="mm-foot">
      ${!ME || ME.role === "cliente" ? `<button class="btn hl" data-go="publicar">Publicar vaga</button>` : ""}
      <button class="btn" id="mmA11y">Ajustes de conforto</button>
      ${ME ? `<button class="btn ghost" data-act="logout">Sair da conta</button>` : ""}
    </div>`;
  // barra de navegação embaixo (só em telas pequenas; o CSS decide quando aparece)
  const tabs = !ME ? [["inicio", "Início"], ["vagas", "Vagas"], ["talentos", "Talentos"], ["entrar", "Entrar"]]
    : [["inicio", "Início"], ME.role === "cliente" ? ["talentos", "Talentos"] : ["vagas", "Vagas"], ["mensagens", "Mensagens"], ["painel", "Painel"], ["perfil", "Perfil"]];
  $("#tabbar").innerHTML = tabs.map(([k, label]) => `<button data-go="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${label}</span>${k === "mensagens" && unread ? `<span class="badge" aria-label="${unread} não lidas">${unread}</span>` : ""}</button>`).join("");
  const pn = $("#payNote"); if (pn) pn.textContent = PAY.enabled ? `Pagamento protegido pelo Asaas · taxa Osmo ${PAY.fee}%` : "Pagamentos ainda simulados durante o período de testes.";
  markNav();
}
function markNav() {
  const name = (location.hash.slice(1) || "inicio").split("-")[0];
  $$("#nav button, #mmenu [data-go], #tabbar [data-go]").forEach(b => {
    const g = b.dataset.go;
    const on = g === name || (g === "vagas" && (name === "vaga" || name === "proposta")) || (g === "talentos" && name === "talento");
    on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current");
  });
}

/* ---------- roteador ---------- */
function go(h) { if (location.hash === "#" + h) route(); else location.hash = h; }
function needLogin(role) {
  if (!ME) { S.next = location.hash.slice(1); go("entrar"); return true; }
  if (role && ME.role !== role) { $("#view").innerHTML = emptyBox(role === "cliente" ? "Esta área é para contas de cliente." : "Esta área é para contas de freelancer.", "Você está com uma conta de " + (ME.role === "cliente" ? "cliente" : "freelancer") + ".", "inicio", "Ir para o início"); return true; }
  return false;
}
function emptyBox(title, text, goTo, label) {
  return `<div class="empty"><b>${esc(title)}</b>${text ? `<p class="muted">${esc(text)}</p>` : ""}${goTo ? `<button class="btn" data-go="${goTo}">${esc(label)}</button>` : ""}</div>`;
}
async function route() {
  if (NEW_VERSION) return location.reload();
  document.body.classList.remove("chat-full");
  checkVersion();
  clearInterval(pollTimer);
  const seq = ++renderSeq;
  const h = location.hash.slice(1) || "inicio";
  const [name, idStr] = h.split("-"); const id = Number(idStr) || null;
  const fn = V[name] || V.inicio;
  markNav();
  // trocou de tela e a resposta demorou: mostra blocos no formato do conteúdo (parados, sem animação)
  const skT = h !== SHOWN ? setTimeout(() => { if (seq === renderSeq) { $("#view").innerHTML = skeleton(name); window.scrollTo(0, 0); } }, 150) : null;
  try {
    const html = await fn(id);
    clearTimeout(skT);
    if (seq !== renderSeq || html === undefined) return;
    $("#view").innerHTML = html; SHOWN = h;
    window.scrollTo(0, 0);
    after[name] && after[name](id);
  } catch (e) {
    clearTimeout(skT);
    if (seq !== renderSeq) return;
    if (e.status === 401) { ME = null; renderChrome(); S.next = h; go("entrar"); return; }
    $("#view").innerHTML = emptyBox("Não deu para abrir esta página.", e.message, "inicio", "Voltar ao início");
  }
}
window.addEventListener("hashchange", route);
let SHOWN = "";
function skeleton(name) {
  const b = (h, w = "100%", extra = "") => `<div class="sk" style="height:${h}px; width:${w}${extra}"></div>`;
  const rows = (n, h) => Array.from({ length: n }, () => b(h)).join("");
  const shapes = {
    inicio: b(360) + `<div class="sk-grid">${rows(4, 90)}</div>`,
    vagas: b(28, "45%") + b(16, "30%") + rows(3, 150),
    talentos: b(28, "45%") + `<div class="sk-grid">${rows(6, 170)}</div>`,
    vaga: b(16, "25%") + b(36, "75%") + b(320), proposta: b(16, "25%") + b(36, "60%") + b(280),
    talento: `<div class="sk-row">${b(92, "92px", "; border-radius:50%; flex:none")}<div class="sk-col">${b(32, "70%")}${b(16, "45%")}</div></div>` + b(240),
    mensagens: b(28, "35%") + rows(5, 68), painel: b(28, "30%") + `<div class="sk-grid">${rows(4, 84)}</div>` + rows(2, 150),
    perfil: b(36, "50%") + rows(4, 76), publicar: b(36, "60%") + rows(3, 200),
  };
  return `<div class="sk-wrap" aria-hidden="true">${shapes[name] || rows(3, 120)}</div><p class="sr-only" role="status">Carregando…</p>`;
}
const after = {};
const V = {};

/* ---------- início ---------- */
V.inicio = async () => {
  let featured = null;
  try { featured = (await api("GET", "/api/talents")).talents.find(t => t.title && t.how.com); } catch {}
  return `
<section class="hero">
  <div>
    <span class="label">Trabalho freelance para mentes neurodivergentes</span>
    <h1 style="margin-top:12px">Trabalho bom, <em>no seu ritmo</em>, com regras claras.</h1>
    <p class="lead"><span class="only-d">Aqui toda vaga tem briefing estruturado, todo perfil diz como a pessoa prefere se comunicar e nenhuma proposta precisa ser escrita do zero.</span><span class="only-m">Vagas com briefing claro e comunicação combinada antes.</span></p>
    <div class="seg" role="group" aria-label="Eu quero">
      <button aria-pressed="${S.aud === "freela"}" data-aud="freela">Quero trabalhar</button>
      <button aria-pressed="${S.aud === "cliente"}" data-aud="cliente">Quero contratar</button>
    </div>
    <form class="search" id="heroSearch" role="search">
      <input id="heroQ" aria-label="Buscar" placeholder="${S.aud === "freela" ? "Buscar vagas: logotipo, Webflow, revisão…" : "Buscar talentos: designer, revisora…"}">
      <button class="btn hl" type="submit">Buscar</button>
    </form>
  </div>
  ${featured ? `<aside class="wcard" aria-label="Perfil em destaque">
    <div class="row">${av(featured.name, featured.id, "", featured.avatar)}<div style="min-width:0"><h3>${esc(featured.name)}${vbadge(featured.verified)}</h3><p class="muted">${esc(featured.title)}${featured.location ? " · " + esc(featured.location) : ""}</p></div></div>
    <span class="label">Como eu trabalho melhor</span>
    <div class="grid2">
      <div class="pref"><b>${esc(featured.how.com)}</b><span>Comunicação</span></div>
      <div class="pref"><b>${esc(featured.how.resp || "A combinar")}</b><span>Tempo de resposta</span></div>
      <div class="pref"><b>${esc(featured.how.fb || "A combinar")}</b><span>Feedback</span></div>
      <div class="pref"><b>${featured.hours} h/semana</b><span>Disponibilidade</span></div>
    </div>
    <button class="btn" data-go="talento-${featured.id}">Ver perfil completo</button>
  </aside>` : `<aside class="wcard"><h3>Comece em dois minutos</h3><p class="muted">Crie sua conta, conte como você trabalha melhor e encontre vagas com briefing claro.</p><button class="btn hl" data-go="entrar">Criar conta</button></aside>`}
</section>
<section class="stack" style="margin-top:32px">
  <h2>Explore por área</h2>
  <div class="cats">${CATS.map(c => `<button class="cat" data-cat="${c.id}"><b>${c.n}</b><span class="muted">${c.c}</span></button>`).join("")}</div>
</section>
<section class="stack" style="margin-top:56px">
  <h2>Como funciona</h2>
  <div class="steps">
    <div class="step"><h3>Escolha vagas com briefing claro</h3><p class="muted">Cada vaga mostra a porcentagem de clareza: objetivo, entregas, o que está fora do escopo e como será a comunicação.</p></div>
    <div class="step"><h3>Envie uma proposta guiada</h3><p class="muted">Quatro passos curtos, com perguntas de apoio. O rascunho salva sozinho, então dá para pausar e voltar depois.</p></div>
    <div class="step"><h3>Receba por etapa entregue</h3><p class="muted">O valor fica protegido e é liberado a cada etapa aprovada. Você sempre sabe o que vem a seguir.</p></div>
  </div>
</section>
<section class="stack" style="margin-top:56px">
  <h2>O que muda em relação a outras plataformas</h2>
  <div class="principles">
    <div class="principle"><h3>Sem adivinhação</h3><p class="muted">Só é possível publicar vaga com pelo menos metade do briefing preenchido. A nota de clareza fica visível para todos.</p></div>
    <div class="principle"><h3>Propor não custa nada</h3><p class="muted">Sem créditos nem taxa por proposta. O limite de propostas abertas acompanha a capacidade que você declara.</p></div>
    <div class="principle"><h3>Interface calma</h3><p class="muted">Sem contadores piscando nem pressa artificial. Ajuste tamanho de texto, espaçamento e movimento em Conforto.</p></div>
    <div class="principle"><h3>Comunicação combinada antes</h3><p class="muted">Cada conversa tem um resumo fixo do que foi combinado, editável pelos dois lados.</p></div>
  </div>
</section>`;
};

/* ---------- entrar / criar conta ---------- */
let authMode = "entrar";
V.entrar = async () => {
  if (ME) { go(S.next || "painel"); return; }
  const reg = authMode === "criar";
  return `<div class="auth stack">
  <div><span class="label">Osmo Talents</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">${reg ? "Criar conta" : "Entrar"}</h1></div>
  <div class="seg" role="group" aria-label="Modo"><button aria-pressed="${!reg}" data-auth="entrar">Entrar</button><button aria-pressed="${reg}" data-auth="criar">Criar conta</button></div>
  <form class="panel stack" id="authForm" novalidate>
    ${reg ? `<div class="field"><label for="a_name">Nome</label><input class="input" id="a_name" autocomplete="name" required></div>
    <div class="field"><span class="flabel">Eu quero</span>
      <label class="check"><input type="radio" name="role" value="freela" checked><span>Trabalhar como freelancer</span></label>
      <label class="check"><input type="radio" name="role" value="cliente"><span>Contratar freelancers</span></label></div>` : ""}
    <div class="field"><label for="a_email">E-mail</label><input class="input" id="a_email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="a_pass">Senha</label><div class="pass-wrap"><input class="input" id="a_pass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="8" required>${eyeBtn()}</div>${reg ? `<span class="hint">Pelo menos 8 caracteres.</span>` : MAIL ? `<button type="button" class="link-btn" data-act="forgot">Esqueci minha senha</button>` : ""}</div>
    <div id="authErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="submit">${reg ? "Criar conta" : "Entrar"}</button>
  </form>
  ${socialHTML(reg)}</div>`;
};

const SOCIAL = {
  google: ["Google", '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>'],
  adobe: ["Adobe", '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EB1000" d="M14.6 2H22v20zM9.4 2H2v20zM12 9.4 16.7 22h-3.1l-1.4-3.6H8.8z"/></svg>'],
  linkedin: ["LinkedIn", '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#0A66C2"/><path fill="#fff" d="M6.9 9.5h-3v9.8h3zM5.4 4.7a1.7 1.7 0 1 0 0 3.5 1.7 1.7 0 0 0 0-3.5zM20.1 13.9c0-2.9-1.6-4.6-4-4.6a3.5 3.5 0 0 0-3.2 1.7V9.5H10v9.8h3v-5.3c0-1.4.6-2.4 1.9-2.4s1.8.9 1.8 2.4v5.3h3z"/></svg>'],
  github: ["GitHub", '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.01 8.01 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82a7.6 7.6 0 0 0-4 0c-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A8 8 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'],
};
function socialHTML(reg) {
  if (!OAUTH.length) return "";
  const role = reg ? (document.querySelector('input[name="role"]:checked') || {}).value || "freela" : "";
  return `<div class="stack" style="gap:10px" id="socialBox">
    <div class="divider"><span>${reg ? "ou crie a conta com" : "ou entre com"}</span></div>
    ${OAUTH.filter(k => SOCIAL[k]).map(k => `<a class="btn social" data-social="${k}" href="/auth/${k}${role ? "?role=" + role : ""}">${SOCIAL[k][1]}<span>Continuar com ${SOCIAL[k][0]}</span></a>`).join("")}</div>`;
}
const OAUTH_ERR = {
  cancelado: "Você cancelou a entrada. Tente de novo quando quiser.",
  expirou: "A entrada demorou demais ou foi aberta em outra aba. Tente de novo.",
  sem_email: "O provedor não confirmou seu e-mail. Use outro jeito de entrar ou crie a conta com e-mail.",
  indisponivel: "Esse jeito de entrar ainda não está ativo.",
  tentativas: "Muitas tentativas seguidas. Espere alguns minutos.",
  falhou: "Não deu para entrar com o provedor agora. Tente de novo ou use e-mail e senha.",
};

/* ---------- recuperar senha ---------- */
V.esqueci = async () => `<div class="auth stack">
  <div><span class="label">Recuperar senha</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">Esqueci minha senha</h1>
  <p class="muted" style="margin-top:8px">Escreva o e-mail da sua conta. Vamos mandar um link para você criar uma senha nova.</p></div>
  <form class="panel stack" id="forgotForm" novalidate>
    <div class="field"><label for="f_email">E-mail</label><input class="input" id="f_email" type="email" autocomplete="email" required value="${esc(S.forgotEmail || "")}"></div>
    <div id="forgotErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="submit">Enviar link</button>
  </form>
  <button class="btn ghost" data-go="entrar">Voltar para entrar</button></div>`;

V.recuperar = async () => {
  const token = location.hash.split("-")[1] || "";
  let d;
  try { d = await api("GET", "/api/auth/reset?token=" + encodeURIComponent(token)); }
  catch (e) { return `<div class="auth stack">${emptyBox("Esse link não funciona mais.", e.status === 404 ? "Ele vale por 1 hora e só pode ser usado uma vez. Peça um link novo." : e.message, "esqueci", "Pedir link novo")}</div>`; }
  return `<div class="auth stack">
  <div><span class="label">Recuperar senha</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">Criar senha nova</h1>
  <p class="muted" style="margin-top:8px">Conta: ${esc(d.email)}</p></div>
  <form class="panel stack" id="resetForm" novalidate data-token="${esc(token)}">
    <input type="email" autocomplete="username" value="${esc(d.email)}" hidden>
    <div class="field"><label for="a_pass">Senha nova</label><div class="pass-wrap"><input class="input" id="a_pass" type="password" autocomplete="new-password" minlength="8" required>${eyeBtn()}</div><span class="hint">Pelo menos 8 caracteres. Ao salvar, sua conta sai dos outros aparelhos.</span></div>
    <div id="resetErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="submit">Salvar senha nova</button>
  </form></div>`;
};

/* ---------- escolher perfil (conta nova pelo login social) ---------- */
V.escolher = async () => {
  const token = (location.hash.split("-")[1] || "");
  const d = await api("GET", "/api/auth/oauth/pending?token=" + encodeURIComponent(token));
  return `<div class="auth stack">
    <div><span class="label">Quase lá</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">Olá${d.name ? ", " + esc(d.name.split(" ")[0]) : ""}!</h1>
    <p class="muted" style="margin-top:8px">Você entrou com ${esc(d.provider)} (${esc(d.email)}). Falta só uma escolha: o que você quer fazer na Osmo Talents?</p></div>
    <div class="stack" style="gap:12px">
      <button class="cat" data-act="oauth-role" data-role="freela" data-token="${esc(token)}"><b>Quero trabalhar</b><span class="muted">Encontrar vagas com briefing claro e enviar propostas</span></button>
      <button class="cat" data-act="oauth-role" data-role="cliente" data-token="${esc(token)}"><b>Quero contratar</b><span class="muted">Publicar vagas e encontrar talentos</span></button>
    </div>
    <div id="roleErr" class="err" role="alert" hidden></div></div>`;
};

/* ---------- vagas ---------- */
function jobQuery() {
  const p = new URLSearchParams();
  if (S.q) p.set("q", S.q); if (S.cat) p.set("cat", S.cat);
  if (S.clear) p.set("clear", "1"); if (S.async) p.set("async", "1"); if (S.flex) p.set("flex", "1");
  p.set("sort", S.sort); return p.toString();
}
function jobCard(j) {
  return `<button class="job" data-go="vaga-${j.id}">
    <div><h3>${esc(j.title)}</h3><p class="muted">${esc(j.company || j.client)} · ${when(j.created_at)} · ${j.proposals} ${j.proposals === 1 ? "proposta" : "propostas"}</p></div>
    <div class="price"><b class="mono">${j.budget_type === "hora" ? brl(j.budget) + "/h" : brl(j.budget)}</b><span class="muted">${j.budget_type === "hora" ? "por hora" : "valor fixo"} · ${esc(j.duration)}</span></div>
    <div class="meta">${clarBar(j.clarity)}${j.async ? `<span class="chip accent">Assíncrono</span>` : `<span class="chip sun">Com reuniões</span>`}${j.flex ? `<span class="chip plum">Prazo flexível</span>` : ""}${j.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>
  </button>`;
}
const activeFilters = () => [S.cat, S.clear, S.async, S.flex].filter(Boolean).length;
// celular: filtros mais usados viram chips no topo da lista (mesmo estilo dos chips das vagas); sincronizam com o painel de filtros
const QUICK = [["clear", "Briefing claro"], ["async", "Assíncrono"], ["flex", "Prazo flexível"]];
const fchipsHTML = () => QUICK.map(([k, n]) => `<button class="chip ${S[k] ? "accent" : ""}" data-fchip="${k}" aria-pressed="${!!S[k]}">${n}</button>`).join("")
  + CATS.map(c => `<button class="chip ${S.cat === c.id ? "accent" : ""}" data-fcat="${c.id}" aria-pressed="${S.cat === c.id}">${c.n}</button>`).join("");
async function jobsHTML() {
  const { jobs } = await api("GET", "/api/jobs?" + jobQuery());
  return { n: jobs.length, html: jobs.length ? jobs.map(jobCard).join("") : emptyBox("Nenhuma vaga com esses filtros.", "Tente desmarcar um filtro ou buscar outra palavra.") };
}
V.vagas = async () => {
  const r = await jobsHTML();
  return `<div class="layout">
  <aside class="filters panel" aria-label="Filtros"><details class="fbox" id="fbox" ${isMobile() ? "" : "open"}><summary>Filtros${activeFilters() ? ` (${activeFilters()})` : ""}</summary><div class="fbody stack" style="gap:18px">
    <div class="field"><label for="fq">Buscar</label><input class="input" id="fq" value="${esc(S.q)}" placeholder="Palavra-chave"></div>
    <div class="field"><label for="fcat">Área</label><select class="input" id="fcat"><option value="">Todas</option>${CATS.map(c => `<option value="${c.id}" ${S.cat === c.id ? "selected" : ""}>${c.n}</option>`).join("")}</select></div>
    <div class="field"><span class="flabel">Do meu jeito</span>
      <label class="check"><input type="checkbox" id="f_clear" ${S.clear ? "checked" : ""}><span>Só briefing claro<br><span class="hint">80% ou mais de clareza</span></span></label>
      <label class="check"><input type="checkbox" id="f_async" ${S.async ? "checked" : ""}><span>Comunicação assíncrona<br><span class="hint">sem reuniões obrigatórias</span></span></label>
      <label class="check"><input type="checkbox" id="f_flex" ${S.flex ? "checked" : ""}><span>Prazo flexível</span></label>
    </div></div></details></aside>
  <section class="stack" style="min-width:0">
    <div class="listhead"><div><h2>Vagas abertas</h2><p class="muted" id="jcount">${r.n} ${r.n === 1 ? "vaga encontrada" : "vagas encontradas"}</p></div>
      <div class="field" style="min-width:180px"><label for="fsort" class="hint">Ordenar por</label><select class="input" id="fsort">
        <option value="recentes" ${S.sort === "recentes" ? "selected" : ""}>Mais recentes</option>
        <option value="clareza" ${S.sort === "clareza" ? "selected" : ""}>Mais claras</option>
        <option value="valor" ${S.sort === "valor" ? "selected" : ""}>Maior valor</option></select></div></div>
    <div class="fchips" id="fchips" role="group" aria-label="Filtros rápidos">${fchipsHTML()}</div>
    <div class="list" id="jlist">${r.html}</div>
  </section></div>`;
};
let jobsT;
async function refreshJobs() {
  clearTimeout(jobsT);
  jobsT = setTimeout(async () => {
    try { const r = await jobsHTML(); $("#jlist").innerHTML = r.html; $("#jcount").textContent = `${r.n} ${r.n === 1 ? "vaga encontrada" : "vagas encontradas"}`; const sm = $("#fbox>summary"); if (sm) sm.textContent = "Filtros" + (activeFilters() ? ` (${activeFilters()})` : ""); const fc = $("#fchips"); if (fc) fc.innerHTML = fchipsHTML(); }
    catch (e) { toast(e.message); }
  }, 250);
}

/* ---------- detalhe da vaga ---------- */
const PSTATUS = { enviada: ["Aguardando resposta", "wait"], aceita: ["Aceita", "ok"], recusada: ["Não escolhida", "off"], retirada: ["Retirada", "off"] };
const JSTATUS = { aberta: ["Aberta", "ok"], em_andamento: ["Em andamento", "hi"], concluida: ["Concluída", "off"], fechada: ["Fechada", "off"] };
const pill = (map, k) => `<span class="status ${(map[k] || ["", "off"])[1]}">${(map[k] || [k])[0]}</span>`;
V.vaga = async id => {
  const d = await api("GET", "/api/jobs/" + id); const j = d.job, b = j.brief;
  const owner = ME && ME.id === j.client_id;
  let action = "";
  if (!ME) action = `<button class="btn hl" data-act="login-then" data-next="proposta-${j.id}">Entrar para enviar proposta</button>`;
  else if (ME.role === "freela") action = d.mine ? `<div class="stack" style="gap:6px"><span class="label">Sua proposta</span>${pill(PSTATUS, d.mine.status)}<p class="mono">${brl(d.mine.value)} · ${d.mine.days} dias úteis</p></div>`
    : j.status === "aberta" ? `<button class="btn hl" data-go="proposta-${j.id}">Enviar proposta guiada</button>` : "";
  else if (owner && j.status === "aberta") action = `<button class="btn" data-act="close-job" data-id="${j.id}">Fechar vaga</button>`;
  // no celular, valor e botão principal ficam fixos embaixo (o mesmo botão do painel lateral)
  const barAction = !ME ? action : ME.role === "freela" && !d.mine && j.status === "aberta" ? action : "";
  const price = j.budget_type === "hora" ? brl(j.budget) + "/h" : brl(j.budget);
  const props = owner ? `<section class="panel stack"><h2>Propostas (${d.proposals.length})</h2>${d.proposals.length ? d.proposals.map(p => `
    <div class="prop">
      <div class="row" style="justify-content:space-between"><div class="row">${av(p.freela_name, p.freela_id, "sm", p.freela.avatar)}<div><button class="back" style="margin:0; color:var(--fg)" data-go="talento-${p.freela_id}">${esc(p.freela_name)}</button>${vbadge(p.freela.verified)}<p class="hint">${esc(p.freela.title || "")}</p></div></div>${pill(PSTATUS, p.status)}</div>
      <p class="mono"><b>${brl(p.value)}</b> · ${p.days} dias úteis · você recebe a entrega em ${p.milestones.length} etapa(s)</p>
      <p style="white-space:pre-wrap">${esc(p.text)}</p>
      ${p.freela.how.com ? `<p class="hint">Como trabalha melhor: ${esc(p.freela.how.com)} ${esc(p.freela.how.resp)}</p>` : ""}
      ${p.milestones.length > 1 ? `<ul style="margin:0; padding-left:20px">${p.milestones.map(m => `<li>${esc(m.title)}: <span class="mono">${brl(m.value)}</span></li>`).join("")}</ul>` : ""}
      ${p.status === "enviada" && j.status === "aberta" ? `<div class="row"><button class="btn hl sm" data-act="accept" data-id="${p.id}">Aceitar e criar contrato</button><button class="btn sm" data-act="decline" data-id="${p.id}">Recusar</button><button class="btn sm ghost" data-act="chat" data-with="${p.freela_id}" data-job="${j.id}">Conversar</button></div>` : ""}
    </div>`).join("") : `<p class="muted">Ainda não chegaram propostas. Você pode convidar talentos pela página de cada perfil.</p>`}</section>` : "";
  return `<button class="back" data-go="vagas">← Voltar para vagas</button>
<div class="detail">
  <article class="stack">
    <div class="stack" style="gap:10px"><span class="label">${catName(j.cat)}</span><h1 style="font-size:clamp(1.7rem,4vw,2.5rem)">${esc(j.title)}</h1>
      <div class="row">${pill(JSTATUS, j.status)}${clarBar(j.clarity)}${j.async ? `<span class="chip accent">Assíncrono</span>` : `<span class="chip sun">Com reuniões</span>`}${j.flex ? `<span class="chip plum">Prazo flexível</span>` : ""}</div></div>
    <div class="panel brief">
      <section><span class="label">Objetivo</span><p>${esc(b.obj) || '<span class="muted">Não informado</span>'}</p></section>
      <section><span class="label">Entregas</span>${b.ent.length ? `<ul>${b.ent.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : '<p class="muted">Não informado</p>'}</section>
      <section><span class="label">Fora do escopo</span>${b.fora.length ? `<ul>${b.fora.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : `<p class="muted">O cliente não informou. Você pode perguntar na proposta.</p>`}</section>
      <section><span class="label">Comunicação</span><p>${esc(b.com) || '<span class="muted">Não informado</span>'}</p></section>
      <section><span class="label">Feedback</span><p>${esc(b.fb) || '<span class="muted">Não informado</span>'}</p></section>
      <section><span class="label">Referências</span><p>${esc(b.ref) || '<span class="muted">Não informado</span>'}</p></section>
      ${j.filesCount || owner ? `<section><span class="label">Arquivos</span><div class="stack" style="gap:10px">
        ${!ME ? `<p>${j.filesCount} ${j.filesCount === 1 ? "arquivo anexado" : "arquivos anexados"}. <button class="link-btn" data-act="login-then" data-next="vaga-${j.id}">Entre para ver</button></p>`
          : j.files.length ? `<ul class="files">${j.files.map(f => fileRow(f, owner, j.id)).join("")}</ul>` : `<p class="muted">Nenhum arquivo anexado.</p>`}
        ${owner && j.files.length < 6 ? `<div><label class="btn sm" for="jFiles">Anexar arquivos</label><input type="file" id="jFiles" data-job="${j.id}" multiple accept="${FILE_ACCEPT}" class="sr-only"></div>
          <span class="hint">Até 6 arquivos de 10 MB. Só pessoas com conta na Osmo conseguem abrir.</span>` : ""}
        <div id="jFilesErr" class="err" role="alert" hidden></div></div></section>` : ""}
      ${j.skills.length ? `<section><span class="label">Habilidades</span><div class="row" style="gap:6px">${j.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
    </div>
    ${j.clarity < 70 ? `<div class="sunk"><b>Este briefing tem pontos em aberto.</b><p class="muted">A proposta guiada sugere perguntas para esclarecer antes de aceitar.</p></div>` : ""}
    ${props}
  </article>
  <aside class="stack">
    <div class="panel stack" style="gap:12px">
      <div class="kv"><span class="muted">Valor</span><b class="mono">${price}</b></div>
      <div class="kv"><span class="muted">Duração</span><b>${esc(j.duration) || "—"}</b></div>
      <div class="kv"><span class="muted">Propostas</span><b class="mono">${j.proposals}</b></div>
      <div class="kv"><span class="muted">Publicada</span><b>${when(j.created_at)}</b></div>
      ${action}
    </div>
    <div class="panel stack side-extra" style="gap:6px"><span class="label">Quem contrata</span><h3>${esc(j.company || j.client)}</h3>${j.company ? `<p class="muted">${esc(j.client)}</p>` : ""}
      ${j.clientRating && j.clientRating.n ? `${stars(j.clientRating.avg, j.clientRating.n)}${tagSummary(j.clientRating)}${j.clientReviews.length ? `<details><summary class="hint">Ler o que freelancers disseram</summary><div class="stack" style="gap:0">${reviewList(j.clientReviews)}</div></details>` : ""}` : `<p class="hint">Ainda sem avaliações de freelancers.</p>`}</div>
  </aside>
</div>
${barAction ? `<div class="mcta"><div class="mcta-info"><b class="mono">${price}</b><span class="hint">${esc(j.duration) || ""}</span></div>${barAction}</div>` : ""}`;
};

/* ---------- proposta guiada ---------- */
const WSTEPS = ["Abordagem", "Valor e etapas", "Perguntas", "Revisar"];
let W = null, WJOB = null;
function wizDefaults(id) { return Object.assign({ step: 0, text: "", value: "", days: "", qs: "", split: false, ms: [{ title: "", value: "" }] }, store.get("draft-" + id, {})); }
const saveDraft = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { store.set("draft-" + WJOB.id, W); const s = $("#wsaved"); if (s) s.textContent = "Rascunho salvo"; }, 400); }; })();
const msSum = () => W.ms.reduce((a, m) => a + (Number(m.value) || 0), 0);
V.proposta = async id => {
  if (needLogin("freela")) return;
  const d = await api("GET", "/api/jobs/" + id);
  if (d.mine) { toast("Você já enviou proposta para esta vaga."); go("vaga-" + id); return; }
  if (!WJOB || WJOB.id !== id) { WJOB = d.job; W = wizDefaults(id); }
  return wizHTML();
};
function wizHTML() {
  const j = WJOB, w = W; const v = Number(w.value) || 0, fee = Math.round(v * 0.1);
  const steps = [
    `<div class="stack"><h2>Como você faria este trabalho?</h2>
      <div class="prompt muted">Responda em poucas linhas. Pode usar tópicos.<br>1. O que você entendeu do pedido.<br>2. Como você dividiria em etapas.<br>3. Um trabalho parecido que já fez.</div>
      <div class="field"><label for="wtext">Sua abordagem</label><textarea class="input" id="wtext" rows="8">${esc(w.text)}</textarea><span class="hint" id="wcount">${words(w.text)} palavras · de 40 a 150 é um bom tamanho</span></div></div>`,
    `<div class="stack"><h2>Valor, prazo e etapas</h2>
      <p class="muted">O cliente indicou ${j.budget_type === "hora" ? brl(j.budget) + " por hora" : brl(j.budget) + " no total"}${j.duration ? " e " + esc(j.duration) : ""}.</p>
      <div class="row" style="align-items:flex-start">
        <div class="field" style="flex:1; min-width:160px"><label for="wval">Seu valor total (R$)</label><input class="input mono" id="wval" inputmode="numeric" value="${esc(w.value)}" placeholder="${j.budget_type === "hora" ? j.budget * 15 : j.budget}"></div>
        <div class="field" style="flex:1; min-width:160px"><label for="wdays">Prazo em dias úteis</label><input class="input mono" id="wdays" inputmode="numeric" value="${esc(w.days)}" placeholder="15"></div>
      </div>
      <div class="sunk calc" id="wcalc">${calcHTML(v, fee)}</div>
      <label class="check"><input type="checkbox" id="wsplit" ${w.split ? "checked" : ""}><span>Dividir em etapas<br><span class="hint">Cada etapa é paga quando aprovada. Ajuda o cliente a acompanhar.</span></span></label>
      <div id="msBox" ${w.split ? "" : "hidden"} class="stack" style="gap:8px">${msRows()}</div>
    </div>`,
    `<div class="stack"><h2>Quer tirar alguma dúvida antes?</h2>
      <p class="muted">Opcional. As perguntas vão para a conversa com o cliente junto com a proposta.</p>
      <div class="quick">${["Quantas rodadas de ajuste estão incluídas?", "Quem aprova as entregas?", "Existe algum prazo que não pode mudar?", "Em que dia da semana prefere receber atualizações?"].map(q => `<button type="button" data-q="${esc(q)}">+ ${q}</button>`).join("")}</div>
      <div class="field"><label for="wqs">Suas perguntas</label><textarea class="input" id="wqs" rows="5">${esc(w.qs)}</textarea></div></div>`,
    `<div class="stack"><h2>Revise antes de enviar</h2>
      <div class="panel brief">
        <section><span class="label">Vaga</span><p>${esc(j.title)}</p></section>
        <section><span class="label">Abordagem</span><p style="white-space:pre-wrap">${esc(w.text) || '<span class="muted">Vazio. Volte ao passo 1.</span>'}</p></section>
        <section><span class="label">Valor e prazo</span><p class="mono">${brl(v)} · ${esc(w.days) || "—"} dias úteis</p></section>
        ${w.split ? `<section><span class="label">Etapas</span><ul>${w.ms.map(m => `<li>${esc(m.title || "Sem nome")}: <span class="mono">${brl(m.value)}</span></li>`).join("")}</ul></section>` : ""}
        <section><span class="label">Perguntas</span><p style="white-space:pre-wrap">${esc(w.qs) || '<span class="muted">Nenhuma</span>'}</p></section>
      </div>
      <div id="wErr" class="err" role="alert" hidden></div></div>`];
  return `<button class="back" data-go="vaga-${j.id}">← Voltar para a vaga</button>
  <div class="wiz"><span class="label">Proposta para ${esc(j.company || j.client)}</span>
    <div class="progress" aria-label="Passo ${w.step + 1} de 4">${WSTEPS.map((s, i) => `<div class="${i < w.step ? "done" : i === w.step ? "cur" : ""}">${s}</div>`).join("")}</div>
    <div class="panel">${steps[w.step]}</div>
    <div class="wiz-foot">
      <button class="btn" data-act="wprev" ${w.step === 0 ? "disabled" : ""}>Voltar</button>
      <span class="saved" id="wsaved"></span>
      ${w.step < 3 ? `<button class="btn primary" data-act="wnext">Continuar</button>` : `<button class="btn hl" data-act="wsend">Enviar proposta</button>`}
    </div></div>`;
}
const calcHTML = (v, fee) => `<span>Valor da proposta</span><b class="mono">${brl(v)}</b><span>Taxa Osmo (10%)</span><span class="mono">− ${brl(fee)}</span><span class="tot">Você recebe</span><b class="mono tot">${brl(v - fee)}</b>`;
function msRows() {
  const diff = (Number(W.value) || 0) - msSum();
  return W.ms.map((m, i) => `<div class="msrow"><input class="input" data-ms="${i}" data-k="title" value="${esc(m.title)}" placeholder="Etapa ${i + 1}" aria-label="Nome da etapa ${i + 1}"><input class="input mono" data-ms="${i}" data-k="value" inputmode="numeric" value="${esc(m.value)}" placeholder="R$" aria-label="Valor da etapa ${i + 1}"><button class="icon-btn" type="button" data-act="ms-del" data-i="${i}" aria-label="Remover etapa ${i + 1}" ${W.ms.length < 2 ? "disabled" : ""}>×</button></div>`).join("")
    + `<div class="row" style="justify-content:space-between"><button class="btn sm" type="button" data-act="ms-add" ${W.ms.length >= 8 ? "disabled" : ""}>+ Adicionar etapa</button><span class="hint" id="msDiff">${diff === 0 ? "As etapas somam o valor total." : diff > 0 ? `Faltam ${brl(diff)} para fechar o total.` : `As etapas passam ${brl(-diff)} do total.`}</span></div>`;
}

/* ---------- avaliações ---------- */
const RATE_WORDS = ["", "Ruim", "Fraco", "Ok", "Bom", "Excelente"];
const stars = (avg, n) => n ? `<span class="stars" title="Nota média ${String(avg).replace(".", ",")} de 5, ${n} ${n === 1 ? "avaliação" : "avaliações"}"><span aria-hidden="true">★</span> <b class="mono">${String(avg).replace(".", ",")}</b> <span class="muted">(${n})</span></span>` : "";
const tagSummary = r => r.tags.length ? `<div class="row" style="gap:6px">${r.tags.slice(0, 4).map(t => `<span class="chip accent">${esc(t.tag)} · ${t.n}</span>`).join("")}</div>` : "";
function reviewList(list) {
  return list.map(r => `<div class="review"><div class="row" style="justify-content:space-between"><b>${esc(r.author)}</b><span class="stars" aria-label="Nota ${r.rating} de 5">${"★".repeat(r.rating)}<span class="off">${"★".repeat(5 - r.rating)}</span></span></div>
    <p class="hint">${esc(r.job)} · ${when(r.created_at)}</p>${r.tags.length ? `<div class="row" style="gap:6px">${r.tags.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
    ${r.comment ? `<p style="white-space:pre-wrap">${esc(r.comment)}</p>` : ""}</div>`).join("");
}
function reviewBox(c) {
  const isF = ME.id === c.freela_id, other = isF ? c.client_name : c.freela_name, r = c.review;
  if (r.mine) return `<div class="ms-review"><p class="hint">Você avaliou com <b>${r.mine} de 5</b>. ${r.theirs ? "As duas avaliações já estão publicadas." : `Ela aparece quando ${esc(other.split(" ")[0])} avaliar também, ou em 14 dias.`}</p></div>`;
  return `<form class="ms-review stack review-form" data-contract="${c.id}" style="gap:12px">
    <div><b>Como foi trabalhar com ${esc(other)}?</b><p class="hint">${r.theirs ? `${esc(other.split(" ")[0])} já avaliou. ` : ""}Sua avaliação só fica visível quando os dois avaliarem, ou em 14 dias.</p></div>
    <div class="rate" role="radiogroup" aria-label="Nota">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}" required><span><b>${n}</b>${RATE_WORDS[n]}</span></label>`).join("")}</div>
    <div class="field"><span class="flabel">Destaques (opcional)</span><div class="row" style="gap:8px">${r.tags.map(t => `<label class="check chip-check"><input type="checkbox" name="tags" value="${esc(t)}"><span>${esc(t)}</span></label>`).join("")}</div></div>
    <div class="field"><label for="rc-${c.id}">Comentário (opcional)</label><textarea class="input" id="rc-${c.id}" name="comment" rows="3" maxlength="600" placeholder="O que funcionou bem? O que outra pessoa deveria saber antes de trabalhar junto?"></textarea></div>
    <div class="err" role="alert" hidden></div>
    <div><button class="btn hl" type="submit">Enviar avaliação</button></div></form>`;
}

/* ---------- talentos ---------- */
function talentCard(t) {
  return `<button class="talent" data-go="talento-${t.id}">
    <div class="row">${av(t.name, t.id, "", t.avatar)}<div style="min-width:0"><h3>${esc(t.name)}${vbadge(t.verified)}</h3><p class="muted" style="font-size:.9rem">${esc(t.title || "Perfil em construção")}</p></div></div>
    ${t.tag ? `<div class="row" style="gap:6px"><span class="chip plum">${esc(t.tag)}</span></div>` : ""}
    <div class="row" style="justify-content:space-between"><span class="mono">${t.rate ? `<b>${brl(t.rate)}</b>/h` : "Valor a combinar"}</span><span class="row" style="gap:10px">${stars(t.rating.avg, t.rating.n)}<span class="mono">${t.done} ${t.done === 1 ? "trabalho concluído" : "trabalhos concluídos"}</span></span></div>
    ${t.skills.length ? `<div class="row" style="gap:6px">${t.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}
  </button>`;
}
async function talentsHTML(q) {
  const { talents } = await api("GET", "/api/talents?q=" + encodeURIComponent(q || ""));
  return talents.length ? talents.map(talentCard).join("") : emptyBox("Nenhum talento encontrado.", "Tente outra habilidade.");
}
V.talentos = async () => `
<div class="listhead" style="margin-bottom:20px"><div><h2>Talentos</h2><p class="muted">Cada perfil mostra como a pessoa trabalha melhor. Leia antes de convidar.</p></div>
  <div class="field" style="min-width:240px"><label for="tq" class="hint">Buscar talento</label><input class="input" id="tq" placeholder="Habilidade ou nome" value="${esc(S.tq || "")}"></div></div>
<div class="tgrid" id="tgrid">${await talentsHTML(S.tq)}</div>`;

V.talento = async id => {
  const { talent: t } = await api("GET", "/api/talents/" + id);
  let myJobs = [];
  if (ME && ME.role === "cliente") myJobs = (await api("GET", "/api/me/jobs")).jobs.filter(j => j.status === "aberta");
  const self = ME && ME.id === t.id;
  const has = t.how.com || t.how.resp || t.how.fb || t.how.foco;
  return `<button class="back" data-go="talentos">← Voltar para talentos</button>
<div class="detail">
  <article class="stack">
    <div class="prof-head">${av(t.name, t.id, "lg", t.avatar)}
      <div class="stack" style="gap:6px"><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${esc(t.name)}${vbadge(t.verified)}</h1><p class="muted">${esc(t.title || "Perfil em construção")}${t.location ? " · " + esc(t.location) : ""}</p>${t.tag ? `<div class="row"><span class="chip plum">${esc(t.tag)}</span></div>` : ""}</div></div>
    ${t.bio ? `<p style="max-width:65ch; white-space:pre-wrap">${esc(t.bio)}</p>` : ""}
    ${has ? `<div class="stack" style="gap:12px"><h2>Como eu trabalho melhor</h2><div class="howgrid">
      ${[["Comunicação", t.how.com], ["Tempo de resposta", t.how.resp], ["Feedback", t.how.fb], ["Ritmo", t.how.foco]].filter(x => x[1]).map(x => `<div class="how"><span class="label">${x[0]}</span>${esc(x[1])}</div>`).join("")}
    </div></div>` : ""}
    ${t.portfolio.length ? `<div class="stack" style="gap:12px"><h2>Portfólio</h2><div class="port">${t.portfolio.map((p, i) => `<figure class="pcard">
      ${p.image ? `<a href="${esc(p.image)}" target="_blank" rel="noopener" aria-label="Ver imagem de ${esc(p.title)} em tamanho grande"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy"></a>` : `<div class="ptile t${i % 3}" aria-hidden="true">${esc(p.title)}</div>`}
      <figcaption><b>${esc(p.title)}</b>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener nofollow ugc">Ver projeto ↗</a>` : ""}</figcaption></figure>`).join("")}</div></div>` : ""}
    ${t.reviews.length ? `<div class="stack" style="gap:12px"><h2>Avaliações de clientes</h2>${tagSummary(t.rating)}<div class="stack" style="gap:0">${reviewList(t.reviews)}</div></div>` : ""}
  </article>
  <aside class="stack">
    <div class="panel stack" style="gap:12px">
      <div class="kv"><span class="muted">Valor</span><b class="mono">${t.rate ? brl(t.rate) + "/h" : "A combinar"}</b></div>
      <div class="kv"><span class="muted">Trabalhos concluídos</span><b class="mono">${t.done}</b></div>
      ${t.rating.n ? `<div class="kv"><span class="muted">Avaliação</span>${stars(t.rating.avg, t.rating.n)}</div>` : ""}
      <div class="field"><span class="flabel">Disponível ${t.hours} h por semana</span><div class="avail" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<i class="${i < Math.round(t.hours / 5) ? "on" : ""}"></i>`).join("")}</div></div>
      ${self ? `<button class="btn primary" data-go="perfil">Editar meu perfil</button>` : ""}
      ${!ME ? `<button class="btn hl" data-act="login-then" data-next="talento-${t.id}">Entrar para convidar</button>` : ""}
      ${ME && ME.role === "cliente" ? (myJobs.length ? `<div class="field"><label for="invJob">Convidar para a vaga</label><select class="input" id="invJob">${myJobs.map(j => `<option value="${j.id}">${esc(j.title)}</option>`).join("")}</select></div>
        <button class="btn hl" data-act="invite" data-id="${t.id}">Enviar convite</button>` : `<p class="hint">Publique uma vaga para poder convidar.</p>`)
        + `<button class="btn" data-act="chat" data-with="${t.id}">Enviar mensagem</button>` : ""}
    </div>
    ${t.skills.length ? `<div class="panel side-extra"><span class="label">Habilidades</span><div class="row" style="gap:6px; margin-top:10px">${t.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div></div>` : ""}
  </aside>
</div>`;
};

/* ---------- mensagens ---------- */
let TH = null;
V.mensagens = async id => {
  if (needLogin()) return;
  const { threads } = await api("GET", "/api/threads");
  if (!threads.length) return `<h2 style="margin-bottom:18px">Mensagens</h2>` + emptyBox("Nenhuma conversa ainda.", "As conversas começam quando alguém envia uma proposta, um convite ou uma mensagem direta.", "vagas", "Ver vagas");
  const openId = id || (isMobile() ? null : threads[0].id);
  TH = openId ? await api("GET", "/api/threads/" + openId) : null;
  if (openId) { const t = threads.find(x => x.id === openId); if (t) t.unread = 0; refreshMe(); }
  return `<h2 style="margin-bottom:18px">Mensagens</h2>
<div class="msgs ${openId ? "show-convo" : ""}">
  <div class="threads" role="list">${threads.map(t => `<button class="thread" role="listitem" data-go="mensagens-${t.id}" aria-current="${t.id === openId}">${av(t.with, t.withId, "sm", t.withAvatar)}<div class="tx"><b>${esc(t.with)}${vbadge(t.withVerified)}${t.unread ? `<span class="badge">${t.unread}</span>` : ""}</b><p>${esc(t.job)}</p><p>${esc(t.last)}</p></div></button>`).join("")}</div>
  <div class="convo">${TH ? convoHTML() : ""}</div>
</div>`;
};
function bubbles() {
  return TH.messages.map(m => m.system ? `<div class="bub sys">${esc(m.body)}<small>${hm(m.created_at)}</small></div>`
    : `<div class="bub ${m.mine ? "me" : ""}">${esc(m.body)}<small>${hm(m.created_at)}</small></div>`).join("");
}
function convoHTML() {
  const t = TH.thread;
  return `<div class="convo-head"><button class="back only-m" data-go="mensagens" style="margin:0">← Conversas</button>
      <div style="flex:1; min-width:0"><b>${esc(t.with.name)}${vbadge(t.with.role === "freela" && t.with.verified)}</b><p class="hint">${t.job ? `<a href="#vaga-${t.job.id}">${esc(t.job.title)}</a>` : "Conversa direta"}</p></div>
      ${t.with.how && t.with.how.resp ? `<span class="chip accent">${esc(t.with.how.resp)}</span>` : ""}</div>
    <div class="pin" id="pinBox"><b>Combinado até agora:</b> <span id="pinText">${esc(t.pin) || "Nada registrado ainda."}</span> <button class="btn sm ghost" data-act="pin-edit" style="padding:2px 8px">Editar</button></div>
    <div class="bubbles" id="bubbles" aria-live="polite">${bubbles()}</div>
    <form class="compose" id="compose">
      <button type="button" class="btn sm newmsg" id="newMsg" hidden></button>
      <div class="quick">${["Recebi, vou olhar até amanhã.", "Pode me mandar por escrito?", "Preciso de mais 1 dia.", "Entrega enviada, aguardo retorno."].map(q => `<button type="button" data-quick="${esc(q)}">${q}</button>`).join("")}</div>
      <div class="row"><input class="input" id="msgIn" style="flex:1; min-width:0" placeholder="Escreva sua mensagem" aria-label="Mensagem" maxlength="3000"><button class="btn primary" type="submit">Enviar</button></div>
    </form>`;
}
// celular: conversa aberta ocupa a tela toda (cabeçalho, rodapé e barra de navegação somem)
function syncViewport() { // acompanha o teclado: a conversa usa só a parte visível da tela
  const v = window.visualViewport; if (!v) return;
  document.documentElement.style.setProperty("--vvh", v.height + "px");
  document.documentElement.style.setProperty("--vvt", v.offsetTop + "px");
}
if (window.visualViewport) { visualViewport.addEventListener("resize", syncViewport); visualViewport.addEventListener("scroll", syncViewport); syncViewport(); }
let NEW_MSGS = 0;
function showNewMsgs(n) {
  const b = $("#newMsg"); if (!b) return;
  NEW_MSGS = n; b.hidden = !n; b.textContent = n === 1 ? "1 mensagem nova ↓" : `${n} mensagens novas ↓`;
}
after.mensagens = () => {
  const bb = $("#bubbles"); if (bb) bb.scrollTop = bb.scrollHeight;
  if (!TH) return;
  if (isMobile()) { document.body.classList.add("chat-full"); syncViewport(); if (bb) bb.scrollTop = bb.scrollHeight; }
  showNewMsgs(0);
  if (bb) bb.addEventListener("scroll", () => { if (NEW_MSGS && bb.scrollHeight - bb.scrollTop - bb.clientHeight < 60) showNewMsgs(0); });
  const tid = TH.thread.id;
  pollTimer = setInterval(async () => {
    if (document.hidden || !TH || TH.thread.id !== tid) return;
    try {
      const d = await api("GET", "/api/threads/" + tid);
      if (d.messages.length !== TH.messages.length || d.thread.pin !== TH.thread.pin) {
        const added = Math.max(0, d.messages.length - TH.messages.length);
        TH = d; const b = $("#bubbles"); if (!b) return;
        const atEnd = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
        b.innerHTML = bubbles();
        // quem está lendo mais acima não é puxado para baixo: aparece um aviso discreto
        if (atEnd) b.scrollTop = b.scrollHeight; else if (added) showNewMsgs(NEW_MSGS + added);
        const p = $("#pinText"); if (p) p.textContent = d.thread.pin || "Nada registrado ainda.";
      }
    } catch {}
  }, 8000);
};

/* ---------- painel ---------- */
const MSTATUS = { pendente: ["A seguir", "off", ""], andamento: ["Em andamento", "hi", "now"], entregue: ["Entregue, aguardando aprovação", "wait", "now"], ajustes: ["Ajustes pedidos", "wait", "now"], aprovada: ["Aprovada e paga", "ok", "done"] };
const PAYST = { a_pagar: ["A pagar", "off"], aguardando: ["Aguardando pagamento", "wait"], pago: ["Pago · protegido", "ok"], liberado: ["Liberado", "ok"], estornado: ["Estornado", "off"] };
function msActions(c, m) {
  const isF = ME.id === c.freela_id;
  const paid = !PAY.enabled || m.pay_status === "pago" || m.pay_status === "liberado";
  if (PAY.enabled && !isF && m.status !== "aprovada") {
    if (m.pay_status === "a_pagar") return `<button class="btn sm hl" data-act="pay" data-id="${m.id}">Pagar etapa</button>`;
    if (m.pay_status === "aguardando") return `<a class="btn sm hl" href="${esc(m.invoice_url)}" target="_blank" rel="noopener">Abrir cobrança</a><span class="hint">Pix, boleto ou cartão. A confirmação chega aqui sozinha.</span>`;
  }
  if (isF && !paid && m.status === "pendente") return `<span class="hint">Aguardando o cliente pagar esta etapa.</span>`;
  if (isF && (m.status === "pendente" || m.status === "ajustes")) return `<button class="btn sm" data-act="ms" data-a="start" data-id="${m.id}">Começar</button>`;
  if (isF && m.status === "andamento") return `<button class="btn sm hl" data-act="ms" data-a="deliver" data-id="${m.id}">Marcar como entregue</button>`;
  if (!isF && m.status === "entregue") return `<button class="btn sm hl" data-act="ms" data-a="approve" data-id="${m.id}">Aprovar e liberar</button><button class="btn sm" data-act="ms-changes" data-id="${m.id}">Pedir ajustes</button>`;
  return "";
}
V.painel = async () => {
  if (needLogin()) return;
  const isF = ME.role === "freela";
  const [cs, extra] = await Promise.all([api("GET", "/api/contracts"), isF ? api("GET", "/api/me/proposals") : api("GET", "/api/me/jobs")]);
  const st = cs.stats;
  const contracts = cs.contracts.length ? cs.contracts.map(c => `<div class="panel">
    <div class="row" style="justify-content:space-between; margin-bottom:6px"><h3>${esc(c.job_title)}</h3>${c.status === "concluido" ? `<span class="status off">Concluído</span>` : `<span class="status ok">Ativo</span>`}</div>
    <p class="muted" style="margin-bottom:8px">${isF ? "Cliente: " + esc(c.client_name) : "Freelancer: " + esc(c.freela_name)} · <span class="mono">${brl(c.value)}</span> no total · <a href="#mensagens-${c.thread}">Abrir conversa</a></p>
    ${c.milestones.map(m => `<div class="ms"><span class="st ${MSTATUS[m.status][2]}"></span><div><b>${esc(m.title)}</b><p class="hint">${MSTATUS[m.status][0]}${PAY.enabled ? " · " + pill(PAYST, m.pay_status) : ""}</p><div class="row" style="margin-top:6px" id="msa-${m.id}">${msActions(c, m)}</div></div><span class="mono">${brl(m.value)}</span></div>`).join("")}
    ${c.status === "concluido" ? reviewBox(c) : ""}
  </div>`).join("") : emptyBox("Nenhum contrato ainda.", isF ? "Quando um cliente aceitar sua proposta, o contrato aparece aqui." : "Quando você aceitar uma proposta, o contrato aparece aqui.");
  let side;
  if (isF) {
    side = `<div class="panel stack" style="gap:12px">
      <div class="row" style="justify-content:space-between"><h3>Como está sua energia esta semana?</h3><span class="hint">Só você vê. Ajusta quantas propostas você pode ter abertas.</span></div>
      <div class="energy" role="group" aria-label="Energia">${[["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]].map(e => `<button data-energy="${e[0]}" aria-pressed="${ME.energy === e[0]}">${e[1]}</button>`).join("")}</div>
      <p class="hint">Propostas aguardando resposta: <b class="mono">${extra.open} de ${extra.cap}</b>.</p></div>
    <section class="stack" style="gap:12px"><h2>Minhas propostas</h2>${extra.proposals.length ? `<div class="panel stack" style="gap:0">${extra.proposals.map(p => `<div class="ms" style="grid-template-columns:minmax(0,1fr) auto"><div><a href="#vaga-${p.job_id}"><b>${esc(p.job_title)}</b></a><p class="hint">${esc(p.client_name)} · ${when(p.created_at)} · <span class="mono">${brl(p.value)}</span></p></div><div class="row">${pill(PSTATUS, p.status)}${p.status === "enviada" ? `<button class="btn sm ghost" data-act="withdraw" data-id="${p.id}">Retirar</button>` : ""}</div></div>`).join("")}</div>` : emptyBox("Você ainda não enviou propostas.", "", "vagas", "Ver vagas abertas")}</section>`;
  } else {
    side = `<section class="stack" style="gap:12px"><div class="row" style="justify-content:space-between"><h2>Minhas vagas</h2><button class="btn sm hl" data-go="publicar">Publicar vaga</button></div>${extra.jobs.length ? `<div class="panel stack" style="gap:0">${extra.jobs.map(j => `<div class="ms" style="grid-template-columns:minmax(0,1fr) auto"><div><a href="#vaga-${j.id}"><b>${esc(j.title)}</b></a><p class="hint">${when(j.created_at)} · ${j.proposals} ${j.proposals === 1 ? "proposta" : "propostas"} · ${j.clarity}% claro</p></div>${pill(JSTATUS, j.status)}</div>`).join("")}</div>` : emptyBox("Você ainda não publicou vagas.", "Uma vaga clara recebe propostas mais certeiras.", "publicar", "Publicar a primeira vaga")}</section>`;
  }
  return `<div class="listhead" style="margin-bottom:20px"><div><h2>Painel</h2><p class="muted">O que está em andamento e o que vem a seguir.</p></div></div>
<div class="stats" style="margin-bottom:24px">
  <div class="panel stat"><span class="label">${isF ? "Recebido (líquido)" : "Pago até agora"}</span><b class="mono">${brl(isF ? st.net : st.paid)}</b></div>
  <div class="panel stat"><span class="label">Protegido, a liberar</span><b class="mono">${brl(st.held)}</b></div>
  ${st.payments ? `<div class="panel stat"><span class="label">${isF ? "Aguardando pagamento" : "A pagar"}</span><b class="mono">${brl(st.toPay)}</b></div>` : ""}
  <div class="panel stat"><span class="label">Contratos ativos</span><b class="mono">${cs.contracts.filter(c => c.status === "ativo").length}</b></div>
</div>
<div class="stack">${side}<section class="stack" style="gap:12px"><h2>Contratos</h2>${contracts}</section></div>`;
};

/* ---------- selo de verificado ---------- */
function verifyHTML(p) {
  if (p.verified) return `<div class="panel stack verify-box" style="margin-bottom:18px; gap:10px">
    <div class="row" style="gap:12px; flex-wrap:nowrap; align-items:flex-start"><span class="vbadge lg">${VB_SVG}</span><div style="flex:1; min-width:0"><b>Perfil verificado</b><p class="hint">Desde ${new Date(p.verified.replace(" ", "T") + "Z").toLocaleDateString("pt-BR")}. O selo verde aparece ao lado do seu nome.</p></div></div>
    <div><button type="button" class="btn sm ghost" data-act="verify-del">Remover selo</button></div></div>`;
  return `<div class="panel stack verify-box" style="margin-bottom:18px; gap:12px">
    <div class="row" style="gap:12px; flex-wrap:nowrap; align-items:flex-start"><span class="vbadge lg off">${VB_SVG}</span><div style="flex:1; min-width:0"><b>Selo de verificado <span class="muted" style="font-weight:400">(opcional)</span></b>
      <p class="hint">Quem tem laudo pode mostrar um selo verde ao lado do nome. Quem não tem continua usando a plataforma normalmente.</p></div></div>
    <details><summary class="hint">Como funciona e o que a gente guarda</summary><ul class="hint" style="margin:8px 0 0; padding-left:18px">
      <li>Envie o laudo em PDF <b>assinado digitalmente pelo médico</b> com certificado ICP-Brasil (o mesmo usado em receitas digitais). PDF escaneado ou foto não serve.</li>
      <li>Conferimos se a assinatura é válida, se o arquivo não foi alterado depois de assinado e se o certificado é de um médico com registro no CRM.</li>
      <li>O PDF é conferido e <b>descartado na hora</b>. Não guardamos o arquivo nem o diagnóstico: só a data, o CRM de quem assinou e uma impressão digital do arquivo, para o mesmo laudo não valer para duas contas.</li>
      <li>Você pode remover o selo quando quiser.</li></ul></details>
    <label class="check"><input type="checkbox" id="vConsent"><span>O laudo é meu, indica um transtorno do neurodesenvolvimento, e eu concordo com a conferência descrita acima.</span></label>
    <div><label class="btn sm" for="vFile" id="vFileLbl">Enviar laudo em PDF</label><input type="file" id="vFile" accept="application/pdf,.pdf" class="sr-only"></div>
    <div id="vErr" class="err" role="alert" hidden></div></div>`;
}
async function sendVerify(file) {
  const err = $("#vErr"); err.hidden = true;
  const show = m => { err.textContent = m; err.hidden = false; };
  if (!$("#vConsent").checked) return show("Marque a confirmação antes de enviar o laudo.");
  if (fileExt(file.name) !== "pdf") return show("Envie o laudo em PDF.");
  if (file.size > 10 * 1048576) return show("O PDF tem mais de 10 MB.");
  const lbl = $("#vFileLbl"); lbl.textContent = "Conferindo a assinatura…";
  let res;
  try { res = await fetch("/api/me/verify", { method: "POST", credentials: "same-origin", body: file, headers: { "X-Osmo": "1", "X-Consent": "1", "Content-Type": "application/pdf" } }); }
  catch { lbl.textContent = "Enviar laudo em PDF"; return show("Sem conexão com o servidor. Confira sua internet e tente de novo."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { lbl.textContent = "Enviar outro PDF"; return show(data.error || "Não deu para conferir o laudo."); }
  await refreshMe(); toast("Perfil verificado"); route();
}

/* ---------- avisos por e-mail ---------- */
const NOTIFY_OPTS = [["tudo", "Tudo", "Propostas, contratos, etapas, pagamentos e mensagens das pessoas"],
  ["importante", "Só o importante", "Propostas, contratos, etapas e pagamentos. Sem mensagens de conversa"], ["nada", "Nenhum", "Não mandar e-mails de aviso"]];
const notifyOpts = cur => `<div class="field" role="radiogroup" aria-label="Avisos por e-mail">${NOTIFY_OPTS.map(([v, t, d]) =>
  `<label class="check"><input type="radio" name="notify" value="${v}" ${cur === v ? "checked" : ""}><span><b>${t}</b><br><span class="hint">${d}</span></span></label>`).join("")}</div>`;
V.avisos = async () => {
  const token = location.hash.split("-")[1] || "";
  const d = await api("GET", "/api/notify?token=" + encodeURIComponent(token));
  return `<div class="auth stack">
  <div><span class="label">Avisos por e-mail</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">O que você quer receber?</h1>
  <p class="muted" style="margin-top:8px">Conta de ${esc(d.name)}. Dá para mudar quando quiser, aqui ou em Meu perfil.</p></div>
  <form class="panel stack" id="notifyForm" data-token="${esc(token)}">${notifyOpts(d.level)}
    <button class="btn hl" type="submit">Salvar</button></form></div>`;
};

/* ---------- perfil ---------- */
// abre a imagem escolhida e reduz no navegador antes de enviar (square: recorta o centro em quadrado)
async function shrinkImage(file, max, square) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 25e6) throw new Error("Essa imagem é grande demais. Tente outra.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Não deu para abrir essa imagem. Tente uma foto JPG ou PNG.")); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight, side = Math.min(W, H);
    const sw = square ? side : W, sh = square ? side : H, k = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement("canvas"); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
  } finally { URL.revokeObjectURL(url); }
}
async function uploadAvatar(file) {
  const err = $("#avatarErr"); err.hidden = true;
  try {
    const r = await api("PUT", "/api/me/avatar", { image: await shrinkImage(file, 512, true) });
    ME.profile.avatar = r.avatar; toast("Foto salva"); route();
  } catch (e) { err.textContent = e.message; err.hidden = false; }
}

/* portfólio: cada projeto salva na hora, fora do formulário do perfil */
let PE = null; // projeto sendo editado: { id, title, link, image (endereço ou data:), newImage, removeImage }
function portBoxHTML() {
  const items = ME.profile.portfolio, full = items.length >= 12;
  const list = items.map((it, i) => `<div class="port-row">
      ${it.image ? `<img src="${esc(it.image)}" alt="" class="port-thumb">` : `<div class="port-thumb ptile t${i % 3}" aria-hidden="true"></div>`}
      <div style="min-width:0"><b>${esc(it.title)}</b>${it.link ? `<p class="hint port-link">${esc(it.link)}</p>` : ""}</div>
      <div class="row" style="gap:6px; justify-content:flex-end">
        <button type="button" class="icon-btn sm" data-act="port-move" data-id="${it.id}" data-dir="-1" aria-label="Subir ${esc(it.title)}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="icon-btn sm" data-act="port-move" data-id="${it.id}" data-dir="1" aria-label="Descer ${esc(it.title)}" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="btn sm" data-act="port-edit" data-id="${it.id}">Editar</button>
        <button type="button" class="btn sm ghost" data-act="port-del" data-id="${it.id}">Remover</button></div></div>`).join("");
  const editor = PE ? `<div class="panel stack port-editor" style="gap:12px">
      <b>${PE.id ? "Editar projeto" : "Novo projeto"}</b>
      <div class="field"><label for="pe_title">Nome do projeto</label><input class="input" id="pe_title" maxlength="80" value="${esc(PE.title)}" placeholder="Ex.: Identidade visual da Padaria Trigal"></div>
      <div class="field"><label for="pe_link">Link (opcional)</label><input class="input" id="pe_link" type="url" maxlength="300" value="${esc(PE.link)}" placeholder="https://"><span class="hint">Behance, Dribbble, site, PDF no Drive...</span></div>
      <div class="field"><span class="flabel">Imagem (opcional)</span>
        <div class="row">${PE.image && !PE.removeImage ? `<img src="${esc(PE.image)}" alt="Imagem escolhida" class="port-thumb lg">` : ""}
          <label class="btn sm" for="peImg">${PE.image && !PE.removeImage ? "Trocar imagem" : "Escolher imagem"}</label><input type="file" id="peImg" accept="image/*" class="sr-only">
          ${PE.image && !PE.removeImage ? `<button type="button" class="btn sm ghost" data-act="port-img-del">Tirar imagem</button>` : ""}</div>
        <span class="hint">JPG, PNG ou foto do celular. A gente reduz o tamanho antes de enviar.</span></div>
      <div id="peErr" class="err" role="alert" hidden></div>
      <div class="row"><button type="button" class="btn hl" data-act="port-save">Salvar projeto</button><button type="button" class="btn ghost" data-act="port-cancel">Cancelar</button></div></div>`
    : full ? `<p class="hint">O portfólio tem espaço para 12 projetos. Remova um para adicionar outro.</p>` : `<div><button type="button" class="btn" data-act="port-new">+ Adicionar projeto</button></div>`;
  return `<p class="muted">Até 12 projetos, na ordem que você escolher. Cada projeto salva na hora.</p>
    ${items.length ? `<div class="stack" style="gap:0">${list}</div>` : `<p class="hint">Nenhum projeto ainda.</p>`}${editor}`;
}
function renderPort(focusId) { const b = $("#portBox"); if (!b) return; b.innerHTML = portBoxHTML(); updateProfMeta(); if (focusId) { const el = $("#" + focusId); if (el) el.focus(); } }
function syncPE() { if (!PE) return; const t = $("#pe_title"), l = $("#pe_link"); if (t) PE.title = t.value; if (l) PE.link = l.value; }
// perfil em seções: no celular começam fechadas (cada uma com um resumo); no computador, abertas como antes
const PSEC_OPEN = new Set();
function profMeta(p) {
  const isF = ME.role === "freela", how = [p.how.com, p.how.resp, p.how.fb, p.how.foco].filter(Boolean).length;
  const items = isF ? [["foto", !!p.avatar], ["o que você faz", !!p.title], ["valor por hora", p.rate > 0], ["habilidades", p.skills.length > 0],
    ["sobre você", !!p.bio], ["como você trabalha", how >= 2], ["portfólio", p.portfolio.length > 0]] : [];
  const pct = items.length ? Math.round(items.filter(i => i[1]).length / items.length * 100) : 100;
  const NOTE = { tudo: "Tudo", importante: "Só o importante", nada: "Nenhum" };
  return {
    pct, missing: items.filter(i => !i[1]).map(i => i[0]),
    sum: {
      sobre: isF ? (p.title || "Conte o que você faz") : (p.company || "Empresa ou projeto"),
      como: `${how} de 4 preenchidos`,
      port: p.portfolio.length ? `${p.portfolio.length} ${p.portfolio.length === 1 ? "projeto" : "projetos"}` : "Nenhum projeto ainda",
      selo: p.verified ? "Verificado" : "Opcional",
      receb: ME.payout ? "Conta ativa" : "Ainda não ativado",
      avisos: NOTE[ME.notify || "tudo"],
    },
  };
}
function complHTML(m) {
  if (m.pct >= 100) return "";
  return `<span class="label">Perfil ${m.pct}% completo</span><span class="bar ${m.pct >= 80 ? "" : m.pct >= 50 ? "mid" : "low"}" style="width:100%; height:8px"><i style="width:${m.pct}%"></i></span>
    <p class="hint">Falta: ${m.missing.join(", ")}. Perfis completos recebem mais convites.</p>`;
}
// atualiza resumo das seções e o "% completo" sem redesenhar a tela (a pessoa continua onde estava)
function updateProfMeta() {
  if (!ME || !$("#profForm")) return;
  const m = profMeta(ME.profile), box = $("#pcompl");
  if (box) { box.innerHTML = complHTML(m); box.hidden = m.pct >= 100; }
  for (const [k, v] of Object.entries(m.sum)) { const el = $(`[data-sum="${k}"]`); if (el) el.textContent = v; }
}
V.perfil = async () => {
  if (needLogin()) return;
  PE = null;
  const p = ME.profile, isF = ME.role === "freela", m = profMeta(p);
  const f = (id, label, val, attrs = "", hint = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" value="${esc(val)}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const ta = (id, label, val, rows = 4, hint = "") => `<div class="field"><label for="${id}">${label}</label><textarea class="input" id="${id}" rows="${rows}">${esc(val)}</textarea>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const open = id => !isMobile() || PSEC_OPEN.has(id) ? "open" : "";
  const sec = (id, title, body, intro = "") => `<details class="panel psec" data-sec="${id}" ${open(id)}>
    <summary><span class="psec-h"><h2>${title}</h2><span class="hint" data-sum="${id}">${esc(m.sum[id])}</span></span></summary>
    <div class="psec-b stack">${intro ? `<p class="muted">${intro}</p>` : ""}${body}</div></details>`;
  const save = `<div><button class="btn hl" type="submit">Salvar</button></div>`;
  return `<div class="wiz"><div class="row" style="justify-content:space-between; margin-bottom:18px"><h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">Meu perfil</h1>${isF ? `<button class="btn sm" data-go="talento-${ME.id}">Ver como os outros veem</button>` : ""}</div>
  ${isF ? `<div class="panel stack" id="pcompl" style="gap:8px; margin-bottom:18px" ${m.pct >= 100 ? "hidden" : ""}>${complHTML(m)}</div>` : ""}
  <div class="panel avatar-edit" style="margin-bottom:18px"><div id="avatarBox">${av(ME.name, ME.id, "lg", p.avatar)}</div>
    <div class="stack" style="gap:8px"><b>${isF ? "Sua foto" : "Foto ou logo da empresa"} <span class="muted" style="font-weight:400">(opcional)</span></b>
      <p class="hint">JPG, PNG ou foto do celular. A gente recorta em quadrado e reduz o tamanho.</p>
      <div class="row"><label class="btn sm" for="avatarIn">${p.avatar ? "Trocar foto" : "Escolher foto"}</label><input type="file" id="avatarIn" accept="image/*" class="sr-only">
      ${p.avatar ? `<button type="button" class="btn sm ghost" data-act="avatar-del">Remover</button>` : ""}</div>
      <div id="avatarErr" class="err" role="alert" hidden></div></div></div>
  <form class="stack" id="profForm">
    ${sec("sobre", isF ? "Sobre você" : "Sobre a empresa", f("p_name", "Nome", ME.name, 'autocomplete="name"')
      + (isF ? f("p_title", "O que você faz", p.title, 'placeholder="Ex.: Designer de marca e embalagem"')
        + `<div class="row" style="align-items:flex-start">${f("p_rate", "Valor por hora (R$)", p.rate || "", 'inputmode="numeric" class="input mono"')}${f("p_hours", "Horas por semana", p.hours, 'inputmode="numeric"', "Define quantas propostas você pode ter abertas.")}</div>`
        + f("p_loc", "Cidade", p.location) + f("p_skills", "Habilidades", p.skills.join(", "), 'autocomplete="off"', "Separe por vírgula.") + `<div class="sugs" id="skillSug" aria-live="polite">${skillSugHTML(p.skills.join(", ") + (p.skills.length ? ", " : ""))}</div>` + ta("p_bio", "Sobre você", p.bio, 4)
        : f("p_company", "Empresa ou projeto", p.company)
          + f("p_doc", "CPF ou CNPJ", "", 'inputmode="numeric" placeholder="' + (ME.hasDoc ? "Já informado. Preencha só para trocar." : "Só números") + '"', "Usado apenas para emitir as cobranças das etapas."))
      + save)}
    ${isF ? sec("como", "Como eu trabalho melhor",
      f("w_com", "Comunicação", p.how.com, 'placeholder="Ex.: Texto primeiro. Chamadas só com pauta."')
      + f("w_resp", "Tempo de resposta", p.how.resp, 'placeholder="Ex.: Até 1 dia útil"')
      + f("w_fb", "Formato de feedback", p.how.fb, 'placeholder="Ex.: Lista numerada"')
      + f("w_foco", "Ritmo", p.how.foco, 'placeholder="Ex.: Entregas a cada 2 ou 3 dias"')
      + f("p_tag", "Identificação (opcional)", p.tag, 'placeholder="Ex.: TDAH · entregas curtas"', "Só preencha se quiser. Aparece como um selo no seu perfil.")
      + save, "Aparece no seu perfil e nas suas propostas. Quem contrata lê antes de chamar.") : ""}
    ${MAIL ? sec("avisos", "Avisos por e-mail", notifyOpts(ME.notify || "tudo") + save, "Mandamos um e-mail só quando você ainda não viu a novidade no site, juntando tudo que chegou junto.") : ""}
    <div id="profErr" class="err" role="alert" hidden></div>
  </form>
  ${isF ? `<div class="stack" style="margin-top:18px">
    ${sec("port", "Portfólio", `<div class="stack" id="portBox">${portBoxHTML()}</div>`)}
    ${sec("selo", "Selo de verificado", verifyHTML(p))}
    ${PAY.enabled ? sec("receb", "Receber pagamentos", payoutHTML()) : ""}</div>` : ""}
  <div class="row" style="margin-top:18px"><button class="btn ghost" type="button" data-act="logout">Sair da conta</button></div></div>`;
};
document.addEventListener("toggle", e => {
  const d = e.target; if (!d.classList || !d.classList.contains("psec")) return;
  d.open ? PSEC_OPEN.add(d.dataset.sec) : PSEC_OPEN.delete(d.dataset.sec);
}, true);

function payoutHTML() {
  if (ME.payout) return `<div class="panel stack" style="gap:8px"><h2>Receber pagamentos</h2><p><span class="status ok">Conta de recebimento ativa</span></p>
    <p class="muted">Os valores das etapas chegam na sua conta Asaas e ficam protegidos até a aprovação. Para sacar, entre no Asaas pelo e-mail de ativação que você recebeu.</p></div>`;
  const i = (id, label, attrs = "", hint = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  return `<div class="panel stack" id="payoutBox"><div><h2>Receber pagamentos</h2><p class="muted">Para receber, criamos uma conta no Asaas em seu nome. Depois o Asaas manda um e-mail para você enviar um documento com foto. É feito uma vez só.</p></div>
    ${i("po_doc", "CPF ou CNPJ", 'inputmode="numeric" autocomplete="off"', "Só números.")}
    <div class="row" style="align-items:flex-start">
      <div style="flex:1; min-width:160px">${i("po_birth", "Data de nascimento", 'type="date"', "Só para CPF.")}</div>
      <div style="flex:1; min-width:160px"><div class="field"><label for="po_type">Tipo de empresa</label><select class="input" id="po_type"><option value="MEI">MEI</option><option value="INDIVIDUAL">Empresário individual</option><option value="LIMITED">Limitada</option></select><span class="hint">Só para CNPJ.</span></div></div>
    </div>
    <div class="row" style="align-items:flex-start">
      <div style="flex:1; min-width:160px">${i("po_phone", "Celular com DDD", 'inputmode="tel" autocomplete="tel"')}</div>
      <div style="flex:1; min-width:160px">${i("po_income", "Renda ou faturamento mensal (R$)", 'inputmode="numeric"', "Exigido pelo Banco Central.")}</div>
    </div>
    <div class="row" style="align-items:flex-start">
      <div style="flex:1; min-width:140px">${i("po_cep", "CEP", 'inputmode="numeric" autocomplete="postal-code"')}</div>
      <div style="flex:2; min-width:200px">${i("po_addr", "Rua", 'autocomplete="address-line1"')}</div>
    </div>
    <div class="row" style="align-items:flex-start">
      <div style="flex:1; min-width:120px">${i("po_num", "Número")}</div>
      <div style="flex:1; min-width:160px">${i("po_comp", "Complemento")}</div>
      <div style="flex:2; min-width:160px">${i("po_prov", "Bairro")}</div>
    </div>
    <div id="poErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="button" data-act="payout">Ativar recebimentos</button></div>`;
}

/* ---------- arquivos do briefing ---------- */
const FILE_EXTS = ["pdf", "ai", "psd", "png", "jpg", "jpeg", "webp", "docx", "xlsx", "pptx", "odt", "ods", "odp", "txt", "csv", "md"];
const FILE_ACCEPT = FILE_EXTS.map(e => "." + e).join(",");
const fileExt = n => (String(n).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
const fileSize = b => b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1).replace(".", ",") + " MB";
function checkFile(f) {
  if (!FILE_EXTS.includes(fileExt(f.name))) return `"${f.name}": tipo não aceito. Envie PDF, imagem, PSD, AI, Word, Excel, PowerPoint ou texto.`;
  if (f.size > 10 * 1048576) return `"${f.name}" tem ${fileSize(f.size)}. O limite é 10 MB por arquivo.`;
  if (!f.size) return `"${f.name}" está vazio.`;
  return "";
}
async function uploadFile(jobId, f) {
  let res;
  try { res = await fetch(`/api/jobs/${jobId}/files`, { method: "POST", credentials: "same-origin", body: f,
    headers: { "X-Osmo": "1", "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(f.name) } }); }
  catch { throw new Error("Sem conexão com o servidor. Confira sua internet e tente de novo."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 413 ? `"${f.name}" é grande demais.` : "Não deu para enviar o arquivo."));
  return data.files;
}
async function addJobFiles(jobId, files) {
  const errs = [];
  for (const [i, f] of files.entries()) {
    const e2 = checkFile(f); if (e2) { errs.push(e2); continue; }
    toast(`Enviando ${i + 1} de ${files.length}: ${f.name}`);
    try { await uploadFile(jobId, f); } catch (e3) { errs.push(e3.message); }
  }
  await route();
  if (errs.length) { const b = $("#jFilesErr"); if (b) { b.textContent = errs.join(" "); b.hidden = false; } } else toast("Arquivos anexados");
}
const fileRow = (f, owner, jobId) => `<li class="file-row"><span class="file-ext" aria-hidden="true">${esc(f.ext || fileExt(f.name))}</span>
  ${f.id ? `<a href="/arquivo/${f.id}" target="_blank" rel="noopener">${esc(f.name)}</a>` : `<span>${esc(f.name)}</span>`}<span class="hint">${fileSize(f.size)}</span>
  ${owner ? `<button type="button" class="btn sm ghost" data-act="${f.id ? "file-del" : "pfile-del"}" data-id="${f.id || 0}" data-job="${jobId || 0}" data-name="${esc(f.name)}" aria-label="Remover ${esc(f.name)}">Remover</button>` : ""}</li>`;
let PFILES = []; // arquivos escolhidos antes de publicar (ficam só na memória; sobem depois que a vaga é criada)
function pfilesHTML() {
  return `${PFILES.length ? `<ul class="files">${PFILES.map((f, i) => fileRow({ name: f.name, size: f.size, idx: i }, true)).join("")}</ul>` : ""}
    ${PFILES.length < 6 ? `<div><label class="btn sm" for="pFiles">Escolher arquivos</label><input type="file" id="pFiles" multiple accept="${FILE_ACCEPT}" class="sr-only"></div>` : ""}
    <div id="pFilesErr" class="err" role="alert" hidden></div>`;
}

/* ---------- publicar vaga ---------- */
const POST0 = { title: "", cat: "", obj: "", ent: "", fora: "", com: "", fb: "", ref: "", budget_type: "fixo", budget: "", duration: "", skills: "", async: true, flex: false };
let P = Object.assign({}, POST0, store.get("post-draft", {}));
function postScore() {
  const lines = s => String(s).split("\n").map(x => x.trim()).filter(Boolean);
  const items = [["Título", P.title.trim().length > 8], ["Área", !!P.cat], ["Objetivo", P.obj.trim().length > 20], ["Duas entregas ou mais", lines(P.ent).length >= 2], ["Fora do escopo", lines(P.fora).length >= 1], ["Comunicação", P.com.trim().length > 3], ["Feedback", P.fb.trim().length > 3], ["Valor", Number(P.budget) > 0], ["Prazo", P.duration.trim().length > 1]];
  return { items, score: Math.round(items.filter(i => i[1]).length / items.length * 100) };
}
function meterHTML() { const { items, score } = postScore(); return `<span class="label">Clareza do briefing</span><span class="big">${score}%</span><div class="bar ${score >= 80 ? "" : score >= 65 ? "mid" : "low"}" style="width:100%; height:8px"><i style="width:${score}%"></i></div><p class="hint">Para publicar, a vaga precisa de pelo menos 50%. Acima de 80% ela recebe propostas mais certeiras.</p><ul>${items.map(i => `<li class="${i[1] ? "ok" : ""}">${i[0]}</li>`).join("")}</ul>`; }
V.publicar = async () => {
  if (needLogin("cliente")) return;
  const fld = (id, label, html, hint = "") => `<div class="field"><label for="${id}">${label}</label>${html}${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  return `<div class="detail">
  <form class="stack" id="postForm" novalidate>
    <div><span class="label">Nova vaga</span><h1 style="font-size:clamp(1.8rem,4vw,2.5rem); margin-top:8px">Publicar uma vaga clara</h1><p class="muted" style="margin-top:8px">Quanto mais claro o briefing, menos idas e vindas. O rascunho fica salvo neste navegador.</p></div>
    <div class="panel stack">
      ${fld("p_title", "Título", `<input class="input" id="p_title" data-p="title" value="${esc(P.title)}" placeholder="Ex.: Identidade visual para cafeteria de bairro">`)}
      ${fld("p_cat", "Área", `<select class="input" id="p_cat" data-p="cat"><option value="">Escolha</option>${CATS.map(c => `<option value="${c.id}" ${P.cat === c.id ? "selected" : ""}>${c.n}</option>`).join("")}</select>`)}
      ${fld("p_obj", "Objetivo", `<textarea class="input" id="p_obj" data-p="obj" rows="3" placeholder="O que você quer alcançar, em 1 ou 2 frases">${esc(P.obj)}</textarea>`)}
      ${fld("p_ent", "Entregas", `<textarea class="input" id="p_ent" data-p="ent" rows="4" placeholder="Logotipo principal&#10;Paleta de cores">${esc(P.ent)}</textarea>`, "Uma entrega por linha.")}
      ${fld("p_fora", "Fora do escopo", `<textarea class="input" id="p_fora" data-p="fora" rows="2" placeholder="Não precisa de site">${esc(P.fora)}</textarea>`, "Um item por linha. Evita mal-entendidos.")}
    </div>
    <div class="panel stack">
      ${fld("p_com", "Como prefere se comunicar", `<select class="input" id="p_com" data-p="com"><option value="">Escolha</option>${["Somente texto, pelo chat da plataforma.", "Texto e uma chamada inicial curta.", "Chamada semanal de 30 min."].map(o => `<option ${P.com === o ? "selected" : ""}>${o}</option>`).join("")}</select>`)}
      ${fld("p_fb", "Como será o feedback", `<input class="input" id="p_fb" data-p="fb" value="${esc(P.fb)}" placeholder="Ex.: Duas rodadas de ajustes por escrito">`)}
      ${fld("p_ref", "Referências", `<input class="input" id="p_ref" data-p="ref" value="${esc(P.ref)}" placeholder="Ex.: Painel de referências enviado após contratar">`)}
      <div class="field"><span class="flabel">Arquivos do briefing (opcional)</span>
        <span class="hint">PDF, imagens, PSD, AI, Word, Excel, PowerPoint ou texto. Até 6 arquivos de 10 MB. Só pessoas com conta na Osmo conseguem abrir.</span>
        <div class="stack" style="gap:10px; margin-top:6px" id="pFilesBox">${pfilesHTML()}</div></div>
      ${fld("p_skills", "Habilidades desejadas", `<input class="input" id="p_skills" data-p="skills" value="${esc(P.skills)}" placeholder="Branding, Logotipo" autocomplete="off">`, "Separe por vírgula.")}
      <div class="sugs" id="skillSug" aria-live="polite">${skillSugHTML(P.skills ? P.skills.replace(/,?\s*$/, ", ") : "", P.cat)}</div>
      <label class="check"><input type="checkbox" id="p_async" data-p="async" ${P.async ? "checked" : ""}><span>Sem reuniões obrigatórias</span></label>
      <label class="check"><input type="checkbox" id="p_flex" data-p="flex" ${P.flex ? "checked" : ""}><span>Prazo flexível</span></label>
    </div>
    <div class="panel stack">
      ${fld("p_bt", "Tipo de valor", `<select class="input" id="p_bt" data-p="budget_type"><option value="fixo" ${P.budget_type === "fixo" ? "selected" : ""}>Valor fixo pelo projeto</option><option value="hora" ${P.budget_type === "hora" ? "selected" : ""}>Por hora</option></select>`)}
      <div class="row" style="align-items:flex-start">
        <div style="flex:1; min-width:160px">${fld("p_budget", "Valor (R$)", `<input class="input mono" id="p_budget" data-p="budget" inputmode="numeric" value="${esc(P.budget)}" placeholder="4200">`)}</div>
        <div style="flex:1; min-width:160px">${fld("p_dur", "Prazo", `<input class="input" id="p_dur" data-p="duration" value="${esc(P.duration)}" placeholder="3 semanas">`)}</div>
      </div>
    </div>
    <div id="postErr" class="err" role="alert" hidden></div>
    <div class="row"><button class="btn hl" type="submit">Publicar vaga</button><span class="hint">Você pode fechar a vaga quando quiser.</span></div>
  </form>
  <aside class="panel stack meter" id="meter" style="gap:12px">${meterHTML()}</aside>
</div>`;
};

/* ---------- eventos ---------- */
document.addEventListener("click", async e => {
  const t = e.target;
  if (t.closest("#menuBtn")) return openMenu();
  if (t.closest("#mmClose") || t.id === "mmScrim") return closeMenu(true);
  if (t.closest("#mmA11y")) { closeMenu(false); return openA11y(); }
  if (t.closest("#a11yBtn")) return openA11y();
  if (t.id === "scrim" || t.closest("#a11yClose")) return closeA11y();
  const g = t.closest("[data-go]"); if (g) { e.preventDefault(); if (menuOpen) closeMenu(false); return go(g.dataset.go); }
  const a = t.closest("[data-aud]"); if (a) { S.aud = a.dataset.aud; $$("[data-aud]").forEach(b => b.setAttribute("aria-pressed", b === a)); $("#heroQ").placeholder = S.aud === "freela" ? "Buscar vagas: logotipo, Webflow, revisão…" : "Buscar talentos: designer, revisora…"; return; }
  const c = t.closest("[data-cat]"); if (c) { S.cat = c.dataset.cat; return go("vagas"); }
  const fq = t.closest("[data-fchip]"); if (fq) { const k = fq.dataset.fchip; S[k] = !S[k]; const cb = $("#f_" + k); if (cb) cb.checked = S[k]; $("#fchips").innerHTML = fchipsHTML(); return refreshJobs(); }
  const fc = t.closest("[data-fcat]"); if (fc) { S.cat = S.cat === fc.dataset.fcat ? "" : fc.dataset.fcat; const sel = $("#fcat"); if (sel) sel.value = S.cat; $("#fchips").innerHTML = fchipsHTML(); return refreshJobs(); }
  const au = t.closest("[data-auth]"); if (au) { authMode = au.dataset.auth; return route(); }
  const th = t.closest("[data-theme-set]"); if (th) {
    setTheme(th.dataset.themeSet);
    $$("[data-theme-set]").forEach(b => b.setAttribute("aria-pressed", String(b === th)));
    return toast({ light: "Tema claro", dark: "Tema escuro", system: "Tema do sistema" }[th.dataset.themeSet]);
  }
  const sk = t.closest("[data-skill-add]"); if (sk) return addSkill(sk.dataset.skillAdd);
  const q = t.closest("[data-quick]"); if (q) { const mi = $("#msgIn"); if (mi) { mi.value = q.dataset.quick; mi.focus(); } return; }
  if (t.closest("#newMsg")) { const b = $("#bubbles"); if (b) b.scrollTop = b.scrollHeight; return showNewMsgs(0); }
  if (t.closest("#pinText")) { $("#pinBox")?.classList.toggle("open"); return; } // no celular o combinado fica em 1 linha; toque abre
  const qs = t.closest("[data-q]"); if (qs) { const ta = $("#wqs"); if (ta) { ta.value = (ta.value ? ta.value + "\n" : "") + qs.dataset.q; W.qs = ta.value; saveDraft(); } return; }
  const en = t.closest("[data-energy]"); if (en) { try { await api("PUT", "/api/me/energy", { energy: en.dataset.energy }); ME.energy = en.dataset.energy; toast("Energia atualizada"); route(); } catch (err) { toast(err.message); } return; }
  const act = t.closest("[data-act]"); if (!act) return;
  const id = Number(act.dataset.id);
  const busy = fn => async () => { act.disabled = true; try { await fn(); } catch (err) { toast(err.message); } finally { act.disabled = false; } };
  switch (act.dataset.act) {
    case "logout": if (menuOpen) closeMenu(false); await api("POST", "/api/auth/logout"); ME = null; renderChrome(); toast("Você saiu da conta"); return go("inicio");
    case "oauth-role": return busy(async () => {
      try { const r = await api("POST", "/api/auth/oauth/complete", { token: act.dataset.token, role: act.dataset.role }); await refreshMe(); toast("Conta criada"); go(r.role === "freela" ? "perfil" : "publicar"); }
      catch (err) { const b = $("#roleErr"); if (b) { b.textContent = err.message; b.hidden = false; } else toast(err.message); }
    })();
    case "toggle-pass": {
      const inp = $("#a_pass"), show = inp ? inp.type === "password" : false;
      if (inp) inp.type = show ? "text" : "password";
      act.setAttribute("aria-pressed", String(show));
      act.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      act.innerHTML = show ? EYE_OFF : EYE;
      return;
    }
    case "login-then": S.next = act.dataset.next; return go("entrar");
    case "pfile-del": { const i = PFILES.findIndex(f => f.name === act.dataset.name); if (i >= 0) PFILES.splice(i, 1); const b = $("#pFilesBox"); if (b) b.innerHTML = pfilesHTML(); return; }
    case "file-del": return busy(async () => {
      if (!await confirmSheet({ title: `Remover "${act.dataset.name}" da vaga?`, text: "Quem já baixou o arquivo continua com a cópia.", ok: "Remover" })) return;
      await api("DELETE", `/api/jobs/${act.dataset.job}/files/${id}`); toast("Arquivo removido"); route();
    })();
    case "verify-del": return busy(async () => {
      if (!await confirmSheet({ title: "Remover o selo de verificado?", text: "O selo verde sai do seu perfil. Para ter de novo, é preciso enviar o laudo outra vez.", ok: "Remover selo" })) return;
      await api("DELETE", "/api/me/verify"); await refreshMe(); toast("Selo removido"); route();
    })();
    case "port-new": PE = { id: 0, title: "", link: "", image: "" }; return renderPort("pe_title");
    case "port-edit": { const it = ME.profile.portfolio.find(x => x.id === id); if (!it) return; PE = { ...it }; return renderPort("pe_title"); }
    case "port-cancel": PE = null; return renderPort();
    case "port-img-del": syncPE(); PE.removeImage = true; PE.newImage = ""; return renderPort();
    case "port-save": return busy(async () => {
      syncPE();
      let link = PE.link.trim(); if (link && !/^https?:\/\//i.test(link)) link = "https://" + link; // aceita "behance.net/fulana"
      const body = { title: PE.title, link };
      if (PE.newImage) body.image = PE.newImage; else if (PE.removeImage) body.removeImage = true;
      try { const r = await api(PE.id ? "PUT" : "POST", "/api/me/portfolio" + (PE.id ? "/" + PE.id : ""), body); ME.profile.portfolio = r.portfolio; }
      catch (e) { const b = $("#peErr"); if (b) { b.textContent = e.message; b.hidden = false; } else toast(e.message); return; }
      toast(PE.id ? "Projeto atualizado" : "Projeto adicionado"); PE = null; renderPort();
    })();
    case "port-del": return busy(async () => {
      const it = ME.profile.portfolio.find(x => x.id === id);
      if (!it) return;
      if (!await confirmSheet({ title: `Remover "${it.title}" do portfólio?`, text: "O projeto e a imagem saem do seu perfil.", ok: "Remover" })) return;
      ME.profile.portfolio = (await api("DELETE", "/api/me/portfolio/" + id)).portfolio; if (PE && PE.id === id) PE = null; toast("Projeto removido"); renderPort();
    })();
    case "port-move": return busy(async () => { ME.profile.portfolio = (await api("POST", `/api/me/portfolio/${id}/move`, { dir: Number(act.dataset.dir) })).portfolio; renderPort(); })();
    case "avatar-del": return busy(async () => { await api("DELETE", "/api/me/avatar"); ME.profile.avatar = ""; toast("Foto removida"); route(); })();
    case "forgot": S.forgotEmail = ($("#a_email") || {}).value || ""; return go("esqueci");
    case "wnext": if (!wizValid()) return; W.step = Math.min(3, W.step + 1); saveDraft(); return rerenderWiz();
    case "wprev": W.step = Math.max(0, W.step - 1); saveDraft(); return rerenderWiz();
    case "ms-add": W.ms.push({ title: "", value: "" }); saveDraft(); const mb1 = $("#msBox"); if (mb1) mb1.innerHTML = msRows(); return;
    case "ms-del": W.ms.splice(Number(act.dataset.i), 1); saveDraft(); const mb2 = $("#msBox"); if (mb2) mb2.innerHTML = msRows(); return;
    case "wsend": return busy(async () => {
      const body = { text: W.text, value: Number(W.value), days: Number(W.days), questions: W.qs, milestones: W.split ? W.ms.map(m => ({ title: m.title, value: Number(m.value) })) : [] };
      try { await api("POST", `/api/jobs/${WJOB.id}/proposals`, body); }
      catch (err) { const box = $("#wErr"); if (box) { box.textContent = err.message; box.hidden = false; } else toast(err.message); return; }
      store.set("draft-" + WJOB.id, null); W = null; WJOB = null; toast("Proposta enviada"); refreshMe(); go("painel");
    })();
    case "pay": return busy(async () => { await api("POST", `/api/milestones/${id}/pay`); toast("Cobrança gerada. Clique em Abrir cobrança para pagar."); route(); })();
    case "payout": return busy(async () => {
      const v = k => ($("#" + k) || {}).value || "";
      const body = { cpfCnpj: v("po_doc"), birthDate: v("po_birth"), companyType: v("po_type"), mobilePhone: v("po_phone"), incomeValue: Number(v("po_income").replace(/\D/g, "")) || 0,
        postalCode: v("po_cep"), address: v("po_addr"), addressNumber: v("po_num"), complement: v("po_comp"), province: v("po_prov") };
      try { const r = await api("POST", "/api/me/payout", body); toast(r.escrow ? "Recebimentos ativados" : "Recebimentos ativados (sem garantia automática)"); await refreshMe(); route(); }
      catch (err) { const b = $("#poErr"); if (b) { b.textContent = err.message; b.hidden = false; } else toast(err.message); }
    })();
    case "close-job": return busy(async () => { await api("POST", `/api/jobs/${id}/close`); toast("Vaga fechada"); route(); })();
    case "accept": return busy(async () => { await api("POST", `/api/proposals/${id}/accept`); toast("Contrato criado"); go("painel"); })();
    case "decline": return busy(async () => { await api("POST", `/api/proposals/${id}/decline`); toast("Proposta recusada"); route(); })();
    case "withdraw": return busy(async () => { await api("POST", `/api/proposals/${id}/withdraw`); toast("Proposta retirada"); route(); })();
    case "invite": return busy(async () => { const inv = $("#invJob"); if (!inv) return; const r = await api("POST", `/api/jobs/${inv.value}/invite`, { talentId: id }); toast("Convite enviado"); go("mensagens-" + r.thread); })();
    case "chat": return busy(async () => { const r = await api("POST", "/api/threads", { withId: Number(act.dataset.with) }); go("mensagens-" + r.thread); })();
    case "ms": return busy(async () => { await api("POST", `/api/milestones/${id}/${act.dataset.a}`, {}); toast({ start: "Etapa iniciada", deliver: "Entrega registrada", approve: "Etapa aprovada e valor liberado" }[act.dataset.a]); route(); })();
    case "ms-changes": { const box = $("#msa-" + id); if (!box) return; box.innerHTML = `<input class="input" id="chg-${id}" placeholder="O que precisa ajustar?" style="flex:1; min-width:180px"><button class="btn sm hl" data-act="ms-changes-send" data-id="${id}">Enviar pedido</button>`; const chg = $("#chg-" + id); if (chg) chg.focus(); return; }
    case "ms-changes-send": return busy(async () => { const inp = $("#chg-" + id); const note = inp ? inp.value.trim() : ""; if (!note) return toast("Escreva o que precisa ajustar."); await api("POST", `/api/milestones/${id}/changes`, { note }); toast("Pedido de ajustes enviado"); route(); })();
    case "pin-edit": { const box = $("#pinBox"); if (!box) return; box.innerHTML = `<b>Combinado até agora:</b><div class="pin-edit"><input class="input" id="pinIn" maxlength="600" value="${esc(TH.thread.pin)}"><button class="btn sm primary" data-act="pin-save">Salvar</button></div>`; const pin = $("#pinIn"); if (pin) pin.focus(); return; }
    case "pin-save": return busy(async () => { const pinIn = $("#pinIn"); if (!pinIn) return; await api("PUT", `/api/threads/${TH.thread.id}/pin`, { pin: pinIn.value }); toast("Resumo atualizado"); route(); })();
  }
});
function rerenderWiz() { $("#view").innerHTML = wizHTML(); window.scrollTo(0, 0); }
function wizValid() {
  if (W.step === 0 && words(W.text) < 10) { toast("Escreva pelo menos 10 palavras sobre como faria o trabalho."); return false; }
  if (W.step === 1) {
    if (!(Number(W.value) >= 50)) { toast("Informe um valor de pelo menos R$ 50."); return false; }
    if (!(Number(W.days) >= 1)) { toast("Informe o prazo em dias úteis."); return false; }
    if (W.split && msSum() !== Number(W.value)) { toast("A soma das etapas precisa ser igual ao valor total."); return false; }
    if (W.split && W.ms.some(m => !m.title.trim())) { toast("Dê um nome para cada etapa."); return false; }
  }
  return true;
}

document.addEventListener("input", e => {
  const t = e.target, id = t.id;
  if (id === "fq") { S.q = t.value; refreshJobs(); }
  if (id === "tq") { S.tq = t.value; clearTimeout(document._tq); document._tq = setTimeout(async () => { try { $("#tgrid").innerHTML = await talentsHTML(S.tq); } catch (err) { toast(err.message); } }, 250); }
  if (id === "wtext") { W.text = t.value; $("#wcount").textContent = `${words(W.text)} palavras · de 40 a 150 é um bom tamanho`; saveDraft(); }
  if (id === "wval" || id === "wdays") { const v = t.value.replace(/\D/g, ""); if (t.value !== v) t.value = v; W[id === "wval" ? "value" : "days"] = v; const n = Number(W.value) || 0; $("#wcalc").innerHTML = calcHTML(n, Math.round(n * 0.1)); if (W.split) { const d = $("#msDiff"); if (d) $("#msBox").innerHTML = msRows(); } saveDraft(); }
  if (id === "wqs") { W.qs = t.value; saveDraft(); }
  if (t.dataset.ms !== undefined) { const i = Number(t.dataset.ms), k = t.dataset.k; let v = t.value; if (k === "value") { v = v.replace(/\D/g, ""); if (t.value !== v) t.value = v; } W.ms[i][k] = v; saveDraft(); const d = (Number(W.value) || 0) - msSum(); $("#msDiff").textContent = d === 0 ? "As etapas somam o valor total." : d > 0 ? `Faltam ${brl(d)} para fechar o total.` : `As etapas passam ${brl(-d)} do total.`; }
  if (t.dataset.p && t.type !== "checkbox") { P[t.dataset.p] = t.value; store.set("post-draft", P); $("#meter").innerHTML = meterHTML(); }
  if ((id === "p_skills" || id === "p_cat") && $("#skillSug")) $("#skillSug").innerHTML = skillSugHTML($("#p_skills").value, $("#postForm") ? P.cat : "");
});
document.addEventListener("change", e => {
  const t = e.target, id = t.id;
  if (t.name === "role") $$("[data-social]").forEach(a => { a.href = `/auth/${a.dataset.social}?role=${t.value}`; });
  if (id === "fcat") { S.cat = t.value; refreshJobs(); }
  if (id === "fsort") { S.sort = t.value; refreshJobs(); }
  if (["f_clear", "f_async", "f_flex"].includes(id)) { S[id.slice(2)] = t.checked; refreshJobs(); }
  if (id === "wsplit") { W.split = t.checked; if (W.split && W.ms.length === 1 && !W.ms[0].value) W.ms[0] = { title: "Entrega completa", value: W.value }; $("#msBox").hidden = !W.split; $("#msBox").innerHTML = msRows(); saveDraft(); }
  if (t.dataset.pref) { PREFS[t.dataset.pref] = t.checked; applyPrefs(); }
  if (id === "avatarIn" && t.files[0]) uploadAvatar(t.files[0]);
  if (id === "vFile" && t.files[0]) { sendVerify(t.files[0]); t.value = ""; }
  if (id === "pFiles" && t.files.length) {
    const errs = [];
    for (const f of t.files) { const e2 = checkFile(f); if (e2) errs.push(e2); else if (PFILES.length < 6) PFILES.push(f); else errs.push(`"${f.name}": cada vaga aceita até 6 arquivos.`); }
    $("#pFilesBox").innerHTML = pfilesHTML();
    if (errs.length) { const b = $("#pFilesErr"); b.textContent = errs.join(" "); b.hidden = false; }
  }
  if (id === "jFiles" && t.files.length) addJobFiles(Number(t.dataset.job), [...t.files]);
  if (id === "peImg" && t.files[0]) { syncPE(); shrinkImage(t.files[0], 1600, false).then(d => { PE.newImage = PE.image = d; PE.removeImage = false; renderPort(); })
    .catch(e2 => { const b = $("#peErr"); b.textContent = e2.message; b.hidden = false; }); }
  if (t.dataset.p) { P[t.dataset.p] = t.type === "checkbox" ? t.checked : t.value; store.set("post-draft", P); $("#meter").innerHTML = meterHTML(); }
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('[type="submit"]');
  const showErr = (box, msg) => { const b = $(box); if (b) { b.textContent = msg; b.hidden = false; b.scrollIntoView({ block: "nearest" }); } else toast(msg); };
  if (f.id === "heroSearch") { const q = $("#heroQ").value; if (S.aud === "freela") { S.q = q; go("vagas"); } else { S.tq = q; go("talentos"); } return; }
  if (btn) btn.disabled = true;
  try {
    if (f.id === "authForm") {
      const body = { email: $("#a_email").value, password: $("#a_pass").value };
      if (authMode === "criar") { body.name = $("#a_name").value; body.role = (f.querySelector('input[name="role"]:checked') || {}).value; }
      try { await api("POST", authMode === "criar" ? "/api/auth/register" : "/api/auth/login", body); }
      catch (err) { return showErr("#authErr", err.message); }
      await refreshMe();
      toast(authMode === "criar" ? "Conta criada" : "Bem-vindo de volta");
      const next = S.next; S.next = null;
      return go(next || (authMode === "criar" ? (ME.role === "freela" ? "perfil" : "publicar") : "painel"));
    }
    if (f.id === "forgotForm") {
      const email = $("#f_email").value.trim();
      try { await api("POST", "/api/auth/forgot", { email }); } catch (err) { return showErr("#forgotErr", err.message); }
      f.outerHTML = `<div class="panel stack" role="status"><b>Confira seu e-mail</b><p class="muted">Se existir uma conta com ${esc(email)}, você vai receber um link em alguns minutos. Ele vale por 1 hora. Se não aparecer, olhe também a caixa de spam.</p></div>`;
      return;
    }
    if (f.id === "resetForm") {
      try { await api("POST", "/api/auth/reset", { token: f.dataset.token, password: $("#a_pass").value }); } catch (err) { return showErr("#resetErr", err.message); }
      history.replaceState(null, "", "/#painel"); await refreshMe(); toast("Senha nova salva"); return route();
    }
    if (f.classList.contains("review-form")) {
      const rating = Number((f.querySelector('input[name="rating"]:checked') || {}).value || 0);
      const err = f.querySelector(".err");
      if (!rating) { err.textContent = "Escolha uma nota de 1 a 5."; err.hidden = false; return; }
      try { await api("POST", `/api/contracts/${f.dataset.contract}/review`, { rating, tags: [...f.querySelectorAll('input[name="tags"]:checked')].map(i => i.value), comment: f.querySelector("textarea").value }); }
      catch (e2) { err.textContent = e2.message; err.hidden = false; return; }
      toast("Avaliação enviada"); return route();
    }
    if (f.id === "notifyForm") {
      const level = (f.querySelector('input[name="notify"]:checked') || {}).value;
      try { await api("POST", "/api/notify", { token: f.dataset.token, level }); } catch (err) { return toast(err.message); }
      return toast(level === "nada" ? "Avisos desligados" : "Preferência salva");
    }
    if (f.id === "compose") {
      const v = $("#msgIn").value.trim(); if (!v) return;
      try { await api("POST", `/api/threads/${TH.thread.id}/messages`, { body: v }); } catch (err) { return toast(err.message); }
      $("#msgIn").value = ""; TH = await api("GET", "/api/threads/" + TH.thread.id); const b = $("#bubbles"); b.innerHTML = bubbles(); b.scrollTop = b.scrollHeight; $("#msgIn").focus(); return;
    }
    if (f.id === "profForm") {
      const v = id => ($("#" + id) || {}).value || "";
      const body = { name: v("p_name"), title: v("p_title"), rate: Number(v("p_rate")) || 0, hours: Number(v("p_hours")) || 20, location: v("p_loc"),
        skills: v("p_skills").split(",").map(s => s.trim()).filter(Boolean), bio: v("p_bio"), tag: v("p_tag"), company: v("p_company"), cpfCnpj: v("p_doc"),
        notify: (f.querySelector('input[name="notify"]:checked') || {}).value, how: { com: v("w_com"), resp: v("w_resp"), fb: v("w_fb"), foco: v("w_foco") } };
      try { await api("PUT", "/api/me/profile", body); } catch (err) { return showErr("#profErr", err.message); }
      await refreshMe(); updateProfMeta(); toast("Salvo"); return;
    }
    if (f.id === "postForm") {
      const body = { ...P, ent: P.ent.split("\n"), fora: P.fora.split("\n"), skills: P.skills.split(",").map(s => s.trim()).filter(Boolean), budget: Number(P.budget) || 0 };
      let r; try { r = await api("POST", "/api/jobs", body); } catch (err) { return showErr("#postErr", err.message); }
      const failed = [];
      for (const [i, file] of PFILES.entries()) {
        if (btn) btn.textContent = `Enviando arquivo ${i + 1} de ${PFILES.length}…`;
        try { await uploadFile(r.id, file); } catch (e2) { failed.push(e2.message); }
      }
      P = Object.assign({}, POST0); PFILES = []; store.set("post-draft", null);
      toast(failed.length ? `Vaga publicada, mas ${failed.length} arquivo(s) não subiram. Tente de novo na página da vaga.` : `Vaga publicada com ${r.clarity}% de clareza`);
      if (failed.length) console.warn(failed);
      return go("vaga-" + r.id);
    }
  } finally { if (btn) btn.disabled = false; }
});

/* ---------- painel de confirmação (no celular sobe de baixo; no computador fica no centro) ---------- */
// arrastar para baixo fecha o painel (só no toque)
function sheetDrag(el, onClose) {
  let y0 = null, dy = 0;
  el.addEventListener("touchstart", e => { if (el.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  el.addEventListener("touchmove", e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = dy ? `translateY(${dy}px)` : ""; }, { passive: true });
  el.addEventListener("touchend", () => { if (y0 === null) return; y0 = null; if (dy > 90) onClose(); else el.style.transform = ""; });
}
function trapFocus(e, box) {
  if (e.key !== "Tab") return;
  const f = [...box.querySelectorAll("button, [href], input, select, textarea")].filter(x => !x.disabled && x.offsetParent);
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
}
// substitui o confirm() do navegador: devolve true se a pessoa confirmou
function confirmSheet({ title, text = "", ok = "Confirmar" }) {
  return new Promise(resolve => {
    const back = document.activeElement, box = document.createElement("div");
    box.innerHTML = `<div class="scrim"></div><div class="drawer sheet" role="alertdialog" aria-modal="true" aria-labelledby="sheetT" ${text ? 'aria-describedby="sheetD"' : ""}>
      <div class="sheet-grip" aria-hidden="true"></div><h2 id="sheetT">${esc(title)}</h2>${text ? `<p class="muted" id="sheetD">${esc(text)}</p>` : ""}
      <div class="sheet-actions"><button class="btn hl" data-sheet="ok">${esc(ok)}</button><button class="btn" data-sheet="no">Cancelar</button></div></div>`;
    document.body.appendChild(box);
    const panel = box.querySelector(".sheet");
    const done = v => { document.removeEventListener("keydown", onKey, true); box.remove(); if (back && back.focus) back.focus(); resolve(v); };
    const onKey = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } else trapFocus(e, panel); };
    document.addEventListener("keydown", onKey, true);
    box.addEventListener("click", e => { if (e.target.classList.contains("scrim")) done(false); const b = e.target.closest("[data-sheet]"); if (b) done(b.dataset.sheet === "ok"); });
    sheetDrag(panel, () => done(false));
    panel.querySelector('[data-sheet="no"]').focus(); // o foco começa no caminho seguro
  });
}

/* ---------- tema: claro, escuro ou do sistema (paletas da Osmo em styles.css) ---------- */
const THEMES = [["light", "Claro"], ["dark", "Escuro"], ["system", "Sistema"]];
// escuro é o padrão; "sistema" fica salvo explicitamente para não cair de volta no escuro
function getTheme() { try { const t = localStorage.getItem("osmo-theme"); return t === "light" || t === "system" ? t : "dark"; } catch { return "dark"; } }
function setTheme(t) {
  try { localStorage.setItem("osmo-theme", t); } catch {}
  const r = document.documentElement; t === "system" ? r.removeAttribute("data-theme") : r.setAttribute("data-theme", t);
}
const themeHTML = () => { const cur = getTheme(); return `<div class="field"><span class="flabel" id="themeLbl">Tema</span>
  <div class="seg theme-seg" role="group" aria-labelledby="themeLbl">${THEMES.map(([k, n]) => `<button type="button" data-theme-set="${k}" aria-pressed="${cur === k}">${n}</button>`).join("")}</div>
  <span class="hint">"Sistema" segue o modo claro ou escuro do seu celular ou computador.</span></div>`; };

/* ---------- conforto ---------- */
function applyPrefs() { const r = document.documentElement; ["big", "airy", "calm", "focus", "glass"].forEach(k => r.classList.toggle(k, !!PREFS[k])); store.set("prefs", PREFS); }
function openA11y() {
  $("#layer").innerHTML = `<div class="scrim" id="scrim"></div><div class="drawer" role="dialog" aria-modal="true" aria-label="Conforto">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="row" style="justify-content:space-between"><h2>Conforto</h2><button class="btn sm ghost" id="a11yClose">Fechar</button></div>
    <p class="muted">Ajuste a interface ao seu jeito. Fica salvo neste navegador.</p>
    ${themeHTML()}
    ${[["big", "Texto maior", "Aumenta o tamanho da letra em toda a plataforma"], ["airy", "Mais espaço entre linhas", "Ajuda a acompanhar textos longos"], ["calm", "Sem animações", "Remove transições e movimentos"], ["focus", "Modo foco", "Esconde painéis laterais e informações extras"], ["glass", "Vidro líquido", "Painéis translúcidos com fundo desfocado. Desligue para cores sólidas e mais contraste"]].map(o => `<label class="toggle"><span><b>${o[1]}</b><br><span class="hint">${o[2]}</span></span><input type="checkbox" class="sw" data-pref="${o[0]}" ${PREFS[o[0]] ? "checked" : ""}></label>`).join("")}
  </div>`;
  $("#a11yClose").focus();
  sheetDrag($("#layer .drawer"), closeA11y);
}
function closeA11y() { $("#layer").innerHTML = ""; const b = $("#a11yBtn"); (b && b.offsetParent ? b : $("#menuBtn")).focus(); }

/* ---------- menu hambúrguer ---------- */
let menuOpen = false, menuT;
function openMenu() {
  const m = $("#mmenu"), sc = $("#mmScrim"); clearTimeout(menuT); m.hidden = false; sc.hidden = false; menuOpen = true;
  requestAnimationFrame(() => { m.classList.add("open"); sc.classList.add("open"); });
  document.body.classList.add("menu-open"); $("#menuBtn").setAttribute("aria-expanded", "true");
  const cur = m.querySelector('[aria-current="page"]') || m.querySelector("button"); setTimeout(() => (cur || $("#mmClose")).focus(), 30);
}
function closeMenu(refocus) {
  if (!menuOpen) return; menuOpen = false;
  const m = $("#mmenu"), sc = $("#mmScrim");
  m.classList.remove("open"); sc.classList.remove("open"); document.body.classList.remove("menu-open"); $("#menuBtn").setAttribute("aria-expanded", "false");
  const calm = document.documentElement.classList.contains("calm") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  menuT = setTimeout(() => { m.hidden = true; sc.hidden = true; }, calm ? 0 : 240);
  if (refocus) $("#menuBtn").focus();
}
window.addEventListener("resize", () => { if (menuOpen && !matchMedia("(max-width:980px)").matches) closeMenu(false); });
document.addEventListener("keydown", e => {
  if (menuOpen) {
    if (e.key === "Escape") return closeMenu(true);
    if (e.key === "Tab") { const f = [...$("#mmenu").querySelectorAll("button")]; const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    return;
  }
  if (e.key === "Escape" && $("#layer").innerHTML) closeA11y();
  if ($("#layer .drawer")) trapFocus(e, $("#layer .drawer"));
});

/* ---------- início ---------- */
setInterval(() => { if (ME && !document.hidden) refreshMe(); }, 30000);
applyPrefs();
/* topo maior parado no início; a folga entre 8 e 40 px evita que ele fique alternando bem no limite */
function syncTopSize() { const y = scrollY, r = document.documentElement; if (y <= 8) r.classList.add("top-big"); else if (y > 40) r.classList.remove("top-big"); }
addEventListener("scroll", syncTopSize, { passive: true }); syncTopSize();
const oauthErr = new URLSearchParams(location.search).get("oauth_error");
if (oauthErr) history.replaceState(null, "", "/" + location.hash);
Promise.all([refreshMe(), loadTaxonomy()]).then(route).then(() => { if (oauthErr) { const b = $("#authErr"); const msg = OAUTH_ERR[oauthErr] || OAUTH_ERR.falhou; if (b) { b.textContent = msg; b.hidden = false; } else toast(msg); } });
