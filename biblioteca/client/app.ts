// BIBLIOTECA DA CASA (protótipo do Osmo TV na rede de casa). Como funciona, como para uma criança:
// - a tela inicial tem fileiras: Continuar assistindo, Filmes, Séries e Clipes (o que está no Mac);
// - setas andam, OK escolhe: filme/clipe abre o player; série abre a página dela, com as temporadas e os episódios;
// - no player: OK pausa/continua, ◀ ▶ voltam/avançam 10 s, ▲ troca a legenda, Voltar fecha;
//   no fim de um episódio, o próximo começa sozinho (dá para cancelar com Voltar);
// - onde você parou fica guardado no Mac, então dá para começar na TV e terminar no celular.
// Também funciona com mouse e toque: clicar dá foco; clicar de novo abre.
(() => {
  "use strict";
  interface VisualItem { id: string; title: string; poster?: string; backdrop?: string; still?: string; overview?: string; rating?: number; year?: string | number }
  interface Subtitle { lang: string; label: string; src: string }
  interface Movie extends VisualItem { type: "movie"; src: string; subtitles?: Subtitle[] }
  interface Episode extends VisualItem { type: "episode"; s: number; e: number; show: string; showTitle: string; src: string; subtitles?: Subtitle[] }
  interface Clip extends VisualItem { type: "clip"; artist?: string; src: string; subtitles?: Subtitle[] }
  interface Season { n: number; episodes: Episode[] }
  interface Show extends VisualItem { type: "show"; seasons: Season[]; count: number }
  interface SeasonItem extends VisualItem { type: "season"; n: number }
  type Playable = Movie | Episode | Clip;
  type LibraryItem = Playable | Show | SeasonItem;
  interface Progress { t: number; d: number; at: number }
  interface Library { root: string; tmdb: boolean; filmes: Movie[]; series: Show[]; clipes: Clip[]; continuar: Playable[]; progress: Record<string, Progress | undefined> }
  interface Row { key: string; title: string; kind: "wide" | "poster" | "pill"; items: LibraryItem[] }
  interface Position { row: number; col: number[] }
  type Screen = { name: "home"; rows: Row[]; pos: Position; season?: never; show?: never } | { name: "show"; rows: Row[]; pos: Position; season: number; show: Show };
  // The renderer owns these nodes; the player ID preserves its media-specific DOM API.
  function $<S extends string>(selector: S): S extends "#pv" ? HTMLVideoElement : HTMLElement {
    return document.querySelector(selector) as S extends "#pv" ? HTMLVideoElement : HTMLElement;
  }

  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const MARK = `<svg viewBox="0 0 30 30" aria-hidden="true"><path d="${$(".brand path").getAttribute("d")}"/></svg>`;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let lib: Library | null = null;
  // a tela atual: "home" (fileiras) ou "show" (página de uma série); pos = onde está o foco
  let screen: Screen = { name: "home", rows: [], pos: { row: 0, col: [] } };
  let homePos: Position | null = null;

  // ---------- conversa com o Mac ----------
  async function loadLibrary() {
    const r = await fetch("/api/library", { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("Erro " + r.status);
    const data: unknown = await r.json();
    if (typeof data !== "object" || data === null || !("root" in data) || typeof data.root !== "string" || !("tmdb" in data) || typeof data.tmdb !== "boolean" || !("progress" in data) || typeof data.progress !== "object" || data.progress === null || !["filmes", "series", "clipes", "continuar"].every(key => Array.isArray((data as Record<string, unknown>)[key]))) throw new Error("Resposta inválida da biblioteca.");
    lib = data as Library;
  }
  function saveProgress(id: string, t: number, d: number, done: boolean) {
    if (!lib) return;
    if (done || (d > 0 && t > d - Math.min(15, d * 0.1))) delete lib!.progress[id]; else if (t >= 5) lib!.progress[id] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() };
    fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json", "x-osmo": "1" }, body: JSON.stringify({ id, t, d, done: !!done }), keepalive: true }).catch(() => {});
  }
  const prog = (x: Pick<VisualItem, "id">) => lib?.progress?.[x.id];
  const pct = (x: Pick<VisualItem, "id">) => { const p = prog(x); return p && p.d ? Math.min(100, Math.round(p.t / p.d * 100)) : 0; };
  function clock(s: number) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }
  const epLabel = (e: Episode) => `T${e.s}:E${e.e || "?"}`;

  // ---------- montar as telas ----------
  function homeRows(): Row[] {
    const rows: Row[] = [];
    if (lib!.continuar.length) rows.push({ key: "continuar", title: "Continuar assistindo", kind: "wide", items: lib!.continuar });
    if (lib!.filmes.length) rows.push({ key: "filmes", title: "Filmes", kind: "poster", items: lib!.filmes });
    if (lib!.series.length) rows.push({ key: "series", title: "Séries", kind: "poster", items: lib!.series });
    if (lib!.clipes.length) rows.push({ key: "clipes", title: "Clipes", kind: "wide", items: lib!.clipes });
    return rows;
  }
  function showRows(sh: Show, seasonIdx: number): Row[] {
    const s = sh.seasons[seasonIdx] || sh.seasons[0];
    return [
      { key: "temporadas", title: "", kind: "pill", items: sh.seasons.map(x => ({ id: "t" + x.n, type: "season", title: `Temporada ${x.n}`, n: x.n })) },
      { key: "episodios", title: `Temporada ${s.n} · ${s.episodes.length} episódio${s.episodes.length > 1 ? "s" : ""}`, kind: "wide", items: s.episodes },
    ];
  }

  function cardHTML(x: LibraryItem, row: Row, r: number, i: number) {
    if (row.kind === "pill") return `<li class="pill${i === screen.season ? " on" : ""}" data-row="${r}" data-col="${i}">${esc(x.title)}</li>`;
    const wide = row.kind === "wide";
    const img = wide ? (x.still || x.backdrop || x.poster) : x.poster;
    const name = x.type === "episode" && row.key === "continuar" ? x.showTitle : x.title;
    const cont = row.key === "continuar";
    const cap = x.type === "episode" ? (cont ? `<b>${esc(x.showTitle)}</b> · ${esc(epLabel(x))}` : `<b>${esc(epLabel(x))}</b> · ${esc(x.title)}`)
      : x.type === "clip" ? `<b>${esc(x.artist || "Clipe")}</b> · ${esc(x.title)}`
      : x.type === "show" ? `${x.seasons.length} temporada${x.seasons.length > 1 ? "s" : ""}`
      : `<b>${esc(x.title)}</b>${x.year ? " · " + esc(x.year) : ""}`;
    const p = x.type === "show" ? 0 : pct(x);
    return `<li class="card${wide ? " wide" : ""}" data-row="${r}" data-col="${i}" aria-label="${esc(name)}">
      <div class="art">${img ? `<img src="${esc(img)}" alt="" loading="${i < 6 ? "eager" : "lazy"}">` : MARK + `<span class="name">${esc(name)}</span>`}
      ${p ? `<i class="seen" style="width:${p}%"></i>` : ""}</div>
      ${wide || x.type === "show" ? `<p class="cap">${cap}</p>` : ""}</li>`;
  }
  function rowHTML(row: Row, r: number) {
    return `<section class="row" data-row="${r}" aria-label="${esc(row.title || "Temporadas")}">${row.title ? `<h2>${esc(row.title)}</h2>` : ""}
      <ol class="track${row.kind === "pill" ? " pills" : ""}">${row.items.map((x, i) => cardHTML(x, row, r, i)).join("")}</ol></section>`;
  }
  function render() {
    const s = screen;
    if (!s.rows.length) {
      $("#rows").innerHTML = `<div class="state" role="status"><b>Sua biblioteca está vazia.</b>
        Coloque vídeos nas pastas do Mac:<br><code>${esc(lib!.root)}/Filmes</code> — ex.: <code>Nome do Filme (2010).mp4</code><br>
        <code>${esc(lib!.root)}/Séries/Nome da Série/</code> — ex.: <code>Nome da Série S01E01.mp4</code><br>
        <code>${esc(lib!.root)}/Clipes</code> — ex.: <code>Artista - Música.mp4</code><br>A tela se atualiza sozinha.</div>`;
      hero(null); return;
    }
    $("#rows").innerHTML = s.rows.map(rowHTML).join("");
    paint();
  }

  // ---------- fundo com troca suave ----------
  let bgFront = $("#bgA"), bgBack = $("#bgB"), bgUrl = "";
  function setBg(u: string) {
    if (u === bgUrl) return; bgUrl = u;
    if (!u) { bgFront.classList.remove("on"); bgBack.classList.remove("on"); return; }
    const img = new Image();
    img.onload = () => { if (bgUrl !== u) return; bgBack.style.backgroundImage = `url("${u}")`; bgBack.classList.add("on"); bgFront.classList.remove("on"); [bgFront, bgBack] = [bgBack, bgFront]; };
    img.src = u;
  }

  // ---------- foco ----------
  const cur = () => screen.rows[screen.pos.row]?.items[screen.pos.col[screen.pos.row] || 0];
  function paint() {
    const { row, col } = screen.pos;
    document.querySelectorAll(".focus").forEach(el => el.classList.remove("focus"));
    const el = $(`[data-row="${row}"][data-col="${col[row] || 0}"]:not(section)`); if (!el) return;
    el.classList.add("focus"); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true });
    const track = el.parentElement!, behavior = reduce ? "auto" : "smooth";
    const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    track.scrollTo({ left: Math.max(0, el.offsetLeft - pad), behavior });
    const box = $("#rows"), sec = el.closest<HTMLElement>(".row")!;
    box.scrollTo({ top: row === 0 ? 0 : sec.offsetTop - box.offsetTop, behavior });
    hero(cur());
  }
  function hero(x: LibraryItem | null | undefined) {
    const set = (eyebrow: string, title: string, meta: string, overview?: string, bg?: string) => {
      $("#hEyebrow").textContent = eyebrow; $("#hTitle").textContent = title; $("#hMeta").innerHTML = meta; $("#hOverview").textContent = overview || ""; setBg(bg || "");
    };
    if (!x) return set("Na sua casa", screen.name === "show" ? screen.show.title : "Osmo TV", "", "", "");
    const star = x.rating ? `<span class="star" aria-hidden="true">★</span> ${Number(x.rating).toFixed(1)}` : "";
    const resume = (p: Progress | undefined) => p ? `Continuar de ${clock(p.t)}` : "Aperte OK para assistir";
    if (x.type === "season" || (screen.name === "show" && x.type !== "episode")) {
      const sh = screen.show!;
      return set(`Série · ${sh.count} episódio${sh.count > 1 ? "s" : ""}`, sh.title, [sh.year, star].filter(Boolean).join(" · "), sh.overview, sh.backdrop);
    }
    if (x.type === "movie") return set("Filme", x.title, [x.year, star, resume(prog(x))].filter(Boolean).join(" · "), x.overview, x.backdrop);
    if (x.type === "show") {
      const n = x.count;
      return set(`Série · ${x.seasons.length} temporada${x.seasons.length > 1 ? "s" : ""} · ${n} episódio${n > 1 ? "s" : ""}`, x.title,
        [x.year, star, "Aperte OK para ver os episódios"].filter(Boolean).join(" · "), x.overview, x.backdrop);
    }
    if (x.type === "episode") {
      const sh = lib!.series.find(s => s.id === x.show);
      return set(x.showTitle, `${epLabel(x)} · ${x.title}`, resume(prog(x)), x.overview || sh?.overview, x.still || sh?.backdrop);
    }
    if (x.type === "clip") return set("Clipe" + (x.artist ? " · " + x.artist : ""), x.title, resume(prog(x)), "", x.backdrop || x.poster);
  }

  function move(dRow: number, dCol: number) {
    const s = screen, rows = s.rows;
    if (!rows.length) return;
    if (dRow) {
      const next = Math.min(rows.length - 1, Math.max(0, s.pos.row + dRow));
      if (next === s.pos.row) return;
      s.pos.col[next] = Math.min(rows[next].items.length - 1, s.pos.col[next] ?? 0);
      s.pos.row = next;
    } else {
      const n = rows[s.pos.row].items.length;
      const c = Math.min(n - 1, Math.max(0, (s.pos.col[s.pos.row] || 0) + dCol));
      if (c === s.pos.col[s.pos.row]) return;
      s.pos.col[s.pos.row] = c;
      // na página da série, andar pelas temporadas já troca os episódios mostrados
      if (s.name === "show" && s.pos.row === 0) { setSeason(c); return; }
    }
    paint();
  }
  function setSeason(i: number) {
    if (screen.name !== "show") return;
    screen.season = i;
    screen.rows = showRows(screen.show!, i);
    screen.pos.col[1] = 0;
    render();
  }
  function choose() {
    const x = cur(); if (!x) return;
    if (x.type === "show") return openShow(x);
    if (x.type === "season") { screen.pos.row = 1; return paint(); }
    start(x);
  }
  // começa a tocar um filme, clipe ou episódio, com a fila certa (clipes em sequência, próximos episódios)
  function start(x: Playable) {
    if (x.type === "movie") return play(x, []);
    if (x.type === "clip") return play(x, lib!.clipes.slice(lib!.clipes.findIndex(c => c.id === x.id) + 1)); // clipes tocam em sequência
    if (x.type === "episode") {
      const sh = lib!.series.find(s => s.id === x.show), all = sh ? sh.seasons.flatMap(s => s.episodes) : [];
      return play(x, all.slice(all.findIndex(e => e.id === x.id) + 1));
    }
  }

  // ---------- página da série ----------
  function openShow(sh: Show, keepEpisode?: string) {
    if (screen.name === "home") homePos = JSON.parse(JSON.stringify(screen.pos)) as Position;
    // abre na temporada/episódio onde a pessoa parou (ou no 1º)
    let si = 0, ei = 0;
    const all = sh.seasons.flatMap((s, i) => s.episodes.map((e, j) => ({ e, i, j })));
    const target = keepEpisode ? all.find(a => a.e.id === keepEpisode) : all.filter(a => prog(a.e)).sort((a, b) => prog(b.e)!.at - prog(a.e)!.at)[0];
    if (target) { si = target.i; ei = target.j; }
    screen = { name: "show", show: sh, season: si, rows: showRows(sh, si), pos: { row: 1, col: [si, ei] } };
    $("#crumb").textContent = sh.title; $("#crumb").hidden = false; $("#where").hidden = true;
    render();
  }
  function goHome() {
    screen = { name: "home", rows: homeRows(), pos: homePos || { row: 0, col: [] } };
    homePos = null;
    screen.pos.row = Math.min(screen.pos.row, Math.max(0, screen.rows.length - 1));
    screen.rows.forEach((r, i) => screen.pos.col[i] = Math.min(r.items.length - 1, screen.pos.col[i] || 0));
    $("#crumb").hidden = true; $("#where").hidden = false;
    render();
  }

  // ---------- player ----------
  const player = $("#player"), video = $("#pv");
  let playing: Playable | null = null, queue: Playable[] = [], hideT = 0, lastSave = 0, nextT = 0, nextLeft = 0;
  function showUI() {
    player.classList.add("ui"); clearTimeout(hideT);
    if (!video.paused) hideT = setTimeout(() => player.classList.remove("ui"), 3500);
  }
  function pState(text = "") { $("#pState").textContent = text || ""; $("#pState").hidden = !text; }
  function play(x: Playable, q: Playable[]) {
    cancelNext();
    playing = x; queue = q || [];
    $("#pSub").textContent = x.type === "episode" ? `${x.showTitle} · ${epLabel(x)}` : x.type === "clip" ? (x.artist || "Clipe") : "Filme";
    $("#pTitle").textContent = x.title;
    pState("");
    video.innerHTML = (x.subtitles || []).map((s, i) => `<track kind="subtitles" srclang="${esc(s.lang)}" label="${esc(s.label)}" src="${esc(s.src)}"${i === 0 ? " default" : ""}>`).join("");
    video.poster = x.backdrop || x.still || "";
    video.src = x.src;
    const saved = prog(x)?.t || 0;
    video.addEventListener("loadedmetadata", () => { if (saved >= 5 && saved < video.duration - 2) video.currentTime = saved; }, { once: true });
    player.hidden = false; document.body.classList.add("playing");
    video.play().catch(() => pState("Aperte OK para começar."));
    showUI();
  }
  function save(force: boolean, done = false) {
    if (!playing || !video.duration) return;
    const now = Date.now(); if (!force && now - lastSave < 10000) return; lastSave = now;
    saveProgress(playing.id, video.currentTime, video.duration, done || video.ended);
  }
  function closePlayer() {
    if (!playing) return;
    cancelNext(); save(true);
    video.pause(); video.removeAttribute("src"); video.innerHTML = ""; video.load();
    player.hidden = true; document.body.classList.remove("playing");
    const last = playing; playing = null; clearTimeout(hideT);
    refresh(last);
  }
  function toggle() { if (video.paused) video.play().catch(() => {}); else video.pause(); showUI(); }
  function seek(d: number) { if (!video.duration) return; video.currentTime = Math.min(video.duration - 0.5, Math.max(0, video.currentTime + d)); showUI(); }
  function cycleSubs() { // ▲: desligada -> 1ª legenda -> 2ª ... -> desligada
    const t = [...video.textTracks]; if (!t.length) { pState("Este vídeo não tem legenda."); setTimeout(() => pState(""), 1500); return; }
    const on = t.findIndex(x => x.mode === "showing");
    t.forEach(x => x.mode = "disabled");
    const next = on + 1 < t.length ? on + 1 : -1;
    if (next >= 0) t[next].mode = "showing";
    pState(next >= 0 ? "Legenda: " + (t[next].label || "ligada") : "Legenda desligada"); setTimeout(() => pState(""), 1500);
    showUI();
  }
  // próximo da fila (episódio ou clipe) começa sozinho em 8 s
  function offerNext() {
    const n = queue[0]; if (!n) return closePlayer();
    $("#pNextTitle").textContent = n.type === "episode" ? `${epLabel(n)} · ${n.title}` : n.title;
    nextLeft = n.type === "clip" ? 3 : 8;
    const tick = () => {
      $("#pNextCount").textContent = `Começa em ${nextLeft} s · OK agora · Voltar cancela`;
      if (nextLeft-- <= 0) return playNext();
      nextT = setTimeout(tick, 1000);
    };
    $("#pNext").hidden = false; player.classList.add("ui"); tick();
  }
  function cancelNext() { clearTimeout(nextT); nextT = 0; $("#pNext").hidden = true; }
  function playNext() { const n = queue.shift(); cancelNext(); if (n) play(n, queue); }
  video.addEventListener("timeupdate", () => {
    const d = video.duration || 0, t = video.currentTime || 0;
    $("#pFill").style.width = d ? (t / d * 100) + "%" : "0";
    $("#pTime").textContent = `${clock(t)} / ${clock(d)}`;
    save(false);
  });
  video.addEventListener("play", () => { pState(""); showUI(); });
  video.addEventListener("pause", () => { player.classList.add("ui"); clearTimeout(hideT); });
  video.addEventListener("waiting", () => pState("Carregando…"));
  video.addEventListener("playing", () => pState(""));
  video.addEventListener("ended", () => { save(true, true); offerNext(); });
  video.addEventListener("error", () => { if (playing) pState("Não deu para tocar este vídeo. O formato mais garantido é MP4 (H.264 + AAC)."); });

  // depois de assistir: atualiza a biblioteca (barrinhas e "Continuar assistindo") sem perder o lugar
  async function refresh(last?: Playable) {
    try { await loadLibrary(); } catch { return; }
    sendCatalog();
    if (screen.name === "show") {
      const sh = lib!.series.find(s => s.id === screen.show!.id);
      if (!sh) return goHome();
      const keep = last?.type === "episode" ? last.id : cur()?.id;
      const p = screen.pos; screen.show = sh; screen.rows = showRows(sh, screen.season);
      const idx = screen.rows[1].items.findIndex(e => e.id === keep);
      if (idx >= 0) p.col[1] = idx; else if (keep && sh.seasons.some(s => s.episodes.some(e => e.id === keep))) return openShow(sh, keep);
      return render();
    }
    const key = screen.rows[screen.pos.row]?.key, id = cur()?.id;
    screen.rows = homeRows();
    screen.rows.forEach((r, i) => { const j = r.items.findIndex(x => x.id === id); screen.pos.col[i] = Math.min(r.items.length - 1, j >= 0 && r.key === key ? j : screen.pos.col[i] || 0); });
    const ri = screen.rows.findIndex(r => r.key === key);
    screen.pos.row = ri >= 0 ? ri : Math.min(screen.pos.row, Math.max(0, screen.rows.length - 1));
    render();
  }

  // ---------- controle remoto e teclado ----------
  const BACK = (e: KeyboardEvent) => ["GoBack", "BrowserBack", "Back", "Escape", "Backspace"].includes(e.key) || e.keyCode === 10009 || e.keyCode === 461;
  document.addEventListener("keydown", e => {
    const k = e.key;
    if (playing) {
      if (nextT) { if (k === "Enter" || k === " ") playNext(); else if (BACK(e)) { cancelNext(); closePlayer(); } else return; return e.preventDefault(); }
      if (k === "Enter" || k === " " || k === "MediaPlayPause") toggle();
      else if (k === "MediaPlay") { video.play().catch(() => {}); showUI(); }
      else if (k === "MediaPause" || k === "MediaStop") { video.pause(); showUI(); }
      else if (k === "ArrowLeft" || k === "MediaRewind") seek(-10);
      else if (k === "ArrowRight" || k === "MediaFastForward") seek(10);
      else if (k === "ArrowUp") cycleSubs();
      else if (k === "ArrowDown") showUI();
      else if (k === "MediaTrackNext" && queue.length) { save(true); playNext(); }
      else if (BACK(e)) closePlayer();
      else return;
      return e.preventDefault();
    }
    if (k === "ArrowUp") move(-1, 0);
    else if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowLeft") move(0, -1);
    else if (k === "ArrowRight") move(0, 1);
    else if (k === "Enter" || k === " ") choose();
    else if (BACK(e)) {
      if (screen.name === "show") goHome();
      else if (screen.pos.row > 0) { screen.pos.row = 0; paint(); }
      else if (/OsmoTV\//.test(navigator.userAgent)) location.href = "https://app.osmo.com.br/tv/"; // no app da TV: volta para o Osmo TV
      else return; // já está no começo: deixa o Voltar sair do app
    } else return;
    e.preventDefault();
  });
  document.addEventListener("click", e => {
    const target = e.target; if (!(target instanceof Element)) return;
    if (playing) {
      if (target.closest<HTMLElement>("#pClose")) closePlayer();
      else if (!$("#pNext").hidden) playNext();
      else if (target.closest<HTMLElement>("#player")) toggle();
      return;
    }
    if (target.closest<HTMLElement>("#crumb")) return goHome();
    const c = target.closest<HTMLElement>("[data-col]"); if (!c) return;
    const r = Number(c.dataset.row), col = Number(c.dataset.col);
    const again = screen.pos.row === r && (screen.pos.col[r] || 0) === col;
    screen.pos.row = r; screen.pos.col[r] = col;
    if (screen.name === "show" && r === 0) { if (screen.season !== col) return setSeason(col); }
    paint();
    if (again || (screen.name === "show" && r === 0)) choose();
  });
  addEventListener("pagehide", () => save(true));

  // ---------- controle pelo celular (remote-tv.js) ----------
  // série: continua de onde parou (ou começa no 1º episódio)
  const nextEpisode = (sh: Show) => {
    const all = sh.seasons.flatMap(s => s.episodes);
    return lib!.continuar.find((e): e is Episode => e.type === "episode" && e.show === sh.id) || all.filter(e => prog(e)).sort((a, b) => prog(b)!.at - prog(a)!.at)[0] || all[0];
  };
  function playById(id: string | undefined) {
    if (!lib) return false;
    const eps = lib!.series.flatMap(sh => sh.seasons.flatMap(s => s.episodes));
    const sh = lib!.series.find(s => s.id === id);
    const x = sh ? nextEpisode(sh) : [...lib!.filmes, ...lib!.clipes, ...eps, ...lib!.continuar].find(v => v.id === id);
    if (!x) return false;
    if (playing) { cancelNext(); save(true); }
    start(x); return true;
  }
  window.OsmoRemote?.on("play", id => playById(id));
  // manda para o celular as fileiras, com uma capa pequena embutida quando a capa mora no Mac
  // (o celular abre app.osmo.com.br em https e não consegue ver as imagens do Mac)
  const thumbs = new Map<string, Promise<string>>();
  function thumb(src?: string): Promise<string> {
    if (!src || /^https:/.test(src)) return Promise.resolve(src || "");
    if (thumbs.has(src)) return thumbs.get(src)!;
    const p = new Promise<string>(ok => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = 200; c.height = 300;
          const g = c.getContext("2d")!, k = Math.max(200 / img.width, 300 / img.height);
          g.drawImage(img, (200 - img.width * k) / 2, (300 - img.height * k) / 2, img.width * k, img.height * k);
          ok(c.toDataURL("image/jpeg", 0.72));
        } catch { ok(""); }
      };
      img.onerror = () => ok("");
      img.src = src;
    });
    thumbs.set(src, p); return p;
  }
  async function sendCatalog() {
    if (!lib || !window.OsmoRemote) return;
    const it = async (x: Playable | Show, eyebrow: string, meta: string): Promise<OsmoCatalogItem> => ({ id: x.id, title: x.title, eyebrow, meta, overview: x.overview || "", poster: await thumb(x.poster || x.still || x.backdrop) });
    const rows: OsmoCatalog["rows"] = [];
    if (lib!.continuar.length) rows.push({ title: "Continuar assistindo", items: await Promise.all(lib!.continuar.map(x => it(x,
      x.type === "episode" ? `${x.showTitle} · ${epLabel(x)}` : x.type === "clip" ? (x.artist || "Clipe") : "Filme", prog(x) ? `Parou em ${clock(prog(x)!.t)}` : ""))) });
    if (lib!.filmes.length) rows.push({ title: "Filmes", items: await Promise.all(lib!.filmes.map(x => it(x, "Filme", [x.year, x.rating ? "★ " + x.rating.toFixed(1) : ""].filter(Boolean).join(" · ")))) });
    if (lib!.series.length) rows.push({ title: "Séries", items: await Promise.all(lib!.series.map(sh => {
      const e = nextEpisode(sh), n = sh.seasons.reduce((a, s) => a + s.episodes.length, 0);
      return it(sh, "Série", [`${n} episódio${n > 1 ? "s" : ""}`, e ? (prog(e) ? "Continua em " : "Começa em ") + epLabel(e) : ""].filter(Boolean).join(" · "));
    })) });
    if (lib!.clipes.length) rows.push({ title: "Clipes", items: await Promise.all(lib!.clipes.map(x => it(x, x.artist || "Clipe", ""))) });
    const json = JSON.stringify(rows); if (json === lastCatalog) return; // nada mudou: não reenvia
    lastCatalog = json; window.OsmoRemote.catalog({ rows });
  }
  let lastCatalog = "";

  // atualiza sozinho a cada 30 s (vídeo novo na pasta, capas que chegaram do TMDB)
  setInterval(() => { if (!playing && !document.hidden) refresh(); }, 30000);

  (async () => {
    try { await loadLibrary(); }
    catch { $("#hTitle").textContent = "Não achei a biblioteca."; $("#rows").innerHTML = `<div class="state"><b>O Mac não respondeu.</b>Confira se a janela "Biblioteca da casa" está aberta no Mac e se este aparelho está no mesmo Wi-Fi.</div>`; return; }
    if (!lib!.tmdb) $("#credit").hidden = true;
    screen.rows = homeRows();
    screen.pos = { row: 0, col: screen.rows.map(() => 0) };
    render();
    sendCatalog();
    if (window.OsmoRemote?.pending) { playById(window.OsmoRemote.pending); window.OsmoRemote.pending = ""; } // o celular pediu este título
  })();
})();
