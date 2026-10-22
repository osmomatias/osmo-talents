// Banco de dados SQLite (módulo nativo node:sqlite, sem dependências externas)
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "osmo_talents.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('freela','cliente')),
  energy TEXT NOT NULL DEFAULT 'media',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '', bio TEXT DEFAULT '', location TEXT DEFAULT '',
  rate INTEGER DEFAULT 0, hours INTEGER DEFAULT 20,
  skills TEXT DEFAULT '[]', portfolio TEXT DEFAULT '[]',
  ws_com TEXT DEFAULT '', ws_resp TEXT DEFAULT '', ws_fb TEXT DEFAULT '', ws_foco TEXT DEFAULT '',
  tag TEXT DEFAULT '', company TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, cat TEXT NOT NULL,
  obj TEXT NOT NULL DEFAULT '', ent TEXT NOT NULL DEFAULT '[]', fora TEXT NOT NULL DEFAULT '[]',
  com TEXT NOT NULL DEFAULT '', fb TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '',
  budget_type TEXT NOT NULL DEFAULT 'fixo', budget INTEGER NOT NULL DEFAULT 0, duration TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]', is_async INTEGER NOT NULL DEFAULT 1, is_flex INTEGER NOT NULL DEFAULT 0,
  clarity INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'aberta',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  freela_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL, value INTEGER NOT NULL, days INTEGER NOT NULL, questions TEXT NOT NULL DEFAULT '',
  milestones TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'enviada',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (job_id, freela_id)
);
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES users(id), freela_id INTEGER NOT NULL REFERENCES users(id),
  value INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'ativo',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL, title TEXT NOT NULL, value INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  freela_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pin TEXT NOT NULL DEFAULT '',
  client_read_at TEXT NOT NULL DEFAULT '1970-01-01', freela_read_at TEXT NOT NULL DEFAULT '1970-01-01',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (job_id, client_id, freela_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_props_job ON proposals(job_id);
CREATE INDEX IF NOT EXISTS idx_props_freela ON proposals(freela_id);
CREATE INDEX IF NOT EXISTS idx_msgs_thread ON messages(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

// --- migrações (versão 2: pagamentos com Asaas)
db.exec(`
CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  asaas_account_id TEXT NOT NULL, wallet_id TEXT NOT NULL, api_key_enc TEXT NOT NULL,
  escrow INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY, event TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn("profiles", "cpf_cnpj", "TEXT DEFAULT ''");
addColumn("profiles", "asaas_customer_id", "TEXT DEFAULT ''");
addColumn("milestones", "pay_id", "TEXT DEFAULT ''");
addColumn("milestones", "pay_status", "TEXT DEFAULT 'a_pagar'");
addColumn("milestones", "invoice_url", "TEXT DEFAULT ''");
addColumn("milestones", "delivered_at", "TEXT DEFAULT ''");
db.exec("CREATE INDEX IF NOT EXISTS idx_ms_pay ON milestones(pay_id)");

// --- migrações (versão 3: login social)
db.exec(`
CREATE TABLE IF NOT EXISTS oauth_identities (
  provider TEXT NOT NULL, sub TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, sub)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT DEFAULT '', nonce TEXT DEFAULT '', role TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS oauth_pending (
  token TEXT PRIMARY KEY, provider TEXT NOT NULL, sub TEXT NOT NULL, email TEXT DEFAULT '', name TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_identities(user_id);
`);

// --- migrações (versão 4: recuperar senha)
db.exec(`
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);
`);

// --- migrações (versão 5: foto de perfil, guardada no próprio banco para o backup continuar sendo um arquivo só)
db.exec(`
CREATE TABLE IF NOT EXISTS avatars (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL, data BLOB NOT NULL, v INTEGER NOT NULL
);
`);

// --- migrações (versão 6: avisos por e-mail)
addColumn("users", "notify_level", "TEXT NOT NULL DEFAULT 'tudo'"); // tudo | importante | nada
addColumn("users", "notify_token", "TEXT NOT NULL DEFAULT ''");
db.exec(`
CREATE TABLE IF NOT EXISTS notify_log (
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);
`);

// --- migrações (versão 7: avaliações depois do contrato)
db.exec(`
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]', comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (contract_id, author_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_id);
`);

// --- migrações (versão 8: portfólio com imagens; cada projeto vira um item com título, link e imagem opcionais)
db.exec(`
CREATE TABLE IF NOT EXISTS portfolio_items (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL, title TEXT NOT NULL, link TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '', image BLOB, v INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_port_user ON portfolio_items(user_id, pos);
`);
// --- migrações (versão 9: arquivos anexados ao briefing da vaga)
db.exec(`
CREATE TABLE IF NOT EXISTS job_files (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, ext TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_files ON job_files(job_id);
`);

// o portfólio antigo (uma linha de texto por projeto) vira itens sem imagem
for (const p of db.prepare("SELECT user_id, portfolio FROM profiles WHERE portfolio NOT IN ('', '[]')").all()) {
  let titles = []; try { titles = JSON.parse(p.portfolio); } catch {}
  const start = db.prepare("SELECT COUNT(*) n FROM portfolio_items WHERE user_id = ?").get(p.user_id).n;
  titles.filter(t => typeof t === "string" && t.trim()).slice(0, Math.max(0, 12 - start))
    .forEach((t, i) => db.prepare("INSERT INTO portfolio_items (user_id, pos, title) VALUES (?,?,?)").run(p.user_id, start + i, t.trim().slice(0, 80)));
  db.prepare("UPDATE profiles SET portfolio = '[]' WHERE user_id = ?").run(p.user_id);
}

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

module.exports = { db, one, all, run, tx, DB_PATH };
