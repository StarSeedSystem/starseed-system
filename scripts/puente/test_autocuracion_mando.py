import unittest
from unittest.mock import Mock, patch
import sys
import os

# Add the scripts/puente directory to the path to import the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
import autocuracion_mando

class TestAutocuracionMando(unittest.TestCase):
    def setUp(self):
        # Mocks for the revisar function
        self.estado = {
            "raiz_wt": "/fake/path",
            "repo": "fake_repo",
            "git_fn": Mock(),
            "rmtree_fn": Mock(),
            "progreso": {},
            "en_curso": []
        }
        self.avisar_fn = Mock()
        self.hechos = []

    def test_no_limpieza_cuando_hay_suficiente_disco_y_reciente(self):
        # libre >= 2 * DISCO_AVISO_GB (default 2) -> 4 GB or more
        # and time since last cleanup < 24h
        with patch('time.time', return_value=1000.0):
            self.estado["ultima_limpieza_wt"] = 900.0  # 100 seconds ago
            autocuracion_mando.revisar([], 4.0, self.estado, self.avisar_fn, self.hechos)
            self.estado["git_fn"].assert_not_called()
            self.avisar_fn.assert_not_called()

    def test_limpieza_cuando_disco_bajo(self):
        # libre < 2 * DISCO_AVISO_GB (e.g., 1.9 GB < 4 GB)
        with patch('time.time', return_value=1000.0):
            self.estado["ultima_limpieza_wt"] = 900.0  # recent, but disk low triggers
            # Mock limpieza_worktrees.recoger, plan, aplicar
            with patch.dict('sys.modules', {'limpieza_worktrees': Mock()}) as mock_modules:
                mock_limp = mock_modules['limpieza_worktrees']
                mock_limp.recoger.return_value = []
                mock_limp.plan.return_value = {"quitar": [], "nm": []}
                mock_limp.aplicar.return_value = {"quitados": [], "nm_borrados": [], "errores": []}
                autocuracion_mando.revisar([], 1.9, self.estado, self.avisar_fn, self.hechos)
                # Should have called the limpieza_worktrees functions
                mock_limp.recoger.assert_called_once()
                mock_limp.plan.assert_called_once()
                mock_limp.aplicar.assert_called_once()
                # No avisar because nothing to clean
                self.avisar_fn.assert_not_called()

    def test_limpieza_cuando_pasa_24h(self):
        # libre is high, but time since last cleanup > 24h
        with patch('time.time', return_value=1000.0):
            self.estado["ultima_limpieza_wt"] = 1000.0 - 86401  # more than 24h ago
            with patch.dict('sys.modules', {'limpieza_worktrees': Mock()}) as mock_modules:
                mock_limp = mock_modules['limpieza_worktrees']
                mock_limp.recoger.return_value = []
                mock_limp.plan.return_value = {"quitar": [], "nm": []}
                mock_limp.aplicar.return_value = {"quitados": [], "nm_borrados": [], "errores": []}
                autocuracion_mando.revisar([], 5.0, self.estado, self.avisar_fn, self.hechos)
                mock_limp.recoger.assert_called_once()
                mock_limp.plan.assert_called_once()
                mock_limp.aplicar.assert_called_once()
                self.avisar_fn.assert_not_called()

    def test_avisar_cuando_se_limpiaban_worktrees_o_node_modules(self):
        with patch('time.time', return_value=1000.0):
            self.estado["ultima_limpieza_wt"] = 900.0
            with patch.dict('sys.modules', {'limpieza_worktrees': Mock()}) as mock_modules:
                mock_limp = mock_modules['limpieza_worktrees']
                mock_limp.recoger.return_value = []
                mock_limp.plan.return_value = {"quitar": ["wt1"], "nm": ["wt2/node_modules"]}
                mock_limp.aplicar.return_value = {
                    "quitados": ["wt1"],
                    "nm_borrados": ["wt2/node_modules"],
                    "errores": []
                }
                autocuracion_mando.revisar([], 1.9, self.estado, self.avisar_fn, self.hechos)
                self.avisar_fn.assert_called_once_with(
                    "Autocuración: quité 1 worktrees cerrados y 1 node_modules duplicados."
                )

    def test_guardar_ultima_limpieza_wt_exitoso(self):
        with patch('time.time', return_value=2000.0):
            self.estado["ultima_limpieza_wt"] = 1000.0
            with patch.dict('sys.modules', {'limpieza_worktrees': Mock()}) as mock_modules:
                mock_limp = mock_modules['limpieza_worktrees']
                mock_limp.recoger.return_value = []
                mock_limp.plan.return_value = {"quitar": [], "nm": []}
                mock_limp.aplicar.return_value = {"quitados": [], "nm_borrados": [], "errores": []}
                autocuracion_mando.revisar([], 1.9, self.estado, self.avisar_fn, self.hechos)
                self.assertEqual(self.estado["ultima_limpieza_wt"], 2000.0)

    def test_manejar_excepcion_en_limpieza(self):
        with patch('time.time', return_value=1000.0):
            self.estado["ultima_limpieza_wt"] = 900.0
            with patch.dict('sys.modules', {'limpieza_worktrees': Mock()}) as mock_modules:
                mock_limp = mock_modules['limpieza_worktrees']
                mock_limp.recoger.side_effect = Exception("test error")
                autocuracion_mando.revisar([], 1.9, self.estado, self.avisar_fn, self.hechos)
                self.avisar_fn.assert_not_called()
                self.assertEqual(len(self.hechos), 1)
                self.assertIn("test error", self.hechos[0])

if __name__ == '__main__':
    unittest.main()