"""Tests for governor_generico.py — PURE FUNCTIONS."""
import os
import unittest
from gobernador_generico import (
    de_meminfo, de_sysctl, de_bateria_linux, de_pmset, 
    herramientas, medir, _version_a_numero,
    _detectar_so, _es_wsl, _es_android,
    _obtener_ram_total_mb, _obtener_nucleos, _obtener_disco_libre_gb,
    _obtener_bateria, _obtener_bateria_linux, _obtener_bateria_macos,
    _obtener_red, _obtener_herramientas_con_versiones,
    _obtener_version_git, _obtener_version_node, _obtener_version_python, _obtener_version_opencode
)


class TestDeMeminfo(unittest.TestCase):
    """Tests for de_meminfo function."""
    
    def test_meminfo_valido(self):
        texto = """MemTotal:       8065216 kB
MemFree:        1234567 kB
MemAvailable:   4238912 kB
Buffers:          12345 kB
Cached:          234567 kB"""
        resultado = de_meminfo(texto)
        self.assertAlmostEqual(resultado["total_mb"], 7876.2, places=1)
        self.assertAlmostEqual(resultado["disponible_mb"], 4139.6, places=1)
    
    def test_meminfo_sin_memavailable(self):
        texto = """MemTotal:       4026928 kB
MemFree:        123456 kB"""
        resultado = de_meminfo(texto)
        self.assertAlmostEqual(resultado["total_mb"], 3932.5, places=1)
        self.assertIsNone(resultado["disponible_mb"])
    
    def test_meminfo_vacio(self):
        texto = ""
        resultado = de_meminfo(texto)
        self.assertIsNone(resultado["total_mb"])
        self.assertIsNone(resultado["disponible_mb"])
    
    def test_meminfo_formato_diferente(self):
        texto = """MemTotal:   1024000 kB
MemAvailable: 512000 kB"""
        resultado = de_meminfo(texto)
        self.assertAlmostEqual(resultado["total_mb"], 1000.0, places=1)
        self.assertAlmostEqual(resultado["disponible_mb"], 500.0, places=1)


class TestDeSysctl(unittest.TestCase):
    """Tests for de_sysctl function."""
    
    def test_sysctl_valido(self):
        texto = "hw.memsize: 17179869184"
        resultado = de_sysctl(texto)
        self.assertAlmostEqual(resultado, 16384.0, places=1)  # 16 GB en MB
    
    def test_sysctl_valor_pequeno(self):
        texto = "hw.memsize: 1073741824"
        resultado = de_sysctl(texto)
        self.assertAlmostEqual(resultado, 1024.0, places=1)  # 1 GB en MB
    
    def test_sysctl_sin_valor(self):
        texto = "hw.memsize: "
        resultado = de_sysctl(texto)
        self.assertIsNone(resultado)
    
    def test_sysctl_linea_vacia(self):
        texto = ""
        resultado = de_sysctl(texto)
        self.assertIsNone(resultado)
    
    def test_sysctl_otras_lineas(self):
        texto = """hw.ncpu: 8
hw.memsize: 34359738368
hw.cachelinesize: 64"""
        resultado = de_sysctl(texto)
        self.assertAlmostEqual(resultado, 32768.0, places=1)  # 32 GB en MB


