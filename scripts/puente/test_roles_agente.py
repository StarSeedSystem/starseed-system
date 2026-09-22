"""
Pruebas unitarias para roles_agente.py.
"""

import os
import shutil
import tempfile
import unittest

from scripts.puente.roles_agente import (
    _palabras_significativas,
    division_de,
    elegir_rol,
    leer_catalogo,
    recortar_rol,
)


class TestRolesAgente(unittest.TestCase):
    """Batería de pruebas para roles_agente."""

    def test_palabras_significativas(self):
        res = _palabras_significativas(
            "Crear un nuevo componente para la interfaz con React"
        )
        self.assertIn("componente", res)
        self.assertIn("interfaz", res)
        self.assertNotIn("para", res)
        self.assertNotIn("con", res)
        self.assertNotIn("un", res)

    def test_division_de_testing(self):
        archivos = ["test_auth.py", "scripts/puente/test_roles.py", "main.py"]
        self.assertEqual(division_de(archivos), "testing")

    def test_division_de_design(self):
        archivos = ["src/components/Button.tsx", "src/app/page.tsx"]
        self.assertEqual(division_de(archivos), "design")

    def test_division_de_security(self):
        archivos = ["src/lib/auth_guardian.ts", "scripts/puente/clave.py"]
        self.assertEqual(division_de(archivos), "security")

    def test_division_de_engineering(self):
        archivos = ["scripts/puente/roles_agente.py", "src/app/api/route.ts"]
        self.assertEqual(division_de(archivos), "engineering")
        self.assertEqual(division_de([]), "engineering")
        self.assertEqual(division_de(["docs/readme.txt"]), "engineering")

    def test_division_de_rutas_absolutas(self):
        archivos = ["/Users/alex/project/src/components/Button.tsx"]
        self.assertEqual(division_de(archivos), "design")
        archivos_eng = ["/home/user/starseed/scripts/puente/roles_agente.py"]
        self.assertEqual(division_de(archivos_eng), "engineering")

    def test_elegir_rol_catalogo_vacio(self):
        self.assertIsNone(
            elegir_rol("Refactorizar backend", ["scripts/puente/a.py"], [])
        )

    def test_elegir_rol_coincidencia_division(self):
        cat = [
            {
                "id": "design/ui-designer",
                "division": "design",
                "name": "UI Designer",
                "description": "Diseñador",
            },
            {
                "id": "engineering/backend-dev",
                "division": "engineering",
                "name": "Backend Dev",
                "description": "Desarrollador",
            },
        ]
        res = elegir_rol(
            "Crear componente de botón", ["src/components/Button.tsx"], cat
        )
        self.assertEqual(res, "design/ui-designer")

    def test_elegir_rol_puntuacion_titulo(self):
        cat = [
            {
                "id": "a",
                "division": "engineering",
                "name": "Python Engineer",
                "description": "Backend",
            },
            {
                "id": "b",
                "division": "engineering",
                "name": "React Specialist",
                "description": "Frontend UI",
            },
        ]
        res = elegir_rol("Crear hooks con React UI", ["scripts/puente/app.py"], cat)
        self.assertEqual(res, "b")

    def test_elegir_rol_desempate_alfabetico(self):
        cat = [
            {
                "id": "beta-role",
                "division": "engineering",
                "name": "Dev",
                "description": "Dev",
            },
            {
                "id": "alpha-role",
                "division": "engineering",
                "name": "Dev",
                "description": "Dev",
            },
        ]
        res = elegir_rol("Tarea genérica", ["scripts/puente/app.py"], cat)
        self.assertEqual(res, "alpha-role")

    def test_elegir_rol_reproducibilidad(self):
        cat = [
            {
                "id": "x",
                "division": "testing",
                "name": "Tester",
                "description": "Pruebas",
            },
            {
                "id": "y",
                "division": "testing",
                "name": "QA Lead",
                "description": "Líder de pruebas",
            },
        ]
        res1 = elegir_rol("Ejecutar pruebas automatizadas", ["test_main.py"], cat)
        res2 = elegir_rol("Ejecutar pruebas automatizadas", ["test_main.py"], cat)
        self.assertEqual(res1, res2)

    def test_recortar_rol_frontmatter(self):
        texto = "---\nname: Test Role\ndescription: Un rol de prueba\n---\n\nCuerpo del rol sin frontmatter."
        res = recortar_rol(texto, tope=1000)
        self.assertEqual(res, "Cuerpo del rol sin frontmatter.")

    def test_recortar_rol_parrafos(self):
        parrafo1 = "Primer párrafo con información importante."
        parrafo2 = "Segundo párrafo que amplía los detalles."
        parrafo3 = "Tercer párrafo que excede el límite del tope."
        texto = f"{parrafo1}\n\n{parrafo2}\n\n{parrafo3}"

        tope = len(parrafo1) + len(parrafo2) + 5
        res = recortar_rol(texto, tope=tope)
        self.assertIn(parrafo1, res)
        self.assertIn(parrafo2, res)
        self.assertNotIn(parrafo3, res)

    def test_recortar_rol_oraciones_y_palabras(self):
        texto_largo = "Esta es la primera oración completa. Esta es la segunda oración completa de prueba."
        res = recortar_rol(texto_largo, tope=40)
        self.assertEqual(res, "Esta es la primera oración completa.")

    def test_leer_catalogo_inexistente(self):
        res = leer_catalogo("/ruta/completamente/inexistente/en/el/sistema")
        self.assertEqual(res, [])

    def test_leer_catalogo_mock(self):
        tmp_dir = tempfile.mkdtemp()
        try:
            eng_dir = os.path.join(tmp_dir, "engineering")
            os.makedirs(eng_dir, exist_ok=True)
            ex_dir = os.path.join(tmp_dir, "examples")
            os.makedirs(ex_dir, exist_ok=True)

            f1 = os.path.join(eng_dir, "backend-expert.md")
            with open(f1, "w", encoding="utf-8") as fp:
                fp.write(
                    "---\nname: Backend Expert\ndescription: Experto en apis\n---\n\nPrompt"
                )

            f_ex = os.path.join(ex_dir, "ejemplo.md")
            with open(f_ex, "w", encoding="utf-8") as fp:
                fp.write("---\nname: Ejemplo Omitido\n---\n\nIgnorar")

            cat = leer_catalogo(tmp_dir)
            self.assertEqual(len(cat), 1)
            self.assertEqual(cat[0]["id"], "engineering/backend-expert")
            self.assertEqual(cat[0]["name"], "Backend Expert")
            self.assertEqual(cat[0]["description"], "Experto en apis")
            self.assertEqual(cat[0]["division"], "engineering")
        finally:
            shutil.rmtree(tmp_dir)


if __name__ == "__main__":
    unittest.main()
