"""Pruebas de la sonda Cloudroom: JSON simulado, sin ejecutar room-cli ni tocar la red."""
import os
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import medio_cloudroom as M  # noqa: E402


class Localizar(unittest.TestCase):
    def test_variable_de_entorno_manda(self):
        self.assertEqual(M.localizar({"CLOUDROOM_CLI": "/opt/room-cli"}, "/nada"), "/opt/room-cli")

    def test_busca_en_local_bin_y_respeta_la_ausencia(self):
        with tempfile.TemporaryDirectory() as casa:
            os.makedirs(os.path.join(casa, ".local", "bin"))
            ruta = os.path.join(casa, ".local", "bin", "room-cli")
            open(ruta, "w").close()
            self.assertEqual(M.localizar({}, casa), ruta)
            self.assertIsNone(M.localizar({}, os.path.join(casa, "otra")))


class Interpretar(unittest.TestCase):
    ESTADO = '{"port":5123}'
    NUBE = '{"account":{"name":"alex"},"plan":null}'

    def test_sin_cli_o_sin_servidor_no_es_usable(self):
        d = M.interpretar("", "", "", "app sin instalar")
        self.assertEqual(d["estado"], "no_disponible")
        self.assertIn("app sin instalar", d["detalle"])
        d = M.interpretar("no es JSON", self.NUBE, "{}")
        self.assertEqual(d["estado"], "no_disponible")
        self.assertIn("status", d["detalle"])

    def test_sin_sesion_pide_a_la_persona(self):
        d = M.interpretar(self.ESTADO, "", "")
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("sin iniciar sesión en Cloudroom", d["detalle"])
        d = M.interpretar(self.ESTADO, '{"connected":false}', "")
        self.assertEqual(d["estado"], "requiere_alex")

    def test_cuenta_lista_incluye_cupo_declarado_e_hilos(self):
        d = M.interpretar(self.ESTADO, self.NUBE, '{"count":4}')
        self.assertEqual(d["estado"], "listo")
        self.assertEqual(d["id"], "cloudroom")
        self.assertIn("100 agentes en la nube cada 30 días", d["capacidad"])
        self.assertIn("4 hilo(s) abierto(s)", d["detalle"])
        self.assertIn("5123", d["detalle"])
        self.assertEqual(M.interpretar(self.ESTADO, self.NUBE, "")["estado"], "usable")

    def test_uso_del_plan_y_cupo_agotado(self):
        nube = '{"data":{"account":"alex","plan":{"name":"Free"},"planUsage":{"used":100,"total":100}}}'
        d = M.interpretar(self.ESTADO, nube, '{"data":{"count":2}}')
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("cupo agotado", d["detalle"])
        self.assertIn("100/100 usados", d["capacidad"])
        self.assertIn("2 hilo(s)", d["detalle"])


class Sondear(unittest.TestCase):
    def test_sin_room_cli_no_ejecuta_nada(self):
        d = M.sondear({}, casa="/carpeta/que/no/existe")
        self.assertEqual(d["estado"], "no_disponible")
        self.assertIn("app sin instalar", d["detalle"])

    def test_sondea_los_tres_comandos_con_json(self):
        ordenes = []

        def falso(orden, timeout=15):
            ordenes.append((orden, timeout))
            if orden[1:] == ["status", "--json"]:
                return 0, '{"port":5123}'
            if orden[1:] == ["cloud", "status", "--json"]:
                return 0, '{"account":"alex"}'
            return 0, '{"count":2}'

        d = M.sondear({"CLOUDROOM_CLI": "room-cli"}, correr=falso)
        self.assertEqual([o for o, _ in ordenes], [
            ["room-cli", "status", "--json"],
            ["room-cli", "cloud", "status", "--json"],
            ["room-cli", "thread", "count", "--json"],
        ])
        self.assertTrue(all(t == 15 for _, t in ordenes))
        self.assertEqual(d["estado"], "listo")

    def test_si_falla_cloud_status_no_dice_usable(self):
        def falso(orden, timeout=15):
            if orden[1:] == ["status", "--json"]:
                return 0, '{"port":5123}'
            return 1, ""

        d = M.sondear({"CLOUDROOM_CLI": "room-cli"}, correr=falso)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertIn("sin iniciar sesión", d["detalle"])


if __name__ == "__main__":
    unittest.main()
