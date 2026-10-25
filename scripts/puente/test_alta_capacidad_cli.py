# -*- coding: utf-8 -*-
"""Pruebas del CLI alta-capacidad.py (ALT1021Cd): candidatas y cupo por la salida --json.

Colas, progreso y lectura de límites FALSOS en una carpeta temporal, inyectados por
argumentos, y los globals que el CLI toca se restauran (mismo modo que los demás tests
del puente). unittest, sin red, y SOLO lectura del CLI: nada del fixture es lanzado
por él ni él escribe disco."""
import importlib.util
import io
import json
import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

_espec = importlib.util.spec_from_file_location(
    "alta_capacidad_cli", os.path.join(AQUI, "alta-capacidad.py"))
cli = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(cli)

asignar_huecos = sys.modules["asignar_huecos"]
limites_claude = sys.modules["limites_claude"]


class Entorno(unittest.TestCase):
    """Carpeta temporal con la cola de prueba, el progreso y los límites: rutas a args."""

    def _pon(self, destino, nombre, valor):
        viejo = getattr(destino, nombre)
        setattr(destino, nombre, valor)
        self.addCleanup(setattr, destino, nombre, viejo)

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, str(self.tmp), True)
        self.olas = self.tmp / "starseed_memory_root" / "olas"
        self.olas.mkdir(parents=True)
        self.limites = self.tmp / "limites-claude.json"
        # El CLI apunta el cargador de colas y el archivo de límites: hay que restaurarlo.
        self._pon(asignar_huecos, "OLAS", str(self.olas))
        self._pon(limites_claude, "ARCHIVO", str(self.limites))

    def _pon_cola(self, nombre, tareas):
        (self.olas / nombre).write_text(
            json.dumps({"tareas": tareas}, ensure_ascii=False), encoding="utf-8")

    def _pon_progreso(self, entradas):
        (self.olas / "progreso.json").write_text(
            json.dumps(entradas, ensure_ascii=False), encoding="utf-8")

    def _pon_limites(self, semana, sesion, horas=0):
        lectura = {
            "t": (datetime.now(timezone.utc).replace(microsecond=0)
                  - timedelta(hours=horas)).isoformat(),
            "semana_pct": semana,
            "sesion_pct": sesion,
        }
        self.limites.write_text(
            json.dumps({"lecturas": [lectura]}), encoding="utf-8")

    def _json(self, en_marcha=0):
        argv = [
            "--json", "--olas", str(self.olas),
            "--progreso", str(self.olas / "progreso.json"),
            "--limites", str(self.limites), "--en-marcha", str(en_marcha),
        ]
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = cli.principal(argv)
        self.assertEqual(codigo, 0)
        return json.loads(salida.getvalue())


class Cupo(Entorno):
    def test_sin_candidatas_hay_cupo(self):
        self._pon_limites(31, 12)
        datos = self._json()
        self.assertTrue(datos["cupo"]["ok"])
        self.assertIn("semana", datos["cupo"]["motivo"])
        self.assertIn("sesión", datos["cupo"]["motivo"])
        self.assertEqual(datos["candidatas"], [])
        self.assertEqual(datos["elegidas"], [])

    def test_sin_lectura_no_hay_cupo(self):
        datos = self._json()
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("lectura vieja", datos["cupo"]["motivo"])
        self.assertEqual(datos["elegidas"], [])

    def test_lectura_de_7_horas_es_vieja(self):
        self._pon_limites(5, 5, horas=7)
        datos = self._json()
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("lectura vieja", datos["cupo"]["motivo"])

    def test_sesion_en_el_tope_sin_cupo(self):
        self._pon_limites(10, 70)
        datos = self._json()
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("tope superado", datos["cupo"]["motivo"])

    def test_semana_en_el_tope_sin_cupo(self):
        self._pon_limites(80, 10)
        datos = self._json()
        self.assertFalse(datos["cupo"]["ok"])
        self.assertIn("tope superado", datos["cupo"]["motivo"])


class Candidatas(Entorno):
    def _tres_alta(self):
        self._pon_limites(5, 5)
        self._pon_cola("cola-1021-prueba.json", [
            {"id": "T1", "titulo": "Uno", "capacidad": "alta", "archivos": ["a.py"]},
            {"id": "T2", "titulo": "Dos", "dificultad": "alta", "archivos": ["a.py", "b.py", "c.py"]},
            {"id": "T3", "titulo": "Tres", "capacidad": "alta"},
        ])
        # T3 la está escribiendo otra cola del enjambre: de entrada se cierra.
        self._pon_progreso({"T3": {"estado": "en_curso"}})

    def test_capacidad_alta_es_candidata(self):
        self._tres_alta()
        datos = self._json()
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["T1", "T2"])
        fila = datos["candidatas"][0]
        self.assertEqual(fila["titulo"], "Uno")
        self.assertEqual(fila["estado"], "pendiente")
        self.assertEqual(fila["intentos"], 0)
        self.assertEqual(fila["cola"], "cola-1021-prueba.json")
        self.assertIn("capacidad alta", fila["motivo"])

    def test_integrada_no_vuelve(self):
        self._tres_alta()
        self._pon_progreso({"T1": {"estado": "integrada"},
                            "T2": {"estado": "en_curso"},
                            "T3": {"estado": "integrada"}})
        datos = self._json()
        self.assertEqual(datos["candidatas"], [])

    def test_con_3_archivos_y_fallado_va_al_motivo(self):
        self._tres_alta()
        self._pon_progreso({"T2": {"estado": "fallo_tsc", "intentos_auto": 2},
                            "T3": {"estado": "en_curso"}})
        datos = self._json()
        motivo = [c for c in datos["candidatas"] if c["id"] == "T2"][0]["motivo"]
        self.assertIn("3 archivos", motivo)
        self.assertIn("ya falló con otros modelos", motivo)
        # La elección ordena por intentos: la que ya falló dos veces va antes.
        self.assertEqual(datos["elegidas"], ["T2", "T1"])

    def test_bloqueante_con_marca_alta_es_candidata(self):
        self._pon_limites(5, 5)
        self._pon_cola("cola-1021-prueba.json", [{"id": "T7", "titulo": "Siete"}])
        self._pon_progreso({"T7": {"estado": "bloqueante", "alta_capacidad": True}})
        datos = self._json()
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["T7"])

    def test_dependencia_abierta_no_se_elegida(self):
        self._pon_limites(5, 5)
        self._pon_cola("cola-1021-prueba.json", [
            {"id": "T8", "titulo": "Ocho", "capacidad": "alta", "depende": ["T9"]},
        ])
        datos = self._json()
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["T8"])
        self.assertEqual(datos["elegidas"], [])


