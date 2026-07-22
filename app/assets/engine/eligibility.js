/* ============================================================
   Credit GPS — eligibility.js
   Elegibilidade por produto, DTI e margem consignável. Funções puras.
   UMD: window.CGPS.eligibility / require.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CGPS = root.CGPS || {}; root.CGPS.eligibility = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // tipo de renda -> chave de margem consignável
  function margemKey(tipoRenda) {
    if (tipoRenda === 'aposentado' || tipoRenda === 'pensionista') return 'inss';
    if (tipoRenda === 'servidor') return 'servidor';
    if (tipoRenda === 'clt') return 'clt';
    return null; // autônomo/outro: sem desconto em folha
  }

  // Margem consignável mensal disponível (R$), já descontando consignados atuais.
  function margemConsignavel(perfil, tabelas) {
    var key = margemKey(perfil.tipoRenda);
    if (!key || !(perfil.renda > 0)) return 0;
    var pct = ((tabelas.margem_consignavel || {})[key] || {}).emprestimo || 0.35;
    return Math.max(0, perfil.renda * pct - (perfil.consignadoAtual || 0));
  }

  // Capacidade de parcela por DTI (comprometimento de renda), descontando compromissos.
  function capacidadeParcela(perfil, tabelas) {
    var dtiMax = (tabelas && tabelas.dti_max) || 0.30;
    if (!(perfil.renda > 0)) return 0;
    return Math.max(0, perfil.renda * dtiMax - (perfil.outrosCompromissos || 0));
  }

  // Elegibilidade para um produto. Retorna { ok, motivos:[] }.
  function elegivel(produtoId, produtoDef, perfil) {
    var motivos = [];
    var e = (produtoDef && produtoDef.elegibilidade) || {};
    if (e.tipos_renda && perfil.tipoRenda && e.tipos_renda.indexOf(perfil.tipoRenda) < 0) {
      motivos.push('Tipo de renda não elegível para ' + (produtoDef.label || produtoId) + '.');
    }
    if (e.requer_margem && !margemKey(perfil.tipoRenda)) {
      motivos.push('Consignado exige renda com desconto em folha (INSS, servidor ou CLT).');
    }
    if (e.requer_garantia && !(perfil.temImovel || perfil.temVeiculo)) {
      motivos.push('Este produto exige um bem em garantia (imóvel ou veículo).');
    }
    if (e.requer_fgts && !perfil.temFgts) motivos.push('Exige saldo de FGTS.');
    if (e.requer_saque_aniversario && !perfil.sacaAniversario) {
      motivos.push('Exige adesão ao saque-aniversário do FGTS.');
    }
    if (e.requer_divida_existente && !perfil.temDivida) {
      motivos.push('Portabilidade exige uma dívida existente para transferir.');
    }
    return { ok: motivos.length === 0, motivos: motivos };
  }

  // Valida faixa de valor/prazo do produto.
  function faixaOk(produtoDef, valor, prazo) {
    var motivos = [];
    if (valor < produtoDef.valor_min) motivos.push('Valor abaixo do mínimo (' + produtoDef.valor_min + ').');
    if (valor > produtoDef.valor_max) motivos.push('Valor acima do máximo (' + produtoDef.valor_max + ').');
    if (prazo < produtoDef.prazo_min) motivos.push('Prazo abaixo do mínimo (' + produtoDef.prazo_min + ' meses).');
    if (prazo > produtoDef.prazo_max) motivos.push('Prazo acima do máximo (' + produtoDef.prazo_max + ' meses).');
    return { ok: motivos.length === 0, motivos: motivos };
  }

  return {
    margemKey: margemKey,
    margemConsignavel: margemConsignavel,
    capacidadeParcela: capacidadeParcela,
    elegivel: elegivel,
    faixaOk: faixaOk
  };
});
