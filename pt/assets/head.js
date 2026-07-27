/* ============================================================
   MelhorEmprestimo — configuração + Pixel + captura de UTM (no <head>).
   FREE-FIRST: com os campos vazios, tudo vira no-op (nada quebra).
   Edite SÓ este arquivo para ativar em todas as páginas.
   ============================================================ */
window.MELHOR = {
  PIXEL_ID: "",       // Meta Pixel ID -> PageView / Lead / InitiateCheckout
  GTM_ID: "",         // Google Tag Manager (formato GTM-XXXXXXX) — ativa o container
  FORM_ENDPOINT: "",  // URL que recebe o POST do formulário (Formspree / Google Forms / Tally)
  WHATSAPP: "",       // (opcional) número só dígitos, ex.: "5531999999999" para botão de contato

  // ---- Identidade do grupo (para o rollup no GA4) ----
  GROUP: "CannyCredit Group",
  BRAND: "MelhorEmprestimo",
  MARKET: "BR",

  // ---- Credit GPS (motor de decisão) ----
  DADOS_BASE: "dados/",     // pasta dos JSON estruturais (produtos/parceiros/tabelas)
  // EasyCrédito (parceiro real) — deixe vazio para usar mock:
  EASYCREDITO_LINK: "",     // (A) link parametrizado white-label, ex.: https://.../parceiro?valor={valor}&prazo={prazo}&ref={subid}
  EASYCREDITO_ENDPOINT: "", // (B) endpoint da API de proposta (quando tiver a parceria)
  EASYCREDITO_TOKEN: "",    // (B) token Bearer da API
  // Supabase (backend) — ANON_KEY vazio = site 100% estático (JSON/localStorage):
  SUPABASE_URL: "https://zaqlmjsjaaqgvxrjbsci.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_dc2JNjhKKPeZX4Ua4Hsd8w_78-MRcIt"   // publishable/anon — pública por design
};

/* Google Tag Manager (base) — só carrega o container se GTM_ID estiver configurado */
(function(w,d,s,l){
  var i = w.MELHOR && w.MELHOR.GTM_ID;
  if(!i) return;                        // sem ID: não carrega nada, sem erro
  w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
  var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
  j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
  f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer');

/* page_context do grupo (brand/group/market) — para o GA4 segmentar por marca no rollup */
(function(){
  window.dataLayer = window.dataLayer || [];
  var m = window.MELHOR || {};
  var pt = (location.pathname.split('/').pop() || 'index').replace('.html','') || 'index';
  window.dataLayer.push({event:'page_context', group:m.GROUP, brand:m.BRAND, market:m.MARKET, page_type:pt});
})();

/* Meta Pixel (base) — só inicializa se PIXEL_ID estiver configurado */
(function(){
  var id = window.MELHOR.PIXEL_ID;
  if(!id) return;
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', id);
  fbq('track', 'PageView');
})();

/* UTM first-touch (persistido em localStorage) — roda em toda página */
(function(){
  try{
    var KEYS=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
    var store={}; try{ store=JSON.parse(localStorage.getItem('me_utm')||'{}'); }catch(e){ store={}; }
    var p=new URLSearchParams(location.search), changed=false;
    KEYS.forEach(function(k){ var v=p.get(k); if(v && !store[k]){ store[k]=v; changed=true; } });
    if(store.referrer===undefined){ store.referrer=document.referrer||''; changed=true; }
    if(changed){ localStorage.setItem('me_utm', JSON.stringify(store)); }
  }catch(e){}
})();
