# -*- coding: utf-8 -*-
"""Pruebas de memvid_cliente (MVD1027G): núcleo puro, un servidor HTTP falso y la
sección «Recuerdos de este agente» de contexto_agente."""
import http.server
import json
import os
import socket
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import contexto_agente as C  # noqa: E402
import memvid_cliente as M  # noqa: E402

AHORA = datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)
ENERO = datetime(2026, 1, 1, tzinfo=timezone.utc)
CAPS = "agente-olda-1-2026T4.mv2"
RUTA_BUSCAR = "/capsulas/%s/buscar" % CAPS
RUTA_PONER = "/capsulas/%s/poner" % CAPS


def puerto_libre():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Falso(http.server.BaseHTTPRequestHandler):
    """Servidor falso del contrato §4: contesta por ruta y recuerda lo último recibido."""
    respuestas = {}         # {ruta: (código, cuerpo)}; lo no declarado contesta 200 `{}`
    ultima = ()             # (método, ruta, token) del último pedido
    cuerpo_entrante = None  # JSON del último POST

    def do_GET(self):
        self._responder()

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        Falso.cuerpo_entrante = json.loads(self.rfile.read(n).decode("utf-8")) if n else None
        self._responder()

    def _responder(self):
        Falso.ultima = (self.command, self.path, self.headers.get("X-StarSeed-Token"))
        codigo, cuerpo = Falso.respuestas.get(self.path, (200, {}))
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(cuerpo).encode("utf-8"))

    def log_message(self, format, *args):
        pass


class Compartido(unittest.TestCase):
    """Un servidor falso en hilo para toda la clase; cada prueba reconfigura `respuestas`."""

    @classmethod
    def setUpClass(cls):
        cls.servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Falso)
        cls.base = "http://127.0.0.1:%d" % cls.servidor.server_address[1]
        cls.base_cerrado = "http://127.0.0.1:%d" % puerto_libre()
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()
        cls.servidor.server_close()

    def setUp(self):
        Falso.respuestas = {}
        Falso.cuerpo_entrante = None
        Falso.ultima = ()


class Puros(unittest.TestCase):
    """El núcleo sin red: ids, cápsulas, uris y token."""

    def test_ids_capsulas_uris_validacion_y_token(self):
        self.assertEqual(M.sanear_id("Olda/1ª"), "olda-1")
        self.assertEqual(M.sanear_id("  "), "anonimo")
        self.assertEqual(M.nombre_capsula("Olda/1ª", AHORA), CAPS)  # cuarto trimestre de 2026
        self.assertEqual(M.nombre_capsula("olda", ENERO), "agente-olda-2026T1.mv2")
        self.assertEqual(M.uri_de_paso("Olda/1ª", "ola TG1", 4), "mv2://agente/olda-1/sesion/ola-tg1/4")
        self.assertEqual(M.paso_int("7"), 7)
        self.assertEqual(M.paso_int(None), 0)
        self.assertTrue(M.capsula_valida(CAPS))
        for mala in ("../etc.mv2", "a/b.mv2", "MAYUS.mv2", "", None, "x.mv3"):
            self.assertFalse(M.capsula_valida(mala), mala)
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "t")
            ruta_falta = os.path.join(d, "no")
            with open(ruta, "w", encoding="utf-8") as f:
                f.write("  tok-prueba \n")
            self.assertEqual(M.leer_token(ruta), "tok-prueba")
            self.assertIsNone(M.leer_token(ruta_falta))
        self.assertIsNone(M.leer_token("~/.starseed/no-existe-test.memvid"))


