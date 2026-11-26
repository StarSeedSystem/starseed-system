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
DOCKERFILE = os.path.join(_RAIZ, "deploy", "n8n-hf", "Dockerfile")
ARRANQUE = os.path.join(_RAIZ, "deploy", "n8n-hf", "arranque.sh")
ENV = {"N8N_HF_SPACE": "alex/n8n-produccion", "HF_TOKEN": "tk-prueba", "STARSEED_ENV": "/no/existe"}

# IDs esperados para idempotencia (PRD1005Tb)
IDS_ESPERADOS = {
    "publicada": "b1a0c2d4-0001-4e10-9a01-000000000001",
    "pieza-lista": "b1a0c2d4-0002-4e10-9a02-000000000002",
    "revertida": "b1a0c2d4-0003-4e10-9a03-000000000003",
}


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


class IdempotenciaFlujos(unittest.TestCase):
    """Pruebas para la idempotencia de flujos (PRD1005Tb)."""

    def test_cada_flujo_tiene_id_estable(self):
        """Cada flujo JSON debe tener un campo 'id' con UUID estable."""
        for nombre, id_esperado in IDS_ESPERADOS.items():
            with open(os.path.join(FLUJOS, "%s.json" % nombre), encoding="utf-8") as f:
                flujo = json.load(f)
            self.assertIn("id", flujo, f"Falta 'id' en {nombre}")
            self.assertEqual(flujo["id"], id_esperado, f"id incorrecto en {nombre}")

    def test_dockerfile_tiene_secure_cookie_true(self):
        """Dockerfile debe tener N8N_SECURE_COOKIE=true para HTTPS."""
        with open(DOCKERFILE, encoding="utf-8") as f:
            contenido = f.read()
        self.assertIn("N8N_SECURE_COOKIE=true", contenido)

    def test_arranque_usa_importacion_idempotente(self):
        """arranque.sh debe importar el directorio completo con --separate para upsert por id."""
        with open(ARRANQUE, encoding="utf-8") as f:
            contenido = f.read()
        # Debe usar la variable FLUJOS y importar el directorio
        self.assertIn('FLUJOS="${N8N_FLUJOS_DIR:-/opt/flujos}"', contenido)
        self.assertIn('--input="$FLUJOS"', contenido)
        self.assertIn("--separate", contenido)
        # No debe iterar archivo por archivo (eso crea duplicados)
        self.assertNotIn('for f in /opt/flujos/*.json', contenido)


if __name__ == "__main__":
    unittest.main()
