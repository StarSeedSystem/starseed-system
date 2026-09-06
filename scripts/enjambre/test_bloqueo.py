# -*- coding: utf-8 -*-
"""Tests del visto bueno ante bloqueos confirmados (2026-09-06, Ola 261, P4).

Cubre `debe_pedir_visto_bueno`: un bloqueo confirmado o un alcance incompleto ya no se
integran solos —la rama pasa al flujo de aprobación humana— salvo que se fuerce con
`--integrar-bloqueantes`. El módulo se importa con importlib porque el nombre del archivo
lleva guiones; el import es seguro (el arranque vive bajo `if __name__ == "__main__"`).
"""
import importlib.util
import os
import sys
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class DebePedirVistoBuenoTest(unittest.TestCase):
    def test_bloqueo_confirmado_pide_visto_bueno(self):
        pedir, motivo = enjambre.debe_pedir_visto_bueno(True, [], False, [])
        self.assertTrue(pedir)
        self.assertIn("bloqueante", motivo)

    def test_alcance_incompleto_pide_visto_bueno(self):
        pedir, motivo = enjambre.debe_pedir_visto_bueno(False, ["a.ts"], False, [])
        self.assertTrue(pedir)
        self.assertIn("alcance", motivo)
        self.assertIn("a.ts", motivo)

    def test_integrar_bloqueantes_fuerza_integracion(self):
        pedir, motivo = enjambre.debe_pedir_visto_bueno(True, [], False, ["--integrar-bloqueantes"])
        self.assertFalse(pedir)
        self.assertEqual(motivo, "")

    def test_aprobacion_pedida_por_la_cola(self):
        pedir, motivo = enjambre.debe_pedir_visto_bueno(False, [], True, [])
        self.assertTrue(pedir)
        self.assertTrue(motivo.startswith("pedido por la cola"))

    def test_sin_motivo_no_pide_visto_bueno(self):
        pedir, motivo = enjambre.debe_pedir_visto_bueno(False, [], False, [])
        self.assertFalse(pedir)
        self.assertEqual(motivo, "")


if __name__ == "__main__":
    unittest.main()
