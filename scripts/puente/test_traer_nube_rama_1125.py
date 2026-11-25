# -*- coding: utf-8 -*-
"""SUP1125B: si el main vivo (RAIZ) no está en la rama main, traer_nube no comprueba ni trae nada.

Del 24-11 18:24 al 25-11 11:40 el árbol de RAIZ estuvo en `director/commit-…`: `_traer` leía
`git rev-parse main` (9 commits atrás) y `_avanzar_main_ff` fallaba con «Not possible to
fast-forward» en cada tarea y cada pasada. Nadie lo vio porque el aviso solo traía las líneas
«hint:» de git."""
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traer_nube as T  # noqa: E402


class RamaValidaParaTraer(unittest.TestCase):
    def test_main_es_valida(self):
        self.assertEqual(T.rama_valida_para_traer("main"), (True, ""))

    def test_otra_rama_no_y_la_nombra(self):
        valida, motivo = T.rama_valida_para_traer("director/commit-1")
        self.assertFalse(valida)
        self.assertIn("director/commit-1", motivo)
        self.assertIn("no en main", motivo)
        self.assertEqual(len(motivo.splitlines()), 1)

    def test_cabeza_suelta_se_nombra_como_tal(self):
        valida, motivo = T.rama_valida_para_traer("")
        self.assertFalse(valida)
        self.assertIn("cabeza suelta", motivo)
        self.assertEqual(len(motivo.splitlines()), 1)


def _falla(nombre):
    def _f(*a, **k):
        raise AssertionError("no debía llamarse a %s" % nombre)
    return _f


class RevisarEnOtraRama(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.avisos = []

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _git_rama(self, rama):
        def _git(args, timeout=120):
            if args[:1] == ["symbolic-ref"]:
                return (0, rama) if rama else (1, "")
            return (0, "")
        return _git

    def _revisar(self, rama, inventario=None):
        with mock.patch.object(T, "ESTADO", os.path.join(self.dir, "traer.json")), \
             mock.patch.object(T, "_git", side_effect=self._git_rama(rama)), \
             mock.patch.object(T, "_avisar", side_effect=lambda texto: self.avisos.append(texto)), \
             mock.patch.object(T, "_progreso", return_value={}), \
             mock.patch.object(T, "_colas_por_id", return_value={}), \
             mock.patch.object(T, "_traer", _falla("_traer")), \
             mock.patch.object(T, "inventario", inventario or _falla("inventario")):
            return T._revisar(True, 1)

    def test_otra_rama_no_trae_y_avisa_una_vez_por_hora(self):
        r = self._revisar("director/commit-1")
        self.assertIn("director/commit-1", r["ocupado"])
        self.assertEqual(r["traidas"], [])
        self.assertEqual(r["plan"], [])
        self.assertEqual(len(self.avisos), 1)
        # segunda pasada dentro de la hora: ni comprueba ni vuelve a avisar
        self._revisar("director/commit-1")
        self.assertEqual(len(self.avisos), 1)

    def test_cabeza_suelta_avisa_con_su_motivo(self):
        r = self._revisar("")
        self.assertIn("cabeza suelta", r["ocupado"])
        self.assertEqual(len(self.avisos), 1)

    def test_en_main_sigue_el_camino_de_siempre(self):
        r = self._revisar("main", inventario=lambda: [])
        self.assertEqual(r["plan"], [])
        self.assertTrue(os.path.exists(os.path.join(self.dir, "traer.json")))


if __name__ == "__main__":
    unittest.main()
