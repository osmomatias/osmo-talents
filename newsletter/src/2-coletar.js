// ============================================================================
// COLETA: lê os RSS/Atom de todas as fontes e escolhe as notícias do dia
// ============================================================================
// Não usa bibliotecas: um leitor simples de XML que entende RSS 2.0 e Atom.
// `baixar(url)` é injetado: no n8n usa this.helpers.httpRequest; no teste local, fetch.

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

function decodificar(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

function textoLimpo(html, limite) {
  const t = decodificar(decodificar(html))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limite && t.length > limite ? t.slice(0, limite).replace(/\s\S*$/, "") + "…" : t;
}

function tag(bloco, nomes) {
  for (const n of nomes) {
    const m = bloco.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m && m[1].trim()) return m[1];
  }
  return "";
}

function linkDoItem(bloco) {
  const atom = [...bloco.matchAll(/<link\b([^>]*?)\/?>/gi)]
    .map(m => m[1])
    .filter(a => /href=/.test(a));
  const alt = atom.find(a => !/rel=/.test(a) || /rel=["']alternate["']/.test(a));
  if (alt) return decodificar(alt.match(/href=["']([^"']+)["']/)[1]);
  const rss = tag(bloco, ["link"]);
  if (rss) return decodificar(rss).trim();
  const guid = tag(bloco, ["guid", "id"]);
  return /^https?:/.test(decodificar(guid).trim()) ? decodificar(guid).trim() : "";
}

function lerFeed(xml, tamanhoTexto = 4000) {
  const blocos = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocos.map(b => {
    const data = new Date(decodificar(tag(b, ["pubDate", "published", "dc:date", "updated"])).trim());
    return {
      titulo: textoLimpo(tag(b, ["title"])),
      link: linkDoItem(b),
      data: isNaN(data) ? null : data.toISOString(),
      // Prefere o texto completo (content:encoded) ao resumo curto (description).
      trecho: textoLimpo(tag(b, ["content:encoded", "content", "description", "summary"]), tamanhoTexto),
    };
  }).filter(i => i.titulo && /^https?:\/\//.test(i.link));
}

// Normaliza o link para não repetir a mesma notícia (tira ?utm_..., #, barra final).
function chave(link) {
  try {
    const u = new URL(link);
    [...u.searchParams.keys()].filter(k => /^utm_|^ref$|^source$/i.test(k)).forEach(k => u.searchParams.delete(k));
    u.hash = "";
    return (u.host.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase();
  } catch { return link; }
}

async function coletar(baixar, { temas, config, jaEnviados = [], agora = new Date() }) {
  const enviados = new Set(jaEnviados);
  const vistos = new Set();
  const falhas = [];

  // Baixa tudo em paralelo; uma fonte fora do ar não derruba a newsletter.
  const porFonte = await Promise.all(temas.flatMap(tema => tema.fontes.map(async fonte => {
    try {
      const xml = await baixar(fonte.url);
      return lerFeed(String(xml), config.TAMANHO_TEXTO).map(i => ({ ...i, tema: tema.id, fonte: fonte.nome, idioma: fonte.idioma }));
    } catch (e) {
      falhas.push(`${fonte.nome}: ${e.message || e}`);
      return [];
    }
  })));

  const todos = porFonte.flat().filter(i => {
    const k = chave(i.link);
    if (enviados.has(k) || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  const idade = i => i.data ? (agora - new Date(i.data)) / 36e5 : Infinity;
  const escolhidos = [];

  for (const tema of temas) {
    const doTema = todos.filter(i => i.tema === tema.id && idade(i) >= -2);
    // Como entra só um artigo por área, prefere os que trazem texto suficiente
    // para uma tradução de verdade (e não só uma frase de chamada). Ordem:
    // completos recentes → completos de até 4 dias → recentes → até 4 dias.
    const recentes = doTema.filter(i => idade(i) <= config.JANELA_HORAS);
    const ate4dias = doTema.filter(i => idade(i) <= config.JANELA_MAXIMA_HORAS);
    const completo = i => i.trecho.length >= 800;
    const janela = [recentes.filter(completo), ate4dias.filter(completo), recentes, ate4dias]
      .find(lista => lista.length >= config.ITENS_POR_TEMA) || ate4dias;

    // Revezamento entre fontes (mais recente de cada uma primeiro) para não
    // encher a editoria com um único veículo.
    const filas = new Map();
    for (const i of janela.sort((a, b) => new Date(b.data) - new Date(a.data))) {
      if (!filas.has(i.fonte)) filas.set(i.fonte, []);
      filas.get(i.fonte).push(i);
    }
    const ordem = [...filas.values()].sort((a, b) => new Date(b[0].data) - new Date(a[0].data));
    const pegos = [];
    while (pegos.length < config.ITENS_POR_TEMA && ordem.some(f => f.length)) {
      for (const fila of ordem) if (fila.length && pegos.length < config.ITENS_POR_TEMA) pegos.push(fila.shift());
    }
    escolhidos.push(...pegos);
  }

  escolhidos.forEach((item, n) => { item.id = `n${n + 1}`; item.chave = chave(item.link); });
  return { itens: escolhidos, falhas, totalLidos: todos.length };
}
