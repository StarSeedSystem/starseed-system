#!/usr/bin/env python3
"""Pruebas unitarias puras para hermes_capacidades.py: salidas de ejemplo, sin ejecutar nada real."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hermes_capacidades as HC  # noqa: E402


class LogicaPura(unittest.TestCase):
    """Pruebas de la lógica de interpretación pura (sin efectos de sistema)."""

    def test_interpretar_captura_ok(self):
        """Captura exitosa: archivo existe, no es negro, sin error de permisos."""
        res = HC.interpretar_captura(
            codigo_salida=0,
            stderr="",
            ruta_archivo="/tmp/test.png",
            tamano_bytes=102400,
            es_negro=False,
        )
        self.assertTrue(res["disponible"])
        self.assertEqual(res["falta"], "")
        self.assertIn("ok", res["detalle"].lower())

    def test_interpretar_captura_permiso_denegado(self):
        """Error 'could not create image from display' → falta permiso de grabación de pantalla."""
        res = HC.interpretar_captura(
            codigo_salida=1,
            stderr="screencapture: could not create image from display",
            ruta_archivo="/tmp/test.png",
            tamano_bytes=0,
            es_negro=False,
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "grabacion_pantalla")
        self.assertIn("Ajustes del Sistema", res["ruta_ajustes"])
        self.assertIn("Privacidad y seguridad", res["ruta_ajustes"])
        self.assertIn("Grabación de pantalla", res["ruta_ajustes"])

    def test_interpretar_captura_archivo_negro(self):
        """Archivo creado pero negro (captura vacía)."""
        res = HC.interpretar_captura(
            codigo_salida=0,
            stderr="",
            ruta_archivo="/tmp/test.png",
            tamano_bytes=1024,
            es_negro=True,
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "grabacion_pantalla")
        self.assertIn("negra", res["detalle"].lower())

    def test_interpretar_captura_archivo_no_existe(self):
        """Comando salió bien pero archivo no existe."""
        res = HC.interpretar_captura(
            codigo_salida=0,
            stderr="",
            ruta_archivo="/tmp/noexiste.png",
            tamano_bytes=0,
            es_negro=False,
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "grabacion_pantalla")

    def test_interpretar_control_ok(self):
        """Accesibilidad OK: osascript devuelve nombre de proceso."""
        res = HC.interpretar_control(
            codigo_salida=0,
            stdout="Finder\n",
            stderr="",
        )
        self.assertTrue(res["disponible"])
        self.assertEqual(res["falta"], "")
        self.assertIn("finder", res["detalle"].lower())

    def test_interpretar_control_sin_accesibilidad(self):
        """Error de accesibilidad: osascript falla con mensaje típico."""
        res = HC.interpretar_control(
            codigo_salida=1,
            stdout="",
            stderr="System Events got an error: osascript is not allowed to send keystrokes",
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "accesibilidad")
        self.assertIn("Ajustes del Sistema", res["ruta_ajustes"])
        self.assertIn("Privacidad y seguridad", res["ruta_ajustes"])
        self.assertIn("Accesibilidad", res["ruta_ajustes"])

    def test_interpretar_control_otro_error(self):
        """Otro error de osascript."""
        res = HC.interpretar_control(
            codigo_salida=1,
            stdout="",
            stderr="execution error: Not authorized to send Apple events",
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "accesibilidad")

    def test_interpretar_registros_mac_ok(self):
        """Registros de Mac: archivo existe, tamaño y última línea."""
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".log") as f:
            f.write("2026-11-18 10:00:00 INFO Enlace estable\n")
            f.write("2026-11-18 10:05:00 INFO Latido recibido\n")
            ruta = f.name
        try:
            res = HC.interpretar_registros_mac(ruta)
            self.assertTrue(res["disponible"])
            self.assertEqual(res["falta"], "")
            self.assertGreater(res["tamano_bytes"], 0)
            self.assertIn("2026-11-18 10:05:00", res["ultima_linea"])
        finally:
            os.unlink(ruta)

    def test_interpretar_registros_mac_no_existe(self):
        """Archivo de log no existe."""
        res = HC.interpretar_registros_mac("/no/existe/enlaces.log")
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "archivo_log_mac")

    def test_interpretar_registros_ssh_ok(self):
        """SSH a Maggabox: éxito, devuelve tamaño y última línea."""
        res = HC.interpretar_registros_ssh(
            codigo_salida=0,
            stdout="1024\n2026-11-18 10:05:00 INFO Sync ok\n",
            stderr="",
        )
        self.assertTrue(res["disponible"])
        self.assertEqual(res["falta"], "")
        self.assertEqual(res["tamano_bytes"], 1024)
        self.assertIn("2026-11-18 10:05:00", res["ultima_linea"])

    def test_interpretar_registros_ssh_timeout(self):
        """SSH timeout (código 255 típico de ssh con timeout)."""
        res = HC.interpretar_registros_ssh(
            codigo_salida=255,
            stdout="",
            stderr="ssh: connect to host maggabox port 22: Operation timed out",
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "ssh_maggabox")

    def test_interpretar_registros_ssh_permiso(self):
        """SSH falla por permisos/clave."""
        res = HC.interpretar_registros_ssh(
            codigo_salida=255,
            stdout="",
            stderr="Permission denied (publickey)",
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "ssh_maggabox")

    def test_interpretar_lanzador_ok(self):
        """Lanzador estado: app existe, servicio cargado, usa launcher."""
        res = HC.interpretar_lanzador(
            {
                "app_existe": True,
                "servicio_cargado": True,
                "usa_launcher": True,
                "ejecutable_actual": "/Users/alex/Applications/StarSeed Hermes.app/Contents/MacOS/starseed-hermes",
            }
        )
        self.assertTrue(res["disponible"])
        self.assertEqual(res["falta"], "")
        self.assertIn("ok", res["detalle"].lower())

    def test_interpretar_lanzador_app_falta(self):
        """Lanzador: app no existe."""
        res = HC.interpretar_lanzador(
            {
                "app_existe": False,
                "servicio_cargado": True,
                "usa_launcher": False,
                "ejecutable_actual": "/usr/bin/osascript",
            }
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "lanzador_app")

    def test_interpretar_lanzador_sin_servicio(self):
        """Lanzador: servicio no cargado."""
        res = HC.interpretar_lanzador(
            {
                "app_existe": True,
                "servicio_cargado": False,
                "usa_launcher": False,
                "ejecutable_actual": "/usr/bin/osascript",
            }
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "lanzador_servicio")

    def test_interpretar_lanzador_no_usa_launcher(self):
        """Lanzador: app existe pero no usa el launcher (usa osascript directo)."""
        res = HC.interpretar_lanzador(
            {
                "app_existe": True,
                "servicio_cargado": True,
                "usa_launcher": False,
                "ejecutable_actual": "/usr/bin/osascript",
            }
        )
        self.assertFalse(res["disponible"])
        self.assertEqual(res["falta"], "lanzador_no_usado")


class Comprobar(unittest.TestCase):
    """Pruebas de la función principal comprobar() con mocks completos."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.resultado_path = Path(self.tmpdir) / ".starseed" / "hermes-capacidades.json"

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    @patch("hermes_capacidades.subprocess.run")
    @patch("hermes_capacidades.Path.home")
    @patch("hermes_capacidades.ejecutar_lanzador")
    @patch("hermes_capacidades.publicar_informe")
    def test_comprobar_todo_ok(
        self, mock_publicar_informe, mock_ejecutar_lanzador, mock_home, mock_run
    ):
        """Escenario ideal: todas las capacidades disponibles."""
        mock_home.return_value = Path(self.tmpdir)
        mock_ejecutar_lanzador.return_value = {
            "app_existe": True,
            "servicio_cargado": True,
            "usa_launcher": True,
            "ejecutable_actual": "/fake/Applications/StarSeed Hermes.app/Contents/MacOS/starseed-hermes",
        }

        # Mock para screencapture (captura)
        def run_side_effect(*args, **kwargs):
            cmd = args[0]
            m = MagicMock()
            if cmd[0] == "screencapture":
                m.returncode = 0
                m.stderr = ""
                # Crear archivo temporal de prueba
                tmp_file = Path(cmd[2])
                tmp_file.write_bytes(b"fake png data" * 1000)
                return m
            elif cmd[0] == "osascript":
                m.returncode = 0
                m.stdout = "Finder\n"
                m.stderr = ""
                return m
            elif cmd[0] == "ssh":
                m.returncode = 0
                m.stdout = "2048\n2026-11-18 10:05:00 INFO Sync ok\n"
                m.stderr = ""
                return m
            return m

        mock_run.side_effect = run_side_effect

        # Mock para publicar_informe
        mock_publicar_informe.return_value = {"id": "md-123-test"}

        # Crear archivo de log local
        log_dir = Path(self.tmpdir) / "Library" / "Logs" / "app.starseed.os"
        log_dir.mkdir(parents=True)
        (log_dir / "enlaces.log").write_text(
            "2026-11-18 10:00:00 INFO Enlace estable\n"
            "2026-11-18 10:05:00 INFO Latido recibido\n"
        )

        res = HC.comprobar(raiz=self.tmpdir)

        self.assertTrue(res["captura"]["disponible"])
        self.assertTrue(res["control"]["disponible"])
        self.assertTrue(res["registros_mac"]["disponible"])
        self.assertTrue(res["registros_maggabox"]["disponible"])
        self.assertTrue(res["lanzador"]["disponible"])

        # Verificar que se escribió el JSON
        self.assertTrue(self.resultado_path.exists())
        with open(self.resultado_path, encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["captura"]["disponible"], True)
        self.assertEqual(data["control"]["disponible"], True)

        # Verificar que se publicó en el chat
        mock_publicar_informe.assert_called_once()
        call_args = mock_publicar_informe.call_args
        self.assertIn("captura", call_args.args[0].lower())
        self.assertIn("control", call_args.args[0].lower())

    @patch("hermes_capacidades.subprocess.run")
    @patch("hermes_capacidades.Path.home")
    @patch("hermes_capacidades.ejecutar_lanzador")
    @patch("hermes_capacidades.publicar_informe")
    def test_comprobar_falta_grabacion_pantalla(
        self, mock_publicar_informe, mock_ejecutar_lanzador, mock_home, mock_run
    ):
        """Falta permiso de grabación de pantalla."""
        mock_home.return_value = Path(self.tmpdir)
        mock_ejecutar_lanzador.return_value = {
            "app_existe": True,
            "servicio_cargado": True,
            "usa_launcher": True,
            "ejecutable_actual": "/fake/Applications/StarSeed Hermes.app/Contents/MacOS/starseed-hermes",
        }

        def run_side_effect(*args, **kwargs):
            cmd = args[0]
            m = MagicMock()
            if cmd[0] == "screencapture":
                m.returncode = 1
                m.stderr = "screencapture: could not create image from display"
                return m
            elif cmd[0] == "osascript":
                m.returncode = 0
                m.stdout = "Finder\n"
                m.stderr = ""
                return m
            elif cmd[0] == "ssh":
                m.returncode = 0
                m.stdout = "2048\n2026-11-18 10:05:00 INFO Sync ok\n"
                m.stderr = ""
                return m
            return m

        mock_run.side_effect = run_side_effect
        mock_publicar_informe.return_value = {"id": "md-123-test"}

        log_dir = Path(self.tmpdir) / "Library" / "Logs" / "app.starseed.os"
        log_dir.mkdir(parents=True)
        (log_dir / "enlaces.log").write_text("2026-11-18 10:00:00 INFO Enlace estable\n")

        res = HC.comprobar(raiz=self.tmpdir)

        self.assertFalse(res["captura"]["disponible"])
        self.assertEqual(res["captura"]["falta"], "grabacion_pantalla")
        self.assertIn("Grabación de pantalla", res["captura"]["ruta_ajustes"])

        # Verificar que el informe menciona lo que falta
        call_args = mock_publicar_informe.call_args
        self.assertIn("grabación de pantalla", call_args.args[0].lower())

    @patch("hermes_capacidades.subprocess.run")
    @patch("hermes_capacidades.Path.home")
    @patch("hermes_capacidades.ejecutar_lanzador")
    @patch("hermes_capacidades.publicar_informe")
    def test_comprobar_falta_accesibilidad(
        self, mock_publicar_informe, mock_ejecutar_lanzador, mock_home, mock_run
    ):
        """Falta permiso de accesibilidad."""
        mock_home.return_value = Path(self.tmpdir)
        mock_ejecutar_lanzador.return_value = {
            "app_existe": True,
            "servicio_cargado": True,
            "usa_launcher": True,
            "ejecutable_actual": "/fake/Applications/StarSeed Hermes.app/Contents/MacOS/starseed-hermes",
        }

        def run_side_effect(*args, **kwargs):
            cmd = args[0]
            m = MagicMock()
            if cmd[0] == "screencapture":
                m.returncode = 0
                m.stderr = ""
                tmp_file = Path(cmd[2])
                tmp_file.write_bytes(b"fake png data" * 1000)
                return m
            elif cmd[0] == "osascript":
                m.returncode = 1
                m.stdout = ""
                m.stderr = "System Events got an error: not allowed to send keystrokes"
                return m
            elif cmd[0] == "ssh":
                m.returncode = 0
                m.stdout = "2048\n2026-11-18 10:05:00 INFO Sync ok\n"
                m.stderr = ""
                return m
            return m

        mock_run.side_effect = run_side_effect
        mock_publicar_informe.return_value = {"id": "md-123-test"}

        log_dir = Path(self.tmpdir) / "Library" / "Logs" / "app.starseed.os"
        log_dir.mkdir(parents=True)
        (log_dir / "enlaces.log").write_text("2026-11-18 10:00:00 INFO Enlace estable\n")

        res = HC.comprobar(raiz=self.tmpdir)

        self.assertFalse(res["control"]["disponible"])
        self.assertEqual(res["control"]["falta"], "accesibilidad")
        self.assertIn("Accesibilidad", res["control"]["ruta_ajustes"])

    @patch("hermes_capacidades.subprocess.run")
    @patch("hermes_capacidades.Path.home")
    @patch("hermes_capacidades.ejecutar_lanzador")
    @patch("hermes_capacidades.publicar_informe")
    def test_comprobar_ssh_falla(
        self, mock_publicar_informe, mock_ejecutar_lanzador, mock_home, mock_run
    ):
        """SSH a Maggabox falla (timeout)."""
        mock_home.return_value = Path(self.tmpdir)
        mock_ejecutar_lanzador.return_value = {
            "app_existe": True,
            "servicio_cargado": True,
            "usa_launcher": True,
            "ejecutable_actual": "/fake/Applications/StarSeed Hermes.app/Contents/MacOS/starseed-hermes",
        }

        def run_side_effect(*args, **kwargs):
            cmd = args[0]
            m = MagicMock()
            if cmd[0] == "screencapture":
                m.returncode = 0
                m.stderr = ""
                tmp_file = Path(cmd[2])
                tmp_file.write_bytes(b"fake png data" * 1000)
                return m
            elif cmd[0] == "osascript":
                m.returncode = 0
                m.stdout = "Finder\n"
                m.stderr = ""
                return m
            elif cmd[0] == "ssh":
                m.returncode = 255
                m.stdout = ""
                m.stderr = "ssh: connect to host maggabox port 22: Operation timed out"
                return m
            return m

        mock_run.side_effect = run_side_effect
        mock_publicar_informe.return_value = {"id": "md-123-test"}

        log_dir = Path(self.tmpdir) / "Library" / "Logs" / "app.starseed.os"
        log_dir.mkdir(parents=True)
        (log_dir / "enlaces.log").write_text("2026-11-18 10:00:00 INFO Enlace estable\n")

        res = HC.comprobar(raiz=self.tmpdir)

        self.assertFalse(res["registros_maggabox"]["disponible"])
        self.assertEqual(res["registros_maggabox"]["falta"], "ssh_maggabox")

    @patch("hermes_capacidades.subprocess.run")
    @patch("hermes_capacidades.Path.home")
    @patch("hermes_capacidades.ejecutar_lanzador")
    @patch("hermes_capacidades.publicar_informe")
    def test_comprobar_lanzador_no_instalado(
        self, mock_publicar_informe, mock_ejecutar_lanzador, mock_home, mock_run
    ):
        """Lanzador Hermes no instalado (app no existe)."""
        mock_home.return_value = Path(self.tmpdir)
        mock_ejecutar_lanzador.return_value = {
            "app_existe": False,
            "servicio_cargado": False,
            "usa_launcher": False,
            "ejecutable_actual": "/usr/bin/osascript",
        }

        def run_side_effect(*args, **kwargs):
            cmd = args[0]
            m = MagicMock()
            if cmd[0] == "screencapture":
                m.returncode = 0
                m.stderr = ""
                tmp_file = Path(cmd[2])
                tmp_file.write_bytes(b"fake png data" * 1000)
                return m
            elif cmd[0] == "osascript":
                m.returncode = 0
                m.stdout = "Finder\n"
                m.stderr = ""
                return m
            elif cmd[0] == "ssh":
                m.returncode = 0
                m.stdout = "2048\n2026-11-18 10:05:00 INFO Sync ok\n"
                m.stderr = ""
                return m
            return m

        mock_run.side_effect = run_side_effect
        mock_publicar_informe.return_value = {"id": "md-123-test"}

        log_dir = Path(self.tmpdir) / "Library" / "Logs" / "app.starseed.os"
        log_dir.mkdir(parents=True)
        (log_dir / "enlaces.log").write_text("2026-11-18 10:00:00 INFO Enlace estable\n")

        res = HC.comprobar(raiz=self.tmpdir)

        self.assertFalse(res["lanzador"]["disponible"])
        self.assertEqual(res["lanzador"]["falta"], "lanzador_app")


