#!/usr/bin/env python3
"""Pruebas unitarias para la función pura veredictos_de en comprobar_medidor.py."""

from __future__ import annotations

import unittest
# La descubre `python3 -m unittest discover -s scripts/puente`, que mete ese directorio
# en el path: importar por `scripts.puente...` hacía que el módulo no se encontrara y la
# prueba entera se saltaba con un ImportError. (2026-09-22)
from comprobar_medidor import veredictos_de


class TestComprobarMedidor(unittest.TestCase):
    """Casos de prueba para cada medidor y escenarios de fallo."""

    def test_listas_y_bloqueadas(self) -> None:
        """Prueba medidores listas y bloqueadas con procesos vivos y muertos."""
        procesos_vivos = {
            "orquestador": [1234],
            "vigilante": [5678],
        }
        veredictos, resumen = veredictos_de("listas", procesos_vivos, {})
        self.assertEqual(len(veredictos), 2)
        self.assertEqual(veredictos[0]["estado"], "vivo")
        self.assertEqual(veredictos[1]["estado"], "vivo")
        self.assertIn("todos vivos", resumen)

        procesos_muertos = {
            "orquestador": [],
            "vigilante": [],
        }
        veredictos_m, resumen_m = veredictos_de("bloqueadas", procesos_muertos, {})
        self.assertEqual(veredictos_m[0]["estado"], "muerto")
        self.assertEqual(veredictos_m[1]["estado"], "muerto")
        self.assertIn("todo muerto", resumen_m)

    def test_agentes(self) -> None:
        """Prueba agentes opencode y codex."""
        procesos = {"opencode": [101], "codex": [202]}
        veredictos, resumen = veredictos_de("agentes", procesos, {})
        self.assertEqual(len(veredictos), 2)
        self.assertEqual(veredictos[0]["estado"], "vivo")
        self.assertEqual(veredictos[1]["estado"], "vivo")
        self.assertIn("todos vivos", resumen)

    def test_disco(self) -> None:
        """Prueba medidor de disco con espacio suficiente, bajo y crítico."""
        ver_ok, _ = veredictos_de("disco", {}, {"disco_libre_gb": 10.0})
        self.assertEqual(ver_ok[0]["estado"], "vivo")

        ver_low, _ = veredictos_de("disco", {}, {"disco_libre_gb": 2.5})
        self.assertEqual(ver_low[0]["estado"], "colgado")

        ver_crit, _ = veredictos_de("disco", {}, {"disco_libre_gb": 0.5})
        self.assertEqual(ver_crit[0]["estado"], "muerto")

    def test_memoria(self) -> None:
        """Prueba RAM y Swap libre reales y swap agotado."""
        hechos_ok = {"memoria_libre_mb": 1200.0, "swap_libre_mb": 500.0}
        ver_ok, _ = veredictos_de("memoria", {}, hechos_ok)
        self.assertEqual(ver_ok[0]["estado"], "vivo")
        self.assertEqual(ver_ok[1]["estado"], "vivo")

        hechos_swap_0 = {"memoria_libre_mb": 800.0, "swap_libre_mb": 0.0}
        ver_swap, _ = veredictos_de("memoria", {}, hechos_swap_0)
        self.assertEqual(ver_swap[0]["estado"], "vivo")
        self.assertEqual(ver_swap[1]["estado"], "muerto")

    def test_proveedores(self) -> None:
        """Prueba proveedores activos y pasarelas."""
        hechos = {"proveedores_activos": 3, "pasarelas_ok": True}
        ver, resumen = veredictos_de("proveedores", {}, hechos)
        self.assertEqual(ver[0]["estado"], "vivo")
        self.assertEqual(ver[1]["estado"], "vivo")
        self.assertIn("todos vivos", resumen)

    def test_sin_publicar(self) -> None:
        """Prueba commits sin publicar (0 pendientes vs N pendientes)."""
        ver_0, _ = veredictos_de("sin-publicar", {}, {"sin_publicar": 0})
        self.assertEqual(ver_0[0]["estado"], "vivo")

        ver_3, _ = veredictos_de("sin-publicar", {}, {"sin_publicar": 3})
        self.assertEqual(ver_3[0]["estado"], "colgado")

    def test_fallo_y_datos_desconocidos(self) -> None:
        """Prueba hechos vacíos o None resultando en estado desconocido."""
        ver_none, resumen = veredictos_de(
            "memoria", {}, {"memoria_libre_mb": None, "swap_libre_mb": None}
        )
        self.assertEqual(ver_none[0]["estado"], "desconocido")
        self.assertEqual(ver_none[1]["estado"], "desconocido")

        ver_inv, _ = veredictos_de("medidor_inexistente", {}, {})
        self.assertEqual(ver_inv[0]["estado"], "desconocido")


if __name__ == "__main__":
    unittest.main()
