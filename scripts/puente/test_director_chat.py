#!/usr/bin/env python3
"""Pruebas de director_chat con carpetas temporales."""

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import director_chat as dc


class PruebasTachar(unittest.TestCase):
    def test_tacha_claves_habituales(self):
        texto = (
            "usa sk-abc123def456ghi y gh[pousr]_TEST1234567 y "
            "AIzaSyAbcdefghijklmn y hf_abcdefghij y gsk_abcdef1234"
        )
        limpio = dc.tachar(texto)
        self.assertNotIn("sk-abc", limpio)
        self.assertNotIn("AIzaSy", limpio)
        self.assertNotIn("hf_", limpio)
        self.assertNotIn("gsk_", limpio)
        self.assertIn("[oculto]", limpio)

    def test_tacha_jwt_bearer_y_cloudflare(self):
        texto = (
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl "
            "Bearer miTokenSuperSecreto123 https://app-123.trycloudflare.com/api"
        )
        limpio = dc.tachar(texto)
        self.assertNotIn("eyJhbGci", limpio)
        self.assertNotIn("miTokenSuperSecreto123", limpio)
        self.assertNotIn("trycloudflare", limpio)


class PruebasConCarpeta(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        (Path(self.raiz) / "starseed_memory_root" / "mando" / "director").mkdir(
            parents=True
        )

    def tearDown(self):
        self.tmp.cleanup()

    def test_publicar_y_leer(self):
        m = dc.publicar(
            "hola **equipo**",
            de="claude-cowork",
            canales=["claude-cowork"],
            raiz=self.raiz,
        )
        self.assertTrue(m["id"].startswith("md-"))
        leidos = dc.leer(raiz=self.raiz)
        ids = [r.get("id") for r in leidos]
        self.assertIn(m["id"], ids)
        entregas = [
            r
            for r in leidos
            if r.get("tipo") == "entrega" and r.get("de_id") == m["id"]
        ]
        self.assertEqual(len(entregas), 1)
        self.assertEqual(entregas[0]["estado"], "pendiente")

    def test_publicar_tacha_y_recorta(self):
        m = dc.publicar(
            "clave sk-abc123def456 y " + "x" * 21000, de="hermes", raiz=self.raiz
        )
        self.assertNotIn("sk-abc", m["texto"])
        self.assertLessEqual(len(m["texto"]), dc.MAX_TEXTO)

    def test_bandeja_y_entrega_respondida(self):
        m1 = dc.publicar(
            "primero", de="hermes", canales=["antigravity"], raiz=self.raiz
        )
        dc.publicar("segundo", de="hermes", canales=["antigravity"], raiz=self.raiz)
        pendientes = dc.bandeja("antigravity", raiz=self.raiz)
        self.assertEqual(len(pendientes), 2)
        dc.entrega(m1["id"], "antigravity", "respondido", raiz=self.raiz)
        pendientes = dc.bandeja("antigravity", raiz=self.raiz)
        self.assertEqual([m["texto"] for m in pendientes], ["segundo"])

    def test_leer_desde(self):
        m1 = dc.publicar("antes", de="alex", rol="alex", raiz=self.raiz)
        time.sleep(0.01)
        corte = dc._epoch_de(m1)
        dc.publicar("despues", de="alex", rol="alex", raiz=self.raiz)
        leidos = dc.leer(desde=corte, raiz=self.raiz)
        textos = [r.get("texto") for r in leidos if r.get("texto")]
        self.assertIn("despues", textos)
        self.assertNotIn("antes", textos)

    def test_linea_rota_no_rompe_lectura(self):
        dc.publicar("valido", de="alex", rol="alex", raiz=self.raiz)
        chat = dc._chat(self.raiz)
        with open(chat, "a", encoding="utf-8") as f:
            f.write("{esto no es json\n")
        leidos = dc.leer(raiz=self.raiz)
        textos = [r.get("texto") for r in leidos]
        self.assertIn("valido", textos)

    def test_valores_no_validos(self):
        with self.assertRaises(ValueError):
            dc.publicar("x", de="alex", rol="rey", raiz=self.raiz)
        with self.assertRaises(ValueError):
            dc.entrega("md-1-aaaa", "marte", "pendiente", raiz=self.raiz)


if __name__ == "__main__":
    unittest.main()
