# Primeira etapa TypeScript: módulo SEO

Escopo: `src/seo.ts`, `src/seo-content.ts` e `src/seo-document.ts`, com contratos em `src/seo-types.ts`. O restante do aplicativo permanece JavaScript nesta etapa.

## Desenvolvimento

```sh
npm ci
npm run typecheck
npm test
npm start
```

A compilação estrita usa `tsconfig.seo.json`, sem `any`, `@ts-ignore` ou `@ts-nocheck` nas fontes migradas. Os tipos abrangem os dados públicos consumidos pelo SEO, contratos de consulta, paginação, configuração de pagamentos, páginas, breadcrumbs e JSON-LD. As dependências JavaScript são recebidas por um contrato explícito; o restante do servidor ainda não é verificado pelo TypeScript.

`npm run build:seo` gera CommonJS em `dist/seo`. O servidor carrega esses arquivos compilados, sem depender do suporte experimental a TypeScript do Node. `dist/` é derivado e não entra no Git; a publicação compila antes de empacotar. Não mantenha cópias `.js` manuais em `src`.

`npm test` sempre compila. `npm start`, `npm run dev` e `npm run seed` verificam a existência e a atualização dos artefatos; compilam apenas se necessário. Assim, a produção pode iniciar ou executar o seed com artefatos prontos, sem compilador instalado nem permissão para regravar `dist`. Ao editar TypeScript continuamente, execute também `npm run build:seo -- --watch` em outro terminal; o Node em modo watch observa os arquivos compilados. Quem executa `node server.js` diretamente deve compilar antes.

## Publicação

`bash publicar.sh` compila localmente e envia `dist/seo` junto com o projeto. A VPS executa o JavaScript gerado com o Node existente. Uma instalação a partir das fontes compila se não houver artefato ou se as fontes/configuração forem mais recentes. O arquivo `package-lock.json` fixa as dependências de desenvolvimento.

Validação desta etapa: verificação estática estrita e 18 testes de integração/regressão, usando bancos temporários. O objetivo é preservar o comportamento público existente, sem redesign, alteração de banco ou migração do restante do backend/frontend.

Publicação concluída: o módulo compilado foi validado no Node 22 da VPS com os 18 testes aprovados. A verificação HTTP em produção aprovou 15 caminhos e 4 redirecionamentos canônicos.

O roteador foi migrado na etapa seguinte. `npm run build` e `scripts/ensure-build.cjs` agora cobrem SEO e roteador; `build:seo` continua disponível para compilar apenas SEO.
