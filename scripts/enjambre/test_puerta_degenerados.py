"""Pruebas unitarias para la puerta de archivos degenerados."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from puerta_degenerados import archivos_degenerados, secretos_en_cambios


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


class TestSecretosEnCambios(unittest.TestCase):
    """Pruebas para la detección de secretos en cambios."""

    @classmethod
    def setUpClass(cls):
        """Carga el escáner real de produccion_puertas."""
        import importlib.util
        import sys

        ruta_puente = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", "puente"
        )
        if ruta_puente not in sys.path:
            sys.path.insert(0, ruta_puente)

        spec = importlib.util.spec_from_file_location(
            "produccion_puertas",
            os.path.join(ruta_puente, "produccion_puertas.py"),
        )
        if spec is None or spec.loader is None:
            cls.escanear = None
            return
        modulo = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(modulo)
            cls.escanear = modulo.escanear_secretos
        except Exception:
            cls.escanear = None

    def _skip_if_no_scanner(self):
        if type(self).escanear is None:
            self.skipTest("No se pudo cargar produccion_puertas.escanear_secretos")

    def _get_escanear(self):
        return type(self).escanear

    def test_archivo_no_prueba_con_ghp(self):
        """(a) Archivo no de prueba que añade un ghp_ → una razón."""
        self._skip_if_no_scanner()
        # ghp_ + 36 caracteres alfanuméricos variados (sin rachas abc/123)
        token = "gh" + "p_" + "Xk9mP2qR5vW8yZ1aB3cD7eF4gH6jK8lM0nQ"
        cambios = [("scripts/puente/m.py", "", f"TOKEN = \"{token}\"")]
        razones = secretos_en_cambios(cambios, self._get_escanear())
        self.assertEqual(len(razones), 1)
        self.assertTrue(razones[0].startswith("scripts/puente/m.py:1:"))
        self.assertIn("(ghp)", razones[0])
        # El valor nunca aparece en la razón
        self.assertNotIn(token, razones[0])

    def test_mismo_valor_en_antes_y_despues_no_cuenta(self):
        """(b) El mismo valor ya en antes e igual en despues → [] (solo cuenta lo añadido)."""
        self._skip_if_no_scanner()
        token = "gh" + "p_" + "Xk9mP2qR5vW8yZ1aB3cD7eF4gH6jK8lM0nQ"
        antes = f"TOKEN = \"{token}\""
        despues = f"TOKEN = \"{token}\"\nOTRO = 1"
        cambios = [("scripts/puente/m.py", antes, despues)]
        razones = secretos_en_cambios(cambios, self._get_escanear())
        self.assertEqual(razones, [])

    def test_archivo_prueba_con_marcador_sk_no_cuenta(self):
        """(c) Archivo de prueba con sk- de-prueba-xxxx → [] (marcador en archivo de prueba)."""
        self._skip_if_no_scanner()
        token = "s" + "k-" + "de-prueba-xxxx-xxxx"
        cambios = [("scripts/puente/test_m.py", "", f"TOKEN = \"{token}\"")]
        razones = secretos_en_cambios(cambios, self._get_escanear())
        self.assertEqual(razones, [])

    def test_escanear_lanza_excepcion_devuelve_vacio(self):
        """(d) escanear que lanza RuntimeError → []."""
        def escanear_falso(_diff):
            raise RuntimeError("fallo simulado")
        cambios = [("scripts/puente/m.py", "", 'TOKEN = "ghp_Xk9mP2qR5vW8yZ1aB3cD7eF4gH6jK8lM0nQ"')]
        razones = secretos_en_cambios(cambios, escanear_falso)
        self.assertEqual(razones, [])

    def test_escanear_none_devuelve_vacio(self):
        """(e) escanear=None → []."""
        cambios = [("scripts/puente/m.py", "", 'TOKEN = "ghp_Xk9mP2qR5vW8yZ1aB3cD7eF4gH6jK8lM0nQ"')]
        razones = secretos_en_cambios(cambios, None)
        self.assertEqual(razones, [])

    def test_cambio_con_despues_vacio_no_llega_al_diff(self):
        """(f) Cambio con despues vacío (borrado) no llega al diff."""
        self._skip_if_no_scanner()
        recibidos = []

        def escanear_espia(diff):
            recibidos.append(diff)
            return []

        token = "gh" + "p_" + "Xk9mP2qR5vW8yZ1aB3cD7eF4gH6jK8lM0nQ"
        # Borrado: despues vacío
        cambios = [("scripts/puente/m.py", f'TOKEN = "{token}"', "")]
        razones = secretos_en_cambios(cambios, escanear_espia)
        self.assertEqual(razones, [])
        # El escáner no debería haber recibido la ruta del archivo borrado
        self.assertEqual(len(recibidos), 0)

    def test_starseed_memory_root_con_sk(self):
        """(g) starseed_memory_root/state.md con sk- + 20 chars → una razón (no excluye rutas)."""
        self._skip_if_no_scanner()
        token = "s" + "k-" + "Xk9mP2qR5vW8yZ1aB3cD"
        cambios = [("starseed_memory_root/state.md", "", f"API_KEY = \"{token}\"")]
        razones = secretos_en_cambios(cambios, self._get_escanear())
        self.assertEqual(len(razones), 1)
        self.assertTrue(razones[0].startswith("starseed_memory_root/state.md:"))
        self.assertIn("(sk)", razones[0])

    def test_ninguna_razion_contiene_el_valor(self):
        """(h) Ninguna razón contiene el valor del secreto."""
        self._skip_if_no_scanner()
        token = "gh" + "p_" + "Xk9mP2qR5vW8yZ1aB3cD7eF4gH6jK8lM0nQ"
        cambios = [("scripts/puente/m.py", "", f"TOKEN = \"{token}\"")]
        razones = secretos_en_cambios(cambios, self._get_escanear())
        for r in razones:
            self.assertNotIn(token, r)


if __name__ == "__main__":
    unittest.main()
