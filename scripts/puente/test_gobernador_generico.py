"""Tests for gobernador_generico.py"""
import unittest
from unittest.mock import patch, mock_open
import os
import sys
import subprocess

# Import the module under test
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
import gobernador_generico as gov


class TestDeMeminfo(unittest.TestCase):
    def test_de_meminfo_example(self):
        texto = """MemTotal:        8037024 kB
MemFree:         1234567 kB
MemAvailable:    6220416 kB
Buffers:          123456 kB
Cached:          2345678 kB
SwapTotal:       2048000 kB
SwapFree:        1024000 kB
"""
        result = gov.de_meminfo(texto)
        self.assertAlmostEqual(result["total"], 8037024 / 1024.0, places=1)
        self.assertAlmostEqual(result["available"], 6220416 / 1024.0, places=1)

    def test_de_meminfo_empty(self):
        texto = ""
        result = gov.de_meminfo(texto)
        self.assertEqual(result["total"], 0.0)
        self.assertEqual(result["available"], 0.0)


class TestDeSysctl(unittest.TestCase):
    def test_de_sysctl_example(self):
        # 8 GB in bytes
        texto = "8589934592"
        result = gov.de_sysctl(texto)
        self.assertAlmostEqual(result["total"], 8192.0, places=1)  # 8*1024

    def test_de_sysctl_invalid(self):
        texto = "not a number"
        result = gov.de_sysctl(texto)
        self.assertEqual(result["total"], 0.0)


class TestDeBateriaLinux(unittest.TestCase):
    def test_de_bateria_linux_charging(self):
        # Simulamos el output de ls -la /sys/class/power_supply/ y luego el contenido de los archivos
        # Pero nuestra función espera un string con líneas como:
        #   BAT0/status: Charging
        #   BAT0/capacity: 76
        texto = "BAT0/status: Charging\nBAT0/capacity: 76"
        result = gov.de_bateria_linux(texto)
        self.assertEqual(result["cargando"], True)
        self.assertAlmostEqual(result["nivel"], 0.76)

    def test_de_bateria_linux_discharging(self):
        texto = "BAT0/status: Discharging\nBAT0/capacity: 50"
        result = gov.de_bateria_linux(texto)
        self.assertEqual(result["cargando"], False)
        self.assertAlmostEqual(result["nivel"], 0.5)

    def test_de_bateria_linux_full(self):
        texto = "BAT0/status: Full\nBAT0/capacity: 100"
        result = gov.de_bateria_linux(texto)
        self.assertEqual(result["cargando"], False)  # Full no se considera cargando
        self.assertAlmostEqual(result["nivel"], 1.0)

    def test_de_bateria_linux_unknown(self):
        texto = "BAT0/status: Unknown\nBAT0/capacity: 80"
        result = gov.de_bateria_linux(texto)
        self.assertEqual(result["cargando"], False)
        self.assertAlmostEqual(result["nivel"], 0.8)

    def test_de_bateria_linux_multiple(self):
        texto = """BAT0/status: Charging
BAT0/capacity: 76
BAT1/status: Discharging
BAT1/capacity: 100"""
        result = gov.de_bateria_linux(texto)
        # Debe devolver la primera batería que tenga ambos archivos
        self.assertEqual(result["cargando"], True)
        self.assertAlmostEqual(result["nivel"], 0.76)

    def test_de_bateria_linux_missing(self):
        texto = "BAT0/status: Charging\nBAT1/capacity: 50"
        result = gov.de_bateria_linux(texto)
        self.assertEqual(result, {})


class TestDePmset(unittest.TestCase):
    def test_de_pmset_charging(self):
        texto = """Now drawing from 'Battery Power'
-InternalBattery-0   95%; charged; charging       (rate: 1234mA) estimated remaining 2:30
"""
        result = gov.de_pmset(texto)
        self.assertEqual(result["cargando"], True)
        self.assertAlmostEqual(result["nivel"], 0.95)

    def test_de_pmset_discharging(self):
        texto = """Now drawing from 'Battery Power'
-InternalBattery-0   50%; discharging; (rate: 1234mA) estimated remaining 2:30
"""
        result = gov.de_pmset(texto)
        self.assertEqual(result["cargando"], False)
        self.assertAlmostEqual(result["nivel"], 0.5)

    def test_de_pmset_charged(self):
        texto = """Now drawing from 'AC Power'
-InternalBattery-0   100%; charged; (rate: 0mA) estimated remaining ∞
"""
        result = gov.de_pmset(texto)
        self.assertEqual(result["cargando"], False)
        self.assertAlmostEqual(result["nivel"], 1.0)

    def test_de_pmset_invalid(self):
        texto = "no battery info"
        result = gov.de_pmset(texto)
        self.assertEqual(result["cargando"], False)
        self.assertEqual(result["nivel"], 0.0)


