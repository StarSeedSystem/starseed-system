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

    def test_valla_solo_al_final(self):
        """El LLM cerro la valla sin abrirla: el archivo termina en ```."""
        cambios = [("src/router.ts", "const a = 1;", "const a = 1;\n```")]
        razones = archivos_degenerados(cambios)
        self.assertTrue(any("valla markdown" in r for r in razones))

    def test_negativo_docstring_python_con_valla(self):
        """Un .py con un ejemplo en markdown DENTRO no es degenerado.

        Es el caso de este repo: los encargos se construyen con ejemplos.
        """
        despues = (
            'ENCARGO = """\n'
            "Devuelve el archivo asi:\n"
            "```ts\n"
            "const a = 1;\n"
            "```\n"
            '"""\n'
        )
        cambios = [("scripts/puente/encargo.py", "ENCARGO = \"\"\"x\"\"\"\n", despues)]
        self.assertEqual(archivos_degenerados(cambios), [])

    def test_negativo_template_literal_ts(self):
        """Un .ts con un template literal que abre valla no es degenerado."""
        despues = "export const ayuda = `\n```bash\nnpm test\n```\n`;\nexport default ayuda;\n"
        cambios = [("src/lib/ayuda.ts", "export const ayuda = ``;", despues)]
        self.assertEqual(archivos_degenerados(cambios), [])

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

    # (d) Marcas de conflicto de git
    def test_marcas_conflicto_git_en_md(self):
        despues = "<<<<<<< HEAD\ncontenido local\n=======\ncontenido remoto\n>>>>>>> abc (rama)\n"
        cambios = [("doc.md", "contenido original", despues)]
        razones = archivos_degenerados(cambios)
        self.assertTrue(any("marcas de conflicto de git" in r for r in razones))

    def test_marcas_conflicto_dentro_de_valla_no_cuenta(self):
        """Explicar conflictos con marcas DENTRO de una valla ``` no es degenerado."""
        despues = "Aqui hay un conflicto:\n```\n<<<<<<< HEAD\nlocal\n=======\nremoto\n>>>>>>> abc\n```\nFin."
        cambios = [("doc.md", "antes", despues)]
        self.assertEqual(archivos_degenerados(cambios), [])

    def test_titulo_subrayado_con_iguales_no_es_conflicto(self):
        """Un titulo subrayado con ======= en Markdown no cuenta."""
        despues = "Titulo\n=======\nContenido"
        cambios = [("doc.md", "antes", despues)]
        self.assertEqual(archivos_degenerados(cambios), [])

    def test_marcas_conflicto_en_ts(self):
        despues = "<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> feature\n"
        cambios = [("src/app.ts", "const a = 1;", despues)]
        razones = archivos_degenerados(cambios)
        self.assertTrue(any("marcas de conflicto de git" in r for r in razones))

    # (e) Copias de seguridad
    def test_copias_seguridad_varias_extensiones(self):
        cambios = [
            ("architecture/x.md.backup", "", "contenido"),
            ("src/a.ts.bak", "", "contenido"),
            ("src/b.ts.orig", "", "contenido"),
            ("src/c.tsx.bak.1794102349", "", "contenido"),
        ]
        razones = archivos_degenerados(cambios)
        self.assertEqual(len(razones), 4)
        for r in razones:
            self.assertIn("copia de seguridad", r)

    def test_borrar_copia_seguridad_no_rechaza(self):
        cambios = [("src/a.ts.bak", "contenido", "")]
        self.assertEqual(archivos_degenerados(cambios), [])

    def test_archivos_con_backup_en_nombre_pero_no_extension(self):
        cambios = [
            ("src/backup.ts", "", "contenido"),
            ("docs/backups.md", "", "contenido"),
        ]
        self.assertEqual(archivos_degenerados(cambios), [])


if __name__ == "__main__":
    unittest.main()
