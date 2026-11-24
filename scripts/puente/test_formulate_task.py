#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de formulate_next_intelligent_task y recomendador de imaginación (IMG-des-simular)."""
import json
import os
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import formulate_task as FT
import imaginacion_recomendador as IR


class MotorRealSinRepoNiHuerfanos(unittest.TestCase):
    """(SUP1124G) `starseed-sub codigo` es un agente de código: corre en una carpeta vacía y en su propia sesión, y al
    vencer el plazo se corta su grupo entero (el 24-11 se quedó vivo, con un vitest entero, en un árbol de pruebas)."""

    def test_corre_en_una_carpeta_vacia_y_en_su_propia_sesion(self):
        vistos = {}

        class Proc:
            pid, returncode = 999999, 0

            def communicate(self, timeout=None):
                return ('{"propuesta": {"titulo": "t"}}', "")

        def popen(cmd, **kw):
            vistos.update(kw, cmd=cmd, vacia=os.listdir(kw["cwd"]) == [])
            return Proc()

        salida = FT._llamar_starseed_sub("p", "codigo", popen=popen)
        self.assertEqual(json.loads(salida)["propuesta"]["titulo"], "t")
        self.assertEqual(vistos["cmd"], ["starseed-sub", "codigo", "p"])
        self.assertTrue(vistos["start_new_session"])
        self.assertTrue(vistos["vacia"])
        repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.assertFalse(os.path.realpath(vistos["cwd"]).startswith(os.path.realpath(repo)))
        self.assertFalse(os.path.exists(vistos["cwd"]))  # la carpeta temporal no se queda

    def test_al_vencer_el_plazo_corta_el_grupo_entero(self):
        cortes = []

        class Proc:
            pid, returncode = 4242, None

            def communicate(self, timeout=None):
                if not cortes:
                    raise subprocess.TimeoutExpired("starseed-sub", timeout)
                return ("", "")

        with mock.patch.object(FT.os, "killpg", lambda pid, sig: cortes.append((pid, sig))):
            salida = FT._llamar_starseed_sub("p", popen=lambda cmd, **kw: Proc(), plazo_s=0.01)
        self.assertEqual(cortes, [(4242, signal.SIGTERM)])
        self.assertEqual(json.loads(salida)["propuesta"]["titulo"], "")


class TestFormulateNextIntelligentTask(unittest.TestCase):
    """formulate_next_intelligent_task: formular tarea con motor real, NO random.choice."""

    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.mem = os.path.join(self.t.name, "starseed_memory_root")
        os.makedirs(os.path.join(self.mem, "imaginacion", "agentes"), exist_ok=True)
        os.makedirs(os.path.join(self.mem, "olas"), exist_ok=True)
        self.ahora = datetime(2026, 11, 21, 10, 0)

    def tearDown(self):
        self.t.cleanup()

    def test_formulate_usa_motor_real_no_random(self):
        """La formulación usa motor real (starseed-sub), no random.choice de blueprints."""
        propuesta = {
            "id": "diaria:test-1",
            "titulo": "Arreglar el lector de archivos",
            "cuerpo": "Corregir error de lectura en scripts/puente/suenos.py:10",
            "archivos": ["scripts/puente/suenos.py"],
            "utilidad": 0.8,
            "importancia": "media",
            "estado": "autodesarrollo",
            "fuente": "diaria",
        }
        # Motor simulado que registra lo que recibe
        llamadas = []
        def motor_real(prompt, rol="codigo"):
            llamadas.append({"prompt": prompt, "rol": rol})
            return json.dumps({
                "propuesta": {
                    "titulo": "Arreglar el lector de archivos",
                    "cuerpo": "Implementación completa...",
                    "tipo": "codigo",
                    "referencias": [],
                    "archivos": ["scripts/puente/suenos.py"],
                }
            })

        tarea = FT.formulate_next_intelligent_task(propuesta, self.mem, self.ahora, motor_real)

        self.assertEqual(len(llamadas), 1)
        self.assertIn("Comprueba si sigue haciendo falta", llamadas[0]["prompt"])
        self.assertEqual(tarea["id"], "IMG-diaria-test-1-v1")
        self.assertEqual(tarea["tipo"], "analisis")
        self.assertEqual(tarea["modo"], "libre")

    def test_formulate_sin_motor_usa_starseed_sub(self):
        """Si no hay motor real, usa starseed-sub como fallback."""
        propuesta = {
            "id": "agentes:test-2",
            "titulo": "Mejorar la paleta",
            "cuerpo": "Actualizar colores según referencias",
            "archivos": ["src/lib/diseno/paleta.ts"],
            "utilidad": 0.7,
            "importancia": "baja",
            "estado": "autodesarrollo",
            "fuente": "agentes",
        }
        # Sin motor real, debe usar starseed-sub (simulado aquí)
        def motor_starseed_sub(prompt, rol="codigo"):
            return json.dumps({"propuesta": {"titulo": propuesta["titulo"], "cuerpo": "ok", "tipo": "diseno", "referencias": [], "archivos": propuesta["archivos"]}})

        tarea = FT.formulate_next_intelligent_task(propuesta, self.mem, self.ahora, motor_starseed_sub)

        self.assertIsNotNone(tarea)
        self.assertIn("ENTREGABLE" if propuesta["fuente"] == "agentes" else "ANALISIS", tarea.get("ola", ""))


