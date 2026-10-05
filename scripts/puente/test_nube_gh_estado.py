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
