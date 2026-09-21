#!/usr/bin/env python3
"""Pruebas de los veredictos del comprobador del Mando."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


RUTA_MODULO = Path(__file__).with_name("comprobar_medidor.py")
ESPECIFICACION = importlib.util.spec_from_file_location("comprobar_medidor", RUTA_MODULO)
assert ESPECIFICACION is not None and ESPECIFICACION.loader is not None
comprobar_medidor = importlib.util.module_from_spec(ESPECIFICACION)
ESPECIFICACION.loader.exec_module(comprobar_medidor)


class VeredictosDeTest(unittest.TestCase):
    """Verifica decisiones puras, incluidas mediciones ausentes."""

    def test_memoria_usa_los_valores_recibidos(self) -> None:
        veredictos, resumen = comprobar_medidor.veredictos_de(
            "memoria", {"memoria_libre_mb": 800.0, "swap_libre_mb": 0.0}
        )

        self.assertEqual([item["estado"] for item in veredictos], ["vivo", "vivo"])
        self.assertEqual(resumen["vivos"], 2)

    def test_disco_detecta_espacio_agotado(self) -> None:
        veredictos, resumen = comprobar_medidor.veredictos_de(
            "disco", {"disco_libre_gb": 0.0}
        )

        self.assertEqual(veredictos[0]["estado"], "muerto")
        self.assertEqual(resumen["muertos"], 1)

    def test_procesos_exige_la_ruta_del_guion(self) -> None:
        ruta = "scripts/puente/director-nube.py"
        veredictos, _ = comprobar_medidor.veredictos_de(
            "procesos", {"procesos": {ruta: [4312], "otro.py": []}}
        )

        self.assertEqual(veredictos[0]["estado"], "vivo")
        self.assertEqual(veredictos[1]["estado"], "muerto")

    def test_proveedores_lee_hechos_medidos(self) -> None:
        veredictos, resumen = comprobar_medidor.veredictos_de(
            "proveedores", {"proveedores_activos": 3, "pasarelas_ok": True}
        )

        self.assertEqual([item["estado"] for item in veredictos], ["vivo", "vivo"])
        self.assertEqual(resumen["total"], 2)

    def test_sin_publicar_detecta_pendientes(self) -> None:
        veredictos, _ = comprobar_medidor.veredictos_de(
            "sin-publicar", {"sin_publicar": 2}
        )

        self.assertEqual(veredictos[0]["estado"], "muerto")
        self.assertIn("2", str(veredictos[0]["motivo"]))

    def test_none_siempre_es_desconocido(self) -> None:
        veredictos, resumen = comprobar_medidor.veredictos_de(
            "proveedores", {"proveedores_activos": None, "pasarelas_ok": None}
        )

        self.assertTrue(
            all(item["estado"] == "desconocido" for item in veredictos)
        )
        self.assertEqual(resumen["desconocidos"], 2)
        self.assertEqual(resumen["vivos"], 0)

    def test_terminado_se_rellena_con_hechos_vacios(self) -> None:
        comprobacion = comprobar_medidor.crear_comprobacion("disco", {})

        self.assertIsInstance(comprobacion["terminado"], str)
        self.assertTrue(comprobacion["terminado"])
        self.assertEqual(
            comprobacion["veredictos"][0]["estado"], "desconocido"
        )


if __name__ == "__main__":
    unittest.main()
