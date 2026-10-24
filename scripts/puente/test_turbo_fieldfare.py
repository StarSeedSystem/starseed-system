#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests unitarios para turbo_fieldfare.py (RIA1023H).

Pruebas puras de la lógica de decisión sin red ni procesos reales.
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import turbo_fieldfare as M  # noqa: E402


class TestPuedeEncender(unittest.TestCase):
    """Prueba la función pura puede_encender."""

    def _estado_base(self, **kwargs) -> M.TurboFieldfareStatus:
        base = {
            "instalado": True,
            "binario": Path("/fake/bin/TurboFieldfareServer"),
            "modelo": Path("/fake/model/gemma4.gturbo"),
            "macos_ok": True,
            "puerto_ocupado": False,
            "memoria_libre_gb": 4.0,
            "servidor_activo": False,
            "mensaje": "OK",
        }
        base.update(kwargs)
        return M.TurboFieldfareStatus(**base)

    def test_ok_todo_cumple(self):
        estado = self._estado_base()
        ok, motivo = M.puede_encender(estado)
        self.assertTrue(ok)
        self.assertEqual(motivo, "OK")

    def test_no_instalado(self):
        estado = self._estado_base(instalado=False, binario=None, modelo=None)
        ok, motivo = M.puede_encender(estado)
        self.assertFalse(ok)
        self.assertIn("no está instalado", motivo)

    def test_macos_antiguo(self):
        estado = self._estado_base(macos_ok=False)
        ok, motivo = M.puede_encender(estado)
        self.assertFalse(ok)
        self.assertIn("macOS < 26", motivo)

    def test_puerto_ocupado(self):
        estado = self._estado_base(puerto_ocupado=True)
        ok, motivo = M.puede_encender(estado)
        self.assertFalse(ok)
        self.assertIn("puerto 8080 ya está en uso", motivo)

    def test_servidor_activo(self):
        estado = self._estado_base(servidor_activo=True, puerto_ocupado=False)
        ok, motivo = M.puede_encender(estado)
        self.assertFalse(ok)
        self.assertIn("puerto 8080 ya está en uso", motivo)

    def test_memoria_insuficiente(self):
        estado = self._estado_base(memoria_libre_gb=1.5)
        ok, motivo = M.puede_encender(estado)
        self.assertFalse(ok)
        self.assertIn("Memoria libre insuficiente", motivo)
        self.assertIn("1.5", motivo)

    def test_memoria_justa(self):
        estado = self._estado_base(memoria_libre_gb=2.0)
        ok, motivo = M.puede_encender(estado)
        self.assertTrue(ok)

    def test_memoria_casi_justa(self):
        estado = self._estado_base(memoria_libre_gb=1.99)
        ok, motivo = M.puede_encender(estado)
        self.assertFalse(ok)


class TestMacOSVersion(unittest.TestCase):
    """Prueba _macos_version con mocks."""

    @patch("platform.mac_ver", return_value=("26.0", "", ""))
    def test_macos_26(self, _mock):
        self.assertEqual(M._macos_version(), (26, 0))

    @patch("platform.mac_ver", return_value=("15.6", "", ""))
    def test_macos_15(self, _mock):
        self.assertEqual(M._macos_version(), (15, 6))

    @patch("platform.mac_ver", return_value=("", "", ""))
    def test_macos_desconocido(self, _mock):
        self.assertEqual(M._macos_version(), (0, 0))


class TestModeloValido(unittest.TestCase):
    """Prueba _modelo_valido con filesystem temporal."""

    def test_modelo_valido_con_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            modelo = Path(tmp) / "gemma4.gturbo"
            modelo.mkdir()
            (modelo / "manifest.json").write_text('{"version": "1"}')
            self.assertTrue(M._modelo_valido(modelo))

    def test_modelo_invalido_sin_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            modelo = Path(tmp) / "gemma4.gturbo"
            modelo.mkdir()
            (modelo / "otro.json").write_text('{}')
            self.assertFalse(M._modelo_valido(modelo))

    def test_modelo_no_existe(self):
        self.assertFalse(M._modelo_valido(Path("/no/existe")))

    def test_modelo_es_archivo(self):
        with tempfile.TemporaryDirectory() as tmp:
            archivo = Path(tmp) / "modelo.gturbo"
            archivo.write_text("no es directorio")
            self.assertFalse(M._modelo_valido(archivo))


