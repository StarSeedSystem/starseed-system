"""Pruebas puras de la sonda Cloudroom; nunca ejecuta room-cli."""
import os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
from medio_cloudroom import cli_path, interpretar


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
        with tempfile.NamedTemporaryFile(delete=False) as f:
            ruta = f.name
        try:
            self.assertEqual(cli_path({ "CLOUDROOM_CLI": ruta }), ruta)
        finally:
            try:
                os.unlink(ruta)
            except Exception:
                pass

    def test_busca_en_local_bin_y_respeta_la_ausencia(self):
        with tempfile.TemporaryDirectory() as casa:
            os.makedirs(os.path.join(casa, ".local", "bin"))
            ruta = os.path.join(casa, ".local", "bin", "room-cli")
            open(ruta, "w").close()
            home_orig = os.environ.get("HOME")
            try:
                os.environ["HOME"] = casa
                self.assertEqual(cli_path({}, lambda x: None), ruta)
            finally:
                if home_orig is None:
                    os.environ.pop("HOME", None)
                else:
                    os.environ["HOME"] = home_orig
            self.assertEqual(cli_path({}, lambda x: None), "")


if __name__ == "__main__":
    unittest.main()
