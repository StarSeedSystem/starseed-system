"""Pruebas unitarias para la puerta de archivos degenerados."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from puerta_degenerados import archivos_degenerados


class TestPuertaDegenerados(unittest.TestCase):
    def test_valla_markdown_en_no_md(self):
        cambios = [
            ("src/router.ts", "const a = 1;", "```ts\nconst a = 1;\n```"),
        ]
        razones = archivos_degenerados(cambios)
        self.assertTrue(any("valla markdown" in r for r in razones))

    def test_encoge_mas_de_la_mitad(self):
        antes = "\n".join([f"linea_{i} = {i}" for i in range(50)])
        despues = "linea_0 = 0\nlinea_1 = 1"
        cambios = [("scripts/grande.py", antes, despues)]
        razones = archivos_degenerados(cambios)
        self.assertTrue(any("encogió" in r for r in razones))

    def test_sintaxis_python_invalida(self):
        cambios = [
            ("scripts/mal.py", "x = 1", "def funcion_incompleta("),
        ]
        razones = archivos_degenerados(cambios)
        self.assertTrue(any("error de sintaxis" in r for r in razones))

    def test_negativo_archivo_nuevo(self):
        cambios = [
            (
                "src/componente_nuevo.tsx",
                "",
                "export function Novo() { return <div />; }",
            ),
        ]
        razones = archivos_degenerados(cambios)
        self.assertEqual(razones, [])

    def test_negativo_md_con_valla(self):
        cambios = [
            ("README.md", "# Titulo", "# Titulo\n```bash\nnpm test\n```"),
        ]
        razones = archivos_degenerados(cambios)
        self.assertEqual(razones, [])


if __name__ == "__main__":
    unittest.main()
