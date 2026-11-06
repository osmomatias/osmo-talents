// APP DE TV (app.osmo.com.br/tv/): Top 10 de filmes e séries, para o controle remoto.
// Como funciona, como para uma criança:
// - a tela tem 3 "andares": as abas (em cima), a fileira de filmes e a fileira de séries;
// - setas para cima e para baixo trocam de andar; para os lados andam dentro do andar;
// - o cartaz com foco cresce e aparece grande no destaque, com a imagem dele no fundo;
// - OK numa aba troca a lista; Voltar (ou Esc) sobe para as abas.
// Também funciona com mouse e toque: clicar num cartaz dá foco nele.
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LISTAS = { "em-alta": "Em alta nesta semana", melhores: "Mais bem avaliados de todos os tempos" };
  const MARK = `<svg viewBox="0 0 30 30" aria-hidden="true"><path d="${$(".brand path").getAttribute("d")}"/></svg>`; // o "O" do logo da Osmo
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let lista = "em-alta", data = null;
  // onde está o foco: andar 0 = abas, 1 = filmes, 2 = séries; col = posição dentro do andar
  const pos = { row: 1, col: [0, 0, 0] };
  const tabs = [...document.querySelectorAll("#tabs button")];

  // ---------- desenhar ----------
  function rowHTML(key, title, items, r) {
    return `<section class="row" data-row="${r}" aria-label="${esc(title)}"><h2>${esc(title)}</h2>
      <ol class="track">${items.map((x, i) => `<li class="card" data-row="${r}" data-col="${i}" aria-label="${x.rank}º: ${esc(x.title)}">
        <span class="rank" aria-hidden="true">${x.rank}</span>
        <div class="poster">${x.poster ? `<img src="${esc(x.poster)}" alt="" loading="${i < 6 ? "eager" : "lazy"}">` : MARK}</div></li>`).join("")}</ol></section>`;
  }
  function stateHTML(title, text) { return `<div class="state" role="status"><b>${esc(title)}</b>${esc(text)}</div>`; }

  async function load() {
    $("#hTitle").textContent = "Carregando…"; $("#hMeta").textContent = ""; $("#hOverview").textContent = "";
    try {
      const r = await fetch("/api/top10?lista=" + lista, { headers: { Accept: "application/json" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || "Erro " + r.status), { status: r.status });
      data = j;
    } catch (e) {
      data = null;
      $("#rows").innerHTML = e.status === 503
        ? stateHTML("O Top 10 ainda não está ligado.", "Falta colocar a chave do TMDB (TMDB_TOKEN) no servidor.")
        : stateHTML("Não deu para carregar o Top 10.", "Confira a internet da TV. Aperte OK para tentar de novo.");
      $("#hEyebrow").textContent = "Top 10"; $("#hTitle").textContent = "Filmes e séries";
      setBg(""); pos.row = 0; paint(); return;
    }
    $("#rows").innerHTML = rowHTML("filmes", "Top 10 Filmes", data.filmes, 1) + rowHTML("series", "Top 10 Séries", data.series, 2);
    pos.col[1] = pos.col[2] = 0;
    if (pos.row !== 0) pos.row = 1;
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
  const items = r => r === 1 ? data?.filmes || [] : r === 2 ? data?.series || [] : tabs;
  function paint() {
    document.querySelectorAll(".focus").forEach(el => el.classList.remove("focus"));
    if (pos.row === 0 || !data) {
      const t = tabs[pos.col[0]]; t.classList.add("focus"); t.focus({ preventScroll: true });
      if (data) hero(data.filmes[pos.col[1]], "Filmes"); // nas abas, o destaque mostra o filme escolhido na fileira
      return;
    }
    const card = $(`.card[data-row="${pos.row}"][data-col="${pos.col[pos.row]}"]`); if (!card) return;
    card.classList.add("focus"); card.setAttribute("tabindex", "-1"); card.focus({ preventScroll: true });
    // a fileira anda para o cartaz ficar à vista; a área das fileiras sobe para mostrar o andar
    const track = card.parentElement, behavior = reduce ? "auto" : "smooth";
    const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    track.scrollTo({ left: Math.max(0, card.offsetLeft - pad), behavior });
    const rows = $("#rows"), sec = card.closest(".row");
    rows.scrollTo({ top: pos.row === 1 ? 0 : sec.offsetTop - rows.offsetTop, behavior });
    hero(items(pos.row)[pos.col[pos.row]], pos.row === 1 ? "Filmes" : "Séries");
  }
  function hero(x, tipo) {
    if (!x) { $("#hEyebrow").textContent = "Top 10 · " + LISTAS[lista]; $("#hTitle").textContent = "Filmes e séries"; $("#hMeta").textContent = ""; $("#hOverview").textContent = ""; setBg(""); return; }
    $("#hEyebrow").textContent = `${tipo} · Nº ${x.rank} · ${LISTAS[lista]}`;
    $("#hTitle").textContent = x.title;
    $("#hMeta").innerHTML = `${x.year ? esc(x.year) + " · " : ""}<span class="star" aria-hidden="true">★</span> ${Number(x.rating || 0).toFixed(1)}`;
    $("#hOverview").textContent = x.overview || "";
    setBg(x.backdrop || "");
  }

  function move(dRow, dCol) {
    if (dRow) {
      const max = data ? 2 : 0, next = Math.min(max, Math.max(0, pos.row + dRow));
      if (next === pos.row) return;
      // ao trocar de andar, mantém a mesma coluna (se existir)
      if (next > 0) pos.col[next] = Math.min(items(next).length - 1, pos.col[pos.row] ?? 0);
      else pos.col[0] = tabs.findIndex(b => b.dataset.lista === lista);
      pos.row = next;
    } else {
      const n = items(pos.row).length; if (!n) return;
      pos.col[pos.row] = Math.min(n - 1, Math.max(0, pos.col[pos.row] + dCol));
    }
    paint();
  }
  function choose() {
    if (pos.row === 0 || !data) {
      const b = tabs[pos.col[0]];
      if (b.dataset.lista !== lista) { lista = b.dataset.lista; tabs.forEach(t => t.setAttribute("aria-pressed", t === b)); }
      return load();
    }
  }

  // ---------- controle remoto e teclado ----------
  document.addEventListener("keydown", e => {
    const k = e.key;
    if (k === "ArrowUp") move(-1, 0);
    else if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowLeft") move(0, -1);
    else if (k === "ArrowRight") move(0, 1);
    else if (k === "Enter" || k === " ") choose();
    else if (["GoBack", "BrowserBack", "Back", "Escape", "Backspace"].includes(k) || e.keyCode === 10009 || e.keyCode === 461) {
      if (pos.row === 0) return; // já está no topo: deixa o Voltar sair do app
      pos.row = 0; pos.col[0] = tabs.findIndex(b => b.dataset.lista === lista); paint();
    } else return;
    e.preventDefault();
  });
  // mouse e toque
  document.addEventListener("click", e => {
    const t = e.target.closest("#tabs button");
    if (t) { pos.row = 0; pos.col[0] = tabs.indexOf(t); paint(); return choose(); }
    const c = e.target.closest(".card");
    if (c) { pos.row = Number(c.dataset.row); pos.col[pos.row] = Number(c.dataset.col); paint(); }
    else if (!data && e.target.closest(".state")) load();
  });

  load();
})();
