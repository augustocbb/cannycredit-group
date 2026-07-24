/* ============================================================
   Credit GPS — approval.js
   Probabilidade de aprovação ESTIMADA (heurística transparente v1).
   NÃO é decisão de crédito — apenas orientação. UMD.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CGPS = root.CGPS || {}; root.CGPS.approval = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCORE_ADJ = { baixo: -0.22, medio: 0.0, alto: 0.15 };
  var PRODUTO_ADJ = { consignado: 0.15, fgts: 0.10, garantia: 0.10, portabilidade: 0.05, pessoal: 0.0 };

  // ctx: { base (parceiro), produtoId, perfil, valor, parcela, produtoDef, elegivel(bool) }
  function probabilidade(ctx) {
    if (ctx.elegivel === false) return 0;
    var p = (typeof ctx.base === 'number' ? ctx.base : 0.7);
    p += (SCORE_ADJ[(ctx.perfil && ctx.perfil.scoreFaixa) || 'medio'] || 0);
    p += (PRODUTO_ADJ[ctx.produtoId] || 0);

    // comprometimento de renda (DTI da nova parcela)
    if (ctx.perfil && ctx.perfil.renda > 0 && ctx.parcela > 0) {
      var dti = (ctx.parcela + (ctx.perfil.outrosCompromissos || 0)) / ctx.perfil.renda;
      if (dti > 0.30) p -= Math.min(0.45, (dti - 0.30) * 1.5);
      else p += 0.05;
    }
    // valor perto do teto do produto puxa para baixo
    if (ctx.produtoDef && ctx.produtoDef.valor_max) {
      var rel = ctx.valor / ctx.produtoDef.valor_max;
      if (rel > 0.8) p -= (rel - 0.8) * 0.5;
    }
    return Math.max(0.02, Math.min(0.97, p));
  }

  function faixaTexto(p) {
    if (p >= 0.75) return 'alta';
    if (p >= 0.5) return 'média';
    if (p >= 0.25) return 'baixa';
    return 'muito baixa';
  }

  return { probabilidade: probabilidade, faixaTexto: faixaTexto };
});
