#!/usr/bin/env python3
"""Pruebas de director_chat con carpetas temporales."""

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

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


class PruebasNoEnsucianElChatReal(unittest.TestCase):
    """(2026-10-08) Una prueba sin `raiz=` escribía en el chat REAL de Alex: «Flujo falló: f1 ·
    Ejecución: e1 · Error: error» llegó al Chat Director desde `flujos/test_servicio.py`. Ahora
    `publicar`/`entrega` no escriben en la carpeta real cuando corre una prueba."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.falsa_real = Path(self.tmp.name) / "real"
        self.dir_real = self.falsa_real / "starseed_memory_root" / "mando" / "director"
        # La «carpeta real» se simula con una ruta distinta de la temporal: en un directorio
        # que no cuelga de tempfile.gettempdir() la guarda no tendría de qué fiarse.
        self.parches = [
            mock.patch.object(dc, "_DIRECTORIOS_REALES", (str(self.dir_real),)),
            mock.patch.object(dc.tempfile, "gettempdir", return_value=os.path.join(self.tmp.name, "otro-tmp")),
        ]
        for p in self.parches:
            p.start()
        self.addCleanup(self._parar)

    def _parar(self):
        for p in self.parches:
            p.stop()
        self.tmp.cleanup()

    def test_estamos_en_pruebas(self):
        self.assertTrue(dc.en_pruebas())

    def test_publicar_en_la_carpeta_real_no_escribe_pero_devuelve_el_mensaje(self):
        with mock.patch.dict(os.environ, {"STARSEED_ROOT": str(self.falsa_real)}):
            m = dc.publicar("no debe llegar", de="flujos-servicio", canales=["claude-cowork"])
        self.assertTrue(m["id"].startswith("md-"))
        self.assertEqual(m["texto"], "no debe llegar")
        self.assertFalse(self.dir_real.exists())

    def test_entrega_en_la_carpeta_real_no_escribe(self):
        with mock.patch.dict(os.environ, {"STARSEED_ROOT": str(self.falsa_real)}):
            r = dc.entrega("md-1-aaaa", "claude-cowork", "fallo", detalle="x")
        self.assertEqual(r["estado"], "fallo")
        self.assertFalse(self.dir_real.exists())

    def test_con_raiz_temporal_sigue_escribiendo(self):
        otra = Path(self.tmp.name) / "otra-raiz"
        dc.publicar("sí llega", de="alex", rol="alex", raiz=str(otra))
        self.assertTrue((otra / "starseed_memory_root" / "mando" / "director" / "chat.jsonl").exists())

    def test_con_la_variable_de_pruebas_escribe_aunque_sea_la_real(self):
        with mock.patch.dict(
            os.environ, {"STARSEED_ROOT": str(self.falsa_real), "STARSEED_CHAT_EN_PRUEBAS": "1"}
        ):
            self.assertFalse(dc.en_pruebas())
            dc.publicar("a propósito", de="alex", rol="alex")
        self.assertTrue((self.dir_real / "chat.jsonl").exists())

    def test_import_unittest_mock_solo_no_basta_para_creerse_una_prueba(self):
        # `medidor_http_json.py` importa unittest.mock en producción: no puede callar el chat.
        import unittest.signals as senales

        with mock.patch.dict(dc.sys.modules), \
                mock.patch.object(senales, "_results", {}), \
                mock.patch.object(dc.sys, "argv", ["/Users/alex/.local/bin/servicio.py"]):
            dc.sys.modules.pop("pytest", None)
            self.assertFalse(dc.en_pruebas())


class PruebasElCanalComunNoSeEnsucia(unittest.TestCase):
    """(2026-10-08) Lo mismo para `puente.decir`, que añade al canal que leen los cuatro entornos."""

    def setUp(self):
        import importlib.util

        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        spec = importlib.util.spec_from_file_location(
            "puente_canal_prueba", str(Path(__file__).resolve().parent / "puente.py")
        )
        self.pu = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.pu)
        # «Canal real» fuera del directorio temporal del sistema, que la guarda siempre respeta.
        self.real = os.path.join(self.tmp.name, "real", "canal.jsonl")
        self.pu._CANAL_REAL = self.real
        self.pu.CANAL = self.real
        self.pu.tempfile = mock.Mock(gettempdir=lambda: os.path.join(self.tmp.name, "otro-tmp"))

    def test_decir_en_el_canal_real_desde_una_prueba_no_escribe(self):
        fila = self.pu.decir("tA: reparo (fallo_tsc)", "director", "hecho")
        self.assertEqual(fila["texto"], "tA: reparo (fallo_tsc)")
        self.assertFalse(os.path.exists(self.real))

    def test_decir_con_otro_canal_escribe(self):
        self.pu.CANAL = os.path.join(self.tmp.name, "mio", "canal.jsonl")
        self.pu.decir("hola", "prueba")
        self.assertTrue(os.path.exists(self.pu.CANAL))

    def test_decir_con_la_variable_escribe_en_el_real(self):
        with mock.patch.dict(os.environ, {"STARSEED_CHAT_EN_PRUEBAS": "1"}):
            self.pu.decir("a propósito", "prueba")
        self.assertTrue(os.path.exists(self.real))


if __name__ == "__main__":
    unittest.main()
