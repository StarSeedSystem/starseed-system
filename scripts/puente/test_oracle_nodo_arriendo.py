# -*- coding: utf-8 -*-
"""Pruebas del carril Opus del arriendo (OPS1031B): la orden remota de `direccion` para (systemctl
stop) las piezas de dirección del A1 cuando OTRA neurona tiene el arriendo vigente; nunca las
unidades de BitNet, Colibri, FreeLLMAPI, puerta de datos ni el nodo de MetaGenesis. Puras, sin red."""
import contextlib
import io
import json
import os
import sys
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import oracle_nodo as N  # noqa: E402

AHORA = 1_800_000_000.0
VIGENTE_AJENO = {"dueno": "mac-foto123", "caduca": AHORA + 120, "version": 7, "tomado": AHORA - 60}
VIGENTE_A1 = {"dueno": "oracle-a1-foto123", "caduca": AHORA + 120, "version": 9, "tomado": AHORA - 60}
CADUCADO = {"dueno": "mac-foto123", "caduca": AHORA - 1, "version": 7}
ACTIVAS = ("starseed-direccion.service", "starseed-bitnet.service", "starseed-colibri.service",
           "a1-freellmapi.service", "starseed-puerta-datos.service", "starseed-metagenesis.service",
           "starseed-medio.service")


class DireccionAjena(unittest.TestCase):
    def test_otra_neurona_vigente_es_ajena(self):
        ajena, porque = N.direccion_ajena(VIGENTE_AJENO, AHORA)
        self.assertTrue(ajena)
        self.assertIn("mac-foto123", porque)

    def test_del_a1_libre_o_caducado_no_es_ajeno(self):
        for arriendo in (VIGENTE_A1, CADUCADO, {}, None):
            self.assertFalse(N.direccion_ajena(arriendo, AHORA)[0])


class UnidadesAParar(unittest.TestCase):
    def test_para_solo_la_direccion(self):
        ordenes, porque = N.unidades_direccion_a_parar(VIGENTE_AJENO, AHORA, ACTIVAS)
        self.assertEqual(ordenes, ["sudo systemctl stop starseed-direccion.service"])
        self.assertIn("mac-foto123", porque)
        todo = " ".join(ordenes)
        for ajena in ("bitnet", "colibri", "freellmapi", "puerta", "metagenesis"):
            self.assertNotIn(ajena, todo)

    def test_no_para_si_el_lider_es_el_a1_o_el_arriendo_caduco(self):
        for arriendo in (VIGENTE_A1, CADUCADO, None):
            ordenes, _ = N.unidades_direccion_a_parar(arriendo, AHORA, ACTIVAS)
            self.assertEqual(ordenes, [])


class AplicarConArriendo(unittest.TestCase):
    def _correr(self, activo, arriendo):
        ordenes = []

        def falso(orden, entrada=None, timeout=120):
            ordenes.append(orden)
            return (0, activo if "is-active" in orden else "")

        with mock.patch.object(N, "_arriendo_direccion", return_value=(arriendo, "")), \
                mock.patch.object(N, "ssh", side_effect=falso):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "direccion", "--aplicar"]), 0)
        return json.loads(salida.getvalue()), ordenes

    def test_si_otra_neurona_liderea_la_para_y_no_arranca_nada(self):
        r, ordenes = self._correr("active\n", VIGENTE_AJENO)
        self.assertTrue(any("stop starseed-direccion" in o for o in ordenes))
        self.assertFalse(any("daemon-reload" in o or "enable --now" in o for o in ordenes))
        self.assertTrue(all(h["ok"] for h in r["hecho"]))
        self.assertIn("mac-foto123", r.get("parado", ""))

    def test_si_otra_neurona_liderea_y_no_esta_viva_no_la_arranca(self):
        r, ordenes = self._correr("inactive\n", VIGENTE_AJENO)
        self.assertFalse(any("enable --now" in o or "stop " in o for o in ordenes))
        self.assertFalse(r["hecho"])
        self.assertTrue(r["ok"])

    def test_sin_arriendo_leible_como_antes(self):
        r, ordenes = self._correr("inactive\n", None)
        self.assertTrue(any("enable --now starseed-direccion" in o for o in ordenes))
        self.assertEqual(r.get("parado", ""), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
