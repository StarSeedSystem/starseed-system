"""DIR1121B: un encargo sin clientes reales de NotebookLM y Drive no acaba en «petición fallida»."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import peticiones_telegram as mod  # noqa: E402


def _preparar(monkeypatch, plan):
    dichos, hechos = [], []
    monkeypatch.setattr(mod, "actualizar", lambda pid, **c: hechos.append(("actualizar", c)))
    monkeypatch.setattr(mod, "decir", lambda t, *a, **k: dichos.append(t))
    monkeypatch.setattr(mod, "interpretar", lambda texto, excluir_id=None: plan)
    monkeypatch.setattr(mod, "hacer_notebooklm", lambda p, pl: hechos.append(("notebooklm", pl["tipo"])))
    monkeypatch.setattr(mod, "responder", lambda p: hechos.append(("responder", None)))
    monkeypatch.setattr(mod, "_reportar_peticion_fallida", lambda *a, **k: hechos.append(("fallida", a)))
    return dichos, hechos


def _estados(hechos):
    return [c.get("estado") for n, c in hechos if n == "actualizar" and isinstance(c, dict) and c.get("estado")]


def test_encargo_sin_clientes_con_artefactos_se_atiende_como_notebooklm(monkeypatch):
    plan = {"tipo": "encargo", "fuente": "ultima_sintesis", "artefactos": [{"tipo": "report", "indicaciones": ""}]}
    dichos, hechos = _preparar(monkeypatch, plan)
    monkeypatch.setattr(mod, "_clientes_de_encargo", lambda: None)
    mod.atender({"id": 1, "texto": "hazme un informe", "intentos": 0})
    assert ("notebooklm", "notebooklm") in hechos
    assert _estados(hechos)[-1] == "hecha"
    assert not [h for h in hechos if h[0] == "fallida"]
    assert len([d for d in dichos if "encargo" in d]) == 1


def test_encargo_sin_clientes_y_sin_artefactos_responde(monkeypatch):
    dichos, hechos = _preparar(monkeypatch, {"tipo": "encargo", "fuente": "cuaderno", "artefactos": []})
    monkeypatch.setattr(mod, "_clientes_de_encargo", lambda: None)
    mod.atender({"id": 2, "texto": "cuéntame", "intentos": 0})
    assert ("responder", None) in hechos and _estados(hechos)[-1] == "hecha"


def test_el_aviso_no_se_repite_en_los_reintentos(monkeypatch):
    dichos, hechos = _preparar(monkeypatch, {"tipo": "encargo", "fuente": "cuaderno", "artefactos": []})
    monkeypatch.setattr(mod, "_clientes_de_encargo", lambda: None)
    mod.atender({"id": 3, "texto": "otra vez", "intentos": 1, "avisado_sin_encargo": True})
    assert not [d for d in dichos if "encargo" in d]


def test_encargo_con_clientes_usa_el_productor_con_esos_clientes(monkeypatch):
    dichos, hechos = _preparar(monkeypatch, {"tipo": "encargo", "fuente": "cuaderno", "artefactos": []})
    nb_c, drive_c = object(), object()
    monkeypatch.setattr(mod, "_clientes_de_encargo", lambda: (nb_c, drive_c))
    monkeypatch.setattr(mod, "planificar_base", lambda texto: [])
    visto = {}

    def falso_ejecutar(encargo, nb, drive, **k):
        visto.update(nb=nb, drive=drive, id=encargo["id"])

    monkeypatch.setattr(mod, "ejecutar_encargo", falso_ejecutar)
    mod.atender({"id": 4, "texto": "encargo grande", "intentos": 0})
    assert visto == {"nb": nb_c, "drive": drive_c, "id": "ENC-4"}
    assert _estados(hechos)[-1] == "hecha"


def test_los_clientes_nunca_son_las_funciones_sueltas():
    clientes = mod._clientes_de_encargo()
    if clientes is not None:
        nb_c, drive_c = clientes
        assert callable(getattr(drive_c, "doc", None)) and callable(getattr(drive_c, "carpeta", None))
        assert callable(getattr(nb_c, "create", None))
