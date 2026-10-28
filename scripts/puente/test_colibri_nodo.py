# -*- coding: utf-8 -*-
"""Pruebas de colibri_nodo (CLB1027E; plan de instalación por CLB1028G): qué cabe en cada neurona
y cómo se instalaría sin ejecutar nada. Los modelos de juicio NO van por setup (docs de Colibri v2.0.0).

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
    def test_plan_laya_descarga_y_make_sin_setup_ni_serve(self):
        plan = C.plan_instalacion("colibri-laya", "/srv/colibri")
        ordenes = [" ".join(paso["args"]) for paso in plan]
        self.assertTrue(all("start-here.sh" not in o for o in ordenes))
        self.assertTrue(all("--port" not in paso["args"] for paso in plan))
        clon, hf_cli, descarga, compila, huella = (paso["args"] for paso in plan)
        self.assertEqual(clon[0], "git")
        self.assertIn("--branch", clon)
        self.assertIn("v2.0.0", clon)
        self.assertIn("https://github.com/JustVugg/colibri", clon)
        self.assertEqual(clon[-1], C.RUTA_CLON)  # la ruta que pide la unidad, no <carpeta>/colibri-v2.0.0
        self.assertIn("huggingface_hub[cli]", hf_cli[-1])
        self.assertEqual(descarga[:2], ["hf", "download"])
        self.assertIn("convaiinnovations/laya", descarga)
        self.assertEqual(descarga[descarga.index("--local-dir") + 1], "/srv/colibri/laya")
        self.assertEqual(compila, ["make", "-C", "c", "laya"])
        self.assertEqual(huella[0], "sha256sum")
        self.assertTrue(huella[1].endswith("/laya/model.safetensors"))

    def test_plan_gliner_mismas_fases_que_laya(self):
        plan = C.plan_instalacion("colibri-gliner-decide", "/srv/colibri")
        ordenes = [" ".join(paso["args"]) for paso in plan]
        self.assertTrue(all("start-here.sh" not in o for o in ordenes))
        self.assertEqual(len(plan), 5)
        self.assertEqual(plan[3]["args"], ["make", "-C", "c", "gliner_decide"])
        self.assertEqual(plan[2]["args"][2], "fastino/GLiNER2.5-Decide")

    def test_plan_chat_usa_el_id_de_colibri_y_no_arranca(self):
        plan = C.plan_instalacion("colibri-qwen3-coder-30b", "/srv/colibri")
        self.assertEqual(len(plan), 2)
        clon, prepara = (paso["args"] for paso in plan)
        self.assertEqual(clon[-1], C.RUTA_CLON)
        self.assertEqual(prepara, ["./start-here.sh", "--model", "qwen3-coder-30b",
                                   "--dir", "/srv/colibri", "--yes", "--no-gpu",
                                   "--no-start", "--no-browser"])

    def test_clef_no_cabe_en_esta_neurona(self):
        with self.assertRaises(ValueError) as ctx:
            C.plan_instalacion("colibri-clef", "/srv/colibri")
        self.assertIn("no cabe en esta neurona", str(ctx.exception))

    def test_olmoe_sin_pasos_verificados(self):
        with self.assertRaises(ValueError):
            C.plan_instalacion("colibri-olmoe-7b", "/srv/colibri")

    def test_id_desconocido(self):
        with self.assertRaises(ValueError):
            C.plan_instalacion("colibri-no-existe", "/srv")


if __name__ == "__main__":
    unittest.main()
