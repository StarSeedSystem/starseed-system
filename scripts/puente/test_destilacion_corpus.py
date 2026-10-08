# -*- coding: utf-8 -*-
"""Pruebas del corpus de destilación: calidad, sin duplicados y sin secretos."""

import importlib.util
import os
import unittest

_ruta = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "destilacion_corpus.py"
)
_spec = importlib.util.spec_from_file_location("destilacion_corpus", _ruta)
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)

SHA = "a1b2c3d"
DIFF_OK = "diff --git a/salas.ts b/salas.ts\n+export function salas() { return 1 }"


def _tarea(**kw):
    base = {"id": "t1", "encargo": "Crear contrato de salas", "modelo": "kimi-k3", "area": "mando"}
    base.update(kw)
    return base


def _entrada(**kw):
    base = {"id": "t1", "estado": "commit", "sha": SHA, "revisor": "aprobado"}
    base.update(kw)
    return base


class TestEjemploDeTarea(unittest.TestCase):
    def test_commit_con_revision_limpia_entra(self):
        e = D.ejemplo_de_tarea(_tarea(), _entrada(revision={"veredicto": "aprobado"}), DIFF_OK)
        self.assertIsNotNone(e)
        self.assertEqual("Crear contrato de salas", e["encargo"])
        self.assertEqual("kimi-k3", e["modelo"])
        self.assertEqual("mando", e["area"])
        self.assertEqual(SHA, e["sha"])

    def test_rechazada_no_entra(self):
        e = D.ejemplo_de_tarea(_tarea(), _entrada(estado="rechazada"), DIFF_OK)
        self.assertIsNone(e)

    def test_revision_bloqueante_no_entra(self):
        self.assertIsNone(D.ejemplo_de_tarea(_tarea(), _entrada(revisor="bloqueante"), DIFF_OK))
        self.assertIsNone(
            D.ejemplo_de_tarea(_tarea(), _entrada(revision={"bloqueante": True}), DIFF_OK)
        )

    def test_sha_invalido_rechazado(self):
        self.assertIsNone(D.ejemplo_de_tarea(_tarea(), _entrada(sha="--output=/etc/passwd"), DIFF_OK))

    def test_secretos_sustituidos_por_marca(self):
        diff = (
            DIFF_OK
            + "\n+API_KEY: \"sk-test-123456789\""
            + "\n+Authorization: Bearer token_largo_xyz"
            + '\n+"apiKey": "sk-proj-9876543210"'
            + "\n+ghp_suelto123456789012345"
        )
        e = D.ejemplo_de_tarea(_tarea(), _entrada(), diff)
        self.assertIsNotNone(e)
        self.assertNotIn("sk-test-123456789", e["respuesta"])
        self.assertNotIn("Bearer token_largo_xyz", e["respuesta"])
        self.assertNotIn("ghp_suelto123456789012345", e["respuesta"])
        self.assertEqual(4, e["respuesta"].count(D.MARCA_SECRETO))


class TestRecoger(unittest.TestCase):
    def test_sin_duplicados_por_sha(self):
        progreso = [_entrada(), _entrada(id="t2")]
        tareas = [_tarea(), _tarea(id="t2", encargo="Otra tarea mismo sha")]
        ejemplos = D.recoger(progreso, tareas, lambda sha: DIFF_OK)
        self.assertEqual(1, len(ejemplos))

    def test_rechazadas_y_bloqueantes_filtradas_en_lote(self):
        progreso = [
            _entrada(),
            _entrada(id="t2", estado="rechazada", sha="b2c3d4e"),
            _entrada(id="t3", sha="c3d4e5f", revision={"veredicto": "bloqueante"}),
        ]
        tareas = [_tarea(), _tarea(id="t2"), _tarea(id="t3")]
        ejemplos = D.recoger(progreso, tareas, lambda sha: DIFF_OK)
        self.assertEqual([SHA], [e["sha"] for e in ejemplos])


if __name__ == "__main__":
    unittest.main()
