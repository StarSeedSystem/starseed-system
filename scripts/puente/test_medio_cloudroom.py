"""Pruebas puras de la sonda Cloudroom; nunca ejecuta room-cli."""
import os, subprocess, sys, tempfile, unittest
from unittest import mock
sys.path.insert(0, os.path.dirname(__file__))
import medio_cloudroom as M
from medio_cloudroom import interpretar


def proceso(orden, codigo, salida, error=""):
    return subprocess.CompletedProcess(orden, codigo, salida, error)

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
        with tempfile.TemporaryDirectory() as casa:
            ruta = os.path.join(casa, "room-cli")
            open(ruta, "w").close()
            sin_which = lambda nombre: self.fail("el env válido no debe consultar el PATH")
            self.assertEqual(M.cli_path({"CLOUDROOM_CLI": ruta}, sin_which), ruta)

    def test_busca_en_local_bin_y_respeta_la_ausencia(self):
        with tempfile.TemporaryDirectory() as casa:
            carpeta = os.path.join(casa, ".local", "bin")
            os.makedirs(carpeta)
            ruta = os.path.join(carpeta, "room-cli")
            open(ruta, "w").close()
            con = mock.patch("os.path.expanduser", lambda _: os.path.join(carpeta, "room-cli"))
            sin = mock.patch("os.path.expanduser", lambda _: os.path.join(casa, "otra", "room-cli"))
            with con:
                self.assertEqual(M.cli_path({"CLOUDROOM_CLI": ""}, lambda _: ""), ruta)
            with sin:
                self.assertEqual(M.cli_path({"CLOUDROOM_CLI": ""}, lambda _: ""), "")

    def test_medio_lleva_id_y_hilos_abiertos(self):
        r = interpretar({"running": True}, {"authenticated": True}, {"count": 4})
        self.assertEqual(r["id"], "cloudroom")
        self.assertEqual(r["estado"], "usable")
        self.assertIn("4 hilo(s) abierto(s)", r["detalle"])
        # unos hilos que no llegan como objeto no rompen la lectura
        self.assertEqual(interpretar({"running": True}, {"authenticated": True}, "")["estado"], "usable")

    def test_sondea_los_tres_comandos_con_json(self):
        ordenes = []
        def falso(orden, timeout=None, **kw):
            ordenes.append((orden, timeout))
            salidas = {
                ("status", "--json"): '{"running": true}',
                ("cloud", "status", "--json"): '{"authenticated": true}',
                ("thread", "count", "--json"): '{"count": 2}',
            }
            return proceso(orden, 0, salidas[tuple(orden[1:])])
        con_cli = mock.patch.object(M, "cli_path", lambda env=None: "room-cli-falso")
        with con_cli:
            d = M.sondear(run=falso, env={"CLOUDROOM_CLI": ""})
        self.assertEqual([o for o, _ in ordenes], [
            ["room-cli-falso", "status", "--json"],
            ["room-cli-falso", "cloud", "status", "--json"],
            ["room-cli-falso", "thread", "count", "--json"],
        ])
        self.assertTrue(all(t == 15 for _, t in ordenes))
        self.assertEqual(d["estado"], "usable")

    def test_sin_room_cli_no_ejecuta_nada(self):
        llamadas = []
        def falso(*a, **kw):
            llamadas.append(a)
            return proceso([], 0, "{}")
        sin_cli = mock.patch.object(M, "cli_path", lambda env=None: "")
        with sin_cli:
            d = M.sondear(run=falso, env={"CLOUDROOM_CLI": ""})
        self.assertEqual(d["estado"], "no_disponible")
        self.assertEqual(d["detalle"], "app sin instalar")
        self.assertEqual(llamadas, [])

    def test_si_falla_cloud_status_no_dice_usable(self):
        def falso(orden, timeout=None, **kw):
            if orden[1:] == ["status", "--json"]:
                return proceso(orden, 0, '{"running": true}')
            return proceso(orden, 1, "", "")
        con_cli = mock.patch.object(M, "cli_path", lambda env=None: "room-cli-falso")
        with con_cli:
            d = M.sondear(run=falso, env={"CLOUDROOM_CLI": ""})
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertEqual(d["detalle"], "comando fallido")
        self.assertIn("inicia sesión", d["siguiente_paso"])

if __name__ == "__main__":
    unittest.main()
