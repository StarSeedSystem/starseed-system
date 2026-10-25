# -*- coding: utf-8 -*-
"""Pruebas del CLI `alta-capacidad.py` (ALT1021Cd · parte 1) — unittest, sin red.

Monta un directorio temporal de colas y progreso falsos y lanza el CLI por sus
argumentos (`--olas`, `--progreso`, `--limites`), igual que inyectan rutas los demás
scripts del puente. Comprueba la salida `--json` ({cupo, candidatas, elegidas}) y el
listado de texto.
"""
import importlib.util
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone

# El nombre del CLI lleva guion (no es importable como módulo): se carga por ruta,
# el mismo patrón que `revisor_bloqueadas.py` usa con sus dependencias.
_AQUI = os.path.dirname(os.path.abspath(__file__))
_RUTA_CLI = os.path.join(os.path.dirname(_AQUI), "puente", "alta-capacidad.py")

_especificacion = importlib.util.spec_from_file_location("alta_capacidad_cli", _RUTA_CLI)
CLI = importlib.util.module_from_spec(_especificacion)
sys.modules["alta_capacidad_cli"] = CLI
_especificacion.loader.exec_module(CLI)

AHORA = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
LECTURA = {
    "t": AHORA.isoformat(),
    "semana_pct": 42,
    "sesion_pct": 10,
    "semana_reinicio": "2026-10-27T00:00:00+00:00",
    "sesion_reinicio": "2026-10-25T13:00:00+00:00",
}


class EntornoFalso(unittest.TestCase):
    """Un olas de prueba con colas, progreso y límites falsos, limpio en cada test."""

    def setUp(self):
        self.temporal = tempfile.mkdtemp(prefix="alta-capacidad-cli-")
        self.anadir_punto_de_entrada()
        self.olas = os.path.join(self.temporal, "olas")
        self.progreso = os.path.join(self.olas, "progreso.json")
        self.limites = os.path.join(self.temporal, "limites-claude.json")
        os.makedirs(self.olas)
        self._antiguo_olas = CLI.asignar_huecos.OLAS
        self._antiguo_archivo = CLI.limites_claude.ARCHIVO

    def tearDown(self):
        shutil.rmtree(self.temporal, ignore_errors=True)
        CLI.asignar_huecos.OLAS = self._antiguo_olas
        CLI.limites_claude.ARCHIVO = self._antiguo_archivo

    # ── ayudantes ────────────────────────────────────────────────────────────
    def anadir_punto_de_entrada(self):
        if os.path.dirname(_AQUI) not in sys.path:
            sys.path.insert(0, os.path.dirname(_AQUI))

    def escribir_cola(self, nombre, tareas):
        ruta = os.path.join(self.olas, nombre)
        with open(ruta, "w", encoding="utf-8") as archivo:
            json.dump(tareas, archivo, ensure_ascii=False)
        return ruta

    def escribir_progreso(self, entradas):
        with open(self.progreso, "w", encoding="utf-8") as archivo:
            json.dump(entradas, archivo, ensure_ascii=False)
        return self.progreso

    def escribir_limites(self, lecturas):
        with open(self.limites, "w", encoding="utf-8") as archivo:
            json.dump({"lecturas": lecturas}, archivo, ensure_ascii=False)
        return self.limites

    def ejecutar(self, argv):
        captura = io.StringIO()
        with redirect_stdout(captura):
            codigo = CLI.principal(list(argv))
        return codigo, captura.getvalue()

    def montar_caso(self, con_cupo=True):
        """El escenario completo: una candidata clara, una adelantada por Alex, una con
        dependencia abierta, una ya cerrada y una normal."""
        self.escribir_cola("cola-alta-capacidad-1021.json", [
            {"id": "a1", "titulo": "Difícil A", "capacidad": "alta"},
            {"id": "a2", "titulo": "Escalada agotada B"},
            {"id": "a3", "titulo": "Pedida por Alex", "capacidad": "alta", "adelantar": "sí"},
            {"id": "a4", "titulo": "Espera a la C", "capacidad": "alta", "depende": "a5"},
            {"id": "a5", "titulo": "La C ya está", "capacidad": "alta"},
            {"id": "a6", "titulo": "En curso D", "capacidad": "alta"},
            {"id": "b1", "titulo": "Normal"},
        ])
        self.escribir_progreso({
            "a2": {"estado": "bloqueante", "alta_capacidad": True, "intentos_auto": 3},
            "a4": {"estado": "bloqueada"},
            "a5": {"estado": "commit", "sha": "abc"},
            "a6": {"estado": "en_curso"},
            "b1": {"estado": "pendiente", "intentos_auto": 5},
        })
        self.escribir_limites([LECTURA] if con_cupo else [])


