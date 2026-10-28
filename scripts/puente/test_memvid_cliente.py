# -*- coding: utf-8 -*-
"""MVD1027G · cliente de cápsulas Memvid con un servidor HTTP falso local («Recuerdos del contexto»)."""
import datetime
import json
import os
import socket
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)

import contexto_agente as C  # noqa: E402
import memvid_cliente as M  # noqa: E402

ACIERTO = [{"texto": "recuerdo de la última sesión", "uri": "mv2://agente/astra/sesion/xkiro/1", "ts": 1719400000}]


class Falso(BaseHTTPRequestHandler):
    """El servidor de cápsulas, de mentira: guarda las peticiones y responde de memoria."""
    peticiones = []  # (metodo, ruta, cuerpo, token)

    def _envia(self, codigo, cuerpo):
        d = json.dumps(cuerpo).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Length", str(len(d)))
        self.end_headers()
        self.wfile.write(d)

    def do_GET(self):
        Falso.peticiones.append(("GET", self.path, None, self.headers.get(M.GLOBO_TOKEN)))
        self._envia(200, {"viva": True})

    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0"))
        cuerpo = json.loads(self.rfile.read(n) or b"{}") if n else {}
        Falso.peticiones.append(("POST", self.path, cuerpo, self.headers.get(M.GLOBO_TOKEN)))
        if self.path.endswith("/buscar"):
            if cuerpo.get("consulta") == "MALO":  # respuesta que no trae «aciertos»
                return self._envia(200, {"frame": 7})
            return self._envia(200, {"aciertos": ACIERTO if cuerpo.get("consulta") else []})
        return self._envia(200, {"frame": 7})

    def log_message(self, format, *args):  # noqa: A002
        pass


class ConServidor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.servidor = ThreadingHTTPServer(("127.0.0.1", 0), Falso)
        cls.base = "http://127.0.0.1:%d" % cls.servidor.server_address[1]
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()


class Cliente(ConServidor):
    def test_salud_poner_y_buscar_llevan_el_token_y_protegen_el_nombre(self):
        Falso.peticiones = []
        self.assertEqual(M.salud(base=self.base, token="tok"), {"viva": True})
        r = M.poner("agente-astra-2026T4.mv2", "se abrió la sala de salas.ts",
                    uri="mv2://u", titulo="Paso 1", base=self.base, token="tok")
        self.assertEqual((r, Falso.peticiones[1][1], Falso.peticiones[1][3]),
                         ({"frame": 7}, "/capsulas/agente-astra-2026T4.mv2/poner", "tok"))
        self.assertEqual(Falso.peticiones[1][2],
                         {"texto": "se abrió la sala de salas.ts", "titulo": "Paso 1", "uri": "mv2://u"})
        a = M.buscar("agente-astra-2026T4.mv2", "salas.ts", k=5, base=self.base, token="tok")
        self.assertEqual((len(a), a[0]["uri"]), (1, ACIERTO[0]["uri"]))  # type: ignore[union-attr]
        self.assertEqual(Falso.peticiones[2][2], {"consulta": "salas.ts", "k": 5})
        self.assertEqual(Falso.peticiones[0], ("GET", "/salud", None, "tok"))
        for malo in ("agente/etico.mv2", "agente-.."):
            with self.assertRaises(ValueError):
                M.poner(malo, "t", base=self.base)

    def test_sin_servidor_devuelve_none(self):
        muerto = socket.socket()
        muerto.bind(("127.0.0.1", 0))
        puerto = muerto.getsockname()[1]
        muerto.close()
        base = "http://127.0.0.1:%d" % puerto
        self.assertIsNone(M.salud(base=base, token="t"))
        self.assertIsNone(M.buscar("agente-astra-2026T4.mv2", "planes", base=base))
        self.assertIsNone(M.poner("agente-astra-2026T4.mv2", "x", base=base))


class Pasos(ConServidor):
    def test_un_fotograma_por_paso_con_uri_contador_y_saneado(self):
        self.assertEqual((M.capsula_agente("Ástra", fecha=datetime.datetime(2026, 10, 27)),
                          M.sanear("Ops_Gran Despacho"), M.sanear("  ")),
                         ("agente-astra-2026T4.mv2", "ops-gran-despacho", "sin-id"))
        M.PASOS.clear()
        Falso.peticiones = []
        self.assertEqual(M.anotar_paso("Ástra", "xkiro", "uno", base=self.base), {"frame": 7})
        self.assertEqual(Falso.peticiones[0][1], "/capsulas/agente-astra-2026T4.mv2/poner")
        self.assertEqual(Falso.peticiones[0][2]["uri"], "mv2://agente/astra/sesion/xkiro/1")
        M.anotar_paso("astra", "xkiro", "dos", base=self.base)
        self.assertEqual(Falso.peticiones[1][2]["uri"], "mv2://agente/astra/sesion/xkiro/2")


def recuerdos_falsos(agente, consulta, k):
    return [{"texto": "la sala %s se abrió antes" % consulta,
             "uri": "mv2://agente/%s/sesion/j/1" % agente, "ts": 0}]


class RecuerdosEnContexto(ConServidor):
    def test_la_seccion_sale_solo_con_agente_tarea_y_aciertos(self):
        d = C.construir("escritor", tarea="¿qué hice con el contrato de salas?",
                        agente="astra", recuerdos=recuerdos_falsos)
        self.assertIn("recuerdos", d["secciones"])
        self.assertIn("## Recuerdos de este agente", d["texto"])
        self.assertIn("`mv2://agente/astra/sesion/j/1`", d["texto"])
        for agente, tarea in ((None, "t"), ("astra", "")):
            self.assertNotIn("recuerdos",
                             C.construir("escritor", tarea=tarea, agente=agente)["secciones"])
        self.assertNotIn("recuerdos", C.construir("escritor", tarea="t", agente="a",
                                                  recuerdos=lambda a, c, k: [])["secciones"])
        largo = lambda a, c, k: [{"texto": "x" * 600}]  # noqa: E731
        self.assertNotIn("x" * 401, C.construir("escritor", tarea="t", agente="a",
                                                recuerdos=largo)["texto"])

        def rompe(a, c, k):
            raise ValueError("quebrado")
        self.assertNotIn("recuerdos",
                         C.construir("escritor", tarea="t", agente="a", recuerdos=rompe)["secciones"])

    def test_recuerdos_reales_con_el_servidor_falso_y_callado_si_no_esta(self):
        os.environ["MEMVID_URL_BASE"] = self.base
        try:
            a = C._recuerdos_reales("astra", "pulse en la sesión", 3)
            self.assertEqual((len(a), a[0]["uri"]), (1, ACIERTO[0]["uri"]))  # type: ignore[union-attr]
            os.environ["MEMVID_URL_BASE"] = "http://127.0.0.1:1"
            self.assertIsNone(C._recuerdos_reales("astra", "pulse", 3))
            self.assertNotIn("recuerdos",
                             C.construir("escritor", tarea="pulse", agente="astra")["secciones"])
        finally:
            os.environ.pop("MEMVID_URL_BASE", None)


if __name__ == "__main__":
    unittest.main()
