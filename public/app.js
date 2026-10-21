"use strict";
/* Osmo Talents: aplicação do navegador (sem dependências) */

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = n => "R$ " + Number(n || 0).toLocaleString("pt-BR");
const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const isMobile = () => matchMedia("(max-width:700px)").matches;
const CATS = [
  { id: "design", n: "Design e marca", c: "Identidade, UI, ilustração" },
  { id: "dev", n: "Desenvolvimento", c: "Sites, apps, automações" },
  { id: "texto", n: "Escrita e revisão", c: "Copy, roteiro, tradução" },
  { id: "dados", n: "Dados e pesquisa", c: "Análise, planilhas, UX research" },
];
const catName = id => (CATS.find(c => c.id === id) || {}).n || "";
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
const av = (name, id, size = "") => `<div class="av ${size} c${(id || 0) % 4}" aria-hidden="true">${esc(initials(name))}</div>`;
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
let ME = null, PAY = { enabled: false, fee: 10, autoRelease: 7 };
const S = { q: "", cat: "", clear: false, async: false, flex: false, sort: "recentes", aud: "freela", next: null };
const PREFS = Object.assign({ big: false, airy: false, calm: false, focus: false }, store.get("prefs", {}));
let pollTimer = null, renderSeq = 0;

async function refreshMe() {
  try { const d = await api("GET", "/api/me"); ME = d.user; if (d.payments) PAY = d.payments; } catch { ME = null; }
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
  const pn = $("#payNote"); if (pn) pn.textContent = PAY.enabled ? `Pagamento protegido pelo Asaas · taxa Osmo ${PAY.fee}%` : "Pagamentos ainda simulados durante o período de testes.";
  markNav();
}
function markNav() {
  const name = (location.hash.slice(1) || "inicio").split("-")[0];
  $$("#nav button, #mmenu [data-go]").forEach(b => {
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
  clearInterval(pollTimer);
  const seq = ++renderSeq;
  const h = location.hash.slice(1) || "inicio";
  const [name, idStr] = h.split("-"); const id = Number(idStr) || null;
  const fn = V[name] || V.inicio;
  markNav();
  try {
    const html = await fn(id);
    if (seq !== renderSeq || html === undefined) return;
    $("#view").innerHTML = html;
    window.scrollTo(0, 0);
    after[name] && after[name](id);
  } catch (e) {
    if (seq !== renderSeq) return;
    if (e.status === 401) { ME = null; renderChrome(); S.next = h; go("entrar"); return; }
    $("#view").innerHTML = emptyBox("Não deu para abrir esta página.", e.message, "inicio", "Voltar ao início");
  }
}
window.addEventListener("hashchange", route);
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
    <p class="lead">Aqui toda vaga tem briefing estruturado, todo perfil diz como a pessoa prefere se comunicar e nenhuma proposta precisa ser escrita do zero.</p>
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
    <div class="row">${av(featured.name, featured.id)}<div style="min-width:0"><h3>${esc(featured.name)}</h3><p class="muted">${esc(featured.title)}${featured.location ? " · " + esc(featured.location) : ""}</p></div></div>
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
    <div class="field"><label for="a_pass">Senha</label><div class="pass-wrap"><input class="input" id="a_pass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="8" required>${eyeBtn()}</div>${reg ? `<span class="hint">Pelo menos 8 caracteres.</span>` : ""}</div>
    <div id="authErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="submit">${reg ? "Criar conta" : "Entrar"}</button>
  </form></div>`;
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
    <div class="list" id="jlist">${r.html}</div>
  </section></div>`;
};
let jobsT;
async function refreshJobs() {
  clearTimeout(jobsT);
  jobsT = setTimeout(async () => {
    try { const r = await jobsHTML(); $("#jlist").innerHTML = r.html; $("#jcount").textContent = `${r.n} ${r.n === 1 ? "vaga encontrada" : "vagas encontradas"}`; const sm = $("#fbox>summary"); if (sm) sm.textContent = "Filtros" + (activeFilters() ? ` (${activeFilters()})` : ""); }
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
  const props = owner ? `<section class="panel stack"><h2>Propostas (${d.proposals.length})</h2>${d.proposals.length ? d.proposals.map(p => `
    <div class="prop">
      <div class="row" style="justify-content:space-between"><div class="row">${av(p.freela_name, p.freela_id, "sm")}<div><button class="back" style="margin:0; color:var(--fg)" data-go="talento-${p.freela_id}">${esc(p.freela_name)}</button><p class="hint">${esc(p.freela.title || "")}</p></div></div>${pill(PSTATUS, p.status)}</div>
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
      ${j.skills.length ? `<section><span class="label">Habilidades</span><div class="row" style="gap:6px">${j.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
    </div>
    ${j.clarity < 70 ? `<div class="sunk"><b>Este briefing tem pontos em aberto.</b><p class="muted">A proposta guiada sugere perguntas para esclarecer antes de aceitar.</p></div>` : ""}
    ${props}
  </article>
  <aside class="stack">
    <div class="panel stack" style="gap:12px">
      <div class="kv"><span class="muted">Valor</span><b class="mono">${j.budget_type === "hora" ? brl(j.budget) + "/h" : brl(j.budget)}</b></div>
      <div class="kv"><span class="muted">Duração</span><b>${esc(j.duration) || "—"}</b></div>
      <div class="kv"><span class="muted">Propostas</span><b class="mono">${j.proposals}</b></div>
      <div class="kv"><span class="muted">Publicada</span><b>${when(j.created_at)}</b></div>
      ${action}
    </div>
    <div class="panel stack side-extra" style="gap:6px"><span class="label">Quem contrata</span><h3>${esc(j.company || j.client)}</h3>${j.company ? `<p class="muted">${esc(j.client)}</p>` : ""}</div>
  </aside>
</div>`;
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

/* ---------- talentos ---------- */
function talentCard(t) {
  return `<button class="talent" data-go="talento-${t.id}">
    <div class="row">${av(t.name, t.id)}<div style="min-width:0"><h3>${esc(t.name)}</h3><p class="muted" style="font-size:.9rem">${esc(t.title || "Perfil em construção")}</p></div></div>
    ${t.tag ? `<div class="row" style="gap:6px"><span class="chip plum">${esc(t.tag)}</span></div>` : ""}
    <div class="row" style="justify-content:space-between"><span class="mono">${t.rate ? `<b>${brl(t.rate)}</b>/h` : "Valor a combinar"}</span><span class="mono">${t.done} ${t.done === 1 ? "trabalho concluído" : "trabalhos concluídos"}</span></div>
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
    <div class="prof-head">${av(t.name, t.id, "lg")}
      <div class="stack" style="gap:6px"><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${esc(t.name)}</h1><p class="muted">${esc(t.title || "Perfil em construção")}${t.location ? " · " + esc(t.location) : ""}</p>${t.tag ? `<div class="row"><span class="chip plum">${esc(t.tag)}</span></div>` : ""}</div></div>
    ${t.bio ? `<p style="max-width:65ch; white-space:pre-wrap">${esc(t.bio)}</p>` : ""}
    ${has ? `<div class="stack" style="gap:12px"><h2>Como eu trabalho melhor</h2><div class="howgrid">
      ${[["Comunicação", t.how.com], ["Tempo de resposta", t.how.resp], ["Feedback", t.how.fb], ["Ritmo", t.how.foco]].filter(x => x[1]).map(x => `<div class="how"><span class="label">${x[0]}</span>${esc(x[1])}</div>`).join("")}
    </div></div>` : ""}
    ${t.portfolio.length ? `<div class="stack" style="gap:12px"><h2>Portfólio</h2><div class="port">${t.portfolio.map((p, i) => `<div class="ptile t${i % 3}">${esc(p)}</div>`).join("")}</div></div>` : ""}
  </article>
  <aside class="stack">
    <div class="panel stack" style="gap:12px">
      <div class="kv"><span class="muted">Valor</span><b class="mono">${t.rate ? brl(t.rate) + "/h" : "A combinar"}</b></div>
      <div class="kv"><span class="muted">Trabalhos concluídos</span><b class="mono">${t.done}</b></div>
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
  <div class="threads" role="list">${threads.map(t => `<button class="thread" role="listitem" data-go="mensagens-${t.id}" aria-current="${t.id === openId}">${av(t.with, t.withId, "sm")}<div class="tx"><b>${esc(t.with)}${t.unread ? `<span class="badge">${t.unread}</span>` : ""}</b><p>${esc(t.job)}</p><p>${esc(t.last)}</p></div></button>`).join("")}</div>
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
      <div style="flex:1; min-width:0"><b>${esc(t.with.name)}</b><p class="hint">${t.job ? `<a href="#vaga-${t.job.id}">${esc(t.job.title)}</a>` : "Conversa direta"}</p></div>
      ${t.with.how && t.with.how.resp ? `<span class="chip accent">${esc(t.with.how.resp)}</span>` : ""}</div>
    <div class="pin" id="pinBox"><b>Combinado até agora:</b> <span id="pinText">${esc(t.pin) || "Nada registrado ainda."}</span> <button class="btn sm ghost" data-act="pin-edit" style="padding:2px 8px">Editar</button></div>
    <div class="bubbles" id="bubbles" aria-live="polite">${bubbles()}</div>
    <form class="compose" id="compose">
      <div class="quick">${["Recebi, vou olhar até amanhã.", "Pode me mandar por escrito?", "Preciso de mais 1 dia.", "Entrega enviada, aguardo retorno."].map(q => `<button type="button" data-quick="${esc(q)}">${q}</button>`).join("")}</div>
      <div class="row"><input class="input" id="msgIn" style="flex:1; min-width:0" placeholder="Escreva sua mensagem" aria-label="Mensagem" maxlength="3000"><button class="btn primary" type="submit">Enviar</button></div>
    </form>`;
}
after.mensagens = () => {
  const bb = $("#bubbles"); if (bb) bb.scrollTop = bb.scrollHeight;
  if (!TH) return;
  const tid = TH.thread.id;
  pollTimer = setInterval(async () => {
    if (document.hidden || !TH || TH.thread.id !== tid) return;
    try {
      const d = await api("GET", "/api/threads/" + tid);
      if (d.messages.length !== TH.messages.length || d.thread.pin !== TH.thread.pin) {
        TH = d; const b = $("#bubbles"); if (!b) return;
        const atEnd = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
        b.innerHTML = bubbles(); if (atEnd) b.scrollTop = b.scrollHeight;
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

/* ---------- perfil ---------- */
V.perfil = async () => {
  if (needLogin()) return;
  const p = ME.profile, isF = ME.role === "freela";
  const f = (id, label, val, attrs = "", hint = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" value="${esc(val)}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const ta = (id, label, val, rows = 4, hint = "") => `<div class="field"><label for="${id}">${label}</label><textarea class="input" id="${id}" rows="${rows}">${esc(val)}</textarea>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  return `<div class="wiz"><div class="row" style="justify-content:space-between; margin-bottom:18px"><h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">Meu perfil</h1>${isF ? `<button class="btn sm" data-go="talento-${ME.id}">Ver como os outros veem</button>` : ""}</div>
  <form class="stack" id="profForm">
    <div class="panel stack">${f("p_name", "Nome", ME.name, 'autocomplete="name"')}
      ${isF ? f("p_title", "O que você faz", p.title, 'placeholder="Ex.: Designer de marca e embalagem"')
        + `<div class="row" style="align-items:flex-start">${f("p_rate", "Valor por hora (R$)", p.rate || "", 'inputmode="numeric" class="input mono"')}${f("p_hours", "Horas por semana", p.hours, 'inputmode="numeric"', "Define quantas propostas você pode ter abertas.")}</div>`
        + f("p_loc", "Cidade", p.location) + f("p_skills", "Habilidades", p.skills.join(", "), "", "Separe por vírgula.") + ta("p_bio", "Sobre você", p.bio, 4)
        : f("p_company", "Empresa ou projeto", p.company)
          + f("p_doc", "CPF ou CNPJ", "", 'inputmode="numeric" placeholder="' + (ME.hasDoc ? "Já informado. Preencha só para trocar." : "Só números") + '"', "Usado apenas para emitir as cobranças das etapas.")}
    </div>
    ${isF ? `<div class="panel stack"><div><h2>Como eu trabalho melhor</h2><p class="muted">Aparece no seu perfil e nas suas propostas. Quem contrata lê antes de chamar.</p></div>
      ${f("w_com", "Comunicação", p.how.com, 'placeholder="Ex.: Texto primeiro. Chamadas só com pauta."')}
      ${f("w_resp", "Tempo de resposta", p.how.resp, 'placeholder="Ex.: Até 1 dia útil"')}
      ${f("w_fb", "Formato de feedback", p.how.fb, 'placeholder="Ex.: Lista numerada"')}
      ${f("w_foco", "Ritmo", p.how.foco, 'placeholder="Ex.: Entregas a cada 2 ou 3 dias"')}
      ${f("p_tag", "Identificação (opcional)", p.tag, 'placeholder="Ex.: TDAH · entregas curtas"', "Só preencha se quiser. Aparece como um selo no seu perfil.")}
    </div>
    <div class="panel stack">${ta("p_port", "Portfólio", p.portfolio.join("\n"), 4, "Um projeto por linha.")}</div>` : ""}
    ${isF && PAY.enabled ? payoutHTML() : ""}
    <div id="profErr" class="err" role="alert" hidden></div>
    <div class="row"><button class="btn hl" type="submit">Salvar perfil</button><button class="btn ghost" type="button" data-act="logout">Sair da conta</button></div>
  </form></div>`;
};

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
      ${fld("p_skills", "Habilidades desejadas", `<input class="input" id="p_skills" data-p="skills" value="${esc(P.skills)}" placeholder="Branding, Logotipo">`, "Separe por vírgula.")}
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
  const au = t.closest("[data-auth]"); if (au) { authMode = au.dataset.auth; return route(); }
  const q = t.closest("[data-quick]"); if (q) { $("#msgIn").value = q.dataset.quick; return $("#msgIn").focus(); }
  const qs = t.closest("[data-q]"); if (qs) { const ta = $("#wqs"); ta.value = (ta.value ? ta.value + "\n" : "") + qs.dataset.q; W.qs = ta.value; return saveDraft(); }
  const en = t.closest("[data-energy]"); if (en) { try { await api("PUT", "/api/me/energy", { energy: en.dataset.energy }); ME.energy = en.dataset.energy; toast("Energia atualizada"); route(); } catch (err) { toast(err.message); } return; }
  const act = t.closest("[data-act]"); if (!act) return;
  const id = Number(act.dataset.id);
  const busy = fn => async () => { act.disabled = true; try { await fn(); } catch (err) { toast(err.message); } finally { act.disabled = false; } };
  switch (act.dataset.act) {
    case "logout": if (menuOpen) closeMenu(false); await api("POST", "/api/auth/logout"); ME = null; renderChrome(); toast("Você saiu da conta"); return go("inicio");
    case "toggle-pass": {
      const inp = $("#a_pass"), show = inp.type === "password";
      inp.type = show ? "text" : "password";
      act.setAttribute("aria-pressed", String(show));
      act.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      act.innerHTML = show ? EYE_OFF : EYE;
      return;
    }
    case "login-then": S.next = act.dataset.next; return go("entrar");
    case "wnext": if (!wizValid()) return; W.step = Math.min(3, W.step + 1); saveDraft(); return rerenderWiz();
    case "wprev": W.step = Math.max(0, W.step - 1); saveDraft(); return rerenderWiz();
    case "ms-add": W.ms.push({ title: "", value: "" }); saveDraft(); $("#msBox").innerHTML = msRows(); return;
    case "ms-del": W.ms.splice(Number(act.dataset.i), 1); saveDraft(); $("#msBox").innerHTML = msRows(); return;
    case "wsend": return busy(async () => {
      const body = { text: W.text, value: Number(W.value), days: Number(W.days), questions: W.qs, milestones: W.split ? W.ms.map(m => ({ title: m.title, value: Number(m.value) })) : [] };
      try { await api("POST", `/api/jobs/${WJOB.id}/proposals`, body); }
      catch (err) { const box = $("#wErr"); box.textContent = err.message; box.hidden = false; return; }
      store.set("draft-" + WJOB.id, null); W = null; WJOB = null; toast("Proposta enviada"); refreshMe(); go("painel");
    })();
    case "pay": return busy(async () => { await api("POST", `/api/milestones/${id}/pay`); toast("Cobrança gerada. Clique em Abrir cobrança para pagar."); route(); })();
    case "payout": return busy(async () => {
      const v = k => ($("#" + k) || {}).value || "";
      const body = { cpfCnpj: v("po_doc"), birthDate: v("po_birth"), companyType: v("po_type"), mobilePhone: v("po_phone"), incomeValue: Number(v("po_income").replace(/\D/g, "")) || 0,
        postalCode: v("po_cep"), address: v("po_addr"), addressNumber: v("po_num"), complement: v("po_comp"), province: v("po_prov") };
      try { const r = await api("POST", "/api/me/payout", body); toast(r.escrow ? "Recebimentos ativados" : "Recebimentos ativados (sem garantia automática)"); await refreshMe(); route(); }
      catch (err) { const b = $("#poErr"); b.textContent = err.message; b.hidden = false; }
    })();
    case "close-job": return busy(async () => { await api("POST", `/api/jobs/${id}/close`); toast("Vaga fechada"); route(); })();
    case "accept": return busy(async () => { await api("POST", `/api/proposals/${id}/accept`); toast("Contrato criado"); go("painel"); })();
    case "decline": return busy(async () => { await api("POST", `/api/proposals/${id}/decline`); toast("Proposta recusada"); route(); })();
    case "withdraw": return busy(async () => { await api("POST", `/api/proposals/${id}/withdraw`); toast("Proposta retirada"); route(); })();
    case "invite": return busy(async () => { const r = await api("POST", `/api/jobs/${$("#invJob").value}/invite`, { talentId: id }); toast("Convite enviado"); go("mensagens-" + r.thread); })();
    case "chat": return busy(async () => { const r = await api("POST", "/api/threads", { withId: Number(act.dataset.with) }); go("mensagens-" + r.thread); })();
    case "ms": return busy(async () => { await api("POST", `/api/milestones/${id}/${act.dataset.a}`, {}); toast({ start: "Etapa iniciada", deliver: "Entrega registrada", approve: "Etapa aprovada e valor liberado" }[act.dataset.a]); route(); })();
    case "ms-changes": { const box = $("#msa-" + id); box.innerHTML = `<input class="input" id="chg-${id}" placeholder="O que precisa ajustar?" style="flex:1; min-width:180px"><button class="btn sm hl" data-act="ms-changes-send" data-id="${id}">Enviar pedido</button>`; return $("#chg-" + id).focus(); }
    case "ms-changes-send": return busy(async () => { const note = $("#chg-" + id).value.trim(); if (!note) return toast("Escreva o que precisa ajustar."); await api("POST", `/api/milestones/${id}/changes`, { note }); toast("Pedido de ajustes enviado"); route(); })();
    case "pin-edit": { const box = $("#pinBox"); box.innerHTML = `<b>Combinado até agora:</b><div class="pin-edit"><input class="input" id="pinIn" maxlength="600" value="${esc(TH.thread.pin)}"><button class="btn sm primary" data-act="pin-save">Salvar</button></div>`; return $("#pinIn").focus(); }
    case "pin-save": return busy(async () => { await api("PUT", `/api/threads/${TH.thread.id}/pin`, { pin: $("#pinIn").value }); toast("Resumo atualizado"); route(); })();
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
});
document.addEventListener("change", e => {
  const t = e.target, id = t.id;
  if (id === "fcat") { S.cat = t.value; refreshJobs(); }
  if (id === "fsort") { S.sort = t.value; refreshJobs(); }
  if (["f_clear", "f_async", "f_flex"].includes(id)) { S[id.slice(2)] = t.checked; refreshJobs(); }
  if (id === "wsplit") { W.split = t.checked; if (W.split && W.ms.length === 1 && !W.ms[0].value) W.ms[0] = { title: "Entrega completa", value: W.value }; $("#msBox").hidden = !W.split; $("#msBox").innerHTML = msRows(); saveDraft(); }
  if (t.dataset.pref) { PREFS[t.dataset.pref] = t.checked; applyPrefs(); }
  if (t.dataset.p) { P[t.dataset.p] = t.type === "checkbox" ? t.checked : t.value; store.set("post-draft", P); $("#meter").innerHTML = meterHTML(); }
});
document.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('[type="submit"]');
  const showErr = (box, msg) => { const b = $(box); b.textContent = msg; b.hidden = false; b.scrollIntoView({ block: "nearest" }); };
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
    if (f.id === "compose") {
      const v = $("#msgIn").value.trim(); if (!v) return;
      try { await api("POST", `/api/threads/${TH.thread.id}/messages`, { body: v }); } catch (err) { return toast(err.message); }
      $("#msgIn").value = ""; TH = await api("GET", "/api/threads/" + TH.thread.id); const b = $("#bubbles"); b.innerHTML = bubbles(); b.scrollTop = b.scrollHeight; $("#msgIn").focus(); return;
    }
    if (f.id === "profForm") {
      const v = id => ($("#" + id) || {}).value || "";
      const body = { name: v("p_name"), title: v("p_title"), rate: Number(v("p_rate")) || 0, hours: Number(v("p_hours")) || 20, location: v("p_loc"),
        skills: v("p_skills").split(",").map(s => s.trim()).filter(Boolean), bio: v("p_bio"), tag: v("p_tag"), company: v("p_company"), cpfCnpj: v("p_doc"),
        portfolio: v("p_port").split("\n").map(s => s.trim()).filter(Boolean), how: { com: v("w_com"), resp: v("w_resp"), fb: v("w_fb"), foco: v("w_foco") } };
      try { await api("PUT", "/api/me/profile", body); } catch (err) { return showErr("#profErr", err.message); }
      await refreshMe(); toast("Perfil salvo"); return;
    }
    if (f.id === "postForm") {
      const body = { ...P, ent: P.ent.split("\n"), fora: P.fora.split("\n"), skills: P.skills.split(",").map(s => s.trim()).filter(Boolean), budget: Number(P.budget) || 0 };
      let r; try { r = await api("POST", "/api/jobs", body); } catch (err) { return showErr("#postErr", err.message); }
      P = Object.assign({}, POST0); store.set("post-draft", null); toast(`Vaga publicada com ${r.clarity}% de clareza`); return go("vaga-" + r.id);
    }
  } finally { if (btn) btn.disabled = false; }
});

/* ---------- conforto ---------- */
function applyPrefs() { const r = document.documentElement; ["big", "airy", "calm", "focus"].forEach(k => r.classList.toggle(k, !!PREFS[k])); store.set("prefs", PREFS); }
function openA11y() {
  $("#layer").innerHTML = `<div class="scrim" id="scrim"></div><div class="drawer" role="dialog" aria-modal="true" aria-label="Conforto">
    <div class="row" style="justify-content:space-between"><h2>Conforto</h2><button class="btn sm ghost" id="a11yClose">Fechar</button></div>
    <p class="muted">Ajuste a interface ao seu jeito. Fica salvo neste navegador.</p>
    ${[["big", "Texto maior", "Aumenta o tamanho da letra em toda a plataforma"], ["airy", "Mais espaço entre linhas", "Ajuda a acompanhar textos longos"], ["calm", "Sem animações", "Remove transições e movimentos"], ["focus", "Modo foco", "Esconde painéis laterais e informações extras"]].map(o => `<label class="toggle"><span><b>${o[1]}</b><br><span class="hint">${o[2]}</span></span><input type="checkbox" class="sw" data-pref="${o[0]}" ${PREFS[o[0]] ? "checked" : ""}></label>`).join("")}
  </div>`;
  $("#a11yClose").focus();
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
});

/* ---------- início ---------- */
setInterval(() => { if (ME && !document.hidden) refreshMe(); }, 30000);
applyPrefs();
refreshMe().then(route);
