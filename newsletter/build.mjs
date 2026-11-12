// Gera newsletter/radar-osmo.n8n.json a partir de newsletter/src/*.js.
// Uso: node newsletter/build.mjs   (depois importe o JSON no n8n)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ler = f => fs.readFileSync(path.join(aqui, "src", f), "utf8");

// Logo oficial: lido de src/mail.ts para não haver duas cópias do SVG.
const mail = fs.readFileSync(path.join(aqui, "..", "src", "mail.ts"), "utf8");
const svg = nome => mail.match(new RegExp(`export const ${nome} = (".*?");`))[1];
export const LOGO = `const OSMO_WORDMARK_PATH = ${svg("OSMO_WORDMARK_PATH")};\nconst OSMO_SYMBOL_PATH = ${svg("OSMO_SYMBOL_PATH")};\n`;
export const FONTES = { config: ler("1-config.js"), coletar: ler("2-coletar.js"), claude: ler("3-claude.js"), email: ler("4-email.js") };

const AVISO = "// GERADO por newsletter/build.mjs — edite newsletter/src/*.js e rode o build de novo.\n\n";

const codigoBuscar = AVISO + FONTES.config + "\n" + FONTES.coletar + "\n" + FONTES.claude + `
// ---------------------------------------------------------------------------
const memoria = $getWorkflowStaticData("global");
const baixar = url => this.helpers.httpRequest({
  method: "GET", url, timeout: 20000, json: false,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; OsmoNewsletter/1.0; +https://osmo.com.br)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
});
const resultado = await coletar(baixar, { temas: TEMAS, config: CONFIG, jaEnviados: memoria.enviados || [] });
if (!resultado.itens.length) throw new Error("Nenhuma notícia nova encontrada. Falhas: " + resultado.falhas.join(" | "));
return [{ json: { ...resultado, pedido: montarPedido(resultado.itens, TEMAS, CONFIG) } }];
`;

const codigoMontar = AVISO + FONTES.config + "\n" + FONTES.claude + "\n" + LOGO + FONTES.email + `
// ---------------------------------------------------------------------------
const coleta = $("Buscar notícias").first().json;
const textos = lerResposta($input.first().json);
const { html, texto, assunto } = renderNewsletter({ config: CONFIG, temas: TEMAS, itens: coleta.itens, textos });
return CONFIG.DESTINATARIOS.map(para => ({ json: { para, assunto, html, texto, remetente: CONFIG.REMETENTE, responderPara: CONFIG.RESPONDER_PARA } }));
`;

const codigoLembrar = AVISO + `// Guarda os links já enviados para não repetir notícia nos próximos dias.
// (A memória do n8n só é salva em execuções automáticas, não em testes manuais.)
const memoria = $getWorkflowStaticData("global");
const novos = $("Buscar notícias").first().json.itens.map(i => i.chave);
memoria.enviados = [...new Set([...(memoria.enviados || []), ...novos])].slice(-3000);
return [{ json: { enviados: $input.all().length, lembrados: memoria.enviados.length } }];
`;

const workflow = {
  name: "Radar Osmo · newsletter diária",
  nodes: [
    {
      id: "a1f0c0de-0001-4000-8000-000000000001", name: "Toda manhã às 7h", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0],
      parameters: { rule: { interval: [{ field: "cronExpression", expression: "0 7 * * *" }] } },
    },
    {
      id: "a1f0c0de-0002-4000-8000-000000000002", name: "Buscar notícias", type: "n8n-nodes-base.code", typeVersion: 2, position: [240, 0],
      parameters: { jsCode: codigoBuscar },
    },
    {
      id: "a1f0c0de-0003-4000-8000-000000000003", name: "Claude: traduzir e resumir", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [480, 0],
      retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
      parameters: {
        method: "POST", url: "https://api.anthropic.com/v1/messages",
        authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
        sendHeaders: true,
        headerParameters: { parameters: [
          { name: "anthropic-version", value: "2026-10-21" },
          { name: "anthropic-beta", value: "server-side-fallback-2026-07-01" },
        ] },
        sendBody: true, specifyBody: "json", jsonBody: "={{ JSON.stringify($json.pedido) }}",
        options: { timeout: 300000 },
      },
      credentials: { httpHeaderAuth: { id: "", name: "Anthropic API" } },
    },
    {
      id: "a1f0c0de-0004-4000-8000-000000000004", name: "Montar e-mail", type: "n8n-nodes-base.code", typeVersion: 2, position: [720, 0],
      parameters: { jsCode: codigoMontar },
    },
    {
      id: "a1f0c0de-0005-4000-8000-000000000005", name: "Enviar e-mail", type: "n8n-nodes-base.emailSend", typeVersion: 2.1, position: [960, 0],
      parameters: {
        fromEmail: "={{ $json.remetente }}", toEmail: "={{ $json.para }}", subject: "={{ $json.assunto }}",
        emailFormat: "both", text: "={{ $json.texto }}", html: "={{ $json.html }}",
        options: { appendAttribution: false, replyTo: "={{ $json.responderPara }}" },
      },
      credentials: { smtp: { id: "", name: "SMTP Osmo (Hostinger)" } },
    },
    {
      id: "a1f0c0de-0006-4000-8000-000000000006", name: "Lembrar enviados", type: "n8n-nodes-base.code", typeVersion: 2, position: [1200, 0],
      parameters: { jsCode: codigoLembrar },
    },
  ],
  connections: {
    "Toda manhã às 7h": { main: [[{ node: "Buscar notícias", type: "main", index: 0 }]] },
    "Buscar notícias": { main: [[{ node: "Claude: traduzir e resumir", type: "main", index: 0 }]] },
    "Claude: traduzir e resumir": { main: [[{ node: "Montar e-mail", type: "main", index: 0 }]] },
    "Montar e-mail": { main: [[{ node: "Enviar e-mail", type: "main", index: 0 }]] },
    "Enviar e-mail": { main: [[{ node: "Lembrar enviados", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1", timezone: "America/Sao_Paulo" },
  pinData: {},
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const destino = path.join(aqui, "radar-osmo.n8n.json");
  fs.writeFileSync(destino, JSON.stringify(workflow, null, 2) + "\n");
  console.log("Workflow gerado:", path.relative(process.cwd(), destino));
}
