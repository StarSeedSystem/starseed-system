#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dockerfile del servidor de malla (OR1007F, contrato architecture/oracle-nube.md §3 y §7).

Comprueba, sin Docker: base node 22 alpine, usuario no root, HEALTHCHECK contra una ruta que el
servidor sirve de verdad, sin copiar .env* y con `.dockerignore` que los excluye.
"""
import os
import re
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CARPETA = os.path.join(RAIZ, "docs", "examples", "starseed-mesh-server")


def _leer(nombre):
    with open(os.path.join(CARPETA, nombre), encoding="utf-8") as f:
        return f.read()


class DockerfileMalla(unittest.TestCase):
    def setUp(self):
        self.d = _leer("Dockerfile")

    def test_base_node_22_alpine(self):
        self.assertRegex(self.d, r"(?m)^FROM node:22-alpine\b")

    def test_usuario_no_root(self):
        usuarios = re.findall(r"(?m)^USER\s+(\S+)", self.d)
        self.assertTrue(usuarios, "falta USER")
        self.assertNotEqual(usuarios[-1].lower(), "root")

    def test_healthcheck_contra_una_ruta_real_del_servidor(self):
        m = re.search(r"HEALTHCHECK[\s\S]*?localhost:\$\{PORT\}(/[\w/]+)", self.d)
        self.assertIsNotNone(m, "falta HEALTHCHECK con localhost:${PORT}/<ruta>")
        self.assertIn('u.pathname === "%s"' % m.group(1), _leer("index.mjs"))

    def test_no_copia_env_y_dockerignore_lo_excluye(self):
        for linea in self.d.splitlines():
            if linea.strip().startswith(("COPY", "ADD")):
                self.assertNotIn(".env", linea)
        self.assertIn(".env*", _leer(".dockerignore"))

    def test_instala_las_opcionales_sin_npm_ci(self):
        # Sin package-lock, `npm ci` falla siempre: `pg` no llegaba nunca.
        runs = [l for l in self.d.splitlines() if l.strip().startswith("RUN")]
        self.assertFalse(any("npm ci" in l for l in runs))
        self.assertTrue(any("npm install --omit=dev" in l for l in runs))


if __name__ == "__main__":
    unittest.main()
