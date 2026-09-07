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
import json
import os
import sys

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
