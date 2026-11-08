#!/usr/bin/env node
// BIBLIOTECA DA CASA (protótipo do Osmo TV na rede de casa), como para uma criança:
// - este programa roda no SEU Mac e vira uma "videolocadora" da casa, igual ao Compartilhamento
//   Doméstico da Apple TV antiga: os vídeos ficam no Mac e tocam na TV/celular pelo Wi-Fi;
// - ele olha a pasta ~/Movies/Osmo TV (Filmes do Mac > Osmo TV), que tem 3 gavetas:
//     Filmes/  ->  "Nome do Filme (2010).mp4"
//     Séries/  ->  "Nome da Série/Temporada 1/Nome da Série S01E02.mp4"  (ou "1x02")
//     Clipes/  ->  "Artista - Música.mp4"
//   com o mesmo nome do vídeo podem ir: .jpg/.png (capa), -fundo.jpg (fundo largo), .srt/.vtt (legenda);
//   na pasta da série: poster.jpg (capa) e fundo.jpg;
// - se tiver a chave do TMDB (a mesma do Top 10, no .env do projeto), ele busca capa, fundo,
//   sinopse e nome dos episódios sozinho, e guarda tudo para não perguntar de novo;
// - ele lembra onde cada vídeo parou (em qualquer aparelho da casa) e mostra "Continuar assistindo";
// - o vídeo vai "em pedaços" (HTTP Range): toca na hora e dá para pular para qualquer ponto.
// Nada sai da sua casa: o servidor só atende quem está no mesmo Wi-Fi. Não precisa instalar nada além do Node.
// Uso:  node biblioteca/server.mjs     (ou dois cliques em "Biblioteca da casa.command")
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

interface Subtitle { label: string; lang: string; src: string }
interface Sidecars { poster: string; backdrop: string; subtitles: Subtitle[] }
interface VisualItem { id: string; title: string }
interface Episode extends VisualItem {
  type: "episode"; s: number; e: number; overview: string; still: string; src: string; subtitles: Subtitle[];
}
interface Movie extends VisualItem, Sidecars {
  type: "movie"; year: string; overview: string; rating: number; src: string; _key: string; season?: never;
}
interface Clip extends VisualItem, Sidecars { type: "clip"; artist: string; src: string }
interface ShowBase extends VisualItem {
  type: "show"; year: string; overview: string; rating: number; poster: string; backdrop: string;
  _key: string; season?: never;
}
interface Season<T extends Episode = Episode> { n: number; episodes: T[] }
interface ScannedShow extends ShowBase { seasons: Season[]; count: number }
interface LibraryScan { filmes: Movie[]; series: ScannedShow[]; clipes: Clip[] }
interface MergedEpisode extends Episode { show: string; showTitle: string; backdrop?: string; poster?: string }
type MergedMovie = Omit<Movie, "_key">;
type MergedShow = Omit<ScannedShow, "_key" | "seasons"> & { seasons: Season<MergedEpisode>[] };
interface MergedLibrary { filmes: MergedMovie[]; series: MergedShow[]; clipes: Clip[] }
type Playable = MergedMovie | Clip | MergedEpisode;
interface Progress { t: number; d: number; at: number }
interface EpisodeMetadata { title?: string; overview?: string; still?: string }
interface TmdbMetadata {
  id?: number; title?: string; year?: string; overview?: string; rating?: number; poster?: string;
  backdrop?: string; eps?: Record<number, EpisodeMetadata | undefined>;
}
interface TmdbEpisode { episode_number: number; name?: string; overview?: string; still_path?: string }
interface TmdbSeason { episodes?: TmdbEpisode[] }
interface TmdbSearchItem {
  id: number; title?: string; name?: string; release_date?: string; first_air_date?: string;
  overview?: string; vote_average?: number; poster_path?: string; backdrop_path?: string;
}
interface TmdbSearch { results?: TmdbSearchItem[] }
type EnrichmentItem = Movie | ScannedShow | { _key: string; season: number; tvId: number };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

