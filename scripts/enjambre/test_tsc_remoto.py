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


    def test_tsc_returns_success_when_a1_green(self):
        """Test that when A1 returns green, tsc returns success without calling local tsc."""
        # Mock environment to be on Mac and file to exist
        with mock.patch.dict('os.environ', {'STARSEED_MEDIO': 'mac'}):
            with mock.patch('os.path.isfile', return_value=True):  # comprobar_en_a1.py exists
                # Mock os.path.exists to return True for tsconfig.json (so not a Python repo)
                def mock_exists(path):
                    if path == os.path.join("/fake/worktree", "tsconfig.json"):
                        return True
                    return os.path.exists(path)
                with mock.patch('os.path.exists', side_effect=mock_exists):
                    # Mock sh function for all calls
                    with mock.patch.object(starseed_enjambre, 'sh') as mock_sh:
                        # Configure side_effect for git commands in A1 block
                        mock_sh.side_effect = [
                            (0, "main_sha"),  # git rev-parse main
                            (0, "sha1\nsha2\n"),  # git rev-list main..HEAD
                            (0, "file1.ts\nfile2.ts\n"),  # git diff --name-only main...HEAD
                        ]
                        
                        # Mock the comprobar_en_a1 module
                        mock_comprobar_module = mock.MagicMock()
                        mock_comprobar_module.comprobar.return_value = (True, "en el A1: tsc: éxito", False)
                        with mock.patch.dict('sys.modules', {'comprobar_en_a1': mock_comprobar_module}):
                            # Mock local tsc environment and other dependencies
                            with mock.patch.object(starseed_enjambre, 'ENV_TSC', {}):
                                with mock.patch.object(starseed_enjambre, 'SEM_PESADO'):
                                    with mock.patch.object(starseed_enjambre, 'cerrojo'):
                                        with mock.patch.object(starseed_enjambre, 'tsc_sin_terminar', return_value=None):
                                            with mock.patch.object(starseed_enjambre, 'evento'):
                                                # Call tsc function
                                                rc, errs = starseed_enjambre.tsc("/fake/worktree", "/fake/log")
                                                
                                                # Verify that the tsc command was NOT called (i.e., no call to sh with "npx tsc")
                                                tsc_called = any(
                                                    call.args[0] == "npx tsc --noEmit --skipLibCheck"
                                                    for call in mock_sh.call_args_list
                                                )
                                                self.assertFalse(tsc_called, "Local tsc should not be called when A1 returns green")
                                                    
                                                # Verify the result
                                                self.assertEqual(rc, 0)
                                                self.assertEqual(errs, [])

    def test_tsc_returns_failure_when_a1_red(self):
        """Test that when A1 returns red, tsc returns failure with errors without calling local tsc."""
        # Mock environment to be on Mac and file to exist
        with mock.patch.dict('os.environ', {'STARSEED_MEDIO': 'mac'}):
            with mock.patch('os.path.isfile', return_value=True):  # comprobar_en_a1.py exists
                # Mock os.path.exists to return True for tsconfig.json (so not a Python repo)
                def mock_exists(path):
                    if path == os.path.join("/fake/worktree", "tsconfig.json"):
                        return True
                    return os.path.exists(path)
                with mock.patch('os.path.exists', side_effect=mock_exists):
                    # Mock sh function for all calls
                    with mock.patch.object(starseed_enjambre, 'sh') as mock_sh:
                        # Configure side_effect for git commands in A1 block
                        mock_sh.side_effect = [
                            (0, "main_sha"),  # git rev-parse main
                            (0, "sha1\nsha2\n"),  # git rev-list main..HEAD
                            (0, "file1.ts\nfile2.ts\n"),  # git diff --name-only main...HEAD
                        ]
                        
                        # Mock the comprobar_en_a1 module
                        a1_output = "error TS2304: Cannot find name 'x'.\nerror TS2322: Type 'number' is not assignable to type 'string'.\n"
                        mock_comprobar_module = mock.MagicMock()
                        mock_comprobar_module.comprobar.return_value = (False, "en el A1: tsc: " + a1_output.strip(), False)
                        with mock.patch.dict('sys.modules', {'comprobar_en_a1': mock_comprobar_module}):
                            # Mock local tsc environment and other dependencies
                            with mock.patch.object(starseed_enjambre, 'ENV_TSC', {}):
                                with mock.patch.object(starseed_enjambre, 'SEM_PESADO'):
                                    with mock.patch.object(starseed_enjambre, 'cerrojo'):
                                        with mock.patch.object(starseed_enjambre, 'tsc_sin_terminar', return_value=None):
                                            with mock.patch.object(starseed_enjambre, 'evento'):
                                                # Call tsc function
                                                rc, errs = starseed_enjambre.tsc("/fake/worktree", "/fake/log")
                                                print(f"DEBUG TEST: rc={rc}, errs={errs}")
                                                print(f"DEBUG TEST: repr(errs) = {repr(errs)}")
                                                
                                                # Verify that the tsc command was NOT called (i.e., no call to sh with "npx tsc")
                                                tsc_called = any(
                                                    call.args[0] == "npx tsc --noEmit --skipLibCheck"
                                                    for call in mock_sh.call_args_list
                                                )
                                                self.assertFalse(tsc_called, "Local tsc should not be called when A1 returns red")
                                                    
                                                # Verify the result
                                                self.assertEqual(rc, 1)
                                                # Check that errors are extracted from the A1 output
                                                expected_errors = [
                                                    "error TS2304: Cannot find name 'x'.",
                                                    "error TS2322: Type 'number' is not assignable to type 'string'."
                                                ]
                                                print(f"DEBUG TEST: repr(expected_errors) = {repr(expected_errors)}")
                                                self.assertEqual(errs, expected_errors)

    def test_tsc_falls_back_to_local_when_a1_medium_failure(self):
        """Test that when A1 returns medium failure, tsc falls back to local tsc."""
        # Mock environment to be on Mac and file to exist
        with mock.patch.dict('os.environ', {'STARSEED_MEDIO': 'mac'}):
            with mock.patch('os.path.isfile', return_value=True):  # comprobar_en_a1.py exists
                # Mock os.path.exists to return True for tsconfig.json (so not a Python repo)
                def mock_exists(path):
                    if path == os.path.join("/fake/worktree", "tsconfig.json"):
                        return True
                    return os.path.exists(path)
                with mock.patch('os.path.exists', side_effect=mock_exists):
                    # Mock sh function for all calls
                    with mock.patch.object(starseed_enjambre, 'sh') as mock_sh:
                        # We'll create a side_effect function that returns specific values for the first three calls
                        # and (0, "") for any subsequent calls (for the local tsc)
                        call_count = 0
                        def mock_sh_side_effect(*args, **kwargs):
                            nonlocal call_count
                            if call_count < 3:
                                # Return the predefined values for git commands
                                values = [
                                    (0, "main_sha"),  # git rev-parse main
                                    (0, "sha1\nsha2\n"),  # git rev-list main..HEAD
                                    (0, "file1.ts\nfile2.ts\n"),  # git diff --name-only main...HEAD
                                ]
                                result = values[call_count]
                                call_count += 1
                                return result
                            else:
                                # For any further calls (like local tsc), return success
                                return (0, "")
                        mock_sh.side_effect = mock_sh_side_effect
                        
                        # Mock the comprobar_en_a1 module
                        mock_comprobar_module = mock.MagicMock()
                        mock_comprobar_module.comprobar.return_value = (False, "A1: timeout", True)
                        with mock.patch.dict('sys.modules', {'comprobar_en_a1': mock_comprobar_module}):
                            # Mock local tsc environment and other dependencies
                            with mock.patch.object(starseed_enjambre, 'ENV_TSC', {}):
                                with mock.patch.object(starseed_enjambre, 'SEM_PESADO'):
                                    with mock.patch.object(starseed_enjambre, 'cerrojo'):
                                        with mock.patch.object(starseed_enjambre, 'tsc_sin_terminar', return_value=None):
                                            with mock.patch.object(starseed_enjambre, 'evento'):
                                                # Call tsc function
                                                rc, errs = starseed_enjambre.tsc("/fake/worktree", "/fake/log")
                                                
                                                # Verify that the tsc command WAS called (at least once)
                                                tsc_called = any(
                                                    call.args[0] == "npx tsc --noEmit --skipLibCheck"
                                                    for call in mock_sh.call_args_list
                                                )
                                                self.assertTrue(tsc_called, "Local tsc should be called when A1 returns medium failure")
                                                    
                                                # Verify the result
                                                self.assertEqual(rc, 0)
                                                self.assertEqual(errs, [])

if __name__ == '__main__':
    unittest.main()