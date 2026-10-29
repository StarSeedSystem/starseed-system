# -*- coding: utf-8 -*-
"""Pruebas de la limpieza nativa sin JVM (INV1025H · architecture/repos-libreria-1025.md §3.4):
cada operación, huella con acentos, duplicados, `op` no soportada, entrada sin tocar,
la receta del alcance y la CLI. unittest puro, sin red ni pytest (el `import pytest`
a secas tumba la recogida donde ese python no lo tiene: test_extractor_web.py)."""
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest

_AQUI = os.path.dirname(os.path.abspath(__file__))
if _AQUI not in sys.path:
    sys.path.insert(0, _AQUI)

from limpieza_datos import (  # noqa: E402
    EXP_CORREO, EXP_MINUS, EXP_MAYUS, EXP_RECORTAR, EXP_TITULO, EXP_URL,
    aplicar, huella,
)

RAIZ = os.path.dirname(os.path.dirname(_AQUI))
RECETA_ALCANCE = os.path.join(RAIZ, "config", "recetas-limpieza", "alcance-objetivos-v1.json")


def receta(*ops, **extra):
    """Receta mínima válida (formato INV1025F) con las operaciones dadas."""
    r = {"datos": "publicos", "operaciones": list(ops)}
    r.update(extra)
    return r


def tt(columna, expresion):
    return {"op": "core/text-transform", "columnName": columna, "expression": expresion}


class PruebasOperaciones(unittest.TestCase):
    def test_recortar_y_caso(self):
        r = receta(tt("nombre", EXP_RECORTAR), tt("nombre", EXP_TITULO), tt("cat", EXP_MINUS), tt("cat", EXP_MAYUS))
        out = aplicar([{"nombre": "  matías   de  stefano ", "cat": "oNG"}], r)
        self.assertEqual(out["filas"][0]["nombre"], "Matías De Stefano")
        self.assertEqual(out["filas"][0]["cat"], "ONG")
        self.assertEqual([c["op"] for c in out["cambios"]], ["text-transform", "text-transform", "text-transform", "text-transform"])
        self.assertEqual(out["cambios"][0]["antes"], "  matías   de  stefano ")

    def test_url(self):
        r = receta(tt("enlaces", EXP_URL))
        filas = [
            {"enlaces": "http://Ejemplo.com/?utm_source=x&fbclid=y&r=1#premios "},
            {"enlaces": "   Ejemplo.com/1/ "},
        ]
        out = aplicar(filas, r)
        self.assertEqual(out["filas"][0]["enlaces"], "https://ejemplo.com?r=1")
        self.assertEqual(out["filas"][1]["enlaces"], "https://ejemplo.com/1")
        self.assertTrue(all(c["op"] == "text-transform" for c in out["cambios"]))

    def test_correo(self):
        r = receta(tt("correo", EXP_CORREO))
        out = aplicar([{"correo": " Matías@Ejemplo.COM "}, {"correo": "sin (arroba bien) explicita"}], r)
        self.assertEqual(out["filas"][0]["correo"], "matías@ejemplo.com")
        self.assertEqual(out["filas"][1]["correo"], "sin (arroba bien) explicita")
        marcas = [c for c in out["cambios"] if c["op"] == "correo-no-valido"]
        self.assertEqual(len(marcas), 1)
        self.assertEqual(marcas[0]["fila"], 1)
        self.assertEqual(marcas[0]["antes"], marcas[0]["despues"])

    def test_separar_unir_renombrar(self):
        r = receta(
            {"op": "core/column-split", "columnName": "enlaces", "separator": ","},
            {"op": "core/column-merge", "columnName": "enlaces 1", "secondColumnName": "obsoleto"},
            {"op": "core/column-rename", "oldColumnName": "enlaces 1", "newColumnName": "respaldo"},
        )
        out = aplicar([{"enlaces": "a.com,b.com,c.com", "obsoleto": " viejo.com "}], r)
        fila = out["filas"][0]
        self.assertEqual((fila["enlaces"], fila["respaldo"], sorted(fila)), ("a.com", "b.com viejo.com", ["enlaces", "enlaces 2", "respaldo"]))

    def test_quitar_filas_vacias_y_mass_edit(self):
        r = receta(
            {"op": "core/mass-edit", "columnName": "categoria", "edits": [{"from": "ONGs", "to": "ong"}]},
            {"op": "core/row-removal", "quitar": ["nombre", "enlaces"]},
        )
        filas = [{"nombre": "A", "enlaces": "", "categoria": "ONGs"}, {"nombre": "", "enlaces": "", "categoria": "ong"}, {"nombre": "B", "enlaces": "b.com", "categoria": "educación"}]
        out = aplicar(filas, r)
        self.assertEqual([f["nombre"] for f in out["filas"]], ["A", "B"])
        self.assertEqual(out["filas"][0]["categoria"], "ong")
        self.assertEqual(out["cambios"][0], {"fila": 0, "columna": "categoria", "antes": "ONGs", "despues": "ong", "op": "mass-edit"})


