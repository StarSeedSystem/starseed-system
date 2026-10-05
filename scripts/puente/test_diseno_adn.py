"""Pruebas de diseno_adn con carpetas temporales."""

import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from diseno_adn import (FRASE_FINAL, TOPE_PROMPT, cargar_dna, cmd_capturar,
                        construir_prompt, ejecutar_pruebas, main, validar_dna)


def dna_sano():
    return {
        "alma": {"una_linea": "Sobrio, tactil, cercano."},
        "paleta": [
            {"rol": "fondo", "hex": "#101010", "nombre": "tinta de noche", "cobertura": 70},
            {"rol": "texto", "hex": "#f2f2f2", "nombre": "hueso pulido", "cobertura": 25},
            {"rol": "acento", "hex": "#c44569", "nombre": "ciruela polvorienta", "cobertura": 5},
        ],
        "tipo": {"familias": [
            {"nombre": "Display", "rol": "titular", "fallback": "serif"},
            {"nombre": "Cuerpo", "rol": "cuerpo", "fallback": "sans-serif"},
        ]},
        "firmas": [{"jugada": "j%d" % i, "como": "8x el cuerpo"}
                   for i in range(4)],
        "jugada_rara": {"que": "numero cortado por el borde",
                        "como": "mitad fuera", "por_que": "tension"},
        "prohibiciones": ["nunca centrar", "sin sombras", "sin gradientes",
                          "sin iconos", "nada en mayusculas"],
        "pruebas": [{"id": "p%d" % i, "comprobacion": "c%d" % i,
                     "fallo": "f%d" % i, "auto": i % 2 == 0}
                    for i in range(8)],
        "arquetipos": [{"id": "heroe", "funcion": "abrir"}],
    }


def carpeta_adn(tmp, dna, con_imagen=True):
    os.makedirs(os.path.join(tmp, "referencia"), exist_ok=True)
    if con_imagen:
        with open(os.path.join(tmp, "referencia", "original.png"), "wb") as f:
            f.write(b"\x89PNG demo")
    with open(os.path.join(tmp, "dna.json"), "w", encoding="utf-8") as f:
        json.dump(dna, f, ensure_ascii=False)
    return tmp


class TestValidar(unittest.TestCase):
    def test_adn_sano_sin_errores(self):
        self.assertEqual(validar_dna(dna_sano()), [])

    def test_cuentas_minimas(self):
        dna = dna_sano()
        dna["firmas"] = dna["firmas"][:2]
        dna["prohibiciones"] = dna["prohibiciones"][:3]
        dna["pruebas"] = dna["pruebas"][:5]
        dna["jugada_rara"] = {}
        errores = validar_dna(dna)
        self.assertEqual(len(errores), 4)
        self.assertTrue(any("firmas" in e for e in errores))
        self.assertTrue(any("jugada_rara" in e for e in errores))

    def test_cobertura_fuera_de_banda(self):
        dna = dna_sano()
        dna["paleta"][0]["cobertura"] = 50
        self.assertTrue(any("cobertura" in e for e in validar_dna(dna)))

    def test_nombre_tecnico_y_fallback(self):
        dna = dna_sano()
        dna["paleta"][2]["nombre"] = "accent-500"
        dna["tipo"]["familias"][1]["fallback"] = ""
        errores = validar_dna(dna)
        self.assertTrue(any("accent-500" in e for e in errores))
        self.assertTrue(any("fallback" in e for e in errores))


