#!/usr/bin/env python3
"""Pruebas de la clave ABLITERATION_API_KEY en nube-gh.py y enjambre-nube.yml (2026-11-16, CLV1116A).

Lee ambos archivos como TEXTO y comprueba la presencia/ausencia exacta.
"""
from __future__ import annotations

import os
import unittest


class AbliterationKeyEnNubeGh(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base = os.path.dirname(os.path.abspath(__file__))
        cls.nube_gh = os.path.join(base, "nube-gh.py")
        cls.workflow = os.path.join(base, "..", "..", ".github", "workflows", "enjambre-nube.yml")
        with open(cls.nube_gh, encoding="utf-8") as f:
            cls.texto_nube = f.read()
        with open(cls.workflow, encoding="utf-8") as f:
            cls.texto_wf = f.read()

    def test_abliteration_en_secretos_tupla(self):
        """El nombre está dentro del bloque SECRETOS = ( … )."""
        inicio = self.texto_nube.find("SECRETOS = (")
        self.assertNotEqual(inicio, -1, "No se encuentra SECRETOS = (")
        # Buscar el paréntesis de cierre balanceando paréntesis
        nivel = 0
        fin = -1
        for i, ch in enumerate(self.texto_nube[inicio:], inicio):
            if ch == "(":
                nivel += 1
            elif ch == ")":
                nivel -= 1
                if nivel == 0:
                    fin = i
                    break
        self.assertNotEqual(fin, -1, "No se encuentra el cierre de la tupla SECRETOS")
        bloque = self.texto_nube[inicio:fin + 1]
        self.assertIn('"ABLITERATION_API_KEY"', bloque,
                      "ABLITERATION_API_KEY no está en la tupla SECRETOS")

    def test_abliteration_en_workflow_env_una_sola_linea(self):
        """El flujo tiene exactamente una línea ABLITERATION_API_KEY: ${{ secrets.ABLITERATION_API_KEY }}."""
        lineas = [l for l in self.texto_wf.splitlines()
                  if "ABLITERATION_API_KEY" in l and "${{ secrets.ABLITERATION_API_KEY }}" in l]
        self.assertEqual(len(lineas), 1,
                         f"Se esperaban 1 línea con la clave en env:, hay {len(lineas)}: {lineas}")

    def test_abliteration_no_en_for_v_in(self):
        """El nombre NO aparece en ninguna línea que empiece (tras espacios) por 'for v in' ni en su continuación."""
        lineas = self.texto_wf.splitlines()
        en_for = False
        for i, linea in enumerate(lineas):
            stripped = linea.lstrip()
            if stripped.startswith("for v in"):
                en_for = True
            elif en_for and not (linea.startswith(" ") or linea.startswith("\t") or stripped == ""):
                en_for = False
            if en_for and "ABLITERATION_API_KEY" in linea:
                self.fail(f"ABLITERATION_API_KEY aparece en línea de bucle for v in (línea {i + 1}): {linea.strip()}")


if __name__ == "__main__":
    unittest.main()