// This module is emitted to biblioteca/dist; UI assets and the shared project .env stay above it.
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(HERE, "public");
const ROOT = path.resolve(process.env.BIBLIOTECA || path.join(os.homedir(), "Movies", "Osmo TV"));
const PORT = Number(process.env.PORT || 8765);
const DATA = path.join(ROOT, ".osmo-tv"); // a "memória" da biblioteca: progresso e dados do TMDB
const GAVETAS = { filmes: "Filmes", series: "Séries", clipes: "Clipes" };
const ALIAS: Record<keyof typeof GAVETAS, string[]> = { filmes: ["filmes", "movies", "filme"], series: ["séries", "series", "tv shows", "seriados"], clipes: ["clipes", "music videos", "clipes musicais", "musica", "música"] };
const VIDEO: Record<string, string> = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska" };
const IMG: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const SUBS = [".vtt", ".srt"];
const STATIC: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

// a chave do TMDB: do ambiente ou do .env do projeto (o mesmo que o configurar-top10.sh grava)
function envKey(name: string): string {
  if (process.env[name]) return process.env[name]!;
  try {
    const line = fs.readFileSync(path.join(HERE, "..", ".env"), "utf8").split(/\r?\n/).find(l => l.startsWith(name + "="));
    return line ? line.slice(name.length + 1).replace(/^['"]|['"]$/g, "").trim() : "";
  } catch { return ""; }
}
const TMDB_TOKEN = envKey("TMDB_TOKEN");

// ---------- memória (arquivos JSON na pasta .osmo-tv) ----------
fs.mkdirSync(DATA, { recursive: true });
for (const g of Object.values(GAVETAS)) fs.mkdirSync(path.join(ROOT, g), { recursive: true });
function loadJSON<T extends object>(name: string): T { try { return JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8")) as T; } catch { return {} as T; } }
const saveT: Record<string, NodeJS.Timeout | undefined> = {};
function saveJSON(name: string, obj: object) { // grava no máximo 1 vez por segundo
  clearTimeout(saveT[name]);
  saveT[name] = setTimeout(() => fsp.writeFile(path.join(DATA, name), JSON.stringify(obj)).catch(() => {}), 1000);
}
const progress = loadJSON<Record<string, Progress>>("progresso.json"); // { id: { t, d, at } }
const tmdbCache = loadJSON<Record<string, TmdbMetadata | null | undefined>>("tmdb.json");     // { chave: dados | null }

// ---------- endereços seguros: o id é o caminho do arquivo codificado ----------
const toId = (rel: string) => Buffer.from(rel, "utf8").toString("base64url");
function fromId(id: string) {
  if (!/^[A-Za-z0-9_-]{1,1400}$/.test(id)) return null;
  const rel = Buffer.from(id, "base64url").toString("utf8");
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || file.startsWith(DATA + path.sep)) return null; // nunca sai da biblioteca
  return file;
}
const url = (kind: string, abs: string) => `/${kind}/${toId(path.relative(ROOT, abs))}`;

// ---------- entender o nome dos arquivos ----------
const JUNK = /\b(2160p|1080p|720p|480p|4k|uhd|hdr|bluray|blu-ray|brrip|bdrip|web[- ]?dl|webrip|hdrip|dvdrip|x26[45]|h\.?26[45]|hevc|aac|ac3|dts|dual|dublado|legendado|nacional|proper|repack|extended)\b.*$/i;
function tidy(s: string) { return s.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim(); }
function parseMovie(stem: string) {
  let s = tidy(stem), year = "";
  const m = s.match(/^(.*?)[\s([]*((?:19|20)\d{2})(?:[)\]]|\s|$)/);
  if (m && m[1].trim()) { year = m[2]; s = m[1]; }
  s = s.replace(JUNK, "").replace(/[\s\-–([]+$/, "").trim();
  return { title: s || tidy(stem), year };
}
function parseEpisode(stem: string, seasonFromFolder: number) {
  const s = tidy(stem);
  let m = s.match(/S(\d{1,2})\s*E(\d{1,3})/i) || s.match(/\b(\d{1,2})x(\d{2,3})\b/i);
  if (m) {
    const rest = s.slice(m.index! + m[0].length).replace(JUNK, "").replace(/^[\s\-–.:]+/, "").trim();
    return { s: Number(m[1]), e: Number(m[2]), title: rest };
  }
  m = s.match(/(?:ep(?:is[oó]dio)?|e)\s*(\d{1,3})/i) || s.match(/^(\d{1,3})\b/);
  return { s: seasonFromFolder || 1, e: m ? Number(m[1]) : 0, title: m ? s.replace(m[0], "").replace(/^[\s\-–.:]+/, "").trim() : s };
}
function parseClip(stem: string) {
  const s = tidy(stem).replace(JUNK, "").trim();
  const i = s.indexOf(" - ");
  return i > 0 ? { artist: s.slice(0, i).trim(), title: s.slice(i + 3).trim() } : { artist: "", title: s };
}
const norm = (s: string) => s.normalize("NFC").toLowerCase();
// "já está no fim": faltam menos de 15 s (ou menos de 10% em vídeos curtos)
const nearEnd = (t: number, d: number) => d > 0 && t > d - Math.min(15, d * 0.1);

// ---------- varrer as gavetas ----------
async function walk(dir: string, depth = 0): Promise<string[]> {
  let ents: fs.Dirent[] = [];
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out: string[] = [];
  for (const e of ents) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory() && depth < 4) out.push(...await walk(abs, depth + 1));
    else if (e.isFile()) out.push(abs);
  }
  return out;
}
async function gaveta(key: keyof typeof GAVETAS) { // aceita "Filmes", "Movies"... e acentos escritos de jeitos diferentes
  let ents: fs.Dirent[] = [];
  try { ents = await fsp.readdir(ROOT, { withFileTypes: true }); } catch { return []; }
  const dirs = ents.filter(e => e.isDirectory() && ALIAS[key].includes(norm(e.name))).map(e => path.join(ROOT, e.name));
  return (await Promise.all(dirs.map(d => walk(d)))).flat();
}
function sidecars(abs: string, files: string[]): Sidecars {
  const dir = path.dirname(abs), stem = path.basename(abs, path.extname(abs));
  const here = files.filter(f => path.dirname(f) === dir);
  const img = (suffix: string) => here.find(f => IMG[path.extname(f).toLowerCase()] && norm(path.basename(f, path.extname(f))) === norm(stem + suffix));
  const subs = here.filter(f => SUBS.includes(path.extname(f).toLowerCase()) && norm(path.basename(f)).startsWith(norm(stem)))
    .map(f => {
      const tag = path.basename(f, path.extname(f)).slice(stem.length).replace(/^[.\s_-]+/, "");
      return { label: tag ? tag.toUpperCase() : "Português", lang: (tag || "pt").slice(0, 5), src: url("sub", f) };
    });
  const p = img(""), b = img("-fundo") || img("-fanart") || img("-backdrop");
  return { poster: p ? url("art", p) : "", backdrop: b ? url("art", b) : "", subtitles: subs };
}
function folderArt(dir: string, files: string[], names: string[]) {
  const f = files.find(x => path.dirname(x) === dir && IMG[path.extname(x).toLowerCase()] && names.includes(norm(path.basename(x, path.extname(x)))));
  return f ? url("art", f) : "";
}

let cache: LibraryScan | null = null, cacheAt = 0;
async function scan(): Promise<LibraryScan> {
  if (cache && Date.now() - cacheAt < 8000) return cache;
  const [fFiles, sFiles, cFiles] = await Promise.all([gaveta("filmes"), gaveta("series"), gaveta("clipes")]);
  const isVideo = (f: string) => VIDEO[path.extname(f).toLowerCase()];

  const filmes = fFiles.filter(isVideo).map<Movie>(abs => {
    const { title, year } = parseMovie(path.basename(abs, path.extname(abs)));
    const rel = path.relative(ROOT, abs);
    return { id: toId(rel), type: "movie", title, year, overview: "", rating: 0, src: url("media", abs), ...sidecars(abs, fFiles), _key: `movie:${norm(title)}:${year}` };
  });

  // séries: a 1ª pasta dentro de Séries é o nome da série
  const shows = new Map<string, ShowBase & {eps: Episode[]}>();
  for (const abs of sFiles.filter(isVideo)) {
    const base = path.relative(ROOT, abs).split(path.sep); // ["Séries", "Nome da Série", ..., "arquivo.mp4"]
    const showDir = path.join(ROOT, base[0], base[1] || "");
    const showName = base.length > 2 ? base[1] : parseMovie(path.basename(abs, path.extname(abs)).replace(/S\d+\s*E\d+.*$/i, "")).title;
    const folderSeason = (path.basename(path.dirname(abs)).match(/(?:temporada|season|s)\s*(\d{1,2})/i) || [])[1];
    const ep = parseEpisode(path.basename(abs, path.extname(abs)), folderSeason ? Number(folderSeason) : 0);
    const { title: cleanShow, year } = parseMovie(showName);
    if (!shows.has(cleanShow)) shows.set(cleanShow, {
      id: toId("show:" + cleanShow), type: "show", title: cleanShow, year, overview: "", rating: 0,
      poster: base.length > 2 ? folderArt(showDir, sFiles, ["poster", "folder", "capa", "cover"]) : "",
      backdrop: base.length > 2 ? folderArt(showDir, sFiles, ["fundo", "fanart", "backdrop"]) : "",
      _key: `tv:${norm(cleanShow)}:${year}`, eps: [],
    });
    const sc = sidecars(abs, sFiles);
    shows.get(cleanShow)!.eps.push({ id: toId(path.relative(ROOT, abs)), type: "episode", s: ep.s, e: ep.e, title: ep.title, overview: "",
      still: sc.poster, src: url("media", abs), subtitles: sc.subtitles });
  }
  const series = [...shows.values()].map(sh => {
    sh.eps.sort((a, b) => a.s - b.s || a.e - b.e || a.title.localeCompare(b.title));
    const seasons = [...new Set(sh.eps.map(e => e.s))].map(n => ({ n, episodes: sh.eps.filter(e => e.s === n) }));
    const { eps, ...rest } = sh;
    return { ...rest, seasons, count: eps.length };
  });

  const clipes = cFiles.filter(isVideo).map<Clip>(abs => {
    const { artist, title } = parseClip(path.basename(abs, path.extname(abs)));
    return { id: toId(path.relative(ROOT, abs)), type: "clip", title, artist, src: url("media", abs), ...sidecars(abs, cFiles) };
  });

  const byTitle = (a: VisualItem, b: VisualItem) => a.title.localeCompare(b.title, "pt-BR");
  cache = { filmes: filmes.sort(byTitle), series: series.sort(byTitle), clipes: clipes.sort((a, b) => (a.artist + a.title).localeCompare(b.artist + b.title, "pt-BR")) };
  cacheAt = Date.now();
  enrich(cache);
  return cache;
}

// ---------- TMDB: capa, fundo, sinopse e episódios (em segundo plano, um pedido por vez) ----------
const queue: EnrichmentItem[] = []; let busy = false;
async function tmdb<T>(p: string): Promise<T> {
  const r = await fetch("https://api.themoviedb.org/3/" + p + (p.includes("?") ? "&" : "?") + "language=pt-BR",
    { headers: { Authorization: "Bearer " + TMDB_TOKEN, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("TMDB " + r.status);
  return r.json() as Promise<T>;
}
function enrich(lib: LibraryScan) {
  if (!TMDB_TOKEN) return;
  for (const x of [...lib.filmes, ...lib.series]) if (!(x._key in tmdbCache) && !queue.some(q => q._key === x._key)) queue.push(x);
  for (const sh of lib.series) {
    const meta = tmdbCache[sh._key];
    if (meta?.id) for (const s of sh.seasons) { const k = `season:${meta.id}:${s.n}`; if (!(k in tmdbCache) && !queue.some(q => q._key === k)) queue.push({ _key: k, season: s.n, tvId: meta.id }); }
  }
  pump();
}
async function pump() {
  if (busy) return; busy = true;
  while (queue.length) {
    const x = queue.shift()!;
    try {
      if (x.season != null) {
        const j = await tmdb<TmdbSeason>(`tv/${x.tvId}/season/${x.season}`);
        tmdbCache[x._key] = { eps: Object.fromEntries((j.episodes || []).map(e => [e.episode_number, { title: e.name, overview: e.overview, still: e.still_path ? "https://image.tmdb.org/t/p/w500" + e.still_path : "" }])) };
      } else {
        const tv = x.type === "show";
        const j = await tmdb<TmdbSearch>(`search/${tv ? "tv" : "movie"}?query=${encodeURIComponent(x.title)}${x.year ? `&${tv ? "first_air_date_year" : "year"}=${x.year}` : ""}`);
        const hit = (j.results || [])[0];
        tmdbCache[x._key] = hit ? {
          id: hit.id, title: hit.title || hit.name, year: String(hit.release_date || hit.first_air_date || "").slice(0, 4),
          overview: hit.overview || "", rating: Math.round((hit.vote_average || 0) * 10) / 10,
          poster: hit.poster_path ? "https://image.tmdb.org/t/p/w342" + hit.poster_path : "",
          backdrop: hit.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + hit.backdrop_path : "",
        } : null;
        if (tv && hit) cacheAt = 0; // achou a série: na próxima varredura, busca os episódios
      }
      saveJSON("tmdb.json", tmdbCache);
    } catch (e) { if (!/TMDB 4\d\d/.test(errorMessage(e))) { queue.unshift(x); break; } tmdbCache[x._key] = null; } // sem internet: tenta depois
    await new Promise(r => setTimeout(r, 120));
  }
  busy = false;
}
// junta o que está no Mac com o que veio do TMDB (o que está no Mac sempre ganha)
function merged(lib: LibraryScan): MergedLibrary {
  const mix = <T extends Movie | ScannedShow,>(x: T) => {
    const m = tmdbCache[x._key] || {};
    const { _key, ...base } = x;
    return { ...base, overview: m.overview || "", rating: m.rating || 0, year: x.year || m.year || "",
      poster: x.poster || m.poster || "", backdrop: x.backdrop || m.backdrop || m.poster || "" };
  };
  const series = lib.series.map(sh => {
    const m = tmdbCache[sh._key];
    return { ...mix(sh), seasons: sh.seasons.map(s => {
      const se = m?.id ? tmdbCache[`season:${m.id}:${s.n}`]?.eps || {} : {};
      return { n: s.n, episodes: s.episodes.map(e => ({ ...e, show: sh.id, showTitle: sh.title,
        title: e.title || se[e.e]?.title || (e.e ? `Episódio ${e.e}` : "Episódio"), overview: se[e.e]?.overview || "",
        still: e.still || se[e.e]?.still || "" })) };
    }) };
  });
  return { filmes: lib.filmes.map(mix), series, clipes: lib.clipes };
}
function continuar(lib: MergedLibrary) {
  const all = new Map<string, Playable>();
  for (const x of [...lib.filmes, ...lib.clipes]) all.set(x.id, x);
  const lastByShow = new Map<string, number>();
  for (const sh of lib.series) for (const s of sh.seasons) for (const e of s.episodes) all.set(e.id, { ...e, backdrop: sh.backdrop, poster: sh.poster });
  const out: Playable[] = [];
  for (const [id, p] of Object.entries(progress).sort((a, b) => b[1].at - a[1].at)) {
    const x = all.get(id); if (!x || !(p.t > 5) || nearEnd(p.t, p.d)) continue;
    if (x.type === "episode") { if (lastByShow.has(x.show)) continue; lastByShow.set(x.show, 1); }
    out.push(x); if (out.length >= 12) break;
  }
  return out;
}

// ---------- entregar arquivos ----------
const HEAD = {
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: https://image.tmdb.org; media-src 'self' blob:; connect-src 'self' https://app.osmo.com.br http://localhost:3000; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
function send(res: http.ServerResponse, status: number, body: string | Buffer | object | null, headers: http.OutgoingHttpHeaders = {}) {
  const json = typeof body === "object" && !Buffer.isBuffer(body);
  res.writeHead(status, { ...HEAD, ...(json ? { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } : {}), ...headers });
  res.end(json ? JSON.stringify(body) : body as string | Buffer | null);
}
function stream(req: http.IncomingMessage, res: http.ServerResponse, file: string, type: string, cacheCtl: string) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "Não encontrado");
    const size = st.size, base = { ...HEAD, "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": cacheCtl };
    let start = 0, end = size - 1, status = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && size > 0) {
      if (m[1] === "" && m[2] !== "") start = Math.max(0, size - Number(m[2]));
      else { start = Number(m[1] || 0); if (m[2] !== "") end = Math.min(end, Number(m[2])); }
      if (start > end || start >= size) { res.writeHead(416, { ...base, "Content-Range": `bytes */${size}` }); return res.end(); }
      status = 206;
    }
    res.writeHead(status, { ...base, "Content-Length": end - start + 1, ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === "HEAD" || !size) return res.end();
    const s = fs.createReadStream(file, { start, end });
    s.on("error", () => res.destroy()); res.on("close", () => s.destroy()); s.pipe(res);
  });
}
function srtToVtt(buf: Buffer) {
  let t = buf.toString("utf8");
  if (t.includes("\uFFFD")) t = buf.toString("latin1"); // legendas antigas costumam vir em "latin1"
  t = t.replace(/^\uFEFF/, "").replace(/\r/g, "");
  return t.startsWith("WEBVTT") ? t : "WEBVTT\n\n" + t.replace(/(\d\d:\d\d:\d\d),(\d{3})/g, "$1.$2");
}
function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise<unknown>((ok, no) => { let s = ""; req.on("data", c => { s += c; if (s.length > 10_000) { no(new Error("grande")); req.destroy(); } }); req.on("end", () => { try { ok(JSON.parse(s || "{}") as unknown); } catch (e) { no(e); } }); req.on("error", no); });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url!, "http://x");
  const p = u.pathname;
  try {
    if (p === "/api/library" && req.method === "GET") {
      const lib = merged(await scan());
      return send(res, 200, { root: ROOT, tmdb: !!TMDB_TOKEN, ...lib, continuar: continuar(lib), progress });
    }
    if (p === "/api/progress" && req.method === "POST") {
      if (req.headers["x-osmo"] !== "1") return send(res, 403, { error: "recusado" }); // só o nosso app grava
      const b = await readBody(req) as { id?: unknown; t?: unknown; d?: unknown; done?: unknown };
      if (typeof b.id !== "string" || !fromId(b.id)) return send(res, 400, { error: "id" });
      const t = Math.max(0, Number(b.t) || 0), d = Math.max(0, Number(b.d) || 0);
      if (b.done || nearEnd(t, d)) delete progress[b.id];
      else if (t >= 5) progress[b.id] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() }; // abriu e fechou logo: mantém onde estava
      saveJSON("progresso.json", progress);
      return send(res, 200, { ok: true });
    }
    const m = p.match(/^\/(media|art|sub)\/([A-Za-z0-9_-]+)$/);
    if (m && (req.method === "GET" || req.method === "HEAD")) {
      const file = fromId(m[2]); if (!file) return send(res, 404, "Não encontrado");
      const ext = path.extname(file).toLowerCase();
      if (m[1] === "media" && VIDEO[ext]) return stream(req, res, file, VIDEO[ext], "no-cache");
      if (m[1] === "art" && IMG[ext]) return stream(req, res, file, IMG[ext], "public, max-age=3600");
      if (m[1] === "sub" && SUBS.includes(ext)) {
        const buf = await fsp.readFile(file).catch(() => null);
        return buf ? send(res, 200, srtToVtt(buf), { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-cache" }) : send(res, 404, "Não encontrado");
      }
      return send(res, 404, "Não encontrado");
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Método não permitido");
    // o controle pelo celular: o mesmo arquivo do Osmo TV (public/tv/remote-tv.js do site), para os dois nunca ficarem diferentes
    if (p === "/remote-tv.js") {
      const buf = await fsp.readFile(path.join(HERE, "..", "public", "tv", "remote-tv.js")).catch(() => null);
      return buf ? send(res, 200, buf, { "Content-Type": STATIC[".js"], "Cache-Control": "no-cache" }) : send(res, 404, "Não encontrado");
    }
    // a tela do app (pasta public)
    const rel = p === "/" ? "/index.html" : decodeURIComponent(p);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep) || !STATIC[path.extname(file)]) return send(res, 404, "Não encontrado");
    const buf = await fsp.readFile(file).catch(() => null);
    return buf ? send(res, 200, buf, { "Content-Type": STATIC[path.extname(file)], "Cache-Control": "no-cache" }) : send(res, 404, "Não encontrado");
  } catch (e) {
    console.error(new Date().toISOString(), p, errorMessage(e));
    if (!res.headersSent) send(res, 500, { error: "Algo deu errado." });
  }
});

