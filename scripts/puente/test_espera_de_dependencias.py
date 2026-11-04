# -*- coding: utf-8 -*-
"""Pruebas de espera_de_dependencias.py, con el caso real del 16/09."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import espera_de_dependencias as E


class TestCumplida(unittest.TestCase):
    def test_commit_cuenta(self):
        self.assertTrue(E.cumplida("commit"))

    def test_sin_cambios_no_cuenta(self):
        # Ola 264: G3 corrió con J1 en «sin_cambios» y buscó un archivo que
        # nunca llegó a main. Terminada no es integrada.
        self.assertFalse(E.cumplida("sin_cambios"))

    def test_nada_no_cuenta(self):
        self.assertFalse(E.cumplida(None))
        self.assertFalse(E.cumplida(""))


class TestVeredicto(unittest.TestCase):
    def test_todas_integradas_arranca(self):
        self.assertEqual(E.veredicto(["commit", "commit"]), "sigue")

    def test_el_caso_de_esta_noche(self):
        # SA3 esperaba a SA1 y SA2. Cuando estaban «fallo_tests» la daban por
        # muerta; ahora espera, y cuando pasan a commit arranca sola.
        self.assertEqual(E.veredicto(["fallo_tests", "fallo_tests"]), "espera")
        self.assertEqual(E.veredicto(["commit", "commit"]), "sigue")

    def test_dependencia_en_curso_es_espera(self):
        self.assertEqual(E.veredicto(["en_curso"]), "espera")

    def test_dependencia_rechazada_es_bloqueo(self):
        self.assertEqual(E.veredicto(["rechazada"]), "bloqueo")

    def test_una_muerta_entre_varias_manda(self):
        self.assertEqual(E.veredicto(["commit", "bloqueante", "en_curso"]), "bloqueo")

    def test_sin_nadie_trabajando_la_espera_se_cierra(self):
        # Si no queda nadie escribiendo, esperar es esperar a nadie.
        self.assertEqual(E.veredicto(["en_curso"], hay_alguien_trabajando=False), "bloqueo")

    def test_sin_dependencias_siempre_arranca(self):
        self.assertEqual(E.veredicto([]), "sigue")
        self.assertEqual(E.veredicto([], hay_alguien_trabajando=False), "sigue")


class TestEstadoEfectivo(unittest.TestCase):
    """(SUP0311F, 03-11) Una dependencia «sustituida» vale lo que su cadena, como en el revisor."""

    def test_el_caso_de_xr1010al(self):
        # XR1010G-d3 se cerró «sustituida»: el mismo encargo entró en main con XR1010G-d3b.
        prog = {"XR1010G-d3": {"estado": "sustituida"}, "XR1010G-d3b": {"estado": "commit"}}
        e = E.estado_efectivo("XR1010G-d3", prog, {}, para="XR1010AL")
        self.assertEqual(e, "integrada")
        self.assertEqual(E.veredicto([e]), "sigue")
        self.assertEqual(E.motivo(["XR1010G-d3"], [e], "sigue"), "")

    def test_sucesora_viva_se_espera_a_ella(self):
        prog = {"VZF1015M-d1": {"estado": "sustituida"}, "VZF1015M-d1b": {"estado": "pendiente_aprobacion"}}
        e = E.estado_efectivo("VZF1015M-d1", prog, {}, para="VZF1015M-d2")
        self.assertEqual(e, "pendiente_aprobacion")
        self.assertEqual(E.veredicto([e]), "espera")

    def test_sin_sucesora_es_bloqueo_y_no_espera_para_siempre(self):
        prog = {"X1": {"estado": "sustituida"}}
        e = E.estado_efectivo("X1", prog, {}, para="Y1")
        self.assertEqual(e, "sustituida")
        self.assertEqual(E.veredicto([e]), "bloqueo")
        self.assertIn("X1 (sustituida)", E.motivo(["X1"], [e], "bloqueo"))

    def test_la_tarea_que_espera_no_es_sucesora_de_su_dependencia(self):
        # VST1018Ib depende de VST1018I y no la rehace: esperarse a sí misma no es esperar.
        prog = {"VST1018I": {"estado": "sustituida", "sustituida_por": "VST1018Ib"},
                "VST1018Ib": {"estado": "pendiente"}}
        tareas = {"VST1018Ib": {"id": "VST1018Ib", "depende": ["VST1018I"]}}
        self.assertEqual(E.estado_efectivo("VST1018I", prog, tareas, para="VST1018Ib"), "sustituida")
        # Aunque no se tenga su definición, la propia tarea nunca cuenta como su sucesora viva.
        self.assertEqual(E.estado_efectivo("VST1018I", prog, {}, para="VST1018Ib"), "sustituida")

    def test_informe_cuenta_como_cumplida_y_descartada_como_muerta(self):
        self.assertEqual(E.estado_efectivo("SA1", {"SA1": {"estado": "informe"}}), "integrada")
        self.assertEqual(E.veredicto([E.estado_efectivo("D1", {"D1": {"estado": "descartada"}})]), "bloqueo")

    def test_lo_demas_tal_cual(self):
        prog = {"A": {"estado": "commit"}, "B": {"estado": "en_curso"}, "C": {"estado": "fallo_tests"}}
        self.assertEqual([E.estado_efectivo(d, prog) for d in ("A", "B", "C", "Z")],
                         ["commit", "en_curso", "fallo_tests", None])


class TestMotivo(unittest.TestCase):
    def test_esperar_se_dice_como_esperar(self):
        f = E.motivo(["SA1", "SA2"], ["commit", "en_curso"], "espera")
        self.assertIn("esperando", f)
        self.assertIn("SA2 (en_curso)", f)
        self.assertNotIn("SA1", f)      # la cumplida no se nombra

    def test_bloquear_se_dice_como_bloquear(self):
        f = E.motivo(["CU1"], ["rechazada"], "bloqueo")
        self.assertIn("dependencia no integrada", f)
        self.assertIn("CU1 (rechazada)", f)

    def test_sin_malas_no_hay_frase(self):
        self.assertEqual(E.motivo(["A"], ["commit"], "sigue"), "")


if __name__ == "__main__":
    unittest.main()
