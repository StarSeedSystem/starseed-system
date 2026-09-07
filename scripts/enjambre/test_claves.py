# -*- coding: utf-8 -*-
"""Tests de la capa de claves por medio del orquestador (2026-09-07, Ola 271, P9).

Pedido de Alex: si se agota una clave de un proveedor hay que tirar de la siguiente del
MISMO proveedor (repartida entre los distintos archivos de entorno de los medios) antes
de dar el proveedor por caído. Estos tests cubren la Tarea 4 del enunciado:

- `claves_de` recorre cada archivo por separado, encuentra `BASE` y `BASE_2` en medios
  distintos y deduplica valores repetidos.
- `agotar_clave` de la primera hace que `clave_activa` devuelva la segunda.
- Con las dos agotadas, `clave_activa` devuelve None y el proveedor queda `sin_cupo`.
- `estado_claves` nunca filtra valores: las cadenas de prueba no aparecen en su JSON.

Sin red ni archivos reales: las rutas de entorno (`RUTAS_ENV_CLAVES`) y el JSON de salud
(`SALUD_JSON`) se parchean a `tmp_path` con pytest (`monkeypatch`). El módulo se importa
con importlib porque el nombre del archivo lleva guiones (igual que test_alcance.py); el
import es seguro porque el arranque vive bajo `if __name__ == "__main__"`.
"""
import importlib.util
import io
import json
import os
import sys
import threading
import urllib.error

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

# Valores de PRUEBA (falsos y obvios): sirven para comprobar que jamás se escriben.
VALOR_1 = "clave-falsa-uno-no-usar"
VALOR_2 = "clave-falsa-dos-no-usar"
BASE = "PRUEBA_API_KEY"
PROV = "prueba"


@pytest.fixture()
def medios(tmp_path, monkeypatch):
    """Dos archivos de entorno falsos (medios distintos) y un JSON de salud aislado.

    medio1 tiene BASE y una COPIA del valor 2 (para probar la deduplicación por valor);
    medio2 tiene BASE_2. Además se aísla el entorno del proceso para que una variable
    real con el mismo nombre no contamine el test.
    """
    medio1 = tmp_path / "medio1.env"
    medio2 = tmp_path / "medio2.env"
    medio1.write_text("%s=%s\nOTRA_COSA=%s\n" % (BASE, VALOR_1, VALOR_2), encoding="utf-8")
    medio2.write_text("%s_2=%s\n" % (BASE, VALOR_2), encoding="utf-8")
    monkeypatch.setattr(enjambre, "RUTAS_ENV_CLAVES",
                        [("medio1", str(medio1)), ("medio2", str(medio2))])
    monkeypatch.setattr(enjambre, "SALUD_JSON", str(tmp_path / "salud.json"))
    monkeypatch.setitem(enjambre.CLAVES_POR_PROVEEDOR, PROV, [BASE])
    # El «proceso» también es un medio en _claves_crudas: lo vaciamos de variables PRUEBA_*.
    for nombre in [BASE] + ["%s_%d" % (BASE, n) for n in range(2, 10)]:
        monkeypatch.delenv(nombre, raising=False)
    return tmp_path


def test_claves_de_encuentra_medios_y_deduplica(medios):
    claves = enjambre.claves_de(PROV)
    assert len(claves) == 2                       # VALOR_1 + VALOR_2; la copia no cuenta
    assert claves[0]["var"] == BASE and claves[0]["medio"] == "medio1"
    assert claves[1]["var"] == BASE + "_2" and claves[1]["medio"] == "medio2"
    assert {c["valor"] for c in claves} == {VALOR_1, VALOR_2}
    assert enjambre.clave_activa(PROV)["valor"] == VALOR_1   # la primera no agotada


def test_agotar_una_rota_a_la_siguiente(medios):
    primera = enjambre.clave_activa(PROV)
    enjambre.agotar_clave(PROV, primera["huella"], "402 payment required")
    activa = enjambre.clave_activa(PROV)
    assert activa and activa["valor"] == VALOR_2            # relevo dentro del proveedor
    assert not enjambre.sin_cupo(PROV)                      # aún queda una: proveedor vivo
    # La primera sigue listada en claves_de pero al final (agotada):
    claves = enjambre.claves_de(PROV)
    assert len(claves) == 2 and claves[-1]["huella"] == primera["huella"]


def test_todas_agotadas_dan_none_y_sin_cupo(medios):
    for c in list(enjambre._claves_crudas(PROV)):
        enjambre.agotar_clave(PROV, c["huella"], "cuota gastada")
    assert enjambre.clave_activa(PROV) is None              # solo ahora se de marca sin cupo
    assert enjambre.sin_cupo(PROV)
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    agotadas = salud[PROV]["claves_agotadas"]
    assert len(agotadas) == 2
    assert all(set(v) == {"hasta", "motivo", "var", "medio"} for v in agotadas.values())


def test_estado_claves_jamas_escribe_valores(medios):
    # Provoca un estado con una clave activa y otra agotada, y comprueba que ni el objeto
    # ni su serialización JSON contienen ningún valor de clave: solo var/medio/huella.
    primera = enjambre.clave_activa(PROV)
    enjambre.agotar_clave(PROV, primera["huella"], "test")
    estado = enjambre.estado_claves()
    volcado = json.dumps(estado, ensure_ascii=False)
    assert VALOR_1 not in volcado and VALOR_2 not in volcado
    info = estado[PROV]
    assert info["activa"] == BASE + "_2"
    assert len(info["claves"]) == 2
    assert all(set(c) == {"var", "medio", "huella", "agotada_hasta"} for c in info["claves"])
    assert [c["huella"] for c in info["claves"]] == [primera["huella"], info["claves"][1]["huella"]]
    assert info["sin_cupo_hasta"] is None                   # queda una clave: no es sin cupo


