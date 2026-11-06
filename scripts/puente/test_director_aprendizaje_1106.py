# -*- coding: utf-8 -*-
"""(2026-11-06) Una ola cuyas tareas estaban todas cerradas sin código no deja aprendizaje.

El vigilante relanzó cada 3 min una ola con dos tareas «no aplica»; aquí se escribía
«0 de 2 integradas» en memory/aprendizaje-olas.md (73 veces) y se commiteaba cada vez.
Todo en un temporal: ni la memoria real, ni git, ni el bus.
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import director_aprendizaje as D  # noqa: E402


class OlaSinNadaQueAprender(unittest.TestCase):
    def test_pura(self):
        f = D.ola_sin_nada_que_aprender
        dos = [{"id": "A"}, {"id": "B"}]
        self.assertTrue(f(dos, {"A": {"estado": "no_aplica"}, "B": {"estado": "descartada"}}))
        self.assertTrue(f(dos, {"A": {"estado": "no-aplica"}, "B": {"estado": "no_aplica"}}))
        self.assertFalse(f(dos, {"A": {"estado": "no_aplica"}, "B": {"estado": "commit"}}))
        self.assertFalse(f(dos, {"A": {"estado": "no_aplica"}}))  # B sin entrada: sí cuenta
        self.assertFalse(f([], {}))

    def _correr(self, progreso):
        with tempfile.TemporaryDirectory() as tmp:
            olas = os.path.join(tmp, "olas")
            os.makedirs(olas)
            cola = os.path.join(olas, "cola-auto-1106-113722.json")
            with open(cola, "w", encoding="utf-8") as f:
                json.dump([{"id": "RPO1104M-d2", "prompt": "«Xcode 26»"}, {"id": "VER1105Db-d3"}], f)
            with open(os.path.join(olas, "progreso.json"), "w", encoding="utf-8") as f:
                json.dump(progreso, f)
            memoria = os.path.join(tmp, "memory", "aprendizaje-olas.md")
            commitear = mock.Mock()
            with mock.patch.object(D, "OLAS", olas), mock.patch.object(D, "MEMORIA", memoria), \
                    mock.patch.object(D, "commitear_memoria", commitear), \
                    mock.patch.object(D, "DIRECTORIO", tmp), \
                    mock.patch.object(sys, "argv", ["director_aprendizaje.py", cola]):
                rc = D.main()
            return rc, os.path.exists(memoria), commitear.call_count

    def test_el_bucle_del_06_11_no_escribe_ni_commitea(self):
        rc, escrita, commits = self._correr({
            "RPO1104M-d2": {"estado": "no_aplica", "nota": "ya en main"},
            "VER1105Db-d3": {"estado": "no_aplica", "nota": "ya en main"},
        })
        self.assertEqual(rc, 0)
        self.assertFalse(escrita)
        self.assertEqual(commits, 0)

    def test_una_ola_con_trabajo_si_escribe(self):
        rc, escrita, commits = self._correr({
            "RPO1104M-d2": {"estado": "commit", "sha": "abc"},
            "VER1105Db-d3": {"estado": "no_aplica"},
        })
        self.assertEqual(rc, 0)
        self.assertTrue(escrita)
        self.assertEqual(commits, 1)


if __name__ == "__main__":
    unittest.main()
