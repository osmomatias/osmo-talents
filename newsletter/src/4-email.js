// ============================================================================
// E-MAIL: template de e-mail marketing da Osmo (mesmo visual de src/mail.ts)
// ============================================================================
// Cabeçalho com fundo da marca (gradiente onde o cliente suporta), cartões
// #F7EAE2 e rodapé com o símbolo O. Logo e símbolo são PNGs servidos pelo site
// (public/email/), porque Gmail e Outlook não exibem SVG dentro do e-mail.

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function dataPorExtenso(agora) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(agora);
}

function renderNewsletter({ config, temas, itens, textos, agora = new Date() }) {
  const font = `'DIN Pro','Barlow','DIN Alternate','Helvetica Neue',system-ui,-apple-system,sans-serif`;
  const origin = config.SITE.replace(/\/+$/, "");
  const porId = Object.fromEntries((textos.itens || []).map(t => [t.id, t]));
  const data = dataPorExtenso(agora);
  const totalPalavras = (textos.itens || []).reduce((n, t) => n + `${t.titulo} ${t.paragrafos.join(" ")} ${t.por_que_importa}`.split(/\s+/).length, 0);
  const minutos = Math.max(1, Math.round(totalPalavras / 200));
  const descadastrar = `mailto:${config.RESPONDER_PARA}?subject=${encodeURIComponent("Sair da newsletter " + config.NOME)}`;
  const simbolo = (tam) => `<img src="${esc(origin)}/email/osmo-simbolo.png" width="${tam}" height="${tam}" alt="" style="vertical-align:middle;border:0">`;

  const secoes = temas.map(tema => {
    const doTema = itens.filter(i => i.tema === tema.id && porId[i.id]);
    if (!doTema.length) return "";
    const cartoes = doTema.map(i => {
      const t = porId[i.id];
      const traduzido = i.idioma !== "pt";
      const corpo = t.paragrafos.map(p => `<p style="margin:10px 0 0;font-size:15.5px;line-height:1.65;color:#1C0B12">${esc(p)}</p>`).join("");
      return `<tr><td style="padding:0 0 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#F7EAE2;border:1px solid #EBD8CE;border-radius:18px">
          <tr><td style="padding:16px 18px">
            <a href="${esc(i.link)}" style="font-size:17px;line-height:1.35;font-weight:700;color:#1C0B12;text-decoration:none">${esc(t.titulo)}</a>
            ${corpo}
            <p style="margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#FFFFFF;font-size:14.5px;line-height:1.5;color:#1C0B12"><strong style="color:#7A0B3C">Por que importa:</strong> ${esc(t.por_que_importa)}</p>
            <p style="margin:10px 0 0;font-size:13px;line-height:1.4;color:#6E5560">
              Fonte: <a href="${esc(i.link)}" style="color:#7A0B3C;font-weight:600;text-decoration:underline">${esc(i.fonte)}</a>${traduzido ? ` · <span style="color:#6E5560">original em ${esc(IDIOMAS[i.idioma] || i.idioma)}, traduzido pela Osmo</span>` : ""}
            </p>
          </td></tr>
        </table>
      </td></tr>`;
    }).join("");
    return `<tr><td style="padding:10px 0 8px">
        <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${tema.cor};color:#FFFFFF;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${esc(tema.nome)}</span>
      </td></tr>${cartoes}`;
  }).join("");

  const sumario = temas.filter(t => itens.some(i => i.tema === t.id && porId[i.id])).map(t => esc(t.nome)).join(" · ");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(config.NOME)} · ${esc(data)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&display=swap">
<style>.cabecalho{background-image:linear-gradient(135deg,#D85A16 0%,#A3303A 35%,#7A0B3C 75%,#610930 100%)}</style>
</head>
<body style="margin:0;padding:24px 12px;background-color:#FBF5F1;font-family:${font};color:#1C0B12;-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden">${esc(textos.abertura)}</div>
  <div style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #EBD8CE;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(160,60,20,0.08)">
    <!-- Cabeçalho: fundo sólido (bgcolor) que todo cliente mostra; o gradiente
         vem da classe .cabecalho no <head>, que o Gmail ignora sem quebrar nada.
         O logo é PNG hospedado porque Gmail e Outlook não exibem SVG. -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      <tr><td class="cabecalho" bgcolor="#7A0B3C" style="background-color:#7A0B3C;padding:26px 28px;border-bottom:3px solid #E8650F">
        <a href="${esc(origin)}" style="text-decoration:none;color:#FFFFFF">
          <img src="${esc(origin)}/email/osmo-wordmark-branco.png" width="76" height="24" alt="OSMO" style="display:inline-block;vertical-align:middle;border:0;outline:none;color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:0.1em">
          <span style="display:inline-block;height:16px;margin:0 10px;border-left:1px solid #B5567A;vertical-align:middle"></span>
          <span style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FFB6C1;vertical-align:middle">Talents</span>
        </a>
        <div style="margin-top:16px;font-size:11.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#FFC9A3">Newsletter · ${esc(data)}</div>
        <h1 style="margin:6px 0 0;font-size:24px;line-height:1.2;font-weight:700;color:#FFFFFF">${esc(config.NOME)}</h1>
        <p style="margin:6px 0 0;font-size:14px;line-height:1.4;color:#FFE6DA">${itens.length} artigos, um por área · leitura de ${minutos} min</p>
      </td></tr>
    </table>

    <div style="padding:26px 28px 10px;font-size:16.5px;line-height:1.6;color:#1C0B12">
      <p style="margin:0 0 14px;color:#1C0B12">${esc(textos.abertura)}</p>
      <p style="margin:0 0 18px;font-size:13.5px;line-height:1.5;color:#6E5560"><strong style="color:#1C0B12">Hoje:</strong> ${sumario}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${secoes}</table>
      <div style="margin:14px 0 20px;padding:12px 14px;border-radius:12px;background:#F8EBD3;color:#935E11;font-size:14px;line-height:1.5">
        Os textos são traduzidos e condensados com ajuda de IA a partir das fontes indicadas. Para a versão completa e os números exatos, abra o artigo original.
      </div>
    </div>

    <div style="padding:18px 28px;background-color:#F7EAE2;border-top:1px solid #EBD8CE;font-size:13px;line-height:1.5;color:#6E5560">
      <div style="margin-bottom:6px">${simbolo(18)} <strong style="color:#1C0B12;vertical-align:middle">Osmo Talents</strong> <span style="vertical-align:middle">· Trabalho freelance com regras claras</span></div>
      <p style="margin:4px 0;color:#6E5560">Você recebe o ${esc(config.NOME)} todas as manhãs porque se inscreveu na Osmo.</p>
      <p style="margin:6px 0 0">
        <a href="${esc(origin)}" style="color:#7A0B3C;text-decoration:none;font-weight:600">osmo.com.br</a>
        · <a href="${esc(descadastrar)}" style="color:#6E5560;text-decoration:underline">Não quero mais receber</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const texto = [
    `${config.NOME} · ${data}`, "", textos.abertura, "",
    ...temas.flatMap(tema => {
      const doTema = itens.filter(i => i.tema === tema.id && porId[i.id]);
      if (!doTema.length) return [];
      return [`== ${tema.nome.toUpperCase()} ==`, "", ...doTema.flatMap(i => {
        const t = porId[i.id];
        return [t.titulo, "", ...t.paragrafos.flatMap(p => [p, ""]), `Por que importa: ${t.por_que_importa}`, `Fonte: ${i.fonte} – ${i.link}`, ""];
      })];
    }),
    "Os textos são traduzidos e condensados com ajuda de IA a partir das fontes indicadas.",
    `Para sair da lista, responda este e-mail ou escreva para ${config.RESPONDER_PARA}.`,
  ].join("\n");

  const primeiro = porId[itens[0]?.id]?.titulo;
  const assunto = `${config.NOME} · ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(agora)}${primeiro ? ` · ${primeiro}` : ""}`;
  return { html, texto, assunto };
}
