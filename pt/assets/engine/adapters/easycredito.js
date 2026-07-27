/* ============================================================
   Credit GPS — adapters/easycredito.js  (adapter de parceiro REAL)
   Dois modos, ambos GATED por config (window.MELHOR):
     (A) LINK  — EASYCREDITO_LINK: URL parametrizada white-label (handoff).
                 Funciona já, com o SEU link de parceiro. Não traz números da
                 EasyCrédito; usa a estimativa local + CTA de handoff.
     (B) API   — EASYCREDITO_ENDPOINT + EASYCREDITO_TOKEN: consulta real de
                 proposta (ajuste `mapResposta` ao contrato deles quando tiver acesso).
   Sem nenhuma config -> retorna null (o roteador cai no mock).
   Depende de finance.js. UMD.
   ============================================================ */
(function (root, factory) {
  var G = typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this);
  var finance = (typeof require === 'function') ? require('../finance.js') : (G.CGPS && G.CGPS.finance);
  var api = factory(finance);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  G.CGPS = G.CGPS || {}; G.CGPS.adapters = G.CGPS.adapters || {}; G.CGPS.adapters.easycredito = api;
})(typeof self !== 'undefined' ? self : this, function (finance) {
  'use strict';

  function fill(tpl, req) {
    return String(tpl || '')
      .replace('{valor}', req.valor).replace('{prazo}', req.prazo)
      .replace('{produto}', req.produtoId).replace('{subid}', encodeURIComponent(req.subid || ''));
  }

  // AJUSTE ao contrato real da EasyCrédito quando tiver a documentação da parceria.
  function mapResposta(json, partner, req) {
    // Espera-se algo como uma lista de propostas; mapeia p/ o contrato interno.
    var props = (json && (json.propostas || json.offers || json.data)) || [];
    return props.map(function (p) {
      return {
        partnerId: partner.id, bank: p.instituicao || p.bank || partner.nome,
        source: 'easycredito', confirmada: true,
        approved: p.aprovado != null ? !!p.aprovado : (p.approved != null ? !!p.approved : true),
        approvedAmount: p.valorAprovado || p.approvedAmount || req.valor,
        interestRate: p.taxaMensal || p.interestRate || null,   // a.m.
        installments: p.parcelas || p.installments || req.prazo,
        installmentValue: p.valorParcela || p.installmentValue || null,
        CET: p.cetAnual || p.CET || null,                       // a.a.
        affiliateLink: p.link || p.affiliateLink || ''
      };
    });
  }

  function cfgGet(cfg, k) { return (cfg && cfg[k]) || (typeof window !== 'undefined' && window.MELHOR && window.MELHOR[k]) || ''; }

  // quote(partner, produtoDef, req, cfg) -> Promise<Offer|Offer[]|null>
  function quote(partner, produtoDef, req, cfg) {
    var endpoint = cfgGet(cfg, 'EASYCREDITO_ENDPOINT');
    var token = cfgGet(cfg, 'EASYCREDITO_TOKEN');
    var link = cfgGet(cfg, 'EASYCREDITO_LINK') || (partner && partner.link_real);

    // (B) modo API — endpoint pode ser o Worker da Cloudflare (token fica LÁ, não aqui);
    // token local é opcional (só para chamada direta ao parceiro, se um dia fizer sentido).
    if (endpoint && typeof fetch === 'function') {
      var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      return fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ produto: req.produtoId, valor: req.valor, prazo: req.prazo, subid: req.subid })
      }).then(function (r) { if (!r.ok) throw new Error('easycredito ' + r.status); return r.json(); })
        .then(function (j) { return mapResposta(j, partner, req); })
        .catch(function () { return null; }); // falhou -> roteador ignora (cai no mock via outros parceiros)
    }

    // (A) modo LINK (handoff): estimativa local + CTA para a plataforma da EasyCrédito
    if (link) {
      var taxa = (produtoDef.taxa_min_am || 0.03) + (partner.spread_am || 0);
      var loan = finance.computeLoan(req.valor, taxa, req.prazo, { iof: produtoDef.iof !== false });
      return Promise.resolve({
        partnerId: partner.id, bank: partner.nome, source: 'easycredito-link',
        confirmada: false, estimada: true, approved: null,
        approvedAmount: req.valor, interestRate: taxa, installments: req.prazo,
        installmentValue: loan.parcela, CET: loan.cetAnual, cetMensal: loan.cetMensal,
        custoTotal: loan.custoTotal, prob: null,
        handoff: true, affiliateLink: fill(link, req)
      });
    }

    return Promise.resolve(null); // sem config -> pula (roteador usa mock)
  }

  return { quote: quote, id: 'easycredito', mapResposta: mapResposta };
});
