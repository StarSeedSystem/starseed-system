#!/usr/bin/env python3
"""Pruebas de `n8n_hf.py` y de los flujos de `deploy/n8n-hf/` (ola 1005B, PRD1005T).

Sin red ni archivos reales: el cliente HF y el abridor HTTP se inyectan, y los
flujos se validan como JSON estático (nodos, conexiones y un webhook).
"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest

_RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location(
    "n8n_hf", os.path.join(_RAIZ, "scripts", "puente", "n8n_hf.py"))
n8n_hf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(n8n_hf)

FLUJOS = os.path.join(_RAIZ, "deploy", "n8n-hf", "flujos")
ENV = {"N8N_HF_SPACE": "alex/n8n-produccion", "HF_TOKEN": "tk-prueba", "STARSEED_ENV": "/no/existe"}


class ClienteFalso:
    def __init__(self, respuesta=(200, {"stage": "RUNNING"})):
        self.llamadas = []
        self.respuesta = respuesta

    def runtime(self, repo):
        self.llamadas.append(("runtime", repo))
        return self.respuesta

    def commit(self, repo, ndjson):
        self.llamadas.append(("commit", repo, ndjson))
        return self.respuesta


class Comandos(unittest.TestCase):
    def test_estado_con_cliente_falso(self):
        cli = ClienteFalso()
        salida = []
        r = n8n_hf.estado(cliente=cli, env=dict(ENV), imprimir=salida.append)
        self.assertEqual(r["stage"], "RUNNING")
        self.assertEqual(cli.llamadas, [("runtime", "alex/n8n-produccion")])
        self.assertFalse(any("tk-prueba" in linea for linea in salida))

    def test_estado_falla_sin_space(self):
        with self.assertRaises(SystemExit):
            n8n_hf.estado(cliente=ClienteFalso(), env={"STARSEED_ENV": "/no/existe"})

    def test_despertar_ok_y_tope(self):
        self.assertTrue(n8n_hf.despertar(env=dict(ENV), abrir=lambda u, t: 200,
                                         imprimir=lambda *_: None))
        relojes = iter([0, 10, 70])
        self.assertFalse(n8n_hf.despertar(
            env=dict(ENV), abrir=lambda u, t: (_ for _ in ()).throw(TimeoutError()),
            dormir=lambda *_: None, reloj=lambda: next(relojes),
            imprimir=lambda *_: None))

    def test_desplegar_seco_no_llama_a_hf(self):
        cli = ClienteFalso()
        salida = []
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "Dockerfile"), "w") as f:
                f.write("FROM x\n")
            os.mkdir(os.path.join(tmp, "flujos"))
            with open(os.path.join(tmp, "flujos", "a.json"), "w") as f:
                json.dump({"nodes": []}, f)
            plan = n8n_hf.desplegar(seco=True, cliente=cli, env=dict(ENV),
                                    carpeta=tmp, imprimir=salida.append)
        self.assertEqual(plan["total"], 2)
        self.assertEqual(cli.llamadas, [])
        self.assertIn("Dockerfile", plan["archivos"])

    def test_desplegar_sube_ndjson(self):
        cli = ClienteFalso(respuesta=(200, {"ok": True}))
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "arranque.sh"), "w") as f:
                f.write("#!/bin/sh\n")
            n8n_hf.desplegar(seco=False, cliente=cli, env=dict(ENV),
                             carpeta=tmp, imprimir=lambda *_: None)
        metodo = cli.llamadas[0][0]
        ndjson = cli.llamadas[0][2]
        self.assertEqual(metodo, "commit")
        self.assertNotIn("tk-prueba", ndjson)
        self.assertIn("arranque.sh", ndjson)

    def test_desplegar_sin_nada_aborta(self):
        with tempfile.TemporaryDirectory() as tmp, self.assertRaises(SystemExit):
            n8n_hf.desplegar(seco=True, env=dict(ENV), carpeta=tmp,
                             imprimir=lambda *_: None)


class FlujosValidos(unittest.TestCase):
    def test_los_tres_flujos_son_flujos_de_n8n(self):
        for nombre in ("publicada", "pieza-lista", "revertida"):
            with open(os.path.join(FLUJOS, "%s.json" % nombre), encoding="utf-8") as f:
                flujo = json.load(f)
            nodos = flujo["nodes"]
            conexiones = flujo["connections"]
            self.assertGreaterEqual(len(nodos), 2, nombre)
            self.assertTrue(conexiones, nombre)
            tipos = [n["type"] for n in nodos]
            self.assertIn("n8n-nodes-base.webhook", tipos, nombre)
            nombres = {n["name"] for n in nodos}
            for salidas in conexiones.values():
                for grupo in salidas.get("main", []):
                    for enlace in grupo:
                        self.assertIn(enlace["node"], nombres, nombre)

    def test_cada_webhook_verifica_la_firma_hmac(self):
        for nombre in ("publicada", "pieza-lista", "revertida"):
            with open(os.path.join(FLUJOS, "%s.json" % nombre), encoding="utf-8") as f:
                flujo = json.load(f)
            codigos = "\n".join(
                n["parameters"].get("jsCode", "") for n in flujo["nodes"])
            self.assertIn("PRODUCCION_WEBHOOK_SECRETO", codigos, nombre)
            self.assertIn("x-starseed-firma", codigos, nombre)
            self.assertIn("createHmac", codigos, nombre)


N8N_FALSO = '''#!/usr/bin/env python3
"""Doble de `n8n` para probar `arranque.sh` sin el binario real (ni red)."""
import glob
import json
import os
import sys
import uuid

RUTA = os.environ["FAKE_N8N_STORE"]


def cargar():
    try:
        with open(RUTA, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def guardar(store):
    with open(RUTA, "w", encoding="utf-8") as f:
        json.dump(store, f)


args = sys.argv[1:]
if not args:
    sys.exit(0)
orden = args[0]
registro = os.environ.get("FAKE_N8N_LOG")
if registro:
    with open(registro, "a", encoding="utf-8") as f:
        f.write(" ".join(args) + "\\n")

if orden == "import:workflow":
    entrada = next((a.split("=", 1)[1] for a in args if a.startswith("--input=")), None)
    separado = "--separate" in args
    store = cargar()
    if separado:
        # n8n 1.63.4: --separate exige un DIRECTORIO; con un archivo no importa nada.
        rutas = sorted(glob.glob(os.path.join(entrada, "*.json"))) if os.path.isdir(entrada) else []
    else:
        rutas = [entrada] if entrada else []
    for ruta in rutas:
        with open(ruta, encoding="utf-8") as f:
            flujo = json.load(f)
        clave = flujo.get("id") or str(uuid.uuid4())
        store[clave] = flujo.get("name", clave)
    guardar(store)
elif orden == "list:workflow":
    for clave in cargar():
        print(clave)
elif orden == "update:workflow":
    pass
elif orden == "start":
    pass
sys.exit(0)
'''


class ArranqueIdempotente(unittest.TestCase):
    """Riesgo 1: reiniciar el Space no debe duplicar flujos."""

    def _preparar(self, tmp):
        dir_flujos = os.path.join(tmp, "flujos")
        os.mkdir(dir_flujos)
        for nombre in ("publicada", "pieza-lista", "revertida"):
            shutil.copy(os.path.join(FLUJOS, "%s.json" % nombre), dir_flujos)
        n8n = os.path.join(tmp, "n8n")
        with open(n8n, "w", encoding="utf-8") as f:
            f.write(N8N_FALSO)
        os.chmod(n8n, 0o755)
        return dir_flujos, n8n, os.path.join(tmp, "store.json")

    def _arrancar(self, dir_flujos, n8n, store, registro=None):
        env = dict(os.environ, N8N_FLUJOS_DIR=dir_flujos,
                   N8N_BIN=n8n, FAKE_N8N_STORE=store)
        if registro:
            env["FAKE_N8N_LOG"] = registro
        subprocess.run(["/bin/sh", os.path.join(_RAIZ, "deploy", "n8n-hf", "arranque.sh")],
                       env=env, check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL)

    def test_dos_arranques_dejan_un_flujo_por_nombre(self):
        with tempfile.TemporaryDirectory() as tmp:
            dir_flujos, n8n, store = self._preparar(tmp)
            self._arrancar(dir_flujos, n8n, store)
            self._arrancar(dir_flujos, n8n, store)
            with open(store, encoding="utf-8") as f:
                guardados = json.load(f)
        ids = set()
        for nombre in ("publicada", "pieza-lista", "revertida"):
            with open(os.path.join(FLUJOS, "%s.json" % nombre), encoding="utf-8") as f:
                ids.add(json.load(f)["id"])
        self.assertEqual(len(guardados), 3)
        self.assertEqual(set(guardados), ids)

    def test_la_importacion_es_una_sola_pasada_con_directorio(self):
        with tempfile.TemporaryDirectory() as tmp:
            dir_flujos, n8n, store = self._preparar(tmp)
            registro = os.path.join(tmp, "llamadas.log")
            self._arrancar(dir_flujos, n8n, store, registro)
            self._arrancar(dir_flujos, n8n, store, registro)
            with open(registro, encoding="utf-8") as f:
                llamadas = [linea.strip() for linea in f]
        importaciones = [c for c in llamadas if c.startswith("import:workflow")]
        self.assertEqual(len(importaciones), 2)
        for llamada in importaciones:
            self.assertIn("--separate", llamada)
            self.assertIn("--input=%s" % dir_flujos, llamada)
            self.assertNotIn(".json", llamada)


class FlujosIdempotentes(unittest.TestCase):
    def test_cada_flujo_lleva_un_id_estable_y_unico(self):
        ids = []
        for nombre in ("publicada", "pieza-lista", "revertida"):
            with open(os.path.join(FLUJOS, "%s.json" % nombre), encoding="utf-8") as f:
                flujo = json.load(f)
            self.assertIsInstance(flujo.get("id"), str, nombre)
            self.assertTrue(flujo["id"].strip(), nombre)
            ids.append(flujo["id"])
        self.assertEqual(len(ids), len(set(ids)))


class ConfiguracionSegura(unittest.TestCase):
    """Riesgo 2: la cookie de sesión debe viajar con la marca Secure."""

    def test_cookie_de_sesion_con_secure(self):
        with open(os.path.join(_RAIZ, "deploy", "n8n-hf", "Dockerfile"), encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("N8N_SECURE_COOKIE=true", texto)
        self.assertNotIn("N8N_SECURE_COOKIE=false", texto)


if __name__ == "__main__":
    unittest.main()
