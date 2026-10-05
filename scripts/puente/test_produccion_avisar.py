#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de produccion_avisar.py: cliente HTTP falso, cero red y cero disco."""

import io
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import produccion_avisar as pa


class RespuestaFalsa:
    def __init__(self, status=200):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return b"{}"


class ClienteFalso:
    def __init__(self, status=200, fallo=None):
        self.llamadas = []
        self.status = status
        self.fallo = fallo

    def urlopen(self, req, timeout=None):
        self.llamadas.append({"req": req, "timeout": timeout})
        if self.fallo is not None:
            raise self.fallo
        return RespuestaFalsa(self.status)


class TestAvisarVersion(unittest.TestCase):
    def test_post_al_tema_fijo_con_titulo_y_cuerpo_json(self):
        c = ClienteFalso()
        ok = pa.avisar_version("abc123", ["web", "mando"], cliente=c)
        self.assertTrue(ok)
        self.assertEqual(len(c.llamadas), 1)
        req = c.llamadas[0]["req"]
        self.assertEqual(req.full_url, "https://ntfy.sh/%s" % pa.TEMA_VERSION)
        self.assertEqual(req.get_method(), "POST")
        self.assertEqual(req.headers.get("Title"), "Nueva versión")
        cuerpo = json.loads(req.data.decode("utf-8"))
        self.assertEqual(cuerpo, {"sha": "abc123", "medios": ["web", "mando"]})
        self.assertEqual(c.llamadas[0]["timeout"], pa.TIMEOUT_S)

    def test_medios_vacios_por_defecto(self):
        c = ClienteFalso()
        self.assertTrue(pa.avisar_version("abc123", cliente=c))
        cuerpo = json.loads(c.llamadas[0]["req"].data.decode("utf-8"))
        self.assertEqual(cuerpo["medios"], [])

    def test_red_caida_nunca_lanza_y_devuelve_false(self):
        c = ClienteFalso(fallo=OSError("sin red"))
        self.assertFalse(pa.avisar_version("abc123", ["web"], cliente=c))

    def test_respuesta_no_2xx_devuelve_false(self):
        self.assertFalse(pa.avisar_version("abc123", cliente=ClienteFalso(status=500)))

    def test_main_nunca_falla_el_ciclo(self):
        self.assertEqual(pa.main(["x", "abc123", "web,mando"], cliente=ClienteFalso(fallo=OSError("caído"))), 0)
        self.assertEqual(pa.main(["x"], cliente=ClienteFalso()), 2)


if __name__ == "__main__":
    unittest.main()
