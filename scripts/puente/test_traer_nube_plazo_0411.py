"""(SUP0411F) La carpeta de comprobación de traer_nube tiene plazo para sacarse entera con la Mac cargada.

El 04-11, con la Mac a carga 50–60, el `worktree add` de `_traer` pasó de su plazo de 300 s y RTXR1010AMb-d1
se quedó fuera de main con su trabajo de la nube ya en verde («no pude preparar la carpeta de comprobación:
TimeoutExpired»). Cada pasada empieza de cero, así que el plazo ha de bastar para el checkout entero.
"""
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import traer_nube as T  # noqa: E402


class PlazoDeLaCarpeta(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, ignore_errors=True)

    def test_el_add_de_la_carpeta_tiene_plazo_para_la_mac_cargada(self):
        llamadas = []

        def git_falso(args, timeout=120):
            llamadas.append((list(args), timeout))
            if args[:2] == ["worktree", "add"]:
                return 1, "TimeoutExpired: … timed out after %s seconds" % timeout
            return 0, "c09b13792\n"

        with mock.patch.object(T, "_git", git_falso), mock.patch.object(T, "_soltar_carpeta"), \
                mock.patch.object(T, "CARPETA_COMPROBAR", os.path.join(self.dir, "_traer")):
            ok, detalle, medio = T._traer({"tid": "X1", "rama": "nube/x", "commits": []})
        self.assertFalse(ok)
        self.assertTrue(medio)  # fallo del medio: la próxima pasada lo reintenta
        self.assertIn("no pude preparar la carpeta", detalle)
        plazos = [t for a, t in llamadas if a[:2] == ["worktree", "add"]]
        self.assertEqual(len(plazos), 1)
        self.assertGreaterEqual(plazos[0], 900)
        self.assertEqual(plazos[0], T.PLAZO_CARPETA_S)


if __name__ == "__main__":
    unittest.main()
