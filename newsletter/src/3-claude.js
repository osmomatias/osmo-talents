// ============================================================================
// TRADUÇÃO E LINGUAGEM ACESSÍVEL (Claude API)
// ============================================================================
// Monta UM pedido para a API da Anthropic com os artigos do dia (um por área).
// O Claude traduz para o português (quando o original está em outra língua) e
// devolve, em linguagem simples, título, texto em parágrafos e "por que importa". A resposta vem em JSON validado
// (structured outputs), então o n8n não precisa adivinhar o formato.

const INSTRUCOES = `Você escreve a newsletter diária da Osmo, uma plataforma brasileira de trabalho freelance pensada para pessoas neurodivergentes (TDAH, autismo, dislexia e outras). Quem lê são freelancers e contratantes de várias áreas.

Você recebe um artigo por área. Muitos estão em outras línguas (inglês, espanhol etc.). Para cada artigo, escreva em português do Brasil:
- "titulo": o título traduzido para o português, claro e direto, com até 90 caracteres. Traduza o sentido, não palavra por palavra.
- "paragrafos": a versão em português do artigo, em 3 a 4 parágrafos curtos (de 2 a 4 frases cada, cerca de 200 palavras no total). Traduza fielmente as informações principais do texto recebido, na ordem em que aparecem, e deixe de fora detalhes secundários. Se o texto recebido for curto, escreva menos parágrafos; não complete com suposições.
- "por_que_importa": 1 frase dizendo o que muda na prática para quem trabalha como freelancer ou contrata freelancers nessa área.

Regras de linguagem acessível:
- Frases curtas, uma ideia por frase. Ordem direta: quem fez o quê.
- Sem ironia, metáforas ou expressões de duplo sentido.
- Explique termos técnicos ou siglas na primeira vez em poucas palavras, entre parênteses.
- Nomes de produtos e empresas ficam como no original.
- Não use caixa alta para dar ênfase, nem emojis.
- Use somente as informações do título e do texto recebidos. Não invente números, datas, citações ou detalhes. Se o texto recebido for curto, escreva um texto curto.
- Não exagere a importância da notícia nem crie urgência.

Escreva também "abertura": 1 ou 2 frases de boas-vindas, calmas e objetivas, citando de forma geral os assuntos dos artigos. Sem saudação de horário ("bom dia") e sem pontos de exclamação.

Devolva um item para cada "id" recebido, com o mesmo "id".`;

const ESQUEMA = {
  type: "object",
  properties: {
    abertura: { type: "string" },
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          titulo: { type: "string" },
          paragrafos: { type: "array", items: { type: "string" } },
          por_que_importa: { type: "string" },
        },
        required: ["id", "titulo", "paragrafos", "por_que_importa"],
        additionalProperties: false,
      },
    },
  },
  required: ["abertura", "itens"],
  additionalProperties: false,
};

const IDIOMAS = { pt: "português", en: "inglês", es: "espanhol", fr: "francês", it: "italiano", de: "alemão" };

function montarPedido(itens, temas, config) {
  const nomeTema = Object.fromEntries(temas.map(t => [t.id, t.nome]));
  const entrada = itens.map(i => ({
    id: i.id,
    editoria: nomeTema[i.tema],
    fonte: i.fonte,
    idioma_original: IDIOMAS[i.idioma] || i.idioma,
    titulo: i.titulo,
    texto: i.trecho,
  }));
  return {
    model: config.MODELO,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
    fallbacks: "default",
    system: INSTRUCOES,
    messages: [{ role: "user", content: `Artigos de hoje:\n\n${JSON.stringify(entrada, null, 2)}` }],
  };
}

function lerResposta(resposta) {
  if (resposta.stop_reason === "refusal") throw new Error("Claude recusou o pedido: " + JSON.stringify(resposta.stop_details));
  if (resposta.stop_reason === "max_tokens") throw new Error("Resposta do Claude foi cortada (max_tokens).");
  const texto = (resposta.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  if (!texto) throw new Error("Resposta do Claude veio sem texto: " + JSON.stringify(resposta).slice(0, 500));
  return JSON.parse(texto);
}
