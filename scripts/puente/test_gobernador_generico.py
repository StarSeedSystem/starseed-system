"""Pruebas del gobernador genérico del aparato (COL1012Ld, parte 2 de 2).

El gobernador mide el aparato SIN privilegios y alimenta el diccionario que espera
`colmena_logica.capacidad_contenedor` (contrato: architecture/colmena-relevo-contenedores.md §2).
Las funciones puras se prueban con textos reales de ejemplo de cada fuente (/proc/meminfo,
`sysctl hw.memsize`, `/sys/class/power_supply/*`, `pmset -g batt`, versiones de herramientas),
nunca con los del sistema de turno: así la misma prueba vale en la Mac, el A1, un Linux, WSL y Termux.

Por qué hace falta el `sys.path.insert` antes de los imports: esa prueba se corre en el puente por tres
caminos (`python3 -m unittest scripts/puente/test_X.py`, pytest de `traer_nube._puertas` y
`unittest discover`). El conftest.py de esta carpeta cubre solo a pytest; sin el insert propio la forma
por ruta muere en la RECOGIDA con `ModuleNotFoundError`, como lo traído de la nube el 2026-10-23
(COL1012Lc cayó en la Mac sin que una sola aserción se ejecutara). El arranque propio es la reparación.
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import colmena_logica as C  # noqa: E402

from gobernador_generico import (  # noqa: E402
    de_meminfo, de_sysctl, de_bateria_linux, de_pmset,
    herramientas, medir, _version_a_numero, _es_android,
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

    def test_sysctl_otras_lineas_sin_memsize(self):
        """Otras líneas sysctl presentes pero SIN hw.memsize (distinto de línea vacía o sin valor)."""
        texto = """hw.ncpu: 8
hw.cachelinesize: 64"""
        resultado = de_sysctl(texto)
        self.assertIsNone(resultado)


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
    
    def test_pmset_solo_cabecera(self):
        # Cabecera sin línea de batería: «Battery Power» no debe confundirse con estado.
        texto = """Now drawing from 'Battery Power'
