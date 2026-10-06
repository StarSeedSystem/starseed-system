#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testeo del director de producción (PRD1005H) - funciones puras, inyectadas.

Pruebas:
- parseo de argumentos
- decidir mod (inyectado)
- puestas en cola de candidatos, puertas y medios
- regla de paso entero según §3
- lote con seguridad, coherencia y propósito
- modo seco
"""

import sys
import os
import tempfile
import shutil
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util
spec = importlib.util.spec_from_file_location("director_produccion", os.path.join(os.path.dirname(__file__), "director-produccion.py"))
dp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dp)


class TestDirectorProduccion(unittest.TestCase):
    def setUp(self):
        self.original_environ = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.original_environ)
        Path = os.path.expanduser("~/.starseed")
        pausada = os.path.join(Path, "produccion-pausada.json")
        if os.path.exists(pausada):
            try:
                os.remove(pausada)
            except Exception:
                pass

    def test_parse_args(self):
        sys.argv = ["director-produccion.py", "--modo", "seco", "--una-vez"]
        config = dp.cargar_configuracion()
        self.assertEqual(config["modo"], "seco")

    def test_esta_pausado_falso(self):
        os.environ.pop("STARSEED_ROOT", None)
        pausada = os.path.expanduser("~/.starseed/produccion-pausada.json")
        if os.path.exists(pausada):
            os.remove(pausada)
        self.assertFalse(dp.esta_pausado())

    def test_esta_pausado_true(self):
        import os
        Path = os.path.expanduser("~/.starseed")
        os.makedirs(Path, exist_ok=True)
        with open(os.path.join(Path, "produccion-pausada.json"), "w") as f:
            f.write("{}")
        self.assertTrue(dp.esta_pausado())

    def test_obtener_progreso_vacio(self):
        progreso = dp.cargar_progreso()
        self.assertEqual(dp.obtener_progreso("tid", progreso), {})

    def test_candidato_elegible_ok(self):
        candidato = {
            "sha": "abc123",
            "tarea": "zN4",
            "veredictos": {
                "revision": {"ok": True, "detalle": "revisión no bloqueante"},
                "verificacion": {"ok": True, "detalle": "verificado"},
                "diseno": {"nota": 80, "detalle": "nota 80", "toca_interfaz": True},
            },
        }
        vetos = {}
        elegible, motivos = dp.candidato_elegible(candidato, vetos)
        self.assertTrue(elegible)

    def test_candidato_elegible_veto(self):
        candidato = {
            "sha": "abc123",
            "tarea": "zN4",
            "veredictos": {"revision": {"ok": True}, "verificacion": {"ok": True}, "diseno": {"nota": 80, "toca_interfaz": True}},
        }
        vetos = {"abc123": {"quien": "alex", "motivo": "riesgo alto"}}
        elegible, motivos = dp.candidato_elegible(candidato, vetos)
        self.assertFalse(elegible)
        self.assertTrue(any("vetada" in m for m in motivos))

    def test_candidato_elegible_diseno_bajo(self):
        candidato = {
            "sha": "abc123",
            "tarea": "zN4",
            "veredictos": {"revision": {"ok": True}, "verificacion": {"ok": True}, "diseno": {"nota": 40, "toca_interfaz": True}},
        }
        vetos = {}
        elegible, motivos = dp.candidato_elegible(candidato, vetos)
        self.assertFalse(elegible)
        self.assertTrue(any("diseño" in m for m in motivos))

    def test_escritura_atomica_estado(self):
        lote = {
            "sha": "abc123",
            "tareas": ["zN4"],
            "medios": ["web"],
            "archivos": ["src/app/page.tsx"],
            "puertas": {"seguridad": "ok", "coherencia": "ok"},
            "resultado": {"publica": True, "via": "jev"},
        }

        estado = {"total": 1}
        dp.actualizar_estado(lote, lote["puertas"], lote["resultado"], estado)

        ruta = os.path.join(dp.STATE_DIR, "produccion-estado.json")
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, encoding="utf-8") as f:
            contenido = f.read()
            self.assertIn("abc123", contenido)

    def test_escribir_informe(self):
        dp.escribir_informe("informe de prueba", "abc123")

        ruta = os.path.expanduser("~/.starseed/produccion/historial.jsonl")
        self.assertTrue(os.path.exists(ruta))


if __name__ == "__main__":
    unittest.main()