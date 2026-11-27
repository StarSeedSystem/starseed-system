# -*- coding: utf-8 -*-
"""Pruebas de `cloudroom_config.py` (CAP1119 · configurar y activar Cloudroom).

Todo puro: ni room-cli, ni red, ni disco real (la ruta de la config es temporal)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cloudroom_config as CC


class TestConfig(unittest.TestCase):
    def test_defaults_validos(self):
        self.assertEqual(CC.validar(CC.DEFAULTS), [])

    def test_rechaza_valores_invalidos(self):
        errs = CC.validar({"activo": "si", "tope_dia": 0, "max_vivos": 99, "modelo": 3, "proyecto": []})
        self.assertGreaterEqual(len(errs), 5)

    def test_fusionar_salva_lo_invalido_y_completa(self):
        cfg, avisos = CC.fusionar(CC.DEFAULTS, {"tope_dia": "mucho", "modelo": "pi/x", "activo": False})
        self.assertEqual(cfg["tope_dia"], 6)
        self.assertEqual(cfg["modelo"], "pi/x")
        self.assertFalse(cfg["activo"])
        self.assertTrue(avisos)

    def test_desde_entorno_ignora_vacio_y_nunca_guarda_claves(self):
        cfg = CC.desde_entorno({
            "STARSEED_CLOUDROOM_TOPE_DIA": "4",
            "STARSEED_CLOUDROOM_MODELO": "pi/x",
            "STARSEED_CLOUDROOM_PROYECTO": "",
            "NVIDIA_API_KEY": "secreto",
        })
        self.assertEqual(cfg, {"tope_dia": 4, "modelo": "pi/x"})
        self.assertNotIn("secreto", repr(cfg))

    def test_comandos_entorno_sin_claves(self):
        lineas = CC.comandos_entorno(dict(CC.DEFAULTS, tope_dia=4, modelo="pi/x", proyecto="p1"))
        self.assertIn('export STARSEED_CLOUDROOM_TOPE_DIA="4"', lineas)
        self.assertIn('export STARSEED_CLOUDROOM_MODELO="pi/x"', lineas)
        self.assertTrue(all("API_KEY" not in l for l in lineas))


class TestEvaluar(unittest.TestCase):
    CLAVES = {"nvidia": "NVIDIA_API_KEY", "xkiro": "XKIRO_API_KEY"}

    def test_claves_necesarias_una_vez_y_en_orden(self):
        self.assertEqual(
            CC.claves_necesarias(["nvidia/z-ai/glm-5.3", "xkiro/qwen/x", "nvidia/otro"], self.CLAVES),
            ["NVIDIA_API_KEY", "XKIRO_API_KEY"],
        )
        self.assertEqual(CC.claves_necesarias([], self.CLAVES), [])

    def test_evaluar_falta_todo(self):
        r = CC.evaluar({"estado": "no_disponible", "detalle": "app sin instalar"}, CC.DEFAULTS,
                       env_nombres=set(), proyectos=[], claves={}, modelos=[])
        self.assertFalse(r["ok"])
        ids = [p["id"] for p in r["pasos"] if not p["ok"]]
        for esperado in ("app", "sesion", "proyecto"):
            self.assertIn(esperado, ids)

    def test_evaluar_listo(self):
        cfg = dict(CC.DEFAULTS, proyecto="proj-1")
        proyectos = [{"id": "proj-1", "sources": [{"path": "/tmp/x"}]}]
        r = CC.evaluar({"estado": "usable", "detalle": "cuenta conectada"}, cfg,
                       env_nombres={"NVIDIA_API_KEY"}, proyectos=proyectos,
                       claves=self.CLAVES, modelos=["nvidia/z-ai/glm-5.3"])
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["faltan"], [])

    def test_proyecto_configurado_debe_existir(self):
        cfg = dict(CC.DEFAULTS, proyecto="proj-1")
        r = CC.evaluar({"estado": "usable", "detalle": "ok"}, cfg,
                       env_nombres=set(), proyectos=[], claves={}, modelos=[])
        self.assertFalse(r["ok"])
        self.assertTrue(any(p["id"] == "proyecto" and not p["ok"] for p in r["pasos"]))

    def test_clave_que_falta_se_nombra_sin_valor(self):
        r = CC.evaluar({"estado": "usable", "detalle": "ok"}, dict(CC.DEFAULTS, proyecto="p"),
                       env_nombres=set(), proyectos=[{"id": "p", "sources": []}],
                       claves=self.CLAVES, modelos=["nvidia/z-ai/glm-5.3"])
        self.assertFalse(r["ok"])
        texto = CC.texto(r)
        self.assertIn("NVIDIA_API_KEY", texto)
        self.assertNotIn("sk-", texto)


class TestDisco(unittest.TestCase):
    def test_guardar_y_cargar_en_ruta_temporal(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "cloudroom-config.json")
            CC.guardar(dict(CC.DEFAULTS, tope_dia=2), ruta=ruta)
            cfg, avisos = CC.cargar(ruta)
            self.assertEqual(avisos, [])
            self.assertEqual(cfg["tope_dia"], 2)

    def test_cargar_sin_archivo_da_defaults(self):
        with tempfile.TemporaryDirectory() as d:
            cfg, avisos = CC.cargar(os.path.join(d, "no-existe.json"))
            self.assertEqual(cfg, CC.DEFAULTS)
            self.assertEqual(avisos, [])


if __name__ == "__main__":
    unittest.main()