class TestDeBateriaLinux(unittest.TestCase):
    """Tests for de_bateria_linux function."""
    
    def test_bateria_cargando(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 76",
            "/sys/class/power_supply/BAT0/status: Charging"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.76)
        self.assertTrue(resultado["cargando"])
    
    def test_bateria_descargando(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 45",
            "/sys/class/power_supply/BAT0/status: Discharging"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.45)
        self.assertFalse(resultado["cargando"])
    
    def test_bateria_completa(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 100",
            "/sys/class/power_supply/BAT0/status: Full"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 1.0)
        self.assertTrue(resultado["cargando"])  # Full se considera cargando
    
    def test_bateria_solo_capacity(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 30"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.3)
        self.assertNotIn("cargando", resultado)
    
    def test_bateria_solo_status(self):
        lineas = [
            "/sys/class/power_supply/BAT0/status: Charging"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertNotIn("nivel", resultado)
        self.assertTrue(resultado["cargando"])
    
    def test_bateria_vacia(self):
        lineas = []
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado, {})
    
    def test_bateria_valores_invalidos(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: no_es_un_numero",
            "/sys/class/power_supply/BAT0/status: EstadoDesconocido"
        ]
        resultado = de_bateria_linux(lineas)
        self.assertEqual(resultado, {})


class TestDePmset(unittest.TestCase):
    """Tests for de_pmset function."""
    
    def test_pmset_cargando(self):
        texto = """Now drawing from 'Battery Power'
 -InternalBattery-     73%; charging; 0:00 remaining"""
        resultado = de_pmset(texto)
        self.assertEqual(resultado["nivel"], 0.73)
        self.assertTrue(resultado["cargando"])
    
    def test_pmset_descargando(self):
        texto = """Now drawing from 'Battery Power'
 -InternalBattery-     45%; discharging; 1:30 remaining"""
        resultado = de_pmset(texto)
        self.assertEqual(resultado["nivel"], 0.45)
        self.assertFalse(resultado["cargando"])
    
    def test_pmset_cargado(self):
        texto = """Now drawing from 'AC Power'
 -InternalBattery-     100%; charged; 0:00 remaining"""
        resultado = de_pmset(texto)
        self.assertEqual(resultado["nivel"], 1.0)
        self.assertTrue(resultado["cargando"])  # charged se considera cargando
    
    def test_pmset_sin_porcentaje(self):
        texto = """Now drawing from 'Battery Power'
 -InternalBattery-     ; charging; 0:00 remaining"""
        resultado = de_pmset(texto)
        self.assertNotIn("nivel", resultado)
        self.assertTrue(resultado["cargando"])
    
    def test_pmset_vacio(self):
        texto = ""
        resultado = de_pmset(texto)
        self.assertEqual(resultado, {})


class TestVersionConversion(unittest.TestCase):
    """Tests for _version_a_numero function."""
    
    def test_version_estandar(self):
        self.assertEqual(_version_a_numero("20.19.0"), (20, 19, 0))
        self.assertEqual(_version_a_numero("18.5.3"), (18, 5, 3))
        self.assertEqual(_version_a_numero("1.0.0"), (1, 0, 0))
    
    def test_version_con_menos_partes(self):
        self.assertEqual(_version_a_numero("20.19"), (20, 19, 0))
        self.assertEqual(_version_a_numero("18"), (18, 0, 0))
    
    def test_version_con_mas_partes(self):
        self.assertEqual(_version_a_numero("20.19.0.1"), (20, 19, 0))
        self.assertEqual(_version_a_numero("1.2.3.4.5"), (1, 2, 3))
    
    def test_version_con_caracteres_no_numericos(self):
        self.assertEqual(_version_a_numero("v20.19.0-beta"), (0, 0, 0))
        self.assertEqual(_version_a_numero("20.19.0-alpha"), (0, 0, 0))
    
    def test_version_vacia(self):
        self.assertEqual(_version_a_numero(""), (0, 0, 0))


class TestHerramientas(unittest.TestCase):
    """Tests for herramientas function."""
    
    def test_herramientas_todas_validas(self):
        versiones = {
            "git": "2.40.1",
            "node": "v20.19.0",
            "python3": "3.11.2",
            "opencode": "0.1.0"
        }
        resultado = herramientas(versiones)
        self.assertTrue(resultado["git"])
        self.assertTrue(resultado["node"])
        self.assertTrue(resultado["python3"])
        self.assertTrue(resultado["opencode"])
    
    def test_herramientas_node_insuficiente(self):
        versiones = {
            "git": "2.40.1",
            "node": "v18.19.0",  # Menos de 20.19.0
            "python3": "3.11.2",
            "opencode": "0.1.0"
        }
        resultado = herramientas(versiones)
        self.assertTrue(resultado["git"])
        self.assertFalse(resultado["node"])  # Debería ser False
        self.assertTrue(resultado["python3"])
        self.assertTrue(resultado["opencode"])
    
    def test_herramientas_node_exacto_minimo(self):
        versiones = {
            "git": "2.40.1",
            "node": "v20.19.0",  # Exactamente el mínimo
            "python3": "3.11.2",
            "opencode": "0.1.0"
        }
        resultado = herramientas(versiones)
        self.assertTrue(resultado["node"])  # Debería ser True
    
    def test_herramientas_faltantes(self):
        versiones = {
            "git": "2.40.1",
            # node faltante
            "python3": "3.11.2",
            # opencode faltante
        }
        resultado = herramientas(versiones)
        self.assertTrue(resultado["git"])
        self.assertFalse(resultado["node"])
        self.assertTrue(resultado["python3"])
        self.assertFalse(resultado["opencode"])
    
    def test_herramientas_cadenas_vacias(self):
        versiones = {
            "git": "",
            "node": "v20.19.0",
            "python3": "",
            "opencode": "0.1.0"
        }
        resultado = herramientas(versiones)
        self.assertFalse(resultado["git"])
        self.assertTrue(resultado["node"])
        self.assertFalse(resultado["python3"])
        self.assertTrue(resultado["opencode"])


class TestMedir(unittest.TestCase):
    """Tests for medir function."""

    @unittest.skipIf(not hasattr(os, 'geteuid'), "Requires os.geteuid")
    def test_medir_estructura_basica(self):
        """Verifica que medir devuelva un diccionario con las claves esperadas."""
        resultado = medir()
        self.assertIsInstance(resultado, dict)
        
        # Claves esperadas
        claves_esperadas = {
            "so", "medio_app", "ram_total_mb", "nucleos", 
            "disco_libre_gb", "bateria", "red", "herramientas"
        }
        for clave in claves_esperadas:
            self.assertIn(clave, resultado)
        
        # Verificar tipos básicos
        self.assertIsInstance(resultado["so"], str)
        self.assertEqual(resultado["medio_app"], "terminal")
        self.assertIsInstance(resultado["nucleos"], int)
        self.assertGreaterEqual(resultado["nucleos"], 1)
        
        # Herramientas debe ser un diccionario con claves específicas
        self.assertIsInstance(resultado["herramientas"], dict)
        herramientas_esperadas = {"git", "node", "python3", "opencode"}
        for herramienta in herramientas_esperadas:
            self.assertIn(herramienta, resultado["herramientas"])
            self.assertIsInstance(resultado["herramientas"][herramienta], bool)
     
    def test_medir_so_valido(self):
        """Verifica que el SO detectado sea uno de los esperados."""
        resultado = medir()
        so_validos = {"macos", "linux", "android", "wsl", "windows", "otro"}
        self.assertIn(resultado["so"], so_validos)

    def test_obtener_disco_libre_gb_razonable(self):
        """Verifica que _obtener_disco_libre_gb devuelva un valor razonable cuando puede determinarlo."""
        from gobernador_generico import _obtener_disco_libre_gb
        resultado = _obtener_disco_libre_gb()
        # Puede ser None si no se puede determinar, pero si tiene un valor, debe ser positivo
        if resultado is not None:
            self.assertIsInstance(resultado, float)
            self.assertGreater(resultado, 0.0)


if __name__ == "__main__":
    unittest.main()