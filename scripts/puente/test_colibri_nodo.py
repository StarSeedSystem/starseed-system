# -*- coding: utf-8 -*-
"""Pruebas de colibri_nodo (CLB1027E + CLB1028H): qué cabe en cada neurona y el plan de instalación
sin ejecutar.

Casos de la tarea: el A1 (12 GB, 18,5 GB libres) solo deja Laya y GLiNER2.5-Decide, y Qwen3-Coder
no; la Mac (8 GB con presión) no deja a ninguno. Sin red, sin descargas, sin tocar el disco.
CLB1028H añade el plan que ya sirve con el despliegue hecho: no se vuelve a clonar, el `hf` va
en su venv propio (PEP 668) y los pesos no se vuelven a bajar si ya están.
"""
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


class PruebaPlan(unittest.TestCase):
    """El plan de instalación (CLB1028H): puede que el despliegue YA exista (el clon de un
    intento anterior: se trae la etiqueta con fetch, sin volver a clonar), el CLI de descarga
    va en su VENV propio (PEP 668: `pip --user` no vale en el A1) y los pesos no se vuelven a
    bajar si ya están. Cada paso declara SU condición: la evalúa el guion del A1, el plan la
    declara y punto."""

    def test_plan_laya_clona_en_la_ruta_de_la_unidad(self):
        plan = C.plan_instalacion("colibri-laya", "/srv/Colibri-modelos")
        texto = " ".join(" ".join(paso["args"]) for paso in plan)
        self.assertNotIn("start-here.sh", texto)
        clon = plan[0]["args"]
        self.assertEqual([clon[0], clon[-1]], ["git", C.REPO_CLONE_RUTA])
        self.assertIn(C.REPO_COLIBRI, clon)
        self.assertIn("v2.0.0", clon)
        descargas = [p for p in plan if p["args"][1:2] == ["download"]]
        self.assertEqual(len(descargas), 1)
        args = descargas[0]["args"]
        self.assertEqual(args[:3], ["hf", "download", "convaiinnovations/laya"])
        self.assertIn("model.safetensors", args)
        self.assertEqual(args[args.index("--local-dir") + 1], "/srv/Colibri-modelos/laya")
        self.assertIn(["make", "-C", "c", "laya"], [p["args"] for p in plan])
        # la huella de los pesos se anota (nada sin su SHA)
        shas = [p["args"] for p in plan if p["args"][0] == "sha256sum"]
        self.assertEqual(shas[0][1], "/srv/Colibri-modelos/laya/model.safetensors")

    def test_plan_laya_con_despliegue_hecho_no_vuelve_a_clonar(self):
        """Con la carpeta del despliegue ya en el A1 (queda el clon del intento anterior), el
        `git clone` se SALTA — es lo que le hacía fallar el plan — y en su lugar corren el
        `git -C … fetch` del tag y el `checkout --detach`, ambos con su condición."""
        plan = C.plan_instalacion("colibri-laya", "/srv")
        desplegado = C.REPO_CLONE_RUTA + "/.git"
        self.assertEqual(plan[0]["saltar_si_existe"], desplegado)
        trae = [p["args"] for p in plan if p.get("solo_si_existe") == desplegado]
        self.assertIn(["git", "-C", C.REPO_CLONE_RUTA, "fetch", "--depth", "1", "origin", "tag", C.ETIQUETA], trae)
        self.assertIn(["git", "-C", C.REPO_CLONE_RUTA, "checkout", "--detach", C.ETIQUETA], trae)

    def test_plan_laya_el_hf_va_en_su_venv_pep668(self):
        """La descarga usa la ruta del venv y su propio entorno del paso; nada de `pip --user`
        ni `--break-system-packages`, tenga o no `hf` en el PATH (es la ruta determinista)."""
        with unittest.mock.patch.object(C, "hf_disponible", return_value=True):
            plan = C.plan_instalacion("colibri-laya", "/srv")
        texto = " ".join(" ".join(paso["args"]) for paso in plan)
        self.assertNotIn("--user", texto)
        self.assertNotIn("--break-system-packages", texto)
        venv = [p["args"] for p in plan if p["args"][1:2] == ["-m"]][0]
        self.assertEqual(venv, ["python3", "-m", "venv", C.CARPETA_VENV_HF])
        venv_paso = [p for p in plan if p["args"] == venv][0]
        self.assertEqual(venv_paso["saltar_si_existe"], C.CARPETA_VENV_HF)
        pip = [p["args"] for p in plan if p["args"][0] == C.PIP_DE_VENV][0]
        self.assertEqual(pip, [C.PIP_DE_VENV, "install", "--no-cache-dir", "huggingface_hub[cli]"])
        descarga = [p for p in plan if p["args"][1:2] == ["download"]][0]
        self.assertEqual(descarga["hf_ruta"], C.HF_DE_VENV)
        self.assertEqual(descarga["env"], {"HF_HUB_DISABLE_TELEMETRY": "1"})
        with unittest.mock.patch.object(C, "hf_disponible", return_value=False):
            plan2 = C.plan_instalacion("colibri-laya", "/srv")
        self.assertEqual([(p["args"], p.get("hf_ruta")) for p in plan2],
                         [(p["args"], p.get("hf_ruta")) for p in plan])

    def test_plan_laya_descarga_idempotente(self):
        """Si los pesos ya están (model.safetensors en su sitio), la descarga se salta y el paso
        de la huella sigue anotando el SHA de lo que hay."""
        plan = C.plan_instalacion("colibri-laya", "/srv/modelos")
        descarga = [p for p in plan if p["args"][1:2] == ["download"]][0]
        self.assertEqual(descarga["saltar_si_existe"], "/srv/modelos/laya/model.safetensors")

    def test_plan_gliner(self):
        plan = C.plan_instalacion("colibri-gliner-decide", "/srv")
        descarga = [p for p in plan if p["args"][1:2] == ["download"]][0]["args"]
        self.assertEqual(descarga[2], "fastino/GLiNER2.5-Decide")
        self.assertIn("special_tokens_map.json", descarga)
        self.assertEqual(descarga[descarga.index("--local-dir") + 1], "/srv/GLiNER2.5-Decide")
        self.assertIn("gliner_decide", " ".join(" ".join(p["args"]) for p in plan))
        self.assertNotIn("start-here.sh", " ".join(" ".join(p["args"]) for p in plan))

    def test_plan_qwen3_coder_por_setup_y_sin_arrancar(self):
        """Los de catálogo no tocan el venv de HF ni el `hf`: solo el despliegue y su setup."""
        plan = C.plan_instalacion("colibri-qwen3-coder-30b", "/srv/modelos")
        prepara = [p["args"] for p in plan if p["args"][0] == "./start-here.sh"][0]
        self.assertEqual(prepara[:2], ["./start-here.sh", "--model"])
        self.assertEqual(prepara[prepara.index("--model") + 1], "qwen3-coder-30b")
        self.assertNotIn("colibri-", prepara[prepara.index("--model") + 1])
        self.assertEqual(prepara[prepara.index("--dir") + 1], "/srv/modelos")
        for bandera in ("--no-gpu", "--no-start", "--no-browser"):
            self.assertIn(bandera, prepara)
        self.assertFalse([p for p in plan if "huggingface_hub" in " ".join(p["args"])])

    def test_plan_clef_dice_que_no_cabe(self):
        with self.assertRaises(ValueError) as ctx:
            C.plan_instalacion("colibri-clef", "/srv")
        self.assertIn("no cabe en esta neurona", str(ctx.exception))

    def test_id_desconocido(self):
        with self.assertRaises(ValueError):
            C.plan_instalacion("colibri-no-existe", "/srv")


if __name__ == "__main__":
    unittest.main()
