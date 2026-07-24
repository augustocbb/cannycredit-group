/* ============================================================
   Credit GPS — adapters/mock.js
   Adapter determinístico (roda SEM credencial). Simula a resposta de um
   parceiro para a Etapa 2 (Confirmação), no MESMO contrato do adapter real.
   Depende de finance.js + approval.js. UMD.
   ============================================================ */
(function (root, factory) {
  var G = typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this);
  var finance = (typeof require === 'function') ? require('../finance.js') : (G.CGPS && G.CGPS.finance);
  var approval = (typeof require === 'function') ? require('../approval.js') : (G.CGPS && G.CGPS.approval);
  var api = factory(finance, approval);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  G.CGPS = G.CGPS || {}; G.CGPS.adapters = G.CGPS.adapters || {}; G.CGPS.adapters.mock = api;
})(typeof self !== 'undefined' ? self : this, function (finance, approval) {
  'use strict';

  // hash determinístico simples (0..1) a partir de string
  function jitter(seed) {
    var h = 0; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 100000;
    return (h % 1000) / 1000; // 0..0.999
  }

  // quote(partner, produtoDef, request, cfg) -> Promise<Offer|null>
  function quote(partner, produtoDef, request, cfg) {
    return new Promise(function (resolve) {
      var lat = 300 + Math.floor(jitter(partner.id + request.produtoId) * 900); // 300–1200ms
      setTimeout(function () {
        var spreadJit = jitter(partner.id) * 0.006; // 0–0,6%/mês de variação determinística
        var taxa = (produtoDef.taxa_min_am || 0.03) + (partner.spread_am || 0) + spreadJit;
        var loan = finance.computeLoan(request.valor, taxa, request.prazo, { iof: produtoDef.iof !== false });
        var prob = approval.probabilidade({
          base: partner.aprovacao_base != null ? partner.aprovacao_base : 0.7,
          produtoId: request.produtoId, perfil: request.perfil,
          valor: request.valor, parcela: loan.parcela, produtoDef: produtoDef, elegivel: true
        });
        var approved = prob >= 0.4;
        var link = (partner.link || '').replace('{subid}', encodeURIComponent(request.subid || ''));
        resolve({
          partnerId: partner.id, bank: partner.nome, source: 'mock', confirmada: true,
          approved: approved,
          approvedAmount: approved ? request.valor : Math.round(request.valor * 0.6),
          interestRate: taxa,                 // a.m.
          installments: request.prazo,
          installmentValue: loan.parcela,
          CET: loan.cetAnual,                 // a.a.
          cetMensal: loan.cetMensal,
          custoTotal: loan.custoTotal,
          prob: prob,
          affiliateLink: link
        });
      }, lat);
    });
  }

  return { quote: quote, id: 'mock' };
});
