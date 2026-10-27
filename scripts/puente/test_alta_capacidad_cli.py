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
        # El CLI lee RAIZ/starseed_memory_root/{olas,colas-fuente} (STARSEED_ROOT).
        self.olas_dir = os.path.join(self.tmpdir, "starseed_memory_root", "olas")
        os.makedirs(self.olas_dir, exist_ok=True)
        self.progreso_path = os.path.join(self.olas_dir, "progreso.json")
        self.limites_path = os.path.join(self.tmpdir, "limites-claude.json")
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

    def _run_script(self, args=None, env=None, env_extra=None):
        """Ejecuta el script y captura stdout."""
        if env is None:
            env = dict(os.environ)
        # Añadir las rutas falsas a STARSEED_ROOT para que el script las encuentre
        env["STARSEED_ROOT"] = self.tmpdir
        # Límites de Claude ajenos a la máquina real: cada prueba escribe el suyo.
        env["STARSEED_LIMITES_CLAUDE"] = self.limites_path
        env.update(env_extra or {})
        cmd = [sys.executable, SCRIPT] + (args or [])
        proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
        return proc.stdout, proc.stderr, proc.returncode

    def _limites(self, sesion=None, semana=None, hace_min=0):
        """Escribe una lectura de límites fresca (o con `hace_min` de antigüedad)."""
        ahora = datetime.now(timezone.utc)
        lectura = {
            "t": (ahora - timedelta(minutes=hace_min)).isoformat(),
            "sesion_pct": sesion if sesion is not None else 20,
            "sesion_reinicio": (ahora + timedelta(days=1)).isoformat(),
            "semana_pct": semana if semana is not None else 40,
            "semana_reinicio": (ahora + timedelta(days=3)).isoformat(),
        }
        with open(self.limites_path, "w", encoding="utf-8") as f:
            json.dump({"lecturas": [lectura]}, f, ensure_ascii=False)

    def _progreso_de_prueba(self):
        """Cinco tareas de capacidad alta con prioridades y estados variados."""
        tareas = {
            "lecturas": [],
            "ALTA": {"id": "ALTA", "titulo": "Animación fina", "estado": "pendiente",
                     "intentos": 0, "capacidad": "alta", "importancia": "capacidad"},
            "DEP": {"id": "DEP", "titulo": "Depende de red", "estado": "pendiente",
                    "intentos": 0, "capacidad": "alta"},
            "BLOQ": {"id": "BLOQ", "titulo": "Bloqueada dura", "estado": "bloqueada",
                     "intentos": 1, "capacidad": "alta"},
            "TRES": {"id": "TRES", "titulo": "Tres archivos", "estado": "pendiente",
                     "intentos": 0, "capacidad": "alta", "importancia": "capacidad"},
            "FALLO": {"id": "FALLO", "titulo": "Sin cambios dos veces", "estado": "sin_cambios",
                      "intentos": 2, "intentos_auto": 2, "capacidad": "alta"},
        }
        with open(self.progreso_path, "w", encoding="utf-8") as f:
            json.dump(tareas, f, ensure_ascii=False)

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


    def test_json_con_cupo_candidatas_y_elegidas(self):
        # Rescate RTVAR1021C: contenido real de la salida JSON, no solo su forma.
        self._limites(sesion=20, semana=40)
        self._progreso_de_prueba()
        salida, err, code = self._run_script(["--json"])
        self.assertEqual(code, 0, err)
        datos = json.loads(salida)
        self.assertTrue(datos["cupo"]["ok"])
        self.assertIn("semana 40", datos["cupo"]["motivo"])
        self.assertEqual(sorted(c["id"] for c in datos["candidatas"]),
                         ["ALTA", "BLOQ", "DEP", "FALLO", "TRES"])
        # Tope de 2 elegidas dentro de las candidatas (el orden fino se informa aparte).
        elegidas = [c["id"] for c in datos["elegidas"]]
        self.assertEqual(len(elegidas), 2)
        self.assertTrue(set(elegidas) <= {"ALTA", "BLOQ", "DEP", "FALLO", "TRES"})
        alta = next(c for c in datos["candidatas"] if c["id"] == "ALTA")
        self.assertEqual((alta["titulo"], alta["estado"], alta["intentos"]),
                         ("Animación fina", "pendiente", 0))

    def test_en_marcha_reduce_las_elegidas(self):
        # Rescate RTVAR1021C: en main el tope llega por el entorno (ALTA_EN_MARCHA).
        self._progreso_de_prueba()
        salida, _, _ = self._run_script(["--json"], env_extra={"ALTA_EN_MARCHA": "1"})
        self.assertEqual([c["id"] for c in json.loads(salida)["elegidas"]], ["ALTA"])
        salida, _, _ = self._run_script(["--json"], env_extra={"ALTA_EN_MARCHA": "2"})
        self.assertEqual(json.loads(salida)["elegidas"], [])

    def test_cupo_por_los_limites_del_entorno_y_lectura_vieja(self):
        # Rescate RTVAR1021C: el CLI honra STARSEED_LIMITES_CLAUDE y frena el cupo.
        self._progreso_de_prueba()
        self._limites(sesion=75)
        datos = json.loads(self._run_script(["--json"])[0])
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("sesión", datos["cupo"]["motivo"])
        self._limites(sesion=20, semana=85)
        self.assertIn("semana", json.loads(self._run_script(["--json"])[0])["cupo"]["motivo"])
        # Main usa una frescura de 6 h (cupo_claude, frescura_h): 7 h es lectura vieja.
        self._limites(hace_min=420)
        self.assertIn("lectura vieja", json.loads(self._run_script(["--json"])[0])["cupo"]["motivo"])
        os.remove(self.limites_path)
        self.assertIn("lectura vieja", json.loads(self._run_script(["--json"])[0])["cupo"]["motivo"])

    def test_solo_lee_y_la_salida_humana_dice_el_cupo(self):
        # Rescate RTVAR1021C: el modo texto no muta progreso.json y nombra el cupo.
        self._limites(sesion=20, semana=40)
        self._progreso_de_prueba()
        with open(self.progreso_path, "rb") as f:
            antes = f.read()
        salida, err, code = self._run_script()
        self.assertEqual(code, 0, err)
        self.assertIn("Cupo de Claude: sí", salida)
        self.assertIn("ALTA · Animación fina · pendiente · intentos:0", salida)
        self.assertIn("Elegiría ahora:", salida)
        with open(self.progreso_path, "rb") as f:
            self.assertEqual(f.read(), antes)


if __name__ == "__main__":
    unittest.main()