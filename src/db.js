// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// Imagine um caderno gigante onde a plataforma anota TUDO: quem se cadastrou,
// quais vagas existem, quem mandou proposta, as mensagens, os pagamentos...
// Esse caderno se chama "banco de dados". Este arquivo:
//   1. abre (ou cria, se ainda não existir) o caderno;
//   2. desenha as "tabelas", que são como páginas com colunas, iguais a uma
//      planilha (uma página para pessoas, outra para vagas, outra para mensagens);
//   3. entrega para o resto do programa quatro "ferramentas" para ler e escrever
//      no caderno: one, all, run e tx (explicadas lá no final).
// O caderno fica num arquivo só: data/osmo_talents.sqlite.
// Banco de dados SQLite (módulo nativo node:sqlite, sem dependências externas)
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

// Onde o caderno fica guardado. Se alguém disser outro lugar (DB_PATH), usamos esse;
// senão, ele fica na pasta "data". A linha de baixo cria a pasta se ela não existir,
// igual a arrumar uma gaveta antes de guardar o caderno nela.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "osmo_talents.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Abrimos o caderno. As "PRAGMAs" são regrinhas de funcionamento:
// - WAL: deixa várias pessoas lerem enquanto alguém escreve, sem uma esperar a outra;
// - foreign_keys: não deixa anotar uma proposta para uma vaga que não existe;
// - busy_timeout: se o caderno estiver ocupado, espera até 5 segundos antes de desistir.
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

// As páginas principais do caderno ("CREATE TABLE IF NOT EXISTS" = "crie esta página
// se ela ainda não existir"; se já existe, não mexe em nada):
// - users: cada pessoa cadastrada. "role" diz se é freela (quem trabalha) ou cliente
//   (quem contrata). A senha NUNCA é guardada como está: guardamos um "embaralhado"
//   dela (pass_hash), que não dá para desembaralhar.
// - sessions: os "crachás" de quem está logado. Quando você entra, ganha um crachá;
//   enquanto ele valer, o site sabe quem você é.
// - profiles: o perfil de cada pessoa (o que faz, valor por hora, habilidades...).
// - jobs: as vagas. "status" diz em que pé está: aberta, em andamento, concluída.
// - proposals: as propostas que os freelas mandam para as vagas. UNIQUE (job_id, freela_id)
//   quer dizer: cada pessoa só pode mandar UMA proposta para cada vaga.
// - contracts: quando o cliente aceita uma proposta, nasce um contrato.
// - milestones: as "etapas" do contrato (ex.: rascunho, versão final). Cada etapa é paga
//   e aprovada separada, como fases de um videogame.
// - threads: cada conversa entre um cliente e um freela sobre uma vaga.
// - messages: cada mensagem dentro de uma conversa.
// Os "INDEX" no final são como o índice de um livro: deixam a busca muito mais rápida.
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

// "Migrações": o caderno foi crescendo com o tempo. Cada bloco abaixo acrescenta páginas
// ou colunas novas SEM apagar o que já estava anotado. É como colar folhas novas no
// caderno em vez de comprar um caderno novo e perder tudo.
// --- migrações (versão 2: pagamentos com Asaas)
// Páginas para os pagamentos (Asaas é a empresa que cobra e repassa o dinheiro):
// - payout_accounts: a "conta de recebimento" de cada freela no Asaas. A chave secreta
//   dessa conta é guardada trancada (criptografada, "api_key_enc").
// - webhook_events: avisos que o Asaas manda ("o pagamento entrou!"). Anotamos cada aviso
//   para não processar o mesmo aviso duas vezes.
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
// Ferramenta para acrescentar uma coluna numa página que já existe, mas só se ela ainda
// não estiver lá (perguntamos ao caderno quais colunas ele tem antes de mexer).
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
// Colunas novas para pagamento: o CPF/CNPJ de quem paga, o código do cliente no Asaas e,
// em cada etapa, o código da cobrança, a situação do pagamento (a pagar, aguardando,
// pago, liberado), o link da fatura e quando a etapa foi entregue.
addColumn("profiles", "cpf_cnpj", "TEXT DEFAULT ''");
addColumn("profiles", "asaas_customer_id", "TEXT DEFAULT ''");
addColumn("milestones", "pay_id", "TEXT DEFAULT ''");
addColumn("milestones", "pay_status", "TEXT DEFAULT 'a_pagar'");
addColumn("milestones", "invoice_url", "TEXT DEFAULT ''");
addColumn("milestones", "delivered_at", "TEXT DEFAULT ''");
db.exec("CREATE INDEX IF NOT EXISTS idx_ms_pay ON milestones(pay_id)");

// Login com Google/GitHub: guardamos qual conta de fora pertence a qual pessoa (identities),
// um "bilhete" temporário enquanto a pessoa vai e volta do Google (states) e um cadastro
// que ficou pela metade esperando a pessoa escolher se é freela ou cliente (pending).
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

