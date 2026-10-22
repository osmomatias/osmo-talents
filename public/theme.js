// Aplica o tema escolhido (claro, escuro ou do sistema) e o vidro líquido antes de a página aparecer, para não piscar.
// As escolhas são feitas em Conforto e ficam salvas neste navegador.
(function () {
  var r = document.documentElement;
  try {
    var t = localStorage.getItem("osmo-theme");
    if (t === "light" || t === "dark") r.setAttribute("data-theme", t);
  } catch (e) {}
  var glass = !(window.matchMedia && matchMedia("(prefers-reduced-transparency: reduce)").matches);
  try {
    var p = JSON.parse(localStorage.getItem("osmo.prefs") || "{}");
    if (typeof p.glass === "boolean") glass = p.glass;
  } catch (e) {}
  if (glass) r.classList.add("glass");
})();
