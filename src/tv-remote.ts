// CONTROLE PELO CELULAR do app de TV (/tv/). Como para uma criança:
// - a TV pede um crachá secreto (POST /api/tv/remote/tv) e recebe também um CÓDIGO de 6 números,
//   que ela mostra no canto da tela (com um QR code);
// - o celular abre app.osmo.com.br/tv, digita o código (ou lê o QR) e ganha o seu próprio crachá
//   (POST /api/tv/remote/pair). O código vale 20 minutos; o crachá do celular vale até ele desconectar;
// - o celular manda ordens ("cima", "OK", "pausar"...) com POST /api/tv/remote/send;
// - a TV fica com um "cano" aberto (GET /api/tv/remote/events, Server-Sent Events) e recebe as ordens na hora;
// - a TV conta o que está na tela (POST /api/tv/remote/state) e o celular recebe isso pelo cano dele.
// A Biblioteca da casa (no Mac, outro endereço) usa o mesmo crachá da TV: por isso os pedidos da TV
// aceitam vir de outro endereço (CORS) e não usam cookie; quem prova quem é a TV é o crachá.
import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from "node:http";
import { one, run } from "./db.js";
import { record } from "./service-values.js";

interface TvRow { id: number }
interface PhoneRow { id: number; tv_id: number }
interface RemoteState {
  screen: string; eyebrow: string; title: string; playing: boolean; t: number; d: number;
  at: number; hasHome: boolean; casa: boolean;
}
interface CatalogItem { id: string; title: string; eyebrow: string; meta: string; overview: string; poster: string }
interface Catalog { rows: { title: string; items: CatalogItem[] }[]; at: number }
interface Room {
  tvs: Set<ServerResponse>; phones: Set<ServerResponse>; state: RemoteState | null;
  offT: NodeJS.Timeout | undefined; catalog: Catalog | null;
}
interface RemoteHttpError extends Error { status: number }
export interface RemoteDependencies {
  send: (res: ServerResponse, status: number, data: unknown, headers?: OutgoingHttpHeaders) => void;
  readBody: (req: IncomingMessage, max?: number) => Promise<unknown>;
  limit: (key: string, max: number, duration: number) => void;
  HttpError: new (status: number, message: string) => RemoteHttpError;
}

const CODE_MIN = 20;
const CMDS = new Set(["up", "down", "left", "right", "ok", "back", "playpause", "rew", "ff", "subs", "next", "play", "home"]);
const SCREENS = new Set<unknown>(["inicio", "player", "casa"]);
const sha = (s: unknown) => crypto.createHash("sha256").update(String(s)).digest("hex");
const token = () => crypto.randomBytes(24).toString("base64url");

const rooms = new Map<number, Room>(); // tvId -> { tvs:Set<res>, phones:Set<res>, state, offT, catalog }
const codes = new Map<string, { tvId: number; exp: number }>(); // "123456" -> { tvId, exp }
const room = (id: number): Room => {
  let r = rooms.get(id);
  if (!r) {
    let catalog: Catalog | null = null; try { catalog = JSON.parse(one<{ catalog: string | null }>("SELECT catalog FROM tv_screens WHERE id = ?", id)?.catalog || "null") as Catalog | null; } catch {}
    rooms.set(id, r = { tvs: new Set(), phones: new Set(), state: null, offT: undefined, catalog });
  }
  return r;
};
const emit = (set: Set<ServerResponse>, data: object) => { const s = `data: ${JSON.stringify(data)}\n\n`; for (const res of set) res.write(s); };
const online = (id: number) => (rooms.get(id)?.tvs.size || 0) > 0;

// "Estou vivo" a cada 20 s: o Cloudflare e o nginx fecham canos parados; limpa códigos vencidos
setInterval(() => {
  for (const r of rooms.values()) for (const res of [...r.tvs, ...r.phones]) res.write(": ping\n\n");
  const now = Date.now(); for (const [c, v] of codes) if (v.exp < now) codes.delete(c);
}, 20_000).unref();
// TVs e celulares esquecidos há mais de 6 meses saem do banco
setInterval(() => {
  run("DELETE FROM tv_phones WHERE seen_at < datetime('now', '-180 days')");
  run("DELETE FROM tv_screens WHERE seen_at < datetime('now', '-180 days')");
}, 86_400_000).unref();

