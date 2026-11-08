# Correções implementadas — 8 de novembro de 2026

Publicadas em https://osmo.com.br no branch de trabalho osmo-talents-codex.

- Conteúdo público renderizado no servidor para início, listagens e detalhes de vagas/perfis.
- Links rastreáveis preservando navegação SPA e atalhos nativos de links.
- Paginação de 24 itens e filtros aplicados no banco antes do limite.
- Status 404 no documento para vagas/perfis ausentes; noindex para encerradas e utilitários.
- Canonical, metadados específicos, imagem social PNG e JSON-LD pertinente.
- Redirecionamentos de www/app e variantes index.html/barra final.
- Sitemap dinâmico, robots com referência ao sitemap e exclusão dos destinos operacionais.
- Escolha explícita de indexação de perfis, desativada por padrão. Exige especialidade e bio com pelo menos 40 caracteres. Desativar indexação não torna o perfil privado.
- Seis páginas públicas: Sobre, Como funciona, Pagamentos e taxas, Perguntas frequentes, Briefing claro e Acessibilidade.
- Comunicação de pagamentos diferenciando integração desativada, sandbox e produção; aviso contextual nos termos.
- Conteúdo de usuários escapado em HTML/JSON-LD; links de portfólio limitados a HTTP/HTTPS. Sem JobPosting indiscriminado ou FAQPage.

Validação: 17 testes passaram com banco temporário. Verificações HTTP em produção aprovaram 15 caminhos e 4 consolidações de URL. Conferência adicional confirmou canonical e indexação dos filtros padrão. Navegação SPA e página editorial conferidas no navegador. Backup do código anterior salvo na VPS em /root/osmo-backups.

Não foi concedido acesso a Search Console, Bing Webmaster, GA4 ou configurações/logs da Cloudflare. Medição de indexação, tráfego, citações em IA, Core Web Vitals e acesso de crawlers reais permanece dependente dessas fontes. A auditoria original registra o estado anterior às correções.
