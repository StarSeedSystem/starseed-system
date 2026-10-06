# -*- coding: utf-8 -*-
"""El orquestador consulta la sonda antes de lanzar opencode y aprende de lo que dice."""
import unittest
from unittest import mock
from test_progreso_irreversible import enjambre


class EscritorListo(unittest.TestCase):
    def setUp(self):
        self.mem = enjambre._sonda.Memoria()
        for nombre, valor in (("_SONDA_MEM", self.mem), ("MUERTOS", set())):
            p = mock.patch.object(enjambre, nombre, valor)
            p.start()
            self.addCleanup(p.stop)

    def test_cupo_diario_marca_al_proveedor_y_se_recuerda(self):
        with mock.patch.object(enjambre._sonda, "sondear", return_value=(False, "cupo del día agotado (429)", 3.0, False)) as s, \
             mock.patch.object(enjambre, "marcar_sin_cupo") as marca:
            self.assertEqual(enjambre.escritor_listo("openrouter/x:free"), (False, "cupo del día agotado (429)"))
            marca.assert_called_once()
            self.assertEqual(marca.call_args[0][0], "openrouter")
            self.assertEqual(marca.call_args[1]["horas"], 3.0)
            enjambre.escritor_listo("openrouter/x:free")
            self.assertEqual(s.call_count, 1)  # la segunda vez lo sabe sin preguntar

    def test_modelo_retirado_sale_de_la_rotacion(self):
        with mock.patch.object(enjambre._sonda, "sondear", return_value=(False, "modelo retirado (410)", 0, True)), \
             mock.patch.object(enjambre, "marcar_sin_cupo") as marca:
            self.assertFalse(enjambre.escritor_listo("nvidia/openai/gpt-oss-120b")[0])
            self.assertIn("nvidia/openai/gpt-oss-120b", enjambre.MUERTOS)
            marca.assert_not_called()

    def test_un_429_suelto_no_castiga_al_proveedor(self):
        with mock.patch.object(enjambre._sonda, "sondear", return_value=(False, "saturado (429)", 0.25, False)), \
             mock.patch.object(enjambre, "marcar_sin_cupo") as marca:
            self.assertFalse(enjambre.escritor_listo("nvidia/z-ai/glm-5.3")[0])
            marca.assert_not_called()

    def test_si_la_sonda_revienta_se_escribe_igual(self):
        with mock.patch.object(enjambre._sonda, "sondear", side_effect=RuntimeError("x")):
            self.assertEqual(enjambre.escritor_listo("openrouter/y"), (True, ""))

    def test_se_puede_apagar(self):
        with mock.patch.dict("os.environ", {"STARSEED_SONDA_ESCRITOR": "0"}), \
             mock.patch.object(enjambre._sonda, "sondear") as s:
            self.assertEqual(enjambre.escritor_listo("openrouter/y"), (True, ""))
            s.assert_not_called()


if __name__ == "__main__":
    unittest.main()