// Esqueci minha senha: guardamos um código secreto (embaralhado) com prazo de validade.
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

// Avisos por e-mail: cada pessoa escolhe receber tudo, só o importante ou nada.
// notify_log lembra quando foi o último aviso de cada conversa, para não mandar e-mail
// repetido a cada mensagem.
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

// Avaliações: no fim do contrato cada lado dá nota de 1 a 5 (o CHECK garante isso) ao outro.
// UNIQUE (contract_id, author_id): cada pessoa avalia cada contrato uma vez só.
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

// Portfólio: cada projeto vira uma linha própria, com título, link e uma imagem opcional.
// A imagem fica dentro do próprio banco (BLOB = "um monte de bytes"), assim o backup
// continua sendo um arquivo só.
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
// Arquivos do briefing: o cliente pode anexar PDFs, imagens etc. à vaga.
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

// Selo de verificado: a pessoa manda um laudo médico assinado digitalmente. Conferimos a
// assinatura e jogamos o PDF fora; guardamos só um "resumo" único dele (sha256), para o
// mesmo laudo não ser usado em duas contas.
// --- migrações (versão 10: selo de verificado por laudo médico assinado com ICP-Brasil)
// O PDF nunca é guardado: só a data, o CRM de quem assinou (para auditoria) e o hash do arquivo (o mesmo laudo não vale para duas contas).
db.exec(`
CREATE TABLE IF NOT EXISTS verifications (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  doc_sha256 TEXT NOT NULL UNIQUE, crm TEXT NOT NULL, signed_at TEXT NOT NULL, revocation TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// --- migrações (versão 11: registro do que o dono da plataforma faz pela tela de gestão)
// Cada criação, edição ou exclusão feita pelo dono vira uma linha aqui: quem fez, o quê, em qual
// registro e o que mudou. É o "diário de bordo" para saber depois quem mexeu em quê.
db.exec(`
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// --- migrações (versão 12: projetos e tarefas no estilo Asana)
// Um "projeto" é um quadro de tarefas. Ele pode ser de um contrato (cliente e freela trabalham juntos nele)
// ou interno (só para a equipe da Osmo). Dentro dele há seções (as colunas do quadro: A fazer, Fazendo, Feito),
// tarefas (com responsável, prazo e subtarefas: uma subtarefa é só uma tarefa com "parent_id") e comentários.
db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('contrato','interno')),
  contract_id INTEGER UNIQUE REFERENCES contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_sections (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, pos INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES project_sections(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0, done_at TEXT NOT NULL DEFAULT '',
  pos INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, section_id, pos);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, done);
CREATE INDEX IF NOT EXISTS idx_task_comments ON task_comments(task_id, id);
`);

// Antes, o portfólio era só uma lista de textos dentro do perfil. Este laço passa cada texto
// antigo para a página nova de portfólio (no máximo 12) e depois esvazia a lista antiga,
// para não copiar de novo da próxima vez que o programa ligar.
// o portfólio antigo (uma linha de texto por projeto) vira itens sem imagem
for (const p of db.prepare("SELECT user_id, portfolio FROM profiles WHERE portfolio NOT IN ('', '[]')").all()) {
  let titles = []; try { titles = JSON.parse(p.portfolio); } catch {}
  const start = db.prepare("SELECT COUNT(*) n FROM portfolio_items WHERE user_id = ?").get(p.user_id).n;
  titles.filter(t => typeof t === "string" && t.trim()).slice(0, Math.max(0, 12 - start))
    .forEach((t, i) => db.prepare("INSERT INTO portfolio_items (user_id, pos, title) VALUES (?,?,?)").run(p.user_id, start + i, t.trim().slice(0, 80)));
  db.prepare("UPDATE profiles SET portfolio = '[]' WHERE user_id = ?").run(p.user_id);
}

// As quatro ferramentas que o resto do programa usa para falar com o caderno:
// - one(pergunta): devolve UMA linha (ex.: "me dá a pessoa com id 5");
// - all(pergunta): devolve TODAS as linhas que combinam (ex.: "todas as vagas abertas");
// - run(ordem): escreve ou apaga algo (ex.: "anota esta mensagem");
// - tx(tarefa): "tudo ou nada". Faz várias anotações juntas; se alguma der errado no meio,
//   desfaz todas (ROLLBACK), para o caderno nunca ficar com uma coisa pela metade.
//   Exemplo: aceitar proposta = criar contrato + criar etapas + mudar a vaga. Ou tudo, ou nada.
// Os "?" nas perguntas são espaços que o banco preenche com segurança, para ninguém
// conseguir enfiar comandos malandros dentro de um texto digitado.
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

module.exports = { db, one, all, run, tx, DB_PATH };
