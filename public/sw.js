// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "service worker": um ajudante que o navegador deixa morando no aparelho,
// entre o app e a internet. É ele que transforma o site em app instalável.
// Ele faz três coisas:
// 1. PÁGINAS: sempre tenta buscar a versão nova na internet. Se a internet
//    sumiu, mostra a página offline.html em vez do erro do navegador;
// 2. ARQUIVOS DO VISUAL (CSS, JS, ícones, fontes): usa a cópia guardada para
//    abrir rápido e, ao mesmo tempo, busca a versão nova para a próxima vez;
// 3. DADOS PESSOAIS: tudo o que é /api/, login, anexos, fotos de perfil e
//    portfólio NUNCA é guardado. Passa direto, como se o ajudante não existisse.
// Fica na raiz do site (/sw.js) porque o ajudante só cuida da pasta onde mora
// e das que estão abaixo dela.
// Trocar VERSION apaga as cópias antigas de todo mundo na próxima visita.

const VERSION = "osmo-v1";
const PRECACHE = ["/offline.html", "/offline.js", "/favicon.svg", "/icons/icon-192.png"];
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
    e.respondWith(caches.match(req).then(hit => hit || net));
  }
});
