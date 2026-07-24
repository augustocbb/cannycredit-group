/* ============================================================
   Credit GPS — adapters/index.js
   Roteador da Etapa 2: dispara os adapters dos parceiros elegíveis EM PARALELO
   e faz streaming (onResult por oferta). Se o adapter real não responder
   (sem credencial / erro), cai no mock para aquele parceiro. UMD.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CGPS = root.CGPS || {}; root.CGPS.adaptersRouter = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function registry() {
    if (typeof require === 'function' && typeof module !== 'undefined') {
      return { mock: require('./mock.js'), easycredito: require('./easycredito.js') };
    }
    var G = typeof self !== 'undefined' ? self : this;
    return (G.CGPS && G.CGPS.adapters) || {};
  }

  // opts: { request, parceiros, produtos, cfg, onResult }
  // request: { produtoId, valor, prazo, perfil, subid }
  function quoteAll(opts) {
    var reg = registry();
    var request = opts.request, produtos = opts.produtos, cfg = opts.cfg || {};
    var produtoDef = produtos[request.produtoId] || {};
    var elig = (opts.parceiros || []).filter(function (p) {
      return (p.produtos || []).indexOf(request.produtoId) >= 0;
    });

    var promises = elig.map(function (p) {
      var adapter = reg[p.adapter] || reg.mock;
      return Promise.resolve().then(function () { return adapter.quote(p, produtoDef, request, cfg); })
        .then(function (res) {
          var offers = res == null ? [] : (Array.isArray(res) ? res : [res]);
          if (!offers.length && reg.mock && adapter !== reg.mock) {
            return reg.mock.quote(p, produtoDef, request, cfg).then(function (o) { return o ? [o] : []; });
          }
          return offers;
        })
        .then(function (offers) {
          if (opts.onResult) offers.forEach(function (o) { try { opts.onResult(o); } catch (e) {} });
          return offers;
        })
        .catch(function () { return []; });
    });

    return Promise.all(promises).then(function (arrs) {
      return arrs.reduce(function (a, b) { return a.concat(b); }, []);
    });
  }

  return { quoteAll: quoteAll, registry: registry };
});
