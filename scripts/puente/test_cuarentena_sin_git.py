# -*- coding: utf-8 -*-
"""Pruebas para cuarentena_sin_git.py."""
import os
import shutil
import tempfile
import unittest
from unittest import mock

import cuarentena_sin_git as C


class CuarentenaSinGitTest(unittest.TestCase):
    def test_candidatos_filtra_ts_tsx(self):
        lineas = "src/app/mando/page.tsx\nsrc/lib/foo.ts\nREADME.md\npackage.json\n"
        res = C.candidatos(lineas)
        self.assertIn("src/app/mando/page.tsx", res)
        self.assertIn("src/lib/foo.ts", res)
        self.assertNotIn("README.md", res)
        self.assertNotIn("package.json", res)

    @mock.patch("subprocess.run")
    def test_transpila_exitoso(self, mock_run):
        mock_run.return_value = mock.Mock(returncode=0)
        res = C.transpila("/raiz", "src/lib/foo.ts")
        self.assertTrue(res)

    @mock.patch("subprocess.run")
    def test_transpila_fallido(self, mock_run):
        mock_run.return_value = mock.Mock(returncode=1)
        res = C.transpila("/raiz", "src/lib/foo.tsx")
        self.assertFalse(res)

    @mock.patch("subprocess.run")
    def test_transpila_sin_esbuild(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        res = C.transpila("/raiz", "src/lib/foo.ts")
        self.assertIsNone(res)

    def test_revisar_repo_temporal(self):
        tmp = tempfile.mkdtemp()
        try:
            # Inicializar git repo temporal
            os.system(f"git -C {tmp} init -q")
            src_dir = os.path.join(tmp, "src")
            os.makedirs(src_dir)
            
            # Archivo con git (valido o no, git ls-files --others lo ignora si esta trackeado)
            # Creamos un archivo sin git que transpila (valido)
            valido_path = os.path.join(src_dir, "valido.ts")
            with open(valido_path, "w") as f:
                f.write("export const x: number = 1;\n")
                
            # Archivo sin git roto (que no transpila)
            roto_path = os.path.join(src_dir, "roto.tsx")
            with open(roto_path, "w") as f:
                f.write("export const Component = () => <div><span>1</span><span>2</span></div>;\n") # O sintaxis invalida para esbuild si queremos
                # Una sintaxis invalida para esbuild (ej JSX con error o sintaxis ts mala sin tipos validos si strict):
                # Por ejemplo: const x: = 1;
                f.write("const x: = 1;\n")

            # Mock de transpila o usar esbuild real si existe. Si esbuild no existe en el runner, mockeamos transpila o probamos con mock.
            with mock.patch("cuarentena_sin_git.transpila") as mock_t:
                # valido.ts transpila True, roto.tsx transpila False
                def side_effect(raiz, ruta):
                    if "valido" in ruta:
                        return True
                    if "roto" in ruta:
                        return False
                    return None
                mock_t.side_effect = side_effect
                
                with mock.patch("cuarentena_sin_git.decir_puente") as mock_puente:
                    C.revisar(tmp)
                    
                self.assertTrue(os.path.exists(valido_path))
                self.assertFalse(os.path.exists(roto_path))
                # Comprobar cuarentena
                cuant_dir = os.path.expanduser("~/.starseed/cuarentena")
                # Deberia haberse movido a cuarentena
                found_quarantined = False
                for root, dirs, files in os.walk(cuant_dir):
                    if "roto.tsx" in files:
                        found_quarantined = True
                self.assertTrue(found_quarantined)
        finally:
            shutil.rmtree(tmp)
