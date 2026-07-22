/* ============================================================
   Credit GPS — motor financeiro (finance.js)
   Funções PURAS: Price/SAC, IOF, e CET a.a. REAL via IRR (Newton/bisseção).
   UMD: funciona no navegador (window.CGPS.finance) e em Node (require).
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CGPS = root.CGPS || {}; root.CGPS.finance = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- conversões de taxa ----
  function anualParaMensal(iAnual) { return Math.pow(1 + iAnual, 1 / 12) - 1; }
  function mensalParaAnual(iMensal) { return Math.pow(1 + iMensal, 12) - 1; }

  // ---- parcela (Tabela Price / PMT) ----
  function pmt(pv, i, n) {
    if (!(pv > 0) || !(n > 0)) return 0;
    if (i <= 0) return pv / n;
    return pv * i / (1 - Math.pow(1 + i, -n));
  }

  // ---- principal a partir da parcela (inverso do PMT) ----
  function pvFromPmt(parcela, i, n) {
    if (!(parcela > 0) || !(n > 0)) return 0;
    if (i <= 0) return parcela * n;
    return parcela * (1 - Math.pow(1 + i, -n)) / i;
  }

  // ---- cronograma Price ----
  function priceSchedule(pv, i, n) {
    var parcela = pmt(pv, i, n), saldo = pv, linhas = [];
    for (var k = 1; k <= n; k++) {
      var juros = saldo * i;
      var amort = parcela - juros;
      saldo = Math.max(0, saldo - amort);
      linhas.push({ periodo: k, parcela: parcela, juros: juros, amortizacao: amort, saldo: saldo });
    }
    return linhas;
  }

  // ---- cronograma SAC (amortização constante) ----
  function sacSchedule(pv, i, n) {
    var amort = pv / n, saldo = pv, linhas = [];
    for (var k = 1; k <= n; k++) {
      var juros = saldo * i;
      var parcela = amort + juros;
      saldo = Math.max(0, saldo - amort);
      linhas.push({ periodo: k, parcela: parcela, juros: juros, amortizacao: amort, saldo: saldo });
    }
    return linhas;
  }

  // ---- IOF (pessoa física, crédito) ----
  // Aproximação MVP: fixo 0,38% + diário 0,0082%/dia sobre o principal, teto 365 dias.
  var IOF_FIXO = 0.0038, IOF_DIA = 0.000082, IOF_TETO_DIAS = 365;
  function iof(principal, dias) {
    if (!(principal > 0)) return 0;
    var d = Math.min(Math.max(0, dias || 0), IOF_TETO_DIAS);
    return principal * (IOF_FIXO + IOF_DIA * d);
  }

  // ---- IRR: taxa mensal que iguala 'recebido' ao VP das parcelas ----
  // f(r) = Σ parcela/(1+r)^k − recebido. Decrescente em r → bisseção robusta.
  function taxaPorVP(recebido, parcela, n, lo, hi, iters) {
    if (!(recebido > 0) || !(parcela > 0) || !(n > 0)) return 0;
    lo = (lo == null ? 0 : lo); hi = (hi == null ? 5 : hi); iters = iters || 100;
    function vp(r) {
      var s = 0; for (var k = 1; k <= n; k++) s += parcela / Math.pow(1 + r, k); return s;
    }
    // garante mudança de sinal
    if (vp(lo) - recebido < 0) return lo;
    if (vp(hi) - recebido > 0) return hi;
    var r = 0;
    for (var it = 0; it < iters; it++) {
      r = (lo + hi) / 2;
      var f = vp(r) - recebido;
      if (Math.abs(f) < 1e-8) break;
      if (f > 0) lo = r; else hi = r;
    }
    return r;
  }

  // ---- CET completo de um empréstimo ----
  // O cliente QUER 'valor' na mão. IOF/tarifas (se financiados) entram na dívida;
  // a parcela é calculada sobre o financiado, mas o CET usa o que ele recebeu.
  // opts: { dias, tarifas, seguros, financiarCustos (default true), sistema 'price'|'sac' }
  function computeLoan(valor, iMensal, n, opts) {
    opts = opts || {};
    var dias = opts.dias != null ? opts.dias : n * 30;
    var tarifas = opts.tarifas || 0;
    var seguros = opts.seguros || 0;
    var custoIof = (opts.iof === false) ? 0 : iof(valor + tarifas, dias);
    var financiarCustos = opts.financiarCustos !== false;
    var custos = custoIof + tarifas + seguros;
    var financiado = financiarCustos ? valor + custos : valor;
    var recebido = financiarCustos ? valor : valor - custos;

    var parcela, totalPago;
    if (opts.sistema === 'sac') {
      var sched = sacSchedule(financiado, iMensal, n);
      totalPago = sched.reduce(function (s, l) { return s + l.parcela; }, 0);
      // para SAC o "parcela" representativa é a primeira (maior)
      parcela = sched.length ? sched[0].parcela : 0;
      var cetMensalSac = taxaPorVPVar(recebido, sched.map(function (l) { return l.parcela; }));
      return {
        valor: valor, recebido: recebido, financiado: financiado, iof: custoIof,
        tarifas: tarifas, seguros: seguros, sistema: 'sac', n: n,
        taxaMensal: iMensal, taxaAnual: mensalParaAnual(iMensal),
        parcela: parcela, primeiraParcela: parcela,
        ultimaParcela: sched.length ? sched[sched.length - 1].parcela : 0,
        totalPago: totalPago, custoTotal: totalPago - recebido,
        cetMensal: cetMensalSac, cetAnual: mensalParaAnual(cetMensalSac)
      };
    }
    parcela = pmt(financiado, iMensal, n);
    totalPago = parcela * n;
    var cetMensal = taxaPorVP(recebido, parcela, n);
    return {
      valor: valor, recebido: recebido, financiado: financiado, iof: custoIof,
      tarifas: tarifas, seguros: seguros, sistema: 'price', n: n,
      taxaMensal: iMensal, taxaAnual: mensalParaAnual(iMensal),
      parcela: parcela, primeiraParcela: parcela, ultimaParcela: parcela,
      totalPago: totalPago, custoTotal: totalPago - recebido,
      cetMensal: cetMensal, cetAnual: mensalParaAnual(cetMensal)
    };
  }

  // IRR para fluxo de parcelas variáveis (SAC)
  function taxaPorVPVar(recebido, parcelas, lo, hi, iters) {
    if (!(recebido > 0) || !parcelas || !parcelas.length) return 0;
    lo = (lo == null ? 0 : lo); hi = (hi == null ? 5 : hi); iters = iters || 100;
    function vp(r) {
      var s = 0; for (var k = 0; k < parcelas.length; k++) s += parcelas[k] / Math.pow(1 + r, k + 1); return s;
    }
    if (vp(lo) - recebido < 0) return lo;
    if (vp(hi) - recebido > 0) return hi;
    var r = 0;
    for (var it = 0; it < iters; it++) {
      r = (lo + hi) / 2; var f = vp(r) - recebido;
      if (Math.abs(f) < 1e-8) break;
      if (f > 0) lo = r; else hi = r;
    }
    return r;
  }

  return {
    anualParaMensal: anualParaMensal,
    mensalParaAnual: mensalParaAnual,
    pmt: pmt,
    pvFromPmt: pvFromPmt,
    priceSchedule: priceSchedule,
    sacSchedule: sacSchedule,
    iof: iof,
    taxaPorVP: taxaPorVP,
    taxaPorVPVar: taxaPorVPVar,
    computeLoan: computeLoan,
    _const: { IOF_FIXO: IOF_FIXO, IOF_DIA: IOF_DIA, IOF_TETO_DIAS: IOF_TETO_DIAS }
  };
});
