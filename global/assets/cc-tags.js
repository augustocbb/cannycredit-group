/* CannyCredit — camada de tags (dataLayer/GTM). Fonte única de verdade.
 *
 * Carregado por TODA página do site (gerar.py injeta <script defer src=".../assets/cc-tags.js">).
 * Não depende de GTM: só empilha em window.dataLayer. Se o GTM estiver injetado, ele lê;
 * se não estiver, os eventos ficam no array e nada quebra.
 *
 * O contexto da página (iso, tier, lang, page_type…) NÃO é repetido aqui: é lido do push
 * `page_context` que o <head> já fez. Página nova só precisa desse push + deste script.
 *
 * Eventos emitidos (contrato com o GTM — ver anuncios/GTM_TAGUEAMENTO.md):
 *   traffic_context · scroll_depth · engaged_time · section_view · offer_impression
 *   affiliate_click · outbound_click · internal_click · ui_interaction · page_exit · js_error
 *
 * Privacidade: nenhum dado pessoal. `visitor_id`/`session_id` são aleatórios (first-party) e
 * só existem para casar clique↔conversão. Com Global Privacy Control / DNT ligado, nada é
 * gravado no navegador (ids viram efêmeros de memória) e os eventos seguem sem id persistente.
 * ES5 de propósito: o tráfego inclui Android antigo em mercados emergentes.
 */
