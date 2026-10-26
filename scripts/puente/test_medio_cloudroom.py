"""Pruebas puras de la sonda Cloudroom; nunca ejecuta room-cli."""
import os, sys, tempfile, unittest
from types import SimpleNamespace
from unittest import mock
sys.path.insert(0, os.path.dirname(__file__))
import medio_cloudroom as M
from medio_cloudroom import interpretar

def falso_run(respuestas):
    """Simula `subprocess.run`: devuelve el resultado de la orden n-ésima y apunta lo pedido."""
    ordenes = []

    def correr(orden, capture_output=None, text=None, timeout=None):
        ordenes.append((orden, timeout))
        rc, salida, error = respuestas[min(len(ordenes), len(respuestas)) - 1]
        return SimpleNamespace(returncode=rc, stdout=salida, stderr=error)

    return correr, ordenes

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


class LocalizarCli(unittest.TestCase):
    def test_la_variable_de_entorno_manda_si_el_binario_existe(self):
        with tempfile.TemporaryDirectory() as casa:
            cli = os.path.join(casa, "room-cli")
            open(cli, "w").close()
            ruta = M.cli_path({"CLOUDROOM_CLI": cli}, which=lambda _: self.fail("no debe mirar el PATH"))
            self.assertEqual(ruta, cli)

    def test_busca_en_local_bin_y_respeta_la_ausencia(self):
        with tempfile.TemporaryDirectory() as casa:
            bin_dir = os.path.join(casa, ".local", "bin")
            os.makedirs(bin_dir)
            ruta = os.path.join(bin_dir, "room-cli")
            open(ruta, "w").close()
            with mock.patch.dict(os.environ, {"HOME": casa}):
                self.assertEqual(M.cli_path({"PATH": ""}, which=lambda _: None), ruta)
            with tempfile.TemporaryDirectory() as vacia, mock.patch.dict(os.environ, {"HOME": vacia}):
                self.assertEqual(M.cli_path({"PATH": ""}, which=lambda _: None), "")


class Sondear(unittest.TestCase):
    def test_sin_cli_no_ejecuta_nada(self):
        llamado = []
        with mock.patch.object(M, "cli_path", return_value=""):
            d = M.sondear(run=lambda *a, **k: llamado.append(a), env={"PATH": ""})
        self.assertEqual(llamado, [])
        self.assertEqual(d["estado"], "no_disponible")
        self.assertIn("app sin instalar", d["detalle"])

    def test_sondea_los_tres_comandos_con_json_y_timeout(self):
        with tempfile.TemporaryDirectory() as casa:
            cli = os.path.join(casa, "room-cli")
            open(cli, "w").close()
            correr, ordenes = falso_run([
                (0, '{"port":5123}', ""),
                (0, '{"account":"alex"}', ""),
                (0, '{"count":2}', ""),
            ])
            d = M.sondear(run=correr, env={"CLOUDROOM_CLI": cli})
        self.assertEqual([o for o, _ in ordenes], [
            [cli, "status", "--json"],
            [cli, "cloud", "status", "--json"],
            [cli, "thread", "count", "--json"],
        ])
        self.assertTrue(all(t == 15 for _, t in ordenes))
        self.assertEqual(d["estado"], "usable")
        self.assertIn("2 hilo(s) abierto(s)", d["detalle"])

    def test_si_falla_cloud_status_no_dice_usable(self):
        with tempfile.TemporaryDirectory() as casa:
            cli = os.path.join(casa, "room-cli")
            open(cli, "w").close()
            correr, _ = falso_run([
                (0, '{"port":5123}', ""),
                (1, "", "sin iniciar sesión"),
                (0, '{"count":2}', ""),
            ])
            d = M.sondear(run=correr, env={"CLOUDROOM_CLI": cli})
        self.assertEqual(d["estado"], "requiere_alex")

    def test_un_cloud_status_ausente_conserva_el_motivo_real(self):
        r = interpretar({"port": 5123}, None, None, ("", "sin iniciar sesión"))
        self.assertEqual(r["estado"], "requiere_alex")
        self.assertIn("sin iniciar sesión", r["detalle"])

if __name__ == "__main__":
    unittest.main()
