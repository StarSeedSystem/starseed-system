"""
Pruebas de diseno_adn_a_design_md.py (DSN1025C · lib-awesome-design-md).

Puras y sin red: dict de ejemplo, el ADN real del Café y la CLI en una carpeta
temporal. Compatibles con pytest (puerta del enjambre) y con
«python3 -m unittest discover -s scripts/puente».
"""

import contextlib
import io
import json
import os
import shutil
import tempfile
import unittest

from diseno_adn_a_design_md import (
    CABECERAS,
    SIN_DATOS,
    design_md,
    main,
    validar_slug,
)

ADN_PRUEBA = {
    "meta": {
        "nombre": "Contexto de prueba",
        "slug": "prueba",
        "fuentes": ["insitu"],
        "fecha": "2026-10-25",
        "no_copiado": ["logo de la marca rival"],
    },
    "alma": {
        "una_linea": "Pergamino cálido con terracota",
        "adjetivos": ["cálido", "casero"],
        "linaje": "Café de prueba",
    },
    "paleta": [
        {"rol": "fondo", "hex": "#FDF7EA", "nombre": "pergamino",
         "cobertura": 50, "prohibido": []},
        {"rol": "primario", "hex": "#C05C3B", "nombre": "terracota",
         "cobertura": 15, "prohibido": ["brillo neón"]},
    ],
    "tipo": {"familias": [{"rol": "titular", "nombre": "Fraunces",
                           "fallback": "Georgia"}]},
    "firmas": [{"jugada": "cristal cálido", "como": "opacidad 0.9"}],
    "espacio": None,
    "superficie": None,
    "jugada_rara": {"que": "curva del bosque", "como": "1 vez",
                    "por_que": "calidez"},
    "prohibiciones": ["terracota sobre crema", "neón", "granos de foto"],
    "inferido": ["espacio"],
}

PROMPT_LARGO = "\n".join("linea %d" % i for i in range(1, 17))
RAIZ_REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")


class TestDesignMd(unittest.TestCase):
    """El texto numerado de Stitch a partir de un dict del ADN."""

    def test_nueve_titulos_en_orden(self):
        posi = [self._texto().index(t) for t in CABECERAS]
        self.assertEqual(posi, sorted(posi))

    def _texto(self):
        return design_md(ADN_PRUEBA, "Referencia del contexto.\n")

    def test_hex_y_prohibido_de_la_paleta(self):
        texto = self._texto()
        self.assertIn("*   **pergamino** — `#FDF7EA`", texto)
        self.assertIn("`#C05C3B`", texto)
        self.assertIn("prohibido: brillo neón", texto)

    def test_sin_datos_donde_falta(self):
        texto = self._texto()
        self.assertIn("Pesos: %s." % SIN_DATOS, texto)
        self.assertIn("Pasos: %s." % SIN_DATOS, texto)
        secciones = dict(zip(CABECERAS, self._cuerpos(texto)))
        self.assertEqual(secciones["## 5. Layout Principles"],
                         SIN_DATOS)
        self.assertEqual(secciones["## 6. Depth & Elevation"], SIN_DATOS)
        self.assertEqual(secciones["## 8. Responsive Behavior"], SIN_DATOS)

    def _cuerpos(self, texto):
        trozos = texto.split("\n\n")
        claves = [t for t in trozos if t.startswith("## ")]
        return [c.split("\n", 1)[1] for c in claves]

    def test_comentario_y_no_copiado(self):
        texto = self._texto()
        self.assertIn(
            "<!-- Generado desde memory/diseno/adn/prueba/dna.json "
            "(fecha 2026-10-25). No editar a mano. -->", texto)
        self.assertIn("No copiado: logo de la marca rival.", texto)
        self.assertIn("Inferido, no medido: espacio.", texto)


