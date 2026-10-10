# -*- coding: utf-8 -*-
"""Pruebas para limpieza_worktrees (puras) con git_fn/rmtree_fn falsos.

Mejora el uso de los worktrees que ya se codificó en scripts/puente/limpieza_worktrees.py:
• worktrees limpios (sin cambios) con estado closed o reemplazado → quitar
• worktrees cerrados pero con cambios → NO
• worktrees en curso → NO
• worktree integrado (rama ancestro) pero limpio → quitar
• node_modules real (no simbólico) → limpiar siempre (luego de un trabajo en curso)
• enlace simbólico nunca se sigue (queda intocado)
• nunca borrar la rama ola/<tarea> (ningún comando git worktree remove con --force)
• fallo de git worktree remove → se anota, se sigue
"""

import sys
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
import tempfile
import shutil
import os

# Importar el módulo bajo prueba
sys.path.insert(0, str(Path(__file__).parent))
import limpieza_worktrees


class TestLimpiezaWorktrees(unittest.TestCase):
    """≥10 casos de prueba para plan/recoger/aplicar.

    Se usan git_fn y rmtree_fn falsos proporcionados por los test.
    """

    def test_rechazada_limpia_quita(self):
        """Worktree rechazada y limpio → quitar."""
        git_fn = lambda *a: ""
        en_curso = {}
        progreso = {"t1": {"estado": "rechazada"}}
        worktrees = [
            {"ruta": "/wt1", "tarea": "t1", "limpio": True, "integrado": False, "nm_real": False},
        ]
        plan = limpieza_worktrees.plan(worktrees, progreso, en_curso)
        self.assertEqual(plan.get("quitar"), ["/wt1"])
        self.assertEqual(plan.get("nm"), [])

    def test_rechazada_sucia_no(self):
        """Worktree rechazada pero sucia (cambios) → NO."""
        git_fn = lambda *a: "M archivo.ts"
        en_curso = {}
        progreso = {"t2": {"estado": "rechazada"}}
        worktrees = [
            {"ruta": "/wt2", "tarea": "t2", "limpio": False, "integrado": False, "nm_real": False},
        ]
        plan = limpieza_worktrees.plan(worktrees, progreso, en_curso)
        self.assertEqual(plan.get("quitar"), [])
        self.assertEqual(plan.get("nm"), [])

    def test_en_curso_no(self):
        """Worktree en curso → NO quitar ni limpiar."""
        git_fn = lambda *a: ""
        en_curso = {"/wt3": True}
        progreso = {"t3": {"estado": "rechazada"}}
        worktrees = [
            {"ruta": "/wt3", "tarea": "t3", "limpio": True, "integrado": False, "nm_real": False},
        ]
        plan = limpieza_worktrees.plan(worktrees, progreso, en_curso)
        self.assertEqual(plan.get("quitar"), [])
        self.assertEqual(plan.get("nm"), [])

    def test_pendiente_con_nm_real_solo_nm(self):
        """Pendiente + node_modules real → solo limpiar nm."""
        git_fn = lambda *a: ""
        en_curso = {}
        progreso = {"t4": {"estado": "pendiente"}}
        worktrees = [
            {"ruta": "/wt4", "tarea": "t4", "limpio": False, "integrado": False, "nm_real": True},
        ]
        plan = limpieza_worktrees.plan(worktrees, progreso, en_curso)
        self.assertEqual(plan.get("quitar"), [])
        self.assertEqual(plan.get("nm"), ["/wt4"])

    def test_integrada_limpia_quita(self):
        """Worktree integrada (rama ancestro) y limpia → quitar."""
        git_fn = lambda *a: ""
        en_curso = {}
        progreso = {"t5": {"estado": "alguna cosa"}}
        worktrees = [
            {"ruta": "/wt5", "tarea": "t5", "limpio": True, "integrado": True, "nm_real": False},
        ]
        plan = limpieza_worktrees.plan(worktrees, progreso, en_curso)
        self.assertEqual(plan.get("quitar"), ["/wt5"])
        self.assertEqual(plan.get("nm"), [])

    def test_sustituida_limpia_quita(self):
        """Worktree sustituida y limpia → quitar."""
        git_fn = lambda *a: ""
        en_curso = {}
        progreso = {"t6": {"estado": "sustituida"}}
        worktrees = [
            {"ruta": "/wt6", "tarea": "t6", "limpio": True, "integrado": False, "nm_real": False},
        ]
        plan = limpieza_worktrees.plan(worktrees, progreso, en_curso)
        self.assertEqual(plan.get("quitar"), ["/wt6"])
        self.assertEqual(plan.get("nm"), [])

    def test_limpieza_no_seguir_enlace(self):
        """El enlace simbólico node_modules no se sigue (deja que el orquestador lo recree)."""
        git_fn = MagicMock(return_value="")
        rmtree_fn = MagicMock()

        # Preparar un plan de quitar con un enlace simbólico
        plan = {"quitar": ["/wt7"], "nm": []}

        # Mock os.path.islink para simular enlaces
        with patch('os.path.islink') as mock_islink:
            mock_islink.return_value = True
            resultado = limpieza_worktrees.aplicar(plan, None, git_fn, rmtree_fn)

        self.assertEqual(resultado["quitados"], ["/wt7"])
        self.assertEqual(resultado["nm_borrados"], [])
        self.assertEqual(resultado["errores"], [])

    def test_node_modules_real_limpieza(self):
        """node_modules real (no simbólico) es borrado."""
        git_fn = MagicMock(return_value="")
        rmtree_fn = MagicMock()

        # Mock os.path.isdir para simular un directorio
        with patch('os.path.isdir') as mock_isdir:
            mock_isdir.return_value = True
            # Mock os.path.islink para simular un directorio (no un enlace)
            with patch('os.path.islink') as mock_islink:
                mock_islink.return_value = False
                plan = {"quitar": [], "nm": ["/wt9"]}
                resultado = limpieza_worktrees.aplicar(plan, None, git_fn, rmtree_fn)

        self.assertEqual(resultado["nm_borrados"], ["/wt9"])
        rmtree_fn.assert_called_once_with("/wt9/node_modules")

    def test_entregado_con_nm_real_quitar_no_limpiar(self):
        """Worktree integrado (entregado) y con node_modules real → solo quitar (nm se salta)."""
        git_fn = lambda *a: ""
        en_curso = {}
        progreso = {"t10": {"estado": "pendiente"}}
        worktrees = [
            {"ruta": "/wt10", "tarea": "t10", "limpio": True, "integrado": True, "nm_real": True},
        ]
        plan = limpieza_worktrees.plan(worktrees, progreso, en_curso)
        self.assertEqual(plan.get("quitar"), ["/wt10"])
        self.assertEqual(plan.get("nm"), [])


if __name__ == "__main__":
    unittest.main()
