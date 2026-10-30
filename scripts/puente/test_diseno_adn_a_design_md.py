"""Pruebas de diseno_adn_a_design_md.py (sin red): apartados, pureza y CLI."""

import contextlib
import io
import json
import os
import re
import tempfile
import unittest

from scripts.puente.diseno_adn_a_design_md import SIN, TITULOS, design_md, main


def dna_ejemplo():
    """ADN mínimo con espacio y superficie ausentes (para «Sin datos en el ADN»)."""
    return {
        "meta": {"nombre": "Muestra", "slug": "muestra", "fecha": "2026-10-25",
                 "no_copiado": ["logo ajeno"]},
        "alma": {"una_linea": "Sobrio y cálido.", "adjetivos": ["sobrio", "cálido"],
                 "linaje": "Muestra"},
        "paleta": [{"rol": "fondo", "hex": "#101010", "nombre": "tinta de noche",
                    "cobertura": 90, "prohibido": ["nieve sobre tinta"]},
                   {"rol": "tinta", "hex": "#F2F2F2", "nombre": "hueso pulido",
                    "cobertura": 10}],
        "tipo": {"familias": [{"rol": "titular", "nombre": "Fraunces", "fallback": "serif"}]},
        "firmas": [{"jugada": "pergamino cristal", "como": "opacidad 0.9"}],
        "jugada_rara": {"que": "número cortado por el borde", "como": "1 vez"},
        "prohibiciones": ["nieve sobre tinta", "neón", "hex sueltos", "sombras duras",
                          "tipos frías"],
        "inferido": ["espacio"],
    }


class TestDisenoAdnADesignMd(unittest.TestCase):
    """Batería del generador del DESIGN.md numerado."""

    def test_nueve_titulos_en_orden(self):
        texto = design_md(dna_ejemplo())
        encontrados = re.findall(r"^## \d+\. .+$", texto, re.MULTILINE)
        esperados = ["## %d. %s" % (i + 1, t) for i, t in enumerate(TITULOS)]
        self.assertEqual(encontrados, esperados)
        self.assertTrue(texto.startswith("# Design System: Muestra\n"))
        self.assertIn("<!-- Generado desde memory/diseno/adn/muestra/dna.json"
                      " (fecha 2026-10-25). No editar a mano. -->", texto)

    def test_paleta_hex_roles_y_sin_datos_donde_falta(self):
        texto = design_md(dna_ejemplo())
        self.assertIn("**tinta de noche** · `#101010` · rol fondo · cobertura 90 %", texto)
        self.assertIn("Prohibido: nieve sobre tinta", texto)
        self.assertIn("Sin datos en el ADN", texto)
        self.assertGreaterEqual(texto.count("Sin datos en el ADN"), 2)
        self.assertIn("Inferido, no medido: espacio", texto)
        self.assertIn("No nieve sobre tinta", texto)
        self.assertIn("Una vez: número cortado por el borde (1 vez)", texto)

    def test_cafe_real_contiene_hex_tradicional_y_prohibicion(self):
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
                os.path.abspath(__file__)))), "memory", "diseno", "adn", "cafe", "dna.json"),
                encoding="utf-8") as f:
            texto = design_md(json.load(f))
        self.assertIn("`#FDF7EA`", texto)
        self.assertIn("No terracota sobre crema", texto)

    def test_determinista_misma_entrada_misma_salida(self):
        primero = design_md(dna_ejemplo(), "primera línea\n")
        segundo = design_md(dna_ejemplo(), "primera línea\n")
        self.assertEqual(primero, segundo)

    def test_guia_con_tope_catorce_y_sin_prompt(self):
        promesa = "\n".join("línea %d" % i for i in range(20))
        texto = design_md(dna_ejemplo(), promesa)
        cuerpo = texto.split("## 9. Agent Prompt Guide\n", 1)[1]
        self.assertIn("línea 13", cuerpo)
        self.assertNotIn("línea 14", cuerpo)
        self.assertIn("Sin PROMPT.md", design_md(dna_ejemplo(), ""))

    def test_cafe_real_con_prompt_real_en_seccion_9(self):
        """El PROMPT.md real del café entra en la sección 9 junto a su dna.json."""
        base = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "memory", "diseno", "adn", "cafe")
        with open(os.path.join(base, "dna.json"), encoding="utf-8") as f: dna_cafe = json.load(f)
        prompt_cafe = open(os.path.join(base, "PROMPT.md"), encoding="utf-8").read()
        texto = design_md(dna_cafe, prompt_cafe)
        self.assertIn("`#FDF7EA`", texto)
        self.assertIn("Referencia (mirala primero)", texto.split("## 9. Agent Prompt Guide\n", 1)[1])

    def _carpeta_adn(self):
        raiz = tempfile.mkdtemp()
        carpeta = os.path.join(raiz, "memory", "diseno", "adn", "prueba")
        os.makedirs(carpeta)
        with open(os.path.join(carpeta, "dna.json"), "w", encoding="utf-8") as f:
            json.dump(dna_ejemplo(), f)
        return raiz, carpeta

    def test_main_sin_escribir_solo_imprime_y_no_crea_archivo(self):
        raiz, carpeta = self._carpeta_adn()
        sobre = io.StringIO()
        with contextlib.redirect_stdout(sobre):
            self.assertEqual(0, main(["--slug", "prueba", "--raiz", raiz]))
        self.assertIn("# Design System: Muestra", sobre.getvalue())
        self.assertFalse(os.path.exists(os.path.join(carpeta, "DESIGN.md")))

    def test_main_escribe_junto_al_adn_y_rechaza_slug_peligroso(self):
        raiz, carpeta = self._carpeta_adn()
        sobre = io.StringIO()
        with contextlib.redirect_stdout(sobre):
            self.assertEqual(0, main(["--slug", "prueba", "--raiz", raiz, "--escribir"]))
        destino = os.path.join(carpeta, "DESIGN.md")
        self.assertTrue(os.path.isfile(destino))
        self.assertIn("## 9. Agent Prompt Guide\nSin PROMPT.md",
                      open(destino, encoding="utf-8").read())
        for vil in ("..", "../cafe", "café", "Cafe", "a/b"):
            with self.assertRaises(ValueError):
                main(["--slug", vil, "--raiz", raiz])
        with self.assertRaises(SystemExit):
            main(["--raiz", raiz])  # ni --slug ni --todos
        with self.assertRaises(Exception):
            main(["--slug", "fantasma", "--raiz", raiz])


if __name__ == "__main__":
    unittest.main()
