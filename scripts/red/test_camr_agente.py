"""Pruebas del agente CAMR sin red ni hardware: ejecutor falso por tecnología.

Lanzar: python3 -m unittest scripts.red.test_camr_agente -v
"""
import json
import threading
import unittest
import urllib.request

from scripts.red import camr_agente as camr


def ejecutor_falso(argv):
    """Ejecutor de mentira: contesta según el binario, sin tocar el sistema."""
    salidas = {
        "iw": "Station aa:bb:cc (on wlan0)\n\tsignal: -62 dBm",
        "batctl": "aa:bb:cc 0.210s 255 eth0",
        "yggdrasilctl": "2001:db8::1 port 12345",
        "babeld": "babeld 1.13",
    }
    return {"codigo": 0, "salida": salidas.get(argv[0], ""), "error": ""}


def localizador_todo(binario):
    return f"/usr/bin/{binario}"


def importador_nada(nombre):
    return None


ESTADO_TODO = {t: {"disponible": True, "motivo": "forzado en prueba"} for t in camr.TECNOLOGIAS}
ESTADO_NADA = {t: {"disponible": False, "motivo": "forzado en prueba"} for t in camr.TECNOLOGIAS}


class DeteccionPruebas(unittest.TestCase):
    def test_todo_disponible_con_binarios(self):
        estado = camr.detectar_tecnologias(localizador=localizador_todo,
                                           importador=importador_nada)
        for tec, info in estado.items():
            self.assertTrue(info["disponible"], tec)
        self.assertIn("rnsd", estado["rns"]["motivo"])

    def test_nada_disponible_da_motivo(self):
        estado = camr.detectar_tecnologias(localizador=lambda b: None,
                                           importador=importador_nada)
        for tec, info in estado.items():
            self.assertFalse(info["disponible"], tec)
            self.assertTrue(info["motivo"])

    def test_rns_con_libreria(self):
        estado = camr.detectar_tecnologias(localizador=lambda b: None,
                                           importador=lambda n: True if n == "RNS" else None)
        self.assertTrue(estado["rns"]["disponible"])
        self.assertFalse(estado["meshtastic"]["disponible"])


class MedicionesPruebas(unittest.TestCase):
    def test_mediciones_con_ejecutor_falso(self):
        medidas = camr.obtener_mediciones(ejecutor=ejecutor_falso, estado=ESTADO_TODO,
                                          importador=importador_nada)
        self.assertIn("-62 dBm", medidas["80211s"]["estaciones"]["salida"])
        self.assertIn("survey", " ".join(["iw", "dev", "wlan0", "survey", "dump"]))
        self.assertTrue(medidas["batman"]["origenadores"]["disponible"])
        self.assertIn("getPeers", " ".join(["yggdrasilctl", "getPeers"]))
        self.assertTrue(medidas["babel"]["estado"]["disponible"])

    def test_sin_tecnologias_no_mide(self):
        self.assertEqual(camr.obtener_mediciones(ejecutor=ejecutor_falso,
                                                 estado=ESTADO_NADA), {})

    def test_comando_que_falla_da_motivo(self):
        def falla(argv):
            return {"codigo": 1, "salida": "", "error": "no such device"}
        medidas = camr.obtener_mediciones(ejecutor=falla, estado={
            "80211s": {"disponible": True}, "batman": {"disponible": False},
            "babel": {"disponible": False}, "yggdrasil": {"disponible": False}})
        self.assertFalse(medidas["80211s"]["estaciones"]["disponible"])
        self.assertIn("no such device", medidas["80211s"]["estaciones"]["motivo"])


