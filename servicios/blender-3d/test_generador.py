#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de barreras y generador de Blender (BLD1025D, contrato §4.2 y §4.3)."""
import ast
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import barreras as B
import generador as G

BASE = {"v": 1, "titulo": "Escena mínima", "calidad": "borrador", "ambito": "personal", "origen": "estudio", "quien": "persona",
        "escena": [{"op": "primitiva", "tipo": "cubo", "nombre": "cubo", "tam": 1}, {"op": "camara", "nombre": "cam", "ubicacion": [0, -5, 2], "mira_a": [0, 0, 0]}, {"op": "luz", "nombre": "sol", "tipo": "sol", "energia": 3}],
        "salidas": [{"tipo": "render_png", "ancho": 256, "alto": 256, "muestras": 8, "motor": "workbench"}]}


def copia(): return json.loads(json.dumps(BASE))
def con_escena(escena, salidas=None):
    t = copia(); t["escena"] = escena
    if salidas is not None: t["salidas"] = salidas
    return t


class ValidarTest(unittest.TestCase):
    def test_minimo(self):
        ok, t, motivos = B.validar_trabajo(copia()); self.assertTrue(ok, motivos)
        self.assertEqual([o["op"] for o in t["escena"]], ["primitiva", "camara", "luz"])
    def test_campos_desconocidos(self):
        self.assertFalse(B.validar_trabajo({**copia(), "extra": 1})[0])
        e = [{"op": "primitiva", "tipo": "cubo", "nombre": "c", "tam": 1, "peligro": True}]
        self.assertIn("campo desconocido: peligro", " ".join(B.validar_trabajo(con_escena(e))[2]))
    def test_numeros(self):
        for tam in (float("nan"), float("inf"), 0, True):
            self.assertTrue(B.validar_trabajo(con_escena([{"op": "primitiva", "tipo": "cubo", "nombre": "c", "tam": tam}]))[2], tam)
        e = [{"op": "primitiva", "tipo": "cubo", "nombre": "c", "tam": 1}, {"op": "transformar", "objeto": "c", "ubicacion": [1, 2]}]
        self.assertIn("vector de 3 números", " ".join(B.validar_trabajo(con_escena(e))[2]))
        malo = con_escena(copia()["escena"], [{"tipo": "render_png", "ancho": 256, "alto": 256, "muestras": 8.5, "motor": "workbench"}])
        self.assertIn("número entero", " ".join(B.validar_trabajo(malo)[2]))
    def test_topes_nombres_y_refs(self):
        e = [{"op": "primitiva", "tipo": "cubo", "nombre": "c%s" % i, "tam": 1} for i in range(257)]
        self.assertIn("demasiadas operaciones", " ".join(B.validar_trabajo(con_escena(e))[2]))
        dup = [{"op": "primitiva", "tipo": "cubo", "nombre": "a", "tam": 1}, {"op": "primitiva", "tipo": "esfera", "nombre": "a", "tam": 1}]
        self.assertIn("repetido", " ".join(B.validar_trabajo(con_escena(dup))[2]))
        self.assertIn("no existe", " ".join(B.validar_trabajo(con_escena([{"op": "material", "objeto": "fantasma"}]))[2]))
    def test_rutas_y_proximamente(self):
        for archivo in ("a/../b.glb", "/tmp/a.glb", "modelo.blend", "script.py"):
            self.assertIn("ruta relativa inválida", " ".join(B.validar_trabajo(con_escena([{"op": "importar", "archivo": archivo, "nombre": "imp"}]))[2]))
        m = " ".join(B.validar_trabajo(con_escena([{"op": "remallar", "objeto": "cubo"}]))[2])
        self.assertIn("próximamente", m); self.assertIn("servicios/taller-3d", m)
    def test_todas_las_operaciones_y_salidas(self):
        e = [{"op": "primitiva", "tipo": "cubo", "nombre": "base", "tam": 1}, {"op": "transformar", "objeto": "base", "ubicacion": [1, 0, 0], "rotacion": [0, 0, 45], "escala": [1, 1, 1]},
             {"op": "material", "objeto": "base", "color": [1, 0, 0, 1], "metalico": 0.5, "rugosidad": 0.3, "emision_color": [0, 0, 0, 1], "emision_fuerza": 0, "alfa": 1},
             {"op": "modificador", "objeto": "base", "tipo": "subdivision", "niveles": 2}, {"op": "texto3d", "nombre": "rotulo", "texto": "Hola, ñandú!", "extrusion": 0.2, "tam": 1},
             {"op": "camara", "nombre": "cam", "ubicacion": [0, -6, 2], "mira_a": [0, 0, 0], "lente_mm": 35, "ortografica": False},
             {"op": "luz", "nombre": "luz", "tipo": "area", "color": [1, 1, 1, 1], "energia": 100, "ubicacion": [0, 0, 5], "rotacion": [0, 0, 0]},
             {"op": "mundo", "color": [0, 0, 0, 1], "fuerza": 1}, {"op": "importar", "archivo": "modelo.glb", "nombre": "importado"},
             {"op": "animar", "objeto": "base", "propiedad": "ubicacion", "claves": [{"fotograma": 0, "valor": [0, 0, 0]}, {"fotograma": 24, "valor": [1, 0, 0]}], "interpolacion": "suave"}]
        s = [{"tipo": "render_png", "ancho": 256, "alto": 256, "muestras": 8, "motor": "workbench", "fondo_transparente": True},
             {"tipo": "render_mp4", "ancho": 256, "alto": 256, "fps": 24, "desde": 0, "hasta": 23, "muestras": 8, "motor": "cycles-cpu"},
             {"tipo": "render_exr", "ancho": 256, "alto": 256, "muestras": 8, "motor": "eevee"},
             {"tipo": "exportar_glb", "objetos": ["base", "cam"], "y_arriba": True, "aplicar_modificadores": True, "draco": False, "meshopt": False}]
        ok, t, motivos = B.validar_trabajo(con_escena(e, s)); self.assertTrue(ok, motivos)
        self.assertEqual((len(t["escena"]), len(t["salidas"])), (10, 4))


