#!/usr/bin/env python3
"""Pruebas de `n8n_hf.py` y de los flujos de `deploy/n8n-hf/` (ola 1005B, PRD1005T).

Sin red ni archivos reales: el cliente HF y el abridor HTTP se inyectan, y los
flujos se validan como JSON estático (nodos, conexiones y un webhook).
"""
from __future__ import annotations

import importlib.util
import json
import os
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
            open(os.path.join(tmp, "Dockerfile"), "w").write("FROM x\n")
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
            open(os.path.join(tmp, "arranque.sh"), "w").write("#!/bin/sh\n")
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


if __name__ == "__main__":
    unittest.main()
