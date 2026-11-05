// EXPLICANDO COMO PARA UMA CRIANÇA: é o "revisor" dos dicionários de idioma (public/i18n/*.js).
// Ele abre cada dicionário e avisa:
// - se uma tradução perdeu (ou inventou) um marcador {0}, {1}... (aí o nome ou o número some da tela);
// - quais frases existem num idioma e faltam em outro.
// Uso:  node scripts/conferir-traducoes.js
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DIR = path.join(__dirname, "..", "public", "i18n");
const marks = s => [...new Set(String(s).match(/\{\d+\}/g) || [])].sort().join(" ");
const dicts = {};
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith(".js"))) {
  let data = null;
  vm.runInNewContext(fs.readFileSync(path.join(DIR, f), "utf8"), { OSMO_LANG: { load: d => { data = d; } } });
  if (!data || !data.dict) { console.log(`✘ ${f}: o arquivo não chamou OSMO_LANG.load({ lang, dict })`); process.exitCode = 1; continue; }
  dicts[data.lang] = data.dict;
}
let problems = 0;
for (const [lang, dict] of Object.entries(dicts)) {
  for (const [pt, tr] of Object.entries(dict)) {
    if (marks(pt) !== marks(tr)) { problems++; console.log(`✘ ${lang}: marcadores diferentes\n    pt: ${pt}\n    ${lang}: ${tr}`); }
  }
}
const langs = Object.keys(dicts), all = new Set(langs.flatMap(l => Object.keys(dicts[l])));
for (const l of langs) {
  const missing = [...all].filter(k => !(k in dicts[l]) && langs.some(o => o !== l && dicts[o][k] !== k));
  console.log(`${l}: ${Object.keys(dicts[l]).length} frases${missing.length ? `, ${missing.length} que outros idiomas têm e este não (pode ser só um texto igual ao português):` : ""}`);
  missing.slice(0, 15).forEach(k => console.log("    · " + k));
}
if (problems) { console.log(`\n${problems} problema(s) de marcador.`); process.exitCode = 1; } else console.log("\n✔ Marcadores conferidos em todos os idiomas.");