class EscribirResultado(unittest.TestCase):
    """Pruebas de escritura del archivo JSON de resultado."""

    def test_escribir_resultado_crea_archivo(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "hermes-capacidades.json"
            datos = {
                "captura": {"disponible": True, "falta": "", "detalle": "ok"},
                "control": {"disponible": False, "falta": "accesibilidad", "detalle": "sin permiso"},
            }
            HC.escribir_resultado(datos, ruta)
            self.assertTrue(ruta.exists())
            with open(ruta, encoding="utf-8") as f:
                leido = json.load(f)
            self.assertEqual(leido["captura"]["disponible"], True)
            self.assertEqual(leido["control"]["falta"], "accesibilidad")


class GenerarInforme(unittest.TestCase):
    """Pruebas de generación del texto del informe para el chat."""

    def test_generar_informe_todo_ok(self):
        datos = {
            "captura": {"disponible": True, "falta": "", "detalle": "Captura OK (102 KB)"},
            "control": {"disponible": True, "falta": "", "detalle": "Control OK (Finder)"},
            "registros_mac": {"disponible": True, "falta": "", "detalle": "Log Mac: 2 KB, última 2026-11-18 10:05"},
            "registros_maggabox": {"disponible": True, "falta": "", "detalle": "Log Maggabox: 2 KB, última 2026-11-18 10:05"},
            "lanzador": {"disponible": True, "falta": "", "detalle": "Lanzador OK (app + servicio)"},
        }
        texto = HC.generar_informe(datos)
        self.assertIn("✅", texto)
        self.assertIn("captura", texto.lower())
        self.assertIn("control", texto.lower())
        self.assertNotIn("❌", texto)

    def test_generar_informe_con_faltantes(self):
        datos = {
            "captura": {"disponible": False, "falta": "grabacion_pantalla", "detalle": "Falta permiso", "ruta_ajustes": "Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla"},
            "control": {"disponible": True, "falta": "", "detalle": "Control OK"},
            "registros_mac": {"disponible": True, "falta": "", "detalle": "Log Mac OK"},
            "registros_maggabox": {"disponible": False, "falta": "ssh_maggabox", "detalle": "SSH timeout", "ruta_ajustes": ""},
            "lanzador": {"disponible": False, "falta": "lanzador_app", "detalle": "App no instalada", "ruta_ajustes": ""},
        }
        texto = HC.generar_informe(datos)
        self.assertIn("❌", texto)
        self.assertIn("grabación de pantalla", texto.lower())
        self.assertIn("ssh", texto.lower())
        self.assertIn("lanzador", texto.lower())
        self.assertIn("Ajustes del Sistema", texto)
        self.assertIn("Privacidad y seguridad", texto)
        self.assertIn("Grabación de pantalla", texto)


if __name__ == "__main__":
    unittest.main()