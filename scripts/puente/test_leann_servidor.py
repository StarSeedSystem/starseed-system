# -*- coding: utf-8 -*-
"""Pruebas de leann_servidor con un LEANN falso inyectado en sys.modules["leann"]:
token y 403, nombres de índice malos, filtros que llegan tal cual y 400 sin alcance."""
import http.client
import json
import os
import sys
import tempfile
import threading
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leann_servidor as LS  # noqa: E402

TOKEN = "tok-de-prueba"
ORDEN = {"id": "r1", "score": 0.9, "text": "texto hallado",
         "metadata": {"alcance": "perfil", "sujeto": "perfil:alex", "uri": "mv2://r1"}}


class ResultadoFalso:
    def __init__(self, id, score, text, metadata):
        self.id, self.score, self.text, self.metadata = id, score, text, metadata


class BuscadorFalso:
    """Lo que el servidor vería como LeannSearcher(ruta)."""
    conteo = 0

    def __init__(self, ruta):
        BuscadorFalso.conteo += 1
        self.ruta = ruta

    def search(self, consulta, top_k=5, metadata_filters=None, **resto):
        self.consulta = consulta
        self.top_k = top_k
        self.filtros = metadata_filters
        self.resto = dict(resto)
        return [ResultadoFalso(ORDEN["id"], ORDEN["score"], ORDEN["text"], ORDEN["metadata"])]


class ConstructorFalso:
    """Lo que el servidor vería como LeannBuilder para crear o actualizar un índice."""
    creados = []
    actualizados = []

    def __init__(self, backend_name, **kwargs):
        self.backend_name = backend_name
        self.kwargs = dict(kwargs)
        self.textos = []

    def add_text(self, texto, metadata=None):
        self.textos.append((texto, metadata))

    def build_index(self, ruta):
        self.creado = ruta
        ConstructorFalso.creados.append(self)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("índice falso")

    def update_index(self, ruta, remove_passage_ids=None):
        self.actualizado = ruta
        ConstructorFalso.actualizados.append(self)


LEANN_FALSO = types.ModuleType("leann")
setattr(LEANN_FALSO, "LeannBuilder", ConstructorFalso)
setattr(LEANN_FALSO, "LeannSearcher", BuscadorFalso)


