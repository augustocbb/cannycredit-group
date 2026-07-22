/* ============================================================
   Credit GPS — testes das funções puras do motor.
   Rodar: node assets/engine/tests.js
   ============================================================ */
var F = require('./finance.js');
var EL = require('./eligibility.js');
var AP = require('./approval.js');
var PA = require('./pareto.js');
require('./approval.js');
var DS = require('./debtswap.js');
var OPT = require('./optimizer.js');
var CF = require('./cashflow.js');
var CAP = require('./capacidade.js');
var fs = require('fs');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= (tol || 0.01), msg + ' (got ' + a + ', exp ' + b + ')'); }

console.log('— finance —');
near(F.pmt(10000, 0.02, 12), 945.60, 0.1, 'pmt 10000@2%/12');
near(F.taxaPorVP(10000, F.pmt(10000, 0.02, 12), 12), 0.02, 1e-4, 'IRR identidade = taxa de entrada');
var L = F.computeLoan(10000, 0.02, 12, {});
ok(L.cetMensal > L.taxaMensal, 'CET mensal > taxa nominal quando há IOF');
ok(L.cetAnual > F.mensalParaAnual(L.taxaMensal) - 1e-9, 'CET anual >= taxa anual');
near(L.iof, 333.20, 0.5, 'IOF 10000/360d = 0,38% + 0,0082%*360');
var Lp = F.computeLoan(10000, 0.02, 12, { iof: false });
ok(Lp.iof === 0, 'iof:false zera IOF (ex.: portabilidade)');
var sac = F.sacSchedule(12000, 0.02, 12);
ok(sac[0].parcela > sac[11].parcela, 'SAC: 1a parcela > última (decrescente)');
ok(F.iof(10000, 99999) === F.iof(10000, 365), 'IOF diário tem teto de 365 dias');

console.log('— pareto —');
var objs = [{ key: 'custo', dir: 'min' }, { key: 'parc', dir: 'min' }, { key: 'cap', dir: 'max' }, { key: 'prob', dir: 'max', weight: 2 }];
var items = [
  { id: 'A', custo: 1000, parc: 100, cap: 5000, prob: 0.70 },
  { id: 'B', custo: 1200, parc: 90, cap: 5000, prob: 0.60 },
  { id: 'C', custo: 1500, parc: 80, cap: 5000, prob: 0.50 },
  { id: 'D', custo: 1100, parc: 110, cap: 5000, prob: 0.65 }
];
var fr = PA.frontier(items, objs).map(function (x) { return x.id; });
ok(fr.indexOf('D') < 0, 'D é dominado por A (não entra na fronteira)');
ok(fr.length === 3 && fr.indexOf('A') >= 0 && fr.indexOf('B') >= 0 && fr.indexOf('C') >= 0, 'fronteira = {A,B,C}');
var rec = PA.recomendada(items, objs);
ok(rec.id === 'A', 'recomendada com peso alto em prob = A');
ok(PA.svgFrontier(items, objs[1], objs[0], { recomendada: rec }).indexOf('<svg') === 0, 'svgFrontier gera SVG');

console.log('— eligibility —');
var pf = { renda: 3000, tipoRenda: 'aposentado', outrosCompromissos: 200, scoreFaixa: 'medio' };
near(EL.margemConsignavel(pf, { margem_consignavel: { inss: { emprestimo: 0.35 } } }), 1050, 0.01, 'margem consignável INSS 35%');
near(EL.capacidadeParcela(pf, { dti_max: 0.30 }), 700, 0.01, 'capacidade DTI 30% - compromissos');
ok(EL.elegivel('consignado', { elegibilidade: { requer_margem: true } }, { tipoRenda: 'autonomo' }).ok === false, 'autônomo não é elegível a consignado');
ok(EL.elegivel('garantia', { elegibilidade: { requer_garantia: true } }, { temImovel: true }).ok === true, 'com imóvel é elegível a garantia');

console.log('— approval —');
var p1 = AP.probabilidade({ base: 0.72, produtoId: 'consignado', perfil: pf, valor: 8000, parcela: 400, produtoDef: { valor_max: 100000 }, elegivel: true });
ok(p1 > 0.02 && p1 < 0.97, 'probabilidade dentro de [0.02, 0.97]');
var p2 = AP.probabilidade({ base: 0.72, produtoId: 'pessoal', perfil: { renda: 2000, outrosCompromissos: 0, scoreFaixa: 'baixo' }, valor: 40000, parcela: 1800, produtoDef: { valor_max: 50000 }, elegivel: true });
ok(p2 < p1, 'DTI alto + score baixo reduz a probabilidade');
ok(AP.probabilidade({ elegivel: false }) === 0, 'inelegível => probabilidade 0');

console.log('— debtswap —');
var tab = { divida_cara_am: { cartao_rotativo: 0.135 } };
var r = DS.analisar({ dividas: [{ tipo: 'cartao_rotativo', saldo: 5000 }], tabelas: tab, prazo: 24,
  opcoes: [{ id: 'portabilidade', label: 'Portabilidade', taxa_am: 0.014, iof: false }, { id: 'pessoal', label: 'Pessoal', taxa_am: 0.062 }] });
