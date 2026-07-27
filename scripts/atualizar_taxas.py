# -*- coding: utf-8 -*-
"""Rotina de atualização das taxas médias do BACEN (API SGS) -> dados/tabelas.json.

Mantém o site ESTÁTICO: roda fora do host (Agendador/GitHub Actions), grava o JSON
que o site lê no navegador. Sem chave; API pública do Banco Central.

Uso: python atualizar_taxas.py
API: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados/ultimos/1?formato=json
Séries MENSAIS (valor em % a.m., que é o que o motor usa em taxa_media_am):
  25464 = Crédito pessoal NÃO consignado (PF)
  25468 = Consignado INSS (aposentados/pensionistas)
  25466 = Consignado privado (CLT)   [alternativa]
Para adicionar veículos/rotativo/cheque especial, mapeie o código mensal correspondente.
"""
import json
import os
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
TAB = os.path.join(BASE, "..", "pt", "dados", "tabelas.json")  # layout do repo publicado

# produto (chave em taxa_media_am) -> código SGS mensal do BACEN
SGS = {
    "pessoal": 25464,
    "consignado": 25468,
}
API = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{}/dados/ultimos/1?formato=json"


def ultimo(codigo):
    req = urllib.request.Request(API.format(codigo), headers={"User-Agent": "creditgps-updater"})
    with urllib.request.urlopen(req, timeout=20) as r:
        arr = json.loads(r.read().decode("utf-8"))
    if not arr:
        raise ValueError("série vazia")
    v = arr[-1]
    return float(str(v["valor"]).replace(",", ".")) / 100.0, v.get("data")  # % a.m. -> decimal


def upsert_supabase(tab):
    """Grava as tabelas no Supabase (public.tabelas, key='br') se as credenciais
    estiverem no ambiente. Sem credenciais -> pula em silêncio (site usa o JSON).
    Env: SUPABASE_URL + SUPABASE_SERVICE_KEY (service_role; NUNCA commitar)."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("[info] SUPABASE_URL/SERVICE_KEY ausentes — só o JSON foi atualizado.")
        return
    body = json.dumps({"key": "br", "data": tab, "atualizado_em": tab.get("atualizado_em")}).encode("utf-8")
    req = urllib.request.Request(
        url + "/rest/v1/tabelas?on_conflict=key",
        data=body, method="POST",
        headers={
            "apikey": key, "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        })
    with urllib.request.urlopen(req, timeout=20) as r:
        print("Supabase: tabelas['br'] upsert OK (HTTP %d)." % r.status)


def main():
    with open(TAB, encoding="utf-8") as f:
        tab = json.load(f)
    tab.setdefault("taxa_media_am", {})
    mudou = []
    for produto, cod in SGS.items():
        try:
            taxa, data = ultimo(cod)
            antigo = tab["taxa_media_am"].get(produto)
            tab["taxa_media_am"][produto] = round(taxa, 5)
            mudou.append("%s: SGS %d -> %.2f%% a.m. (BACEN %s)" % (produto, cod, taxa * 100, data))
        except Exception as e:
            print("[aviso] %s (SGS %d): mantém valor atual — %s" % (produto, cod, e))
    tab["atualizado_em"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    tab["fonte_taxas"] = "BACEN SGS (api.bcb.gov.br) — séries " + ", ".join(str(c) for c in SGS.values())
    with open(TAB, "w", encoding="utf-8") as f:
        json.dump(tab, f, ensure_ascii=False, indent=2)
    print("tabelas.json atualizado (%s)." % tab["atualizado_em"])
    for m in mudou:
        print("  -", m)
    try:
        upsert_supabase(tab)
    except Exception as e:
        print("[aviso] upsert Supabase falhou (JSON continua valendo):", e)


if __name__ == "__main__":
    main()
