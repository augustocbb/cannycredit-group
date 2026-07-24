/* ============================================================
   Credit GPS — optimizer.js  (seletor do 1º empréstimo)
   Otimiza objetivos {quanto levantar, quanto pagar de parcela} sujeito às
   restrições de crédito, considerando COMBINAÇÕES de até 3 contratações.
   Retorna 3 alternativas: MENOR PARCELA, MAIOR VALOR, MENOR JUROS.
   Taxas = estimativa BACEN (tabelas.taxa_media_am). Depende de finance.js. UMD.
   ============================================================ */
(function (root, factory) {
  var G = typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this);
  var finance = (typeof require === 'function') ? require('./finance.js') : (G.CGPS && G.CGPS.finance);
  var api = factory(finance);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  G.CGPS = G.CGPS || {}; G.CGPS.optimizer = api;
})(typeof self !== 'undefined' ? self : this, function (finance) {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(v, hi)); }

  // aloca V entre os candidatos mais baratos primeiro (até maxN produtos)
  function alocarCheapestFirst(cands, V, maxN) {
    var s = cands.slice().sort(function (a, b) { return a.taxa - b.taxa; });
    var rem = V, out = [];
    for (var i = 0; i < s.length && out.length < maxN && rem > 1; i++) {
      var c = s[i];
      var take = clamp(rem, c.valorMin, c.valorMax);
      out.push({ cand: c, valor: take });
      rem -= take;
    }
    return { aloc: out, sobra: Math.max(0, rem) };
  }

  // cronograma combinado (soma das parcelas Price por mês) + início/meio/fim
  function combinar(contratos) {
    var maxN = 0, i;
    for (i = 0; i < contratos.length; i++) maxN = Math.max(maxN, contratos[i].prazo);
    var mensal = new Array(maxN).fill(0), pagamentos = [];
    for (i = 0; i < contratos.length; i++) {
      var c = contratos[i];
      for (var m = 0; m < c.prazo; m++) mensal[m] += c.parcela;
    }
    for (i = 0; i < maxN; i++) pagamentos.push(mensal[i]);
    return {
      maxN: maxN, pagamentos: pagamentos,
      inicio: pagamentos[0] || 0,
      meio: pagamentos[Math.max(0, Math.ceil(maxN / 2) - 1)] || 0,
      fim: pagamentos[maxN - 1] || 0
    };
  }

  // monta um plano a partir de alocações com um prazo-alvo t (clampado por produto)
  function montarPlano(objetivo, aloc, t, tabelas) {
    var contratos = aloc.map(function (a) {
      var prazo = clamp(t, a.cand.prazoMin, a.cand.prazoMax);
      var loan = finance.computeLoan(a.valor, a.cand.taxa, prazo, { iof: a.cand.iof !== false });
      return {
        produtoId: a.cand.id, label: a.cand.label, valor: a.valor, prazo: prazo, taxa: a.cand.taxa,
        parcela: loan.parcela, cetAnual: loan.cetAnual, totalPago: loan.totalPago, recebido: loan.recebido
      };
    });
    var comb = combinar(contratos);
    var totalPego = contratos.reduce(function (s, c) { return s + c.valor; }, 0);
    var totalPago = contratos.reduce(function (s, c) { return s + c.totalPago; }, 0);
    var totalRecebido = contratos.reduce(function (s, c) { return s + c.recebido; }, 0);
    var cetMensal = finance.taxaPorVPVar(totalRecebido, comb.pagamentos);
    return {
      objetivo: objetivo, contratos: contratos, totalPego: totalPego, totalPago: totalPago,
      cetAnual: finance.mensalParaAnual(cetMensal),
      parcelaInicio: comb.inicio, parcelaMeio: comb.meio, parcelaFim: comb.fim,
      pagamentos: comb.pagamentos
    };
  }

  // menor prazo comum (feito por t) que mantém parcela inicial <= capacidade
  function menorPrazoFactivel(aloc, capacidade, tabelas) {
    for (var t = 6; t <= 240; t += 6) {
      var p = montarPlano('_', aloc, t, tabelas);
      if (p.parcelaInicio <= capacidade) return t;
    }
    return 240;
  }

  // maior valor possível mantendo parcela inicial <= capacidade (prazo longo)
  function maiorValor(cands, capacidade, maxN) {
    var s = cands.slice().sort(function (a, b) { return a.taxa - b.taxa; });
    var capRem = capacidade, out = [];
    for (var i = 0; i < s.length && out.length < maxN && capRem > 1; i++) {
      var c = s[i], n = c.prazoMax;
      var loanMax = finance.computeLoan(c.valorMax, c.taxa, n, { iof: c.iof !== false });
      var take = loanMax.parcela <= capRem ? c.valorMax : c.valorMax * (capRem / loanMax.parcela);
      take = clamp(take, 0, c.valorMax);
      if (take < c.valorMin) continue;
      var loan = finance.computeLoan(take, c.taxa, n, { iof: c.iof !== false });
      out.push({ cand: c, valor: take });
      capRem -= loan.parcela;
    }
    return out;
  }

  // candidatos a partir dos produtos elegíveis, na taxa média BACEN (estimativa)
  function candidatos(produtos, tabelas, elegiveis) {
    var media = tabelas.taxa_media_am || {};
    return elegiveis.map(function (id) {
      var p = produtos[id];
      return {
        id: id, label: p.label, taxa: media[id] != null ? media[id] : (p.taxa_min_am || 0.05),
        valorMin: p.valor_min, valorMax: p.valor_max, prazoMin: p.prazo_min, prazoMax: p.prazo_max,
        iof: p.iof
      };
    });
  }

  // ---- API principal ----
  function otimizarPrimeiro(opts) {
    var cands = candidatos(opts.produtos, opts.tabelas, opts.elegiveis || Object.keys(opts.produtos));
    var V = opts.valorDesejado, P = opts.capacidadeParcela, maxN = opts.maxContratos || 3;
    if (!cands.length || !(V > 0)) return { erro: 'Sem produtos elegíveis ou valor inválido.' };

    var alocV = alocarCheapestFirst(cands, V, maxN);

    // MENOR PARCELA: mesmo V, prazos longos (t grande)
    var menorParcela = montarPlano('menor_parcela', alocV.aloc, 240, opts.tabelas);
    // MENOR JUROS: mesmo V, menor prazo que cabe na capacidade (menos juros)
    var tJuros = menorPrazoFactivel(alocV.aloc, P, opts.tabelas);
    var menorJuros = montarPlano('menor_juros', alocV.aloc, tJuros, opts.tabelas);
    // MAIOR VALOR: maximiza principal com parcela <= capacidade (prazo longo)
    var alocMax = maiorValor(cands, P, maxN);
    var maiorVal = alocMax.length ? montarPlano('maior_valor', alocMax, 240, opts.tabelas)
      : { objetivo: 'maior_valor', contratos: [], totalPego: 0, totalPago: 0, cetAnual: 0, parcelaInicio: 0, parcelaMeio: 0, parcelaFim: 0, pagamentos: [] };

    // avisos de capacidade / atendimento do objetivo
    function flags(plano, alvoV) {
      var av = [];
      if (P && plano.parcelaInicio > P + 0.5) av.push('parcela inicial acima da sua capacidade');
      if (alvoV && plano.totalPego < alvoV - 1) av.push('não alcança o valor desejado com os limites dos produtos');
      return av;
    }
    menorParcela.avisos = flags(menorParcela, V);
    menorJuros.avisos = flags(menorJuros, V);
    maiorVal.avisos = [];
    if (P && maiorVal.parcelaInicio > P + 0.5) maiorVal.avisos.push('parcela no limite da capacidade');

    return {
      valorDesejado: V, capacidadeParcela: P, candidatos: cands,
      menorParcela: menorParcela, maiorValor: maiorVal, menorJuros: menorJuros
    };
  }

  return {
    otimizarPrimeiro: otimizarPrimeiro, candidatos: candidatos,
    alocarCheapestFirst: alocarCheapestFirst, combinar: combinar, montarPlano: montarPlano
  };
});