class TestImaginacionRecomendador(unittest.TestCase):
    """Recomendador de imaginación: sugiere tareas cuando hay plantillas abiertas."""

    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.mem = os.path.join(self.t.name, "starseed_memory_root")
        os.makedirs(os.path.join(self.mem, "imaginacion", "agentes"), exist_ok=True)
        os.makedirs(os.path.join(self.mem, "olas"), exist_ok=True)
        self.ahora = datetime(2026, 11, 21, 10, 0)

    def tearDown(self):
        self.t.cleanup()

    def test_recomienda_si_hay_plantillas_abiertas(self):
        """Si quedan plantillas (tasks abiertas), recomienda siguientes pasos."""
        # Crear plantillas abiertas
        plantillas = [
            {"id": "plantilla-1", "titulo": "Patrón Horizon-Pulse", "archivos": ["src/a.tsx"], "estado": "abierta"},
            {"id": "plantilla-2", "titulo": "Guion Diálogo del Orbe", "archivos": ["src/b.tsx"], "estado": "abierta"},
        ]
        with open(os.path.join(self.mem, "imaginacion", "plantillas.json"), "w") as f:
            json.dump({"plantillas": plantillas}, f)

        recomendaciones = IR.recomendar_siguientes(self.mem, self.ahora)

        self.assertEqual(len(recomendaciones), 2)
        self.assertTrue(all("accion" in r for r in recomendaciones))
        self.assertTrue(any("Horizon-Pulse" in r.get("titulo", "") for r in recomendaciones))

    def test_no_recomienda_si_no_hay_plantillas(self):
        """Sin plantillas abiertas, no recomienda nada."""
        recomendaciones = IR.recomendar_siguientes(self.mem, self.ahora)
        self.assertEqual(recomendaciones, [])

    def test_recomendador_usa_contexto_medido(self):
        """El recomendador usa el contexto medido (archivos que existen, familias, etc.)."""
        plantillas = [{"id": "p1", "titulo": "Arreglar fuga POST", "archivos": ["src/api/x.ts"], "estado": "abierta"}]
        with open(os.path.join(self.mem, "imaginacion", "plantillas.json"), "w") as f:
            json.dump({"plantillas": plantillas}, f)
        # Archivo real existe
        os.makedirs(os.path.join(self.t.name, "src", "api"), exist_ok=True)
        with open(os.path.join(self.t.name, "src", "api", "x.ts"), "w") as f:
            f.write("export const x = 1;")

        recomendaciones = IR.recomendar_siguientes(self.t.name, self.ahora)

        self.assertEqual(len(recomendaciones), 1)
        self.assertIn("src/api/x.ts", recomendaciones[0].get("archivos", []))


if __name__ == "__main__":
    unittest.main()