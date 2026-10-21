// Cria dados de demonstração. Uso: npm run seed
// Gera uma senha aleatória para as contas de exemplo e mostra no terminal.
const crypto = require("node:crypto");
const { one, run, tx } = require("../src/db");
const { hashPassword, clarity } = require("../server");

if (one("SELECT 1 FROM users WHERE email LIKE '%@exemplo.osmo'")) {
  console.log("Os dados de demonstração já existem. Nada foi alterado.");
  process.exit(0);
}
const password = crypto.randomBytes(6).toString("base64url");
const hash = hashPassword(password);

const FREELAS = [
  { name: "Lia Moreira", email: "lia@exemplo.osmo", title: "Designer de marca e embalagem", rate: 120, location: "Vitória, ES", hours: 20,
    skills: ["Branding", "Embalagem", "Tipografia"], tag: "Autista · prefere assíncrono",
    bio: "Crio marcas para negócios pequenos que querem parecer do tamanho que são. Trabalho melhor com briefing escrito e prazos combinados no início.",
    how: ["Texto primeiro. Chamadas só com pauta enviada antes.", "Respondo em até 1 dia útil, de seg. a qui.", "Prefiro comentários em lista numerada.", "Manhãs para criação, tardes para mensagens."],
    portfolio: ["Padaria Trigal", "Cerveja Moqueca", "Ateliê Ninho"] },
  { name: "Caio Ribeiro", email: "caio@exemplo.osmo", title: "Desenvolvedor front-end (Webflow, React)", rate: 140, location: "Belo Horizonte, MG", hours: 30,
    skills: ["Webflow", "React", "Acessibilidade web"], tag: "TDAH · entregas curtas",
    bio: "Transformo layout em site rápido e acessível. Entrego em partes pequenas e frequentes.",
    how: ["Chat ou chamada curta, sem problema.", "Respondo no mesmo dia em horário comercial.", "Gosto de ajustes agrupados por página.", "Entregas a cada 2 ou 3 dias."],
    portfolio: ["Escola Mar Aberto", "Clínica Sol", "Portfólio Duna"] },
  { name: "Bruna Akemi", email: "bruna@exemplo.osmo", title: "Revisora e redatora de linguagem simples", rate: 90, location: "Curitiba, PR", hours: 15,
    skills: ["Revisão", "Linguagem simples", "UX writing"], tag: "Dislexia · só texto",
    bio: "Deixo textos claros para quem lê com pressa ou com dificuldade. Revisora há 9 anos.",
    how: ["Somente texto.", "Até 2 dias úteis.", "Comentários direto no documento.", "Não faço trabalhos com prazo menor que 5 dias."],
    portfolio: ["Manual Prefeitura+", "App Banco Vila", "Guia do Paciente"] },
  { name: "Davi Nascimento", email: "davi@exemplo.osmo", title: "Analista de dados e planilhas", rate: 110, location: "Recife, PE", hours: 25,
    skills: ["Google Sheets", "Power BI", "Python"], tag: "Autista · rotinas claras",
    bio: "Organizo dados bagunçados e transformo em painéis que a equipe entende.",
    how: ["Uma chamada no início e depois texto.", "No mesmo dia.", "Prefiro uma lista de prioridades.", "Trabalho em blocos de 2 h."],
    portfolio: ["Painel Rede Farma", "Estoque Ateliê", "Relatório ONG Elo"] },
];
const CLIENTES = [
  { name: "Marina Couto", email: "marina@exemplo.osmo", company: "Grão Miúdo Café" },
  { name: "Rafael Lima", email: "rafael@exemplo.osmo", company: "Escola Raiz" },
  { name: "Tati Souza", email: "tati@exemplo.osmo", company: "Lumi Kids" },
];
const JOBS = [
  [0, "Identidade visual para cafeteria de bairro", "design", "Criar uma marca acolhedora para uma cafeteria pequena em Vitória que vai abrir em dezembro.",
    ["Logotipo principal e versão reduzida", "Paleta de 4 a 6 cores", "Aplicação em copo, sacola e cardápio", "Arquivos finais em SVG e PDF"],
    ["Não precisa de site", "Não precisa de fotografia"], "Mensagens escritas. Uma chamada de 20 min no início, opcional.",
    "Duas rodadas de ajustes, com comentários por escrito em até 2 dias úteis.", "Painel de referências enviado após a contratação.", "fixo", 4200, "3 semanas", ["Branding", "Logotipo", "Embalagem"], 1, 0],
  [1, "Landing page em Webflow para curso online", "dev", "Montar uma landing page a partir de um layout pronto no Figma.",
    ["Página única com 7 seções", "Formulário ligado ao e-mail da escola", "Versão celular revisada"], ["O texto e as imagens já estão prontos"],
    "Somente texto, pelo chat da plataforma.", "Uma revisão final com lista de ajustes.", "Arquivo Figma compartilhado após a contratação.", "fixo", 3500, "2 semanas", ["Webflow", "Layout responsivo"], 1, 1],
  [1, "Revisão de apostila do curso (60 páginas)", "texto", "Revisar ortografia, clareza e consistência de termos.",
    ["Arquivo revisado com controle de alterações", "Lista de termos padronizados"], ["Não é reescrita completa"],
    "E-mail ou chat, sem reuniões.", "Retorno em bloco no final.", "Guia de estilo da escola (3 páginas).", "fixo", 1800, "10 dias", ["Revisão", "Linguagem simples"], 1, 1],
  [2, "Ilustrações para app infantil de leitura", "design", "Criar 3 personagens originais e 12 cenas para histórias curtas.",
    ["3 personagens com folha de poses", "12 cenas em PNG 2048 px"], ["Não precisa de animação"],
    "Mensagens escritas e comentários direto nas imagens.", "Aprovação por etapa: esboço, cor, final.", "Exemplos de estilo enviados na conversa.", "fixo", 6800, "6 semanas", ["Ilustração", "Personagens"], 1, 1],
  [0, "Painel de vendas em Google Sheets", "dados", "Juntar três planilhas de vendas em um painel mensal.",
    ["Painel com 4 gráficos", "Aba de dados limpa"], [], "Chamada semanal de 30 min.", "", "Planilhas atuais.", "hora", 85, "cerca de 15 h", ["Google Sheets", "Fórmulas"], 0, 0],
];

