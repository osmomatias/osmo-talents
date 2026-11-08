import { PROJECT_ROOT } from "./src/paths";
// PM2 alternative to the production systemd unit; points at the stable bootstrap.
export default {
  apps: [{
    name: "osmo-talents", cwd: PROJECT_ROOT, script: "server.js",
    node_args: "--disable-warning=ExperimentalWarning --env-file-if-exists=.env",
    instances: 1, autorestart: true, max_memory_restart: "300M", time: true,
  }],
};
