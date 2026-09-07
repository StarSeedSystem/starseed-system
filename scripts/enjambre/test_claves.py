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
    # (2026-09-07, Ola 271, P9D) `agotar_clave` guarda también el `tipo` (429/402/cuota) que
    # decide las horas del agotamiento y que la sonda lee para liberar las claves de 429.
    assert all(set(v) == {"hasta", "motivo", "var", "medio", "tipo"} for v in agotadas.values())


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
    # (2026-09-07, Ola 271, P9C) Diseño real, tres llamadas SEPARADAS a llamar_llm (el
    # reintento con espera lo hace el bucle exterior con ESPERA_429_S, no esta función):
    # cada 429 se registra por huella (`_registrar_429_clave`) y la llamada lanza
    # HTTPError; al TERCER 429 en 10 min la huella se agota, la primera clave se marca
    # como agotada y ESA tercera llamada rota a la clave 2 y responde con ella.
    autorizaciones = []

    def urlopen_falso(req, timeout=None):
        autorizaciones.append(_autorizacion(req))
        if _autorizacion(req) == "Bearer " + VALOR_1:
            raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", {}, None)
        return _respuesta_ok()

    monkeypatch.setattr(enjambre.urllib.request, "urlopen", urlopen_falso)
    primera = enjambre.clave_activa("xkiro")
    with pytest.raises(urllib.error.HTTPError):
        enjambre.llamar_llm("xkiro", "modelo-x", "hola")       # 1.er 429: lanza
    with pytest.raises(urllib.error.HTTPError):
        enjambre.llamar_llm("xkiro", "modelo-x", "hola")       # 2.º 429: lanza
    assert enjambre.llamar_llm("xkiro", "modelo-x", "hola") == "ok"   # 3.er 429: agota y rota
    assert autorizaciones == ["Bearer " + VALOR_1] * 3 + ["Bearer " + VALOR_2]
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    assert primera["huella"] in salud["xkiro"]["claves_agotadas"]


def test_llamar_llm_clave_unica_agotada_marca_sin_cupo(flota, monkeypatch):
    # (2026-09-07, Ola 271, P9C) Solo la primera clave visible. Con un 402 y SIN relevo,
    # antes llamar_llm devolvía "" como si fuera una respuesta válida (el revisor podía
    # archivarla). Ahora: agotar la última clave marca al proveedor entero sin cupo y se
    # lanza RuntimeError; jamás se devuelve una cadena vacía como éxito.
    primera = enjambre.clave_activa("xkiro")
    monkeypatch.setattr(enjambre, "_claves_crudas", lambda prov: [primera])
    monkeypatch.setattr(enjambre.urllib.request, "urlopen",
                        lambda req, timeout=None: _raise_402(req))
    with pytest.raises(RuntimeError):
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


# ── P9D: horas por motivo, deduplicación de eventos y sonda ligera ──────────
# Tarea 3 (2026-09-07, Ola 271): el motivo distingue las horas de agotamiento (429 → 1 h;
# 402/cuota → 24 h); repetir `agotar_clave` de una huella ya agotada NO añade un segundo
# evento; la sonda ligera hace GET a `/models` (nunca `/chat/completions`) y un 200 tras un
# agotamiento por 429 limpia la entrada y recupera el proveedor. Sin red real: `urlopen`
# parcheado; los eventos se cuentan con el fixture `flota` (o patchando `evento`).

import time as _time


def _hasta_de(prov, huella):
    """Fecha `hasta` (epoch) de la entrada agotada de esa huella, o None."""
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    ent = (salud.get(prov) or {}).get("claves_agotadas") or {}
    txt = (ent.get(huella) or {}).get("hasta")
    if not txt:
        return None
    return _time.mktime(_time.strptime(txt, "%Y-%m-%d %H:%M:%S"))


def test_429_agota_una_hora_y_402_veinticuatro(medios):
    # (2026-09-07, Ola 271, P9D, Tarea 1) Tres 429 seguidos son solo un atasco de ritmo: 1 h.
    # Un 402 (o un aviso de cupo) es fin de cuota de verdad: 24 h. La tolerancia de 5 min
    # absorbe el redondeo de segundos entre `now` y la marca escrita.
    primera = enjambre.clave_activa(PROV)
    ahora = _time.time()
    enjambre.agotar_clave(PROV, primera["huella"], "tres 429 en 10 min", tipo="429")
    h429 = _hasta_de(PROV, primera["huella"])
    assert abs(h429 - (ahora + 3600)) < 300
    # Se re-agota con un motivo más grave (402): la fecha salta a 24 h y el tipo queda en 402.
    enjambre.agotar_clave(PROV, primera["huella"], "HTTP 402", tipo="402")
    h402 = _hasta_de(PROV, primera["huella"])
    assert abs(h402 - (ahora + 24 * 3600)) < 300
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    assert salud[PROV]["claves_agotadas"][primera["huella"]]["tipo"] == "402"


