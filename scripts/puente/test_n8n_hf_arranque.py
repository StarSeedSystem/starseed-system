#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reparación de `deploy/n8n-hf/` (PRD1005Tbsb).

Riesgo 1: `import:workflow --separate` con un archivo (no un directorio) y flujos
sin `id` creaba una copia nueva en cada arranque. La reparación normaliza cada
flujo con un `id` estable y hace UNA importación por directorio: n8n actualiza
por `id` en vez de insertar.

Riesgo 2: `N8N_SECURE_COOKIE=false` dejaba la cookie de sesión sin `Secure`.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ARRANQUE = os.path.join(RAIZ, "deploy", "n8n-hf", "arranque.sh")
DOCKERFILE = os.path.join(RAIZ, "deploy", "n8n-hf", "Dockerfile")
FLUJOS = os.path.join(RAIZ, "deploy", "n8n-hf", "flujos")
NOMBRES = ("publicada", "pieza-lista", "revertida")


def _normalizar(entrada: str, salida: str) -> subprocess.CompletedProcess:
    """Carga arranque.sh sin arrancar n8n y normaliza un flujo a `salida`."""
    orden = 'ARRANQUE_SOLO_FUNCIONES=1; . "$1"; normalizar_flujo "$2" "$3"'
    return subprocess.run(
        ["sh", "-c", orden, "sh", ARRANQUE, entrada, salida],
        capture_output=True, text=True, timeout=30,
    )


class FlujosSinDuplicados(unittest.TestCase):
    def test_normalizar_da_un_id_estable_y_unico_por_flujo(self):
        with tempfile.TemporaryDirectory() as tmp:
            ids = {}
            for nombre in NOMBRES:
                salida = os.path.join(tmp, "%s.json" % nombre)
                r = _normalizar(os.path.join(FLUJOS, "%s.json" % nombre), salida)
                self.assertEqual(r.returncode, 0, r.stderr)
                with open(salida, encoding="utf-8") as f:
                    flujo = json.load(f)
                self.assertTrue(flujo.get("id"), nombre)
                ids[nombre] = flujo["id"]
            self.assertEqual(len(set(ids.values())), len(NOMBRES))

    def test_dos_arranques_importan_los_mismos_ids(self):
        # n8n hace upsert por `id`: si el id no cambia, no hay copia nueva.
        with tempfile.TemporaryDirectory() as tmp:
            ids = []
            for vuelta in range(2):
                carpeta = os.path.join(tmp, "vuelta-%d" % vuelta)
                os.mkdir(carpeta)
                for nombre in NOMBRES:
                    salida = os.path.join(carpeta, "%s.json" % nombre)
                    r = _normalizar(os.path.join(FLUJOS, "%s.json" % nombre), salida)
                    self.assertEqual(r.returncode, 0, r.stderr)
                    with open(salida, encoding="utf-8") as f:
                        ids.append(json.load(f)["id"])
            self.assertEqual(ids[:len(NOMBRES)], ids[len(NOMBRES):])

    def test_respeta_un_id_que_ya_venga_en_el_flujo(self):
        with tempfile.TemporaryDirectory() as tmp:
            entrada = os.path.join(tmp, "entrada.json")
            salida = os.path.join(tmp, "salida.json")
            with open(entrada, "w", encoding="utf-8") as f:
                json.dump({"id": "id-fijo", "nodes": [], "connections": {}}, f)
            r = _normalizar(entrada, salida)
            self.assertEqual(r.returncode, 0, r.stderr)
            with open(salida, encoding="utf-8") as f:
                self.assertEqual(json.load(f)["id"], "id-fijo")

    def test_importa_por_directorio_no_archivo_por_archivo(self):
        # `--separate` de n8n exige un directorio; con un archivo no importa nada.
        with open(ARRANQUE, encoding="utf-8") as f:
            script = f.read()
        self.assertIn('--separate --input="$DESTINO_TMP"', script)
        self.assertNotIn('--input="$f" --separate', script)


class CookieSegura(unittest.TestCase):
    def test_la_cookie_de_sesion_lleva_secure(self):
        with open(DOCKERFILE, encoding="utf-8") as f:
            dockerfile = f.read()
        self.assertNotIn("N8N_SECURE_COOKIE=false", dockerfile)
        self.assertIn("N8N_SECURE_COOKIE=true", dockerfile)


if __name__ == "__main__":
    unittest.main()
