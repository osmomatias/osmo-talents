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
