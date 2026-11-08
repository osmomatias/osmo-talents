// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "vidro de verdade" da barra do topo. O tema de vidro normal (styles.css) só desfoca o que
// passa por trás. Aqui usamos a biblioteca liquidGL (public/vendor/liquidGL.js, licença MIT), que
// desenha a barra com a placa de vídeo (WebGL/WebGPU) como uma lâmina de vidro: o conteúdo que
// rola por baixo dobra nas bordas, como numa lente.
//
// Ela só liga quando TUDO isto é verdade:
// - o vidro líquido está ligado em Ajustes (classe "glass" no <html>);
// - "Sem animações" está desligado (classe "calm") e o sistema não pede menos movimento;
// - não é uma TV (data-device="tv"), que costuma ter pouca força de vídeo;
// - a tela é larga (computador, 900 px ou mais) e não é celular nem tablet. A lente foi feita para
//   painéis compactos: numa barra baixa de celular, as bordas de cima e de baixo se encontram e
//   distorcem o meio; além disso, poupa bateria e foge de uma instabilidade conhecida do Safari;
// - o navegador tem WebGL de verdade (não um WebGL "de mentira" lento, feito pelo processador).
// Se qualquer uma falhar, a biblioteca nem é baixada e o site fica exatamente como era.
// Se a pessoa mudar Ajustes com a página aberta, o efeito liga ou desliga na hora.
//
// Detalhe importante: a liquidGL tem um "plano B" próprio para navegador sem WebGL, que muda o
// fundo da barra. Por isso testamos o WebGL ANTES e nunca chamamos a biblioteca sem ele.
(function () {
  "use strict";
  var r = document.documentElement;
  var mq = function (q) { return window.matchMedia ? matchMedia(q) : null; };
  var motion = mq("(prefers-reduced-motion: reduce)"), wide = mq("(min-width: 900px)");
  var lens = null, loading = null, glOk = null, busy = false, failed = false;

  // WebGL "de verdade": failIfMajorPerformanceCaveat recusa o desenho por software (lento demais)
  function hasGL() {
    if (glOk !== null) return glOk;
    glOk = false;
    try {
      var c = document.createElement("canvas"), o = { failIfMajorPerformanceCaveat: true };
      var gl = c.getContext("webgl2", o) || c.getContext("webgl", o);
      if (gl) { glOk = true; var lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext(); }
    } catch (e) {}
    return glOk;
  }
  function allowed() {
    return r.classList.contains("glass") && !r.classList.contains("calm") && !(motion && motion.matches) &&
      r.getAttribute("data-device") === "desktop" && !!(wide && wide.matches) && !!document.querySelector(".top") && hasGL();
  }
  // a biblioteca (≈300 KB) só é baixada por quem vai usar; vem do próprio site, como o lottie
  function load() {
    return loading || (loading = new Promise(function (ok, no) {
      if (window.liquidGL) return ok();
      var sc = document.createElement("script"); sc.src = "/vendor/liquidGL.js";
      sc.onload = ok; sc.onerror = no; document.head.appendChild(sc);
    }).catch(function () { loading = null; throw new Error("liquidGL não carregou"); }));
  }
  function on() {
    if (lens || busy || failed) return; // se já falhou uma vez nesta página, não tenta de novo
    busy = true;
    load().then(function () {
      busy = false;
      if (lens || !allowed() || typeof window.liquidGL !== "function") return;
      // a classe entra ANTES da "foto" do fundo: o styles.css tira o degradê próprio da barra,
      // que a biblioteca desenharia errado (uma mancha no meio do topo)
      r.classList.add("liquid");
      var made = null;
      try { made = window.liquidGL({
        target: ".top",
        snapshot: "body",
        resolution: Math.min(window.devicePixelRatio || 1, 1.5), // nítido o bastante e leve na memória
        // sem refração no meio (ela espelhava o conteúdo da barra inteira); só as bordas dobram a luz
        refraction: 0, bevelDepth: 0.05, bevelWidth: 0.12, frost: 2, // frost alto deixa granulado
        // a cor vinho vem de uma camada no styles.css (html.liquid .top::after), que segue o tema claro/escuro
        shadow: false,                        // a barra já tem sombra no styles.css
        specular: false,                      // sem brilho andando sozinho: o site é calmo
        reveal: "none"
      }); } catch (e) {}
      lens = (Array.isArray(made) ? made[0] : made) || null;
      if (!lens) { failed = true; r.classList.remove("liquid"); }
    }).catch(function () { busy = false; failed = true; });
  }
  function off() {
    if (!lens) return;
    try { lens.destroy(); } catch (e) {}
    lens = null; r.classList.remove("liquid");
  }
  function sync() { if (allowed()) on(); else off(); }

  function start() {
    sync();
    // Ajustes mexe nas classes do <html>; o sistema pode passar a pedir menos movimento; a janela pode estreitar
    new MutationObserver(sync).observe(r, { attributes: true, attributeFilter: ["class", "data-device"] });
    [motion, wide].forEach(function (m) { if (m) (m.addEventListener ? m.addEventListener("change", sync) : m.addListener(sync)); });
  }
  // espera a página e as fontes, para a "foto" do fundo sair com tudo no lugar
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
