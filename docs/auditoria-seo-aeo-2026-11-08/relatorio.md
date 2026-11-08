# Auditoria SEO e AEO — Osmo Talents

Data: 8 de novembro de 2026. Domínio principal analisado: https://osmo.com.br. Branch local: `osmo-talents-codex`. Diagnóstico de leitura, sem implementação ou publicação de mudanças de SEO.

## 1. Conclusão executiva

A Osmo Talents tem diferenciais concretos — briefing estruturado, comunicação combinada, propostas guiadas e interface ajustável — mas a arquitetura pública funciona principalmente como aplicativo. O conteúdo que explica a plataforma, as vagas e os perfis não vem no HTML inicial; muitos caminhos de descoberta são botões sem `href`; não há sitemap disponível; e faltam metadados específicos, consolidação dos domínios e política de indexação.

O maior ganho provável está em tornar as informações públicas descobríveis, consistentes e legíveis por diferentes mecanismos, antes de ampliar a produção de conteúdo. Essa é uma conclusão técnica, não uma estimativa de tráfego ou promessa de posição.

Para AEO, há um problema adicional de precisão: a home diz que o valor fica protegido, mas o rodapé informa pagamentos simulados, e a configuração pública confirma `payments.enabled=false`. Corrigir essa divergência deve preceder a divulgação de respostas sobre pagamentos.

Não atribuí uma nota numérica de SEO/AEO: não seria uma medida válida sem metodologia comparável, dados de indexação e desempenho. Não há um ranking AEO universal que possa ser medido com uma consulta isolada.

## 2. Escopo, método e limites

Foram examinados:

- Código de roteamento/servidor, templates públicos, navegação, metadados, traduções, configuração nginx e analytics.
- Dezessete caminhos públicos via HTTP, incluindo início, listagens, vaga real, IDs inexistentes, rotas utilitárias, termos, privacidade, TV, robots e sitemap.
- Variantes HTTP/HTTPS, www/app, `/index.html` e barra final.
- HTML inicial, conteúdo renderizado da home no navegador e configuração pública do aplicativo.
- Respostas de HTTP com identificadores de Googlebot, bingbot e OAI-SearchBot, sem pretensão de simular a infraestrutura real desses serviços.
- Documentação primária atual de Google, OpenAI, Perplexity e Microsoft Bing.

Não houve acesso a Search Console, Bing Webmaster Tools, GA4, logs de bots/WAF, inventário de backlinks ou pesquisas de volume de palavras-chave. Portanto não é possível afirmar quantas páginas estão indexadas, posições, tráfego perdido, autoridade ou frequência real de citações em IA. Consultas públicas de marca/site não forneceram evidência suficiente para concluir ausência de indexação.

A API PageSpeed retornou HTTP 429 por quota. Não foi obtido um relatório Lighthouse válido nem medição de campo de LCP, INP e CLS. Tempos de resposta pontuais de requisições não equivalem a Core Web Vitals.

## 3. Evidências de produção

| URL/cenário | Resultado observado | Leitura técnica |
|---|---|---|
| `/`, `/vagas`, `/vagas/6`, `/talentos` | HTTP 200, mesmo shell de 8.872 bytes, título inicial `Osmo Talents`, sem H1 inicial, canonical ou JSON-LD | Conteúdo principal depende de JavaScript/API |
| `/vagas/999999`, `/talentos/999999` | HTTP 200 com o mesmo shell | Documento não comunica entidade inexistente; risco de soft 404 |
| `/pagina-inexistente-seo-check` | HTTP 404, página própria | Tratamento de caminho desconhecido está correto |
| `/sitemap.xml` | HTTP 404 | Não há sitemap disponível nesse endereço padrão nem referência no robots observado |
| `/robots.txt` | HTTP 200, apenas comentários de content signals | Não contém diretivas ativas `User-agent`, `Allow`, `Disallow` ou `Sitemap` |
| `/llms.txt` | HTTP 404 | Observação; não é um defeito prioritário de SEO/AEO |
| `/entrar`, `/painel`, `/admin` | HTTP 200 com shell genérico sem noindex | Falta política explícita de indexação para rotas utilitárias |
| `https://www.osmo.com.br/vagas/6` | HTTP 200, permanece no www | Não consolida com o domínio escolhido |
| `https://app.osmo.com.br/vagas/6` | HTTP 200, permanece no app | Conteúdo duplicado entre hosts |
| `http://osmo.com.br/vagas/6` | Destino final HTTPS | Consolidação de protocolo funciona na consulta |
| `/index.html`, `/vagas/` | HTTP 200 nas variantes | Padronização de URLs precisa ser definida |
| `/api/me`, visitante sem sessão | `payments.enabled=false`, taxa configurada 10%, liberação configurada 7 dias | Valores configurados não comprovam serviço de pagamento ativo |
| JS/CSS principais | Brotli; 90.077 e 26.178 bytes transferidos na consulta | Compressão em produção funciona; não recomendar gzip como se faltasse compressão |

