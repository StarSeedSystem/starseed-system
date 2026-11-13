#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1114 §7.8 · simulación de puerta tomada con la puerta REAL (prueba cruzada, calcada de
test_genesis_chats_cruce.py). La escribe GEN1114B pero solo pasa en la integración (GEN1114INT), cuando la
puerta de GEN1114A (`chats-genesis-firma.mjs`) está fundida: hasta entonces se salta.

La puerta corre en 127.0.0.1 con el arnés de siempre (`cruce-genesis-arnes.mjs`); la Mac es
`genesis_chats_puerta.PuenteGenesis` con su cliente HTTP real, una lista de altas temporal (de este usuario,
leída con `dueno_altas = os.getuid()`) y el `canon.json` de ejemplo. Lo que la puerta honrada rechazaría
(casos a, e, h, i) se escribe directamente en su SQLite, como haría una puerta tomada; para eso el arnés
debe dar la ruta de su base en `sqlite` (si no la da, esos cuatro casos se saltan y se dice).
"""
import json
import os
import sqlite3
import sys
import time

import pytest

CARPETA = os.path.dirname(os.path.abspath(__file__))
if CARPETA not in sys.path:
    sys.path.insert(0, CARPETA)

FIRMA_MJS = os.path.normpath(os.path.join(CARPETA, "..", "..", "servicios", "puerta-datos", "src", "chats-genesis-firma.mjs"))
pytestmark = pytest.mark.skipif(not os.path.exists(FIRMA_MJS),
                                reason="falta la puerta de GEN1114A (chats-genesis-firma.mjs): pasa en la integración")

if os.path.exists(FIRMA_MJS):
    import genesis_chats_puerta as G  # noqa: E402
    import genesis_firma_logica as F  # noqa: E402
    import test_genesis_chats_cruce as C  # noqa: E402  (solo lectura: PuertaViva, Mac y compañía)
    from test_genesis_firma_logica import CANON, CHAT_A, CHAT_B, Aparato, decir_al_hilo, orden_a, texto_a_hermes  # noqa: E402


def _sobre(aparato, carga):
    """El cuerpo que manda la web (EntradaFirmada v2): la carga en base64url, la firma r‖s y la huella."""
    s = aparato.sobre(carga)
    return {"v": 2, "carga": s["carga"], "firma": s["firma"], "aparato": s["aparato"]}


@pytest.fixture(scope="module")
def puerta():
    p = C.PuertaViva()
    yield p
    p.cerrar()


def _mac(puerta, aparatos):
    m = C.Mac(puerta)
    ruta = os.path.join(m.dir, "StarSeed", "genesis-aparatos.json")
    os.makedirs(os.path.dirname(ruta), mode=0o755, exist_ok=True)   # (GEN1114INT: Mac ya la crea)
    G.escribir_json(ruta, {"v": 1, "aparatos": [a.fila() for a in aparatos]})
    os.chmod(ruta, 0o644)
    G.escribir_json(os.path.join(m.base, "canon.json"), CANON)
    m.svc.ruta_altas, m.svc.dueno_altas, m.svc.llevar = ruta, os.getuid(), (lambda **kw: (True, "prueba"))
    return m


def _inyectar(puerta, cuenta, carga_b64, firma, aparato):
    ruta = getattr(puerta, "sqlite", None)
    if not ruta:
        pytest.skip("el arnés no da la ruta de su SQLite: los casos a, e, h, i van en la integración")
    with sqlite3.connect(ruta) as db:
        db.execute("INSERT INTO genesis_entradas (cuenta, rol, destino, nonce, datos, cambia, recibido, estado, actualizado,"
                   " carga, firma, aparato) VALUES (?, 'dueño', 'mac', ?, '{}', 1, ?, 'en-cola', ?, ?, ?, ?)",
                   (cuenta, "iny-%d" % time.time_ns(), int(time.time() * 1000), int(time.time() * 1000),
                    carga_b64, firma, aparato))


def test_la_mac_solo_ejecuta_lo_firmado_aunque_la_puerta_mienta(puerta):
    dueno = puerta.cuentas["dueno"]
    a, t = Aparato(cuenta=dueno, nivel="completo"), Aparato(cuenta=dueno, nivel="texto")
    otro = Aparato(cuenta=dueno)                                     # no emparejado
    mac = _mac(puerta, [a, t])
    try:
        ahora = time.time()
        ida = lambda c: puerta.http("POST", "/v1/genesis/chats/entrada", "dueno", _sobre(a, c))  # noqa: E731
        assert ida(a.carga(decir_al_hilo(1, "original"), t=ahora))[0] == 201
        mac.vuelta()
        k = a.carga(decir_al_hilo(11, "k"), t=ahora)
        envios = [
            puerta.http("POST", "/v1/genesis/chats/entrada", "dueno", _sobre(otro, otro.carga(orden_a(2), chat=CHAT_A, t=ahora))),
            ida(a.carga(orden_a(5), chat=CHAT_A, t=ahora - 31 * 60)),
            ida(a.carga(texto_a_hermes(6), chat=CHAT_A, t=ahora - 31 * 60)),
            puerta.http("POST", "/v1/genesis/chats/entrada", "dueno", _sobre(t, t.carga(texto_a_hermes(9), chat=CHAT_A, t=ahora))),
            ida(k), ida(k),
            ida(a.carga(orden_a(12, args=("L8",)), chat=CHAT_A, t=ahora, seq=8008)),
            ida(a.carga(orden_a(13, args=("L7",)), chat=CHAT_A, t=ahora, seq=8007)),
        ]
        assert all(e[0] in (201, 409) for e in envios), envios
        mac.vuelta()
        assert [x["ids"] for x in mac.puente.ordenes] == [["L8"], ["L7"]]
        assert mac.local.posts == [] and mac.puente.dichos == []
        assert [r["firma"] for r in mac.registro()].count("ok") >= 3
        # Los casos que la puerta honrada no deja pasar, escritos en su SQLite como haría una puerta tomada.
        c_h = a.carga(texto_a_hermes(7), chat=CHAT_B, t=ahora)
        s_h = _sobre(a, c_h)
        _inyectar(puerta, dueno, s_h["carga"], s_h["firma"], s_h["aparato"])
        mac.vuelta()
        assert mac.local.posts == []
    finally:
        mac.limpiar()
