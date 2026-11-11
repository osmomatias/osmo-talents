// EXPLICANDO COMO PARA UMA CRIANÇA: este arquivo é a "fotocópia do caderno".
// O banco de dados (data/osmo_talents.sqlite) guarda TUDO: pessoas, vagas, contratos,
// mensagens, fotos e anexos. Se esse arquivo estragar, tudo se perde. Então, toda noite,
// este script tira uma cópia inteira e guarda na pasta data/backups.
// - VACUUM INTO: o próprio SQLite escreve a cópia, de um jeito seguro mesmo com o site
//   ligado e gente usando (copiar o arquivo "na mão" pode pegar uma anotação pela metade);
// - integrity_check: depois de copiar, abrimos a cópia e conferimos se ela está inteira;
// - BACKUP_KEEP: guardamos só as cópias mais novas (padrão: 14) para o disco não encher.
// Uso: npm run backup   (no servidor, um timer do systemd roda sozinho toda noite)
// Os vídeos de data/videos NÃO entram: eles são arquivos soltos, fora do banco.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "../src/paths";

const PREFIX = "osmo_talents-";
const SUFFIX = ".sqlite";

export interface BackupResult { file: string; bytes: number; removed: string[] }

export function backup(dbPath: string, dir: string, keep = 14, now = new Date()): BackupResult {
  if (!fs.existsSync(dbPath)) throw new Error(`Banco não encontrado: ${dbPath}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // 2026-11-11T03-30-00Z: em UTC, e a ordem alfabética é a ordem do tempo
  const stamp = now.toISOString().slice(0, 19).replace(/:/g, "-") + "Z";
  const file = path.join(dir, PREFIX + stamp + SUFFIX);
  const partial = file + ".parcial";
  fs.rmSync(partial, { force: true });

  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.prepare("VACUUM INTO ?").run(partial);
  } finally { db.close(); }

  // só vira backup "de verdade" depois de conferido: cópia estragada não fica com nome de boa
  const copy = new DatabaseSync(partial, { readOnly: true });
  let check: string;
  try { check = String(copy.prepare("PRAGMA integrity_check").get()?.integrity_check); }
  finally { copy.close(); }
  if (check !== "ok") { fs.rmSync(partial, { force: true }); throw new Error(`A cópia falhou na conferência: ${check}`); }
  fs.chmodSync(partial, 0o600);
  fs.renameSync(partial, file);

  const all = fs.readdirSync(dir).filter(f => f.startsWith(PREFIX) && f.endsWith(SUFFIX)).sort();
  const removed = all.slice(0, Math.max(0, all.length - Math.max(1, keep)));
  for (const f of removed) fs.rmSync(path.join(dir, f), { force: true });
  return { file, bytes: fs.statSync(file).size, removed };
}

if (require.main === module) {
  const dbPath = process.env.DB_PATH || path.join(PROJECT_ROOT, "data", "osmo_talents.sqlite");
  const dir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), "backups");
  const keep = Math.max(1, Math.round(Number(process.env.BACKUP_KEEP)) || 14);
  try {
    const r = backup(dbPath, dir, keep);
    console.log(`Backup pronto: ${r.file} (${(r.bytes / 1048576).toFixed(1)} MB). Cópias antigas apagadas: ${r.removed.length}.`);
  } catch (e) {
    console.error("Backup falhou:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
