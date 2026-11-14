# -*- coding: utf-8 -*-
"""SUP1114C (14-11): una orden que saca bytes que no son UTF-8 no tumba la tarea.

RDM1113A (habilidades con su música y sus imágenes) acabó en «fallo · excepción: 'utf-8' codec can't
decode byte 0xff in position 0» justo después de sus pruebas en verde: la puerta de degenerados lee cada
archivo tocado con `git show HEAD:<ruta>` por `sh()`, y `sh()` decodificaba la salida en estricto. Un MP3
o un JPEG empiezan por 0xff. Ahora los bytes que no son UTF-8 salen como «�» y la tarea sigue.
"""
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class ShConBytesTest(unittest.TestCase):
    def test_salida_con_bytes_que_no_son_utf8(self):
        orden = [sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'\\xff\\xd8\\xffimagen')"]
        rc, salida = enjambre.sh(orden, cwd=os.path.dirname(RUTA), timeout=60)
        self.assertEqual(rc, 0)
        self.assertTrue(salida.endswith("imagen"))
        self.assertIn("�", salida)

    def test_git_show_de_un_archivo_binario_como_en_la_puerta_de_degenerados(self):
        with tempfile.TemporaryDirectory() as d:
            env = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1")
            subprocess.run(["git", "init", "-q", d], check=True, env=env)
            with open(os.path.join(d, "musica.mp3"), "wb") as f:
                f.write(b"\xff\xfb\x90\x00" + bytes(range(256)))
            subprocess.run(["git", "-C", d, "add", "musica.mp3"], check=True, env=env)
            subprocess.run(["git", "-C", d, "-c", "user.name=prueba", "-c", "user.email=prueba@ejemplo.org",
                            "commit", "-q", "-m", "binario"], check=True, env=env)
            rc, salida = enjambre.sh(["git", "show", "HEAD:musica.mp3"], cwd=d, timeout=60)
            self.assertEqual(rc, 0)
            self.assertTrue(salida)


if __name__ == "__main__":
    unittest.main()
