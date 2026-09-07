# -*- coding: utf-8 -*-
"""Tests de la escritura por trozos y los escritores del orquestador (2026-09-06, Ola 261).

Sin red: `SALUD_JSON` y `RUTA_OPENCODE_CFG` se parchean a archivos temporales con pytest
(`monkeypatch`) y se ejercitan `apto_para_tarea`, `asegurar_modelo_opencode` y las variables
`ESCRITURA_S` / `ESTANCADO_S` que salen del entorno. El módulo se importa con importlib porque
el nombre del archivo lleva guiones (igual que en test_alcance.py); el import es seguro porque
el arranque vive bajo `if __name__ == "__main__"`.
"""
import importlib.util
import json
import os
import sys
import unittest

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


def _futuro(horas):
    import time
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(time.time() + horas * 3600))


class AptoParaTareaTest(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def _salud(self, tmp_path, monkeypatch):
        f = tmp_path / "salud-proveedores.json"
        json.dump({}, open(f, "w", encoding="utf-8"))
        monkeypatch.setattr(enjambre, "SALUD_JSON", str(f))

    def test_gpt_oss_solo_markdown(self):
        # llm7/gpt-oss escribe documentación, no código: solo apto si TODOS son .md.
        self.assertTrue(enjambre.apto_para_tarea("llm7/gpt-oss", {"archivos": ["a.md"]}))
        self.assertFalse(enjambre.apto_para_tarea("llm7/gpt-oss", {"archivos": ["a.md", "b.ts"]}))

    def test_gpt_oss_sin_archivos_no_es_apto(self):
        # Sin archivos pedidos no hay garantía de que sea Markdown: se excluye.
        self.assertFalse(enjambre.apto_para_tarea("llm7/gpt-oss", {}))

    def test_otro_modelo_markdown_o_codigo(self):
        # Solo la regla de gpt-oss limita por archivos; el resto es apto.
        self.assertTrue(enjambre.apto_para_tarea("xkiro/qwen3-coder-plus", {"archivos": ["a.ts"]}))

    def test_proveedor_sin_cupo_futuro_no_apto(self):
        prov = enjambre.proveedor_de("llm7/gpt-oss")
        datos = {prov: {"sin_cupo_hasta": _futuro(24), "motivo": "cuota diaria"}}
        json.dump(datos, open(enjambre.SALUD_JSON, "w", encoding="utf-8"))
        self.assertFalse(enjambre.apto_para_tarea("llm7/gpt-oss", {"archivos": ["a.md"]}))


class AsegurarModeloTest(unittest.TestCase):
    @pytest.fixture(autouse=True)
    def _cfg(self, tmp_path, monkeypatch):
        f = tmp_path / "opencode.json"
        json.dump({"provider": {"nim": {"name": "NIM"}}}, open(f, "w", encoding="utf-8"))
        monkeypatch.setattr(enjambre, "RUTA_OPENCODE_CFG", str(f))

    def test_crea_bloque_llm7_sin_tocar_lo_existente(self):
        self.assertTrue(enjambre.asegurar_modelo_opencode("llm7/gpt-oss"))
        cfg = json.load(open(enjambre.RUTA_OPENCODE_CFG, encoding="utf-8"))
        provs = cfg["provider"]
        self.assertIn("nim", provs)                                   # no toca los existentes
        self.assertEqual(provs["llm7"]["name"], "LLM7 (sin clave)")   # bloque nuevo completo
        self.assertEqual(provs["llm7"]["options"]["baseURL"], "https://api.llm7.io/v1")
        self.assertEqual(provs["llm7"]["options"]["apiKey"], "sin-clave")
        self.assertIn("gpt-oss", provs["llm7"]["models"])             # añade el modelo pedido

    def test_modelo_ya_declarado_no_reescribe(self):
        enjambre.asegurar_modelo_opencode("llm7/gpt-oss")
        self.assertTrue(enjambre.asegurar_modelo_opencode("llm7/gpt-oss"))
        cfg = json.load(open(enjambre.RUTA_OPENCODE_CFG, encoding="utf-8"))
        self.assertEqual(len(cfg["provider"]), 2)   # no duplica ni nim ni llm7

    def test_sin_modelo_no_asegura(self):
        # Sin parte de modelo no hay nada que añadir: devuelve False y no escribe.
        self.assertFalse(enjambre.asegurar_modelo_opencode("solo-proveedor"))
        cfg = json.load(open(enjambre.RUTA_OPENCODE_CFG, encoding="utf-8"))
        self.assertNotIn("solo-proveedor", cfg["provider"])


class UmbralesEntornoTest(unittest.TestCase):
    def test_escritura_y_estancado_desde_el_entorno(self):
        # Recargamos el módulo con la variable puesta; hay que restaurar el entorno al final.
        os.environ["STARSEED_ESCRITURA_S"] = "600"
        try:
            ESPEC.loader.exec_module(enjambre)   # re-ejecuta con la variable puesta
            self.assertEqual(enjambre.ESCRITURA_S, 600)
            self.assertEqual(enjambre.ESTANCADO_S, 900)
        finally:
            del os.environ["STARSEED_ESCRITURA_S"]
            ESPEC.loader.exec_module(enjambre)   # vuelve a los defectos (1500 / max(900, 1500//2))


if __name__ == "__main__":
    unittest.main()