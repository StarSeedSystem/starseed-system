# -*- coding: utf-8 -*-
"""Pruebas del paquete web de Needle 3, siempre con un CLI falso.

Sin red, sin procesos del CLI de verdad y sin tocar el catálogo del repo:
todo corre en carpetas temporales y el `ejecutar` falso solo escribe bytes.
"""
import json
import os
import tempfile
import unittest

import needle_web_paquete as P


def cli_falso(args):
    """Simula `needle build --platform web --out <dir>` y `needle weights`."""
    destino = args[-1]
    if "weights" in args:
        with open(destino, "wb") as f:
            f.write(b"pesos-falsos-needle3")
        return
    os.makedirs(destino, exist_ok=True)
    with open(os.path.join(destino, "needle.js"), "wb") as f:
        f.write(b"glue-emscripten-falso")
    with open(os.path.join(destino, "needle.wasm"), "wb") as f:
        f.write(b"wasm-falso")


def cli_falso_sin_pesos(args):
    destino = args[-1]
    if "weights" in args:
        with open(destino, "wb") as f:
            f.write(b"pesos-falsos-needle3")
        return
    os.makedirs(destino, exist_ok=True)
    with open(os.path.join(destino, "needle.js"), "wb") as f:
        f.write(b"glue")
    with open(os.path.join(destino, "needle.wasm"), "wb") as f:
        f.write(b"wasm")


class ConstruirPaquete(unittest.TestCase):
    def test_con_cli_falso_deja_los_tres_archivos_con_su_sha(self):
        with tempfile.TemporaryDirectory() as dir_tmp:
            shas = P.construir_paquete(dir_tmp, ejecutar=cli_falso)
            self.assertEqual(sorted(shas), sorted(P.ARCHIVOS_PAQUETE))
            for nombre, sha in shas.items():
                self.assertEqual(len(sha), 64)
                self.assertEqual(sha, P.sha256_de(os.path.join(dir_tmp, nombre)))

    def test_pide_los_pesos_al_cli_si_build_no_los_trajo(self):
        with tempfile.TemporaryDirectory() as dir_tmp:
            shas = P.construir_paquete(dir_tmp, ejecutar=cli_falso_sin_pesos)
            self.assertIn("needle3.cact", shas)

    def test_paquete_incompleto_falla_y_no_anota_nada(self):
        def cli_roto(args):
            return
        with tempfile.TemporaryDirectory() as dir_tmp:
            with self.assertRaises(RuntimeError):
                P.construir_paquete(dir_tmp, ejecutar=cli_roto)

    def test_sin_cli_instalado_no_disponible(self):
        with tempfile.TemporaryDirectory() as dir_tmp:
            with self.assertRaises(RuntimeError):
                P.construir_paquete(dir_tmp, cli="needle-que-no-existe-xyz")


class Catalogo(unittest.TestCase):
    def test_actualizar_catalogo_sustituye_la_entrada_sin_duplicar(self):
        with tempfile.TemporaryDirectory() as dir_tmp:
            ruta = os.path.join(dir_tmp, "capas.json")
            base = {
                "esquema": 1,
                "actualizado": "2026-10-07",
                "capas": [
                    {"id": P.ID_CAPA, "sha256": "por-verificar"},
                    {"id": "otra-capa", "sha256": "por-verificar"},
                ],
            }
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(base, f)
            entrada = P.entrada_catalogo(
                {n: "a" * 64 for n in P.ARCHIVOS_PAQUETE},
                version="3.1.2", fecha="2026-10-07",
                fuente_oficial="https://huggingface.co/Cactus-Compute/needle3",
            )
            catalogo = P.actualizar_catalogo(ruta, entrada)
            ids = [c["id"] for c in catalogo["capas"]]
            self.assertEqual(ids.count(P.ID_CAPA), 1)
            self.assertIn("otra-capa", ids)
            con_sha = next(c for c in catalogo["capas"] if c["id"] == P.ID_CAPA)
            self.assertEqual(con_sha["sha256"], "a" * 64)
            self.assertEqual(con_sha["archivos"]["needle.wasm"], "a" * 64)
            with open(ruta, "r", encoding="utf-8") as f:
                guardado = json.load(f)
            self.assertEqual(guardado["capas"][0]["id"], P.ID_CAPA)

    def test_main_no_sube_nada_y_deja_el_paquete_en_el_destino(self):
        with tempfile.TemporaryDirectory() as dir_tmp:
            destino = os.path.join(dir_tmp, "needle-web")
            catalogo = os.path.join(dir_tmp, "capas.json")
            with open(catalogo, "w", encoding="utf-8") as f:
                json.dump({"esquema": 1, "capas": []}, f)
            shas = P.construir_paquete(destino, ejecutar=cli_falso)
            entrada = P.entrada_catalogo(shas, "3.1.2", "2026-10-07", "oficial")
            P.actualizar_catalogo(catalogo, entrada)
            self.assertTrue(os.path.exists(os.path.join(destino, "needle.wasm")))
            with open(catalogo, encoding="utf-8") as f:
                self.assertEqual(json.load(f)["capas"][0]["sha256"],
                                 shas["needle3.cact"])


if __name__ == "__main__":
    unittest.main()
