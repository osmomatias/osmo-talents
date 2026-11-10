import type { EditorialPages, PaymentInput } from "./seo-types";

// Páginas públicas baseadas nas funções e políticas da plataforma. Não dependem
// de JavaScript no navegador; os valores de pagamento vêm da configuração atual.
const CONTACT = '<a href="mailto:matias@osmo.com.br">matias@osmo.com.br</a>';
const related = '<nav aria-label="Informações sobre a plataforma"><a href="/sobre">Sobre</a> · <a href="/como-funciona">Como funciona</a> · <a href="/pagamentos-e-taxas">Pagamentos e taxas</a> · <a href="/perguntas-frequentes">Perguntas frequentes</a> · <a href="/briefing-claro">Briefing claro</a> · <a href="/acessibilidade">Acessibilidade</a></nav>';
const article = (heading: string, intro: string, body: string): string => `<article class="stack seo-article"><header><span class="label">Osmo Talents</span><h1>${heading}</h1><p class="lead">${intro}</p></header>${body}<footer>${related}</footer></article>`;
function paymentConfig(config: PaymentInput = {}) {
  const fee = Number(config.fee), days = Number(config.autoRelease);
  return {
    enabled: config.enabled === true,
    sandbox: config.sandbox === true,
    live: config.enabled === true && config.sandbox !== true,
    fee: (Number.isFinite(fee) ? Math.min(50, Math.max(0, fee)) : 10).toLocaleString("pt-BR"),
    days: Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 7,
  };
}
function paymentState(config: PaymentInput): string {
  const p = paymentConfig(config);
  const gw = config.provider === "stripe" ? "a Stripe" : "o Asaas";
  if (p.enabled && p.sandbox) return `<p><strong>Os pagamentos estão em ambiente de testes (sandbox).</strong> A integração com ${gw} está habilitada para simulações. Cobranças, confirmações e repasses nesse ambiente não representam movimentação real de dinheiro.</p>`;
  return p.live
    ? `<p><strong>A integração de pagamentos com ${gw} está habilitada.</strong> Confira as condições e o ambiente indicado no fluxo de cobrança antes de efetuar um pagamento. A habilitação da integração, por si só, não confirma que uma cobrança foi paga ou que um repasse foi concluído.</p>`
    : '<p><strong>Os pagamentos estão simulados durante o período de testes.</strong> A integração de cobrança e repasse está desativada nesta instalação. Registros e etapas de teste não representam pagamento, custódia ou transferência real de dinheiro.</p>';
}