class TestAdnReal(unittest.TestCase):
    """El dna.json real del Café, y la pureza determinista."""

    def _cafe(self):
        with open(os.path.join(RAIZ_REPO, "memory", "diseno", "adn", "cafe",
                               "dna.json"), encoding="utf-8") as f:
            return json.load(f)

    def test_cafe_real(self):
        texto = design_md(self._cafe())
        self.assertTrue(texto.startswith("# Design System: StarSeed Cafe"))
        self.assertIn("#FDF7EA", texto)
        self.assertIn("terracota sobre crema", texto)

    def test_dos_llamadas_mismo_texto(self):
        self.assertEqual(design_md(ADN_PRUEBA, PROMPT_LARGO),
                         design_md(ADN_PRUEBA, PROMPT_LARGO))


class TestGuiaPrompt(unittest.TestCase):
    """§9: primeras 14 líneas no vacías, o «Sin PROMPT.md»."""

    def test_catorce_lineas_no_vacias(self):
        cuerpo = design_md(ADN_PRUEBA, PROMPT_LARGO).split(
            CABECERAS[8], 1)[1].strip()
        self.assertEqual([l for l in cuerpo.splitlines() if l.strip()],
                         ["linea %d" % i for i in range(1, 15)])

    def test_sin_prompt(self):
        self.assertIn("Sin PROMPT.md", design_md(ADN_PRUEBA))
        self.assertIn("Sin PROMPT.md", design_md(ADN_PRUEBA, "\n  \n"))


class TestCli(unittest.TestCase):
    """--slug/--todos/--raiz/--escribir sobre una carpeta temporal."""

    def _montar(self, tmp):
        base = os.path.join(tmp, "memory", "diseno", "adn", "prueba")
        os.makedirs(base)
        with open(os.path.join(base, "dna.json"), "w",
                  encoding="utf-8") as f:
            json.dump(ADN_PRUEBA, f, ensure_ascii=False)
        with open(os.path.join(base, "PROMPT.md"), "w",
                  encoding="utf-8") as f:
            f.write("Referencia del contexto.\n")
        return base

    def test_main_sin_escribir_no_crea_archivos(self):
        tmp = tempfile.mkdtemp()
        try:
            base = self._montar(tmp)
            buffer = io.StringIO()
            with contextlib.redirect_stdout(buffer):
                self.assertEqual(
                    main(["--slug", "prueba", "--raiz", tmp]), 0)
                self.assertIn("# Design System: Contexto de prueba",
                              buffer.getvalue())
            self.assertFalse(
                os.path.exists(os.path.join(base, "DESIGN.md")))
        finally:
            shutil.rmtree(tmp)

    def test_main_escribe_design_md(self):
        tmp = tempfile.mkdtemp()
        try:
            base = self._montar(tmp)
            buffer = io.StringIO()
            with contextlib.redirect_stdout(buffer):
                self.assertEqual(
                    main(["--slug", "prueba", "--raiz", tmp,
                          "--escribir"]), 0)
            destino = os.path.join(base, "DESIGN.md")
            with open(destino, encoding="utf-8") as f:
                self.assertEqual(f.read(), design_md(ADN_PRUEBA,
                                                     "Referencia del contexto.\n"))
        finally:
            shutil.rmtree(tmp)

    def test_main_todos_y_slug_rechazado(self):
        tmp = tempfile.mkdtemp()
        try:
            base = self._montar(tmp)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(
                    main(["--todos", "--raiz", tmp, "--escribir"]), 0)
            self.assertTrue(
                os.path.isfile(os.path.join(base, "DESIGN.md")))
            buffer = io.StringIO()
            with contextlib.redirect_stderr(buffer):
                self.assertEqual(
                    main(["--slug", "../prueba", "--raiz", tmp]), 1)
            self.assertIn("slug inválido", buffer.getvalue())
        finally:
            shutil.rmtree(tmp)

    def test_validar_slug(self):
        self.assertEqual(validar_slug("cafe"), "cafe")
        with self.assertRaises(ValueError):
            validar_slug("..")
        with self.assertRaises(ValueError):
            validar_slug("Cafe")


if __name__ == "__main__":
    unittest.main()
