"""Pruebas de diseno_adn_a_design_md: formato, determinismo y CLI sin red."""

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from diseno_adn_a_design_md import design_md, main

TITULOS = [
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

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def dna_ejemplo():
    return {
        "meta": {"nombre": "Ejemplo", "slug": "ejemplo", "fecha": "2026-01-02",
                 "no_copiado": ["logo de muestra"]},
        "alma": {"una_linea": "Sereno y preciso", "adjetivos": ["sereno", "preciso"],
                 "linaje": "Prueba"},
        "paleta": [
            {"rol": "fondo", "hex": "#112233", "nombre": "azul profundo",
             "cobertura": 60, "prohibido": ["neón"]},
            {"rol": "acento", "hex": "#AABBCC", "nombre": "niebla",
             "cobertura": 40, "prohibido": []},
        ],
        "tipo": {"familias": [{"rol": "titular", "nombre": "Serif", "fallback": "serif"}]},
        "firmas": [{"jugada": "tarjeta plana", "como": "sin sombra"}],
        "espacio": None,
        "superficie": None,
        "prohibiciones": ["nunca centrar"],
        "jugada_rara": {"que": "corte diagonal", "como": "una vez", "por_que": "tensión"},
        "inferido": ["espacio"],
    }


class TestDesignMd(unittest.TestCase):
    def test_nueve_apartados_en_orden(self):
        texto = design_md(dna_ejemplo())
        posiciones = [texto.index(t) for t in TITULOS]
        self.assertEqual(posiciones, sorted(posiciones))
        self.assertTrue(texto.startswith("# Design System: Ejemplo"))
        self.assertIn("memory/diseno/adn/ejemplo/dna.json", texto)

    def test_paleta_y_datos_que_faltan(self):
        texto = design_md(dna_ejemplo())
        self.assertIn("#112233", texto)
        self.assertIn("#AABBCC", texto)
        self.assertIn("Sin datos en el ADN", texto)

    def test_cafe_real(self):
        carpeta = os.path.join(RAIZ, "memory", "diseno", "adn", "cafe")
        with open(os.path.join(carpeta, "dna.json"), encoding="utf-8") as f:
            dna = json.load(f)
        with open(os.path.join(carpeta, "PROMPT.md"), encoding="utf-8") as f:
            prompt = f.read()
        texto = design_md(dna, prompt)
        self.assertIn("#FDF7EA", texto)
        self.assertIn("terracota sobre crema", texto)

    def test_dos_llamadas_iguales(self):
        self.assertEqual(design_md(dna_ejemplo(), "uno\ndos"),
                         design_md(dna_ejemplo(), "uno\ndos"))


class TestMain(unittest.TestCase):
    def _repo(self, tmp):
        carpeta = os.path.join(tmp, "memory", "diseno", "adn", "ejemplo")
        os.makedirs(carpeta)
        with open(os.path.join(carpeta, "dna.json"), "w", encoding="utf-8") as f:
            json.dump(dna_ejemplo(), f, ensure_ascii=False)
        return carpeta

    def test_sin_escribir_no_crea_archivo(self):
        with tempfile.TemporaryDirectory() as tmp:
            carpeta = self._repo(tmp)
            salida = io.StringIO()
            with redirect_stdout(salida):
                codigo = main(["--slug", "ejemplo", "--raiz", tmp])
            self.assertEqual(codigo, 0)
            self.assertIn("# Design System: Ejemplo", salida.getvalue())
            self.assertFalse(os.path.exists(os.path.join(carpeta, "DESIGN.md")))

    def test_escribir_crea_design_md(self):
        with tempfile.TemporaryDirectory() as tmp:
            carpeta = self._repo(tmp)
            with redirect_stdout(io.StringIO()):
                codigo = main(["--slug", "ejemplo", "--raiz", tmp, "--escribir"])
            self.assertEqual(codigo, 0)
            self.assertTrue(os.path.isfile(os.path.join(carpeta, "DESIGN.md")))

    def test_slug_con_puntos_suspendidos_se_rechaza(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._repo(tmp)
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                codigo = main(["--slug", "..", "--raiz", tmp])
            self.assertEqual(codigo, 2)


if __name__ == "__main__":
    unittest.main()
