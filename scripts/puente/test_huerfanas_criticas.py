# -*- coding: utf-8 -*-
"""Pruebas para huerfanas_criticas.py.

TDD: escribe primero una prueba que falle y luego solo el código
justo para pasarla.
"""
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import huerfanas_criticas as HC


class TestColasActivas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.olas = self.raiz / "starseed_memory_root" / "olas"
        self.olas.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_cola(self, nombre, tareas):
        ruta = self.olas / nombre
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({"cola": nombre, "tareas": tareas}, f)

    def test_colas_vivas_devuelve_dict(self):
        self._escribir_cola("cola-suenos.json", [{"id": "SIN001"}])
        self._escribir_cola("cola-codigo.json", [{"id": "COD001"}])

        colas = HC.colas_activas(str(self.raiz))
        self.assertIn("cola-suenos.json", colas)
        self.assertIn("cola-codigo.json", colas)

    def test_colas_ignora_cola_auto(self):
        self._escribir_cola("cola-suenos.json", [{"id": "SIN001"}])
        self._escribir_cola("cola-auto-prueba.json", [{"id": "AUT001"}])

        colas = HC.colas_activas(str(self.raiz))
        self.assertIn("cola-suenos.json", colas)
        self.assertNotIn("cola-auto-prueba.json", colas)

    def test_tareas_devuelve_ids(self):
        self._escribir_cola("cola-suenos.json", [{"id": "SIN001"}, {"id": "SIN002"}])

        tareas = HC.tareas_encoladas(str(self.raiz))
        self.assertIn("SIN001", tareas)
        self.assertIn("SIN002", tareas)


class TestTareasHuérfanas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.olas = self.raiz / "starseed_memory_root" / "olas"
        self.olas.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_cola_vieja(self, nombre, tareas, fecha_creacion):
        """Crea una cola con tareas de una fecha específica."""
        ruta = self.olas / nombre
        tareas_con_fecha = [dict(t, creada=fecha_creacion) for t in tareas]
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump({"cola": nombre, "tareas": tareas_con_fecha}, f)

    def test_tarea_vieja_se_detecta_como_huérfana(self):
        """Una tarea de hace 15 días es huérfana."""
        # Usar fecha fija clara: 15 días antes de ahora
        fecha_pasada = "2026-11-01T00:00:00+00:00"
        self._escribir_cola_vieja("cola-suenos.json", [{"id": "SIN001"}], fecha_pasada)

        huérfanas = HC.tareas_huerfanas(str(self.raiz), dias_huerto=14)
        self.assertEqual(len(huérfanas), 1)
        self.assertEqual(huérfanas[0]["id"], "SIN001")

    def test_tarea_reciente_no_es_huérfana(self):
        """Una tarea de hoy no es huérfana."""
        fecha_hoy = "2026-11-17T00:00:00+00:00"
        self._escribir_cola_vieja("cola-suenos.json", [{"id": "SIN001"}], fecha_hoy)

        huérfanas = HC.tareas_huerfanas(str(self.raiz), dias_huerto=14)
        self.assertEqual(len(huérfanas), 0)

    def test_tarea_sin_creada_no_es_huérfana(self):
        """Una tarea sin fecha creada no se considera huérfana por antigüedad."""
        # Fecha vacía o nula: no se debe detectar como huérfana por antigüedad
        self._escribir_cola_vieja("cola-suenos.json", [{"id": "SIN001"}], "")

        huérfanas = HC.tareas_huerfanas(str(self.raiz), dias_huerto=14)
        self.assertEqual(len(huérfanas), 0)


class TestIdentificarContrato(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.arq = self.raiz / "architecture"
        self.arq.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_identifica_contrato_por_id(self):
        """Encuentra el contrato por el ID de la tarea."""
        (self.arq / "SIN1116A-test.md").write_text(
            "# Síntesis de prueba\n\nEste es un contrato.",
            encoding="utf-8",
        )

        contrato = HC.identificar_contrato("SIN1116A-test", str(self.raiz))
        self.assertIsNotNone(contrato)
        self.assertEqual(contrato["ruta"], str(self.arq / "SIN1116A-test.md"))

    def test_no_encuentra_contrato(self):
        """Devuelve None si no hay contrato."""
        contrato = HC.identificar_contrato("NOEXISTE123", str(self.raiz))
        self.assertIsNone(contrato)


class TestReencolarHuerfana(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.olas = self.raiz / "starseed_memory_root" / "olas"
        self.olas.mkdir(parents=True, exist_ok=True)
        self.arq = self.raiz / "architecture"
        self.arq.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_escala_sin_contrato(self):
        """Si no hay contrato, se escala al Mando."""
        cola_path = self.olas / "cola-suenos.json"
        # Asegurar que el directorio existe
        self.olas.mkdir(parents=True, exist_ok=True)
        with open(cola_path, "w", encoding="utf-8") as f:
            json.dump([{"id": "SIN99999-test", "creada": "2026-11-15T00:00:00+00:00"}], f)

        salida = HC.reencolar_huerfana(str(self.raiz), "SIN99999-test")
        self.assertFalse(salida["ok"])
        self.assertEqual(salida["accion"], "escalar")

    def test_reencolada_exitosa(self):
        """Una tarea huérfana se reencola correctamente."""
        contrato_path = self.arq / "SIN1116A-test.md"
        contrato_path.write_text("# Test Contrato\n\nArchivo clave: test.py\n", encoding="utf-8")

        cola_path = self.olas / "cola-suenos.json"
        # Asegurar que el directorio existe
        self.olas.mkdir(parents=True, exist_ok=True)
        with open(cola_path, "w", encoding="utf-8") as f:
            json.dump([{"id": "SIN1116A-test", "creada": "2026-11-15T00:00:00+00:00"}], f)

        salida = HC.reencolar_huerfana(str(self.raiz), "SIN1116A-test")
        self.assertTrue(salida["ok"])
        self.assertEqual(salida["accion"], "reencolada")


class TestProcesarHuerfanas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.olas = self.raiz / "starseed_memory_root" / "olas"
        self.olas.mkdir(parents=True, exist_ok=True)
        self.arq = self.raiz / "architecture"
        self.arq.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_procesa_multiple_huerfanas(self):
        """Procesa varias tareas huérfanas a la vez."""
        contrato1 = self.arq / "SIN001-test.md"
        contrato2 = self.arq / "SIN002-test.md"
        contrato1.write_text("# Test 1", encoding="utf-8")
        contrato2.write_text("# Test 2", encoding="utf-8")

        cola_path = self.olas / "cola-suenos.json"
        self.olas.mkdir(parents=True, exist_ok=True)
        with open(cola_path, "w", encoding="utf-8") as f:
            json.dump([
                {"id": "SIN001-test", "creada": "2026-11-01T00:00:00+00:00"},
                {"id": "SIN002-test", "creada": "2026-11-01T00:00:00+00:00"},
                {"id": "SIN003-test", "creada": "2026-11-17T00:00:00+00:00"},
            ], f)

        resultados = HC.procesar_huerfanas(str(self.raiz))
        self.assertEqual(resultados["total_huerfanas"], 2)
        self.assertEqual(len(resultados["reencoladas"]), 2)


if __name__ == "__main__":
    unittest.main()