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
import textwrap
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


_FAKE_N8N = textwrap.dedent(
    """\
    #!/usr/bin/env python3
    import json, os, sys

    estado_path = os.environ["FAKE_N8N_ESTADO"]
    try:
        with open(estado_path, encoding="utf-8") as f:
            estado = json.load(f)
    except FileNotFoundError:
        estado = {}

    args = sys.argv[1:]
    comando = args[0] if args else ""

    def valor(flag):
        for i, a in enumerate(args):
            if a == flag:
                return args[i + 1]
            if a.startswith(flag + "="):
                return a.split("=", 1)[1]
        return ""

    if comando == "import:workflow":
        entrada = valor("--input")
        if "--separate" in args:
            for nombre in sorted(os.listdir(entrada)):
                if not nombre.endswith(".json"):
                    continue
                with open(os.path.join(entrada, nombre), encoding="utf-8") as f:
                    flujo = json.load(f)
                estado[flujo.get("id") or "nuevo-" + nombre] = flujo.get("name", "")
        else:
            with open(entrada, encoding="utf-8") as f:
                flujos = json.load(f)
            for flujo in flujos:
                estado[flujo.get("id") or "nuevo-" + flujo.get("name", "")] = flujo.get("name", "")
        with open(estado_path, "w", encoding="utf-8") as f:
            json.dump(estado, f)
    elif comando == "list:workflow" and "--onlyId" in args:
        for identificador in estado:
            print(identificador)
    sys.exit(0)
    """
)


class ArranqueIdempotente(unittest.TestCase):
    """`arranque.sh` actualiza por id; reiniciar no debe duplicar flujos."""

    ARRANQUE = os.path.join(_RAIZ, "deploy", "n8n-hf", "arranque.sh")

    def _arrancar(self, flujos_dir, estado_path):
        with tempfile.TemporaryDirectory() as bin_dir:
            falso = os.path.join(bin_dir, "n8n")
            with open(falso, "w", encoding="utf-8") as f:
                f.write(_FAKE_N8N)
            os.chmod(falso, 0o755)
            entorno = dict(os.environ)
            entorno["PATH"] = bin_dir + os.pathsep + entorno.get("PATH", "")
            entorno["FLUJOS_DIR"] = flujos_dir
            entorno["FAKE_N8N_ESTADO"] = estado_path
            return subprocess.run(
                ["sh", self.ARRANQUE], env=entorno, capture_output=True,
                text=True, timeout=30,
            )

    def test_los_tres_flujos_llevan_un_id_estable_y_unico(self):
        vistos = set()
        for nombre in ("publicada", "pieza-lista", "revertida"):
            with open(os.path.join(FLUJOS, "%s.json" % nombre), encoding="utf-8") as f:
                flujo = json.load(f)
            identificador = flujo.get("id")
            self.assertIsInstance(identificador, str, nombre)
            self.assertTrue(identificador, nombre)
            self.assertNotIn(identificador, vistos, nombre)
            vistos.add(identificador)

    def test_dos_arranques_seguidos_no_duplican_los_flujos(self):
        with tempfile.TemporaryDirectory() as tmp:
            flujos = os.path.join(tmp, "flujos")
            shutil.copytree(FLUJOS, flujos)
            estado_path = os.path.join(tmp, "estado.json")
            for _ in range(2):
                r = self._arrancar(flujos, estado_path)
                self.assertEqual(r.returncode, 0, r.stderr)
            with open(estado_path, encoding="utf-8") as f:
                estado = json.load(f)
            self.assertEqual(len(estado), 3)

    def test_un_flujo_sin_id_no_se_importa_para_no_duplicarlo(self):
        with tempfile.TemporaryDirectory() as tmp:
            flujos = os.path.join(tmp, "flujos")
            shutil.copytree(FLUJOS, flujos)
            ruta = os.path.join(flujos, "publicada.json")
            with open(ruta, encoding="utf-8") as f:
                flujo = json.load(f)
            flujo.pop("id", None)
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(flujo, f)
            estado_path = os.path.join(tmp, "estado.json")
            r = self._arrancar(flujos, estado_path)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertFalse(os.path.exists(estado_path))

    def test_importa_la_carpeta_una_vez_no_archivo_a_archivo_con_separate(self):
        with open(self.ARRANQUE, encoding="utf-8") as f:
            guion = f.read()
        self.assertIn('--separate --input="$FLUJOS_DIR"', guion)
        self.assertNotIn('--input="$f"', guion)


class CookieSegura(unittest.TestCase):
    def test_la_cookie_de_sesion_exige_https(self):
        with open(os.path.join(_RAIZ, "deploy", "n8n-hf", "Dockerfile"), encoding="utf-8") as f:
            dockerfile = f.read()
        self.assertNotIn("N8N_SECURE_COOKIE=false", dockerfile)
        self.assertIn("N8N_SECURE_COOKIE=true", dockerfile)


if __name__ == "__main__":
    unittest.main()
