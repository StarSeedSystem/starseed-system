"""El rechazo automático sigue siendo firme, pero avisa (decisión de Alex, 16/09).

Se prueba lo que se puede probar sin red ni secretos: el texto del aviso, la lectura
de una clave a partir de líneas, y que un fallo al avisar NO deshaga el rechazo.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from desatascar import aviso_de_rechazo, clave_de_lineas, rechazar_puertas


class TestAvisoDeRechazo(unittest.TestCase):
    def test_lleva_tarea_motivo_y_rama(self):
        t = aviso_de_rechazo("p316I", "revisión bloqueante confirmada")
        self.assertIn("p316I", t)
        self.assertIn("revisión bloqueante confirmada", t)
        self.assertIn("ola/p316I", t)

    def test_dice_que_la_rama_se_conserva(self):
        # El aviso no es «se perdió esto», es «esto te espera».
        self.assertIn("conservada", aviso_de_rechazo("zX1", "lo que sea").lower())

    def test_distingue_el_rechazo_fallido(self):
        self.assertIn("No pude rechazar", aviso_de_rechazo("zX1", "m", ok=False))
        self.assertIn("Rechazo automático", aviso_de_rechazo("zX1", "m", ok=True))


class TestClaveDeLineas(unittest.TestCase):
    def test_lee_una_asignacion_simple(self):
        self.assertEqual(clave_de_lineas(["A=1", "B=2"], "B"), "2")

    def test_acepta_export_y_comillas(self):
        self.assertEqual(clave_de_lineas(['export T="abc"'], "T"), "abc")
        self.assertEqual(clave_de_lineas(["export T='abc'"], "T"), "abc")

    def test_ignora_comentarios_y_vacias(self):
        self.assertIsNone(clave_de_lineas(["# T=secreto", "", "   "], "T"))

    def test_no_confunde_un_nombre_que_empieza_igual(self):
        self.assertIsNone(clave_de_lineas(["TELEGRAM_BOT_TOKEN_VIEJO=x"], "TELEGRAM_BOT_TOKEN"))

    def test_valor_vacio_es_como_no_estar(self):
        self.assertIsNone(clave_de_lineas(["T="], "T"))

    def test_sin_lineas(self):
        self.assertIsNone(clave_de_lineas(None, "T"))
        self.assertIsNone(clave_de_lineas([], "T"))


class TestRechazarAvisa(unittest.TestCase):
    """Con un binario que no existe el rechazo falla, y eso basta: lo que se mira
    aquí es que el aviso se compone, se intenta, y que su fallo no rompe nada."""

    def test_intenta_avisar_una_vez_por_puerta(self):
        vistos = []

        def espia(texto):
            vistos.append(texto)
            return True

        rechazar_puertas(
            [("zA1", "revisión bloqueante confirmada"), ("zB2", "alcance incompleto")],
            binario="/no/existe/starseed-puente",
            avisar=espia,
        )
        self.assertEqual(len(vistos), 2)
        self.assertIn("ola/zA1", vistos[0])
        self.assertIn("ola/zB2", vistos[1])

    def test_si_el_aviso_falla_el_rechazo_sigue_su_curso(self):
        def rota(_texto):
            raise RuntimeError("sin red")

        frases = rechazar_puertas(
            [("zA1", "motivo")], binario="/no/existe/starseed-puente", avisar=rota
        )
        self.assertTrue(any("zA1" in f for f in frases))
        self.assertTrue(any("no pude avisarte" in f for f in frases))

    def test_sin_avisador_se_comporta_como_antes(self):
        frases = rechazar_puertas(
            [("zA1", "motivo")], binario="/no/existe/starseed-puente", avisar=None
        )
        self.assertEqual(len(frases), 1)


if __name__ == "__main__":
    unittest.main()
