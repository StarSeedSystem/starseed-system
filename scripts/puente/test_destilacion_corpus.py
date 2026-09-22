# -*- coding: utf-8 -*-
"""Pruebas unitarias para el módulo de destilación del corpus.

Verifica la detección de secretos, el filtrado por campo revisor,
y la obtención limpia de diffs de código sin metadatos de git.
"""

import importlib.util
import json
import os
import tempfile
import unittest

# Importación dinámica del módulo destilacion_corpus.py
_ruta = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "destilacion_corpus.py"
)
_spec = importlib.util.spec_from_file_location("destilacion_corpus", _ruta)
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)


class TestDestilacionCorpus(unittest.TestCase):
    """Conjunto de pruebas para la seguridad y calidad del corpus."""

    def test_filtro_secretos_casos_obligatorios(self):
        """Verifica que todas las formas de secretos sean detectadas y filtradas."""
        casos_secretos = [
            '  "apiKey": "sk-proj-1234567890"',
            "api_key: mi_clave_yaml_secreta",
            "Authorization: Bearer token_cabecera_xyz123",
            "sk-suelto_1234567890",
            "ghp_suelto123456789012345",
            "gho_suelto123456789012345",
            "github_pat_1234567890_abcdefgh",
            "xoxb-1234567890-1234567890",
            "AIzaSy123456789012345678901234567890",
            "Bearer token_larguisimo_1234567890_secret",
            "SECRET_PASSWORD = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'",
        ]
        for caso in casos_secretos:
            self.assertTrue(
                D.es_linea_secreta(caso),
                f"El caso de secreto no fue detectado: {caso}",
            )
            self.assertEqual(
                "",
                D.filtrar_lineas_secretas(caso),
                f"La línea secreta no se eliminó: {caso}",
            )

    def test_caso_revision_api_key_dos_puntos(self):
        """Prueba explícita del caso API_KEY: 'sk-test' con dos puntos."""
        linea = 'API_KEY: "sk-test"'
        self.assertTrue(
            D.es_linea_secreta(linea),
            "No se detectó el secreto API_KEY: 'sk-test' con dos puntos",
        )
        self.assertEqual("", D.filtrar_lineas_secretas(linea))

    def test_filtro_revisor_bloqueante_por_campo(self):
        """Verifica que el filtrado use el campo revisor y no subcadenas de texto."""
        entrada_bloqueante = {
            "id": "t1",
            "revisor": "bloqueante",
            "nota": "no es bloqueante de verdad",
            "sha": "HEAD",
        }
        res_bloqueante = D.procesar_entrada_progreso(entrada_bloqueante)
        self.assertIsNone(
            res_bloqueante,
            "No se descartó la entrada con revisor=='bloqueante'",
        )

        entrada_valida = {
            "id": "t2",
            "revisor": "aprobado",
            "nota": "rechazado por seguridad preliminar",
            "sha": "HEAD",
            "tarea": "Refactorizar modulo sin secretos",
        }
        res_valida = D.procesar_entrada_progreso(entrada_valida)
        self.assertIsNotNone(
            res_valida,
            "Se descartó erróneamente una entrada válida basada en notas de texto",
        )
        self.assertEqual("t2", res_valida["id"])

    def test_obtener_diff_limpio_formato_git(self):
        """Verifica que git show use --format= para omitir el mensaje de commit."""
        diff_limpio = D.obtener_diff_limpio("HEAD")
        if diff_limpio:
            self.assertFalse(diff_limpio.startswith("commit "))
            self.assertNotRegex(diff_limpio, r"(?m)^Author:")
            self.assertNotRegex(diff_limpio, r"(?m)^Date:")

    def test_generar_corpus_jsonl(self):
        """Verifica la generación del archivo JSONL filtrando elementos no válidos."""
        with tempfile.TemporaryDirectory() as tmpdir:
            progreso_file = os.path.join(tmpdir, "progreso.json")
            output_file = os.path.join(tmpdir, "corpus.jsonl")

            datos = [
                {
                    "id": "t1",
                    "revisor": "bloqueante",
                    "sha": "HEAD",
                    "tarea": "Tarea bloqueada",
                },
                {
                    "id": "t2",
                    "revisor": "aprobado",
                    "sha": "HEAD",
                    "tarea": "Tarea con API_KEY: 'sk-test' invalida",
                },
                {
                    "id": "t3",
                    "revisor": "aprobado",
                    "sha": "HEAD",
                    "tarea": "Tarea valida sin secretos",
                },
            ]
            with open(progreso_file, "w", encoding="utf-8") as f:
                json.dump(datos, f)

            exportados = D.generar_corpus(progreso_file, output_file)
            self.assertTrue(os.path.exists(output_file))
            with open(output_file, "r", encoding="utf-8") as f:
                lineas = f.readlines()

            # t1 es bloqueante -> descartada
            # t2 contiene API_KEY: 'sk-test' en la tarea -> descartada
            # t3 es válida sin secretos -> exportada
            self.assertEqual(1, len(lineas))
            parsed = json.loads(lineas[0])
            self.assertEqual("t3", parsed["id"])


if __name__ == "__main__":
    unittest.main()
