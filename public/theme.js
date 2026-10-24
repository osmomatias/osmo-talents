// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "acendedor de luzes": ele roda ANTES de a página aparecer na tela.
// Por quê? Imagine abrir o site no escuro e, por um instantinho, ele aparecer
// todo branco antes de ficar escuro. Isso dá um "flash" chato nos olhos.
// Então este arquivo pequenininho corre na frente e já liga:
// - o tema (escuro é o padrão; claro ou "igual ao sistema" se a pessoa escolheu);
// - as preferências de Ajustes (texto maior, mais espaço, sem animações, modo foco);
// - o vidro líquido (desligado para quem pediu menos transparência no sistema);
// - o cabeçalho grande do topo.
// Ele só coloca "etiquetas" (classes e atributos) no <html>; quem muda as cores e
// tamanhos de verdade é o styles.css, que olha essas etiquetas.
// O try/catch é um "se der errado, tudo bem": em janela anônima o navegador às vezes
// não deixa ler o que foi guardado, e aí ficamos com os valores padrão.
// Aplica o tema escolhido (claro, escuro ou do sistema) e o vidro líquido antes de a página aparecer, para não piscar.
// As escolhas são feitas em Ajustes e ficam salvas neste navegador.
(function () {
  var r = document.documentElement;
  try {
    var t = localStorage.getItem("osmo-theme");
  } catch (e) {}
  if (t !== "light" && t !== "system") t = "dark"; // escuro é o padrão
  if (t !== "system") r.setAttribute("data-theme", t);
  var glass = !(window.matchMedia && matchMedia("(prefers-reduced-transparency: reduce)").matches);
  try {
    var p = JSON.parse(localStorage.getItem("osmo.prefs") || "{}");
    if (typeof p.glass === "boolean") glass = p.glass;
    if (p.big) r.classList.add("big");
    if (p.airy) r.classList.add("airy");
    if (p.calm) r.classList.add("calm");
    if (p.focus) r.classList.add("focus");
  } catch (e) {}
  if (glass) r.classList.add("glass");
  r.classList.add("top-big"); // topo começa grande; app.js encolhe ao rolar

  // QUE TIPO DE TELA É ESTA? celular, tablet, computador ou TV. Cada um ganha o que faz mais sentido
  // (ex.: na TV, letras grandes e navegação pelas setas do controle remoto). Descobrimos por três pistas:
  // 1. o "nome" do navegador (user agent), que costuma dizer "Mobile", "iPad", "SmartTV", "Tizen", "webOS"...;
  // 2. se a tela é de toque, de mouse ou nenhum dos dois (TV com controle remoto);
  // 3. o tamanho da tela, só como desempate.
  // A pessoa pode corrigir em Ajustes (fica salvo); para testar, dá para abrir o site com ?tela=tv, ?tela=celular etc.
  var ua = navigator.userAgent || "", mm = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  var dev = "";
  try { var q = (location.search.match(/[?&]tela=(celular|tablet|computador|tv)\b/) || [])[1]; if (q) sessionStorage.setItem("osmo-tela", q); dev = q || sessionStorage.getItem("osmo-tela") || localStorage.getItem("osmo-device") || ""; } catch (e) {}
  var MAP = { celular: "phone", tablet: "tablet", computador: "desktop", tv: "tv", phone: "phone", desktop: "desktop" };
  dev = MAP[dev] || "";
  var auto; // o que o navegador indica, mesmo quando a pessoa escolheu outro tipo em Ajustes
  {
    if (/smart-?tv|googletv|appletv|hbbtv|netcast|web0?os|tizen|bravia|viera|roku|crkey|\baft[a-z]\b|android tv|\btv\b|philipstv|vidaa|xbox|playstation|nintendo/i.test(ua)) auto = "tv";
    else if (/ipad|tablet|playbook|silk|kindle/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) auto = "tablet";
    else if (/mobi|iphone|ipod|android|windows phone|blackberry/i.test(ua)) auto = "phone";
    else if (mm("(pointer: none)") && mm("(min-width: 1200px)")) auto = "tv"; // tela grande sem toque e sem mouse
    else if (mm("(pointer: coarse)") && !mm("(hover: hover)")) auto = Math.min(screen.width, screen.height) >= 600 ? "tablet" : "phone";
    else auto = "desktop";
  }
  dev = dev || auto;
  r.setAttribute("data-device-auto", auto);
  r.setAttribute("data-device", dev);
  r.setAttribute("data-input", dev === "tv" ? "remote" : mm("(pointer: coarse)") ? "touch" : "mouse");
})();