ok(r.vale === true, 'trocar rotativo por portabilidade vale a pena');
ok(r.melhor.id === 'portabilidade', 'melhor opção = portabilidade (mais barata)');
ok(r.economiaTotal > 0 && r.economiaTotal < r.totalSaldo * 4, 'economia positiva e realista (não alarmista)');
near(r.custoMensalAtual, 675, 1, 'custo mensal atual = saldo * taxa (5000*13,5%)');
var r2 = DS.analisar({ dividas: [{ tipo: 'x', saldo: 5000, taxa_am: 0.01 }], tabelas: {}, prazo: 24,
  opcoes: [{ id: 'pessoal', label: 'Pessoal', taxa_am: 0.062 }] });
ok(r2.vale === false, 'dívida já barata: nenhuma troca vale (recomenda quitar)');

console.log('— optimizer (1º empréstimo, combinação até 3) —');
var _prod = JSON.parse(fs.readFileSync(__dirname + '/../../dados/produtos.json', 'utf8')).produtos;
var _tab = JSON.parse(fs.readFileSync(__dirname + '/../../dados/tabelas.json', 'utf8'));
// 130k > maior produto elegível (consignado 100k) => força combinação; capacidade folgada p/ o teste ser robusto
var ro = OPT.otimizarPrimeiro({ valorDesejado: 130000, capacidadeParcela: 8000, produtos: _prod, tabelas: _tab,
  elegiveis: ['consignado', 'pessoal'], maxContratos: 3 });
ok(ro.menorParcela.contratos.length >= 2 && ro.menorParcela.contratos.length <= 3, 'combina 2–3 contratos para 130k');
near(ro.menorJuros.totalPego, 130000, 2000, 'menorJuros levanta ~ valor desejado');
ok(ro.menorJuros.totalPago <= ro.menorParcela.totalPago, 'menor juros paga <= no total que menor parcela');
ok(ro.menorParcela.parcelaInicio >= ro.menorParcela.parcelaFim - 0.5, 'parcela início >= fim (degrau ao quitar prazos curtos)');
ok(ro.maiorValor.totalPego >= ro.menorParcela.totalPego, 'maior valor levanta >= o valor desejado');
ok(ro.maiorValor.parcelaInicio <= 8000 + 1, 'maior valor respeita a capacidade de parcela');

console.log('— cashflow (já tem dívidas) —');
var rc = CF.analisar({
  dividas: [{ nome: 'Cartão', tipo: 'cartao_rotativo', saldo: 5000, parcela: 600, taxa_am: 0.135, importancia: 2, maxAtraso: 2 },
            { nome: 'Consignado', tipo: 'consignado', saldo: 20000, parcela: 800, taxa_am: 0.018, importancia: 5, maxAtraso: 0 }],
  orcamento: 1500, caixaAlvo: 3000, novoProduto: { taxa_am: 0.018, prazo: 24 }, horizonte: 12 });
ok(rc.total === 25000, 'estima total devido = 25k');
ok(rc.planoDiv[1].adiarMeses === 0, 'dívida importante (maxAtraso 0) não é adiada');
ok(Math.abs(rc.emprestimoMinimo.valor - 1800) < 1, 'empréstimo novo mínimo = alvo - adiamentos (3000-1200=1800)');
ok(rc.fecha === true, 'a conta fecha no orçamento');
near(rc.caixaLivre, 3000, 1, 'caixa livre atinge o alvo');
var rc2 = CF.analisar({ dividas: [{ nome: 'X', saldo: 30000, parcela: 2000, taxa_am: 0.05, importancia: 5, maxAtraso: 0 }],
  orcamento: 1500, caixaAlvo: 0, horizonte: 6 });
ok(rc2.fecha === false && rc2.mesesAperto.length > 0, 'orçamento insuficiente => não fecha, sinaliza aperto');

console.log('— capacidade (quanto dá pra pegar) —');
var rcap = CAP.analisar({ produtos: _prod, tabelas: _tab, elegiveis: ['consignado', 'garantia', 'pessoal', 'fgts'],
  margem: 1050, capacidade: 800, valorBem: 200000, saldoFgts: 5000 });
ok(rcap.total > 0, 'total estimado > 0');
ok(rcap.consignadoMax > 0, 'consignado limitado pela margem');
ok(rcap.porProduto.some(function (p) { return p.id === 'garantia' && p.max <= 200000 * 0.6 + 1; }), 'garantia respeita LTV do bem');
ok(rcap.porProduto.some(function (p) { return p.id === 'fgts' && p.max <= 5000 * 0.9 + 1; }), 'FGTS respeita saldo');
ok(rcap.total >= rcap.consignadoMax, 'total >= consignado sozinho');

console.log('\n' + (fail === 0 ? '✓ TODOS OS TESTES PASSARAM' : '✗ ' + fail + ' FALHA(S)') + ' — ' + pass + ' asserts ok, ' + fail + ' falhas');
if (fail) process.exit(1);
