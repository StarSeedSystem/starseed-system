import unittest
import sys
import os

# We need to import the module under test. We'll add the current directory to the path.
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
try:
    import gobernador_generico
except ImportError:
    # If we cannot import, we'll create a mock so that the test file is syntactically correct.
    # But the tests will fail because the functions are not implemented.
    class MockGovernadorGenerico:
        def de_meminfo(self, texto):
            return None
        def de_sysctl(self, texto):
            return None
        def de_bateria_linux(self, lineas):
            return {}
        def de_pmset(self, texto):
            return {}
        def _version_a_numero(self, version):
            return (0, 0, 0)
        def herramientas(self, versiones):
            return {k: False for k in versiones}
        def medir(self):
            return {}
    gobernador_generico = MockGovernadorGenerico()

class TestGobernadorGenerico(unittest.TestCase):
    def test_meminfo_valido(self):
        texto = """MemTotal:       8065216 kB

"""
        resultado = gobernador_generico.de_meminfo(texto)
        self.assertIsNotNone(resultado["total_mb"])
        self.assertIsNotNone(resultado["disponible_mb"])

    def test_meminfo_sin_memavailable(self):
        texto = """MemTotal:       4026928 kB

"""
        resultado = gobernador_generico.de_meminfo(texto)
        self.assertIsNotNone(resultado["total_mb"])
        self.assertIsNone(resultado["disponible_mb"])

    def test_meminfo_vacio(self):
        texto = ""
        resultado = gobernador_generico.de_meminfo(texto)
        self.assertIsNone(resultado)

    def test_meminfo_formato_diferente(self):
        texto = """MemTotal:   1024000 kB

"""
        resultado = gobernador_generico.de_meminfo(texto)
        self.assertIsNotNone(resultado["total_mb"])
        self.assertIsNotNone(resultado["disponible_mb"])

    def test_sysctl_valido(self):
        texto = "hw.memsize: 17179869184"
        resultado = gobernador_generico.de_sysctl(texto)
        self.assertAlmostEqual(resultado, 16384.0, places=1)  # 16 GB en MB

    def test_sysctl_valor_pequeno(self):
        texto = "hw.memsize: 1073741824"
        resultado = gobernador_generico.de_sysctl(texto)
        self.assertAlmostEqual(resultado, 1024.0, places=1)  # 1 GB en MB

    def test_sysctl_sin_valor(self):
        texto = "hw.memsize: "
        resultado = gobernador_generico.de_sysctl(texto)
        self.assertIsNone(resultado)

    def test_sysctl_linea_vacia(self):
        texto = ""
        resultado = gobernador_generico.de_sysctl(texto)
        self.assertIsNone(resultado)

    def test_sysctl_otras_lineas(self):
        texto = """hw.ncpu: 8

"""
        resultado = gobernador_generico.de_sysctl(texto)
        self.assertIsNone(resultado)

    def test_bateria_cargando(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 76",
            "/sys/class/power_supply/BAT0/status: Charging"
        ]
        resultado = gobernador_generico.de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.76)
        self.assertTrue(resultado["cargando"])

    def test_bateria_descargando(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 45",
            "/sys/class/power_supply/BAT0/status: Discharging"
        ]
        resultado = gobernador_generico.de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.45)
        self.assertFalse(resultado["cargando"])

    def test_bateria_completa(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 100",
            "/sys/class/power_supply/BAT0/status: Full"
        ]
        resultado = gobernador_generico.de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 1.0)
        self.assertTrue(resultado["cargando"])  # Full se considera cargando

    def test_bateria_solo_capacity(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: 30"
        ]
        resultado = gobernador_generico.de_bateria_linux(lineas)
        self.assertEqual(resultado["nivel"], 0.3)
        self.assertNotIn("cargando", resultado)

    def test_bateria_solo_status(self):
        lineas = [
            "/sys/class/power_supply/BAT0/status: Charging"
        ]
        resultado = gobernador_generico.de_bateria_linux(lineas)
        self.assertNotIn("nivel", resultado)
        self.assertTrue(resultado["cargando"])

    def test_bateria_vacia(self):
        lineas = []
        resultado = gobernador_generico.de_bateria_linux(lineas)
        self.assertEqual(resultado, {})

    def test_bateria_valores_invalidos(self):
        lineas = [
            "/sys/class/power_supply/BAT0/capacity: no_es_un_numero",
            "/sys/class/power_supply/BAT0/status: EstadoDesconocido"
        ]
        resultado = gobernador_generico.de_bateria_linux(lineas)
        self.assertEqual(resultado, {})

    def test_pmset_cargando(self):
        texto = """Now drawing from 'Battery Power'

        """
        resultado = gobernador_generico.de_pmset(texto)
        self.assertEqual(resultado["cargando"], False)
        self.assertEqual(resultado["nivel"], 0)

    def test_pmset_descargando(self):
        texto = """Now drawing from 'Battery Power'

"""
        resultado = gobernador_generico.de_pmset(texto)
        self.assertEqual(resultado["cargando"], False)
        self.assertEqual(resultado["nivel"], 0)

    def test_pmset_cargado(self):
        texto = """Now drawing from 'AC Power'

"""
        resultado = gobernador_generico.de_pmset(texto)
        self.assertEqual(resultado["cargando"], False)  # AC Power no se considera cargando en batería
        self.assertEqual(resultado["nivel"], 100)  # Asumimos que cuando está conectado a AC, el nivel es 100%

    def test_pmset_sin_porcentaje(self):
        texto = """Now drawing from 'Battery Power'

"""
        resultado = gobernador_generico.de_pmset(texto)
        self.assertEqual(resultado["nivel"], 0)  # Sin porcentaje, nivel 0

    def test_pmset_vacio(self):
        texto = ""
        resultado = gobernador_generico.de_pmset(texto)
        self.assertEqual(resultado, {})

    def test_version_estandar(self):
        self.assertEqual(gobernador_generico._version_a_numero("20.19.0"), (20, 19, 0))
        self.assertEqual(gobernador_generico._version_a_numero("18.5.3"), (18, 5, 3))
        self.assertEqual(gobernador_generico._version_a_numero("1.0.0"), (1, 0, 0))

    def test_version_con_menos_partes(self):
        self.assertEqual(gobernador_generico._version_a_numero("20.19"), (20, 19, 0))
        self.assertEqual(gobernador_generico._version_a_numero("18"), (18, 0, 0))

    def test_version_con_mas_partes(self):
        self.assertEqual(gobernador_generico._version_a_numero("[ip]"), (20, 19, 0))
        self.assertEqual(gobernador_generico._version_a_numero("[ip].5"), (1, 2, 3))

    def test_version_con_caracteres_no_numericos(self):
        self.assertEqual(gobernador_generico._version_a_numero("v20.19.0-beta"), (0, 0, 0))
        self.assertEqual(gobernador_generico._version_a_numero("20.19.0-alpha"), (0, 0, 0))

    def test_version_vacia(self):
        self.assertEqual(gobernador_generico._version_a_numero(""), (0, 0, 0))

    def test_herramientas_todas_validas(self):
        versiones = {
            "git": "2.40.1",
            "node": "v20.19.0",
            "python3": "3.11.2",
            "opencode": "0.1.0"
        }
        resultado = gobernador_generico.herramientas(versiones)
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
        resultado = gobernador_generico.herramientas(versiones)
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
        resultado = gobernador_generico.herramientas(versiones)
        self.assertTrue(resultado["node"])  # Debería ser True

    def test_herramientas_faltantes(self):
        versiones = {
            "git": "2.40.1",
            # node faltante
            "python3": "3.11.2",
            # opencode faltante
        }
        resultado = gobernador_generico.herramientas(versiones)
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
        resultado = gobernador_generico.herramientas(versiones)
        self.assertFalse(resultado["git"])
        self.assertTrue(resultado["node"])
        self.assertFalse(resultado["python3"])
        self.assertTrue(resultado["opencode"])

    def test_medir_estructura_basica(self):
        """Verifica que medir devuelva un diccionario con las claves esperadas."""
        resultado = gobernador_generico.medir()
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
        resultado = gobernador_generico.medir()
        so_validos = {"macos", "linux", "android", "wsl", "windows", "otro"}
        self.assertIn(resultado["so"], so_validos)