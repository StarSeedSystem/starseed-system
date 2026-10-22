# -*- coding: utf-8 -*-
"""Pruebas del CLI alta-capacidad-nube.py (Ola 1022C, ALT1022B y su ampliación).

Sin red ni `claude` real: el lanzador, `git ls-remote` y `traer_nube` se inyectan, y todas las
rutas (`~/.starseed`, `starseed_memory_root/olas/`, cerrojos) apuntan a una carpeta temporal."""
import importlib.util
import json
import os
import sys
import time

import pytest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import traer_nube  # noqa: E402

_espec = importlib.util.spec_from_file_location("alta_capacidad_nube_cli", os.path.join(AQUI, "alta-capacidad-nube.py"))
cli = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(cli)

AHORA = time.time()
SALIDA_OK = ("\x1b[>4m Created cloud session: Canal P2P\r\n"
             "View: https://claude.ai/code/session_01HW1xkHMRPYXUF5bjHiWxyd?from=cli&m=0")


@pytest.fixture
def entorno(tmp_path, monkeypatch):
    olas = tmp_path / "olas"
    olas.mkdir()
    st = tmp_path / "starseed"
    monkeypatch.setattr(traer_nube, "OLAS", str(olas))
    monkeypatch.setattr(traer_nube, "PROGRESO", str(olas / "progreso.json"))
    monkeypatch.setattr(traer_nube, "CERROJOS", str(st / "cerrojos"))
    monkeypatch.setattr(cli, "REGISTRO", str(st / "alta-capacidad-nube.json"))
    monkeypatch.setattr(cli, "CREDITO", str(st / "credito-claude-nube.json"))
    monkeypatch.setattr(cli, "BRIEFS", str(st / "alta-capacidad-nube"))
    monkeypatch.setattr(cli, "PAUSA", str(st / "alta-nube-pausada.json"))
    monkeypatch.delenv("STARSEED_ALTA_NUBE_MAX", raising=False)
    vence = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(AHORA + 13 * 86400))
    cli._escribir_json(cli.CREDITO, {"total_usd": 250, "restante_usd": 240, "vence": vence})
    tareas = [
        {"id": "T1", "titulo": "Uno", "archivos": ["a.py"], "prompt": "Haz {uno}."},
        {"id": "T2", "titulo": "Dos", "archivos": ["a", "b", "c"], "prompt": "Haz dos."},
        {"id": "T3", "titulo": "Tres", "archivos": ["a"], "depende": ["T9"]},
        {"id": "T4", "titulo": "Cuatro", "archivos": ["a"], "privada": True},
    ]
    (olas / "cola-1022-prueba.json").write_text(json.dumps({"tareas": tareas}), encoding="utf-8")
    return tmp_path


def _progreso():
    return traer_nube._progreso()


def _registro():
    return cli.leer_registro()["sesiones"]


class Lanzador:
    def __init__(self, salida=SALIDA_OK):
        self.salida, self.llamadas = salida, []

    def __call__(self, orden, log, teclas):
        self.llamadas.append(orden)
        return self.salida


def test_cupo_agotado_no_lanza(entorno):
    cli._escribir_json(cli.CREDITO, {"restante_usd": 5, "vence": "2099-01-01T00:00:00+00:00"})
    lz, dicho = Lanzador(), []
    assert cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=lz, decir=dicho.append) == []
    assert lz.llamadas == [] and "sin cupo" in dicho[0]
    assert _progreso() == {} and _registro() == []


def test_lanzamiento_feliz_anota_y_marca(entorno):
    lz = Lanzador()
    filas = cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=lz, decir=lambda *_: None)
    assert len(filas) == 1
    orden = lz.llamadas[0]
    assert orden[:4] == ["claude", "--model", "sonnet", "--cloud"] and "Haz {uno}." in orden[4]
    assert _progreso()["T1"]["estado"] == "reasignada" and _progreso()["T1"]["medio"] == "claude-nube"
    s = _registro()[0]
    assert s["sesion"] == "session_01HW1xkHMRPYXUF5bjHiWxyd" and s["coste_usd"] == 1.0
    assert s["rama_pedida"] == "nube/cc-%s/ola/T1" % time.strftime("%Y%m%d", time.localtime(AHORA))
    assert os.path.exists(os.path.join(cli.BRIEFS, "T1.md"))


def test_modelo_forzado_por_opcion(entorno):
    lz = Lanzador()
    cli.lanzar(ids=["T1"], modelo="claude-opus-5-5", ahora=AHORA, lanzador=lz, decir=lambda *_: None)
    assert lz.llamadas[0][2] == "claude-opus-5-5" and _registro()[0]["coste_usd"] == 3.0


def test_salida_sin_sesion_devuelve_a_pendiente(entorno):
    lz, dicho = Lanzador("Error: --cloud requires an interactive terminal"), []
    assert cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=lz, decir=dicho.append) == []
    assert _progreso()["T1"]["estado"] == "pendiente" and _registro() == []
    assert any("no salió" in d for d in dicho)


def test_seco_no_toca_nada(entorno):
    lz = Lanzador()
    cli.lanzar(ids=["T1"], seco=True, ahora=AHORA, lanzador=lz, decir=lambda *_: None)
    assert lz.llamadas == [] and _progreso() == {} and _registro() == []


def test_auto_elige_sin_dependencias_ni_privadas_y_en_orden(entorno):
    lz = Lanzador()
    filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=lz, decir=lambda *_: None, fuera_de_otros=set)
    assert [f["tarea"] for f in filas] == ["T2", "T1"]
    assert [f["modelo"] for f in filas] == ["claude-opus-5-5", "sonnet"]


