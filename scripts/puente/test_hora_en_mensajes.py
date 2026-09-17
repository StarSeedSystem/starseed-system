# -*- coding: utf-8 -*-
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hora_en_mensajes as H

# Un epoch fijo, en hora local de la máquina que ejecute la prueba.
EPOCH = time.mktime((2026, 9, 17, 16, 45, 0, 0, 0, -1))


class TestHora(unittest.TestCase):
    def test_pone_la_hora_al_final(self):
        self.assertEqual(H.con_hora("Codex agotado", EPOCH), "Codex agotado\n\n· 16:45")

    def test_no_la_duplica(self):
        una = H.con_hora("aviso", EPOCH)
        self.assertEqual(H.con_hora(una, EPOCH), una)

    def test_vacio_se_queda_vacio(self):
        self.assertEqual(H.con_hora("", EPOCH), "")
        self.assertEqual(H.con_hora(None, EPOCH), "")

    def test_respeta_el_markdown(self):
        # Una línea en negrita al final no puede quedar pegada a la hora.
        r = H.con_hora("*Pasarelas* · 2 de 10 escriben", EPOCH)
        self.assertTrue(r.endswith("\n\n· 16:45"))

    def test_detecta_marca_previa(self):
        self.assertTrue(H.ya_lleva_hora("x\n\n· 09:07"))
        self.assertFalse(H.ya_lleva_hora("x · 9:07"))
        self.assertFalse(H.ya_lleva_hora("corto"))


if __name__ == "__main__":
    unittest.main()