class Red(Compartido):
    """`salud`, `buscar`, `poner` y `anotar_paso` contra el servidor falso."""

    def test_salud_ok_prohibida_y_sin_servidor(self):
        Falso.respuestas["/salud"] = (200, {"vivo": True})
        self.assertEqual(M.salud(token="tok-prueba"), {"vivo": True})
        self.assertEqual(Falso.ultima, ("GET", "/salud", "tok-prueba"))
        self.assertIsNone(M.salud(base=self.base_cerrado, tope=0.2))  # servidor apagado
        Falso.respuestas["/salud"] = (403, {})
        self.assertIsNone(M.salud(token="tok-prueba"))

    def test_buscar_y_poner(self):
        aciertos = [{"titulo": "n", "texto": "hola", "uri": "mv2://a/s/1", "ts": 5}]
        Falso.respuestas[RUTA_BUSCAR] = (200, {"aciertos": aciertos})
        self.assertEqual(M.buscar(CAPS, "hola", k=3, token="tok-prueba"), aciertos)
        self.assertEqual(Falso.cuerpo_entrante, {"consulta": "hola", "k": 3})
        Falso.respuestas[RUTA_BUSCAR] = (200, {})  # sin «aciertos» → None, nunca lanza
        self.assertIsNone(M.buscar(CAPS, "hola", k=3))
        Falso.respuestas[RUTA_PONER] = (200, {"frame": 7})
        d = M.poner(CAPS, "va el texto", titulo="t", uri="mv2://x", etiquetas=["a"], ts=17, token="tok-prueba")
        self.assertEqual(d, {"frame": 7})
        self.assertEqual(Falso.cuerpo_entrante,
                         {"texto": "va el texto", "titulo": "t", "uri": "mv2://x", "etiquetas": ["a"], "ts": 17})
        for mala in ("../fuga.mv2", "a/b.mv2", ""):
            with self.assertRaises(ValueError):
                M.buscar(mala, "x")

    def test_anotar_paso_ok_y_sin_servidor(self):
        Falso.respuestas[RUTA_PONER] = (200, {"frame": 3})
        a = M.anotar_paso("Olda/1ª", "ola TG1", "hice esto", paso=4, ahora=AHORA, token="tok-prueba") or {}
        self.assertEqual((a.get("capsula"), a.get("paso"), a.get("uri"), a.get("frame")),
                         (CAPS, 4, "mv2://agente/olda-1/sesion/ola-tg1/4", 3))
        cuerpo = Falso.cuerpo_entrante or {}
        self.assertEqual((cuerpo.get("uri"), cuerpo.get("titulo")),
                         ("mv2://agente/olda-1/sesion/ola-tg1/4", "sesión ola TG1 · paso 4"))
        a2 = M.anotar_paso("olda", "s", "x", paso=None, ahora=AHORA, token="tok-prueba") or {}
        self.assertEqual(a2.get("uri"), "mv2://agente/olda/sesion/s/%s" % a2.get("paso"))
        self.assertIsNone(M.anotar_paso("olda", "s", "x", base=self.base_cerrado, tope=0.2))


class Recuerdos(unittest.TestCase):
    """La sección «Recuerdos de este agente» del contexto común (buscar k=3; sin servidor no sale)."""

    ACIERTOS = [
        {"titulo": "ola TG1", "texto": "Dejé listo el puente con 14 pruebas.", "uri": "mv2://agente/o/s/t/2"},
        {"texto": "Segunda nota", "uri": "mv2://agente/o/s/s/3"},
    ]

    def test_seccion_y_contexto(self):
        n = C.seccion_recuerdos(self.ACIERTOS)
        self.assertIn("## Recuerdos de este agente", n)
        self.assertIn("- [ola TG1] Dejé listo el puente con 14 pruebas.", n)
        self.assertIn("- Segunda nota", n)
        self.assertEqual(len(n.strip().splitlines()), 3)  # título + 2 notas; la nota vacía se cae
        self.assertEqual(C.seccion_recuerdos([]), "")
        self.assertEqual(C.seccion_recuerdos([{"texto": "", "titulo": ""}]), "")
        d = C.construir("subagente", recuerdos=self.ACIERTOS)
        self.assertIn("recuerdos", d["secciones"])
        self.assertIn("Recuerdos de este agente", d["texto"])
        self.assertNotIn("recuerdos", C.construir("subagente")["secciones"])

    def test_sin_agente_o_sin_tarea_no_pide_red(self):
        self.assertIsNone(C._recuerdos_de_disco(None, "tarea sí"))
        self.assertIsNone(C._recuerdos_de_disco("olda", "   "))

    def test_que_ninguna_clave_salga_en_los_recuerdos(self):
        d = C.construir("subagente", recuerdos=[{"texto": "token sk-" + "a" * 30, "titulo": "n"}])
        self.assertIn("[REDACTADO]", d["texto"])


if __name__ == "__main__":
    unittest.main()
