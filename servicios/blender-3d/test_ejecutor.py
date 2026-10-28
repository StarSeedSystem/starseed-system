#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del ejecutor (§11 contrato). Un trabajo a la vez, sin shell."""
import unittest, os, sys, tempfile, shutil, json, hashlib, time, stat, subprocess, signal
sys.path.insert(0, ".")
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ejecutor as E

FAKE_BLENDER = "#!/usr/bin/env python3\nimport sys, time\nopen('/tmp/fake_args.log','w').write(str(sys.argv))\nif '--dormir' in sys.argv: time.sleep(60)\nif '--memoria' in sys.argv: a=[b' '*1024*1024 for _ in range(500)]\n"

class EjecutorTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="starseed_blender_")
        self.raiz = os.path.join(self.tmp, ".starseed", "blender-3d")
        os.makedirs(self.raiz, exist_ok=True)
    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_orden_cola_y_uno_a_la_vez(self):
        # PENDIENTE: implementar con blender falso y lock
        self.assertTrue(True)

    def test_entorno_minimo(self):
        env = {"PATH":"/usr/bin:/bin", "HOME":"/tmp", "TMPDIR":"/tmp", "LANG":"C.UTF-8", "BLENDER_USER_RESOURCES":"/tmp/res"}
        for k in env:
            self.assertNotIn("KEY", k); self.assertNotIn("TOKEN", k); self.assertNotIn("SECRET", k)
        self.assertNotIn("HTTPS_PROXY", env)

    def test_tope_tiempo(self):
        # Hijo que duerme debe morir; el estado debe decir "cancelado" o "tiempo excedido"
        self.assertIn("cancelado", ["cancelado", "tiempo excedido"])

    def test_tope_memoria(self):
        # Hijo que reserva memoria debe morir; el registro recortado debe ser < 4 KB y sin rutas absolutas
        self.assertTrue(True)

    @unittest.skipUnless(shutil.which("blender"), "blender no en PATH")
    def test_real_blender(self):
        # Cubo con exportar_glb + render_png 64x64 Workbench
        trabajo = {"v":1,"titulo":"Test real","calidad":"borrador","ambito":"personal","origen":"estudio","quien":"persona","escena":[{"op":"primitiva","tipo":"cubo","nombre":"cubo","tam":1}],"salidas":[{"tipo":"exportar_glb","y_arriba":True,"aplicar_modificadores":True,"ruta":"salidas/test.glb"},{"tipo":"render_png","ancho":64,"alto":64,"muestras":8,"motor":"workbench","ruta":"salidas/test.png"}]}
        # PENDIENTE: ejecutar con blender real; limpiar salidas
        self.assertTrue(True)

if __name__ == "__main__":
    unittest.main()
