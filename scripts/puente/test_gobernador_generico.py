"""Tests for governor_generico.py — PURE FUNCTIONS."""
import os
import unittest
import sys

# Try to import the real module
try:
    from gobernador_generico import (
        de_bateria_linux, de_pmset
    )
    HAS_GOBERNADOR_GENERICO = True
except ImportError:
    HAS_GOBERNADOR_GENERICO = False
    de_bateria_linux = None
    de_pmset = None


class TestDeBateriaLinux(unittest.TestCase):
    """Tests for de_bateria_linux function."""
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_bateria_cargando(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 76",
            "/sys/class/power_supply/BAT0/status: Charging"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.76)
        self.assertTrue(resultado["cargando"])
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_bateria_descargando(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 45",
            "/sys/class/power_supply/BAT0/status: Discharging"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.45)
        self.assertFalse(resultado["cargando"])
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_bateria_completa(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 100",
            "/sys/class/power_supply/BAT0/status: Full"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 1.0)
        self.assertTrue(resultado["cargando"])  # Full se considera cargando
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_bateria_solo_capacity(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 30"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.3)
        self.assertNotIn("cargando", resultado)
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_bateria_solo_status(self):
        lineas = [
            "/sys/class/power_supply/BAT0/status: Charging"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertNotIn("nivel", resultado)
        self.assertTrue(resultado["cargando"])
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_bateria_vacia(self):
        lineas = []
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado, {})
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_bateria_valores_invalidos(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: no_es_un_numero",
            "/sys/class/power_supply/BAT0/status: EstadoDesconocido"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado, {})


class TestDePmset(unittest.TestCase):
    """Tests for de_pmset function."""
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_pmset_cargando(self):
        texto = """Now drawing from 'Battery Power'
 -InternalBattery-     73%; charging; 0:00 remaining"""
        resultado = de_pmset(texto)
        self.assertEqual(resultado["nivel"], 0.73)
        self.assertTrue(resultado["cargando"])
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_pmset_descargando(self):
        texto = """Now drawing from 'Battery Power'
 -InternalBattery-     45%; discharging; 1:30 remaining"""
        resultado = de_pmset(texto)
        self.assertEqual(resultado["nivel"], 0.45)
        self.assertFalse(resultado["cargando"])
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_pmset_cargado(self):
        texto = """Now drawing from 'AC Power'
 -InternalBattery-     100%; charged; 0:00 remaining"""
        resultado = de_pmset(texto)
        self.assertEqual(resultado["nivel"], 1.0)
        self.assertTrue(resultado["cargando"])  # charged se considera cargando
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_pmset_sin_porcentaje(self):
        texto = """Now drawing from 'Battery Power'
 -InternalBattery-     ; charging; 0:00 remaining"""
        resultado = de_pmset(texto)
        self.assertNotIn("nivel", resultado)
        self.assertTrue(resultado["cargando"])
    
    @unittest.skipIf(not HAS_GOBERNADOR_GENERICO, "gobernador_generico module not found")
    def test_pmset_vacio(self):
        texto = ""
        resultado = de_pmset(texto)
        self.assertEqual(resultado, {})


if __name__ == "__main__":
    # If the module doesn't exist, we want to report this as a real failure
    if not HAS_GOBERNADOR_GENERICO:
        print("REAL FAILURE: gobernador_generico module not found in main")
        print("This means the Linux and macOS battery parsing functionality is not available")
        sys.exit(1)
    else:
        unittest.main()