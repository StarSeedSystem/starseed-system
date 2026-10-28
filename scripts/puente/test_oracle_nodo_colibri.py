# -*- coding: utf-8 -*-
"""Pruebas de la orden `colibri` del A1 (CLB1027F; plan por CLB1028G): el plan de Laya —hf download
+ make, sin setup ni serve: lo hace la unidad— y que sin `--aplicar` no se llama a SSH. Sin red,
sin descargas y sin tocar el disco del A1."""
import contextlib
import io
import json
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import oracle_nodo as N  # noqa: E402

SERVICIO = os.path.normpath(os.path.join(
    DIR, "..", "..", "deploy", "oracle", "nodo", "systemd", "starseed-colibri.service"))


class Plan(unittest.TestCase):
    def test_pasos_de_laya_hf_y_make_con_el_checkout_de_la_unidad(self):
        plan = N.plan_colibri()
        self.assertEqual(plan[0]["args"][0], "git")
        self.assertIn("v2.0.0", plan[0]["args"])
        self.assertEqual(plan[0]["args"][-1], N.COLIBRI_REPO_A1)
        ordenes = [" ".join(paso["args"]) for paso in plan]
        self.assertTrue(all("start-here.sh" not in o for o in ordenes))
        for paso in plan:
            self.assertNotIn("--port", paso["args"])  # el serve lo hace starseed-colibri.service
        descarga = plan[2]["args"]
        self.assertEqual(descarga[:2], ["hf", "download"])
        self.assertEqual(descarga[descarga.index("--local-dir") + 1], N.COLIBRI_MODELO_A1)
        self.assertEqual(plan[3]["args"], ["make", "-C", "c", "laya"])
        self.assertEqual(plan[4]["args"][0], "sha256sum")

    def test_carpeta_del_modelo_configurable(self):
        plan = N.plan_colibri("/srv/modelos")
        descarga = plan[2]["args"]
        self.assertEqual(descarga[descarga.index("--local-dir") + 1], "/srv/modelos/laya")

    def test_argumentos_como_listas_y_sin_claves(self):
        plan = N.plan_colibri()
        for paso in plan:
            self.assertIsInstance(paso["args"], list)
            self.assertTrue(all(isinstance(a, str) for a in paso["args"]))
            self.assertTrue(paso["porque"])
        texto = json.dumps(plan, ensure_ascii=False).upper()
        # «TOKEN» a secas ya no vale como prohibido: los docs de Colibri piden tokenizer.json.
        for prohibido in ("API_KEY", "SECRET", "PASSWORD", "HF_TOKEN", "BEARER "):
            self.assertNotIn(prohibido, texto)


class SSH(unittest.TestCase):
    def setUp(self):
        self.llamadas = []
        self._ssh = N.ssh
        self._respuesta = (0, "[colibri] listo")

        def falso(orden, entrada=None, timeout=120):
            self.llamadas.append({"orden": orden, "entrada": entrada, "timeout": timeout})
            return self._respuesta

        N.ssh = falso

    def tearDown(self):
        N.ssh = self._ssh

    def _main(self, *argv):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            rc = N.main(["oracle_nodo.py", *argv])
        return rc, salida.getvalue()

    def test_sin_aplicar_no_llama_a_ssh_y_ensena_el_plan(self):
        rc, salida = self._main("colibri")
        self.assertEqual(rc, 0)
        self.assertEqual(self.llamadas, [])
        datos = json.loads(salida)
        self.assertFalse(datos["aplicado"])
        self.assertEqual(len(datos["pasos"]), 5)
        self.assertTrue(any(p["args"][0] == "sha256sum" for p in datos["pasos"]))

    def test_con_aplicar_corre_el_plan_por_ssh(self):
        rc, salida = self._main("colibri", "--aplicar")
        self.assertEqual(rc, 0)
        self.assertEqual(len(self.llamadas), 1)
        llamada = self.llamadas[0]
        self.assertEqual(llamada["orden"], "sudo -u starseed python3 -")
        self.assertIn(N.COLIBRI_REPO_A1, llamada["entrada"])
        self.assertIn(N.COLIBRI_MODELO_A1, llamada["entrada"])
        self.assertIn("sha256sum", llamada["entrada"])
        self.assertNotIn("--port", llamada["entrada"])
        self.assertGreaterEqual(llamada["timeout"], 3600)
        self.assertTrue(json.loads(salida)["ok"])

    def test_aplicar_sin_a1_no_miente(self):
        self._respuesta = (2, "sin A1 en ~/.starseed/oracle.json")
        rc, salida = self._main("colibri", "--aplicar")
        self.assertEqual(rc, 0)
        self.assertFalse(json.loads(salida)["ok"])


class Servicio(unittest.TestCase):
    def test_solo_local_y_limites(self):
        with open(SERVICIO, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("User=starseed", texto)
        self.assertIn("--host 127.0.0.1", texto)
        self.assertIn("--port 4480", texto)
        self.assertNotIn("--port 8000", texto)
        self.assertIn("Restart=on-failure", texto)
        self.assertIn("MemoryMax=4G", texto)
        self.assertIn("Nice=10", texto)

    def test_requiere_el_motor_y_el_modelo(self):
        with open(SERVICIO, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("# requiere: /home/starseed/colibri/c/coli", texto)
        self.assertIn("# requiere: " + N.COLIBRI_MODELO_A1, texto)
        self.assertIn("--model " + N.COLIBRI_MODELO_A1, texto)


if __name__ == "__main__":
    unittest.main()
