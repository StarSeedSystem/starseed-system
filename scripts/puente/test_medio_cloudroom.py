"""Pruebas puras de la sonda Cloudroom; nunca ejecuta room-cli."""
import tempfile, types, os, sys, unittest
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


class Localizador(unittest.TestCase):
    """Casos de la rama archivada nube/40073425475, adaptados a `cli_path` de hoy: la API cambió
    (antes `localizar` devolvía la variable sin comprobar; hoy exige fichero real o PATH)."""

    def test_la_variable_de_entorno_manda_sobre_otras_fuentes(self):
        with tempfile.TemporaryDirectory() as casa:
            ruta = os.path.join(casa, "room-cli")
            open(ruta, "w").close()
            self.assertEqual(cli_path({"CLOUDROOM_CLI": ruta}, which=lambda n: "/de/which"), ruta)

    def test_si_la_variable_no_existe_no_se_inventa_y_pasa_al_path_de_reserva(self):
        self.assertEqual(
            cli_path({"CLOUDROOM_CLI": "/opt/room-cli-inexistente"}, which=lambda n: "/de/which/room-cli"),
            "/de/which/room-cli",
        )

    def test_sin_variable_responde_el_path_y_sin_este_no_hay_ruta(self):
        self.assertEqual(cli_path({}, which=lambda n: "/de/which/room-cli"), "/de/which/room-cli")


class SondearLocal(unittest.TestCase):
    """`sondear` de hoyCORRE `run` inyectable; el fichero temporal hace el test determinista."""

    @staticmethod
    def _respuesta(codigo, texto):
        return types.SimpleNamespace(returncode=codigo, stdout=texto, stderr="")

    def test_sondea_los_tres_comandos_con_json_y_tope_de_quince_segundos(self):
        with tempfile.TemporaryDirectory() as casa:
            ruta = os.path.join(casa, "room-cli")
            open(ruta, "w").close()
            ordenes = []

            def falso(orden, capture_output=True, text=True, timeout=15):
                ordenes.append((orden, timeout))
                if orden[1:] == ["status", "--json"]:
                    return self._respuesta(0, '{"port":5123}')
                if orden[1:] == ["cloud", "status", "--json"]:
                    return self._respuesta(0, '{"account":"alex"}')
                return self._respuesta(0, '{"count":4}')

            d = sondear(falso, {"CLOUDROOM_CLI": ruta})
            self.assertEqual([o[1:] for o, _ in ordenes], [
                ["status", "--json"],
                ["cloud", "status", "--json"],
                ["thread", "count", "--json"],
            ])
            self.assertEqual([t for _, t in ordenes], [15, 15, 15])
            self.assertEqual(d["estado"], "usable")
            self.assertIn("4 hilo(s) abierto(s)", d["detalle"])

    def test_si_falla_cloud_status_no_dice_usable(self):
        with tempfile.TemporaryDirectory() as casa:
            ruta = os.path.join(casa, "room-cli")
            open(ruta, "w").close()

            def falso(orden, capture_output=True, text=True, timeout=15):
                if orden[1:] == ["cloud", "status", "--json"]:
                    return self._respuesta(1, "")
                return self._respuesta(0, '{"port":5123}')

            d = sondear(falso, {"CLOUDROOM_CLI": ruta})
            self.assertEqual(d["estado"], "requiere_alex")
            self.assertNotIn(d["estado"], ("usable", "no_disponible"))
            # Hoy el sondeador reporta el error observado en el detalle; «sin iniciar sesión»
            # lo dice `interpretar` directamente (ya probado arriba).
            self.assertIn("comando fallido", d["detalle"])

if __name__ == "__main__":
    unittest.main()
