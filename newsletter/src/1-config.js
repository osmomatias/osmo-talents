// ============================================================================
// CONFIGURAÇÃO DA NEWSLETTER "RADAR OSMO"
// ============================================================================
// Este é o único arquivo que você precisa mexer no dia a dia:
//   - DESTINATARIOS: quem recebe o e-mail
//   - TEMAS: as editorias e as fontes (RSS) de cada uma
//   - ITENS_POR_TEMA: quantas notícias entram em cada editoria
// Depois de editar, rode `node newsletter/build.mjs` para gerar o workflow do n8n.
//
// Critério das fontes: agências de notícias, veículos com redação própria,
// órgãos oficiais e blogs técnicos das próprias empresas/instituições.
// Todas foram testadas em 12/11/2026 e estavam publicando.

const CONFIG = {
  NOME: "Radar Osmo",
  REMETENTE: "Radar Osmo <newsletter@osmo.com.br>",
  RESPONDER_PARA: "newsletter@osmo.com.br",
  SITE: "https://osmo.com.br",
  DESTINATARIOS: [
    "matias@osmo.com.br",
  ],
  ITENS_POR_TEMA: 1,       // um artigo por área
  TAMANHO_TEXTO: 4000,     // quanto do texto original o Claude recebe para traduzir
  JANELA_HORAS: 36,        // só notícias publicadas nas últimas 36 horas...
  JANELA_MAXIMA_HORAS: 96, // ...mas, se faltar notícia num tema, aceita até 4 dias
  MODELO: "claude-opus-5-5",
};

const TEMAS = [
  {
    id: "ia", nome: "IA e automação", cor: "#7A0B3C",
    fontes: [
      { nome: "MIT Technology Review", idioma: "en", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
      { nome: "BBC News", idioma: "en", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
      { nome: "The Verge", idioma: "en", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
      { nome: "Google AI", idioma: "en", url: "https://blog.google/technology/ai/rss/" },
      { nome: "Hugging Face", idioma: "en", url: "https://huggingface.co/blog/feed.xml" },
    ],
  },
  {
    id: "dev", nome: "Desenvolvimento e TI", cor: "#A3303A",
    fontes: [
      { nome: "Tecnoblog", idioma: "pt", url: "https://tecnoblog.net/feed/" },
      { nome: "Canaltech", idioma: "pt", url: "https://canaltech.com.br/rss/" },
      { nome: "InfoQ", idioma: "en", url: "https://feed.infoq.com/" },
      { nome: "GitHub Blog", idioma: "en", url: "https://github.blog/feed/" },
      { nome: "Stack Overflow Blog", idioma: "en", url: "https://stackoverflow.blog/feed/" },
      { nome: "Ars Technica", idioma: "en", url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
    ],
  },
  {
    id: "design", nome: "Design e criação", cor: "#D85A16",
    fontes: [
      { nome: "Nielsen Norman Group", idioma: "en", url: "https://www.nngroup.com/feed/rss/" },
      { nome: "Smashing Magazine", idioma: "en", url: "https://www.smashingmagazine.com/feed/" },
      { nome: "Creative Bloq", idioma: "en", url: "https://www.creativebloq.com/feeds/all" },
      { nome: "Figma Blog", idioma: "en", url: "https://www.figma.com/blog/feed/atom.xml" },
    ],
  },
  {
    id: "marketing", nome: "Marketing", cor: "#E8650F",
    fontes: [
      { nome: "Meio & Mensagem", idioma: "pt", url: "https://www.meioemensagem.com.br/feed" },
      { nome: "Marketing Dive", idioma: "en", url: "https://www.marketingdive.com/feeds/news/" },
      { nome: "HubSpot Blog", idioma: "en", url: "https://blog.hubspot.com/marketing/rss.xml" },
    ],
  },
  {
    id: "dados", nome: "Dados e análise", cor: "#610930",
    fontes: [
      { nome: "Our World in Data", idioma: "en", url: "https://ourworldindata.org/atom.xml" },
      { nome: "KDnuggets", idioma: "en", url: "https://www.kdnuggets.com/feed" },
      { nome: "FlowingData", idioma: "en", url: "https://flowingdata.com/feed" },
      { nome: "Towards Data Science", idioma: "en", url: "https://towardsdatascience.com/feed" },
    ],
  },
  {
    id: "escrita", nome: "Escrita e conteúdo", cor: "#935E11",
    fontes: [
      { nome: "Agência Lupa", idioma: "pt", url: "https://lupa.uol.com.br/feed" },
      { nome: "Nieman Lab (Harvard)", idioma: "en", url: "https://www.niemanlab.org/feed/" },
      { nome: "Poynter", idioma: "en", url: "https://www.poynter.org/feed/" },
      { nome: "Press Gazette", idioma: "en", url: "https://pressgazette.co.uk/feed/" },
    ],
  },
  {
    id: "engenharia", nome: "Engenharia e arquitetura", cor: "#5B3A29",
    fontes: [
      { nome: "ArchDaily Brasil", idioma: "pt", url: "https://www.archdaily.com.br/br/rss" },
      { nome: "CAU/BR", idioma: "pt", url: "https://www.caubr.gov.br/feed/" },
      { nome: "IEEE Spectrum", idioma: "en", url: "https://spectrum.ieee.org/feeds/feed.rss" },
      { nome: "Dezeen", idioma: "en", url: "https://www.dezeen.com/feed/" },
    ],
  },
];