def test_auto_respeta_el_maximo(entorno, monkeypatch):
    monkeypatch.setenv("STARSEED_ALTA_NUBE_MAX", "1")
    filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None, fuera_de_otros=set)
    assert [f["tarea"] for f in filas] == ["T2"]


def test_auto_no_coge_lo_que_la_mac_se_queda(entorno):
    """(2026-10-22) CAP1018Ab-d1b se lanzó en la nube mientras la Mac la escribía."""
    filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None,
                       fuera_de_otros=lambda: {"T2"})
    assert [f["tarea"] for f in filas] == ["T1"]


def test_auto_sin_foto_de_la_mac_no_lanza(entorno):
    dicho = []
    filas = cli.lanzar(auto=True, ahora=AHORA, lanzador=Lanzador(), decir=dicho.append,
                       fuera_de_otros=lambda: None)
    assert filas == [] and any("sin la foto" in d for d in dicho)


def test_seguir_trae_y_devuelve(entorno):
    cli.lanzar(ids=["T1", "T2"], ahora=AHORA - 10 * 3600, lanzador=Lanzador(), decir=lambda *_: None)
    rama_t1 = _registro()[0]["rama_pedida"]
    traidas = []

    def traer():
        traidas.append(_progreso()["T1"]["estado"])
        return 0, ""

    ls = "abc\trefs/heads/%s\n" % rama_t1
    acciones = cli.seguir(aplicar=True, ahora=AHORA, ramas=lambda: cli.ramas_de_ls_remote(ls),
                          traer=traer, decir=lambda *_: None)
    assert acciones == {"T1": "traer", "T2": "devolver"}
    assert traidas == ["pendiente"]
    assert "sin rama tras 10 h" in _progreso()["T2"]["nota"]
    finales = {s["tarea"]: s.get("final") for s in _registro()}
    assert finales == {"T1": "traida", "T2": "devuelta"}


def test_seguir_sin_aplicar_solo_informa(entorno):
    cli.lanzar(ids=["T1"], ahora=AHORA - 10 * 3600, lanzador=Lanzador(), decir=lambda *_: None)
    antes = _progreso()
    llamado = []
    cli.seguir(aplicar=False, ahora=AHORA, ramas=set, traer=lambda: llamado.append(1), decir=lambda *_: None)
    assert _progreso() == antes and llamado == [] and _registro()[0].get("final") is None


def test_seguir_olvida_lo_que_ya_no_esta_prestada(entorno):
    cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None)
    traer_nube._actualizar_progreso({"T1": {"estado": "commit", "medio": ""}})
    cli.seguir(aplicar=True, ahora=AHORA, ramas=set, traer=lambda: (0, ""), decir=lambda *_: None)
    assert _registro() == []


def test_ciclo_no_lanza_con_la_pausa(entorno):
    cli._escribir_json(cli.PAUSA, {"motivo": "Alex lo pidió"})
    lz, dicho = Lanzador(), []
    assert cli.ciclo(ahora=AHORA, ramas=set, traer=lambda: (0, ""), lanzador=lz, decir=dicho.append) == []
    assert lz.llamadas == [] and any("pausa" in d for d in dicho)


def test_ciclo_sin_pausa_lanza(entorno):
    filas = cli.ciclo(ahora=AHORA, ramas=set, traer=lambda: (0, ""), lanzador=Lanzador(), decir=lambda *_: None)
    assert len(filas) == 2


def test_ver_resume_sin_claves(entorno):
    cli.lanzar(ids=["T1"], ahora=AHORA, lanzador=Lanzador(), decir=lambda *_: None)
    v = cli.ver(ahora=AHORA)
    assert v["vivas"] == 1 and v["restante_usd"] == 240 and v["presupuesto_hoy_usd"] > 0
    assert v["sesiones"][0]["url"].startswith("https://claude.ai/code/session_")


def test_plist_del_servicio_corre_ciclo_cada_15_min():
    import plistlib

    with open(os.path.join(AQUI, "com.starseed.alta-nube.plist"), "rb") as f:
        p = plistlib.load(f)
    assert p["Label"] == "com.starseed.alta-nube" and p["StartInterval"] == 900 and p["Nice"] == 10
    assert p["ProgramArguments"][-2:] == [os.path.join(
        "/Users/alex/Documents/starseed-os-main/scripts/puente", "alta-capacidad-nube.py"), "ciclo"]
    assert p["EnvironmentVariables"]["PATH"].startswith("/Users/alex/.local/bin:")
    assert p["StandardOutPath"].endswith("/.starseed/alta-nube.log") and "KeepAlive" not in p


def test_instalar_servicios_solo_alta_nube_adapta_rutas(tmp_path):
    import plistlib

    from test_instalar_servicios_produccion import _cargar_con_solo

    mod = _cargar_con_solo(str(tmp_path), solo="alta-nube")
    ag = tmp_path / "Library" / "LaunchAgents"
    assert sorted(os.listdir(ag)) == ["com.starseed.alta-nube.plist"]
    with open(ag / "com.starseed.alta-nube.plist", "rb") as f:
        p = plistlib.load(f)
    # La raíz la decide el entorno de quien corre la prueba (la Mac, la carpeta de traer_nube, la nube):
    # basta con que el servicio apunte al lanzador de ESTE repo.
    assert p["ProgramArguments"][2].endswith(os.path.join("scripts", "puente", "alta-capacidad-nube.py"))
    assert p["EnvironmentVariables"]["PATH"].startswith(str(tmp_path) + "/.local/bin:")
    assert p["StandardOutPath"] == str(tmp_path) + "/.starseed/alta-nube.log"
    assert p["StartInterval"] == 900
