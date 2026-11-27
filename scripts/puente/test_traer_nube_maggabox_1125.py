# -*- coding: utf-8 -*-
"""ALM1125H2: `traer_nube` reconoce las ramas por tarea de la Maggabox (`nube/mg-…`).

La Maggabox entrega por `nube/mg-<fecha>-<id>` (architecture/almacenamiento-distribuido.md,
«Maggabox como medio de trabajo»). Antes solo se leía el id del nombre en `nube/a1-…` y en
`…/ola/<id>`: una rama `nube/mg-…` con un arreglo suelto se quedaba sin dueño y su trabajo no
llegaba a main. Las ramas de cola entera (`nube/mg-<fecha>`, sin id) siguen cayendo a la tarea
de sus propios commits.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import traer_nube as T  # noqa: E402


class DuenoDeSueltosMaggabox(unittest.TestCase):
    def test_rama_por_tarea_de_la_maggabox(self):
        self.assertEqual(T.dueno_de_sueltos("nube/mg-20261126-010203-CTL1124Dc", {}), "CTL1124Dc")

    def test_rama_por_tarea_de_la_maggabox_con_guiones(self):
        self.assertEqual(
            T.dueno_de_sueltos("nube/mg-20261126-010203-S1010-EV-ORACLE-1a", {}),
            "S1010-EV-ORACLE-1a",
        )

    def test_las_ramas_del_a1_siguen_igual(self):
        self.assertEqual(T.dueno_de_sueltos("nube/a1-20261012-114650-COL1012B", {}), "COL1012B")
        self.assertEqual(
            T.dueno_de_sueltos("nube/a1-20261011-003110-S1010-EV-ORACLE-1a", {}),
            "S1010-EV-ORACLE-1a",
        )

    def test_rama_de_cola_de_la_maggabox_cae_a_sus_commits(self):
        self.assertEqual(T.dueno_de_sueltos("nube/mg-20261126-010203", {"X1": []}), "X1")
        self.assertIsNone(T.dueno_de_sueltos("nube/mg-20261126-010203", {}))


if __name__ == "__main__":
    unittest.main()
