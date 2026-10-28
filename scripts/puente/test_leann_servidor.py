# -*- coding: utf-8 -*-
"""Pruebas de leann_servidor y leann_recuerdo con un LEANN falso (LNN1028B).

Arranca el servidor de verdad en un puerto suelto y le habla con `http.client`:
el guardia del token, los nombres malos, los filtros que llegan tal cual y
el 400 de los metadatos sin `alcance`. `leann` no está instalado aquí: lo
falso vive solamente en este fichero (`setUpModule`).
"""

import http.client
import http.server
import json
import os
import tempfile
import threading
import unittest
from types import SimpleNamespace

import leann_recuerdo as R
import leann_servidor as S


class BuilderFalso:  # anota lo que le llega para ver cómo se construye cada índice
    instancias = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.entradas = []
        self.grabados = []
        BuilderFalso.instancias.append(self)

    def add_text(self, texto, metadata=None):
        self.entradas.append((texto, metadata))

    def build_index(self, ruta):
        self.grabados.append(("build", ruta))

    def update_index(self, ruta, remove_passage_ids=None):
        self.grabados.append(("update", ruta))


class SearcherFalso:  # anota cada llamada y devuelve un resultado como los de LEANN
    llamadas = []

    def __init__(self, ruta):
        self.ruta = ruta

    def search(self, consulta, **llamada):
        SearcherFalso.llamadas.append((self.ruta, consulta, llamada))
        return [SimpleNamespace(id="r1", score=0.9, text="planes del café",
                                metadata={"alcance": "perfil"})]


def setUpModule():
    R.LEANN_BUILDER, R.LEANN_SEARCHER = BuilderFalso, SearcherFalso


def tearDownModule():
    R.LEANN_BUILDER, R.LEANN_SEARCHER = None, None


