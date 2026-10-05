"""Pruebas del agente CAMR sin red ni hardware: ejecutor falso por tecnología."""

import base64
import json
import threading
import unittest
import urllib.request

import camr_agente as camr


class EjecutorFalso:
    """Registra llamadas y responde con salidas prefijadas por comando."""

    def __init__(self, disponibles=(), respuestas=None):
        self._disponibles = set(disponibles)
        self._respuestas = respuestas or {}
        self.llamadas = []

    def disponible(self, comando):
        return comando in self._disponibles

    def run(self, argv, timeout=10.0):
        self.llamadas.append(list(argv))
        return self._respuestas.get(tuple(argv), (1, "", "no simulado"))


IW_DEV = """phy#0
\tInterface wlan0
\t\ttype managed
\tInterface mesh0
\t\ttype mesh point
"""

IW_STATION = """Station aa:bb:cc:dd:ee:ff (on mesh0)
\tinactive time:\t10 ms
\tsignal:  \t-62 dBm
"""

IW_SURVEY = """Survey data from mesh0
\tfrequency:\t\t2412 MHz [in use]
\tnoise:\t\t\t-95 dBm
Survey data from mesh0
\tfrequency:\t\t2437 MHz
\tnoise:\t\t\t-98 dBm
"""

BAT_O = "aa:bb:cc:dd:ee:ff    0.120s   (255) cc:dd:ee:ff:00:11 [ mesh0]"
BAT_N = "cc:dd:ee:ff:00:11   0.210s   (220) aa:bb:cc:dd:ee:ff [ mesh0]"
YGG = "                                     URI  Some\n(200:aaaa::1)  uptime 00:10:00  bytes_rx 1000\n"


def ejecutor_lleno():
    return EjecutorFalso(
        disponibles=("iw", "batctl", "babeld", "yggdrasilctl"),
        respuestas={
            ("iw", "dev"): (0, IW_DEV, ""),
            ("iw", "dev", "wlan0", "station", "dump"): (0, IW_STATION, ""),
            ("iw", "dev", "wlan0", "survey", "dump"): (0, IW_SURVEY, ""),
            ("iw", "dev", "mesh0", "station", "dump"): (0, IW_STATION, ""),
            ("iw", "dev", "mesh0", "survey", "dump"): (0, IW_SURVEY, ""),
            ("batctl", "o"): (0, BAT_O, ""),
            ("batctl", "n"): (0, BAT_N, ""),
            ("pgrep", "-x", "babeld"): (0, "123\n", ""),
            ("yggdrasilctl", "getPeers"): (0, YGG, ""),
        },
    )


class TestDetectar(unittest.TestCase):
    def test_nada_disponible(self):
        estado = camr.detectar_tecnologias(EjecutorFalso())
        for tech in ("meshtastic", "80211s", "batman", "babel", "yggdrasil"):
            self.assertFalse(estado[tech]["disponible"])
            self.assertIn("razon", estado[tech])

    def test_todo_disponible(self):
        estado = camr.detectar_tecnologias(ejecutor_lleno())
        for tech in ("80211s", "batman", "babel", "yggdrasil"):
            self.assertTrue(estado[tech]["disponible"], tech)


class TestMediciones(unittest.TestCase):
    def test_wifi(self):
        med = camr.medir_wifi(ejecutor_lleno())
        self.assertTrue(med["disponible"])
        self.assertIn("mesh0", med["interfaces"])
        estacion = med["interfaces"]["mesh0"]["estaciones"][0]
        self.assertEqual(estacion["mac"], "aa:bb:cc:dd:ee:ff")
        self.assertEqual(estacion["rssi"], -62)
        canales = med["interfaces"]["mesh0"]["canales"]
        self.assertEqual(canales[0]["frecuencia"], 2412.0)
        self.assertTrue(canales[0]["en_uso"])
        self.assertEqual(canales[1]["ruido"], -98)

    def test_wifi_sin_iw(self):
        med = camr.medir_wifi(EjecutorFalso())
        self.assertFalse(med["disponible"])

    def test_batman(self):
        med = camr.medir_batman(ejecutor_lleno())
        self.assertTrue(med["disponible"])
        self.assertTrue(any("aa:bb" in linea for linea in med["origenes"]))
        self.assertTrue(med["vecinos"])

    def test_batman_sin_batctl(self):
        self.assertFalse(camr.medir_batman(EjecutorFalso())["disponible"])

    def test_babel(self):
        med = camr.medir_babel(ejecutor_lleno())
        self.assertTrue(med["disponible"])
        self.assertTrue(med["demonio_activo"])

    def test_yggdrasil(self):
        med = camr.medir_yggdrasil(ejecutor_lleno())
        self.assertTrue(med["disponible"])
        self.assertEqual(med["pares"][0][0], "(200:aaaa::1)")

    def test_yggdrasil_sin_ctl(self):
        self.assertFalse(camr.medir_yggdrasil(EjecutorFalso())["disponible"])

    def test_rns_sin_libreria(self):
        self.assertFalse(camr.medir_rns()["disponible"])
        self.assertFalse(camr.medir_rnode()["disponible"])

    def test_meshtastic_sin_libreria(self):
        self.assertFalse(camr.medir_meshtastic()["disponible"])

    def test_mediciones_agregadas(self):
        med = camr.mediciones(ejecutor_lleno())
        for clave in ("rns", "rnode", "meshtastic", "wifi", "batman", "babel", "yggdrasil"):
            self.assertIn(clave, med)


