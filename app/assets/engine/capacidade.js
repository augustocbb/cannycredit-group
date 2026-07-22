/* ============================================================
   Credit GPS — capacidade.js  (módulo "Quanto dá pra pegar?")
   Calcula o MÁXIMO que a pessoa consegue levantar por produto, respeitando:
     - consignado: margem consignável (renda × %);
     - pessoal/portabilidade: comprometimento de renda (capacidade de parcela);
     - garantia: LTV do bem;
     - FGTS: saldo disponível.
   E um total combinado (margem de folha + capacidade geral). Depende de finance.js. UMD.
   Estimativa — a disponibilidade real vem da consulta às plataformas (adapters).
   ============================================================ */
(function (root, factory) {
  var G = typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this);
  var finance = (typeof require === 'function') ? require('./finance.js') : (G.CGPS && G.CGPS.finance);
  var api = factory(finance);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  G.CGPS = G.CGPS || {}; G.CGPS.capacidade = api;
})(typeof self !== 'undefined' ? self : this, function (finance) {
  'use strict';

  // opts: { produtos, tabelas, elegiveis, margem, capacidade, valorBem, saldoFgts, fatorFgts=0.9 }
  function analisar(opts) {
    var media = (opts.tabelas && opts.tabelas.taxa_media_am) || {};
    var margem = opts.margem || 0, cap = opts.capacidade || 0;
    var valorBem = opts.valorBem || 0, saldoFgts = opts.saldoFgts || 0, fFgts = opts.fatorFgts || 0.9;

    var porProduto = [];
    (opts.elegiveis || []).forEach(function (id) {
      if (id === 'portabilidade') return; // troca de dívida, não é dinheiro novo
      var p = opts.produtos[id]; if (!p) return;
      var taxa = media[id] != null ? media[id] : p.taxa_min_am;
      var n = p.prazo_max;
      var parcelaCap = (id === 'consignado') ? margem : cap;
      var max = Math.min(finance.pvFromPmt(parcelaCap, taxa, n), p.valor_max);
      var motivo;
      if (id === 'consignado') motivo = 'margem consignável';
      else if (id === 'garantia') {
        if (valorBem > 0) { max = Math.min(max, valorBem * (p.ltv_max || 0.6)); motivo = 'até ' + Math.round((p.ltv_max || 0.6) * 100) + '% do bem'; }
        else { max = 0; motivo = 'informe o valor do bem'; }
      } else if (id === 'fgts') {
        if (saldoFgts > 0) { max = Math.min(max, saldoFgts * fFgts); motivo = 'até ' + Math.round(fFgts * 100) + '% do FGTS'; }
        else { max = 0; motivo = 'informe o saldo do FGTS'; }
      } else motivo = 'comprometimento de renda';
      max = Math.max(0, Math.round(max));
      var parcelaNoMax = max > 0 ? finance.computeLoan(max, taxa, n, { iof: p.iof !== false }).parcela : 0;
      porProduto.push({ id: id, label: p.label, taxa: taxa, prazo: n, max: max, parcelaNoMax: parcelaNoMax, motivo: motivo });
    });
    porProduto.sort(function (a, b) { return b.max - a.max; });

    // total combinado: consignado usa a margem (folha); os demais dividem a capacidade geral.
    var consignado = porProduto.filter(function (x) { return x.id === 'consignado'; })[0];
    var consignadoMax = consignado ? consignado.max : 0;
    var outros = porProduto.filter(function (x) { return x.id !== 'consignado' && x.max > 0; })
      .sort(function (a, b) { return a.taxa - b.taxa; });
    var capRem = cap, totalOutros = 0;
    outros.forEach(function (c) {
      if (capRem <= 1) return;
      var parcelaMax = finance.computeLoan(c.max, c.taxa, c.prazo, {}).parcela;
      var take = parcelaMax <= capRem ? c.max : c.max * (capRem / parcelaMax);
      take = Math.max(0, Math.min(take, c.max));
      if (take < 1) return;
      var loan = finance.computeLoan(take, c.taxa, c.prazo, {});
      capRem -= loan.parcela; totalOutros += take;
    });
    var total = Math.round(consignadoMax + totalOutros);

    return {
      porProduto: porProduto, total: total, consignadoMax: consignadoMax,
      totalOutros: Math.round(totalOutros),
      nota: 'Estimativa: consignado usa a margem de folha; as demais modalidades dividem a sua capacidade ' +
            'de parcela. O valor disponível REAL sai na consulta às plataformas.'
    };
  }

  return { analisar: analisar };
});
