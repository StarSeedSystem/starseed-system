# -*- coding: utf-8 -*-
"""Pruebas de la orden `colibri` del A1 (CLB1027F): el plan de Laya y que sin `--aplicar` no se
llama a SSH. Sin red, sin descargas y sin tocar el disco del A1."""
import contextlib
import io
import json
import os
import re
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import oracle_nodo as N  # noqa: E402

SERVICIO = os.path.normpath(os.path.join(
    DIR, "..", "..", "deploy", "oracle", "nodo", "systemd", "starseed-colibri.service"))


class Plan(unittest.TestCase):
    def test_laya_va_por_hf_y_make_hacia_la_ruta_de_la_unidad(self):
        plan = N.plan_colibri()
        texto = " ".join(" ".join(paso["args"]) for paso in plan)
        self.assertNotIn("start-here.sh", texto)
        self.assertNotIn("--port", texto)
        clon = plan[0]["args"]
        self.assertEqual([clon[0], clon[-1]], ["git", N.COLIBRI_REPO_A1])
        self.assertIn("v2.0.0", clon)
        descargas = [p["args"] for p in plan if p["args"][0:2] == ["hf", "download"]]
        self.assertEqual(len(descargas), 1)
        self.assertEqual(descargas[0][2], "convaiinnovations/laya")
        self.assertEqual(descargas[0][descargas[0].index("--local-dir") + 1], N.COLIBRI_MODELO_A1)
        self.assertIn(["make", "-C", "c", "laya"], [p["args"] for p in plan])
        # la huella de los pesos es paso del plan, no solo del guion SSH
        huellas = [p["args"] for p in plan if p["args"][0] == "sha256sum"]
        self.assertEqual(huellas, [["sha256sum", N.COLIBRI_MODELO_A1 + "/model.safetensors"]])

    def test_carpeta_del_modelo_configurable(self):
        plan = N.plan_colibri("/srv/modelos")
        descarga = [p["args"] for p in plan if p["args"][0] == "hf"][0]
        self.assertEqual(descarga[descarga.index("--local-dir") + 1], "/srv/modelos/laya")

    def test_argumentos_como_listas_y_sin_claves(self):
        plan = N.plan_colibri()
        for paso in plan:
            self.assertIsInstance(paso["args"], list)
            self.assertTrue(all(isinstance(a, str) for a in paso["args"]))
            self.assertTrue(paso["porque"])
        texto = json.dumps(plan, ensure_ascii=False).upper()
        # «TOKEN» solo como palabra: TOKENIZER/* es un archivo del modelo, no una credencial
        for prohibido in (r"\bAPI_KEY\b", r"\bSECRET\b", r"\bPASSWORD\b", r"\bTOKEN\b"):
            self.assertIsNone(re.search(prohibido, texto), prohibido)


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
        self.assertEqual(datos["pasos"][0]["args"][0], "git")
        texto = json.dumps(datos["pasos"])
        self.assertIn("convaiinnovations/laya", texto)
        self.assertNotIn("start-here.sh", texto)

    def test_con_aplicar_corre_el_plan_por_ssh_como_starseed(self):
        rc, salida = self._main("colibri", "--aplicar")
        self.assertEqual(rc, 0)
        self.assertEqual(len(self.llamadas), 1)
        llamada = self.llamadas[0]
        self.assertEqual(llamada["orden"], "sudo -u starseed python3 -")
        self.assertIn(N.COLIBRI_REPO_A1, llamada["entrada"])
        self.assertIn("make", llamada["entrada"])
        self.assertIn("convaiinnovations/laya", llamada["entrada"])
        self.assertIn("sha256sum", llamada["entrada"])
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