class AplicarPruebas(unittest.TestCase):
    def test_seco_por_defecto_no_ejecuta(self):
        llamadas = []
        cuerpo = {"tecnologia": "80211s", "comandos": [["iw", "dev", "wlan0", "set", "channel", "6"]]}
        res = camr.aplicar(cuerpo, ejecutor=lambda a: llamadas.append(a))
        self.assertTrue(res["ok"])
        self.assertTrue(res["seco"])
        self.assertEqual(llamadas, [])
        self.assertEqual(res["ejecutaria"], cuerpo["comandos"])

    def test_real_ejecuta_lista_blanca(self):
        llamadas = []
        cuerpo = {"tecnologia": "batman", "seco": False, "comandos": [["batctl", "o"]]}
        res = camr.aplicar(cuerpo, ejecutor=lambda a: llamadas.append(a) or
                           {"codigo": 0, "salida": "ok", "error": ""})
        self.assertTrue(res["ok"])
        self.assertEqual(llamadas, [["batctl", "o"]])

    def test_rechaza_ejecutable_fuera_de_lista(self):
        res = camr.aplicar({"tecnologia": "rns", "seco": False,
                            "comandos": [["rm", "-rf", "/"]]})
        self.assertFalse(res["ok"])
        self.assertIn("lista blanca", res["error"])

    def test_rechaza_argumentos_peligrosos(self):
        for argv in (["iw", "dev", "wlan0; reboot"], ["iw", "set", "$(id)"],
                     ["batctl", "o", "|", "tee"]):
            res = camr.aplicar({"tecnologia": "batman", "comandos": [argv]})
            self.assertFalse(res["ok"], argv)

    def test_rechaza_subcomandos_prohibidos(self):
        res = camr.aplicar({"tecnologia": "80211s", "comandos": [["ip", "link", "del", "wlan0"]]})
        self.assertFalse(res["ok"])
        self.assertIn("prohibido", res["error"])

    def test_rechaza_tecnologia_desconocida(self):
        self.assertFalse(camr.aplicar({"tecnologia": "lorawan", "comandos": [["iw"]]})["ok"])

    def test_comandos_mal_formados(self):
        self.assertFalse(camr.aplicar({"tecnologia": "rns", "comandos": ["iw dev"]})["ok"])
        self.assertFalse(camr.aplicar({"tecnologia": "rns"})["ok"])


class EnviarPruebas(unittest.TestCase):
    def test_envio_seco_por_defecto(self):
        res = camr.enviar({"destino": "ab12", "datos": "hola malla", "tecnologia": "rns"})
        self.assertTrue(res["ok"])
        self.assertTrue(res["seco"])
        self.assertEqual(res["ejecutaria"]["octetos"], len("hola malla".encode("utf-8")))

    def test_envio_sin_libreria_rns(self):
        res = camr.enviar({"destino": "ab12", "datos": "x", "seco": False})
        self.assertFalse(res["ok"])
        self.assertIn("RNS", res["error"])

    def test_envio_real_solo_rns(self):
        res = camr.enviar({"destino": "ab", "datos": "x", "tecnologia": "meshtastic",
                           "seco": False})
        self.assertFalse(res["ok"])

    def test_envio_rechaza_paquete_enorme(self):
        res = camr.enviar({"destino": "ab", "datos": "x" * 300000})
        self.assertFalse(res["ok"])


class ServidorPruebas(unittest.TestCase):
    """Sube el servidor con ejecutor falso en un puerto libre y lo consulta de verdad."""

    @classmethod
    def setUpClass(cls):
        cls.servidor = camr.crear_servidor(ejecutor=ejecutor_falso, puerto=0)
        cls.puerto = cls.servidor.server_address[1]
        cls.hilo = threading.Thread(target=cls.servidor.serve_forever, daemon=True)
        cls.hilo.start()
        cls.base = f"http://127.0.0.1:{cls.puerto}"

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()
        cls.hilo.join(timeout=5)

    def _pide(self, ruta, datos=None):
        cuerpo = json.dumps(datos).encode() if datos is not None else None
        req = urllib.request.Request(self.base + ruta, data=cuerpo,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_get_estado(self):
        codigo, datos = self._pide("/estado")
        self.assertEqual(codigo, 200)
        self.assertIn("tecnologias", datos)
        self.assertIn("rns", datos["tecnologias"])

    def test_post_aplicar_seco(self):
        codigo, datos = self._pide("/aplicar", {"tecnologia": "80211s",
                                                "comandos": [["iw", "dev"]]})
        self.assertEqual(codigo, 200)
        self.assertTrue(datos["seco"])

    def test_post_aplicar_invalido_es_400(self):
        codigo, _ = self._pide("/aplicar", {"tecnologia": "x", "comandos": [["rm"]]})
        self.assertEqual(codigo, 400)

    def test_post_enviar_seco(self):
        codigo, datos = self._pide("/enviar", {"destino": "ab", "datos": "hola"})
        self.assertEqual(codigo, 200)
        self.assertTrue(datos["seco"])

    def test_ruta_desconocida(self):
        codigo, _ = self._pide("/nope")
        self.assertEqual(codigo, 404)

    def test_solo_local(self):
        with self.assertRaises(ValueError):
            camr.crear_servidor(host="0.0.0.0", puerto=0)


if __name__ == "__main__":
    unittest.main()

