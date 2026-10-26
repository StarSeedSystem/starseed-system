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
        memoria = os.path.join(self.tmpdir, "starseed_memory_root")
        self.olas_dir = os.path.join(memoria, "olas")
        os.makedirs(self.olas_dir, exist_ok=True)
        self.progreso_path = os.path.join(self.olas_dir, "progreso.json")
        self.columnas_dir = os.path.join(memoria, "colas-fuente")
        os.makedirs(self.columnas_dir, exist_ok=True)
        self.limites = os.path.join(self.tmpdir, "limites-claude.json")
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

    def _run_script(self, args=None, env=None):
        """Ejecuta el script y captura stdout."""
        if env is None:
            env = dict(os.environ)
        # Añadir las rutas falsas a STARSEED_ROOT para que el script las encuentre
        env["STARSEED_ROOT"] = self.tmpdir
        cmd = [sys.executable, SCRIPT] + (args or [])
        proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
        return proc.stdout, proc.stderr, proc.returncode

    def _limites(self, sesion=20, semana=30, hace_min=0):
        """Escribe una lectura de límites fresca (o envejecida) para el cupo."""
        instante = datetime.now(timezone.utc) - timedelta(minutes=hace_min)
        with open(self.limites, "w", encoding="utf-8") as f:
            json.dump({"lecturas": [{
                "t": instante.isoformat(),
                "sesion_pct": sesion,
                "semana_pct": semana,
            }]}, f, ensure_ascii=False)

    def _progreso_alta(self):
        """Progreso con dos candidatas de alta capacidad y una normal."""
        datos = {
            "lecturas": [],
            "ALTA": {
                "id": "ALTA",
                "titulo": "Animación fina",
                "estado": "pendiente",
                "intentos": 0,
                "capacidad": "alta",
                "importancia": "capacidad",
            },
            "TRES": {
                "id": "TRES",
                "titulo": "Otra alta",
                "estado": "pendiente",
                "intentos": 3,
                "intentos_auto": 3,
                "capacidad": "alta",
            },
            "NORMAL": {
                "id": "NORMAL",
                "titulo": "Tarea normal",
                "estado": "pendiente",
                "intentos": 0,
            },
        }
        with open(self.progreso_path, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)

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

    def test_en_marcha_reduce_las_elegidas_y_llena_el_tope(self):
        # El número de agentes en marcha llega por entorno (ALTA_EN_MARCHA).
        self._progreso_alta()
        self._limites()
        env = dict(os.environ, STARSEED_LIMITES_CLAUDE=self.limites)
        d = json.loads(self._run_script(["--json"], dict(env, ALTA_EN_MARCHA="1"))[0])
        self.assertEqual([c["id"] for c in d["candidatas"]], ["ALTA", "TRES"])
        alta = d["candidatas"][0]
        self.assertEqual((alta["titulo"], alta["estado"], alta["intentos"]),
                         ("Animación fina", "pendiente", 0))
        self.assertEqual([c["id"] for c in d["elegidas"]], ["ALTA"])
        d = json.loads(self._run_script(["--json"], dict(env, ALTA_EN_MARCHA="2"))[0])
        self.assertEqual([c["id"] for c in d["elegidas"]], [])

    def test_cupo_por_limites_y_lectura_vieja(self):
        self._limites(sesion=75)
        d = json.loads(self._run_script(
            ["--json"], dict(os.environ, STARSEED_LIMITES_CLAUDE=self.limites))[0])
        self.assertFalse(d["cupo"]["ok"])
        self.assertIn("sesión", d["cupo"]["motivo"])
        self._limites(semana=85)
        d = json.loads(self._run_script(
            ["--json"], dict(os.environ, STARSEED_LIMITES_CLAUDE=self.limites))[0])
        self.assertIn("semana", d["cupo"]["motivo"])
        # La frescura de hoy es de 6 h: 400 minutos ya es una lectura vieja.
        self._limites(hace_min=400)
        d = json.loads(self._run_script(
            ["--json"], dict(os.environ, STARSEED_LIMITES_CLAUDE=self.limites))[0])
        self.assertIn("lectura vieja", d["cupo"]["motivo"])
        os.remove(self.limites)
        d = json.loads(self._run_script(
            ["--json"], dict(os.environ, STARSEED_LIMITES_CLAUDE=self.limites))[0])
        self.assertIn("lectura vieja", d["cupo"]["motivo"])

    def test_solo_lee_y_la_salida_humana_dice_el_cupo(self):
        self._progreso_alta()
        self._limites()
        with open(self.progreso_path, "rb") as f:
            antes = f.read()
        r = self._run_script(None, dict(os.environ, STARSEED_LIMITES_CLAUDE=self.limites))
        self.assertEqual(r[2], 0, r[1])
        self.assertIn("Cupo de Claude: sí", r[0])
        self.assertIn("ALTA · Animación fina · pendiente · intentos:0", r[0])
        self.assertIn("Elegiría ahora:", r[0])
        self.assertIn("TRES · Otra alta · pendiente · intentos:3", r[0])
        with open(self.progreso_path, "rb") as f:
            self.assertEqual(f.read(), antes)


if __name__ == "__main__":
    unittest.main()