# ── P9B: llamar_llm y las sondas cableados a la capa de claves ───────────────
# Tarea 4 (2026-09-07, Ola 271): un 402 agota la primera clave y el reintento sale con la
# segunda (cabecera Authorization de la segunda llamada); tres 429 de la misma huella en
# 10 min la agotan; con una sola clave agotada sí se marca sin_cupo; y tras un ciclo del
# supervisor el JSON de salud lleva la sección «claves». Sin red real: se parchea
# `urllib.request.urlopen` y `evento` (que, con clave ANON, enviaría al bus de Supabase).

PROV_HTTP = "xkiro"      # proveedor real de la flota con rama OpenAI-compatible en llamar_llm


@pytest.fixture()
def flota(medios, monkeypatch):
    """Fixture del P9B: los dos medios falsos de `medios` pasan a ser las claves de
    `xkiro` (en vez de las del proveedor ficticio), los contadores de 429 arrancan limpios
    y los eventos se graban en memoria en vez de viajar al bus."""
    monkeypatch.setitem(enjambre.CLAVES_POR_PROVEEDOR, "xkiro", [BASE])
    enjambre.RACHA_429.clear()
    eventos = []
    monkeypatch.setattr(enjambre, "evento", lambda tipo, tarea, texto, datos=None: eventos.append(texto))
    monkeypatch.setattr(enjambre, "ANON", "")       # jamás se habla con Supabase en tests
    return eventos


def _respuesta_ok(_texto="ok"):
    datos = json.dumps({"choices": [{"message": {"content": _texto}}]}).encode()
    return io.BytesIO(datos)


def _autorizacion(req):
    return req.get_header("Authorization")


def test_llamar_llm_402_rota_a_la_siguiente_clave(flota, monkeypatch):
    autorizaciones = []

    def urlopen_falso(req, timeout=None):
        autorizaciones.append(_autorizacion(req))
        if len(autorizaciones) == 1:
            raise urllib.error.HTTPError(req.full_url, 402, "Payment Required", {}, None)
        return _respuesta_ok()

    monkeypatch.setattr(enjambre.urllib.request, "urlopen", urlopen_falso)
    primera = enjambre.clave_activa("xkiro")
    assert primera["valor"] == VALOR_1
    assert enjambre.llamar_llm("xkiro", "modelo-x", "hola") == "ok"
    assert len(autorizaciones) == 2                                  # exactamente un reintento
    assert autorizaciones[0] == "Bearer " + VALOR_1                  # la original
    assert autorizaciones[1] == "Bearer " + VALOR_2                  # la rotada
    assert not enjambre.sin_cupo("xkiro")                            # ¿aún queda la segunda? sí
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    assert list(salud["xkiro"]["claves_agotadas"]) == [primera["huella"]]
    assert any("→" in e for e in flota)                              # evento de reenrutado


def test_llamar_llm_tres_429_agotan_la_huella(flota, monkeypatch):
    autorizaciones = []

    def urlopen_falso(req, timeout=None):
        autorizaciones.append(_autorizacion(req))
        raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", {}, None)

    monkeypatch.setattr(enjambre.urllib.request, "urlopen", urlopen_falso)
    primera = enjambre.clave_activa("xkiro")
    with pytest.raises(urllib.error.HTTPError):
        enjambre.llamar_llm("xkiro", "modelo-x", "hola")
    # Tres intentos con la primera (3×429 en 10 min) y solo entonces salta a la segunda.
    assert autorizaciones == ["Bearer " + VALOR_1] * 3 + ["Bearer " + VALOR_2]
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    assert primera["huella"] in salud["xkiro"]["claves_agotadas"]


def test_llamar_llm_clave_unica_agotada_marca_sin_cupo(flota, monkeypatch):
    # Solo la primera clave visible (se captura ANTES de parchear para no recursar):
    # al quedarse sin relevo, EL PROVEEDOR entero queda marcado sin cupo.
    primera = enjambre.clave_activa("xkiro")
    monkeypatch.setattr(enjambre, "_claves_crudas", lambda prov: [primera])
    monkeypatch.setattr(enjambre.urllib.request, "urlopen",
                        lambda req, timeout=None: _raise_402(req))
    with pytest.raises(urllib.error.HTTPError):
        enjambre.llamar_llm("xkiro", "modelo-x", "hola")
    assert enjambre.sin_cupo("xkiro")                                # no quedaba otra clave
    assert enjambre.clave_activa("xkiro") is None


def _raise_402(req):
    raise urllib.error.HTTPError(req.full_url, 402, "Payment Required", {}, None)


def test_supervisor_escribe_estado_claves_en_salud(flota, monkeypatch):
    # Una sola vuelta del supervisor: sondas que responden «vivo» y FIN que corta al final.
    monkeypatch.setattr(enjambre, "sondear", lambda prov, forzar=False: True)
    fin = threading.Event()
    monkeypatch.setattr(fin, "wait", lambda _s: True)

    def corta():
        return False

    # FIN.is_set() debe ser falso al entrar y verdadero tras la primera vuelta.
    llamadas = {"n": 0}

    def is_set():
        llamadas["n"] += 1
        return llamadas["n"] > len(enjambre.SONDAS) + 1

    monkeypatch.setattr(fin, "is_set", is_set)
    monkeypatch.setattr(enjambre, "FIN", fin)
    enjambre.supervisor_proveedores()
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    assert "claves" in salud
    assert salud["claves"]["xkiro"]["activa"] == BASE                # la primera, aún viva
    volcado = json.dumps(salud, ensure_ascii=False)
    assert VALOR_1 not in volcado and VALOR_2 not in volcado         # jamás valores
