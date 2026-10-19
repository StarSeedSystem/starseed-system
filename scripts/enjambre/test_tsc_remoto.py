# -*- coding: utf-8 -*-
"""Tests for the tsc function with A1 remote checking (TRA1012B)."""
import contextlib
import importlib.util
import os
import sys
import unittest
from unittest import mock

# Import the starseed-enjambre module
RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("starseed_enjambre", RUTA)
starseed_enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["starseed_enjambre"] = starseed_enjambre
ESPEC.loader.exec_module(starseed_enjambre)


class TscRemotoTest(unittest.TestCase):
    def test_tsc_uses_local_when_not_on_mac(self):
        """Test that when not on Mac, the local tsc path is used."""
        # Mock environment to not be on Mac
        with mock.patch.dict('os.environ', {'STARSEED_MEDIO': 'linux'}):
            # Mock file existence check (doesn't matter for this test)
            with mock.patch('os.path.isfile', return_value=True):
                # Mock local tsc to return success on first attempt
                with mock.patch.object(starseed_enjambre, 'ENV_TSC', {}):
                    with mock.patch.object(starseed_enjambre, 'SEM_PESADO'):
                        with mock.patch.object(starseed_enjambre, 'cerrojo'):
                            with mock.patch.object(starseed_enjambre, 'sh') as mock_sh:
                                mock_sh.return_value = (0, "")
                                with mock.patch.object(starseed_enjambre, 'tsc_sin_terminar', return_value=None):
                                    with mock.patch.object(starseed_enjambre, 'evento'):
                                        # Call tsc function
                                        rc, errs = starseed_enjambre.tsc("/fake/worktree", "/fake/log")
                                        
                                        # Verify that local tsc was called (at least once)
                                        self.assertGreaterEqual(mock_sh.call_count, 1)
                                        
                                        # Verify the result
                                        self.assertEqual(rc, 0)
                                        self.assertEqual(errs, [])

    def test_tsc_uses_local_when_comparar_does_not_exist(self):
        """Test that when comprobar_en_a1.py doesn't exist, local tsc is used."""
        # Mock environment to be on Mac
        with mock.patch.dict('os.environ', {'STARSEED_MEDIO': 'mac'}):
            # Mock file existence to return False
            with mock.patch('os.path.isfile', return_value=False):
                # Mock local tsc to return success on first attempt
                with mock.patch.object(starseed_enjambre, 'ENV_TSC', {}):
                    with mock.patch.object(starseed_enjambre, 'SEM_PESADO'):
                        with mock.patch.object(starseed_enjambre, 'cerrojo'):
                            with mock.patch.object(starseed_enjambre, 'sh') as mock_sh:
                                mock_sh.return_value = (0, "")
                                with mock.patch.object(starseed_enjambre, 'tsc_sin_terminar', return_value=None):
                                    with mock.patch.object(starseed_enjambre, 'evento'):
                                        # Call tsc function
                                        rc, errs = starseed_enjambre.tsc("/fake/worktree", "/fake/log")
                                        
                                        # Verify that local tsc was called (at least once)
                                        self.assertGreaterEqual(mock_sh.call_count, 1)
                                        
                                        # Verify the result
                                        self.assertEqual(rc, 0)
                                        self.assertEqual(errs, [])

    def test_tsc_handles_a1_errors_gracefully(self):
        """Test that when A1 check fails, it falls back to local tsc."""
        # Mock environment to be on Mac and file to exist
        with mock.patch.dict('os.environ', {'STARSEED_MEDIO': 'mac'}):
            with mock.patch('os.path.isfile', return_value=True):
                # Mock sh function for git commands
                with mock.patch.object(starseed_enjambre, 'sh') as mock_sh:
                    mock_sh.side_effect = [
                        (0, "main_sha"),  # git rev-parse main
                        (0, "sha1\nsha2\n"),  # git rev-list main..HEAD
                        (0, "file1.ts\nfile2.ts\n"),  # git diff --name-only main...HEAD
                    ]
                    
                    # Mock local tsc to return success on first attempt
                    with mock.patch.object(starseed_enjambre, 'ENV_TSC', {}):
                        with mock.patch.object(starseed_enjambre, 'SEM_PESADO'):
                            with mock.patch.object(starseed_enjambre, 'cerrojo'):
                                with mock.patch.object(starseed_enjambre, 'sh') as mock_local_sh:
                                    mock_local_sh.return_value = (0, "")
                                    with mock.patch.object(starseed_enjambre, 'tsc_sin_terminar', return_value=None):
                                        with mock.patch.object(starseed_enjambre, 'evento'):
                                            # Call tsc function - this should not crash even if A1 fails
                                            try:
                                                rc, errs = starseed_enjambre.tsc("/fake/worktree", "/fake/log")
                                                # If we get here without exception, the fallback worked
                                                self.assertGreaterEqual(mock_local_sh.call_count, 1)
                                                self.assertEqual(rc, 0)
                                                self.assertEqual(errs, [])
                                            except Exception as e:
                                                self.fail(f"tsc function raised unexpected exception: {e}")


if __name__ == '__main__':
    unittest.main()