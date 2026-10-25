# -*- coding: utf-8 -*-
"""OPF1024C · Las rutas que cita cada vendor/habilidades/*/ORIGEN.md existen de verdad.

Se comprueban dos clases de rutas, sin red:
- las del repositorio (empiezan por src/, architecture/, scripts/, vendor/, config/, docs/ o servicios/),
  en cualquier parte del texto, contra la raíz del repo;
- los nombres entre comillas invertidas que parecen archivos o carpetas (con extensión, en mayúsculas
  como `LICENSE`, o acabados en «/»), contra la carpeta de la habilidad (o la raíz si es una ruta del repo).
  Una frase que acaba en « no.» o que dice «NO se copian» enumera lo que NO se copia: esas rutas no deben estar
  (y si se citan otra vez en otra frase, siguen excluidas). Las variables de entorno y las rutas absolutas o del
  repositorio de origen no se confunden con archivos locales.
"""
import glob
import os
import re
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORIGENES = sorted(glob.glob(os.path.join(RAIZ, "vendor", "habilidades", "*", "ORIGEN.md")))

_RUTA_REPO = re.compile(r"(?<![\w/.:-])((?:src|architecture|scripts|vendor|config|docs|servicios)/[\w./\-]+)")
_ENTRE_COMILLAS = re.compile(r"`([^`\s]+)`")
_EXTENSIONES = (".md", ".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".html", ".txt", ".yaml", ".yml")
_NO_SE_COPIA = re.compile(r"\bno\s+se\s+copian?\b|\sno\.\s*$", re.I)
_ABSOLUTAS = ("/", "~", "\\")


def _parece_ruta(nombre):
    if "_" in nombre and re.fullmatch(r"[A-Z][A-Z0-9_]*", nombre):
        return False  # variable de entorno, no archivo
    return (nombre.endswith("/") or nombre.lower().endswith(_EXTENSIONES)
            or re.fullmatch(r"[A-Z][A-Z_]+(?:\.[a-z]+)?", nombre) is not None)


def _unidades(texto):
    """Cada viñeta (con sus líneas de continuación) y cada frase dentro de ella, por separado."""
    for bloque in re.split(r"\n(?=\s*[-*]\s)", texto):
        yield from re.split(r"(?<=\.)\s+", bloque)


def rutas_citadas(texto):
    """PURA. → (rutas del repo, nombres locales que deben estar, nombres locales que no deben estar)."""
    del_repo, locales, excluidos = set(), set(), set()
    for frase in _unidades(texto):
        excluir = _NO_SE_COPIA.search(frase) is not None
        destino = excluidos if excluir else locales
        for nombre in _ENTRE_COMILLAS.findall(frase):
            if nombre.startswith(_ABSOLUTAS) or "://" in nombre:
                continue
            if _parece_ruta(nombre) and not _RUTA_REPO.fullmatch(nombre):
                destino.add(nombre)
        if not excluir:
            del_repo |= {m.rstrip(".") for m in _RUTA_REPO.findall(frase)}
    return del_repo, locales - excluidos, excluidos


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
        faltan = []
        for origen in ORIGENES:
            carpeta = os.path.dirname(origen)
            with open(origen, encoding="utf-8") as f:
                repo, locales, excluidos = rutas_citadas(f.read())
            nombre = os.path.relpath(origen, RAIZ)
            faltan += [f"{nombre}: {r}" for r in sorted(repo) if not os.path.exists(os.path.join(RAIZ, r))]
            faltan += [f"{nombre}: {r}" for r in sorted(locales) if not os.path.exists(os.path.join(carpeta, r))]
            faltan += [f"{nombre}: {r} (dice que no se copia y está)" for r in sorted(excluidos)
                       if os.path.exists(os.path.join(carpeta, r))]
        self.assertEqual(faltan, [])


if __name__ == "__main__":
    unittest.main()