class TestBuscarBinario(unittest.TestCase):
    """Prueba _buscar_binario con mocks."""

    @patch("shutil.which", return_value="/usr/local/bin/TurboFieldfareServer")
    def test_en_path(self, mock_which):
        binario = M._buscar_binario()
        self.assertIsNotNone(binario)
        self.assertEqual(str(binario), "/usr/local/bin/TurboFieldfareServer")
        mock_which.assert_called_once_with(M.SERVER_BINARY_NAME)

    @patch("shutil.which", return_value=None)
    @patch("pathlib.Path.home", return_value=Path("/home/user"))
    @patch("pathlib.Path.glob")
    def test_en_repo_documentos(self, mock_glob, mock_home, mock_which):
        fake_bin = Path("/home/user/Documents/turbo-fieldfare/.build/release/TurboFieldfareServer")
        mock_glob.return_value = [Path("/home/user/Documents/turbo-fieldfare")]
        # Mock Path.exists para las bases y el binario
        # base = Path.home() / "Documents" -> existe
        # binario = repo / ".build/release/TurboFieldfareServer" -> existe
        def exists_side_effect(path_self):
            return str(path_self) in (str(Path("/home/user/Documents")), str(fake_bin))
        with patch("pathlib.Path.exists", autospec=True, side_effect=exists_side_effect):
            binario = M._buscar_binario()
            self.assertIsNotNone(binario)
            self.assertEqual(binario, fake_bin)

    @patch("shutil.which", return_value=None)
    @patch("pathlib.Path.home", return_value=Path("/home/user"))
    @patch("pathlib.Path.exists", return_value=False)
    def test_no_encontrado(self, mock_exists, mock_home, mock_which):
        binario = M._buscar_binario()
        self.assertIsNone(binario)


