# -*- coding: utf-8 -*-
"""OPF1024C · Las rutas que cita cada vendor/habilidades/*/ORIGEN.md existen de verdad.

Se comprueban dos clases de rutas, sin red:
- las del repositorio (empiezan por src/, architecture/, scripts/, vendor/, config/, docs/ o servicios/),
  en cualquier parte del texto, contra la raíz del repo;
- los nombres entre comillas invertidas que parecen archivos o carpetas (con extensión, en mayúsculas
  como `LICENSE`, o acabados en «/»), contra la carpeta de la habilidad (o la raíz si es una ruta del repo).
  Una frase que acaba en « no.» enumera lo que NO se copia, y lo mismo una viñeta que
  empieza por «NO se copia...» (con sus líneas de continución): esos nombres no deben estar.
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


def _parece_ruta(nombre):
    return (nombre.endswith("/") or nombre.lower().endswith(_EXTENSIONES)
            or re.fullmatch(r"[A-Z][A-Z_]+(?:\.[a-z]+)?", nombre) is not None)


def rutas_citadas(texto):
    """PURA. → (rutas del repo, nombres locales que deben estar, nombres locales que no deben estar)."""
    del_repo, locales, excluidos = set(), set(), set()
    for bloque in re.split(r"\n(?=- )", texto):
        excluye = bool(re.match(r"-\s*NO se copi", bloque))
        for frase in re.split(r"(?<=\.)\s+|\n", bloque):
            fuera = excluye or bool(re.search(r"\sno\.\s*$", frase))
            destino = excluidos if fuera else locales
            for nombre in _ENTRE_COMILLAS.findall(frase):
                if _RUTA_REPO.fullmatch(nombre):
                    (excluidos if fuera else del_repo).add(nombre)
                elif _parece_ruta(nombre):
                    destino.add(nombre)
            for ruta in _RUTA_REPO.findall(frase):
                (excluidos if fuera else del_repo).add(ruta.rstrip("."))
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

    def test_bloque_que_empieza_por_no_se_copia(self):
        repo, locales, fuera = rutas_citadas(
            "- Se copian: `SKILL.md`, `README.md` y `references/`.\n"
            "- NO se copian (sin ejecutables): `scripts/extract.py`, `scripts/build.sh` (Playwright),\n"
            "  `evals/` ni los vídeos del README.\n"
            "- Revisión: sin telemetría.")
        self.assertEqual(repo, set())
        self.assertEqual(locales, {"SKILL.md", "README.md", "references/"})
        self.assertEqual(fuera, {"scripts/extract.py", "scripts/build.sh", "evals/"})

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