class InyeccionTest(unittest.TestCase):
    def test_nombres_y_textos(self):
        for nombre in ('"); import os; os.system("x") #', "hola\nimport os", "con espacio", "ñandú"):
            self.assertFalse(B.validar_trabajo(con_escena([{"op": "primitiva", "tipo": "cubo", "nombre": nombre, "tam": 1}]))[0], nombre)
        for texto in ('"); import os; os.system("x") #', "hola\nimport os", "comillas \" dobles", "ruta\\invertida", "emoji 😈"):
            self.assertFalse(B.validar_trabajo(con_escena([{"op": "texto3d", "nombre": "t", "texto": texto, "extrusion": 0.1, "tam": 1}]))[0], texto)
        t = con_escena([{"op": "texto3d", "nombre": "t", "texto": "ñandú '); import os", "extrusion": 0.1, "tam": 1}])
        ok, limpio, motivos = B.validar_trabajo(t); self.assertTrue(ok, motivos)
        src = G.generar_guion(t, "5.2.0"); self.assertEqual(B.verificar_guion(src), [])
        arbol = ast.parse(src); self.assertEqual(len(arbol.body), 4 + 1 + 1)
        self.assertNotIn("os", [n.id for n in ast.walk(arbol) if isinstance(n, ast.Name)])


class VerificadorTest(unittest.TestCase):
    PRE = 'import sys\nsys.path.insert(0, ".")\nimport ops_starseed as o\n'
    def test_rechaza_manuscritos(self):
        for malo in ('import os', 'exec("x")', 'open("x")', '__import__("os")', 'getattr(o, "x")', 'import subprocess', 'o.iniciar().__class__', 'x = 1', 'lambda: 1', 'f"{1}"'):
            self.assertTrue(B.verificar_guion(self.PRE + malo + "\n"), malo)
    def test_acepta_preambulo_y_lista_blanca(self):
        src = self.PRE + 'import bpy\nimport math\nimport json\no.iniciar()\no.render_png(ancho=256, alto=256, muestras=8, motor="workbench")\n'
        self.assertEqual(B.verificar_guion(src), [])
        v = B.cargar_vocabulario(); esperado = {n for n, d in v["operaciones"].items() if d.get("estado") == "listo"} | set(v["salidas"]) | {"iniciar"}
        self.assertEqual(B.lista_blanca(v), esperado); self.assertNotIn("remallar", esperado)


class GeneradorTest(unittest.TestCase):
    def test_guion_exacto_y_determinista(self):
        esperado = "\n".join([
            "# StarSeed OS · Blender 5.2.0 · vocabulario v1", "# Generado desde un Trabajo3D validado. No editar a mano.",
            "import sys", 'sys.path.insert(0, ".")', "import ops_starseed as o", "o.iniciar()",
            'o.primitiva(tipo="cubo", nombre="cubo", tam=1)',
            'o.camara(nombre="cam", ubicacion=[0, -5, 2], mira_a=[0, 0, 0], lente_mm=50, ortografica=False)',
            'o.luz(nombre="sol", tipo="sol", color=[1, 1, 1, 1], energia=3, ubicacion=[0, 0, 0], rotacion=[0, 0, 0])',
            'o.render_png(ancho=256, alto=256, muestras=8, motor="workbench", fondo_transparente=False, ruta="salidas/salida-1.png")',
        ]) + "\n"
        src = G.generar_guion(copia(), "5.2.0")
        self.assertEqual(src, esperado)
        self.assertEqual(G.sha256_guion(src), G.sha256_guion(G.generar_guion(copia(), "5.2.0")))
        self.assertEqual(len(G.sha256_guion(src)), 64)
    def test_animar_usa_listas_constantes(self):
        t = con_escena([{"op": "primitiva", "tipo": "cubo", "nombre": "c", "tam": 1}, {"op": "animar", "objeto": "c", "propiedad": "ubicacion", "claves": [{"fotograma": 0, "valor": [0, 0, 0]}]}])
        src = G.generar_guion(t, "5.2.0")
        self.assertIn('claves=[[0, [0, 0, 0]]]', src); self.assertEqual(B.verificar_guion(src), [])
    def test_rechaza_trabajo_invalido(self):
        self.assertRaises(ValueError, G.generar_guion, con_escena([{"op": "remallar", "objeto": "cubo"}]), "5.2.0")


if __name__ == "__main__":
    unittest.main()
