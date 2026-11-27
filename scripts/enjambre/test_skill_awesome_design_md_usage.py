# -*- coding: utf-8 -*-
"""Test que verifica que la skill awesome-design-md tiene sección de uso completa.
Valida la reparación de CAP-skill-awesome-design-md-uso: el enjambre rechazó porque no tocó SKILL.md.
"""
import os
import unittest


class SkillAwesomeDesignMdUsageTest(unittest.TestCase):
    SKILL_PATH = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        ".agent", "skills", "awesome-design-md", "SKILL.md"
    )

    def setUp(self):
        with open(self.SKILL_PATH, "r", encoding="utf-8") as f:
            self.content = f.read()

    def test_tiene_seccion_uso_practico(self):
        """La skill debe tener la sección '## Uso práctico (para el enjambre)'."""
        self.assertIn("## Uso práctico (para el enjambre)", self.content)

    def test_modo_a_leer_referencias(self):
        """Debe documentar el Modo A con patrón de búsqueda y lectura."""
        self.assertIn("### Modo A: Leer referencias", self.content)
        self.assertIn("INDICE.md", self.content)
        self.assertIn("curl -s", self.content)
        self.assertIn("raw.githubusercontent.com/VoltAgent/awesome-design-md", self.content)
        self.assertIn("linear.app", self.content)
        self.assertIn("supabase", self.content)

    def test_modo_b_escribir_design_md(self):
        """Debe documentar el Modo B con pasos completos."""
        self.assertIn("### Modo B: Escribir DESIGN.md", self.content)
        self.assertIn("#### Paso 1: Tener el ADN", self.content)
        self.assertIn("dna.json", self.content)
        self.assertIn("#### Paso 2: Elegir formato", self.content)
        self.assertIn("#### Paso 3: Escribir el archivo", self.content)

    def test_tabla_correspondencia_adn_design(self):
        """Debe tener la tabla de correspondencia ADN -> DESIGN.md (9 secciones)."""
        self.assertIn("| Sección DESIGN.md", self.content)
        self.assertIn("Origen en dna.json", self.content)
        self.assertIn("Ejemplo de salida", self.content)
        self.assertIn("Visual Theme & Atmosphere", self.content)
        self.assertIn("Color Palette & Roles", self.content)
        self.assertIn("Typography Rules", self.content)
        self.assertIn("Component Stylings", self.content)
        self.assertIn("Layout Principles", self.content)
        self.assertIn("Depth & Elevation", self.content)
        self.assertIn("Do's and Don'ts", self.content)
        self.assertIn("Responsive Behavior", self.content)
        self.assertIn("Agent Prompt Guide", self.content)

    def test_ejemplo_completo_formato_numerado(self):
        """Debe incluir ejemplo completo de DESIGN.md en formato numerado."""
        self.assertIn("# Design System", self.content)
        self.assertIn("## 1. Visual Theme & Atmosphere", self.content)
        self.assertIn("## 2. Color Palette & Roles", self.content)
        self.assertIn("## 3. Typography Rules", self.content)
        self.assertIn("## 4. Component Stylings", self.content)
        self.assertIn("## 5. Layout Principles", self.content)
        self.assertIn("## 6. Depth & Elevation", self.content)
        self.assertIn("## 7. Do's and Don'ts", self.content)
        self.assertIn("## 8. Responsive Behavior", self.content)
        self.assertIn("## 9. Agent Prompt Guide", self.content)

    def test_ejemplo_tarea_enjambre_yaml(self):
        """Debe incluir ejemplo de tarea YAML para la cola del enjambre."""
        self.assertIn("### Flujo completo en una tarea del enjambre", self.content)
        self.assertIn("DSN1025C-write-design-md", self.content)
        self.assertIn("tasks.json", self.content)
        self.assertIn("memory/diseno/adn/partido/DESIGN.md", self.content)

    def test_validacion_automatica(self):
        """Debe documentar comandos de validación."""
        self.assertIn("### Validación automática", self.content)
        self.assertIn("@google/design.md lint", self.content)
        self.assertIn("check.py", self.content)

    def test_referencias_rapidas(self):
        """Debe tener tabla de referencias rápidas a archivos del repo."""
        self.assertIn("### Referencias rápidas en el repo", self.content)
        self.assertIn("INDICE.md", self.content)
        self.assertIn("DESIGN-formato-numerado-kraken.md", self.content)
        self.assertIn("DESIGN-formato-alpha-supabase.md", self.content)
        self.assertIn("STARSEED.md", self.content)
        self.assertIn("ORIGEN.md", self.content)

    def test_nombres_descriptivos_colores(self):
        """El ejemplo debe usar nombres descriptivos, no tokens sueltos."""
        self.assertIn("Esmeralda viva", self.content)
        self.assertIn("Near-black", self.content)
        self.assertIn("Gris cabello", self.content)
        self.assertIn("Rojo suave", self.content)

    def test_regla_oro_modo_a(self):
        """Debe incluir la regla de oro del Modo A."""
        self.assertIn("Regla de oro", self.content)
        self.assertIn("patrón transferible al ADN", self.content)
        self.assertIn("nunca un hex ni un nombre de fuente ajeno", self.content)


if __name__ == "__main__":
    unittest.main()