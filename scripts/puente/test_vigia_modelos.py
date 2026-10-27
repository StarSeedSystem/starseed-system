# -*- coding: utf-8 -*-
"""Rescate RTVGM1016N: casos de la rama adaptados a la API pura de main.

La rama traía `test_vigia_modelos.py` contra un `vigia_modelos.py` que main no
tiene: el vigía se dividió en `vigia_descubrir` y `vigia_evaluar`. Estos casos
prueban el mismo comportamiento con las funciones puras de hoy.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vigia_evaluar as V  # noqa: E402


class EvaluarRescatado(unittest.TestCase):
    """Casos de evaluación por medio y de mejora frente al modelo actual."""

    def test_es_mejora_no_sube_con_menos_pasos_y_mas_peso(self):
        """Un candidato con menos pasos y más peso no supera al mejor actual."""
        mejor = {"id": "viejo", "pasos": 20, "tamanio_gb": 10.0}
        peor = {"id": "nuevo", "pasos": 2, "tamanio_gb": 12.0,
                "origen": "familia", "licencia": "apache-2.0", "etiquetas": []}
        self.assertFalse(V.es_mejora(peor, mejor))

    def test_cabe_en_elige_el_mayor_que_cabe_por_medio(self):
        """El Turbo Q4_K_M (4,2 GB) cabe en la Mac y la A1; el navegador y la PWA piden ≤ 1 GB."""
        turbo = {"id": "unsloth/Qwen-Image-2.1-Turbo-GGUF", "tamanio_gb": 4.2,
                 "quantizacion": "Q4_K_M", "formato": "gguf"}
        self.assertTrue(V.cabe_en(turbo, {"tipo": "mac", "espacio_gb": 8})["quepa"], "≤ 4,5 GB en la Mac de 8")
        self.assertTrue(V.cabe_en(turbo, {"tipo": "a1", "espacio_gb": 8})["quepa"], "≤ 8 GB en la A1")
        self.assertFalse(V.cabe_en(turbo, {"tipo": "navegador", "espacio_gb": 8})["quepa"])
        self.assertFalse(V.cabe_en(turbo, {"tipo": "pwa", "espacio_gb": 8})["quepa"])
        ligero = {"id": "ligero", "tamanio_gb": 0.8, "quantizacion": "Q3_K_S", "formato": "gguf"}
        self.assertTrue(V.cabe_en(ligero, {"tipo": "navegador"})["quepa"], "≤ 1 GB en el navegador")
        self.assertTrue(V.cabe_en(ligero, {"tipo": "pwa"})["quepa"])


if __name__ == "__main__":
    unittest.main()
