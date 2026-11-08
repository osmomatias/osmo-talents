declare const module: { exports: OsmoI18nCore };
// ============================================================================
// EXPLICANDO COMO PARA UMA CRIANÇA: o que é este arquivo?
// ============================================================================
// É o "dicionário que sabe procurar". O site foi escrito em português; os arquivos
// public/i18n/en-US.json, es-419.json e fr-CA.json dizem como cada frase fica em
// inglês, espanhol e francês. A chave é sempre a frase em português.
// Este arquivo é usado em dois lugares:
//   - no navegador (pelo i18n.js), para trocar os textos da tela;
//   - no servidor (pelo src/i18n.js), para escrever os e-mails no idioma de cada pessoa.
// Como ele procura uma frase:
//   1. a frase exata ("Publicar vaga");
//   2. um MOLDE com lacunas: no dicionário, "há {#1} min" casa com "há 5 min"
//      ({#1} = um número; {1} = qualquer coisa, como um nome ou o título de uma vaga);
//   3. se não achou, quebra em pedaços e tenta cada um: separa por " · ", por frases,
//      e tira número da frente ("3 propostas" = "3" + "propostas").
// Frase que não está no dicionário fica como está (em português). Nada quebra.
(function (root: typeof globalThis, factory: () => OsmoI18nCore) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root as unknown as { OsmoI18nCore: OsmoI18nCore }).OsmoI18nCore = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";
  const norm = (s: unknown) => String(s).replace(/\s+/g, " ").trim();
  const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const LETTER = /[A-Za-zÀ-ÿ]/;
  // pontuação que pode "grudar" nas pontas de um pedaço de texto (". Ela aparece...", "Filtros:")
  const EDGE = "\\s·.,:;!?…()\\[\\]\"“”'«»—–\\-+↓←→›•|/";
  const EDGE_RE = new RegExp(`^([${EDGE}]*)(.*?)([${EDGE}]*)$`, "s");
  const NUM_PREFIX = /^((?:R\$\s?)?[\d.,]+\s?%?)\s+(\S.*)$/s;
  const COUNT_SUFFIX = /^(.*\S)\s*\((\d+)\)$/s;
  const SENTENCE = /(?<=[.!?…])\s+(?=["“«]?[A-ZÀ-Ý0-9])/;

  // prepara o dicionário: separa frases exatas e moldes com lacunas
  function compile(dict: OsmoTranslationDictionary | null | undefined): OsmoCompiledDictionary {
    const exact = new Map<string, string>(), pats: import("../shared/i18n").TranslationPattern[] = [], keys = new Map<string, string>();
    for (const [k0, v] of Object.entries(dict || {})) {
      const k = norm(k0);
      keys.set(k, v);
      if (!/\{#?\d\}/.test(k)) { exact.set(k, v); continue; }
      const order: string[] = [];
      const src = k.split(/(\{#?\d\})/).map(p => {
        const m = p.match(/^\{(#?)(\d)\}$/);
        if (!m) return escRe(p);
        order.push(m[2]);
        // {1} não atravessa frases ("Falta: foto. Perfis completos..." -> {1} = "foto")
        return m[1] ? "((?:R\\$\\s?)?[\\d.,]+)" : "((?:(?![.!?] [A-ZÀ-Ý\"“]).)+?)";
      }).join("");
      pats.push({ re: new RegExp("^" + src + "$", "s"), v, order, fixed: k.replace(/\{#?\d\}/g, "").length });
    }
    pats.sort((a, b) => b.fixed - a.fixed); // moldes mais específicos primeiro
    return { exact, pats, keys };
  }

  function fill(v: string, vals: Record<string, string>): string { return v.replace(/\{(\d)\}/g, (m: string, d: string) => d in vals ? vals[d] : m); }

  // procura uma frase inteira (exata ou por molde)
  function whole(C: OsmoCompiledDictionary, s: string, depth: number): string | null {
    if (C.exact.has(s)) return C.exact.get(s)!;
    for (const p of C.pats) {
      const m = s.match(p.re);
      if (!m) continue;
      const vals: Record<string, string> = {};
      p.order.forEach((d, i) => { const cap = m[i + 1]; vals[d] = depth < 3 ? (tr(C, cap, depth + 1) ?? cap) : cap; });
      return fill(p.v, vals);
    }
    return null;
  }

  // traduz um pedaço de texto; devolve null se não souber
  function tr(C: OsmoCompiledDictionary, s0: string, depth = 0): string | null {
    const s = norm(s0);
    if (!s || !LETTER.test(s)) return null;
    // Textos editoriais longos podem ter tradução exata; limita apenas as buscas por moldes.
    if (C.exact.has(s)) return C.exact.get(s)!;
    if (s.length > 600) return null;
    let r = whole(C, s, depth);
    if (r != null) return r;
    // pontuação nas pontas: tenta sem ela (de um lado, do outro e dos dois)
    const [, pre, core, post] = s.match(EDGE_RE)!;
    if ((pre || post) && core) {
      if (pre && (r = whole(C, s.slice(pre.length), depth)) != null) return pre + r;
      if (post && (r = whole(C, s.slice(0, s.length - post.length), depth)) != null) return r + post;
      if ((r = whole(C, core, depth)) != null) return pre + r + post;
    }
    if (depth > 4) return null;
    // "Vagas abertas · Osmo Talents" -> cada parte
    if (s.includes(" · ")) {
      const parts = s.split(" · "), outp = parts.map(p => tr(C, p, depth + 1));
      if (outp.some(x => x != null)) return parts.map((p, i) => outp[i] ?? p).join(" · ");
    }
    // várias frases: junta o maior trecho que existir no dicionário
    const sents = s.split(SENTENCE);
    if (sents.length > 1) {
      const res = []; let any = false;
      for (let i = 0; i < sents.length;) {
        let done = false;
        for (let j = sents.length; j > i; j--) {
          const chunk = sents.slice(i, j).join(" ");
          const t = j - i === sents.length ? null : tr(C, chunk, depth + 1);
          if (t != null) { res.push(t); i = j; any = done = true; break; }
        }
        if (!done) { res.push(sents[i]); i++; }
      }
      if (any) return res.join(" ");
    }
    // "3 propostas", "R$ 500 ainda a pagar", "84% claro"
    let m = s.match(NUM_PREFIX);
    if (m && (r = tr(C, m[2], depth + 1)) != null) return m[1] + " " + r;
    // "Propostas (3)"
    m = s.match(COUNT_SUFFIX);
    if (m && (r = tr(C, m[1], depth + 1)) != null) return r + " (" + m[2] + ")";
    // lista "Foto, Sobre você"
    if (s.includes(", ") && depth > 0) {
      const parts = s.split(", "), outp = parts.map(p => whole(C, p, depth + 1));
      if (outp.every(x => x != null)) return outp.join(", ");
    }
    return null;
  }

  // mantém os espaços das pontas do texto original (importam entre <b> e o resto da frase)
  function translateText(C: OsmoCompiledDictionary, s: string): string | null {
    const r = tr(C, s);
    if (r == null) return null;
    const lead = s.match(/^\s*/)![0], trail = s.match(/\s*$/)![0];
    return lead + r + trail;
  }

  // para o código: T("Olá, {1}!", nome)
  function format(C: OsmoCompiledDictionary | null, key: string, args: readonly unknown[]): string {
    const k = norm(key);
    const v = (C && C.keys.get(k)) ?? k;
    return v.replace(/\{#?(\d)\}/g, (m: string, d: string) => args[Number(d) - 1] !== undefined ? String(args[Number(d) - 1]) : m);
  }

  const LANGS: import("../shared/i18n").LanguageEntry[] = [
    ["pt-BR", "Português (Brasil)"],
    ["en-US", "English (US)"],
  ];
  // Somente português e inglês estão ativos. Variações como en-GB usam en-US.
  function pick(list: readonly string[] | null | undefined): OsmoLanguageCode | null {
    for (const raw of list || []) {
      const l = String(raw || "").toLowerCase();
      if (!l) continue;
      const hit = LANGS.find(([c]) => c.toLowerCase() === l);
      if (hit) return hit[0];
      const base = l.split("-")[0];
      const fam = LANGS.find(([c]) => c.split("-")[0] === base);
      if (fam) return fam[0];
    }
    return null;
  }

  return { compile, tr, translateText, format, norm, LANGS, pick };
});