export const pages: EditorialPages = {
  "/sobre": () => ({
    title: "Sobre a Osmo Talents",
    description: "Conheça a Osmo Talents: plataforma de projetos freelance pensada para pessoas neurodivergentes, com briefing claro e comunicação combinada.",
    content: article("Sobre a Osmo Talents", "A Osmo Talents é uma plataforma de projetos freelance pensada para pessoas neurodivergentes. Ela organiza o briefing e as preferências de comunicação para facilitar o acordo entre quem contrata e quem realiza o trabalho.", `
      <section><h2>Uma iniciativa Osmo</h2><p>A plataforma é mantida pela Osmo, conforme os <a href="/termos">Termos de Uso</a>. O canal de contato para dúvidas e pedidos é ${CONTACT}.</p><p>A Osmo Talents está em fase inicial. Recursos e condições podem mudar; confira o estado atual dos <a href="/pagamentos-e-taxas">pagamentos</a> antes de combinar um projeto.</p></section>
      <section><h2>Como a plataforma organiza o trabalho</h2><ul><li>Vagas com objetivo, entregas, limites de escopo e comunicação descritos.</li><li>Perfis com habilidades, portfólio e preferências sobre como trabalhar.</li><li>Propostas guiadas, com valor, prazo e possibilidade de dividir o projeto em etapas.</li><li>Conversas com um resumo do que foi combinado.</li><li>Ajustes de leitura, foco e movimento na interface.</li></ul></section>
      <section><h2>Dois caminhos: trabalhar ou contratar</h2><p>Freelancers podem apresentar seu trabalho e enviar propostas. Clientes podem publicar projetos e conversar com profissionais. O cadastro oferece esses dois perfis; <a href="/perguntas-frequentes">o selo de verificação é opcional</a>.</p><p><a class="btn" href="/vagas">Encontrar projetos</a> <a class="btn" href="/talentos">Encontrar talentos</a></p></section>
      <section><h2>Privacidade e atendimento</h2><p>A identificação neurodivergente no perfil é opcional. Leia quais informações são públicas e como pedir alterações na <a href="/privacidade">Política de Privacidade</a>. Para falar com a Osmo, escreva para ${CONTACT}.</p></section>`),
  }),
  "/como-funciona": config => ({
    title: "Como funciona a Osmo Talents",
    description: "Veja como encontrar projetos, publicar um briefing, enviar propostas e combinar comunicação, entregas e revisões na Osmo Talents.",
    content: article("Como funciona a Osmo Talents", "Quem contrata publica um projeto com briefing estruturado. Quem trabalha apresenta uma proposta com escopo, valor e prazo. A comunicação e as entregas são combinadas antes do início.", `
      <section><h2>Para quem quer trabalhar</h2><ol><li><a href="/entrar">Crie sua conta</a> como freelancer e preencha o perfil com sua especialidade, habilidades e portfólio.</li><li>Conte como prefere se comunicar, receber feedback e organizar o trabalho.</li><li>Explore as <a href="/vagas">vagas abertas</a> e leia o objetivo, as entregas e o que está fora do escopo.</li><li>Envie uma proposta guiada, com valor, prazo e etapas, quando fizer sentido para o projeto.</li><li>Se a proposta for aceita, acompanhe os combinados, as entregas e os pedidos de ajuste pela plataforma.</li></ol><p>Enviar proposta não exige créditos nem taxa por proposta. Existe um limite de propostas abertas relacionado à disponibilidade informada, para ajudar na organização.</p></section>
      <section><h2>Para quem quer contratar</h2><ol><li><a href="/entrar">Crie sua conta</a> como cliente.</li><li>Descreva o projeto: objetivo, entregas, limites, orçamento, prazo e forma de comunicação.</li><li>Confira a <a href="/briefing-claro">nota de clareza do briefing</a> e publique a vaga quando ela atender ao mínimo exigido.</li><li>Leia as propostas e os <a href="/talentos">perfis profissionais</a>; tire dúvidas antes de escolher.</li><li>Depois de aceitar uma proposta, acompanhe as etapas, avalie as entregas e registre o que precisa ser ajustado.</li></ol></section>
      <section><h2>Comunicação combinada, sem adivinhação</h2><p>O briefing informa como ocorrerão as conversas e o feedback. Uma vaga marcada como assíncrona pode prever uma chamada inicial; confira o texto do projeto e combine os detalhes. Não é preciso presumir que todo projeto terá a mesma rotina.</p><p>A conversa permite manter um resumo do que foi combinado, para facilitar a consulta pelos participantes.</p></section>
      <section><h2>Pagamentos e etapa atual do serviço</h2>${paymentState(config)}<p>Consulte <a href="/pagamentos-e-taxas">Pagamentos e taxas</a> para entender as condições atuais. Projetos freelance e seus acordos de entrega não devem ser confundidos automaticamente com vagas de emprego.</p></section>`),
  }),
  "/pagamentos-e-taxas": config => {
    const p = paymentConfig(config);
    return {
      title: "Pagamentos e taxas na Osmo Talents",
      description: p.live ? "Entenda o estado da integração de pagamentos, a taxa configurada e o funcionamento das etapas na Osmo Talents." : "Os pagamentos da Osmo Talents estão simulados. Veja o que está em teste, a taxa configurada e as condições das etapas.",
      content: article("Pagamentos e taxas", "Esta página informa o estado atual da integração de pagamentos da Osmo Talents e explica as regras configuradas para as etapas de um projeto.", `
        <section><h2>Estado atual dos pagamentos</h2>${paymentState(config)}<p>Antes de iniciar um projeto, os participantes devem conferir o que está disponível na plataforma e esclarecer dúvidas pelo ${CONTACT}.</p></section>
        <section><h2>Quanto custa enviar uma proposta?</h2><p>A plataforma não cobra créditos nem taxa por proposta enviada. Há um limite de propostas abertas de acordo com a disponibilidade informada no perfil.</p></section>
        <section><h2>Taxa configurada para etapas</h2><p>A taxa da plataforma está configurada em <strong>${p.fee}% do valor de cada etapa</strong>. ${p.live ? 'O fluxo de cobrança apresenta os valores da etapa.' : 'Como os pagamentos estão simulados, essa configuração não significa que uma cobrança real será feita.'}</p><p>Confira os valores apresentados no acordo e os <a href="/termos">Termos de Uso</a>. Se houver divergência entre uma tela, um combinado e os termos, solicite esclarecimento antes de prosseguir.</p></section>
        <section><h2>Como as etapas são organizadas?</h2><p>Uma proposta pode dividir o projeto em entregas com valores próprios. O fluxo permite registrar o início, a entrega, pedidos de ajuste e a aprovação de cada etapa.</p><p>Com a integração habilitada em produção e a cobrança confirmada, o fluxo de pagamentos é processado pelo Asaas. A liberação depende do estado real da cobrança e das condições aplicáveis ao projeto.</p></section>
        <section><h2>Prazo configurado após uma entrega</h2><p>O prazo de liberação automática está configurado em <strong>${p.days} dias</strong> após a entrega, nas condições do fluxo de etapas e sem resposta do cliente. ${p.live ? 'A confirmação de pagamento e as regras da etapa continuam necessárias.' : 'Em modo simulado, o prazo organiza apenas o fluxo de teste e não representa um repasse real.'}</p></section>
        <section><h2>Dúvidas, ajustes e problemas</h2><p>Registre na conversa do projeto o que foi entregue e o que precisa de ajuste. Para dúvidas sobre cobrança, cancelamento ou repasse, escreva para ${CONTACT}, indicando o projeto e a etapa, sem enviar senha ou dados completos de cartão.</p><p>Leia os <a href="/termos">Termos de Uso</a> e a <a href="/privacidade">Política de Privacidade</a>.</p></section>`),
    };
  },
  "/perguntas-frequentes": config => ({
    title: "Perguntas frequentes sobre a Osmo Talents",
    description: "Respostas sobre cadastro, laudo opcional, selo de verificação, propostas, comunicação, perfis públicos e pagamentos na Osmo Talents.",
    content: article("Perguntas frequentes", "Respostas práticas para entender o cadastro, os projetos e os combinados na Osmo Talents.", `
      <section><h2>Preciso de laudo para criar uma conta?</h2><p>Não. O cadastro não exige laudo. A identificação neurodivergente no perfil e o selo de verificação são opcionais. Quem não tem selo continua usando a plataforma normalmente.</p></section>
      <section><h2>O que significa o selo de verificado?</h2><p>É um recurso opcional de conferência de um laudo em PDF com assinatura digital ICP-Brasil. A pessoa declara que o documento é seu e concorda com a conferência. O arquivo é verificado e descartado; são guardados dados de registro da verificação, não o PDF.</p><p>O selo não é uma avaliação de competência profissional, da qualidade do trabalho ou de adequação a um projeto. Conheça a experiência, as habilidades, o portfólio e os combinados da pessoa antes de contratar. O selo pode ser removido pelo titular.</p></section>
      <section><h2>Posso usar a plataforma como cliente?</h2><p>Sim. O cadastro oferece perfis de freelancer e cliente. Clientes publicam projetos; freelancers apresentam suas habilidades e enviam propostas. A plataforma tem foco em pessoas neurodivergentes, sem exigir laudo no cadastro.</p></section>
      <section><h2>As vagas são empregos ou projetos freelance?</h2><p>A Osmo Talents é uma plataforma de trabalho freelance. As oportunidades descrevem projetos, orçamento e entregas. Leia as condições de cada anúncio; uma publicação na plataforma não caracteriza, por si só, uma oferta de emprego.</p></section>
      <section><h2>Preciso participar de reuniões?</h2><p>Depende do projeto e do que for combinado. O briefing informa a forma de comunicação e permite identificar oportunidades assíncronas ou com reuniões. Leia também o texto da vaga: uma oportunidade assíncrona pode incluir uma chamada inicial curta.</p></section>
      <section><h2>Quanto custa enviar uma proposta?</h2><p>Não há créditos nem taxa por proposta enviada. A quantidade de propostas abertas é limitada conforme a disponibilidade informada. A taxa configurada para etapas está explicada em <a href="/pagamentos-e-taxas">Pagamentos e taxas</a>.</p></section>
      <section><h2>Os pagamentos já estão funcionando?</h2>${paymentState(config)}<p>A situação atual e as condições estão em <a href="/pagamentos-e-taxas">Pagamentos e taxas</a>.</p></section>
      <section><h2>Quem pode ver meu perfil?</h2><p>As páginas de talentos são públicas. Preencha a apresentação e o portfólio considerando essa visibilidade. Informar uma identificação neurodivergente é opcional. A opção “Permitir que buscadores encontrem meu perfil público”, em Meu perfil, controla a autorização de indexação da página do perfil; ela vem desligada. Para autorizar a indexação, preencha também uma especialidade e uma apresentação com pelo menos 40 caracteres. Desativar a opção não torna o perfil privado e a atualização nos buscadores pode levar algum tempo. Mensagens são enviadas aos participantes das conversas; confira os detalhes na <a href="/privacidade">Política de Privacidade</a>.</p></section>
      <section><h2>Como são combinadas entregas e revisões?</h2><p>O briefing e a proposta descrevem o trabalho. Depois da contratação, os participantes acompanham as etapas e podem registrar a entrega e os ajustes solicitados. Combine o que está incluído e como o feedback será enviado antes de começar.</p></section>
      <section><h2>Como pedir ajuda?</h2><p>Escreva para ${CONTACT}. Para conhecer o percurso completo, veja <a href="/como-funciona">Como funciona</a>.</p></section>`),
  }),
  "/briefing-claro": () => ({
    title: "Como funciona a nota de clareza do briefing",
    description: "Entenda os nove critérios da nota de clareza da Osmo Talents, o mínimo para publicar e o que a porcentagem não garante.",
    content: article("O que significa a nota de clareza?", "A nota de clareza verifica nove critérios de preenchimento do briefing. Ela ajuda a identificar informações presentes no anúncio; não avalia a competência de uma pessoa nem garante o resultado do projeto.", `
      <section><h2>Os nove critérios</h2><p>Cada critério tem o mesmo peso. A porcentagem corresponde ao número de critérios atendidos dividido por nove, multiplicado por cem e arredondado para o inteiro mais próximo.</p><ol><li>Título com mais de oito caracteres.</li><li>Categoria válida entre as áreas da plataforma.</li><li>Objetivo com mais de vinte caracteres.</li><li>Pelo menos duas entregas listadas.</li><li>Pelo menos um item explicando o que está fora do escopo.</li><li>Descrição da comunicação com mais de três caracteres.</li><li>Descrição de feedback com mais de três caracteres.</li><li>Orçamento maior que zero.</li><li>Duração com mais de um caractere.</li></ol></section>
      <section><h2>Qual é o mínimo para publicar?</h2><p>O sistema exige nota de pelo menos 50%. Como são nove critérios de mesmo peso, atender cinco deles resulta em 56% após o arredondamento. Atender todos resulta em 100%.</p><p>O mínimo técnico não substitui uma revisão do texto. Quanto mais claro estiver o combinado, mais fácil será avaliar se o projeto faz sentido para as duas partes.</p></section>
      <section><h2>Um exemplo de briefing mais útil</h2><p>Em vez de escrever apenas “preciso de uma marca”, descreva o objetivo e o que será entregue: “Criar a identidade visual de uma cafeteria de bairro. Entregas: logotipo em arquivos vetoriais e guia de cores. Não inclui fotografia ou gestão das redes sociais. Feedback por lista escrita, com duas rodadas de revisão combinadas”.</p><p>Complete também o orçamento, o prazo e os formatos necessários. O exemplo é ilustrativo e não é uma vaga real nem uma recomendação de preço.</p></section>
      <section><h2>O que a nota não garante</h2><p>A porcentagem não comprova a veracidade das informações, a correção do texto, a reputação do contratante, a segurança de um pagamento ou a qualidade de uma entrega. Leia o anúncio e esclareça as dúvidas antes de enviar uma proposta.</p><p><a href="/vagas">Ver vagas e seus briefings</a> · <a href="/como-funciona">Entender o fluxo de contratação</a></p></section>`),
  }),
  "/acessibilidade": () => ({
    title: "Acessibilidade e ajustes de conforto na Osmo Talents",
    description: "Conheça os ajustes de texto, espaçamento, foco, tema e movimento da Osmo Talents e saiba como relatar uma dificuldade de acesso.",
    content: article("Acessibilidade e ajustes de conforto", "A interface oferece preferências de leitura, aparência, foco e movimento. Você pode ajustar a experiência no menu Ajustes; as escolhas ficam salvas neste navegador.", `
      <section><h2>Leitura e aparência</h2><ul><li><strong>Texto maior:</strong> aumenta a letra da interface.</li><li><strong>Mais espaço entre linhas:</strong> amplia o espaçamento para acompanhar textos.</li><li><strong>Tema:</strong> permite ajustar a aparência da interface.</li><li><strong>Vidro líquido:</strong> pode ser desligado para usar painéis com cores sólidas e mais contraste.</li></ul></section>
      <section><h2>Foco e movimento</h2><ul><li><strong>Modo foco:</strong> esconde painéis laterais e informações extras.</li><li><strong>Sem animações:</strong> remove transições e movimentos da interface.</li></ul><p>Essas opções ajudam a adaptar a apresentação. Elas não substituem a avaliação da experiência com tecnologias assistivas e diferentes necessidades de acesso.</p></section>
      <section><h2>Comunicação e organização do projeto</h2><p>O perfil permite informar como você prefere se comunicar e receber feedback. Os briefings registram entregas e limites de escopo. Combine o formato das mensagens, eventuais chamadas e revisões com a outra pessoa antes de iniciar o trabalho.</p></section>
      <section><h2>Encontrou uma dificuldade?</h2><p>Envie um relato para ${CONTACT}, informando a página, o que tentou fazer e o navegador ou tecnologia assistiva utilizada, se quiser compartilhar. Não inclua senhas ou informações sensíveis no relato.</p><p>Não declaramos nesta página uma certificação ou conformidade integral com um padrão de acessibilidade. A plataforma está em fase inicial e o feedback ajuda a identificar o que precisa ser corrigido.</p></section>`),
  }),
};

