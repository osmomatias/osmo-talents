# Stripe Connect por etapa (somente testes)

Implementação local de cobranças separadas e transferências condicionadas à aprovação explícita do cliente. Sem implantação ou cobranças reais. As alterações Asaas já existentes foram preservadas; selecionar Stripe não migra cobranças antigas. Não troque de provedor com contratos financeiros abertos sem conciliação.

## Configuração local

Configure no ambiente privado (não envie segredos em chats):

```
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PIX_ENABLED=false
PUBLIC_URL=http://localhost:3000
```

O código recusa chaves reais. Complete o cadastro da plataforma brasileira e habilite o Connect no Dashboard de testes. O onboarding usa Accounts v2 (`/v2/core/accounts` e `/v2/core/account_links`), corpos JSON e versão `2026-10-28.endive`. Ele envia o e-mail do designer autenticado, solicita Dashboard Express, configurações `merchant` com `card_payments` e `recipient` com `stripe_balance.stripe_transfers`, e atribui taxas/perdas à plataforma. Checkout e Transfer continuam usando os endpoints v1 com a versão `2025-02-24.acacia`.

Na configuração local, a API real do sandbox aceitou a criação de um link v2 com URLs de retorno e renovação em HTTP localhost. Use a origem e porta em que a aplicação está rodando; para ambientes publicados, configure HTTPS. O encaminhamento interno do Stripe CLI ao webhook pode continuar em HTTP localhost. O pedido de criação do link contém `account`, `use_case.type`, `return_url` e `refresh_url`: em `2026-10-28.endive`, `configurations` aparece na resposta, mas é rejeitado como campo desconhecido no pedido.

Antes da cobrança e do repasse, a consulta de conta inclui `identity`, `configuration.recipient` e `configuration.merchant`: exige país BR, `recipient.capabilities.stripe_balance.stripe_transfers.status=active` e `merchant.capabilities.stripe_balance.payouts.status=active`. O campo de payouts pertence à configuração merchant; ausência de dados/capacidades bloqueia a operação.

Estado da validação: a criação de uma conta fictícia via Accounts v2 e do respectivo link de cadastro com retorno local HTTP foram aceitas no sandbox durante a configuração. Isso ainda não comprova onboarding completo, pagamento, entrega, aprovação ou repasse. O ciclo integrado com a Stripe permanece pendente até verificar cada uma dessas etapas; testes automatizados com API simulada são uma verificação separada.

Execute `npm test` e `npm run typecheck`. Para testar com a Stripe, use o perfil de designer em Meu perfil → Receber pagamentos → Conectar conta Stripe. O cliente gera a cobrança no painel, abre Checkout e paga com cartão de teste (por exemplo 4242 4242 4242 4242). Não use cartão real. Use o Stripe CLI para encaminhar eventos da conta da plataforma:

```
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,charge.refunded,charge.dispute.created,transfer.reversed --forward-to localhost:3000/api/webhooks/stripe
```

Use o segredo exibido pelo CLI apenas no ambiente local; o segredo do endpoint de Dashboard é diferente. O retorno à aplicação não confirma pagamento. O webhook verifica HMAC sobre bytes originais, tolerância de cinco minutos, modo de testes e deduplicação de eventos; busca Checkout, PaymentIntent e Charge diretamente na API. Só libera início após confirmação. O cadastro é revalidado antes da cobrança e do repasse; retorno do onboarding não significa habilitação.

## Regra financeira implementada

Cada etapa possui uma única tentativa de Checkout persistida. Valor vem do contrato, nunca do navegador. Não há captura manual nem transferência antecipada. Aprovação só é autorizada ao cliente proprietário e após a entrega. O repasse envia exatamente 90% do bruto em centavos, com `source_transaction` obrigatório e `transfer_group` por etapa. Os 10% são comissão BRUTA, não lucro líquido. Todas as taxas e perdas cabem à Osmo; não se subtrai taxa dos 90% do designer. Os valores atuais das propostas são reais inteiros; valores sem divisão exata são recusados.

Uma tentativa de aprovação persiste o início do repasse e impede alterações concorrentes na etapa; falhas exigem repetir a aprovação ou conciliar, sem apagar a tentativa. Chaves de idempotência estáveis protegem criação de conta, Checkout e repasse em retries, inclusive timeout. Tentativas ambíguas com mais de 23 horas ficam bloqueadas para conciliação, pois a Stripe pode remover chaves após 24 horas. Checkouts expirados/encerrados não são substituídos automaticamente: localizar pagamento/estado no Dashboard antes de permitir nova tentativa. Não exclua registros para contornar esse bloqueio. Registros estão em `stripe_accounts`, `stripe_account_attempts`, `stripe_payments` e `stripe_events`; os estados usados pelo painel continuam em `milestones`.

A liberação automática por silêncio fica desativada para Stripe. Transferência aceita pela Stripe é registrada como liberada, mas não prova depósito bancário; prazos de liquidação e payout continuam aplicáveis. Não há promessa de escrow, segregação de dinheiro ou proteção contra chargebacks.

