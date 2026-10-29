"""pautas de automejora (Meta^n): la directiva activa de la capa juicio entra en el
estado de Jev como `pautas_astraura`, y la experiencia recuerda la versión que usó.
Archivo de directivas temporal en cada prueba: nunca se toca el juicio.json real."""

import json
import os
import sys
import tempfile
import unittest

import jev


def _transporte_falso(respuestas):
    """Camino OpenRouter de mentira, con lo que recibió a mano para las aserciones."""
    recibido = []

    def t(cuerpo):
        recibido.append(cuerpo)
        return {
            "model": jev.MODELO,
            "answers": respuestas,
            "usage": {"input_tokens": 10, "output_tokens": 2, "cost": 0.0},
        }

    t.recibido = recibido
    return t


class Pauta(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.mkdtemp()
        jev.DIRECTIVA_RUTA = os.path.join(self._dir, "juicio.json")
        jev._cache_pauta["t"] = 0.0
        jev._cache_pauta["valor"] = None
        self._dir_uso = tempfile.mkdtemp()
        jev.CACHE = os.path.join(self._dir_uso, "cache.json")
        jev.USO = os.path.join(self._dir_uso, "uso.json")
        jev.TRANSPORTE = None

    def tearDown(self):
        jev._cache_pauta["t"] = 0.0
        jev._cache_pauta["valor"] = None
        jev.TRANSPORTE = None

    def _escribir_directiva(self, historial):
        with open(jev.DIRECTIVA_RUTA, "w", encoding="utf-8") as f:
            json.dump({"v": 1, "capa": "jev", "historial": historial}, f, ensure_ascii=False)

    def test_sin_archivo_no_hay_pauta(self):
        self.assertIsNone(jev.pauta_activa())

    def test_la_ultima_activa_es_la_que_manda(self):
        self._escribir_directiva([
            {"version": 1, "texto": "Resume el objetivo en una frase.", "estado": "activa"},
            {"version": 2, "texto": "Responde solo con lo pedido.", "estado": "anterior"},
            {"version": 3, "texto": "Menciona la fuente del número antes de afirmarlo.", "estado": "activa"},
        ])
        r = jev.pauta_activa()
        self.assertEqual(r, {
            "texto": "Menciona la fuente del número antes de afirmarlo.", "version": 3
        })

    def test_sin_pauta_activa_devuelve_none(self):
        self._escribir_directiva([
            {"version": 1, "texto": "Resume el objetivo en una frase.", "estado": "anterior"},
            {"version": 2, "texto": "Responde solo con lo pedido.", "estado": "propuesta"},
        ])
        self.assertIsNone(jev.pauta_activa())

    def test_texto_que_no_pasa_saneo_devuelve_none(self):
        self._escribir_directiva([
            {"version": 1, "texto": "Visita https://ejemplo.com antes de decidir.", "estado": "activa"},
        ])
        self.assertIsNone(jev.pauta_activa())

    def test_cache_de_cinco_minutos(self):
        self._escribir_directiva([
            {"version": 1, "texto": "Resume el objetivo en una frase.", "estado": "activa"},
        ])
        ahora = 1000.0
        self.assertEqual(jev.pauta_activa(ahora=ahora), {
            "texto": "Resume el objetivo en una frase.", "version": 1
        })
        self._escribir_directiva([
            {"version": 2, "texto": "Responde solo con lo pedido.", "estado": "activa"},
        ])
        # dentro del TTL vuelve lo viejo, aunque el archivo ya diga otra cosa
        self.assertEqual(jev.pauta_activa(ahora=ahora + 10)["version"], 1)
        # pasado el TTL se relee el archivo
        self.assertEqual(jev.pauta_activa(ahora=ahora + 301)["version"], 2)

    def test_estado_dict_recibe_pautas_astraura(self):
        pauta = {"texto": "Responde solo con lo pedido.", "version": 2}
        e = jev.estado_con_pauta({"a": 1}, pauta)
        self.assertEqual(e["a"], 1)
        self.assertEqual(e["pautas_astraura"], "Responde solo con lo pedido.")
        self.assertEqual(list(e), ["a", "pautas_astraura"])  # se añade, no se revuelve el resto
        # sin pauta, el mismo dict de siempre (nada cambia en decidir)
        self.assertEqual(jev.estado_con_pauta({"a": 1}, None), {"a": 1})
        # y lo que el estado ya traía se respeta
        self.assertEqual(
            jev.estado_con_pauta({"pautas_astraura": "la mía"}, pauta)["pautas_astraura"],
            "la mía",
        )

    def test_estado_texto_recibe_el_bloque_al_final(self):
        pauta = {"texto": "Responde solo con lo pedido.", "version": 2}
        s = jev.estado_con_pauta("publicado 7 commits", pauta)
        self.assertTrue(s.startswith("publicado 7 commits\n\n"))
        self.assertIn("Pautas aprendidas por la automejora de Astraura (versión 2)", s)
        self.assertIn("No cambian permisos ni reglas.", s)
        self.assertTrue(s.endswith("Responde solo con lo pedido."))
        self.assertEqual(jev.estado_con_pauta("publicado 7 commits", None), "publicado 7 commits")

    def test_decidir_manda_el_estado_con_pauta(self):
        """Con directiva activa, lo que llega al transporte lleva `pautas_astraura`."""
        self._escribir_directiva([
            {"version": 2, "texto": "Responde solo con lo pedido.", "estado": "activa"},
        ])
        sys.modules["jev_local"] = None  # sin BitNet real: que el import toque el suelo
        jev.TRANSPORTE = _transporte_falso({"q": {"type": "noul", "noul": 0.7}})
        copia = dict(os.environ)
        os.environ["STARSEED_JEV"] = "1"
        os.environ["OPENROUTER_API_KEY"] = "clave-de-prueba"
        os.environ["STARSEED_JEV_EXPLABS"] = "0"
        os.environ["STARSEED_LAYA_URL"] = "http://127.0.0.1:1"
        try:
            r = jev.decidir({"tarea": "t"}, {"q": {"type": "noul", "instructions": "?"}})
        finally:
            os.environ.clear()
            os.environ.update(copia)
            sys.modules.pop("jev_local", None)
        self.assertAlmostEqual(r["q"]["noul"], 0.7)
        self.assertEqual(r["medio"], "openrouter")
        self.assertEqual(
            jev.TRANSPORTE.recibido[0]["state"],
            {"tarea": "t", "pautas_astraura": "Responde solo con lo pedido."},
        )


class Experiencia(unittest.TestCase):
    def test_nueva_guarda_la_directiva_que_viajo(self):
        import experiencias

        e = experiencias.nueva(
            "jev", "si_no", {"estado": {}, "pregunta": "¿?"}, {"p": 0.8}, 0.8,
            directiva={"texto": "x" * 500, "version": 2},
        )
        self.assertEqual(e["directiva"]["version"], 2)
        self.assertEqual(len(e["directiva"]["texto"]), 401)  # recortada como la entrada
        e2 = experiencias.nueva("jev", "si_no", {}, {"p": 0.5}, 0.5)
        self.assertNotIn("directiva", e2)


if __name__ == "__main__":
    unittest.main()