class TestHerramientas(unittest.TestCase):
    def test_herramientas_all_present(self):
        versiones = {
            "git": "2.39.0",
            "node": "v20.19.0",
            "python3": "3.11.5",
            "opencode": "1.0.0"
        }
        result = gov.herramientas(versiones)
        self.assertEqual(result, versiones)

    def test_herramientas_some_missing(self):
        versiones = {
            "git": "2.39.0",
            "node": None,
            "python3": "3.11.5",
            "opencode": "1.0.0"
        }
        result = gov.herramientas(versiones)
        expected = {
            "git": "2.39.0",
            "python3": "3.11.5",
            "opencode": "1.0.0"
        }
        self.assertEqual(result, expected)

    def test_herramientas_all_missing(self):
        versiones = {
            "git": None,
            "node": None,
            "python3": None,
            "opencode": None
        }
        result = gov.herramientas(versiones)
        self.assertEqual(result, {})


class TestMedir(unittest.TestCase):
    @patch("platform.system")
    @patch("platform.uname")
    @patch("os.getenv")
    @patch("os.path.exists")
    @patch("os.statvfs")
    @patch("os.cpu_count")
    @patch("os.listdir")
    @patch("builtins.open", new_callable=mock_open)
    @patch("subprocess.run")
    def test_medir_macos(self, mock_subprocess, mock_open, mock_listdir, mock_cpu_count, mock_statvfs, mock_exists, mock_getenv, mock_uname, mock_system):
        # Simular macOS
        mock_system.return_value = "Darwin"
        mock_uname.return_value = ("Darwin", "", "", "", "")  # (system, node, release, version, machine)
        mock_getenv.return_value = ""
        # Existence checks
        def exists_side_effect(path):
            if path == "/proc/meminfo":
                return False
            return True  # para otros paths que puedan existir
        mock_exists.side_effect = exists_side_effect
        # Statvfs for disk
        mock_statvfs.return_value = type('statvfs', (), {
            'f_frsize': 4096,
            'f_bavail': 1048576  # exactly 4GB free
        })()
        mock_cpu_count.return_value = 8
        # Sysctl output for memory and tool versions
        mock_subprocess.side_effect = [
            # First call: sysctl -n hw.memsize
            subprocess.CompletedProcess(args=["sysctl", "-n", "hw.memsize"], returncode=0, stdout="17179869184", stderr=""),  # 16 GB in bytes
            # Second call: pmset -g batt
            subprocess.CompletedProcess(args=["pmset", "-g", "batt"], returncode=0, stdout="Now drawing from 'AC Power'\n-InternalBattery-0   100%; charged; (rate: 0mA) estimated remaining ∞\n", stderr=""),
            # Third call: git --version
            subprocess.CompletedProcess(args=["git", "--version"], returncode=0, stdout="git version 2.39.0\n", stderr=""),
            # Fourth call: node --version
            subprocess.CompletedProcess(args=["node", "--version"], returncode=0, stdout="v20.19.0\n", stderr=""),
            # Fifth call: python3 --version
            subprocess.CompletedProcess(args=["python3", "--version"], returncode=0, stdout="Python 3.11.5\n", stderr=""),
            # Sixth call: opencode --version
            subprocess.CompletedProcess(args=["opencode", "--version"], returncode=0, stdout="opencode version 1.0.0\n", stderr="")
        ]
        # Listdir for batteries (should return empty list for macOS)
        mock_listdir.return_value = []
        # Open for any file (we won't open any because we mock the existence)
        result = gov.medir()
        self.assertEqual(result["so"], "macos")
        self.assertEqual(result["medio_app"], "terminal")
        self.assertEqual(result["ram_total_mb"], 16384)  # 16 GB in MB
        self.assertEqual(result["nucleos"], 8)
        self.assertAlmostEqual(result["disco_libre_gb"], 4.0, places=1)  # 4096 * 1048576 / (1024^3) = 4.0 GB
        self.assertEqual(result["bateria"], {"cargando": False, "nivel": 1.0})
        self.assertIn("git", result["herramientas"])
        self.assertIn("node", result["herramientas"])
        self.assertIn("python3", result["herramientas"])
        self.assertIn("opencode", result["herramientas"])

    @patch("platform.system")
    @patch("platform.uname")
    @patch("os.getenv")
    @patch("os.path.exists")
    @patch("os.statvfs")
    @patch("os.cpu_count")
    @patch("os.listdir")
    @patch("builtins.open", new_callable=mock_open)
    @patch("subprocess.run")
    def test_medir_linux(self, mock_subprocess, mock_open, mock_listdir, mock_cpu_count, mock_statvfs, mock_exists, mock_getenv, mock_uname, mock_system):
        # Simular Linux
        mock_system.return_value = "Linux"
        # For uname, we need to return a tuple with release that does not contain microsoft
        mock_uname.return_value = ("Linux", "hostname", "5.15.0-100-generic", "", "")  # release without microsoft
        mock_getenv.return_value = ""
        # Existence checks
        def exists_side_effect(path):
            if path == "/proc/meminfo":
                return True
            if path == "/sys/class/power_supply/":
                return True
            return False  # for simplicity
        mock_exists.side_effect = exists_side_effect
        # Statvfs for disk
        mock_statvfs.return_value = type('statvfs', (), {
            'f_frsize': 4096,
            'f_bavail': 1048576  # exactly 4GB free
        })()
        mock_cpu_count.return_value = 4
        # Open for /proc/meminfo, battery status, and battery capacity
        mock_file_meminfo = mock_open(read_data="MemTotal:        8037024 kB\nMemAvailable:    6220416 kB\n").return_value
        mock_file_status = mock_open(read_data="Charging\n").return_value
        mock_file_capacity = mock_open(read_data="80\n").return_value
        mock_open.side_effect = [mock_file_meminfo, mock_file_status, mock_file_capacity]
        # Listdir for batteries
        mock_listdir.return_value = ["BAT0"]
        # Subprocess calls for tool versions (in order: git, node, python3, opencode)
        mock_subprocess.side_effect = [
            # First call: git --version
            subprocess.CompletedProcess(args=["git", "--version"], returncode=0, stdout="git version 2.39.0\n", stderr=""),
            # Second call: node --version
            subprocess.CompletedProcess(args=["node", "--version"], returncode=0, stdout="v20.19.0\n", stderr=""),
            # Third call: python3 --version
            subprocess.CompletedProcess(args=["python3", "--version"], returncode=0, stdout="Python 3.11.5\n", stderr=""),
            # Fourth call: opencode --version
            subprocess.CompletedProcess(args=["opencode", "--version"], returncode=0, stdout="opencode version 1.0.0\n", stderr="")
        ]
        result = gov.medir()
        self.assertEqual(result["so"], "linux")
        self.assertEqual(result["medio_app"], "terminal")
        self.assertEqual(result["ram_total_mb"], 8037024 // 1024)  # 7848 MB approx
        self.assertEqual(result["nucleos"], 4)
        self.assertAlmostEqual(result["disco_libre_gb"], 4.0, places=1)
        self.assertEqual(result["bateria"], {"cargando": True, "nivel": 0.8})
        self.assertIn("git", result["herramientas"])
        self.assertIn("node", result["herramientas"])
        self.assertIn("python3", result["herramientas"])
        self.assertIn("opencode", result["herramientas"])

    @patch("platform.system")
    @patch("platform.uname")
    @patch("os.getenv")
    @patch("os.path.exists")
    @patch("os.statvfs")
    @patch("os.cpu_count")
    @patch("os.listdir")
    @patch("builtins.open", new_callable=mock_open)
    @patch("subprocess.run")
    def test_medir_android_termux(self, mock_subprocess, mock_open, mock_listdir, mock_cpu_count, mock_statvfs, mock_exists, mock_getenv, mock_uname, mock_system):
        # Simular Android con Termux
        mock_system.return_value = "Linux"
        mock_uname.return_value = ("Linux", "hostname", "5.15.0-100-generic", "", "")  # release without microsoft
        mock_getenv.return_value = "/data/data/com.termux"  # PREFIX
        # Existence checks
        def exists_side_effect(path):
            if path == "/proc/meminfo":
                return True
            return False
        mock_exists.side_effect = exists_side_effect
        # Statvfs for disk
        mock_statvfs.return_value = type('statvfs', (), {
            'f_frsize': 4096,
            'f_bavail': 1048576  # exactly 4GB free
        })()
        mock_cpu_count.return_value = 4
        # Open for /proc/meminfo
        mock_file_meminfo = mock_open(read_data="MemTotal:        2097152 kB\nMemAvailable:    1048576 kB\n").return_value  # 2 GB total
        mock_open.side_effect = [mock_file_meminfo]
        # Listdir for batteries (not exist in termux? but we return empty)
        mock_listdir.return_value = []
        # Subprocess calls for tool versions (in order: git, node, python3, opencode)
        mock_subprocess.side_effect = [
            # First call: git --version
            subprocess.CompletedProcess(args=["git", "--version"], returncode=0, stdout="git version 2.39.0\n", stderr=""),
            # Second call: node --version
            subprocess.CompletedProcess(args=["node", "--version"], returncode=0, stdout="v20.19.0\n", stderr=""),
            # Third call: python3 --version
            subprocess.CompletedProcess(args=["python3", "--version"], returncode=0, stdout="Python 3.11.5\n", stderr=""),
            # Fourth call: opencode --version
            subprocess.CompletedProcess(args=["opencode", "--version"], returncode=0, stdout="opencode version 1.0.0\n", stderr="")
        ]
        result = gov.medir()
        self.assertEqual(result["so"], "android")
        self.assertEqual(result["medio_app"], "terminal")
        self.assertEqual(result["ram_total_mb"], 2097152 // 1024)  # 2048 MB
        self.assertEqual(result["nucleos"], 4)
        self.assertAlmostEqual(result["disco_libre_gb"], 4.0, places=1)
        # No battery in termux? but we didn't mock any, so should be empty
        self.assertNotIn("bateria", result)
        self.assertIn("git", result["herramientas"])
        self.assertIn("node", result["herramientas"])
        self.assertIn("python3", result["herramientas"])
        self.assertIn("opencode", result["herramientas"])


if __name__ == "__main__":
    unittest.main()