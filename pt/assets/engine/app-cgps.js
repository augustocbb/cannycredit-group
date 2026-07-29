/* ============================================================
   Credit GPS — app-cgps.js (simples e direto)
   • O OBJETIVO troca o quadro (capacidade / valor / dívidas).
   • BUSCAR pré-carrega a ESTIMATIVA (local, média BACEN).
   • COTAR COM INFORMAÇÕES carrega as infos reais (plataformas/proposta).
   Ativa só se existir #cgps.
   ============================================================ */
(function () {
  'use strict';
  var C = window.CGPS || {};
  var F = C.finance, EL = C.eligibility, OPT = C.optimizer, CF = C.cashflow, CAP = C.capacidade,
      DSRC = C.datasource, ROUTER = C.adaptersRouter, BE = C.backend, CONSENT = C.consent;
  var CFG = window.MELHOR || {};
  var root = document.getElementById('cgps');
  if (!root || !F || !OPT || !CF || !DSRC) return;
  var DATA = null, STATE = null, obj = 'capacidade', pref = 'menor_juros';
  // O ato de consentir nesta tela é o clique no "Cotar agora" (não há checkbox).
  var METODO_CONSENT = 'clique_botao_cotar';
  // Produto de entrada: pessoal sem garantia. Ciclo mais curto — é o único que vai
  // para cotação real; os outros continuam disponíveis como estimativa, porque
  // capacidade.js e cashflow.js precisam de ver todas as modalidades para calcular
  // teto combinado e troca de dívida.
  var PRODUTO_FOCO = 'pessoal';

  function $(id) { return document.getElementById(id); }
  function num(id) { var e = $(id); return e ? parseFloat(e.value) || 0 : 0; }
  function val(id) { var e = $(id); return e ? e.value : ''; }
  function chk(id) { var e = $(id); return !!(e && e.checked); }
  function brl(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0); }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 1 : d).replace('.', ',') + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function subid() { try { var s = JSON.parse(localStorage.getItem('me_utm') || '{}'); return s.utm_content || s.utm_campaign || ''; } catch (e) { return ''; } }
  var IMP = { alta: 5, media: 3, baixa: 2 };
  var PREF_LABEL = { menor_parcela: 'menor parcela', menor_juros: 'menor juros', maior_valor: 'maior valor' };
  function planoDoPref(alt, p) { return p === 'menor_parcela' ? alt.menorParcela : (p === 'maior_valor' ? alt.maiorValor : alt.menorJuros); }
  function freq() { return DATA.tabelas.atualizado_em ? ' · atualizado em ' + esc(DATA.tabelas.atualizado_em) : ''; }

  function perfil() {
    return { renda: num('cg-renda'), tipoRenda: val('cg-tiporenda'), scoreFaixa: val('cg-score') || 'medio',
      outrosCompromissos: 0, temImovel: chk('cg-imovel'), temVeiculo: chk('cg-veiculo'), temFgts: chk('cg-fgts'),
      sacaAniversario: chk('cg-fgts'), temDivida: dividas().length > 0, consignadoAtual: 0 };
  }
  function elegiveis(pf) { return Object.keys(DATA.produtos).filter(function (id) { return EL.elegivel(id, DATA.produtos[id], pf).ok; }); }
  function tipoLabel(t) {
    return { cartao_rotativo: 'Cartão (rotativo)', cheque_especial: 'Cheque especial', pix_parcelado: 'Pix parcelado',
      cartao_parcelado: 'Cartão parcelado', consignado: 'Consignado', pessoal: 'Empréstimo pessoal', outro: 'Outra dívida' }[t] || t;
  }
  function dividas() {
    var out = [];
    root.querySelectorAll('#cg-dividas .cg-divrow').forEach(function (r) {
      var saldo = parseFloat((r.querySelector('.cg-divsaldo') || {}).value) || 0; if (saldo <= 0) return;
      var tipo = (r.querySelector('.cg-divtipo') || {}).value || 'outro';
      var parcela = parseFloat((r.querySelector('.cg-divparc') || {}).value) || 0;
      var imp = (r.querySelector('.cg-divimp') || {}).value || 'media';
      var atraso = parseFloat((r.querySelector('.cg-divatraso') || {}).value) || 0;
      var taxa = ((DATA && DATA.tabelas.divida_cara_am) || {})[tipo]; if (taxa == null) taxa = 0.05;
      if (!parcela) parcela = saldo * taxa;
      out.push({ nome: tipoLabel(tipo), tipo: tipo, saldo: saldo, parcela: parcela, taxa_am: taxa, importancia: IMP[imp] || 3, maxAtraso: atraso });
    });
    return out;
  }

  // ---- troca de quadro ----
  function swapObj(o) {
    obj = o;
    root.querySelectorAll('.cg-objbtn').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-obj') === o); });
    root.querySelectorAll('.cg-quadro').forEach(function (q) { q.hidden = (q.getAttribute('data-obj') !== o); });
    $('cg-estimativa').innerHTML = ''; $('cg-cotar-wrap').hidden = true;
    var frm = $('cg-cotar-form'); if (frm) frm.hidden = true;
    var g = $('cg-garantia'); if (g) g.hidden = true;
    $('cg-cotacao').innerHTML = ''; setStatus('');
    var bb = $('cg-buscar'); if (bb) bb.classList.remove('cg-done', 'cg-busy');
    var capc = $('cg-cap-common'); if (capc) capc.hidden = (o === 'comparar');
  }

  // ---- BUSCAR: estimativa ----
  function buscar() {
    if (!DATA) return;
    var cap = num('cg-capacidade'), pf = perfil(), elig = elegiveis(pf);
    STATE = { obj: obj, cap: cap, pf: pf, elig: elig };
    if (obj === 'capacidade' && CAP) {
      var margem = EL.margemConsignavel(pf, DATA.tabelas);
      var r = CAP.analisar({ produtos: DATA.produtos, tabelas: DATA.tabelas, elegiveis: elig, margem: margem,
        capacidade: cap, valorBem: num('cg-valorbem'), saldoFgts: num('cg-saldofgts') });
      var top = r.porProduto.filter(function (p) { return p.max > 0; })[0];
      STATE.capResult = r; STATE.pid = top ? top.id : (elig[0] || 'pessoal'); STATE.reqValor = top ? top.max : cap * 20; STATE.reqPrazo = top ? top.prazo : 24;
      renderCap(r);
    } else if (obj === 'dividas') {
      var divs = dividas();
      if (!divs.length) { $('cg-estimativa').innerHTML = '<div class="cg-warn">Adicione ao menos uma dívida.</div>'; return; }
      var media = DATA.tabelas.taxa_media_am || {};
      var barato = elig.map(function (id) { return { id: id, taxa: media[id] != null ? media[id] : DATA.produtos[id].taxa_min_am, iof: DATA.produtos[id].iof, prazo: DATA.produtos[id].prazo_max }; })
        .sort(function (a, b) { return a.taxa - b.taxa; })[0];
      var rc = CF.analisar({ dividas: divs, orcamento: cap, caixaAlvo: num('cg-caixa-alvo'),
        novoProduto: barato ? { taxa_am: barato.taxa, prazo: barato.prazo, iof: barato.iof } : null, horizonte: 12 });
      STATE.cashResult = rc; STATE.pid = barato ? barato.id : (elig[0] || 'pessoal');
      STATE.reqValor = rc.emprestimoMinimo ? rc.emprestimoMinimo.valor : 0; STATE.reqPrazo = barato ? barato.prazo : 24;
      renderCash(rc);
    } else if (obj === 'comparar') {
      var ca = val('cg-cmpA'), cb = val('cg-cmpB');
      var cval = num('cg-cmp-valor'), cpz = parseInt(val('cg-cmp-prazo'), 10) || 24;
      if (!ca || !cb || ca === cb) { $('cg-estimativa').innerHTML = '<div class="cg-warn">Escolha dois produtos diferentes para comparar.</div>'; return; }
      var pA = DATA.produtos[ca], pB = DATA.produtos[cb];
      var lA = F.computeLoan(cval, rateOf(ca), cpz, { iof: pA.iof, sistema: pA.sistema || 'price' });
      var lB = F.computeLoan(cval, rateOf(cb), cpz, { iof: pB.iof, sistema: pB.sistema || 'price' });
      STATE.cmp = { a: ca, b: cb, lA: lA, lB: lB };
      STATE.pid = (lA.totalPago <= lB.totalPago) ? ca : cb; STATE.reqValor = cval; STATE.reqPrazo = cpz;
      renderCompare(ca, cb, lA, lB, cval, cpz);
    } else {
      var valor = num('cg-valor');
      var alt = OPT.otimizarPrimeiro({ valorDesejado: valor, capacidadeParcela: cap > 0 ? cap : 1e9, produtos: DATA.produtos, tabelas: DATA.tabelas, elegiveis: elig, maxContratos: 3 });
      var plano = planoDoPref(alt, pref), c0 = plano && plano.contratos[0];
      STATE.alt = alt; STATE.valor = valor; STATE.pid = c0 ? c0.produtoId : (elig[0] || 'pessoal'); STATE.reqValor = c0 ? c0.valor : valor; STATE.reqPrazo = c0 ? c0.prazo : 24;
      renderAlt(alt);
    }
    $('cg-cotar-wrap').hidden = false;
    var gar = $('cg-garantia'); if (gar) gar.hidden = (obj === 'dividas' || obj === 'comparar'); // garantias incluíveis após a 1ª simulação
  }

  // taxa de referência do produto (média BACEN quando houver; senão a mínima do produto)
  function rateOf(id) { var m = (DATA.tabelas.taxa_media_am) || {}; return m[id] != null ? m[id] : DATA.produtos[id].taxa_min_am; }

  // ---- COMPARAR: dois produtos lado a lado ----
  function renderCompare(a, b, lA, lB, valor, prazo) {
    var pA = DATA.produtos[a], pB = DATA.produtos[b];
    var aWins = lA.totalPago <= lB.totalPago;
    var diff = Math.abs(lA.totalPago - lB.totalPago);
    var vencedor = aWins ? pA.label : pB.label;
    function rowr(k, v, hl) { return '<div class="cg-cmp-row"><span>' + k + '</span><b' + (hl ? ' class="cg-ok"' : '') + '>' + v + '</b></div>'; }
    function card(p, r, win) {
      return '<div class="cg-cmp-card' + (win ? ' win' : '') + '">' +
        (win ? '<span class="cg-cmp-badge">✓ mais barato</span>' : '') +
        '<div class="cg-cmp-name">' + esc(p.label) + '</div>' +
        '<div class="cg-cmp-parc"><b>' + brl(r.parcela) + '</b><span>/mês</span></div>' +
        '<div class="cg-cmp-rows">' +
        rowr('Taxa', pct(r.taxaMensal, 2) + '/mês') +
        rowr('CET', pct(r.cetAnual, 1) + '/ano') +
        rowr('Você recebe', brl(r.recebido)) +
        rowr('Total pago', brl(r.totalPago), win) +
        rowr('Custo do crédito', brl(r.custoTotal), win) +
        '</div></div>';
    }
    $('cg-estimativa').innerHTML =
      '<div class="cg-selo est">Simulação · média BACEN' + freq() + '</div>' +
      '<div class="cg-cmp-verdict"><b>' + esc(vencedor) + '</b> sai <b>' + brl(diff) + '</b> mais barato no total — ' +
      brl(valor) + ' em ' + prazo + ' meses, mesmas condições.</div>' +
      '<div class="cg-cmp-cards">' + card(pA, lA, aWins) + card(pB, lB, !aWins) + '</div>' +
      '<p class="cg-fine">Mesmo valor e prazo nos dois; taxa média de mercado (a final depende de análise). Não é oferta nem garantia de aprovação.</p>';
  }

  // Envolve o buscar: passarinho "pula" (carregando) e depois dá joinha quando os dados entram.
  function runBuscar(btn) {
    if (btn) { btn.classList.remove('cg-done'); btn.classList.add('cg-busy'); }
    setTimeout(function () {
      buscar();
      if (btn) {
        btn.classList.remove('cg-busy');
        if (!$('cg-estimativa').querySelector('.cg-warn')) btn.classList.add('cg-done');
      }
      if (BE && STATE) BE.track('buscar', { objetivo: STATE.obj, produto: STATE.pid, valor: STATE.reqValor, prazo: STATE.reqPrazo });
    }, 420);
  }

  // ---- render estimativas ----
  var ICON = { pessoal: '💵', consignado: '📋', fgts: '🪙', garantia: '🔑', portabilidade: '🔄' };
  function renderCap(r) {
    var cards = r.porProduto.map(function (p) {
      var d = p.max > 0;
      return '<div class="cg-cap-item' + (d ? '' : ' off') + '"><div class="cg-cap-ico">' + (ICON[p.id] || '💳') + '</div>' +
        '<div class="cg-cap-b"><div class="cg-cap-h">' + esc(p.label) + '</div>' +
        '<div class="cg-cap-v">' + (d ? 'até ' + brl(p.max) : '—') + '</div>' +
        '<div class="cg-cap-m">' + (d ? 'parcela ~' + brl(p.parcelaNoMax) + '/mês · ' : '') + esc(p.motivo) + '</div></div></div>';
    }).join('');
    $('cg-estimativa').innerHTML = '<div class="cg-selo est">Estimativa · média BACEN' + freq() + '</div>' +
      '<div class="cg-captotal"><span>Você pode pegar até</span><b>' + brl(r.total) + '</b></div>' +
      '<div class="cg-caps">' + cards + '</div>' +
      '<p class="cg-fine">' + esc(r.nota) + ' Não é oferta nem garantia de aprovação.</p>';
  }
  function comboTxt(pl) { return (!pl || !pl.contratos.length) ? '—' : pl.contratos.map(function (c) { return esc(c.label.split(' (')[0]) + ' ' + brl(c.valor) + '/' + c.prazo + 'm'; }).join(' + '); }
  function altCard(t, dica, pl, p) {
    var on = p === pref;
    var steps = (Math.abs(pl.parcelaInicio - pl.parcelaFim) > 1)
      ? '<div class="cg-alt-steps"><span>início <b>' + brl(pl.parcelaInicio) + '</b></span><span>meio <b>' + brl(pl.parcelaMeio) + '</b></span><span>fim <b>' + brl(pl.parcelaFim) + '</b></span></div>'
      : '<div class="cg-alt-steps"><span>parcela <b>' + brl(pl.parcelaInicio) + '</b> (fixa)</span></div>';
    return '<button type="button" class="cg-alt' + (on ? ' on' : '') + '" data-pref="' + p + '"><div class="cg-alt-h">' + esc(t) + (on ? ' ✓' : '') + '</div>' +
      '<div class="cg-alt-d">' + esc(dica) + '</div><div class="cg-alt-combo">' + comboTxt(pl) + '</div>' + steps +
      '<div class="cg-alt-grid"><div><span>Você pega</span><b>' + brl(pl.totalPego) + '</b></div>' +
      '<div><span>Paga ao final</span><b>' + brl(pl.totalPago) + '</b></div><div><span>CET</span><b>' + pct(pl.cetAnual, 1) + '</b></div></div></button>';
  }
  function renderAlt(alt) {
    if (alt.erro) { $('cg-estimativa').innerHTML = '<div class="cg-warn">' + esc(alt.erro) + '</div>'; return; }
    $('cg-estimativa').innerHTML = '<div class="cg-selo est">Estimativa · média BACEN' + freq() + '</div>' +
      '<h2 class="cg-q" style="font-size:17px">Para ' + brl(alt.valorDesejado) + ', priorizando <u>' + esc(PREF_LABEL[pref]) + '</u>:</h2>' +
      '<div class="cg-alts">' + altCard('Menor parcela', 'pago menos por mês', alt.menorParcela, 'menor_parcela') +
      altCard('Menor juros', 'pago menos no total', alt.menorJuros, 'menor_juros') +
      altCard('Maior valor', 'o máximo que cabe', alt.maiorValor, 'maior_valor') + '</div>' +
      '<p class="cg-fine">Toque num cartão para trocar a prioridade. Combinamos até 3 contratações. Estimativa; a taxa final depende de análise.</p>';
    $('cg-estimativa').querySelectorAll('.cg-alt').forEach(function (b) {
      b.addEventListener('click', function () { pref = b.getAttribute('data-pref'); syncPref(); var c0 = planoDoPref(STATE.alt, pref).contratos[0]; if (c0) { STATE.pid = c0.produtoId; STATE.reqValor = c0.valor; STATE.reqPrazo = c0.prazo; } renderAlt(STATE.alt); });
    });
  }
  function renderCash(r) {
    var tipos = Object.keys(r.porTipo).map(function (t) { return tipoLabel(t) + ' ' + brl(r.porTipo[t]); }).join(' · ');
    var linhas = r.planoDiv.map(function (p) { return '<tr><td>' + esc(p.nome) + '</td><td>' + brl(p.saldo) + '</td><td>' + (p.adiarMeses > 0 ? 'segura ' + p.adiarMeses + ' mês(es) → libera ' + brl(p.cashFree) : 'mantém em dia') + '</td></tr>'; }).join('');
    $('cg-estimativa').innerHTML = '<div class="cg-debt ' + (r.fecha === false ? 'bad' : 'good') + '"><div class="cg-debt-h">Você deve ~' + brl(r.total) + '</div>' +
      '<p class="cg-fine">' + esc(tipos) + '</p><table class="cg-cftab"><tr><th>Dívida</th><th>Saldo</th><th>Plano</th></tr>' + linhas + '</table>' +
      '<div class="cg-alt-grid" style="margin-top:10px"><div><span>Caixa livre agora</span><b>' + brl(r.caixaLivre) + '</b></div>' +
      '<div><span>Empréstimo mínimo</span><b>' + (r.emprestimoMinimo ? brl(r.emprestimoMinimo.valor) : 'R$ 0') + '</b></div>' +
      '<div><span>Fecha?</span><b>' + (r.fecha === false ? 'não' : (r.fecha ? 'sim' : '—')) + '</b></div></div>' +
      '<p class="cg-debt-rec">' + esc(r.recomendacao) + '</p><p class="cg-fine">' + esc(r.aviso) + '</p></div>';
  }

  // ---- COTAR: infos reais ----
  function cotarReal() {
    if (!STATE) return Promise.resolve();
    setStatus('Consultando as plataformas…', true);
    var box = $('cg-cotacao'); box.innerHTML = '';
    if (STATE.obj === 'capacidade' && STATE.capResult) {
      // Só o produto-foco vai para cotação real. Os outros continuam a aparecer na
      // estimativa (o teto combinado depende deles), mas não geram lead: cada
      // modalidade extra é um ciclo de aprovação mais longo, e a v1 optou pelo curto.
      var reqs = STATE.capResult.porProduto.filter(function (p) { return p.max > 0 && p.id === PRODUTO_FOCO; });
      return Promise.all(reqs.map(function (p) {
        return ROUTER.quoteAll({ request: { produtoId: p.id, valor: p.max, prazo: p.prazo, perfil: STATE.pf, subid: subid() }, parceiros: DATA.parceiros, produtos: DATA.produtos, cfg: CFG })
          .then(function (offers) { return { p: p, offers: offers || [] }; });
      })).then(function (all) {
        var total = 0, blocos = [];
        all.forEach(function (x) {
          if (!x.offers.length) return;
          var best = x.offers.reduce(function (m, o) { return Math.max(m, o.approvedAmount || 0); }, 0); total += best;
          var rows = x.offers.slice().sort(function (a, b) { return (b.approvedAmount || 0) - (a.approvedAmount || 0); })
            .map(function (o) { return '<div class="cg-plat-row"><span>' + esc(o.bank) + '</span><span>' + brl(o.approvedAmount) + ' · CET ' + pct(o.CET, 1) + (o.prob != null ? ' · aprov ~' + pct(o.prob, 0) : '') + '</span></div>'; }).join('');
          blocos.push('<div class="cg-plat-prod"><div class="cg-plat-h">' + esc(x.p.label) + ' — até <b>' + brl(best) + '</b></div>' + rows + '</div>');
        });
        // Quais modalidades tinham teto na estimativa mas ficaram de fora da cotação.
        // Sem isto o utilizador vê menos linhas do que na estimativa e não sabe porquê.
        var deFora = STATE.capResult.porProduto
          .filter(function (p) { return p.max > 0 && p.id !== PRODUTO_FOCO; })
          .map(function (p) { return (DATA.produtos[p.id] || {}).label || p.id; });
        var varias = deFora.length > 1;
        var nota = deFora.length
          ? '<p class="cg-fine">Cotamos ' + esc((DATA.produtos[PRODUTO_FOCO] || {}).label || PRODUTO_FOCO).toLowerCase() +
            '. ' + esc(deFora.join(', ')) + (varias ? ' continuam' : ' continua') +
            ' acima como estimativa — ainda não cotamos ' + (varias ? 'essas modalidades' : 'essa modalidade') + '.</p>'
          : '';
        box.innerHTML = '<div class="cg-selo conf">Disponível hoje nas plataformas</div>' +
          '<div class="cg-captotal conf"><span>Somando as modalidades</span><b>' + brl(total) + '</b></div>' +
          (blocos.join('') || '<p class="cg-fine">Sem retorno agora.</p>') + nota;
        setStatus('Cotação carregada. Compare pelo CET.');
      });
    } else {
      // A cotação real cobre o produto-foco. Se a melhor estimativa da pessoa foi
      // outra modalidade, cotamos pessoal na mesma (senão ela sairia sem nenhuma
      // proposta) e dizemos qual estimativa fica de fora — sem fingir que a
      // estimativa do consignado virou proposta.
      var outroProduto = STATE.pid !== PRODUTO_FOCO ? STATE.pid : null;
      var req = { produtoId: PRODUTO_FOCO, valor: STATE.reqValor || STATE.valor || STATE.cap * 20, prazo: STATE.reqPrazo || 24, perfil: STATE.pf, subid: subid() };
      var offers = [];
      return ROUTER.quoteAll({ request: req, parceiros: DATA.parceiros, produtos: DATA.produtos, cfg: CFG, onResult: function (o) { offers.push(o); renderProposta(offers, outroProduto); } })
        .then(function () { setStatus('Cotação carregada. Compare pelo CET.'); });
    }
  }
  function renderProposta(offers, outroProduto) {
    var arr = offers.slice().sort(function (a, b) { return a.installmentValue - b.installmentValue; }), best = arr[0];
    var nota = outroProduto && DATA.produtos[outroProduto]
      ? '<p class="cg-fine">Estas propostas são de ' + esc(DATA.produtos[PRODUTO_FOCO].label).toLowerCase() +
        '. Sua estimativa de ' + esc(DATA.produtos[outroProduto].label).toLowerCase() +
        ' continua acima, como estimativa — ainda não cotamos essa modalidade.</p>'
      : '';
    $('cg-cotacao').innerHTML = '<div class="cg-selo conf">Ofertas disponíveis</div>' + nota + '<div class="ofertas">' + arr.map(function (o) {
      var isBest = best && o.partnerId === best.partnerId;
      var realLink = (o.handoff || o.source === 'easycredito') && o.affiliateLink && o.affiliateLink.indexOf('go/') !== 0;
      var acao = realLink ? '<a class="btn small" href="' + esc(o.affiliateLink) + '" target="_blank" rel="noopener nofollow">Ir ao parceiro ↗</a>' : '<span class="cg-fine">a instituição vai te contatar</span>';
      return '<div class="oferta' + (isBest ? ' best' : '') + '"><div><span class="pnome">' + esc(o.bank) + '</span> <span class="cg-tag conf">Disponível</span>' + (isBest ? ' <span class="badge">Melhor</span>' : '') +
        '<div class="k">Taxa ' + pct(o.interestRate, 2) + '/mês · CET ' + pct(o.CET, 1) + '/ano' + (o.prob != null ? ' · aprov ~' + pct(o.prob, 0) : '') + '</div></div>' +
        '<div><div class="k">Parcela</div><div class="v">' + brl(o.installmentValue) + '</div></div>' +
        '<div><div class="k">Recebe</div><div class="v">' + brl(o.approvedAmount) + '</div></div><div class="act">' + acao + '</div></div>';
    }).join('') + '</div>';
  }
  function setStatus(t, loading) {
    var e = $('cg-status'); if (!e) return;
    e.classList.toggle('loading', !!loading);
    e.innerHTML = (loading ? '<span class="cg-bird-spin" aria-hidden="true"></span>' : '') + '<span>' + esc(t) + '</span>';
  }

  /** Injeta o texto de consentimento sob o botão, a partir da fonte única. */
  function renderConsentimento() {
    var alvo = $('cg-consent-txt');
    if (!alvo || !CONSENT) return;
    // O texto consentido vem primeiro e sozinho — é ele que é gravado. O complemento e
    // os links são informação de apoio, renderizados a seguir, e por isso não entram no
    // registro: o que a pessoa autorizou não muda porque mudámos um link.
    alvo.textContent = CONSENT.texto(METODO_CONSENT) + ' ' + CONSENT.complemento() + ' ';
    var a = document.createElement('a');
    a.href = 'direitos.html'; a.textContent = 'Seus direitos sobre os dados';
    alvo.appendChild(a);
    alvo.appendChild(document.createTextNode(' · '));
    var b = document.createElement('a');
    b.href = 'privacidade.html'; b.textContent = 'Política de Privacidade';
    alvo.appendChild(b);
  }

  function salvarLead(form) {
    var data = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name && el.name !== 'empresa') data[el.name] = el.value; });
    var st = STATE || {}; data.objetivo = st.obj; data.valor = st.reqValor; data.page_url = location.href; data.submitted_at = new Date().toISOString();
    // O consentimento aqui é o próprio submit: o botão é "Cotar agora" e o texto
    // acima dele descreve o compartilhamento. Só é `true` porque houve o clique —
    // se o form pudesse ser submetido de outra forma, isto teria de ser revisto.
    var reg = CONSENT ? CONSENT.registro(METODO_CONSENT, true) : { consentimento: true };
    // backend (Supabase): grava o lead com o registro de consentimento + UTM; silencioso se off
    // `produto` é o que foi REALMENTE cotado (e o que será distribuído), não a
    // modalidade que ganhou a estimativa. Desde que a cotação real passou a cobrir
    // só o produto-foco, os dois podem divergir — gravar st.pid aqui rotularia o
    // lead como "consignado" quando o que se pediu ao parceiro foi pessoal.
    // A estimativa fica em `extra`, que é onde ela é contexto e não promessa.
    if (BE) BE.saveLead({ nome: data.nome, telefone: data.telefone, email: data.email,
      objetivo: st.obj, produto: PRODUTO_FOCO, valor: st.reqValor, prazo: st.reqPrazo,
      consentimento: reg.consentimento, consent_versao: reg.consent_versao,
      consent_metodo: reg.consent_metodo, consent_texto: reg.consent_texto,
      extra: { produto_estimado: st.pid || null } });
    if (BE) BE.track('cotar', { objetivo: st.obj, produto: PRODUTO_FOCO, produto_estimado: st.pid, valor: st.reqValor });
    try { var s = JSON.parse(localStorage.getItem('me_utm') || '{}'); ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) { data[k] = s[k] || ''; }); data.referrer = s.referrer || ''; } catch (e) {}
    try { var l = JSON.parse(localStorage.getItem('me_leads') || '[]'); l.push(data); localStorage.setItem('me_leads', JSON.stringify(l)); } catch (e) {}
    try { if (window.fbq && CFG.PIXEL_ID) fbq('track', 'Lead', { content_name: 'cotacao' }); } catch (e) {}
    if (CFG.FORM_ENDPOINT) { try { fetch(CFG.FORM_ENDPOINT, { method: 'POST', headers: { 'Accept': 'application/json' }, body: new FormData(form) }); } catch (e) {} }
  }

  function syncPref() { root.querySelectorAll('.cg-opt').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-pref') === pref); }); }
  function addDivida() {
    var box = $('cg-dividas'); if (!box) return;
    var row = document.createElement('div'); row.className = 'cg-divrow';
    row.innerHTML = '<select class="cg-divtipo" aria-label="Tipo"><option value="cartao_rotativo">Cartão (rotativo)</option><option value="cheque_especial">Cheque especial</option><option value="pix_parcelado">Pix parcelado</option><option value="cartao_parcelado">Cartão parcelado</option><option value="consignado">Consignado</option><option value="outro">Outra</option></select>' +
      '<input class="cg-divsaldo" type="number" min="0" step="100" placeholder="Saldo (R$)" inputmode="numeric"><input class="cg-divparc" type="number" min="0" step="50" placeholder="Parcela/mês (opc.)" inputmode="numeric">' +
      '<select class="cg-divimp" aria-label="Importância"><option value="alta">Prioritária</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select>' +
      '<input class="cg-divatraso" type="number" min="0" max="12" step="1" value="0" placeholder="meses" inputmode="numeric" title="Meses que dá pra segurar"><button type="button" class="cg-divdel" aria-label="Remover">×</button>';
    box.appendChild(row);
  }

  // Popula os dropdowns de "Comparar 2" a partir dos produtos + dicas de taxa/prazo.
  function fillCompare() {
    var A = $('cg-cmpA'), B = $('cg-cmpB'); if (!A || !B) return;
    var opts = Object.keys(DATA.produtos).map(function (id) { return '<option value="' + id + '">' + esc(DATA.produtos[id].label) + '</option>'; }).join('');
    A.innerHTML = opts; B.innerHTML = opts;
    if (DATA.produtos.consignado) A.value = 'consignado';
    if (DATA.produtos.pessoal) B.value = 'pessoal';
    function hint(id) { var p = DATA.produtos[id]; return 'taxa média ~' + pct(rateOf(id), 2) + '/mês · ' + p.prazo_min + '–' + p.prazo_max + ' meses'; }
    function upd() { var ha = $('cg-cmpA-hint'), hb = $('cg-cmpB-hint'); if (ha) ha.textContent = hint(A.value); if (hb) hb.textContent = hint(B.value); }
    A.addEventListener('change', upd); B.addEventListener('change', upd); upd();
    var pr = $('cg-cmp-prazo'), out = $('cg-cmp-prazo-out');
    if (pr && out) pr.addEventListener('input', function () { out.textContent = pr.value + ' meses'; });
  }

  function bind() {
    fillCompare();
    renderConsentimento();
    root.querySelectorAll('.cg-objbtn').forEach(function (b) { b.addEventListener('click', function () { swapObj(b.getAttribute('data-obj')); }); });
    root.querySelectorAll('.cg-opt').forEach(function (b) { b.addEventListener('click', function () { pref = b.getAttribute('data-pref'); syncPref(); }); });
    var v = $('cg-valor'), vr = $('cg-valor-range'), o = $('cg-valor-out');
    function outv() { if (o) o.textContent = brl(num('cg-valor')); }
    if (v) v.addEventListener('input', function () { if (vr) vr.value = v.value; outv(); });
    if (vr) vr.addEventListener('input', function () { if (v) v.value = vr.value; outv(); }); outv();
    $('cg-buscar').addEventListener('click', function () { runBuscar($('cg-buscar')); });
    $('cg-incluir') && $('cg-incluir').addEventListener('click', function () { runBuscar($('cg-incluir')); }); // inclui garantia e recalcula
    $('cg-add-divida') && $('cg-add-divida').addEventListener('click', function () { addDivida(); });
    root.addEventListener('click', function (e) { if (e.target.classList && e.target.classList.contains('cg-divdel')) e.target.closest('.cg-divrow').remove(); });
    // cotar: revela o form; o submit carrega as infos
    $('cg-cotar').addEventListener('click', function () { var f = $('cg-cotar-form'); if (f) { f.hidden = false; f.querySelector('input[name=nome]').focus(); } this.style.display = 'none'; });
    var frm = $('cg-cotar-form');
    if (frm) frm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (frm.querySelector('[name=empresa]') && frm.querySelector('[name=empresa]').value) return;
      if (!frm.checkValidity()) { frm.reportValidity(); return; }
      var sub = frm.querySelector('button[type=submit]');
      sub.classList.remove('cg-done'); sub.classList.add('cg-busy');
      salvarLead(frm);
      cotarReal().then(function () { sub.classList.remove('cg-busy'); sub.classList.add('cg-done'); sub.textContent = 'Cotação pronta'; });
    });
  }

  var boot0 = $('cg-estimativa'); if (boot0) boot0.innerHTML = '<div class="cg-bootload"><span class="b"></span> Carregando o motor…</div>';
  DSRC.load().then(function (d) { DATA = d; bind(); addDivida(); syncPref(); swapObj('capacidade'); })
    .catch(function (e) { root.innerHTML = '<div class="cg-warn">Não foi possível carregar o motor. Rode o site por um servidor (python -m http.server).</div>'; if (window.console) console.error(e); });
})();
