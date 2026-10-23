// EXPLICANDO COMO PARA UMA CRIANÇA: este é o "porteiro do Google Analytics" (Modo de Consentimento).
// O servidor só coloca este arquivo na página quando o Analytics está configurado (GA_MEASUREMENT_ID).
// Ele roda logo no começo e já diz ao Google, antes de qualquer coisa:
// "cookies de estatística: só se a pessoa tiver aceitado; anúncios: nunca".
// Quem não aceitou (ou ainda não escolheu) não ganha cookie nenhum: o Google recebe só sinais
// anônimos de visita. Quando a pessoa aceita no aviso, o app.js avisa o Google e a medição completa começa.
(function () {
  var s = document.currentScript, id = s && s.getAttribute("data-ga");
  if (!id) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  var choice = "";
  try { choice = JSON.parse(localStorage.getItem("osmo.analytics") || '""'); } catch (e) {}
  gtag("consent", "default", { analytics_storage: choice === "sim" ? "granted" : "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  gtag("js", new Date());
  gtag("config", id, { send_page_view: false }); // no site principal, cada troca de tela é enviada pelo app.js com o endereço limpo
  // páginas simples (termos, privacidade) não têm o app.js: a visita é enviada daqui
  if (location.pathname !== "/") gtag("event", "page_view", { page_path: location.pathname, page_location: location.origin + location.pathname, page_title: document.title });
})();
