// APP DE TV (app.osmo.com.br/tv/): Osmo Originais (vídeos próprios) + Top 10 de filmes e séries, para o controle remoto.
// Como funciona, como para uma criança:
// - a tela tem "andares": as abas (em cima) e as fileiras (Osmo Originais, Top 10 Filmes, Top 10 Séries);
// - setas para cima e para baixo trocam de andar; para os lados andam dentro do andar;
// - o cartaz com foco cresce e aparece grande no destaque, com a imagem dele no fundo;
// - OK numa aba troca a lista do Top 10; OK num Osmo Original abre o player;
// - no player: OK pausa/continua, setas para os lados voltam/avançam 10 s, Voltar fecha;
//   o app lembra onde você parou e continua dali na próxima vez.
// Também funciona com mouse e toque: clicar num cartaz dá foco; clicar de novo abre.
(() => {
  "use strict";
  if (window.OsmoRemote?.leaving) return; // é um celular: foi para a tela do controle remoto
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LISTAS = { "em-alta": "Em alta nesta semana", melhores: "Mais bem avaliados de todos os tempos" };
  const MARK = `<svg viewBox="0 0 30 30" aria-hidden="true"><path d="${$(".brand path").getAttribute("d")}"/></svg>`; // o "O" do logo da Osmo
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };

  let lista = "em-alta", top = null, topErr = null, videos = [];
  // as fileiras que estão na tela, na ordem; andar 0 = abas, andar N = rows[N-1]
  let rows = [];
  const pos = { row: 1, col: [0] };
  const tabs = [...document.querySelectorAll("#tabs button")];

  // ---------- desenhar ----------
  function rowHTML(row, r) {
    return `<section class="row${row.ranked ? "" : " plain"}" data-row="${r}" aria-label="${esc(row.title)}"><h2>${esc(row.title)}</h2>
      <ol class="track">${row.items.map((x, i) => `<li class="card" data-row="${r}" data-col="${i}" aria-label="${row.ranked ? x.rank + "º: " : ""}${esc(x.title)}">
        ${row.ranked ? `<span class="rank" aria-hidden="true">${x.rank}</span>` : ""}
        <div class="poster">${x.poster ? `<img src="${esc(x.poster)}" alt="" loading="${i < 6 ? "eager" : "lazy"}">` : MARK + (row.ranked ? "" : `<span class="ptitle">${esc(x.title)}</span>`)}
        ${!row.ranked && progressOf(x) ? `<i class="seen" style="width:${progressOf(x)}%"></i>` : ""}</div></li>`).join("")}</ol></section>`;
  }
  function stateHTML(title, text) { return `<div class="state" role="status"><b>${esc(title)}</b>${esc(text)}</div>`; }

  async function load() {
    if (!rows.length) { $("#hTitle").textContent = "Carregando…"; $("#hMeta").textContent = ""; $("#hOverview").textContent = ""; }
    const getJSON = async url => {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || "Erro " + r.status), { status: r.status });
      return j;
    };
    const [t, v] = await Promise.allSettled([getJSON("/api/top10?lista=" + lista), getJSON("/api/videos")]);
    top = t.status === "fulfilled" ? t.value : null; topErr = t.status === "rejected" ? t.reason : null;
    if (v.status === "fulfilled") videos = v.value.videos || [];
    build();
  }
  function build() {
    const keep = rows[pos.row - 1]?.key;
    rows = [];
    if (videos.length) rows.push({ key: "originais", title: "Osmo Originais", tipo: "Osmo Originais", items: videos, ranked: false });
    if (top) rows.push({ key: "filmes", title: "Top 10 Filmes", tipo: "Filmes", items: top.filmes, ranked: true },
      { key: "series", title: "Top 10 Séries", tipo: "Séries", items: top.series, ranked: true });
    let html = rows.map((row, i) => rowHTML(row, i + 1)).join("");
    if (!top) html += topErr?.status === 503
      ? stateHTML("O Top 10 ainda não está ligado.", "Falta colocar a chave do TMDB (TMDB_TOKEN) no servidor.")
      : stateHTML("Não deu para carregar o Top 10.", "Confira a internet da TV. Aperte OK nas abas para tentar de novo.");
    $("#rows").innerHTML = html;
    pos.col = [pos.col[0] || 0, ...rows.map(() => 0)];
    if (!rows.length) { pos.row = 0; $("#hEyebrow").textContent = "Osmo TV"; $("#hTitle").textContent = "Filmes e séries"; setBg(""); }
    else if (pos.row !== 0) { const k = rows.findIndex(r => r.key === keep); pos.row = k >= 0 ? k + 1 : 1; }
    paint();
  }

  // ---------- fundo com troca suave ----------
  let bgFront = $("#bgA"), bgBack = $("#bgB"), bgUrl = "";
  function setBg(url) {
    if (url === bgUrl) return; bgUrl = url;
    if (!url) { bgFront.classList.remove("on"); bgBack.classList.remove("on"); return; }
    const img = new Image();
    img.onload = () => { if (bgUrl !== url) return; bgBack.style.backgroundImage = `url("${url}")`; bgBack.classList.add("on"); bgFront.classList.remove("on"); [bgFront, bgBack] = [bgBack, bgFront]; };
    img.src = url;
  }

  // ---------- foco ----------
  const items = r => r === 0 ? tabs : rows[r - 1]?.items || [];
  function paint() {
    document.querySelectorAll(".focus").forEach(el => el.classList.remove("focus"));
    if (pos.row === 0 || !rows.length) {
      const t = tabs[pos.col[0]]; t.classList.add("focus"); t.focus({ preventScroll: true });
      if (rows.length) hero(rows[0], rows[0].items[pos.col[1]]); // nas abas, o destaque mostra o que está escolhido na 1ª fileira
      return;
    }
    const card = $(`.card[data-row="${pos.row}"][data-col="${pos.col[pos.row]}"]`); if (!card) return;
    card.classList.add("focus"); card.setAttribute("tabindex", "-1"); card.focus({ preventScroll: true });
    // a fileira anda para o cartaz ficar à vista; a área das fileiras sobe para mostrar o andar
    const track = card.parentElement, behavior = reduce ? "auto" : "smooth";
    const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    track.scrollTo({ left: Math.max(0, card.offsetLeft - pad), behavior });
    const box = $("#rows"), sec = card.closest(".row");
    box.scrollTo({ top: pos.row === 1 ? 0 : sec.offsetTop - box.offsetTop, behavior });
    hero(rows[pos.row - 1], items(pos.row)[pos.col[pos.row]]);
  }
  function hero(row, x) {
    if (!x) { $("#hEyebrow").textContent = "Osmo TV"; $("#hTitle").textContent = "Filmes e séries"; $("#hMeta").textContent = ""; $("#hOverview").textContent = ""; setBg(""); return; }
    $("#hEyebrow").textContent = row.ranked ? `${row.tipo} · Nº ${x.rank} · ${LISTAS[lista]}` : "Osmo Originais";
    $("#hTitle").textContent = x.title;
    const p = row.ranked ? 0 : progressOf(x);
    $("#hMeta").innerHTML = row.ranked
      ? `${x.year ? esc(x.year) + " · " : ""}<span class="star" aria-hidden="true">★</span> ${Number(x.rating || 0).toFixed(1)}`
      : [x.year ? esc(x.year) : "", p ? `Continuar de ${clock(Number(store.get("osmotv:pos:" + x.id)))}` : "Aperte OK para assistir"].filter(Boolean).join(" · ");
    $("#hOverview").textContent = x.overview || "";
    setBg(x.backdrop || "");
  }

  function move(dRow, dCol) {
    if (dRow) {
      const max = rows.length, next = Math.min(max, Math.max(0, pos.row + dRow));
      if (next === pos.row) return;
      // ao trocar de andar, mantém a mesma coluna (se existir)
      if (next > 0) pos.col[next] = Math.min(items(next).length - 1, pos.row > 0 ? pos.col[pos.row] : pos.col[next] || 0);
      else pos.col[0] = tabs.findIndex(b => b.dataset.lista === lista);
      pos.row = next;
    } else {
      const n = items(pos.row).length; if (!n) return;
      pos.col[pos.row] = Math.min(n - 1, Math.max(0, pos.col[pos.row] + dCol));
    }
    paint();
  }
  function choose() {
    if (pos.row === 0 || !rows.length) {
      const b = tabs[pos.col[0]];
      if (b.dataset.home) { goHome(b.dataset.home); return; } // "Na sua casa": abre a biblioteca do Mac
      if (b.dataset.lista !== lista) { lista = b.dataset.lista; tabs.forEach(t => t.setAttribute("aria-pressed", t === b)); }
      return load();
    }
    const row = rows[pos.row - 1];
    if (!row.ranked) play(row.items[pos.col[pos.row]]);
  }

  // ---------- player dos Osmo Originais ----------
  const player = $("#player"), video = $("#pv");
  let cur = null, hideT = 0, lastSave = 0;
  function clock(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }
  function progressOf(x) {
    const p = Number(store.get("osmotv:pos:" + x.id)), d = Number(store.get("osmotv:dur:" + x.id));
    return p > 0 && d > 0 ? Math.min(100, Math.round(p / d * 100)) : 0;
  }
  function showUI() {
    player.classList.add("ui"); clearTimeout(hideT);
    if (!video.paused) hideT = setTimeout(() => player.classList.remove("ui"), 3500);
  }
  function pState(text) { $("#pState").textContent = text || ""; $("#pState").hidden = !text; }
  function play(x) {
    if (!x) return;
    cur = x;
    $("#pTitle").textContent = x.title;
    pState("");
    video.innerHTML = x.subtitles ? `<track kind="subtitles" srclang="pt" label="Português" src="${esc(x.subtitles)}" default>` : "";
    video.poster = x.backdrop || "";
    video.src = x.src;
    const saved = Number(store.get("osmotv:pos:" + x.id)) || 0;
    video.addEventListener("loadedmetadata", () => {
      if (saved > 10 && saved < video.duration - 10) video.currentTime = saved;
      store.set("osmotv:dur:" + x.id, String(Math.floor(video.duration || 0)));
    }, { once: true });
    player.hidden = false; document.body.classList.add("playing");
    video.play().catch(() => pState("Aperte OK para começar."));
    showUI();
  }
  function closePlayer() {
    if (!cur) return;
    save(true);
    video.pause(); video.removeAttribute("src"); video.innerHTML = ""; video.load();
    player.hidden = true; document.body.classList.remove("playing");
    cur = null; clearTimeout(hideT);
    build(); // atualiza a barrinha de "onde parei"
  }
  function save(force) {
    if (!cur || !video.duration) return;
    const now = Date.now(); if (!force && now - lastSave < 5000) return; lastSave = now;
    if (video.ended || video.currentTime > video.duration - 15) store.del("osmotv:pos:" + cur.id);
    else if (video.currentTime > 5) store.set("osmotv:pos:" + cur.id, String(Math.floor(video.currentTime)));
  }
  function toggle() { if (video.paused) video.play().catch(() => {}); else video.pause(); showUI(); }
  function seek(d) { if (!video.duration) return; video.currentTime = Math.min(video.duration - 0.5, Math.max(0, video.currentTime + d)); showUI(); }
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
  video.addEventListener("ended", () => { save(true); closePlayer(); });
  video.addEventListener("error", () => { if (cur) pState("Não deu para tocar este vídeo. Ele precisa ser MP4 (H.264 + AAC)."); });

  // ---------- controle remoto e teclado ----------
  const BACK = e => ["GoBack", "BrowserBack", "Back", "Escape", "Backspace"].includes(e.key) || e.keyCode === 10009 || e.keyCode === 461;
  document.addEventListener("keydown", e => {
    const k = e.key;
    if (cur) {
      if (k === "Enter" || k === " " || k === "MediaPlayPause") toggle();
      else if (k === "MediaPlay") { video.play().catch(() => {}); showUI(); }
      else if (k === "MediaPause" || k === "MediaStop") { video.pause(); showUI(); }
      else if (k === "ArrowLeft" || k === "MediaRewind") seek(-10);
      else if (k === "ArrowRight" || k === "MediaFastForward") seek(10);
      else if (k === "ArrowUp" || k === "ArrowDown") showUI();
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
      if (pos.row === 0) return; // já está no topo: deixa o Voltar sair do app
      pos.row = 0; pos.col[0] = tabs.findIndex(b => b.dataset.lista === lista); paint();
    } else return;
    e.preventDefault();
  });
  // mouse e toque
  document.addEventListener("click", e => {
    if (cur) { if (e.target.closest("#pClose")) closePlayer(); else if (e.target.closest("#player")) toggle(); return; }
    const t = e.target.closest("#tabs button");
    if (t) { pos.row = 0; pos.col[0] = tabs.indexOf(t); paint(); return choose(); }
    const c = e.target.closest(".card");
    if (c) {
      const r = Number(c.dataset.row), col = Number(c.dataset.col), again = pos.row === r && pos.col[r] === col;
      pos.row = r; pos.col[r] = col; paint();
      if (again) choose();
    } else if (!top && e.target.closest(".state")) load();
  });
  addEventListener("pagehide", () => save(true));

  // NA SUA CASA: no app da TV, o app procura no Wi-Fi o Mac com a "Biblioteca da casa" ligada.
  // Quando acha, aparece a 3ª aba; OK nela abre os filmes, séries e clipes do Mac.
  function watchHome() {
    const bridge = window.OsmoTV; if (!bridge || typeof bridge.homeServer !== "function") return;
    let btn = null;
    const check = () => {
      let url = ""; try { url = String(bridge.homeServer() || ""); } catch {}
      if (!/^http:\/\/[\d.]+:\d+\/$/.test(url)) url = "";
      if (url && !btn) {
        btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Na sua casa";
        btn.className = "home"; btn.setAttribute("aria-pressed", "false");
        $("#tabs").appendChild(btn); tabs.push(btn);
      }
      if (btn && url) btn.dataset.home = url;
      if (btn && !url) { // o Mac desligou: a aba some
        const i = tabs.indexOf(btn); btn.remove(); tabs.splice(i, 1); btn = null;
        if (pos.col[0] >= tabs.length) { pos.col[0] = tabs.length - 1; if (pos.row === 0) paint(); }
      }
    };
    check(); setInterval(check, 2000);
  }
  watchHome();

  // CONTROLE PELO CELULAR (remote-tv.js): as setas e o OK chegam como teclas; estes dois pedidos são especiais:
  // "play" abre um Osmo Original direto; "home" abre a aba Na sua casa (levando o crachá do controle junto).
  function goHome(url, playId) { location.href = window.OsmoRemote ? window.OsmoRemote.link(url, playId) : url; }
  // um Osmo Original toca aqui; qualquer outro id é da Biblioteca da casa: abre "Na sua casa" já tocando
  window.OsmoRemote?.on("play", id => {
    const x = videos.find(v => v.id === id);
    if (x) { if (cur) closePlayer(); return play(x); }
    const b = tabs.find(t => t.dataset.home); if (b) { if (cur) closePlayer(); goHome(b.dataset.home, id); }
  });
  window.OsmoRemote?.on("home", () => { const b = tabs.find(t => t.dataset.home); if (b) goHome(b.dataset.home); });

  load();
})();
