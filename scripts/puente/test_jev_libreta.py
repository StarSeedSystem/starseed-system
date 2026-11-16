import pytest
from scripts.puente.jev_libreta import construir, resumen, a_jsonl, DOMINIOS_PRIVADOS

def test_construir_filtra_privados():
    def leer_captura():
        return [
            {"id": "1", "dominio": "bloqueadas", "estratos": ["noul:bloqueadas"]},
            {"id": "2", "dominio": "Telegram", "estratos": ["noul:bloqueadas"]}
        ]
    
    class LeerExperiencias:
        def __call__(self): return [{"id": "1", "data": "exp1"}]
    
    class LeerDesenlaces:
        def etiqueta_de(self, c_id): return "verdad"

    libreta = construir(leer_captura, LeerExperiencias(), LeerDesenlaces())
    assert len(libreta) == 1
    assert libreta[0]["captura"]["id"] == "1"

def test_resumen_contadores():
    libreta = [
        {"captura": {"estratos": ["noul:bloqueadas"]}, "etiqueta": "verdad"},
        {"captura": {"estratos": ["noul:bloqueadas"]}, "etiqueta": "falso"},
        {"captura": {"estratos": ["noul:aprobacion"]}, "etiqueta": "verdad"}
    ]
    r = resumen(libreta)
    assert r["estrato"]["noul:bloqueadas"] == 2
    assert r["estrato"]["noul:aprobacion"] == 1
    assert r["etiqueta"]["verdad"] == 2
    assert r["etiqueta"]["falso"] == 1

def test_a_jsonl_solo_verdad():
    libreta = [
        {"captura": {"id": "1", "dominio": "bloqueadas"}, "experiencia": {}, "etiqueta": "verdad"},
        {"captura": {"id": "2", "dominio": "bloqueadas"}, "experiencia": {}, "etiqueta": "falso"}
    ]
    jsonl = a_jsonl(libreta, solo_verdad=True)
    assert '"etiqueta": "verdad"' in jsonl
    assert '"etiqueta": "falso"' not in jsonl