(function (w, d) {
  "use strict";

  var VERSION = "2";
  var SESSION_TIMEOUT = 30 * 60 * 1000;   // 30 min de inatividade = sessão nova
  var ATTR_TTL = 90 * 24 * 3600 * 1000;   // janela de atribuição do first-touch: 90 dias

  w.dataLayer = w.dataLayer || [];

  /* ---------------------------------------------------------------- utilidades */

  function push(obj) {
    try { w.dataLayer.push(obj); } catch (e) { /* nunca deixar tag derrubar página */ }
  }

  function qs() {
    var out = {}, s = w.location.search.replace(/^\?/, "");
    if (!s) return out;
    var parts = s.split("&");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].split("=");
      if (!p[0]) continue;
      try { out[decodeURIComponent(p[0]).toLowerCase()] = decodeURIComponent((p[1] || "").replace(/\+/g, " ")); }
      catch (e) { out[p[0].toLowerCase()] = p[1] || ""; }
    }
    return out;
  }

  function host(url) {
    try { return new URL(url, w.location.href).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  function pathOf(url) {
    try { return new URL(url, w.location.href).pathname; } catch (e) { return url || ""; }
  }

  function rid() {
    var s = "";
    for (var i = 0; i < 4; i++) s += Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
    return s;
  }

  function txt(el, max) {
    var t = (el.textContent || "").replace(/\s+/g, " ").replace(/^\s|\s$/g, "");
    return t.length > (max || 60) ? t.slice(0, max || 60) : t;
  }

  function attr(el, name) { return (el && el.getAttribute(name)) || ""; }

  /* Sinal de privacidade do navegador: GPC (spec) ou DNT. Respeitado para *armazenamento*. */
  var noStore = false;
  try {
    noStore = w.navigator.globalPrivacyControl === true ||
      w.navigator.doNotTrack === "1" || w.doNotTrack === "1" || w.navigator.msDoNotTrack === "1";
  } catch (e) { }

  var mem = {}; // fallback de memória quando storage é proibido/indisponível

  function store(key, val) {
    if (val === undefined) { // leitura
      if (noStore) return mem[key] || "";
      try { return w.localStorage.getItem(key) || w.sessionStorage.getItem(key) || mem[key] || ""; }
      catch (e) { return mem[key] || ""; }
    }
    mem[key] = val;
    if (noStore) return val;
    try { w.localStorage.setItem(key, val); } catch (e) {
      try { w.sessionStorage.setItem(key, val); } catch (e2) { /* modo privado agressivo */ }
    }
    return val;
  }

  /* ------------------------------------------------- contexto vindo do <head> */

  var ctx = {};
  try {
    for (var i = 0; i < w.dataLayer.length; i++) {
      var e = w.dataLayer[i];
      if (e && e.event === "page_context") ctx = e;
    }
  } catch (e) { }

  var ISO = ctx.iso || "";
  var PAGE_TYPE = ctx.page_type || "";
  var LANG = ctx.lang || d.documentElement.getAttribute("lang") || "";

  /* Todo evento leva o mínimo para segmentar sozinho no GA4 (sem depender de escopo de sessão). */
  function base(extra) {
    var o = { iso: ISO, page_type: PAGE_TYPE, lang: LANG, subid: TRAFFIC.subid, session_id: TRAFFIC.session_id };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  /* --------------------------------------------------------- tráfego / atribuição */

  var CLICK_PARAMS = ["subid", "sub_id", "click_id", "clickid", "cid", "gclid", "gbraid", "wbraid",
    "fbclid", "ttclid", "msclkid", "twclid", "li_fat_id", "epik", "s1"];
  var UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"];

  function networkOf(q) {
    if (q.gclid || q.gbraid || q.wbraid) return "google_ads";
    if (q.fbclid) return "meta";
    if (q.ttclid) return "tiktok";
    if (q.msclkid) return "microsoft";
    if (q.li_fat_id) return "linkedin";
    if (q.epik) return "pinterest";
    return (q.utm_source || "").toLowerCase();
  }

  var SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|seznam|naver)\./;
  var SOCIAL = /(^|\.)(facebook|instagram|t|twitter|x|linkedin|tiktok|pinterest|reddit|youtube|telegram|whatsapp|snapchat)\./;
  var PAID_MEDIUM = /^(cpc|ppc|paid.*|native|display|banner|push|pop|cpm|cpv)$/;

  function channelOf(q, refHost) {
    var hasClickId = false;
    for (var i = 0; i < CLICK_PARAMS.length; i++) if (q[CLICK_PARAMS[i]]) { hasClickId = true; break; }
    var med = (q.utm_medium || "").toLowerCase();
    if (hasClickId || PAID_MEDIUM.test(med)) {
      if (q.gclid || q.gbraid || q.wbraid || med === "cpc" || med === "ppc") return "paid_search";
      if (q.fbclid || q.ttclid || q.twclid || q.li_fat_id || q.epik) return "paid_social";
      return "paid_native";
    }
    if (med === "email") return "email";
    if (!refHost) return q.utm_source ? "campaign" : "direct";
    if (refHost === w.location.hostname.replace(/^www\./, "")) return "internal";
    if (SEARCH.test("." + refHost)) return "organic_search";
    if (SOCIAL.test("." + refHost)) return "social";
    return "referral";
  }

  function deviceType() {
    var ua = (w.navigator.userAgent || "").toLowerCase();
    if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "tablet";
    if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(ua)) return "mobile";
    return "desktop";
  }

  var TRAFFIC = (function () {
    var q = qs();
    var refHost = host(d.referrer || "");
    var now = +new Date();

    // click id do anúncio: o primeiro parâmetro reconhecido vence; senão, o já guardado na sessão.
    var subid = "", subidParam = "";
    for (var i = 0; i < CLICK_PARAMS.length; i++) {
      if (q[CLICK_PARAMS[i]]) { subid = q[CLICK_PARAMS[i]]; subidParam = CLICK_PARAMS[i]; break; }
    }
    if (subid) store("cc_subid", subid); else subid = store("cc_subid");

    // sessão: 30 min de inatividade encerra
    var sid = store("cc_sid"), last = parseInt(store("cc_sid_ts") || "0", 10) || 0;
    var visits = parseInt(store("cc_visits") || "0", 10) || 0;
    var newSession = !sid || (now - last) > SESSION_TIMEOUT;
    if (newSession) { sid = rid(); visits += 1; store("cc_sid", sid); store("cc_visits", String(visits)); }
    store("cc_sid_ts", String(now));

    var vid = store("cc_vid");
    var isNew = !vid;
    if (!vid) vid = store("cc_vid", rid() + rid());

    var t = {
      event: "traffic_context",
      subid: subid, subid_param: subidParam,
      source_network: networkOf(q),
      channel: channelOf(q, refHost),
      referrer: (d.referrer || "").slice(0, 300),
      referrer_host: refHost,
      landing_path: w.location.pathname,
      page_query: w.location.search.slice(1, 300),
      session_id: sid, visitor_id: vid, session_number: visits,
      is_new_visitor: isNew ? 1 : 0,
      device_type: deviceType(),
      viewport: (w.innerWidth || 0) + "x" + (w.innerHeight || 0),
      screen_size: ((w.screen && w.screen.width) || 0) + "x" + ((w.screen && w.screen.height) || 0),
      browser_lang: (w.navigator.language || "").slice(0, 12),
      tz_offset: -(new Date().getTimezoneOffset() / 60),
      privacy_signal: noStore ? 1 : 0,
      tags_version: VERSION
    };
    for (var j = 0; j < CLICK_PARAMS.length; j++) if (q[CLICK_PARAMS[j]]) t[CLICK_PARAMS[j]] = q[CLICK_PARAMS[j]];
    for (var k = 0; k < UTM.length; k++) if (q[UTM[k]]) t[UTM[k]] = q[UTM[k]];

    // first touch: o que trouxe o visitante da primeira vez (janela de 90 dias)
    var firstRaw = store("cc_first"), first = null;
    try { first = firstRaw ? JSON.parse(firstRaw) : null; } catch (e) { first = null; }
    if (!first || !first.ts || (now - first.ts) > ATTR_TTL) {
      first = { ts: now, source: t.source_network || t.referrer_host || "direct",
                medium: q.utm_medium || "", campaign: q.utm_campaign || "",
                channel: t.channel, subid: subid };
      store("cc_first", JSON.stringify(first));
    }
    t.first_touch_source = first.source;
    t.first_touch_campaign = first.campaign;
    t.first_touch_channel = first.channel;
    t.first_touch_days = Math.floor((now - first.ts) / 86400000);
    return t;
  })();

  push(TRAFFIC);

  /* API mínima para páginas feitas à mão / experimentos. */
  w.ccTags = {
    version: VERSION,
    subid: function () { return TRAFFIC.subid; },
    context: function () { return TRAFFIC; },
    push: function (event, params) { push(base(_assign({ event: String(event) }, params))); }
  };
  function _assign(a, b) { for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }

  /* ------------------------------------------------------- propagação do click id
   * Só o `subid` viaja para as páginas internas (índice → país → go/). UTM não é
   * propagada de propósito: reescrever utm_* numa navegação interna faz o GA4 reatribuir
   * a sessão. Sem isso, o `go/<id>.html` recebe o click id vazio e a rede não consegue
   * casar a conversão com o anúncio — que é o furo que esta camada existe para tapar.
   */
  var SITE_HOST = w.location.hostname.replace(/^www\./, "");

  /* Interno é decidido pelo DESTINO, nunca pela classe: o CTA de oferta tem class="aff" e
   * aponta para `../go/<id>.html`, que é interno. Tratá-lo como externo era exatamente o furo
   * — `new URL('../go/x.html')` lança TypeError, o href ficava intacto e o click id morria
   * antes do redirecionador. */
  function isInternal(a) {
    var h = a.getAttribute("href") || "";
    if (!h || h.charAt(0) === "#") return false;
    if (/^(mailto:|tel:|javascript:)/i.test(h)) return false;
    if (/^https?:/i.test(h)) return host(h) === SITE_HOST;
    return true; // relativo
  }

  /* Todo link recebe o click id: interno vira ?subid=, afiliado vira macro {subid}/&subid=. */
  function tagLink(a) {
    if (isInternal(a)) decorate(a); else if (isAff(a)) affHref(a);
  }

  function decorate(a) {
    if (!TRAFFIC.subid || attr(a, "data-cc-done")) return;
    var h = a.getAttribute("href") || "";
    if (!isInternal(a)) return;
    if (/[?&]subid=/.test(h)) { a.setAttribute("data-cc-done", "1"); return; }
    var hash = "", i = h.indexOf("#");
    if (i >= 0) { hash = h.slice(i); h = h.slice(0, i); }
    a.setAttribute("href", h + (h.indexOf("?") >= 0 ? "&" : "?") + "subid=" + encodeURIComponent(TRAFFIC.subid) + hash);
    a.setAttribute("data-cc-done", "1");
  }

  /* Link de afiliado: injeta o click id no slot da rede — macro {subid} ({}/%7B%7D) ou &subid=. */
  function affHref(a) {
    var h = a.getAttribute("href") || "";
    if (!TRAFFIC.subid || attr(a, "data-cc-done")) return;
    var sub = encodeURIComponent(TRAFFIC.subid);
    if (h.indexOf("{subid}") >= 0) h = h.split("{subid}").join(sub);
    else if (h.indexOf("%7Bsubid%7D") >= 0) h = h.split("%7Bsubid%7D").join(sub);
    else if (h.indexOf("%7bsubid%7d") >= 0) h = h.split("%7bsubid%7d").join(sub);
    else if (/^https?:/i.test(h) && !/[?&]subid=/.test(h)) h += (h.indexOf("?") >= 0 ? "&" : "?") + "subid=" + sub;
    a.setAttribute("href", h);
    a.setAttribute("data-cc-done", "1");
  }

  /* ------------------------------------------------------------------ cliques */

  var startedAt = +new Date();
  var maxScroll = 0, clicks = 0, offersSeen = 0;

  function secs() { return Math.round((+new Date() - startedAt) / 1000); }

  function sectionOf(el) {
    var n = el;
    while (n && n !== d.body) {
      if (n.getAttribute) {
        var s = n.getAttribute("data-sec");
        if (s) return s;
        if (n.tagName === "SECTION" && n.id) return n.id;
        if (n.tagName === "HEADER") return "hero";
        if (n.tagName === "FOOTER") return "footer";
        if (n.tagName === "NAV") return "toc";
      }
      n = n.parentNode;
    }
    return "";
  }

  function isAff(a) {
    return (" " + (a.className || "") + " ").indexOf(" aff ") >= 0 || attr(a, "data-cc").indexOf("_cta") > 0;
  }

  function onClick(ev) {
    try {
      var a = ev.target;
      while (a && a !== d.body && a.tagName !== "A") a = a.parentNode;
      if (!a || a.tagName !== "A") return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#") {
        if (href && attr(a, "data-cc") === "nav") {
          push(base({ event: "internal_click", nav: attr(a, "data-nav") || "toc",
                      to_path: href, link_text: txt(a) }));
        }
        return;
      }
      clicks += 1;
      var role = attr(a, "data-cc");

      if (isAff(a)) {
        tagLink(a);   // CTA de oferta é interno (go/) — decora com ?subid=; os demais, macro
        push(base({
          event: "affiliate_click",
          partner: attr(a, "data-partner"),
          offer: attr(a, "data-offer"),
          network: attr(a, "data-network"),
          link_type: attr(a, "data-link") || (role === "offer_cta" ? "offer_card" : "partner"),
          position: parseInt(attr(a, "data-pos") || "0", 10) || 0,
          section: sectionOf(a),
          // CTA de oferta passa pelo go/ (interno): reportar o host do site aqui seria ruído.
          // O destino real de verdade sai no offer_redirect, já do lado do redirecionador.
          dest_host: isInternal(a) ? "" : host(a.getAttribute("href")),
          via: isInternal(a) ? "go" : "direct",
          seconds: secs(),
          scroll_at_click: maxScroll
        }));
        return;
      }

      if (isInternal(a)) {
        decorate(a);
        push(base({
          event: "internal_click",
          nav: attr(a, "data-nav") || (role === "market" ? "index_table" : "link"),
          to_path: pathOf(a.getAttribute("href")),
          to_iso: attr(a, "data-iso"), to_lang: attr(a, "data-lang"),
          link_text: txt(a), seconds: secs()
        }));
        return;
      }

      push(base({
        event: "outbound_click",
        dest_host: host(href), dest_url: href.slice(0, 300),
        link_type: role || "external",
        section: sectionOf(a), link_text: txt(a), seconds: secs()
      }));
    } catch (e) { }
  }

  d.addEventListener("click", onClick, true);
  d.addEventListener("auxclick", onClick, true);   // clique do meio / abrir em nova aba
  d.addEventListener("contextmenu", function (ev) { // copiar link também precisa do subid
    try {
      var a = ev.target;
      while (a && a !== d.body && a.tagName !== "A") a = a.parentNode;
      if (a && a.tagName === "A") tagLink(a);
    } catch (e) { }
  }, true);

  /* ------------------------------------------------ scroll / tempo / visibilidade */

  var SCROLL_MARKS = [25, 50, 75, 90, 100], scrollDone = {};
  var TIME_MARKS = [15, 30, 60, 120, 300], timeDone = {};

  function scrollPct() {
    var h = d.documentElement, b = d.body;
    var docH = Math.max(h.scrollHeight, b ? b.scrollHeight : 0);
    var view = w.innerHeight || h.clientHeight;
    if (docH <= view) return 100;
    var y = (w.pageYOffset || h.scrollTop || 0) + view;
    return Math.min(100, Math.round((y / docH) * 100));
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    (w.requestAnimationFrame || function (f) { setTimeout(f, 120); })(function () {
      ticking = false;
      var p = scrollPct();
      if (p > maxScroll) maxScroll = p;
      for (var i = 0; i < SCROLL_MARKS.length; i++) {
        var m = SCROLL_MARKS[i];
        if (maxScroll >= m && !scrollDone[m]) {
          scrollDone[m] = 1;
          push(base({ event: "scroll_depth", percent: m, seconds: secs() }));
        }
      }
    });
  }
  w.addEventListener("scroll", onScroll, { passive: true });

  var timer = setInterval(function () {
    if (d.visibilityState === "hidden") return;   // tempo só conta com a aba visível
    var s = secs();
    for (var i = 0; i < TIME_MARKS.length; i++) {
      var m = TIME_MARKS[i];
      if (s >= m && !timeDone[m]) { timeDone[m] = 1; push(base({ event: "engaged_time", seconds: m })); }
    }
    if (s > 320) clearInterval(timer);
  }, 5000);

  var exited = false;
  function onExit(kind) {
    if (exited) return;
    exited = true;
    push(base({ event: "page_exit", exit_type: kind, seconds: secs(),
                max_scroll: maxScroll, clicks: clicks, offers_seen: offersSeen }));
  }
  d.addEventListener("visibilitychange", function () { if (d.visibilityState === "hidden") onExit("hidden"); });
  w.addEventListener("pagehide", function () { onExit("pagehide"); });

  /* --------------------------------------- impressões (seções e cards de oferta) */

  function observe() {
    if (!w.IntersectionObserver) return;
    /* "Visto" = metade do elemento OU metade da tela ocupada por ele. Só `intersectionRatio`
     * não serve: uma seção mais alta que a viewport (comum no celular) nunca chega a 40%
     * visível e jamais contaria como vista. */
    var io = new w.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var en = entries[i];
        if (!en.isIntersecting) continue;
        var vh = w.innerHeight || d.documentElement.clientHeight || 0;
        var elH = (en.boundingClientRect && en.boundingClientRect.height) || 0;
        var visH = (en.intersectionRect && en.intersectionRect.height) || 0;
        var ref = vh ? Math.min(elH || 1, vh) : (elH || 1);
        if (ref > 0 && (visH / ref) < 0.5) continue;
        var el = en.target;
        io.unobserve(el);
        if (attr(el, "data-cc") === "offer_card") {
          offersSeen += 1;
          push(base({ event: "offer_impression", offer: attr(el, "data-offer"),
                      partner: attr(el, "data-partner"), network: attr(el, "data-network"),
                      position: parseInt(attr(el, "data-pos") || "0", 10) || 0, seconds: secs() }));
        } else {
          push(base({ event: "section_view", section: attr(el, "data-sec") || el.id || "",
                      seconds: secs(), scroll: maxScroll }));
        }
      }
    }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });

    var cards = d.querySelectorAll('[data-cc="offer_card"]');
    for (var i = 0; i < cards.length; i++) io.observe(cards[i]);
    var secsEls = d.querySelectorAll("section[data-sec], section[id]");
    for (var j = 0; j < secsEls.length; j++) io.observe(secsEls[j]);
  }

  /* -------------------------------------------------------------- erros de JS */

  var errCount = 0;
  w.addEventListener("error", function (ev) {
    if (errCount >= 3) return;
    errCount += 1;
    push(base({ event: "js_error", message: String((ev && ev.message) || "").slice(0, 200),
                source: String((ev && ev.filename) || "").slice(0, 200),
                line: (ev && ev.lineno) || 0 }));
  });

  /* ---------------------------------------------------------------- bootstrap */

  function ready() {
    try {
      var links = d.getElementsByTagName("a");
      for (var i = 0; i < links.length; i++) tagLink(links[i]);
      observe();
      onScroll();
    } catch (e) { }
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", ready);
  else ready();

})(window, document);