class TestCompilar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_orden_y_frase_final(self):
        carpeta = carpeta_adn(os.path.join(self.tmp, "estilo"), dna_sano())
        texto = construir_prompt(carpeta, cargar_dna(carpeta))
        pos = {
            "imagen": texto.index("referencia/original.png"),
            "alma": texto.index("Sobrio, tactil"),
            "rara": texto.index("La jugada rara"),
            "firmas": texto.index("Firmas"),
            "prohib": texto.index("Prohibido"),
            "paleta": texto.index("Paleta por cobertura"),
            "arq": texto.index("Arquetipos"),
            "auto": texto.index("Autocomprobacion"),
        }
        orden = sorted(pos, key=pos.get)
        self.assertEqual(orden, ["imagen", "alma", "rara", "firmas",
                                 "prohib", "paleta", "arq", "auto"])
        self.assertTrue(texto.rstrip().endswith(FRASE_FINAL))
        self.assertLessEqual(len(texto.encode("utf-8")), TOPE_PROMPT)

    def test_compilar_falla_si_supera_el_tope(self):
        dna = dna_sano()
        dna["firmas"] = [{"jugada": "j%d" % i, "como": "x" * 300}
                         for i in range(9)]
        carpeta = carpeta_adn(os.path.join(self.tmp, "estilo"), dna)
        codigo = main(["compilar", carpeta])
        self.assertEqual(codigo, 1)
        self.assertFalse(os.path.exists(os.path.join(carpeta, "PROMPT.md")))

    def test_sin_imagen_no_hay_prompt(self):
        carpeta = carpeta_adn(os.path.join(self.tmp, "estilo"),
                              dna_sano(), con_imagen=False)
        codigo = main(["compilar", carpeta])
        self.assertEqual(codigo, 1)


class TestComprobar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _carpeta_con_check(self, script):
        carpeta = os.path.join(self.tmp, "estilo")
        carpeta_adn(carpeta, dna_sano())
        with open(os.path.join(carpeta, "check.py"), "w", encoding="utf-8") as f:
            f.write(script)
        metricas = os.path.join(self.tmp, "metricas.json")
        with open(metricas, "w", encoding="utf-8") as f:
            json.dump({"ancho": 1080, "acento_pct": 3.0}, f)
        return carpeta, metricas

    def test_todo_aprobado(self):
        carpeta, metricas = self._carpeta_con_check(
            "import json, sys\n"
            "m = json.load(sys.stdin)\n"
            "print('acento: aprobado' if m['acento_pct'] < 8 else 'acento: suspenso')\n"
            "print('ancho: aprobado')\n"
        )
        aprobado, res = ejecutar_pruebas(carpeta, {"ancho": 1080, "acento_pct": 3.0})
        self.assertTrue(aprobado)
        self.assertEqual(res, {"acento": True, "ancho": True})
        self.assertEqual(main(["comprobar", carpeta, "--metricas", metricas]), 0)

    def test_una_prueba_suspendida_tumba_el_conjunto(self):
        carpeta, metricas = self._carpeta_con_check(
            "import json, sys\n"
            "json.load(sys.stdin)\n"
            "print('acento: suspenso')\n"
            "print('ancho: aprobado')\n"
            "sys.exit(1)\n"
        )
        aprobado, res = ejecutar_pruebas(carpeta, {"ancho": 1080})
        self.assertFalse(aprobado)
        self.assertFalse(res["acento"])
        self.assertEqual(main(["comprobar", carpeta, "--metricas", metricas]), 1)


class TestCapturar(unittest.TestCase):
    def test_crea_el_esqueleto_con_la_captura(self):
        tmp = tempfile.mkdtemp()
        try:
            captura = os.path.join(tmp, "Estilo Nuevo.png")
            with open(captura, "wb") as f:
                f.write(b"\x89PNG demo")
            base = os.path.join(tmp, "adn")
            os.makedirs(base)
            destino = cmd_capturar(captura, base_adn=base)
            self.assertTrue(destino.endswith("estilo-nuevo"))
            self.assertTrue(os.path.isfile(
                os.path.join(destino, "referencia", "Estilo Nuevo.png")))
            dna = cargar_dna(destino)
            self.assertIn("jugada_rara", dna)
            self.assertEqual(dna["meta"]["slug"], "estilo-nuevo")
            self.assertTrue(os.path.isdir(os.path.join(destino, "ejemplo")))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()