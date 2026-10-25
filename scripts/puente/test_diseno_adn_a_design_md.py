"""
Pruebas unitarias para diseno_adn_a_design_md.py (DSN1025C).

Contrato: architecture/repos-libreria-1025.md §3.3 y §5, tarea DSN1025C.
Sin red y sin burlas: `design_md` es pura y `main` se prueba en una carpeta temporal.
"""

import contextlib
import io
import json
import os
import tempfile
import unittest

from scripts.puente.diseno_adn_a_design_md import (
    design_md,
    main,
    validar_slug,
)

TITULOS_ESPERADOS = [
    "## 1. Visual Theme & Atmosphere",
    "## 2. Color Palette & Roles",
    "## 3. Typography Rules",
    "## 4. Component Stylings",
    "## 5. Layout Principles",
    "## 6. Depth & Elevation",
    "## 7. Do's and Don'ts",
    "## 8. Responsive Behavior",
    "## 9. Agent Prompt Guide",
]

RAIZ_REPOSITORIO = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

CAFE_DNA = os.path.join(RAIZ_REPOSITORIO, "memory", "diseno", "adn", "cafe", "dna.json")

DNA_PRUEBA = {
    "meta": {
        "nombre": "Café de prueba",
        "slug": "cafe",
        "fecha": "2026-10-25",
        "no_copiado": ["fotos con licencia"],
    },
    "alma": {
        "una_linea": "Cafetería comunitaria con pergamino y terracota",
        "adjetivos": ["cálido", "orgánico", "terracota"],
        "linaje": "StarSeed Cafe",
    },
    "paleta": [
        {"rol": "fondo", "hex": "#FDF7EA", "nombre": "pergamino", "cobertura": 50},
        {"rol": "primario", "hex": "#C05C3B", "nombre": "terracota", "cobertura": 15},
    ],
    "tipo": {"familias": [{"rol": "cuerpo", "nombre": "Space Grotesk", "fallback": "sans-serif"}]},
    "firmas": [{"jugada": "pergamino cristal cálido", "como": "opacidad 0.9"}],
    "prohibiciones": ["terracota sobre crema"],
    "jugada_rara": {"que": "curva orgánica en el borde", "como": "1 vez"},
    "inferido": ["espacio"],
}


class TestDesignMd(unittest.TestCase):
    """Batería del generador dna.json → DESIGN.md."""

    def test_nueve_titulos_en_orden(self):
        salida = design_md(DNA_PRUEBA)
        inicio = 0
        for titulo in TITULOS_ESPERADOS:
            siguiente = salida.index(titulo, inicio)
            self.assertGreaterEqual(siguiente, inicio)
            inicio = siguiente + len(titulo)

    def test_titulo_y_comentario_del_encabezado(self):
        salida = design_md(DNA_PRUEBA)
        self.assertTrue(salida.startswith("# Design System: Café de prueba"))
        self.assertIn(
            "<!-- Generado desde memory/diseno/adn/cafe/dna.json "
            + "(fecha 2026-10-25). No editar a mano. -->",
            salida,
        )

    def test_paleta_hexes_rol_y_prohibido(self):
        salida = design_md(DNA_PRUEBA)
        self.assertIn("**pergamino** (`#FDF7EA`)", salida)
        self.assertIn("**terracota** (`#C05C3B`)", salida)
        self.assertIn("cobertura 50 %", salida)
        self.assertIn("No terracota sobre crema", salida)
        self.assertIn("Una vez curva orgánica", salida)
        self.assertIn("No copiado fotos con licencia", salida)

    def test_determinista_y_prompt_primeros_14(self):
        lineas = ["Referencia (mírala primero): referencia/cafe.png", ""]
        lineas += ["Línea %s del prompt." % i for i in range(1, 17)]
        prompt = "\n".join(lineas)
        primera = design_md(DNA_PRUEBA, prompt_md=prompt)
        segunda = design_md(DNA_PRUEBA, prompt_md=prompt)
        self.assertEqual(primera, segunda)
        en_guia = primera.index("## 9. Agent Prompt Guide")
        cuerpo = [l for l in primera[en_guia:].splitlines()[1:] if l.strip()]
        self.assertEqual(cuerpo[0], "Guía de peticiones para el agente:")
        lineas_guia = cuerpo[1:]
        self.assertEqual(len(lineas_guia), 14)
        self.assertIn("Referencia (mírala primero): referencia/cafe.png", cuerpo)
        self.assertNotIn("Línea 14 del prompt.", cuerpo)
        self.assertIn("Línea 13 del prompt.", cuerpo)
        self.assertIn("Línea 1 del prompt.", cuerpo)

    def test_sin_datos_donde_falta(self):
        salida = design_md(DNA_PRUEBA)
        # espacio y superficie no están: apartados 5, 6 y 8 lo dicen.
        self.assertEqual(salida.count("Sin datos en el ADN"), 5)
        self.assertIn("Rejilla y espacio: Sin datos en el ADN", salida)
        self.assertIn("Textura, bordes y elevación: Sin datos en el ADN", salida)
        self.assertIn("Pesos: Sin datos en el ADN", salida)
        self.assertIn("Pasos: Sin datos en el ADN", salida)
        self.assertIn("Guía de peticiones para el agente: Sin PROMPT.md", salida)

    def test_adn_real_cafe(self):
        with open(CAFE_DNA, "r", encoding="utf-8") as fuente:
            dna_cafe = json.load(fuente)
        salida = design_md(dna_cafe)
        self.assertIn("#FDF7EA", salida)
        self.assertIn("terracota sobre crema", salida)
        self.assertTrue(salida.startswith("# Design System: StarSeed Cafe"))