class TestBuscarModelo(unittest.TestCase):
    """Prueba _buscar_modelo con mocks."""

    def _setup_fake_repo(self, tmp: Path) -> tuple[Path, Path]:
        repo = tmp / "turbo-fieldfare"
        binario = repo / ".build" / "release" / "TurboFieldfareServer"
        binario.parent.mkdir(parents=True)
        binario.touch()
        modelo = repo / "scratch" / "gemma4.gturbo"
        modelo.mkdir(parents=True)
        (modelo / "manifest.json").write_text('{}')
        return binario, modelo

    def test_modelo_defecto_relativo_al_binario(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            binario, modelo = self._setup_fake_repo(tmp_path)
            encontrado = M._buscar_modelo(binario)
            self.assertEqual(encontrado, modelo)

    def test_modelo_desde_config_app(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            binario = tmp_path / "bin" / "TurboFieldfareServer"
            binario.parent.mkdir(parents=True)
            binario.touch()

            config_dir = tmp_path / "Library" / "Application Support" / "TurboFieldfare"
            config_dir.mkdir(parents=True)
            config_file = config_dir / "mac-app-settings.json"
            modelo_custom = tmp_path / "modelos" / "mi-modelo.gturbo"
            modelo_custom.mkdir(parents=True)
            (modelo_custom / "manifest.json").write_text('{}')
            config_file.write_text(json.dumps({"modelPath": str(modelo_custom)}))

            with patch("pathlib.Path.home", return_value=tmp_path):
                encontrado = M._buscar_modelo(binario)
                self.assertEqual(encontrado, modelo_custom)

    def test_sin_binario_retorna_none(self):
        self.assertIsNone(M._buscar_modelo(None))


class TestObtenerEstado(unittest.TestCase):
    """Prueba obtener_estado con mocks extensivos."""

    @patch.object(M, "_buscar_binario", return_value=None)
    @patch.object(M, "_macos_version", return_value=(26, 0))
    @patch.object(M, "_memoria_libre_gb", return_value=8.0)
    @patch.object(M, "_puerto_ocupado", return_value=False)
    @patch.object(M, "_servidor_responde", return_value=False)
    def test_no_instalado(self, *_mocks):
        estado = M.obtener_estado()
        self.assertFalse(estado.instalado)
        self.assertIsNone(estado.binario)
        self.assertIsNone(estado.modelo)
        self.assertTrue(estado.macos_ok)
        self.assertFalse(estado.puerto_ocupado)
        self.assertFalse(estado.servidor_activo)
        self.assertIn("NO instalado", estado.mensaje)

    @patch.object(M, "_buscar_binario", return_value=Path("/fake/bin/TurboFieldfareServer"))
    @patch.object(M, "_buscar_modelo", return_value=Path("/fake/model.gturbo"))
    @patch.object(M, "_macos_version", return_value=(26, 0))
    @patch.object(M, "_memoria_libre_gb", return_value=8.0)
    @patch.object(M, "_puerto_ocupado", return_value=False)
    @patch.object(M, "_servidor_responde", return_value=True)
    def test_instalado_y_activo(self, *_mocks):
        estado = M.obtener_estado()
        self.assertTrue(estado.instalado)
        self.assertTrue(estado.macos_ok)
        self.assertTrue(estado.servidor_activo)
        self.assertIn("ACTIVO", estado.mensaje)


class TestPuertoOcupado(unittest.TestCase):
    """Prueba _puerto_ocupado con socket mock."""

    @patch("socket.create_connection")
    def test_puerto_libre(self, mock_conn):
        mock_conn.side_effect = ConnectionRefusedError
        self.assertFalse(M._puerto_ocupado())

    @patch("socket.create_connection")
    def test_puerto_ocupado(self, mock_conn):
        mock_conn.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_conn.return_value.__exit__ = MagicMock(return_value=False)
        self.assertTrue(M._puerto_ocupado())


class TestServidorResponde(unittest.TestCase):
    """Prueba _servidor_responde con urllib mock."""

    @patch("urllib.request.urlopen")
    def test_responde_ok(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp
        self.assertTrue(M._servidor_responde())

    @patch("urllib.request.urlopen")
    def test_responde_error(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 500
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp
        self.assertFalse(M._servidor_responde())

    @patch("urllib.request.urlopen")
    def test_excepcion_red(self, mock_urlopen):
        mock_urlopen.side_effect = Exception("network error")
        self.assertFalse(M._servidor_responde())


class TestEncontrarProcesoServidor(unittest.TestCase):
    """Prueba _encontrar_proceso_servidor con subprocess mock."""

    @patch("subprocess.run")
    def test_encontrado(self, mock_run):
        mock_run.side_effect = [
            MagicMock(stdout="1234\n", stderr=""),  # lsof
            MagicMock(stdout="TurboFieldfareServer\n", stderr=""),  # ps
        ]
        pid = M._encontrar_proceso_servidor()
        self.assertEqual(pid, 1234)

    @patch("subprocess.run")
    def test_no_encontrado_lsof_vacio(self, mock_run):
        mock_run.return_value = MagicMock(stdout="", stderr="")
        pid = M._encontrar_proceso_servidor()
        self.assertIsNone(pid)

    @patch("subprocess.run")
    def test_proceso_distinto_en_puerto(self, mock_run):
        mock_run.side_effect = [
            MagicMock(stdout="5678\n", stderr=""),  # lsof
            MagicMock(stdout="otro_proceso\n", stderr=""),  # ps
        ]
        pid = M._encontrar_proceso_servidor()
        self.assertIsNone(pid)


if __name__ == "__main__":
    unittest.main()