tx(() => {
  const fIds = FREELAS.map(f => {
    const id = Number(run("INSERT INTO users (name,email,pass_hash,role) VALUES (?,?,?,'freela')", f.name, f.email, hash).lastInsertRowid);
    run(`INSERT INTO profiles (user_id,title,bio,location,rate,hours,skills,portfolio,ws_com,ws_resp,ws_fb,ws_foco,tag) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, f.title, f.bio, f.location, f.rate, f.hours, JSON.stringify(f.skills), JSON.stringify(f.portfolio), ...f.how, f.tag);
    return id;
  });
  const cIds = CLIENTES.map(c => {
    const id = Number(run("INSERT INTO users (name,email,pass_hash,role) VALUES (?,?,?,'cliente')", c.name, c.email, hash).lastInsertRowid);
    run("INSERT INTO profiles (user_id, company) VALUES (?,?)", id, c.company);
    return id;
  });
  const jIds = JOBS.map(([ci, title, cat, obj, ent, fora, com, fb, ref, bt, budget, duration, skills, as, fl]) => {
    const c = clarity({ title, cat, obj, ent, fora, com, fb, budget, duration });
    return Number(run(`INSERT INTO jobs (client_id,title,cat,obj,ent,fora,com,fb,ref,budget_type,budget,duration,skills,is_async,is_flex,clarity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      cIds[ci], title, cat, obj, JSON.stringify(ent), JSON.stringify(fora), com, fb, ref, bt, budget, duration, JSON.stringify(skills), as, fl, c).lastInsertRowid);
  });
  // um contrato em andamento: Lia x Grão Miúdo
  const ms = [{ title: "Pesquisa e conceito", value: 1200 }, { title: "Logotipo aprovado", value: 1500 }, { title: "Paleta e aplicações", value: 1000 }, { title: "Arquivos finais", value: 500 }];
  const pid = Number(run("INSERT INTO proposals (job_id,freela_id,text,value,days,milestones,status) VALUES (?,?,?,?,?,?,'aceita')", jIds[0], fIds[0],
    "Entendi que a cafeteria quer parecer acolhedora e de bairro. Divido em quatro etapas: pesquisa, logotipo, aplicações e arquivos finais.", 4200, 15, JSON.stringify(ms)).lastInsertRowid);
  const cid = Number(run("INSERT INTO contracts (job_id,proposal_id,client_id,freela_id,value) VALUES (?,?,?,?,4200)", jIds[0], pid, cIds[0], fIds[0]).lastInsertRowid);
  ["aprovada", "aprovada", "andamento", "pendente"].forEach((st, i) => run("INSERT INTO milestones (contract_id,pos,title,value,status) VALUES (?,?,?,?,?)", cid, i, ms[i].title, ms[i].value, st));
  run("UPDATE jobs SET status = 'em_andamento' WHERE id = ?", jIds[0]);
  const th = Number(run("INSERT INTO threads (job_id,client_id,freela_id,pin) VALUES (?,?,?,?)", jIds[0], cIds[0], fIds[0],
    "Opção 2 do logotipo aprovada. Próxima entrega: paleta e cardápio.").lastInsertRowid);
  [[cIds[0], "Oi! Vimos as três opções. Gostamos muito da 2."], [fIds[0], "Que bom! Quer algum ajuste antes de eu aplicar no cardápio?"],
   [cIds[0], "Só deixar o grão um pouco mais redondo. Fora isso, pode seguir."]].forEach(([s, b]) => run("INSERT INTO messages (thread_id,sender_id,body) VALUES (?,?,?)", th, s, b));
  // uma proposta aguardando: Caio na landing page
  run("INSERT INTO proposals (job_id,freela_id,text,value,days) VALUES (?,?,?,?,?)", jIds[1], fIds[1],
    "Monto a página no Webflow seguindo o Figma, com formulário funcionando e revisão no celular. Entrego em três partes para você acompanhar.", 3400, 9);
  const th2 = Number(run("INSERT INTO threads (job_id,client_id,freela_id) VALUES (?,?,?)", jIds[1], cIds[1], fIds[1]).lastInsertRowid);
  run("INSERT INTO messages (thread_id,sender_id,body) VALUES (?,NULL,?)", th2, "Caio Ribeiro enviou uma proposta de R$ 3.400 em 9 dias úteis.");
});

console.log("\nDados de demonstração criados.");
console.log("Contas (todas com a mesma senha):");
[...FREELAS, ...CLIENTES].forEach(u => console.log("  " + u.email));
console.log("Senha: " + password + "\nGuarde essa senha. Ela não é mostrada de novo.\n");
