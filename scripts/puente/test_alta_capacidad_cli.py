# -*- coding: utf-8 -*-
"""Pruebas del CLI alta-capacidad.py con colas, progreso y límites falsos.

Todo va a una carpeta temporal; se inyectan las rutas por `--raiz`/`--limites` y por
`STARSEED_ROOT`/`STARSEED_LIMITES_CLAUDE`, como los demás scripts del puente. Sin red.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(AQUI, "alta-capacidad.py")


class AltaCapacidadCLI(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        self.progreso = os.path.join(self.olas, "progreso.json")
        self.limites = os.path.join(self.raiz, "limites-claude.json")
        self._escribir(os.path.join(self.olas, "cola-1021.json"), {"tareas": [
            {"id": "ALTA", "titulo": "Animación fina", "alta_capacidad": True, "archivos": ["a.tsx"]},
            {"id": "TRES", "titulo": "Contrato", "archivos": ["a.ts", "b.ts", "c.ts"]},
            {"id": "FALLO", "titulo": "Ya falló", "archivos": ["a.ts"], "intentos_auto": 2},
            {"id": "FACIL", "titulo": "Mecánica", "archivos": ["a.ts"]},
            {"id": "HECHA", "titulo": "Cerrada", "alta_capacidad": True},
            {"id": "DEP", "titulo": "Espera", "alta_capacidad": True, "depende": ["ALTA"]},
            {"id": "BLOQ", "titulo": "Bloqueada", "alta_capacidad": True},
        ]})
        self._escribir(self.progreso, {
            "ALTA": {"estado": "pendiente"}, "TRES": {"estado": "pendiente"},
            "FALLO": {"estado": "sin_cambios", "intentos_auto": 2},
            "FACIL": {"estado": "pendiente"}, "HECHA": {"estado": "commit"},
            "DEP": {"estado": "pendiente"}, "BLOQ": {"estado": "bloqueada"},
        })
        self._limites()

    def tearDown(self):
        self.tmp.cleanup()

    @staticmethod
    def _escribir(ruta, datos):
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)

    def _limites(self, sesion=30, semana=40, hace_min=0):
        ahora = datetime.now(timezone.utc)
        futuro = (ahora + timedelta(days=3)).isoformat()
        self._escribir(self.limites, {"lecturas": [{
            "t": (ahora - timedelta(minutes=hace_min)).isoformat(),
            "sesion_pct": sesion, "sesion_reinicio": futuro,
            "semana_pct": semana, "semana_reinicio": futuro,
            "modelo_nombre": "Opus 5.5",
        }]})

    def _correr(self, *args, env=None):
        cmd = [sys.executable, CLI, "--raiz", self.raiz, "--limites", self.limites] + list(args)
        return subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=env)

    def test_json_con_cupo_lista_candidatas_y_elegidas(self):
        r = self._correr("--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        d = json.loads(r.stdout)
        self.assertTrue(d["cupo"]["ok"])
        self.assertIn("semana 40", d["cupo"]["motivo"])
        self.assertEqual([c["id"] for c in d["candidatas"]],
                         ["ALTA", "DEP", "BLOQ", "TRES", "FALLO"])
        self.assertEqual(d["elegidas"], ["ALTA", "TRES"])
        alta = d["candidatas"][0]
        self.assertEqual((alta["titulo"], alta["estado"], alta["intentos"]),
                         ("Animación fina", "pendiente", 0))

    def test_en_marcha_reduce_las_elegidas_y_llena_el_tope(self):
        d = json.loads(self._correr("--json", "--en-marcha", "1").stdout)
        self.assertEqual(d["elegidas"], ["ALTA"])
        d = json.loads(self._correr("--json", "--en-marcha", "2").stdout)
        self.assertFalse(d["cupo"]["ok"])
        self.assertIn("2 Opus en marcha", d["cupo"]["motivo"])
        self.assertEqual(d["elegidas"], [])

    def test_cupo_por_limites_y_lectura_vieja(self):
        self._limites(sesion=75)
        d = json.loads(self._correr("--json").stdout)
        self.assertFalse(d["cupo"]["ok"])
        self.assertIn("sesión", d["cupo"]["motivo"])
        self.assertEqual(d["elegidas"], [])
        self._limites(semana=85)
        self.assertIn("semana", json.loads(self._correr("--json").stdout)["cupo"]["motivo"])
        self._limites(hace_min=180)
        self.assertIn("desactualizada", json.loads(self._correr("--json").stdout)["cupo"]["motivo"])
        os.remove(self.limites)
        self.assertIn("sin lectura", json.loads(self._correr("--json").stdout)["cupo"]["motivo"])

    def test_solo_lee_y_la_salida_humana_dice_el_cupo(self):
        with open(self.progreso, "rb") as f:
            antes = f.read()
        r = self._correr()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Cupo de Claude: sí", r.stdout)
        self.assertIn("ALTA · Animación fina · pendiente · 0 intento(s)", r.stdout)
        self.assertIn("Elegidas ahora (0 en marcha): ALTA, TRES", r.stdout)
        with open(self.progreso, "rb") as f:
            self.assertEqual(f.read(), antes)

    def test_rutas_por_entorno_como_los_demas_scripts(self):
        env = dict(os.environ, STARSEED_ROOT=self.raiz, STARSEED_LIMITES_CLAUDE=self.limites)
        r = subprocess.run([sys.executable, CLI, "--json"], capture_output=True, text=True,
                           timeout=30, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(r.stdout)["elegidas"], ["ALTA", "TRES"])