def test_repetir_agotar_no_duplica_evento(flota):
    # (2026-09-07, Ola 271, P9D, Tarea 1) Una huella YA agotada con `hasta` futuro no se
    # reescribe ni emite evento al repetir el mismo agotamiento; solo un motivo más grave
    # (402 sobre 429) alarga la fecha y avisa UNA vez más.
    primera = enjambre.clave_activa("xkiro")
    enjambre.agotar_clave("xkiro", primera["huella"], "tres 429", tipo="429")
    n_tras_429 = len(flota)
    enjambre.agotar_clave("xkiro", primera["huella"], "tres 429 otra vez", tipo="429")
    assert len(flota) == n_tras_429                     # mismo motivo 429: ni una palabra más
    enjambre.agotar_clave("xkiro", primera["huella"], "HTTP 402", tipo="402")
    assert len(flota) == n_tras_429 + 1                 # 402 sobre 429: un único aviso extra
    enjambre.agotar_clave("xkiro", primera["huella"], "HTTP 402 de nuevo", tipo="402")
    assert len(flota) == n_tras_429 + 1                 # y ya no vuelve a avisar


def _abre_200(_req, timeout=None):
    return io.BytesIO(b"{}")


def _registra_url(urls):
    def _urlopen(req, timeout=None):
        urls.append(req.full_url)
        return _abre_200(req, timeout=timeout)
    return _urlopen


def test_sonda_ligera_200_no_llama_chat(medios, monkeypatch):
    # (2026-09-07, Ola 271, P9D, Tarea 4) La sonda de cada ciclo es un GET a `/models` (que no
    # consume cupo), NO una generación en `/chat/completions` (que quemaba el cupo diario).
    # Se fuerza que xkiro disponga de la clave falsa de `medios` para poder sondearlo.
    monkeypatch.setitem(enjambre.CLAVES_POR_PROVEEDOR, "xkiro", [BASE])
    urls = []
    monkeypatch.setattr(enjambre.urllib.request, "urlopen", _registra_url(urls))
    kay = enjambre.clave_activa("xkiro")
    assert enjambre._sonda_ligera("xkiro", ("XKIRO_API_KEY",), kay) is True
    assert urls and all("models" in u and "chat/completions" not in u for u in urls)


def test_sonda_ligera_401_agota_clave_rechazada(medios, monkeypatch):
    # (2026-09-07, Ola 271, P9D, Tarea 4) Un 401/403 es una clave INVALIDA (no un límite de
    # cuota): se agota 24 h motivo «clave rechazada» y se rota a la siguiente si la hay.
    monkeypatch.setitem(enjambre.CLAVES_POR_PROVEEDOR, "xkiro", [BASE])
    primera = enjambre.clave_activa("xkiro")

    def _urlopen(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)

    monkeypatch.setattr(enjambre.urllib.request, "urlopen", _urlopen)
    assert enjambre._sonda_ligera("xkiro", ("XKIRO_API_KEY",), primera) is False
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    ent = salud["xkiro"]["claves_agotadas"].get(primera["huella"])
    assert ent and ent["tipo"] == "cuota"                 # 24 h (mismo trato que «cuota»)
    assert "rechazada" in ent["motivo"]


def test_sonda_200_tras_429_limpia_y_recupera(medios, monkeypatch):
    # (2026-09-07, Ola 271, P9D, Tarea 2) Tras agotar la única clave por 429 (1 h), la sonda
    # ligera con 200 libera ESA entrada y emite `proveedor_recuperado`; las 402/cuota aguantan.
    monkeypatch.setitem(enjambre.CLAVES_POR_PROVEEDOR, "xkiro", [BASE])
    eventos = []
    monkeypatch.setattr(enjambre, "evento", lambda tipo, tarea, texto, datos=None: eventos.append((tipo, texto)))
    primera = enjambre.clave_activa("xkiro")
    enjambre.agotar_clave("xkiro", primera["huella"], "tres 429", tipo="429")
    assert primera["huella"] in (json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))["xkiro"] or {}).get("claves_agotadas", {})
    monkeypatch.setattr(enjambre.urllib.request, "urlopen", _abre_200)
    assert enjambre._sonda_ligera("xkiro", ("XKIRO_API_KEY",), primera) is True
    salud = json.load(open(enjambre.SALUD_JSON, encoding="utf-8"))
    assert primera["huella"] not in (salud["xkiro"].get("claves_agotadas") or {})
    assert not enjambre.sin_cupo("xkiro")                 # la marca de sin cupo se liberó
    assert any(t == "proveedor_recuperado" for t, _ in eventos)
