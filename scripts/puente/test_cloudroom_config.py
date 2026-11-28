"""Pruebas de `cloudroom_config`: configurar y probar Cloudroom sin ejecutar room-cli."""
import json
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloudroom_config as C  # noqa: E402

RAIZ = "/repo/starseed-os-main"
NUBE = {"authenticated": True, "harnesses": [{"id": "pi", "models": [{"model": "nvidia/z-ai/glm-5.3"}]}]}
LOCAL = {"running": True}
ENV = {"variables": [{"name": "NVIDIA_API_KEY"}, {"name": "XKIRO_API_KEY"},
                     {"name": "GEMINI_API_KEY"}, {"name": "MISTRAL_API_KEY"}]}
PROYECTOS = {"projects": [{"id": "p1", "sources": [{"path": RAIZ}]}]}


def hecho(rc=0, salida="", error=""):
    return types.SimpleNamespace(returncode=rc, stdout=salida, stderr=error)


def correr(respuestas):
    ordenes = []

    def run(orden, **kw):
        ordenes.append((orden, kw.get("input")))
        for coincide, salida in respuestas:
            if coincide(orden):
                return salida
        return hecho()

    return run, ordenes


def configuracion_modelos(carpeta):
    ruta = os.path.join(str(carpeta), "modelos.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"modelos": ["nvidia/z-ai/glm-5.3"],
                   "claves": {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY",
                              "gemini": "GEMINI_API_KEY", "mistral": "MISTRAL_API_KEY"}}, f)
    return ruta


def test_sin_cli_no_hace_nada():
    r = C.configurar(cli="", raiz=RAIZ)
    assert r["estado"] == "no_disponible" and not r["listo"]
    assert any("instala" in p for p in r["pasos"])


def test_diagnostico_listo_usa_solo_nombres_de_claves(tmp_path):
    ruta = configuracion_modelos(tmp_path)
    d = C.diagnosticar(LOCAL, NUBE, ENV, PROYECTOS, RAIZ, ruta_modelos=ruta)
    assert d["listo"] and d["estado"] == "listo" and d["pasos"] == []
    assert d["proyecto"] == "p1"
    assert "NVIDIA_API_KEY" in d["claves"]
    assert C.ORDEN_LANZAR in d["detalle"]


def respuestas(raiz):
    proyectos = {"projects": [{"id": "p1", "sources": [{"path": str(raiz)}]}]}
    return [(lambda o: o[1] == "status", hecho(salida=json.dumps(LOCAL))),
            (lambda o: o[1:3] == ["cloud", "status"], hecho(salida=json.dumps(NUBE))),
            (lambda o: o[1:4] == ["cloud", "env", "list"], hecho(salida=json.dumps(ENV))),
            (lambda o: o[1:3] == ["project", "list"], hecho(salida=json.dumps(proyectos))),
            (lambda o: o[1:3] == ["thread", "count"], hecho(salida='{"count": 2}'))]


def test_configurar_en_seco_solo_prueba(tmp_path):
    run, ordenes = correr(respuestas(RAIZ))
    r = C.configurar(run=run, cli="room-cli", raiz=RAIZ, entorno={}, ruta_modelos=configuracion_modelos(tmp_path))
    assert r["listo"] and r["prueba"]["ok"] and not r["configurado"]
    assert [o[0][1:-1] for o in ordenes] == [["status"], ["cloud", "status"], ["cloud", "env", "list"],
                                            ["project", "list"], ["thread", "count"]]


def test_aplicar_setup_por_entrada_estandar(tmp_path):
    (tmp_path / "scripts" / "cloudroom").mkdir(parents=True)
    (tmp_path / "scripts" / "cloudroom" / "setup-nube.sh").write_text("#!/bin/sh\necho listo\n", encoding="utf-8")
    run, ordenes = correr(respuestas(str(tmp_path)))
    r = C.configurar(aplicar=True, run=run, cli="room-cli", raiz=str(tmp_path), entorno={},
                     ruta_modelos=configuracion_modelos(tmp_path))
    envio = [x for x in ordenes if x[0][1:4] == ["cloud", "setup", "set"]]
    assert r["listo"] and r["configurado"] and len(envio) == 1
    assert envio[0][0] == ["room-cli", "cloud", "setup", "set"]
    assert "echo listo" in envio[0][1]


def test_faltan_claves_y_proyecto(tmp_path):
    d = C.diagnosticar(LOCAL, NUBE, {"variables": []}, {"projects": []}, RAIZ,
                       ruta_modelos=configuracion_modelos(tmp_path))
    assert not d["listo"] and d["estado"] == "requiere_alex"
    assert d["proyecto"] == "" and any("claves" in p for p in d["pasos"])
    assert any("proyecto de Cloudroom" in p for p in d["pasos"])


def test_env_ilegible_pide_revisar_y_no_filtra_valores(tmp_path):
    d = C.diagnosticar(LOCAL, NUBE, {"variables": "no-lista"}, PROYECTOS, RAIZ,
                       ruta_modelos=configuracion_modelos(tmp_path))
    assert not d["listo"] and any("cloud env list" in p for p in d["pasos"])
    assert all(n.endswith("_KEY") for n in d["claves"])
