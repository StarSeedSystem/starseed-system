#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Todo .py bajo scripts/ tiene que parsear. Puerta contra la salida de un motor de escritura.

El 2026-09-12 Codex CLI, como motor alternativo, escribió SU RESPUESTA DE CHAT dentro de
starseed-enjambre.py (3.641 → 141 líneas, una valla markdown y prosa) y el commit llegó a
main. Ningún test lo vio porque ninguno importaba el orquestador. Este sí: no importa nada
(importar ejecutaría), solo pide al árbol que el archivo siga siendo del tipo de su extensión.
"""
import ast, os, unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS = os.path.join(RAIZ, "scripts")
MINIMO = {"starseed-enjambre.py": 2000}      # un archivo que encoge un 90 % es una medición, no un fix


class GuionesParsean(unittest.TestCase):
    def test_todo_py_bajo_scripts_parsea(self):
        rotos = []
        for carpeta, _, archivos in os.walk(SCRIPTS):
            for a in archivos:
                if not a.endswith(".py"):
                    continue
                ruta = os.path.join(carpeta, a)
                try:
                    ast.parse(open(ruta, encoding="utf-8").read(), filename=ruta)
                except SyntaxError as e:
                    rotos.append("%s: %s (línea %s)" % (os.path.relpath(ruta, RAIZ), e.msg, e.lineno))
        self.assertEqual(rotos, [], "\n".join(rotos))

    def test_el_orquestador_no_encogio(self):
        for nombre, minimo in MINIMO.items():
            ruta = os.path.join(SCRIPTS, "enjambre", nombre)
            lineas = sum(1 for _ in open(ruta, encoding="utf-8"))
            self.assertGreaterEqual(lineas, minimo, "%s tiene %d líneas; mínimo %d" % (nombre, lineas, minimo))

    def test_no_hay_valla_markdown_en_ningun_py(self):
        con_valla = []
        for carpeta, _, archivos in os.walk(SCRIPTS):
            for a in archivos:
                if a.endswith(".py"):
                    ruta = os.path.join(carpeta, a)
                    if any(l.startswith("```") for l in open(ruta, encoding="utf-8")):
                        con_valla.append(os.path.relpath(ruta, RAIZ))
        self.assertEqual(con_valla, [], "valla markdown en: " + ", ".join(con_valla))


if __name__ == "__main__":
    unittest.main()
