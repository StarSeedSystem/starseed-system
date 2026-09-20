"""jev: consejero tipado con probabilidad, mudo sin clave y sin red en las pruebas."""
import os
import tempfile
import unittest

import jev


def _falso(respuestas):
    """Transporte que no toca la red: devuelve lo que le des y apunta lo que recibió."""
    recibido = []

    def t(cuerpo):
        recibido.append(cuerpo)
        return {"model": "typesafe/jev-1.13", "answers": respuestas, "usage": {"input_tokens": 10, "output_tokens": 2, "cost": 1e-6}}
    t.recibido = recibido
    return t


class Jev(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.CACHE = os.path.join(self._dir, "cache.json")
        jev.USO = os.path.join(self._dir, "uso.json")
        jev.TRANSPORTE = None
        os.environ["STARSEED_JEV"] = "0"

    def tearDown(self):
        jev.TRANSPORTE = None
        os.environ.pop("STARSEED_JEV", None)

    def test_apagado_devuelve_none_sin_tocar_nada(self):
        self.assertFalse(jev.activo())
        self.assertIsNone(jev.decidir({"a": 1}, {"q": {"type": "noul", "instructions": "?"}}))
        self.assertIsNone(jev.si_no({"a": 1}, "?"))
        self.assertIsNone(jev.elegir({"a": 1}, "?", {"x": "", "y": ""}))

    def test_si_no_lee_la_forma_medida(self):
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.44}})
        self.assertAlmostEqual(jev.si_no({"texto": "hola"}, "¿importa?"), 0.44)
        cuerpo = jev.TRANSPORTE.recibido[0]
        self.assertEqual(cuerpo["model"], jev.MODELO)
        self.assertEqual(cuerpo["questions"]["q"]["type"], "noul")

    def test_elegir_y_puntuar(self):
        jev.TRANSPORTE = _falso({
            "q": {"type": "choice", "choice": "descartar", "probabilities": {"descartar": 0.65, "reintentar": 0.29, "esperar": 0.06}, "confidence": 0.47},
        })
        opcion, probs, conf = jev.elegir({"t": "RS3b"}, "¿qué hacer?", {"descartar": "", "reintentar": "", "esperar": ""})
        self.assertEqual(opcion, "descartar")
        self.assertAlmostEqual(probs["reintentar"], 0.29)
        self.assertAlmostEqual(conf, 0.47)
        jev.TRANSPORTE = _falso({"q": {"type": "score", "score": 1.64, "probabilities": {"0": 0.13, "1": 0.1, "2": 0.77}, "confidence": 0.46}})
        punt, _, _ = jev.puntuar({"t": "RS3b"}, "prioridad", ["baja", "media", "alta"])
        self.assertAlmostEqual(punt, 1.64)
        self.assertEqual(jev.TRANSPORTE.recibido[0]["questions"]["q"]["criteria"], ["baja", "media", "alta"])

    def test_la_misma_pregunta_no_se_paga_dos_veces(self):
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.9}})
        jev.si_no({"x": 1}, "?")
        jev.si_no({"x": 1}, "?")
        self.assertEqual(len(jev.TRANSPORTE.recibido), 1)
        jev.si_no({"x": 2}, "?")
        self.assertEqual(len(jev.TRANSPORTE.recibido), 2)

    def test_error_de_red_es_none_no_excepcion(self):
        def roto(cuerpo):
            raise OSError("sin red")
        jev.TRANSPORTE = roto
        self.assertIsNone(jev.si_no({"x": 1}, "?"))

    def test_zona_con_umbrales(self):
        self.assertEqual(jev.zona(0.95), "si")
        self.assertEqual(jev.zona(0.7), "duda")
        self.assertEqual(jev.zona(0.2), "no")
        self.assertEqual(jev.zona(None), "duda")

    def test_clave_nunca_sale_en_el_uso(self):
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.5}})
        jev.si_no({"x": 1}, "?")
        self.assertNotIn("sk-", open(jev.USO).read() if os.path.exists(jev.USO) else "")


if __name__ == "__main__":
    unittest.main()