class TestMain(unittest.TestCase):
    """La CLI escribe solo con --escribir y rechaza slugs malos."""

    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        raiz = self.temporal.name
        carpeta = os.path.join(raiz, "memory", "diseno", "adn", "cafe")
        os.makedirs(carpeta)
        with open(os.path.join(carpeta, "dna.json"), "w", encoding="utf-8") as destino:
            json.dump(DNA_PRUEBA, destino)
        self.carpeta = carpeta

    def tearDown(self):
        self.temporal.cleanup()

    def test_main_sin_escribir_no_crea_archivos(self):
        antes = sorted(os.listdir(self.carpeta))
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = main(["--slug", "cafe", "--raiz", self.temporal.name])
        despues = sorted(os.listdir(self.carpeta))
        self.assertEqual(codigo, 0)
        self.assertEqual(antes, despues)
        self.assertNotIn("DESIGN.md", despues)
        self.assertIn("# Design System: Café de prueba", salida.getvalue())

    def test_main_con_escribir_crea_design_md(self):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = main(["--slug", "cafe", "--raiz", self.temporal.name, "--escribir"])
        self.assertEqual(codigo, 0)
        ruta = os.path.join(self.carpeta, "DESIGN.md")
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, "r", encoding="utf-8") as fuente:
            escrito = fuente.read()
        self.assertEqual(escrito, design_md(DNA_PRUEBA))

    def test_main_rechaza_slug_con_puntos(self):
        errores = io.StringIO()
        with contextlib.redirect_stderr(errores):
            with contextlib.redirect_stdout(io.StringIO()):
                codigo = main(["--slug", "../cafe", "--raiz", self.temporal.name])
        self.assertNotEqual(codigo, 0)
        ruta_mala = os.path.join(
            self.temporal.name, "memory", "diseno", "adn", "cafe", "DESIGN.md"
        )
        self.assertFalse(os.path.exists(ruta_mala))

    def test_validar_slug_reglas(self):
        self.assertEqual(validar_slug("cafe"), (False, ""))
        self.assertNotEqual(validar_slug(""), (False, ""))
        self.assertNotEqual(validar_slug("Cafe"), (False, ""))
        self.assertNotEqual(validar_slug("cafe/cafe"), (False, ""))

    def test_main_slug_sin_dna_falla(self):
        silencio = io.StringIO()
        with contextlib.redirect_stdout(silencio):
            with contextlib.redirect_stderr(silencio):
                codigo = main(["--slug", "otro", "--raiz", self.temporal.name])
        self.assertNotEqual(codigo, 0)
