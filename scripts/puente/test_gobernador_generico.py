import unittest
import sys
import os

# Add the scripts/puente directory to the path so we can import the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

# Try to import the module - if it doesn't exist, we'll skip the tests
try:
    import gobernador_generico as gov
    MODULE_EXISTS = True
except ImportError:
    MODULE_EXISTS = False


@unittest.skipIf(not MODULE_EXISTS, "gobernador_generico module not available")
class TestMeminfo(unittest.TestCase):
    """Tests for de_meminfo function."""

    def test_meminfo_valido(self):
        texto = """MemTotal:       8065216 kB
MemFree:         123456 kB
MemAvailable:    2048000 kB
"""
        resultado = gov.de_meminfo(texto)
        self.assertAlmostEqual(resultado["total_mb"], 7876.0, places=1)  # 8065216 / 1024
        self.assertAlmostEqual(resultado["disponible_mb"], 2000.0, places=1)  # 2048000 / 1024

    def test_meminfo_sin_memavailable(self):
        texto = """MemTotal:       4026928 kB
MemFree:         123456 kB
"""
        resultado = gov.de_meminfo(texto)
        self.assertAlmostEqual(resultado["total_mb"], 3933.0, places=1)  # 4026928 / 1024
        self.assertAlmostEqual(resultado["disponible_mb"], 3809.0, places=1)  # (MemTotal - MemFree) / 1024

    def test_meminfo_vacio(self):
        texto = ""
        resultado = gov.de_meminfo(texto)
        self.assertIsNone(resultado["total_mb"])
        self.assertIsNone(resultado["disponible_mb"])

    def test_meminfo_formato_diferente(self):
        texto = """MemTotal:   1024000 kB
MemFree:    102400 kB
MemAvailable: 512000 kB
"""
        resultado = gov.de_meminfo(texto)
        self.assertAlmostEqual(resultado["total_mb"], 1000.0, places=1)  # 1024000 / 1024
        self.assertAlmostEqual(resultado["disponible_mb"], 500.0, places=1)  # 512000 / 1024


@unittest.skipIf(not MODULE_EXISTS, "gobernador_generico module not available")
class TestSysctl(unittest.TestCase):
    """Tests for de_sysctl function."""

    def test_sysctl_valido(self):
        texto = "hw.memsize: 17179869184"
        resultado = gov.de_sysctl(texto)
        self.assertAlmostEqual(resultado, 16384.0, places=1)  # 16 GB en MB

    def test_sysctl_valor_pequeno(self):
        texto = "hw.memsize: 1073741824"
        resultado = gov.de_sysctl(texto)
        self.assertAlmostEqual(resultado, 1024.0, places=1)  # 1 GB en MB

    def test_sysctl_sin_valor(self):
        texto = "hw.memsize: "
        resultado = gov.de_sysctl(texto)
        self.assertIsNone(resultado)

    def test_sysctl_linea_vacia(self):
        texto = ""
        resultado = gov.de_sysctl(texto)
        self.assertIsNone(resultado)

    def test_sysctl_otras_lineas(self):
        texto = """hw.ncpu: 8
hw.memsize: 17179869184
"""
        resultado = gov.de_sysctl(texto)
        self.assertAlmostEqual(resultado, 16384.0, places=1)  # 16 GB en MB


@unittest.skipIf(not MODULE_EXISTS, "gobernador_generico module not available")
class TestBateriaLinux(unittest.TestCase):
    """Tests for de_bateria_linux function."""

    def test_bateria_cargando(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 76",
            "/sys/class/power_supply/BAT0/status: Charging"
        ]
        resultado = gov.de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.76)
        self.assertTrue(resultado["cargando"])

    def test_bateria_descargando(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 45",
            "/sys/class/power_supply/BAT0/status: Discharging"
        ]
        resultado = gov.de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.45)
        self.assertFalse(resultado["cargando"])

    def test_bateria_completa(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 100",
            "/sys/class/power_supply/BAT0/status: Full"
        ]
        resultado = gov.de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 1.0)
        self.assertTrue(resultado["cargando"])  # Full se considera cargando

    def test_bateria_solo_capacity(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 30"
        ]
        resultado = gov.de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.3)
        self.assertNotIn("cargando", resultado)

    def test_bateria_solo_status(self):
        lineas = [
            "/sys/class/power_supply/BAT0/status: Charging"
        ]
        resultado = gov.de_bateria_linux(lineas)
        self.assertNotIn("nivel", resultado)
        self.assertTrue(resultado["cargando"])

    def test_bateria_vacia(self):
        lineas = []
        resultado = gov.de_bateria_linux(lineas)
        self.assertEqual(resultado, {})

    def test_bateria_valores_invalidos(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: no_es_un_numero",
            "/sys/class/power_supply/BAT0/status: EstadoDesconocido"
        ]
        resultado = gov.de_bateria_linux(lineas)
        self.assertEqual(resultado, {})


