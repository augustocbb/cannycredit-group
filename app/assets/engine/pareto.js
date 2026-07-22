/* ============================================================
   Credit GPS — pareto.js
   Fronteira de Pareto (conjunto não-dominado) + escolha recomendada por
   função objetivo configurável (pesos) + viz SVG (sem biblioteca). Puro. UMD.

   objs: [{ key, dir:'min'|'max', label, weight }]
   Cada item é um objeto com as chaves referidas em objs.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CGPS = root.CGPS || {}; root.CGPS.pareto = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function betterOrEqual(a, b, dir) { return dir === 'max' ? a >= b : a <= b; }
  function strictlyBetter(a, b, dir) { return dir === 'max' ? a > b : a < b; }

  function dominates(a, b, objs) {
    var allBE = true, oneStrict = false;
    for (var i = 0; i < objs.length; i++) {
      var k = objs[i].key, d = objs[i].dir;
      if (!betterOrEqual(a[k], b[k], d)) { allBE = false; break; }
      if (strictlyBetter(a[k], b[k], d)) oneStrict = true;
    }
    return allBE && oneStrict;
  }

  // Conjunto não-dominado. Marca item._pareto = true nos que ficam na fronteira.
  function frontier(items, objs) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var dominated = false;
      for (var j = 0; j < items.length; j++) {
        if (i === j) continue;
        if (dominates(items[j], items[i], objs)) { dominated = true; break; }
      }
      items[i]._pareto = !dominated;
      if (!dominated) out.push(items[i]);
    }
    return out;
  }

  function _bounds(items, key) {
    var mn = Infinity, mx = -Infinity;
    items.forEach(function (it) { var v = it[key]; if (v < mn) mn = v; if (v > mx) mx = v; });
    return { mn: mn, mx: mx };
  }

  // Score ponderado normalizado (0..1, maior = melhor). Grava item._score.
  function score(items, objs) {
    var b = {};
    objs.forEach(function (o) { b[o.key] = _bounds(items, o.key); });
    var wsum = objs.reduce(function (s, o) { return s + (o.weight != null ? o.weight : 1); }, 0) || 1;
    items.forEach(function (it) {
      var s = 0;
      objs.forEach(function (o) {
        var bb = b[o.key], v = it[o.key], norm;
        if (bb.mx === bb.mn) norm = 0.5;
        else norm = o.dir === 'max' ? (v - bb.mn) / (bb.mx - bb.mn) : (bb.mx - v) / (bb.mx - bb.mn);
        s += norm * (o.weight != null ? o.weight : 1);
      });
      it._score = s / wsum;
    });
    return items;
  }

  // Melhor item pela função objetivo (dentro da fronteira, se houver).
  function recomendada(items, objs) {
    if (!items.length) return null;
    frontier(items, objs);
    score(items, objs);
    var pool = items.filter(function (it) { return it._pareto; });
    if (!pool.length) pool = items;
    return pool.reduce(function (best, it) { return (!best || it._score > best._score) ? it : best; }, null);
  }

  // ---- viz SVG (2 objetivos) ----
  function svgFrontier(items, xObj, yObj, opts) {
    opts = opts || {};
    var W = opts.width || 520, H = opts.height || 300, pad = 46;
    var bx = _bounds(items, xObj.key), by = _bounds(items, yObj.key);
    function sx(v) { return bx.mx === bx.mn ? W / 2 : pad + (v - bx.mn) / (bx.mx - bx.mn) * (W - 2 * pad); }
    function sy(v) { return by.mx === by.mn ? H / 2 : (H - pad) - (v - by.mn) / (by.mx - by.mn) * (H - 2 * pad); }
    var rec = opts.recomendada;
    var parts = [];
    parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Fronteira de Pareto" style="max-width:100%;font-family:inherit">');
    // eixos
    parts.push('<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#c9ccd6"/>');
    parts.push('<line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (H - pad) + '" stroke="#c9ccd6"/>');
    parts.push('<text x="' + (W / 2) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="12" fill="#5c6070">' + (xObj.label || xObj.key) + '</text>');
    parts.push('<text x="14" y="' + (H / 2) + '" text-anchor="middle" font-size="12" fill="#5c6070" transform="rotate(-90 14 ' + (H / 2) + ')">' + (yObj.label || yObj.key) + '</text>');
    // linha da fronteira (ordenada por x)
    var fr = items.filter(function (it) { return it._pareto; }).slice().sort(function (a, b) { return a[xObj.key] - b[xObj.key]; });
    if (fr.length > 1) {
      var d = 'M ' + sx(fr[0][xObj.key]).toFixed(1) + ' ' + sy(fr[0][yObj.key]).toFixed(1);
      for (var i = 1; i < fr.length; i++) d += ' L ' + sx(fr[i][xObj.key]).toFixed(1) + ' ' + sy(fr[i][yObj.key]).toFixed(1);
      parts.push('<path d="' + d + '" fill="none" stroke="#1e6b4f" stroke-width="2" stroke-dasharray="4 3" opacity="0.8"/>');
    }
    // pontos
    items.forEach(function (it) {
      var cx = sx(it[xObj.key]).toFixed(1), cy = sy(it[yObj.key]).toFixed(1);
      var isRec = rec && it === rec;
      var fill = it._pareto ? '#1e6b4f' : '#aeb2bd';
      var r = it._pareto ? 6 : 4;
      var title = (it.label || it.nome || '') + '';
      parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"><title>' + title + '</title></circle>');
      if (isRec) parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="none" stroke="#e08a00" stroke-width="2.5"/>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  return {
    dominates: dominates, frontier: frontier, score: score,
    recomendada: recomendada, svgFrontier: svgFrontier
  };
});
