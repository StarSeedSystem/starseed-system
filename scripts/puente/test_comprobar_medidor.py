# -*- coding: utf-8 -*-
"""Pruebas unitarias de comprobar_medidor.py."""

import unittest
import sys
import os

# Permitir importación relativa o directa
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from scripts.puente.comprobar_medidor import veredictos_de


class TestComprobarMedidor(unittest.TestCase):
    """Pruebas para la función pura veredictos_de."""

    def test_fallo(self) -> None:
        """Comprueba el comportamiento ante un error en hechos."""
        hechos = {"error": "Fallo simulado de lectura"}
        veredictos, resumen = veredictos_de("listas", None, hechos)
        self.assertEqual(len(veredictos), 1)
        self.assertEqual(veredictos[0]["estado"], "muerto")
        self.assertIn("fallida", resumen)

    def test_listas_y_bloqueadas(self) -> None:
        """Verifica orquestador y vigilante para listas y bloqueadas."""
        hechos_ok = {"orquestador_vivo": True, "vigilante_responde": True}
        vered, res = veredictos_de("listas", None, hechos_ok)
        self.assertEqual(len(vered), 2)
        self.assertTrue(all(v["estado"] == "vivo" for v in vered))
        self.assertIn("2/2", res)

        hechos_ko = {"orquestador_vivo": False, "vigilante_responde": False}
        vered_ko, _ = veredictos_de("bloqueadas", None, hechos_ko)
        self.assertTrue(all(v["estado"] == "muerto" for v in vered_ko))

    def test_agentes(self) -> None:
        """Verifica procesos opencode/codex activos."""
        hechos_vivos = {"agentes_vivos": [{"nombre": "opencode", "pid": "100"}]}
        vered, res = veredictos_de("agentes", None, hechos_vivos)
        self.assertEqual(len(vered), 1)
        self.assertEqual(vered[0]["estado"], "vivo")
        self.assertIn("1 agente", res)

        vered_vacio, _ = veredictos_de("agentes", None, {"agentes_vivos": []})
        self.assertEqual(vered_vacio[0]["estado"], "muerto")

    def test_disco(self) -> None:
        """Verifica espacio libre en disco."""
        vered_ok, _ = veredictos_de("disco", None, {"disco_libre_gb": 10.0})
        self.assertEqual(vered_ok[0]["estado"], "vivo")

        vered_ko, _ = veredictos_de("disco", None, {"disco_libre_gb": 2.0})
        self.assertEqual(vered_ko[0]["estado"], "muerto")

    def test_memoria(self) -> None:
        """Verifica memoria RAM y Swap libre."""
        hechos = {"memoria_libre_mb": 500, "swap_libre_mb": 1000}
        vered, res = veredictos_de("memoria", None, hechos)
        self.assertEqual(len(vered), 2)
        self.assertTrue(all(v["estado"] == "vivo" for v in vered))

    def test_proveedores(self) -> None:
        """Verifica el estado de los proveedores de IA."""
        hechos = {"proveedores": {"xkiro": {"estado": "ok", "detalle": "OK"}}}
        vered, res = veredictos_de("proveedores", None, hechos)
        self.assertEqual(len(vered), 1)
        self.assertEqual(vered[0]["estado"], "vivo")

    def test_sin_publicar(self) -> None:
        """Verifica recuento de commits por publicar."""
        vered, _ = veredictos_de("sin-publicar", None, {"commits_sin_publicar": 3})
        self.assertEqual(vered[0]["estado"], "vivo")
        self.assertIn("3 commits", vered[0]["detalle"])


if __name__ == "__main__":
    unittest.main()
