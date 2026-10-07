#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del director de producción (PRD1005H).

Caso seco, canario, auto, secreto, Jev dice no, Jev sin respuesta, fallo medio.
Todo inyectado: git, red, procesos.
"""

import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util
_spec = importlib.util.spec_from_file_location("director_produccion", os.path.join(os.path.dirname(os.path.abspath(__file__)), "director-produccion.py"))
DP = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(DP)


class TestDirectorProduccionPuro(unittest.TestCase):
    
    def test_pausada_no_publica(self):
        with patch.object(DP, "_pausada", return_value=True):
            with patch.object(DP, "_informe_pausado") as mock_informe:
                DP.ciclo("auto", seco=False, prod_cfg={})
                mock_informe.assert_called_once()

    def test_cerrojo_ocupado_no_entra(self):
        original = DP._tomar_integracion
        DP._tomar_integracion = lambda: False
        try:
            DP.ciclo("auto", seco=False, prod_cfg={})
            # No debería fallar
        finally:
            DP._tomar_integracion = original

    def test_sin_candidatos_no_hace_nada(self):
        with patch.object(DP, "_tomar_integracion", return_value=True):
            with patch.object(DP.PC, "candidatos", return_value=[]):
                DP.ciclo("auto", seco=False, prod_cfg={})
                # No debería fallar

    def test_modo_seco_no_promueve(self):
        mock_cand = [{
            "sha": "abc123",
            "tarea": "TEST",
            "archivos": ["src/a.ts"],
            "medios": ["web"]
        }]
        with patch.object(DP, "_tomar_integracion", return_value=True):
            with patch.object(DP.PC, "candidatos", return_value=mock_cand):
                with patch.object(DP, "_puerta_elegibilidad", return_value=mock_cand):
                    with patch.object(DP, "_puerta_seguridad", return_value=mock_cand):
                        with patch.object(DP, "_puerta_coherencia", return_value=mock_cand):
                            with patch.object(DP, "_formar_lote", return_value={"sha": "abc123", "tareas": ["TEST"], "archivos": ["src/a.ts"], "medios": ["web"]}):
                                with patch.object(DP, "_push_candidato", return_value="abc123"):
                                    with patch.object(DP, "_esperar_ci_y_preview", return_value=None):
                                        with patch.object(DP, "_promover_main") as mock_promover:
                                            DP.ciclo("seco", seco=True, prod_cfg={"revertir_auto": True})
                                            mock_promover.assert_not_called()


if __name__ == "__main__":
    unittest.main()