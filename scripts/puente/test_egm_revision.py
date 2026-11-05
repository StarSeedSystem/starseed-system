# -*- coding: utf-8 -*-
"""Tests de los peces de EGM (egm_revision) — unittest puro, `llamar` simulado."""

import sys
import unittest

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import egm_revision as egm


class TestPromptDePez(unittest.TestCase):
    def test_solo_ve_el_artefacto(self):
        p = egm.prompt_de_pez("Ola 1105: tres tareas de salas", "ola propuesta")
        self.assertIn("Ola 1105: tres tareas de salas", p)
        self.assertIn("bloquea", p)
        self.assertIn("json", p.lower())

    def test_tipos_basura_y_vacios(self):
        self.assertIn("(vacío)", egm.prompt_de_pez(None, ""))
        self.assertIn("Artefacto a revisar", egm.prompt_de_pez("x", "  "))

    def test_recorta_artefactos_largos(self):
        p = egm.prompt_de_pez("a" * (egm.TOPE_ARTEFACTO + 500), "ola")
        self.assertLessEqual(len(p), egm.TOPE_ARTEFACTO + 800)


class TestLeerObjeciones(unittest.TestCase):
    def test_json_puro(self):
        texto = '[{"texto": "falta el criterio", "gravedad": "bloquea"}]'
        r = egm.leer_objeciones(texto)
        self.assertEqual(r, [{"texto": "falta el criterio", "gravedad": "bloquea"}])

    def test_envoltorio_objeciones(self):
        texto = '{"objeciones": [{"texto": "x", "gravedad": "menor"}]}'
        self.assertEqual(len(egm.leer_objeciones(texto)), 1)

    def test_json_con_cerco_de_texto(self):
        texto = 'Blah:\n```json\n[{"texto": "y", "gravedad": "importa"}]\n```'
        self.assertEqual(egm.leer_objeciones(texto)[0]["texto"], "y")


class TestLeerObjecionesDegradadas(unittest.TestCase):
    def test_sin_json_devuelve_lista_vacia(self):
        for texto in ("", None, 12, "no soy json", "[{truncada"):
            self.assertEqual(egm.leer_objeciones(texto), [])

    def test_gravedad_desconocida_es_importa(self):
        r = egm.leer_objeciones('[{"texto": "a", "gravedad": "Brutal"}]')
        self.assertEqual(r[0]["gravedad"], "importa")

    def test_entradas_vacias_o_raras_fuera(self):
        r = egm.leer_objeciones('[7, {"gravedad": "bloquea"}, {"texto": "ok"}]')
        self.assertEqual(r, [{"texto": "ok", "gravedad": "importa"}])


class TestOlaPasa(unittest.TestCase):
    def _o(self, g, texto="t"):
        return {"texto": texto, "gravedad": g}

    def test_pasa_sin_bloqueos(self):
        self.assertTrue(egm.ola_pasa([]))
        self.assertTrue(egm.ola_pasa(None))
        self.assertTrue(egm.ola_pasa([self._o("menor"), self._o("importa")]))

    def test_no_pasa_con_un_bloqueo(self):
        self.assertFalse(egm.ola_pasa([self._o("menor"), self._o("bloquea")]))

    def test_pasa_si_el_bloqueo_esta_resuelto(self):
        o = {**self._o("bloquea"), "resuelta": True}
        self.assertTrue(egm.ola_pasa([o]))


class TestRevisar(unittest.TestCase):
    """El pez se inyecta: aquí `llamar` es un simulacro, nunca la red."""

    @staticmethod
    def _pez(respuesta):
        llamadas = []

        def llamar(prompt, modelo):
            llamadas.append(modelo)
            return respuesta

        return llamar, llamadas

    def test_inyecta_y_recoge(self):
        pez, llamadas = self._pez('[{"texto": "a", "gravedad": "menor"}]')
        r = egm.revisar("ola", "ola propuesta", pez, ["m1", "m2"])
        self.assertEqual(r, [{"texto": "a", "gravedad": "menor", "peces": ["m1", "m2"]}])

    def test_n_pescados_y_llamadas(self):
        pez, llamadas = self._pez('[{"texto": "a", "gravedad": "importa"}]')
        r = egm.revisar("ola", "ola", pez, ["m1", "m2", "m3"], n=2)
        self.assertEqual(llamadas, ["m1", "m2"])
        self.assertEqual(len(r), 1)

    def test_peces_silenciosos_no_suman(self):
        pez, _ = self._pez("no soy json")
        self.assertEqual(egm.revisar("ola", "ola", pez, ["m1", "m2"]), [])

    def test_sin_modelos_nada(self):
        pez, llamadas = self._pez("[{}]")
        self.assertEqual(egm.revisar("ola", "ola", pez, []), [])
        self.assertEqual(llamadas, [])


class TestRevisarFusion(unittest.TestCase):
    def test_la_mayor_gravedad_gana(self):
        def llamar(prompt, modelo):
            return ('[{"texto": "a", "gravedad": "menor"}]' if modelo == "m1"
                    else '[{"texto": "a", "gravedad": "bloquea"}]')

        r = egm.revisar("ola", "ola", llamar, ["m1", "m2"])
        self.assertEqual(r[0]["gravedad"], "bloquea")


class TestLlamarDirector(unittest.TestCase):
    def test_usa_la_costura_inyectada(self):
        r = egm.llamar_director(
            "revisa esto", modelo="m",
            orden=["fak", "-p", "revisa esto"],
            correr=lambda orden, segundos=300: (0, '[{"texto": "b", "gravedad": "menor"}]'))
        self.assertEqual(egm.leer_objeciones(r)[0]["texto"], "b")

    def test_el_motor_que_falla_calla(self):
        r = egm.llamar_director(
            "x", orden=["fak"], correr=lambda orden, segundos=300: (1, "explosión"))
        self.assertEqual(r, "")

    def test_la_orden_viaja_al_motor(self):
        def correr(orden, segundos=300):
            self.assertIn("revisa", orden[2] if len(orden) > 2 else "")
            return 0, "[]"

        self.assertEqual(egm.llamar_director("revisa esto", orden=["fak", "-p", "revisa esto"],
                                             correr=correr), "[]")


if __name__ == "__main__":
    unittest.main()
