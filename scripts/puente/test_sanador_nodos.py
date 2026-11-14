#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de sanador_nodos: recetas Mac↔A1 y autoservicio, sin red."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sanador_nodos as SN


class SanadorNodosTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.tmp_dir = Path(self.t.name) / "tmp"
        self.tmp_dir.mkdir(parents=True)
        self.canal_claves = Path(self.t.name) / "canal_claves.json"
        self.aprobaciones = Path(self.t.name) / "aprobaciones.json"
        self.logs = []

    def tearDown(self):
        self.t.cleanup()

    def _deps_mac_a1(self, **cambios):
        """Deps para receta_mac_a1_notebooklm (sin enviar_canal, ahora, log que pasan los tests)."""
        base = {}
        base.update(cambios)
        return base

    def _deps_a1_import(self, **cambios):
        """Deps para receta_a1_importar_cookies (sin recibir_canal, log que pasan los tests)."""
        base = {}
        base.update(cambios)
        return base

    def _deps_autoservicio(self, **cambios):
        """Deps para receta_autoservicio_mac (llama a mac_a1 internamente, sin enviar_canal, ahora, log)."""
        base = {}
        base.update(cambios)
        return base

    def test_receta_mac_a1_ejecuta_login_y_envia(self):
        """receta_mac_a1_notebooklm ejecuta login y envía cookies por el canal."""
        storage_state = {"cookies": [{"name": "test", "value": "val", "domain": ".google.com"}]}
        tmp_written = {}

        def ejecutar_mock(argv, timeout=30):
            if argv[0] == "notebooklm" and argv[1] == "login":
                tmp_path = [a for a in argv if a.startswith("/tmp") or a.startswith("/var")][0]
                Path(tmp_path).write_text(json.dumps(storage_state))
            return (0, "ok")

        def enviar_mock(payload):
            tmp_written["payload"] = payload
            return {"ok": True}

        r = SN.receta_mac_a1_notebooklm(
            ejecutar=ejecutar_mock,
            enviar_canal=enviar_mock,
            **self._deps_mac_a1()
        )
        self.assertTrue(r["ok"])
        self.assertIn("cookies", r["detalle"])
        self.assertEqual(tmp_written["payload"]["tipo"], "notebooklm_cookies")
        self.assertEqual(len(tmp_written["payload"]["cookies"]), 1)

    def test_receta_mac_a1_falla_si_login_falla(self):
        """Si login falla, devuelve error y no envía nada."""
        enviados = []

        def ejecutar_mock(argv, timeout=30):
            return (1, "login failed")

        def enviar_mock(payload):
            enviados.append(payload)
            return {"ok": True}

        r = SN.receta_mac_a1_notebooklm(
            ejecutar=ejecutar_mock,
            enviar_canal=enviar_mock,
            **self._deps_mac_a1()
        )
        self.assertFalse(r["ok"])
        self.assertEqual(enviados, [])

    def test_receta_mac_a1_borra_tmp_siempre(self):
        """El tmp se borra tanto en éxito como en fallo."""
        tmp_files = []

        def ejecutar_mock(argv, timeout=30):
            if argv[0] == "notebooklm" and argv[1] == "login":
                tmp_path = [a for a in argv if a.startswith("/tmp") or a.startswith("/var")][0]
                tmp_files.append(tmp_path)
                Path(tmp_path).write_text(json.dumps({"cookies": [{"name": "x"}]}) )
            return (0, "ok")

        r = SN.receta_mac_a1_notebooklm(
            ejecutar=ejecutar_mock,
            enviar_canal=lambda p: {"ok": True},
            **self._deps_mac_a1()
        )
        self.assertTrue(r["ok"])
        for f in tmp_files:
            self.assertFalse(Path(f).exists(), f"tmp no borrado: {f}")

    def test_receta_a1_importar_cookies_importa_y_verifica(self):
        """receta_a1_importar_cookies lee del canal, importa y hace auth check."""
        payload = {
            "tipo": "notebooklm_cookies",
            "cookies": [{"name": "session", "value": "abc", "domain": ".google.com"}],
        }
        comandos = []

        def ejecutar_mock(argv, timeout=30):
            comandos.append(argv)
            return (0, "ok")

        def recibir_mock():
            return payload

        r = SN.receta_a1_importar_cookies(
            ejecutar=ejecutar_mock,
            recibir_canal=recibir_mock,
            **self._deps_a1_import()
        )
        self.assertTrue(r["ok"])
        self.assertTrue(any("import-cookies" in " ".join(c) for c in comandos))
        self.assertTrue(any("auth check" in " ".join(c) for c in comandos))

    def test_receta_a1_importar_falla_sin_payload(self):
        """Si no hay payload en el canal, devuelve error."""
        r = SN.receta_a1_importar_cookies(
            ejecutar=lambda *a, **k: (0, "ok"),
            recibir_canal=lambda: None,
            **self._deps_a1_import()
        )
        self.assertFalse(r["ok"])
        self.assertIn("payload", r["motivo"])

    def test_receta_a1_importar_borra_tmp_import(self):
        """El tmp de import se borra tras usarse."""
        payload = {"tipo": "notebooklm_cookies", "cookies": [{"name": "x", "value": "y"}]}
        tmp_files = []

        def ejecutar_mock(argv, timeout=30):
            if "import-cookies" in " ".join(argv):
                tmp_path = argv[-1]
                tmp_files.append(tmp_path)
            return (0, "ok")

        r = SN.receta_a1_importar_cookies(
            ejecutar=ejecutar_mock,
            recibir_canal=lambda: payload,
            **self._deps_a1_import()
        )
        self.assertTrue(r["ok"])
        for f in tmp_files:
            self.assertFalse(Path(f).exists())

    def test_receta_autoservicio_con_master_token(self):
        """Si hay token maestro aprobado, usa --master-token."""
        # Escribir aprobaciones en la ruta que leerá la función (bajo _raiz_def)
        aprob_path = Path(self.t.name) / "starseed_memory_root" / "salud" / "aprobaciones.json"
        aprob_path.parent.mkdir(parents=True, exist_ok=True)
        aprob_path.write_text(json.dumps({"notebooklm_master_token": True}))
        comandos = []

        def ejecutar_mock(argv, timeout=30):
            comandos.append(argv)
            if argv[0] == "notebooklm" and argv[1] == "login" and "--storage" in argv:
                for i, arg in enumerate(argv):
                    if arg == "--storage" and i + 1 < len(argv):
                        Path(argv[i + 1]).write_text(json.dumps({"cookies": [{"name": "test", "value": "val"}]}))
                        break
            return (0, "ok")

        with patch.object(SN, "_raiz_def", lambda: Path(self.t.name)):
            r = SN.receta_autoservicio_mac(
                ejecutar=ejecutar_mock,
                **self._deps_autoservicio(
                    enviar_canal=lambda p: {"ok": True},
                    ahora=lambda: 1234567890.0,
                )
            )
        self.assertTrue(r["ok"])
        self.assertTrue(any("--master-token" in " ".join(c) for c in comandos))

    def test_receta_autoservicio_sin_master_token(self):
        """Si no hay token maestro, usa --browser chrome."""
        self.aprobaciones.write_text(json.dumps({}))
        comandos = []

        def ejecutar_mock(argv, timeout=30):
            comandos.append(argv)
            if argv[0] == "notebooklm" and argv[1] == "login" and "--storage" in argv:
                for i, arg in enumerate(argv):
                    if arg == "--storage" and i + 1 < len(argv):
                        Path(argv[i + 1]).write_text(json.dumps({"cookies": [{"name": "test", "value": "val"}]}))
                        break
            return (0, "ok")

        with patch.object(SN, "_raiz_def", lambda: Path(self.t.name)):
            r = SN.receta_autoservicio_mac(
                ejecutar=ejecutar_mock,
                **self._deps_autoservicio(
                    enviar_canal=lambda p: {"ok": True},
                    ahora=lambda: 1234567890.0,
                )
            )
        self.assertTrue(r["ok"])
        self.assertTrue(any("--browser chrome" in " ".join(c) for c in comandos))

    def test_receta_autoservicio_falla_si_login_falla(self):
        """Si login falla, devuelve error."""
        def ejecutar_mock(argv, timeout=30):
            return (1, "login failed")

        with patch.object(SN, "_raiz_def", lambda: Path(self.t.name)):
            r = SN.receta_autoservicio_mac(
                ejecutar=ejecutar_mock,
                **self._deps_autoservicio()
            )
        self.assertFalse(r["ok"])

    def test_cli_mac_a1(self):
        """CLI mac-a1 llama a la receta correcta."""
        salida = MagicMock()

        def ejecutar_mock(argv, timeout=30):
            if argv[0] == "notebooklm" and argv[1] == "login":
                for i, arg in enumerate(argv):
                    if arg == "--storage" and i + 1 < len(argv):
                        Path(argv[i + 1]).write_text(json.dumps({"cookies": [{"name": "test", "value": "val"}]}))
                        break
            return (0, "ok")

        with patch.object(SN, "_raiz_def", lambda: Path(self.t.name)):
            r = SN.main(["mac-a1"], salida=salida, **self._deps_mac_a1(
                ejecutar=ejecutar_mock,
                enviar_canal=lambda p: {"ok": True},
                ahora=lambda: 1234567890.0,
            ))
        self.assertEqual(r, 0)
        # Verificar que salida.write fue llamado con el mensaje de éxito
        self.assertTrue(salida.write.called)
        # El mensaje de éxito contiene "cookies"
        args, _ = salida.write.call_args
        self.assertIn("cookies", args[0])

    def test_cli_a1_import(self):
        """CLI a1-import llama a la receta correcta."""
        salida = MagicMock()
        r = SN.main(["a1-import"], salida=salida, **self._deps_a1_import(
            ejecutar=lambda *a, **k: (0, "ok"),
            recibir_canal=lambda: {"tipo": "notebooklm_cookies", "cookies": [{"name": "x"}]},
        ))
        self.assertEqual(r, 0)

    def test_cli_autoservicio(self):
        """CLI autoservicio llama a la receta correcta."""
        salida = MagicMock()

        def ejecutar_mock(argv, timeout=30):
            if argv[0] == "notebooklm" and argv[1] == "login" and "--storage" in argv:
                for i, arg in enumerate(argv):
                    if arg == "--storage" and i + 1 < len(argv):
                        Path(argv[i + 1]).write_text(json.dumps({"cookies": [{"name": "test", "value": "val"}]}))
                        break
            return (0, "ok")

        with patch.object(SN, "_raiz_def", lambda: Path(self.t.name)):
            self.aprobaciones.write_text(json.dumps({}))
            r = SN.main(["autoservicio"], salida=salida, **self._deps_autoservicio(
                ejecutar=ejecutar_mock,
                enviar_canal=lambda p: {"ok": True},
                ahora=lambda: 1234567890.0,
            ))
        self.assertEqual(r, 0)

    def test_cli_comando_desconocido(self):
        """CLI con comando desconocido devuelve error."""
        salida = MagicMock()
        r = SN.main(["noexiste"], salida=salida)
        self.assertEqual(r, 2)

    def test_sanitize_cookies_quita_campos_sensibles(self):
        """_sanitize_cookies solo deja campos permitidos."""
        cookies = [
            {"name": "a", "value": "b", "domain": "x", "path": "/", "expires": 1, "httpOnly": True, "secure": True, "sameSite": "Lax", "extra": "secret"},
            {"name": "c", "value": "d", "domain": "y", "otro": "token"},
        ]
        limpios = SN._sanitize_cookies(cookies)
        self.assertEqual(len(limpios), 2)
        for c in limpios:
            self.assertNotIn("extra", c)
            self.assertNotIn("otro", c)
            self.assertIn("name", c)
            self.assertIn("value", c)


if __name__ == "__main__":
    unittest.main()