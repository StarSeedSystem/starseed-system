# -*- coding: utf-8 -*-
"""Tests básicos para autocuracion_mando.

Focuses en la integración con limpieza_worktrees, no en mocks complejos.
"""

import os
import sys
import tempfile
import shutil
from unittest.mock import MagicMock, patch
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import autocuracion_mando as ac


class TestAutocuracionBasico(unittest.TestCase):
    """Tests básicos para autocuracion_mando."""

    def test_libre_bajo_disponible(self):
        """Con forzar=True, limpieza se ejecuta."""
        libre_fn = MagicMock(return_value=5.0)

        avisos = []
        def avisar_fn(texto):
            avisos.append(texto)

        with patch.object(ac, '_limpiar_worktrees') as mock_limpiar:
            mock_limpiar.return_value = {"quitados": [], "nm_borrados": [], "errores": []}

            ahora = 1000
            estado = ac.revisar(ahora=ahora, libre_fn=libre_fn, forzar=True, avisar_fn=avisar_fn)

            mock_limpiar.assert_called()

    def test_libre_suficiente_no_dispone(self):
        """Con forzar=False y libre suficiente (> 12 GB), no se llama limpieza."""
        libre_fn = MagicMock(return_value=13.0)

        avisos = []
        def avisar_fn(texto):
            avisos.append(texto)

        with patch.object(ac, '_limpiar_worktrees') as mock_limpiar:
            mock_limpiar.return_value = {"quitados": [], "nm_borrados": [], "errores": []}

            ahora = 1000
            estado = ac.revisar(ahora=ahora, libre_fn=libre_fn, forzar=False, avisar_fn=avisar_fn)

            mock_limpiar.assert_not_called()

    def test_aviso_director_con_limpieza_exitosa(self):
        """Aviso del Director tras limpiar worktrees."""
        libre_fn = MagicMock(return_value=5.0)

        avisos = []
        def avisar_fn(texto):
            avisos.append(texto)

        with patch.object(ac, '_limpiar_worktrees') as mock_limpiar:
            mock_limpiar.return_value = {
                "quitados": ["/wt1"],
                "nm_borrados": ["/wt2"],
                "errores": []
            }

            ahora = 1000
            estado = ac.revisar(ahora=ahora, libre_fn=libre_fn, avisar_fn=avisar_fn)

            self.assertTrue(any("Autocuración: quité" in aviso for aviso in avisos), avisos)

    def test_cualquier_falla_en_limpieza_no_rompe_pasada(self):
        """Falla en limpieza guarda estado y sigue."""
        libre_fn = MagicMock(return_value=5.0)

        with patch.object(ac, '_limpiar_worktrees') as mock_limpiar:
            mock_limpiar.side_effect = Exception("Error limpiando worktrees")

            ahora = 1000
            estado = ac.revisar(ahora=ahora, libre_fn=libre_fn)

            hechos = estado.get("hechos", [])
            self.assertTrue(any("no pude limpiar worktrees" in h for h in hechos), hechos)


if __name__ == "__main__":
    unittest.main()