class TestAplicar(unittest.TestCase):
    def test_seco_por_defecto(self):
        ejec = ejecutor_lleno()
        r = camr.aplicar(ejec, {"tecnologia": "batman", "comandos": [["batctl", "o"]]})
        self.assertTrue(r["ok"])
        self.assertTrue(r["seco"])
        self.assertEqual(ejec.llamadas, [])

    def test_real_ejecuta(self):
        ejec = ejecutor_lleno()
        r = camr.aplicar(ejec, {"tecnologia": "batman",
                                "comandos": [["batctl", "o"]], "seco": False})
        self.assertTrue(r["ok"])
        self.assertFalse(r["seco"])
        self.assertEqual(ejec.llamadas, [["batctl", "o"]])

    def test_rechaza_no_blanco(self):
        r = camr.aplicar(ejecutor_lleno(), {"comandos": [["rm", "-rf"]], "seco": False})
        self.assertFalse(r["ok"])
        self.assertIn("lista blanca", r["error"])

    def test_rechaza_metacaracteres(self):
        r = camr.aplicar(ejecutor_lleno(), {"comandos": [["iw", "dev; rm -rf /"]]})
        self.assertFalse(r["ok"])

    def test_sin_comandos(self):
        self.assertFalse(camr.aplicar(ejecutor_lleno(), {})["ok"])


class TestEnviar(unittest.TestCase):
    def test_simulado(self):
        datos = base64.b64encode(b"hola malla").decode()
        r = camr.enviar({"tecnologia": "simulado", "destino": "aa:bb", "datos": datos})
        self.assertTrue(r["ok"])
        self.assertEqual(r["bytes"], len(b"hola malla"))

    def test_base64_malo(self):
        self.assertFalse(camr.enviar({"tecnologia": "simulado", "datos": "!!!"})["ok"])

    def test_tecnologia_desconocida(self):
        self.assertFalse(camr.enviar({"tecnologia": "lorawan"})["ok"])


class TestServidor(unittest.TestCase):
    def test_endpoints(self):
        servidor = camr.crear_servidor(puerto=0, ejecutor=ejecutor_lleno())
        puerto = servidor.server_address[1]
        self.assertEqual(servidor.server_address[0], "127.0.0.1")
        hilo = threading.Thread(target=servidor.serve_forever, daemon=True)
        hilo.start()
        try:
            base = f"http://127.0.0.1:{puerto}"
            with urllib.request.urlopen(base + "/estado") as r:
                estado = json.loads(r.read())
            self.assertIn("tecnologias", estado)
            with urllib.request.urlopen(base + "/mediciones") as r:
                meds = json.loads(r.read())
            self.assertIn("wifi", meds)
            peticion = json.dumps({"tecnologia": "simulado", "datos": ""}).encode()
            req = urllib.request.Request(base + "/enviar", data=peticion,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req) as r:
                self.assertTrue(json.loads(r.read())["ok"])
            req = urllib.request.Request(base + "/aplicar",
                                         data=json.dumps({"comandos": [["batctl", "o"]]}).encode(),
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req) as r:
                self.assertTrue(json.loads(r.read())["seco"])
        finally:
            servidor.shutdown()
            servidor.server_close()


if __name__ == "__main__":
    unittest.main()

