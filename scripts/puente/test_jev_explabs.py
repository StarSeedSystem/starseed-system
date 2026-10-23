# -*- coding: utf-8 -*-
"""Jev: Experiential Labs (gratis) va antes que OpenRouter (de pago); nunca toca la red en pruebas."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import jev  # noqa: E402


def _falso(respuestas, recibido=None, falla=False):
    def f(cuerpo):
        if recibido is not None:
            recibido.append(cuerpo)
        if falla:
            raise OSError("402")
        return {"answers": respuestas, "usage": {"cost": 0.0}}
    return f


def _falso_decisions(respuestas, recibido=None, falla=False):
    """Transporte falso para la API de Decisions (formato OpenAI)."""
    def f(cuerpo):
        if recibido is not None:
            recibido.append(cuerpo)
        if falla:
            raise OSError("402")
        # Formato de respuesta de OpenAI Decisions API
        answers = []
        for i, (nombre, ans) in enumerate(respuestas.items()):
            if ans.get("type") == "noul":
                answers.append({
                    "type": "predicate",
                    "name": nombre,
                    "probability": ans.get("noul", 0.5)
                })
            elif ans.get("type") == "choice":
                probs = ans.get("probabilities", {})
                choice = ans.get("choice")
                prob_list = [{"value": k, "probability": v} for k, v in probs.items()]
                answers.append({
                    "type": "choice",
                    "name": nombre,
                    "choice": choice,
                    "probabilities": prob_list,
                    "confidence": ans.get("confidence", 0.8)
                })
            elif ans.get("type") == "score":
                probs = ans.get("probabilities", {})
                score = ans.get("score", 0)
                prob_list = [{"label": str(k), "value": int(k), "probability": v} for k, v in probs.items()]
                answers.append({
                    "type": "score",
                    "name": nombre,
                    "score": score,
                    "probabilities": prob_list,
                    "confidence": ans.get("confidence", 0.8)
                })
        return {"answers": answers, "model": "gpt-6-luna-decisions", "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15, "input_tokens_details": {}, "output_tokens_details": {}}}
    return f


class ExplabsAntesQueOpenrouter(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.antes = (jev.CACHE, jev.USO, jev.EXPLABS_PROMOS, jev.TRANSPORTE, jev.TRANSPORTE_EXPLABS, jev.TRANSPORTE_EXPLABS_DECISIONS)
        jev.CACHE = os.path.join(self.d, "cache.json")
        jev.USO = os.path.join(self.d, "uso.json")
        jev.EXPLABS_PROMOS = os.path.join(self.d, "promos.json")
        os.environ["STARSEED_LAYA_URL"] = "http://127.0.0.1:1"
        os.environ["STARSEED_JEV"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"

    def tearDown(self):
        jev.CACHE, jev.USO, jev.EXPLABS_PROMOS, jev.TRANSPORTE, jev.TRANSPORTE_EXPLABS, jev.TRANSPORTE_EXPLABS_DECISIONS = self.antes
        for k in ("STARSEED_LAYA_URL", "STARSEED_JEV", "OPENROUTER_API_KEY", "STARSEED_JEV_EXPLABS"):
            os.environ.pop(k, None)

    def test_gratis_primero(self):
        pedido = []
        jev.TRANSPORTE_EXPLABS = _falso({"q": {"type": "noul", "noul": 0.9}}, pedido)
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.1}})
        r = jev.decidir("estado", {"q": {"type": "noul", "instructions": "¿sí?"}}, usar_cache=False, medio=None)
        self.assertEqual(r["medio"], "explabs")
        self.assertEqual(pedido[0]["model"], "jev-latest")

    def test_si_falla_sigue_a_openrouter(self):
        jev.TRANSPORTE_EXPLABS = _falso({}, falla=True)
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.2}})
        r = jev.decidir("estado", {"q": {"type": "noul", "instructions": "¿sí?"}}, usar_cache=False)
        self.assertEqual(r["medio"], "openrouter")

    def test_en_pruebas_sin_transporte_propio_no_toca_la_red(self):
        jev.TRANSPORTE_EXPLABS = None
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.3}})
        self.assertEqual(jev._intenta_explabs("e", {"q": {"type": "noul"}}), (None, None))

    def test_modelos_de_la_foto_de_promociones(self):
        with open(jev.EXPLABS_PROMOS, "w") as f:
            f.write('{"decisiones_gratis": ["clef-flash"]}')
        self.assertEqual(jev.modelos_explabs(), ["clef-flash"])
        os.remove(jev.EXPLABS_PROMOS)
        self.assertEqual(jev.modelos_explabs(), ["jev-latest", "clef-flash"])

    def test_las_de_descuento_solo_con_presupuesto(self):
        with open(jev.EXPLABS_PROMOS, "w") as f:
            f.write('{"decisiones_gratis": ["jev-latest"], "decisiones_promocion": [{"slug": "clef", "descuento": 50}]}')
        self.assertEqual(jev.modelos_explabs(), ["jev-latest", "clef"])
        jev._anotar_uso({"usage": {"cost": 5.0}}, 0.1, medio="explabs")  # techo reventado
        self.assertEqual(jev.modelos_explabs(), ["jev-latest"])  # las gratis siguen

    def test_se_puede_apagar(self):
        os.environ["STARSEED_JEV_EXPLABS"] = "0"
        jev.TRANSPORTE_EXPLABS = _falso({"q": {"type": "noul", "noul": 0.9}})
        self.assertEqual(jev._intenta_explabs("e", {"q": {"type": "noul"}}), (None, None))

    def test_con_openrouter_simulado_no_toca_la_red(self):
        real = jev._transporte_real
        jev._transporte_real = lambda cuerpo: {"answers": {"q": {"noul": 0.5}}}
        os.environ["EXPLABS_API_KEY"] = "xpl_prueba"
        try:
            jev.TRANSPORTE_EXPLABS = None
            jev.TRANSPORTE = None
            self.assertEqual(jev._intenta_explabs("e", {"q": {"type": "noul"}}), (None, None))
        finally:
            jev._transporte_real = real
            os.environ.pop("EXPLABS_API_KEY", None)

    def test_jev_apagado_tampoco_usa_la_pasarela(self):
        os.environ["STARSEED_JEV"] = "0"
        jev.TRANSPORTE_EXPLABS = _falso({"q": {"type": "noul", "noul": 0.9}})
        self.assertEqual(jev._intenta_explabs("e", {"q": {"type": "noul"}}), (None, None))


class ExplabsDecisionsAPI(unittest.TestCase):
    """Pruebas para el transporte de GPT-6 Luna Decisions API (/v1/decisions)."""

    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.antes = (jev.CACHE, jev.USO, jev.EXPLABS_PROMOS, jev.TRANSPORTE, jev.TRANSPORTE_EXPLABS, jev.TRANSPORTE_EXPLABS_DECISIONS)
        jev.CACHE = os.path.join(self.d, "cache.json")
        jev.USO = os.path.join(self.d, "uso.json")
        jev.EXPLABS_PROMOS = os.path.join(self.d, "promos.json")
        os.environ["STARSEED_LAYA_URL"] = "http://127.0.0.1:1"
        os.environ["STARSEED_JEV"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"

    def tearDown(self):
        jev.CACHE, jev.USO, jev.EXPLABS_PROMOS, jev.TRANSPORTE, jev.TRANSPORTE_EXPLABS, jev.TRANSPORTE_EXPLABS_DECISIONS = self.antes
        for k in ("STARSEED_LAYA_URL", "STARSEED_JEV", "OPENROUTER_API_KEY", "STARSEED_JEV_EXPLABS"):
            os.environ.pop(k, None)

    def test_noul_a_predicate(self):
        """noul de Jev se traduce a predicate de Decisions API."""
        recibido = []
        jev.TRANSPORTE_EXPLABS_DECISIONS = _falso_decisions({
            "q": {"type": "noul", "noul": 0.9}
        }, recibido)
        jev.TRANSPORTE_EXPLABS = None
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.1}})
        r = jev.decidir("estado", {"q": {"type": "noul", "instructions": "¿sí?"}}, usar_cache=False, medio=None)
        self.assertEqual(r["medio"], "explabs-decisions")
        self.assertAlmostEqual(r["q"]["noul"], 0.9)
        # Verificar que se llamó con el formato correcto
        self.assertEqual(len(recibido), 1)
        cuerpo = recibido[0]
        self.assertEqual(cuerpo["model"], "gpt-6-luna-decisions")
        self.assertEqual(cuerpo["questions"][0]["type"], "predicate")
        self.assertEqual(cuerpo["questions"][0]["name"], "q")

    def test_choice_a_choice(self):
        """choice de Jev se traduce a choice de Decisions API."""
        recibido = []
        jev.TRANSPORTE_EXPLABS_DECISIONS = _falso_decisions({
            "q": {"type": "choice", "choice": "opcion1", "probabilities": {"opcion1": 0.8, "opcion2": 0.2}, "confidence": 0.8}
        }, recibido)
        jev.TRANSPORTE_EXPLABS = None
        jev.TRANSPORTE = _falso({"q": {"type": "choice", "choice": "opcion1", "probabilities": {"opcion1": 0.5, "opcion2": 0.5}, "confidence": 0.5}})
        r = jev.decidir("estado", {"q": {"type": "choice", "instructions": "¿cuál?", "criteria": {"opcion1": "primera", "opcion2": "segunda"}}}, usar_cache=False, medio=None)
        self.assertEqual(r["medio"], "explabs-decisions")
        self.assertEqual(r["q"]["choice"], "opcion1")
        cuerpo = recibido[0]
        self.assertEqual(cuerpo["questions"][0]["type"], "choice")
        self.assertEqual(len(cuerpo["questions"][0]["choices"]), 2)

    def test_score_a_score(self):
        """score de Jev se traduce a score de Decisions API."""
        recibido = []
        jev.TRANSPORTE_EXPLABS_DECISIONS = _falso_decisions({
            "q": {"type": "score", "score": 3.5, "probabilities": {"1": 0.1, "2": 0.3, "3": 0.4, "4": 0.2}, "confidence": 0.7}
        }, recibido)
        jev.TRANSPORTE_EXPLABS = None
        jev.TRANSPORTE = _falso({"q": {"type": "score", "score": 2.0, "probabilities": {"1": 0.25, "2": 0.25, "3": 0.25, "4": 0.25}, "confidence": 0.25}})
        r = jev.decidir("estado", {"q": {"type": "score", "instructions": "¿cuánto?", "criteria": ["bajo", "medio", "alto", "muy alto"]}}, usar_cache=False, medio=None)
        self.assertEqual(r["medio"], "explabs-decisions")
        self.assertAlmostEqual(r["q"]["score"], 3.5)
        cuerpo = recibido[0]
        self.assertEqual(cuerpo["questions"][0]["type"], "score")
        self.assertEqual(len(cuerpo["questions"][0]["levels"]), 4)

    def test_si_falla_sigue_a_openrouter(self):
        """Si Decisions API falla, sigue a OpenRouter."""
        jev.TRANSPORTE_EXPLABS_DECISIONS = _falso_decisions({}, falla=True)
        jev.TRANSPORTE_EXPLABS = None
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.2}})
        r = jev.decidir("estado", {"q": {"type": "noul", "instructions": "¿sí?"}}, usar_cache=False)
        self.assertEqual(r["medio"], "openrouter")

    def test_en_pruebas_sin_transporte_propio_no_toca_la_red(self):
        """Sin transporte falso, no toca la red aunque haya clave."""
        jev.TRANSPORTE_EXPLABS_DECISIONS = None
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.3}})
        self.assertEqual(jev._intenta_explabs_decisions("e", {"q": {"type": "noul"}}), (None, None))

    def test_se_puede_apagar_con_misma_variable(self):
        """STARSEED_JEV_EXPLABS=0 apaga también Decisions API."""
        os.environ["STARSEED_JEV_EXPLABS"] = "0"
        jev.TRANSPORTE_EXPLABS_DECISIONS = _falso_decisions({"q": {"type": "noul", "noul": 0.9}})
        self.assertEqual(jev._intenta_explabs_decisions("e", {"q": {"type": "noul"}}), (None, None))

    def test_jev_apagado_tampoco_usa_decisions(self):
        """STARSEED_JEV=0 apaga Decisions API."""
        os.environ["STARSEED_JEV"] = "0"
        jev.TRANSPORTE_EXPLABS_DECISIONS = _falso_decisions({"q": {"type": "noul", "noul": 0.9}})
        self.assertEqual(jev._intenta_explabs_decisions("e", {"q": {"type": "noul"}}), (None, None))

    def test_orden_explabs_systemone_antes_que_decisions(self):
        """Experiential /v1/systemone se intenta antes que /v1/decisions."""
        pedido_systemone = []
        pedido_decisions = []
        jev.TRANSPORTE_EXPLABS = _falso({"q": {"type": "noul", "noul": 0.7}}, pedido_systemone)
        jev.TRANSPORTE_EXPLABS_DECISIONS = _falso_decisions({"q": {"type": "noul", "noul": 0.9}}, pedido_decisions)
        jev.TRANSPORTE = _falso({"q": {"type": "noul", "noul": 0.1}})
        r = jev.decidir("estado", {"q": {"type": "noul", "instructions": "¿sí?"}}, usar_cache=False, medio=None)
        # Debería usar systemone porque responde primero
        self.assertEqual(r["medio"], "explabs")
        self.assertEqual(len(pedido_systemone), 1)
        self.assertEqual(len(pedido_decisions), 0)


if __name__ == "__main__":
    unittest.main()