Dados em [evidencias-http.csv](evidencias-http.csv). Cópia do robots em [robots-observado.txt](robots-observado.txt). A fotografia é do momento da coleta e poderá mudar com publicações futuras.

## 4. Achados técnicos por prioridade

As prioridades indicam ordem de trabalho para aquisição orgânica; não significam indisponibilidade operacional.

### A. Alta — conteúdo e descoberta dependem da interface

O documento inicial contém `Carregando…` no lugar do conteúdo principal. As funções em `public/app.js` consultam APIs e só então inserem home, listagens e detalhes. Navegação principal, cards de vagas, cards de talentos e categorias usam `button` e estado JavaScript.

O Google executa JavaScript; não é correto afirmar que o site é impossível de indexar por ser SPA. Ainda assim, a leitura depende de renderização e APIs, e leitores sem execução de JS recebem conteúdo insuficiente. Links em botões não são uma base confiável para descoberta de novas URLs. A trilha nova usa âncoras corretamente, mas liga principalmente aos ancestrais e não resolve a descoberta das vagas a partir da listagem.

**Correção:** renderizar HTML público no servidor para home, listagens e detalhes; preservar a navegação rápida do aplicativo depois do carregamento. Usar `<a href>` para navegar e `<button>` para executar ações. Não é necessário reescrever todo o produto ou migrar de framework para fazer isso.

**Aceite:** uma requisição sem JavaScript deve conter texto principal, título, H1, dados públicos pertinentes e links reais para entidades. A vaga 6 deve ter link rastreável a partir de `/vagas`. Comparar o conteúdo inicial e renderizado para manter equivalência, sem mostrar conteúdo diferente só para bots.

Evidências: [index.html](/Users/fredericomatias/Sites/osmo-talents/public/index.html:66), [servidor](/Users/fredericomatias/Sites/osmo-talents/server.js:2348), [cards](/Users/fredericomatias/Sites/osmo-talents/public/app.js:772). Fundamentos: [SEO JavaScript do Google](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) e [links rastreáveis](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).

### B. Alta — respostas HTTP não distinguem entidades inexistentes

A regex do documento aceita qualquer ID numérico e entrega o shell HTTP 200. A API pode retornar 404 depois, mas isso não corrige o status do documento já recebido.

**Correção:** consultar a existência da vaga/perfil na entrega da página e retornar 404 para entidade ausente. Para removidos, avaliar 404/410; para conteúdo encerrado que ainda é útil, manter página informativa, com status encerrado e política editorial explícita. Não redirecionar indiscriminadamente todas as páginas ausentes para a home.

**Aceite:** `/vagas/999999` e `/talentos/999999` retornam 404 no documento; páginas reais continuam 200. Vagas encerradas não aparecem como abertas nem conservam marcação de oportunidade ativa.

Evidência: [roteamento](/Users/fredericomatias/Sites/osmo-talents/server.js:2338).

### C. Alta — três hosts ativos e ausência de canonical

O mesmo conteúdo existe em osmo.com.br, www.osmo.com.br e app.osmo.com.br. Não foi encontrado canonical no HTML amostrado. Duplicidade não é, por si só, uma penalidade: o problema é deixar a escolha da URL representativa sem sinais coerentes.

