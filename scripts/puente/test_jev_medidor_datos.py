"""Jev: lo que anota para el medidor del Mando (2026-09-25). Sin red.

- quién pregunta y qué habilidad usa, por día;
- la caché cuenta; la latencia de OpenRouter es la suya, no la del intento local;
- el motor local se aparta 10 min tras 3 intentos sin respuesta;
- el contrato openjev (/api/jev/systemone) devuelve respuestas legibles.
"""
import json, os, sys, tempfile, time, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jev


class _LocalMudo:
    llamadas = 0

    @staticmethod
    def disponible():
        return True

    @classmethod
    def decidir(cls, estado, preguntas):
        cls.llamadas += 1
        time.sleep(0.05)
        return None


class MedidorDatos(unittest.TestCase):
    def setUp(self):
        d = tempfile.mkdtemp()
        self._orig = (jev.USO, jev.CACHE, jev.TRANSPORTE, jev._transporte_real, jev._local, jev.decidir_con_laya)
        jev.USO, jev.CACHE, jev.TRANSPORTE = os.path.join(d, "uso.json"), os.path.join(d, "cache.json"), None
        os.environ["OPENROUTER_API_KEY"] = "prueba-no-real"
        jev.decidir_con_laya = lambda *a, **k: None
        jev._local = lambda: None

        def falso(cuerpo):
            nombre = next(iter(cuerpo["questions"]))
            return {"answers": {nombre: {"type": "noul", "noul": 0.8}}, "model": "typesafe/jev",
                    "usage": {"input_tokens": 400, "output_tokens": 0, "cost": 0.00002}}
        jev._transporte_real = falso

    def tearDown(self):
        jev.USO, jev.CACHE, jev.TRANSPORTE, jev._transporte_real, jev._local, jev.decidir_con_laya = self._orig
        os.environ.pop("OPENROUTER_API_KEY", None)

    def uso(self):
        return json.load(open(jev.USO))

    def test_anota_quien_pregunta_y_la_habilidad(self):
        self.assertAlmostEqual(jev.si_no({"x": 1}, "¿vale?"), 0.8)
        dia = self.uso()["dias"][time.strftime("%Y-%m-%d")]
        self.assertEqual(dia["por_quien"], {"test_jev_medidor_datos": 1})
        self.assertEqual(dia["por_tipo"], {"noul": 1})

    def test_la_cache_cuenta_sin_pagar(self):
        jev.si_no({"x": 2}, "¿vale?")
        jev.si_no({"x": 2}, "¿vale?")
        u = self.uso()
        self.assertEqual(u["llamadas"], 1)
        self.assertEqual(u["dias"][time.strftime("%Y-%m-%d")]["cache"], 1)

    def test_el_local_mudo_se_aparta_y_no_ensucia_la_latencia(self):
        _LocalMudo.llamadas = 0
        jev._local = lambda: _LocalMudo
        for i in range(5):
            jev.si_no({"x": 10 + i}, "¿vale?")
        self.assertEqual(_LocalMudo.llamadas, jev.LOCAL_FALLOS_MAX)  # luego, circuito abierto
        self.assertTrue(jev.local_en_pausa())
        ms = self.uso()["por_medio"]["openrouter"]["ms"]
        self.assertTrue(all(m < 40 for m in ms), ms)  # sin los 50 ms del local mudo

    def test_contrato_openjev_legible(self):
        r = jev.contrato({"state": "publicado", "questions": [
            {"id": "imp", "type": "noul", "question": "¿Importa?"}]})
        self.assertEqual(r["answers"][0]["id"], "imp")
        self.assertEqual(r["answers"][0]["answer"], "sí")
        self.assertAlmostEqual(r["answers"][0]["probs"]["sí"], 0.8)
        self.assertEqual(r["medio"], "openrouter")


if __name__ == "__main__":
    unittest.main()
