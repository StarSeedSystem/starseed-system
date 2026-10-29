# -*- coding: utf-8 -*-
"""LNN1028G · pruebas del cliente LEANN y su sección en el contexto: servidor HTTP falso, sin servidor → None, rutas."""
import json, os, sys, threading, unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
import contexto_agente as C  # noqa: E402
import leann_cliente as LC  # noqa: E402

ACIERTO = {"id": "t1", "puntuacion": 0.9, "texto": "fragmento",
           "metadatos": {"ruta": "src/lib/a.ts", "desde": 1, "hasta": 50}}
BUENA = dict(ACIERTO["metadatos"])


class Falso:
    """Servidor HTTP falso real en 127.0.0.1:0: registra peticiones y contesta lo que se fija."""
    peticiones: list = []
    estado, cuerpo = 200, json.dumps([ACIERTO]).encode("utf-8")

    class Manejador(BaseHTTPRequestHandler):
        log_message = lambda self, *a: None  # noqa: E731

        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", "0") or 0))
            Falso.peticiones.append({"ruta": self.path, "token": self.headers.get("X-StarSeed-Token")})
            self.send_response(Falso.estado)
            self.send_header("Content-Length", str(len(Falso.cuerpo)))
            self.end_headers()
            self.wfile.write(Falso.cuerpo)


class SobreBuscar(unittest.TestCase):
    def setUp(self):
        Falso.peticiones, Falso.estado, Falso.cuerpo = [], 200, json.dumps([ACIERTO]).encode("utf-8")
        self.servidor = ThreadingHTTPServer(("127.0.0.1", 0), Falso.Manejador)
        self.puerto = self.servidor.server_address[1]
        threading.Thread(target=self.servidor.serve_forever, daemon=True).start()
        os.environ.pop("STARSEED_LEANN_PUERTO", None)

    def tearDown(self):
        self.servidor.shutdown()
        self.servidor.server_close()

    def test_devuelve_aciertos_y_lleva_token(self):
        r = LC.buscar("repo-starseed", "salas y rango", 3, puerto=self.puerto, token="tok") or []
        primero = r[0] if r else {}
        self.assertEqual((primero.get("texto"), primero.get("metadatos")), ("fragmento", ACIERTO["metadatos"]))
        self.assertEqual(Falso.peticiones, [{"ruta": "/indices/repo-starseed/buscar", "token": "tok"}])

    def test_peticiones_mal_formadas_no_llaman_nada(self):
        for mal in (("../malo", "x", 3), ("repo-starseed", "  ", 3), ("repo-starseed", "x", 0)):
            self.assertIsNone(LC.buscar(mal[0], mal[1], mal[2], puerto=self.puerto, token="tok"))
        self.assertEqual(Falso.peticiones, [])

    def test_respuestas_que_no_valen_son_none_o_vacio(self):
        for estado, cuerpo, esperado in ((403, b"{}", None), (500, b"{}", None), (200, b"roto", [])):
            Falso.estado, Falso.cuerpo = estado, cuerpo
            self.assertEqual(LC.buscar("repo-starseed", "x", 3, puerto=self.puerto, token="t"), esperado)

    def test_sin_token_y_puerto_muerto_no_hay_red(self):
        self.assertIsNone(LC.buscar("repo-starseed", "x", 3, puerto=self.puerto))
        self.assertEqual(Falso.peticiones, [])
        self.assertIsNone(LC.buscar("repo-starseed", "x", 3, puerto=1, token="t"))


class Rutas(unittest.TestCase):
    """rutas_de_aciertos: únicas, con rango, como mucho 8 y solo las que existen."""

    existe = staticmethod(lambda r: r.startswith("src/lib/"))

    def test_unicas_con_rango_solo_las_que_existen_y_tope(self):
        otras = [{"metadatos": {"ruta": "src/lib/b.ts", "desde": 7, "hasta": 9}},
                 {"metadatos": {"ruta": "pruebas/no.ts", "desde": 1, "hasta": 2}}]
        self.assertEqual(LC.rutas_de_aciertos([ACIERTO] + otras, self.existe, limite=8),
                         [BUENA, {"ruta": "src/lib/b.ts", "desde": 7, "hasta": 9}])
        self.assertEqual(LC.rutas_de_aciertos([ACIERTO] * 9, self.existe, limite=8), [BUENA])

    def test_malas_absolutas_puntos_vacias_y_espacios(self):
        malas = [{"metadatos": {"ruta": "/etc/passwd"}}, {"metadatos": {"ruta": "src/lib/../x.ts"}},
                 {"metadatos": {"ruta": "src/lib/sp /x.ts"}}, {"metadatos": {}}]
        self.assertEqual(LC.rutas_de_aciertos(malas + [ACIERTO], self.existe), [BUENA])


class Seccion(unittest.TestCase):
    """La sección en el contexto del agente: con tarea y servidor, solo archivos del árbol."""

    ARCHIVOS = {"src/lib/a.ts": "x", "src/lib/b.ts": "x"}

    def buscar(self, consulta, *_r):
        return [ACIERTO, dict(ACIERTO, id="t2", metadatos={"ruta": "src/lib/b.ts", "desde": 8, "hasta": 20}),
                dict(ACIERTO, id="t3", metadatos={"ruta": "fuera/del/arbol.ts"})]

    def test_con_tarea_y_buscar_lleva_la_seccion(self):
        d = C.construir(
            "escritor", tarea="Contrato de salas\n" + "línea " * 4, leer=lambda r: self.ARCHIVOS.get(r),
            existe=lambda r: r in self.ARCHIVOS, extras=[], raices={}, archivos=self.buscar)
        self.assertIn("archivos", d["secciones"])
        self.assertIn("## Archivos que probablemente importan", d["texto"])
        self.assertIn("`src/lib/a.ts` (líneas 1–50)", d["texto"])
        self.assertIn("`src/lib/b.ts` (líneas 8–20)", d["texto"])
        self.assertNotIn("fuera/del/arbol.ts", d["texto"])

    def test_sin_tarea_ni_servidor_no_sale_nada(self):
        mundo = (lambda r: self.ARCHIVOS.get(r)), (lambda r: r in self.ARCHIVOS)
        sin_tarea = C.construir("escritor", leer=mundo[0], existe=mundo[1],
                                extras=[], raices={}, archivos=self.buscar)
        sin_buscar = C.construir("escritor", tarea="Contrato de salas", leer=mundo[0], existe=mundo[1],
                                 extras=[], raices={})
        self.assertNotIn("archivos", sin_tarea["secciones"] + sin_buscar["secciones"])

    def test_orden_para_todos_los_roles_y_silencio_sin_servidor_real(self):
        self.assertTrue(all("archivos" in C.ORDEN[rol] for rol in C.ROLES))
        t = C.construir("escritor", tarea="Arregla src/lib/leann")["texto"]
        self.assertNotIn("Archivos que probablemente importan", t)


if __name__ == "__main__":
    unittest.main()

