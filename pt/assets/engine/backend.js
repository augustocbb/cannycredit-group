/* ============================================================
   Credit GPS — backend.js (Supabase REST, free-first)
   Sem SUPABASE_URL/ANON_KEY configurados -> tudo vira no-op
   (resolve null) e o site segue 100% estático como antes.

   saveLead(data)   -> INSERT public.leads   (RLS: anon insert-only)
   track(event, p)  -> INSERT public.events  (analytics próprio)
   loadTabelas()    -> SELECT public.tabelas (key='br') ou null
   UMD: window.CGPS.backend / require.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CGPS = root.CGPS || {}; root.CGPS.backend = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cfg() { return (typeof window !== 'undefined' && window.MELHOR) || {}; }
  function enabled() { var c = cfg(); return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && typeof fetch === 'function'); }

  function sbFetch(path, opts) {
    var c = cfg();
    if (!enabled()) return Promise.resolve(null);
    opts = opts || {};
    var headers = {
      'apikey': c.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + c.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
    return fetch(c.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('supabase ' + r.status);
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  function utm() {
    try { return JSON.parse(localStorage.getItem('me_utm') || '{}'); } catch (e) { return {}; }
  }
  function subid() { var s = utm(); return s.utm_content || s.utm_campaign || ''; }

  // grava o lead no banco; nunca rejeita (não pode travar o fluxo do usuário)
  function saveLead(data) {
    if (!enabled()) return Promise.resolve(null);
    var c = cfg(), s = utm();
    var row = {
      nome: data.nome || '', telefone: data.telefone || '', email: data.email || '',
      objetivo: data.objetivo || null, produto: data.produto || null,
      valor: data.valor != null ? Number(data.valor) : null,
      prazo: data.prazo != null ? parseInt(data.prazo, 10) : null,
      subid: subid() || null,
      utm_source: s.utm_source || null, utm_medium: s.utm_medium || null,
      utm_campaign: s.utm_campaign || null, utm_content: s.utm_content || null, utm_term: s.utm_term || null,
      referrer: s.referrer || null, page_url: (typeof location !== 'undefined' ? location.href : null),
      consentimento: !!data.consentimento,
      brand: c.BRAND || 'MelhorEmprestimo', market: c.MARKET || 'BR',
      extra: data.extra || null
    };
    return sbFetch('leads', { method: 'POST', body: row, headers: { 'Prefer': 'return=minimal' } })
      .catch(function (e) { if (window.console) console.warn('lead: não gravado no backend', e); return null; });
  }

  // evento de funil (buscar/cotar/offer_click...); silencioso, nunca trava
  function track(event, props) {
    if (!enabled()) return Promise.resolve(null);
    var c = cfg(), s = utm();
    return sbFetch('events', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: {
        event: String(event).slice(0, 64),
        brand: c.BRAND || null, market: c.MARKET || null, subid: subid() || null,
        utm_source: s.utm_source || null, utm_medium: s.utm_medium || null, utm_campaign: s.utm_campaign || null,
        props: props || null
      }
    }).catch(function () { return null; });
  }

  // tabelas dinâmicas (taxas BACEN) do banco; null = usa o JSON local
  function loadTabelas() {
    if (!enabled()) return Promise.resolve(null);
    return sbFetch('tabelas?key=eq.br&select=data,atualizado_em')
      .then(function (rows) {
        if (!rows || !rows.length) return null;
        var d = rows[0].data || {};
        if (!d || !Object.keys(d).length) return null;      // semente vazia -> ignora
        if (rows[0].atualizado_em && !d.atualizado_em) d.atualizado_em = rows[0].atualizado_em;
        return d;
      })
      .catch(function () { return null; });
  }

  // ofertas ativas do mercado (para páginas de oferta futuras)
  function loadOfertas(pais) {
    if (!enabled()) return Promise.resolve(null);
    return sbFetch('ofertas?pais=eq.' + encodeURIComponent(pais || 'BR') + '&order=prioridade.desc')
      .catch(function () { return null; });
  }

  return { enabled: enabled, saveLead: saveLead, track: track, loadTabelas: loadTabelas, loadOfertas: loadOfertas, _sbFetch: sbFetch };
});
