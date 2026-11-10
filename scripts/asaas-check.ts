// Read-only sandbox preflight: never prints secrets or contacts Asaas.
const env = process.env;
const base = (env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");
const checks: [string, boolean][] = [
  ["Ambiente sandbox", base === "https://api-sandbox.asaas.com/v3"],
  ["ASAAS_API_KEY preenchida (autenticidade ainda não verificada)", !!env.ASAAS_API_KEY?.trim()],
  ["APP_SECRET com pelo menos 24 caracteres", (env.APP_SECRET || "").length >= 24],
  ["ASAAS_WEBHOOK_TOKEN com pelo menos 32 caracteres", (env.ASAAS_WEBHOOK_TOKEN || "").length >= 32],
  ["PUBLIC_URL HTTPS válida", (() => { try { const url = new URL(env.PUBLIC_URL || ""); return url.protocol === "https:" && !!url.hostname && !url.username && !url.password; } catch { return false; } })()],
  ["ASAAS_WEBHOOK_EMAIL preenchido", !!env.ASAAS_WEBHOOK_EMAIL?.trim()],
];
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "PENDENTE"}: ${name}`);
console.log("Verificação local: nenhuma chamada ao Asaas, cobrança ou cadastro de webhook foi realizado.");
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
