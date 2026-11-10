# Validação Asaas em sandbox

Não há comprovação de integração externa até concluir o roteiro abaixo. Os testes automatizados usam banco temporário e respostas simuladas, sem acessar o Asaas.

## Preparar configuração local

Edite `.env` localmente, seguindo os campos de `.env.example`. Não cole segredos no chat, em tickets ou em commits.

- `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`
- `ASAAS_API_KEY`: chave gerada na conta **sandbox** do Asaas.
- `APP_SECRET`: segredo aleatório de pelo menos 24 caracteres. Preserve-o: alterar esse segredo impede abrir chaves de subcontas já guardadas.
- `ASAAS_WEBHOOK_TOKEN`: segredo aleatório de pelo menos 32 caracteres.
- `ASAAS_WEBHOOK_EMAIL`: e-mail para avisos do webhook.
- `PUBLIC_URL`: endereço HTTPS público do ambiente de teste, com retorno para `/api/webhooks/asaas`.
- `DB_PATH`: banco exclusivo de testes, separado de dados reais.

Para gerar cada segredo, execute `openssl rand -hex 32` no terminal e guarde o resultado diretamente no `.env`. Use valores diferentes para os dois segredos.

Execute `npm run asaas:check`: mostra apenas presença/validade básica da configuração. Não autentica a chave, não acessa a rede e não registra webhook. O código de saída é 1 enquanto faltar configuração ou o ambiente não for sandbox.

## Testes locais sem credenciais

Execute `npm run build:node` e `node --disable-warning=ExperimentalWarning --test dist/test/asaas.test.js`.

O teste cobre falha e repetição da ativação de escrow, preservação da chave cifrada, bloqueio de cobrança para conta pendente (inclusive link antigo), split, reutilização de cobrança e aprovação bloqueada quando a garantia não é encontrada. Nenhum dinheiro ou serviço externo é envolvido.

## Validação externa pendente

Somente com as configurações acima e o app de teste acessível:

1. Confira que `npm run asaas:check` passa e que o banco é exclusivo de testes.
2. Registre o webhook **no sandbox** com `npm run asaas:setup`. Esse comando altera a configuração externa e pode criar um novo registro a cada execução; confira os registros existentes antes de repetir.
3. Com pessoas e dados de teste aceitos pelo Asaas, ative os recebimentos de um freelancer. Confirme no sandbox que a subconta possui escrow habilitado.
4. Crie um contrato de teste e uma cobrança. Confira valor, destinatário e split sobre o valor líquido, além do link da fatura.
5. Simule o pagamento pelos recursos do sandbox. Confira entrega do webhook e mudança da etapa para `pago` no app; webhook rejeitado ou interrompido precisa ser resolvido antes de prosseguir.
6. Entregue e aprove a etapa. Confirme a garantia encerrada no Asaas e `liberado` no app. Valide também estorno, repetição do webhook e liberação automática por prazo em um contrato separado.

A configuração local de escrow é a confirmação da ativação feita pelo app; ela não detecta alterações manuais posteriores no painel Asaas. Contas antigas marcadas como ativas exigem conferência no sandbox antes do teste. A garantia também tem prazo de expiração no Asaas: a aplicação não oferece retenção indefinida até a aprovação.

Referências oficiais: [configuração de escrow](https://docs.asaas.com/docs/enabling-the-escrow-account-for-subaccounts), [split com escrow](https://docs.asaas.com/docs/split-for-accounts-with-escrow-account) e [liberação](https://docs.asaas.com/docs/release-of-guaranteed-funds).
