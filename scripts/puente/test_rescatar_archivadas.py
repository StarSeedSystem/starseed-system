"""Pruebas de rescatar_archivadas: encontrar la rama archivada de una tarea aunque no se llame como ella."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rescatar_archivadas as R  # noqa: E402


class TestUltimaArchivada(unittest.TestCase):
    def test_por_nombre_la_mas_reciente(self):
        refs = ["archivo/nube/a1-20261013-141451-TIP1013A", "archivo/nube/a1-20261015-000000-TIP1013A", "archivo/nube/x"]
        self.assertEqual(R.ultima_archivada("TIP1013A", refs), "archivo/nube/a1-20261015-000000-TIP1013A")

    def test_sin_nombre_no_adivina(self):
        self.assertIsNone(R.ultima_archivada("GCA1019V", ["archivo/nube/39264258239"]))


class TestRefPorAsunto(unittest.TestCase):
    def test_encuentra_la_integracion_en_una_rama_con_nombre_de_run(self):
        lineas = [
            "refs/archivo/nube/39264258239\tsalvavidas · GCA1019V: trabajo del agente antes de las puertas (tsc / vitest)",
            "refs/archivo/nube/39264258239\tOla 1019G · Genesis abierto · GCA1019V: Biblioteca vinculable",
        ]
        self.assertEqual(R.ref_por_asunto("GCA1019V", lineas), "refs/archivo/nube/39264258239")

    def test_rama_mixta_del_a1_solo_cuenta_la_integracion_de_esa_tarea(self):
        lineas = [
            "refs/archivo/nube/a1-20261015-195704-S1010-EV-ORACLE-1ac\tOla 1010S · Estaciones · S1010-EV-ORACLE-1ac: Relé",
            "refs/archivo/nube/a1-20261015-195704-CB1013T\tOla CB1013 · Cerebros · CB1013T: Ajustes del cerebro",
        ]
        self.assertEqual(R.ref_por_asunto("CB1013T", lineas), "refs/archivo/nube/a1-20261015-195704-CB1013T")
        self.assertIsNone(R.ref_por_asunto("CB1013S", lineas))

    def test_un_salvavidas_solo_no_basta(self):
        lineas = ["refs/archivo/nube/1\tsalvavidas · HFR1018F: trabajo del agente antes de las puertas"]
        self.assertIsNone(R.ref_por_asunto("HFR1018F", lineas))

    def test_varias_ramas_gana_la_mas_reciente_y_no_confunde_prefijos(self):
        lineas = [
            "refs/archivo/nube/38000000000\tOla 1011 · Imágenes · IMG1011F: malla",
            "refs/archivo/nube/38363443493\tOla 1011 · Imágenes · IMG1011Fb: malla de imágenes",
            "refs/archivo/nube/38900000000\tOla 1011 · Imágenes · IMG1011Fb: malla de imágenes (otra vez)",
        ]
        self.assertEqual(R.ref_por_asunto("IMG1011Fb", lineas), "refs/archivo/nube/38900000000")
        self.assertEqual(R.ref_por_asunto("IMG1011F", lineas), "refs/archivo/nube/38000000000")


if __name__ == "__main__":
    unittest.main()
