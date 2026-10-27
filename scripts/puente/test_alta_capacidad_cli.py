# -*- coding: utf-8 -*-
"""Pruebas CLI del carril de alta capacidad (ALT1021Cd) — unittest, sin red."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

_BASE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(_BASE, "alta-capacidad.py")


class TestAltaCapacidadCLI(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.olas_dir = os.path.join(self.tmpdir, "starseed_memory_root", "olas")
        os.makedirs(self.olas_dir, exist_ok=True)
        self.progreso_path = os.path.join(self.olas_dir, "progreso.json")
        self.columnas_dir = os.path.join(self.tmpdir, "starseed_memory_root", "colas-fuente")
        os.makedirs(self.columnas_dir, exist_ok=True)
        # Estrellar STARSEED_ROOT al directorio temporal
        # (los scripts del puente leen esta variable)
        # No es necesario setearla aquí si el script la lee propio, pero algunos tests
        # la usan para encontrar raíz; dejaremos que el script use su lógica propia.

        # Archivo de progreso falso con tareas que necesitan alta capacidad
        progreso_falso = {
            "lecturas": [],
            "tarea1": {
                "id": "CPZ1021A",
                "titulo": "Prueba candidata 1",
                "estado": "pendiente",
                "intentos": 1,
                "importancia": "capacidad",
            },
            "tarea2": {
                "id": "CPZ1021B",
                "titulo": "Prueba candidata 2",
                "estado": "bloqueante",
                "intentos": 3,
            },
            "tarea3": {
                "id": "CPZ1021C",
                "titulo": "Tarea normal (no alta)",
                "estado": "pendiente",
                "intentos": 0,
            },
        }
        with open(self.progreso_path, "w", encoding="utf-8") as f:
            json.dump(progreso_falso, f, ensure_ascii=False)

        # Cola fuente con tareas
        cola_falsa = [
            {
                "id": "CPZ1021A",
                "ola": "Ola prueba",
                "titulo": "PowerInfer: módulo de requisitos",
                "estado": "pendiente",
                "intentos": 2,
            },
            {
                "id": "CPZ1021B",
                "ola": "Ola prueba",
                "titulo": "Medir dispersión BitNet",
                "estado": "bloqueante",
                "intentos": 5,
            },
        ]
        with open(os.path.join(self.columnas_dir, "cola-prueba.json"), "w", encoding="utf-8") as f:
            json.dump(cola_falsa, f, ensure_ascii=False)

        # Límites de Claude falsos (cupo ok por defecto) para no leer el archivo real
        self.limites_path = os.path.join(self.tmpdir, "limites-claude.json")
        self._escribir_limites()

    def _escribir_limites(self, sesion_pct=30, semana_pct=40, hace_min=0):
        """Escribe una lectura de límites fresca (o vieja) en el archivo falso."""
        t = (datetime.now(timezone.utc) - timedelta(minutes=hace_min)).isoformat()
        lectura = {"t": t, "sesion_pct": sesion_pct,
                   "sesion_reinicio": "2026-10-27T08:00:00+00:00",
                   "semana_pct": semana_pct,
                   "semana_reinicio": "2026-10-26T08:00:00+00:00"}
        with open(self.limites_path, "w", encoding="utf-8") as f:
            json.dump({"lecturas": [lectura]}, f, ensure_ascii=False)

    def _escribir_tareas_alta(self):
        """Progreso con tres tareas de capacidad alta (la clave del dict es el id)."""
        return {
            "ALTA": {"titulo": "Animación fina", "estado": "pendiente",
                     "intentos": 0, "capacidad": "alta"},
            "DEP": {"titulo": "Dependencia rara", "estado": "pendiente",
                    "intentos": 2, "capacidad": "alta"},
            "TRES": {"titulo": "Tres escenas", "estado": "pendiente",
                     "intentos": 0, "capacidad": "alta"},
        }

    def _escribir_progreso(self, tareas):
        with open(self.progreso_path, "w", encoding="utf-8") as f:
            json.dump({"lecturas": [], **tareas}, f, ensure_ascii=False)

    def _run_script(self, args=None, env=None):
        """Ejecuta el script y captura stdout."""
        if env is None:
            env = dict(os.environ)
        # Añadir las rutas falsas a STARSEED_ROOT para que el script las encuentre
        env["STARSEED_ROOT"] = self.tmpdir
        env["STARSEED_LIMITES_CLAUDE"] = self.limites_path
        cmd = [sys.executable, SCRIPT] + (args or [])
        proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
        return proc.stdout, proc.stderr, proc.returncode

    def test_sin_json_por_defecto(self):
        output, _, _ = self._run_script()
        self.assertIn("Cupo de Claude:", output)

    def test_json_salida(self):
        output, _, _ = self._run_script(["--json"])
        self.assertTrue(output.strip().startswith("{"), f"Expected JSON, got: {output[:50]}")
        datos = json.loads(output)
        self.assertIn("cupo", datos)
        self.assertIn("candidatas", datos)
        self.assertIn("elegidas", datos)
        self.assertTrue(isinstance(datos["candidatas"], list))
        self.assertTrue(isinstance(datos["elegidas"], list))

    def test_json_cupo_estructura(self):
        output, _, _ = self._run_script(["--json"])
        datos = json.loads(output)
        cupo = datos["cupo"]
        self.assertIn("ok", cupo)
        self.assertIn("motivo", cupo)

    def test_json_candidatas_estructura(self):
        output, _, _ = self._run_script(["--json"])
        datos = json.loads(output)
        for c in datos["candidatas"]:
            self.assertIn("id", c)
            self.assertIn("titulo", c)
            self.assertIn("estado", c)
            self.assertIn("intentos", c)

    def test_json_elegidas_estructura(self):
        output, _, _ = self._run_script(["--json"])
        datos = json.loads(output)
        for c in datos["elegidas"]:
            self.assertIn("id", c)
            self.assertIn("titulo", c)
            self.assertIn("estado", c)
            self.assertIn("intentos", c)

    def test_sin_progreso_vacio(self):
        # Progreso vacío - debería manejarse gracefully
        # Borramos el archivo de progreso para testear caso borde
        if os.path.exists(self.progreso_path):
            os.remove(self.progreso_path)
        output, _, _ = self._run_script(["--json"])
        datos = json.loads(output)
        self.assertIn("cupo", datos)
        self.assertIn("candidatas", datos)


    def test_json_con_cupo_ok_lista_candidatas_y_elegidas(self):
        self._escribir_progreso(self._escribir_tareas_alta())
        output, _, _ = self._run_script(["--json"])
        datos = json.loads(output)
        self.assertTrue(datos["cupo"]["ok"], datos["cupo"]["motivo"])
        self.assertIn("semana 40", datos["cupo"]["motivo"])
        self.assertIn("sesión 30", datos["cupo"]["motivo"])
        self.assertEqual([c["id"] for c in datos["candidatas"]],
                         ["ALTA", "DEP", "TRES"])
        # Elegidas = las dos primeras del orden (hoy el orden cae al id).
        self.assertEqual([c["id"] for c in datos["elegidas"]], ["ALTA", "DEP"])
        alta = datos["candidatas"][0]
        self.assertEqual((alta["titulo"], alta["estado"], alta["intentos"]),
                         ("Animación fina", "pendiente", 0))

    def test_en_marcha_reduce_las_elegidas(self):
        self._escribir_progreso(self._escribir_tareas_alta())
        env_uno = dict(os.environ, ALTA_EN_MARCHA="1")
        d = json.loads(self._run_script(["--json"], env=env_uno)[0])
        self.assertEqual([c["id"] for c in d["elegidas"]], ["ALTA"])
        env_dos = dict(os.environ, ALTA_EN_MARCHA="2")
        d = json.loads(self._run_script(["--json"], env=env_dos)[0])
        self.assertEqual(d["elegidas"], [])

    def test_cupo_por_limites_y_lectura_vieja(self):
        self._escribir_progreso(self._escribir_tareas_alta())
        self._escribir_limites(sesion_pct=75)
        motivo = json.loads(self._run_script(["--json"])[0])["cupo"]["motivo"]
        self.assertFalse(json.loads(self._run_script(["--json"])[0])["cupo"]["ok"])
        self.assertIn("sesión", motivo)
        self._escribir_limites(semana_pct=85)
        motivo = json.loads(self._run_script(["--json"])[0])["cupo"]["motivo"]
        self.assertIn("semana", motivo)
        self._escribir_limites(hace_min=420)
        motivo = json.loads(self._run_script(["--json"])[0])["cupo"]["motivo"]
        self.assertIn("lectura vieja", motivo)
        os.remove(self.limites_path)
        motivo = json.loads(self._run_script(["--json"])[0])["cupo"]["motivo"]
        self.assertIn("lectura vieja", motivo)

    def test_modo_texto_lee_y_no_toca_el_progreso(self):
        self._escribir_progreso(self._escribir_tareas_alta())
        with open(self.progreso_path, "rb") as f:
            antes = f.read()
        output, _, _ = self._run_script()
        self.assertIn("Cupo de Claude: sí", output)
        self.assertIn("ALTA · Animación fina · pendiente · intentos:0", output)
        self.assertIn("ALTA", output.split("Elegiría ahora:")[1])
        with open(self.progreso_path, "rb") as f:
            self.assertEqual(f.read(), antes)


if __name__ == "__main__":
    unittest.main()