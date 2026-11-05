// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "intérprete" do site. A plataforma é escrita em português, e este arquivo traduz
// o que aparece na tela para inglês, espanhol ou francês, sem mexer no resto do código.
//
// 1. QUAL IDIOMA? Olha o endereço: osmo.com.br/?lang=en-US (ou es-419, fr-CA, pt-BR).
//    A escolha fica guardada no navegador, então as próximas telas e visitas continuam
//    no mesmo idioma. Sem escolha, fica em português (pt-BR).
// 2. O DICIONÁRIO: cada idioma tem um arquivo em /i18n/ (ex.: /i18n/en-US.js) com pares
//    "texto em português" → "texto traduzido". Frases com partes que mudam (nomes, números)
//    usam marcadores: "Etapa {0} de {1}" → "Step {0} of {1}".
// 3. O VIGIA: um MutationObserver fica olhando a página. Toda vez que o app.js escreve algo
//    novo na tela (textos, botões, dicas, rótulos de acessibilidade), o vigia troca pela
//    tradução na mesma hora, antes de a pessoa ver.
// O que as pessoas escrevem (nomes, mensagens, briefings) passa quase sempre direto: só é
// trocado o texto que é idêntico a uma frase da própria plataforma.
// Este arquivo precisa vir no <head>, antes de tudo, para o dicionário chegar antes da tela.
(function () {
  "use strict";
  var LANGS = { "pt-BR": "Português", "en-US": "English", "es-419": "Español", "fr-CA": "Français" };
  var SHORT = { pt: "pt-BR", en: "en-US", es: "es-419", fr: "fr-CA" };
  function pick(v) {
    if (!v) return "";
    v = String(v).trim().replace("_", "-");
    for (var k in LANGS) if (k.toLowerCase() === v.toLowerCase()) return k;
    return SHORT[v.slice(0, 2).toLowerCase()] || "";
  }
  function saved() { try { return JSON.parse(localStorage.getItem("osmo.lang") || "null"); } catch (e) { return null; } }
  function save(l) { try { localStorage.setItem("osmo.lang", JSON.stringify(l)); } catch (e) {} }

  var fromUrl = pick(new URLSearchParams(location.search).get("lang"));
  var lang = fromUrl || pick(saved()) || "pt-BR";
  if (fromUrl) save(fromUrl);
  document.documentElement.lang = lang;

  var D = {}, P = [], FREE = [], cache = new Map();
  var api = {
    lang: lang,
    langs: LANGS,
    t: function (s) { return tr(s); },
    // troca de idioma: guarda a escolha e recarrega a tela atual com ?lang=
    set: function (l) {
      l = pick(l) || "pt-BR"; save(l);
      var u = new URL(location.href); u.searchParams.set("lang", l); location.href = u.toString();
    },
    // usado pelo arquivo do dicionário (/i18n/xx.js) quando termina de carregar
    load: function (data) {
      if (!data || data.lang !== lang) return;
      D = data.dict || {}; FREE = data.free || []; P = []; cache.clear();
      Object.keys(D).forEach(function (k) { if (/\{\d+\}/.test(k)) P.push(compile(k)); });
      P.sort(function (a, b) { return b.lit - a.lit || b.k.length - a.k.length; }); // a frase mais específica ganha
      start();
    },
  };
  window.OSMO_LANG = api;
  if (lang === "pt-BR") return;

  // o dicionário entra no lugar, antes do resto da página (assim a tela já nasce traduzida)
  var me = document.currentScript, v = me && /[?&]v=([\w.]+)/.exec(me.src);
  document.write('<script src="/i18n/' + lang + ".js" + (v ? "?v=" + v[1] : "") + '"><\/script>');

  // ---------- tradução de um texto ----------
  var escRe = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };
  function compile(k) {
    var order = [], lit = 0;
    var re = k.split(/(\{\d+\})/).map(function (p) {
      var m = /^\{(\d+)\}$/.exec(p);
      if (m) { order.push(Number(m[1])); return "([\\s\\S]*?)"; }
      lit += (p.match(/[A-Za-zÀ-ÿ]/g) || []).length; return escRe(p);
    }).join("");
    // frases com pouco texto fixo ("{0} de {1}") só valem com números nas partes que mudam,
    // para não "traduzir" o nome de alguém ou o título de uma vaga por engano
    return { k: k, re: new RegExp("^" + re + "$"), order: order, lit: lit, weak: lit < 5 && FREE.indexOf(k) < 0 };
  }
  var NUMERIC = /^[\d\s.,:;%#+\-–/()R$×·]*$/;
  // as partes que mudam também são traduzidas quando são frases da plataforma ("Foco", "Aberta"...)
  function part(m, p, n) { var i = p.order.indexOf(Number(n)); return i < 0 ? "" : m[i + 1]; }
  function sub(x, depth) { var c = core(x), t = c && c[2] && depth < 2 ? trCore(c[2], depth + 1) : null; return t != null ? c[1] + t + c[3] : null; }
  function fill(p, m, depth) {
    return D[p.k].replace(/\{(\d+)\}/g, function (_, n) { var x = part(m, p, n), t = sub(x, depth); return t != null ? t : x; });
  }
  // a parte que muda está "resolvida" se é número ou também tem tradução
  function resolved(p, m, depth) {
    for (var j = 1; j < m.length; j++) if (!NUMERIC.test(m[j]) && sub(m[j], depth) == null) return false;
    return true;
  }
  function core(s) { var m = /^([\s·,:;|—–.-]*)([\s\S]*?)([\s·|]*)$/.exec(s); return m && [m[0], m[1], m[2].replace(/\s+/g, " "), m[3]]; }
  function trCore(c, depth) {
    depth = depth || 0;
    if (D[c] != null) return D[c];
    if (c.length > 600 || !/[A-Za-zÀ-ÿ]/.test(c)) return null;
    // contagens: "4 vagas encontradas" = número + frase conhecida
    var n = /^([\d.,]+ )(.+)$/.exec(c);
    if (n && D[n[2]] != null) return n[1] + D[n[2]];
    // entre as frases com partes que mudam, ganha a primeira cujas partes também se traduzem;
    // se nenhuma servir por inteiro, fica a primeira que encaixou
    var first = null;
    for (var i = 0; i < P.length; i++) {
      var p = P[i], m = p.re.exec(c); if (!m) continue;
      var ok = resolved(p, m, depth);
      if (p.weak && !ok) continue;
      if (ok) return fill(p, m, depth);
      if (!first) first = [p, m];
    }
    return first ? fill(first[0], first[1], depth) : null;
  }
  function tr(s) {
    if (s == null) return s;
    s = String(s);
    if (cache.has(s)) return cache.get(s);
    var c = core(s), out = s;
    if (c && c[2]) { var t = trCore(c[2]); if (t != null) out = c[1] + t + c[3]; }
    if (cache.size > 5000) cache.clear();
    cache.set(s, out); return out;
  }

  // ---------- o vigia da página ----------
  var ATTRS = ["placeholder", "title", "aria-label", "alt", "aria-description", "aria-roledescription", "label"];
  var META = /^(description|og:title|og:description|twitter:title|twitter:description|apple-mobile-web-app-title)$/;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, NOSCRIPT: 1 };
  var doneText = new WeakMap(), doneAttr = new WeakMap();
  function skip(el) {
    for (; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.nodeName] || el.isContentEditable || el.getAttribute("translate") === "no" || el.classList.contains("notranslate")) return true;
    }
    return false;
  }
  function text(n) {
    var v = n.data; if (!v || doneText.get(n) === v || !/[A-Za-zÀ-ÿ]/.test(v)) return;
    if (skip(n.parentNode)) return;
    var t = tr(v); doneText.set(n, t); if (t !== v) n.data = t;
  }
  function attrs(el) {
    if (el.nodeType !== 1 || skip(el.nodeName === "TEXTAREA" ? el.parentNode : el)) return; // a dica do campo de texto é traduzida; o que se digita nele, nunca
    var done = doneAttr.get(el); if (!done) { done = {}; doneAttr.set(el, done); }
    var list = ATTRS;
    if (el.nodeName === "META") list = META.test(el.getAttribute("name") || el.getAttribute("property") || "") ? ["content"] : [];
    else if (el.nodeName === "INPUT" && /^(button|submit|reset)$/.test(el.type)) list = ATTRS.concat("value");
    for (var i = 0; i < list.length; i++) {
      var a = list[i], v = el.getAttribute(a);
      if (!v || done[a] === v) continue;
      var t = tr(v); done[a] = t; if (t !== v) el.setAttribute(a, t);
    }
  }
  function deep(root) {
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP[root.nodeName] && root.nodeName !== "TEXTAREA") return; attrs(root); }
    var w = document.createTreeWalker(root, 5 /* elementos e textos */), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) text(n);
      else if (SKIP[n.nodeName]) { if (n.nodeName === "TEXTAREA") attrs(n); }
      else attrs(n);
    }
  }
  function onMut(list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === "childList") for (var j = 0; j < m.addedNodes.length; j++) deep(m.addedNodes[j]);
      else if (m.type === "characterData") text(m.target);
      else attrs(m.target);
    }
  }
  var started = false;
  function start() {
    if (started) return; started = true;
    var mo = new MutationObserver(onMut);
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat("content", "value") });
    deep(document.documentElement);
    // caixas do próprio navegador (perguntas como "Nome do projeto") também são traduzidas
    ["alert", "confirm", "prompt"].forEach(function (f) {
      var orig = window[f]; if (typeof orig !== "function") return;
      window[f] = function (msg) { var a = [].slice.call(arguments); a[0] = tr(msg); return orig.apply(window, a); };
    });
  }
})();