export function start(): http.Server {
  server.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal).map(i => i.address);
  console.log("");
  console.log("Biblioteca da casa (Osmo TV) ligada.");
  console.log("Pasta dos vídeos: " + ROOT);
  console.log("  Filmes/   Séries/   Clipes/");
  console.log(TMDB_TOKEN ? "Capas e sinopses: TMDB ligado." : "Capas e sinopses: sem chave do TMDB (rode o Configurar Top 10 para ligar).");
  console.log("");
  console.log("Abra neste Mac:     http://localhost:" + PORT);
  for (const ip of ips) console.log("Abra na TV/celular: http://" + ip + ":" + PORT);
  console.log("");
  console.log("Deixe esta janela aberta enquanto estiver assistindo. Para desligar: feche a janela.");
});
// BONJOUR: anuncia a biblioteca no Wi-Fi como "_osmotv._tcp" (o app da TV acha o Mac sozinho,
// sem ninguém digitar endereço). No Mac usamos o "dns-sd", que já vem no sistema.
let bonjour: ChildProcess | null = null;
server.on("listening", () => {
  if (process.platform !== "darwin") return;
  const name = "Osmo TV (" + os.hostname().replace(/\.local$/, "") + ")";
  try {
    bonjour = spawn("dns-sd", ["-R", name, "_osmotv._tcp", "local", String(PORT)], { stdio: "ignore" });
    bonjour.on("error", () => { bonjour = null; });
    console.log("A TV acha este Mac sozinha (Bonjour: " + name + ").");
  } catch { bonjour = null; }
});
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => { try { bonjour?.kill(); } catch {} process.exit(0); });
process.on("exit", () => { try { bonjour?.kill(); } catch {} });
server.on("error", e => {
  console.error((e as NodeJS.ErrnoException).code === "EADDRINUSE" ? `A porta ${PORT} já está em uso: a biblioteca provavelmente já está ligada em outra janela.` : e.message);
  process.exit(1);
});
  return server;
}

export { server };
export const _test = { parseMovie, parseEpisode, parseClip, fromId, toId, nearEnd, srtToVtt };
