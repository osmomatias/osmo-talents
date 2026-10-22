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
  } catch (e) {}
  if (glass) r.classList.add("glass");
  r.classList.add("top-big"); // topo começa grande; app.js encolhe ao rolar
})();
