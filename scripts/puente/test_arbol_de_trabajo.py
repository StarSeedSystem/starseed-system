"""Pruebas de arbol_de_trabajo: separar lo que ensucia el enjambre de lo ajeno."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from arbol_de_trabajo import PROPIAS, repartir, ruta_de, solo_es_nuestro


class TestRutaDe(unittest.TestCase):
    def test_modificado_en_el_indice(self):
        self.assertEqual(ruta_de("M  memory/aprendizaje-olas.md"), "memory/aprendizaje-olas.md")

    def test_modificado_en_el_arbol(self):
        self.assertEqual(ruta_de(" M src/app/page.tsx"), "src/app/page.tsx")

    def test_sin_seguimiento(self):
        self.assertEqual(ruta_de("?? scripts/puente/nuevo.py"), "scripts/puente/nuevo.py")

    def test_renombrado_se_queda_con_la_nueva(self):
        self.assertEqual(ruta_de("R  viejo.md -> memory/aprendizaje-olas.md"), "memory/aprendizaje-olas.md")

    def test_ruta_entrecomillada(self):
        self.assertEqual(ruta_de('?? "src/con espacio.tsx"'), "src/con espacio.tsx")

    def test_linea_vacia_o_corta(self):
        self.assertEqual(ruta_de(""), "")
        self.assertEqual(ruta_de("M"), "")


class TestRepartir(unittest.TestCase):
    def test_solo_la_memoria_del_enjambre(self):
        mias, ajenas = repartir("M  memory/aprendizaje-olas.md")
        self.assertEqual(mias, ["memory/aprendizaje-olas.md"])
        self.assertEqual(ajenas, [])

    def test_trabajo_ajeno_no_se_toca(self):
        mias, ajenas = repartir(" M src/app/page.tsx\n?? borrador.txt")
        self.assertEqual(mias, [])
        self.assertEqual(ajenas, ["src/app/page.tsx", "borrador.txt"])

    def test_mezcla(self):
        mias, ajenas = repartir("M  memory/aprendizaje-olas.md\n M src/app/page.tsx")
        self.assertEqual(mias, ["memory/aprendizaje-olas.md"])
        self.assertEqual(ajenas, ["src/app/page.tsx"])

    def test_arbol_limpio(self):
        self.assertEqual(repartir(""), ([], []))
        self.assertEqual(repartir("\n  \n"), ([], []))

    def test_conserva_el_orden(self):
        _, ajenas = repartir(" M b.ts\n M a.ts")
        self.assertEqual(ajenas, ["b.ts", "a.ts"])

    def test_una_ruta_parecida_no_cuela(self):
        # Prefijo del nombre propio: es ajena, y por tanto para el arranque.
        _, ajenas = repartir("?? memory/aprendizaje-olas.md.bak")
        self.assertEqual(ajenas, ["memory/aprendizaje-olas.md.bak"])


class TestSoloEsNuestro(unittest.TestCase):
    def test_si_cuando_solo_hay_memoria(self):
        self.assertTrue(solo_es_nuestro("M  memory/aprendizaje-olas.md"))

    def test_no_cuando_hay_algo_ajeno(self):
        self.assertFalse(solo_es_nuestro("M  memory/aprendizaje-olas.md\n M src/x.ts"))

    def test_no_con_el_arbol_limpio(self):
        # Sin nada que recoger no es «nuestro»: es que no hay nada.
        self.assertFalse(solo_es_nuestro(""))

    def test_la_lista_es_un_parametro(self):
        self.assertTrue(solo_es_nuestro("?? notas/x.md", propias=("notas/x.md",)))

    def test_la_lista_por_defecto_incluye_la_memoria(self):
        self.assertIn("memory/aprendizaje-olas.md", PROPIAS)


if __name__ == "__main__":
    unittest.main()
