# -*- coding: utf-8 -*-
"""Pruebas del carril de alta capacidad CLI (ALT1021Cd): salida --json con datos falsos.

Todo se inyecta por variables de entorno y carpetas temporales; el CLI corre como
subproceso, solo lee disco y no lanza agentes ni toca el progreso.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(AQUI, "alta-capacidad.py")


def _ahora_iso():
    return datetime.now(timezone.utc).isoformat()


def _limites_frescos():
    return {"lecturas": [{"t": _ahora_iso(), "semana_pct": 30, "sesion_pct": 40}]}


class AltaCapacidadCLI(unittest.TestCase):
    def _entorno(self, tareas, progreso, limites):
        raiz = tempfile.mkdtemp(prefix="alta-cap-")
        self.addCleanup(shutil.rmtree, raiz, ignore_errors=True)
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        cola = os.path.join(olas, "cola-test-alta.json")
        with open(cola, "w", encoding="utf-8") as f:
            json.dump({"tareas": tareas}, f, ensure_ascii=False)
        archivo_progreso = os.path.join(olas, "progreso.json")
        with open(archivo_progreso, "w", encoding="utf-8") as f:
            json.dump(progreso, f, ensure_ascii=False)
        archivo_limites = os.path.join(raiz, "limites-claude.json")
        with open(archivo_limites, "w", encoding="utf-8") as f:
            json.dump(limites, f, ensure_ascii=False)
        return cola, archivo_progreso, archivo_limites

    def _correr(self, *argumentos, env_extra=()):
        env = dict(os.environ)
        for nombre, valor in env_extra:
            env[nombre] = valor
        return subprocess.run(
            [sys.executable, CLI, *argumentos],
            capture_output=True, text=True, env=env, timeout=60,
        )

    COLA = [
        # candidata y elegible: capacidad alta, pendiente, sin dependencias.
        {"id": "T1", "titulo": "Pieza grande", "capacidad": "alta"},
        # candidata pero no elegible: bloqueada con alta_capacidad, la juzga el revisor.
        {"id": "T2", "titulo": "Bloqueada que pide fuerza", "alta_capacidad": True},
        # cerrada: con commit en progreso, aunque pida capacidad alta, no se lista.
        {"id": "T3", "titulo": "Ya hecha", "capacidad": "alta"},
        # normal: ni candidata.
        {"id": "T4", "titulo": "Pieza normal", "capacidad": "normal"},
        # candidata con dependencia no integrada: se lista, no se elige.
        {"id": "T5", "titulo": "Con alguien delante", "capacidad": "alta", "depende": ["T9"]},
        # duplicada en otra cola: solo se lista una vez.
        {"id": "T1", "titulo": "Repetida", "capacidad": "alta"},
    ]
    PROGRESO = {
        "T1": {"estado": "pendiente"},
        "T2": {"estado": "bloqueante", "alta_capacidad": True},
        "T3": {"estado": "commit"},
        "T5": {"estado": "fallo_tests", "intentos_auto": 3},
    }

    def _preparar(self, limites=None):
        return self._entorno(self.COLA, self.PROGRESO, limites or _limites_frescos())

    def test_json_con_cupo(self):
        cola, progreso, limites = self._preparar()
        r = self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
                         "--limites", limites, "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        datos = json.loads(r.stdout)
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
        r = self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
                         "--limites", limites, "--en-marcha", "2")
        self.assertEqual(r.returncode, 0, r.stderr)
        primera = r.stdout.splitlines()[0]
        self.assertTrue(primera.startswith("Cupo de Claude: sí ·"), primera)
        self.assertIn("T1 · Pieza grande · pendiente · 0 intento(s)", r.stdout)
        self.assertIn("Elegidas ahora (2 en marcha): ninguna", r.stdout)

    def test_texto_por_defecto_en_marcha_cero(self):
        cola, progreso, limites = self._preparar()
        r = self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
                         "--limites", limites)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Elegidas ahora (0 en marcha): T1", r.stdout)

    def test_orden_y_relevo_con_hueco(self):
        cola, progreso, limites = self._entorno(
            [
                {"id": "A", "titulo": "Reciente", "capacidad": "alta"},
                {"id": "B", "titulo": "Con más intentos", "capacidad": "alta",
                 "intentos_auto": 5},
            ],
            {}, _limites_frescos(),
        )
        r = self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
                         "--limites", limites, "--json", "--en-marcha", "1")
        self.assertEqual(r.returncode, 0, r.stderr)
        datos = json.loads(r.stdout)
        self.assertEqual(datos["elegidas"], ["B"])

    def test_sin_lectura_de_limites_cupo_no(self):
        cola, progreso, limites = self._preparar(limites={"lecturas": []})
        r = self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
                         "--limites", limites, "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        datos = json.loads(r.stdout)
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("lectura vieja", datos["cupo"]["motivo"])
        self.assertEqual(datos["elegidas"], [])

    def test_tope_de_sesion_bloquea(self):
        viejo = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        cola, progreso, limites = self._preparar(
            limites={"lecturas": [{"t": viejo, "semana_pct": 10, "sesion_pct": 70}]}
        )
        r = self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
                         "--limites", limites, "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        datos = json.loads(r.stdout)
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("tope superado", datos["cupo"]["motivo"])

    def test_rutas_por_entorno(self):
        cola, progreso, limites = self._preparar()
        r = self._correr(
            "--json",
            env_extra=[
                ("STARSEED_ROOT", os.path.dirname(os.path.dirname(os.path.dirname(cola)))),
                ("STARSEED_PROGRESO", progreso),
                ("STARSEED_LIMITES_CLAUDE", limites),
            ],
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        datos = json.loads(r.stdout)
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["T1", "T2", "T5"])
        self.assertEqual(datos["elegidas"], ["T1"])

    def test_no_toca_el_progreso(self):
        cola, progreso, limites = self._preparar()
        with open(progreso, encoding="utf-8") as f:
            antes = f.read()
        r = self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
                         "--limites", limites, "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(progreso, encoding="utf-8") as f:
            despues = f.read()
        self.assertEqual(antes, despues)

    def test_ignora_cola_de_suenos(self):
        cola, progreso, limites = self._preparar()
        olas = os.path.dirname(cola)
        with open(os.path.join(olas, "cola-suenos-1027.json"), "w", encoding="utf-8") as f:
            json.dump([{"id": "SU1", "titulo": "Sueño", "capacidad": "alta"}], f,
                      ensure_ascii=False)
        r = self._correr("--olas", olas, "--progreso", progreso,
                         "--limites", limites, "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        datos = json.loads(r.stdout)
        self.assertNotIn("SU1", [c["id"] for c in datos["candidatas"]])

    def test_cupo_por_limites_y_lectura_vieja(self):
        cola, progreso, limites = self._preparar()
        # tope de sesión
        with open(limites, "w", encoding="utf-8") as f:
            json.dump({"lecturas": [{"t": datetime.now(timezone.utc).isoformat(), "semana_pct": 30, "sesion_pct": 75}]}, f)
        d = json.loads(self._correr("--olas", os.path.dirname(cola), "--progreso", progreso, "--limites", limites, "--json").stdout)
        self.assertFalse(d["cupo"]["ok"])
        self.assertIn("sesión", d["cupo"]["motivo"])
        self.assertEqual(d["elegidas"], [])
        # tope de semana
        with open(limites, "w", encoding="utf-8") as f:
            json.dump({"lecturas": [{"t": datetime.now(timezone.utc).isoformat(), "semana_pct": 85, "sesion_pct": 30}]}, f)
        d = json.loads(self._correr("--olas", os.path.dirname(cola), "--progreso", progreso, "--limites", limites, "--json").stdout)
        self.assertFalse(d["cupo"]["ok"])
        self.assertIn("semana", d["cupo"]["motivo"])
        # lectura vieja (> 6h = 360 min)
        viejo = (datetime.now(timezone.utc) - timedelta(minutes=400)).isoformat()
        with open(limites, "w", encoding="utf-8") as f:
            json.dump({"lecturas": [{"t": viejo, "semana_pct": 30, "sesion_pct": 30}]}, f)
        d = json.loads(self._correr("--olas", os.path.dirname(cola), "--progreso", progreso, "--limites", limites, "--json").stdout)
        self.assertFalse(d["cupo"]["ok"])
        self.assertIn("lectura vieja", d["cupo"]["motivo"])
        # archivo de límites inexistente → leer() devuelve {} → lecturas vacía → "lectura vieja"
        os.remove(limites)
        d = json.loads(self._correr("--olas", os.path.dirname(cola), "--progreso", progreso, "--limites", limites, "--json").stdout)
        self.assertFalse(d["cupo"]["ok"])
        self.assertIn("lectura vieja", d["cupo"]["motivo"])

    def test_olas_por_entorno_sin_raiz(self):
        cola, progreso, limites = self._preparar()
        olas = os.path.dirname(cola)
        env = dict(os.environ, STARSEED_OLAS=olas, STARSEED_LIMITES_CLAUDE=limites)
        env.pop("STARSEED_ROOT", None)
        r = subprocess.run([sys.executable, CLI, "--json"], capture_output=True, text=True,
                           timeout=30, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        d = json.loads(r.stdout)
        self.assertTrue(d["cupo"]["ok"])
        self.assertEqual(d["elegidas"], ["T1"])

    # NOTA: test_en_marcha_reduce_las_elegidas_y_llena_el_tope
    # El comportamiento "2 Opus en marcha" (cupo.ok=false cuando en_marcha >= max_agentes)
    # NO existe en main (cupo_claude no mira en_marcha). La rama lo esperaba pero no se integró.
    # Si se añade esa lógica en alta_capacidad_logica.py, este test sería:
    # def test_en_marcha_reduce_las_elegidas_y_llena_el_tope(self):
    #     cola, progreso, limites = self._preparar()
    #     d = json.loads(self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
    #                          "--limites", limites, "--json", "--en-marcha", "1").stdout)
    #     self.assertEqual(d["elegidas"], ["T1"])
    #     d = json.loads(self._correr("--olas", os.path.dirname(cola), "--progreso", progreso,
    #                          "--limites", limites, "--json", "--en-marcha", "2").stdout)
    #     self.assertFalse(d["cupo"]["ok"])
    #     self.assertIn("2 Opus en marcha", d["cupo"]["motivo"])
    #     self.assertEqual(d["elegidas"], [])


if __name__ == "__main__":
    unittest.main()
