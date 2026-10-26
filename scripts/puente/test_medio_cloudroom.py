"""Pruebas puras de la sonda Cloudroom; nunca ejecuta room-cli."""
import os, sys, tempfile, unittest
from types import SimpleNamespace
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
        with tempfile.TemporaryDirectory() as casa:
            ruta = os.path.join(casa, "room-cli")
            open(ruta, "w").close()
            self.assertEqual(cli_path({"CLOUDROOM_CLI": ruta}, which=lambda _: None), ruta)

    def test_sin_room_cli_no_ejecuta_nada(self):
        """Envío vacío y room-cli ausente en la máquina, con ~/.local/bin sin él."""
        self.assertEqual(cli_path({}), "")
        r = sondear(env={})
        self.assertEqual(r["estado"], "no_disponible")
        self.assertIn("app sin instalar", r["detalle"])

    def test_sondea_los_tres_comandos_con_json(self):
        ordenes = []

        def falso(orden, **kw):
            ordenes.append(orden)
            salida = '{"count":2}'
            if orden[1] == "cloud":
                salida = '{"account":"alex","authenticated":true}'
            elif orden[1] == "thread":
                salida = '{"count":2}'
            else:
                salida = '{"running":true}'
            return SimpleNamespace(returncode=0, stdout=salida, stderr="")

        with tempfile.TemporaryDirectory() as casa:
            ruta = os.path.join(casa, "room-cli")
            open(ruta, "w").close()
            d = sondear(run=falso, env={"CLOUDROOM_CLI": ruta})
        self.assertEqual(ordenes, [
            [ruta, "status", "--json"],
            [ruta, "cloud", "status", "--json"],
            [ruta, "thread", "count", "--json"],
        ])
        self.assertEqual(d["estado"], "usable")

    def test_si_falla_cloud_status_no_dice_usable(self):
        def falso(orden, **kw):
            if orden[1] == "cloud":
                return SimpleNamespace(returncode=1, stdout="", stderr="")
            return SimpleNamespace(returncode=0, stdout='{"running":true}', stderr="")

        with tempfile.TemporaryDirectory() as casa:
            ruta = os.path.join(casa, "room-cli")
            open(ruta, "w").close()
            d = sondear(run=falso, env={"CLOUDROOM_CLI": ruta})
        self.assertEqual(d["estado"], "requiere_alex")

if __name__ == "__main__":
    unittest.main()
