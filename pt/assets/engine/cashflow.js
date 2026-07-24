/* ============================================================
   Credit GPS — cashflow.js  (quem já tem empréstimos)
   Estima o que a pessoa deve e otimiza o FLUXO DE CAIXA: adia cada dívida
   até a tolerância informada (sem "atrasar" além do permitido), toma o MÍNIMO
   de empréstimo novo, libera o MÁXIMO de caixa agora e verifica se a conta
   "fecha" mês a mês (nenhum mês acima do orçamento). Depende de finance.js. UMD.

   ⚠️ É simulação de fluxo de caixa, NÃO recomendação de atrasar dívidas.
   Adiar/renegociar tem custo de juros e risco de negativação.
   ============================================================ */
(function (root, factory) {
  var G = typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this);
  var finance = (typeof require === 'function') ? require('./finance.js') : (G.CGPS && G.CGPS.finance);
  var api = factory(finance);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  G.CGPS = G.CGPS || {}; G.CGPS.cashflow = api;
})(typeof self !== 'undefined' ? self : this, function (finance) {
  'use strict';

  // input: {
  //   dividas: [{ nome, tipo, saldo, parcela, taxa_am, importancia(1-5), maxAtraso(meses) }],
  //   orcamento,          // quanto cabe por mês para dívidas
  //   caixaAlvo,          // quanto a pessoa quer levantar agora (opcional)
  //   novoProduto,        // { taxa_am, prazo, iof } do crédito novo mais barato (opcional)
  //   horizonte (=12)
  // }
  function analisar(input) {
    var H = input.horizonte || 12;
    var dividas = (input.dividas || []).filter(function (d) { return d && d.saldo > 0; });
    if (!dividas.length) return { temDivida: false };

    var total = 0, porTipo = {};
    dividas.forEach(function (d) {
      total += d.saldo;
      porTipo[d.tipo || 'outro'] = (porTipo[d.tipo || 'outro'] || 0) + d.saldo;
    });

    // adia cada dívida até a tolerância informada (deixar dever até o limite, sem ultrapassar)
    var planoDiv = dividas.map(function (d) {
      var k = Math.max(0, Math.min(d.maxAtraso || 0, H));
      var taxa = d.taxa_am != null ? d.taxa_am : 0.05;
      var cashFree = (d.parcela || 0) * k;                       // caixa liberado agora
      var custoAdiar = d.saldo * (Math.pow(1 + taxa, k) - 1);    // juros que corre no adiamento (estimativa)
      return {
        nome: d.nome || d.tipo, tipo: d.tipo, saldo: d.saldo, parcela: d.parcela || 0,
        importancia: d.importancia || 3, adiarMeses: k, cashFree: cashFree, custoAdiar: custoAdiar
      };
    });

    var cashDeferimentos = planoDiv.reduce(function (s, p) { return s + p.cashFree; }, 0);
    var custoTotalAdiar = planoDiv.reduce(function (s, p) { return s + p.custoAdiar; }, 0);

    // empréstimo novo MÍNIMO para atingir o alvo de caixa
    var alvo = input.caixaAlvo || 0;
    var falta = Math.max(0, alvo - cashDeferimentos);
    var novo = null;
    if (falta > 1 && input.novoProduto) {
      var np = input.novoProduto;
      var loan = finance.computeLoan(falta, np.taxa_am, np.prazo || 24, { iof: np.iof !== false });
      novo = { valor: falta, prazo: np.prazo || 24, taxa_am: np.taxa_am, parcela: loan.parcela,
               cetAnual: loan.cetAnual, totalPago: loan.totalPago, recebido: loan.recebido };
    }
    var caixaLivre = cashDeferimentos + (novo ? novo.recebido : 0);   // máximo de dinheiro agora

    // cronograma mensal de obrigações (dívidas retomam após o adiamento + parcela do novo)
    var meses = new Array(H).fill(0);
    planoDiv.forEach(function (p, i) {
      var d = dividas[i];
      for (var m = p.adiarMeses; m < H; m++) meses[m] += (d.parcela || 0);
    });
    if (novo) for (var m = 0; m < Math.min(novo.prazo, H); m++) meses[m] += novo.parcela;

    var orc = input.orcamento || 0;
    var mesesAperto = [];
    for (var i = 0; i < H; i++) if (orc && meses[i] > orc + 0.5) mesesAperto.push(i + 1);
    var fecha = orc ? mesesAperto.length === 0 : null;

    var recomendacao;
    if (fecha === false) {
      recomendacao = 'Só com adiamentos e este empréstimo a conta NÃO fecha em ' + H + ' meses (aperto nos meses ' +
        mesesAperto.join(', ') + '). Aumente o prazo do crédito novo, reduza o alvo de caixa ou renegocie prazos.';
    } else if (novo) {
      recomendacao = 'Plano: adiar dentro da tolerância libera ' + Math.round(cashDeferimentos) +
        ' e o empréstimo novo MÍNIMO de ' + Math.round(novo.valor) + ' completa o caixa. A conta fecha no orçamento.';
    } else {
      recomendacao = 'Só com adiamentos (dentro da tolerância) você já libera ~' + Math.round(cashDeferimentos) +
        ' sem tomar empréstimo novo. A conta ' + (fecha ? 'fecha' : 'precisa de orçamento definido') + '.';
    }

    return {
      temDivida: true, total: total, porTipo: porTipo, planoDiv: planoDiv,
      cashDeferimentos: cashDeferimentos, custoTotalAdiar: custoTotalAdiar,
      emprestimoMinimo: novo, caixaLivre: caixaLivre,
      cronograma: meses, inicio: meses[0] || 0, meio: meses[Math.ceil(H / 2) - 1] || 0, fim: meses[H - 1] || 0,
      fecha: fecha, mesesAperto: mesesAperto, recomendacao: recomendacao,
      aviso: 'Simulação de fluxo de caixa — não é recomendação de atrasar dívidas. Adiar tem custo de juros e ' +
             'risco de negativação; renegociar diretamente costuma ser melhor. Estimativas.'
    };
  }

  return { analisar: analisar };
});
