# -*- coding: utf-8 -*-
"""SUP0311F (03-11): el orquestador espera a la CADENA de una dependencia, como el revisor.

XR1010AL esperaba a XR1010G-d3, «sustituida» porque su encargo entró en main con XR1010G-d3b.
El revisor de bloqueadas la reabría («sus dependencias ya están en main») y el orquestador la
volvía a dejar «esperando a que se integre: XR1010G-d3 (sustituida)»: nunca corría."""
import importlib.util
import os
import re
import sys
import unittest
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA = os.path.join(AQUI, "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_deps_1103", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_deps_1103"] = enjambre
ESPEC.loader.exec_module(enjambre)

# El orquestador importa `espera_de_dependencias` del checkout de STARSEED_ROOT (en la Mac, el main
# vivo). La prueba usa el de ESTE árbol, el que se está probando.
_espec = importlib.util.spec_from_file_location(
    "espera_de_dependencias_1103", os.path.join(AQUI, "..", "puente", "espera_de_dependencias.py"))
ESPERA = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(ESPERA)


class EstadosDeDependencias(unittest.TestCase):
    def setUp(self):
        parche = mock.patch.object(enjambre, "_espera_dep", ESPERA)
        parche.start()
        self.addCleanup(parche.stop)

    def test_sustituida_con_sucesora_en_main_ya_no_se_espera(self):
        prog = {"XR1010G-d3": {"estado": "sustituida"}, "XR1010G-d3b": {"estado": "commit"}}
        est = enjambre.estados_de_dependencias(["XR1010G-d3"], prog=prog, tareas={}, para="XR1010AL")
        self.assertEqual(est, ["integrada"])
        self.assertEqual(enjambre._espera_dep.veredicto(est), "sigue")

    def test_sin_sucesora_bloquea_en_vez_de_esperar_para_siempre(self):
        est = enjambre.estados_de_dependencias(["X1"], prog={"X1": {"estado": "sustituida"}}, tareas={}, para="Y1")
        self.assertEqual(enjambre._espera_dep.veredicto(est, hay_alguien_trabajando=True), "bloqueo")

    def test_los_demas_estados_no_cambian(self):
        prog = {"A": {"estado": "commit"}, "B": {"estado": "en_curso"}}
        self.assertEqual(enjambre.estados_de_dependencias(["A", "B", "Z"], prog=prog, tareas={}),
                         ["commit", "en_curso", None])

    def test_sin_el_modulo_nuevo_como_antes(self):
        class Viejo(object):  # el respaldo del orquestador cuando no hay `estado_efectivo`
            pass
        with mock.patch.object(enjambre, "_espera_dep", Viejo):
            prog = {"X1": {"estado": "sustituida"}, "X1b": {"estado": "commit"}}
            self.assertEqual(enjambre.estados_de_dependencias(["X1"], prog=prog, tareas={}), ["sustituida"])

    def test_el_bucle_usa_la_cadena_y_no_el_id_suelto(self):
        fuente = open(RUTA, encoding="utf-8").read()
        self.assertRegex(fuente, r"_est_dep = estados_de_dependencias\(_ids_dep, para=tid\)")
        self.assertIsNone(re.search(r"_est_dep = \[PROG\.get\(d, \{\}\)\.get\(\"estado\"\)", fuente))


if __name__ == "__main__":
    unittest.main()