class ServidorEnMarcha(unittest.TestCase):
    """El servidor real contra el LEANN falso, con token y directorio temporales."""

    @classmethod
    def setUpClass(cls):
        cls.directorio = tempfile.mkdtemp(prefix="leann-prueba-")
        S._TOKEN_RUTA = os.path.join(cls.directorio, "leann.token")
        os.environ["STARSEED_LEANN_DIR"] = cls.directorio
        cls.token = S.leer_token()
        for nombre in ("perfil-alex-perfil", "repo-starseed"):
            os.makedirs(os.path.join(cls.directorio, nombre))
        with open(os.path.join(cls.directorio, "perfil-alex-perfil", "documents.leann"), "w") as f:
            f.write("índice de la prueba")
        cls.servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), S.Manejador)
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()
        cls.puerto = cls.servidor.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.servidor.shutdown()
        cls.servidor.server_close()
        S._TOKEN_RUTA = None
        os.environ.pop("STARSEED_LEANN_DIR", None)

    def pedir(self, metodo, ruta, cuerpo=None, extra=None, sin_token=False):
        cabeceras = {} if sin_token else {"X-StarSeed-Token": self.token}
        cabeceras.update(extra or {})
        cliente = http.client.HTTPConnection("127.0.0.1", self.puerto, timeout=10)
        cliente.request(metodo, ruta, body=json.dumps(cuerpo) if cuerpo is not None else None,
                        headers=cabeceras)
        respuesta = cliente.getresponse()
        bruto = respuesta.read().decode("utf-8")
        cliente.close()
        try:
            return respuesta.status, json.loads(bruto)
        except ValueError:
            return respuesta.status, {}

    def test_403_sin_token_y_con_token_malo(self):
        self.assertEqual(self.pedir("GET", "/salud", sin_token=True)[0], 403)
        self.assertEqual(self.pedir("GET", "/salud",
                                    extra={"X-StarSeed-Token": "equivocado"})[0], 403)

    def test_403_con_host_ajeno_y_con_origin(self):
        self.assertEqual(self.pedir("GET", "/salud", extra={"Host": "ajeno.dominio"})[0], 403)
        self.assertEqual(self.pedir("GET", "/salud",
                                    extra={"Origin": "https://ajeno.dominio"})[0], 403)

    def test_salud_e_indices_solo_con_nombre_valido(self):
        self.assertEqual(self.pedir("GET", "/salud")[1]["estado"], "ok")
        estado, datos = self.pedir("GET", "/indices")
        self.assertEqual((estado, datos["indices"]),
                         (200, ["perfil-alex-perfil", "repo-starseed"]))

    def test_buscar_pasa_los_filtros_tal_cual(self):
        filtros = {"alcance": {"in": ["perfil", "publica"]}}
        cuerpo = {"consulta": "¿qué dije de la cafetería?", "k": 3,
                  "filtros": filtros, "peso_vector": 0.7}
        estado, datos = self.pedir("POST", "/indices/perfil-alex-perfil/buscar", cuerpo)
        self.assertEqual(estado, 200)
        ruta, consulta, llamada = SearcherFalso.llamadas[-1]
        self.assertEqual(consulta, "¿qué dije de la cafetería?")
        self.assertEqual(llamada, {"top_k": 3, "metadata_filters": filtros,
                                   "vector_weight": 0.7})
        self.assertIs(llamada["metadata_filters"], filtros)
        self.assertEqual(datos, [{"id": "r1", "puntuacion": 0.9, "texto": "planes del café",
                                  "metadatos": {"alcance": "perfil"}}])

    def test_nombres_malos_dan_400(self):
        for nombre in ("Perfil_Ajeno", "perfil%2Fescapado", "fuera.de.rango"):
            self.assertEqual(self.pedir("POST", "/indices/%s/buscar" % nombre,
                                        {"consulta": "algo"})[0], 400)

    def test_poner_sin_alcance_da_400(self):
        estado, datos = self.pedir("POST", "/indices/perfil-alex-perfil/poner",
                                   {"textos": [{"texto": "planes del café",
                                                "metadatos": {}}]})
        self.assertEqual(estado, 400)
        self.assertIn("alcance", datos["error"])

    def test_poner_crea_y_luego_actualiza(self):
        nombre = "grupo-fiesta-publica"
        cuerpo = {"textos": [{"texto": "planes del café",
                              "metadatos": {"alcance": "grupo", "sujeto": "alex"}}]}
        ruta = os.path.join(self.directorio, nombre, "documents.leann")
        estado, datos = self.pedir("POST", "/indices/%s/poner" % nombre, cuerpo)
        self.assertEqual((estado, datos), (200, {"nombre": nombre, "anadidos": 1}))
        builder = BuilderFalso.instancias[-1]
        self.assertEqual(builder.kwargs, {"backend_name": "hnsw", "embedding_model":
                          "qwen3-embedding:0.6b", "embedding_mode": "ollama"})
        self.assertEqual(builder.entradas,
                         [("planes del café", {"alcance": "grupo", "sujeto": "alex"})])
        self.assertEqual(builder.grabados, [("build", ruta)])
        with open(ruta, "w") as fichero:
            fichero.write("índice ya construido")
        self.assertEqual(self.pedir("POST", "/indices/%s/poner" % nombre, cuerpo)[1]["anadidos"], 1)
        self.assertEqual(BuilderFalso.instancias[-1].grabados[-1], ("update", ruta))


class CacheDeBuscadores(unittest.TestCase):
    """La caché del contrato: cuatro vivos y el más viejo sale en la quinta."""

    def test_cuatro_vivos_y_el_mas_viejo_sale(self):
        guardas = (R._buscadores, R._orden)
        R._buscadores, R._orden = {}, []
        try:
            for nombre in ("a", "b", "c", "d", "e"):
                R.buscador_de(nombre)
            self.assertEqual(set(R._buscadores), {"b", "c", "d", "e"})
        finally:
            R._buscadores, R._orden = guardas


class TokenDelA1(unittest.TestCase):
    def test_se_crea_una_vez_con_64_hex_y_0600(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = os.path.join(carpeta, "leann.token")
            uno, dos = S.leer_token(ruta), S.leer_token(ruta)
            self.assertTrue(uno and uno == dos)
            self.assertTrue(len(uno) == 64 and oct(os.stat(ruta).st_mode)[-3:] == "600")


if __name__ == "__main__":
    unittest.main()


