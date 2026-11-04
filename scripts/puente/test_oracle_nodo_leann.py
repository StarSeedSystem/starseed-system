# -*- coding: utf-8 -*-
"""Pruebas de la orden `leann` (LNN1028C): plan, paquete y que sin --aplicar no hay SSH."""
import contextlib
import io
import json
import os
import re
import sys
import tempfile
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import oracle_nodo as N  # noqa: E402

NODO = os.path.join(DIR, "..", "..", "deploy", "oracle", "nodo")
SERVICIO = os.path.join(NODO, "systemd", "starseed-leann.service")
GUION = os.path.join(NODO, "leann-a1.sh")
TEXTO_PLAN = lambda: json.dumps(N.plan_leann(), ensure_ascii=False)  # noqa: E731


class Plan(unittest.TestCase):
    def test_crea_venv_instala_version_fija_y_baja_el_modelo_tras_su_licencia(self):
        texto = TEXTO_PLAN()
        self.assertIn("/opt/starseed/leann/.venv", texto)
        self.assertIn("leann==0.3.8", texto)
        self.assertIn("ollama show qwen3-embedding:0.6b --license", texto)
        self.assertIn("ollama-a1.sh qwen3-embedding:0.6b", texto)
        self.assertIn("OLLAMA_KEEP_ALIVE=2m", texto)
        self.assertIn("OLLAMA_MAX_LOADED_MODELS=1", texto)
        self.assertIn(N.LEANN_SERVICIO_A1, texto)

    def test_sin_claves_ni_ips_publicas(self):
        texto = TEXTO_PLAN().upper()
        self.assertIsNone(re.search(r"API_KEY|SECRET|PASSWORD|TOKEN", texto), "claves en el plan")
        self.assertEqual(re.findall(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", texto), ["127.0.0.1"])


class Paquete(unittest.TestCase):
    def test_los_modulos_del_servidor_viajan_a_leann(self):
        raiz, fuente = N.RAIZ, N.FUENTE
        N.RAIZ = N.FUENTE = os.path.join(DIR, "..", "..")
        try:
            with tempfile.TemporaryDirectory(prefix="leann-paquete-") as tmp:
                N._paquete(tmp)
                for nombre in ("leann_servidor.py", "leann_indices.py", "fusion_recuerdos.py"):
                    self.assertTrue(os.path.isfile(os.path.join(tmp, "leann", nombre)), nombre)
                self.assertTrue(os.path.isfile(os.path.join(tmp, "leann-a1.sh")))
                self.assertTrue(os.path.isfile(os.path.join(tmp, "systemd", "starseed-leann.service")))
        finally:
            N.RAIZ, N.FUENTE = raiz, fuente


class SinSSH(unittest.TestCase):
    def test_sin_aplicar_ensena_el_plan_y_no_llama_a_ssh(self):
        llamadas = []
        original = N.ssh
        N.ssh = lambda *a, **k: llamadas.append(a) or (0, "")
        try:
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                rc = N.main(["oracle_nodo.py", "leann"])
        finally:
            N.ssh = original
        datos = json.loads(salida.getvalue())
        self.assertEqual((rc, datos["aplicado"]), (0, False))
        self.assertEqual(llamadas, [])


class Servicio(unittest.TestCase):
    def test_solo_local_con_limites_y_sin_claves(self):
        with open(SERVICIO, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("User=starseed", texto)
        self.assertIn("Environment=OLLAMA_HOST=http://127.0.0.1:11434", texto)
        self.assertIn("ExecStart=/opt/starseed/leann/.venv/bin/python "
                      "/opt/starseed/nodo/leann/leann_servidor.py", texto)
        self.assertIn("Restart=on-failure", texto)
        self.assertIn("MemoryMax=1500M", texto)
        self.assertIn("Nice=10", texto)
        self.assertIn("# requiere: /opt/starseed/leann/.venv/bin/python", texto)
        self.assertIsNone(re.search(r"KEY|SECRET|TOKEN|PASSWORD", re.sub(r"^#.*$", "", texto, flags=re.M)))


class Guion(unittest.TestCase):
    def test_licencia_apache_antes_de_dejar_el_modelo_y_entorno_de_ollama(self):
        with open(GUION, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("leann==0.3.8", texto)
        self.assertIn("ollama show", texto)
        self.assertIn("Apache", texto)
        self.assertIn("ollama-a1.sh", texto)
        self.assertIn("qwen3-embedding:0.6b", texto)
        self.assertIn("OLLAMA_KEEP_ALIVE=2m", texto)
        self.assertIn("OLLAMA_MAX_LOADED_MODELS=1", texto)
        self.assertIn("ollama rm", texto)


if __name__ == "__main__":
    unittest.main()
