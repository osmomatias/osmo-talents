// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o tradutor do lado do servidor. O site troca os textos da tela no navegador,
// mas os E-MAILS saem daqui, então o servidor também precisa saber traduzir.
// Ele usa os mesmos dicionários do site (public/i18n/*.json) e o mesmo jeito de
// procurar (public/i18n-core.js). Cada pessoa tem um idioma guardado no banco
// (users.lang), atualizado sozinho quando ela usa o site.
//   T(lang, "Olá, {1}.", "Ana")  -> "Hi, Ana." em inglês
//   tx(lang, "Etapa \"Logo\" aprovada.") -> traduz uma frase pronta (as mensagens do sistema)
const fs = require("node:fs");
const path = require("node:path");
const core = require("../public/i18n-core.js");

const DIR = path.join(__dirname, "..", "public", "i18n");
const LANGS = core.LANGS.map(l => l[0]);
const cache = {}; // idioma -> { mtime, C }
function dict(lang) {
  if (lang === "pt-BR" || !LANGS.includes(lang)) return null;
  const file = path.join(DIR, lang + ".json");
  try {
    const m = fs.statSync(file).mtimeMs;
    if (!cache[lang] || cache[lang].mtime !== m) cache[lang] = { mtime: m, C: core.compile(JSON.parse(fs.readFileSync(file, "utf8"))) };
    return cache[lang].C;
  } catch { return null; }
}
// idioma válido ou null ("en-GB" vira "en-US"; o que não conhecemos vira null)
const pick = raw => (raw ? core.pick([String(raw)]) : null);
const T = (lang, key, ...args) => core.format(dict(lang), key, args);
const tx = (lang, s) => { const C = dict(lang); if (!C) return s; const r = core.translateText(C, s); return r == null ? s : r; };

module.exports = { LANGS, pick, T, tx };