class PruebasHuellaYDuplicados(unittest.TestCase):
    def test_huella_con_acentos(self):
        self.assertEqual(huella("Ángel, Gómez-Pérez!"), huella("  gomez   angel  PEREZ"))
        self.assertEqual(huella("Órgano nº 25"), "25 n organo")

    def test_duplicados_por_huella(self):
        filas = [{"nombre": "Matías De Stefano", "enlaces": "a.com"}, {"nombre": "de stefano matias", "enlaces": "b.com"}, {"nombre": "Otra persona", "enlaces": "c.com"}]
        out = aplicar(filas, receta(deduplicar={"columna": "nombre", "modo": "huella"}))
        self.assertEqual(len(out["filas"]), 2)
        self.assertEqual(out["duplicados"], [[0, 1]])
        self.assertEqual(out["filas"][0]["enlaces"], "a.com")

    def test_deduplicar_fila_entera_si_no_hay_columna(self):
        out = aplicar([{"a": "x"}, {"a": "x"}], receta(deduplicar={}))
        self.assertEqual((len(out["filas"]), out["duplicados"]), (1, [[0, 1]]))

    def test_modo_desconocido(self):
        out = aplicar([], receta(deduplicar={"columna": "nombre", "modo": "exacta"}))
        self.assertTrue(any("deduplicar" in n for n in out["no_soportadas"]))


class PruebasReceta(unittest.TestCase):
    def test_op_no_soportada(self):
        out = aplicar([{"nombre": "x"}], receta({"op": "core/multivalued-cell-split", "columnName": "nombre", "keySeparator": ","}))
        self.assertEqual(out["filas"], [{"nombre": "x"}])
        self.assertTrue(any("multivalued-cell-split" in n and "usa OpenRefine" in n for n in out["no_soportadas"]))
        con_jython = aplicar([{"a": "x"}], receta(tt("a", "jython:os.remove(x)")))
        self.assertTrue(any("jython" in n and "usa OpenRefine" in n for n in con_jython["no_soportadas"]))
        self.assertEqual(con_jython["filas"], [{"a": "x"}])

    def test_receta_invalida(self):
        out = aplicar([{"a": "1"}], {"datos": "privados", "operaciones": []})
        self.assertEqual((out["filas"], out["cambios"]), ([], []))
        self.assertTrue(any("publicos" in n for n in out["no_soportadas"]))

    def test_entrada_sin_tocar(self):
        filas = [{"nombre": "  Matías  De Stefano ", "enlaces": "http://Ejemplo.com/?utm_source=x"}, {"nombre": "De Stefano, Matías", "enlaces": "b.com"}]
        copia = json.dumps(filas)
        out = aplicar(filas, receta(
            tt("nombre", EXP_RECORTAR), tt("enlaces", EXP_URL),
            deduplicar={"columna": "nombre", "modo": "huella"},
        ))
        self.assertEqual(json.dumps(filas), copia)
        self.assertEqual(len(out["filas"]), 1)
        self.assertEqual(out["filas"][0]["enlaces"], "https://ejemplo.com")

    def test_receta_del_alcance(self):
        with io.open(RECETA_ALCANCE, encoding="utf-8") as f:
            r = json.load(f)
        self.assertEqual(r["datos"], "publicos")
        self.assertTrue(r["operaciones"])
        entrada = [
            {"nombre": "  yo soy   españa ", "enlaces": "http://YoSoy.es/?utm_source=x#ver ", "categoria": "Educación", "correo": "hola@yosoy.es"},
            {"nombre": "espana yo soy", "enlaces": " ", "categoria": "ONGs", "correo": "no es un correo"},
            {"nombre": "", "enlaces": "", "categoria": "", "correo": ""},
        ]
        out = aplicar(entrada, r)
        self.assertEqual(out["filas"][0], {"nombre": "Yo Soy España", "enlaces": "https://yosoy.es", "categoria": "educación", "correo": "hola@yosoy.es"})
        self.assertEqual([f["nombre"] for f in out["filas"][1:]], [])
        self.assertTrue(any(c["op"] == "correo-no-valido" for c in out["cambios"]))
        self.assertFalse(out["no_soportadas"])


class PruebasCLI(unittest.TestCase):
    def test_cli(self):
        with tempfile.TemporaryDirectory() as t:
            receta_csv = os.path.join(t, "r.json")
            entrada_csv = os.path.join(t, "in.csv")
            salida_csv = os.path.join(t, "out.csv")
            with io.open(receta_csv, "w", encoding="utf-8") as f:
                json.dump({"datos": "publicos", "operaciones": [tt("nombre", EXP_RECORTAR)]}, f)
            with io.open(entrada_csv, "w", encoding="utf-8") as f:
                f.write("nombre\n  Ana   Pérez \n")
            hecho = subprocess.run(
                [sys.executable, os.path.join(_AQUI, "limpieza_datos.py"), "--receta", receta_csv, entrada_csv, "--salida", salida_csv],
                capture_output=True, text=True,
            )
            self.assertEqual(hecho.returncode, 0, hecho.stderr)
            with io.open(salida_csv, encoding="utf-8") as f:
                self.assertEqual(f.read(), "nombre\nAna Pérez\n")


if __name__ == "__main__":
    unittest.main()
