"""Guarda (PUB1029H, 2026-10-29): ninguna prueba del puente mete una ruta de worktree en sys.path.

Una prueba escrita dentro de un worktree del enjambre que apunta sys.path a esa carpeta funciona allí, pero en main
hace que `unittest discover` importe los módulos de otro árbol y rompe todas las demás (la autopublicación se paró
por eso). La ruta se arma al correr para que este archivo no se delate a sí mismo.
"""
import os
import re
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
_WT = "starseed" + "-wt"
_PATRON = re.compile(r"sys\.path\.(?:insert|append)\([^)]*" + re.escape(_WT))


class SinRutasDeWorktree(unittest.TestCase):
    def test_ninguna_prueba_apunta_a_un_worktree(self):
        malas = []
        for nombre in sorted(os.listdir(AQUI)):
            if nombre.startswith("test_") and nombre.endswith(".py"):
                with open(os.path.join(AQUI, nombre), encoding="utf-8", errors="replace") as f:
                    if _PATRON.search(f.read()):
                        malas.append(nombre)
        self.assertEqual(malas, [], "pruebas que meten un worktree en sys.path: %s" % ", ".join(malas))


if __name__ == "__main__":
    unittest.main()
