"""Pruebas puras de la sonda Cloudroom; nunca ejecuta room-cli."""
import os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
from medio_cloudroom import cli_path, interpretar, sondear

class ResultadoFalso:
    """Resultado de subprocess.run simulado: nunca se ejecuta room-cli."""

    def __init__(self, codigo, texto):
        self.returncode = codigo
        self.stdout = texto
        self.stderr = ""

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
        """(RTCRM1024D) CLOUDROOM_CLI manda: archivo real se devuelve tal cual, sin mirar el PATH."""
        consultado = []

        def buscar(nombre):
            consultado.append(nombre)
            return "por-path:" + nombre

        real = os.path.abspath(__file__)
        self.assertEqual(cli_path({"CLOUDROOM_CLI": real}, buscar), real)
        self.assertEqual(consultado, [])
        fantasma = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sin-room-cli-fantasma")
        self.assertEqual(cli_path({"CLOUDROOM_CLI": fantasma}, buscar), "por-path:" + fantasma)
        self.assertEqual(consultado, [fantasma])  # «room-cli» del PATH ni se consultó

    def test_sin_variable_cae_a_la_busqueda_en_path(self):
        self.assertEqual(cli_path({"CLOUDROOM_CLI": ""}, lambda n: "por-path:" + n), "por-path:room-cli")

    def test_sondea_los_tres_comandos_con_json(self):
        """(RTCRM1024D) Las tres órdenes, en ese orden, con --json y un tope de 15 s cada una."""
        cli = os.path.abspath(__file__)  # archivo real: la variable manda sin mirar PATH ni ~/.local/bin
        pedidos = []

        def correr(orden, timeout=None, **resto):
            pedidos.append((list(orden), timeout))
            if orden[1:] == ["status", "--json"]:
                return ResultadoFalso(0, '{"port":5123}')
            if orden[1:] == ["cloud", "status", "--json"]:
                return ResultadoFalso(0, '{"account":"alex"}')
            return ResultadoFalso(0, '{"count":2}')

        d = sondear(correr, {"CLOUDROOM_CLI": cli})
        self.assertEqual([o[1:] for o, _ in pedidos], [
            ["status", "--json"], ["cloud", "status", "--json"], ["thread", "count", "--json"]])
        self.assertTrue(all(o[0] == cli for o, _ in pedidos))
        self.assertTrue(all(t == 15 for _, t in pedidos))
        self.assertEqual(d["estado"], "usable")
        self.assertIn("2 hilo", d["detalle"])

    def test_si_falla_cloud_status_no_dice_usable(self):
        def correr(orden, timeout=None, **resto):
            if orden[1:] == ["status", "--json"]:
                return ResultadoFalso(0, '{"port":5123}')
            return ResultadoFalso(1, "")

        d = sondear(correr, {"CLOUDROOM_CLI": os.path.abspath(__file__)})
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("comando fallido", d["detalle"])

    def test_busca_en_home_local_bin_y_respeta_la_ausencia(self):
        """(RTCRM1024D) Sin CLOUDROOM_CLI ni PATH cae a ~/.local/bin; si no está, no inventa ruta."""
        consultado = []

        def buscar(nombre):
            consultado.append(nombre)
            return None  # el PATH de la prueba nunca encuentra nada

        anterior = os.environ.get("HOME")
        try:
            with tempfile.TemporaryDirectory() as casa:
                bin_dir = os.path.join(casa, ".local", "bin")
                os.makedirs(bin_dir)
                ruta = os.path.join(bin_dir, "room-cli")
                open(ruta, "w").close()
                os.environ["HOME"] = casa
                self.assertEqual(cli_path({}, buscar), ruta)
                self.assertFalse(os.path.isfile(os.path.join(casa, "otra", ".local", "bin", "room-cli")))
                os.environ["HOME"] = os.path.join(casa, "otra")
                self.assertEqual(cli_path({}, buscar), "")
        finally:
            if anterior is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = anterior
            # una consulta al PATH por llamada; nunca se busca otro nombre que «room-cli»
            self.assertEqual(set(consultado), {"room-cli"})

    def test_cuenta_lista_incluye_cupo_declarado_e_hilos(self):
        """(RTCRM1024D) Cuenta lista: estado, id, cupo del plan gratis, hilos y arranque sin recuento."""
        self.assertEqual(interpretar({"running": True}, {"authenticated": True, "account": "alex"}, {"count": 4}),
                         {"id": "cloudroom", "nombre": "Cloudroom", "estado": "usable",
                          "detalle": "cuenta conectada · 4 hilo(s) abierto(s)",
                          "capacidad": "100 agentes en la nube / 30 días (plan gratis)", "siguiente_paso": ""})
        self.assertEqual(interpretar({"running": True}, {"authenticated": True})["estado"], "usable")

    def test_sin_room_cli_no_ejecuta_nada(self):
        """(RTCRM1024D) Sin CLI en la variable, el PATH ni ~/.local/bin: no se ejecuta ninguna orden."""
        anterior = os.environ.get("HOME")
        try:
            corridas = []

            def falso(orden, timeout=None, **resto):
                corridas.append(list(orden))
                return ResultadoFalso(0, "{}")

            with tempfile.TemporaryDirectory() as casa:
                os.environ["HOME"] = casa  # tampoco hay ~/.local/bin en la casa de la prueba
                d = sondear(falso, {})
            self.assertEqual(corridas, [])
            self.assertEqual(d["estado"], "no_disponible")
            self.assertEqual(d["detalle"], "app sin instalar")
        finally:
            if anterior is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = anterior

if __name__ == "__main__":
    unittest.main()
