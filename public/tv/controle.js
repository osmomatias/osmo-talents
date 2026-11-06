// CONTROLE PELO CELULAR (app.osmo.com.br/tv/controle). Como para uma criança:
// - na primeira vez, você digita o código de 6 números que aparece na TV (ou lê o QR code, que já traz o código);
// - o servidor dá a este celular um crachá secreto, que fica guardado aqui. Da próxima vez, ele já abre ligado;
// - cada botão manda uma ordem para a TV (setas, OK, Voltar, pausar, 10 s para trás/frente, legenda);
//   segurar uma seta repete, como no controle de verdade;
// - em cima, "Agora na TV" mostra o que está na tela da TV, contado por ela;
// - "Osmo Originais" lista os vídeos: tocar num deles começa a tocar na TV.
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
  const KEY = "osmotv:phone";
  let k = store.get(KEY) || "", es = null, tvOnline = false, st = null, stAt = 0;

  const api = (path, body) => fetch("/api/tv/remote/" + path, {
    method: "POST", headers: { "Content-Type": "application/json", "x-osmo": "1" }, body: JSON.stringify(body),
  }).then(r => r.json().catch(() => ({})).then(j => r.ok ? j : Promise.reject(Object.assign(new Error(j.error || "Erro " + r.status), { status: r.status }))));

  function status(text, cls) { const el = $("#status"); el.hidden = !text; el.textContent = text; el.className = "status " + (cls || ""); }
  function show(which) { $("#pair").hidden = which !== "pair"; $("#remote").hidden = which !== "remote"; }

  // ---------- 1. ligar à TV ----------
  function pairScreen(msg) {
    if (es) { es.close(); es = null; }
    k = ""; store.del(KEY); show("pair"); status("");
    $("#pairErr").hidden = !msg; $("#pairErr").textContent = msg || "";
  }
  $("#code").addEventListener("input", e => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 6);
    e.target.value = d.length > 3 ? d.slice(0, 3) + " " + d.slice(3) : d;
    if (d.length === 6) pair(d);
  });
  $("#pairForm").addEventListener("submit", e => { e.preventDefault(); pair($("#code").value.replace(/\D/g, "")); });
  let pairing = false;
  async function pair(code) {
    if (pairing) return;
    if (code.length !== 6) { $("#pairErr").hidden = false; $("#pairErr").textContent = "O código tem 6 números."; return; }
    pairing = true; $("#pairBtn").disabled = true; $("#pairBtn").textContent = "Conectando…"; $("#pairErr").hidden = true;
    try {
      const j = await api("pair", { code });
      k = j.k; store.set(KEY, k); $("#code").value = "";
      start();
    } catch (err) {
      $("#pairErr").hidden = false; $("#pairErr").textContent = err.message;
    } finally { pairing = false; $("#pairBtn").disabled = false; $("#pairBtn").textContent = "Conectar"; }
  }

  // ---------- 2. o cano com a TV ----------
  function start() {
    show("remote"); status("Conectando…");
    if (es) es.close();
    es = new EventSource("/api/tv/remote/events?k=" + encodeURIComponent(k));
    es.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === "unknown") return pairScreen("Este celular não está mais ligado à TV. Digite o código de novo.");
      if (m.type === "state") { tvOnline = m.online; st = m.state; stAt = Date.now(); render(); }
      if (m.type === "catalog") { catalog = m.catalog; renderLib(); }
    };
    es.onerror = () => status("Sem conexão…", "off");
    loadOriginais();
  }
  const clock = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`; };
  function render() {
    status(tvOnline ? "TV conectada" : "TV desligada", tvOnline ? "on" : "off");
    const p = st && st.screen === "player";
    if (!tvOnline) { $("#nEyebrow").textContent = "Osmo TV"; $("#nTitle").textContent = "Ligue a TV e abra o Osmo TV."; }
    else if (!st) { $("#nEyebrow").textContent = "Osmo TV"; $("#nTitle").textContent = "Conectado"; }
    else { $("#nEyebrow").textContent = st.eyebrow || (st.screen === "casa" ? "Na sua casa" : "Osmo TV"); $("#nTitle").textContent = st.title || "—"; }
    $("#nTimeBox").hidden = !(tvOnline && p && st.d > 0);
    $("#subsBtn").hidden = !(tvOnline && p);
    $("#homeBtn").hidden = !(tvOnline && st && st.hasHome && st.screen === "inicio");
    $("#ppText").textContent = p && st.playing ? "Pausar" : p ? "Continuar" : "Tocar / pausar";
    $("#ppIcon").innerHTML = p && st.playing ? '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" class="fill"/>' : '<path d="M8 5v14l11-7z" class="fill"/>';
    tick();
  }
  // o tempo do vídeo anda sozinho entre um aviso da TV e outro
  function tick() {
    if (!st || st.screen !== "player" || !(st.d > 0)) return;
    const t = Math.min(st.d, st.t + (st.playing ? (Date.now() - stAt) / 1000 : 0));
    $("#nFill").style.width = (t / st.d * 100) + "%"; $("#nTime").textContent = `${clock(t)} / ${clock(st.d)}`;
  }
  setInterval(tick, 500);

  // ---------- 3. os botões ----------
  let busyMsgT = 0;
  function send(cmd, id) {
    if (!k) return;
    try { navigator.vibrate?.(12); } catch {}
    api("send", { k, cmd, id }).catch(err => {
      if (err.status === 401) return pairScreen(err.message);
      status(err.status === 409 ? "TV desligada" : "Não enviou", "off");
      clearTimeout(busyMsgT); busyMsgT = setTimeout(render, 2500);
    });
  }
  // segurar repete (setas e 10 s): primeiro toque na hora, depois de 0,4 s repete a cada 0,15 s
  let holdT = 0, holdI = 0, held = null;
  const stopHold = () => { clearTimeout(holdT); clearInterval(holdI); if (held) held.classList.remove("press"); held = null; };
  document.addEventListener("pointerdown", e => {
    const b = e.target.closest("button[data-cmd]"); if (!b || b.hidden) return;
    e.preventDefault(); stopHold(); held = b; b.classList.add("press");
    send(b.dataset.cmd);
    if (b.hasAttribute("data-repeat")) holdT = setTimeout(() => { holdI = setInterval(() => send(b.dataset.cmd), 150); }, 400);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => document.addEventListener(ev, stopHold));
  addEventListener("blur", stopHold);
  // teclado (acessibilidade): Enter/Espaço num botão também manda
  document.addEventListener("keydown", e => {
    const b = e.target.closest?.("button[data-cmd]");
    if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); send(b.dataset.cmd); }
  });

  // ---------- 4. para assistir: pôsteres ----------
  // duas fontes: os Osmo Originais (do servidor) e o catálogo da Biblioteca da casa (a TV manda)
  let originais = [], catalog = null, items = [];
  async function loadOriginais() {
    try {
      const r = await fetch("/api/videos", { headers: { Accept: "application/json" } });
      originais = ((await r.json()).videos || []).map(v => ({ id: v.id, title: v.title, eyebrow: "Osmo Originais", meta: v.year || "", overview: v.overview || "", poster: v.poster || "", orig: true }));
    } catch { originais = []; }
    renderLib();
  }
  function renderLib() {
    const rows = [...(catalog?.rows || [])];
    if (originais.length) rows.push({ title: "Osmo Originais", items: originais });
    items = [];
    $("#lib").hidden = !rows.length;
    $("#libRows").innerHTML = rows.map(r => `<section class="lrow"><h3>${esc(r.title)}</h3><ul>${r.items.map(x => {
      const n = items.push(x) - 1;
      return `<li><button type="button" data-item="${n}" aria-label="${esc(x.title)}: ver maior">${posterHTML(x)}<span class="t">${esc(x.title)}</span></button></li>`;
    }).join("")}</ul></section>`).join("");
  }
  const posterHTML = (x, cls = "pst") => `<span class="${cls}"><span class="ph">${esc(x.title)}</span>${x.poster ? `<img src="${esc(x.poster)}" alt="" loading="lazy" draggable="false">` : ""}</span>`;
  $("#libRows").addEventListener("click", e => { const b = e.target.closest("[data-item]"); if (b) openSheet(items[Number(b.dataset.item)], b); });

  // ---------- 5. pôster ampliado: arrastar para cima = tocar na TV ----------
  const sheet = $("#sheet"), fly = $("#sFly");
  let sel = null, opener = null, doneT = 0;
  function openSheet(x, from) {
    if (!x) return;
    sel = x; opener = from;
    $("#sPoster").innerHTML = `<span class="ph">${esc(x.title)}</span>${x.poster ? `<img src="${esc(x.poster)}" alt="" draggable="false">` : ""}`;
    $("#sEyebrow").textContent = x.eyebrow || ""; $("#sTitle").textContent = x.title;
    $("#sMeta").textContent = x.meta || ""; $("#sMeta").hidden = !x.meta;
    $("#sOver").textContent = x.overview || ""; $("#sOver").hidden = !x.overview;
    $("#sDone").hidden = true; fly.className = "sfly"; fly.style.transform = ""; fly.style.opacity = "";
    sheet.hidden = false; document.body.classList.add("locked");
    try { history.pushState({ sheet: 1 }, ""); } catch {}
    $("#sClose").focus({ preventScroll: true });
  }
  function closeSheet(fromHistory) {
    if (sheet.hidden) return;
    clearTimeout(doneT); sheet.hidden = true; document.body.classList.remove("locked"); sel = null;
    if (!fromHistory && history.state?.sheet) history.back();
    opener?.focus({ preventScroll: true });
  }
  addEventListener("popstate", () => closeSheet(true)); // o "voltar" do celular fecha o pôster
  $("#sClose").addEventListener("click", () => closeSheet());
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
  $("#sPlay").addEventListener("click", () => sel && launch());

  // dá para tocar este título agora? (casa = precisa do Mac ligado; a TV conta isso)
  function blocker(x) {
    if (!tvOnline) return "A TV está desligada ou com o Osmo TV fechado.";
    if (!x.orig && st && !st.casa && !st.hasHome) return "O Mac com a Biblioteca da casa está desligado.";
    return "";
  }
  function done(text, bad) {
    $("#sDoneText").textContent = text; $("#sDone").className = "sdone" + (bad ? " bad" : ""); $("#sDone").hidden = false;
    doneT = setTimeout(() => bad ? ($("#sDone").hidden = true) : closeSheet(), bad ? 2200 : 1100);
  }
  function snapBack() { fly.className = "sfly back"; fly.style.transform = ""; fly.style.opacity = ""; }
  function launch() {
    const why = blocker(sel);
    if (why) { snapBack(); try { navigator.vibrate?.([30, 60, 30]); } catch {} return done(why, true); }
    fly.className = "sfly go"; fly.style.transform = "translateY(-110vh) scale(.55)"; fly.style.opacity = "0";
    try { navigator.vibrate?.(25); } catch {}
    const x = sel;
    api("send", { k, cmd: "play", id: x.id })
      .then(() => done("Tocando na TV"))
      .catch(err => { if (err.status === 401) return pairScreen(err.message); snapBack(); done(err.message || "Não deu para mandar para a TV.", true); });
  }
  // o gesto: o pôster segue o dedo; para cima encolhe um pouco (indo "para a TV"); para baixo fecha
  let drag = null;
  fly.addEventListener("pointerdown", e => {
    if (!sel || e.button > 0) return;
    drag = { y: e.clientY, x: e.clientX, t: performance.now(), dy: 0, v: 0 };
    fly.className = "sfly"; fly.setPointerCapture(e.pointerId);
  });
  fly.addEventListener("pointermove", e => {
    if (!drag) return;
    const now = performance.now(), dy = e.clientY - drag.y;
    drag.v = (dy - drag.dy) / Math.max(1, now - drag.t); drag.dy = dy; drag.t = now;
    const up = Math.min(0, dy), down = Math.max(0, dy);
    fly.style.transform = `translateY(${up + down * 0.6}px) scale(${1 - Math.min(0.22, -up / 1400)})`;
    fly.style.opacity = String(1 - Math.min(0.35, -up / 900) - Math.min(0.5, down / 600));
  });
  const endDrag = e => {
    if (!drag) return;
    const { dy, v } = drag; drag = null;
    if (e.type === "pointercancel") return snapBack();
    if (dy < -110 || (v < -0.55 && dy < -40)) return launch();
    if (dy > 140 || (v > 0.7 && dy > 50)) return closeSheet();
    snapBack();
  };
  fly.addEventListener("pointerup", endDrag);
  fly.addEventListener("pointercancel", endDrag);

  $("#unpair").addEventListener("click", async () => {
    if (!confirm("Desconectar este celular da TV? Para usar de novo, é só digitar o código da TV.")) return;
    try { await api("unpair", { k }); } catch {}
    pairScreen("");
  });

  // ---------- começar ----------
  const c = new URLSearchParams(location.search).get("c");
  if (c) history.replaceState(null, "", location.pathname); // tira o código do endereço
  if (c && /^\d{6}$/.test(c)) { show("pair"); $("#code").value = c.slice(0, 3) + " " + c.slice(3); pair(c); }
  else if (k) start();
  else pairScreen("");
})();