class Elegidas(Entorno):
    def _cuatro_alta(self):
        self._pon_limites(5, 5)
        self._pon_cola("cola-1021-prueba.json", [
            {"id": "A1", "titulo": "Alfa", "capacidad": "alta", "archivos": ["a.py"]},
            {"id": "A2", "titulo": "Beta", "capacidad": "alta", "adelantar": "hoy",
             "archivos": ["a.py"]},
            {"id": "A3", "titulo": "Gamma", "capacidad": "alta", "importancia": "capacidad",
             "archivos": ["a.py"]},
            {"id": "A4", "titulo": "Delta", "capacidad": "alta", "archivos": ["a.py"]},
        ])

    def test_el_orden_es_adelantar_importancia_intentos_id(self):
        self._cuatro_alta()
        self._pon_progreso({"A2": {"estado": "fallo_tests", "intentos_auto": 4}})
        datos = self._json()
        self.assertTrue(datos["cupo"]["ok"])
        self.assertEqual(datos["elegidas"], ["A2", "A3"])

    def test_en_marcha_2_no_deja_huecos(self):
        self._cuatro_alta()
        datos = self._json(en_marcha=2)
        self.assertTrue(datos["cupo"]["ok"])
        self.assertEqual(datos["elegidas"], [])

    def test_en_marcha_1_deja_un_hueco(self):
        self._cuatro_alta()
        datos = self._json(en_marcha=1)
        self.assertEqual(len(datos["elegidas"]), 1)


class CargadorYTexto(Entorno):
    """El cargador es el del puente (asignar_huecos._colas_fuente): filtra igual."""

    def test_las_colas_auto_y_de_suenios_no_alimentan_el_carril(self):
        self._pon_limites(5, 5)
        alta = {"id": "B1", "titulo": "Alta", "capacidad": "alta", "archivos": ["a.py"]}
        self._pon_cola("cola-auto-1001-x.json", [alta])
        self._pon_cola("cola-suenos-42-x.json", [dict(alta, id="B2")])
        datos = self._json()
        self.assertEqual(datos["candidatas"], [])

    def test_el_id_repetido_solo_cuenta_una_vez(self):
        self._pon_limites(5, 5)
        alta = {"id": "C1", "titulo": "Echo", "capacidad": "alta", "archivos": ["a.py"]}
        self._pon_cola("cola-una.json", [alta])
        self._pon_cola("cola-dos.json", [dict(alta)])
        datos = self._json()
        self.assertEqual([c["id"] for c in datos["candidatas"]], ["C1"])

    def test_el_texto_pinta_cupo_y_elegidas(self):
        self._pon_limites(5, 5)
        self._pon_cola("cola-1021-prueba.json", [
            {"id": "D1", "titulo": "Difícil", "capacidad": "alta", "archivos": ["a.py"]},
        ])
        salida = io.StringIO()
        with redirect_stdout(salida):
            codigo = cli.principal([
                "--olas", str(self.olas),
                "--progreso", str(self.olas / "progreso.json"),
                "--limites", str(self.limites),
            ])
        texto = salida.getvalue()
        self.assertEqual(codigo, 0)
        self.assertIn("Cupo de Claude: sí", texto)
        self.assertIn("D1 · Difícil · pendiente · 0 intento(s)", texto)
        self.assertIn("Elegidas ahora (0 en marcha): D1", texto)
        self.assertNotIn("Ninguna candidata", texto)

    def test_sin_candidatas_el_texto_lo_dice(self):
        self._pon_limites(5, 5)
        salida = io.StringIO()
        with redirect_stdout(salida):
            cli.principal([
                "--olas", str(self.olas),
                "--progreso", str(self.olas / "progreso.json"),
                "--limites", str(self.limites),
            ])
        self.assertIn("Ninguna candidata necesita el carril ahora", salida.getvalue())

    def test_solo_lee_no_toca_progreso_ni_colas(self):
        self._pon_limites(5, 5)
        self._pon_cola("cola-1021-prueba.json", [
            {"id": "E1", "titulo": "Eco", "capacidad": "alta", "archivos": ["a.py"]},
        ])
        self._pon_progreso({"E1": {"estado": "fallo", "intentos_auto": 1}})
        antes = sorted((p.name, p.read_bytes()) for p in self.olas.iterdir())
        datos = self._json()
        despues = sorted((p.name, p.read_bytes()) for p in self.olas.iterdir())
        self.assertEqual(datos["elegidas"], ["E1"])
        self.assertEqual(antes, despues)


if __name__ == "__main__":
    unittest.main()
