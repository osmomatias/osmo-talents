// EXPLICANDO COMO PARA UMA CRIANÇA: o PM2 é um "babá de programas": liga o app e, se ele cair
// ou começar a usar memória demais (mais de 300 MB), religa sozinho.
// Hoje o servidor usa o systemd no lugar dele (veja o passo 4 do instalar.sh); este arquivo
// fica para quem preferir usar o PM2, como explica o LEIA-ME.
// Configuração do PM2: mantém o app rodando e reinicia se cair
module.exports = {
  apps: [{
    name: "osmo-talents",
    script: "server.js",
    node_args: "--disable-warning=ExperimentalWarning --env-file-if-exists=.env",
    instances: 1,
    autorestart: true,
    max_memory_restart: "300M",
    time: true,
  }],
};
