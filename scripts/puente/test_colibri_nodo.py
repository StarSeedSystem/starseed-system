# -*- coding: utf-8 -*-
"""Pruebas de colibri_nodo (CLB1027E): qué cabe en cada neurona y el plan de instalación sin ejecutar.

Casos de la tarea: el A1 (12 GB, 18,5 GB libres) solo deja Laya y GLiNER2.5-Decide, y Qwen3-Coder
no; la Mac (8 GB con presión) no deja a ninguno. Sin red, sin descargas, sin tocar el disco.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import colibri_nodo as C  # noqa: E402


class PruebaCaben(unittest.TestCase):
    def setUp(self):
        self.entradas = C.entradas()

    def test_catalogo(self):
        ids = {e["id"] for e in self.entradas}
        self.assertEqual(len(self.entradas), 9)
        self.assertIn("colibri-laya", ids)
        self.assertIn("colibri-gliner-decide", ids)
        self.assertIn("colibri-qwen3-coder-30b", ids)

    def test_a1(self):
        filas = C.caben(self.entradas, 12, 18.5)
        self.assertEqual([f["id"] for f in filas if f["veredicto"] == "cabe"],
                         ["colibri-laya", "colibri-gliner-decide"])

    def test_a1_qwen3_coder_no_lo_frena_el_disco(self):
        filas = {f["id"]: f for f in C.caben(self.entradas, 12, 18.5)}
        qwen = filas["colibri-qwen3-coder-30b"]
        self.assertEqual(qwen["veredicto"], "no cabe")
        self.assertIn("disco", qwen["porque"])

    def test_a1_olmoe_no_por_margen(self):
        filas = {f["id"]: f for f in C.caben(self.entradas, 12, 18.5)}
        self.assertEqual(filas["colibri-olmoe-7b"]["veredicto"], "no cabe")
        self.assertIn("sin margen", filas["colibri-olmoe-7b"]["porque"])

    def test_mac_con_presion_ninguno(self):
        filas = C.caben(self.entradas, 8, 5, presion_alta=True)
        self.assertEqual({f["veredicto"] for f in filas}, {"no cabe"})
        self.assertTrue(all("presión" in f["porque"] for f in filas))

    def test_orden_completo_y_porques(self):
        filas = C.caben(self.entradas, 12, 18.5)
        self.assertEqual([f["id"] for f in filas], [e["id"] for e in self.entradas])
        self.assertTrue(all(f["porque"] and f["capa"] for f in filas))
        laya = filas[0]
        self.assertEqual(laya["veredicto"], "cabe")
        self.assertEqual(laya["capa"], "juicio")

    def test_streaming_en_neurona_grande(self):
        filas = {f["id"]: f for f in C.caben(self.entradas, 20, 200)}
        reap = filas["colibri-deepseek-v4-flash-reap"]
        self.assertEqual(reap["veredicto"], "cabe en streaming (disco rápido)")
        self.assertIn("expertos del disco", reap["porque"])
        qwen38 = filas["colibri-qwen38-flash-next"]
        self.assertEqual(qwen38["veredicto"], "no cabe")
        self.assertIn("RAM insuficiente", qwen38["porque"])

    def test_neurona_dedicada_sin_margen(self):
        filas = {f["id"]: f for f in C.caben(self.entradas, 60, 100, margen_gb=0)}
        self.assertEqual(filas["colibri-deepseek-v4-flash-reap"]["veredicto"], "cabe")
        self.assertEqual(filas["colibri-clef"]["veredicto"], "cabe")


class PruebaPlan(unittest.TestCase):
    def test_plan_laya_sigue_los_docs_y_no_usa_setup(self):
        plan = C.plan_instalacion("colibri-laya", "/srv/modelos")
        texto = " ".join(" ".join(paso["args"]) for paso in plan)
        self.assertNotIn("start-here.sh", texto)
        self.assertIn("convaiinnovations/laya", texto)
        self.assertIn("/srv/modelos/laya", texto)
        self.assertIn("make -C c laya", texto)
        self.assertIn("sha256sum /srv/modelos/laya/model.safetensors", texto)

    def test_clon_en_la_ruta_de_la_unidad(self):
        for id_modelo in ("colibri-laya", "colibri-qwen3-coder-30b"):
            clon = C.plan_instalacion(id_modelo, "/srv/modelos")[0]["args"]
            self.assertEqual(clon[:2], ["git", "clone"])
            self.assertIn("v2.0.0", clon)
            self.assertEqual(clon[-1], "/home/starseed/colibri")
            self.assertEqual(clon[-1], C.REPO_EN_A1)

    def test_instala_el_cliente_hf(self):
        args = [paso["args"] for paso in C.plan_instalacion("colibri-laya", "/srv/modelos")]
        self.assertIn(["python3", "-m", "pip", "install", "--user", "huggingface_hub[cli]"], args)

    def test_gliner_decide_a_mano(self):
        args = [paso["args"] for paso in C.plan_instalacion("colibri-gliner-decide", "/srv/modelos")]
        self.assertIn(["make", "-C", "c", "gliner_decide"], args)
        self.assertIn(["sha256sum", "/srv/modelos/GLiNER2.5-Decide/model.safetensors"], args)
        descarga = next(a for a in args if a[0] == "hf")
        self.assertIn("fastino/GLiNER2.5-Decide", descarga)
        self.assertIn("--local-dir", descarga)

    def test_qwen3_coder_usa_el_id_de_colibri_y_no_arranca(self):
        plan = C.plan_instalacion("colibri-qwen3-coder-30b", "/srv/modelos")
        prepara = next(paso["args"] for paso in plan if paso["args"][0] == "./start-here.sh")
        self.assertEqual(prepara[prepara.index("--model") + 1], "qwen3-coder-30b")
        self.assertIn("--no-start", prepara)
        self.assertIn("--no-browser", prepara)
        self.assertIn("--no-gpu", prepara)
        self.assertEqual(prepara[prepara.index("--dir") + 1], "/srv/modelos")
        self.assertNotIn("colibri-qwen3-coder-30b", prepara)

    def test_clef_y_olmoe_no_tienen_plan(self):
        with self.assertRaisesRegex(ValueError, "no cabe en esta neurona"):
            C.plan_instalacion("colibri-clef", "/srv")
        with self.assertRaises(ValueError):
            C.plan_instalacion("colibri-olmoe-7b", "/srv")

    def test_todos_los_pasos_son_listas_sin_claves(self):
        for id_modelo in list(C.DESCARGAS) + list(C.MAPA_CHAT):
            for paso in C.plan_instalacion(id_modelo, "/srv"):
                self.assertIsInstance(paso["args"], list)
                self.assertTrue(all(isinstance(a, str) for a in paso["args"]))
                self.assertTrue(paso["porque"])
                texto = " ".join(paso["args"]).upper()
                for prohibido in ("API_KEY", "SECRET", "PASSWORD", "TOKEN="):
                    self.assertNotIn(prohibido, texto)

    def test_id_desconocido(self):
        with self.assertRaises(ValueError):
            C.plan_instalacion("colibri-no-existe", "/srv")


if __name__ == "__main__":
    unittest.main()
