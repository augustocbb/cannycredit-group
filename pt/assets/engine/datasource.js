/* ============================================================
   Credit GPS — datasource.js
   Carrega os dados estruturais (produtos/parceiros/tabelas).
   HOJE: JSON versionado em /dados. DEPOIS: Supabase (mesmo contrato).
   UMD: window.CGPS.datasource / require.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CGPS = root.CGPS || {}; root.CGPS.datasource = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var _injected = null;      // dados em memória (testes / Supabase futuro)
  var _cache = null;

  function inject(data) { _injected = data; _cache = null; }

  function _base() {
    var cfg = (typeof window !== 'undefined' && window.MELHOR) || {};
    return cfg.DADOS_BASE || 'dados/';
  }

  // Navegador: fetch dos 3 JSON. Node: fs.
  function _loadJson(name) {
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      return fetch(_base() + name).then(function (r) {
        if (!r.ok) throw new Error('falha ao carregar ' + name + ': ' + r.status);
        return r.json();
      });
    }
    // Node
    return new Promise(function (resolve, reject) {
      try {
        var fs = require('fs'), path = require('path');
        var p = path.join(__dirname, '..', '..', 'dados', name);
        resolve(JSON.parse(fs.readFileSync(p, 'utf8')));
      } catch (e) { reject(e); }
    });
  }

  // Ponto de troca para Supabase: quando SUPABASE_URL/ANON existirem, buscar de lá.
  // Contrato de retorno idêntico ao JSON. (Stub: cai no JSON por enquanto.)
  function _supabaseEnabled() {
    var cfg = (typeof window !== 'undefined' && window.MELHOR) || {};
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  }

  function load() {
    if (_injected) return Promise.resolve(_injected);
    if (_cache) return Promise.resolve(_cache);
    // Supabase: tabelas dinâmicas sobrepõem o JSON quando configurado (fallback total ao JSON).
    var be = (typeof self !== 'undefined' && self.CGPS && self.CGPS.backend) || null;
    var pTab = be ? be.loadTabelas() : Promise.resolve(null);
    return Promise.all([
      _loadJson('produtos.json'), _loadJson('parceiros.json'), _loadJson('tabelas.json'),
      pTab.catch(function () { return null; })
    ]).then(function (r) {
      var tabelas = r[3] || r[2];                 // banco vence; JSON é o fallback
      _cache = { produtos: r[0].produtos || r[0], parceiros: r[1].parceiros || r[1], tabelas: tabelas };
      return _cache;
    });
  }

  return { load: load, inject: inject, _supabaseEnabled: _supabaseEnabled };
});
