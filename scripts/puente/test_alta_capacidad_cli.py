# -*- coding: utf-8 -*-
"""Pruebas del CLI alta-capacidad.py (Ola 1021A, ALT1021C).

Todo vive en una carpeta temporal: colas, progreso y límites falsos. Sin red ni agentes.
"""
import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
_espec = importlib.util.spec_from_file_location("alta_capacidad_cli", os.path.join(AQUI, "alta-capacidad.py"))
cli = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(cli)

TAREAS = [
    {"id": "A1", "titulo": "Animación de la guía", "archivos": ["a", "b", "c"]},
    {"id": "A2", "titulo": "Contrato delicado", "archivos": ["x"], "dificultad": "alta"},
    {"id": "A3", "titulo": "Mecánica simple", "archivos": ["z"]},
    {"id": "A4", "titulo": "Ya hecha", "alta_capacidad": True, "archivos": ["z"]},
    {"id": "A5", "titulo": "Atascada", "archivos": ["z"], "capacidad": "máxima"},
    {"id": "A6", "titulo": "En la nube", "alta_capacidad": True, "archivos": ["z"]},
    {"id": "A7", "titulo": "Falló dos veces", "archivos": ["z"]},
]
PROGRESO = {"A4": {"estado": "commit"}, "A5": {"estado": "bloqueada"},
            "A6": {"estado": "reasignada", "medio": "claude-nube"},
            "A7": {"estado": "fallo", "intentos_auto": 2}}


class AltaCapacidadCLI(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        raiz = self.temporal.name
        self.olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        self.progreso = os.path.join(self.olas, "progreso.json")
        with open(os.path.join(self.olas, "cola-1021-prueba.json"), "w", encoding="utf-8") as f:
            json.dump({"tareas": TAREAS}, f, ensure_ascii=False)
        self._escribir_progreso(PROGRESO)
        self.limites = os.path.join(raiz, "limites.json")
        self._escribir_limites(74, 20)
        self.archivo_anterior = cli.limites_claude.ARCHIVO
        self.revisor_anterior = (cli.revisor.RAIZ, cli.revisor.OLAS, cli.revisor.PROGRESO,
                                 cli.revisor.CORRECCIONES, cli.revisor.EVENTOS, cli.revisor.ESTADO)

    def tearDown(self):
        cli.limites_claude.ARCHIVO = self.archivo_anterior
        (cli.revisor.RAIZ, cli.revisor.OLAS, cli.revisor.PROGRESO,
         cli.revisor.CORRECCIONES, cli.revisor.EVENTOS, cli.revisor.ESTADO) = self.revisor_anterior
        self.temporal.cleanup()

    def _escribir_progreso(self, datos):
        with open(self.progreso, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)

    def _escribir_limites(self, semana, sesion, minutos=0):
        ahora = datetime.now(timezone.utc)
        lectura = {"t": (ahora - timedelta(minutes=minutos)).isoformat(),
                   "sesion_pct": sesion, "sesion_reinicio": (ahora + timedelta(hours=4)).isoformat(),
                   "semana_pct": semana, "semana_reinicio": (ahora + timedelta(days=3)).isoformat(),
                   "modelo_nombre": None, "modelo_pct": None, "modelo_reinicio": None,
                   "fuente": "prueba"}
        with open(self.limites, "w", encoding="utf-8") as f:
            json.dump({"lecturas": [lectura]}, f)

    def _ejecutar(self, *extra, json_out=True):
        argv = ["--olas", self.olas, "--progreso", self.progreso, "--limites", self.limites]
        argv += list(extra)
        if json_out:
            argv.append("--json")
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = cli.main(argv)
        self.assertEqual(codigo, 0)
        return json.loads(salida.getvalue()) if json_out else salida.getvalue()

    def test_json_cupo_candidatas_y_elegidas(self):
        inf = self._ejecutar()
        self.assertEqual(inf["cupo"]["ok"], True)
        self.assertIn("semana 74", inf["cupo"]["motivo"])
        por_id = {c["id"]: c for c in inf["candidatas"]}
        self.assertEqual([c["id"] for c in inf["candidatas"]], ["A2", "A5", "A1", "A7"])
        self.assertEqual(por_id["A1"]["titulo"], "Animación de la guía")
        self.assertEqual(por_id["A5"]["estado"], "bloqueada")
        self.assertEqual(por_id["A7"]["intentos"], 2)
        self.assertEqual(inf["elegidas"], ["A2", "A5"])

    def test_en_marcha_recorta_y_llena_el_tope(self):
        self.assertEqual(self._ejecutar("--en-marcha", "1")["elegidas"], ["A2"])
        inf = self._ejecutar("--en-marcha", "2")
        self.assertFalse(inf["cupo"]["ok"])
        self.assertIn("2 agentes", inf["cupo"]["motivo"])
        self.assertEqual(inf["elegidas"], [])

    def test_umbrales_y_lectura_vieja_no_dan_cupo(self):
        self._escribir_limites(85, 20)
        self.assertIn("semana", self._ejecutar()["cupo"]["motivo"])
        self._escribir_limites(74, 75)
        self.assertIn("sesión", self._ejecutar()["cupo"]["motivo"])
        self._escribir_limites(74, 20, minutos=180)
        self.assertIn("vieja", self._ejecutar()["cupo"]["motivo"])
        os.remove(self.limites)
        self.assertIn("no hay lectura", self._ejecutar()["cupo"]["motivo"])

    def test_texto_y_solo_lectura(self):
        with open(self.progreso, encoding="utf-8") as f:
            antes = f.read()
        texto = self._ejecutar(json_out=False)
        self.assertIn("Cupo de Claude: sí", texto)
        self.assertIn("A1 · Animación de la guía · pendiente · 0 intento(s)", texto)
        self.assertIn("Elegidas ahora: A2, A5", texto)
        with open(self.progreso, encoding="utf-8") as f:
            self.assertEqual(f.read(), antes)

if __name__ == "__main__":
    unittest.main()
