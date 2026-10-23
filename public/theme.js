// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "acendedor de luzes": ele roda ANTES de a página aparecer na tela.
// Por quê? Imagine abrir o site no escuro e, por um instantinho, ele aparecer
// todo branco antes de ficar escuro. Isso dá um "flash" chato nos olhos.
// Então este arquivo pequenininho corre na frente e já liga:
// - o tema (escuro é o padrão; claro ou "igual ao sistema" se a pessoa escolheu);
// - as preferências de Conforto (texto maior, mais espaço, sem animações, modo foco);
// - o vidro líquido (desligado para quem pediu menos transparência no sistema);
// - o cabeçalho grande do topo.
// Ele só coloca "etiquetas" (classes e atributos) no <html>; quem muda as cores e
// tamanhos de verdade é o styles.css, que olha essas etiquetas.
// O try/catch é um "se der errado, tudo bem": em janela anônima o navegador às vezes
// não deixa ler o que foi guardado, e aí ficamos com os valores padrão.
// Aplica o tema escolhido (claro, escuro ou do sistema) e o vidro líquido antes de a página aparecer, para não piscar.
// As escolhas são feitas em Conforto e ficam salvas neste navegador.
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
})();