**Correção:** adotar `https://osmo.com.br` como origem principal, se mantida a decisão atual do produto; redirecionar os aliases de páginas com 301/308 preservando caminho e parâmetros relevantes; usar canonical autorreferente em cada página pública. Tratar `/index.html`, barra final e parâmetros de campanha. Revisar callbacks de OAuth antes de mexer nos hosts.

**Aceite:** cada entidade tem uma única URL preferida; redirecionamentos, canonical, links internos e sitemap concordam. Não aplicar canonical da home a todas as vagas: cada vaga válida precisa de sua própria referência.

Fonte: [consolidação de URLs duplicadas](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

### D. Alta — metadados não acompanham o conteúdo

O HTML inicial da home, listagem e vaga usa o mesmo title/description/OG. `setPageTitle` atualiza apenas `document.title` após renderização; descriptions e metadados sociais continuam genéricos. O OG usa um favicon SVG relativo, uma escolha pouco robusta para previews sociais.

**Correção:** produzir title e description específicos, canonical, `og:title`, `og:description`, `og:url`, imagem social apropriada com URL absoluta e metadados de compartilhamento. Não usar frases comerciais ainda não válidas.

**Exemplos editoriais, a validar:**

| Página | Title proposto | Foco da descrição |
|---|---|---|
| Home | Trabalho freelance com briefing claro \| Osmo Talents | Público, proposta e funcionamento real |
| `/vagas` | Projetos freelance com briefing claro \| Osmo Talents | Oportunidades e comunicação combinada |
| Vaga | [Título revisado da vaga] \| Osmo Talents | Entrega, modalidade, prazo e orçamento coerentes |
| Talento | [Nome] — [especialidade] \| Osmo Talents | Habilidades e portfólio públicos, sem atributos clínicos |

Não inventar dados, truncar nomes de forma prejudicial ou usar a mesma descrição em todas as entidades. A meta description pode ajudar o snippet e a decisão de clique, mas não garante o texto exibido ou melhora automática de ranking.

Evidências: [head](/Users/fredericomatias/Sites/osmo-talents/public/index.html:16), [título no cliente](/Users/fredericomatias/Sites/osmo-talents/public/app.js:514).

### E. Alta — política de indexação e sitemap ausentes

Falta separar destinos úteis para busca de páginas operacionais. Login, recuperação, administração, painel e conversas não devem competir com conteúdo público. Isso não demonstra vazamento de dados: as APIs continuam exigindo autenticação conforme suas regras.

**Proposta:**

| Grupo | Política recomendada |
|---|---|
| Home e páginas institucionais úteis | Indexáveis e canônicas |
| Vagas válidas e úteis | Indexáveis; status e disponibilidade atualizados |
| Perfis completos, voluntariamente públicos | Avaliar indexação e permitir controle claro ao titular |
| Login, reset, painel, admin, mensagens e fluxos de proposta | Noindex quando públicos como interface; autenticação nos dados privados |
| Perfis vazios, filtros internos e resultados sem valor próprio | Evitar indexação em massa; política por tipo de página |
| TV/Top 10 | Decidir se é produto público separado; se utilitário pessoal, mantê-lo fora do índice |

Usar `noindex` no HTML ou cabeçalho apropriado e permitir que o crawler leia esse sinal quando necessário. Robots não substitui autenticação nem é ferramenta confiável para remover algo já indexado. [Orientação do Google sobre robots](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

**Sitemap:** incluir somente URLs canônicas, públicas e elegíveis; gerar a partir de dados reais; usar `lastmod` de mudanças relevantes; excluir utilitários e entidades inexistentes. Declarar a localização no robots e enviar às ferramentas dos buscadores. Sua ausência não impede indexação, mas é especialmente relevante quando os links internos atuais são fracos.

### F. Média — dados estruturados ainda não implementados

Não há JSON-LD nos templates ou documentos amostrados. Implantar conforme o conteúdo real: `Organization` para a entidade responsável, `WebSite` para o site, `BreadcrumbList` nas trilhas e `ProfilePage`/`Person` quando pertinentes a perfis realmente públicos. Verificar suporte atual e validar cada tipo no contexto apropriado.

`JobPosting` merece análise caso a caso: algumas oportunidades podem representar posição de trabalho contratada; outras são pedidos de execução de um serviço pontual. Não aplicar a todas apenas porque a interface chama de vaga. Quando elegível, preencher dados verdadeiros de contratante, descrição, publicação, localização/modalidade, elegibilidade geográfica e expiração conforme os requisitos. Orçamento de projeto não deve virar salário anual fictício. [Documentação de JobPosting](https://developers.google.com/search/docs/appearance/structured-data/job-posting).

Marcação deve representar o conteúdo visível e não garante rich results. [Políticas de dados estruturados](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

### G. Média — semântica, qualidade editorial e escala

As listagens usam H2 no título principal. Os detalhes de vagas têm H1, mas seções importantes do briefing são spans. Usar headings descritivos; incluir datas absolutas em `<time>` além da data relativa; explicitar valor por hora versus projeto e significado do prazo. A falta isolada de H1 não constitui uma penalidade automática.

Na vaga 6, há erros de digitação no título/texto e um indicador de 89% claro que precisa de contexto. A nota mede completude segundo regras do produto, não correção linguística, confiabilidade do contratante ou garantia de resultado. Uma página de metodologia e revisão editorial ajudam a evitar interpretações indevidas.

Os filtros vivem no estado do aplicativo, sem destinos públicos próprios. Criar poucas categorias úteis conforme oferta e demanda; não multiplicar URLs vazias para todas as combinações de filtro.

A API limita a listagem aos últimos 300 jobs e 200 talentos antes de aplicar parte dos filtros. É um risco futuro de descoberta de conteúdo e qualidade da busca, não evidência de perda atual de milhares de páginas. Implementar paginação com URLs reais e filtros no banco ao crescer. [Código](/Users/fredericomatias/Sites/osmo-talents/server.js:668).

Os idiomas da interface estão desativados. A falta de hreflang não é bloqueador atual. Se houver expansão, construir URLs próprias por idioma e versões equivalentes revisadas.

## 5. AEO: acesso, precisão e mérito para citação

AEO é tratado aqui como preparação para respostas de sistemas de busca e assistentes: conseguir acessar o site, entender suas informações e encontrar motivos para citá-lo. Não há garantia de citação por qualquer ajuste. O Google informa que não exige markup especial para recursos de IA nem usa llms.txt para melhorar ranking. [Guia de otimização para IA do Google](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

### Acesso e bots

O robots de produção contém comentários, sem regras ativas ou declaração de sitemap. Não há evidência, nessa amostra, de bloqueio de indexação pelo próprio arquivo. O conteúdo parece inserido na borda Cloudflare, pois não está no código local. Comentários explicativos não equivalem a proibir ou autorizar finalidades específicas.

As consultas com identificadores de Googlebot, bingbot e OAI-SearchBot retornaram 200, mas foram feitas da máquina do auditor. Isso não prova acesso a partir das faixas IP dos crawlers reais; validar em logs/WAF e ferramentas dos mecanismos. A ferramenta de leitura web utilizada na auditoria não conseguiu abrir o domínio, embora navegador e HTTP direto conseguissem: é uma limitação observada da ferramenta, sem causa comprovada e insuficiente para concluir bloqueio generalizado.

Se o objetivo é descoberta em IA, escolher explicitamente a política de acesso a conteúdo público. Busca e treinamento são decisões separadas:

| Finalidade | Exemplos | Observação |
|---|---|---|
| Busca ChatGPT | OAI-SearchBot | Separado do GPTBot de treinamento |
| Busca Perplexity | PerplexityBot | Distinto de visitas iniciadas por usuário |
| Solicitação de usuário | ChatGPT-User / Perplexity-User | Não equivale à inclusão no índice de busca |

Fontes: [OpenAI — bots](https://developers.openai.com/api/docs/bots), [Perplexity — crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers). A parte OpenAI foi verificada com a skill OpenAI Docs. Não liberar acesso a dados privados nem confiar somente no nome User-Agent para autorizar bots no WAF.

### Precisão: resolver contradições antes de amplificar

Confirmado no código e na home renderizada: “O valor fica protegido e é liberado a cada etapa aprovada”. Confirmado no rodapé: “Pagamentos ainda simulados durante o período de testes”. Confirmado na configuração pública: integração de pagamentos desativada.

**Ação recomendada:** texto único e coerente em home, termos, cadastro, ajuda e metadados. Explicar o estágio atual do serviço. A taxa de 10% e os 7 dias de liberação configurados não devem ser apresentados como disponibilidade operacional sem contexto. Isso não é uma conclusão sobre irregularidade financeira; é uma inconsistência verificável de comunicação.

Também faltam explicações públicas completas sobre quem mantém a Osmo, critérios de acesso, selo, revisão, suporte e resolução de dúvidas. Termos têm contato: não se trata de ausência absoluta de contato, mas de pouca visibilidade e contextualização institucional.

### Mérito para citação: páginas propostas

| Página sugerida | Pergunta principal | Conteúdo próprio que a torna útil |
|---|---|---|
| `/sobre` | O que é a Osmo Talents e quem a mantém? | Identidade real, responsáveis, propósito, abrangência e canais oficiais |
| `/como-funciona` | Como trabalhar e como contratar? | Dois percursos completos com exemplos e limites atuais |
| `/pagamentos-e-taxas` | Quanto custa e como funciona o pagamento? | Estado real, condições, taxas, prazos e suporte |
| `/perguntas-frequentes` | Preciso de laudo? Posso contratar? Há reuniões? | Respostas verificadas com o responsável, sem presumir regras |
| `/briefing-claro` | O que significa a nota de clareza? | Metodologia do produto, exemplo e limites da nota |
| `/acessibilidade` | Como ajustar a experiência e obter ajuda? | Recursos implementados, limitações conhecidas e canal de feedback |
| Duas categorias-piloto | Como encontrar/contratar especialidade X? | Oferta real, habilidades, exemplos e links para entidades úteis |
| Caso real autorizado | Como a comunicação combinada funcionou num projeto? | Contexto, combinado, entregas e resultado verificável |

Começar com resposta objetiva no primeiro parágrafo; depois condições, exemplos, passos e links relacionados. Identificar responsável e revisão quando útil. Criar conteúdo sobre o produto e experiências próprias antes de competir com artigos genéricos de saúde.

**Exemplo de definição proposta, a aprovar editorialmente:** “A Osmo Talents é uma plataforma de projetos freelance pensada para pessoas neurodivergentes. Ela organiza o briefing e as preferências de comunicação para facilitar o acordo entre quem contrata e quem realiza o trabalho.” A frase não afirma exclusividade, exigência de diagnóstico ou pagamento protegido; essas condições precisam de explicação própria validada.

FAQ é útil para pessoas e para clareza das respostas. Contudo, não prometer o antigo resultado enriquecido de FAQ: a documentação atual registra sua retirada do Google em maio de 2026. [Atualizações oficiais](https://developers.google.com/search/updates).

## 6. Confiança, perfis e conteúdo de usuários

A marca precisa de identidade consistente entre página Sobre, termos, contatos, perfis oficiais e dados estruturados. O rodapé “uma iniciativa Osmo” aponta para o próprio domínio, sem oferecer contexto adicional. Não inventar entidade jurídica, parceiros, especialistas, avaliações ou números de usuários para preencher essa lacuna.

A plataforma lida com identificação neurodivergente opcional e selo relacionado a documentação. Indexação de perfis e detalhes pessoais deve ter controle claro e refletir a intenção da pessoa. Não transformar atributos de saúde em dados estruturados de marketing; focar competência, serviços e portfólio voluntariamente públicos. Essa é uma recomendação de produto e privacidade, não parecer jurídico.

Definir qualidade mínima para perfis indexáveis, revisão de oportunidades suspeitas, remoção de spam e links UGC. Os links de portfólio já usam `nofollow ugc`, um ponto positivo. Casos e depoimentos devem ser reais e autorizados.

## 7. Desempenho e experiência

**O que foi medido:** Brotli ativo; JS principal com 90.077 bytes e CSS com 26.178 bytes transferidos. O HTML analisado sem compressão tem 8.872 bytes. Esses valores são uma amostra e não incluem todo o carregamento.

**Riscos no código:** JS principal concentra páginas públicas e administração; scripts no head participam do caminho crítico; a inicialização espera sessão/taxonomia/tradução antes de montar a tela, que pode fazer novas consultas. O layout e os conteúdos com placeholders devem ser avaliados em rede lenta e celular real. O código grande isoladamente não demonstra experiência ruim.

**Validação futura:** obter PageSpeed/CrUX ou Search Console para mobile e desktop; medir percentil 75, separar laboratório de campo; investigar LCP, INP e CLS antes de propor micro-otimizações. Referências de boa experiência: LCP até 2,5 s, INP até 200 ms e CLS até 0,1. [Core Web Vitals do Google](https://developers.google.com/search/docs/appearance/core-web-vitals).

Manter a navegação e ação fixa sem esconder conteúdo e foco; preservar ajustes de fonte/movimento. AEO não justifica sacrificar a clareza da experiência existente.

## 8. Plano de execução e critérios de saída

As fases são ordem sugerida, não prazo contratado.

| Fase | Entregas | Validação |
|---|---|---|
| 1 — precisão e descoberta | Corrigir comunicação de pagamentos; links com href; HTML público no servidor | Sem JS há conteúdo e links úteis; texto corresponde ao serviço real |
| 2 — URLs e indexação | Status de entidade, canonicals, redirecionamentos, noindex por tipo, sitemap/robots | Matriz HTTP passa; não há canonical global para home; privados continuam privados |
| 3 — apresentação e entidades | Metadados próprios, imagem social, semântica, schemas pertinentes | HTML fonte por URL correto; marcação corresponde ao visível; previews conferidos |
| 4 — conteúdo AEO | Sobre, funcionamento, taxas, perguntas reais, clareza e acessibilidade | Responsáveis validam fatos; páginas se conectam por links; sem contradições |
| 5 — medição e expansão | GSC/Bing, eventos do funil, CWV, categorias e casos reais | Dados de base disponíveis; acompanhamento por URL/intenção e conversão |

Não recomendar troca total de tecnologia, milhares de páginas automáticas, compra de backlinks, schema indiscriminado ou llms.txt como prioridade. São ações que não resolvem os problemas comprovados acima.

## 9. Como medir SEO e AEO depois

- Search Console: indexação, motivo de exclusão, canonical selecionada, sitemap, consultas/páginas, marca versus não marca, país/dispositivo e CWV. Usar inspeção para home, listagem, vaga válida, vaga inexistente e perfil optante.
- Bing Webmaster: indexação, rastreamento e, se disponível à propriedade, AI Performance. O recurso mostra citações e páginas referenciadas em experiências suportadas; não é nota de autoridade ou ranking. [Documentação/anúncio oficial Bing](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/).
- GA4: validar pageviews SPA já implementados e adicionar eventos úteis sem dados pessoais: início/conclusão de cadastro, perfil completo, envio de proposta e publicação de vaga válida. Não foi verificado se esses eventos já existem na propriedade configurada.
- Logs/WAF: confirmar visitas de crawlers reais, respostas, desafios e erros de API/renderização. Identificar bots por critérios oficiais, não só UA.
- AEO qualitativo: registrar um conjunto fixo de perguntas, mecanismo, data, idioma, localização, resposta, citação e precisão. Ex.: “O que é Osmo Talents?”, “Como funcionam as propostas?”, “Os pagamentos já funcionam?”, “Preciso de laudo?”. Não gerar consultas automatizadas em massa nem confundir variação de resposta com posição estável.
- Negócio: acompanhar cadastro e propostas qualificadas por origem. Melhorar cliques sem gerar contratações úteis não basta para o marketplace.

## 10. O que já está bom

URLs legíveis; HTTPS; Brotli; 404 real para caminhos completamente desconhecidos; `lang=pt-BR`; viewport adequado; títulos de detalhes atualizados no navegador; briefing com entregas e comunicação; breadcrumb acessível com links; termos e privacidade em HTML completo; diferenciação de produto concreta; ajustes de conforto e links UGC identificados.

Preservar esses pontos enquanto se constrói uma camada pública mais acessível aos mecanismos e mais clara para quem chega pela primeira vez.
