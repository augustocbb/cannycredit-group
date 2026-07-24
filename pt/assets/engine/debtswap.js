/* ============================================================
   Credit GPS — debtswap.js  (o insight central)
   Detecta dívida cara e calcula a ECONOMIA de trocá-la por um crédito mais
   barato (portabilidade/consignado). Se nada reduz o custo, recomenda quitar.
   Depende de finance.js. UMD.
   ============================================================ */
(function (root, factory) {
  var G = typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this);
  var finance = (typeof require === 'function') ? require('./finance.js') : (G.CGPS && G.CGPS.finance);
  var api = factory(finance);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  G.CGPS = G.CGPS || {}; G.CGPS.debtswap = api;
})(typeof self !== 'undefined' ? self : this, function (finance) {
  'use strict';

  function brlPct(x) { return Math.round(x * 1000) / 10; }

  // input: {
  //   dividas: [{ tipo, saldo, taxa_am? }],
  //   tabelas,                       // usa tabelas.divida_cara_am p/ taxa quando não informada
  //   opcoes: [{ id, label, taxa_am, iof? }],  // produtos de troca elegíveis ao usuário
  //   prazo (default 24)
  // }
  function analisar(input) {
    var dividas = (input.dividas || []).filter(function (d) { return d && d.saldo > 0; });
    if (!dividas.length) return { temDivida: false, recomendacao: 'Sem dívidas informadas.' };

    var caras = (input.tabelas && input.tabelas.divida_cara_am) || {};
    var totalSaldo = 0, somaJuros = 0, custoMensalAtual = 0;
    dividas.forEach(function (d) {
      var taxa = d.taxa_am != null ? d.taxa_am : (caras[d.tipo] != null ? caras[d.tipo] : 0.10);
      d._taxa = taxa;
      totalSaldo += d.saldo;
      somaJuros += d.saldo * taxa;
      custoMensalAtual += d.saldo * taxa;   // juro mensal "queimado" mantendo a dívida
    });
    var blendedTaxa = totalSaldo > 0 ? somaJuros / totalSaldo : 0;
    var n = input.prazo || 24;

    // Comparação HONESTA: quitar a dívida em n meses NA TAXA ATUAL vs. numa taxa menor.
    // (amortização Price nos dois casos — evita número alarmista de juro composto "rolando".)
    var statusQuoCusto = finance.computeLoan(totalSaldo, blendedTaxa, n, { iof: false }).custoTotal;

    var opcoes = (input.opcoes || []).map(function (o) {
      var loan = finance.computeLoan(totalSaldo, o.taxa_am, n, { iof: o.iof !== false });
      var economia = statusQuoCusto - loan.custoTotal;
      return {
        id: o.id, label: o.label, taxa_am: o.taxa_am,
        parcela: loan.parcela, custoTotal: loan.custoTotal, cetAnual: loan.cetAnual,
        economia: economia, economiaPct: statusQuoCusto > 0 ? economia / statusQuoCusto : 0
      };
    }).sort(function (a, b) { return b.economia - a.economia; });

    var melhor = opcoes.length ? opcoes[0] : null;
    var vale = melhor && melhor.economia > 0;

    var recomendacao;
    if (vale) {
      recomendacao = 'Trocar por “' + melhor.label + '” pode economizar cerca de R$ ' +
        Math.round(melhor.economia) + ' (' + brlPct(melhor.economiaPct) + '%) em ' + n +
        ' meses, saindo de ~' + brlPct(blendedTaxa) + '%/mês para ' + brlPct(melhor.taxa_am) + '%/mês.';
    } else {
      recomendacao = 'Nenhuma troca reduz o custo agora. O melhor é priorizar a quitação da dívida ' +
        'mais cara e/ou renegociar diretamente — evite tomar mais crédito.';
    }

    return {
      temDivida: true, totalSaldo: totalSaldo, blendedTaxa: blendedTaxa,
      custoMensalAtual: custoMensalAtual, statusQuoCusto: statusQuoCusto, n: n,
      melhor: melhor, vale: vale, opcoes: opcoes,
      economiaTotal: vale ? melhor.economia : 0,
      economiaPct: vale ? melhor.economiaPct : 0,
      recomendacao: recomendacao
    };
  }

  return { analisar: analisar };
});