@unittest.skipIf(not MODULE_EXISTS, "gobernador_generico module not available")
class TestPmset(unittest.TestCase):
    """Tests for de_pmset function."""

    def test_pmset_cargando(self):
        texto = """Now drawing from 'Battery Power'
 - InternalChargeCapacity    4500 mAh
"""
        resultado = gov.de_pmset(texto)
        self.assertEqual(resultado["nivel"], 0.45)  # Assuming 4500/10000
        self.assertFalse(resultado["cargando"])

    def test_pmset_descargando(self):
        texto = """Now drawing from 'Battery Power'
 - InternalChargeCapacity    2000 mAh
"""
        resultado = gov.de_pmset(texto)
        self.assertEqual(resultado["nivel"], 0.2)  # Assuming 2000/10000
        self.assertFalse(resultado["cargando"])

    def test_pmset_cargado(self):
        texto = """Now drawing from 'AC Power'
 - InternalChargeCapacity    5000 mAh
"""
        resultado = gov.de_pmset(texto)
        self.assertEqual(resultado["nivel"], 0.5)  # Assuming 5000/10000
        self.assertTrue(resultado["cargando"])

    def test_pmset_sin_porcentaje(self):
        texto = """Now drawing from 'Battery Power'
"""
        resultado = gov.de_pmset(texto)
        self.assertEqual(resultado, {})

    def test_pmset_vacio(self):
        texto = ""
        resultado = gov.de_pmset(texto)
        self.assertEqual(resultado, {})


@unittest.skipIf(not MODULE_EXISTS, "gobernador_generico module not available")
class TestVersionNumero(unittest.TestCase):
    """Tests for _version_a_numero function."""

    def test_version_estandar(self):
        self.assertEqual(gov._version_a_numero("20.19.0"), (20, 19, 0))
        self.assertEqual(gov._version_a_numero("18.5.3"), (18, 5, 3))
        self.assertEqual(gov._version_a_numero("1.0.0"), (1, 0, 0))

    def test_version_con_menos_partes(self):
        self.assertEqual(gov._version_a_numero("20.19"), (20, 19, 0))
        self.assertEqual(gov._version_a_numero("18"), (18, 0, 0))

    def test_version_con_mas_partes(self):
        self.assertEqual(gov._version_a_numero("20.19.0.1"), (20, 19, 0))
        self.assertEqual(gov._version_a_numero("1.2.3.4.5"), (1, 2, 3))

    def test_version_con_caracteres_no_numericos(self):
        self.assertEqual(gov._version_a_numero("v20.19.0-beta"), (0, 0, 0))
        self.assertEqual(gov._version_a_numero("20.19.0-alpha"), (0, 0, 0))

    def test_version_vacia(self):
        self.assertEqual(gov._version_a_numero(""), (0, 0, 0))


@unittest.skipIf(not MODULE_EXISTS, "gobernador_generico module not available")
class TestHerramientas(unittest.TestCase):
    """Tests for herramientas function."""

    def test_herramientas_todas_validas(self):
        versiones = {
            "git": "2.40.1",
            "node": "v20.19.0",
            "python3": "3.11.2",
            "opencode": "0.1.0"
        }
        resultado = gov.herramientas(versiones)
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
        resultado = gov.herramientas(versiones)
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
        resultado = gov.herramientas(versiones)
        self.assertTrue(resultado["node"])  # Debería ser True

    def test_herramientas_faltantes(self):
        versiones = {
            "git": "2.40.1",
            # node faltante
            "python3": "3.11.2",
            # opencode faltante
        }
        resultado = gov.herramientas(versiones)
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
        resultado = gov.herramientas(versiones)
        self.assertFalse(resultado["git"])
        self.assertTrue(resultado["node"])
        self.assertFalse(resultado["python3"])
        self.assertTrue(resultado["opencode"])


@unittest.skipIf(not MODULE_EXISTS, "gobernador_generico module not available")
class TestMedir(unittest.TestCase):
    """Tests for medir function."""

    def test_medir_estructura_basica(self):
        """Verifica que medir devuelva un diccionario con las claves esperadas."""
        resultado = gov.medir()
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
        resultado = gov.medir()
        so_validos = {"macos", "linux", "android", "wsl", "windows", "otro"}
        self.assertIn(resultado["so"], so_validos)


if __name__ == "__main__":
    unittest.main()