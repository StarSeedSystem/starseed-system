#!/usr/bin/env python3
"""Pruebas de `nube-gh.preparar_estado_para_nube` (2026-10-04, NUB1004A).

Sin red ni archivos reales: HOME y destino son rutas temporales inyectadas.
"""
from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nube-gh.py")
_spec = importlib.util.spec_from_file_location("nube_gh", _RUTA)
nube_gh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nube_gh)


class PrepararEstadoParaNube(unittest.TestCase):
    def _home_con(self, archivos):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        st = os.path.join(tmp.name, ".starseed")
        os.makedirs(st)
        for nombre, datos in archivos.items():
            with open(os.path.join(st, nombre), "w", encoding="utf-8") as f:
                json.dump(datos, f)
        destino = os.path.join(tmp.name, "estado")
        return tmp.name, destino

    def test_copia_los_tres_sin_campos_de_clave(self):
        home, destino = self._home_con(
            {
                "rotacion-optimizada.json": {"delante": ["kimi-k3"], "caduca": "x"},
                "pasarelas-informe.json": {
                    "pasarelas": [
                        {"nombre": "groq", "api_key": "NO-DEBE-VIAJAR", "modelos": ["a"]}
                    ]
                },
                "salud-proveedores.json": {"nvidia": {"estado": "ok"}},
            }
        )
        copiados = nube_gh.preparar_estado_para_nube(home, destino)
        self.assertEqual(sorted(copiados), sorted(nube_gh.ESTADO_PARA_NUBE))
        with open(os.path.join(destino, "pasarelas-informe.json"), encoding="utf-8") as f:
            informe = json.load(f)
        self.assertEqual(informe["pasarelas"], [{"nombre": "groq", "modelos": ["a"]}])
        with open(os.path.join(destino, "pasarelas-informe.json"), encoding="utf-8") as f:
            crudo = f.read()
        self.assertNotIn("NO-DEBE-VIAJAR", crudo)

    def test_sin_archivos_no_falla(self):
        with tempfile.TemporaryDirectory() as tmp:
            destino = os.path.join(tmp, "estado")
            self.assertEqual(nube_gh.preparar_estado_para_nube(tmp, destino), [])
            self.assertFalse(os.path.exists(destino))

    def test_quita_campos_secretos_anidados(self):
        home, destino = self._home_con(
            {
                "salud-proveedores.json": {
                    "groq": {"estado": "ok", "TOKEN_refresh": "x", "Mi_CLAVE": "y"}
                }
            }
        )
        copiados = nube_gh.preparar_estado_para_nube(home, destino)
        self.assertEqual(copiados, ["salud-proveedores.json"])
        with open(os.path.join(destino, "salud-proveedores.json"), encoding="utf-8") as f:
            datos = json.load(f)
        self.assertEqual(datos, {"groq": {"estado": "ok"}})


if __name__ == "__main__":
    unittest.main()


class ColaCreada(unittest.TestCase):
    """(2026-10-13) El run 38344120572 subió `estado-cola-…-2` en vez de la cola."""

    def test_manda_lo_que_dice_el_reparto(self):
        salida = "[reparto] algo\n[reparto] cola: enjambre/colas/cola-nube-20261012-2156-2.json\n"
        nuevas = {"cola-nube-20261012-2156-2.json", "estado-cola-nube-20261012-2156-2"}
        self.assertEqual(nube_gh.cola_creada(salida, nuevas), "enjambre/colas/cola-nube-20261012-2156-2.json")

    def test_sin_la_linea_solo_cuentan_las_colas(self):
        nuevas = {"cola-nube-20261012-2156-2.json", "estado-cola-nube-20261012-2156-2"}
        self.assertEqual(nube_gh.cola_creada("", nuevas), "enjambre/colas/cola-nube-20261012-2156-2.json")
        self.assertIsNone(nube_gh.cola_creada("", {"estado-cola-nube-x"}))
        self.assertIsNone(nube_gh.cola_creada("[reparto] cola: ../../etc/passwd", set()))

    def test_no_mas_trabajadores_que_tareas(self):
        self.assertEqual(nube_gh.trabajadores_para("4", 1), "1")
        self.assertEqual(nube_gh.trabajadores_para("4", 9), "4")
        self.assertEqual(nube_gh.trabajadores_para("3", 0), "3")
        self.assertEqual(nube_gh.trabajadores_para("x", 2), "x")

    def test_si_el_reparto_no_creo_nada_no_se_toma_la_cola_de_otro(self):
        """(2026-10-13) El director tomó la cola que «Buscar más capacidad» creó ese minuto."""
        salida = "[reparto] Reparto a la nube 20261013: 0 tareas (ninguna) (simulación)\n"
        self.assertIsNone(nube_gh.cola_creada(salida, {"cola-nube-20261013-1544.json"}))
