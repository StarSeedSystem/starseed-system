# -*- coding: utf-8 -*-
"""DIS1126B · «Te toca a ti» reacciona a lo que Maggasukha acepta: estados, reflejo en canales y cierre de Drive."""
import importlib.util
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
_spec = importlib.util.spec_from_file_location("acciones_de_alex_dis1126b", os.path.join(AQUI, "acciones-de-alex.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)
import peticiones_telegram as T  # noqa: E402

T._ACC = A

HF = {"id": "2a4255c6", "proyecto": "starseed", "pieza": "intro", "modelo": "seedance-2.0", "tomas": 1,
      "creditos_estimados": 10, "comando": ["higgsfield", "generate", "seedance-2.0", "--prompt", "luz"]}


def _ruta(tmp_path):
    return str(tmp_path / "estados.json")


def test_flujo_completo_con_condiciones(tmp_path):
    r, dichos = _ruta(tmp_path), []
    paso = lambda nuevo, cond="": A.registrar_estado("higgsfield-2a4255c6", nuevo, condiciones=cond, por="Maggasukha",
                                                     canal="telegram", titulo="Higgsfield · seedance-2.0",
                                                     ruta=r, difundir=dichos.append)
    assert paso("aceptada_con_condiciones", "dossier antes")["ok"]
    assert paso("preparando")["estado"] == "preparando"
    assert paso("lista_para_aprobar")["ok"]
    assert paso("aprobada")["estado"] == "aprobada"
    assert len(dichos) == 4 and all("Higgsfield" in d for d in dichos)


def test_no_se_aprueba_sin_dossier_si_hay_condiciones(tmp_path):
    r = _ruta(tmp_path)
    A.registrar_estado("higgsfield-x", "aceptada_con_condiciones", condiciones="idea y guion", ruta=r, difundir=lambda t: None)
    res = A.registrar_estado("higgsfield-x", "aprobada", ruta=r, difundir=lambda t: None)
    assert res["ok"] is False and "aceptada_con_condiciones" in res["error"]
    assert A.leer_estados(r)["higgsfield-x"]["estado"] == "aceptada_con_condiciones"


def test_rechazar_desde_cualquier_estado_abierto_y_cerrado_no_se_reabre(tmp_path):
    r = _ruta(tmp_path)
    A.registrar_estado("a", "preparando" if False else "aceptada_con_condiciones", ruta=r, difundir=lambda t: None)
    assert A.registrar_estado("a", "rechazada", ruta=r, difundir=lambda t: None)["ok"]
    assert A.registrar_estado("a", "aprobada", ruta=r, difundir=lambda t: None)["ok"] is False


def test_mismo_texto_en_todos_los_canales(tmp_path):
    a, b = [], []
    for canal, sal in (("telegram", a), ("genesis", b)):
        A.registrar_estado("h1", "aceptada_con_condiciones", condiciones="boceto", por="Maggasukha", canal=canal,
                           titulo="Higgsfield · x", ruta=_ruta(tmp_path) + canal, difundir=sal.append)
    assert a == b and "boceto" in a[0] and "Maggasukha" in a[0]


def test_la_lista_muestra_estado_y_condiciones(tmp_path):
    r = _ruta(tmp_path)
    A.registrar_estado("higgsfield-2a4255c6", "aceptada_con_condiciones", condiciones="guion", ruta=r, difundir=lambda t: None)
    acc = [{"id": "higgsfield-2a4255c6", "ids_acciones": ["higgsfield-2a4255c6"], "titulo": "H", "urgencia": "media"},
           {"id": "otra", "titulo": "O", "urgencia": "baja"}]
    sal = A.anotar_flujo(acc, A.leer_estados(r))
    assert sal[0]["estado_flujo"] == "aceptada_con_condiciones" and sal[0]["condiciones"] == "guion"
    assert sal[1]["estado_flujo"] == "pendiente"


def test_aceptar_sin_condiciones_queda_lista_y_con_condiciones_encola_dossier(tmp_path):
    r, cola = _ruta(tmp_path), str(tmp_path / "dossiers.json")
    sin = A.aceptar_accion_con_condiciones("higgsfield-a", "", ruta=r, ruta_dossiers=cola, difundir=lambda t: None)
    assert sin["estado"] == "lista_para_aprobar"
    con = A.aceptar_accion_con_condiciones("higgsfield-b", "idea, guion", ruta=r, ruta_dossiers=cola, difundir=lambda t: None)
    assert con["estado"] == "preparando"
    assert [d["id"] for d in A.leer_estados(cola)["pendientes"]] == ["higgsfield-b"]


def test_drive_escritura_se_cierra():
    acc = [{"id": "drive-escritura-1764000000", "titulo": "Volver a autorizar Drive", "urgencia": "alta"},
           {"id": "x", "titulo": "X", "urgencia": "baja"}]
    assert [a["id"] for a in A.cerrar_obsoletas(acc)] == ["x"]


def test_telegram_condicion_cambia_estado_y_encola(monkeypatch, tmp_path):
    dichos = []
    monkeypatch.setattr(T, "decir", lambda t, *a, **k: dichos.append(t))
    monkeypatch.setattr(T, "CONDICIONES", str(tmp_path / "cond.json"))
    monkeypatch.setattr(T, "_hfa_aprobaciones", lambda: {})
    monkeypatch.setattr(T, "_hfa_propuestas", lambda: [HF])
    monkeypatch.setattr(A, "RUTA_ESTADOS", _ruta(tmp_path))
    monkeypatch.setattr(A, "RUTA_DOSSIERS", str(tmp_path / "dossiers.json"))
    monkeypatch.setattr(A, "_difundir_bus", lambda t: None)
    T._aceptar_con_condiciones("Envíame antes idea, guion y bocetos de cada caso")
    assert A.leer_estados(A.RUTA_ESTADOS)["higgsfield-2a4255c6"]["estado"] == "preparando"
    assert dichos and "2a4255c6" in dichos[0] or "Higgsfield" in dichos[0]


def test_telegram_aprobar_se_niega_con_dossier_pendiente(monkeypatch, tmp_path):
    dichos = []
    monkeypatch.setattr(T, "decir", lambda t, *a, **k: dichos.append(t))
    monkeypatch.setattr(T, "_hfa_propuestas", lambda: [HF])
    monkeypatch.setattr(A, "RUTA_ESTADOS", _ruta(tmp_path))
    monkeypatch.setattr(A, "_difundir_bus", lambda t: None)
    A.registrar_estado("higgsfield-2a4255c6", "aceptada_con_condiciones", condiciones="guion", difundir=lambda t: None)
    llamado = []
    monkeypatch.setattr(T.hfa, "ejecutar", lambda *a, **k: llamado.append(1) or {"ok": True})
    T._comando_higgsfield_aprobar("2a4255c6")
    assert llamado == [] and any("dossier" in d.lower() for d in dichos)
