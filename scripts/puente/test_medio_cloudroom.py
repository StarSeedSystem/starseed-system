"""Pruebas puras de la sonda Cloudroom; nunca ejecuta room-cli."""
import json, os, sys, unittest
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import medio_cloudroom as M
from medio_cloudroom import interpretar

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
        ruta = os.path.abspath(__file__)
        self.assertEqual(M.cli_path({"CLOUDROOM_CLI": ruta}, which=lambda _: "/otro/room-cli"), ruta)
        self.assertEqual(M.cli_path({"CLOUDROOM_CLI": "/no/existe"}, which=lambda _: "/opt/room-cli"), "/opt/room-cli")

    def test_busca_en_local_bin_y_respeta_la_ausencia(self):
        local = "/casa/falsa/.local/bin/room-cli"
        with mock.patch.object(M.os.path, "expanduser", side_effect=lambda p: p.replace("~", "/casa/falsa")), \
             mock.patch.object(M.os.path, "isfile", side_effect=lambda p: p == local):
            self.assertEqual(M.cli_path({}, which=lambda _: ""), local)
        with mock.patch.object(M.os.path, "isfile", return_value=False):
            self.assertEqual(M.cli_path({}, which=lambda _: ""), "")

    def test_sin_room_cli_no_ejecuta_nada(self):
        llamadas = []
        with mock.patch.object(M, "cli_path", return_value=""):
            d = M.sondear(run=lambda *a, **k: llamadas.append((a, k)))
        self.assertEqual(llamadas, [])
        self.assertEqual(d["estado"], "no_disponible")
        self.assertIn("app sin instalar", d["detalle"])

    def test_sondea_los_tres_comandos_con_json(self):
        ordenes = []
        salidas = {
            ("status", "--json"): {"running": True},
            ("cloud", "status", "--json"): {"authenticated": True},
            ("thread", "count", "--json"): {"count": 4},
        }

        def correr(orden, **opciones):
            ordenes.append((orden, opciones))
            return SimpleNamespace(returncode=0, stdout=json.dumps(salidas[tuple(orden[1:])]), stderr="")

        ruta = os.path.abspath(__file__)
        d = M.sondear(run=correr, env={"CLOUDROOM_CLI": ruta})
        self.assertEqual([o for o, _ in ordenes], [
            [ruta, "status", "--json"],
            [ruta, "cloud", "status", "--json"],
            [ruta, "thread", "count", "--json"],
        ])
        self.assertTrue(all(op.get("timeout") == 15 for _, op in ordenes))
        self.assertEqual(d["estado"], "usable")
        self.assertIn("4 hilo(s)", d["detalle"])

    def test_si_falla_cloud_status_no_dice_usable(self):
        def correr(orden, **opciones):
            if orden[1:] == ["status", "--json"]:
                return SimpleNamespace(returncode=0, stdout='{"port": 5123}', stderr="")
            if orden[1:] == ["cloud", "status", "--json"]:
                return SimpleNamespace(returncode=1, stdout="", stderr="no autenticado")
            return SimpleNamespace(returncode=0, stdout='{"count": 2}', stderr="")

        d = M.sondear(run=correr, env={"CLOUDROOM_CLI": os.path.abspath(__file__)})
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertNotIn("cuenta conectada", d["detalle"])
        self.assertTrue(d["detalle"])

if __name__ == "__main__":
    unittest.main()