class SobreServidor(unittest.TestCase):
    """Levanta el servidor real en 127.0.0.1:0 con un LEANN falso."""

    def setUp(self):
        self.viejo_modulo = sys.modules.get("leann")
        sys.modules["leann"] = LEANN_FALSO
        ConstructorFalso.creados = []
        ConstructorFalso.actualizados = []
        BuscadorFalso.conteo = 0
        self.temporal = tempfile.mkdtemp()
        self.dir_indices = os.path.join(self.temporal, "leann")
        os.makedirs(self.dir_indices)
        self.servidor = LS.Servidor(dir_indices=self.dir_indices, token=TOKEN)
        self.hilo = threading.Thread(target=self.servidor.serve_forever, daemon=True)
        self.hilo.start()
        self.puerto = self.servidor.server_address[1]

    def tearDown(self):
        self.servidor.shutdown()
        self.servidor.server_close()
        self.servidor.socket.close()
        if self.viejo_modulo is not None:
            sys.modules["leann"] = self.viejo_modulo
        else:
            sys.modules.pop("leann", None)

    def pedir(self, metodo, ruta, cuerpo=None, con_token=True, extra=None):
        datos, cabeceras = None, {}
        if cuerpo is not None:
            datos = json.dumps(cuerpo).encode("utf-8")
            cabeceras["Content-Type"] = "application/json"
            cabeceras["Content-Length"] = str(len(datos))
        if con_token:
            cabeceras["X-StarSeed-Token"] = TOKEN
        cabeceras.update(extra or {})
        conexion = http.client.HTTPConnection("127.0.0.1", self.puerto)
        conexion.request(metodo, ruta, body=datos, headers=cabeceras)
        respuesta = conexion.getresponse()
        bruto = respuesta.read().decode("utf-8")
        conexion.close()
        return respuesta.status, (json.loads(bruto) if bruto else {})

    def crear_indice(self, nombre):
        ruta = os.path.join(self.dir_indices, nombre, "documents.leann")
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("índice falso")

    def test_403_sin_token_con_malo_con_origin_y_host_ajeno(self):
        self.assertEqual(self.pedir("GET", "/salud", con_token=False)[0], 403)
        self.assertEqual(self.pedir("GET", "/salud", extra={"X-StarSeed-Token": "otra"})[0], 403)
        self.assertEqual(self.pedir("GET", "/salud", extra={"Origin": "https://malvado.example"})[0], 403)
        self.assertEqual(self.pedir("GET", "/salud", extra={"Host": "minimoneta.example"})[0], 403)
        self.assertEqual(self.pedir("GET", "/salud")[0], 200)
        self.assertEqual(self.pedir("GET", "/salud")[1], {"estado": "ok"})

    def test_listar_indices_y_404(self):
        self.crear_indice("perfil-alex-perfil")
        self.assertEqual(self.pedir("GET", "/indices")[1], {"indices": ["perfil-alex-perfil"]})
        self.assertEqual(self.pedir("GET", "/nada", con_token=False)[0], 403)
        self.assertEqual(self.pedir("GET", "/nada", con_token=True)[0], 404)

    def test_nombres_malos_de_indice(self):
        for nombre in ("Pepe", "con_riesgo", "con%2Fbarra", "sin..algo", ""):
            ruta = "/indices/%s/buscar" % nombre
            self.assertEqual(self.pedir("POST", ruta, cuerpo={})[0], 400)
        self.assertEqual(self.pedir("POST", "/indices/dos/mas/buscar", cuerpo={})[0], 404)

    def test_ruta_de_post_desconocida(self):
        self.assertEqual(self.pedir("POST", "/indices/demo/otra", cuerpo={})[0], 404)
        self.assertEqual(self.pedir("POST", "/indices/aa", cuerpo={})[0], 404)

    def test_buscar_sin_indice_y_sin_consulta(self):
        self.assertEqual(self.pedir("POST", "/indices/demo/buscar", cuerpo={"consulta": "hola"})[0], 404)
        self.crear_indice("demo")
        self.assertEqual(self.pedir("POST", "/indices/demo/buscar", cuerpo={})[0], 400)
        self.assertEqual(self.pedir("POST", "/indices/demo/buscar", cuerpo={"consulta": "   "})[0], 400)
        estado, salida = self.pedir("POST", "/indices/demo/buscar", cuerpo={"consulta": "café"})
        self.assertEqual(estado, 200)
        self.assertEqual(salida[0]["id"], ORDEN["id"])
        self.assertEqual(salida[0]["texto"], ORDEN["text"])
        self.assertEqual(salida[0]["puntuacion"], ORDEN["score"])
        self.assertEqual(salida[0]["metadatos"], ORDEN["metadata"])

    def test_filtros_y_peso_llegan_tal_cual_al_buscador(self):
        self.crear_indice("demo")
        filtros = {"alcance": {"in": ["perfil", "publica"]}, "sujeto": {"==": "perfil:alex"}}
        cuerpo = {"consulta": "planes del café", "k": 3, "filtros": filtros, "peso_vector": 0.7}
        self.assertEqual(self.pedir("POST", "/indices/demo/buscar", cuerpo=cuerpo)[0], 200)
        buscador = self.servidor.cache._datos[os.path.join(self.dir_indices, "demo", "documents.leann")]
        self.assertEqual(buscador.consulta, "planes del café")
        self.assertEqual(buscador.top_k, 3)
        self.assertEqual(buscador.filtros, filtros)
        self.assertEqual(buscador.resto, {"vector_weight": 0.7})

    def test_poner_sin_alcance_es_400(self):
        mal = {"textos": [{"texto": "sin alcance", "metadatos": {"sujeto": "x"}}]}
        self.assertEqual(self.pedir("POST", "/indices/demo/poner", cuerpo=mal)[0], 400)
        vacios = {"textos": [{"texto": "sin metadatos"}]}
        self.assertEqual(self.pedir("POST", "/indices/demo/poner", cuerpo=vacios)[0], 400)
        self.assertEqual(self.pedir("POST", "/indices/demo/poner", cuerpo={})[0], 400)

    def test_poner_crea_el_indice_y_lo_lista(self):
        textos = [{"texto": "planes del café", "metadatos": {"alcance": "perfil", "sujeto": "perfil:alex"}}]
        estado, salida = self.pedir("POST", "/indices/perfil-alex-perfil/poner", cuerpo={"textos": textos})
        self.assertEqual(estado, 200)
        self.assertEqual(salida, {"estado": "ok"})
        self.assertEqual(len(ConstructorFalso.creados), 1)
        constructor = ConstructorFalso.creados[0]
        self.assertEqual(constructor.backend_name, "hnsw")
        self.assertEqual(constructor.kwargs["embedding_mode"], "ollama")
        self.assertEqual(constructor.kwargs["embedding_model"], "qwen3-embedding:0.6b")
        self.assertEqual(constructor.textos[0][0], "planes del café")
        self.assertEqual(constructor.textos[0][1]["alcance"], "perfil")
        ruta_creada = os.path.join(self.dir_indices, "perfil-alex-perfil", "documents.leann")
        self.assertEqual(constructor.creado, ruta_creada)
        self.assertTrue(os.path.exists(ruta_creada))
        self.assertEqual(self.pedir("GET", "/indices")[1], {"indices": ["perfil-alex-perfil"]})

    def test_poner_sobre_existente_actualiza(self):
        textos = {"textos": [{"texto": "otra", "metadatos": {"alcance": "coinsciencia"}}]}
        self.assertEqual(self.pedir("POST", "/indices/demo/poner", cuerpo=textos)[0], 200)
        ruta = os.path.join(self.dir_indices, "demo", "documents.leann")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("ya existía")
        self.assertEqual(self.pedir("POST", "/indices/demo/poner", cuerpo=textos)[0], 200)
        self.assertEqual(len(ConstructorFalso.actualizados), 1)
        self.assertEqual(ConstructorFalso.actualizados[0].actualizado, ruta)
        self.assertEqual(len(ConstructorFalso.creados), 1)

    def test_cache_de_4_buscadores(self):
        for i in range(5):
            self.crear_indice("demo-%d" % i)
            cuerpo = {"consulta": "c%d" % i}
            self.assertEqual(self.pedir("POST", "/indices/demo-%d/buscar" % i, cuerpo=cuerpo)[0], 200)
        self.assertEqual(BuscadorFalso.conteo, 5)
        self.assertEqual(len(self.servidor.cache._datos), 4)


if __name__ == "__main__":
    unittest.main()


