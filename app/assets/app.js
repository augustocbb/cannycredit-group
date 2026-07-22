/* ============================================================
   MelhorEmprestimo — simulador (Tabela Price), comparação de ofertas
   e formulário de lead. Guardado por presença de elementos, então o
   mesmo arquivo serve todas as páginas.

   ⚠️ Taxas e parceiros abaixo são EXEMPLOS ILUSTRATIVOS. Substituir por
   parceiros reais autorizados pelo Banco Central antes de operar.
   ============================================================ */
(function(){
  var CFG = window.MELHOR || {};

  // Taxas mensais de EXEMPLO por modalidade (a partir de).
  var MODALIDADES = {
    pessoal:   { label:'Empréstimo pessoal',            base:0.039 },
    consignado:{ label:'Consignado (INSS / servidor)',  base:0.017 },
    garantia:  { label:'Com garantia (imóvel/veículo)', base:0.014 }
  };
  // Parceiros de EXEMPLO (acréscimo sobre a taxa base da modalidade).
  var PARCEIROS = [
    { nome:'Banco Azul Financeira', add:0.000 },
    { nome:'CrediUnião',            add:0.004 },
    { nome:'Nova Capital',          add:0.007 },
    { nome:'FinPronto',             add:0.012 }
  ];

  var brl = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});

  function pmt(pv, i, n){
    if(!(pv>0) || !(n>0)) return 0;
    if(i<=0) return pv/n;
    return pv * i / (1 - Math.pow(1+i, -n));
  }
  function computeOffers(valor, meses, modKey){
    var base = (MODALIDADES[modKey] || MODALIDADES.pessoal).base;
    return PARCEIROS.map(function(p){
      var i = base + p.add;
      var parc = pmt(valor, i, meses);
      return { nome:p.nome, taxa:i, parcela:parc, total:parc*meses, cet:Math.pow(1+i,12)-1 };
    }).sort(function(a,b){ return a.parcela - b.parcela; });
  }
  // exposto para testes
  window.MELHOR_APP = { pmt:pmt, computeOffers:computeOffers, brl:brl, MODALIDADES:MODALIDADES };

  function bcTrack(event, data){
    try{ if(window.fbq && CFG.PIXEL_ID){ fbq('track', event, data||{}); } }catch(e){}
  }

  /* ---------- Simulador ---------- */
  var valor = document.getElementById('valor');
  var valorRange = document.getElementById('valorRange');
  var meses = document.getElementById('meses');
  var modalidade = document.getElementById('modalidade');

  function currentSim(){
    return {
      valor: parseFloat((valor && valor.value) || (valorRange && valorRange.value) || 0),
      meses: parseInt((meses && meses.value) || 0, 10),
      modalidade: (modalidade && modalidade.value) || 'pessoal'
    };
  }

  function render(){
    var s = currentSim();
    var mesesOut = document.getElementById('mesesOut');
    if(mesesOut) mesesOut.textContent = s.meses + 'x';
    var offers = computeOffers(s.valor, s.meses, s.modalidade);
    var best = offers[0];
    if(!best || !(s.valor>0)) return;

    var set = function(id, txt){ var el=document.getElementById(id); if(el) el.textContent=txt; };
    set('outParcela', brl.format(best.parcela));
    set('outTaxa', (best.taxa*100).toFixed(2).replace('.',',') + '% a.m.');
    set('outCet', (best.cet*100).toFixed(1).replace('.',',') + '% a.a.');
    set('outTotal', brl.format(best.total));
    set('outResumo', brl.format(s.valor) + ' em ' + s.meses + 'x · ' + (MODALIDADES[s.modalidade]||{}).label);

    var box = document.getElementById('ofertas');
    if(box){
      box.innerHTML = '';
      offers.forEach(function(o, idx){
        var el = document.createElement('div');
        el.className = 'oferta' + (idx===0 ? ' best' : '');
        el.innerHTML =
          '<div><span class="pnome">'+o.nome+'</span>'+(idx===0?'<span class="badge">Melhor oferta</span>':'')+
            '<div class="k">Taxa '+(o.taxa*100).toFixed(2).replace('.',',')+'% a.m. · CET '+(o.cet*100).toFixed(1).replace('.',',')+'% a.a.</div></div>'+
          '<div><div class="k">Parcela</div><div class="v">'+brl.format(o.parcela)+'</div></div>'+
          '<div><div class="k">Total</div><div class="v">'+brl.format(o.total)+'</div></div>'+
          '<div class="act"><a href="#solicitar" class="btn small solicitar" data-parceiro="'+o.nome+'">Solicitar</a></div>';
        box.appendChild(el);
      });
      box.querySelectorAll('.solicitar').forEach(function(a){
        a.addEventListener('click', function(){
          var pf = document.querySelector('[name="parceiro"]'); if(pf) pf.value = a.getAttribute('data-parceiro');
          bcTrack('InitiateCheckout', {content_name:'solicitacao_credito', partner:a.getAttribute('data-parceiro')});
        });
      });
    }
  }

  if(valor || valorRange || meses){
    // sincroniza range <-> número do valor
    if(valor && valorRange){
      valorRange.addEventListener('input', function(){ valor.value = valorRange.value; render(); });
      valor.addEventListener('input', function(){ valorRange.value = valor.value; render(); });
    }
    if(meses) meses.addEventListener('input', render);
    if(modalidade) modalidade.addEventListener('change', render);
    render();
  }

  /* ---------- Formulário de solicitação ---------- */
  var f = document.getElementById('leadForm');
  if(f){
    var UTM = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
    f.addEventListener('submit', async function(e){
      e.preventDefault();
      var hp=f.querySelector('[name="empresa"]');
      if(hp && hp.value){ return; }                 // honeypot
      // anexa a simulação atual, se houver
      var s = currentSim();
      var setH=function(n,v){ var el=f.querySelector('[name="'+n+'"]'); if(el && !el.value) el.value=v; };
      if(s.valor>0){ setH('valor', s.valor); setH('prazo', s.meses); setH('finalidade', (MODALIDADES[s.modalidade]||{}).label || s.modalidade); }
      // atribuição
      var store={}; try{ store=JSON.parse(localStorage.getItem('me_utm')||'{}'); }catch(_){}
      UTM.forEach(function(k){ var el=f.querySelector('[name="'+k+'"]'); if(el) el.value=store[k]||''; });
      var ref=f.querySelector('[name="referrer"]'); if(ref) ref.value=store.referrer||'';
      var pu=f.querySelector('[name="page_url"]'); if(pu) pu.value=location.href;
      var sa=f.querySelector('[name="submitted_at"]'); if(sa) sa.value=new Date().toISOString();

      var fd=new FormData(f);
      var data=Object.fromEntries(fd.entries()); delete data.empresa;
      try{ var leads=JSON.parse(localStorage.getItem('me_leads')||'[]'); leads.push(data); localStorage.setItem('me_leads', JSON.stringify(leads)); }catch(_){}

      bcTrack('Lead', {content_name:'solicitacao_credito'});

      var endpoint=CFG.FORM_ENDPOINT;
      if(endpoint){
        try{ await fetch(endpoint,{method:'POST',headers:{'Accept':'application/json'},body:fd}); }catch(err){}
      }
      var thanks=document.getElementById('thanks');
      if(thanks){ thanks.style.display='block'; }
      f.reset();
    });
  }

  /* ---------- Menu mobile (hambúrguer) ---------- */
  var navtoggle = document.querySelector('.navtoggle');
  var navlinks = document.getElementById('navlinks');
  if(navtoggle && navlinks){
    navtoggle.addEventListener('click', function(){
      var open = navlinks.classList.toggle('open');
      navtoggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navtoggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    });
    navlinks.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){ navlinks.classList.remove('open'); navtoggle.setAttribute('aria-expanded','false'); });
    });
  }
})();