const tvOf = (t: unknown) => (typeof t === "string" && t.length >= 20 && t.length <= 64) ? one<TvRow>("SELECT id FROM tv_screens WHERE token_hash = ?", sha(t)) : null;
const phoneOf = (k: unknown) => (typeof k === "string" && k.length >= 20 && k.length <= 64) ? one<PhoneRow>("SELECT id, tv_id FROM tv_phones WHERE key_hash = ?", sha(k)) : null;

function newCode(tvId: number) {
  for (const [c, v] of codes) if (v.tvId === tvId) codes.delete(c);
  let c; do c = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"); while (codes.has(c));
  codes.set(c, { tvId, exp: Date.now() + CODE_MIN * 60_000 });
  return c;
}
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
function cleanState(value: unknown): RemoteState | null {
  if (!value || typeof value !== "object") return null;
  const s = record(value);
  const num = (v: unknown) => Math.max(0, Math.min(1e6, Number(v) || 0));
  return {
    screen: SCREENS.has(s.screen) ? s.screen as string : "inicio",
    eyebrow: clean(s.eyebrow, 120), title: clean(s.title, 160),
    playing: !!s.playing, t: num(s.t), d: num(s.d), at: Date.now(),
    hasHome: !!s.hasHome, casa: !!s.casa,
  };
}
// CATÁLOGO: as fileiras da Biblioteca da casa (Continuar, Filmes, Séries, Clipes), para o celular mostrar os pôsteres.
// Capa só do TMDB (https) ou uma foto pequena embutida (data:), que a TV gera das capas do Mac.
const POSTER_OK = /^(https:\/\/image\.tmdb\.org\/[A-Za-z0-9_./-]{1,200}|data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]{1,90000})$/;
function cleanCatalog(value: unknown): Catalog | null {
  const c = record(value);
  if (!value || !Array.isArray(c.rows)) return null;
  let n = 0;
  const rows = (c.rows as unknown[]).slice(0, 8).map(record).map(r => ({
    title: clean(r && r.title, 60),
    items: (Array.isArray(r.items) ? r.items as unknown[] : []).slice(0, 200).filter(x => x && /^[A-Za-z0-9_=-]{1,400}$/.test(String(record(x).id)) && n++ < 500).map(record).map(x => ({
      id: x.id as string, title: clean(x.title, 160), eyebrow: clean(x.eyebrow, 120), meta: clean(x.meta, 120), overview: clean(x.overview, 500),
      poster: typeof x.poster === "string" && POSTER_OK.test(x.poster) ? x.poster : "",
    })),
  })).filter(r => r.items.length);
  return { rows, at: Date.now() };
}

// O cano (SSE). ?t= é a TV; ?k= é o celular.
function events(req: IncomingMessage, res: ServerResponse, url: URL, send: RemoteDependencies["send"]): void {
  const tv = tvOf(url.searchParams.get("t")), ph = tv ? null : phoneOf(url.searchParams.get("k"));
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*", "Connection": "keep-alive",
  });
  res.write("retry: 3000\n\n");
  if (!tv && !ph) { res.write(`data: ${JSON.stringify({ type: "unknown" })}\n\n`); res.end(); return; }
  const id = tv ? tv.id : ph!.tv_id, r = room(id);
  if (tv) {
    run("UPDATE tv_screens SET seen_at = datetime('now') WHERE id = ?", id);
    r.tvs.add(res); clearTimeout(r.offT);
    emit(r.phones, { type: "state", online: true, state: r.state });
  } else {
    run("UPDATE tv_phones SET seen_at = datetime('now') WHERE id = ?", ph!.id);
    r.phones.add(res);
    res.write(`data: ${JSON.stringify({ type: "state", online: online(id), state: r.state })}\n\n`);
    if (r.catalog) res.write(`data: ${JSON.stringify({ type: "catalog", catalog: r.catalog })}\n\n`);
  }
  req.on("close", () => {
    if (tv) {
      r.tvs.delete(res);
      // a TV troca de página (Osmo TV <-> Na sua casa) e reabre o cano em instantes: espera antes de dizer "desligada"
      if (!r.tvs.size) r.offT = setTimeout(() => { if (!r.tvs.size) { r.state = null; emit(r.phones, { type: "state", online: false, state: null }); } }, 6000);
    } else r.phones.delete(res);
  });
}

