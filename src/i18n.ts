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
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./paths.js";
import type { I18nCore, CompiledDictionary, TranslationDictionary } from "../shared/i18n.js";
const core: I18nCore = require(path.join(PROJECT_ROOT, "public", "i18n-core.js"));

const DIR = path.join(PROJECT_ROOT, "public", "i18n");
const LANGS: string[] = core.LANGS.map(l => l[0]);
const cache: Record<string, { mtime: number; C: CompiledDictionary }> = {}; // idioma -> { mtime, C }
// VERSÃO 3.1 (MVP): outros idiomas escondidos, então os e-mails saem sempre em português,
// mesmo para quem tinha escolhido outro idioma antes. Volta junto com o ATIVO do public/i18n.js.
const ATIVO = false;
function dict(lang: string | null | undefined): CompiledDictionary | null {
  if (!ATIVO || !lang || lang === "pt-BR" || !LANGS.includes(lang)) return null;
  const file = path.join(DIR, lang + ".json");
  try {
    const m = fs.statSync(file).mtimeMs;
    if (!cache[lang] || cache[lang].mtime !== m) cache[lang] = { mtime: m, C: core.compile(JSON.parse(fs.readFileSync(file, "utf8")) as TranslationDictionary) };
    return cache[lang].C;
  } catch { return null; }
}
// idioma válido ou null ("en-GB" vira "en-US"; o que não conhecemos vira null)
const pick = (raw: unknown) => (raw ? core.pick([String(raw)]) : null);
const T = (lang: string | null | undefined, key: string, ...args: unknown[]) => core.format(dict(lang), key, args);
const tx = (lang: string | null | undefined, s: string) => { const C = dict(lang); if (!C) return s; const r = core.translateText(C, s); return r == null ? s : r; };

export { LANGS, pick, T, tx };
