# Migração TypeScript — roteador

`src/router.ts` substitui o módulo JavaScript. Preserva o registro em ordem, os métodos exatos, os parâmetros numéricos e as opções de autenticação, papel e tamanho do corpo bruto.

O módulo exporta contratos genéricos para contexto, retorno e papéis, além de `HttpMethod`, `RouteOptions`, `RegisteredRoute`, `MatchedRoute` e `Router`. Não depende dos tipos de SEO. O servidor JavaScript ainda não é verificado integralmente pelo compilador nesta etapa.

- `npm run build` compila SEO e roteador; `build:router` compila só o roteador.
- O servidor e os testes carregam `dist/router/router.js`.
- `npm run typecheck` verifica as fontes e os contratos de uso em `typecheck/router.ts`. Os casos deliberadamente inválidos devem continuar sendo rejeitados pelo compilador.
- `scripts/ensure-build.cjs` verifica os dois módulos, seus arquivos de configuração e os artefatos. Produção usa o JavaScript pronto, sem compilador ou gravação em diretórios protegidos.
- A publicação compila os dois módulos antes de empacotar. O instalador recompila fontes desatualizadas quando necessário.

Validação local: tipagem estrita com noUncheckedIndexedAccess, 19 testes aprovados e sintaxe dos scripts de instalação/publicação conferida. A suite inclui múltiplos parâmetros, primeira rota registrada, ausência de vazamento de estado entre matches, autenticação e integração do servidor.

Publicação concluída: os 19 testes também passaram no Node 22 da VPS, e a consulta pública de vagas da API respondeu com listagem e paginação corretas.
