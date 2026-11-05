# -*- coding: utf-8 -*-
"""Pruebas de los peces de EGM (RPO1104D): prompt a ciegas, lectura tolerante,
veredicto y revisión con llamadas simuladas. Sin red ni modelos reales."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import egm_revision as E


class PruebaPrompt(unittest.TestCase):
    def test_lleva_el_artefacto_y_el_tipo_sin_contexto(self):
        p = E.prompt_de_pez("ola con tres tareas", "ola")
        self.assertIn("ola con tres tareas", p)
        self.assertIn("No tienes contexto", p)
        self.assertIn("bloquea", p)
        self.assertIn("importa", p)
        self.assertIn("menor", p)

    def test_tipo_desconocido_y_artefacto_nulo_no_revientan(self):
        self.assertIn("cosa rara", E.prompt_de_pez("texto", "cosa rara"))
        self.assertIn("ARTEFACTO", E.prompt_de_pez(None, "plan"))


class PruebaLectura(unittest.TestCase):
    def test_lee_salida_real_con_ruido_y_markdown(self):
        texto = (
            "He revisado el artefacto y esto es lo que veo.\n"
            "- **bloquea**: falta el presupuesto\n"
            "* importa — no cita fuentes\n"
            "Gravedad: menor: estilo de la tabla\n"
            "Sin objeciones sobre el resto.\n"
            "1. [importa] tampoco explica el plazo\n"
        )
        self.assertEqual(E.leer_objeciones(texto), [
            {"gravedad": "bloquea", "texto": "falta el presupuesto"},
            {"gravedad": "importa", "texto": "no cita fuentes"},
            {"gravedad": "menor", "texto": "estilo de la tabla"},
            {"gravedad": "importa", "texto": "tampoco explica el plazo"},
        ])

    def test_quita_duplicados_sin_importar_mayusculas(self):
        texto = "bloquea: Falta prueba\nBLOQUEA: falta prueba\nimporta: falta prueba"
        self.assertEqual(E.leer_objeciones(texto), [
            {"gravedad": "bloquea", "texto": "Falta prueba"},
            {"gravedad": "importa", "texto": "falta prueba"},
        ])

    def test_ignora_lineas_sin_gravedad_y_entradas_no_texto(self):
        self.assertEqual(E.leer_objeciones("Todo bien.\nSin objeciones.\n"), [])
        self.assertEqual(E.leer_objeciones(None), [])
        self.assertEqual(E.leer_objeciones({"texto": "bloquea: x"}), [])

    def test_acepta_corchetes_parentesis_y_etiquetas_varias(self):
        texto = "(bloquea) falta plaza\n[Importa] no hay fecha\n**menor** nada"
        self.assertEqual([o["gravedad"] for o in E.leer_objeciones(texto)],
                         ["bloquea", "importa", "menor"])


class PruebaVeredicto(unittest.TestCase):
    def test_sin_objeciones_pasa(self):
        self.assertEqual(E.ola_pasa([]), {"pasa": True, "bloqueantes": 0})
        self.assertEqual(E.ola_pasa(None), {"pasa": True, "bloqueantes": 0})

    def test_importa_y_menor_no_bloquean(self):
        objeciones = [{"gravedad": "importa", "texto": "x"}, {"gravedad": "menor", "texto": "y"}]
        self.assertEqual(E.ola_pasa(objeciones), {"pasa": True, "bloqueantes": 0})

    def test_bloquea_no_pasa_y_se_cuenta(self):
        objeciones = [{"gravedad": "bloquea", "texto": "x"}, {"gravedad": "BLOQUEA", "texto": "y"},
                      {"gravedad": "menor", "texto": "z"}]
        self.assertEqual(E.ola_pasa(objeciones), {"pasa": False, "bloqueantes": 2})

    def test_objetos_invalidos_no_rompen(self):
        self.assertEqual(E.ola_pasa(["basura", {}, {"gravedad": None}]),
                         {"pasa": True, "bloqueantes": 0})


class PruebaRevisar(unittest.TestCase):
    def setUp(self):
        self.llamadas = []

    def llamar(self, prompt, modelo):
        self.llamadas.append((prompt, modelo))
        return {"uno": "bloquea: falta prueba\nimporta: sin fecha",
                "dos": {"texto": "- importa: sin fecha\nmenor: estilo"}}.get(modelo, "sin objeciones")

    def test_llama_a_n_modelos_distintos_y_junta_sus_objeciones(self):
        objeciones = E.revisar("artefacto", "ola", self.llamar, ["uno", "dos", "tres"])
        self.assertEqual([m for _, m in self.llamadas], ["uno", "dos"])
        self.assertIn("artefacto", self.llamadas[0][0])
        self.assertEqual(len(objeciones), 4)
        self.assertEqual(E.ola_pasa(objeciones)["pasa"], False)

    def test_respeta_n_y_modelos_repetidos(self):
        E.revisar("artefacto", "plan", self.llamar, ["uno", "uno", "dos"], n=1)
        self.assertEqual([m for _, m in self.llamadas], ["uno"])

    def test_menos_modelos_que_n_usa_los_que_hay(self):
        E.revisar("artefacto", "respuesta", self.llamar, ["uno"], n=3)
        self.assertEqual([m for _, m in self.llamadas], ["uno"])

    def test_sin_modelos_no_llama(self):
        self.assertEqual(E.revisar("artefacto", "app", self.llamar, []), [])
        self.assertEqual(self.llamadas, [])

    def test_rechaza_llamar_no_invocable_y_n_cero(self):
        with self.assertRaises(TypeError):
            E.revisar("artefacto", "ola", None, ["uno"])
        with self.assertRaises(ValueError):
            E.revisar("artefacto", "ola", self.llamar, ["uno"], n=0)
