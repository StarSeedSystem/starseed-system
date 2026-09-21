#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas unitarias para comprobar_medidor.py (MND1c)."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

# Cargar el módulo comprobar_medidor.py dinámicamente
RUTA_MODULO = Path(__file__).with_name("comprobar_medidor.py")
ESPEC = importlib.util.spec_from_file_location("comprobar_medidor", RUTA_MODULO)
assert ESPEC is not None and ESPEC.loader is not None
comprobar_medidor = importlib.util.module_from_spec(ESPEC)
ESPEC.loader.exec_module(comprobar_medidor)


class TestComprobarMedidor(unittest.TestCase):
    """Pruebas puras para veredictos_de y crear_comprobacion."""

    def test_listas_detecta_orquestador_y_vigilante(self) -> None:
        """Verifica la evaluación del medidor listas/bloqueadas."""
        procesos = [
            {"cmd": "python3 scripts/enjambre/starseed-enjambre.py", "args": ["python3", "starseed-enjambre.py"]},
            {"cmd": "python3 scripts/puente/vigilante-enjambre.py", "args": ["python3", "vigilante-enjambre.py"]},
        ]
        veredictos, resumen = comprobar_medidor.veredictos_de("listas", procesos, {})
        self.assertEqual(len(veredictos), 2)
        self.assertEqual(veredictos[0]["estado"], "vivo")
        self.assertEqual(veredictos[1]["estado"], "vivo")
        self.assertIn("todos vivos", resumen)

    def test_agentes_detecta_opencode_y_codex(self) -> None:
        """Verifica que agentes evalúa los procesos de opencode y codex."""
        procesos = [
            {"cmd": "opencode run --model test", "args": ["opencode", "run"]},
            {"cmd": "codex-cli run", "args": ["codex-cli", "run"]},
        ]
        veredictos, resumen = comprobar_medidor.veredictos_de("agentes", procesos, {})
        self.assertEqual(len(veredictos), 2)
        self.assertEqual(veredictos[0]["estado"], "vivo")
        self.assertEqual(veredictos[1]["estado"], "vivo")

    def test_disco_evalua_espacio_libre(self) -> None:
        """Verifica los veredictos de espacio en disco."""
        v_ok, _ = comprobar_medidor.veredictos_de("disco", [], {"disco_libre_gb": 15.2})
        self.assertEqual(v_ok[0]["estado"], "vivo")

        v_bajo, _ = comprobar_medidor.veredictos_de("disco", [], {"disco_libre_gb": 0.5})
        self.assertEqual(v_bajo[0]["estado"], "muerto")

        v_des, _ = comprobar_medidor.veredictos_de("disco", [], {"disco_libre_gb": None})
        self.assertEqual(v_des[0]["estado"], "desconocido")

    def test_memoria_real_sin_datos_fabricados(self) -> None:
        """Verifica que si no se puede medir la memoria, devuelve desconocido sin fabricar datos."""
        v_ok, _ = comprobar_medidor.veredictos_de("memoria", [], {"memoria_libre_mb": 400.0, "swap_libre_mb": 100.0})
        self.assertEqual(v_ok[0]["estado"], "vivo")
        self.assertEqual(v_ok[1]["estado"], "vivo")

        v_fallo, _ = comprobar_medidor.veredictos_de("memoria", [], {"memoria_libre_mb": None, "swap_libre_mb": None})
        self.assertEqual(v_fallo[0]["estado"], "desconocido")
        self.assertEqual(v_fallo[1]["estado"], "desconocido")

    def test_proveedores_evalua_hechos_reales(self) -> None:
        """Verifica el informe real de proveedores y pasarelas sin constantes inventadas."""
        v_ok, _ = comprobar_medidor.veredictos_de("proveedores", [], {"proveedores_activos": 3, "pasarelas_ok": True})
        self.assertEqual(v_ok[0]["estado"], "vivo")
        self.assertEqual(v_ok[1]["estado"], "vivo")

        v_fallo, _ = comprobar_medidor.veredictos_de("proveedores", [], {"proveedores_activos": None, "pasarelas_ok": None})
        self.assertEqual(v_fallo[0]["estado"], "desconocido")
        self.assertEqual(v_fallo[1]["estado"], "desconocido")

    def test_sin_publicar_evalua_commits(self) -> None:
        """Verifica commits sin publicar."""
        v_limpio, _ = comprobar_medidor.veredictos_de("sin-publicar", [], {"sin_publicar": 0})
        self.assertEqual(v_limpio[0]["estado"], "vivo")

        v_pend, _ = comprobar_medidor.veredictos_de("sin-publicar", [], {"sin_publicar": 2})
        self.assertEqual(v_pend[0]["estado"], "muerto")

    def test_crear_comprobacion_rellena_terminado_siempre(self) -> None:
        """Verifica que terminado siempre es un string ISO no nulo."""
        comp = comprobar_medidor.crear_comprobacion("memoria", [], {})
        self.assertIsNotNone(comp["terminado"])
        self.assertIsInstance(comp["terminado"], str)
        self.assertEqual(comp["veredictos"][0]["estado"], "desconocido")

    def test_evita_falsos_positivos_editores_y_grep(self) -> None:
        """Verifica que vim codex.md o grep vigilante no se confundan con procesos vivos."""
        procesos_falsos = [
            {"cmd": "vim codex.md", "args": ["vim", "codex.md"]},
            {"cmd": "grep -i vigilante log.txt", "args": ["grep", "-i", "vigilante", "log.txt"]},
        ]
        v_ag, _ = comprobar_medidor.veredictos_de("agentes", procesos_falsos, {})
        self.assertEqual(v_ag[1]["estado"], "muerto")  # codex es muerto

        v_lis, _ = comprobar_medidor.veredictos_de("listas", procesos_falsos, {})
        self.assertEqual(v_lis[1]["estado"], "muerto")  # vigilante es muerto


if __name__ == "__main__":
    unittest.main()
