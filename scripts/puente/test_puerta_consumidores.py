# -*- coding: utf-8 -*-
"""PDA1011: la vigía empuja el freno a la puerta de datos y latido_externo late allí también."""
import os
import sys
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import latido_externo as LE  # noqa: E402
import vigia_consumo as V  # noqa: E402


class PuertaFalsa:
    def __init__(self, configurada=True, sana=True):
        self._c, self.sana, self.llamadas = configurada, sana, []

    def configurada(self):
        return self._c

    def freno_poner(self, activo, motivo=None, hasta=None, respaldo=None):
        self.llamadas.append(("freno", activo, motivo, hasta))
        return {"via": "puerta"} if self.sana else {"via": "supabase", "resultado": respaldo({})}

    def latido(self, clase, ident, datos=None, respaldo=None):
        self.llamadas.append(("latido", clase, ident, datos))
        return {"via": "puerta"}


class Freno(unittest.TestCase):
    def test_empuja_el_estado_del_freno(self):
        p = PuertaFalsa()
        via = V.empujar_freno({"activo": True, "motivo": "presupuesto", "hasta": "2026-10-11T00:00:00Z"}, p)
        self.assertEqual(via, "puerta")
        self.assertEqual(p.llamadas, [("freno", True, "presupuesto", "2026-10-11T00:00:00Z")])

    def test_sin_puerta_o_caida_no_pasa_nada(self):
        self.assertEqual(V.empujar_freno({"activo": False}, PuertaFalsa(configurada=False)), "sin_puerta")
        self.assertEqual(V.empujar_freno({"activo": False}, PuertaFalsa(sana=False)), "supabase")


class LatidoExterno(unittest.TestCase):
    def test_late_en_la_puerta_sin_prompts_ni_claves(self):
        p = PuertaFalsa()
        falso = type("M", (), {"Puerta": type("P", (), {"desde_entorno": staticmethod(lambda rol: p)})})
        with mock.patch.dict(sys.modules, {"puerta_datos_cliente": falso}), mock.patch.dict(os.environ, {"STARSEED_LATIDO_PUERTA": "auto"}):
            self.assertEqual(LE.latir_puerta("cowork", "PDA1011", {"titulo": "t", "fase": "escribiendo", "prompt": "no"}), "puerta")
            self.assertEqual(LE.latir_puerta("cowork", "PDA1011", None), "puerta")
        _, clase, ident, datos = p.llamadas[0]
        self.assertEqual((clase, ident), ("agente", "cowork:PDA1011"))
        self.assertNotIn("prompt", datos)
        self.assertTrue(p.llamadas[1][3]["fin"])

    def test_interruptor(self):
        with mock.patch.dict(os.environ, {"STARSEED_LATIDO_PUERTA": "apagada"}):
            self.assertEqual(LE.latir_puerta("cowork", "X", {}), "sin_puerta")


class AltaNodos(unittest.TestCase):
    def test_lee_nodo_y_huella_de_la_salida_de_llave(self):
        import puerta_datos as P
        salida = "Nodo oracle-a1-abc123 · huella de su llave: %s\nPara darla de alta…" % ("f" * 64)
        self.assertEqual(P._llave_de_nodo(salida), ("oracle-a1-abc123", "f" * 64))
        self.assertIsNone(P._llave_de_nodo("sin nada"))
        self.assertEqual(P._medio_de_nodo("oracle-a1-abc123"), "oracle-a1")
        self.assertEqual(P._medio_de_nodo("mac-abc123"), "mac")


if __name__ == "__main__":
    unittest.main()
