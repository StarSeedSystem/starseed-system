# -*- coding: utf-8 -*-
"""Pruebas de colibri_nodo (CLB1027E): qué cabe en cada neurona y el plan de instalación sin ejecutar.

Casos de la tarea: el A1 (12 GB, 18,5 GB libres) solo deja Laya y GLiNER2.5-Decide, y Qwen3-Coder
no; la Mac (8 GB con presión) no deja a ninguno. Sin red, sin descargas, sin tocar el disco.
"""
import json
import os
import sys
import unittest
import unittest.mock
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

    def test_glm_52_streaming_con_todo_el_disco_y_poca_ram(self):
        # 2026-10-28 (rama nube/40611446903): GLM-5.2 no estaba ni en el streaming ni en el resto.
        filas = {f["id"]: f for f in C.caben(self.entradas, 20, 900)}
        glm = filas["colibri-glm-5.2"]
        self.assertEqual(glm["veredicto"], "cabe en streaming (disco rápido)")
        self.assertIn("expertos del disco", glm["porque"])

    def test_olmoe_con_disco_estrecho_dice_los_gb_de_la_descarga(self):
        # 2026-10-28 (rama nube/40611446903): la descarga temporal (14 GB) pesa más que el modelo.
        olmoe = next(e for e in self.entradas if e["id"] == "colibri-olmoe-7b")
        self.assertGreater(olmoe["descarga_gb"], olmoe["disco_gb"])
        filas = {f["id"]: f for f in C.caben(self.entradas, 12, 5)}
        self.assertEqual(filas["colibri-olmoe-7b"]["veredicto"], "no cabe")
        self.assertIn("descarga", filas["colibri-olmoe-7b"]["porque"])
        self.assertIn("14", filas["colibri-olmoe-7b"]["porque"])

    def test_caben_no_muta_las_entradas_y_da_cuatro_columnas(self):
        # 2026-10-28 (rama nube/40611446903): pureza del cálculo y forma de cada fila.
        antes = json.loads(json.dumps(self.entradas))
        filas = C.caben(self.entradas, 12, 18.5)
        self.assertEqual(self.entradas, antes)
        self.assertTrue(all(set(f) == {"id", "capa", "veredicto", "porque"} for f in filas))


class PruebaPlan(unittest.TestCase):
    """El plan de instalación (28-10): Laya y GLiNER NO van por setup; el clon va a la ruta
    de la unidad; los de catálogo usan su id sin el prefijo `colibri-` y `--no-start`."""

    def test_plan_laya_sin_start_here_y_con_hf_make(self):
        plan = C.plan_instalacion("colibri-laya", "/srv/Colibri-modelos")
        texto = " ".join(" ".join(paso["args"]) for paso in plan)
        self.assertNotIn("start-here.sh", texto)
        clon = plan[0]["args"]
        self.assertEqual([clon[0], clon[-1]], ["git", C.REPO_CLONE_RUTA])
        self.assertIn("v2.0.0", clon)
        descargas = [p for p in plan if p["args"][0] == "hf"]
        self.assertEqual(len(descargas), 1)
        args = descargas[0]["args"]
        self.assertEqual(args[1:3], ["download", "convaiinnovations/laya"])
        self.assertIn("model.safetensors", args)
        self.assertEqual(args[args.index("--local-dir") + 1], "/srv/Colibri-modelos/laya")
        self.assertIn(["make", "-C", "c", "laya"], [p["args"] for p in plan])
        # la huella de los pesos se anota (nada sin su SHA)
        shas = [p["args"] for p in plan if p["args"][0] == "sha256sum"]
        self.assertEqual(shas[0][1], "/srv/Colibri-modelos/laya/model.safetensors")

    def test_plan_laya_con_hf_no_instala_nada(self):
        with unittest.mock.patch.object(C, "hf_disponible", return_value=True):
            plan = C.plan_instalacion("colibri-laya", "/srv")
        self.assertFalse([p for p in plan if "huggingface_hub" in " ".join(p["args"])])

    def test_plan_laya_sin_hf_trae_el_cli(self):
        with unittest.mock.patch.object(C, "hf_disponible", return_value=False):
            plan = C.plan_instalacion("colibri-laya", "/srv")
        paso = [p for p in plan if "huggingface_hub" in " ".join(p["args"])]
        self.assertEqual(paso[0]["args"], ["python3", "-m", "pip", "install", "--user",
                                           "huggingface_hub[cli]"])

    def test_plan_gliner(self):
        plan = C.plan_instalacion("colibri-gliner-decide", "/srv")
        descarga = [p["args"] for p in plan if p["args"][0] == "hf"][0]
        self.assertEqual(descarga[2], "fastino/GLiNER2.5-Decide")
        self.assertIn("special_tokens_map.json", descarga)
        self.assertEqual(descarga[descarga.index("--local-dir") + 1], "/srv/GLiNER2.5-Decide")
        self.assertIn("gliner_decide", " ".join(" ".join(p["args"]) for p in plan))
        self.assertNotIn("start-here.sh", " ".join(" ".join(p["args"]) for p in plan))

    def test_plan_qwen3_coder_por_setup_y_sin_arrancar(self):
        plan = C.plan_instalacion("colibri-qwen3-coder-30b", "/srv/modelos")
        prepara = plan[1]["args"]
        self.assertEqual(prepara[:2], ["./start-here.sh", "--model"])
        self.assertEqual(prepara[prepara.index("--model") + 1], "qwen3-coder-30b")
        self.assertNotIn("colibri-", prepara[prepara.index("--model") + 1])
        self.assertEqual(prepara[prepara.index("--dir") + 1], "/srv/modelos")
        for bandera in ("--no-gpu", "--no-start", "--no-browser"):
            self.assertIn(bandera, prepara)

    def test_plan_clef_dice_que_no_cabe(self):
        with self.assertRaises(ValueError) as ctx:
            C.plan_instalacion("colibri-clef", "/srv")
        self.assertIn("no cabe en esta neurona", str(ctx.exception))

    def test_id_desconocido(self):
        with self.assertRaises(ValueError):
            C.plan_instalacion("colibri-no-existe", "/srv")
        # 2026-10-28 (rama nube/40611446903): también el id vacío (y falta cubrir la carpeta vacía: lo comento en la respuesta).
        with self.assertRaises(ValueError):
            C.plan_instalacion("", "/srv")

    def test_ordenes_como_listas_y_clon_verificado(self):
        # 2026-10-28 (rama nube/40611446903): nunca strings de shell y el clon apunta al repo verificado.
        for id_modelo in ("colibri-laya", "colibri-gliner-decide", "colibri-qwen3-coder-30b"):
            plan = C.plan_instalacion(id_modelo, "/srv")
            self.assertTrue(all(isinstance(p["args"], list) for p in plan))
            self.assertTrue(all(isinstance(a, str) for p in plan for a in p["args"]))
        clon = C.plan_instalacion("colibri-laya", "/srv")[0]["args"]
        self.assertEqual(clon[:2], ["git", "clone"])
        self.assertIn(C.REPO_COLIBRI, clon)


if __name__ == "__main__":
    unittest.main()
