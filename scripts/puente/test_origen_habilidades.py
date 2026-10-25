# -*- coding: utf-8 -*-
"""OPF1024C · Las rutas que cita cada vendor/habilidades/*/ORIGEN.md existen de verdad.

Se comprueban dos clases de rutas, sin red:
- las del repositorio (empiezan por src/, architecture/, scripts/, vendor/, config/, docs/ o servicios/),
  en cualquier parte del texto salvo en lo que NO se copia, contra la raíz del repo;
- los nombres entre comillas invertidas que parecen archivos o carpetas (con extensión, en mayúsculas
  como `LICENSE`, o acabados en «/») que el ORIGEN dice copiar («Se copian…», «Cambios de StarSeed»),
  contra la carpeta de la habilidad (en cualquier nivel: las plantillas pueden vivir dentro de
  `bold-template-pack/`). Lo que enumera «NO se copian…» (o acaba en « no.») no debe estar.
  Las menciones sueltas a archivos del repositorio de origen (scripts que no se copian, variables de
  entorno) no son rutas locales: describen el upstream y no se comprueban contra el disco.
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
_SE_COPIAN = re.compile(r"\bse copian?\b", re.I)
_NO_SE_COPIAN = re.compile(r"^\s*[-*]\s*NO se copian?\b", re.I)
_NO_SE_COPIA = re.compile(r"\bno se copian?\b|\bnunca\b", re.I)
_NO_AL_FINAL = re.compile(r"\sno\.\s*$", re.I)


def _parece_ruta(nombre):
    return (nombre.endswith("/") or nombre.lower().endswith(_EXTENSIONES)
            or re.fullmatch(r"[A-Z][A-Z_]+(?:\.[a-z]+)?", nombre) is not None)


def _bloques(texto):
    """PURA. Agrupa cada viñeta (con sus líneas de continuación) y cada apartado; el estado no se pierde al saltar de línea."""
    bloques, actual, cambios = [], [], False
    for linea in texto.splitlines():
        if re.match(r"^\s*[-*]\s", linea) or re.match(r"^\s*#{1,6}\s", linea):
            if actual:
                bloques.append((cambios, " ".join(actual)))
            actual = [linea]
            if re.match(r"^\s*#{1,6}\s", linea):
                cambios = "Cambios de StarSeed" in linea
        elif not linea.strip():
            if actual:
                bloques.append((cambios, " ".join(actual)))
                actual = []
        else:
            actual.append(linea.strip())
    if actual:
        bloques.append((cambios, " ".join(actual)))
    return bloques


def rutas_citadas(texto):
    """PURA. → (rutas del repo, nombres locales que deben estar, nombres locales que no deben estar)."""
    del_repo, locales, excluidos = set(), set(), set()
    for cambios, bloque in _bloques(texto):
        no_copia = bool(_NO_SE_COPIAN.search(bloque))
        copia = bool(_SE_COPIAN.search(bloque)) or cambios
        if not no_copia:
            del_repo |= {m.rstrip(".") for m in _RUTA_REPO.findall(bloque)}
        if not (copia or no_copia):
            continue
        for frase in re.split(r"(?<=\.)\s+", bloque):
            if _NO_AL_FINAL.search(frase):
                destino = excluidos
            elif no_copia:
                destino = excluidos
            elif _NO_SE_COPIA.search(frase):  # «solo se copian X; nunca el Y»
                marca = _NO_SE_COPIA.search(frase)
                antes, despues = frase[:marca.start()], frase[marca.end():]
                for nombre in _ENTRE_COMILLAS.findall(antes):
                    if _parece_ruta(nombre) and not _RUTA_REPO.fullmatch(nombre):
                        locales.add(nombre)
                for nombre in _ENTRE_COMILLAS.findall(despues):
                    if _parece_ruta(nombre) and not _RUTA_REPO.fullmatch(nombre):
                        excluidos.add(nombre)
                continue
            else:
                destino = locales
            for nombre in _ENTRE_COMILLAS.findall(frase):
                if _parece_ruta(nombre) and not _RUTA_REPO.fullmatch(nombre):
                    destino.add(nombre)
    return del_repo, locales, excluidos


def existe_en(carpeta, nombre):
    """PURA sobre el disco. Un nombre local vale si está en la carpeta o en cualquier nivel bajo ella."""
    if os.path.exists(os.path.join(carpeta, nombre)):
        return True
    if nombre.endswith("/"):
        return any(d == nombre.rstrip("/") for _, dirs, _ in os.walk(carpeta) for d in dirs)
    if "/" not in nombre:
        return any(f == nombre for _, _, files in os.walk(carpeta) for f in files)
    return False


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
        repo, locales, fuera = rutas_citadas(
            "- Se copian `README.md` y, de las plantillas, `design.md`; nunca el `template.html`.\n"
            "- NO se copian (sin ejecutables): `scripts/` y\n  `plugins/`.\n"
            "- Los scripts del origen (`draw.mjs`) se leen solo para la revisión.")
        self.assertEqual(repo, set())
        self.assertEqual(locales, {"README.md", "design.md"})
        self.assertEqual(fuera, {"template.html", "scripts/", "plugins/"})

    def test_rutas_citadas_existen(self):
        faltan = []
        for origen in ORIGENES:
            carpeta = os.path.dirname(origen)
            with open(origen, encoding="utf-8") as f:
                repo, locales, excluidos = rutas_citadas(f.read())
            nombre = os.path.relpath(origen, RAIZ)
            faltan += [f"{nombre}: {r}" for r in sorted(repo) if not os.path.exists(os.path.join(RAIZ, r))]
            faltan += [f"{nombre}: {r}" for r in sorted(locales) if not existe_en(carpeta, r)]
            faltan += [f"{nombre}: {r} (dice que no se copia y está)" for r in sorted(excluidos)
                       if existe_en(carpeta, r)]
        self.assertEqual(faltan, [])


if __name__ == "__main__":
    unittest.main()
