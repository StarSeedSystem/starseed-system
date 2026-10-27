"""Pruebas de diseno_adn_a_design_md (contrato DSN1025C, pytest/unittest, sin red)."""

import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from diseno_adn_a_design_md import (
    LINEAS_PROMPT,
    SIN_DATOS,
    SIN_PROMPT,
    TITULOS,
    design_md,
    main,
)

RAIZ_REPO = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def dna_ejemplo():
    return {
        "meta": {
            "nombre": "Contexto Prueba", "slug": "prueba",
            "fuentes": ["memory/diseno/identidades.md"],
            "fecha": "2026-10-25", "medio_origen": "",
            "no_copiado": ["logo de Acme"],
        },
        "alma": {
            "una_linea": "Sobrio, centrado, sin adornos.",
            "adjetivos": ["centrado", "cálido"], "linaje": "Prueba",
            "distancia_lectura": "0.4 m",
            "energia": {"densidad": 4, "variacion": 4, "contraste": 5,
                        "calidez": 6},
        },
        "paleta": [
            {"rol": "fondo", "hex": "#FFEEDD", "nombre": "crema de la tarde",
             "cobertura": 60, "prohibido": []},
            {"rol": "tinta", "hex": "#223344", "nombre": "carbón mojado",
             "cobertura": 40, "prohibido": []},
        ],
        "tipo": {"familias": [
            {"rol": "titular", "nombre": "Fraunces",
             "fallback": "Georgia, serif"},
        ]},
        "firmas": [
            {"jugada": "tarjeta de pergamino", "como": "opacidad 0.9"},
            {"jugada": "botón oro fundido", "como": "radio 12px"},
            {"jugada": "respiración orgánica", "como": "220 ms ease"},
        ],
        "jugada_rara": {
            "que": "curva del bosque en el borde", "como": "1 vez",
            "por_que": "calidez sin saturar",
        },
        "prohibiciones": ["centrar todo", "sombras suaves", "degradados",
                          "iconos emoji", "mayúsculas de más"],
        "pruebas": [{"id": "p1", "comprobacion": "fondo >40%", "auto": True}],
        "inferido": ["espacio"],
    }


class TestDesignMd(unittest.TestCase):
    def setUp(self):
        self.texto = design_md(dna_ejemplo())

    def test_nueve_titulos_en_orden(self):
        hallados = [l for l in self.texto.splitlines() if l.startswith("## ")]
        self.assertEqual(hallados, TITULOS)

    def test_hex_de_la_paleta(self):
        self.assertIn("`#FFEEDD`", self.texto)
        self.assertIn("`#223344`", self.texto)
        self.assertIn("**crema de la tarde**", self.texto)

    def test_sin_datos_donde_falta(self):
        self.assertIn("Pesos: %s." % SIN_DATOS, self.texto)
        self.assertIn("Pasos: %s." % SIN_DATOS, self.texto)
        lineas = [l.strip() for l in self.texto.splitlines() if l.strip()]
        for titulo in (TITULOS[4], TITULOS[5], TITULOS[7]):
            self.assertEqual(lineas[lineas.index(titulo) + 1], SIN_DATOS)
        self.assertEqual(lineas[lineas.index(TITULOS[8]) + 1], SIN_PROMPT)

    def test_inferido_marcado(self):
        self.assertIn("Inferido, no medido: espacio.", self.texto)
        self.assertIn("Linaje: Prueba.", self.texto)

    def test_prohibiciones_jugada_rara_y_no_copiado(self):
        self.assertIn("No: centrar todo.", self.texto)
        self.assertIn("Una vez: curva del bosque en el borde", self.texto)
        self.assertIn("No copiado: logo de Acme.", self.texto)

    def test_prompt_recortado_a_14_lineas(self):
        muchas = "\n".join("línea %d" % i for i in range(1, 21))
        texto = design_md(dna_ejemplo(), muchas)
        cuerpo = (texto.split("```text")[1].split("```")[0]
                  .strip("\n").splitlines())
        self.assertEqual(len(cuerpo), LINEAS_PROMPT)
        self.assertEqual(cuerpo[0], "línea 1")

    def test_sin_prompt(self):
        self.assertIn(SIN_PROMPT, design_md(dna_ejemplo(), ""))

    def test_determinista(self):
        otra = design_md(dna_ejemplo(), "hola\n\n\nmundo")
        self.assertEqual(otra, design_md(dna_ejemplo(), "hola\n\n\nmundo"))


