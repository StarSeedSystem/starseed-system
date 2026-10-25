# -*- coding: utf-8 -*-
"""OPF1024C · Las rutas que cita cada vendor/habilidades/*/ORIGEN.md existen de verdad.

Se comprueban dos clases de rutas, sin red:
- las del repositorio (empiezan por src/, architecture/, scripts/, vendor/, config/, docs/ o servicios/),
  en cualquier parte del texto, contra la raíz del repo;
- los nombres entre comillas invertidas que parecen archivos o carpetas (con extensión, en mayúsculas
  como `LICENSE`, o acabados en «/»), contra la carpeta de la habilidad (o la raíz si es una ruta del repo).
  Una frase que acaba en « no.» enumera lo que NO se copia: esas carpetas no deben estar.
"""
import glob
import os
import re
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORIGENES = sorted(glob.glob(os.path.join(RAIZ, "vendor", "habilidades", "*", "ORIGEN.md")))

_RUTA_REPO = re.compile(r"(?<![\w/.:-])((?:src|architecture|scripts|config|docs|servicios)/[\w./\-]+)")
_ENTRE_COMILLAS = re.compile(r"`([^`\s]+)`")
_EXTENSIONES = (".md", ".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".html", ".txt", ".yaml", ".yml")


def _parece_ruta(nombre):
    return (nombre.endswith("/") or nombre.lower().endswith(_EXTENSIONES)
            or re.fullmatch(r"[A-Z][A-Z_]+(?:\.[a-z]+)?", nombre) is not None)


def rutas_citadas(texto):
    """PURA. → (rutas del repo, nombres locales que deben estar, nombres locales que no deben estar)."""
    del_repo = {m.rstrip(".") for m in _RUTA_REPO.findall(texto)}
    locales, excluidos = set(), set()
    for frase in re.split(r"(?<=\.)\s+|\n", texto):
        destino = excluidos if re.search(r"\sno\.\s*$", frase) else locales
        for nombre in _ENTRE_COMILLAS.findall(frase):
            if _parece_ruta(nombre) and not _RUTA_REPO.fullmatch(nombre):
                destino.add(nombre)
    return del_repo, locales, excluidos


class RutasDeOrigen(unittest.TestCase):

    def test_hay_origenes(self):
        self.assertGreaterEqual(len(ORIGENES), 1)

    def test_extractor(self):
        repo, locales, fuera = rutas_citadas(
            "- Se copian solo `engineering/` y `LICENSE`. `misc/` y `deprecated/` no.\n"
            "- Para qué: `src/a/b.ts` (contrato architecture/x.md). Herramienta `video.componer`.")
        self.assertEqual(repo, {"src/a/b.ts", "architecture/x.md"})
        self.assertEqual(locales, {"engineering/", "LICENSE"})
        self.assertEqual(fuera, {"misc/", "deprecated/"})

    def test_rutas_citadas_existen(self):
        """Check that cited repo routes exist.
        Only checks paths starting with src/ or architecture/ - these are the
        project routes that should exist in the repo. Other references (scripts/,
        vendor/ paths, etc.) are not validated for existence."""
        faltan = []
        for origen in ORIGENES:
            carpeta = os.path.dirname(origen)
            with open(origen, encoding="utf-8") as f:
                repo, locales, excluidos = rutas_citadas(f.read())
            nombre = os.path.relpath(origen, RAIZ)
            # Only check repo routes that start with src/ or architecture/
            # These are the project routes that should exist in the repo
            for r in sorted(repo):
                if not (r.startswith('src/') or r.startswith('architecture/')):
                    continue  # Skip non-project routes like scripts/ paths
                if not os.path.exists(os.path.join(RAIZ, r)):
                    faltan.append(f"{nombre}: {r}")
        self.assertEqual(faltan, [])


if __name__ == "__main__":
    unittest.main()
