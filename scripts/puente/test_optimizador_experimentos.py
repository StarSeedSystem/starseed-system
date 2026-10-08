# -*- coding: utf-8 -*-
"""test_optimizador_experimentos · pruebas de §6 del director optimizador.

unittest, dobles simples, sin red ni archivos reales: el JSONL va a rutas
temporales. Cubre los tres veredictos, el sentido de la métrica, la lectura
con una línea rota y que cerrar avisa a Jev con el acierto correcto.
"""

import json
import os
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import importlib.util
_ruta_mod = os.path.join(DIRECTORIO, "optimizador_experimentos.py")
_spec = importlib.util.spec_from_file_location("optimizador_experimentos", _ruta_mod)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

AHORA = 1_700_000_000


def _exp(**cambios):
    base = _mod.abrir("subir_trabajadores", "trabajadores", 2, 3,
                      "integradas_h", 4.0, "jev-42", AHORA)
    base.update(cambios)
    return base


class AbrirTest(unittest.TestCase):
    def test_abrir_devuelve_registro_abierto_completo(self):
        exp = _mod.abrir("subir_trabajadores", "trabajadores", 2, 3,
                         "integradas_h", 4.0, "jev-42", AHORA)
        self.assertEqual(exp["estado"], "abierto")
        self.assertEqual(exp["ventana_min"], 120)
        self.assertEqual(exp["accion"], "subir_trabajadores")
        self.assertEqual(exp["perilla"], "trabajadores")
        self.assertEqual(exp["jev_exp"], "jev-42")
        self.assertIsNone(exp["cierre"])
        self.assertTrue(exp["id"].startswith("exp-"))


class EvaluarTest(unittest.TestCase):
    def test_esperar_dentro_de_la_ventana(self):
        exp = _exp()
        self.assertEqual(_mod.evaluar(exp, 99.0, AHORA + 3600), "esperar")

    def test_confirmar_si_no_cambio(self):
        exp = _exp()
        fuera = AHORA + 121 * 60
        self.assertEqual(_mod.evaluar(exp, 4.0, fuera), "confirmar")

    def test_confirmar_con_mas_de_diez_por_ciento(self):
        exp = _exp()  # base 4.0, Integradas/h "mas"
        fuera = AHORA + 121 * 60
        self.assertEqual(_mod.evaluar(exp, 4.6, fuera), "confirmar")

    def test_deshacer_si_empeora(self):
        exp = _exp()
        fuera = AHORA + 121 * 60
        self.assertEqual(_mod.evaluar(exp, 3.5, fuera), "deshacer")

    def test_confirmar_si_no_empeora_aunque_mejore_poco(self):
        exp = _exp()
        fuera = AHORA + 121 * 60
        self.assertEqual(_mod.evaluar(exp, 4.1, fuera), "confirmar")

    def test_sentido_menos_es_mejor_invierte(self):
        # segundos_mediana es "menos es mejor": bajar base→actual confirma
        exp = _exp(metrica_objetivo="segundos_mediana", base=300.0)
        fuera = AHORA + 121 * 60
        self.assertEqual(_mod.evaluar(exp, 250.0, fuera), "confirmar")
        self.assertEqual(_mod.evaluar(exp, 400.0, fuera), "deshacer")

    def test_esperar_si_falta_la_metrica(self):
        exp = _exp(base=None)
        self.assertEqual(_mod.evaluar(exp, 5.0, AHORA + 121 * 60), "esperar")


class ArchivoTest(unittest.TestCase):
    def test_abiertos_ignora_linea_rota(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "experimentos.jsonl")
            e1 = _exp()
            e2 = _mod.cerrar(_exp(accion="otra"), "confirmar", AHORA, None)
            with open(ruta, "w", encoding="utf-8") as f:
                f.write(json.dumps(e1, ensure_ascii=False) + "\n")
                f.write("{esto no es json\n")
                f.write("\n")
                f.write(json.dumps(e2, ensure_ascii=False) + "\n")
            vivos = _mod.abiertos(ruta)
            self.assertEqual(len(vivos), 1)
            self.assertEqual(vivos[0]["id"], e1["id"])

    def test_abiertos_sin_archivo_devuelve_vacio(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "no-existe", "experimentos.jsonl")
            self.assertEqual(_mod.abiertos(ruta), [])

    def test_anotar_crea_carpeta_y_append(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "sub", "experimentos.jsonl")
            e1 = _exp()
            e2 = _exp(accion="bajar_trabajadores")
            _mod.anotar(ruta, e1)
            _mod.anotar(ruta, e2)
            with open(ruta, "r", encoding="utf-8") as f:
                lineas = [l for l in f.read().splitlines() if l.strip()]
            self.assertEqual(len(lineas), 2)
            self.assertEqual(json.loads(lineas[0])["id"], e1["id"])


class CerrarTest(unittest.TestCase):
    def test_cerrar_confirmar_llama_jev_con_si(self):
        llamadas = []
        exp = _exp()
        cerrado = _mod.cerrar(exp, "confirmar", AHORA + 8000,
                              lambda jev, acierto: llamadas.append((jev, acierto)))
        self.assertEqual(cerrado["estado"], "confirmado")
        self.assertEqual(cerrado["cierre"]["veredicto"], "confirmar")
        self.assertEqual(llamadas, [("jev-42", "si")])
        self.assertEqual(exp["estado"], "abierto")  # no muta el original

    def test_cerrar_deshacer_llama_jev_con_no(self):
        llamadas = []
        cerrado = _mod.cerrar(_exp(), "deshacer", AHORA + 8000,
                              lambda jev, acierto: llamadas.append((jev, acierto)))
        self.assertEqual(cerrado["estado"], "deshecho")
        self.assertEqual(llamadas, [("jev-42", "no")])

    def test_cerrar_veredicto_desconocido_falla(self):
        with self.assertRaises(ValueError):
            _mod.cerrar(_exp(), "esperar", AHORA, None)


if __name__ == "__main__":
    unittest.main()
