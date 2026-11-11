import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backup } from "../scripts/backup";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "osmo-backup-"));
const dbPath = path.join(dir, "live.sqlite");
const out = path.join(dir, "backups");

test("backup copies a live WAL database into a verified, restorable file", () => {
  const live = new DatabaseSync(dbPath);
  live.exec("PRAGMA journal_mode = WAL; CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes (body) VALUES ('antes');");
  // the source stays open and mid-use, as it is in production
  const result = backup(dbPath, out, 14, new Date("2026-11-11T03:30:00Z"));
  live.exec("INSERT INTO notes (body) VALUES ('depois')");
  live.close();

  assert.equal(path.basename(result.file), "osmo_talents-2026-11-11T03-30-00Z.sqlite");
  assert.equal(result.bytes, fs.statSync(result.file).size);
  assert.deepEqual(fs.readdirSync(out), [path.basename(result.file)], "no partial file is left behind");
  const copy = new DatabaseSync(result.file, { readOnly: true });
  assert.deepEqual(copy.prepare("SELECT body FROM notes").all().map(r => r.body), ["antes"]);
  copy.close();
});

test("backup keeps only the newest copies and never touches unrelated files", () => {
  fs.writeFileSync(path.join(out, "anotacoes.txt"), "minhas");
  for (let day = 12; day <= 15; day++) backup(dbPath, out, 3, new Date(`2026-11-${day}T03:30:00Z`));
  assert.deepEqual(fs.readdirSync(out).sort(), [
    "anotacoes.txt",
    "osmo_talents-2026-11-13T03-30-00Z.sqlite",
    "osmo_talents-2026-11-14T03-30-00Z.sqlite",
    "osmo_talents-2026-11-15T03-30-00Z.sqlite",
  ]);
});

test("backup fails loudly when the database is missing instead of creating an empty one", () => {
  const missing = path.join(dir, "nao-existe.sqlite");
  assert.throws(() => backup(missing, out), /Banco não encontrado/);
  assert.equal(fs.existsSync(missing), false);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
