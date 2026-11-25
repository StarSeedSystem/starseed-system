"""Pruebas de `cloudroom_config`: configuración y validación de Cloudroom (CAP1119).
Todo puro: sin room-cli real, sin red, sin disco salvo carpeta temporal."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import cloudroom_config as CC  # noqa: E402


CONFIG_DEFAULTS = {
    "simultaneos": {"nvidia": 2, "xkiro": 2, "gemini": 1, "mistral": 1},
    "claves": {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY", "gemini": "GEMINI_API_KEY", "mistral": "MISTRAL_API_KEY"},
    "modelos": ["nvidia/z-ai/glm-5.3", "nvidia/deepseek-v4-pro", "xkiro/qwen3-coder-plus", "xkiro/minimax-m3", "gemini/gemini-3.6-flash", "mistral/devstral-medium-latest"],
}


class ConfigArchivo(unittest.TestCase):
    def test_ruta_por_defecto(self):
        self.assertTrue(CC.RUTA_CONFIG.endswith("config/cloudroom-pi-modelos.json"))

    def test_lee_config_valida(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "pi.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(CONFIG_DEFAULTS, f)
            cfg = CC.leer_config(ruta)
            self.assertEqual(cfg["simultaneos"], CONFIG_DEFAULTS["simultaneos"])
            self.assertEqual(cfg["claves"], CONFIG_DEFAULTS["claves"])
            self.assertEqual(cfg["modelos"], CONFIG_DEFAULTS["modelos"])

    def test_tolera_archivo_faltante(self):
        cfg = CC.leer_config("/nonexistent/pi.json")
        self.assertEqual(cfg, {})

    def test_tolera_json_invalido(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "pi.json")
            with open(ruta, "w", encoding="utf-8") as f:
                f.write("{ invalid }")
            cfg = CC.leer_config(ruta)
            self.assertEqual(cfg, {})

    def test_filtra_simultaneos_invalidos(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "pi.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({"simultaneos": {"nvidia": 2, "xkiro": True, "mal": -1, "groq": 0, "nvidia2": "dos"}}, f)
            cfg = CC.leer_config(ruta)
            self.assertEqual(cfg["simultaneos"], {"nvidia": 2, "groq": 0})

    def test_filtra_claves_invalidas(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "pi.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({"claves": {"nvidia": "NVIDIA_API_KEY", "mistral": "", "xkiro": 3, "gemini": "GEMINI_API_KEY"}}, f)
            cfg = CC.leer_config(ruta)
            self.assertEqual(cfg["claves"], {"nvidia": "NVIDIA_API_KEY", "gemini": "GEMINI_API_KEY"})

    def test_filtra_modelos_invalidos(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "pi.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({"modelos": ["nvidia/z-ai/glm-5.3", "", 3, "xkiro/qwen3-coder-plus", None]}, f)
            cfg = CC.leer_config(ruta)
            self.assertEqual(cfg["modelos"], ["nvidia/z-ai/glm-5.3", "xkiro/qwen3-coder-plus"])


class Simultaneos(unittest.TestCase):
    def test_extrae_topes_validos(self):
        cfg = {"simultaneos": {"nvidia": 2, "xkiro": 2, "gemini": 1}}
        self.assertEqual(CC.simultaneos(cfg), {"nvidia": 2, "xkiro": 2, "gemini": 1})

    def test_vacio_si_no_hay(self):
        self.assertEqual(CC.simultaneos({}), {})
        self.assertEqual(CC.simultaneos({"simultaneos": "no-dict"}), {})


class Claves(unittest.TestCase):
    def test_extrae_nombres_validos(self):
        cfg = {"claves": {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"}}
        self.assertEqual(CC.claves(cfg), {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"})

    def test_vacio_si_no_hay(self):
        self.assertEqual(CC.claves({}), {})


class Modelos(unittest.TestCase):
    def test_extrae_modelos_validos(self):
        cfg = {"modelos": ["nvidia/z-ai/glm-5.3", "xkiro/qwen3-coder-plus"]}
        self.assertEqual(CC.modelos(cfg), ["nvidia/z-ai/glm-5.3", "xkiro/qwen3-coder-plus"])

    def test_vacio_si_no_hay(self):
        self.assertEqual(CC.modelos({}), [])


class ProveedorModelo(unittest.TestCase):
    def test_prefijo_proveedor(self):
        self.assertEqual(CC.proveedor_de("nvidia/z-ai/glm-5.3"), "nvidia")
        self.assertEqual(CC.proveedor_de("xkiro/qwen3-coder-plus"), "xkiro")
        self.assertEqual(CC.proveedor_de("gemini/gemini-3.6-flash"), "gemini")
        self.assertEqual(CC.proveedor_de("mistral/devstral-medium"), "mistral")

    def test_sin_barra_vacio(self):
        self.assertEqual(CC.proveedor_de("modelo-sin-barra"), "")


class Validacion(unittest.TestCase):
    def setUp(self):
        self.config = CONFIG_DEFAULTS.copy()

    def test_valida_config_completa(self):
        ok, errores = CC.validar_config(self.config)
        self.assertTrue(ok)
        self.assertEqual(errores, [])

    def test_falta_simultaneos(self):
        cfg = {k: v for k, v in self.config.items() if k != "simultaneos"}
        ok, errores = CC.validar_config(cfg)
        self.assertFalse(ok)
        self.assertIn("simultaneos", str(errores))

    def test_falta_claves(self):
        cfg = {k: v for k, v in self.config.items() if k != "claves"}
        ok, errores = CC.validar_config(cfg)
        self.assertFalse(ok)
        self.assertIn("claves", str(errores))

    def test_falta_modelos(self):
        cfg = {k: v for k, v in self.config.items() if k != "modelos"}
        ok, errores = CC.validar_config(cfg)
        self.assertFalse(ok)
        self.assertIn("modelos", str(errores))

    def test_modelo_sin_clave_en_config(self):
        cfg = dict(self.config)
        cfg["modelos"] = ["nvidia/z-ai/glm-5.3", "proveedor_nuevo/modelo"]
        ok, errores = CC.validar_config(cfg)
        self.assertFalse(ok)
        self.assertIn("proveedor_nuevo", str(errores))

    def test_modelo_sin_tope_en_config(self):
        cfg = dict(self.config)
        cfg["modelos"] = ["nvidia/z-ai/glm-5.3", "proveedor_nuevo/modelo"]
        cfg["claves"]["proveedor_nuevo"] = "NUEVA_KEY"
        ok, errores = CC.validar_config(cfg)
        self.assertFalse(ok)
        self.assertIn("proveedor_nuevo", str(errores))


class CompatibilidadNube(unittest.TestCase):
    def test_modelos_con_clave_en_nube(self):
        declarados = ["nvidia/z-ai/glm-5.3", "xkiro/qwen3-coder-plus", "gemini/gemini-3.6-flash", "mistral/devstral-medium"]
        claves = {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY", "gemini": "GEMINI_API_KEY", "mistral": "MISTRAL_API_KEY"}
        nombres_nube = {"NVIDIA_API_KEY", "GEMINI_API_KEY"}
        disponibles = CC.modelos_con_clave_nube(declarados, claves, nombres_nube)
        self.assertEqual(disponibles, ["nvidia/z-ai/glm-5.3", "gemini/gemini-3.6-flash"])

    def test_sin_nombres_nube_no_filtra(self):
        declarados = ["nvidia/z-ai/glm-5.3", "xkiro/qwen3-coder-plus"]
        claves = {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"}
        disponibles = CC.modelos_con_clave_nube(declarados, claves, None)
        self.assertEqual(disponibles, declarados)

    def test_modelo_sin_clave_declarada_se_mantiene(self):
        declarados = ["nvidia/z-ai/glm-5.3", "otro/modelo"]
        claves = {"nvidia": "NVIDIA_API_KEY"}
        nombres_nube = {"NVIDIA_API_KEY"}
        disponibles = CC.modelos_con_clave_nube(declarados, claves, nombres_nube)
        self.assertEqual(disponibles, ["nvidia/z-ai/glm-5.3", "otro/modelo"])


class Sondeo(unittest.TestCase):
    def test_cli_encontrado(self):
        with mock.patch("shutil.which", return_value="/usr/local/bin/room-cli"):
            self.assertEqual(CC.cli_path(), "/usr/local/bin/room-cli")

    def test_cli_en_path(self):
        with mock.patch("shutil.which", return_value="room-cli"):
            with mock.patch.dict(os.environ, {}, clear=True):
                self.assertEqual(CC.cli_path(), "room-cli")

    def test_cli_en_local_bin(self):
        with mock.patch("shutil.which", return_value=None):
            with mock.patch.dict(os.environ, {}, clear=True):
                with mock.patch("os.path.isfile", return_value=True):
                    self.assertEqual(CC.cli_path(), os.path.expanduser("~/.local/bin/room-cli"))

    def test_cli_no_encontrado(self):
        with mock.patch("shutil.which", return_value=None):
            with mock.patch.dict(os.environ, {}, clear=True):
                with mock.patch("os.path.isfile", return_value=False):
                    self.assertEqual(CC.cli_path(), "")


class Estado(unittest.TestCase):
    def test_interpretar_sin_cli(self):
        estado = CC.interpretar(None, None, errores=("app sin instalar",))
        self.assertEqual(estado["estado"], "no_disponible")
        self.assertIn("instalar", estado["detalle"])

    def test_interpretar_sin_local_con_nube_ok(self):
        nube = {"ready": True, "account": "test"}
        estado = CC.interpretar(None, nube, errores=("timeout",))
        self.assertEqual(estado["estado"], "usable")

    def test_interpretar_sin_nube(self):
        local = {"status": "ok"}
        estado = CC.interpretar(local, None, errores=("sin cloud",))
        self.assertEqual(estado["estado"], "requiere_alex")

    def test_interpretar_sin_login(self):
        local = {"status": "ok"}
        nube = {"authenticated": False, "user": None}
        estado = CC.interpretar(local, nube)
        self.assertEqual(estado["estado"], "requiere_alex")
        self.assertIn("sesión", estado["detalle"])

    def test_interpretar_ok_con_hilos(self):
        local = {"status": "ok"}
        nube = {"authenticated": True, "user": "test"}
        hilos = {"count": 3}
        estado = CC.interpretar(local, nube, hilos)
        self.assertEqual(estado["estado"], "usable")
        self.assertIn("3 hilo", estado["detalle"])


class CLI(unittest.TestCase):
    def test_validar_config_existente(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "pi.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(CONFIG_DEFAULTS, f)
            with mock.patch.object(CC, "RUTA_CONFIG", ruta):
                with mock.patch("sys.argv", ["cloudroom_config.py", "validar"]):
                    with mock.patch("builtins.print") as mprint:
                        CC.main()
                        mprint.assert_called()
                        # Verificar que se imprimió "válida" en alguna de las llamadas
                        all_output = " ".join(str(call[0][0]) for call in mprint.call_args_list)
                        self.assertIn("válida", all_output)

    def test_validar_config_faltante(self):
        with mock.patch.object(CC, "RUTA_CONFIG", "/nonexistent/pi.json"):
            with mock.patch("sys.argv", ["cloudroom_config.py", "validar"]):
                with mock.patch("builtins.print") as mprint:
                    CC.main()
                    all_output = " ".join(str(call[0][0]) for call in mprint.call_args_list)
                    self.assertIn("no encontrado", all_output)

    def test_sin_comando_muestra_ayuda(self):
        with mock.patch("sys.argv", ["cloudroom_config.py"]):
            with mock.patch("builtins.print") as mprint:
                CC.main()
                mprint.assert_called()
                args = mprint.call_args[0][0]
                self.assertIn("uso:", args.lower())


if __name__ == "__main__":
    unittest.main()