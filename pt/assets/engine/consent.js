/* ============================================================
   Credit GPS — consent.js
   Fonte ÚNICA do texto de consentimento (LGPD).

   Por que um módulo só para isto: o que a pessoa leu na tela e o que fica
   gravado no banco têm de ser a MESMA string. Se o texto viver no HTML e a
   gravação mandar um resumo escrito à mão, os dois divergem na primeira
   alteração — e aí o registro não prova nada, porque não dá para saber o que
   estava na tela naquele dia. Aqui o HTML é *renderizado a partir* da mesma
   constante que é gravada, então não há como divergirem.

   Ao mudar QUALQUER palavra do texto, suba a VERSAO. Os leads antigos
   continuam a apontar para a versão que aquelas pessoas realmente leram.
   Nunca reescreva uma versão já usada em produção.

   UMD: window.CGPS.consent / require.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CGPS = root.CGPS || {}; root.CGPS.consent = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ISO da data em que este texto entrou em vigor + sequencial no dia.
  var VERSAO = '2026-07-29.1';

  // Máximo de instituições que podem receber o contato. O texto diz "até N";
  // o distribuidor NÃO pode exceder este número sem uma nova versão de texto —
  // consentir "até 3" não autoriza enviar para 5.
  var MAX_PARCEIROS = 3;

  // Um texto por método de captação. São diferentes porque o ato de consentir é
  // diferente (clicar num botão vs. marcar uma caixa), e o texto tem de descrever
  // o ato que a pessoa efetivamente praticou.
  var TEXTOS = {
    // simulador.html — o clique no "Cotar agora" é o ato de consentimento.
    clique_botao_cotar:
      'Ao clicar em "Cotar agora", você autoriza o envio do seu nome, telefone e ' +
      'e-mail a até ' + MAX_PARCEIROS + ' instituições parceiras autorizadas pelo ' +
      'Banco Central, que vão entrar em contato para apresentar propostas de ' +
      'empréstimo. Não pedimos CPF e não cobramos nada para liberar crédito.',

    // index.html e as landings — formulário com caixa de seleção obrigatória.
    checkbox_form_lead:
      'Autorizo o envio do meu nome, telefone e e-mail a até ' + MAX_PARCEIROS +
      ' instituições parceiras autorizadas pelo Banco Central, que vão entrar em ' +
      'contato para apresentar propostas de empréstimo.'
  };

  function texto(metodo) { return TEXTOS[metodo] || ''; }

  /** O que acompanha o texto na tela, mas não é o consentimento em si.
   *  Aponta para uma página que registra o pedido, não para um e-mail: a versão
   *  anterior mandava escrever para um endereço num domínio de terceiro com null MX —
   *  a revogação prometida não tinha para onde ir. */
  function complemento() {
    return 'Você pode revogar a qualquer momento em Seus direitos sobre os dados.';
  }

  /**
   * Registro a gravar junto do lead. `aceito` tem de vir do ato real do
   * utilizador (clique/checkbox) — nunca fixo em true, senão o registro
   * documenta uma vontade que não existiu.
   */
  function registro(metodo, aceito) {
    return {
      consentimento: !!aceito,
      consent_versao: VERSAO,
      consent_metodo: metodo,
      consent_texto: texto(metodo)
    };
  }

  return {
    VERSAO: VERSAO,
    MAX_PARCEIROS: MAX_PARCEIROS,
    texto: texto,
    complemento: complemento,
    registro: registro
  };
});
