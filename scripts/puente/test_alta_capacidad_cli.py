# -*- coding: utf-8 -*-
"""Pruebas CLI del carril de alta capacidad (ALT1021Cd) — unittest, sin red."""
import json
import os
import subprocess
import sys
import tempfile
import datetime as dt
import unittest

_BASE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(_BASE, "alta-capacidad.py")


class TestAltaCapacidadCLI(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.olas_dir = os.path.join(self.tmpdir, "olas")
        os.makedirs(self.olas_dir, exist_ok=True)
        self.progreso_path = os.path.join(self.olas_dir, "progreso.json")
        self.columnas_dir = os.path.join(self.tmpdir, "colas-fuente")
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

    def _run_script(self, args=None, env=None):
        """Ejecuta el script y captura stdout."""
        if env is None:
            env = dict(os.environ)
        # Añadir las rutas falsas a STARSEED_ROOT para que el script las encuentre
        env["STARSEED_ROOT"] = self.tmpdir
        cmd = [sys.executable, SCRIPT] + (args or [])
        proc = subprocess.run(cmd, capture_output=True, text=True)
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

    # --- NUEVOS CASOS DE LA RAMA (no están en main) ---

    def test_json_con_cupo(self):
        cola, progreso, limites = self._preparar()
        output, _, _ = self._run_script(["--olas", os.path.dirname(cola),
                                          "--progreso", progreso,
                                          "--limites", limites, "--json"])
        self.assertEqual(_, 0)
        datos = json.loads(output)
        self.assertEqual(set(datos), {"cupo", "candidatas", "elegidas"})
        self.assertEqual(set(datos["cupo"]), {"ok", "motivo"})
        self.assertTrue(datos["cupo"]["ok"])
        ids = [c["id"] for c in datos["candidatas"]]
        self.assertEqual(sorted(ids), ["T1", "T2", "T5"])
        self.assertEqual(ids.count("T1"), 1)
        filas = {c["id"]: c for c in datos["candidatas"]}
        self.assertEqual(filas["T1"], {"id": "T1", "titulo": "Pieza grande",
                                       "estado": "pendiente", "intentos": 0})
        self.assertEqual(filas["T5"]["intentos"], 3)
        self.assertEqual(filas["T5"]["estado"], "fallo_tests")
        self.assertEqual(datos["elegidas"], ["T1"])

    def test_texto_y_en_marcha(self):
        cola, progreso, limites = self._preparar()
        output, _, _ = self._run_script(["--olas", os.path.dirname(cola),
                                          "--progreso", progreso,
                                          "--limites", limites, "--en-marcha", "2"])
        self.assertEqual(_, 0)
        primera = output.splitlines()[0]
        self.assertTrue(primera.startswith("Cupo de Claude: sí ·"), primera)
        self.assertIn("T1 · Pieza grande · pendiente · 0 intento(s)", output)
        self.assertIn("Elegidas ahora (2 en marcha): ninguna", output)

    def test_orden_y_relevo_con_hueco(self):
        cola, progreso, limites = self._entorno(
            [
                {"id": "A", "titulo": "Reciente", "capacidad": "alta"},
                {"id": "B", "titulo": "Con más intentos", "capacidad": "alta",
                 "intentos_auto": 5},
            ],
            {}, self._limites_frescos(),
        )
        output, _, _ = self._run_script(["--olas", os.path.dirname(cola),
                                          "--progreso", progreso,
                                          "--limites", limites, "--json", "--en-marcha", "1"])
        self.assertEqual(_, 0)
        datos = json.loads(output)
        self.assertEqual(datos["elegidas"], ["B"])

    def test_sin_lectura_de_limites_cupo_no(self):
        cola, progreso, limites = self._preparar(limites={"lecturas": []})
        output, _, _ = self._run_script(["--olas", os.path.dirname(cola),
                                          "--progreso", progreso,
                                          "--limites", limites, "--json"])
        self.assertEqual(_, 0)
        datos = json.loads(output)
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("lectura vieja", datos["cupo"]["motivo"])
        self.assertEqual(datos["elegidas"], [])

    def test_tope_de_sesion_bloquea(self):
        viejo = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=10)).isoformat()
        cola, progreso, limites = self._preparar(
            limites={"lecturas": [{"t": viejo, "semana_pct": 10, "sesion_pct": 70}]}
        )
        output, _, _ = self._run_script(["--olas", os.path.dirname(cola),
                                          "--progreso", progreso,
                                          "--limites", limites, "--json"])
        self.assertEqual(_, 0)
        datos = json.loads(output)
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("tope superado", datos["cupo"]["motivo"])

    def test_rutas_por_entorno(self):
        cola, progreso, limites = self._preparar()
        output, _, _ = self._run_script(["--json"])
        self.assertEqual(_, 0)
        datos = json.loads(output)
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["T1", "T2", "T5"])
        self.assertEqual(datos["elegidas"], ["T1"])

    def _preparar(self, limites=None):
        """Prepara el entorno de test: cola, progreso y límites."""
        tmpdir = tempfile.mkdtemp()
        olas_dir = os.path.join(tmpdir, "olas")
        os.makedirs(olas_dir, exist_ok=True)
        progreso_path = os.path.join(olas_dir, "progreso.json")
        columnas_dir = os.path.join(tmpdir, "colas-fuente")
        os.makedirs(columnas_dir, exist_ok=True)

        if limites is None:
            limites = {"lecturas": [{"t": dt.datetime.now(dt.timezone.utc).isoformat(),
                                      "semana_pct": 50, "sesion_pct": 50}]}
        progreso_falso = {
            "lecturas": limites.get("lecturas", []),
            "T1": {
                "id": "T1",
                "titulo": "Pieza grande",
                "estado": "pendiente",
                "intentos": 0,
                "importancia": "capacidad",
            },
            "T2": {
                "id": "T2",
                "titulo": "Otro test",
                "estado": "pendiente",
                "intentos": 1,
            },
            "T5": {
                "id": "T5",
                "titulo": "Sala de juegos",
                "estado": "fallo_tests",
                "intentos": 3,
            },
        }
        with open(progreso_path, "w", encoding="utf-8") as f:
            json.dump(progreso_falso, f, ensure_ascii=False)

        cola_falsa = [
            {
                "id": "T1",
                "ola": "Ola prueba",
                "titulo": "PowerInfer: módulo de requisitos",
                "estado": "pendiente",
                "intentos": 2,
            },
            {
                "id": "T2",
                "ola": "Ola prueba",
                "titulo": "Medir dispersión BitNet",
                "estado": "bloqueante",
                "intentos": 5,
            },
            {
                "id": "T5",
                "ola": "Ola prueba",
                "titulo": "Dibujo-adivina con árbitro",
                "estado": "pendiente",
                "intentos": 0,
            },
        ]
        with open(os.path.join(columnas_dir, "cola-prueba.json"), "w", encoding="utf-8") as f:
            json.dump(cola_falsa, f, ensure_ascii=False)

        # escribir STARSEED_ROOT en el entorno para el script
        env = dict(os.environ)
        env["STARSEED_ROOT"] = tmpdir

        # crear archivo de progreso para que el script lo lea
        with open(progreso_path, "w", encoding="utf-8") as f:
            json.dump(progreso_falso, f, ensure_ascii=False)

        # crear cola fuente para que el script la lea
        with open(os.path.join(self.columnas_dir, "cola-prueba.json"), "w", encoding="utf-8") as f:
            json.dump(cola_falsa, f, ensure_ascii=False)

        cola_dir = os.path.dirname(os.path.join(columnas_dir, "cola-prueba.json"))
        return cola_dir, progreso_path, limites

    def _entorno(self, cola, progreso_dict, limites):
        """Construye cola, progreso y retorna strings para el runner."""
        tmpdir = tempfile.mkdtemp()
        olas_dir = os.path.join(tmpdir, "olas")
        os.makedirs(olas_dir, exist_ok=True)
        progreso_path = os.path.join(olas_dir, "progreso.json")
        columnas_dir = os.path.join(tmpdir, "colas-fuente")
        os.makedirs(columnas_dir, exist_ok=True)

        with open(progreso_path, "w", encoding="utf-8") as f:
            json.dump(progreso_dict, f, ensure_ascii=False)

        with open(os.path.join(columnas_dir, "cola.json"), "w", encoding="utf-8") as f:
            json.dump(cola, f, ensure_ascii=False)

        env = dict(os.environ)
        env["STARSEED_ROOT"] = tmpdir

        return "", progreso_path, limites

    @staticmethod
    def _limites_frescos():
        return {"lecturas": []}


if __name__ == "__main__":
    unittest.main()