## Viabilidade brasileira e pendências obrigatórias antes de produção

A documentação oficial lista BR para separate charges and transfers e exige `source_transaction` em transferências envolvendo Brasil. Isso sustenta o protótipo, mas não comprova que uma conta específica pode manter fundos pelo prazo comercial de uma etapa. Valide com Stripe o fluxo BR→BR, plataforma como business of record, enquadramento do marketplace, prazos máximos, reserva de saldo e efeito dos payouts automáticos. Não altere saque para manual como suposta solução de escrow: a Stripe não oferece escrow e sua documentação sobre payouts brasileiros indica pagamentos automáticos diários. A página genérica de manual payouts não deve ser tomada como confirmação de elegibilidade brasileira.

A segregação de fundos é preview privado, não foi solicitada nem implementada. O saldo não deve ser tratado como cofre. Defina com Stripe e assessoria contábil/jurídica o tratamento de recursos de terceiros, liquidez para repasses tardios, prazo máximo das etapas e tratamento de abandono/rejeição. Nenhum prazo de aprovação ou reembolso de produto foi inventado.

Pix consta na tabela brasileira como somente por convite, embora a documentação técnica liste suporte Connect e BRL. Só defina `STRIPE_PIX_ENABLED=true` depois de confirmar ativação e compatibilidade do fluxo na conta; a flag não concede acesso. Falha de elegibilidade retorna erro e não simula Pix. Pix é pagamento único em BRL; não depende de autorização prolongada de cartão.

Nubank PJ: cadastrar os dados bancários da empresa diretamente no Dashboard Stripe, com titularidade compatível. Aceitação dessa conta, dados exigidos e recebimento efetivo não foram verificados. A conta sandbox e as credenciais de teste locais não validam uma conta bancária real. Dados bancários dos designers são coletados pela Stripe no onboarding, não armazenados pela Osmo.

## Custos e reembolsos/contestações

Tabela pública consultada em 8/11/2026: cartão nacional 3,99% + R$0,39; adicional de 2% para cartão internacional; Pix 1,19% e somente por convite. Em etapa de R$100, cartão nacional deixa R$90 ao designer e R$5,62 à Osmo antes de Connect, tributos e demais custos. Confirme contrato e custos Connect, contas ativas, repasses, Radar, conversões, impostos e eventual saldo negativo. Não há tabela de taxas codificada: ela não altera os 90% brutos.

Reembolso na plataforma não reverte transferência automaticamente. Eventos de reembolso, contestação ou reversão bloqueiam novos repasses e marcam a etapa para conciliação (`estornado` é o estado agregado existente, não prova de crédito ao cliente). Antes do repasse também se verifica Charge na API. Após repasse, a recuperação exige análise/reversão no Dashboard; não há recuperação automática, fila operacional ou endpoint de reembolso nesta entrega. Reversões podem falhar se o designer não tiver saldo. A plataforma permanece responsável pelo custo e pelo saldo negativo; não se criou compensação em outras etapas.

É necessário definir responsáveis e regras de cancelamento, reembolso parcial, desistência, entrega rejeitada, fraude, contestação após aprovação, evidências e suporte. Stripe documenta reembolso Pix em até 90 dias e MED em situações limitadas, com decisão do parceiro não contestável pela Stripe. A tabela mostra custos de contestação: recebimento R$55 e refutação manual R$55 (esta devolvida se ganhar), além de possíveis custos adicionais. Não prometa irreversibilidade do Pix.

Antes de produção: reconciliador e alertas para pagamentos/transferências/payouts pendentes, fluxos de suporte e reembolso definidos, testes reais de sandbox (inclusive SCA, Pix habilitado, expiração, falha de transferência e eventos fora de ordem), revisão do fluxo BR com Stripe e validação operacional das contas. O bloqueio de chaves reais só deve ser removido em mudança revisada após essas validações.

## Fontes oficiais

- [Cobranças e transferências separadas, suporte BR e source_transaction](https://docs.stripe.com/connect/separate-charges-and-transfers?platform=web&integration=checkout&ui=stripe-hosted)
- [Accounts v2 e configurações merchant/recipient](https://docs.stripe.com/connect/accounts-v2)
- [Objeto Account v2 e capacidades de payout](https://docs.stripe.com/api/v2/core/accounts/object)
- [Criação de Account Link v2, versão endive](https://docs.stripe.com/api/v2/core/account-links/create)
- [Webhooks e assinaturas](https://docs.stripe.com/webhooks/signature)
- [Pix, elegibilidade e reembolsos](https://docs.stripe.com/payments/pix)
- [Tabela brasileira](https://stripe.com/br/pricing)
- [Payouts](https://docs.stripe.com/payouts)
- [Payouts brasileiros automáticos](https://stripe.com/en-de/resources/more/payouts-explained)
- [Manual payouts e ausência de escrow](https://docs.stripe.com/connect/manual-payouts)
