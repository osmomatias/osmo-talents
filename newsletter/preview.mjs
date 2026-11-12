// Prévia local: busca as notícias de verdade e gera newsletter/preview.html.
//   node newsletter/preview.mjs           -> textos de exemplo (sem chamar a IA)
//   node newsletter/preview.mjs --claude  -> chama a API (precisa de ANTHROPIC_API_KEY)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { FONTES, LOGO } from "./build.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ctx = vm.createContext({ URL, Intl, Date, Math, JSON, String, Number, Object, Set, Map, Promise, Error, encodeURIComponent, isNaN, parseInt });
vm.runInContext(FONTES.config + FONTES.coletar + FONTES.claude + LOGO + FONTES.email + "\n;globalThis.api={CONFIG,TEMAS,coletar,montarPedido,lerResposta,renderNewsletter};", ctx);
const { CONFIG, TEMAS, coletar, montarPedido, lerResposta, renderNewsletter } = ctx.api;

const baixar = async url => {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OsmoNewsletter/1.0; +https://osmo.com.br)" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};

const coleta = await coletar(baixar, { temas: TEMAS, config: CONFIG });
console.log(`Lidas ${coleta.totalLidos} notícias; escolhidas ${coleta.itens.length}.`);
if (coleta.falhas.length) console.log("Fontes com falha:\n  " + coleta.falhas.join("\n  "));
for (const t of TEMAS) console.log(`  ${t.nome}: ${coleta.itens.filter(i => i.tema === t.id).map(i => i.fonte).join(", ") || "(nenhuma)"}`);

const pedido = montarPedido(coleta.itens, TEMAS, CONFIG);
fs.writeFileSync(path.join(aqui, "preview-pedido.json"), JSON.stringify(pedido, null, 2));

let textos;
if (process.argv.includes("--claude")) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2026-10-21", "anthropic-beta": "server-side-fallback-2026-07-01" },
    body: JSON.stringify(pedido),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`API ${r.status}: ${JSON.stringify(json)}`);
  textos = lerResposta(json);
} else {
  textos = {
    abertura: "Prévia com textos de exemplo. No envio real, o Claude escreve aqui uma abertura curta sobre os assuntos do dia.",
    itens: coleta.itens.map(i => ({ id: i.id, titulo: i.titulo, paragrafos: [i.trecho.slice(0, 400) || "(sem texto no RSS)", "Exemplo: no envio real, aqui entram 3 a 4 parágrafos traduzidos para o português."], por_que_importa: "Exemplo: aqui entra uma frase sobre o impacto para freelancers." })),
  };
}

const { html, assunto } = renderNewsletter({ config: CONFIG, temas: TEMAS, itens: coleta.itens, textos });
fs.writeFileSync(path.join(aqui, "preview.html"), html);
console.log("Assunto:", assunto);
console.log("Prévia salva em newsletter/preview.html");
