# -*- coding: utf-8 -*-
"""test_modelo_privado_a1_guion · pruebas para el guión de instalación/deshacer de modelo privado.

Verifica:
- apparece 127.0.0.1:11434, no aparece 0.0.0.0
- hay MemoryMax para cada tamaño
- existe el subcomando deshacer
- no hay rm -rf ni curl | sh sin descargar primero
- bash -n lo da por válido
"""

import os
import subprocess
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
GUION = os.path.join(DIRECTORIO, "../../deploy/oracle/nodo/modelo-privado-a1.sh")


class ModeloPrivadoGuionTest(unittest.TestCase):
    def setUp(self):
        self.assertTrue(os.path.exists(GUION), f"El guión no existe: {GUION}")
        
        with open(GUION, "r") as f:
            self.contenido = f.read()
    
    def test_bash_n_valida(self):
        result = subprocess.run(["bash", "-n", GUION], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, f"bash -n falló: {result.stderr}")
    
    def test_ollama_host_127_0_0_1(self):
        self.assertIn('OLLAMA_HOST=127.0.0.1:11434', self.contenido)
        self.assertNotIn("OLLAMA_HOST=0.0.0.0", self.contenido)
    
    def test_memory_max_para_4b(self):
        self.assertIn("4500M", self.contenido)
        self.assertIn("MemoryHigh=4500M", self.contenido)
        self.assertIn("MemoryMax=5200M", self.contenido)
    
    def test_memory_max_para_9b(self):
        self.assertIn("8000M", self.contenido)
        self.assertIn("MemoryHigh=8000M", self.contenido)
        self.assertIn("MemoryMax=9000M", self.contenido)
    
    def test_subcomando_deshacer_existe(self):
        self.assertIn("deshacer()", self.contenido)
        self.assertIn("case \"$COMMAND\"", self.contenido)
        self.assertIn('instalar|estado|deshacer', self.contenido)
    
    def test_no_rm_rf_indiscriminado(self):
        lineas = self.contenido.split("\n")
        for i, linea in enumerate(lineas, 1):
            if "rm -rf" in linea and "peso_dir" not in linea and "/usr/share" not in linea:
                self.fail(f"Línea {i}: rm -rf sospechoso sin contexto: {linea}")
    
    def test_no_curl_sh_directo(self):
        self.assertNotIn("curl | sh", self.contenido)
        self.assertIn("curl -fsSL", self.contenido)
        self.assertIn("/tmp/ollama-install.sh", self.contenido)
        self.assertIn("sudo sh /tmp/ollama-install.sh", self.contenido)
    
    def test_instalacion_usa_drop_in(self):
        self.assertIn("/etc/systemd/system/ollama.service.d", self.contenido)
        self.assertIn("starseed-privado.conf", self.contenido)
    
    def test_alias_starseed_privado(self):
        self.assertIn('ALIAS_NAME="starseed-privado"', self.contenido)
        self.assertIn('ollama create "$ALIAS_NAME"', self.contenido)
    
    def test_modelo_huihui(self):
        self.assertIn("huihui_ai/qwen3.5-abliterated", self.contenido)
    
    def test_set_euo_pipefail(self):
        self.assertTrue(self.contenido.startswith("#!/bin/bash"))
        self.assertIn("set -euo pipefail", self.contenido.split("\n")[1])
    
    def test_funciones_principales(self):
        self.assertIn("instalar()", self.contenido)
        self.assertIn("estado()", self.contenido)


if __name__ == "__main__":
    unittest.main()