class TestJson(EntornoFalso):
    """La salida `--json`: {cupo:{ok,motivo}, candidatas:[…], elegidas:[…]}. """

    def _json(self, argv_extra=()):
        codigo, salida = self.ejecutar(["--json", "--olas", self.olas,
                                        "--progreso", self.progreso,
                                        "--limites", self.limites, *argv_extra])
        self.assertEqual(codigo, 0)
        return json.loads(salida)

    def test_candidatas_y_elegidas(self):
        self.montar_caso()
        datos = self._json()
        self.assertEqual(datos["cupo"]["ok"], True)
        self.assertIn("semana", datos["cupo"]["motivo"])
        # Las candidatas conservan el orden de la cola; la ELECCIÓN es la que ordena.
        self.assertEqual([f["id"] for f in datos["candidatas"]], ["a1", "a2", "a3", "a4"])
        self.assertEqual(datos["elegidas"], ["a3", "a2"])

    def test_fila_de_candidata(self):
        self.montar_caso()
        datos = self._json()
        a2 = next(f for f in datos["candidatas"] if f["id"] == "a2")
        self.assertEqual(a2["estado"], "bloqueante")
        self.assertEqual(a2["intentos"], 3)
        self.assertEqual(a2["cola"], "cola-alta-capacidad-1021.json")
        self.assertIn("marcada por la escalera", a2["motivo"])
        self.assertIn("ya falló con otros modelos", a2["motivo"])
        self.assertEqual(a2["titulo"], "Escalada agotada B")

    def test_cerrada_y_en_curso_no_son_candidatas(self):
        self.montar_caso()
        datos = self._json()
        ids = {f["id"] for f in datos["candidatas"]}
        self.assertNotIn("a5", ids)  # estado commit
        self.assertNotIn("a6", ids)  # en_curso
        self.assertNotIn("b1", ids)  # normal, sin marca

    def test_dependencia_abierta_no_se_elige(self):
        self.montar_caso()
        datos = self._json()
        self.assertIn("a4", [f["id"] for f in datos["candidatas"]])
        self.assertNotIn("a4", datos["elegidas"])

    def test_sin_cupo_no_elige_nada(self):
        self.montar_caso(con_cupo=False)
        datos = self._json()
        self.assertEqual(datos["cupo"]["ok"], False)
        self.assertEqual(datos["elegidas"], [])
        self.assertEqual(len(datos["candidatas"]), 4)

    def test_en_marcha_descuenta_del_cupo(self):
        self.montar_caso()
        datos = self._json(["--en-marcha", "2"])
        self.assertEqual(datos["elegidas"], [])
        datos = self._json(["--en-marcha", "1"])
        self.assertEqual(datos["elegidas"], ["a3"])

    def test_sin_rutas_falsas_no_tumba(self):
        """Sin progreso ni límites que existan: cupo no y cero candidatas, sin excepción."""
        datos = self._json()
        self.assertEqual(datos["cupo"]["ok"], False)
        self.assertEqual(datos["candidatas"], [])


class TestListado(EntornoFalso):
    """El listado de texto que lee la dirección."""

    def test_lineas_del_listado(self):
        self.montar_caso()
        codigo, salida = self.ejecutar(["--olas", self.olas, "--progreso", self.progreso,
                                        "--limites", self.limites])
        self.assertEqual(codigo, 0)
        lineas = salida.splitlines()
        self.assertTrue(lineas[0].startswith("Cupo de Claude: sí · "))
        fila = next(linea for linea in lineas if linea.strip().startswith("a2 "))
        self.assertIn("Escalada agotada B", fila)
        self.assertIn("bloqueante", fila)
        self.assertIn("3 intento(s)", fila)
        elegidas = [linea for linea in lineas if linea.startswith("Elegidas ahora")]
        self.assertEqual(len(elegidas), 1)
        self.assertIn("a3", elegidas[0])

    def test_sin_candidatas_lo_dice(self):
        self.escribir_cola("cola-alta-capacidad-1021.json", [{"id": "b1", "titulo": "Normal"}])
        self.escribir_progreso({})
        self.escribir_limites([LECTURA])
        codigo, salida = self.ejecutar(["--olas", self.olas, "--progreso", self.progreso,
                                        "--limites", self.limites])
        self.assertEqual(codigo, 0)
        self.assertIn("Cupo de Claude: sí", salida)
        self.assertIn("Ninguna candidata", salida)
        self.assertIn("ninguna", salida.splitlines()[-1])


if __name__ == "__main__":
    unittest.main()
