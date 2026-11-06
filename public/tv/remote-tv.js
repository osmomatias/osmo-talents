// CONTROLE PELO CELULAR, lado da TV. Este arquivo roda no Osmo TV (/tv/) e na Biblioteca da casa (no Mac).
// Como para uma criança:
// - no Osmo TV, a TV pede ao servidor um crachá secreto e um código de 6 números, e mostra o código
//   (e um QR code) no canto de cima. O celular digita o código em app.osmo.com.br/tv e fica ligado a esta TV;
// - a TV deixa um "cano" aberto com o servidor; cada botão apertado no celular chega por ali e vira
//   uma tecla do controle remoto (setas, OK, Voltar, pausar...). A tela não precisa saber que veio do celular;
// - de tempos em tempos a TV conta ao celular o que está na tela (título, se está tocando, o tempo);
// - ao abrir "Na sua casa", o crachá vai junto no endereço (#remote=...), e a Biblioteca continua obedecendo.
// Se este aparelho for um celular (tela de toque, sem o app da TV), ele vai direto para a tela do controle.
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const keep = (st) => ({ get(k) { try { return st().getItem(k); } catch { return null; } }, set(k, v) { try { st().setItem(k, v); } catch {} } });
  const local = keep(() => localStorage), session = keep(() => sessionStorage);
  const API_OK = /^(https:\/\/app\.osmo\.com\.br|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
  // handlers: pedidos especiais que a página resolve ("play" = tocar um título pelo id);
  // catalog(): a Biblioteca manda as fileiras dela para o celular mostrar os pôsteres;
  // pending: um título pedido pelo celular antes de a Biblioteca abrir (veio no endereço, #play=...)
  const R = window.OsmoRemote = { handlers: {}, on(cmd, fn) { this.handlers[cmd] = fn; }, link: url => url, catalog() {}, pending: "", leaving: false };

  const onTvPage = !!$("#tabs"); // o Osmo TV (as abas só existem nele); senão, é a Biblioteca da casa
  let base = "", t = "";
  if (onTvPage) {
    const qs = new URLSearchParams(location.search);
    if (!window.OsmoTV && !qs.has("tela") && matchMedia("(hover: none) and (pointer: coarse)").matches) {
      R.leaving = true; location.replace("/tv/controle" + location.search); return;
    }
    base = location.origin; t = local.get("osmotv:remote") || "";
  } else {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("remote") && API_OK.test(h.get("api") || "")) {
      session.set("osmotv:remote", JSON.stringify({ t: h.get("remote"), api: h.get("api") }));
      R.pending = h.get("play") || "";
      history.replaceState(null, "", location.pathname + location.search);
    }
    let s = null; try { s = JSON.parse(session.get("osmotv:remote") || "null"); } catch {}
    if (!s || !API_OK.test(s.api || "") || typeof s.t !== "string") return;
    base = s.api; t = s.t;
  }
  R.link = (url, play) => t ? url.replace(/#.*$/, "") + "#" + new URLSearchParams({ remote: t, api: base, ...(play ? { play } : {}) }) : url;

  // ---------- as ordens do celular viram teclas ----------
  const KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", ok: "Enter", back: "Escape",
    playpause: "MediaPlayPause", rew: "MediaRewind", ff: "MediaFastForward", next: "MediaTrackNext", subs: "ArrowUp" };
  const inPlayer = () => { const p = $("#player"); return !!p && !p.hidden; };
  function run(cmd, id) {
    if (R.handlers[cmd]) return R.handlers[cmd](id);
    if (cmd === "subs" && !inPlayer()) return; // "legenda" só vale com vídeo tocando
    const key = KEYS[cmd]; if (!key) return;
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    report();
  }

  // ---------- o canto com o código (só no Osmo TV) ----------
  let chip = null, toastT = 0;
  function qrSVG(text) {
    if (typeof qrcode !== "function") return "";
    const q = qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + 4} ${n + 4}" aria-hidden="true" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#170810"/></svg>`;
  }
  function showCode(code) {
    if (!onTvPage) return;
    if (!chip) { chip = document.createElement("div"); chip.className = "remote"; $(".bar").appendChild(chip); }
    const url = `${base}/tv/controle?c=${code}`, host = new URL(base).host;
    chip.innerHTML = `<span class="qr">${qrSVG(url)}</span><span class="rtext"><b>Use o celular como controle</b>`
      + `<span>Abra <b>${host}/tv</b> e digite</span><span class="rcode" aria-label="código ${code.split("").join(" ")}">${code.slice(0, 3)} ${code.slice(3)}</span></span>`;
  }
  function toast(text) {
    let el = $(".rtoast"); if (!el) { el = document.createElement("div"); el.className = "rtoast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = text; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 3500);
  }

  // ---------- falar com o servidor ----------
  const post = (path, body) => fetch(base + "/api/tv/remote/" + path, { method: "POST", body: JSON.stringify(body), keepalive: true })
    .then(r => r.json().then(j => (r.ok ? j : Promise.reject(Object.assign(new Error(j.error), { status: r.status })))));
  async function register() {
    try {
      const j = await post("tv", { t });
      if (j.t !== t) { t = j.t; local.set("osmotv:remote", t); }
      showCode(j.code);
      return true;
    } catch { return false; }
  }
  let es = null;
  function listen() {
    if (es) es.close();
    es = new EventSource(base + "/api/tv/remote/events?t=" + encodeURIComponent(t));
    es.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === "cmd") run(m.cmd, m.id);
      else if (m.type === "paired") { toast("📱 Celular conectado. Já pode usar como controle."); report(true); }
      else if (m.type === "unknown") { // o servidor não conhece este crachá (ex.: banco novo): pede outro
        es.close(); es = null;
        if (onTvPage) { t = ""; register().then(ok => ok && listen()); }
      }
    };
    es.onopen = () => report(true);
  }

  // ---------- contar ao celular o que está na tela ----------
  let last = "", lastAt = 0, repT = 0;
  function snapshot() {
    const v = $("#pv"), p = inPlayer(), txt = s => ($(s)?.textContent || "").trim();
    return {
      screen: p ? "player" : onTvPage ? "inicio" : "casa",
      eyebrow: p ? (txt("#pSub") || (onTvPage ? "Osmo Originais" : "Na sua casa")) : txt("#hEyebrow"),
      title: p ? txt("#pTitle") : txt("#hTitle"),
      playing: p && !!v && !v.paused, t: p && v ? v.currentTime || 0 : 0, d: p && v && isFinite(v.duration) ? v.duration : 0,
      hasHome: !!$("#tabs button.home"), casa: !onTvPage,
    };
  }
  function report(force) {
    clearTimeout(repT);
    repT = setTimeout(() => {
      if (!t) return;
      const s = snapshot(), key = JSON.stringify({ ...s, t: 0 }), now = Date.now();
      if (!force && key === last && !(s.playing && now - lastAt > 5000)) return;
      last = key; lastAt = now;
      post("state", { t, state: s }).catch(() => {});
    }, 250);
  }
  const watch = new MutationObserver(() => report());
  ["#hTitle", "#hEyebrow", "#pTitle", "#tabs"].forEach(s => { const el = $(s); if (el) watch.observe(el, { childList: true, characterData: true, subtree: true }); });
  if ($("#player")) watch.observe($("#player"), { attributes: true, attributeFilter: ["hidden"] });
  const v = $("#pv");
  if (v) ["play", "pause", "seeked", "loadedmetadata", "ended"].forEach(ev => v.addEventListener(ev, () => report(true)));
  setInterval(() => report(), 5000);

  let catT = 0;
  R.catalog = catalog => { clearTimeout(catT); catT = setTimeout(() => t && post("catalog", { t, catalog }).catch(() => {}), 500); };

  // ---------- ligar ----------
  // sem internet agora? tenta de novo a cada 30 s. O código é trocado a cada 10 min (ele vale 20).
  const start = async () => {
    if (onTvPage) { if (!(await register())) return setTimeout(start, 30_000); setInterval(register, 10 * 60_000); }
    listen();
  };
  start();
})();