class TestCafeReal(unittest.TestCase):
    def test_dna_real_cafe(self):
        carpeta = os.path.join(RAIZ_REPO, "memory", "diseno", "adn", "cafe")
        with open(os.path.join(carpeta, "dna.json"), encoding="utf-8") as f:
            dna = json.load(f)
        ruta_prompt = os.path.join(carpeta, "PROMPT.md")
        prompt_md = ""
        if os.path.isfile(ruta_prompt):
            with open(ruta_prompt, encoding="utf-8") as f:
                prompt_md = f.read()
        texto = design_md(dna, prompt_md)
        self.assertIn("#FDF7EA", texto)
        self.assertIn("terracota sobre crema", texto)
        self.assertIn(
            "Generado desde memory/diseno/adn/cafe/dna.json", texto)
        self.assertIn("# Design System: StarSeed Cafe", texto)
        self.assertIn("Pesos: %s." % SIN_DATOS, texto)


class TestMain(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        base = os.path.join(self.tmp, "memory", "diseno", "adn", "prueba")
        os.makedirs(base)
        with open(os.path.join(base, "dna.json"), "w", encoding="utf-8") as f:
            json.dump(dna_ejemplo(), f, ensure_ascii=False)

    def _ejecutar(self, argv):
        salida, errores = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(salida), \
                contextlib.redirect_stderr(errores):
            codigo = main(argv)
        return codigo, salida.getvalue(), errores.getvalue()

    def test_sin_escribir_no_crea_archivos(self):
        codigo, salida, _ = self._ejecutar(
            ["--slug", "prueba", "--raiz", self.tmp])
        self.assertEqual(codigo, 0)
        self.assertIn("# Design System: Contexto Prueba", salida)
        self.assertFalse(os.path.exists(os.path.join(
            self.tmp, "memory", "diseno", "adn", "prueba", "DESIGN.md")))

    def test_con_escribir_crea_junto_al_dna(self):
        codigo, _, _ = self._ejecutar(
            ["--slug", "prueba", "--raiz", self.tmp, "--escribir"])
        self.assertEqual(codigo, 0)
        destino = os.path.join(
            self.tmp, "memory", "diseno", "adn", "prueba", "DESIGN.md")
        with open(destino, encoding="utf-8") as f:
            escrito = f.read()
        self.assertEqual(escrito, design_md(dna_ejemplo(), ""))
        self.assertIn("## 9. Agent Prompt Guide", escrito)

    def test_slug_con_puntos_rechazado(self):
        for malo in ("../cafe", "..", "a/b"):
            codigo, _, errores = self._ejecutar(
                ["--slug", malo, "--raiz", self.tmp])
            self.assertEqual(codigo, 1, malo)
            self.assertIn("no válido", errores)
        self.assertFalse(os.path.exists(os.path.join(
            self.tmp, "memory", "diseno", "adn", "prueba", "DESIGN.md")))

    def test_slug_inexistente_falla(self):
        codigo, _, errores = self._ejecutar(
            ["--slug", "no-existe", "--raiz", self.tmp])
        self.assertEqual(codigo, 1)
        self.assertIn("falta dna.json", errores)

    def test_todos_sin_escribir(self):
        base = os.path.join(self.tmp, "memory", "diseno", "adn", "otro")
        os.makedirs(base)
        otro = dna_ejemplo()
        otro["meta"] = dict(otro["meta"], slug="otro", nombre="Otro")
        with open(os.path.join(base, "dna.json"), "w", encoding="utf-8") as f:
            json.dump(otro, f, ensure_ascii=False)
        codigo, salida, _ = self._ejecutar(["--todos", "--raiz", self.tmp])
        self.assertEqual(codigo, 0)
        self.assertIn("===== otro =====", salida)
        self.assertIn("===== prueba =====", salida)
        self.assertFalse(os.path.exists(os.path.join(
            base, "DESIGN.md")))

    def test_todos_con_escribir(self):
        base = os.path.join(self.tmp, "memory", "diseno", "adn", "otro")
        os.makedirs(base)
        with open(os.path.join(base, "dna.json"), "w", encoding="utf-8") as f:
            json.dump(dna_ejemplo(), f, ensure_ascii=False)
        codigo, _, _ = self._ejecutar(
            ["--todos", "--raiz", self.tmp, "--escribir"])
        self.assertEqual(codigo, 0)
        self.assertTrue(os.path.isfile(
            os.path.join(base, "DESIGN.md")))
        self.assertTrue(os.path.isfile(os.path.join(
            self.tmp, "memory", "diseno", "adn", "prueba", "DESIGN.md")))

    def test_raiz_por_defecto_es_la_del_repo(self):
        codigo, salida, _ = self._ejecutar(["--slug", "cafe"])
        self.assertEqual(codigo, 0)
        self.assertIn("#FDF7EA", salida)


if __name__ == "__main__":
    unittest.main()