// Recebe todos os pedidos /api/tv/remote/... (o server.js chama esta função antes do cardápio de rotas).
async function handle(req: IncomingMessage, res: ServerResponse, url: URL, ip: string, { send, readBody, limit, HttpError }: RemoteDependencies): Promise<void> {
  const p = url.pathname.slice("/api/tv/remote/".length);
  const cors = { "Access-Control-Allow-Origin": "*" };
  try {
    if (p === "events" && req.method === "GET") return events(req, res, url, send);
    if (req.method !== "POST") throw new HttpError(405, "Método não permitido.");
    // ---- pedidos da TV: o crachá no corpo prova quem é (podem vir da Biblioteca da casa, em outro endereço)
    if (p === "tv") {
      const b = await readBody(req, 2000) as Record<string, unknown>;
      let tv = tvOf(b.t), t = b.t;
      if (!tv) {
        limit("tvnew:" + ip, 30, 3600_000);
        t = token(); run("INSERT INTO tv_screens (token_hash) VALUES (?)", sha(t));
        tv = tvOf(t);
      }
      return send(res, 200, { t, code: newCode(tv!.id), minutes: CODE_MIN, phones: room(tv!.id).phones.size }, cors);
    }
    if (p === "catalog") {
      const b = await readBody(req, 3_000_000) as Record<string, unknown>;
      const tv = tvOf(b.t); if (!tv) throw new HttpError(404, "TV não encontrada.");
      const r = room(tv.id), c = cleanCatalog(b.catalog);
      const same = JSON.stringify(c?.rows) === JSON.stringify(r.catalog?.rows);
      if (!same) {
        r.catalog = c; run("UPDATE tv_screens SET catalog = ? WHERE id = ?", c ? JSON.stringify(c) : null, tv.id);
        emit(r.phones, { type: "catalog", catalog: c });
      }
      return send(res, 200, { ok: true }, cors);
    }
    if (p === "state") {
      const b = await readBody(req, 4000) as Record<string, unknown>;
      const tv = tvOf(b.t); if (!tv) throw new HttpError(404, "TV não encontrada.");
      const r = room(tv.id); r.state = cleanState(b.state);
      emit(r.phones, { type: "state", online: online(tv.id), state: r.state });
      return send(res, 200, { ok: true }, cors);
    }
    // ---- pedidos do celular: só do nosso próprio site (mesma proteção CSRF do resto do app)
    if (req.headers["x-osmo"] !== "1") throw new HttpError(403, "Requisição recusada.");
    const b = await readBody(req, 2000) as Record<string, unknown>;
    if (p === "pair") {
      limit("tvpair:" + ip, 12, 600_000);
      const code = String(b.code || "").replace(/\D/g, ""), c = codes.get(code);
      if (!c || c.exp < Date.now()) throw new HttpError(400, "Código não encontrado. Confira os 6 números que aparecem na TV.");
      codes.delete(code);
      const k = token(); run("INSERT INTO tv_phones (tv_id, key_hash) VALUES (?, ?)", c.tvId, sha(k));
      emit(room(c.tvId).tvs, { type: "paired" });
      return send(res, 200, { k, online: online(c.tvId) });
    }
    const ph = phoneOf(b.k); if (!ph) throw new HttpError(401, "Este celular não está mais ligado à TV. Digite o código de novo.");
    if (p === "send") {
      limit("tvcmd:" + ph.id, 600, 60_000);
      const cmd = String(b.cmd || ""); if (!CMDS.has(cmd)) throw new HttpError(400, "Comando desconhecido.");
      const id = typeof b.id === "string" && /^[A-Za-z0-9._= -]{1,400}$/.test(b.id) ? b.id : undefined;
      const r = rooms.get(ph.tv_id);
      if (!r || !r.tvs.size) throw new HttpError(409, "A TV está desligada ou com o Osmo TV fechado.");
      emit(r.tvs, { type: "cmd", cmd, id });
      return send(res, 200, { ok: true });
    }
    if (p === "unpair") { run("DELETE FROM tv_phones WHERE id = ?", ph.id); return send(res, 200, { ok: true }); }
    throw new HttpError(404, "Rota não encontrada.");
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message }, cors);
    console.error(new Date().toISOString(), "tv-remote", p, e);
    send(res, 500, { error: "Algo deu errado do nosso lado." }, cors);
  }
}

export { handle };
