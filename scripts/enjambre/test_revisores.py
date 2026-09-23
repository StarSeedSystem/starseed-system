# -*- coding: utf-8 -*-
"""Pruebas sin red de la memoria de cupo de revisores (Ola 261)."""
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

def _hace(minutos):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() - minutos * 60))

class SaludTemporalTest(unittest.TestCase):
    """Aísla la salud para que ninguna prueba toque la configuración real."""

    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.salud = os.path.join(self.temporal.name, "salud-proveedores.json")
        self.parche_salud = patch.multiple(
            enjambre, SALUD_JSON=self.salud, CERROJOS=self.temporal.name
        )
        self.parche_salud.start()

    def tearDown(self):
        self.parche_salud.stop()
        self.temporal.cleanup()

    def guardar(self, datos):
        with open(self.salud, "w", encoding="utf-8") as archivo:
            json.dump(datos, archivo)

    def leer(self):
        with open(self.salud, encoding="utf-8") as archivo:
            return json.load(archivo)
class SinCupoTest(SaludTemporalTest):
    def test_marcar_y_detectar(self):
        enjambre.marcar_sin_cupo("xkiro", "cuota diaria")
        self.assertTrue(enjambre.sin_cupo("xkiro"))
        # Respeta el resto de campos que ya tenía el proveedor.
        datos = self.leer()
        self.assertIn("sin_cupo_hasta", datos["xkiro"])
        self.assertEqual(datos["xkiro"]["motivo"], "cuota diaria")

    def test_fecha_pasada_no_es_sin_cupo(self):
        self.guardar({"aihubmix": {"sin_cupo_hasta": _hace(60), "motivo": "viejo"}})
        self.assertFalse(enjambre.sin_cupo("aihubmix"))

    def test_sin_entrada_no_es_sin_cupo(self):
        self.assertFalse(enjambre.sin_cupo("tokenrouter"))


class EnfriandoseTest(SaludTemporalTest):
    def test_429_reciente_enfria(self):
        self.guardar({"xkiro": {"ultimo_429": _hace(2)}})
        self.assertTrue(enjambre.enfriandose("xkiro"))

    def test_429_antiguo_ya_no_enfria(self):
        self.guardar({"xkiro": {"ultimo_429": _hace(20)}})
        self.assertFalse(enjambre.enfriandose("xkiro"))

    def test_sin_429_no_enfria(self):
        self.assertFalse(enjambre.enfriandose("nim"))


class CandidatosTest(SaludTemporalTest):
    def setUp(self):
        super().setUp()
        self.parche_ultimo = patch.object(enjambre, "REVISOR_ULTIMO_OK", "")
        self.parche_ultimo.start()

    def tearDown(self):
        self.parche_ultimo.stop()
        super().tearDown()

    def test_excluye_agotados_y_enfriandose(self):
        self.guardar({
            "xkiro": {"estado": "caido", "t": _hace(5)},
            "aihubmix": {"sin_cupo_hasta": _hace(-24 * 60), "motivo": "cuota"},
            "tokenrouter": {"ultimo_429": _hace(2)},
        })
        candidatos, saltados = enjambre.candidatos_revision()
        proveedores = [p for p, _ in candidatos]
        self.assertNotIn("xkiro", proveedores)        # caído
        self.assertNotIn("aihubmix", proveedores)     # sin cupo
        self.assertNotIn("tokenrouter", proveedores)  # enfriándose
        self.assertTrue(saltados)                     # aviso único con los motivos
        self.assertIn("sin cupo", " ".join(saltados))

    def test_todos_excluidos_devuelve_la_lista_completa(self):
        llena = {}
        for prov, _ in enjambre.REVISORES:
            llena.setdefault(prov, {"estado": "caido", "t": _hace(5)})
        self.guardar(llena)
        candidatos, saltados = enjambre.candidatos_revision()
        # Nunca nos quedamos sin revisor: la lista completa, como antes de la Ola 261.
        self.assertEqual(candidatos, list(enjambre.REVISORES))

    def test_ultimo_ok_desde_el_archivo(self):
        self.guardar({"ultimo_revisor_ok": "nim/moonshotai/kimi-k3"})
        candidatos, _ = enjambre.candidatos_revision()
        self.assertEqual("%s/%s" % candidatos[0], "nim/moonshotai/kimi-k3")

    def test_ultimo_ok_de_la_variable(self):
        enjambre.REVISOR_ULTIMO_OK = "llm7/minimax-m2.7"
        try:
            candidatos, _ = enjambre.candidatos_revision()
            self.assertEqual("%s/%s" % candidatos[0], "llm7/minimax-m2.7")
        finally:
            enjambre.REVISOR_ULTIMO_OK = ""


if __name__ == "__main__":
    unittest.main()