"""
        resultado = de_pmset(texto)
        self.assertEqual(resultado, {})

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
        # OPF1024B: la parte numérica cuenta aunque lleve sufijo de pre-versión (antes daba 0.0.0).
        self.assertEqual(_version_a_numero("v20.19.0-beta"), (20, 19, 0))
        self.assertEqual(_version_a_numero("20.19.0-alpha"), (20, 19, 0))
        self.assertEqual(_version_a_numero("1.2.3-rc1"), (1, 2, 3))
        self.assertEqual(_version_a_numero("0.24.0b1"), (0, 24, 0))
        self.assertEqual(_version_a_numero("2.0.0-beta.2"), (2, 0, 0))
        self.assertEqual(_version_a_numero("1.2.3+compilacion.5"), (1, 2, 3))
        self.assertEqual(_version_a_numero("sin número"), (0, 0, 0))

    def test_version_vacia(self):
        self.assertEqual(_version_a_numero(""), (0, 0, 0))


class TestPreVersionesSemver(unittest.TestCase):
    """OPF1024B: una pre-versión queda por debajo de la final del mismo número (semver §11)."""

    def setUp(self):
        import gobernador_generico as G
        self.G = G

    def test_pre_version_por_debajo_de_la_final(self):
        cmp = self.G.comparar_versiones
        for pre, final in [("1.2.3-rc1", "1.2.3"), ("0.24.0b1", "0.24.0"), ("2.0.0-beta.2", "2.0.0"),
                           ("v20.19.0-rc.1", "v20.19.0"), ("3.14.0rc1", "3.14.0")]:
            self.assertEqual(cmp(pre, final), -1, (pre, final))
            self.assertEqual(cmp(final, pre), 1, (final, pre))

    def test_pre_version_por_encima_del_numero_anterior(self):
        self.assertEqual(self.G.comparar_versiones("2.0.0-beta.2", "1.9.9"), 1)
        self.assertEqual(self.G.comparar_versiones("0.24.0b1", "0.23.9"), 1)

    def test_orden_de_semver(self):
        # El ejemplo de precedencia de semver.org, barajado.
        esperado = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta",
                    "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"]
        barajado = [esperado[i] for i in (5, 0, 7, 2, 6, 1, 4, 3)]
        self.assertEqual(sorted(barajado, key=self.G.clave_version), esperado)

    def test_iguales_y_metadatos(self):
        cmp = self.G.comparar_versiones
        self.assertEqual(cmp("v1.2.3", "1.2.3"), 0)
        self.assertEqual(cmp("1.2.3+compilacion.7", "1.2.3"), 0)
        self.assertEqual(cmp("1.2", "1.2.0"), 0)
        self.assertEqual(cmp("1.0.0-1", "1.0.0-alpha"), -1)  # numérico por debajo de alfanumérico

    def test_herramientas_con_pre_versiones(self):
        base = {"git": "2.40.1", "opencode": "0.1.0"}
        # Por debajo del mínimo 20.19.0 aunque el número coincida.
        self.assertFalse(herramientas(dict(base, node="v20.19.0-rc.1", python3="3.11.2"))["node"])
        r = herramientas(dict(base, node="v22.0.0-nightly20260101", python3="3.14.0rc1"))
        self.assertTrue(r["node"])
        self.assertTrue(r["python3"])


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

    def test_herramientas_node_fronteras_version(self):
        """Las fronteras del mínimo pedido (Node ≥ 20.19): de donde salió el «apto» no prometido."""
        fronteras = [
            ("v20.19.0", True),      # mínimo exacto
            ("20.19.0", True),       # sin «v» inicial también cuenta
            ("v20.19.1", True),
            ("v20.18.9", False),     # el parche anterior no llega
            ("20", False),           # solo el mayor: falta el menor 19
            ("v20.19", True),        # menor exacto sin parche
            ("v20.20.0", True),
            ("v21.0.0", True),
            ("v19.10.0", False),
        ]
        for version, esperado in fronteras:
            with self.subTest(version=version):
                self.assertEqual(herramientas({"node": version})["node"], esperado)


class TestDeteccionAparato(unittest.TestCase):
    """Tests for _es_android: la variable pública TERMUX_PREFIX que hace al aparato «Android»."""

    def test_prefix_con_com_termux_marca_android(self):
        with mock.patch.dict(os.environ, {"PREFIX": "/data/data/com.termux/files/usr"}):
            self.assertTrue(_es_android())

    def test_prefix_sin_com_termux_no_es_android(self):
        with mock.patch.dict(os.environ, {"PREFIX": "/usr/local"}):
            self.assertFalse(_es_android())


class TestMedir(unittest.TestCase):
    """Tests for medir function."""
    
    @unittest.skipIf(not hasattr(os, 'geteuid'), "Requires os.geteuid")
    def test_medir_estructura_basica(self):
        """Verifica que medir devuelva un diccionario con las claves esperadas."""
        resultado = medir()
        self.assertIsInstance(resultado, dict)

        # Las claves EXACTAS del diccionario que espera `colmena_logica.capacidad_contenedor`
        # (contrato §2): ni una de más (se sacaría del aparato) ni una de menos.
        claves_esperadas = {
            "so", "medio_app", "ram_total_mb", "nucleos",
            "disco_libre_gb", "bateria", "red", "herramientas"
        }
        self.assertEqual(set(resultado), claves_esperadas)

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

    def test_medir_no_inventa_red_medida(self):
        """Sin saberlo (NetworkManager o datos móviles de Termux), no se pone: el núcleo usaría el dato."""
        resultado = medir()
        self.assertIsInstance(resultado["red"], dict)
        if not resultado["red"]:
            self.assertNotIn("medida", resultado["red"])

    def test_medir_alimenta_capacidad_contenedor(self):
        """El propósito entero: el diccionario de `medir()` entra en el núcleo puro y sale un veredicto.

        No se afirma un número concreto (cada aparato dirá el suyo): se afirma que el circuito
        `medir` → `colmena_logica.capacidad_contenedor` corre sin fallos y con la forma del contrato.
        """
        veredicto = C.capacidad_contenedor(medir())
        self.assertIsInstance(veredicto["apto"], bool)
        self.assertIsInstance(veredicto["agentes"], int)
        self.assertGreaterEqual(veredicto["agentes"], 0)
        self.assertIsInstance(veredicto["motivo"], str)
        self.assertGreater(len(veredicto["motivo"]), 0)
        self.assertIsInstance(veredicto["falta"], list)
    
    def test_medir_so_valido(self):
        """Verifica que el SO detectado sea uno de los esperados."""
        resultado = medir()
        so_validos = {"macos", "linux", "android", "wsl", "windows", "otro"}
        self.assertIn(resultado["so"], so_validos)


if __name__ == "__main__":
    unittest.main()