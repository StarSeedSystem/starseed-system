"""director_jev: Jev consejero de los directores, nunca autoridad."""

import types
import unittest

import director_jev


def _jev_falso(probabilidad):
    """Un módulo con la forma de jev: solo se usa `si_no`. La llamada se cuenta."""
    m = types.SimpleNamespace(llamadas=0)

    def si_no(estado, pregunta):
        m.llamadas += 1
        return probabilidad

    m.si_no = si_no
    return m


class ConsejoDeLanzamiento(unittest.TestCase):
    def test_no_determinista_nunca_se_vuelve_si(self):
        """Jev no puede revertir un NO, ni aunque quiera lanzar con toda la
        confianza del mundo: la regla protege cupos y crédito."""
        jev = _jev_falso(0.0)  # «no es mala idea en absoluto»
        decision, motivo = director_jev.consejo_de_lanzamiento("estado", False, jev)
        self.assertFalse(decision)
        self.assertIn("determinista", motivo)
        # y ni siquiera se gastó la llamada:
        self.assertEqual(jev.llamadas, 0)

    def test_si_determinista_jev_con_probabilidad_alta_frena(self):
        jev = _jev_falso(0.86)
        decision, motivo = director_jev.consejo_de_lanzamiento("estado", True, jev)
        self.assertFalse(decision)
        self.assertEqual(motivo, "Jev frenó: 0.86")

    def test_si_determinista_jev_con_probabilidad_baja_deja_pasar(self):
        jev = _jev_falso(0.3)
        decision, motivo = director_jev.consejo_de_lanzamiento("estado", True, jev)
        self.assertTrue(decision)
        self.assertIn("Jev dejó pasar: 0.30", motivo)

    def test_sin_jev_gana_el_determinista(self):
        decision, motivo = director_jev.consejo_de_lanzamiento("estado", True, None)
        self.assertTrue(decision)
        self.assertIn("determinista", motivo)

    def test_jev_mudo_gana_el_determinista(self):
        """None de `si_no` (sin presupuesto, sin red, duda) no es una opinión."""
        jev = _jev_falso(None)
        decision, motivo = director_jev.consejo_de_lanzamiento("estado", True, jev)
        self.assertTrue(decision)
        self.assertIn("determinista", motivo)


if __name__ == "__main__":
    unittest.main()
