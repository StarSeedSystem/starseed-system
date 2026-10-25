"""Pruebas de diseno_adn_a_design_md.py (DSN1025C): DESIGN.md desde el ADN.

Sin red; run con pytest o `python3 -m unittest` (desde scripts/puente).
"""

import os
import json
import shutil
import tempfile
import unittest

from scripts.puente.diseno_adn_a_design_md import (
    SIN_DATOS,
    TITULOS,
    design_md,
    main,
)

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DNA = {
    "meta": {
        "nombre": "Prueba Alfa", "slug": "prueba-alfa", "fecha": "2026-10-25",
        "no_copiado": ["logo de terceros"],
    },
    "alma": {"una_linea": "Panel denso de lectura nocturna",
             "adjetivos": ["cristalino", "pausado"], "linaje": "prueba"},
    "paleta": [
        {"rol": "fondo", "hex": "#0A0F1D", "nombre": "noche", "cobertura": 60, "prohibido": []},
        {"rol": "primario", "hex": "#007FFF", "nombre": "azur", "cobertura": 40,
         "prohibido": ["sobre noche saturado"]},
    ],
    "tipo": {"familias": [{"rol": "cuerpo", "nombre": "Inter", "fallback": "system-ui"}]},
    "firmas": [{"jugada": "cristal", "como": "blur 10px"}],
    "jugada_rara": {"que": "borde vivo", "como": "solo al abrir", "por_quee": "presencia"},
    "prohibiciones": ["neon", "hex sueltos"],
    "inferido": ["espacio", "medida"],
}

PROMPT = "\n".join("linea no vacia de prueba " + str(i) for i in range(1, 17))


class TestDesignMd(unittest.TestCase):
    """design_md con un dict de ejemplo (sin espacio, superficie ni pesos)."""

    def setUp(self):
        self.salida = design_md(DNA, PROMPT)

    def test_titulo_y_comentario(self):
        self.assertTrue(self.salida.startswith("# Design System: Prueba Alfa\n"))
        self.assertIn("<!-- Generado desde memory/diseno/adn/prueba-alfa/dna.json"
                      " (fecha 2026-10-25). No editar a mano. -->", self.salida)

    def test_nueve_titulos_en_orden(self):
        posiciones = [self.salida.index("## " + titulo) for titulo in TITULOS]
        self.assertEqual(posiciones, sorted(posiciones))
        self.assertEqual(len(TITULOS), 9)

    def test_paleta(self):
        self.assertIn("- **noche** `#0A0F1D` — rol: fondo · cobertura: 60%.", self.salida)
        self.assertIn("- **azur** `#007FFF` — rol: primario · cobertura: 40%.", self.salida)
        self.assertIn("Prohibido: sobre noche saturado.", self.salida)

    def test_sin_datos_donde_falta(self):
        self.assertIn("Pesos: " + SIN_DATOS + ".", self.salida)
        self.assertIn("Pasos: " + SIN_DATOS + ".", self.salida)
        for titulo in ("## 5. Layout Principles", "## 6. Depth & Elevation",
                       "## 8. Responsive Behavior"):
            cuerpo = self.salida.split(titulo + "\n\n", 1)[1].split("\n## ", 1)[0]
            self.assertEqual(cuerpo.strip(), SIN_DATOS)

    def test_alma_inferido_y_firmas(self):
        self.assertIn('**"Panel denso de lectura nocturna"**', self.salida)
        self.assertIn("Linaje: prueba.", self.salida)
        self.assertIn("Inferido, no medido: espacio, medida.", self.salida)
        self.assertIn("- **cristal**: blur 10px", self.salida)

    def test_dos_y_donts(self):
        self.assertIn("- No: neon.", self.salida)
        self.assertIn("- No: hex sueltos.", self.salida)
        self.assertIn("- Una vez: borde vivo — solo al abrir.", self.salida)
        self.assertIn("- No copiado: logo de terceros.", self.salida)

    def test_prompt_14_lineas_y_sin_prompt(self):
        self.assertIn("linea no vacia de prueba 14", self.salida)
        self.assertNotIn("linea no vacia de prueba 15", self.salida)
        self.assertIn("## 9. Agent Prompt Guide\n\nSin PROMPT.md", design_md(DNA))

    def test_determinista(self):
        self.assertEqual(design_md(DNA, PROMPT), self.salida)
        self.assertEqual(design_md(DNA), design_md(DNA))


class TestCafeReal(unittest.TestCase):
    """El ADN real de «cafe» sale con su hex y su prohibición."""

    def test_cafe_real(self):
        with open(os.path.join(RAIZ, "memory", "diseno", "adn", "cafe", "dna.json"),
                  encoding="utf-8") as fp:
            texto = design_md(json.load(fp))
        self.assertIn("#FDF7EA", texto)
        self.assertIn("terracota sobre crema", texto)
        self.assertIn("Inferido, no medido: espacio.", texto)


class TestMain(unittest.TestCase):
    """CLI: sin --escribir no crea archivos; slug con '..' se rechaza."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.carpeta = os.path.join(self.tmp, "memory", "diseno", "adn", "mini")
        os.makedirs(self.carpeta)
        with open(os.path.join(self.carpeta, "dna.json"), "w", encoding="utf-8") as fp:
            json.dump(DNA, fp)
        with open(os.path.join(self.carpeta, "PROMPT.md"), "w", encoding="utf-8") as fp:
            fp.write(PROMPT)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_sin_escribir_no_crea_archivo(self):
        self.assertEqual(main(["--slug", "mini", "--raiz", self.tmp]), 0)
        self.assertFalse(os.path.exists(os.path.join(self.carpeta, "DESIGN.md")))

    def test_escribir_crea_junto_al_dna(self):
        self.assertEqual(main(["--slug", "mini", "--raiz", self.tmp, "--escribir"]), 0)
        ruta = os.path.join(self.carpeta, "DESIGN.md")
        self.assertTrue(os.path.isfile(ruta))
        with open(ruta, encoding="utf-8") as fp:
            contenido = fp.read()
        self.assertTrue(contenido.startswith("# Design System: Prueba Alfa\n"))
        self.assertIn("## 9. Agent Prompt Guide", contenido)

    def test_slug_con_puntos_se_rechaza(self):
        with self.assertRaises(SystemExit):
            main(["--slug", "../fuga", "--raiz", self.tmp])

    def test_sin_slug_ni_todos_se_rechaza(self):
        with self.assertRaises(SystemExit):
            main(["--raiz", self.tmp])

    def test_todos_salta_lo_que_no_es_adn(self):
        with open(os.path.join(self.tmp, "memory", "diseno", "adn", "esquema.json"),
                  "w", encoding="utf-8") as fp:
            fp.write("{}")
        self.assertEqual(main(["--todos", "--raiz", self.tmp, "--escribir"]), 0)
        self.assertTrue(os.path.isfile(os.path.join(self.carpeta, "DESIGN.md")))


if __name__ == "__main__":
    unittest.main()
