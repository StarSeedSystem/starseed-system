"""Pruebas puras de la sonda Cloudroom; nunca ejecuta room-cli."""
import os, sys, tempfile, unittest
from unittest.mock import patch
sys.path.insert(0, os.path.dirname(__file__))
from medio_cloudroom import cli_path, interpretar, sondear

class SondaCloudroom(unittest.TestCase):
    def test_sesion_con_cupo_y_hilos(self):
        r = interpretar({"running": True}, {"authenticated": True}, {"count": 2})
        self.assertEqual(r["estado"], "usable")
        self.assertIn("100 agentes", r["capacidad"])
        self.assertIn("2 hilo", r["detalle"])

    def test_sin_sesion_no_es_usable(self):
        r = interpretar({}, {"authenticated": False})
        self.assertEqual(r["estado"], "requiere_alex")
        self.assertIn("sin iniciar sesión", r["detalle"])

    def test_app_ausente_es_honesto(self):
        r = interpretar(None, None, errores=("app sin instalar",))
        self.assertEqual(r["estado"], "no_disponible")
        self.assertEqual(r["detalle"], "app sin instalar")

    def test_respuesta_invalida_no_se_infiere_como_conectada(self):
        r = interpretar({}, "no-json")
        self.assertEqual(r["estado"], "no_disponible")
        self.assertEqual(r["detalle"], "respuesta inválida de room-cli cloud status")

    def test_variable_de_entorno_manda(self):
        with patch("os.path.isfile", return_value=True):
            self.assertEqual(cli_path({"CLOUDROOM_CLI": "/opt/room-cli"}, which=lambda _: "/fallback"), "/opt/room-cli")

    def test_busca_en_local_bin_y_respeta_la_ausencia(self):
        with tempfile.TemporaryDirectory() as casa:
            bin_dir = os.path.join(casa, ".local", "bin")
            os.makedirs(bin_dir)
            ruta = os.path.join(bin_dir, "room-cli")
            with open(ruta, "w") as f:
                f.write("")
            def expanduser_mock(path):
                if path == "~/.local/bin/room-cli":
                    return ruta
                return os.path.expanduser(path)
            with patch("os.path.expanduser", side_effect=expanduser_mock):
                with patch("os.path.isfile", lambda p: p == ruta):
                    self.assertEqual(cli_path({}, which=lambda _: None), ruta)
        # Sin archivo en ~/.local/bin -> cadena vacía
        with patch("os.path.expanduser", return_value="/nonexistent/.local/bin/room-cli"):
            with patch("os.path.isfile", return_value=False):
                self.assertEqual(cli_path({}, which=lambda _: None), "")

    def test_sin_room_cli_no_ejecuta_nada(self):
        d = sondear(env={}, run=lambda *a, **k: (_ for _ in ()).throw(FileNotFoundError()))
        self.assertEqual(d["estado"], "no_disponible")
        self.assertIn("app sin instalar", d["detalle"])

    def test_sondea_los_tres_comandos_con_json(self):
        ordenes = []
        def falso(orden, timeout=15, capture_output=True, text=True):
            ordenes.append((orden, timeout))
            if orden[1:] == ["status", "--json"]:
                return type("P", (), {"returncode": 0, "stdout": '{"port":5123}', "stderr": ""})()
            if orden[1:] == ["cloud", "status", "--json"]:
                return type("P", (), {"returncode": 0, "stdout": '{"account":"alex"}', "stderr": ""})()
            return type("P", (), {"returncode": 0, "stdout": '{"count":2}', "stderr": ""})()
        with patch("os.path.isfile", return_value=True):
            d = sondear(run=falso, env={"CLOUDROOM_CLI": "room-cli"})
        self.assertEqual([o for o, _ in ordenes], [
            ["room-cli", "status", "--json"],
            ["room-cli", "cloud", "status", "--json"],
            ["room-cli", "thread", "count", "--json"],
        ])
        self.assertTrue(all(t == 15 for _, t in ordenes))
        self.assertEqual(d["estado"], "usable")

    def test_si_falla_cloud_status_no_dice_usable(self):
        def falso(orden, timeout=15, capture_output=True, text=True):
            if orden[1:] == ["status", "--json"]:
                return type("P", (), {"returncode": 0, "stdout": '{"port":5123}', "stderr": ""})()
            return type("P", (), {"returncode": 1, "stdout": "", "stderr": "comando fallido"})()
        with patch("os.path.isfile", return_value=True):
            d = sondear(run=falso, env={"CLOUDROOM_CLI": "room-cli"})
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("comando fallido", d["detalle"])

if __name__ == "__main__":
    unittest.main()
