(() => {
// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// Este é o "garçom" da plataforma: o programa que roda DENTRO do navegador de quem
// usa o site (no celular ou no computador). Ele:
//   1. desenha cada tela (início, vagas, perfil, mensagens...) escrevendo HTML;
//   2. escuta o que a pessoa faz (cliques, digitação, envio de formulários);
//   3. leva os pedidos até a "cozinha" (o servidor, server.js) e traz as respostas.
// É um site de "uma página só": em vez de carregar uma página nova a cada clique,
// o garçom troca só o miolo da tela (a <div id="view">). O que vem depois do "#"
// no endereço (ex.: osmo.com.br/#vagas) diz qual tela mostrar.
// "use strict" liga o "modo rigoroso" do JavaScript, que avisa mais cedo sobre erros bobos.
"use strict";
/* Osmo Talents: aplicação do navegador (sem dependências) */

// FERRAMENTAS PEQUENAS usadas o tempo todo:
// - $ e $$: acham um (ou todos os) pedaço(s) da página, tipo "me dá o botão tal";
// - esc: troca < > & " ' por códigos seguros antes de escrever um texto na tela. Isso impede
//   que alguém escreva um "código malvado" no nome ou numa mensagem e ele rode na tela de outra
//   pessoa. TODO texto que vem de gente passa pelo esc;
// - brl: escreve dinheiro do jeito brasileiro (R$ 1.500);
// - words: conta palavras; isMobile: a tela é de celular (até 700 px)?
/* ---------- recursos ligados nesta versão ---------- */
// VERSÃO 3.1 (MVP): alguns recursos ficam ESCONDIDOS para o app focar no caminho principal
// (vaga → proposta → contrato → entrega → pagamento). Nada foi apagado: o código, as rotas do
// servidor e os dados continuam lá. Para trazer um recurso de volta, troque false por true
// (os idiomas têm o interruptor deles no i18n.js, que carrega antes deste arquivo).
// - tarefas: projetos e tarefas no estilo Asana (Minhas tarefas, Projetos, botão "Tarefas" no Painel)
// - squads: os círculos para montar equipes
// - pomodoro: o relógio de foco nos Ajustes
const RECURSOS: Record<string, boolean> = { tarefas: false, squads: false, pomodoro: false, idiomas: !!(window.I18N && window.I18N.ativo) };
// telas de cada recurso escondido e para onde a pessoa vai se abrir um link antigo
const TELAS_ESCONDIDAS: Record<string, string[]> = { tarefas: ["tarefas", "projetos", "projeto", "contrato"], squads: ["squads"] };
const DESTINO_ESCONDIDO: Record<string, string> = { tarefas: "painel", squads: "inicio" };
const recursoDaTela = (name: string) => Object.keys(TELAS_ESCONDIDAS).find(k => !RECURSOS[k] && TELAS_ESCONDIDAS[k].includes(name));
/* ---------- utilidades ---------- */
// Selectors below address markup owned by this renderer. IDs preserve their concrete DOM type.
function $<S extends string>(selector: S): OsmoSelected<S> { return document.querySelector(selector) as OsmoSelected<S>; }
function $$<S extends string>(selector: S): OsmoSelected<S>[] { return [...document.querySelectorAll(selector)] as OsmoSelected<S>[]; }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const errorStatus = (error: unknown): number => typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 0;
const eventElement = (event: Event): Element | null => event.target instanceof Element ? event.target : null;
type AppControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const eventInput = (event: Event): AppControl | null => event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement ? event.target : null;
const eventForm = (event: Event): HTMLFormElement | null => event.target instanceof HTMLFormElement ? event.target : null;
const field = (form: HTMLFormElement, name: string): HTMLInputElement => form.elements.namedItem(name) as HTMLInputElement;


const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
// IDIOMA: o I18N (i18n.js) diz o idioma escolhido; LOC é o "jeito local" de escrever datas e números
const TR: Pick<OsmoI18n, "lang" | "locale" | "t" | "tx" | "flush" | "set" | "ready" | "langs" | "withLanguage"> = window.I18N || { lang: "pt-BR", locale: "pt-BR", t: s => s, tx: s => s, flush() {}, set() {}, ready: Promise.resolve(), langs: [], withLanguage: href => href };
const LOC = TR.locale;
const brl = (n: unknown) => "R$ " + Number(n || 0).toLocaleString(LOC);
const dec = (n: unknown) => Number(n || 0).toLocaleString(LOC, { maximumFractionDigits: 1 }); // 4,5 em português; 4.5 em inglês
const words = (s: unknown) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const isMobile = () => matchMedia("(max-width:700px)").matches;
// CATEGORIAS E HABILIDADES: a lista vem do arquivo taxonomia.json (baseada no Upwork).
// Enquanto ele não chega, usamos 4 categorias de reserva para a tela não ficar vazia.
// loadTaxonomy baixa o arquivo e monta duas listas: habilidades por área e todas juntas
// (sem repetidas, em ordem alfabética).
// categorias e habilidades vêm de /taxonomia.json (importadas do Upwork); estas quatro valem até o arquivo carregar
let CATS = [
  { id: "design", n: "Design e criação", c: "Marca, interfaces, vídeo, 3D" },
  { id: "dev", n: "Desenvolvimento e TI", c: "Sites, apps, lojas virtuais" },
  { id: "texto", n: "Escrita e conteúdo", c: "Copy, roteiro, revisão" },
  { id: "dados", n: "Dados e análise", c: "Painéis, planilhas, pesquisa" },
];
// ícones das áreas (mesma família: 24×24, traço 1.8, pontas arredondadas)
const CAT_ICONS: Record<string, string> = {
  ia: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/><path d="M12 9l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  dev: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 8.5h18"/><path d="M10 12l-2.5 2.5L10 17M14 12l2.5 2.5L14 17"/>',
  design: '<path d="M10.5 13.5L18.6 5.4a1.6 1.6 0 0 1 2.3 2.3l-8.1 8.1"/><path d="M8.5 14c-2 0-3.5 1.5-3.5 3.5 0 1.2-.7 2-2 2.5 1 .7 2.4 1 3.8 1 2.6 0 4.2-1.6 4.2-3.8 0-1.8-1.1-3.2-2.5-3.2z"/>',
  marketing: '<path d="M3.5 10v4a1 1 0 0 0 1 1H7l8.5 4.5v-15L7 9H4.5a1 1 0 0 0-1 1z"/><path d="M7 15l1.2 5h2.6L9.8 15.8"/><path d="M19 9.5a3.5 3.5 0 0 1 0 5"/>',
  dados: '<path d="M4 4v14a2 2 0 0 0 2 2h14"/><path d="M8.5 16v-3M12.5 16V8M16.5 16v-5"/>',
  admin: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19v.5a2.5 2.5 0 0 1-2.5 2.5H13"/>',
  texto: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  eng: '<path d="M4 20V4l16 16z"/><path d="M8 16v-4.5l4.5 4.5z"/><path d="M4 8h2M4 12h2M4 16h2"/>',
  _: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
};
let SKILLS: { all: string[]; byCat: Record<string, string[]> } = { all: [], byCat: {} };
async function loadTaxonomy() {
  try {
    const t = await (await fetch("/taxonomia.json")).json() as { categorias: { id: string; nome: string; resumo: string; especialidades: { habilidades: string[] }[] }[] };
    CATS = t.categorias.map(c => ({ id: c.id, n: c.nome, c: c.resumo }));
    const uniq = (a: string[]) => [...new Set(a)];
    t.categorias.forEach(c => { SKILLS.byCat[c.id] = uniq(c.especialidades.flatMap(e => e.habilidades)); });
    SKILLS.all = uniq(Object.values(SKILLS.byCat).flat()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch {}
}
const catName = (id: string) => CATS.find(c => c.id === id)?.n || "";

// O CAMPO DE HABILIDADES COM AUTOCOMPLETAR (perfil e vaga):
// - as habilidades escolhidas viram "etiquetas" com um × para tirar;
// - enquanto você digita, aparece uma lista de sugestões (matchSkills procura ignorando
//   acentos e coloca primeiro as que COMEÇAM com o que você digitou);
// - setas sobem e descem na lista, Enter escolhe, Esc fecha, Backspace no campo vazio tira a
//   última etiqueta;
// - se a habilidade não está na lista, aparece "Adicionar ..." com o que você escreveu.
// Por baixo dos panos, tudo fica guardado num campo escondido como "A, B, C", do mesmo jeito
// que antes, então o servidor não precisou mudar nada.
/* ---------- campo de habilidades: etiquetas + autocompletar com a lista do Upwork (taxonomia.json) ----------
   O valor fica num campo escondido #p_skills ("A, B, C"), então salvar o perfil e a vaga continua igual. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// nome da habilidade no idioma da tela (a lista e o banco guardam o nome em português)
const skLabel = (k: string) => TR.tx(k);
const skillsOf = (v: unknown) => String(v || "").split(",").map(s => s.trim()).filter(Boolean);
// começo do nome primeiro, depois começo de palavra, depois qualquer trecho; sem texto, as da área escolhida
function matchSkills(term: string, cat: string | undefined, have: string[], n = 8) {
  const t = fold(term.trim()), own = new Set(have.map(fold));
  const pool = t ? [...(SKILLS.byCat[cat || ""] || []), ...SKILLS.all] : (SKILLS.byCat[cat || ""] || []);
  // procura tanto no nome traduzido quanto no original (quem digita "logo" ou "logotipo" acha o mesmo)
  const rank = (k: string) => { const f = fold(skLabel(k)); return f.startsWith(t) ? 0 : (" " + f).includes(" " + t) ? 1 : fold(k).startsWith(t) ? 1 : 2; };
  return [...new Set(pool)].filter(k => !own.has(fold(k)) && (!t || fold(skLabel(k)).includes(t) || fold(k).includes(t)))
    .map((k, i): [string, number, number] => [k, t ? rank(k) : 0, i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]).slice(0, n);
}
const markTerm = (k0: string, term: string) => { const k = skLabel(k0), t = term.trim(), i = fold(k).indexOf(fold(t)); return !t || i < 0 ? esc(k) : esc(k.slice(0, i)) + "<mark>" + esc(k.slice(i, i + t.length)) + "</mark>" + esc(k.slice(i + t.length)); };
const skillTagsHTML = (list: string[]) => list.map(k => `<li class="sk-tag">${esc(k)}<button type="button" data-skill-del="${esc(k)}" aria-label="Remover ${esc(k)}">×</button></li>`).join("");
function skillBoxHTML({ value = "", cat = "", max = 12, dataP = "" }) {
  const list = skillsOf(value).slice(0, max), full = list.length >= max;
  return `<div class="skillbox" data-area="${esc(cat)}" data-max="${max}">
    <ul class="sk-tags" id="p_skills_tags" aria-label="Habilidades escolhidas">${skillTagsHTML(list)}</ul>
    <input class="sk-in" id="p_skills_in" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="p_skills_list" aria-labelledby="p_skills_lbl" aria-describedby="p_skills_hint" autocomplete="off" autocapitalize="off" enterkeyhint="done" ${full ? "disabled" : ""} placeholder="${full ? `Limite de ${max} habilidades` : list.length ? "Adicionar outra" : "Digite e escolha na lista"}">
    <ul class="sk-list" id="p_skills_list" role="listbox" aria-label="Sugestões de habilidades" hidden></ul>
    <input type="hidden" id="p_skills" ${dataP ? `data-p="${dataP}"` : ""} value="${esc(list.join(", "))}">
  </div>
  <span class="hint" id="p_skills_hint">Até ${max}. Escolha na lista com as setas e Enter, ou digite uma que não esteja lá e aperte Enter.</span>`;
}
const SKB: { active: number; opts: string[] } = { active: -1, opts: [] }; // opções da lista aberta e a destacada
function skillSet(list: string[]) {
  const box = $(".skillbox"), hid = $("#p_skills"), inp = $("#p_skills_in"); if (!box) return;
  const max = Number(box.dataset.max); list = list.slice(0, max);
  hid.value = list.join(", "); hid.dispatchEvent(new Event("input", { bubbles: true }));
  $("#p_skills_tags").innerHTML = skillTagsHTML(list);
  inp.disabled = list.length >= max; inp.placeholder = inp.disabled ? `Limite de ${max} habilidades` : list.length ? "Adicionar outra" : "Digite e escolha na lista";
}
function skillAdd(k: string) {
  k = String(k || "").replace(/,/g, " ").trim().slice(0, 40); if (!k) return;
  const list = skillsOf($("#p_skills").value);
  if (!list.some(x => fold(x) === fold(k))) list.push(k);
  skillSet(list); const inp = $("#p_skills_in"); inp.value = ""; skillList(!inp.disabled); if (!inp.disabled) inp.focus();
}
function skillList(open = true) {
  const box = $(".skillbox"), inp = $("#p_skills_in"), ul = $("#p_skills_list"); if (!box) return;
  const term = inp.value, typed = term.trim(), have = skillsOf($("#p_skills").value);
  SKB.opts = open && !inp.disabled ? matchSkills(term, box.dataset.area, have) : [];
  const custom = open && typed && !SKB.opts.some(k => fold(k) === fold(typed)) && !have.some(k => fold(k) === fold(typed));
  if (custom) SKB.opts.push(typed);
  SKB.active = SKB.opts.length && typed ? 0 : -1;
  ul.innerHTML = SKB.opts.map((k, i) => `<li role="option" id="sk-opt-${i}" data-skill-opt="${i}" aria-selected="${i === SKB.active}"><span>${custom && i === SKB.opts.length - 1 ? `Adicionar “${esc(k)}”` : markTerm(k, term)}</span></li>`).join("");
  ul.hidden = !SKB.opts.length; inp.setAttribute("aria-expanded", String(!ul.hidden));
  SKB.active >= 0 ? inp.setAttribute("aria-activedescendant", "sk-opt-" + SKB.active) : inp.removeAttribute("aria-activedescendant");
}
function skillMove(d: number) {
  if ($("#p_skills_list").hidden) return skillList();
  if (!SKB.opts.length) return;
  SKB.active = (SKB.active + d + SKB.opts.length) % SKB.opts.length;
  $$("#p_skills_list [role=option]").forEach((o, i) => o.setAttribute("aria-selected", String(i === SKB.active)));
  const cur = $("#sk-opt-" + SKB.active); cur.scrollIntoView({ block: "nearest" }); $("#p_skills_in").setAttribute("aria-activedescendant", cur.id);
}
document.addEventListener("keydown", e => { const target = eventElement(e); if (!target) return;
  if (target.id !== "p_skills_in") return;
  const inp = target as HTMLInputElement, open = !$("#p_skills_list").hidden;
  if (e.key === "ArrowDown") { e.preventDefault(); return skillMove(1); }
  if (e.key === "ArrowUp") { e.preventDefault(); return skillMove(-1); }
  if (e.key === "Escape" && open) { e.preventDefault(); return skillList(false); }
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault(); // Enter aqui só escolhe a habilidade; nunca envia o formulário
    return skillAdd(SKB.active >= 0 && open ? SKB.opts[SKB.active] : inp.value);
  }
  if (e.key === "Backspace" && !inp.value) { const list = skillsOf($("#p_skills").value); if (list.length) { list.pop(); skillSet(list); } }
});
document.addEventListener("input", e => { const target = eventInput(e); if (!target) return; if (target.id === "p_skills_in") skillList(); });
document.addEventListener("focusin", e => { const target = eventElement(e); if (!target) return; if (target.id === "p_skills_in") skillList(); });
document.addEventListener("focusout", e => { const target = eventElement(e); if (!target) return; if (target.id === "p_skills_in") setTimeout(() => { if (document.activeElement !== target) skillList(false); }, 150); });
// na lista, o toque escolhe sem tirar o foco do campo (assim o teclado do celular não fecha)
document.addEventListener("pointerdown", e => { const target = eventElement(e); if (!target) return; const o = target.closest<HTMLElement>("[data-skill-opt]"); if (o) { e.preventDefault(); skillAdd(SKB.opts[Number(o.dataset.skillOpt)]); } });
// STORE: uma "gaveta" no próprio navegador (localStorage) para guardar coisas pequenas, como
// rascunhos e preferências. Fica só neste aparelho. O try/catch evita erro em janelas anônimas,
// onde a gaveta pode estar trancada.
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem("osmo." + k); return v ? JSON.parse(v) as T : d; } catch { return d; } },
  set(k: string, v: unknown) { try { v == null ? localStorage.removeItem("osmo." + k) : localStorage.setItem("osmo." + k, JSON.stringify(v)); } catch {} },
};
// Datas fáceis de ler: "agora", "há 5 min", "há 2 h", "ontem" ou "12 de out.".
function when(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + "Z"), s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "ontem";
  return d.toLocaleDateString(LOC, { day: "2-digit", month: "short" });
}
function hm(iso: string) { const d = new Date(iso.replace(" ", "T") + "Z"); return d.toLocaleString(LOC, { weekday: "short", hour: "2-digit", minute: "2-digit" }); }
function initials(n: unknown) { return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
// O DESENHO DO SELO VERDE: uma "roseta" feita de 1 círculo grande + 12 bolinhas em volta
// (calculadas com seno e cosseno, como os números num relógio) e um "✓" branco no meio.
// av() desenha a foto da pessoa ou, sem foto, um círculo colorido com as iniciais.
// clarBar desenha a barrinha de clareza; toast mostra um aviso rápido que some sozinho.
// selo verde de verificado (laudo médico assinado com ICP-Brasil), no formato "roseta" dos selos de redes sociais
const VB_SVG = (() => {
  const bumps = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<circle cx="${(12 + 8.2 * Math.cos(a)).toFixed(2)}" cy="${(12 + 8.2 * Math.sin(a)).toFixed(2)}" r="3"/>`; }).join("");
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="12" r="8.6"/>${bumps}</g><path d="M7.7 12.4l2.9 2.9 5.8-6" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
})();
const VB_TXT = "Verificado: neurodivergência comprovada por laudo médico com assinatura digital ICP-Brasil";
const vbadge = (on: unknown) => on ? `<span class="vbadge" role="img" aria-label="${VB_TXT}" title="${VB_TXT}">${VB_SVG}</span>` : "";
const av = (name: string | undefined, id: number, size = "", src: string | undefined = "") => src ? `<img class="av ${size}" src="${esc(src)}" alt="" data-name="${esc(name || "")}" loading="lazy">` : `<div class="av ${size} c${(id || 0) % 4}" aria-hidden="true">${esc(initials(name))}</div>`;
function clarBar(v: number) { const cls = v >= 80 ? "" : v >= 65 ? "mid" : "low"; return `<span class="clarity" title="Clareza do briefing"><span class="bar ${cls}"><i style="width:${v}%"></i></span>${v}% claro</span>`; }
function toast(m: string) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

// O GARÇOM INDO À COZINHA: api() manda um pedido ao servidor e traz a resposta.
// - o cabeçalho "X-Osmo: 1" prova que o pedido saiu do nosso próprio site (proteção CSRF);
// - sem internet, devolve uma mensagem amigável;
// - se o servidor disser que deu erro, transforma a explicação dele num erro que a tela mostra.
async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const opt: RequestInit & { headers: Record<string, string> } = { method, headers: { "X-Osmo": "1", "X-Osmo-Lang": TR.lang }, credentials: "same-origin" };
  if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, opt); } catch { throw Object.assign(new Error("Sem conexão com o servidor. Confira sua internet e tente de novo."), { status: 0 }); }
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((isRecord(data) && typeof data.error === "string" ? data.error : "") || "Algo deu errado."), { status: res.status });
  if (!isRecord(data)) throw new Error("Resposta inválida do servidor.");
  return data as T;
}

// Os desenhos do "olhinho" que mostra ou esconde a senha.
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2"/><path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const eyeBtn = () => `<button type="button" class="eye-btn" data-act="toggle-pass" aria-label="Mostrar senha" aria-pressed="false" aria-controls="a_pass">${EYE}</button>`;

// A MEMÓRIA DA PÁGINA (o que o garçom precisa lembrar enquanto a página está aberta):
// - ME: quem está logado (ou null se ninguém);
// - PAY, OAUTH, MAIL: como a plataforma está configurada (pagamentos, botões de login, e-mail);
// - S: os filtros de busca escolhidos (palavra, área, só briefing claro...);
// - PREFS: as preferências de Ajustes (texto maior, sem animações, vidro líquido...);
// - renderSeq: um contador para ignorar respostas atrasadas (se você clicou em outra tela
//   antes da primeira terminar de carregar, a primeira é descartada).
/* ---------- estado ---------- */
let ME: OsmoUser | null = null; let PAY: OsmoPayments = { enabled: false, fee: 10, autoRelease: 7 }, OAUTH: string[] = [], MAIL = false, PHONE = false, PUSH = ""; // PUSH = chave pública do push ("" = desligado)
const S: { q: string; cat: string; clear: boolean; async: boolean; flex: boolean; sort: string; aud: string; next: string | null; page?: number; tq?: string; tpage?: number; top10?: string; forgotEmail?: string } = { q: "", cat: "", clear: false, async: false, flex: false, sort: "recentes", aud: "freela", next: null };
// vidro líquido vem ligado, exceto para quem pediu menos transparência no sistema
const PREFS: Record<string, boolean> = Object.assign({ big: false, airy: false, calm: false, focus: false, glass: !matchMedia("(prefers-reduced-transparency: reduce)").matches }, store.get("prefs", {}));
let pollTimer: number | undefined, renderSeq = 0;

// ATUALIZAÇÃO SOZINHA: quando publicamos uma versão nova do site, o número de versão muda.
// De vez em quando o garçom pergunta "qual a versão atual?". Se mudou, ele recarrega a página
// na PRÓXIMA troca de tela (nunca no meio de um formulário, para ninguém perder o que digitou).
// versão nova publicada: a página recarrega na próxima troca de tela (nunca no meio de um formulário)
const MY_V = ["app.js", "styles.css"].map(n => {
  const el = document.querySelector<HTMLElement>(`script[src^="/${n}"], link[href^="/${n}"]`);
  return ((el && (el.getAttribute("src") || el.getAttribute("href"))) || "").match(/[?&]v=([a-z0-9]+)/)?.[1] || "";
}).join(".");
let NEW_VERSION = false, lastVersionCheck = Date.now();
const noteVersion = (v: string) => {
  if (!v || !/^\w+\.\w+$/.test(MY_V) || v === MY_V) return;
  try { if (sessionStorage.getItem("osmo-reload") === v) return; sessionStorage.setItem("osmo-reload", v); } catch { return; } // recarrega uma vez só por versão
  NEW_VERSION = true;
};
async function checkVersion() {
  if (Date.now() - lastVersionCheck < 60_000) return;
  lastVersionCheck = Date.now();
  try { noteVersion((await api<OsmoMeResponse>("GET", "/api/me")).v); } catch {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(); });
// Pergunta ao servidor "quem sou eu?" e redesenha o cabeçalho com o que voltar.
async function refreshMe() {
  try { const d = await api<OsmoMeResponse>("GET", "/api/me"); noteVersion(d.v); ME = d.user; if (d.payments) PAY = d.payments; OAUTH = d.oauth || []; MAIL = !!d.mail; PHONE = !!d.phone; PUSH = d.push || ""; GA_ID = d.analytics || ""; } catch { ME = null; }
  renderChrome(); gaLoad(); gaBanner();
  if (ME && ME!.needPhone) phoneModal();
}

// CABEÇALHO, MENU E BARRA DE BAIXO: ICONS são os desenhos dos ícones. renderChrome monta os
// botões do topo (mudam se você é freela, cliente ou visitante), o menu hambúrguer e a barra
// de navegação do celular. markNav destaca a tela em que você está.
/* ---------- cabeçalho e menu ---------- */
const ICONS: Record<string, string> = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  vagas: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  talentos: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
  mensagens: '<path d="M3 5h18v14H3z"/><path d="m3 6 9 7 9-7"/>',
  painel: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
  ajustes: '<path d="M9.8 3h4.4l.5 2.1c.6.2 1.1.5 1.6.9l2-.7 2.2 3.8-1.6 1.4a7 7 0 0 1 0 1.9l1.6 1.4-2.2 3.8-2-.7c-.5.4-1 .7-1.6.9l-.5 2.1H9.8l-.5-2.1c-.6-.2-1.1-.5-1.6-.9l-2 .7-2.2-3.8 1.6-1.4a7 7 0 0 1 0-1.9L3.5 9.1l2.2-3.8 2 .7c.5-.4 1-.7 1.6-.9z"/><circle cx="12" cy="12" r="2.5"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  entrar: '<path d="M10 17l5-5-5-5M15 12H3M14 3h6v18h-6"/>',
  // três círculos que se cruzam: os squads (como os círculos do Google+)
  squads: '<circle cx="9" cy="9" r="5.5"/><circle cx="15" cy="9" r="5.5"/><circle cx="12" cy="15" r="5.5"/>',
  tarefas: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7.5 12.5l3 3 6-7"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  panorama: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  // setas cruzadas, como o botão de "aleatório" do iPod/iTunes: troca o papel (cliente ↔ freelancer)
  shuffle: '<path d="M3 7h2.5c4 0 5.5 10 10 10H21"/><path d="M3 17h2.5c1.5 0 2.6-1.1 3.5-2.7"/><path d="M12 9.7c.9-1.6 2-2.7 3.5-2.7H21"/><path d="M18 4l3 3-3 3"/><path d="M18 14l3 3-3 3"/>',
};
// DOIS PAPÉIS: a mesma conta pode contratar (cliente) e trabalhar (freelancer). ME.role é o papel
// ativo; ME.roles, os que a pessoa tem. O botão com o ícone de "aleatório" no menu troca o papel
// ativo e o site inteiro se ajusta: abas, botões, painel, perfil e a busca da barra de baixo.
const ROLE_NAME: Record<string, string> = { cliente: "Cliente", freela: "Freelancer" };
const otherRole = () => ME && ME!.role === "cliente" ? "freela" : "cliente";
const hasBoth = () => !!(ME && ME!.roles && ME!.roles.includes("freela") && ME!.roles.includes("cliente"));
function roleSwitch() {
  if (!ME) return "";
  const o = otherRole(), both = hasBoth();
  const hint = both ? (o === "cliente" ? "Trocar para contratar" : "Trocar para trabalhar") : (o === "cliente" ? "Também quero contratar" : "Também quero trabalhar");
  return `<button type="button" class="mm-role" data-act="switch-role" data-role="${o}">
    <span class="mm-role-ico" aria-hidden="true"><span class="role-anim"><svg class="ico-static" viewBox="0 0 24 24">${ICONS.shuffle}</svg></span></span>
    <span class="mm-role-txt"><span class="mm-role-k">Você está como</span><b>${ROLE_NAME[ME!.role]}</b><span class="mm-role-h">${hint}</span></span>
    <span class="mm-role-seg" aria-hidden="true">${["cliente", "freela"].map(r => `<span class="${r === ME!.role ? "on" : ""}">${ROLE_NAME[r]}</span>`).join("")}</span>
  </button>`;
}
// ANIMAÇÃO DO BOTÃO (Lottie): o arquivo /anim/trocar-papel.json desenha as duas setas; uma sobe
// enquanto a outra desce e elas voltam a se cruzar. Quem toca é o lottie-web (versão leve, servida
// pelo próprio site em /vendor), baixado só quando o menu abre. Com "movimento reduzido" ligado
// (no aparelho ou em Ajustes) nada se mexe e fica o ícone parado.
let LOTTIE_P: Promise<OsmoLottie | null> | null = null;
const loadLottie = () => LOTTIE_P || (LOTTIE_P = new Promise<OsmoLottie>((ok, no) => {
  if (window.lottie) return ok(window.lottie);
  const sc = document.createElement("script"); sc.src = "/vendor/lottie_light.min.js"; sc.onload = () => ok(window.lottie!); sc.onerror = no; document.head.appendChild(sc);
}).catch(() => { LOTTIE_P = null; return null; }));
const calmMotion = () => document.documentElement.classList.contains("calm") || matchMedia("(prefers-reduced-motion: reduce)").matches;
async function prepRoleAnim(targetBox?: HTMLElement | null) {
  const box = (targetBox || $("#mmenu .role-anim") || $("#view .role-anim")) as (HTMLElement & { _anim?: OsmoLottieAnimation }) | null;
  if (!box || box._anim || calmMotion()) return box && box._anim;
  const L = await loadLottie(); if (!L || !box.isConnected || box._anim) return box._anim || null;
  const a = box._anim = L.loadAnimation({ container: box, renderer: "svg", loop: false, autoplay: false, path: "/anim/trocar-papel.json" });
  a.addEventListener("DOMLoaded", () => { box.querySelector<HTMLElement>(".ico-static")?.remove(); box.classList.add("on"); });
  return a;
}
const playRoleAnim = async (targetBox?: HTMLElement | null) => { const a = await prepRoleAnim(targetBox); if (a && a.isLoaded) a.goToAndPlay(0, true); };
document.addEventListener("pointerover", e => { const target = eventElement(e); if (!target) return;
  const b = target.closest && target.closest<HTMLElement>(".mm-role, .role-sub");
  if (b && e.pointerType === "mouse" && !b.contains(e.relatedTarget as Node | null)) playRoleAnim(b.querySelector<HTMLElement>(".role-anim"));
});
async function switchRole(to: string, back?: string, trigger?: HTMLElement | null) {
  if (!hasBoth()) {
    const ok = await confirmSheet(to === "cliente"
      ? { title: "Usar a conta também para contratar?", text: "Você continua sendo freelancer. Passa a poder publicar vagas e convidar talentos, e troca de papel pelo menu quando quiser.", ok: "Ativar papel de cliente" }
      : { title: "Usar a conta também para trabalhar?", text: "Você continua sendo cliente. Passa a poder enviar propostas para vagas, e troca de papel pelo menu quando quiser.", ok: "Ativar papel de freelancer" });
    if (!ok) return;
  }
  const animBox = trigger?.querySelector<HTMLElement>(".role-anim") || (menuOpen ? $("#mmenu .role-anim") : $("#view .role-anim"));
  const t0 = Date.now(), anim = !!animBox && !calmMotion();
  if (anim) playRoleAnim(animBox);
  const r = await api<{ role: OsmoRole; added: boolean }>("POST", "/api/me/role", { role: to });
  const left = 950 - (Date.now() - t0); // deixa a animação terminar antes de redesenhar o menu
  if (anim && left > 0) await new Promise(res => setTimeout(res, left));
  await refreshMe();
  if (menuOpen) closeMenu(false);
  toast(r.role === "cliente" ? "Agora você está como cliente" : "Agora você está como freelancer");
  // freela que acabou de virar cliente começa publicando; cliente que virou freela começa pelo perfil
  return go(back || (r.added ? (r.role === "cliente" ? "publicar" : "perfil") : "painel"));
}
// BOLINHA VERMELHA NO ÍCONE DO APP (igual à do Mail no iPhone): o número de mensagens não lidas.
// Funciona com o site instalado (tela de início do iPhone/Android, Dock do Mac, barra do Windows).
// Atualiza sempre que o site pergunta "quem sou eu?" (ao abrir, a cada 30 s e depois de ler uma
// conversa); com o app fechado, quem atualiza é o sw.js, quando chega uma notificação.
function appBadge(n: number) {
  if (!("setAppBadge" in navigator)) return;
  (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}
// Navegação usa links reais: abrir em nova aba, teclado e crawlers compartilham a mesma URL.
function upgradeNavigationLinks(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('button[data-go]').forEach(button => {
    const anchor = document.createElement("a");
    for (const attr of button.attributes) if (attr.name !== "type") anchor.setAttribute(attr.name, attr.value);
    anchor.href = url(button.dataset.go!);
    anchor.innerHTML = button.innerHTML;
    button.replaceWith(anchor);
  });
}
function renderChrome() {
  const unread = ME ? ME!.unread : 0;
  appBadge(unread);
  $$("[data-unread]").forEach(b => { b.hidden = !unread; b.textContent = String(unread); });
  const top = $("#topActions");
  const pub = !ME || ME!.role === "cliente" ? `<button class="btn sm hl" data-go="publicar">Publicar<span class="only-d"> vaga</span></button>` : "";
  top.innerHTML = `<div class="top-tools" role="group" aria-label="Acessos rápidos">
    ${ME ? `<button class="top-tool" data-go="mensagens" aria-label="Mensagens" title="Mensagens"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.mensagens}</svg><span class="badge" data-unread hidden></span></button>
      <button class="top-tool" data-go="painel" aria-label="Painel" title="Painel"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.painel}</svg></button>` : ""}
    <button class="top-tool" id="a11yBtn" aria-label="Ajustes" title="Ajustes" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.ajustes}</svg></button>
    </div>
    ${ME ? `<button class="whoami" data-go="perfil" title="Meu perfil">${av(ME!.name, ME!.id, "xs", ME!.profile && ME!.profile.avatar)}<span>${esc(ME!.name.split(" ")[0])}</span></button>` : `<button class="btn sm" data-go="entrar">Entrar</button>`}
    ${ME && ME!.isAdmin ? `<button class="btn sm only-d" data-go="panorama">Admin</button>` : ""}
    ${pub}
    <button class="menu-btn" id="menuBtn" aria-label="Abrir menu" aria-expanded="false" aria-controls="mmenu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span class="badge" data-unread hidden></span></button>`;
  const item = (k: string, label: string, extra = "") => `<li><button data-go="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${label}${extra}</span><span class="chev" aria-hidden="true">›</span></button></li>`;
  $("#mmBody").innerHTML = `
    ${ME ? `<button class="mm-user" data-go="perfil">${av(ME!.name, ME!.id, "", ME!.profile && ME!.profile.avatar)}<span class="mm-user-txt"><b>Olá, ${esc(ME!.name.split(" ")[0])}</b><span>Meu perfil</span></span><span class="chev" aria-hidden="true">›</span></button>${roleSwitch()}` : ""}
    <ul class="mm-list">
      ${item("inicio", "Início")}${item("vagas", "Encontrar trabalho")}${item("talentos", "Encontrar talentos")}
      ${ME ? item("mensagens", "Mensagens", unread ? `<span class="badge">${unread}</span>` : "") + item("painel", "Painel") + (RECURSOS.tarefas ? item("tarefas", "Tarefas") : "") + (RECURSOS.squads ? item("squads", "Squads") : "") + item("perfil", "Meu perfil") + (ME!.isAdmin ? item("panorama", "Área do admin") + `<li class="mm-switch">${admModeSwitch()}</li>` : "") : item("entrar", "Entrar ou criar conta")}
    </ul>
    <div class="mm-foot">
      ${!ME || ME!.role === "cliente" ? `<button class="btn hl" data-go="publicar">Publicar vaga</button>` : ""}
      <button class="btn" id="mmA11y">Ajustes</button>
      ${ME ? `<button class="btn ghost" data-act="logout">Sair da conta</button>` : ""}
    </div>`;
  // barra de navegação embaixo (só em telas pequenas; o CSS decide quando aparece): uma pílula
  // flutuante com as abas e, ao lado, um botão redondo de busca (abre Vagas ou Talentos com o
  // cursor já no campo de busca)
  const tabs = !ME ? [["inicio", "Início"], ["vagas", "Vagas"], ["talentos", "Talentos"], ["entrar", "Entrar"]]
    : [["inicio", "Início"], ME!.role === "cliente" ? ["talentos", "Talentos"] : ["vagas", "Vagas"], ["mensagens", "Mensagens"], ["painel", "Painel"], ["perfil", "Perfil"]];
  $("#tabbar").innerHTML = `<div class="tb-pill">${tabs.map(([k, label]) => `<button data-go="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${label}</span>${k === "mensagens" && unread ? `<span class="badge" aria-label="${unread} não lidas">${unread}</span>` : ""}</button>`).join("")}</div>
    <button class="tb-search" id="tbSearch" aria-label="${ME && ME!.role === "cliente" ? "Buscar talentos" : "Buscar vagas"}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.buscar}</svg></button>`;
  const pn = $("#payNote"); if (pn) pn.textContent = PAY.enabled ? `Pagamento processado ${PAY.provider === "stripe" ? "pela Stripe" : "pelo Asaas"}${PAY.sandbox ? " · ambiente de testes" : ""} · taxa Osmo ${PAY.fee}%` : "Pagamentos ainda simulados durante o período de testes.";
  upgradeNavigationLinks();
  markNav();
}
function markNav() {
  const name = curH().split("-")[0];
  $$("#nav [data-go], #topActions [data-go], #mmenu [data-go], #tabbar [data-go]").forEach(b => {
    const g = b.dataset.go!;
    const on = g === name || (g === "vagas" && (name === "vaga" || name === "proposta")) || (g === "talentos" && name === "talento") || (g === "tarefas" && ["projeto", "projetos", "contrato"].includes(name)) || (g === "panorama" && (name === "gestao" || name === "propostas"));
    on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current");
  });
}

// O ROTEADOR (o mapa das telas): olha o endereço e chama a função que desenha aquela tela.
// Exemplo: "/vagas/12" chama V.vaga(12). Por dentro, cada tela continua com um nome curto
// ("vaga-12"); hToPath e pathToH traduzem entre o nome curto e o endereço de verdade.
// - go("vagas") muda o endereço para /vagas sem recarregar a página (e a tela muda junto);
// - voltar e avançar do navegador funcionam (popstate);
// - links antigos com "#" (de e-mails já enviados) são convertidos para o endereço novo;
// - needLogin: se a tela pede login e ninguém entrou, manda para "Entrar" e lembra para onde
//   a pessoa queria ir, para voltar lá depois;
// - se a tela demora mais de 150 ms, mostra "blocos de carregamento" no formato do conteúdo;
// - se o servidor disser "você não está logado" (401), manda para Entrar.
/* ---------- roteador ---------- */
// Códigos secretos (recuperar senha, desligar avisos, escolher perfil) ficam depois do "#":
// essa parte nunca sai do navegador, então não aparece nos registros do servidor nem da Cloudflare.
const ID_PATHS: Record<string, string> = { vaga: "vagas", talento: "talentos", mensagens: "mensagens", contrato: "contratos", projeto: "projetos" };
const SECRET = ["recuperar", "avisos", "escolher"];
// endereços que são telas do app (o servidor usa a mesma lista para entregar o site em vez da 404)
const APP_PATH = /^\/(?:(?:vagas|talentos|mensagens|projetos)(?:\/\d+)?|vagas\/\d+\/proposta|contratos\/\d+|entrar|esqueci|recuperar|avisos|escolher|painel|perfil|publicar|panorama|propostas|tarefas|squads|gestao|top10|admin(?:\/(?:dados|propostas))?)\/?$/;
function hToPath(h: string) {
  const i = h.indexOf("-"), name = i < 0 ? h : h.slice(0, i), id = i < 0 ? "" : h.slice(i + 1);
  if (!name || name === "inicio") return "/";
  if (name === "panorama") return "/admin";           // área do admin: visão geral
  if (name === "propostas") return "/admin/propostas"; // área do admin: painel de propostas
  if (name === "gestao") return "/admin/dados";       // área do admin: dados
  if (SECRET.includes(name)) return `/${name}${id ? "#" + id : ""}`;
  if (name === "proposta") return `/vagas/${id}/proposta`;
  if (ID_PATHS[name] && id) return `/${ID_PATHS[name]}/${id}`;
  return "/" + name;
}
function pathToH(pathname: string, hash: string) {
  const p = pathname.replace(/\/+$/, "") || "/", code = (hash || "").slice(1);
  if (p === "/") return "inicio";
  if (p === "/admin") return "panorama";
  if (p === "/admin/propostas") return "propostas";
  if (p === "/admin/dados") return "gestao";
  let m = p.match(/^\/vagas\/(\d+)\/proposta$/);
  if (m) return "proposta-" + m[1];
  m = p.match(/^\/(vagas|talentos|mensagens|contratos|projetos)\/(\d+)$/);
  if (m) return Object.keys(ID_PATHS).find(k => ID_PATHS[k] === m[1]) + "-" + m[2];
  const name = p.slice(1);
  return SECRET.includes(name) && code ? name + "-" + code : name;
}
const curH = () => pathToH(location.pathname, location.hash);
const url = (h: string) => TR.withLanguage(hToPath(h)); // para links: href="${url("vaga-" + id)}"
function go(h: string, search = "") {
  const p = TR.withLanguage(hToPath(h) + search);
  if (p !== location.pathname + location.search + location.hash) history.pushState(null, "", p);
  return route();
}
// link antigo "osmo.com.br/#vaga-12" vira "osmo.com.br/vagas/12" (sem criar entrada nova no histórico)
function fixLegacyHash() {
  if (location.pathname !== "/" || location.hash.length < 2) return false;
  const old = location.hash.slice(1), name = old.split("-")[0];
  if (!V[name]) return false;
  history.replaceState(null, "", TR.withLanguage(hToPath(old))); return true;
}
function needLogin(role?: OsmoRole) {
  if (!ME) { S.next = curH(); go("entrar"); return true; }
  if (role && ME!.role !== role) {
    $("#view").innerHTML = emptyBox(role === "cliente" ? "Esta área é para quem contrata." : "Esta área é para quem trabalha como freelancer.", "Agora você está como " + (ME!.role === "cliente" ? "cliente" : "freelancer") + ".", "inicio", "Ir para o início");
    const b = $("#view .empty"); // oferece trocar de papel ali mesmo e voltar para esta tela
    if (b) b.insertAdjacentHTML("beforeend", `<button class="btn hl" data-act="switch-role" data-role="${role}" data-back="${esc(curH())}"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS.shuffle}</svg>${role === "cliente" ? "Trocar para cliente" : "Trocar para freelancer"}</button>`);
    return true;
  }
  return false;
}
function emptyBox(title: string, text: string, goTo?: string, label?: string) {
  return `<div class="empty"><b>${esc(title)}</b>${text ? `<p class="muted">${esc(text)}</p>` : ""}${goTo ? `<button class="btn" data-go="${goTo}">${esc(label)}</button>` : ""}</div>`;
}
function renderBreadcrumbs(name: string, id: number | null) {
  const box = $("#breadcrumbs");
  if (!box) return;
  if (name === "inicio") {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  const labels: Record<string, string> = { inicio: "Início", vagas: "Vagas", vaga: "Detalhes da vaga", talentos: "Talentos", talento: "Perfil do talento", proposta: "Enviar proposta", mensagens: "Mensagens", projetos: "Projetos", projeto: "Detalhes do projeto", contrato: "Contrato", entrar: "Entrar", esqueci: "Esqueci minha senha", recuperar: "Recuperar senha", avisos: "Preferências de avisos", escolher: "Escolher perfil", painel: "Meu painel", perfil: "Meu perfil", publicar: "Publicar vaga", panorama: "Administração", propostas: "Gerenciar propostas", gestao: "Gestão de dados", tarefas: "Tarefas", squads: "Squads", top10: "Top 10" };
  const items: { label: string; href?: string }[] = [{ label: "Início", href: "/" }];
  const parents: Record<string, [string, string]> = { vaga: ["Vagas", "/vagas"], talento: ["Talentos", "/talentos"], proposta: ["Vagas", "/vagas"], projeto: ["Projetos", "/projetos"], contrato: ["Meu painel", "/painel"], propostas: ["Administração", "/admin"], gestao: ["Administração", "/admin"] };
  if (parents[name]) items.push({ label: parents[name][0], href: parents[name][1] });
  if (name === "proposta" && id) items.push({ label: "Detalhes da vaga", href: `/vagas/${id}` });
  if (name === "mensagens" && id) items.push({ label: "Mensagens", href: "/mensagens" });
  items.push({ label: name === "mensagens" && id ? "Conversa" : labels[name] || "Página" });
  box.innerHTML = `<span class="breadcrumbs-label">Você está em</span><ol>${items.map((item, i) => `<li>${i ? '<span class="breadcrumbs-separator" aria-hidden="true">/</span>' : ""}${i === items.length - 1 ? `<span aria-current="page">${esc(item.label)}</span>` : `<a href="${esc(item.href)}">${esc(item.label)}</a>`}</li>`).join("")}</ol>`;
}
async function route() {
  if (NEW_VERSION) return location.reload();
  document.body.classList.remove("chat-full");
  checkVersion();
  clearInterval(pollTimer);
  const seq = ++renderSeq;
  const h = curH();
  const [name, idStr] = h.split("-"); const id = Number(idStr) || null;
  const query = new URLSearchParams(location.search);
  if (name === "vagas") {
    S.q = query.get("q") || ""; S.cat = query.get("cat") || "";
    S.clear = query.get("clear") === "1"; S.async = query.get("async") === "1"; S.flex = query.get("flex") === "1";
    S.sort = query.get("sort") || "recentes"; S.page = Math.max(1, Number(query.get("page")) || 1);
  }
  if (name === "talentos") { S.tq = query.get("q") || ""; S.tpage = Math.max(1, Number(query.get("page")) || 1); }
  const off = recursoDaTela(name); // link antigo para um recurso escondido nesta versão
  if (off) { history.replaceState(null, "", TR.withLanguage(hToPath(DESTINO_ESCONDIDO[off]))); return route(); }
  const fn = V[name] || V.inicio;
  markNav();
  renderBreadcrumbs(name, id);
  // trocou de tela e a resposta demorou: mostra blocos no formato do conteúdo
  const skT = h !== SHOWN ? setTimeout(() => { if (seq === renderSeq) { $("#view").innerHTML = skeleton(name); window.scrollTo(0, 0); } }, 150) : null;
  try {
    const html = await fn(id);
    if (skT !== null) clearTimeout(skT);
    if (seq !== renderSeq || html === undefined) return;
    $("#view").innerHTML = html; upgradeNavigationLinks($("#view")); SHOWN = h;
    $$("#view .role-anim").forEach(el => prepRoleAnim(el));
    window.scrollTo(0, 0);
    after[name] && after[name](id);
    admBar(name, id);
    setPageTitle(name);
    gaPage(name);
    tvFocusFirst();
  } catch (e) {
    if (skT !== null) clearTimeout(skT);
    if (seq !== renderSeq) return;
    if (errorStatus(e) === 401) { ME = null; renderChrome(); S.next = h; go("entrar"); return; }
    $("#view").innerHTML = emptyBox("Não deu para abrir esta página.", errorMessage(e), "inicio", "Voltar ao início");
    upgradeNavigationLinks($("#view"));
    updatePageMetadata(name, true);
  }
}
window.addEventListener("popstate", route);
window.addEventListener("hashchange", () => { if (fixLegacyHash()) route(); });
// links <a href="/vagas/12"> dentro do site trocam de tela sem recarregar (Ctrl/Cmd+clique continua abrindo em outra aba)
document.addEventListener("click", e => { const target = eventElement(e); if (!target) return;
  const a = target.closest && target.closest<HTMLAnchorElement>("a[href]");
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute("download")) return;
  const u = new URL(a.getAttribute("href")!, location.href);
  if (u.origin !== location.origin || (u.pathname !== "/" && !APP_PATH.test(u.pathname))) return; // arquivos, /privacidade, /api... seguem normal
  const requestedLanguage = window.OsmoI18nCore?.pick([u.searchParams.get("lang") || ""]);
  if (requestedLanguage && requestedLanguage !== TR.lang) return; // outra língua precisa carregar o dicionário desde o início
  e.preventDefault();
  if (menuOpen) closeMenu(false);
  go(pathToH(u.pathname, u.hash), u.search);
}, true);
// título da aba: o título da tela (ex.: "Identidade visual para cafeteria · Osmo Talents")
function setPageTitle(name: string) {
  TR.flush();
  const h1 = $("#view h1") || $("#view h2"), t = h1 ? h1.textContent.replace(/\s+/g, " ").trim() : "";
  const title = t && name !== "inicio" ? `${t} · Osmo Talents` : "Trabalho freelance com briefing claro | Osmo Talents";
  if (typeof pomoTitle !== "undefined") pomoTitle = title; // o Pomodoro devolve este título quando para
  if (!(typeof POMO !== "undefined" && POMO.on && POMO.running)) document.title = title;
  updatePageMetadata(name);
}
const initialSeoPath = location.pathname + location.search;
let seoHydrated = false, currentPublicProfileIndexable = false;
function updatePageMetadata(name: string, failed = false) {
  if (!seoHydrated && !failed && location.pathname + location.search === initialSeoPath) { seoHydrated = true; return; }
  seoHydrated = true;
  const title = name === "inicio" ? "Trabalho freelance com briefing claro | Osmo Talents" : document.title;
  const summary = $("#view .brief p") || $("#view .lead") || $("#view .listhead p") || $("#view p");
  const description = (summary ? summary.textContent.replace(/\s+/g, " ").trim() : "Projetos freelance com briefing claro e comunicação combinada na Osmo Talents.").slice(0, 220);
  const existing = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  let origin = location.origin;
  if (existing) { try { origin = new URL(existing.href).origin; } catch {} }
  const canonical = new URL(location.pathname, origin);
  const query = new URLSearchParams(location.search);
  if (["vagas", "talentos"].includes(name)) for (const key of ["cat", "page", "q", "clear", "async", "flex", "sort"]) {
    const value = query.get(key);
    if (value && !(key === "page" && Number(value) <= 1) && !(key === "sort" && value === "recentes")) canonical.searchParams.set(key, value);
  }
  const setMeta = (attribute: string, key: string, value: string) => {
    let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, key); document.head.appendChild(element); }
    element.content = value;
  };
  let link = existing;
  if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
  link.href = canonical.href;
  setMeta("name", "description", description);
  for (const [property, value] of [["og:title", title], ["og:description", description], ["og:url", canonical.href]]) setMeta("property", property, value);
  setMeta("name", "twitter:title", title); setMeta("name", "twitter:description", description);
  const closed = name === "vaga" && $("#view .status") && $("#view .status").textContent.trim() !== "Aberta";
  const filtered = ["vagas", "talentos"].includes(name) && [...canonical.searchParams.keys()].some(key => key !== "page" && key !== "cat");
  const indexable = !failed && !closed && !filtered && (["inicio", "vagas", "vaga", "talentos"].includes(name) || name === "talento" && currentPublicProfileIndexable);
  setMeta("name", "robots", indexable ? "index, follow" : "noindex, follow");
  document.querySelectorAll<HTMLElement>('#seo-schema, #client-seo-schema').forEach(element => element.remove());
  const crumbs = [...document.querySelectorAll<HTMLElement>("#breadcrumbs li")].map((li, i) => {
    const anchor = li.querySelector<HTMLElement>("a"), current = li.querySelector<HTMLElement>('[aria-current="page"]');
    return { "@type": "ListItem", position: i + 1, name: (anchor || current || li).textContent.trim(), item: anchor ? new URL(anchor.getAttribute("href")!, origin).href : canonical.href };
  });
  if (crumbs.length) {
    const schema = document.createElement("script"); schema.id = "client-seo-schema"; schema.type = "application/ld+json";
    schema.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs });
    document.head.appendChild(schema);
  }
}
// SKELETON: os "blocos cinza" que aparecem enquanto a tela carrega, com o formato aproximado
// de cada tela, com um brilho suave passando (some para quem pede "menos movimento" no sistema).
// V é a caixa onde moram as funções de cada tela; "after" guarda o que fazer DEPOIS que uma
// tela aparece (ex.: começar a atualizar as mensagens sozinho).
let SHOWN = "";
function skeleton(name: string) {
  const b = (h: number, w = "100%", extra = "") => `<div class="sk" style="height:${h}px; width:${w}${extra}"></div>`;
  const rows = (n: number, h: number) => Array.from({ length: n }, () => b(h)).join("");
  const shapes: Record<string, string> = {
    inicio: b(360) + `<div class="sk-grid">${rows(4, 90)}</div>`,
    vagas: b(28, "45%") + b(16, "30%") + rows(3, 150),
    talentos: b(28, "45%") + `<div class="sk-grid">${rows(6, 170)}</div>`,
    vaga: b(16, "25%") + b(36, "75%") + b(320), proposta: b(16, "25%") + b(36, "60%") + b(280),
    talento: `<div class="sk-row">${b(92, "92px", "; border-radius:50%; flex:none")}<div class="sk-col">${b(32, "70%")}${b(16, "45%")}</div></div>` + b(240),
    mensagens: b(28, "35%") + rows(5, 68), painel: b(28, "30%") + `<div class="sk-grid">${rows(4, 84)}</div>` + rows(2, 150),
    perfil: b(36, "50%") + rows(4, 76), publicar: b(36, "60%") + rows(3, 200),
    projetos: b(36, "35%") + b(16, "55%") + `<div class="sk-grid">${rows(6, 110)}</div>`,
    projeto: b(36, "45%") + `<div class="sk-grid">${rows(3, 320)}</div>`,
    tarefas: b(36, "40%") + b(16, "60%") + rows(3, 160),
    panorama: b(28, "30%") + `<div class="sk-grid">${rows(4, 84)}</div>` + rows(2, 180),
    gestao: b(28, "30%") + b(44) + rows(6, 52),
    avisos: b(16, "25%") + b(36, "60%") + b(260),
    top10: b(16, "15%") + b(44, "25%") + b(28, "12%") + `<div class="sk-row">${rows(5, 300)}</div>` + b(28, "12%") + `<div class="sk-row">${rows(5, 300)}</div>`,
  };
  shapes.contrato = shapes.projeto; // "contrato" só descobre o projeto e vai para ele
  return `<div class="sk-wrap" aria-hidden="true">${shapes[name] || rows(3, 120)}</div><p class="sr-only" role="status">Carregando…</p>`;
}
const after: Record<string, (id?: number | null) => void> = {};
const V: Record<string, (id?: number | null) => Promise<string | void>> = {};

// TELA INICIAL: a faixa colorida de boas-vindas com a busca (que muda entre "quero trabalhar"
// e "quero contratar"), um exemplo de perfil, as áreas, o "como funciona" e os princípios.
// Cada V.alguma-coisa é uma função que DEVOLVE o HTML da tela; o roteador coloca na página.
/* ---------- início ---------- */
V.inicio = async () => {
  let featured: OsmoTalent | undefined = undefined;
  try { featured = (await api<OsmoTalentsResponse>("GET", "/api/talents")).talents.find(t => t.title && t.how.com); } catch {}
  return `
<section class="hero">
  <div>
    <span class="label">Trabalho freelance para mentes neurodivergentes</span>
    <h1 style="margin-top:12px">Trabalho freelance, <em>no seu ritmo</em>, com briefing claro.</h1>
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
  <div class="cats">${CATS.map(c => `<a class="cat" href="/vagas?cat=${encodeURIComponent(c.id)}"><span class="cat-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${CAT_ICONS[c.id] || CAT_ICONS._}</svg></span><b>${c.n}</b><span class="muted">${c.c}</span></a>`).join("")}</div>
</section>
<section class="stack" style="margin-top:56px">
  <h2>Como funciona</h2>
  <div class="steps">
    <div class="step"><h3>Escolha vagas com briefing claro</h3><p class="muted">Cada vaga mostra a porcentagem de clareza: objetivo, entregas, o que está fora do escopo e como será a comunicação.</p></div>
    <div class="step"><h3>Envie uma proposta guiada</h3><p class="muted">Quatro passos curtos, com perguntas de apoio. O rascunho salva sozinho, então dá para pausar e voltar depois.</p></div>
    <div class="step"><h3>${PAY.enabled ? "Receba por etapa entregue" : "Combine entregas por etapa"}</h3><p class="muted">${PAY.enabled ? `O pagamento é processado ${PAY.provider === "stripe" ? "pela Stripe" : "pelo Asaas"}${PAY.sandbox ? " (ambiente de testes)" : ""} e liberado conforme as etapas aprovadas e os termos da plataforma.` : "Os pagamentos estão em simulação durante o período de testes. Não há cobrança nem proteção de valores pela plataforma nesta fase."} <a href="/pagamentos-e-taxas">Entenda pagamentos e taxas</a>.</p></div>
  </div>
</section>
<section class="stack" style="margin-top:56px">
  <h2>O que muda em relação a outras plataformas</h2>
  <div class="principles">
    <div class="principle"><h3>Sem adivinhação</h3><p class="muted">Só é possível publicar vaga com pelo menos metade do briefing preenchido. A nota de clareza fica visível para todos.</p></div>
    <div class="principle"><h3>Propor não custa nada</h3><p class="muted">Sem créditos nem taxa por proposta. O limite de propostas abertas acompanha a capacidade que você declara.</p></div>
    <div class="principle"><h3>Interface calma</h3><p class="muted">Sem contadores piscando nem pressa artificial. Ajuste tamanho de texto, espaçamento e movimento em Ajustes.</p></div>
    <div class="principle"><h3>Comunicação combinada antes</h3><p class="muted">Cada conversa tem um resumo fixo do que foi combinado, editável pelos dois lados.</p></div>
  </div>
</section>`;
};

// ENTRAR E CRIAR CONTA: a mesma tela com duas abas. Mostra os botões de login social que
// estiverem ligados (SOCIAL) e traduz os códigos de erro da volta do Google em frases (OAUTH_ERR).
/* ---------- entrar / criar conta ---------- */
let authMode = "entrar";
// CONFIRMAR O CELULAR NO CADASTRO PELO WHATSAPP (quando o servidor tem isso ligado: PHONE).
// "Criar conta" primeiro confere os dados e troca o formulário pela caixa do WhatsApp: um botão
// abre o WhatsApp com a mensagem pronta para a Osmo. Enquanto isso o site pergunta ao servidor
// "já chegou?" (waPoll). Chegou, a conta é criada com o comprovante (ticket).
// REG guarda o comprovante, para não pedir outra mensagem se algo falhar depois.
let REG: { pid: string; code: string; ticket: string } | null = null, waTimer = 0;
V.entrar = async () => {
  if (ME) { go(S.next || "painel"); return; }
  const reg = authMode === "criar", tel = reg && PHONE;
  REG = null;
  return `<div class="auth stack">
  <div><span class="label">Osmo Talents</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">${reg ? "Criar conta" : "Entrar"}</h1></div>
  <div class="seg" role="group" aria-label="Modo"><button aria-pressed="${!reg}" data-auth="entrar">Entrar</button><button aria-pressed="${reg}" data-auth="criar">Criar conta</button></div>
  ${reg ? `<div class="field"><span class="flabel">Eu quero</span>
      <label class="check"><input type="radio" name="role" value="freela" checked><span>Trabalhar como freelancer</span></label>
      <label class="check"><input type="radio" name="role" value="cliente"><span>Contratar freelancers</span></label></div>` : ""}
  ${socialHTML(reg)}
  <form class="panel stack" id="authForm" novalidate>
    ${reg ? `<div class="field"><label for="a_name">Nome</label><input class="input" id="a_name" autocomplete="name" placeholder="Nome e sobrenome" required></div>` : ""}
    <div class="field"><label for="a_email">E-mail</label><input class="input" id="a_email" type="email" autocomplete="email" placeholder="voce@email.com" required></div>
    <div class="field"><label for="a_pass">Senha</label><div class="pass-wrap"><input class="input" id="a_pass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="8" placeholder="${reg ? "Mínimo de 8 caracteres" : "Sua senha"}" required>${eyeBtn()}</div>${reg ? `<span class="hint">Pelo menos 8 caracteres.</span>` : MAIL ? `<button type="button" class="link-btn" data-act="forgot">Esqueci minha senha</button>` : ""}</div>
    <div id="authErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="submit">${reg ? (tel ? "Continuar" : "Criar conta") : "Entrar"}</button>
    ${tel ? `<span class="hint">No próximo passo você confirma seu celular mandando uma mensagem pelo WhatsApp.</span>` : ""}
  </form></div>`;
};

// caixa do WhatsApp: aparece no lugar do formulário depois que os dados conferem
const waHTML = (d: OsmoPhoneStart) => `<form class="panel stack" id="waForm" novalidate>
    <div><b>Confirme seu celular pelo WhatsApp</b><p class="muted" style="margin-top:6px">Toque no botão: o WhatsApp abre com a mensagem pronta para a Osmo. É só enviar e voltar para esta tela.</p></div>
    <a class="btn hl" href="${esc(d.link)}" target="_blank" rel="noopener">Abrir o WhatsApp</a>
    <details><summary>O WhatsApp está em outro aparelho?</summary>
      <p class="hint" style="margin-top:6px">Mande do seu celular esta mensagem para <b translate="no">${esc(d.number)}</b>:</p>
      <p translate="no"><b style="font-size:1.2rem; letter-spacing:.05em">${esc(d.code)}</b></p></details>
    <p id="waState" class="muted" role="status" aria-live="polite">Esperando a sua mensagem… O código vale por ${d.minutes} minutos.</p>
    <div id="waErr" class="err" role="alert" hidden></div>
    <div class="row" style="gap:20px; flex-wrap:wrap">
      ${d.dev ? `<button type="button" class="link-btn" data-act="wa-sim" data-code="${esc(d.code)}">Simular a mensagem (teste)</button>` : ""}
      <button type="button" class="link-btn" data-act="wa-back">Voltar</button>
    </div></form>`;
// pede um código novo e mostra a caixa do WhatsApp
async function waStart() {
  const d = await api<OsmoPhoneStart>("POST", "/api/auth/phone/start");
  REG = { pid: d.pid, code: d.code, ticket: "" };
  const f = $("#authForm"); f.hidden = true;
  $("#waForm")?.remove();
  f.insertAdjacentHTML("afterend", waHTML(d));
  waPoll();
}
// "Já chegou?": pergunta a cada 2,5 segundos enquanto a caixa estiver na tela.
// Ao voltar do WhatsApp (a aba fica visível de novo), pergunta na hora.
async function waPoll() {
  clearTimeout(waTimer);
  const box = $("#waForm"); if (!box || !REG || !REG!.pid) return;
  let d: OsmoPhoneStatus; try { d = await api<OsmoPhoneStatus>("GET", "/api/auth/phone/status?pid=" + REG!.pid); } catch { d = { state: "pending" }; }
  if (!$("#waForm") || box !== $("#waForm")) return;
  const say = (msg: string, err = false) => { const st = $("#waState"), e = $("#waErr"); if (err) { e.innerHTML = msg; e.hidden = false; st.hidden = true; } else st.textContent = msg; };
  if (d.state === "pending") { waTimer = setTimeout(waPoll, document.hidden ? 6000 : 2500); return; }
  REG!.pid = "";
  if (d.state === "expired") return say(`O código venceu. <button type="button" class="link-btn" data-act="wa-new">Gerar outro código</button>`, true);
  if (d.state === "taken") return say(`O celular ${esc(d.pretty)} já está em outra conta. Tente entrar, ou <button type="button" class="link-btn" data-act="wa-new">mande de outro número</button>.`, true);
  REG!.ticket = d.ticket;
  say(`Celular ${d.pretty} confirmado. Criando a sua conta…`);
  try { await api("POST", "/api/auth/register", { ...authBody(), phoneTicket: REG!.ticket }); }
  catch (err) { box.remove(); $("#authForm").hidden = false; const e = $("#authErr"); e.textContent = errorMessage(err); e.hidden = false; return; }
  authDone();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && REG && REG!.pid && $("#waForm")) waPoll(); });
function authBody(): OsmoAuthBody {
  const body: OsmoAuthBody = { email: $("#a_email").value, password: $("#a_pass").value };
  if (authMode === "criar") { body.name = $("#a_name").value; body.role = ($('input[name="role"]:checked') || {}).value; }
  return body;
}
async function authDone() {
  await refreshMe();
  toast(authMode === "criar" ? "Conta criada" : "Bem-vindo de volta");
  const next = S.next; S.next = null;
  return go(next || (authMode === "criar" ? (ME!.role === "freela" ? "perfil" : "publicar") : "painel"));
}

const SOCIAL: Record<string, string[]> = {
  google: ["Google", '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5.1 5.1 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>'],
  microsoft: ["Microsoft", '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>'],
  adobe: ["Adobe", '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EB1000" d="M14.6 2H22v20zM9.4 2H2v20zM12 9.4 16.7 22h-3.1l-1.4-3.6H8.8z"/></svg>'],
  linkedin: ["LinkedIn", '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#0A66C2"/><path fill="#fff" d="M6.9 9.5h-3v9.8h3zM5.4 4.7a1.7 1.7 0 1 0 0 3.5 1.7 1.7 0 0 0 0-3.5zM20.1 13.9c0-2.9-1.6-4.6-4-4.6a3.5 3.5 0 0 0-3.2 1.7V9.5H10v9.8h3v-5.3c0-1.4.6-2.4 1.9-2.4s1.8.9 1.8 2.4v5.3h3z"/></svg>'],
  github: ["GitHub", '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.01 8.01 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82a7.6 7.6 0 0 0-4 0c-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A8 8 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'],
};
function socialURL(provider: string, role = "") {
  const query = new URLSearchParams({ lang: TR.lang });
  if (role) query.set("role", role);
  return `/auth/${provider}?${query}`;
}
function socialHTML(reg: boolean) {
  // no app de TV (OsmoTV) o login social não funciona: Google e outros bloqueiam login dentro de WebView
  if (!OAUTH.length || /OsmoTV/.test(navigator.userAgent)) return "";
  const role = reg ? "freela" : ""; // a tela nasce com "freelancer" marcado; trocar o perfil atualiza os links (ouvinte de "change")
  return `<div class="stack" style="gap:10px" id="socialBox">
    ${OAUTH.filter(k => SOCIAL[k]).map(k => `<a class="btn social" data-social="${k}" href="${esc(socialURL(k, role))}">${SOCIAL[k][1]}<span>Continuar com ${SOCIAL[k][0]}</span></a>`).join("")}
    <div class="divider"><span>${reg ? "ou crie a conta com e-mail" : "ou entre com e-mail"}</span></div></div>`;
}
const OAUTH_ERR: Record<string, string> = {
  cancelado: "Você cancelou a entrada. Tente de novo quando quiser.",
  expirou: "A entrada demorou demais ou foi aberta em outra aba. Tente de novo.",
  sem_email: "O provedor não confirmou seu e-mail. Use outro jeito de entrar ou crie a conta com e-mail.",
  indisponivel: "Esse jeito de entrar ainda não está ativo.",
  tentativas: "Muitas tentativas seguidas. Espere alguns minutos.",
  falhou: "Não deu para entrar com o provedor agora. Tente de novo ou use e-mail e senha.",
};

// ESQUECI A SENHA: pede o e-mail; depois, pelo link do e-mail (#recuperar-código), deixa
// escolher uma senha nova.
/* ---------- recuperar senha ---------- */
V.esqueci = async () => `<div class="auth stack">
  <div><span class="label">Recuperar senha</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">Esqueci minha senha</h1>
  <p class="muted" style="margin-top:8px">Escreva o e-mail da sua conta. Vamos mandar um link para você criar uma senha nova.</p></div>
  <form class="panel stack" id="forgotForm" novalidate>
    <div class="field"><label for="f_email">E-mail</label><input class="input" id="f_email" type="email" autocomplete="email" placeholder="O e-mail da sua conta" required value="${esc(S.forgotEmail || "")}"></div>
    <div id="forgotErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="submit">Enviar link</button>
  </form>
  <button class="btn ghost" data-go="entrar">Voltar para entrar</button></div>`;

V.recuperar = async () => {
  const token = curH().split("-")[1] || "";
  let d;
  try { d = await api<{ email: string }>("GET", "/api/auth/reset?token=" + encodeURIComponent(token)); }
  catch (e) { return `<div class="auth stack">${emptyBox("Esse link não funciona mais.", errorStatus(e) === 404 ? "Ele vale por 1 hora e só pode ser usado uma vez. Peça um link novo." : errorMessage(e), "esqueci", "Pedir link novo")}</div>`; }
  return `<div class="auth stack">
  <div><span class="label">Recuperar senha</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">Criar senha nova</h1>
  <p class="muted" style="margin-top:8px">Conta: ${esc(d.email)}</p></div>
  <form class="panel stack" id="resetForm" novalidate data-token="${esc(token)}">
    <input type="email" autocomplete="username" value="${esc(d.email)}" hidden>
    <div class="field"><label for="a_pass">Senha nova</label><div class="pass-wrap"><input class="input" id="a_pass" type="password" autocomplete="new-password" minlength="8" placeholder="Mínimo de 8 caracteres" required>${eyeBtn()}</div><span class="hint">Pelo menos 8 caracteres. Ao salvar, sua conta sai dos outros aparelhos.</span></div>
    <div id="resetErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="submit">Salvar senha nova</button>
  </form></div>`;
};

// Quem entrou pela primeira vez com o Google escolhe aqui: quero trabalhar ou quero contratar.
/* ---------- escolher perfil (conta nova pelo login social) ---------- */
V.escolher = async () => {
  const token = (curH().split("-")[1] || "");
  const d = await api<{ name: string; email: string; provider: string }>("GET", "/api/auth/oauth/pending?token=" + encodeURIComponent(token));
  return `<div class="auth stack">
    <div><span class="label">Quase lá</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">Olá${d.name ? ", " + esc(d.name.split(" ")[0]) : ""}!</h1>
    <p class="muted" style="margin-top:8px">Você entrou com ${esc(d.provider)} (${esc(d.email)}). Falta só uma escolha: o que você quer fazer na Osmo Talents?</p></div>
    <div class="stack" style="gap:12px">
      <button class="cat" data-act="oauth-role" data-role="freela" data-token="${esc(token)}"><b>Quero trabalhar</b><span class="muted">Encontrar vagas com briefing claro e enviar propostas</span></button>
      <button class="cat" data-act="oauth-role" data-role="cliente" data-token="${esc(token)}"><b>Quero contratar</b><span class="muted">Publicar vagas e encontrar talentos</span></button>
    </div>
    <div id="roleErr" class="err" role="alert" hidden></div></div>`;
};

// LISTA DE VAGAS: jobQuery transforma os filtros escolhidos num endereço de busca
// (ex.: /api/jobs?cat=design&clear=1). jobCard desenha cada vaga. No celular, os filtros
// mais usados viram "chips" que você liga e desliga com um toque. Ao digitar na busca,
// refreshJobs espera um tiquinho (para não buscar a cada letra) e atualiza só a lista.
/* ---------- vagas ---------- */
function jobQuery() {
  const p = new URLSearchParams();
  if (S.q) p.set("q", S.q); if (S.cat) p.set("cat", S.cat);
  if (S.clear) p.set("clear", "1"); if (S.async) p.set("async", "1"); if (S.flex) p.set("flex", "1");
  p.set("sort", S.sort); p.set("page", String(S.page || 1)); return p.toString();
}
function jobCard(j: OsmoJob) {
  return `<a class="job" href="/vagas/${j.id}" data-go="vaga-${j.id}">
    <div><h3>${esc(j.title)}</h3><p class="muted">${esc(j.company || j.client)} · ${when(j.created_at)} · ${j.proposals} ${j.proposals === 1 ? "proposta" : "propostas"}</p></div>
    <div class="price"><b class="mono">${j.budget_type === "hora" ? brl(j.budget) + "/h" : brl(j.budget)}</b><span class="muted">${j.budget_type === "hora" ? "por hora" : "valor fixo"} · ${esc(j.duration)}</span></div>
    <div class="meta">${clarBar(j.clarity)}${j.async ? `<span class="chip accent">Assíncrono</span>` : `<span class="chip sun">Com reuniões</span>`}${j.flex ? `<span class="chip plum">Prazo flexível</span>` : ""}${j.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>
  </a>`;
}
const activeFilters = () => [S.cat, S.clear, S.async, S.flex].filter(Boolean).length;
// celular: filtros mais usados viram chips no topo da lista (mesmo estilo dos chips das vagas); sincronizam com o painel de filtros
const QUICK: ["clear" | "async" | "flex", string][] = [["clear", "Briefing claro"], ["async", "Assíncrono"], ["flex", "Prazo flexível"]];
const fchipsHTML = () => QUICK.map(([k, n]) => `<button class="chip ${S[k] ? "accent" : ""}" data-fchip="${k}" aria-pressed="${!!S[k]}">${n}</button>`).join("")
  + CATS.map(c => `<button class="chip ${S.cat === c.id ? "accent" : ""}" data-fcat="${c.id}" aria-pressed="${S.cat === c.id}">${c.n}</button>`).join("");
async function jobsHTML() {
  const { jobs, pagination } = await api<OsmoJobsResponse>("GET", "/api/jobs?" + jobQuery());
  return { n: pagination ? pagination.total : jobs.length, pagination, html: jobs.length ? jobs.map(jobCard).join("") : emptyBox("Nenhuma vaga com esses filtros.", "Tente desmarcar um filtro ou buscar outra palavra.") };
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
    <div class="listhead"><div><h1>Vagas abertas</h1><p class="muted" id="jcount" role="status" aria-live="polite">${r.n} ${r.n === 1 ? "vaga encontrada" : "vagas encontradas"}</p></div>
      <div class="field" style="min-width:180px"><label for="fsort" class="hint">Ordenar por</label><select class="input" id="fsort">
        <option value="recentes" ${S.sort === "recentes" ? "selected" : ""}>Mais recentes</option>
        <option value="clareza" ${S.sort === "clareza" ? "selected" : ""}>Mais claras</option>
        <option value="valor" ${S.sort === "valor" ? "selected" : ""}>Maior valor</option></select></div></div>
    <div class="fchips" id="fchips" role="group" aria-label="Filtros rápidos">${fchipsHTML()}</div>
    <div class="list" id="jlist">${r.html}</div><div id="jobPages">${paginationHTML("/vagas", r.pagination, new URLSearchParams(jobQuery()))}</div>
  </section></div>`;
};
let jobsT: number | undefined, talentsSearchTimer: number | undefined;
async function refreshJobs() {
  S.page = 1;
  const query = jobQuery(); history.replaceState(null, "", TR.withLanguage("/vagas?" + query));
  updatePageMetadata("vagas");
  clearTimeout(jobsT);
  jobsT = setTimeout(async () => {
    try { const r = await jobsHTML(); $("#jlist").innerHTML = r.html; const pages = $("#jobPages"); if (pages) pages.innerHTML = paginationHTML("/vagas", r.pagination, new URLSearchParams(jobQuery())); $("#jcount").textContent = `${r.n} ${r.n === 1 ? "vaga encontrada" : "vagas encontradas"}`; const sm = $("#fbox>summary"); if (sm) sm.textContent = "Filtros" + (activeFilters() ? ` (${activeFilters()})` : ""); const fc = $("#fchips"); if (fc) fc.innerHTML = fchipsHTML(); }
    catch (e) { toast(errorMessage(e)); }
  }, 250);
}

// PÁGINA DE UMA VAGA: mostra o briefing completo, valor, prazo e quem contrata.
// - quem é DONO da vaga vê as propostas recebidas, com botões de aceitar e recusar;
// - quem trabalha vê o botão de mandar proposta (ou a proposta que já mandou);
// - PSTATUS e JSTATUS traduzem as situações ("enviada" vira "Aguardando resposta").
/* ---------- detalhe da vaga ---------- */
const PSTATUS: Record<string, string[]> = { enviada: ["Aguardando resposta", "wait"], aceita: ["Escolhida", "ok"], recusada: ["Não escolhida", "off"], retirada: ["Retirada", "off"] };
const JSTATUS: Record<string, string[]> = { aberta: ["Aberta", "ok"], em_andamento: ["Em andamento", "hi"], concluida: ["Concluída", "off"], fechada: ["Fechada", "off"] };
const pill = (map: Record<string, string[]>, k: string) => `<span class="status ${(map[k] || ["", "off"])[1]}">${(map[k] || [k])[0]}</span>`;
// Os arquivos da proposta do próprio freela: enquanto ela espera resposta, dá para tirar e pôr.
function mineFiles(p: OsmoProposal) {
  const open = p.status === "enviada";
  if (!p.files.length && !open) return "";
  return `<div class="stack" style="gap:8px; margin-top:6px"><span class="label">Arquivos</span>
    ${attList(p.files, open ? f => `/api/proposals/${p.id}/files/${f.id}` : null) || `<p class="hint">Nenhum arquivo anexado.</p>`}
    ${open && p.files.length < 6 ? attPicker("propFiles", `/api/proposals/${p.id}/files`, "propFilesErr") : ""}
    <div id="propFilesErr" class="err" role="alert" hidden></div></div>`;
}
V.vaga = async id => {
  const d = await api<OsmoJobResponse>("GET", "/api/jobs/" + id); const j = d.job, b = j.brief;
  const owner = ME && ME!.id === j.client_id;
  let action = "";
  if (!ME) action = `<button class="btn hl" data-act="login-then" data-next="proposta-${j.id}">Entrar para enviar proposta</button>`;
  else if (owner) action = `<p class="hint">Esta vaga foi publicada pela sua conta.</p>${j.status === "aberta" ? `<button class="btn" data-act="close-job" data-id="${j.id}">Fechar vaga</button>` : ""}`;
  else if (d.mine) action = `<div class="stack" style="gap:8px"><span class="label">Sua proposta</span>${pill(PSTATUS, d.mine.status)}<p class="mono">${brl(d.mine.value)} · ${d.mine.days} dias úteis</p>${mineFiles(d.mine)}<button class="btn sm" data-act="chat" data-with="${j.client_id}" data-job="${j.id}">Conversar sobre a vaga</button></div>`;
  else if (j.status === "aberta") action = ME!.role === "freela"
    ? `<div class="stack" style="gap:8px"><button class="btn hl" data-go="proposta-${j.id}">Enviar proposta guiada</button><button class="btn ghost sm" data-act="chat" data-with="${j.client_id}" data-job="${j.id}">Tirar dúvida com quem contrata</button></div>`
    : `<div class="stack" style="gap:8px"><button class="btn hl" data-act="switch-role" data-role="freela" data-back="proposta-${j.id}">Enviar proposta guiada</button><button class="btn ghost sm" data-act="chat" data-with="${j.client_id}" data-job="${j.id}">Tirar dúvida com quem contrata</button><p class="hint">Você está como Cliente · ao clicar em enviar proposta, mudamos seu modo para Freelancer.</p></div>`;
  // no celular, valor e botão principal ficam fixos embaixo (o mesmo botão do painel lateral)
  const barAction = !ME ? action : !owner && !d.mine && j.status === "aberta"
    ? (ME!.role === "freela" ? `<button class="btn hl" data-go="proposta-${j.id}">Enviar proposta guiada</button>` : `<button class="btn hl" data-act="switch-role" data-role="freela" data-back="proposta-${j.id}">Enviar proposta guiada</button>`) : "";
  const price = j.budget_type === "hora" ? brl(j.budget) + "/h" : brl(j.budget);
  const canManageProps = !!(ME && (ME!.id === j.client_id || ME!.isAdmin)) && Array.isArray(d.proposals);
  const props = canManageProps ? `<section class="panel stack"><h2>Propostas (${d.proposals.length})</h2>${d.proposals.length ? d.proposals.map(p => `
    <div class="prop">
      <div class="row" style="justify-content:space-between"><div class="row">${av(p.freela_name, p.freela_id, "sm", p.freela.avatar)}<div><button class="back" style="margin:0; color:var(--fg)" data-go="talento-${p.freela_id}">${esc(p.freela_name)}</button>${vbadge(p.freela.verified)}<p class="hint">${esc(p.freela.title || "")}</p></div></div>${pill(PSTATUS, p.status)}</div>
      <p class="mono"><b>${brl(p.value)}</b> · ${p.days} dias úteis · você recebe a entrega em ${p.milestones.length} etapa(s)</p>
      <p style="white-space:pre-wrap" translate="no">${esc(p.text)}</p>
      ${p.freela.how.com ? `<p class="hint">Como trabalha melhor: ${esc(p.freela.how.com)} ${esc(p.freela.how.resp)}</p>` : ""}
      ${p.milestones.length > 1 ? `<ul style="margin:0; padding-left:20px">${p.milestones.map(m => `<li>${esc(m.title)}: <span class="mono">${brl(m.value)}</span></li>`).join("")}</ul>` : ""}
      ${p.files.length ? `<div class="stack" style="gap:8px"><span class="label">Arquivos da proposta</span>${attList(p.files)}</div>` : ""}
      ${p.status === "enviada" ? `<div class="row"><button class="btn hl sm" data-act="accept" data-id="${p.id}">Escolher proposta e criar contrato</button><button class="btn sm" data-act="decline" data-id="${p.id}">Não escolher</button><button class="btn sm ghost" data-act="chat" data-with="${p.freela_id}" data-job="${j.id}">Conversar</button></div>`
        : p.status === "recusada" ? `<div class="row"><button class="btn hl sm" data-act="accept" data-id="${p.id}">Escolher proposta e criar contrato</button><button class="btn sm" data-act="reopen" data-id="${p.id}">Voltar para aguardando resposta</button><button class="btn sm ghost" data-act="chat" data-with="${p.freela_id}" data-job="${j.id}">Conversar</button></div>`
        : p.status === "aceita" ? `<div class="row"><button class="btn sm primary" data-go="painel">Ver contrato no Painel</button><button class="btn sm ghost" data-act="chat" data-with="${p.freela_id}" data-job="${j.id}">Conversar</button></div>` : ""}
    </div>`).join("") : `<p class="muted">Ainda não chegaram propostas. Você pode convidar talentos pela página de cada perfil.</p>`}</section>` : "";
  return `<button class="back" data-go="vagas">← Voltar para vagas</button>
<div class="detail">
  <article class="stack">
    <div class="stack" style="gap:10px"><span class="label">${catName(j.cat)}</span><h1 style="font-size:clamp(1.7rem,4vw,2.5rem)">${esc(j.title)}</h1>
      <div class="row">${pill(JSTATUS, j.status)}${clarBar(j.clarity)}${j.async ? `<span class="chip accent">Assíncrono</span>` : `<span class="chip sun">Com reuniões</span>`}${j.flex ? `<span class="chip plum">Prazo flexível</span>` : ""}</div></div>
    <div class="panel brief">
      <section><h2 class="label">Objetivo</h2><p>${esc(b.obj) || '<span class="muted">Não informado</span>'}</p></section>
      <section><h2 class="label">Entregas</h2>${b.ent.length ? `<ul>${b.ent.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : '<p class="muted">Não informado</p>'}</section>
      <section><h2 class="label">Fora do escopo</h2>${b.fora.length ? `<ul>${b.fora.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : `<p class="muted">O cliente não informou. Você pode perguntar na proposta.</p>`}</section>
      <section><h2 class="label">Comunicação</h2><p>${esc(b.com) || '<span class="muted">Não informado</span>'}</p></section>
      <section><h2 class="label">Feedback</h2><p>${esc(b.fb) || '<span class="muted">Não informado</span>'}</p></section>
      <section><h2 class="label">Referências</h2><p>${esc(b.ref) || '<span class="muted">Não informado</span>'}</p></section>
      ${j.filesCount || owner ? `<section><h2 class="label">Arquivos</h2><div class="stack" style="gap:10px">
        ${!ME ? `<p>${j.filesCount} ${j.filesCount === 1 ? "arquivo anexado" : "arquivos anexados"}. <button class="link-btn" data-act="login-then" data-next="vaga-${j.id}">Entre para ver</button></p>`
          : j.files.length ? `<ul class="files">${j.files.map(f => fileRow(f, owner, j.id)).join("")}</ul>` : `<p class="muted">Nenhum arquivo anexado.</p>`}
        ${owner && j.files.length < 6 ? `<div><label class="btn sm" for="jFiles">Anexar arquivos</label><input type="file" id="jFiles" data-job="${j.id}" multiple accept="${FILE_ACCEPT}" class="sr-only"></div>
          <span class="hint">Até 6 arquivos de 10 MB. Só pessoas com conta na Osmo conseguem abrir.</span>` : ""}
        <div id="jFilesErr" class="err" role="alert" hidden></div></div></section>` : ""}
      ${j.skills.length ? `<section><h2 class="label">Habilidades</h2><div class="row" style="gap:6px">${j.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div></section>` : ""}
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

// PROPOSTA EM 4 PASSOS (o "wizard"): 1) como você faria o trabalho, 2) valor e etapas,
// 3) perguntas para o cliente, 4) revisar e enviar.
// O rascunho é salvo sozinho no navegador enquanto você digita (saveDraft), então dá para
// fechar e voltar depois. calcHTML mostra quanto fica para você depois da taxa.
// msRows desenha as linhas das etapas e avisa se a soma não bate com o total.
/* ---------- proposta guiada ---------- */
const WSTEPS = ["Abordagem", "Valor e etapas", "Perguntas", "Revisar"];
let W: OsmoWizard | null = null, WJOB: OsmoJob | null = null, WFILES: File[] = []; // WFILES: arquivos escolhidos na revisão; sobem logo depois que a proposta é enviada
function wfilesHTML() {
  return `${WFILES.length ? `<ul class="files">${WFILES.map((f, i) => `<li class="file-row"><span class="file-ext" aria-hidden="true">${esc(fileExt(f.name))}</span><span>${esc(f.name)}</span><span class="hint">${fileSize(f.size)}</span>
      <button type="button" class="btn sm ghost" data-act="wfile-del" data-i="${i}" aria-label="Remover ${esc(f.name)}">Remover</button></li>`).join("")}</ul>` : ""}
    ${WFILES.length < 6 ? `<div><label class="btn sm" for="wFiles">Escolher arquivos</label><input type="file" id="wFiles" multiple accept="${FILE_ACCEPT}" class="sr-only"></div>` : ""}
    <div id="wFilesErr" class="err" role="alert" hidden></div>`;
}
function wizDefaults(id?: number | null): OsmoWizard { return Object.assign({ step: 0, text: "", value: "", days: "", qs: "", split: false, ms: [{ title: "", value: "" }] }, store.get("draft-" + id, {})); }
const saveDraft = (() => { let t: number | undefined; return () => { clearTimeout(t); t = setTimeout(() => { store.set("draft-" + WJOB!.id, W); const s = $("#wsaved"); if (s) s.textContent = "Rascunho salvo"; }, 400); }; })();
const msSum = () => W!.ms.reduce((a, m) => a + (Number(m.value) || 0), 0);
V.proposta = async id => {
  if (needLogin("freela")) return;
  const d = await api<OsmoJobResponse>("GET", "/api/jobs/" + id);
  if (d.mine) { toast("Você já enviou proposta para esta vaga."); go("vaga-" + id); return; }
  if (!WJOB || WJOB!.id !== id) { WJOB = d.job; W = wizDefaults(id); WFILES = []; }
  return wizHTML();
};
function wizHTML() {
  const j = WJOB!, w = W!; const v = Number(w.value) || 0, fee = Math.round(v * 0.1);
  const steps = [
    `<div class="stack"><h2>Como você faria este trabalho?</h2>
      <div class="prompt muted">Responda em poucas linhas. Pode usar tópicos.<br>1. O que você entendeu do pedido.<br>2. Como você dividiria em etapas.<br>3. Um trabalho parecido que já fez.</div>
      <div class="field"><label for="wtext">Sua abordagem</label><textarea class="input" id="wtext" rows="8" placeholder="1. Entendi que vocês precisam de…&#10;2. Eu dividiria assim: primeiro…, depois…&#10;3. Já fiz algo parecido para…">${esc(w.text)}</textarea><span class="hint" id="wcount">${words(w.text)} palavras · de 40 a 150 é um bom tamanho</span></div></div>`,
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
      <div class="field"><label for="wqs">Suas perguntas</label><textarea class="input" id="wqs" rows="5" placeholder="Uma pergunta por linha. Use os atalhos acima ou escreva a sua.">${esc(w.qs)}</textarea></div></div>`,
    `<div class="stack"><h2>Revise antes de enviar</h2>
      <div class="panel brief">
        <section><span class="label">Vaga</span><p>${esc(j.title)}</p></section>
        <section><span class="label">Abordagem</span><p style="white-space:pre-wrap">${esc(w.text) || '<span class="muted">Vazio. Volte ao passo 1.</span>'}</p></section>
        <section><span class="label">Valor e prazo</span><p class="mono">${brl(v)} · ${esc(w.days) || "—"} dias úteis</p></section>
        ${w.split ? `<section><span class="label">Etapas</span><ul>${w.ms.map(m => `<li>${esc(m.title || "Sem nome")}: <span class="mono">${brl(m.value)}</span></li>`).join("")}</ul></section>` : ""}
        <section><span class="label">Arquivos (opcional)</span><div class="stack" style="gap:10px"><p class="hint">Trabalhos parecidos, um orçamento detalhado, um esboço. Até 6 arquivos de 10 MB. Só o cliente desta vaga consegue abrir.</p>
          <div class="stack" style="gap:10px" id="wFilesBox">${wfilesHTML()}</div></div></section>
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
const calcHTML = (v: number, fee: number) => `<span>Valor da proposta</span><b class="mono">${brl(v)}</b><span>Taxa Osmo (10%)</span><span class="mono">− ${brl(fee)}</span><span class="tot">Você recebe</span><b class="mono tot">${brl(v - fee)}</b>`;
function msRows() {
  const diff = (Number(W!.value) || 0) - msSum();
  return W!.ms.map((m, i) => `<div class="msrow"><input class="input" data-ms="${i}" data-k="title" value="${esc(m.title)}" placeholder="Etapa ${i + 1}" aria-label="Nome da etapa ${i + 1}"><input class="input mono" data-ms="${i}" data-k="value" inputmode="numeric" value="${esc(m.value)}" placeholder="R$" aria-label="Valor da etapa ${i + 1}"><button class="icon-btn" type="button" data-act="ms-del" data-i="${i}" aria-label="Remover etapa ${i + 1}" ${W!.ms.length < 2 ? "disabled" : ""}>×</button></div>`).join("")
    + `<div class="row" style="justify-content:space-between"><button class="btn sm" type="button" data-act="ms-add" ${W!.ms.length >= 8 ? "disabled" : ""}>+ Adicionar etapa</button><span class="hint" id="msDiff">${diff === 0 ? "As etapas somam o valor total." : diff > 0 ? `Faltam ${brl(diff)} para fechar o total.` : `As etapas passam ${brl(-diff)} do total.`}</span></div>`;
}

// AVALIAÇÕES: estrelas, as etiquetas mais citadas e o formulário de avaliar no fim do contrato.
/* ---------- avaliações ---------- */
const RATE_WORDS = ["", "Ruim", "Fraco", "Ok", "Bom", "Excelente"];
const stars = (avg: number, n: number) => n ? `<span class="stars" title="Nota média ${dec(avg)} de 5, ${n} ${n === 1 ? "avaliação" : "avaliações"}"><span aria-hidden="true">★</span> <b class="mono">${dec(avg)}</b> <span class="muted">(${n})</span></span>` : "";
const tagSummary = (r: OsmoRating) => r.tags.length ? `<div class="row" style="gap:6px">${r.tags.slice(0, 4).map(t => `<span class="chip accent">${esc(t.tag)} · ${t.n}</span>`).join("")}</div>` : "";
function reviewList(list: OsmoReview[]) {
  return list.map(r => `<div class="review"><div class="row" style="justify-content:space-between"><b>${esc(r.author)}</b><span class="stars" aria-label="Nota ${r.rating} de 5">${"★".repeat(r.rating)}<span class="off">${"★".repeat(5 - r.rating)}</span></span></div>
    <p class="hint">${esc(r.job)} · ${when(r.created_at)}</p>${r.tags.length ? `<div class="row" style="gap:6px">${r.tags.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
    ${r.comment ? `<p style="white-space:pre-wrap">${esc(r.comment)}</p>` : ""}</div>`).join("");
}
function reviewBox(c: OsmoContract) {
  const isF = ME!.id === c.freela_id, other = isF ? c.client_name : c.freela_name, r = c.review;
  if (r.mine) return `<div class="ms-review"><p class="hint">Você avaliou com <b>${r.mine} de 5</b>. ${r.theirs ? "As duas avaliações já estão publicadas." : `Ela aparece quando ${esc(other.split(" ")[0])} avaliar também, ou em 14 dias.`}</p></div>`;
  return `<form class="ms-review stack review-form" data-contract="${c.id}" style="gap:12px">
    <div><b>Como foi trabalhar com ${esc(other)}?</b><p class="hint">${r.theirs ? `${esc(other.split(" ")[0])} já avaliou. ` : ""}Sua avaliação só fica visível quando os dois avaliarem, ou em 14 dias.</p></div>
    <div class="rate" role="radiogroup" aria-label="Nota">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}" required><span><b>${n}</b>${RATE_WORDS[n]}</span></label>`).join("")}</div>
    <div class="field"><span class="flabel">Destaques (opcional)</span><div class="row" style="gap:8px">${r.tags.map(t => `<label class="check chip-check"><input type="checkbox" name="tags" value="${esc(t)}"><span>${esc(t)}</span></label>`).join("")}</div></div>
    <div class="field"><label for="rc-${c.id}">Comentário (opcional)</label><textarea class="input" id="rc-${c.id}" name="comment" rows="3" maxlength="600" placeholder="O que funcionou bem? O que outra pessoa deveria saber antes de trabalhar junto?"></textarea></div>
    <div class="err" role="alert" hidden></div>
    <div><button class="btn hl" type="submit">Enviar avaliação</button></div></form>`;
}

// TALENTOS: a lista de freelas com busca e a página de perfil público de cada um (foto, selo,
// habilidades, "como eu trabalho melhor", portfólio, avaliações e botão de conversar/convidar).
/* ---------- talentos ---------- */
function talentCard(t: OsmoTalent) {
  return `<a class="talent" href="/talentos/${t.id}" data-go="talento-${t.id}">
    <div class="row">${av(t.name, t.id, "", t.avatar)}<div style="min-width:0"><h3>${esc(t.name)}${vbadge(t.verified)}</h3><p class="muted" style="font-size:.9rem">${esc(t.title || "Perfil em construção")}</p></div></div>
    ${t.tag ? `<div class="row" style="gap:6px"><span class="chip plum">${esc(t.tag)}</span></div>` : ""}
    <div class="row" style="justify-content:space-between"><span class="mono">${t.rate ? `<b>${brl(t.rate)}</b>/h` : "Valor a combinar"}</span><span class="row" style="gap:10px">${stars(t.rating.avg, t.rating.n)}<span class="mono">${t.done} ${t.done === 1 ? "trabalho concluído" : "trabalhos concluídos"}</span></span></div>
    ${t.skills.length ? `<div class="row" style="gap:6px">${t.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}
  </a>`;
}
function paginationHTML(path: string, pagination: OsmoPagination | undefined, query = new URLSearchParams()) {
  if (!pagination || pagination.pages <= 1) return "";
  const href = (page: number) => { const p = new URLSearchParams(query); p.set("page", String(page)); return esc(path + "?" + p.toString()); };
  return `<nav class="pagination row" aria-label="Paginação">${pagination.page > 1 ? `<a class="btn" href="${href(pagination.page - 1)}" rel="prev">Anterior</a>` : ""}<span class="muted">Página ${pagination.page} de ${pagination.pages}</span>${pagination.page < pagination.pages ? `<a class="btn" href="${href(pagination.page + 1)}" rel="next">Próxima</a>` : ""}</nav>`;
}
async function talentsHTML(q?: string) {
  const params = new URLSearchParams({ q: q || "", page: String(S.tpage || 1) });
  const { talents, pagination } = await api<OsmoTalentsResponse>("GET", "/api/talents?" + params);
  return (talents.length ? talents.map(talentCard).join("") : emptyBox("Nenhum talento encontrado.", "Tente outra habilidade.")) + paginationHTML("/talentos", pagination, params);
}
V.talentos = async () => `
<div class="listhead" style="margin-bottom:20px"><div><h1>Talentos</h1><p class="muted">Cada perfil mostra como a pessoa trabalha melhor. Leia antes de convidar.</p></div>
  <div class="field" style="min-width:240px"><label for="tq" class="hint">Buscar talento</label><input class="input" id="tq" placeholder="Habilidade ou nome" value="${esc(S.tq || "")}"></div></div>
<div class="tgrid" id="tgrid">${await talentsHTML(S.tq)}</div>`;

// TOP 10: os 10 filmes e as 10 séries do momento (dados do TMDB, pedidos pelo nosso servidor).
// Duas listas: "Em alta na semana" e "Mais bem avaliados". Cada linha anda para os lados;
// na TV, as setas passam de cartaz em cartaz e o cartaz com foco cresce um pouco.
// Sem cartaz, aparece o símbolo da Osmo (o mesmo desenho do logo do topo, recortado no "O").
/* ---------- top 10 ---------- */
const TOP10_TABS = [["em-alta", "Em alta", "O que mais se viu nesta semana"], ["melhores", "Mais bem avaliados", "As melhores notas de todos os tempos"]];
const osmoMark = () => { const d = $(".brand svg path"); return d ? `<svg class="t10-mark" viewBox="0 0 30 30" aria-hidden="true"><path d="${esc(d.getAttribute("d"))}"/></svg>` : ""; };
function top10Row(title: string, items: OsmoTopItem[]) {
  return `<section class="t10-sec" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
  <ol class="t10-row">${items.map(x => `<li><article class="t10-card" tabindex="0" aria-label="${x.rank}º lugar: ${esc(x.title)}${x.year ? ", " + esc(x.year) : ""}, nota ${x.rating.toFixed(1)}">
    <div class="t10-art"><span class="t10-rank" aria-hidden="true">${x.rank}</span>
    <div class="t10-poster">${x.poster ? `<img src="${esc(x.poster)}" alt="" loading="lazy" width="342" height="513">` : osmoMark()}</div></div>
    <div class="t10-info"><b>${esc(x.title)}</b><span class="muted">${esc(x.year)}${x.year ? " · " : ""}<span class="t10-star" aria-hidden="true">★</span> ${x.rating.toFixed(1)}</span></div>
  </article></li>`).join("")}</ol></section>`;
}
V.top10 = async () => {
  const lista = S.top10 || "em-alta";
  let d;
  try { d = await api<OsmoTopResponse>("GET", "/api/top10?lista=" + lista); }
  catch (e) { return `<div class="t10">${top10Head(lista)}${emptyBox(errorStatus(e) === 503 ? "O Top 10 ainda não está ligado." : "Não deu para carregar o Top 10.", errorStatus(e) === 503 ? "Falta colocar a chave do TMDB (TMDB_TOKEN) no .env do servidor." : errorMessage(e))}</div>`; }
  const when = new Date(d.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `<div class="t10">${top10Head(lista)}
    ${top10Row("Filmes", d.filmes)}${top10Row("Séries", d.series)}
    <p class="t10-credit muted">Atualizado em ${esc(when)}. Dados e cartazes do <a href="https://www.themoviedb.org" rel="noopener">TMDB</a>. Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p></div>`;
};
const top10Head = (lista: string) => `<header class="t10-head"><span class="label">Filmes e séries · ${esc((TOP10_TABS.find(t => t[0] === lista) || TOP10_TABS[0])[2])}</span><h1>Top 10</h1>
  <div class="seg" role="group" aria-label="Qual lista">${TOP10_TABS.map(([k, n]) => `<button type="button" data-top10="${k}" aria-pressed="${lista === k}">${n}</button>`).join("")}</div></header>`;
document.addEventListener("click", e => { const target = eventElement(e); if (!target) return;
  const b = target.closest<HTMLElement>("[data-top10]"); if (!b || b.getAttribute("aria-pressed") === "true") return;
  S.top10 = b.dataset.top10; route().then(() => { const n = $(`[data-top10="${S.top10}"]`); if (n && DEVICE === "tv") n.focus({ preventScroll: true }); });
});

V.talento = async id => {
  const { talent: t } = await api<{ talent: OsmoTalent }>("GET", "/api/talents/" + id);
  currentPublicProfileIndexable = !!t.searchVisible && !!(t.title || "").trim() && (t.bio || "").trim().length >= 40;
  let myJobs: OsmoJob[] = [];
  if (ME && ME!.role === "cliente") myJobs = (await api<OsmoJobsResponse>("GET", "/api/me/jobs")).jobs.filter(j => j.status === "aberta");
  const self = ME && ME!.id === t.id;
  const has = t.how.com || t.how.resp || t.how.fb || t.how.foco;
  return `<button class="back" data-go="talentos">← Voltar para talentos</button>
<div class="detail">
  <article class="stack">
    <div class="prof-head">${av(t.name, t.id, "lg", t.avatar)}
      <div class="stack" style="gap:6px"><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${esc(t.name)}${vbadge(t.verified)}</h1><p class="muted">${esc(t.title || "Perfil em construção")}${t.location ? " · " + esc(t.location) : ""}</p>${t.tag ? `<div class="row"><span class="chip plum">${esc(t.tag)}</span></div>` : ""}</div></div>
    ${t.bio ? `<p style="max-width:65ch; white-space:pre-wrap" translate="no">${esc(t.bio)}</p>` : ""}
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
      ${!ME ? `<button class="btn hl" data-act="login-then" data-next="talento-${t.id}">Entrar para enviar mensagem</button>` : ""}
      ${ME && !self ? (ME!.role === "cliente"
        ? (myJobs.length ? `<div class="field"><label for="invJob">Convidar para a vaga</label><select class="input" id="invJob">${myJobs.map(j => `<option value="${j.id}">${esc(j.title)}</option>`).join("")}</select></div>
          <button class="btn hl" data-act="invite" data-id="${t.id}">Enviar convite</button><button class="btn" data-act="chat" data-with="${t.id}">Enviar mensagem</button>`
          : `<button class="btn hl" data-act="chat" data-with="${t.id}">Enviar mensagem</button><p class="hint">Publique uma vaga se quiser enviar um convite formal.</p>`)
        : `<button class="btn hl" data-act="chat" data-with="${t.id}">Enviar mensagem</button><button type="button" class="btn sm ghost role-sub" data-act="switch-role" data-role="cliente" data-back="talento-${t.id}"><span class="mm-role-ico" aria-hidden="true"><span class="role-anim"><svg class="ico-static" viewBox="0 0 24 24">${ICONS.shuffle}</svg></span></span><span class="role-sub-txt">Trocar para Cliente<br>para convidar para uma vaga</span></button>`) : ""}
    </div>
    ${t.skills.length ? `<div class="panel side-extra"><span class="label">Habilidades</span><div class="row" style="gap:6px; margin-top:10px">${t.skills.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div></div>` : ""}
  </aside>
</div>`;
};

// SQUADS: os "círculos" do Google+ para montar equipes. Em cima ficam as pessoas (seus contatos ou
// o resultado da busca); embaixo, um círculo para cada squad, com as fotos de quem está dentro em
// volta da borda. Para colocar alguém num squad:
//   - no computador: arraste a pessoa (ou várias já marcadas) até o círculo;
//   - no celular ou no teclado: toque nas pessoas para marcar e depois toque no círculo.
// Soltar no círculo tracejado "Novo squad" cria o squad já com essas pessoas dentro.
// Tocar num círculo sem ninguém marcado abre os detalhes: nome, cor, quem está e o botão de apagar.
/* ---------- squads ---------- */
let SQ: { data: OsmoSquadsResponse | null; sel: Set<number>; open: number | null; q: string; found: OsmoPerson[] | null; creating: boolean; bump: number | string | null } = { data: null, sel: new Set(), open: null, q: "", found: null, creating: false, bump: null };
const SQ_COLORS = ["Vinho", "Ameixa", "Mostarda", "Coral", "Verde", "Laranja"];
// sem busca: primeiro seus contatos, depois os outros talentos da plataforma (sem repetir ninguém)
const sqPeopleList = () => { const seen = new Set(), base = SQ.q ? SQ.found || [] : [...SQ.data!.contacts, ...(SQ.found || [])];
  return base.filter(p => p.id !== ME!.id && !seen.has(p.id) && seen.add(p.id)); };
const sqCount = (id: number) => SQ.data!.squads.filter(s => s.members.some(m => m.id === id)).length;
const sqPeopleOf = (ids: number[]) => ids.map(id => sqPeopleList().find(p => p.id === id) || SQ.data!.squads.flatMap(s => s.members).find(p => p.id === id)).filter(Boolean);
function sqPeopleHTML() {
  const list = sqPeopleList();
  const head = SQ.q ? `Resultado da busca` : SQ.data!.contacts.length ? "Seus contatos e talentos da Osmo" : "Talentos na Osmo";
  const n = SQ.sel.size;
  return `<div class="row" style="justify-content:space-between"><h3>${head}</h3>
    <span class="row" style="gap:8px"><span class="hint" aria-live="polite">${n ? `${n} ${n === 1 ? "pessoa marcada" : "pessoas marcadas"}: toque num círculo ou arraste até ele` : "Toque para marcar ou arraste até um círculo"}</span>
    ${n ? `<button class="btn sm ghost" data-sq="clear">Desmarcar</button>` : ""}</span></div>
  ${list.length ? `<div class="sq-people">${list.map(p => { const c = sqCount(p.id), on = SQ.sel.has(p.id);
    return `<button class="sq-person ${on ? "on" : ""}" draggable="true" data-sq-person="${p.id}" aria-pressed="${on}">
      ${av(p.name, p.id, "sm", p.avatar)}<span class="tx"><b translate="no">${esc(p.name)}${vbadge(p.verified)}</b><small>${esc(p.title || "Perfil em construção")}</small></span>
      ${c ? `<span class="sq-in" title="Está em ${c} ${c === 1 ? "squad seu" : "squads seus"}">${c}</span>` : ""}</button>`; }).join("")}</div>`
    : emptyBox(SQ.q ? "Ninguém encontrado." : "Ainda não há ninguém por aqui.", SQ.q ? "Tente outro nome ou habilidade." : "Busque talentos pelo campo acima.")}`;
}
// as fotos em volta do círculo: até 10, espalhadas igualmente pela borda (a conta é um relógio: 360° divididos por quantas fotos)
function sqRing(s: OsmoSquad) {
  const show = s.members.slice(0, 10), k = Math.max(show.length, 1);
  return show.map((m, i) => `<span class="sq-dot" style="--a:${-90 + i * 360 / k}deg">${av(m.name, m.id, "xs", m.avatar)}</span>`).join("");
}
function sqCirclesHTML() {
  const n = SQ.sel.size, cta = n ? `Adicionar ${n === 1 ? "a pessoa marcada" : `as ${n} pessoas marcadas`}` : "";
  const circles = SQ.data!.squads.map(s => `<div class="sq-cell"><div class="sq-circle sq-c${s.color} ${SQ.open === s.id ? "open" : ""} ${SQ.bump === s.id ? "bump" : ""}" data-sq-drop="${s.id}">
      <button class="sq-ring" data-sq-hit="${s.id}" aria-label="${esc(s.name)}, ${s.members.length} ${s.members.length === 1 ? "pessoa" : "pessoas"}. ${n ? cta + " a este squad" : "Abrir detalhes"}" aria-expanded="${SQ.open === s.id}">
        ${sqRing(s)}<span class="sq-mid"><b translate="no">${esc(s.name)}</b><span class="mono">${s.members.length}</span>${n ? `<small>+ ${n}</small>` : ""}</span></button></div></div>`).join("");
  const add = SQ.creating ? `<form class="sq-new-form" id="sqNewForm"><label for="sqNewName" class="hint">Nome do squad${n ? ` (entram ${n} ${n === 1 ? "pessoa" : "pessoas"})` : ""}</label>
      <input class="input" id="sqNewName" maxlength="40" placeholder="Ex.: Identidade visual" required><div class="row" style="gap:6px"><button class="btn sm hl">Criar</button><button type="button" class="btn sm ghost" data-sq="cancel-new">Cancelar</button></div></form>`
    : `<button class="sq-ring" data-sq-hit="new" aria-label="Novo squad${n ? ", com as pessoas marcadas" : ""}"><span class="sq-mid"><b aria-hidden="true">+</b><span>Novo squad</span></span></button>`;
  return `<div class="sq-circles">${circles}<div class="sq-cell"><div class="sq-circle sq-newc" data-sq-drop="new">${add}</div></div></div>`;
}
function sqDetailHTML() {
  const s = SQ.data!.squads.find(x => x.id === SQ.open); if (!s) return "";
  return `<div class="panel stack sq-detail sq-c${s.color}" style="gap:14px">
    <div class="row" style="justify-content:space-between; align-items:flex-end; gap:12px">
      <div class="field" style="flex:1; min-width:200px"><label for="sqName">Nome do squad</label><input class="input" id="sqName" maxlength="40" value="${esc(s.name)}" translate="no" data-sq-rename="${s.id}"></div>
      <button class="btn sm ghost" data-sq="close">Fechar</button></div>
    <div class="field"><span class="flabel" id="sqColorL">Cor</span><div class="row" role="radiogroup" aria-labelledby="sqColorL" style="gap:8px">
      ${SQ_COLORS.map((c, i) => `<button class="sq-swatch sq-c${i}" role="radio" aria-checked="${s.color === i}" aria-label="${c}" data-sq-color="${i}"></button>`).join("")}</div></div>
    <div class="stack" style="gap:8px"><span class="flabel">Quem está no squad (${s.members.length})</span>
      ${s.members.length ? `<ul class="sq-members">${s.members.map(m => `<li>${av(m.name, m.id, "sm", m.avatar)}<a href="${url("talento-" + m.id)}" class="tx"><b translate="no">${esc(m.name)}${vbadge(m.verified)}</b><small>${esc(m.title || "")}</small></a>
        <button class="btn sm ghost" data-sq-remove="${m.id}" aria-label="Tirar ${esc(m.name)} do squad">Tirar</button></li>`).join("")}</ul>`
        : `<p class="hint">Ninguém ainda. Marque pessoas lá em cima e toque no círculo, ou arraste até ele.</p>`}</div>
    <div><button class="btn sm ghost danger" data-sq="delete">Apagar squad</button></div></div>`;
}
const sqMemberOfHTML = () => SQ.data!.memberOf.length ? `<section class="stack" style="gap:12px"><h3>Squads em que você está</h3>
  <ul class="sq-members">${SQ.data!.memberOf.map(s => `<li><span class="sq-swatch sq-c${s.color}" aria-hidden="true"></span><span class="tx"><b translate="no">${esc(s.name)}</b><small>Squad de <span translate="no">${esc(s.owner)}</span></small></span>
    <button class="btn sm ghost" data-sq-leave="${s.id}">Sair</button></li>`).join("")}</ul></section>` : "";
function sqRender(only?: string[]) {
  const put = (id: string, html: string) => { const el = $("#" + id); if (el) el.innerHTML = html; };
  if (!only || only.includes("people")) put("sqPeople", sqPeopleHTML());
  if (!only || only.includes("circles")) put("sqCircles", sqCirclesHTML());
  if (!only || only.includes("detail")) put("sqDetail", sqDetailHTML());
  if (!only || only.includes("member")) put("sqMemberOf", sqMemberOfHTML());
  TR.flush();
}
async function sqReload(only?: string[]) { SQ.data = await api<OsmoSquadsResponse>("GET", "/api/squads"); sqRender(only); }
const toPerson = (t: OsmoTalent) => ({ id: t.id, name: t.name, title: t.title, avatar: t.avatar, verified: t.verified });
async function sqSearch(q: string) {
  SQ.q = q; // busca vazia volta para contatos + talentos
  const { talents } = await api<OsmoTalentsResponse>("GET", "/api/talents?q=" + encodeURIComponent(q));
  if (SQ.q !== q) return; // chegou resposta de uma busca antiga
  SQ.found = talents.slice(0, 40).map(toPerson);
  sqRender(["people"]);
}
// coloca gente no squad (ou cria um squad novo com elas) e faz o círculo "pular", como no Google+
async function sqAdd(target: number | string, ids: number[], name?: string) {
  if (target === "new") { const r = await api<{ id: number }>("POST", "/api/squads", { name }); target = r.id; SQ.creating = false; }
  if (ids.length) await api("POST", `/api/squads/${target}/members`, { user_ids: ids });
  SQ.sel.clear(); SQ.bump = target;
  await sqReload();
  const s = SQ.data!.squads.find(x => x.id === target);
  if (s) toast(ids.length ? `${ids.length === 1 ? sqPeopleOf(ids)[0]?.name || "1 pessoa" : ids.length + " pessoas"} no squad ${s.name}` : `Squad ${s.name} criado`);
  setTimeout(() => { SQ.bump = null; $$(".sq-circle.bump").forEach(c => c.classList.remove("bump")); }, 700);
}
V.squads = async () => {
  if (needLogin()) return;
  SQ.data = await api<OsmoSquadsResponse>("GET", "/api/squads");
  SQ.sel.clear(); SQ.creating = false;
  if (SQ.open && !SQ.data!.squads.some(s => s.id === SQ.open)) SQ.open = null;
  SQ.found = (await api<OsmoTalentsResponse>("GET", "/api/talents?q=" + encodeURIComponent(SQ.q))).talents.slice(0, 40).map(toPerson);
  return `<div id="sq" class="stack" style="gap:24px">
  <div class="listhead"><div><h1>Squads</h1><p class="muted">Junte pessoas em círculos para montar equipes. Arraste alguém até um círculo, ou toque na pessoa e depois no círculo. Só você vê os seus squads.</p></div>
    <div class="field" style="min-width:240px"><label for="sqq" class="hint">Buscar pessoas</label><input class="input" id="sqq" placeholder="Nome ou habilidade" value="${esc(SQ.q)}" autocomplete="off"></div></div>
  <section class="panel stack" id="sqPeople" style="gap:14px">${sqPeopleHTML()}</section>
  <section class="stack" style="gap:12px"><h3>Seus squads</h3><div id="sqCircles">${sqCirclesHTML()}</div></section>
  <div id="sqDetail">${sqDetailHTML()}</div>
  <div id="sqMemberOf">${sqMemberOfHTML()}</div>
</div>`;
};
// os eventos dos squads ficam num lugar só (vale para qualquer coisa dentro de #sq, mesmo depois de redesenhar)
(() => {
  const inSq = (e: Event) => eventElement(e)?.closest<HTMLElement>("#sq");
  const fail = (err: unknown) => toast(errorMessage(err));
  let dragIds: number[] | null = null;
  document.addEventListener("click", async e => { const target = eventElement(e); if (!target) return;
    if (!inSq(e)) return;
    const t = target;
    const p = t.closest<HTMLElement>("[data-sq-person]");
    if (p) { const id = Number(p.dataset.sqPerson); SQ.sel.has(id) ? SQ.sel.delete(id) : SQ.sel.add(id); sqRender(["people", "circles"]);
      const b = $(`[data-sq-person="${id}"]`); if (b) b.focus(); return; }
    const hit = t.closest<HTMLElement>("[data-sq-hit]");
    if (hit) {
      const k = hit.dataset.sqHit;
      if (k === "new") { SQ.creating = true; sqRender(["circles"]); const i = $("#sqNewName"); if (i) i.focus(); return; }
      const id = Number(k);
      if (SQ.sel.size) return sqAdd(id, [...SQ.sel]).catch(fail);
      SQ.open = SQ.open === id ? null : id; sqRender(["circles", "detail"]);
      if (SQ.open) $("#sqDetail").scrollIntoView({ block: "nearest", behavior: calmMotion() ? "auto" : "smooth" });
      return;
    }
    const sw = t.closest<HTMLElement>("[data-sq-color]");
    if (sw) { const color = Number(sw.dataset.sqColor); try { await api("PUT", "/api/squads/" + SQ.open, { color }); await sqReload(["circles", "detail", "member"]); $(`[data-sq-color="${color}"]`)?.focus(); } catch (err) { fail(err); } return; }
    const rm = t.closest<HTMLElement>("[data-sq-remove]");
    if (rm) { try { await api("DELETE", `/api/squads/${SQ.open}/members/${rm.dataset.sqRemove}`); await sqReload(); toast("Pessoa tirada do squad"); } catch (err) { fail(err); } return; }
    const lv = t.closest<HTMLElement>("[data-sq-leave]");
    if (lv) { if (!await confirmSheet({ title: "Sair deste squad?", text: "A pessoa que criou o squad pode te colocar de novo depois.", ok: "Sair" })) return;
      try { await api("DELETE", `/api/squads/${lv.dataset.sqLeave}/leave`); await sqReload(); toast("Você saiu do squad"); } catch (err) { fail(err); } return; }
    const a = t.closest<HTMLElement>("[data-sq]"); if (!a) return;
    switch (a.dataset.sq) {
      case "clear": SQ.sel.clear(); return sqRender(["people", "circles"]);
      case "cancel-new": SQ.creating = false; return sqRender(["circles"]);
      case "close": SQ.open = null; return sqRender(["circles", "detail"]);
      case "delete": {
        const s = SQ.data!.squads.find(x => x.id === SQ.open); if (!s) return;
        if (!await confirmSheet({ title: `Apagar o squad ${s.name}?`, text: "As pessoas não são avisadas e continuam na plataforma. Só o círculo some.", ok: "Apagar" })) return;
        try { await api("DELETE", "/api/squads/" + s.id); SQ.open = null; await sqReload(); toast("Squad apagado"); } catch (err) { fail(err); }
      }
    }
  });
  document.addEventListener("submit", e => { const target = eventForm(e); if (!target) return;
    if (target.id !== "sqNewForm") return;
    e.preventDefault();
    const name = $("#sqNewName").value.trim(); if (!name) return;
    sqAdd("new", [...SQ.sel], name).catch(fail);
  });
  // renomear: salva quando a pessoa sai do campo ou aperta Enter
  document.addEventListener("change", async e => { const target = eventInput(e); if (!target) return;
    const el = target.closest && target.closest<HTMLInputElement>("[data-sq-rename]"); if (!el) return;
    try { await api("PUT", "/api/squads/" + el.dataset.sqRename, { name: el.value }); await sqReload(["circles", "member"]); toast("Nome salvo"); } catch (err) { fail(err); }
  });
  let qt: number | undefined;
  document.addEventListener("input", e => { const target = eventInput(e); if (!target) return;
    if (target.id !== "sqq") return;
    clearTimeout(qt); const q = target.value.trim();
    qt = setTimeout(() => sqSearch(q).catch(fail), 250);
  });
  // ARRASTAR: pegar uma pessoa marcada leva junto todas as marcadas; pegar uma desmarcada leva só ela
  document.addEventListener("dragstart", e => { const target = eventElement(e); if (!target) return;
    const p = target.closest && target.closest<HTMLElement>("#sq [data-sq-person]"); if (!p) return;
    const id = Number(p.dataset.sqPerson);
    dragIds = SQ.sel.has(id) ? [...SQ.sel] : [id];
    e.dataTransfer!.effectAllowed = "copy"; e.dataTransfer!.setData("text/plain", dragIds.join(","));
    if (dragIds.length > 1) { const g = document.createElement("div"); g.className = "sq-ghost"; g.textContent = `${dragIds.length} pessoas`; document.body.appendChild(g); e.dataTransfer!.setDragImage(g, 20, 20); setTimeout(() => g.remove()); }
    $("#sq").classList.add("dragging");
  });
  document.addEventListener("dragend", () => { dragIds = null; $("#sq")?.classList.remove("dragging"); $$(".sq-circle.over").forEach(c => c.classList.remove("over")); });
  document.addEventListener("dragover", e => { const target = eventElement(e); if (!target) return;
    const c = dragIds && target.closest && target.closest<HTMLElement>("#sq [data-sq-drop]"); if (!c) return;
    e.preventDefault(); e.dataTransfer!.dropEffect = "copy";
    $$(".sq-circle.over").forEach(x => x !== c && x.classList.remove("over")); c.classList.add("over");
  });
  document.addEventListener("dragleave", e => { const target = eventElement(e); if (!target) return; const c = target.closest && target.closest<HTMLElement>("#sq [data-sq-drop]"); if (c && !c.contains(e.relatedTarget as Node | null)) c.classList.remove("over"); });
  document.addEventListener("drop", e => { const target = eventElement(e); if (!target) return;
    const c = dragIds && target.closest && target.closest<HTMLElement>("#sq [data-sq-drop]"); if (!c) return;
    e.preventDefault(); c.classList.remove("over");
    const ids = dragIds!; dragIds = null;
    if (c.dataset.sqDrop === "new") { SQ.sel = new Set(ids); SQ.creating = true; sqRender(["people", "circles"]); $("#sqNewName")?.focus(); return; }
    sqAdd(Number(c.dataset.sqDrop), ids).catch(fail);
  });
})();

// MENSAGENS: à esquerda a lista de conversas, à direita a conversa aberta. Enquanto a conversa
// está aberta, o garçom pergunta ao servidor de tempos em tempos se chegou mensagem nova.
// No celular a conversa ocupa a tela inteira e acompanha o teclado (syncViewport), para a caixa
// de digitar nunca ficar escondida atrás dele. Se chega mensagem enquanto você lê lá em cima,
// aparece o botão "mensagens novas" em vez de pular a tela sozinha.
/* ---------- mensagens ---------- */
let TH: OsmoThreadResponse | null = null;
V.mensagens = async id => {
  if (needLogin()) return;
  const { threads } = await api<{ threads: OsmoThreadSummary[] }>("GET", "/api/threads");
  // contratante (cliente) tem um canal direto com a Osmo; o admin abre as conversas pela área do admin
  const canSupport = ME!.role === "cliente" && !ME!.isAdmin;
  const head = `<div class="row" style="justify-content:space-between; align-items:center; margin-bottom:18px"><h1>Mensagens</h1>${canSupport ? `<button class="btn sm" data-act="support">Falar com a Osmo</button>` : ""}</div>`;
  if (!threads.length) return head + emptyBox("Nenhuma conversa ainda.", "As conversas começam quando alguém envia uma proposta, um convite ou uma mensagem direta.", "vagas", "Ver vagas");
  const openId = id || (isMobile() ? null : threads[0].id);
  TH = openId ? await api<OsmoThreadResponse>("GET", "/api/threads/" + openId) : null;
  if (openId) { const t = threads.find(x => x.id === openId); if (t) t.unread = 0; refreshMe(); }
  return `${head}
<div class="msgs ${openId ? "show-convo" : ""}">
  <div class="threads" role="list">${threads.map(t => `<button class="thread" role="listitem" data-go="mensagens-${t.id}" aria-current="${t.id === openId}">${av(t.with, t.withId, "sm", t.withAvatar)}<div class="tx"><b>${esc(t.with)}${vbadge(t.withVerified)}${t.unread ? `<span class="badge">${t.unread}</span>` : ""}</b><p>${esc(t.job)}</p><p>${esc(t.last)}</p></div></button>`).join("")}</div>
  <div class="convo">${TH ? convoHTML() : ""}</div>
</div>`;
};
const OSMO_SYMBOL_SVG = `<span class="sys-mark" aria-hidden="true"><svg viewBox="0 0 30 30"><path fill="currentColor" d="M15.12,10.53c-2.49,0-4.5,2.02-4.5,4.5s2.02,4.5,4.5,4.5,4.5-2.02,4.5-4.5-2.02-4.5-4.5-4.5ZM25.84,4.36C22.9,1.45,19.32,0,15.09,0S7.29,1.45,4.37,4.36C1.46,7.27,0,10.8,0,14.97s1.46,7.74,4.37,10.66,6.49,4.37,10.72,4.37,7.79-1.46,10.73-4.37c.65-.65,1.22-1.33,1.73-2.04-1.76-2.49-2.65-5.36-2.65-8.62s.89-6.11,2.66-8.59c-.51-.7-1.07-1.38-1.72-2.03ZM21.93,21.94c-1.89,1.92-4.18,2.89-6.86,2.89s-4.96-.96-6.84-2.87c-1.88-1.91-2.82-4.24-2.82-6.99s.94-5.01,2.82-6.93c1.88-1.91,4.16-2.87,6.84-2.87s4.97.96,6.86,2.87c1.89,1.91,2.84,4.22,2.84,6.93s-.95,5.05-2.84,6.97Z"/></svg></span>`;
function sysBubble(m: { body?: string; created_at: string }) {
  const txt = m.body || "";
  const [tone, tag] = /confirmado|aprovada|liberado|aceita! Contrato/i.test(txt) ? ["ok", "Confirmado"]
    : /estornado|contestado|recusada|devolvido/i.test(txt) ? ["err", "Atenção"]
    : /aguardando|entregue|ajustes|checkout aberto/i.test(txt) ? ["wait", "Acompanhamento"]
    : /convidou/i.test(txt) ? ["info", "Convite"]
    : /proposta/i.test(txt) ? ["info", "Proposta"]
    : ["info", "Sistema"];
  return `<div class="bub sys sys-${tone}" role="status">
    <div class="sys-head">${OSMO_SYMBOL_SVG}<span class="sys-brand">Osmo</span><span class="sys-tag">${tag}</span><small>${hm(m.created_at)}</small></div>
    <p class="sys-body">${esc(txt)}</p>
  </div>`;
}
function bubbles() {
  return TH!.messages.map(m => m.system ? sysBubble(m)
    : m.file ? `<div class="bub file ${m.mine ? "me" : ""}"><a class="bub-file" href="/arquivo/a/${m.file.id}" target="_blank" rel="noopener"><span class="file-ext" aria-hidden="true">${esc(m.file.ext)}</span><span class="bf-name" translate="no">${esc(m.file.name)}</span><span class="bf-size">${fileSize(m.file.size)}</span></a><small>${hm(m.created_at)}</small></div>`
    : `<div class="bub ${m.mine ? "me" : ""}"><span translate="no">${esc(m.body)}</span><small>${hm(m.created_at)}</small></div>`).join("");
}
function fitMsgIn(el = $("#msgIn")) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}
document.addEventListener("keydown", e => {
  const t = eventInput(e);
  if (!t || t.id !== "msgIn" || e.key !== "Enter" || e.isComposing) return;
  if (e.shiftKey) return; // Shift+Return (Mac) ou Shift+Enter (PC) quebra para a próxima linha
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    $("#compose")?.requestSubmit();
  }
});
function convoHTML() {
  const t = TH!.thread;
  return `<div class="convo-head"><button class="back only-m" data-go="mensagens" style="margin:0">← Conversas</button>
      <div style="flex:1; min-width:0"><b>${esc(t.with.name)}${vbadge(t.with.role === "freela" && t.with.verified)}</b><p class="hint">${t.support ? "Suporte Osmo · cada mensagem também chega por e-mail" : t.job ? `<a href="${url("vaga-" + (t.job.id))}">${esc(t.job.title)}</a>` : "Conversa direta"}</p></div>
      ${t.with.how && t.with.how.resp ? `<span class="chip accent">${esc(t.with.how.resp)}</span>` : ""}</div>
    ${t.support ? "" : `<div class="pin" id="pinBox"><b>Combinado até agora:</b> <span id="pinText">${esc(t.pin) || "Nada registrado ainda."}</span> <button class="btn sm ghost" data-act="pin-edit" style="padding:2px 8px">Editar</button></div>`}
    <div class="bubbles" id="bubbles" aria-live="polite">${bubbles()}</div>
    <form class="compose" id="compose">
      <button type="button" class="btn sm newmsg" id="newMsg" hidden></button>
      ${t.support ? "" : `<div class="quick">${["Recebi, vou olhar até amanhã.", "Pode me mandar por escrito?", "Preciso de mais 1 dia.", "Entrega enviada, aguardo retorno."].map(q => `<button type="button" data-quick="${esc(q)}">${q}</button>`).join("")}</div>`}
      <div class="row"><label class="btn attach-btn" for="msgFile" title="Anexar arquivo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg><span class="sr-only">Anexar arquivo</span></label><input type="file" id="msgFile" multiple accept="${FILE_ACCEPT}" class="sr-only">
        <textarea class="input msg-in" id="msgIn" rows="1" style="flex:1; min-width:0" placeholder="Escreva sua mensagem" aria-label="Mensagem" maxlength="3000"></textarea><button class="btn primary" type="submit">Enviar</button></div>
    </form>`;
}
// ARQUIVO NA CONVERSA: cada arquivo vira uma mensagem. Depois de enviar, recarrega a conversa
// e desce até o fim, igual a quando se manda um texto.
async function sendMsgFiles(files: File[]) {
  const tid = TH && TH!.thread.id; if (!tid) return;
  const errs = [];
  for (const [i, f] of files.entries()) {
    const e2 = checkFile(f); if (e2) { errs.push(e2); continue; }
    if (files.length > 1) toast(`Enviando ${i + 1} de ${files.length}: ${f.name}`);
    try { await uploadTo(`/api/threads/${tid}/files`, f); } catch (e3) { errs.push(errorMessage(e3)); }
  }
  if (errs.length) toast(errs.join(" "));
  if (!TH || TH!.thread.id !== tid) return;
  TH = await api<OsmoThreadResponse>("GET", "/api/threads/" + tid); const b = $("#bubbles"); if (b) { b.innerHTML = bubbles(); b.scrollTop = b.scrollHeight; }
}
// celular: conversa aberta ocupa a tela toda (cabeçalho, rodapé e barra de navegação somem)
function syncViewport() { // acompanha o teclado: a conversa usa só a parte visível da tela
  const v = window.visualViewport; if (!v) return;
  document.documentElement.style.setProperty("--vvh", v.height + "px");
  document.documentElement.style.setProperty("--vvt", v.offsetTop + "px");
}
if (window.visualViewport) { visualViewport!.addEventListener("resize", syncViewport); visualViewport!.addEventListener("scroll", syncViewport); syncViewport(); }
let NEW_MSGS = 0;
function showNewMsgs(n: number) {
  const b = $("#newMsg"); if (!b) return;
  NEW_MSGS = n; b.hidden = !n; b.textContent = n === 1 ? "1 mensagem nova ↓" : `${n} mensagens novas ↓`;
}
after.mensagens = () => {
  const bb = $("#bubbles"); if (bb) bb.scrollTop = bb.scrollHeight;
  if (!TH) return;
  if (isMobile()) { document.body.classList.add("chat-full"); syncViewport(); if (bb) bb.scrollTop = bb.scrollHeight; }
  showNewMsgs(0);
  if (bb) bb.addEventListener("scroll", () => { if (NEW_MSGS && bb.scrollHeight - bb.scrollTop - bb.clientHeight < 60) showNewMsgs(0); });
  const tid = TH!.thread.id;
  pollTimer = setInterval(async () => {
    if (document.hidden || !TH || TH!.thread.id !== tid) return;
    try {
      const d = await api<OsmoThreadResponse>("GET", "/api/threads/" + tid);
      if (d.messages.length !== TH!.messages.length || d.thread.pin !== TH!.thread.pin) {
        const added = Math.max(0, d.messages.length - TH!.messages.length);
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

// PAINEL: o "quadro de tarefas" de cada contrato. MSTATUS e PAYST traduzem as situações das
// etapas e dos pagamentos. msActions decide QUAL botão aparecer para cada pessoa em cada
// etapa, seguindo as mesmas regras do servidor:
// - cliente com etapa a pagar -> "Pagar etapa";
// - freela com etapa paga (ou sem pagamentos ligados) -> "Começar" -> "Marcar como entregue";
// - cliente com etapa entregue -> "Aprovar e liberar" ou "Pedir ajustes".
// Ao lado: para o freela, a energia da semana e as propostas; para o cliente, as vagas dele.
/* ---------- painel ---------- */
const MSTATUS: Record<string, string[]> = { pendente: ["A seguir", "off", ""], andamento: ["Em andamento", "hi", "now"], entregue: ["Entregue, aguardando aprovação", "wait", "now"], ajustes: ["Ajustes pedidos", "wait", "now"], aprovada: ["Aprovada e paga", "ok", "done"] };
const PAYST: Record<string, string[]> = { a_pagar: ["A pagar", "off"], aguardando: ["Aguardando pagamento", "wait"], pago: ["Pagamento confirmado", "ok"], liberado: ["Liberado", "ok"], estornado: ["Estornado", "off"] };
function msActions(c: OsmoContract, m: OsmoMilestone) {
  const isF = ME!.id === c.freela_id;
  const paid = !PAY.enabled || m.pay_status === "pago" || m.pay_status === "liberado";
  if (PAY.enabled && !isF && m.status !== "aprovada") {
    if (m.pay_status === "a_pagar") return `<button class="btn sm hl" data-act="pay" data-id="${m.id}">Pagar etapa</button>`;
    if (m.pay_status === "aguardando") return `<a class="btn sm hl" href="${esc(m.invoice_url)}" target="_blank" rel="noopener">Abrir cobrança</a><span class="hint">${PAY.provider === "stripe" ? "Cartão ou Pix, se habilitado na conta Stripe." : "Pix, boleto ou cartão."} A confirmação chega aqui sozinha.</span>`;
  }
  if (isF && !paid && m.status === "pendente") return `<span class="hint">Aguardando o cliente pagar esta etapa.</span>`;
  if (isF && (m.status === "pendente" || m.status === "ajustes")) return `<button class="btn sm" data-act="ms" data-a="start" data-id="${m.id}">Começar</button>`;
  if (isF && m.status === "andamento") return `<button class="btn sm hl" data-act="ms" data-a="deliver" data-id="${m.id}">Marcar como entregue</button>`;
  if (!isF && m.status === "entregue") return `<button class="btn sm hl" data-act="ms" data-a="approve" data-id="${m.id}">Aprovar e liberar</button><button class="btn sm" data-act="ms-changes" data-id="${m.id}">Pedir ajustes</button>`;
  return "";
}
// ARQUIVOS DA ETAPA: a entrega em si, referências, correções. Os dois lados anexam enquanto a
// etapa não foi aprovada; quem enviou pode remover, menos depois de entregue (o cliente está
// avaliando aquilo). O freela vê uma dica para anexar antes de marcar como entregue.
function msFiles(c: OsmoContract, m: OsmoMilestone) {
  const open = m.status !== "aprovada", locked = ["entregue", "aprovada"].includes(m.status);
  if (!m.files.length && (!open || c.status === "concluido")) return "";
  const hint = ME!.id === c.freela_id && m.status === "andamento" && !m.files.length ? `<span class="hint">Anexe aqui a entrega antes de marcar como entregue.</span>` : "";
  return `<div class="stack ms-files" style="gap:8px; margin-top:10px">
    ${attList(m.files, locked ? null : f => f.mine ? `/api/milestones/${m.id}/files/${f.id}` : "")}
    ${open && m.files.length < 10 ? `<div class="row" style="gap:10px">${attPicker("msf-" + m.id, `/api/milestones/${m.id}/files`, "msfErr-" + m.id, m.files.length ? "Anexar mais" : "Anexar arquivo")}${hint}</div>` : ""}
    <div id="msfErr-${m.id}" class="err" role="alert" hidden></div></div>`;
}
V.painel = async () => {
  if (needLogin()) return;
  const isF = ME!.role === "freela";
  const [cs, extra] = await Promise.all([api<OsmoContractsResponse>("GET", "/api/contracts"), isF ? api<OsmoMyProposals>("GET", "/api/me/proposals") : api<OsmoJobsResponse>("GET", "/api/me/jobs")]);
  const st = cs.stats;
  const contracts = cs.contracts.length ? cs.contracts.map(c => `<div class="panel">
    <div class="row" style="justify-content:space-between; margin-bottom:6px"><h3>${esc(c.job_title)}</h3><span class="row" style="gap:8px">${RECURSOS.tarefas ? `<a class="btn sm" href="${url("contrato-" + (c.id))}">Tarefas</a>` : ""}${c.status === "concluido" ? `<span class="status off">Concluído</span>` : `<span class="status ok">Ativo</span>`}</span></div>
    <p class="muted" style="margin-bottom:8px">${isF ? "Cliente: " + esc(c.client_name) : "Freelancer: " + esc(c.freela_name)} · <span class="mono">${brl(c.value)}</span> no total · <a href="${url("mensagens-" + (c.thread))}">Abrir conversa</a></p>
    ${c.milestones.map(m => `<div class="ms"><span class="st ${MSTATUS[m.status][2]}"></span><div><b>${esc(m.title)}</b><p class="hint">${MSTATUS[m.status][0]}${PAY.enabled ? " · " + pill(PAYST, m.pay_status) : ""}</p><div class="row" style="margin-top:6px" id="msa-${m.id}">${msActions(c, m)}</div>${msFiles(c, m)}</div><span class="mono">${brl(m.value)}</span></div>`).join("")}
    ${c.status === "concluido" ? reviewBox(c) : ""}
  </div>`).join("") : emptyBox("Nenhum contrato ainda.", isF ? "Quando um cliente aceitar sua proposta, o contrato aparece aqui." : "Quando você aceitar uma proposta, o contrato aparece aqui.");
  let side;
  if ("proposals" in extra) {
    side = `<div class="panel stack" style="gap:12px">
      <div class="row" style="justify-content:space-between"><h3>Como está sua energia esta semana?</h3><span class="hint">Só você vê. Ajusta quantas propostas você pode ter abertas.</span></div>
      <div class="energy" role="group" aria-label="Energia">${[["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]].map(e => `<button data-energy="${e[0]}" aria-pressed="${ME!.energy === e[0]}">${e[1]}</button>`).join("")}</div>
      <p class="hint">Propostas aguardando resposta: <b class="mono">${extra.open} de ${extra.cap}</b>.</p></div>
    <section class="stack" style="gap:12px"><h2>Minhas propostas</h2>${extra.proposals.length ? `<div class="panel stack" style="gap:0">${extra.proposals.map(p => `<div class="ms" style="grid-template-columns:minmax(0,1fr) auto"><div><a href="${url("vaga-" + (p.job_id))}"><b>${esc(p.job_title)}</b></a><p class="hint">${esc(p.client_name)} · ${when(p.created_at)} · <span class="mono">${brl(p.value)}</span></p></div><div class="row">${pill(PSTATUS, p.status)}${p.status === "enviada" ? `<button class="btn sm ghost" data-act="withdraw" data-id="${p.id}">Retirar</button>` : ""}</div></div>`).join("")}</div>` : emptyBox("Você ainda não enviou propostas.", "", "vagas", "Ver vagas abertas")}</section>`;
  } else {
    side = `<section class="stack" style="gap:12px"><div class="row" style="justify-content:space-between"><h2>Minhas vagas</h2><button class="btn sm hl" data-go="publicar">Publicar vaga</button></div>${extra.jobs.length ? `<div class="panel stack" style="gap:0">${extra.jobs.map(j => `<div class="ms" style="grid-template-columns:minmax(0,1fr) auto"><div><a href="${url("vaga-" + (j.id))}"><b>${esc(j.title)}</b></a><p class="hint">${when(j.created_at)} · ${j.proposals} ${j.proposals === 1 ? "proposta" : "propostas"} · ${j.clarity}% claro</p></div>${pill(JSTATUS, j.status)}</div>`).join("")}</div>` : emptyBox("Você ainda não publicou vagas.", "Uma vaga clara recebe propostas mais certeiras.", "publicar", "Publicar a primeira vaga")}</section>`;
  }
  return `<div class="listhead" style="margin-bottom:20px"><div><h1>Painel</h1><p class="muted">O que está em andamento e o que vem a seguir.</p></div></div>
<div class="stats" style="margin-bottom:24px">
  <div class="panel stat"><span class="label">${isF ? "Recebido (líquido)" : "Pago até agora"}</span><b class="mono">${brl(isF ? st.net : st.paid)}</b></div>
  <div class="panel stat"><span class="label">Pago, aguardando repasse</span><b class="mono">${brl(st.held)}</b></div>
  ${st.payments ? `<div class="panel stat"><span class="label">${isF ? "Aguardando pagamento" : "A pagar"}</span><b class="mono">${brl(st.toPay)}</b></div>` : ""}
  <div class="panel stat"><span class="label">Contratos ativos</span><b class="mono">${cs.contracts.filter(c => c.status === "ativo").length}</b></div>
</div>
<div class="stack">${side}<section class="stack" style="gap:12px"><h2>Contratos</h2>${contracts}</section></div>`;
};

// PAINEL DO DONO (#panorama): uma tela que não aparece em nenhum menu. Mostra o panorama da plataforma inteira:
// números gerais, evolução por semana, funil de contratação, dinheiro, o que está parado e as últimas novidades.
// Quem decide quem pode ver é o servidor (admin único, fixado em server.js); para qualquer outra pessoa a página "não existe".
// Enquanto está aberta, se atualiza sozinha a cada minuto.
/* ---------- panorama (painel do dono) ---------- */
const ADM_MS: Record<string, string> = { pendente: "A seguir", andamento: "Em andamento", entregue: "Entregue", ajustes: "Ajustes", aprovada: "Aprovada" };
const num = (n: unknown) => Number(n || 0).toLocaleString(LOC);
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) + "%" : "–";
// barras de uma série por semana, desenhadas à mão em SVG (sem bibliotecas); o texto escondido descreve o gráfico para leitores de tela
function weekBars(title: string, rows: OsmoWeekly[], key: "users" | "jobs" | "contracts" | "value", fmt: (n: number) => string = num) {
  const max = Math.max(1, ...rows.map(r => r[key])), W = 12 * 22, H = 90, total = rows.reduce((a, r) => a + r[key], 0);
  const bars = rows.map((r, i) => { const h = Math.round(r[key] / max * (H - 18)); const last = i === rows.length - 1;
    return `<rect x="${i * 22 + 3}" y="${H - 14 - h}" width="16" height="${Math.max(h, 1)}" rx="3" class="${last ? "adm-bar now" : "adm-bar"}"><title>Semana de ${r.week.slice(8, 10)}/${r.week.slice(5, 7)}: ${fmt(r[key])}</title></rect>`; }).join("");
  const label = (i: number, anchor: string) => `<text x="${i * 22 + 11}" y="${H - 2}" text-anchor="${anchor}" class="adm-axis">${rows[i].week.slice(8, 10)}/${rows[i].week.slice(5, 7)}</text>`;
  const desc = `${title}, últimas 12 semanas: ${rows.map(r => fmt(r[key])).join(", ")}.`;
  return `<div class="panel adm-chart"><div class="row" style="justify-content:space-between"><span class="label">${title}</span><b class="mono">${fmt(rows[rows.length - 1][key])} <span class="hint">nesta semana</span></b></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}" preserveAspectRatio="none">${bars}${label(0, "start")}${label(11, "end")}</svg>
    <span class="hint">${fmt(total)} em 12 semanas</span></div>`;
}
// barras horizontais simples (funil, áreas): o comprimento é a parte de cada linha em relação à maior
function hBars(rows: [string, number, string?][]) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return `<div class="adm-hbars">${rows.map(([name, n, note]) => `<div class="adm-hrow"><span>${esc(name)}</span><span class="adm-htrack"><i style="width:${Math.round(n / max * 100)}%"></i></span><b class="mono">${num(n)}</b>${note ? `<span class="hint">${note}</span>` : "<span></span>"}</div>`).join("")}</div>`;
}
const admList = <T>(title: string, items: T[], row: (item: T) => string, empty: string) => `<div class="panel stack" style="gap:10px"><div class="row" style="justify-content:space-between"><h3>${title}</h3><span class="badge ${items.length ? "" : "off"}">${items.length}</span></div>
  ${items.length ? `<ul class="adm-list">${items.map(row).join("")}</ul>` : `<p class="hint">${empty}</p>`}</div>`;
// ÁREA DO ADMIN: a mesma barra no topo de todas as telas do dono, para pular entre elas
// (Visão geral = /admin, Propostas = /admin/propostas, Dados = /admin/dados, Registro = o que o dono mudou, Projetos internos).
function admNav(active: string) {
  const tabs = [["panorama", "Visão geral"], ["propostas", "Propostas"], ["gestao", "Dados"], ["log", "Registro"], ...(RECURSOS.tarefas ? [["projetos", "Projetos"]] : [])];
  return `<div class="adm-head stack" style="gap:10px"><span class="label">Área do admin · só para a Osmo</span>
  <nav class="seg adm-tabs adm-nav" aria-label="Área do admin">${tabs.map(([k, l]) => `<button type="button" data-adm-nav="${k}" ${k === active ? 'aria-current="page"' : ""}>${l}</button>`).join("")}</nav>
  ${admModeSwitch()}</div>`;
}
// MODO ADMIN NO SITE: um interruptor (guardado só neste navegador). Ligado, aparece uma barra fixa
// embaixo das telas normais (vaga, perfil de talento, projeto de contrato) com Editar e Apagar
// daquele registro, usando o mesmo formulário da área de Dados. Quem decide se pode é sempre o servidor.
const admModeOn = () => !!(ME && ME!.isAdmin && store.get("admMode", false));
const admModeSwitch = () => `<label class="check adm-switch"><input type="checkbox" data-adm-mode ${admModeOn() ? "checked" : ""}><span>Modo admin no site: botões de Editar e Apagar nas páginas normais</span></label>`;
// qual registro a tela atual mostra: [tabela da área de Dados, número, nome para mostrar, para onde ir depois de apagar]
function admTarget(name: string, id?: number | null) {
  if (name === "vaga" && id) return ["jobs", id, "Vaga", "vagas"];
  if (name === "talento" && id) return ["users", id, "Pessoa", "talentos"];
  if (name === "projeto" && typeof PJ !== "undefined" && PJ.data && PJ.data!.project && PJ.data!.project.contract_id) return ["contracts", PJ.data!.project.contract_id, "Contrato", "projetos"];
  return null;
}
function admBar(name: string, id?: number | null) {
  let bar = $("#admBar");
  if (!admModeOn() || name === "panorama" || name === "gestao" || name === "propostas") { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement("div"); bar.id = "admBar"; bar.className = "adm-bar-fixed"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Modo admin"); document.body.appendChild(bar); }
  const t = admTarget(name, id);
  bar.innerHTML = `<span class="label">Modo admin</span>${t ? `<span class="adm-bar-what">${t[2]} #${t[1]}</span>
    <button class="btn sm" data-admq="edit" data-ent="${t[0]}" data-id="${t[1]}">Editar</button><button class="btn sm ghost" data-admq="del" data-ent="${t[0]}" data-id="${t[1]}" data-back="${t[3]}">Apagar</button>${name === "vaga" && id ? `<button class="btn sm ghost" data-adm-job-props="${id}">Propostas desta vaga</button>` : ""}` : `<span class="adm-bar-what hint">Nada para editar nesta tela</span>`}
    <button class="btn sm ghost" data-go="propostas">Painel de propostas</button><button class="btn sm ghost" data-go="panorama">Área do admin</button><button class="btn sm ghost" data-adm-mode-off aria-label="Desligar o modo admin">Desligar</button>`;
}
document.addEventListener("change", e => { const target = eventInput(e); if (!target) return;
  if (!target.matches || !target.matches("[data-adm-mode]")) return;
  store.set("admMode", (target instanceof HTMLInputElement && target.checked) || null);
  toast((target instanceof HTMLInputElement && target.checked) ? "Modo admin ligado" : "Modo admin desligado");
});
document.addEventListener("click", async e => { const target = eventElement(e); if (!target) return;
  if (target.closest && target.closest<HTMLElement>("[data-adm-mode-off]")) { store.set("admMode", null); admBar(""); toast("Modo admin desligado"); return; }
  const jp = target.closest && target.closest<HTMLElement>("[data-adm-job-props]");
  if (jp) { ADM.ent = "proposals"; ADM.jobId = Number(jp.dataset.admJobProps) || 0; ADM.pstatus = ""; ADM.q = ""; ADM.page = 0; return go("propostas"); }
  const b = target.closest && target.closest<HTMLElement>("[data-admq]"); if (!b) return;
  try { if (!ADM.schema) ADM.schema = await api<OsmoAdminSchema>("GET", "/api/admin/schema"); } catch (err) { return toast(errorMessage(err)); }
  ADM.ent = b.dataset.ent!; ADM.back = b.dataset.back || "";
  const id = Number(b.dataset.id);
  if (b.dataset.admq === "edit") return openAdmForm(id);
  const fake = document.createElement("button"); fake.dataset.admDel = String(id); ADM.fromPage = true;
  document.body.appendChild(fake); fake.click(); fake.remove(); // usa a mesma confirmação da área de Dados
});
document.addEventListener("click", e => { const target = eventElement(e); if (!target) return;
  const b = target.closest && target.closest<HTMLElement>("[data-adm-nav]"); if (!b) return;
  const k = b.dataset.admNav!;
  if (k === "log") { ADM.ent = "log"; ADM.q = ""; ADM.page = 0; return go("gestao"); }
  if (k === "propostas") { ADM.ent = "proposals"; ADM.q = ""; ADM.pstatus = ""; ADM.jobId = 0; ADM.page = 0; return go("propostas"); }
  if (k === "gestao" && (ADM.ent === "log" || curH() === "propostas")) { ADM.ent = "users"; ADM.q = ""; ADM.page = 0; }
  go(k);
});
V.panorama = async () => {
  if (needLogin()) return;
  let d;
  try { d = await api<OsmoOverview>("GET", "/api/admin/overview"); }
  catch (e) { if (errorStatus(e) === 404) return emptyBox("Página não encontrada.", "", "inicio", "Voltar ao início"); throw e; }
  const p = d.people, m = d.money, f = d.funnel, a = d.attention, js = d.jobs.byStatus;
  const kpi = (label: string, value: string, note = "") => `<div class="panel adm-kpi"><span class="label">${label}</span><b class="mono">${value}</b>${note ? `<span class="hint">${note}</span>` : ""}</div>`;
  const chip = (on: unknown, yes: string, no: string) => `<span class="status ${on ? "ok" : "off"}">${on ? yes : no}</span>`;
  return `<div class="adm stack">
  ${admNav("panorama")}
  <div class="row" style="justify-content:space-between; align-items:flex-end">
    <div><h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">Visão geral da plataforma</h1>
      <p class="hint">Atualizado ${when(d.generatedAt.replace("T", " ").slice(0, 19))}, de novo a cada minuto enquanto esta tela estiver aberta.</p></div>
    <div class="row" style="gap:6px">${chip(d.config.payments, `Pagamentos ligados (${PAY.provider === "stripe" ? "Stripe" : "Asaas"}${PAY.sandbox ? " · teste" : ""}) · taxa ${d.config.fee}%`, "Pagamentos simulados")}${chip(d.config.mail, "E-mail ligado", "E-mail desligado")}${chip(d.config.oauth.length, "Login social: " + d.config.oauth.join(", "), "Sem login social")}</div>
  </div>

  <div class="adm-kpis">
    ${kpi("Pessoas", num(p.freelas + p.clientes), `${num(p.freelas)} freelas · ${num(p.clientes)} clientes`)}
    ${kpi("Novas pessoas", num(p.new7), `nos últimos 7 dias · ${num(p.new30)} em 30`)}
    ${kpi("Ativas na semana", num(p.active7), "mandaram mensagem em 7 dias")}
    ${kpi("Vagas abertas", num(js.aberta || 0), `${num(d.jobs.total)} publicadas · clareza média ${d.jobs.avgClarity}%`)}
    ${kpi("Contratos ativos", num(m.contracts.ativo || 0), `${num(m.contracts.concluido || 0)} concluídos`)}
    ${kpi("Valor contratado", brl(m.contracted), "soma de todos os contratos")}
    ${kpi(d.config.payments ? "Liberado aos freelas" : "Aprovado (simulado)", brl(m.released), `receita Osmo ${brl(m.feeEarned)}`)}
    ${RECURSOS.tarefas ? kpi("Tarefas em aberto", num(d.tasks.open), `${num(d.tasks.late)} atrasadas · ${num(d.tasks.done)} concluídas · ${num(d.tasks.projects)} projetos`) : ""}
    ${kpi("Protegido / a pagar", `${brl(m.held)}`, d.config.payments ? `${brl(m.toPay)} ainda a pagar` : "etapas ainda não aprovadas")}
  </div>

  <div class="adm-charts">
    ${weekBars("Cadastros por semana", d.weekly, "users")}
    ${weekBars("Vagas publicadas por semana", d.weekly, "jobs")}
    ${weekBars("Contratos fechados por semana", d.weekly, "contracts")}
    ${weekBars("Valor contratado por semana", d.weekly, "value", brl)}
  </div>

  <div class="adm-two">
    <div class="panel stack" style="gap:12px"><div class="row" style="justify-content:space-between"><h3>Funil de contratação</h3><a class="btn sm" href="${url("propostas")}">Gerenciar propostas</a></div>
      ${hBars([["Vagas publicadas", f.published], ["Receberam proposta", f.withProposal, pct(f.withProposal, f.published)], ["Viraram contrato", f.hired, pct(f.hired, f.published)], ["Contrato concluído", f.done, pct(f.done, f.published)]])}
      <p class="hint">${d.proposals.perJob} propostas por vaga em média · ${num(d.proposals.byStatus.enviada || 0)} propostas aguardando resposta agora.</p></div>
    <div class="panel stack" style="gap:12px"><h3>Saúde da comunidade</h3>
      ${hBars([["Freelas", p.freelas], ["Perfil completo", p.profilesReady, pct(p.profilesReady, p.freelas)], ["Com selo verificado", p.verified, pct(p.verified, p.freelas)], ["Com conta de recebimento", p.withPayout, pct(p.withPayout, p.freelas)]])}
      <p class="hint">${num(d.talk.messages7)} mensagens e ${num(d.talk.threads7)} conversas ativas em 7 dias · ${d.talk.reviews.n ? `nota média ${dec(d.talk.reviews.avg)} em ${num(d.talk.reviews.n)} avaliações` : "nenhuma avaliação ainda"}.</p></div>
  </div>

  <div class="adm-two">
    <div class="panel stack" style="gap:12px"><h3>Etapas dos contratos</h3>
      ${hBars(Object.keys(ADM_MS).map(k => [ADM_MS[k], m.milestones[k] || 0]))}</div>
    <div class="panel stack" style="gap:12px"><h3>Vagas por área</h3>
      ${hBars(CATS.map((c): [string, number] => [c.n, d.jobs.byCat[c.id] || 0]).sort((x, y) => y[1] - x[1]))}</div>
  </div>

  <h2>Precisa de atenção</h2>
  <div class="adm-two">
    ${admList("Entregas sem resposta há 3+ dias", a.deliveredWaiting, x => `<li><b>${esc(x.title)}</b> · ${brl(x.value)}<br><span class="hint">${esc(x.job)} · ${esc(x.client)} ainda não aprovou · entregue ${when(x.at)}</span></li>`, "Nenhuma entrega esperando aprovação.")}
    ${admList("Propostas sem resposta há 7+ dias", a.proposalsWaiting, x => `<li><a href="${url("vaga-" + (x.job_id))}"><b>${esc(x.job)}</b></a> · ${brl(x.value)}<br><span class="hint">${esc(x.freela)} · enviada ${when(x.at)}</span></li>`, "Todas as propostas recentes tiveram resposta.")}
    ${admList("Vagas abertas há 7+ dias sem proposta", a.jobsNoProposal, x => `<li><a href="${url("vaga-" + (x.id))}"><b>${esc(x.title)}</b></a> · ${x.clarity}% claro<br><span class="hint">${esc(x.client)} · publicada ${when(x.at)}</span></li>`, "Toda vaga aberta já recebeu proposta.")}
    ${d.config.payments ? admList("Cobranças aguardando pagamento", a.unpaid, x => `<li><b>${esc(x.title)}</b> · ${brl(x.value)}<br><span class="hint">${esc(x.job)} · ${esc(x.client)}</span></li>`, "Nenhuma cobrança em aberto.") : ""}
  </div>

  <h2>Últimas novidades</h2>
  <div class="panel adm-table"><h3>Cadastros</h3><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Quando</th></tr></thead><tbody>
    ${d.recent.users.map(u => `<tr><td>${u.role === "freela" ? `<a href="${url("talento-" + (u.id))}">${esc(u.name)}</a>` : esc(u.name)}${vbadge(u.verified)}</td><td>${esc(u.email)}</td><td>${u.role === "freela" ? "Freela" : "Cliente"}</td><td>${when(u.at)}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="panel adm-table"><h3>Vagas</h3><table><thead><tr><th>Vaga</th><th>Cliente</th><th>Situação</th><th>Clareza</th><th>Propostas</th><th>Quando</th></tr></thead><tbody>
    ${d.recent.jobs.map(j => `<tr><td><a href="${url("vaga-" + (j.id))}">${esc(j.title)}</a></td><td>${esc(j.client)}</td><td>${pill(JSTATUS, j.status)}</td><td class="mono">${j.clarity}%</td><td class="mono">${j.props}</td><td>${when(j.at)}</td></tr>`).join("")}
  </tbody></table></div>
  <div class="panel adm-table"><h3>Contratos</h3><table><thead><tr><th>Vaga</th><th>Cliente</th><th>Freela</th><th>Valor</th><th>Etapas</th><th>Quando</th></tr></thead><tbody>
    ${d.recent.contracts.map(c => `<tr><td>${esc(c.job)}</td><td>${esc(c.client)}</td><td>${esc(c.freela)}</td><td class="mono">${brl(c.value)}</td><td class="mono">${c.done}/${c.total}${c.status === "concluido" ? " ✓" : ""}</td><td>${when(c.at)}</td></tr>`).join("")}
  </tbody></table></div>
  <p class="hint">Versão ${esc(d.config.version)} · ${d.config.autoRelease ? `liberação automática após ${d.config.autoRelease} dias sem resposta.` : "repasse após aprovação explícita do cliente."}</p>
</div>`;
};
after.panorama = () => {
  pollTimer = setInterval(async () => {
    if (document.hidden || curH() !== "panorama") return;
    try { const html = await V.panorama(); if (html && curH() === "panorama") $("#view").innerHTML = html; } catch {}
  }, 60_000);
};

// GESTÃO DE DADOS (#gestao) E PAINEL DE PROPOSTAS (#propostas): telas do dono para criar, ler, editar e apagar
// pessoas, vagas, propostas, contratos, etapas e avaliações.
// O servidor manda a "receita" de cada aba (quais colunas mostrar e quais campos editar), e esta tela só
// desenha: uma tabela com busca (ou cartões completos no painel de propostas) e, ao clicar em Editar ou Novo,
// um painel lateral com o formulário. Apagar sempre pede confirmação, e tudo o que o dono faz aparece no Registro.
/* ---------- gestão de dados e painel de propostas (CRUD do dono) ---------- */
const ADM: { schema: OsmoAdminSchema | null; ent: string; q: string; pstatus: string; jobId: number; page: number; rows: OsmoAdminRow[]; propSummary: OsmoAdminProposalSummary | null; log: OsmoAdminLog[] | null; back?: string; fromPage?: boolean; t?: number } = { schema: null, ent: "users", q: "", pstatus: "", jobId: 0, page: 0, rows: [], propSummary: null, log: null };
const admEnt = () => ADM.schema!.entities.find(e => e.k === ADM.ent)!;
// mostra cada célula do jeito certo: datas como "há 2 h", situações com o nome bonito, valores em reais
function admCell(e: OsmoAdminEntity, k: string, v: OsmoAdminValue | undefined) {
  if (v === null || v === undefined || v === "") return `<span class="hint">–</span>`;
  if (k === "created_at") return when(String(v));
  const f = e.fields.find(x => x.k === k);
  if (f && f.options) return esc((f.options.find(o => o.v === v) || { l: v }).l);
  if (k === "role") return v === "freela" ? "Freela" : "Cliente";
  if (k === "value") return brl(v);
  return esc(String(v).length > 80 ? String(v).slice(0, 80) + "…" : v);
}
function admProposalsPanel() {
  const s = ADM.propSummary || { total: ADM.rows.length, totalValue: 0, byStatus: {} };
  const bs = s.byStatus || {};
  const kpi = (label: string, value: string, note: string, st = "") =>
    `<button type="button" class="panel adm-kpi adm-kpi-btn ${ADM.pstatus === st ? "active" : ""}" data-adm-pstatus="${st}"><span class="label">${label}</span><b class="mono">${value}</b><span class="hint">${note}</span></button>`;
  const filters: [string, string, number][] = [
    ["", "Todas", s.total || 0],
    ["enviada", "Aguardando resposta", bs.enviada || 0],
    ["aceita", "Escolhidas", bs.aceita || 0],
    ["recusada", "Não escolhidas", bs.recusada || 0],
    ["retirada", "Retiradas", bs.retirada || 0],
  ];
  const cards = ADM.rows.map(raw => {
    const r = raw as unknown as OsmoAdminProposalFull;
    const ms = r.milestones_list || [];
    return `<article class="panel stack adm-prop-card" data-prop-id="${r.id}">
      <div class="row adm-prop-head">
        <div class="row" style="gap:10px">
          ${av(r.freela, r.freela_id, "sm", r.avatar)}
          <div class="stack" style="gap:2px">
            <div class="row" style="gap:6px"><a href="${url("talento-" + r.freela_id)}"><b>${esc(r.freela)}</b></a>${vbadge(r.verified)}<span class="mono hint">#${r.id}</span></div>
            <span class="hint">Enviada ${when(r.created_at)}</span>
          </div>
        </div>
        <div class="row" style="gap:8px">
          ${r.contract_id ? `<a class="btn sm ghost" href="${url("contrato-" + r.contract_id)}">Contrato #${r.contract_id}</a>` : ""}
          ${pill(PSTATUS, r.status)}
        </div>
      </div>
      <div class="adm-prop-job">
        <div class="stack" style="gap:2px"><span class="label">Vaga #${r.job_id}</span><div class="row" style="gap:8px"><a href="${url("vaga-" + r.job_id)}"><b>${esc(r.job)}</b></a>${pill(JSTATUS, r.job_status || "aberta")}</div></div>
        <div class="stack" style="gap:2px"><span class="label">Cliente</span><b>${esc(r.client || "–")}</b></div>
        <div class="stack" style="gap:2px"><span class="label">Condições</span><b>${brl(r.value)} · ${r.days || "–"} dias úteis</b><span class="hint">${ms.length || 1} etapa(s)</span></div>
      </div>
      ${ms.length > 1 ? `<ul class="ms-mini">${ms.map(m => `<li><span>${esc(m.title)}</span><b>${brl(m.value)}</b></li>`).join("")}</ul>` : ""}
      <p class="adm-prop-text">${esc(r.text)}</p>
      ${r.questions ? `<div class="adm-prop-qs"><span class="label">Dúvidas enviadas pelo talento</span><p>${esc(r.questions)}</p></div>` : ""}
      ${r.files && r.files.length ? attList(r.files) : ""}
      <div class="row adm-prop-actions">
        ${r.status !== "aceita" ? `<button type="button" class="btn sm hl" data-adm-pact="accept" data-id="${r.id}">Escolher proposta e criar contrato</button>` : ""}
        ${r.status === "recusada" || r.status === "retirada" ? `<button type="button" class="btn sm" data-adm-pact="reopen" data-id="${r.id}">Voltar para aguardando resposta</button>` : ""}
        ${r.status === "enviada" || r.status === "retirada" ? `<button type="button" class="btn sm ghost" data-adm-pact="decline" data-id="${r.id}">Marcar como não escolhida</button>` : ""}
        <a class="btn sm ghost" href="${url("vaga-" + r.job_id)}">Abrir vaga</a>
        <button type="button" class="btn sm" data-adm-edit="${r.id}">Editar proposta</button>
        <button type="button" class="btn sm ghost" data-adm-del="${r.id}">Apagar</button>
      </div>
    </article>`;
  }).join("");
  return `<div class="adm-kpis">
    ${kpi("Total de propostas", num(s.total), `soma ${brl(s.totalValue)}`, "")}
    ${kpi("Aguardando resposta", num(bs.enviada || 0), "prontas para decisão", "enviada")}
    ${kpi("Escolhidas", num(bs.aceita || 0), "viraram contrato", "aceita")}
    ${kpi("Não escolhidas", num(bs.recusada || 0), "podem ser reconsideradas", "recusada")}
    ${kpi("Retiradas", num(bs.retirada || 0), "retiradas pelo talento", "retirada")}
  </div>
  <div class="row" style="justify-content:space-between; gap:10px; flex-wrap:wrap">
    <div class="seg adm-tabs" role="group" aria-label="Filtrar por situação">
      ${filters.map(([k, l, n]) => `<button type="button" data-adm-pstatus="${k}" aria-pressed="${ADM.pstatus === k}">${l} <span class="mono">(${num(n)})</span></button>`).join("")}
    </div>
    ${ADM.jobId ? `<div class="row" style="gap:8px"><span class="status warn">Filtrando pela vaga #${ADM.jobId}</span><button type="button" class="btn sm ghost" data-adm-clear-job="1">Mostrar todas as vagas</button></div>` : ""}
  </div>
  ${ADM.rows.length ? `<div class="stack adm-prop-list">${cards}</div>` : `<div class="panel"><p class="hint">Nenhuma proposta encontrada para este filtro.</p></div>`}
  <div class="row" style="justify-content:space-between"><span class="hint">Página ${ADM.page + 1} · até 50 por página</span>
    <div class="row" style="gap:6px"><button class="btn sm" data-adm-page="-1" ${ADM.page ? "" : "disabled"}>Anterior</button><button class="btn sm" data-adm-page="1" ${ADM.rows.length === 50 ? "" : "disabled"}>Próxima</button></div></div>`;
}
function gestaoTable() {
  if (ADM.ent === "log") return `<div class="panel adm-table"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>
    ${ADM.log!.length ? ADM.log!.map(l => `<tr><td>${when(l.created_at)}</td><td>${esc(l.admin || "–")}</td><td>${esc(l.action)}</td><td>${esc((ADM.schema!.entities.find(e => e.k === l.entity) || { label: l.entity }).label)} #${l.entity_id}</td><td class="adm-detail">${esc(l.detail.length > 160 ? l.detail.slice(0, 160) + "…" : l.detail)}</td></tr>`).join("") : `<tr><td colspan="5" class="hint">Nada registrado ainda.</td></tr>`}
  </tbody></table></div>`;
  if (ADM.ent === "proposals") return admProposalsPanel();
  const e = admEnt();
  return `<div class="panel adm-table"><table><thead><tr><th>#</th>${e.cols.map(([, l]) => `<th>${esc(l)}</th>`).join("")}<th><span class="sr-only">Ações</span></th></tr></thead><tbody>
    ${ADM.rows.length ? ADM.rows.map(r => `<tr><td class="mono">${r.id}</td>${e.cols.map(([k]) => `<td>${admCell(e, k, r[k])}</td>`).join("")}
      <td class="adm-actions">${e.k === "users" && r.role === "cliente" && r.id !== ME!.id ? `<button class="btn sm" data-act="adm-support" data-id="${r.id}">Mensagem</button>` : ""}<button class="btn sm" data-adm-edit="${r.id}">Editar</button><button class="btn sm ghost" data-adm-del="${r.id}">Apagar</button></td></tr>`).join("")
      : `<tr><td colspan="${e.cols.length + 2}" class="hint">Nada encontrado.</td></tr>`}
  </tbody></table></div>
  <div class="row" style="justify-content:space-between"><span class="hint">Página ${ADM.page + 1} · até 50 por página</span>
    <div class="row" style="gap:6px"><button class="btn sm" data-adm-page="-1" ${ADM.page ? "" : "disabled"}>Anterior</button><button class="btn sm" data-adm-page="1" ${ADM.rows.length === 50 ? "" : "disabled"}>Próxima</button></div></div>`;
}
async function admLoad() {
  if (ADM.ent === "log") ADM.log = (await api<{ log: OsmoAdminLog[] }>("GET", "/api/admin/log")).log;
  else {
    const extra = ADM.ent === "proposals" ? `&status=${encodeURIComponent(ADM.pstatus)}&job_id=${ADM.jobId || 0}` : "";
    const res = await api<{ rows: OsmoAdminRow[]; summary?: OsmoAdminProposalSummary }>("GET", `/api/admin/${ADM.ent}?q=${encodeURIComponent(ADM.q)}&page=${ADM.page}${extra}`);
    ADM.rows = res.rows;
    if (res.summary) ADM.propSummary = res.summary;
  }
}
async function admRefresh() { try { await admLoad(); const b = $("#admBox"); if (b) b.innerHTML = gestaoTable(); } catch (err) { toast(errorMessage(err)); } }
V.propostas = async () => {
  if (needLogin()) return;
  ADM.ent = "proposals";
  try { if (!ADM.schema) ADM.schema = await api<OsmoAdminSchema>("GET", "/api/admin/schema"); await admLoad(); }
  catch (e) { if (errorStatus(e) === 404) return emptyBox("Página não encontrada.", "", "inicio", "Voltar ao início"); throw e; }
  return `<div class="adm stack">
  ${admNav("propostas")}
  <div class="row" style="justify-content:space-between; align-items:flex-end">
    <div><h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">Gerenciar propostas</h1>
      <p class="hint">Acompanhe todas as propostas enviadas, mude a situação (escolhida, aguardando resposta ou não escolhida), crie contratos ou edite valores e textos.</p></div>
  </div>
  <input class="input" id="admQ" type="search" placeholder="Buscar por vaga, talento, cliente, texto ou #id…" value="${esc(ADM.q)}" autocomplete="off">
  <div id="admBox" class="stack" style="gap:12px">${admProposalsPanel()}</div>
</div>`;
};
V.gestao = async () => {
  if (needLogin()) return;
  try { if (!ADM.schema) ADM.schema = await api<OsmoAdminSchema>("GET", "/api/admin/schema"); await admLoad(); }
  catch (e) { if (errorStatus(e) === 404) return emptyBox("Página não encontrada.", "", "inicio", "Voltar ao início"); throw e; }
  const e = ADM.ent === "log" ? null : admEnt();
  return `<div class="adm stack">
  ${admNav(ADM.ent === "log" ? "log" : "gestao")}
  <div class="row" style="justify-content:space-between; align-items:flex-end">
    <div><h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">${ADM.ent === "log" ? "Registro de alterações" : "Dados da plataforma"}</h1>
      <p class="hint">Criar, ver, editar e apagar registros da plataforma. Tudo fica anotado no Registro.</p></div>
    ${e && e.canCreate ? `<button class="btn hl" data-adm-new="1">Novo: ${esc(e.label.replace(/s$/, "").toLowerCase())}</button>` : ""}
  </div>
  <div class="seg adm-tabs" role="group" aria-label="O que gerenciar">${ADM.schema!.entities.map(x => `<button type="button" data-adm-tab="${x.k}" aria-pressed="${ADM.ent === x.k}">${esc(x.label)}</button>`).join("")}<button type="button" data-adm-tab="log" aria-pressed="${ADM.ent === "log"}">Registro</button></div>
  ${e ? `<input class="input" id="admQ" type="search" placeholder="Buscar em ${esc(e.label.toLowerCase())}…" value="${esc(ADM.q)}" autocomplete="off">` : ""}
  <div id="admBox" class="stack" style="gap:12px">${gestaoTable()}</div>
</div>`;
};
// um campo do formulário, desenhado conforme o tipo que o servidor informou
function admField(f: OsmoAdminField, v: OsmoAdminValue | undefined) {
  const id = "adm_" + f.k, lock = f.locked ? "disabled" : "", req = f.req ? "required" : "", ph = f.ph ? `placeholder="${esc(f.ph)}"` : "";
  const label = `<label for="${id}">${esc(f.label)}${f.locked ? ' <span class="hint">(muda só pelo Asaas)</span>' : ""}</label>`;
  if (f.type === "bool") return `<label class="check"><input type="checkbox" id="${id}" name="${f.k}" ${v ? "checked" : ""} ${lock}><span>${esc(f.label)}</span></label>`;
  if (f.type === "select") return `<div class="field">${label}<select class="input" id="${id}" name="${f.k}" ${lock} ${req}>${f.req ? "" : `<option value="">–</option>`}${f.options.map(o => `<option value="${esc(o.v)}" ${o.v === v ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select></div>`;
  if (f.type === "textarea" || f.type === "list") return `<div class="field">${label}<textarea class="input" id="${id}" name="${f.k}" rows="${f.type === "list" ? 4 : 5}" ${ph} ${lock}>${esc(Array.isArray(v) ? v.join("\n") : v ?? "")}</textarea></div>`;
  return `<div class="field">${label}<input class="input" id="${id}" name="${f.k}" type="${f.type === "int" ? "number" : f.type === "email" ? "email" : "text"}" value="${esc(v ?? "")}" ${ph} ${lock} ${req}></div>`;
}
async function openAdmForm(id: number | null) {
  const e = admEnt(); let values: Record<string, OsmoAdminValue> = {};
  if (id) { try { values = (await api<{ values: Record<string, OsmoAdminValue> }>("GET", `/api/admin/${e.k}/${id}`)).values; } catch (err) { return toast(errorMessage(err)); } }
  const fields = e.fields.filter(f => id ? !f.create : true);
  $("#layer").innerHTML = `<div class="scrim" id="scrim"></div><div class="drawer adm-drawer" role="dialog" aria-modal="true" aria-label="${id ? "Editar" : "Novo"} registro">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="row" style="justify-content:space-between"><h2>${id ? `${esc(e.label)} #${id}` : `Novo registro em ${esc(e.label)}`}</h2><button class="btn sm ghost" data-adm-close="1">Fechar</button></div>
    <form class="stack" id="admForm" data-id="${id || ""}">${fields.map(f => admField(f, values[f.k])).join("")}
      <div id="admErr" class="err" role="alert" hidden></div>
      <div class="sheet-actions"><button class="btn hl" type="submit">${id ? "Salvar" : "Criar"}</button>${id && e.k === "users" ? `<button type="button" class="btn" data-adm-pass="${id}">Gerar senha temporária</button>` : ""}</div>
    </form></div>`;
  const first = $("#admForm .input"); if (first) first.focus();
}
// a senha temporária aparece uma vez só, para o dono copiar e passar à pessoa por um canal seguro
function showTempPassword(name: unknown, pass: string) {
  $("#layer").innerHTML = `<div class="scrim" id="scrim"></div><div class="drawer sheet" role="dialog" aria-modal="true" aria-label="Senha temporária">
    <div class="sheet-grip" aria-hidden="true"></div><h2>Senha temporária</h2>
    <p class="muted">Passe para ${esc(name)} por um canal seguro. Ela não aparece de novo; a pessoa pode trocar depois em "Esqueci minha senha".</p>
    <input class="input mono" readonly value="${esc(pass)}" id="admPass">
    <div class="sheet-actions"><button class="btn hl" data-adm-close="1">Pronto</button></div></div>`;
  $("#admPass").focus(); $("#admPass").select();
}
document.addEventListener("click", async ev => { const target = eventElement(ev); if (!target) return;
  const t = target;
  const tab = t.closest<HTMLElement>("[data-adm-tab]"); if (tab) { ADM.ent = tab.dataset.admTab!; ADM.q = ""; ADM.pstatus = ""; ADM.jobId = 0; ADM.page = 0; return route(); }
  const pst = t.closest<HTMLElement>("[data-adm-pstatus]"); if (pst) { ADM.pstatus = pst.dataset.admPstatus || ""; ADM.page = 0; return admRefresh(); }
  if (t.closest<HTMLElement>("[data-adm-clear-job]")) { ADM.jobId = 0; ADM.page = 0; return admRefresh(); }
  const pact = t.closest<HTMLElement>("[data-adm-pact]"); if (pact) {
    const id = Number(pact.dataset.id), act = pact.dataset.admPact;
    if (act === "decline" && !await confirmSheet({ title: "Marcar proposta como não escolhida?", text: "Você poderá voltar atrás ou escolhê-la depois, se quiser.", ok: "Marcar como não escolhida" })) return;
    try {
      if (act === "accept") { await api("POST", `/api/proposals/${id}/accept`); toast("Proposta escolhida e contrato criado!"); }
      else if (act === "reopen") { await api("POST", `/api/proposals/${id}/reopen`); toast("Proposta voltou para aguardando resposta."); }
      else if (act === "decline") { await api("POST", `/api/proposals/${id}/decline`); toast("Proposta marcada como não escolhida."); }
      return admRefresh();
    } catch (err) { return toast(errorMessage(err)); }
  }
  const pg = t.closest<HTMLElement>("[data-adm-page]"); if (pg) { ADM.page = Math.max(0, ADM.page + Number(pg.dataset.admPage)); return admRefresh(); }
  if (t.closest<HTMLElement>("[data-adm-close]")) { $("#layer").innerHTML = ""; return; }
  if (t.closest<HTMLElement>("[data-adm-new]")) return openAdmForm(null);
  const ed = t.closest<HTMLElement>("[data-adm-edit]"); if (ed) return openAdmForm(Number(ed.dataset.admEdit));
  const del = t.closest<HTMLElement>("[data-adm-del]"); if (del) {
    const e = admEnt(), id = Number(del.dataset.admDel);
    const extra = { users: "Apaga também o perfil, o portfólio e as vagas dessa pessoa.", jobs: "Apaga também as propostas e contratos dessa vaga.", contracts: "Apaga também as etapas e avaliações; a vaga volta a ficar aberta." }[e.k] || "";
    if (!await confirmSheet({ title: `Apagar ${e.label.toLowerCase().replace(/s$/, "")} #${id}?`, text: `Não dá para desfazer. ${extra}`, ok: "Apagar" })) return;
    try { await api("DELETE", `/api/admin/${e.k}/${id}`); toast("Apagado"); } catch (err) { return toast(errorMessage(err)); }
    if (!$("#admBox")) return go(ADM.back || "inicio"); // apagou pelo modo admin, numa tela normal
    return admRefresh();
  }
  const pw = t.closest<HTMLElement>("[data-adm-pass]"); if (pw) {
    const id = Number(pw.dataset.admPass);
    if (!await confirmSheet({ title: "Gerar uma senha temporária?", text: "A senha atual deixa de valer e a pessoa sai de todos os aparelhos.", ok: "Gerar senha" })) return;
    try { const r = await api<{ tempPassword: string }>("POST", `/api/admin/users/${id}/password`); showTempPassword("a pessoa", r.tempPassword); } catch (err) { toast(errorMessage(err)); }
  }
});
document.addEventListener("input", ev => { const target = eventInput(ev); if (!target) return;
  if (target.id !== "admQ") return;
  ADM.q = target.value; ADM.page = 0;
  clearTimeout(ADM.t); ADM.t = setTimeout(admRefresh, 250); // espera parar de digitar para não buscar a cada letra
});
document.addEventListener("submit", async ev => { const target = eventForm(ev); if (!target) return;
  if (target.id !== "admForm") return;
  const f = target, e = admEnt(), id = Number(f.dataset.id) || 0, body: Record<string, unknown> = {};
  for (const fd of e.fields) {
    const el = field(f, fd.k); if (!el || el.disabled) continue;
    body[fd.k] = fd.type === "bool" ? el.checked : el.value;
  }
  const btn = f.querySelector<HTMLButtonElement>('[type="submit"]'); btn!.disabled = true;
  try {
    const r = await api<{ tempPassword?: string }>(id ? "PUT" : "POST", id ? `/api/admin/${e.k}/${id}` : `/api/admin/${e.k}`, body);
    if ($("#admBox")) await admRefresh(); else setTimeout(route, 0); // modo admin: redesenha a tela normal com o que mudou
    if (r.tempPassword) showTempPassword(body.name || "a pessoa", r.tempPassword);
    else { $("#layer").innerHTML = ""; toast(id ? "Salvo" : "Criado"); }
  } catch (err) { const b = $("#admErr"); b.textContent = errorMessage(err); b.hidden = false; }
  finally { btn!.disabled = false; }
});

// TAREFAS NO ESTILO ASANA: três telas.
// - #tarefas: "Minhas tarefas", tudo o que está com você, separado por prazo (atrasadas, hoje, próximos dias...);
// - #projetos: os projetos que você vê (um por contrato e, para o dono, os internos);
// - #projeto-N: um projeto em três vistas: LISTA (seções com tarefas), QUADRO (colunas para arrastar os cartões)
//   e CALENDÁRIO (cada tarefa no dia do prazo). Clicar numa tarefa abre o painel com todos os detalhes.
// Quem decide quem vê cada projeto é o servidor; esta parte só desenha e manda as mudanças.
/* ---------- tarefas (projetos no estilo Asana) ---------- */
const PJ: { data: OsmoProjectResponse | null; view: string; month: string | null; open: number | null } = { data: null, view: store.get("pj-view", "lista"), month: null, open: null };
const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // dia de hoje em Brasília
const fmtDue = (d: string) => { if (!d) return ""; const [y, m, dd] = d.split("-"); return `${dd}/${m}${y !== today().slice(0, 4) ? "/" + y.slice(2) : ""}`; };
const dueCls = (t: OsmoTask) => !t.due_date || t.done ? "" : t.due_date < today() ? "late" : t.due_date === today() ? "now" : "";
const taskMeta = (t: OsmoTask) => `${t.assignee ? `<span class="tk-who" title="${esc(t.assignee)}">${esc(initials(t.assignee))}</span>` : ""}${t.due_date ? `<span class="tk-due ${dueCls(t)}">${fmtDue(t.due_date)}</span>` : ""}${t.comments ? `<span class="hint" title="Comentários">💬 ${t.comments}</span>` : ""}`;
const subCount = (id: number) => { const s = PJ.data!.tasks.filter(x => x.parent_id === id); return s.length ? `<span class="hint">${s.filter(x => x.done).length}/${s.length}</span>` : ""; };
function taskRow(t: OsmoTask) {
  return `<li class="tk-row ${t.done ? "done" : ""}"><input type="checkbox" class="tk-check" data-tk-done="${t.id}" ${t.done ? "checked" : ""} aria-label="Concluir ${esc(t.title)}">
    <button class="tk-title" data-tk-open="${t.id}">${esc(t.title)}</button>${subCount(t.id)}<span class="tk-meta">${taskMeta(t)}</span></li>`;
}
const addForm = (sid: number) => `<form class="tk-add" data-section="${sid}"><input class="input" name="title" placeholder="+ Adicionar tarefa" aria-label="Nova tarefa" autocomplete="off"></form>`;
const sectionMenu = (s: OsmoSection) => `<span class="tk-sec-actions"><button class="icon-btn sm" data-sec-move="${s.id}" data-dir="-1" aria-label="Mover seção para antes">←</button><button class="icon-btn sm" data-sec-move="${s.id}" data-dir="1" aria-label="Mover seção para depois">→</button><button class="icon-btn sm" data-sec-ren="${s.id}" aria-label="Renomear seção">✎</button><button class="icon-btn sm" data-sec-del="${s.id}" aria-label="Apagar seção">×</button></span>`;
const topTasks = (sid: number) => PJ.data!.tasks.filter(t => !t.parent_id && t.section_id === sid).sort((a, b) => a.pos - b.pos || a.id - b.id);
function listView() {
  return PJ.data!.sections.map(s => { const ts = topTasks(s.id);
    return `<section class="panel tk-section"><div class="row" style="justify-content:space-between"><h3>${esc(s.name)} <span class="hint">${ts.filter(t => !t.done).length}</span></h3>${sectionMenu(s)}</div>
      <ul class="tk-list">${ts.map(taskRow).join("")}</ul>${addForm(s.id)}</section>`; }).join("")
    + `<form class="tk-newsec"><input class="input" name="name" placeholder="+ Nova seção" aria-label="Nova seção" autocomplete="off"></form>`;
}
// quadro: cada seção é uma coluna; os cartões podem ser arrastados ou mudados de coluna pelo seletor (para teclado e leitor de tela)
function boardView() {
  const opts = (cur: number) => PJ.data!.sections.map(s => `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  return `<div class="tk-board">${PJ.data!.sections.map(s => { const ts = topTasks(s.id);
    return `<section class="tk-col" data-col="${s.id}"><div class="row" style="justify-content:space-between"><h3>${esc(s.name)} <span class="hint">${ts.length}</span></h3>${sectionMenu(s)}</div>
      <ul class="tk-cards">${ts.map(t => `<li class="tk-card ${t.done ? "done" : ""}" draggable="true" data-card="${t.id}">
        <div class="row" style="gap:8px; flex-wrap:nowrap; align-items:flex-start"><input type="checkbox" class="tk-check" data-tk-done="${t.id}" ${t.done ? "checked" : ""} aria-label="Concluir ${esc(t.title)}"><button class="tk-title" data-tk-open="${t.id}">${esc(t.title)}</button></div>
        <div class="row" style="justify-content:space-between; gap:6px"><span class="tk-meta">${taskMeta(t)}${subCount(t.id)}</span>
        <select class="tk-move" data-tk-move="${t.id}" aria-label="Mover para a seção">${opts(s.id)}</select></div></li>`).join("")}</ul>${addForm(s.id)}</section>`; }).join("")}
    <form class="tk-newsec tk-col"><input class="input" name="name" placeholder="+ Nova seção" aria-label="Nova seção" autocomplete="off"></form></div>`;
}
// calendário do mês: segunda a domingo; cada tarefa aparece no dia do prazo; as sem prazo ficam embaixo
function calendarView() {
  const m = PJ.month || (PJ.month = today().slice(0, 7));
  const [y, mo] = m.split("-").map(Number), first = new Date(Date.UTC(y, mo - 1, 1)), days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7, cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<div class="tk-day off"></div>`);
  for (let d = 1; d <= days; d++) {
    const iso = `${m}-${String(d).padStart(2, "0")}`, ts = PJ.data!.tasks.filter(t => t.due_date === iso);
    cells.push(`<div class="tk-day ${iso === today() ? "today" : ""}"><span class="tk-dnum">${d}</span>${ts.map(t => `<button class="tk-chip ${t.done ? "done" : dueCls(t)}" data-tk-open="${t.id}">${esc(t.title)}</button>`).join("")}</div>`);
  }
  const label = first.toLocaleDateString(LOC, { month: "long", year: "numeric", timeZone: "UTC" });
  const noDate = PJ.data!.tasks.filter(t => !t.parent_id && !t.due_date && !t.done);
  return `<div class="panel stack" style="gap:12px"><div class="row" style="justify-content:space-between"><h3>${label.charAt(0).toUpperCase() + label.slice(1)}</h3>
      <div class="row" style="gap:6px"><button class="btn sm" data-cal="-1">Anterior</button><button class="btn sm" data-cal="0">Hoje</button><button class="btn sm" data-cal="1">Próximo</button></div></div>
    <div class="tk-cal">${WEEKDAYS().map(d => `<div class="tk-wd">${d}</div>`).join("")}${cells.join("")}</div></div>
    <div class="panel stack" style="gap:8px"><h3>Sem prazo</h3>${noDate.length ? `<ul class="tk-list">${noDate.map(taskRow).join("")}</ul>` : ""}${PJ.data!.sections.length ? addForm(PJ.data!.sections[0].id) : ""}</div>`;
}
function projectBody() {
  return PJ.view === "quadro" ? boardView() : PJ.view === "calendario" ? calendarView() : listView();
}
// dias da semana (segunda a domingo) abreviados no idioma da tela: "seg", "Mon", "lun."...
const WEEKDAYS = () => Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(LOC, { weekday: "short", timeZone: "UTC" }).replace(/\.$/, ""));
const openCount = () => { const n = PJ.data!.tasks.filter(t => !t.parent_id && !t.done).length; return `${n} tarefa${n === 1 ? "" : "s"} em aberto`; };
function projectHTML() {
  const p = PJ.data!.project;
  return `<div class="stack tk-page">
  <div><a href="/projetos" class="back">← Projetos</a>
    <div class="row" style="justify-content:space-between; align-items:flex-end">
      <div><span class="label">${p.kind === "contrato" ? "Projeto do contrato" : "Projeto interno da Osmo"}</span><h1 style="font-size:clamp(1.6rem,4vw,2.2rem); margin-top:4px">${esc(p.name)}</h1>
        <p class="hint"><span id="pjCount">${openCount()}</span> · ${PJ.data!.members.map(m => esc(m.name)).join(", ")}</p></div>
      ${PJ.data!.canManage ? `<div class="row" style="gap:6px"><button class="btn sm" data-pj-ren="1">Renomear</button><button class="btn sm ghost" data-pj-del="1">Apagar projeto</button></div>` : ""}
    </div></div>
  <div class="seg" role="group" aria-label="Como ver as tarefas">${[["lista", "Lista"], ["quadro", "Quadro"], ["calendario", "Calendário"]].map(([k, l]) => `<button type="button" data-pj-view="${k}" aria-pressed="${PJ.view === k}">${l}</button>`).join("")}</div>
  <div id="pjBody" class="stack" style="gap:14px">${projectBody()}</div>
</div>`;
}
async function pjReload() {
  if (!PJ.data) return;
  try { PJ.data = await api<OsmoProjectResponse>("GET", "/api/projects/" + PJ.data!.project.id); const b = $("#pjBody"); if (b) b.innerHTML = projectBody(); const c = $("#pjCount"); if (c) c.textContent = openCount(); } catch (e) { toast(errorMessage(e)); }
}
V.projeto = async id => {
  if (needLogin()) return;
  try { PJ.data = await api<OsmoProjectResponse>("GET", "/api/projects/" + id); }
  catch (e) { if (errorStatus(e) === 404) return emptyBox("Projeto não encontrado.", "Ele não existe ou você não participa dele.", "projetos", "Ver meus projetos"); throw e; }
  return projectHTML();
};
after.projeto = () => { if (PJ.open) { const id = PJ.open; PJ.open = null; openTask(id); } };
// "Tarefas" de um contrato no Painel: descobre (ou cria) o projeto do contrato e vai para ele
V.contrato = async id => {
  if (needLogin()) return;
  const r = await api<{ id: number }>("GET", `/api/contracts/${id}/project`);
  location.replace(TR.withLanguage("#projeto-" + r.id));
};
V.projetos = async () => {
  if (needLogin()) return;
  const d = await api<{ projects: OsmoProject[]; canCreate: boolean }>("GET", "/api/projects");
  const card = (p: OsmoProject) => `<a class="panel tk-pcard" href="${url("projeto-" + (p.id))}"><span class="label">${p.kind === "contrato" ? "Contrato" : "Interno"}</span><b>${esc(p.name)}</b>
    <span class="hint">${p.open} em aberto · ${p.done} concluída${p.done === 1 ? "" : "s"}${p.late ? ` · <span class="tk-due late">${p.late} atrasada${p.late === 1 ? "" : "s"}</span>` : ""}</span></a>`;
  return `<div class="stack"><div class="row" style="justify-content:space-between; align-items:flex-end">
    <div><h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">Projetos</h1><p class="hint">Cada contrato tem um projeto para cliente e freela organizarem o trabalho.</p></div>
    <div class="row" style="gap:6px"><a class="btn" href="/tarefas">Minhas tarefas</a>${d.canCreate ? `<button class="btn hl" data-pj-new="1">Novo projeto interno</button>` : ""}</div></div>
    ${d.projects.length ? `<div class="tk-pgrid">${d.projects.map(card).join("")}</div>` : emptyBox("Nenhum projeto ainda.", "Quando um contrato começar, o projeto dele aparece aqui.", "painel", "Ir para o Painel")}</div>`;
};
V.tarefas = async () => {
  if (needLogin()) return;
  const { tasks } = await api<{ tasks: OsmoTask[] }>("GET", "/api/me/tasks");
  const t0 = today(), week = new Date(Date.now() - 3 * 3600e3 + 7 * 864e5).toISOString().slice(0, 10);
  const groups: [string, (task: OsmoTask) => unknown][] = [["Atrasadas", x => x.due_date && x.due_date < t0], ["Hoje", x => x.due_date === t0], ["Próximos 7 dias", x => x.due_date > t0 && x.due_date <= week],
    ["Mais adiante", x => x.due_date > week], ["Sem prazo", x => !x.due_date]];
  const row = (t: OsmoTask) => `<li class="tk-row"><input type="checkbox" class="tk-check" data-tk-done="${t.id}" aria-label="Concluir ${esc(t.title)}">
    <a class="tk-title" href="${url("projeto-" + (t.project_id))}" data-tk-goto="${t.id}">${esc(t.title)}</a><span class="tk-meta"><span class="hint">${esc(t.project)}</span>${t.due_date ? `<span class="tk-due ${dueCls(t)}">${fmtDue(t.due_date)}</span>` : ""}</span></li>`;
  return `<div class="stack"><div class="row" style="justify-content:space-between; align-items:flex-end">
    <div><h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">Minhas tarefas</h1><p class="hint">Tudo o que está com você e ainda não foi concluído, em todos os projetos.</p></div><div class="row" style="gap:6px"><button class="btn" data-pomo-open="1">🍅 Pomodoro</button><a class="btn" href="/projetos">Projetos</a></div></div>
    ${tasks.length ? groups.map(([g, f]) => { const ts = tasks.filter(f); return ts.length ? `<section class="panel tk-section"><h3>${g} <span class="hint">${ts.length}</span></h3><ul class="tk-list">${ts.map(row).join("")}</ul></section>` : ""; }).join("")
      : emptyBox("Nada com você agora.", "Quando alguém atribuir uma tarefa a você, ela aparece aqui.", "projetos", "Ver projetos")}</div>`;
};
// painel lateral da tarefa: tudo editável na hora (cada mudança salva sozinha), subtarefas e comentários
async function openTask(id: number) {
  let d; try { d = await api<OsmoTaskResponse>("GET", "/api/tasks/" + id); } catch (e) { return toast(errorMessage(e)); }
  const t = d.task, members = PJ.data ? PJ.data!.members : [], sections = PJ.data ? PJ.data!.sections : [];
  $("#layer").innerHTML = `<div class="scrim" id="scrim"></div><div class="drawer tk-drawer" role="dialog" aria-modal="true" aria-label="Tarefa">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="row" style="justify-content:space-between"><label class="check"><input type="checkbox" data-tk-done="${t.id}" ${t.done ? "checked" : ""}><span>${t.done ? "Concluída" : "Marcar como concluída"}</span></label><button class="btn sm ghost" data-adm-close="1">Fechar</button></div>
    <input class="input tk-bigtitle" data-tk-field="title" data-id="${t.id}" value="${esc(t.title)}" aria-label="Nome da tarefa">
    <div class="tk-grid">
      <label for="tkWho">Responsável</label><select class="input" id="tkWho" data-tk-field="assignee_id" data-id="${t.id}"><option value="">Ninguém</option>${members.map(m => `<option value="${m.id}" ${m.id === t.assignee_id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
      <label for="tkDue">Prazo</label><input class="input" type="date" id="tkDue" data-tk-field="due_date" data-id="${t.id}" value="${esc(t.due_date)}">
      ${!t.parent_id ? `<label for="tkSec">Seção</label><select class="input" id="tkSec" data-tk-field="section_id" data-id="${t.id}">${sections.map(s => `<option value="${s.id}" ${s.id === t.section_id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}
    </div>
    <div class="field"><label for="tkNotes">Descrição</label><textarea class="input" id="tkNotes" rows="4" data-tk-field="notes" data-id="${t.id}" placeholder="Detalhes, links, o que conta como pronto">${esc(t.notes)}</textarea></div>
    ${!t.parent_id ? `<div class="field"><span class="flabel">Subtarefas</span><ul class="tk-list">${d.subtasks.map(s => `<li class="tk-row ${s.done ? "done" : ""}"><input type="checkbox" class="tk-check" data-tk-done="${s.id}" data-parent="${t.id}" ${s.done ? "checked" : ""} aria-label="Concluir ${esc(s.title)}"><span class="tk-title">${esc(s.title)}</span><button class="icon-btn sm" data-tk-del="${s.id}" data-parent="${t.id}" aria-label="Apagar subtarefa">×</button></li>`).join("")}</ul>
      <form class="tk-addsub" data-parent="${t.id}"><input class="input" name="title" placeholder="+ Adicionar subtarefa" aria-label="Nova subtarefa" autocomplete="off"></form></div>` : ""}
    <div class="field"><span class="flabel">Comentários</span><ul class="tk-comments">${d.comments.map(c => `<li><b>${esc(c.author || "Alguém")}</b> <span class="hint">${when(c.created_at)}</span><p>${esc(c.body).replace(/\n/g, "<br>")}</p></li>`).join("") || `<li class="hint">Nenhum comentário ainda.</li>`}</ul>
      <form class="tk-comment" data-id="${t.id}"><textarea class="input" name="body" rows="2" placeholder="Escreva um comentário" aria-label="Comentário"></textarea><button class="btn sm hl" type="submit">Comentar</button></form></div>
    <div><button class="btn sm ghost" data-tk-del="${t.id}">Apagar tarefa</button></div>
  </div>`;
}
const tkPut = (id: OsmoId | null | undefined, body: unknown) => api("PUT", "/api/tasks/" + id, body);
document.addEventListener("click", async e => { const target = eventElement(e); if (!target) return;
  const t = target;
  const v = t.closest<HTMLElement>("[data-pj-view]"); if (v) { PJ.view = v.dataset.pjView!; store.set("pj-view", PJ.view); $$("[data-pj-view]").forEach(b => b.setAttribute("aria-pressed", String(b === v))); $("#pjBody").innerHTML = projectBody(); return; }
  const cal = t.closest<HTMLElement>("[data-cal]"); if (cal) { const n = Number(cal.dataset.cal); if (!n) PJ.month = today().slice(0, 7); else { const [y, m] = PJ.month!.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); PJ.month = d.toISOString().slice(0, 7); } $("#pjBody").innerHTML = projectBody(); return; }
  const op = t.closest<HTMLElement>("[data-tk-open]"); if (op) return openTask(Number(op.dataset.tkOpen));
  const gt = t.closest<HTMLElement>("[data-tk-goto]"); if (gt) { PJ.open = Number(gt.dataset.tkGoto); return; } // o link segue para o projeto, que abre a tarefa
  const del = t.closest<HTMLElement>("[data-tk-del]"); if (del) {
    if (!await confirmSheet({ title: "Apagar esta tarefa?", text: "As subtarefas e os comentários dela também somem.", ok: "Apagar" })) return;
    try { await api("DELETE", "/api/tasks/" + del.dataset.tkDel); } catch (err) { return toast(errorMessage(err)); }
    if (del.dataset.parent) openTask(Number(del.dataset.parent)); else $("#layer").innerHTML = "";
    return pjReload();
  }
  const sm = t.closest<HTMLElement>("[data-sec-move]"); if (sm) { try { await api("PUT", "/api/sections/" + sm.dataset.secMove, { dir: Number(sm.dataset.dir) }); } catch (err) { toast(errorMessage(err)); } return pjReload(); }
  const sr = t.closest<HTMLElement>("[data-sec-ren]"); if (sr) { const s = PJ.data!.sections.find(x => x.id === Number(sr.dataset.secRen))!; const name = prompt(TR.t("Novo nome da seção"), s.name); if (name && name.trim()) { try { await api("PUT", "/api/sections/" + s.id, { name }); } catch (err) { toast(errorMessage(err)); } pjReload(); } return; }
  const sd = t.closest<HTMLElement>("[data-sec-del]"); if (sd) {
    if (!await confirmSheet({ title: "Apagar esta seção?", text: "As tarefas dela passam para a primeira seção do projeto.", ok: "Apagar" })) return;
    try { await api("DELETE", "/api/sections/" + sd.dataset.secDel); } catch (err) { toast(errorMessage(err)); } return pjReload();
  }
  if (t.closest<HTMLElement>("[data-pj-new]")) { const name = prompt(TR.t("Nome do projeto interno")); if (name && name.trim()) { try { const r = await api<{ id: number }>("POST", "/api/projects", { name }); go("projeto-" + r.id); } catch (err) { toast(errorMessage(err)); } } return; }
  if (t.closest<HTMLElement>("[data-pj-ren]")) { const name = prompt(TR.t("Novo nome do projeto"), PJ.data!.project.name); if (name && name.trim()) { try { await api("PUT", "/api/projects/" + PJ.data!.project.id, { name }); route(); } catch (err) { toast(errorMessage(err)); } } return; }
  if (t.closest<HTMLElement>("[data-pj-del]")) {
    if (!await confirmSheet({ title: `Apagar o projeto "${PJ.data!.project.name}"?`, text: "Todas as tarefas, subtarefas e comentários somem. Não dá para desfazer.", ok: "Apagar projeto" })) return;
    try { await api("DELETE", "/api/projects/" + PJ.data!.project.id); go("projetos"); } catch (err) { toast(errorMessage(err)); }
  }
});
document.addEventListener("change", async e => { const target = eventInput(e); if (!target) return;
  const t = target;
  if (t instanceof HTMLInputElement && t.dataset.tkDone) { // concluir ou reabrir, na lista, no quadro, no calendário, no painel ou em Minhas tarefas
    try { await tkPut(t.dataset.tkDone, { done: t.checked }); } catch (err) { t.checked = !t.checked; return toast(errorMessage(err)); }
    if (curH() === "tarefas") { const li = t.closest<HTMLElement>("li"); if (li) li.classList.add("done"); return; }
    if ($(".tk-drawer")) openTask(Number(t.dataset.parent || t.dataset.tkDone));
    return pjReload();
  }
  if (t.dataset.tkMove) { try { await tkPut(t.dataset.tkMove, { section_id: Number(t.value) }); } catch (err) { toast(errorMessage(err)); } return pjReload(); }
  if (t.dataset.tkField) {
    const f = t.dataset.tkField, val = f === "assignee_id" || f === "section_id" ? (t.value ? Number(t.value) : null) : t.value;
    try { await tkPut(t.dataset.id, { [f]: val }); toast("Salvo"); } catch (err) { return toast(errorMessage(err)); }
    return pjReload();
  }
});
document.addEventListener("submit", async e => { const target = eventForm(e); if (!target) return;
  const f = target, title = field(f, "title") ? field(f, "title").value.trim() : "";
  if (f.classList.contains("tk-add") && title) {
    try { await api("POST", `/api/projects/${PJ.data!.project.id}/tasks`, { title, section_id: Number(f.dataset.section) }); } catch (err) { return toast(errorMessage(err)); }
    await pjReload(); const again = $(`.tk-add[data-section="${f.dataset.section}"] input`); if (again) again.focus(); return;
  }
  if (f.classList.contains("tk-addsub") && title) {
    try { await api("POST", `/api/projects/${PJ.data!.project.id}/tasks`, { title, parent_id: Number(f.dataset.parent) }); } catch (err) { return toast(errorMessage(err)); }
    await openTask(Number(f.dataset.parent)); pjReload(); const again = $(".tk-addsub input"); if (again) again.focus(); return;
  }
  if (f.classList.contains("tk-newsec") && field(f, "name").value.trim()) {
    try { await api("POST", `/api/projects/${PJ.data!.project.id}/sections`, { name: field(f, "name").value }); } catch (err) { return toast(errorMessage(err)); }
    return pjReload();
  }
  if (f.classList.contains("tk-comment") && field(f, "body").value.trim()) {
    try { await api("POST", `/api/tasks/${f.dataset.id}/comments`, { body: field(f, "body").value }); } catch (err) { return toast(errorMessage(err)); }
    await openTask(Number(f.dataset.id)); return pjReload();
  }
});
// arrastar cartões no quadro: solta numa coluna, na altura de outro cartão, e a tarefa vai para aquela posição
let DRAG: number | null = null;
document.addEventListener("dragstart", e => { const target = eventElement(e); if (!target) return; const c = target.closest && target.closest<HTMLElement>("[data-card]"); if (!c) return; DRAG = Number(c.dataset.card); c.classList.add("dragging"); e.dataTransfer!.effectAllowed = "move"; });
document.addEventListener("dragend", e => { const target = eventElement(e); if (!target) return; const c = target.closest && target.closest<HTMLElement>("[data-card]"); if (c) c.classList.remove("dragging"); $$(".tk-col.over").forEach(x => x.classList.remove("over")); });
document.addEventListener("dragover", e => { const target = eventElement(e); if (!target) return; const col = DRAG && target.closest && target.closest<HTMLElement>("[data-col]"); if (!col) return; e.preventDefault(); $$(".tk-col.over").forEach(x => x !== col && x.classList.remove("over")); col.classList.add("over"); });
document.addEventListener("drop", async e => { const target = eventElement(e); if (!target) return;
  const col = DRAG && target.closest && target.closest<HTMLElement>("[data-col]"); if (!col) return;
  e.preventDefault();
  const cards = [...col.querySelectorAll<HTMLElement>("[data-card]")].filter(c => Number(c.dataset.card) !== DRAG);
  let index = cards.findIndex(c => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2); if (index < 0) index = cards.length;
  const id = DRAG; DRAG = null;
  try { await tkPut(id, { section_id: Number(col.dataset.col), index }); } catch (err) { toast(errorMessage(err)); }
  pjReload();
});

// SELO DE VERIFICADO: explica como funciona, pede a confirmação ("o laudo é meu") e envia o PDF
// para o servidor conferir. Se já é verificado, mostra desde quando e o botão de remover.
/* ---------- selo de verificado ---------- */
function verifyHTML(p: OsmoProfile) {
  if (p.verified) return `<div class="panel stack verify-box" style="margin-bottom:18px; gap:10px">
    <div class="row" style="gap:12px; flex-wrap:nowrap; align-items:flex-start"><span class="vbadge lg">${VB_SVG}</span><div style="flex:1; min-width:0"><b>Perfil verificado</b><p class="hint">Desde ${new Date(p.verified.replace(" ", "T") + "Z").toLocaleDateString(LOC)}. O selo verde aparece ao lado do seu nome.</p></div></div>
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
async function sendVerify(file: File) {
  const err = $("#vErr"); err.hidden = true;
  const show = (m: string) => { err.textContent = m; err.hidden = false; };
  if (!$("#vConsent").checked) return show("Marque a confirmação antes de enviar o laudo.");
  if (fileExt(file.name) !== "pdf") return show("Envie o laudo em PDF.");
  if (file.size > 10 * 1048576) return show("O PDF tem mais de 10 MB.");
  const lbl = $("#vFileLbl"); lbl.textContent = "Conferindo a assinatura…";
  let res;
  try { res = await fetch("/api/me/verify", { method: "POST", credentials: "same-origin", body: file, headers: { "X-Osmo": "1", "X-Consent": "1", "Content-Type": "application/pdf" } }); }
  catch { lbl.textContent = "Enviar laudo em PDF"; return show("Sem conexão com o servidor. Confira sua internet e tente de novo."); }
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) { lbl.textContent = "Enviar outro PDF"; return show((isRecord(data) && typeof data.error === "string" ? data.error : "") || "Não deu para conferir o laudo."); }
  await refreshMe(); toast("Perfil verificado"); route();
}

// AVISOS POR E-MAIL: as três opções (tudo, só o importante, nada) e a telinha que abre pelo
// link do rodapé do e-mail, sem precisar entrar na conta.
/* ---------- avisos por e-mail ---------- */
const NOTIFY_OPTS = [["tudo", "Tudo", "Propostas, contratos, etapas, pagamentos e mensagens das pessoas"],
  ["importante", "Só o importante", "Propostas, contratos, etapas e pagamentos. Sem mensagens de conversa"], ["nada", "Nenhum", "Não mandar e-mails de aviso"]];
const notifyOpts = (cur: string) => `<div class="field" role="radiogroup" aria-label="Avisos por e-mail">${NOTIFY_OPTS.map(([v, t, d]) =>
  `<label class="check"><input type="radio" name="notify" value="${v}" ${cur === v ? "checked" : ""}><span><b>${t}</b><br><span class="hint">${d}</span></span></label>`).join("")}</div>`;

// NOTIFICAÇÕES NESTE APARELHO (push): o aviso que aparece no celular ou no computador mesmo
// com o site fechado. Regras combinadas:
// - a permissão do navegador SÓ é pedida quando a pessoa toca em "Ativar" (nunca ao abrir o site);
// - mostramos em que pé está: ativado, bloqueado no navegador, não suportado ou "instale primeiro"
//   (no iPhone e no iPad, a Apple só deixa receber com o site instalado na tela de início);
// - a escolha tudo / só o importante / nenhum vale também aqui: "Nenhum" desliga as notificações.
// Cada aparelho se inscreve separado; o servidor guarda uma linha por aparelho.
/* ---------- notificações neste aparelho (push) ---------- */
// isIOS e isInstalled moram lá embaixo, junto com o "app instalável"
const pushKey = () => Uint8Array.from(atob(PUSH.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const deviceName = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) || isIOS() ? "iPad" : /Android/.test(u) ? "Android" : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : /Linux/.test(u) ? "Linux" : ""; };
// o ajudante (sw.js) registrado e já ligado; sem ele não existe push
async function swReady() {
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}
// em que pé estão as notificações NESTE navegador (sem pedir nada à pessoa)
async function pushState() {
  if (isIOS() && !isInstalled()) return { s: "ios" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { s: "unsupported" };
  if (Notification.permission === "denied") return { s: "denied" };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return { s: sub && Notification.permission === "granted" && sameKey(sub) ? "on" : "off", sub };
}
// a inscrição foi feita com a chave atual do servidor? (se a Osmo trocar as chaves, as antigas param de funcionar)
function sameKey(sub: PushSubscription) {
  const old = sub.options && sub.options.applicationServerKey && new Uint8Array(sub.options.applicationServerKey), key = pushKey();
  return !old || (old.length === key.length && old.every((b, i) => b === key[i]));
}
const pushFieldHTML = () => `<div class="field"><span class="flabel">Notificações neste aparelho</span>
  <div id="pushBox" class="stack" style="gap:8px" aria-live="polite"><p class="hint">Verificando este aparelho…</p></div></div>`;
async function refreshPushBox() {
  const box = $("#pushBox"); if (!box) return;
  let st; try { st = await pushState(); } catch { st = { s: "unsupported" }; }
  const btn = (act: string, label: string, cls = "") => `<button type="button" class="btn sm ${cls}" data-act="${act}">${label}</button>`;
  const same = `<p class="hint">Vale a mesma escolha de cima: “Nenhum” desliga também as notificações.</p>`;
  box.innerHTML = {
    on: `<p><span class="status ok">Ativadas neste aparelho</span></p><div class="row">${btn("push-test", "Enviar um teste")}${btn("push-off", "Desativar", "ghost")}</div>${same}`,
    off: `<p class="hint">Receba no celular ou no computador os mesmos avisos do e-mail, mesmo com o site fechado.</p><div class="row">${btn("push-on", "Ativar notificações neste aparelho", "hl")}</div>${same}`,
    denied: `<p><span class="status wait">Bloqueadas no navegador</span></p><p class="hint">Para receber, libere as notificações deste site nas configurações do navegador e volte aqui.</p>`,
    unsupported: `<p class="hint">Este navegador não recebe notificações. Tente o Chrome, o Edge, o Firefox ou o Safari atualizado.</p>`,
    ios: `<p class="hint">No iPhone e no iPad, as notificações só funcionam com a Osmo instalada na tela de início. Toque em Compartilhar e depois em “Adicionar à Tela de Início”. Depois abra a Osmo pelo ícone novo e ative aqui.</p>`,
  }[st.s as "on" | "off" | "denied" | "unsupported" | "ios"];
  // já inscrito: reenvia a inscrição em silêncio (o servidor pode ter apagado, ou outra conta usou este navegador)
  if (st.s === "on") api("POST", "/api/push/subscribe", { subscription: st.sub!.toJSON(), device: deviceName() }).catch(() => {});
}
after.perfil = () => {
  if (PUSH) refreshPushBox();
  if (PAY.provider === "stripe" && (ME?.role === "freela" || ME?.roles?.includes("freela")) && ME.payout?.connected && !ME.payout.active) {
    api<{ payout: OsmoUser["payout"] }>("POST", "/api/me/payout/sync", {}).then(r => {
      if (r.payout?.active && ME) {
        ME.payout = r.payout;
        updateProfMeta();
        const box = $("#payoutBox"); if (box) box.outerHTML = payoutHTML();
        toast("Conta Stripe verificada e ativa!");
      }
    }).catch(() => {});
  }
};
async function pushOn() {
  try {
    const perm = await Notification.requestPermission(); // o pedido do navegador aparece só agora, depois do toque
    if (perm !== "granted") { if (perm === "denied") toast("Notificações bloqueadas no navegador"); return; }
    const reg = await swReady(), key = pushKey();
    let sub = await reg.pushManager.getSubscription();
    // se a chave do servidor mudou, a inscrição antiga não serve mais: desfaz e faz de novo
    if (sub && !sameKey(sub)) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api("POST", "/api/push/subscribe", { subscription: sub.toJSON(), device: deviceName() });
    toast("Notificações ativadas neste aparelho");
  } catch (e) { toast(errorStatus(e) ? errorMessage(e) : "Não deu para ativar as notificações neste navegador."); }
  finally { refreshPushBox(); }
}
// desliga neste aparelho (também usado ao sair da conta, para o próximo a usar o navegador não receber os seus avisos)
async function pushOff(quiet = false) {
  try {
    const reg = "serviceWorker" in navigator && await navigator.serviceWorker.getRegistration();
    const sub = reg && reg.pushManager && await reg.pushManager.getSubscription();
    if (!sub) return;
    await api("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
    if (!quiet) toast("Notificações desativadas neste aparelho");
  } catch {} finally { if (!quiet) refreshPushBox(); }
}
async function pushTest() {
  try {
    const reg = await navigator.serviceWorker.getRegistration(), sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return refreshPushBox();
    const r = await api<{ ok: boolean; gone: boolean; status: number }>("POST", "/api/push/test", { endpoint: sub.endpoint });
    // ok: o correio de avisos (Apple, Google...) aceitou; gone: a inscrição morreu; outro código: o correio recusou
    toast(r.ok ? "Teste enviado. Deve aparecer em instantes." : r.gone ? "O navegador não aceitou o teste. Ative as notificações de novo."
      : `O serviço de notificações recusou o teste (código ${r.status}). Avise a Osmo.`);
    if (r.gone) { await sub.unsubscribe().catch(() => {}); refreshPushBox(); }
  } catch (e) { toast(errorMessage(e)); }
}
// tocar numa notificação com o site já aberto: o sw.js manda o endereço e a própria aba vai até lá
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => {
  const data: unknown = e.data;
  const p = isRecord(data) && data.type === "osmo-open" && data.path;
  if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//")) return;
  const destination = TR.withLanguage(p);
  if (destination !== location.pathname + location.search + location.hash) history.pushState(null, "", destination);
  route();
});

V.avisos = async () => {
  const token = curH().split("-")[1] || "";
  const d = await api<{ name: string; level: string }>("GET", "/api/notify?token=" + encodeURIComponent(token));
  return `<div class="auth stack">
  <div><span class="label">Avisos por e-mail</span><h1 style="font-size:clamp(1.8rem,4vw,2.4rem); margin-top:8px">O que você quer receber?</h1>
  <p class="muted" style="margin-top:8px">Conta de ${esc(d.name)}. Dá para mudar quando quiser, aqui ou em Meu perfil.</p></div>
  <form class="panel stack" id="notifyForm" data-token="${esc(token)}">${notifyOpts(d.level)}
    <button class="btn hl" type="submit">Salvar</button></form></div>`;
};

// MEU PERFIL: shrinkImage diminui a foto NO PRÓPRIO CELULAR antes de enviar (mais rápido e
// gasta menos internet), recortando um quadrado do meio para a foto de perfil.
/* ---------- perfil ---------- */
// abre a imagem escolhida e reduz no navegador antes de enviar (square: recorta o centro em quadrado)
async function shrinkImage(file: File, max: number, square: boolean) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 25e6) throw new Error("Essa imagem é grande demais. Tente outra.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Não deu para abrir essa imagem. Tente uma foto JPG ou PNG.")); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight, side = Math.min(W, H);
    const sw = square ? side : W, sh = square ? side : H, k = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement("canvas"); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
  } finally { URL.revokeObjectURL(url); }
}
async function uploadAvatar(file: File) {
  const err = $("#avatarErr"); err.hidden = true;
  try {
    const r = await api<{ avatar: string }>("PUT", "/api/me/avatar", { image: await shrinkImage(file, 512, true) });
    ME!.profile.avatar = r.avatar; toast("Foto salva"); route();
  } catch (e) { err.textContent = errorMessage(e); err.hidden = false; }
}

// PORTFÓLIO NO PERFIL: cada projeto é salvo na hora, separado do resto do formulário.
// PE guarda o projeto que está sendo editado (título, link, imagem nova ou "tirar imagem").
/* portfólio: cada projeto salva na hora, fora do formulário do perfil */
let PE: OsmoPortfolioEdit | null = null; // projeto sendo editado: { id, title, link, image (endereço ou data:), newImage, removeImage }
function portBoxHTML() {
  const items = ME!.profile.portfolio, full = items.length >= 12;
  const list = items.map((it, i) => `<div class="port-row">
      ${it.image ? `<img src="${esc(it.image)}" alt="" class="port-thumb">` : `<div class="port-thumb ptile t${i % 3}" aria-hidden="true"></div>`}
      <div style="min-width:0"><b>${esc(it.title)}</b>${it.link ? `<p class="hint port-link">${esc(it.link)}</p>` : ""}</div>
      <div class="row" style="gap:6px; justify-content:flex-end">
        <button type="button" class="icon-btn sm" data-act="port-move" data-id="${it.id}" data-dir="-1" aria-label="Subir ${esc(it.title)}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="icon-btn sm" data-act="port-move" data-id="${it.id}" data-dir="1" aria-label="Descer ${esc(it.title)}" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="btn sm" data-act="port-edit" data-id="${it.id}">Editar</button>
        <button type="button" class="btn sm ghost" data-act="port-del" data-id="${it.id}">Remover</button></div></div>`).join("");
  const editor = PE ? `<div class="panel stack port-editor" style="gap:12px">
      <b>${PE!.id ? "Editar projeto" : "Novo projeto"}</b>
      <div class="field"><label for="pe_title">Nome do projeto</label><input class="input" id="pe_title" maxlength="80" value="${esc(PE!.title)}" placeholder="Ex.: Identidade visual da Padaria Trigal"></div>
      <div class="field"><label for="pe_link">Link (opcional)</label><input class="input" id="pe_link" type="url" maxlength="300" value="${esc(PE!.link)}" placeholder="https://"><span class="hint">Behance, Dribbble, site, PDF no Drive...</span></div>
      <div class="field"><span class="flabel">Imagem (opcional)</span>
        <div class="row">${PE!.image && !PE!.removeImage ? `<img src="${esc(PE!.image)}" alt="Imagem escolhida" class="port-thumb lg">` : ""}
          <label class="btn sm" for="peImg">${PE!.image && !PE!.removeImage ? "Trocar imagem" : "Escolher imagem"}</label><input type="file" id="peImg" accept="image/*" class="sr-only">
          ${PE!.image && !PE!.removeImage ? `<button type="button" class="btn sm ghost" data-act="port-img-del">Tirar imagem</button>` : ""}</div>
        <span class="hint">JPG, PNG ou foto do celular. A gente reduz o tamanho antes de enviar.</span></div>
      <div id="peErr" class="err" role="alert" hidden></div>
      <div class="row"><button type="button" class="btn hl" data-act="port-save">Salvar projeto</button><button type="button" class="btn ghost" data-act="port-cancel">Cancelar</button></div></div>`
    : full ? `<p class="hint">O portfólio tem espaço para 12 projetos. Remova um para adicionar outro.</p>` : `<div><button type="button" class="btn" data-act="port-new">+ Adicionar projeto</button></div>`;
  return `<p class="muted">Até 12 projetos, na ordem que você escolher. Cada projeto salva na hora.</p>
    ${items.length ? `<div class="stack" style="gap:0">${list}</div>` : `<p class="hint">Nenhum projeto ainda.</p>`}${editor}`;
}
function renderPort(focusId?: string) { const b = $("#portBox"); if (!b) return; b.innerHTML = portBoxHTML(); updateProfMeta(); if (focusId) { const el = $("#" + focusId); if (el) el.focus(); } }
function syncPE() { if (!PE) return; const t = $("#pe_title"), l = $("#pe_link"); if (t) PE!.title = t.value; if (l) PE!.link = l.value; }
// O perfil é dividido em seções que abrem e fecham. profMeta calcula o "% completo" e o
// resumo de cada seção fechada; updateProfMeta atualiza isso depois de salvar, sem redesenhar
// a tela inteira (você continua exatamente onde estava).
// perfil em seções: no celular começam fechadas (cada uma com um resumo); no computador, abertas como antes
const PSEC_OPEN = new Set<string>();
function profMeta(p: OsmoProfile) {
  const isF = ME!.role === "freela", how = [p.how.com, p.how.resp, p.how.fb, p.how.foco].filter(Boolean).length;
  const items = isF ? [["foto", !!p.avatar], ["o que você faz", !!p.title], ["valor por hora", p.rate > 0], ["habilidades", p.skills.length > 0],
    ["sobre você", !!p.bio], ["como você trabalha", how >= 2], ["portfólio", p.portfolio.length > 0]] : [];
  const pct = items.length ? Math.round(items.filter(i => i[1]).length / items.length * 100) : 100;
  const NOTE: Record<string, string> = { tudo: "Tudo", importante: "Só o importante", nada: "Nenhum" };
  return {
    pct, missing: items.filter(i => !i[1]).map(i => i[0]),
    sum: {
      sobre: isF ? (p.title || "Conte o que você faz") : (p.company || "Empresa ou projeto"),
      como: `${how} de 4 preenchidos`,
      habil: p.skills.length ? p.skills.slice(0, 3).join(", ") + (p.skills.length > 3 ? ` e mais ${p.skills.length - 3}` : "") : "Nenhuma ainda",
      port: p.portfolio.length ? `${p.portfolio.length} ${p.portfolio.length === 1 ? "projeto" : "projetos"}` : "Nenhum projeto ainda",
      selo: p.verified ? "Verificado" : "Opcional",
      receb: ME!.payout?.active ? "Conta ativa" : ME!.payout?.connected ? "Verificação pendente" : (isF || ME!.roles?.includes("freela")) ? "Ainda não ativado" : `${PAY.provider === "stripe" ? "Stripe" : "Asaas"} ativo`,
      avisos: NOTE[ME!.notify || "tudo"],
    },
  };
}
function complHTML(m: ReturnType<typeof profMeta>) {
  if (m.pct >= 100) return "";
  return `<span class="label">Perfil ${m.pct}% completo</span><span class="bar ${m.pct >= 80 ? "" : m.pct >= 50 ? "mid" : "low"}" style="width:100%; height:8px"><i style="width:${m.pct}%"></i></span>
    <p class="hint">Falta: ${m.missing.join(", ")}. Perfis completos recebem mais convites.</p>`;
}
// atualiza resumo das seções e o "% completo" sem redesenhar a tela (a pessoa continua onde estava)
function updateProfMeta() {
  if (!ME || !$("#profForm")) return;
  const m = profMeta(ME!.profile), box = $("#pcompl");
  if (box) { box.innerHTML = complHTML(m); box.hidden = m.pct >= 100; }
  for (const [k, v] of Object.entries(m.sum)) { const el = $(`[data-sum="${k}"]`); if (el) el.textContent = v; }
}
V.perfil = async () => {
  if (needLogin()) return;
  PE = null;
  const p = ME!.profile, isF = ME!.role === "freela", m = profMeta(p);
  const f = (id: string, label: string, val: unknown, attrs = "", hint = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" value="${esc(val)}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const ta = (id: string, label: string, val: unknown, rows = 4, hint = "", ph = "") => `<div class="field"><label for="${id}">${label}</label><textarea class="input" id="${id}" rows="${rows}"${ph ? ` placeholder="${esc(ph)}"` : ""}>${esc(val)}</textarea>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  const open = (id: string) => !isMobile() || PSEC_OPEN.has(id) ? "open" : "";
  const sec = (id: string, title: string, body: string, intro = "") => `<details class="panel psec" data-sec="${id}" ${open(id)}>
    <summary><span class="psec-h"><h2>${title}</h2><span class="hint" data-sum="${id}">${esc(m.sum[id as keyof typeof m.sum])}</span></span></summary>
    <div class="psec-b stack">${intro ? `<p class="muted">${intro}</p>` : ""}${body}</div></details>`;
  const save = `<div><button class="btn hl" type="submit">Salvar</button></div>`;
  return `<div class="wiz"><div class="row" style="justify-content:space-between; margin-bottom:18px"><h1 style="font-size:clamp(1.8rem,4vw,2.4rem)">Meu perfil</h1>${isF ? `<button class="btn sm" data-go="talento-${ME!.id}">Ver como os outros veem</button>` : ""}</div>
  ${isF ? `<div class="panel stack" id="pcompl" style="gap:8px; margin-bottom:18px" ${m.pct >= 100 ? "hidden" : ""}>${complHTML(m)}</div>` : ""}
  <div class="panel avatar-edit" style="margin-bottom:18px"><div id="avatarBox">${av(ME!.name, ME!.id, "lg", p.avatar)}</div>
    <div class="stack" style="gap:8px"><b>${isF ? "Sua foto" : "Foto ou logo da empresa"} <span class="muted" style="font-weight:400">(opcional)</span></b>
      <p class="hint">JPG, PNG ou foto do celular. A gente recorta em quadrado e reduz o tamanho.</p>
      <div class="row"><label class="btn sm" for="avatarIn">${p.avatar ? "Trocar foto" : "Escolher foto"}</label><input type="file" id="avatarIn" accept="image/*" class="sr-only">
      ${p.avatar ? `<button type="button" class="btn sm ghost" data-act="avatar-del">Remover</button>` : ""}</div>
      <div id="avatarErr" class="err" role="alert" hidden></div></div></div>
  <form class="stack" id="profForm">
    ${isF ? `<div class="panel stack" style="gap:10px"><label class="check"><input type="checkbox" id="p_searchVisible" ${p.searchVisible ? "checked" : ""}><span>Permitir que buscadores encontrem meu perfil público</span></label><p class="hint">Ao ativar, as informações do seu perfil público podem aparecer em buscadores e fora da plataforma. A indexação depende dos buscadores e pode levar algum tempo para mudar. Evite incluir informações pessoais que não queira divulgar.</p>${save}</div>` : ""}
    ${sec("sobre", isF ? "Sobre você" : "Sobre a empresa", f("p_name", isF ? "Nome" : "Seu nome", ME!.name, 'autocomplete="name" placeholder="Nome e sobrenome"')
      + (isF ? f("p_title", "O que você faz", p.title, 'placeholder="Ex.: Designer de marca e embalagem"')
        + `<div class="row" style="align-items:flex-start">${f("p_rate", "Valor por hora (R$)", p.rate || "", 'inputmode="numeric" class="input mono" placeholder="Ex.: 80"', "Só números. Dá para negociar em cada proposta.")}${f("p_hours", "Horas por semana", p.hours, 'inputmode="numeric" placeholder="Ex.: 20"', "Define quantas propostas você pode ter abertas.")}</div>`
        + f("p_loc", "Cidade", p.location, 'autocomplete="address-level2" placeholder="Ex.: Recife, PE"') + ta("p_bio", "Sobre você", p.bio, 4, "", "Em 2 ou 3 frases: o que você faz, para quem e um trabalho de que se orgulha.")
        : f("p_company", "Empresa ou projeto", p.company, 'autocomplete="organization" placeholder="Ex.: Padaria Trigal"', "Se contrata como pessoa física, pode deixar em branco.")
          + f("p_doc", "CPF ou CNPJ", "", 'inputmode="numeric" placeholder="' + (ME!.hasDoc ? "Já informado. Preencha só para trocar." : "Só números") + '"', "Usado apenas para emitir as cobranças das etapas."))
      + save)}
    ${isF ? sec("habil", "Habilidades", `<div class="field"><span class="flabel" id="p_skills_lbl">O que você sabe fazer</span>${skillBoxHTML({ value: p.skills.join(", "), max: 12 })}</div>` + save,
      "Aparecem no seu perfil e ajudam quem contrata a te encontrar na busca. A lista vem das áreas mais procuradas em plataformas de freelance.") : ""}
    ${isF ? sec("como", "Como eu trabalho melhor",
      f("w_com", "Comunicação", p.how.com, 'placeholder="Ex.: Texto primeiro. Chamadas só com pauta."')
      + f("w_resp", "Tempo de resposta", p.how.resp, 'placeholder="Ex.: Até 1 dia útil"')
      + f("w_fb", "Formato de feedback", p.how.fb, 'placeholder="Ex.: Lista numerada"')
      + f("w_foco", "Ritmo", p.how.foco, 'placeholder="Ex.: Entregas a cada 2 ou 3 dias"')
      + f("p_tag", "Identificação (opcional)", p.tag, 'placeholder="Ex.: TDAH · entregas curtas"', "Só preencha se quiser. Aparece como um selo no seu perfil.")
      + save, "Aparece no seu perfil e nas suas propostas. Quem contrata lê antes de chamar.") : ""}
    ${MAIL || PUSH ? sec("avisos", PUSH ? "Avisos" : "Avisos por e-mail", notifyOpts(ME!.notify || "tudo") + (PUSH ? pushFieldHTML() : "") + save,
      MAIL ? "Mandamos um e-mail só quando você ainda não viu a novidade no site, juntando tudo que chegou junto." : "Avisamos só quando você ainda não viu a novidade no site, juntando tudo que chegou junto.") : ""}
    <div id="profErr" class="err" role="alert" hidden></div>
  </form>
  ${isF ? `<div class="stack" style="margin-top:18px">
    ${sec("port", "Portfólio", `<div class="stack" id="portBox">${portBoxHTML()}</div>`)}
    ${sec("selo", "Selo de verificado", verifyHTML(p))}
    ${PAY.enabled ? sec("receb", "Receber pagamentos", payoutHTML()) : ""}</div>`
  : PAY.enabled ? `<div class="stack" style="margin-top:18px">${sec("receb", "Pagamentos e recebimentos",
    `<div class="panel stack" style="gap:10px"><h2>Pagamentos ${PAY.provider === "stripe" ? "pela Stripe" : "pelo Asaas"}${PAY.sandbox ? " · modo de testes" : ""}</h2><p><span class="status ok">Checkout ${PAY.provider === "stripe" ? "Stripe" : "Asaas"} ativo</span></p><p class="muted">Como cliente, você paga cada etapa direto pelo Checkout da ${PAY.provider === "stripe" ? "Stripe" : "Asaas"} dentro do contrato e libera os 90% ao talento somente quando aprovar a entrega.</p><div class="row"><button class="btn sm hl" type="button" data-act="switch-role" data-role="freela" data-back="perfil">${ME!.roles?.includes("freela") ? "Trocar para Freelancer e configurar recebimento Stripe" : "Ativar perfil de Freelancer para receber pagamentos"}</button></div></div>`)}</div>` : ""}
  <div class="row" style="margin-top:18px"><button class="btn ghost" type="button" data-act="logout">Sair da conta</button></div></div>`;
};
document.addEventListener("toggle", e => { const target = eventElement(e); if (!target) return;
  const d = target as HTMLDetailsElement; if (!d.classList || !d.classList.contains("psec")) return;
  d.open ? PSEC_OPEN.add(d.dataset.sec!) : PSEC_OPEN.delete(d.dataset.sec!);
}, true);

// CPF ou CNPJ: pelo número de dígitos já dá para saber qual é, então mostramos só o campo que
// vale para aquele caso (nascimento para CPF, tipo de empresa para CNPJ). Enquanto não dá para
// saber, os dois ficam à vista.
function payoutDocKind() {
  const n = ($("#po_doc")?.value || "").replace(/\D/g, "").length, b = $("#poBirthBox"), t = $("#poTypeBox");
  if (b) b.hidden = n > 11; if (t) t.hidden = n > 0 && n <= 11;
}
function payoutHTML() {
  if (PAY.provider === "stripe") {
    const mode = PAY.sandbox ? " · modo de testes" : "";
    if (ME!.payout?.active) return `<div class="panel stack" id="payoutBox" style="gap:10px"><h2>Receber pela Stripe${mode}</h2><p><span class="status ok">Conta Stripe ativa</span></p>
      <p class="muted">Sua conta está pronta para receber. Cada etapa é cobrada antes do início e 90% do valor bruto é transferido automaticamente após a aprovação explícita do cliente.</p>
      <div class="row"><button class="btn sm" type="button" data-act="payout">Atualizar dados na Stripe</button></div></div>`;
    if (ME!.payout?.connected) return `<div class="panel stack" id="payoutBox" style="gap:10px"><h2>Receber pela Stripe${mode}</h2><p><span class="status wait">Verificação pendente na Stripe</span></p>
      <p class="muted">Você já iniciou a conexão, mas a Stripe ainda aguarda a conclusão da verificação de transferências e repasses (payouts) para liberar cobranças nas suas etapas.</p>
      <div class="row" style="gap:8px; flex-wrap:wrap"><button class="btn hl" type="button" data-act="payout">Continuar cadastro na Stripe</button><button class="btn" type="button" data-act="payout-sync">Já concluí · verificar agora</button></div></div>`;
    return `<div class="panel stack" id="payoutBox"><h2>Receber pela Stripe${mode}</h2><p>Conecte sua conta na Stripe para receber pelas etapas entregues. Cada etapa é cobrada antes do início e o repasse de 90% é liberado mediante aprovação explícita do cliente. A Osmo assume as taxas da Stripe.</p><button class="btn hl" type="button" data-act="payout">Conectar conta Stripe</button></div>`;
  }
  if (ME!.payout && !ME!.payout.active) return `<div class="panel stack"><h2>Receber pagamentos</h2><p>A ativação da garantia está pendente. Os recebimentos estão bloqueados até a conclusão.</p><button class="btn hl" type="button" data-act="payout">Tentar ativar novamente</button></div>`;
  if (ME!.payout?.active) return `<div class="panel stack" style="gap:8px"><h2>Receber pagamentos</h2><p><span class="status ok">Conta de recebimento ativa</span></p>
    <p class="muted">Os valores das etapas chegam na sua conta Asaas e ficam protegidos até a aprovação. Para sacar, entre no Asaas pelo e-mail de ativação que você recebeu.</p></div>`;
  const i = (id: string, label: string, attrs = "", hint = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  return `<div class="panel stack" id="payoutBox"><div><h2>Receber pagamentos</h2><p class="muted">Para receber, criamos uma conta no Asaas em seu nome. Depois o Asaas manda um e-mail para você enviar um documento com foto. É feito uma vez só.</p></div>
    ${i("po_doc", "CPF ou CNPJ", 'inputmode="numeric" autocomplete="off" maxlength="18" placeholder="11 dígitos (CPF) ou 14 (CNPJ)"', "Só números.")}
    <div class="row" style="align-items:flex-start">
      <div style="flex:1; min-width:160px" id="poBirthBox">${i("po_birth", "Data de nascimento", 'type="date"', "Só para CPF.")}</div>
      <div style="flex:1; min-width:160px" id="poTypeBox"><div class="field"><label for="po_type">Tipo de empresa</label><select class="input" id="po_type"><option value="MEI">MEI</option><option value="INDIVIDUAL">Empresário individual</option><option value="LIMITED">Limitada</option></select><span class="hint">Só para CNPJ.</span></div></div>
    </div>
    <div class="row" style="align-items:flex-start">
      <div style="flex:1; min-width:160px">${i("po_phone", "Celular com DDD", 'inputmode="tel" autocomplete="tel" placeholder="Ex.: 11 91234-5678"')}</div>
      <div style="flex:1; min-width:160px">${i("po_income", "Renda ou faturamento mensal (R$)", 'inputmode="numeric" placeholder="Ex.: 5000"', "Exigido pelo Banco Central.")}</div>
    </div>
    <div class="row" style="align-items:flex-start">
      <div style="flex:1; min-width:140px">${i("po_cep", "CEP", 'inputmode="numeric" autocomplete="postal-code" placeholder="Ex.: 01310-100"')}</div>
      <div style="flex:2; min-width:200px">${i("po_addr", "Rua", 'autocomplete="address-line1" placeholder="Ex.: Avenida Paulista"')}</div>
    </div>
    <div class="row" style="align-items:flex-start">
      <div style="flex:1; min-width:120px">${i("po_num", "Número", 'placeholder="Ex.: 1000 ou s/n"')}</div>
      <div style="flex:1; min-width:160px">${i("po_comp", "Complemento", 'autocomplete="address-line2" placeholder="Ex.: Apto 42 (opcional)"')}</div>
      <div style="flex:2; min-width:160px">${i("po_prov", "Bairro", 'placeholder="Ex.: Bela Vista"')}</div>
    </div>
    <div id="poErr" class="err" role="alert" hidden></div>
    <button class="btn hl" type="button" data-act="payout">Ativar recebimentos</button></div>`;
}

// ANEXOS DA VAGA: confere o tipo e o tamanho ANTES de enviar (para avisar logo), manda cada
// arquivo e desenha a lista. Na hora de publicar, os arquivos esperam na memória (PFILES) e
// sobem logo depois que a vaga é criada.
/* ---------- arquivos do briefing ---------- */
const FILE_EXTS = ["pdf", "ai", "psd", "png", "jpg", "jpeg", "webp", "docx", "xlsx", "pptx", "odt", "ods", "odp", "txt", "csv", "md"];
const FILE_ACCEPT = FILE_EXTS.map(e => "." + e).join(",");
const fileExt = (n: unknown) => (String(n).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
const fileSize = (b: number) => b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1).replace(".", ",") + " MB";
function checkFile(f: File) {
  if (!FILE_EXTS.includes(fileExt(f.name))) return `"${f.name}": tipo não aceito. Envie PDF, imagem, PSD, AI, Word, Excel, PowerPoint ou texto.`;
  if (f.size > 10 * 1048576) return `"${f.name}" tem ${fileSize(f.size)}. O limite é 10 MB por arquivo.`;
  if (!f.size) return `"${f.name}" está vazio.`;
  return "";
}
const uploadFile = (jobId: number, f: File) => uploadTo(`/api/jobs/${jobId}/files`, f);
async function uploadTo(path: string, f: File) {
  let res;
  try { res = await fetch(path, { method: "POST", credentials: "same-origin", body: f,
    headers: { "X-Osmo": "1", "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(f.name) } }); }
  catch { throw new Error("Sem conexão com o servidor. Confira sua internet e tente de novo."); }
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((isRecord(data) && typeof data.error === "string" ? data.error : "") || (res.status === 413 ? `"${f.name}" é grande demais.` : "Não deu para enviar o arquivo."));
  return isRecord(data) && Array.isArray(data.files) ? data.files as OsmoAttachment[] : [];
}
async function addJobFiles(jobId: number, files: File[]) {
  const errs = [];
  for (const [i, f] of files.entries()) {
    const e2 = checkFile(f); if (e2) { errs.push(e2); continue; }
    toast(`Enviando ${i + 1} de ${files.length}: ${f.name}`);
    try { await uploadFile(jobId, f); } catch (e3) { errs.push(errorMessage(e3)); }
  }
  await route();
  if (errs.length) { const b = $("#jFilesErr"); if (b) { b.textContent = errs.join(" "); b.hidden = false; } } else toast("Arquivos anexados");
}
const fileRow = (f: { id?: number; name: string; size: number; ext?: string; idx?: number }, owner: boolean | null, jobId?: number) => `<li class="file-row"><span class="file-ext" aria-hidden="true">${esc(f.ext || fileExt(f.name))}</span>
  ${f.id ? `<a href="/arquivo/${f.id}" target="_blank" rel="noopener">${esc(f.name)}</a>` : `<span>${esc(f.name)}</span>`}<span class="hint">${fileSize(f.size)}</span>
  ${owner ? `<button type="button" class="btn sm ghost" data-act="${f.id ? "file-del" : "pfile-del"}" data-id="${f.id || 0}" data-job="${jobId || 0}" data-name="${esc(f.name)}" aria-label="Remover ${esc(f.name)}">Remover</button>` : ""}</li>`;
// ANEXOS DE PROPOSTA, MENSAGEM E ETAPA: são particulares (só os dois lados abrem) e moram em
// /arquivo/a/N. attList desenha a lista; delUrl(f), quando devolve um endereço, mostra o botão
// Remover. attPicker é o botão "Anexar arquivo": o <input> leva no data-upload o endereço para
// onde os arquivos sobem, e o ouvido de "change" lá embaixo faz o resto (addAtts).
const attRow = (f: OsmoAttachment, del?: string | null) => `<li class="file-row"><span class="file-ext" aria-hidden="true">${esc(f.ext || fileExt(f.name))}</span>
  <a href="/arquivo/a/${f.id}" target="_blank" rel="noopener">${esc(f.name)}</a><span class="hint">${fileSize(f.size)}</span>
  ${del ? `<button type="button" class="btn sm ghost" data-act="att-del" data-url="${esc(del)}" data-name="${esc(f.name)}" aria-label="Remover ${esc(f.name)}">Remover</button>` : ""}</li>`;
const attList = (files: OsmoAttachment[], delUrl?: ((file: OsmoAttachment) => string) | null) => files && files.length ? `<ul class="files">${files.map(f => attRow(f, delUrl && delUrl(f))).join("")}</ul>` : "";
const attPicker = (inputId: string, path: string, errId: string, label = "Anexar arquivo") => `<div><label class="btn sm" for="${inputId}">${label}</label><input type="file" id="${inputId}" data-upload="${esc(path)}" data-err="${errId}" multiple accept="${FILE_ACCEPT}" class="sr-only"></div>`;
async function addAtts(path: string, files: File[], errId?: string) {
  const errs = [];
  for (const [i, f] of files.entries()) {
    const e2 = checkFile(f); if (e2) { errs.push(e2); continue; }
    toast(`Enviando ${i + 1} de ${files.length}: ${f.name}`);
    try { await uploadTo(path, f); } catch (e3) { errs.push(errorMessage(e3)); }
  }
  await route();
  if (errs.length) { const b = errId && $("#" + errId); if (b) { b.textContent = errs.join(" "); b.hidden = false; } else toast(errs.join(" ")); } else toast("Arquivos anexados");
}

let PFILES: File[] = []; // arquivos escolhidos antes de publicar (ficam só na memória; sobem depois que a vaga é criada)
function pfilesHTML() {
  return `${PFILES.length ? `<ul class="files">${PFILES.map((f, i) => fileRow({ name: f.name, size: f.size, idx: i }, true)).join("")}</ul>` : ""}
    ${PFILES.length < 6 ? `<div><label class="btn sm" for="pFiles">Escolher arquivos</label><input type="file" id="pFiles" multiple accept="${FILE_ACCEPT}" class="sr-only"></div>` : ""}
    <div id="pFilesErr" class="err" role="alert" hidden></div>`;
}

// PUBLICAR VAGA: o formulário do briefing. P guarda o rascunho (salvo no navegador a cada
// letra). postScore calcula a clareza na hora, igualzinho ao servidor, e meterHTML desenha o
// "medidor" ao lado mostrando o que falta preencher.
/* ---------- publicar vaga ---------- */
const POST0: OsmoPostDraft = { title: "", cat: "", obj: "", ent: "", fora: "", com: "", fb: "", ref: "", budget_type: "fixo", budget: "", duration: "", skills: "", async: true, flex: false };
let P = Object.assign({}, POST0, store.get("post-draft", {}));
// EXEMPLOS QUE SE ADAPTAM: os textos de exemplo (placeholder) dos campos da vaga mudam conforme a
// Área escolhida, para a pessoa ver um caso parecido com o dela. Sem área, vale o exemplo de design.
// O valor de exemplo também muda se o pagamento for por hora.
const POST_PH: Record<string, Record<string, string>> = {
  design: { title: "Ex.: Identidade visual para cafeteria de bairro", obj: "Ex.: Ter uma marca reconhecível na fachada, no cardápio e no Instagram", ent: "Logotipo principal\nPaleta de cores", fora: "Não precisa de site", fixo: "4200", hora: "90", dur: "3 semanas" },
  ia: { title: "Ex.: Chatbot de atendimento no WhatsApp para clínica", obj: "Ex.: Responder as dúvidas frequentes sozinho e passar para a equipe só o que precisar", ent: "Fluxo do chatbot desenhado\nIntegração com o WhatsApp\nManual curto de uso", fora: "Não inclui a assinatura das ferramentas", fixo: "3500", hora: "150", dur: "4 semanas" },
  dev: { title: "Ex.: Loja virtual em Shopify para marca de roupas", obj: "Ex.: Começar a vender pela internet com frete e Pix funcionando", ent: "Loja configurada com até 30 produtos\nPagamento e frete ativos\nVídeo explicando como cadastrar produtos", fora: "Não inclui fotos dos produtos", fixo: "6000", hora: "120", dur: "6 semanas" },
  marketing: { title: "Ex.: Gestão do Instagram de uma loja de cosméticos", obj: "Ex.: Postar com frequência e receber mais pedidos pelo direct", ent: "12 posts por mês\nCalendário de conteúdo\nRelatório mensal com os números", fora: "Não inclui a verba dos anúncios", fixo: "2500", hora: "80", dur: "3 meses, renovável" },
  dados: { title: "Ex.: Painel de vendas no Power BI", obj: "Ex.: Ver as vendas por loja e por mês sem montar planilha na mão", ent: "Painel com 3 páginas\nConexão com a planilha de vendas\nExplicação de cada indicador", fora: "Não inclui limpar dados de anos anteriores", fixo: "3000", hora: "110", dur: "3 semanas" },
  admin: { title: "Ex.: Assistente virtual para organizar agenda e e-mails", obj: "Ex.: Ganhar 10 horas por semana para focar no que importa", ent: "Agenda organizada toda semana\nE-mails respondidos em até 1 dia\nResumo semanal do que foi feito", fora: "Não inclui atendimento por telefone", fixo: "1800", hora: "45", dur: "3 meses, 10 h por semana" },
  texto: { title: "Ex.: Textos do site de um escritório de advocacia", obj: "Ex.: Explicar os serviços em linguagem simples e aparecer melhor no Google", ent: "Texto da página inicial\nTextos de 4 páginas de serviço\nUma rodada de revisão", fora: "Não inclui montar as páginas no site", fixo: "2200", hora: "70", dur: "2 semanas" },
  eng: { title: "Ex.: Projeto de reforma de apartamento de 60 m²", obj: "Ex.: Ter planta e imagens para orçar a obra com segurança", ent: "Planta baixa com layout\nImagens 3D de 3 ambientes\nLista de materiais", fora: "Não inclui acompanhar a obra", fixo: "5000", hora: "130", dur: "5 semanas" },
};
const postPH = (k: string) => { const c = POST_PH[P.cat] || POST_PH.design; return k === "budget" ? c[P.budget_type === "hora" ? "hora" : "fixo"] : c[k]; };
const POST_PH_IDS = [["p_title", "title"], ["p_obj", "obj"], ["p_ent", "ent"], ["p_fora", "fora"], ["p_budget", "budget"], ["p_dur", "dur"]];
function applyPostPH() {
  for (const [id, k] of POST_PH_IDS) { const el = $("#" + id) as HTMLInputElement; if (el) el.placeholder = postPH(k); }
  const lb = $('label[for="p_budget"]'); if (lb) lb.textContent = P.budget_type === "hora" ? "Valor por hora (R$)" : "Valor total (R$)";
}
function postScore() {
  const lines = (s: string) => String(s).split("\n").map(x => x.trim()).filter(Boolean);
  const items = [["Título", P.title.trim().length > 8], ["Área", !!P.cat], ["Objetivo", P.obj.trim().length > 20], ["Duas entregas ou mais", lines(P.ent).length >= 2], ["Fora do escopo", lines(P.fora).length >= 1], ["Comunicação", P.com.trim().length > 3], ["Feedback", P.fb.trim().length > 3], ["Valor", Number(P.budget) > 0], ["Prazo", P.duration.trim().length > 1]];
  return { items, score: Math.round(items.filter(i => i[1]).length / items.length * 100) };
}
function meterHTML() { const { items, score } = postScore(); return `<span class="label">Clareza do briefing</span><span class="big">${score}%</span><div class="bar ${score >= 80 ? "" : score >= 65 ? "mid" : "low"}" style="width:100%; height:8px"><i style="width:${score}%"></i></div><p class="hint">Para publicar, a vaga precisa de pelo menos 50%. Acima de 80% ela recebe propostas mais certeiras.</p><ul>${items.map(i => `<li class="${i[1] ? "ok" : ""}">${i[0]}</li>`).join("")}</ul>`; }
V.publicar = async () => {
  if (needLogin("cliente")) return;
  const fld = (id: string, label: string, html: string, hint = "") => `<div class="field"><label for="${id}">${label}</label>${html}${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
  return `<div class="detail">
  <form class="stack" id="postForm" novalidate>
    <div><span class="label">Nova vaga</span><h1 style="font-size:clamp(1.8rem,4vw,2.5rem); margin-top:8px">Publicar uma vaga clara</h1><p class="muted" style="margin-top:8px">Quanto mais claro o briefing, menos idas e vindas. O rascunho fica salvo neste navegador.</p></div>
    <div class="panel stack">
      ${fld("p_title", "Título", `<input class="input" id="p_title" data-p="title" value="${esc(P.title)}" placeholder="${esc(postPH("title"))}">`)}
      ${fld("p_cat", "Área", `<select class="input" id="p_cat" data-p="cat"><option value="">Escolha</option>${CATS.map(c => `<option value="${c.id}" ${P.cat === c.id ? "selected" : ""}>${c.n}</option>`).join("")}</select>`)}
      ${fld("p_obj", "Objetivo", `<textarea class="input" id="p_obj" data-p="obj" rows="3" placeholder="${esc(postPH("obj"))}">${esc(P.obj)}</textarea>`)}
      ${fld("p_ent", "Entregas", `<textarea class="input" id="p_ent" data-p="ent" rows="4" placeholder="${esc(postPH("ent"))}">${esc(P.ent)}</textarea>`, "Uma entrega por linha.")}
      ${fld("p_fora", "Fora do escopo", `<textarea class="input" id="p_fora" data-p="fora" rows="2" placeholder="${esc(postPH("fora"))}">${esc(P.fora)}</textarea>`, "Um item por linha. Evita mal-entendidos.")}
    </div>
    <div class="panel stack">
      ${fld("p_com", "Como prefere se comunicar", `<select class="input" id="p_com" data-p="com"><option value="">Escolha</option>${["Somente texto, pelo chat da plataforma.", "Texto e uma chamada inicial curta.", "Chamada semanal de 30 min."].map(o => `<option ${P.com === o ? "selected" : ""}>${o}</option>`).join("")}</select>`)}
      ${fld("p_fb", "Como será o feedback", `<input class="input" id="p_fb" data-p="fb" value="${esc(P.fb)}" placeholder="Ex.: Duas rodadas de ajustes por escrito">`)}
      ${fld("p_ref", "Referências", `<input class="input" id="p_ref" data-p="ref" value="${esc(P.ref)}" placeholder="Ex.: Painel de referências enviado após contratar">`)}
      <div class="field"><span class="flabel">Arquivos do briefing (opcional)</span>
        <span class="hint">PDF, imagens, PSD, AI, Word, Excel, PowerPoint ou texto. Até 6 arquivos de 10 MB. Só pessoas com conta na Osmo conseguem abrir.</span>
        <div class="stack" style="gap:10px; margin-top:6px" id="pFilesBox">${pfilesHTML()}</div></div>
      <div class="field"><span class="flabel" id="p_skills_lbl">Habilidades desejadas</span>${skillBoxHTML({ value: P.skills, cat: P.cat, max: 8, dataP: "skills" })}</div>
      <label class="check"><input type="checkbox" id="p_async" data-p="async" ${P.async ? "checked" : ""}><span>Sem reuniões obrigatórias</span></label>
      <label class="check"><input type="checkbox" id="p_flex" data-p="flex" ${P.flex ? "checked" : ""}><span>Prazo flexível</span></label>
    </div>
    <div class="panel stack">
      ${fld("p_bt", "Tipo de valor", `<select class="input" id="p_bt" data-p="budget_type"><option value="fixo" ${P.budget_type === "fixo" ? "selected" : ""}>Valor fixo pelo projeto</option><option value="hora" ${P.budget_type === "hora" ? "selected" : ""}>Por hora</option></select>`)}
      <div class="row" style="align-items:flex-start">
        <div style="flex:1; min-width:160px">${fld("p_budget", P.budget_type === "hora" ? "Valor por hora (R$)" : "Valor total (R$)", `<input class="input mono" id="p_budget" data-p="budget" inputmode="numeric" value="${esc(P.budget)}" placeholder="${postPH("budget")}">`)}</div>
        <div style="flex:1; min-width:160px">${fld("p_dur", "Prazo", `<input class="input" id="p_dur" data-p="duration" value="${esc(P.duration)}" placeholder="${esc(postPH("dur"))}">`)}</div>
      </div>
    </div>
    <div id="postErr" class="err" role="alert" hidden></div>
    <div class="row"><button class="btn hl" type="submit">Publicar vaga</button><span class="hint">Você pode fechar a vaga quando quiser.</span></div>
  </form>
  <aside class="panel stack meter" id="meter" style="gap:12px">${meterHTML()}</aside>
</div>`;
};

// OS OUVIDOS DA PÁGINA: em vez de colocar um "ouvinte" em cada botão, colocamos UM ouvinte de
// clique na página inteira e perguntamos "onde foi o clique?". Os botões têm etiquetas:
// - data-go="vagas" -> ir para uma tela;
// - data-act="..." -> fazer uma ação (aceitar proposta, pagar, aprovar etapa, apagar foto...);
// - data-cat, data-fchip, data-theme-set... -> mudar filtros, tema etc.
// Assim, botões que aparecem depois (porque a tela foi redesenhada) já funcionam sozinhos.
// Ações perigosas (recusar, apagar, remover selo) pedem confirmação antes (confirmSheet).
/* ---------- eventos ---------- */
document.addEventListener("click", async e => { const target = eventElement(e); if (!target) return;
  const t = target;
  if (t.closest<HTMLElement>("#menuBtn")) return openMenu();
  if (t.closest<HTMLElement>("#mmClose") || t.id === "mmScrim") return closeMenu(true);
  if (t.closest<HTMLElement>("#mmA11y")) { closeMenu(false); return openA11y(); }
  if (t.closest<HTMLElement>("#a11yBtn")) return openA11y();
  if (t.closest<HTMLElement>("#tbSearch")) { // busca da barra de baixo: vai para a lista e põe o cursor no campo
    const cli = ME && ME!.role === "cliente", to = cli ? "talentos" : "vagas";
    if (curH() !== to) await go(to);
    const fb = !cli && $("#fbox"); if (fb) fb.open = true; // em Vagas a busca fica dentro dos filtros, recolhidos no celular
    const q = $(cli ? "#tq" : "#fq"); if (q) { q.focus(); q.scrollIntoView({ block: "center" }); }
    return;
  }
  if (t.id === "scrim" || t.closest<HTMLElement>("#a11yClose")) return closeA11y();
  if (t.closest<HTMLAnchorElement>("a[href]")) return; // links são tratados no interceptor, inclusive Ctrl/Cmd+clique
  const g = t.closest<HTMLElement>("[data-go]"); if (g) { e.preventDefault(); if (menuOpen) closeMenu(false); return go(g.dataset.go!); }
  const a = t.closest<HTMLElement>("[data-aud]"); if (a) { S.aud = a.dataset.aud!; $$("[data-aud]").forEach(b => b.setAttribute("aria-pressed", String(b === a))); $("#heroQ").placeholder = S.aud === "freela" ? "Buscar vagas: logotipo, Webflow, revisão…" : "Buscar talentos: designer, revisora…"; return; }
  const c = t.closest<HTMLElement>("[data-cat]"); if (c) { S.cat = c.dataset.cat!; return go("vagas", "?cat=" + encodeURIComponent(S.cat)); }
  const fq = t.closest<HTMLElement>("[data-fchip]"); if (fq) { const k = fq.dataset.fchip!; S[k as "clear" | "async" | "flex"] = !S[k as "clear" | "async" | "flex"]; const cb = $("#f_" + k) as HTMLInputElement; if (cb) cb.checked = S[k as "clear" | "async" | "flex"]; $("#fchips").innerHTML = fchipsHTML(); return refreshJobs(); }
  const fc = t.closest<HTMLElement>("[data-fcat]"); if (fc) { S.cat = S.cat === fc.dataset.fcat! ? "" : fc.dataset.fcat!; const sel = $("#fcat"); if (sel) sel.value = S.cat; $("#fchips").innerHTML = fchipsHTML(); return refreshJobs(); }
  const au = t.closest<HTMLElement>("[data-auth]"); if (au) { authMode = au.dataset.auth!; return route(); }
  const th = t.closest<HTMLElement>("[data-theme-set]"); if (th) {
    setTheme(th.dataset.themeSet!);
    $$("[data-theme-set]").forEach(b => b.setAttribute("aria-pressed", String(b === th)));
    return toast({ light: "Tema claro", dark: "Tema escuro", system: "Tema do sistema" }[th.dataset.themeSet! as "light" | "dark" | "system"]);
  }
  if (t.classList.contains("skillbox") || t.classList.contains("sk-tags")) { const i = $("#p_skills_in"); if (i && !i.disabled) i.focus(); return; } // tocar no espaço vazio do campo foca a digitação
  const sd = t.closest<HTMLElement>("[data-skill-del]"); if (sd) { skillSet(skillsOf($("#p_skills").value).filter(k => k !== sd.dataset.skillDel)); const i = $("#p_skills_in"); if (i) i.focus(); return; }
  const q = t.closest<HTMLElement>("[data-quick]"); if (q) { const mi = $("#msgIn"); if (mi) { mi.value = q.dataset.quick!; fitMsgIn(mi); mi.focus(); } return; }
  if (t.closest<HTMLElement>("#newMsg")) { const b = $("#bubbles"); if (b) b.scrollTop = b.scrollHeight; return showNewMsgs(0); }
  if (t.closest<HTMLElement>("#pinText")) { $("#pinBox")?.classList.toggle("open"); return; } // no celular o combinado fica em 1 linha; toque abre
  const qs = t.closest<HTMLElement>("[data-q]"); if (qs) { const ta = $("#wqs"); if (ta) { ta.value = (ta.value ? ta.value + "\n" : "") + qs.dataset.q; W!.qs = ta.value; saveDraft(); } return; }
  const en = t.closest<HTMLElement>("[data-energy]"); if (en) { try { await api("PUT", "/api/me/energy", { energy: en.dataset.energy! }); ME!.energy = en.dataset.energy!; toast("Energia atualizada"); route(); } catch (err) { toast(errorMessage(err)); } return; }
  const act = t.closest<HTMLButtonElement>("[data-act]"); if (!act) return;
  const id = Number(act.dataset.id);
  const busy = (fn: () => unknown | Promise<unknown>) => async () => { act.disabled = true; try { await fn(); } catch (err) { toast(errorMessage(err)); } finally { act.disabled = false; } };
  switch (act.dataset.act) {
    case "switch-role": return busy(() => switchRole(act.dataset.role!, act.dataset.back, act))();
    case "push-on": return pushOn();
    case "push-off": return pushOff();
    case "push-test": return pushTest();
    case "logout": if (phoneClose) phoneClose(); if (menuOpen) closeMenu(false); if (PUSH) await pushOff(true); await api("POST", "/api/auth/logout"); ME = null; renderChrome(); toast("Você saiu da conta"); return go("inicio");
    case "oauth-role": return busy(async () => {
      try { const r = await api<{ role: OsmoRole }>("POST", "/api/auth/oauth/complete", { token: act.dataset.token, role: act.dataset.role! }); await refreshMe(); toast("Conta criada"); go(r.role === "freela" ? "perfil" : "publicar"); }
      catch (err) { const b = $("#roleErr"); if (b) { b.textContent = errorMessage(err); b.hidden = false; } else toast(errorMessage(err)); }
    })();
    case "toggle-pass": {
      const inp = $("#a_pass"), show = inp ? inp.type === "password" : false;
      if (inp) inp.type = show ? "text" : "password";
      act.setAttribute("aria-pressed", String(show));
      act.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      act.innerHTML = show ? EYE_OFF : EYE;
      return;
    }
    case "login-then": S.next = act.dataset.next!; return go("entrar");
    case "wfile-del": WFILES.splice(Number(act.dataset.i), 1); { const b = $("#wFilesBox"); if (b) b.innerHTML = wfilesHTML(); } return;
    case "att-del": return busy(async () => {
      if (!await confirmSheet({ title: `Remover "${act.dataset.name}"?`, text: "Quem já baixou o arquivo continua com a cópia.", ok: "Remover" })) return;
      await api("DELETE", act.dataset.url!); toast("Arquivo removido"); route();
    })();
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
    case "port-edit": { const it = ME!.profile.portfolio.find(x => x.id === id); if (!it) return; PE = { ...it }; return renderPort("pe_title"); }
    case "port-cancel": PE = null; return renderPort();
    case "port-img-del": syncPE(); PE!.removeImage = true; PE!.newImage = ""; return renderPort();
    case "port-save": return busy(async () => {
      syncPE();
      let link = PE!.link.trim(); if (link && !/^https?:\/\//i.test(link)) link = "https://" + link; // aceita "behance.net/fulana"
      const body: { title: string; link: string; image?: string; removeImage?: boolean } = { title: PE!.title, link };
      if (PE!.newImage) body.image = PE!.newImage; else if (PE!.removeImage) body.removeImage = true;
      try { const r = await api<{ portfolio: OsmoPortfolio[] }>(PE!.id ? "PUT" : "POST", "/api/me/portfolio" + (PE!.id ? "/" + PE!.id : ""), body); ME!.profile.portfolio = r.portfolio; }
      catch (e) { const b = $("#peErr"); if (b) { b.textContent = errorMessage(e); b.hidden = false; } else toast(errorMessage(e)); return; }
      toast(PE!.id ? "Projeto atualizado" : "Projeto adicionado"); PE = null; renderPort();
    })();
    case "port-del": return busy(async () => {
      const it = ME!.profile.portfolio.find(x => x.id === id);
      if (!it) return;
      if (!await confirmSheet({ title: `Remover "${it.title}" do portfólio?`, text: "O projeto e a imagem saem do seu perfil.", ok: "Remover" })) return;
      ME!.profile.portfolio = (await api<{ portfolio: OsmoPortfolio[] }>("DELETE", "/api/me/portfolio/" + id)).portfolio; if (PE && PE!.id === id) PE = null; toast("Projeto removido"); renderPort();
    })();
    case "port-move": return busy(async () => { ME!.profile.portfolio = (await api<{ portfolio: OsmoPortfolio[] }>("POST", `/api/me/portfolio/${id}/move`, { dir: Number(act.dataset.dir) })).portfolio; renderPort(); })();
    case "avatar-del": return busy(async () => { await api("DELETE", "/api/me/avatar"); ME!.profile.avatar = ""; toast("Foto removida"); route(); })();
    case "wa-new": return busy(async () => { try { await waStart(); } catch (err) { const e = $("#waErr"); if (e) { e.textContent = errorMessage(err); e.hidden = false; } } })();
    case "wa-back": { clearTimeout(waTimer); $("#waForm")?.remove(); const f = $("#authForm"); f.hidden = false; REG = null; $("#a_name")?.focus(); return; }
    case "wa-sim": return busy(async () => { await api("POST", "/api/auth/phone/simulate", { code: act.dataset.code, phone: prompt("Celular que mandou a mensagem (teste):", "11 91234-5678") || "" }); waPoll(); })();
    case "forgot": S.forgotEmail = ($("#a_email") || {}).value || ""; return go("esqueci");
    case "wnext": if (!wizValid()) return; W!.step = Math.min(3, W!.step + 1); saveDraft(); return rerenderWiz();
    case "wprev": W!.step = Math.max(0, W!.step - 1); saveDraft(); return rerenderWiz();
    case "ms-add": W!.ms.push({ title: "", value: "" }); saveDraft(); const mb1 = $("#msBox"); if (mb1) mb1.innerHTML = msRows(); return;
    case "ms-del": W!.ms.splice(Number(act.dataset.i), 1); saveDraft(); const mb2 = $("#msBox"); if (mb2) mb2.innerHTML = msRows(); return;
    case "wsend": return busy(async () => {
      const body = { text: W!.text, value: Number(W!.value), days: Number(W!.days), questions: W!.qs, milestones: W!.split ? W!.ms.map(m => ({ title: m.title, value: Number(m.value) })) : [] };
      let r; try { r = await api<{ id: number }>("POST", `/api/jobs/${WJOB!.id}/proposals`, body); }
      catch (err) { const box = $("#wErr"); if (box) { box.textContent = errorMessage(err); box.hidden = false; } else toast(errorMessage(err)); return; }
      const failed = [], jobId = WJOB!.id;
      for (const [i, file] of WFILES.entries()) {
        act.textContent = `Enviando arquivo ${i + 1} de ${WFILES.length}…`;
        try { await uploadTo(`/api/proposals/${r.id}/files`, file); } catch (e2) { failed.push(errorMessage(e2)); }
      }
      store.set("draft-" + jobId, null); W = null; WJOB = null; WFILES = []; refreshMe();
      if (failed.length) { toast(`Proposta enviada, mas ${failed.length} arquivo(s) não subiram. Tente de novo na página da vaga.`); console.warn(failed); return go("vaga-" + jobId); }
      toast("Proposta enviada"); go("painel");
    })();
    case "pay": return busy(async () => { await api("POST", `/api/milestones/${id}/pay`); toast("Cobrança gerada. Clique em Abrir cobrança para pagar."); route(); })();
    case "payout-sync": return busy(async () => {
      const r = await api<{ payout: OsmoUser["payout"] }>("POST", "/api/me/payout/sync", {});
      await refreshMe(); route();
      toast(r.payout?.active ? "Conta Stripe verificada e ativa!" : "A Stripe ainda aguarda a conclusão da verificação.");
    })();
    case "payout": return busy(async () => {
      if (PAY.provider === "stripe") { const result = await api<{url: string}>("POST", "/api/me/payout", {}); location.assign(result.url); return; }
      const v = (k: string) => ($("#" + k) as HTMLInputElement | null)?.value || "";
      const body = { cpfCnpj: v("po_doc"), birthDate: v("po_birth"), companyType: v("po_type"), mobilePhone: v("po_phone"), incomeValue: Number(v("po_income").replace(/\D/g, "")) || 0,
        postalCode: v("po_cep"), address: v("po_addr"), addressNumber: v("po_num"), complement: v("po_comp"), province: v("po_prov") };
      try { await api<{ escrow: boolean }>("POST", "/api/me/payout", body); toast("Recebimentos ativados"); await refreshMe(); route(); }
      catch (err) {
        await refreshMe();
        if (ME?.payout && !ME.payout.active) { route(); toast(errorMessage(err)); }
        else { const b = $("#poErr"); if (b) { b.textContent = errorMessage(err); b.hidden = false; } else toast(errorMessage(err)); }
      }
    })();
    case "close-job": return busy(async () => { await api("POST", `/api/jobs/${id}/close`); toast("Vaga fechada"); route(); })();
    case "accept": return busy(async () => { await api("POST", `/api/proposals/${id}/accept`); toast("Proposta escolhida e contrato criado"); route(); })();
    case "decline": return busy(async () => {
      if (!await confirmSheet({ title: "Marcar proposta como não escolhida?", text: "Você ainda poderá reconsiderar e escolher esta proposta depois na página da vaga.", ok: "Marcar como não escolhida" })) return;
      await api("POST", `/api/proposals/${id}/decline`); toast("Proposta marcada como não escolhida"); route();
    })();
    case "reopen": return busy(async () => { await api("POST", `/api/proposals/${id}/reopen`); toast("Proposta voltou para aguardando resposta"); route(); })();
    case "withdraw": return busy(async () => { await api("POST", `/api/proposals/${id}/withdraw`); toast("Proposta retirada"); route(); })();
    case "invite": return busy(async () => { const inv = $("#invJob"); if (!inv) return; const r = await api<{ thread: number }>("POST", `/api/jobs/${inv.value}/invite`, { talentId: id }); toast("Convite enviado"); go("mensagens-" + r.thread); })();
    case "support": return busy(async () => { const r = await api<{ thread: number }>("POST", "/api/support"); go("mensagens-" + r.thread); })();
    case "adm-support": return busy(async () => { const r = await api<{ thread: number }>("POST", `/api/admin/support/${id}`); go("mensagens-" + r.thread); })();
    case "chat": return busy(async () => { const r = await api<{ thread: number }>("POST", "/api/threads", { withId: Number(act.dataset.with), jobId: Number(act.dataset.job) || undefined }); go("mensagens-" + r.thread); })();
    case "ms": return busy(async () => { await api("POST", `/api/milestones/${id}/${act.dataset.a!}`, {}); toast({ start: "Etapa iniciada", deliver: "Entrega registrada", approve: "Etapa aprovada e valor liberado" }[act.dataset.a! as "start" | "deliver" | "approve"]); route(); })();
    case "ms-changes": { const box = $("#msa-" + id); if (!box) return; box.innerHTML = `<input class="input" id="chg-${id}" placeholder="O que precisa ajustar?" style="flex:1; min-width:180px"><button class="btn sm hl" data-act="ms-changes-send" data-id="${id}">Enviar pedido</button>`; const chg = $("#chg-" + id); if (chg) chg.focus(); return; }
    case "ms-changes-send": return busy(async () => { const inp = $("#chg-" + id) as HTMLInputElement; const note = inp ? inp.value.trim() : ""; if (!note) return toast("Escreva o que precisa ajustar."); await api("POST", `/api/milestones/${id}/changes`, { note }); toast("Pedido de ajustes enviado"); route(); })();
    case "pin-edit": { const box = $("#pinBox"); if (!box) return; box.innerHTML = `<b>Combinado até agora:</b><div class="pin-edit"><input class="input" id="pinIn" maxlength="600" placeholder="Ex.: Entrega final dia 20 · 2 rodadas de ajuste · R$ 3.000 em 2 etapas" value="${esc(TH!.thread.pin)}"><button class="btn sm primary" data-act="pin-save">Salvar</button></div>`; const pin = $("#pinIn"); if (pin) pin.focus(); return; }
    case "pin-save": return busy(async () => { const pinIn = $("#pinIn"); if (!pinIn) return; await api("PUT", `/api/threads/${TH!.thread.id}/pin`, { pin: pinIn.value }); toast("Resumo atualizado"); route(); })();
  }
});
// wizValid confere cada passo da proposta antes de deixar avançar (ex.: texto com 40 palavras
// ou mais, valor mínimo, etapas somando o total).
function rerenderWiz() { $("#view").innerHTML = wizHTML(); window.scrollTo(0, 0); }
function wizValid() {
  if (W!.step === 0 && words(W!.text) < 10) { toast("Escreva pelo menos 10 palavras sobre como faria o trabalho."); return false; }
  if (W!.step === 1) {
    if (!(Number(W!.value) >= 50)) { toast("Informe um valor de pelo menos R$ 50."); return false; }
    if (!(Number(W!.days) >= 1)) { toast("Informe o prazo em dias úteis."); return false; }
    if (W!.split && msSum() !== Number(W!.value)) { toast("A soma das etapas precisa ser igual ao valor total."); return false; }
    if (W!.split && W!.ms.some(m => !m.title.trim())) { toast("Dê um nome para cada etapa."); return false; }
  }
  return true;
}

// OUVIDO DE DIGITAÇÃO: atualiza buscas, contadores de palavras, cálculos de valor e rascunhos
// enquanto você digita. "change" cuida de caixinhas, seleções e arquivos escolhidos.
document.addEventListener("input", e => { const target = eventInput(e); if (!target) return;
  const t = target, id = t.id;
  if (id === "msgIn") { fitMsgIn(t as HTMLTextAreaElement); return; }
  if (id === "fq") { S.q = t.value; refreshJobs(); }
  if (id === "tq") { S.tq = t.value; S.tpage = 1; history.replaceState(null, "", TR.withLanguage("/talentos?" + new URLSearchParams({ q: S.tq }))); updatePageMetadata("talentos"); clearTimeout(talentsSearchTimer); talentsSearchTimer = setTimeout(async () => { try { $("#tgrid").innerHTML = await talentsHTML(S.tq); } catch (err) { toast(errorMessage(err)); } }, 250); }
  if (id === "wtext") { W!.text = t.value; $("#wcount").textContent = `${words(W!.text)} palavras · de 40 a 150 é um bom tamanho`; saveDraft(); }
  if (id === "wval" || id === "wdays") { const v = t.value.replace(/\D/g, ""); if (t.value !== v) t.value = v; W![id === "wval" ? "value" : "days"] = v; const n = Number(W!.value) || 0; $("#wcalc").innerHTML = calcHTML(n, Math.round(n * 0.1)); if (W!.split) { const d = $("#msDiff"); if (d) $("#msBox").innerHTML = msRows(); } saveDraft(); }
  if (id === "wqs") { W!.qs = t.value; saveDraft(); }
  if (t.dataset.ms !== undefined) { const i = Number(t.dataset.ms), k = t.dataset.k; let v = t.value; if (k === "value") { v = v.replace(/\D/g, ""); if (t.value !== v) t.value = v; } W!.ms[i][k as "value" | "title"] = v; saveDraft(); const d = (Number(W!.value) || 0) - msSum(); $("#msDiff").textContent = d === 0 ? "As etapas somam o valor total." : d > 0 ? `Faltam ${brl(d)} para fechar o total.` : `As etapas passam ${brl(-d)} do total.`; }
  if (t.dataset.p && t.type !== "checkbox") { P[t.dataset.p as Exclude<keyof OsmoPostDraft, "async" | "flex">] = t.value; store.set("post-draft", P); $("#meter").innerHTML = meterHTML(); }
  if (id === "po_doc") payoutDocKind();
  if (id === "p_cat" && $(".skillbox")) $(".skillbox").dataset.area = t.value; // a lista de sugestões passa a priorizar a área escolhida
});
document.addEventListener("change", e => { const target = eventInput(e); if (!target) return;
  const t = target, id = t.id;
  const checked = t instanceof HTMLInputElement && t.checked;
  const files = t instanceof HTMLInputElement ? [...(t.files || [])] : [];
  if (t.name === "role") $$("[data-social]").forEach(a => { a.href = socialURL(a.dataset.social!, t.value); });
  if (id === "fcat") { S.cat = t.value; refreshJobs(); }
  if (id === "fsort") { S.sort = t.value; refreshJobs(); }
  if (["f_clear", "f_async", "f_flex"].includes(id)) { S[id.slice(2) as "clear" | "async" | "flex"] = checked; refreshJobs(); }
  if (id === "wsplit") { W!.split = checked; if (W!.split && W!.ms.length === 1 && !W!.ms[0].value) W!.ms[0] = { title: "Entrega completa", value: W!.value }; $("#msBox").hidden = !W!.split; $("#msBox").innerHTML = msRows(); saveDraft(); }
  if (t.dataset.pref) { PREFS[t.dataset.pref] = checked; applyPrefs(); }
  if (id === "avatarIn" && files[0]) uploadAvatar(files[0]);
  if (id === "vFile" && files[0]) { sendVerify(files[0]); t.value = ""; }
  if (id === "pFiles" && files.length) {
    const errs = [];
    for (const f of files) { const e2 = checkFile(f); if (e2) errs.push(e2); else if (PFILES.length < 6) PFILES.push(f); else errs.push(`"${f.name}": cada vaga aceita até 6 arquivos.`); }
    $("#pFilesBox").innerHTML = pfilesHTML();
    if (errs.length) { const b = $("#pFilesErr"); b.textContent = errs.join(" "); b.hidden = false; }
  }
  if (id === "jFiles" && files.length) addJobFiles(Number(t.dataset.job), [...files]);
  if (t.dataset.upload && files.length) { addAtts(t.dataset.upload, [...files], t.dataset.err); t.value = ""; }
  if (id === "wFiles" && files.length) {
    const errs = [];
    for (const f of files) { const e2 = checkFile(f); if (e2) errs.push(e2); else if (WFILES.length < 6) WFILES.push(f); else errs.push(`"${f.name}": cada proposta aceita até 6 arquivos.`); }
    $("#wFilesBox").innerHTML = wfilesHTML();
    if (errs.length) { const b = $("#wFilesErr"); b.textContent = errs.join(" "); b.hidden = false; }
  }
  if (id === "msgFile" && files.length) { sendMsgFiles([...files]); t.value = ""; }
  if (id === "peImg" && files[0]) { syncPE(); shrinkImage(files[0], 1600, false).then(d => { PE!.newImage = PE!.image = d; PE!.removeImage = false; renderPort(); })
    .catch(e2 => { const b = $("#peErr"); b.textContent = errorMessage(e2); b.hidden = false; }); }
  if (t.dataset.p) { Object.assign(P, { [t.dataset.p]: t.type === "checkbox" ? checked : t.value }); store.set("post-draft", P); $("#meter").innerHTML = meterHTML(); }
  if (id === "p_cat" || id === "p_bt") applyPostPH(); // exemplos da área escolhida
});
// OUVIDO DE FORMULÁRIOS: quando você aperta "Enviar/Salvar/Entrar", o navegador iria recarregar
// a página; preventDefault impede isso e o garçom manda os dados pelo api(). Cada formulário
// tem um id (authForm, profForm, postForm, compose...) e um pedaço de código próprio.
// O botão fica desligado enquanto envia, para ninguém mandar duas vezes sem querer.
document.addEventListener("submit", async e => { const target = eventForm(e); if (!target) return;
  e.preventDefault();
  const f = target, btn = f.querySelector<HTMLButtonElement>('[type="submit"]');
  const showErr = (box: string, msg: string) => { const b = $(box); if (b) { b.textContent = msg; b.hidden = false; b.scrollIntoView({ block: "nearest" }); } else toast(msg); };
  if (f.id === "heroSearch") { const q = $("#heroQ").value; if (S.aud === "freela") { S.q = q; go("vagas", "?q=" + encodeURIComponent(q)); } else { S.tq = q; go("talentos", "?q=" + encodeURIComponent(q)); } return; }
  if (btn) btn.disabled = true;
  try {
    if (f.id === "authForm") {
      const body = authBody();
      $("#authErr").hidden = true;
      if (authMode === "criar" && PHONE) { // cadastro com celular: confere os dados e pede o WhatsApp (ou usa o celular já confirmado)
        if (REG && REG!.ticket) body.phoneTicket = REG!.ticket;
        else {
          try { await api("POST", "/api/auth/register", { ...body, check: true }); await waStart(); }
          catch (err) { showErr("#authErr", errorMessage(err)); }
          return;
        }
      }
      try { await api("POST", authMode === "criar" ? "/api/auth/register" : "/api/auth/login", body); }
      catch (err) { return showErr("#authErr", errorMessage(err)); }
      return authDone();
    }
    if (f.id === "forgotForm") {
      const email = $("#f_email").value.trim();
      try { await api("POST", "/api/auth/forgot", { email }); } catch (err) { return showErr("#forgotErr", errorMessage(err)); }
      f.outerHTML = `<div class="panel stack" role="status"><b>Confira seu e-mail</b><p class="muted">Se existir uma conta com ${esc(email)}, você vai receber um link em alguns minutos. Ele vale por 1 hora. Se não aparecer, olhe também a caixa de spam.</p></div>`;
      return;
    }
    if (f.id === "resetForm") {
      try { await api("POST", "/api/auth/reset", { token: f.dataset.token, password: $("#a_pass").value }); } catch (err) { return showErr("#resetErr", errorMessage(err)); }
      history.replaceState(null, "", TR.withLanguage("/painel")); await refreshMe(); toast("Senha nova salva"); return route();
    }
    if (f.classList.contains("review-form")) {
      const rating = Number((f.querySelector<HTMLInputElement>('input[name="rating"]:checked') || {}).value || 0);
      const err = f.querySelector<HTMLElement>(".err")!;
      if (!rating) { err.textContent = "Escolha uma nota de 1 a 5."; err.hidden = false; return; }
      try { await api("POST", `/api/contracts/${f.dataset.contract}/review`, { rating, tags: [...f.querySelectorAll<HTMLInputElement>('input[name="tags"]:checked')].map(i => i.value), comment: f.querySelector<HTMLTextAreaElement>("textarea")!.value }); }
      catch (e2) { err.textContent = errorMessage(e2); err.hidden = false; return; }
      toast("Avaliação enviada"); return route();
    }
    if (f.id === "notifyForm") {
      const level = (f.querySelector<HTMLInputElement>('input[name="notify"]:checked') || {}).value;
      try { await api("POST", "/api/notify", { token: f.dataset.token, level }); } catch (err) { return toast(errorMessage(err)); }
      return toast(level === "nada" ? "Avisos desligados" : "Preferência salva");
    }
    if (f.id === "compose") {
      const v = $("#msgIn").value.trim(); if (!v) return;
      try { await api("POST", `/api/threads/${TH!.thread.id}/messages`, { body: v }); } catch (err) { return toast(errorMessage(err)); }
      $("#msgIn").value = ""; fitMsgIn($("#msgIn")); TH = await api<OsmoThreadResponse>("GET", "/api/threads/" + TH!.thread.id); const b = $("#bubbles"); b.innerHTML = bubbles(); b.scrollTop = b.scrollHeight; $("#msgIn").focus(); return;
    }
    if (f.id === "profForm") {
      const v = (id: string) => ($("#" + id) as HTMLInputElement | null)?.value || "";
      const body = { ...($("#p_searchVisible") ? { searchVisible: $("#p_searchVisible").checked } : {}), name: v("p_name"), title: v("p_title"), rate: Number(v("p_rate")) || 0, hours: Number(v("p_hours")) || 20, location: v("p_loc"),
        skills: v("p_skills").split(",").map(s => s.trim()).filter(Boolean), bio: v("p_bio"), tag: v("p_tag"), company: v("p_company"), cpfCnpj: v("p_doc"),
        notify: (f.querySelector<HTMLInputElement>('input[name="notify"]:checked') || {}).value, how: { com: v("w_com"), resp: v("w_resp"), fb: v("w_fb"), foco: v("w_foco") } };
      try { await api("PUT", "/api/me/profile", body); } catch (err) { return showErr("#profErr", errorMessage(err)); }
      await refreshMe(); updateProfMeta(); toast("Salvo"); return;
    }
    if (f.id === "postForm") {
      const body = { ...P, ent: P.ent.split("\n"), fora: P.fora.split("\n"), skills: P.skills.split(",").map(s => s.trim()).filter(Boolean), budget: Number(P.budget) || 0 };
      let r; try { r = await api<{ id: number; clarity: number }>("POST", "/api/jobs", body); } catch (err) { return showErr("#postErr", errorMessage(err)); }
      const failed = [];
      for (const [i, file] of PFILES.entries()) {
        if (btn) btn.textContent = `Enviando arquivo ${i + 1} de ${PFILES.length}…`;
        try { await uploadFile(r.id, file); } catch (e2) { failed.push(errorMessage(e2)); }
      }
      P = Object.assign({}, POST0); PFILES = []; store.set("post-draft", null);
      toast(failed.length ? `Vaga publicada, mas ${failed.length} arquivo(s) não subiram. Tente de novo na página da vaga.` : `Vaga publicada com ${r.clarity}% de clareza`);
      if (failed.length) console.warn(failed);
      return go("vaga-" + r.id);
    }
  } finally { if (btn) btn.disabled = false; }
});

// PAINEL DE CONFIRMAÇÃO ("Tem certeza?"): no celular sobe de baixo e dá para fechar arrastando
// para baixo; no computador aparece no meio. trapFocus prende a tecla Tab dentro do painel,
// para quem navega pelo teclado não "se perder" atrás dele. O foco começa no botão seguro
// (cancelar), para um Enter sem querer não apagar nada.
/* ---------- painel de confirmação (no celular sobe de baixo; no computador fica no centro) ---------- */
// arrastar para baixo fecha o painel (só no toque)
function sheetDrag(el: HTMLElement, onClose: () => void) {
  let y0: number | null = null, dy = 0;
  el.addEventListener("touchstart", e => { if (el.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  el.addEventListener("touchmove", e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = dy ? `translateY(${dy}px)` : ""; }, { passive: true });
  el.addEventListener("touchend", () => { if (y0 === null) return; y0 = null; if (dy > 90) onClose(); else el.style.transform = ""; });
}
function trapFocus(e: KeyboardEvent, box: HTMLElement) {
  if (e.key !== "Tab") return;
  const f = [...box.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")].filter(x => !(x as HTMLButtonElement).disabled && x.offsetParent);
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
}
// substitui o confirm() do navegador: devolve true se a pessoa confirmou
function confirmSheet({ title, text = "", ok = "Confirmar" }: { title: string; text?: string; ok?: string }): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const back = document.activeElement as HTMLElement | null, box = document.createElement("div");
    box.innerHTML = `<div class="scrim"></div><div class="drawer sheet" role="alertdialog" aria-modal="true" aria-labelledby="sheetT" ${text ? 'aria-describedby="sheetD"' : ""}>
      <div class="sheet-grip" aria-hidden="true"></div><h2 id="sheetT">${esc(title)}</h2>${text ? `<p class="muted" id="sheetD">${esc(text)}</p>` : ""}
      <div class="sheet-actions"><button class="btn hl" data-sheet="ok">${esc(ok)}</button><button class="btn" data-sheet="no">Cancelar</button></div></div>`;
    document.body.appendChild(box);
    const panel = box.querySelector<HTMLElement>(".sheet")!;
    const done = (v: boolean) => { document.removeEventListener("keydown", onKey, true); box.remove(); if (back && back.focus) back.focus(); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } else trapFocus(e, panel); };
    document.addEventListener("keydown", onKey, true);
    box.addEventListener("click", e => { const target = eventElement(e); if (!target) return; if (target.classList.contains("scrim")) done(false); const b = target.closest<HTMLElement>("[data-sheet]"); if (b) done(b.dataset.sheet === "ok"); });
    sheetDrag(panel, () => done(false));
    panel.querySelector<HTMLElement>('[data-sheet="no"]')!.focus(); // o foco começa no caminho seguro
  });
}

// CELULAR OBRIGATÓRIO: toda conta sem celular confirmado (login social, contas antigas) fica
// presa nesta caixa ao entrar, até confirmar. Não fecha com Esc, nem tocando fora, nem
// arrastando: o único outro caminho é "Sair da conta".
// Mesmo jeito do cadastro: o botão abre o WhatsApp com a mensagem pronta e a caixa pergunta ao
// servidor "já chegou?" (a cada 2,5 s, e na hora ao voltar do WhatsApp). Chegou, o celular vai
// para a conta (/api/me/phone) e a caixa some.
let phoneBox: HTMLDivElement | null = null, phoneClose: (() => void) | null = null;
function phoneModal() {
  if (phoneBox) return;
  const back = document.activeElement as HTMLElement | null, box = document.createElement("div");
  phoneBox = box;
  let pid = "", timer = 0, closed = false;
  box.innerHTML = `<div class="scrim"></div><div class="drawer sheet" role="dialog" aria-modal="true" aria-labelledby="phT" aria-describedby="phD">
    <h2 id="phT">Confirme seu celular</h2>
    <p class="muted" id="phD">Para continuar usando a Osmo, confirme seu celular pelo WhatsApp. Toque no botão: o WhatsApp abre com a mensagem pronta para a Osmo. É só enviar e voltar para cá.</p>
    <div id="phBody"><p class="muted" role="status">Preparando…</p></div>
    <div class="sheet-actions" id="phActs"><button type="button" class="btn" data-act="logout">Sair da conta</button></div></div>`;
  document.body.appendChild(box);
  const panel = box.querySelector<HTMLElement>(".sheet")!, body = box.querySelector<HTMLElement>("#phBody")!, acts = box.querySelector<HTMLElement>("#phActs")!;
  const done = () => {
    if (closed) return; closed = true; clearTimeout(timer);
    document.removeEventListener("keydown", onKey, true); document.removeEventListener("visibilitychange", onVis);
    box.remove(); phoneBox = phoneClose = null; if (back && back.focus) back.focus();
  };
  phoneClose = done;
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); } else trapFocus(e, panel); };
  const onVis = () => { if (!document.hidden && pid) poll(); };
  const fail = (msg: string) => { body.innerHTML = `<div class="err" role="alert">${msg}</div>`; acts.insertAdjacentHTML("afterbegin", `<button type="button" class="btn hl" data-ph="new">Tentar de novo</button>`); };
  async function start() {
    acts.querySelector<HTMLElement>('[data-ph="new"]')?.remove();
    body.innerHTML = `<p class="muted" role="status">Preparando…</p>`;
    let d; try { d = await api<OsmoPhoneStart>("POST", "/api/auth/phone/start"); } catch (err) { return fail(esc(errorMessage(err))); }
    if (closed) return;
    pid = d.pid;
    body.innerHTML = `<div class="stack">
      <a class="btn hl" href="${esc(d.link)}" target="_blank" rel="noopener">Abrir o WhatsApp</a>
      <details><summary>O WhatsApp está em outro aparelho?</summary>
        <p class="hint" style="margin-top:6px">Mande do seu celular esta mensagem para <b translate="no">${esc(d.number)}</b>:</p>
        <p translate="no"><b style="font-size:1.2rem; letter-spacing:.05em">${esc(d.code)}</b></p></details>
      <p class="muted" id="phState" role="status" aria-live="polite">Esperando a sua mensagem… O código vale por ${d.minutes} minutos.</p>
      ${d.dev ? `<button type="button" class="link-btn" data-ph="sim" data-code="${esc(d.code)}">Simular a mensagem (teste)</button>` : ""}</div>`;
    body.querySelector<HTMLElement>("a.btn")!.focus();
    poll();
  }
  async function poll() {
    clearTimeout(timer);
    if (closed || !pid) return;
    let d: OsmoPhoneStatus; try { d = await api<OsmoPhoneStatus>("GET", "/api/auth/phone/status?pid=" + pid); } catch { d = { state: "pending" }; }
    if (closed) return;
    if (d.state === "pending") { timer = setTimeout(poll, document.hidden ? 6000 : 2500); return; }
    pid = "";
    if (d.state === "expired") return fail("O código venceu.");
    if (d.state === "taken") return fail(`O celular ${esc(d.pretty)} já está em outra conta. Mande a mensagem de outro número.`);
    try { await api("POST", "/api/me/phone", { ticket: d.ticket }); } catch (err) { return fail(esc(errorMessage(err))); }
    ME!.needPhone = false; done(); toast(`Celular ${d.pretty} confirmado`);
  }
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onVis);
  box.addEventListener("click", async e => { const target = eventElement(e); if (!target) return;
    const b = target.closest<HTMLElement>("[data-ph]"); if (!b) return;
    if (b.dataset.ph === "new") return start();
    if (b.dataset.ph === "sim") { await api("POST", "/api/auth/phone/simulate", { code: b.dataset.code, phone: prompt("Celular que mandou a mensagem (teste):", "11 91234-5678") || "" }).catch(err => toast(errorMessage(err))); poll(); }
  });
  start();
}

// FOTO AMPLIADA: tocar numa foto de perfil abre a foto grande no meio da tela, com o fundo escurecido.
// Fecha tocando em qualquer lugar, no "×" ou com Esc. Fotos dentro de botões e links (lista de conversas,
// cartões que levam a outra tela) continuam fazendo o que já faziam.
function openPhoto(img: HTMLImageElement) {
  const back = document.activeElement as HTMLElement | null, name = img.dataset.name || "", box = document.createElement("div");
  box.className = "photo-zoom"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", name ? "Foto de " + name : "Foto de perfil");
  box.innerHTML = `<button type="button" class="photo-zoom-x" aria-label="Fechar">×</button>
    <figure><img src="${esc(img.currentSrc || img.src)}" alt="${esc(name ? "Foto de " + name : "Foto de perfil")}">${name ? `<figcaption translate="no">${esc(name)}</figcaption>` : ""}</figure>`;
  document.body.appendChild(box);
  const done = () => { document.removeEventListener("keydown", onKey, true); box.remove(); if (back && back.focus) back.focus(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(); } else if (e.key === "Tab") { e.preventDefault(); } };
  document.addEventListener("keydown", onKey, true);
  box.addEventListener("click", done);
  box.querySelector<HTMLElement>(".photo-zoom-x")!.focus();
}
document.addEventListener("click", e => { const target = eventElement(e); if (!target) return;
  const img = target.closest<HTMLImageElement>("img.av");
  if (!img || img.closest<HTMLElement>("a,button,label,[data-go],[data-act],.photo-zoom")) return;
  e.preventDefault(); openPhoto(img);
});

// GOOGLE ANALYTICS QUE CONTA DESDE A ENTRADA, COM AVISO DE COOKIES: assim que a pessoa entra no site, a visita
// já é contada (o Analytics carrega sozinho). Ao mesmo tempo aparece um aviso embaixo da tela, com um cookie
// desenhado, explicando que usamos cookies de estatística. Quem não quiser clica em "Não quero": o Analytics
// para na hora, os cookies dele são apagados e ele não carrega mais nas próximas visitas. A escolha fica guardada
// neste navegador e pode ser trocada a qualquer hora em Ajustes. Anúncios ficam sempre desligados.
// Cada troca de tela vira uma "visualização de página", mas o endereço enviado é limpo: só o nome da tela
// e, quando houver, o número (ex.: /vaga/12). Códigos secretos (links de senha, de avisos, de cadastro)
// nunca saem daqui. As telas do dono (panorama e gestão) não são contadas.
/* ---------- google analytics (conta desde a entrada; recusa a qualquer hora) ---------- */
let GA_ID = "", gaLoaded = false;
const GA_SKIP = ["panorama", "gestao"];
const gaChoice = () => store.get("analytics", ""); // "" = ainda não respondeu o aviso (conta), "sim" = entendi, "nao" = não quero
const gaOn = () => !!GA_ID && gaChoice() !== "nao";
function gaLoad() {
  if (gaLoaded || !gaOn()) return;
  gaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer!.push(arguments); };
  window.gtag!("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag!("js", new Date());
  window.gtag!("config", GA_ID, { send_page_view: false }); // as páginas são enviadas à mão, a cada troca de tela
  const s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
  document.head.appendChild(s);
}
function gaPage(name: string) {
  if (!gaLoaded || !gaOn() || GA_SKIP.includes(name)) return;
  const path = location.pathname; // o código secreto (depois do "#") nunca vai para o Google
  window.gtag!("event", "page_view", { page_path: path, page_location: location.origin + path, page_title: document.title });
}
// apaga os cookies do Google Analytics (_ga, _ga_XXXX) deste site e do domínio principal
function gaWipe() {
  const host = location.hostname, parts = host.split("."), domains = ["", host, "." + host];
  if (parts.length > 2) domains.push("." + parts.slice(-3).join("."), "." + parts.slice(-2).join("."));
  document.cookie.split(";").map(c => c.trim().split("=")[0]).filter(n => /^_ga/.test(n))
    .forEach(n => domains.forEach(d => { document.cookie = `${n}=; Max-Age=0; path=/${d ? "; domain=" + d : ""}`; }));
}
function gaSet(choice: string) {
  store.set("analytics", choice);
  if (choice === "sim") { const was = gaLoaded; gaLoad(); if (!was) gaPage(curH().split("-")[0]); }
  else { if (gaLoaded) window.gtag!("consent", "update", { analytics_storage: "denied" }); gaWipe(); } // para de medir na hora; some de vez ao recarregar
  const b = $("#consent"); if (b) b.remove();
}
// o cookie desenhado: massa dourada com borda tostada, uma mordida, gotas de chocolate e farelinhos caindo
const COOKIE_SVG = `<svg class="cookie-ico" viewBox="0 0 64 64" aria-hidden="true">
  <defs><mask id="ckBite"><rect width="64" height="64" fill="#fff"/><circle cx="53" cy="12" r="9" fill="#000"/><circle cx="60.5" cy="23" r="6.5" fill="#000"/><circle cx="44" cy="5" r="5" fill="#000"/></mask></defs>
  <g mask="url(#ckBite)"><circle class="ck-edge" cx="31" cy="34" r="27"/><circle class="ck-dough" cx="31" cy="34" r="24"/>
    <ellipse class="ck-chip" cx="19" cy="24" rx="4" ry="3.3" transform="rotate(-18 19 24)"/><ellipse class="ck-chip" cx="31" cy="35" rx="3.7" ry="3.1"/>
    <ellipse class="ck-chip" cx="17" cy="42" rx="3.3" ry="2.8" transform="rotate(20 17 42)"/><ellipse class="ck-chip" cx="40" cy="47" rx="3.8" ry="3.1" transform="rotate(-10 40 47)"/>
    <ellipse class="ck-chip" cx="29" cy="17" rx="2.6" ry="2.1"/><circle class="ck-chip" cx="45" cy="32" r="2.3"/><circle class="ck-chip" cx="26" cy="51" r="2"/>
    <circle class="ck-dot" cx="37" cy="25" r="1"/><circle class="ck-dot" cx="22" cy="33" r="1"/><circle class="ck-dot" cx="34" cy="44" r="1"/><circle class="ck-dot" cx="48" cy="42" r=".9"/></g>
  <circle class="ck-crumb" cx="51" cy="18" r="1.7"/><circle class="ck-crumb" cx="55.5" cy="27" r="1.2"/><path class="ck-crumb" d="M46 11.5l2.5-.7 1 2.2-2.4 1.1z"/>
  <circle class="ck-crumb" cx="58" cy="33" r=".9"/><path class="ck-crumb" d="M54 6.5l1.9.3-.4 1.7-1.7-.5z"/></svg>`;
// o aviso aparece para quem ainda não respondeu; a contagem já está valendo enquanto isso
function gaBanner() {
  if (!GA_ID || gaChoice() || $("#consent")) return;
  if (location.hostname === "app.osmo.com.br") return; // no subdomínio do app o aviso não aparece
  const b = document.createElement("div");
  b.id = "consent"; b.className = "consent"; b.setAttribute("role", "region"); b.setAttribute("aria-label", "Aviso de cookies");
  b.innerHTML = `${COOKIE_SVG}<p><b>Usamos cookies de estatística.</b> O Google Analytics conta as visitas para entendermos quais telas ajudam e quais confundem. Nada de anúncios nem dos seus dados de conta. <a href="/privacidade">Privacidade</a></p>
    <div class="row consent-actions"><button class="btn sm" data-consent="nao">Não quero</button><button class="btn sm hl" data-consent="sim">Entendi</button></div>`;
  document.body.appendChild(b);
  // na TV o aviso cobre a tela: o foco vai direto para ele (e fica preso nele, ver focusables) até a pessoa responder
  if (document.documentElement.dataset.device === "tv") b.querySelector<HTMLElement>("[data-consent]")!.focus({ preventScroll: true });
}
document.addEventListener("click", e => { const target = eventElement(e); if (!target) return; const c = target.closest<HTMLElement>("[data-consent]"); if (c) { gaSet(c.dataset.consent!); if (typeof tvFocusFirst === "function") tvFocusFirst(); toast(c.dataset.consent! === "sim" ? "Obrigado!" : "Pronto, cookies de estatística desligados"); } });
document.addEventListener("change", e => { const target = eventInput(e); if (!target) return; if (target.id === "gaSw") gaSet((target instanceof HTMLInputElement && target.checked) ? "sim" : "nao"); });
const gaToggleHTML = () => GA_ID ? `<label class="toggle"><span><b>Cookies de estatística</b><br><span class="hint">O Google Analytics conta as visitas para melhorarmos a plataforma, sem seus dados de conta</span></span><input type="checkbox" class="sw" id="gaSw" ${gaOn() ? "checked" : ""}></label>` : "";

// RELÓGIO POMODORO: o "tomate de cozinha" da Osmo. Você trabalha concentrado por um tempo (foco, 25 min),
// descansa um pouco (pausa curta, 5 min) e, a cada 4 focos, descansa mais (pausa longa, 15 min).
// Ele tem dois jeitos:
// - ABERTO: um cartão com o tomate, o tempo grande, o anel que vai esvaziando e os botões;
// - MINIMIZADO: vira uma bolinha de tomate que flutua por cima do site, como os vídeos que vão para o canto
//   da tela ou as bolhas de conversa antigas do Facebook no Android. Dá para arrastar com o dedo ou o mouse;
//   ao soltar, ela gruda na borda mais perto. Se ninguém mexe nela por alguns segundos, ela se esconde
//   pela metade no canto (e volta inteira ao passar o mouse, tocar ou focar com o teclado).
// O tempo continua certo mesmo trocando de tela ou recarregando a página: guardamos a HORA EM QUE TERMINA,
// não um contador. Ao acabar, toca um aviso curto (pode desligar) e o relógio já prepara a próxima fase,
// mas só começa quando você mandar (ninguém é empurrado para a próxima tarefa sem querer).
/* ---------- relógio pomodoro (bolha flutuante) ---------- */
const POMO_MODES: Record<string, string[]> = { foco: ["Foco", "Hora de focar"], curta: ["Pausa curta", "Hora de uma pausa curta"], longa: ["Pausa longa", "Hora de uma pausa longa"] };
const POMO: OsmoPomo = Object.assign({ on: false, open: true, mode: "foco", running: false, endsAt: 0, left: 25 * 60e3, cycles: 0,
  mins: { foco: 25, curta: 5, longa: 15 }, sound: true, side: "right", y: null }, store.get("pomo", {}));
let pomoTick: number | undefined, pomoIdle: number | undefined, pomoTitle = document.title;
const pomoSave = () => store.set("pomo", POMO);
const pomoTotal = () => POMO.mins[POMO.mode] * 60e3;
const pomoLeft = () => Math.max(0, POMO.running ? POMO.endsAt - Date.now() : POMO.left);
const pomoFmt = (ms: number) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
// o tomate desenhado em SVG: corpo vermelho, folhinhas verdes e o anel de progresso em volta
const pomoTomato = (size: number, frac: number) => { const r = 46, c = 2 * Math.PI * r;
  return `<svg class="pomo-tomato" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="50" cy="50" r="${r}" class="pomo-ring-bg"/><circle cx="50" cy="50" r="${r}" class="pomo-ring" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - frac)).toFixed(1)}" transform="rotate(-90 50 50)"/>
    <ellipse cx="50" cy="55" rx="34" ry="31" class="pomo-body"/><ellipse cx="39" cy="45" rx="9" ry="6" class="pomo-shine"/>
    <path d="M50 27c-4-6-12-7-16-4 5 1 9 4 11 7-7-1-13 2-15 6 6-2 13-1 18 1 1-3 1-6 2-10z M50 27c4-6 12-7 16-4-5 1-9 4-11 7 7-1 13 2 15 6-6-2-13-1-18 1-1-3-1-6-2-10z" class="pomo-leaf"/>
    <rect x="48.5" y="18" width="3" height="10" rx="1.5" class="pomo-leaf"/></svg>`; };
function pomoHTML() {
  const left = pomoLeft(), frac = left / pomoTotal();
  if (!POMO.open) return `<button class="pomo-bubble" id="pomoBubble" aria-label="Relógio Pomodoro: ${POMO_MODES[POMO.mode][0]}, faltam ${pomoFmt(left)}${POMO.running ? "" : ", pausado"}. Toque para abrir ou arraste para mover.">
    ${pomoTomato(64, frac)}<span class="pomo-btime">${pomoFmt(left)}</span>${POMO.running ? "" : `<span class="pomo-paused" aria-hidden="true">❚❚</span>`}</button>`;
  return `<section class="pomo-panel" role="dialog" aria-label="Relógio Pomodoro">
    <div class="row" style="justify-content:space-between; flex-wrap:nowrap"><b>Pomodoro</b>
      <span class="row" style="gap:4px; flex-wrap:nowrap"><button class="icon-btn sm" data-pomo="min" aria-label="Minimizar para a bolinha">–</button><button class="icon-btn sm" data-pomo="close" aria-label="Fechar o relógio">×</button></span></div>
    <div class="seg pomo-modes" role="group" aria-label="Fase">${Object.keys(POMO_MODES).map(k => `<button type="button" data-pomo-mode="${k}" aria-pressed="${POMO.mode === k}">${POMO_MODES[k][0]}</button>`).join("")}</div>
    <div class="pomo-face">${pomoTomato(150, frac)}<span class="pomo-time mono" id="pomoTime" aria-live="off">${pomoFmt(left)}</span></div>
    <p class="hint" style="text-align:center">${POMO.running ? POMO_MODES[POMO.mode][0] + " em andamento" : left < pomoTotal() ? "Pausado" : "Pronto para começar"} · ${POMO.cycles} foco${POMO.cycles === 1 ? "" : "s"} concluído${POMO.cycles === 1 ? "" : "s"}</p>
    <div class="row" style="justify-content:center; gap:8px"><button class="btn hl" data-pomo="toggle">${POMO.running ? "Pausar" : left < pomoTotal() ? "Continuar" : "Começar"}</button><button class="btn" data-pomo="reset">Recomeçar</button><button class="btn ghost" data-pomo="skip">Pular</button></div>
    <details class="pomo-cfg"><summary class="hint">Ajustar tempos e som</summary>
      <div class="pomo-grid">${Object.keys(POMO_MODES).map(k => `<label for="pomo_${k}">${POMO_MODES[k][0]} (min)</label><input class="input" type="number" min="1" max="120" id="pomo_${k}" data-pomo-min="${k}" value="${POMO.mins[k]}">`).join("")}</div>
      <label class="check"><input type="checkbox" id="pomoSound" ${POMO.sound ? "checked" : ""}><span>Tocar um aviso curto ao terminar</span></label></details>
    <p class="sr-only" aria-live="polite" id="pomoSay"></p>
  </section>`;
}
// coloca a bolinha (ou o cartão) no lugar: grudada na borda guardada, na altura guardada, sem cobrir a barra de baixo do celular
function pomoPlace() {
  const el = $("#pomo"); if (!el) return;
  const m = 12, bottomBar = matchMedia("(max-width:980px)").matches ? 70 : 0;
  if (POMO.open) { // aberto: cartão no canto de baixo, do mesmo lado em que a bolinha estava
    el.style.top = ""; el.style.bottom = (m + bottomBar) + "px";
    el.style.left = POMO.side === "left" ? m + "px" : ""; el.style.right = POMO.side === "left" ? "" : m + "px"; return; }
  const size = 72, maxY = innerHeight - size - m - bottomBar, minY = m + 70;
  const y = Math.min(maxY, Math.max(minY, POMO.y ?? maxY));
  el.style.bottom = el.style.right = ""; el.style.top = y + "px";
  el.style.left = (POMO.side === "left" ? m : innerWidth - size - m) + "px";
}
function pomoRender() {
  let el = $("#pomo");
  if (!POMO.on) { if (el) el.remove(); clearInterval(pomoTick); pomoTick = undefined; document.title = pomoTitle; return; }
  if (!el) { el = document.createElement("div"); el.id = "pomo"; document.body.appendChild(el); }
  el.className = "pomo " + (POMO.open ? "is-open" : "is-bubble") + (POMO.side === "left" ? " on-left" : "");
  el.innerHTML = pomoHTML(); pomoPlace(); pomoWake();
  if (!pomoTick) pomoTick = setInterval(pomoStep, 1000);
}
// a cada segundo: atualiza o número e o anel (sem redesenhar tudo) e confere se o tempo acabou
function pomoStep() {
  if (!POMO.on) return;
  const left = pomoLeft();
  if (POMO.running && left <= 0) return pomoDone();
  const t = $("#pomoTime") || $("#pomo .pomo-btime"); if (t) t.textContent = pomoFmt(left);
  const ring = $("#pomo .pomo-ring"); if (ring) { const c = 2 * Math.PI * 46; ring.setAttribute("stroke-dashoffset", (c * (1 - left / pomoTotal())).toFixed(1)); }
  document.title = POMO.running ? `${pomoFmt(left)} · ${POMO_MODES[POMO.mode][0]} · Osmo` : pomoTitle;
}
function pomoDone() {
  const wasFocus = POMO.mode === "foco";
  if (wasFocus) POMO.cycles++;
  POMO.mode = wasFocus ? (POMO.cycles % 4 === 0 ? "longa" : "curta") : "foco";
  POMO.running = false; POMO.left = pomoTotal(); pomoSave();
  if (POMO.sound) pomoChime();
  if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch {}
  toast(`${wasFocus ? "Foco concluído" : "Pausa concluída"}. ${POMO_MODES[POMO.mode][1]} quando quiser.`);
  pomoRender(); const say = $("#pomoSay"); if (say) say.textContent = POMO_MODES[POMO.mode][1];
}
// aviso sonoro curto e suave, gerado na hora (três notas), sem baixar nenhum arquivo
function pomoChime() {
  try { const A = window.AudioContext || window.webkitAudioContext; const ac = new A();
    [660, 880, 990].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.22); g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.22 + 0.2); o.connect(g).connect(ac.destination); o.start(ac.currentTime + i * 0.22); o.stop(ac.currentTime + i * 0.22 + 0.22); });
  } catch {}
}
// recolher no canto: sem mexer por 4 segundos, a bolinha se esconde pela metade na borda
// (só fica inteira enquanto o mouse está em cima ou quando ela foi focada pelo teclado)
function pomoWake() {
  const el = $("#pomo"); if (!el) return;
  el.classList.remove("docked"); clearTimeout(pomoIdle);
  if (!POMO.open) pomoIdle = setTimeout(() => { if (!el.matches(":hover") && !el.querySelector<HTMLElement>(":focus-visible")) el.classList.add("docked"); }, 4000);
}
function pomoOpen() { POMO.on = true; POMO.open = true; pomoSave(); pomoRender(); const b = $("#pomo [data-pomo='toggle']"); if (b) b.focus(); }
document.addEventListener("click", e => { const target = eventElement(e); if (!target) return;
  const t = target;
  if (t.closest<HTMLElement>("[data-pomo-open]")) { if (t.closest<HTMLElement>("#layer .drawer")) closeA11y(); if (menuOpen) closeMenu(false); return pomoOpen(); }
  const md = t.closest<HTMLElement>("[data-pomo-mode]"); if (md) { POMO.mode = md.dataset.pomoMode!; POMO.running = false; POMO.left = pomoTotal(); pomoSave(); return pomoRender(); }
  const a = t.closest<HTMLElement>("[data-pomo]"); if (!a) return;
  const act = a.dataset.pomo;
  if (act === "toggle") { if (POMO.running) { POMO.left = pomoLeft(); POMO.running = false; } else { POMO.endsAt = Date.now() + pomoLeft(); POMO.running = true; } }
  if (act === "reset") { POMO.running = false; POMO.left = pomoTotal(); }
  if (act === "skip") { POMO.running = false; POMO.left = 0; pomoSave(); return pomoDone(); }
  if (act === "min") { POMO.open = false; pomoSave(); pomoRender(); const b = $("#pomoBubble"); if (b) b.focus(); return; }
  if (act === "close") { POMO.on = false; POMO.running = false; POMO.left = pomoTotal(); }
  pomoSave(); pomoRender();
});
document.addEventListener("change", e => { const target = eventInput(e); if (!target) return;
  const t = target;
  if (t.dataset.pomoMin) { const k = t.dataset.pomoMin, v = Math.min(120, Math.max(1, Math.round(Number(t.value) || POMO.mins[k]))); POMO.mins[k] = v;
    if (POMO.mode === k && !POMO.running) POMO.left = pomoTotal(); pomoSave(); pomoStep(); }
  if (t.id === "pomoSound") { POMO.sound = t instanceof HTMLInputElement && t.checked; pomoSave(); }
});
// ARRASTAR A BOLINHA: segura e move (dedo ou mouse). Se andou menos de 6 px, foi um toque: abre o relógio.
// Ao soltar, ela escolhe a borda mais perto (esquerda ou direita) e desliza até lá, guardando a altura.
let PDRAG: { dx: number; dy: number; x0: number; y0: number; moved: boolean; id: number } | null = null;
document.addEventListener("pointerdown", e => { const target = eventElement(e); if (!target) return;
  const b = target.closest<HTMLElement>("#pomoBubble"); if (!b) return;
  const el = $("#pomo"), r = el.getBoundingClientRect();
  PDRAG = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
  try { b.setPointerCapture(e.pointerId); } catch {} // alguns navegadores recusam a captura; o arrastar funciona do mesmo jeito
  el.classList.remove("docked"); el.classList.add("dragging"); clearTimeout(pomoIdle);
});
document.addEventListener("pointermove", e => { const target = eventElement(e); if (!target) return;
  if (!PDRAG || e.pointerId !== PDRAG.id) return;
  if (Math.hypot(e.clientX - PDRAG.x0, e.clientY - PDRAG.y0) > 6) PDRAG.moved = true;
  if (!PDRAG.moved) return;
  const el = $("#pomo"); el.style.left = (e.clientX - PDRAG.dx) + "px"; el.style.top = (e.clientY - PDRAG.dy) + "px";
});
document.addEventListener("pointerup", e => { const target = eventElement(e); if (!target) return;
  if (!PDRAG || e.pointerId !== PDRAG.id) return;
  const el = $("#pomo"), d = PDRAG; PDRAG = null; el.classList.remove("dragging");
  if (!d.moved) { POMO.open = true; pomoSave(); return pomoRender(); }
  const r = el.getBoundingClientRect();
  POMO.side = r.left + r.width / 2 < innerWidth / 2 ? "left" : "right"; POMO.y = r.top; pomoSave();
  el.classList.toggle("on-left", POMO.side === "left"); pomoPlace(); pomoWake();
});
document.addEventListener("pointercancel", () => { if (PDRAG) { PDRAG = null; const el = $("#pomo"); if (el) { el.classList.remove("dragging"); pomoPlace(); } } });
// teclado: com a bolinha focada, as setas levam para o outro lado ou para cima e para baixo
document.addEventListener("keydown", e => { const target = eventElement(e); if (!target) return;
  if (target.id !== "pomoBubble") return;
  const k = e.key; if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) return;
  e.preventDefault();
  if (k === "ArrowLeft") POMO.side = "left"; if (k === "ArrowRight") POMO.side = "right";
  if (k === "ArrowUp" || k === "ArrowDown") POMO.y = ($("#pomo").getBoundingClientRect().top) + (k === "ArrowUp" ? -60 : 60);
  pomoSave(); $("#pomo").classList.toggle("on-left", POMO.side === "left"); pomoPlace(); pomoWake();
});
document.addEventListener("pointerover", e => { const target = eventElement(e); if (!target) return; if (target.closest && target.closest<HTMLElement>("#pomo")) pomoWake(); });
document.addEventListener("focusin", e => { const target = eventElement(e); if (!target) return; if (target.closest && target.closest<HTMLElement>("#pomo")) pomoWake(); });
addEventListener("resize", () => { if (POMO.on) pomoPlace(); });
// se a página recarregar com o relógio ligado, ele volta como estava (e, se o tempo acabou enquanto isso, avisa)
if (!RECURSOS.pomodoro) { POMO.on = false; POMO.running = false; }
if (POMO.on) { if (POMO.running && POMO.endsAt <= Date.now()) { POMO.running = false; POMO.left = 0; pomoDone(); } else pomoRender(); }

// CADA TELA DO SEU JEITO: o theme.js já descobriu se é celular, tablet, computador ou TV (data-device no <html>).
// Aqui ficam os comportamentos que fazem sentido para cada uma:
// - COMPUTADOR: atalho de teclado "/" para ir direto à busca da tela;
// - TV: não tem mouse nem toque, só o controle remoto. As setas pulam de um botão/link para o mais próximo
//   naquela direção (como num menu de TV), OK/Enter clica, e o botão "Voltar" do controle volta uma tela.
//   Ao abrir cada tela, o foco já vai para o primeiro item, para a pessoa ver onde está;
// - CELULAR e TABLET: o CSS cuida (campos com letra de 16 px para o iPhone não dar zoom, alvos de toque grandes).
// O tipo de tela é sempre automático: não há opção para trocar em Ajustes.
/* ---------- tipo de tela: celular, tablet, computador ou tv ---------- */
const DEVICE = document.documentElement.dataset.device || "desktop";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const isTyping = (el: Element | null): boolean => !!el && ((el instanceof HTMLElement && el.isContentEditable) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
// o que está visível de verdade (dentro de um painel aberto, só ele conta)
function focusables() {
  const scope = $("#layer .drawer") || $("#layer") && $("#layer").children.length && $("#layer") || DEVICE === "tv" && $("#consent") || document;
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; });
}
// navegação espacial: de onde o foco está, procura o item mais perto na direção da seta
function spatialMove(dir: string) {
  const cur = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const items = focusables(); if (!items.length) return false;
  if (!cur) { items[0].focus(); return true; }
  const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const dx = x - cx, dy = y - cy;
    const main = dir === "ArrowRight" ? dx : dir === "ArrowLeft" ? -dx : dir === "ArrowDown" ? dy : -dy;
    const side = dir === "ArrowRight" || dir === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
    if (main <= 4) continue; // só o que está de fato naquela direção
    const score = main + side * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best) return false;
  best.focus({ preventScroll: true }); best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: document.documentElement.classList.contains("calm") ? "auto" : "smooth" });
  return true;
}
function tvFocusFirst() {
  if (DEVICE !== "tv" || $("#layer").children.length) return;
  const consent = $("#consent [data-consent]"); if (consent) { consent.focus({ preventScroll: true }); return; } // aviso de cookies ainda sem resposta
  // começa num botão ou link, nunca num campo de texto (na TV isso abriria o teclado da tela sem a pessoa pedir)
  const first = [...$("#view").querySelectorAll<HTMLElement>(FOCUSABLE)].find(el => el.getBoundingClientRect().height > 0 && !isTyping(el));
  if (first) first.focus({ preventScroll: true });
}
document.addEventListener("keydown", e => { const target = eventElement(e); if (!target) return;
  const el = document.activeElement;
  // computador: "/" leva para a busca (a de vagas, talentos, gestão ou a do início)
  if (DEVICE === "desktop" && e.key === "/" && !isTyping(el) && !e.metaKey && !e.ctrlKey) {
    const s = $("#fq") || $("#tq") || $("#admQ") || $("#heroQ"); if (s) { e.preventDefault(); s.focus(); s.select && s.select(); }
    return;
  }
  if (DEVICE !== "tv") return;
  // controle remoto: botão Voltar (cada fabricante manda um código: Tizen 10009, webOS 461, Android TV "GoBack")
  if (["GoBack", "BrowserBack", "Back"].includes(e.key) || e.keyCode === 10009 || e.keyCode === 461 || (e.key === "Backspace" && !isTyping(el))) {
    e.preventDefault();
    if ($("#layer").children.length) { const close = $("#layer [data-adm-close], #a11yClose, [data-sheet='no']"); if (close) close.click(); else $("#layer").innerHTML = ""; }
    else history.back();
    return;
  }
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
  // dentro de um campo de texto, as setas continuam andando pelo texto; numa lista de opções, escolhendo opções
  if (isTyping(el) && !(el instanceof HTMLInputElement && /^(checkbox|radio|button|submit)$/.test(el.type))) {
    // seletor (lista de opções) fechado: as setas pulam para o vizinho; o OK abre a lista, e aí o próprio navegador cuida
    if ((el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0, atEnd = el.selectionStart === (el.value || "").length;
      if (!(e.key === "ArrowLeft" && atStart) && !(e.key === "ArrowRight" && atEnd)) return;
    }
    if (el instanceof HTMLTextAreaElement && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;
  }
  if (spatialMove(e.key)) e.preventDefault();
});

// TEMA: claro, escuro ou igual ao do sistema. A escolha fica guardada no navegador
// (osmo-theme) e o theme.js aplica antes da página aparecer, para não piscar.
/* ---------- tema: claro, escuro ou do sistema (paletas da Osmo em styles.css) ---------- */
const THEMES = [["light", "Claro"], ["dark", "Escuro"], ["system", "Sistema"]];
// escuro é o padrão; "sistema" fica salvo explicitamente para não cair de volta no escuro
function getTheme() { try { const t = localStorage.getItem("osmo-theme"); return t === "light" || t === "system" ? t : "dark"; } catch { return "dark"; } }
function setTheme(t: string) {
  try { localStorage.setItem("osmo-theme", t); } catch {}
  const r = document.documentElement; t === "system" ? r.removeAttribute("data-theme") : r.setAttribute("data-theme", t);
}
const themeHTML = () => { const cur = getTheme(); return `<div class="field"><span class="flabel" id="themeLbl">Tema</span>
  <div class="seg theme-seg" role="group" aria-labelledby="themeLbl">${THEMES.map(([k, n]) => `<button type="button" data-theme-set="${k}" aria-pressed="${cur === k}">${n}</button>`).join("")}</div>
  <span class="hint">"Sistema" segue o modo claro ou escuro do seu celular ou computador.</span></div>`; };

// APP INSTALÁVEL (PWA): o site pode virar um ícone na tela inicial e abrir em janela própria,
// sem a barra do navegador. Quem faz isso possível é o sw.js (o ajudante que mora no aparelho)
// e o manifest.webmanifest (nome, ícone e cores do app).
// - Android, Chrome e Edge avisam "dá para instalar" com o evento beforeinstallprompt: guardamos
//   esse aviso e só o usamos quando a pessoa aperta "Instalar" em Ajustes (nada de pop-up surpresa);
// - iPhone e iPad não têm esse aviso: lá mostramos o caminho pelo botão Compartilhar;
// - se o app já está aberto como app instalado, Ajustes só conta isso.
/* ---------- app instalável ---------- */
let installPrompt: BeforeInstallPromptEvent | null = null;
const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// Safari no Mac: não tem o aviso automático, mas instala pelo menu Arquivo (Safari 17 em diante)
const isMacSafari = () => /Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(navigator.userAgent) && !isIOS();
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; refreshInstallHTML(); });
addEventListener("appinstalled", () => { installPrompt = null; refreshInstallHTML(); toast("Osmo instalado. Procure o ícone na tela inicial."); });
function installHTML() {
  const row = (hint: string, btn = "") => `<div class="toggle"><span><b>Instalar como app</b><br><span class="hint">${hint}</span></span>${btn}</div>`;
  if (isInstalled()) return row("Você já está usando o app instalado neste aparelho.");
  if (installPrompt) return row("Ícone na tela inicial, abre em janela própria e sem a barra do navegador", `<button class="btn sm" data-install="1">Instalar</button>`);
  if (isIOS()) return row("No iPhone ou iPad, toque em Compartilhar e depois em <b>Adicionar à Tela de Início</b>.");
  if (isMacSafari()) return row("No Safari do Mac, use o menu <b>Arquivo → Adicionar ao Dock</b>. O app abre em janela própria.");
  return row("Se o seu navegador permitir, procure no menu dele a opção <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.");
}
function refreshInstallHTML() { const box = $("#adjInstall"); if (box) box.innerHTML = installHTML(); }
document.addEventListener("click", async e => { const target = eventElement(e); if (!target) return;
  if (!target.closest<HTMLElement>("[data-install]") || !installPrompt) return;
  const p = installPrompt; installPrompt = null;
  p.prompt();
  try { await p.userChoice; } catch {}
  refreshInstallHTML();
});
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

// CONFORTO: as preferências de acessibilidade (texto maior, mais espaço entre linhas, sem
// animações, modo foco, vidro líquido). Cada uma liga uma "classe" no <html>, e o styles.css
// muda o visual quando a classe está ligada.
/* ---------- ajustes (antes "Conforto") ---------- */
function applyPrefs() { const r = document.documentElement; ["big", "airy", "calm", "focus", "glass"].forEach(k => r.classList.toggle(k, !!PREFS[k])); store.set("prefs", PREFS); }
function openA11y() {
  // cada interruptor de preferência: nome, explicação curta e a chave guardada em PREFS
  const sw = (k: string, name: string, hint: string) => `<label class="toggle"><span><b>${name}</b><br><span class="hint">${hint}</span></span><input type="checkbox" class="sw" data-pref="${k}" ${PREFS[k] ? "checked" : ""}></label>`;
  const ga = gaToggleHTML();
  $("#layer").innerHTML = `<div class="scrim" id="scrim"></div><div class="drawer" role="dialog" aria-modal="true" aria-label="Ajustes">
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="row" style="justify-content:space-between"><h2>Ajustes</h2><button class="btn sm ghost" id="a11yClose">Fechar</button></div>
    <p class="muted">Deixe a plataforma do seu jeito. Fica salvo neste navegador.</p>
    ${RECURSOS.idiomas ? `<section class="adj-group" aria-labelledby="adjLang"><h3 class="label" id="adjLang">Idioma</h3>
      <div class="field"><label class="lang-pill"><span class="sr-only">Idioma</span><span class="lang-flag" aria-hidden="true">${LANG_FLAGS[TR.lang] || ""}</span><select id="langSel" data-lang-set translate="no">${TR.langs.map(([c, n]) => `<option value="${c}" ${c === TR.lang ? "selected" : ""}>${n}</option>`).join("")}</select><svg class="lang-caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0h10L5 6z"/></svg></label>
      <span class="hint">Escolha o idioma da plataforma. Fica salvo neste navegador.</span></div></section>` : ""}
    <section class="adj-group" aria-labelledby="adjLook"><h3 class="label" id="adjLook">Aparência</h3>
      ${themeHTML()}
      ${sw("glass", "Vidro líquido", "Painéis translúcidos com fundo desfocado. Desligue para cores sólidas e mais contraste")}</section>
    <section class="adj-group" aria-labelledby="adjRead"><h3 class="label" id="adjRead">Leitura</h3>
      ${sw("big", "Texto maior", "Aumenta o tamanho da letra em toda a plataforma")}
      ${sw("airy", "Mais espaço entre linhas", "Ajuda a acompanhar textos longos")}</section>
    <section class="adj-group" aria-labelledby="adjFocus"><h3 class="label" id="adjFocus">Foco e movimento</h3>
      ${sw("focus", "Modo foco", "Esconde painéis laterais e informações extras")}
      ${sw("calm", "Sem animações", "Remove transições e movimentos")}
      ${RECURSOS.pomodoro ? `<div class="toggle"><span><b>Relógio Pomodoro</b><br><span class="hint">Blocos de foco e pausa, numa bolinha que fica no canto da tela</span></span><button class="btn sm" data-pomo-open="1">🍅 Abrir</button></div>` : ""}</section>
    <section class="adj-group" aria-labelledby="adjApp"><h3 class="label" id="adjApp">App</h3><div id="adjInstall">${installHTML()}</div></section>
    ${ga ? `<section class="adj-group" aria-labelledby="adjPriv"><h3 class="label" id="adjPriv">Privacidade</h3>${ga}</section>` : ""}
  </div>`;
  $("#a11yClose").focus();
  sheetDrag($("#layer .drawer"), closeA11y);
}
// BANDEIRAS do seletor de idioma: desenhos simples em SVG, recortados em círculo pelo CSS.
// Latinoamérica usa a do México (não existe uma bandeira única da região).
const LANG_FLAGS: Record<string, string> = {
  "pt-BR": `<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#009C3B"/><path d="M12 3.5 22 12 12 20.5 2 12z" fill="#FFDF00"/><circle cx="12" cy="12" r="5" fill="#002776"/><path d="M7.2 10.8c3.2-.6 6.6.1 9.6 1.9" stroke="#fff" stroke-width="1" fill="none"/></svg>`,
  "en-US": `<svg viewBox="0 0 26 26"><rect width="26" height="26" fill="#fff"/>${[0, 4, 8, 12, 16, 20, 24].map(y => `<rect y="${y}" width="26" height="2" fill="#B22234"/>`).join("")}<rect width="13" height="14" fill="#3C3B6E"/>${[[3, 3], [7, 3], [11, 3], [5, 6.5], [9, 6.5], [3, 10], [7, 10], [11, 10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".8" fill="#fff"/>`).join("")}</svg>`,
  "es-419": `<svg viewBox="0 0 24 24"><rect width="8" height="24" fill="#006847"/><rect x="8" width="8" height="24" fill="#fff"/><rect x="16" width="8" height="24" fill="#CE1126"/><circle cx="12" cy="12" r="2.2" fill="#8C6A3F"/></svg>`,
  "fr-CA": `<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#fff"/><rect width="6" height="24" fill="#D52B1E"/><rect x="18" width="6" height="24" fill="#D52B1E"/><path d="M12 5.5l1.1 2.2 1.3-.6-.5 3 1.8-1.6.4 1.2 1.6-.3-.6 1.9.8.5L14.6 14l.3 1.2-2.5-.4.1 3.2h-1l.1-3.2-2.5.4.3-1.2-3.3-2.2.8-.5-.6-1.9 1.6.3.4-1.2 1.8 1.6-.5-3 1.3.6z" fill="#D52B1E"/></svg>`,
};
// IDIOMA: qualquer seletor com data-lang-set (Ajustes e rodapé) troca o idioma e recarrega a página
document.addEventListener("change", e => { const target = eventInput(e); if (!target) return; if (target.matches && target.matches("[data-lang-set]")) TR.set(target.value); });
$$("[data-recurso]").forEach(el => { el.hidden = !RECURSOS[el.dataset.recurso!]; });
$$("[data-lang-set]").forEach(s => { s.value = TR.lang; });
$$(".lang-flag").forEach(f => { f.innerHTML = LANG_FLAGS[TR.lang] || ""; });
function closeA11y() { $("#layer").innerHTML = ""; const b = $("#a11yBtn"); (b && b.offsetParent ? b : $("#menuBtn")).focus(); }

// MENU HAMBÚRGUER (celular e tablet): abre deslizando da direita. Esc fecha e o Tab fica preso
// dentro do menu enquanto ele está aberto. Se a janela crescer até virar tela de computador,
// o menu fecha sozinho.
/* ---------- menu hambúrguer ---------- */
let menuOpen = false, menuT: number | undefined;
function openMenu() {
  const m = $("#mmenu"), sc = $("#mmScrim"); clearTimeout(menuT); m.hidden = false; sc.hidden = false; menuOpen = true;
  requestAnimationFrame(() => { m.classList.add("open"); sc.classList.add("open"); });
  document.body.classList.add("menu-open"); $("#menuBtn").setAttribute("aria-expanded", "true");
  if (ME) prepRoleAnim(); // já deixa a animação do botão de trocar papel pronta
  const cur = m.querySelector<HTMLElement>('[aria-current="page"]') || m.querySelector<HTMLElement>("button"); setTimeout(() => (cur || $("#mmClose")).focus(), 30);
}
function closeMenu(refocus: boolean) {
  if (!menuOpen) return; menuOpen = false;
  const m = $("#mmenu"), sc = $("#mmScrim");
  m.classList.remove("open"); sc.classList.remove("open"); document.body.classList.remove("menu-open"); $("#menuBtn").setAttribute("aria-expanded", "false");
  const calm = document.documentElement.classList.contains("calm") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  menuT = setTimeout(() => { m.hidden = true; sc.hidden = true; }, calm ? 0 : 240);
  if (refocus) $("#menuBtn").focus();
}
window.addEventListener("resize", () => { if (menuOpen && !matchMedia("(max-width:980px)").matches) closeMenu(false); });
document.addEventListener("keydown", e => { const target = eventElement(e); if (!target) return;
  if (menuOpen) {
    if (e.key === "Escape") return closeMenu(true);
    if (e.key === "Tab") { const f = [...$("#mmenu").querySelectorAll<HTMLElement>("button, a[href]")]; const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    return;
  }
  if (e.key === "Escape" && $("#layer").innerHTML) closeA11y();
  if ($("#layer .drawer")) trapFocus(e, $("#layer .drawer"));
});

// HORA DE COMEÇAR! Quando a página abre:
// - a cada 30 s (se a aba estiver à vista), pergunta "quem sou eu?" para atualizar avisos;
// - aplica as preferências de Ajustes;
// - liga o cabeçalho que diminui ao rolar a página;
// - se voltou do Google com erro, guarda a mensagem e limpa o endereço;
// - carrega quem está logado E as categorias ao mesmo tempo e então desenha a primeira tela.
/* ---------- início ---------- */
setInterval(() => { if (ME && !document.hidden) refreshMe(); }, 30000);
applyPrefs();
/* topo maior parado no início; a folga entre 8 e 40 px evita que ele fique alternando bem no limite */
function syncTopSize() { const y = scrollY, r = document.documentElement; if (y <= 8) r.classList.add("top-big"); else if (y > 40) r.classList.remove("top-big"); }
addEventListener("scroll", syncTopSize, { passive: true }); syncTopSize();
const oauthErr = new URLSearchParams(location.search).get("oauth_error");
if (oauthErr) history.replaceState(null, "", TR.withLanguage(location.pathname + location.hash));
fixLegacyHash();
Promise.all([refreshMe(), loadTaxonomy(), TR.ready]).then(route).then(() => { if (oauthErr) { const b = $("#authErr"); const msg = OAUTH_ERR[oauthErr] || OAUTH_ERR.falhou; if (b) { b.textContent = msg; b.hidden = false; } else toast(msg); } }).catch(() => { if (!$("#view h1")) $("#view").innerHTML = emptyBox("Não deu para carregar o aplicativo.", "Recarregue a página para tentar novamente."); });

})();
