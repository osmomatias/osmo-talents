// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "service worker": um ajudante que o navegador deixa morando no aparelho,
// entre o app e a internet. É ele que transforma o site em app instalável.
// Ele faz quatro coisas:
// 1. PÁGINAS: sempre tenta buscar a versão nova na internet. Se a internet
//    sumiu, mostra a página offline.html em vez do erro do navegador;
// 2. ARQUIVOS DO VISUAL (CSS, JS, ícones, fontes): usa a cópia guardada para
//    abrir rápido e, ao mesmo tempo, busca a versão nova para a próxima vez;
// 3. DADOS PESSOAIS: tudo o que é /api/, login, anexos, fotos de perfil e
//    portfólio NUNCA é guardado. Passa direto, como se o ajudante não existisse;
// 4. NOTIFICAÇÕES: quando o servidor manda um aviso (push), é ele que acorda,
//    mesmo com o site fechado, e mostra a notificação. Tocar nela abre a conversa.
//    Ele também pinta a bolinha vermelha com o número de não lidas no ícone do app.
// Fica na raiz do site (/sw.js) porque o ajudante só cuida da pasta onde mora
// e das que estão abaixo dela.
// Trocar VERSION apaga as cópias antigas de todo mundo na próxima visita.

const VERSION = "osmo-v6"; // v6: versão 3.1 do MVP, com recursos escondidos (v5: notificações no aparelho, v4: volta ao visual sem o vidro líquido 2, v3: vidro líquido 2, v2: idiomas)
const PRECACHE = ["/offline.html", "/offline.js", "/favicon.svg", "/icons/icon-192.png", "/i18n-core.js", "/i18n.js"];
// endereços que nunca passam pelo cache: dados de conta, sessão e arquivos enviados pelas pessoas
const PRIVATE = /^\/(api|auth|arquivo|avatar|portfolio)\//;
const ASSET = /\.(js|css|svg|png|jpg|ico|woff2|json|webmanifest)$/;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// guarda a resposta nova e apaga a cópia de versões antigas do mesmo arquivo (?v=...),
// para o cache não crescer a cada atualização do site
async function keep(req, res) {
  const c = await caches.open(VERSION), url = new URL(req.url);
  for (const old of await c.keys()) { const u = new URL(old.url); if (u.pathname === url.pathname && u.search !== url.search) c.delete(old); }
  await c.put(req, res);
}

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  // só pedidos de leitura do próprio site (Google Fonts e Analytics seguem pelo caminho normal)
  if (req.method !== "GET" || url.origin !== location.origin || PRIVATE.test(url.pathname)) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  if (ASSET.test(url.pathname)) {
    const net = fetch(req);
    e.waitUntil(net.then(res => res.ok ? keep(req, res.clone()) : null).catch(() => {}));
    // sem internet, um arquivo guardado com outro carimbo (?v=) serve: melhor que nada (ex.: dicionário de idioma)
    e.respondWith(caches.match(req).then(hit => hit || net.catch(() => caches.match(req, { ignoreSearch: true }))));
  }
});

// CHEGOU UM AVISO DO SERVIDOR: o pacote já chega destrancado pelo navegador. Dentro dele vem
// título, texto, para onde ir ao tocar (url) e uma etiqueta (tag): um aviso novo da mesma
// conversa substitui o anterior, e "renotify" faz o aparelho tocar de novo mesmo assim.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  // BOLINHA VERMELHA NO ÍCONE (como a do Mail no iPhone): o servidor manda o total de não lidas.
  // Só existe no app instalado (tela de início, Dock ou barra de tarefas); onde não existe, ignoramos.
  if (typeof d.badge === "number" && self.navigator.setAppBadge) {
    (d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {});
  }
  e.waitUntil(self.registration.showNotification(d.title || "Osmo Talents", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", lang: d.lang || undefined,
    data: { url: d.url || "/painel" },
  }));
});

// TOCOU NA NOTIFICAÇÃO: se o site já está aberto numa aba ou janela, trazemos ela para a frente
// e pedimos para ela mesma abrir a conversa (sem recarregar). Se não está aberto, abrimos.
// Só aceitamos endereços do próprio site, por segurança.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  let url = new URL((e.notification.data && e.notification.data.url) || "/painel", location.origin);
  if (url.origin !== location.origin) url = new URL("/painel", location.origin);
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find(c => new URL(c.url).origin === location.origin);
    if (w) { await w.focus(); w.postMessage({ type: "osmo-open", path: url.pathname + url.search + url.hash }); return; }
    await self.clients.openWindow(url.href);
  })());
});
