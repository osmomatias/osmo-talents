# Migração completa para TypeScript

Data: 08/11/2026. Branch de trabalho: `main`. Migração validada localmente; a publicação é uma etapa separada.

## Escopo concluído

Foram migrados os 31 módulos próprios restantes em JavaScript/CommonJS/ESM. Os módulos SEO e roteador que já estavam em TypeScript foram integrados ao build único.

| Área | Fontes mantidas em TypeScript |
| --- | --- |
| Servidor HTTP e regras da plataforma | `server.ts`, `src/server-types.ts` |
| Banco, pagamentos, OAuth, e-mail, push, WhatsApp, ICP, idiomas e controle da TV | `src/*.ts` |
| Aplicação web, tema, idiomas e modo offline | `client/*.ts` |
| Service worker e notificações | `client/sw.ts` |
| TV e controle pelo celular | `client/tv/*.ts` |
| Biblioteca da casa | `biblioteca/server.mts`, `biblioteca/client/app.ts` |
| Dados demonstrativos, webhook Asaas, laudos, build e desenvolvimento | `scripts/*.ts` |
| Configuração do PM2 | `ecosystem.config.ts` |
| Testes e fixtures HTTP | `test/*.ts` |

Todos os projetos usam `strict: true`, sem `@ts-nocheck`, `@ts-ignore` ou tipos `any` para contornar a compilação. SEO e roteador mantêm também a verificação adicional de índices (`noUncheckedIndexedAccess`). As fronteiras de entrada usam `unknown`, validação e contratos de dados/DOM/serviços.

## Fontes e artefatos

- `dist/`: servidor, integrações, scripts e testes compilados.
- `public/*.js` e os três scripts próprios de `public/tv/`: gerados a partir de `client/`, nos mesmos URLs usados pelo site.
- `biblioteca/dist/server.mjs` e `biblioteca/public/app.js`: artefatos do aplicativo local complementar.
- `server.js`, `ecosystem.config.cjs`, `scripts/ensure-build.cjs` e `biblioteca/server.mjs`: pequenos carregadores de compatibilidade; a lógica permanece nos arquivos TypeScript correspondentes.
- QR Code e Lottie: distribuições originais de terceiros preservadas, com contratos de tipos para integração.

Os artefatos gerados ficam fora do versionamento. `publicar.sh` os compila e inclui na entrega. A Biblioteca continua excluída do upload para a VPS; os checks de produção aceitam essa ausência intencional. A inicialização de um pacote já compilado não exige instalar o TypeScript no servidor.

## Comandos

```bash
npm ci
npm run typecheck
npm test
npm run dev
```

`npm run dev` acompanha as fontes TypeScript, recompila os scripts do navegador e reinicia o backend compilado quando necessário. `npm run build` gera uma entrega limpa; `npm start` verifica o build e inicia a aplicação. `npm run biblioteca` inicia separadamente o protótipo local de mídia. Os comandos `seed`, `asaas:setup` e `laudo:conferir` executam os scripts compilados.

## Validação

- Checagem estrita de todos os projetos e compilação limpa: passaram.
- Suíte completa: **23 testes aprovados**.
- Fluxo integrado: cadastro, login, vaga, proposta, aceite, etapas, conclusão, totais e bloqueio de terceiros.
- SEO/SSR, consentimento de indexação, redirects, paginação, autenticação e integridade SQLite preservados.
- Pacote de produção inicializado sem `node_modules`, sem reescrever os artefatos; Biblioteca omitida como no deploy real.
- Desenvolvimento local: resposta HTTP 200 e recompilação/reinício após mudança em TypeScript confirmados.
- Navegador local: busca, login, painel, TV e pareamento do controle confirmados com banco temporário.
- Comparações de comportamento: integrações/criptografia/OAuth, idiomas, tema, service worker e Biblioteca usando fixtures, sem serviços externos.
- HTML do aplicativo principal: 1.432 fragmentos preservados; Biblioteca: 42 fragmentos preservados. CSS e arquivos HTML do produto não foram alterados.

As verificações usaram bancos e arquivos temporários. Esta migração não foi aplicada ao ambiente de produção.
