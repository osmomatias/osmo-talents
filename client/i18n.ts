// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "tradutor de bolso" do site. O site inteiro foi escrito em português.
// Quando a pessoa usa outro idioma, este arquivo:
//   1. descobre o idioma: o que a pessoa escolheu em Ajustes (guardado neste
//      navegador) ou, na primeira visita, o idioma do navegador. Dá para forçar
//      com ?lang=en-US no endereço (bom para testar e para mandar link);
//   2. baixa o dicionário daquele idioma (public/i18n/<idioma>.json);
//   3. fica de olho na página: toda vez que um texto aparece (uma tela nova, um
//      aviso, uma mensagem de erro), ele troca pela tradução, antes de a tela ser
//      pintada. Por isso o app.js quase não precisou mudar.
// O que NÃO é traduzido: o que as pessoas escrevem (dentro de campos de texto) e
// qualquer parte marcada com translate="no" (ex.: as mensagens das conversas).
// Em português, ele não faz nada: só deixa a página como sempre foi.
(function () {
  "use strict";
  var core = window.OsmoI18nCore;
  var KEY = "osmo-lang";
  // VERSÃO 3.1 (MVP): os outros idiomas ficam escondidos e o site fica só em português.
  // Os dicionários continuam em public/i18n/. Para trazer de volta, troque false por true:
  // o seletor volta ao rodapé e aos Ajustes, e ?lang=en-US volta a funcionar.
  var ATIVO = false;
  var SUPPORTED: string[] = core.LANGS.map(function (l) { return l[0]; });
  var html = document.documentElement;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function detect() {
    if (!ATIVO) return "pt-BR";
    var q = (location.search.match(/[?&]lang=([\w-]+)/) || [])[1];
    var fromUrl = q && core.pick([q]);
    if (fromUrl) { try { localStorage.setItem(KEY, fromUrl); } catch (e) {} return fromUrl; }
    var s = stored();
    if (s && SUPPORTED.indexOf(s) >= 0) return s;
    return core.pick(navigator.languages || [navigator.language]) || "pt-BR";
  }
  var lang = detect();
  var locale = lang; // datas e números: Intl entende "en-US", "es-419", "fr-CA", "pt-BR"
  html.setAttribute("lang", lang);
  var C: OsmoCompiledDictionary | null = null; // dicionário pronto para procurar
  // enquanto o dicionário chega, a página fica invisível (classe i18n-wait), para não piscar em português
  try { var st = document.createElement("style"); st.textContent = "html.i18n-wait body{visibility:hidden}"; (document.head || html).appendChild(st); } catch (e) {}

  // PÁGINAS JÁ TRADUZIDAS INTEIRAS (Privacidade e Termos): cada idioma vem num bloco
  // <div data-doc="en-US">. Mostramos o do idioma escolhido (ou o português, se faltar).
  function legalDocs() {
    var docs = document.querySelectorAll<HTMLElement>("[data-doc]");
    if (!docs.length) return;
    var hit = document.querySelector<HTMLElement>('[data-doc="' + lang + '"]') || document.querySelector<HTMLElement>('[data-doc="pt-BR"]');
    for (var i = 0; i < docs.length; i++) docs[i].hidden = docs[i] !== hit;
    if (!hit) return;
    if (hit.dataset.title) document.title = hit.dataset.title;
    var d = document.querySelector('meta[name="description"]'); if (d && hit.dataset.desc) d.setAttribute("content", hit.dataset.desc);
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", legalDocs) : legalDocs();

  // ---------- trocar os textos da página ----------
  var ATTRS = ["placeholder", "aria-label", "title", "alt"];
  var SKIP_TAGS: Record<string, number> = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
  var mine = new WeakMap<Node, string>(); // o que nós mesmos escrevemos (para não traduzir de novo)
  function skip(el: Element): boolean {
    for (var e: Element | null = el; e && e.nodeType === 1; e = e.parentElement) {
      if (SKIP_TAGS[e.tagName] || e.getAttribute("translate") === "no" || (e instanceof HTMLElement && e.isContentEditable)) return true;
    }
    return false;
  }
  function doText(node: Node): void {
    var v = node.nodeValue;
    if (!v || mine.get(node) === v || !/[A-Za-zÀ-ÿ]/.test(v)) return;
    if (node.parentElement && skip(node.parentElement)) return;
    var t = C ? core.translateText(C, v) : null;
    if (t != null && t !== v) { node.nodeValue = t; mine.set(node, t); }
  }
  function doAttrs(el: Element): void {
    // num <textarea> o texto de dentro é da pessoa, mas o placeholder e o aria-label são nossos
    if (el.getAttribute("translate") === "no" || (el instanceof HTMLElement && el.isContentEditable) || (el.parentElement && skip(el.parentElement))) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a);
      if (!v || !/[A-Za-zÀ-ÿ]/.test(v)) continue;
      var t = C ? core.translateText(C, v) : null;
      if (t != null && t !== v) el.setAttribute(a, t);
    }
    // botões <input type="button|submit"> mostram o "value"
    if (el instanceof HTMLInputElement && /^(button|submit|reset)$/.test(el.type) && el.value) {
      var tv = C ? core.translateText(C, el.value) : null; if (tv != null) el.value = tv;
    }
  }
  function walk(root: Node | null): void {
    if (!C || !root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root instanceof Element) { doAttrs(root); if (skip(root)) return; }
    var it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n instanceof Element && n.getAttribute("translate") === "no") return NodeFilter.FILTER_REJECT;
        if (n instanceof Element && SKIP_TAGS[n.tagName]) { doAttrs(n); return NodeFilter.FILTER_REJECT; }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = it.nextNode())) n.nodeType === 3 ? doText(n) : n instanceof Element && doAttrs(n);
  }
  function handle(records: MutationRecord[]): void {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === "childList") for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
      else if (r.type === "characterData") doText(r.target);
      else if (r.type === "attributes" && r.target instanceof Element) doAttrs(r.target);
    }
  }
  var obs = new MutationObserver(handle);
  function observe() {
    obs.observe(html, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(["value"]) });
  }

  // ---------- carregar o dicionário ----------
  var ready: Promise<void>;
  if (lang === "pt-BR") ready = Promise.resolve();
  else {
    html.classList.add("i18n-wait"); // esconde a página por um instante, para não piscar em português
    var me = document.currentScript instanceof HTMLScriptElement && document.currentScript.src;
    var v = (me && (me.match(/[?&]v=([\w]+)/) || [])[1]) || "";
    ready = fetch("/i18n/" + lang + ".json" + (v ? "?v=" + v : ""))
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (dict: OsmoTranslationDictionary) {
        C = core.compile(dict);
        var go = function () { walk(document.documentElement); observe(); };
        document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
      })
      .catch(function () { /* sem dicionário, o site segue em português */ })
      .then(function () { html.classList.remove("i18n-wait"); });
    setTimeout(function () { html.classList.remove("i18n-wait"); }, 2500); // nunca deixa a tela presa
  }

  // ---------- o que o resto do site usa ----------
  window.I18N = {
    lang: lang,
    locale: locale,
    ativo: ATIVO,
    langs: ATIVO ? core.LANGS : core.LANGS.filter(function (l) { return l[0] === "pt-BR"; }),
    ready: ready,
    // T("Olá, {1}!", nome): para textos que não passam pela tela (prompt, título da aba...)
    t: function (key: string, ...args: unknown[]) { return core.format(C, key, args); },
    // traduz um texto qualquer do jeito da tela (com moldes); devolve o original se não souber
    tx: function (s: string) { if (!C) return s; var t = core.translateText(C, s); return t == null ? s : t; },
    // processa já o que entrou na página (útil logo antes de ler um texto da tela)
    flush: function () { if (C) handle(obs.takeRecords()); },
    set: function (l: string) {
      if (!ATIVO || SUPPORTED.indexOf(l) < 0) return;
      try { localStorage.setItem(KEY, l); } catch (e) {}
      var u = new URL(location.href); u.searchParams.delete("lang");
      location.replace(u.pathname + u.search + u.hash);
    },
  };
})();
