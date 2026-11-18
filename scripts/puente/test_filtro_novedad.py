# -*- coding: utf-8 -*-
"""Pruebas para filtro_novedad.py (SIN1116E).

Pruebas TDD: escribe primero una prueba que falle y luego solo el código
justo para pasarla. Una costura, una prueba y una implementación mínima
por ciclo.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import filtro_novedad as F


class TestNormalizarTexto(unittest.TestCase):
    def test_minusculas_y_sin_puntuacion(self):
        self.assertEqual(F._normalizar_texto("Hola, Mundo!"), "hola mundo")

    def test_espacios_multiples(self):
        self.assertEqual(F._normalizar_texto("Hola    Mundo"), "hola mundo")

    def test_vacio(self):
        self.assertEqual(F._normalizar_texto(""), "")


class TestTokenizar(unittest.TestCase):
    def test_palabras_significativas(self):
        tokens = F._tokenizar("integrar notebooklm con la sintesis")
        self.assertIn("integrar", tokens)
        self.assertIn("notebooklm", tokens)
        self.assertIn("sintesis", tokens)
        self.assertNotIn("con", tokens)
        self.assertNotIn("la", tokens)

    def test_palabras_cortas_filtradas(self):
        tokens = F._tokenizar("a de en")
        self.assertEqual(tokens, [])


class TestCalcularTFIDF(unittest.TestCase):
    def test_documentos_vacios(self):
        self.assertEqual(F._calcular_tfidf([], "consulta"), [])

    def test_consulta_vacia(self):
        self.assertEqual(F._calcular_tfidf(["documento uno"], ""), [0.0])

    def test_similitud_identica(self):
        docs = ["integrar notebooklm con la sintesis"]
        sims = F._calcular_tfidf(docs, "integrar notebooklm con la sintesis")
        self.assertAlmostEqual(sims[0], 1.0, places=2)

    def test_similitud_diferente(self):
        docs = ["integrar notebooklm con la sintesis"]
        sims = F._calcular_tfidf(docs, "crear nuevo modulo de audio")
        self.assertLess(sims[0], 0.5)

    def test_multiples_documentos(self):
        docs = [
            "integrar notebooklm con la sintesis",
            "crear modulo de audio para starseed",
            "mejorar interfaz de usuario genesis",
        ]
        sims = F._calcular_tfidf(docs, "integrar notebooklm")
        self.assertGreater(sims[0], sims[1])
        self.assertGreater(sims[0], sims[2])


class TestCargarIndiceIntegrado(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_jsonl(self, nombre, items):
        ruta = self.raiz / nombre
        with ruta.open("w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        return str(ruta)

    def test_archivo_inexistente(self):
        ruta = str(self.raiz / "noexiste.jsonl")
        self.assertEqual(F._cargar_indice_integrado(ruta), [])

    def test_carga_items_validos(self):
        items = [
            {"id": "1", "texto": "primera propuesta", "fecha": "2026-11-01"},
            {"id": "2", "texto": "segunda propuesta", "fecha": "2026-11-02"},
        ]
        ruta = self._escribir_jsonl("indice.jsonl", items)
        cargados = F._cargar_indice_integrado(ruta)
        self.assertEqual(len(cargados), 2)
        self.assertEqual(cargados[0]["id"], "1")

    def test_ignora_lineas_invalidas(self):
        ruta = self.raiz / "indice.jsonl"
        ruta.write_text('{"id": "1", "texto": "valida"}\nlinea invalida\n{"id": "2", "texto": "tambien valida"}\n', encoding="utf-8")
        cargados = F._cargar_indice_integrado(str(ruta))
        self.assertEqual(len(cargados), 2)


class TestCargarPropuestasRecientes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_jsonl(self, nombre, items):
        ruta = self.raiz / nombre
        with ruta.open("w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        return str(ruta)

    def test_filtra_por_fecha(self):
        from datetime import datetime, timedelta

        ayer = (datetime.now() - timedelta(days=1)).isoformat()
        hace_20_dias = (datetime.now() - timedelta(days=20)).isoformat()

        items = [
            {"id": "1", "texto": "reciente", "fecha": ayer},
            {"id": "2", "texto": "antigua", "fecha": hace_20_dias},
        ]
        ruta = self._escribir_jsonl("propuestas.jsonl", items)
        cargados = F._cargar_propuestas_recientes(ruta, dias=14)
        self.assertEqual(len(cargados), 1)
        self.assertEqual(cargados[0]["id"], "1")


class TestFiltrarNovedad(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.indice_path = str(self.raiz / "indice_integrado.jsonl")
        self.propuestas_path = str(self.raiz / "propuestas.jsonl")

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_indice(self, items):
        with open(self.indice_path, "w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    def _escribir_propuestas(self, items):
        with open(self.propuestas_path, "w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    def test_propuesta_sin_texto_descartada(self):
        propuesta = {"id": "test-1", "texto": "", "area": "ia"}
        resultado = F.filtrar_novedad(propuesta, self.indice_path, self.propuestas_path)
        self.assertEqual(resultado["estado"], "descartada")
        self.assertIn("sin texto", resultado["motivo"].lower())

    def test_sin_corpus_previo_aceptada(self):
        propuesta = {"id": "test-1", "texto": "nueva idea totalmente original", "area": "ia"}
        resultado = F.filtrar_novedad(propuesta, self.indice_path, self.propuestas_path)
        self.assertEqual(resultado["estado"], "aceptada")

    def test_duplicado_exacto_descartado(self):
        self._escribir_indice([{"id": "PSF1113", "texto": "integrar notebooklm con la sintesis", "fecha": "2026-11-01"}])
        propuesta = {"id": "test-1", "texto": "integrar notebooklm con la sintesis", "area": "ia"}
        resultado = F.filtrar_novedad(propuesta, self.indice_path, self.propuestas_path, umbral_similitud=0.75)
        self.assertIn(resultado["estado"], ("descartada", "ampliacion"))
        self.assertEqual(resultado["pieza_relacionada"], "PSF1113")

    def test_propuesta_nueva_aceptada(self):
        self._escribir_indice([{"id": "PSF1113", "texto": "integrar notebooklm con la sintesis", "fecha": "2026-11-01"}])
        propuesta = {"id": "test-1", "texto": "crear sistema de notificaciones push", "area": "movil"}
        resultado = F.filtrar_novedad(propuesta, self.indice_path, self.propuestas_path, umbral_similitud=0.75)
        self.assertEqual(resultado["estado"], "aceptada")

    def test_similar_pero_distinta_ampliacion(self):
        self._escribir_indice([{"id": "PSF1113", "texto": "integrar notebooklm con la sintesis", "fecha": "2026-11-01"}])
        propuesta = {"id": "test-1", "texto": "ampliar integracion notebooklm añadiendo audio", "area": "ia"}
        resultado = F.filtrar_novedad(propuesta, self.indice_path, self.propuestas_path, umbral_similitud=0.75)
        self.assertIn(resultado["estado"], ("ampliacion", "aceptada"))

    def test_revisor_baja_puntuacion_descarta(self):
        self._escribir_indice([{"id": "PSF1113", "texto": "integrar notebooklm con la sintesis diaria", "fecha": "2026-11-01"}])
        propuesta = {"id": "test-1", "texto": "integrar notebooklm con la sintesis", "area": "ia"}
        resultado = F.filtrar_novedad(propuesta, self.indice_path, self.propuestas_path, umbral_similitud=0.75, umbral_revisor=8)
        self.assertEqual(resultado["estado"], "descartada")


class TestProcesarLotePropuestas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.indice_path = str(self.raiz / "indice_integrado.jsonl")
        self.propuestas_path = str(self.raiz / "propuestas.jsonl")

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_indice(self, items):
        with open(self.indice_path, "w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    def test_separa_aceptadas_y_descartadas(self):
        self._escribir_indice([{"id": "PSF1113", "texto": "integrar notebooklm con la sintesis", "fecha": "2026-11-01"}])
        propuestas = [
            {"id": "1", "texto": "integrar notebooklm con la sintesis", "area": "ia"},
            {"id": "2", "texto": "crear modulo de video", "area": "multimedia"},
        ]
        aceptadas, descartadas = F.procesar_lote_propuestas(propuestas, self.indice_path, self.propuestas_path)
        self.assertEqual(len(aceptadas), 1)
        self.assertEqual(len(descartadas), 1)
        self.assertEqual(aceptadas[0]["id"], "2")
        self.assertEqual(descartadas[0]["id"], "1")


if __name__ == "__main__":
    unittest.main()