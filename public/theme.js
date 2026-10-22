// Aplica o tema escolhido (claro, escuro ou do sistema) antes de a página aparecer, para não piscar.
// A escolha é feita em Conforto e fica salva neste navegador.
(function () {
  try {
    var t = localStorage.getItem("osmo-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
