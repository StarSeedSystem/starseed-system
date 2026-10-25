# -*- coding: utf-8 -*-
"""OPF1024C · Las rutas que cita cada vendor/habilidades/*/ORIGEN.md existen de verdad.

Se comprueban tres clases de mención, sin red, según la frase que la cita:
- una frase que acaba en « no.», dice «no se copia(n)» o «nunca» enumera lo que NO se copia: esos
  nombres no deben estar en la carpeta de la habilidad (un script de origen como `scripts/lint.sh`
  tampoco: era del repo upstream, no de este);
- una frase que dice dónde se copia («se copian/copiadas») enumera lo copiado: los nombres tienen que
  estar en la carpeta de la habilidad; un `*` vale por cualquier nombre (p. ej.
  `bold-template-pack/templates/*/design.md` por sus 34 plantillas);
- el resto describe el repo de origen (versiones, revisión de seguridad) pero también cita las rutas
  DE ESTE repo (empiezan por src/, architecture/, scripts/, vendor/, config/, docs/ o servicios/),
  que tienen que existir en la raíz; los demás nombres son anécdotas y no se comprueba nada de ellas.
"""
import glob
import os
import re
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORIGENES = sorted(glob.glob(os.path.join(RAIZ, "vendor", "habilidades", "*", "ORIGEN.md")))

_RUTA_REPO = re.compile(r"(?<![\w/.:-])((?:src|architecture|scripts|vendor|config|docs|servicios)/[\w./\-]+)")
_ENTRE_COMILLAS = re.compile(r"`([^`\s]+)`")
_EXTENSIONES = (".md", ".py", ".sh", ".ts", ".tsx", ".js", ".mjs", ".css", ".json", ".html", ".txt", ".yaml", ".yml")
_SE_COPIA = re.compile(r"\bse\s+copi", re.IGNORECASE)      # copia, copian, copiado (copiado a mano): aquí está
_NO_SE_COPIA = re.compile(r"\bno\s+se\s+copi", re.IGNORECASE)  # no se copia(n): aquí no está
_NUNCA = re.compile(r"\bnunca\b", re.IGNORECASE)           # «nunca el template.html de la fuente», «nunca a mano»


def _parece_ruta(nombre):
    return (nombre.endswith("/") or nombre.lower().endswith(_EXTENSIONES)
            or re.fullmatch(r"[A-Z][A-Z_]+(?:\.[a-z]+)?", nombre) is not None)


def rutas_citadas(texto):
    """PURA. → (rutas del repo, nombres copiados que deben estar, nombres de los que dice que no se copian)."""
    # Las rutas de ESTE repo se leen en todo el texto (entre comillas o no); si una frase dice «no se copia»,
    # lo que cita allí es de la fuente y va a los excluidos (se mira contra la carpeta, no contra la raíz).
    del_repo, locales, excluidos = {m.rstrip(".") for m in _RUTA_REPO.findall(texto)}, set(), set()

    def _clase_de(frase):
        if _NO_SE_COPIA.search(frase) or _NUNCA.search(frase) or re.search(r"\sno\.\s*$", frase):
            return excluidos  # la enumeración de lo que NO se copia
        if _SE_COPIA.search(frase):
            return locales
        return del_repo  # anécdota: sólo se comprueban ahí las rutas de ESTE repo

    def _aplicar(frase, clase):
        for nombre in _ENTRE_COMILLAS.findall(frase):
            if not _parece_ruta(nombre):
                continue
            if _RUTA_REPO.fullmatch(nombre):
                if clase is not del_repo:
                    limpio = nombre.rstrip(".")
                    del_repo.discard(limpio)
                    (locales if clase is locales else excluidos).add(nombre if clase is locales else limpio)
            elif clase is not del_repo:  # las anécdotas no comprueban nada de los nombres locales
                clase.add(nombre)

    hereda = None  # la clase de la viñeta actual: lo heredan sus líneas de continuación
    for linea in texto.split("\n"):
        if not linea.strip():
            hereda = None
            continue
        frases = re.split(r"(?<=\.)\s+", linea)
        if linea.startswith("- "):  # viñeta nueva: se reclasifica por SU primera frase
            hereda = _clase_de(frases[0])
            for frase in frases:  # una frase dentro de la viñeta puede cambiar la clase (« … no.»)
                _aplicar(frase, _clase_de(frase))
        else:  # continuación de la viñeta (o texto suelto): hereda, o se clasifica sola si va sin viñeta
            clase = hereda if hereda is not None else _clase_de(frases[0])
            for frase in frases:
                _aplicar(frase, clase)
    return del_repo, locales, excluidos


def _existe_nombre(carpeta, nombre):
    """Un `*` vale por cualquier nombre o carpeta intermedia (34 plantillas, 84 marcas)."""
    if "*" in nombre or "?" in nombre:
        return bool(glob.glob(os.path.join(carpeta, nombre)))
    return os.path.exists(os.path.join(carpeta, nombre))


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
        repo2, copiados, fuera = rutas_citadas(
            "- Se copian: `bold/README.md` y su `bold/*/design.md`.\n"
            "- NO se copian: `gema/`, `privado.md`, `scripts/lint.sh` ni los manifiestos.\n"
            "- La revisión menciona `del_origen.mjs`, que NO se copia al repo.\n"
            "- Se renueva con etiquetas `v*`; nunca a mano. La capacidad vive en `src/x/y.ts`.")
        self.assertEqual(copiados, {"bold/README.md", "bold/*/design.md"})
        self.assertEqual(fuera, {"gema/", "privado.md", "scripts/lint.sh", "del_origen.mjs"})
        self.assertEqual(repo2, {"src/x/y.ts"})
        self.assertTrue(_existe_nombre("scripts/puente", "test_*.py"))  # con hijos
        self.assertFalse(_existe_nombre(".", "design-md/<marca>"))
        self.assertFalse(_existe_nombre(".", "no-existe-x_y/"))

    def test_rutas_citadas_existen(self):
        faltan = []
        for origen in ORIGENES:
            carpeta = os.path.dirname(origen)
            with open(origen, encoding="utf-8") as f:
                repo, locales, excluidos = rutas_citadas(f.read())
            nombre = os.path.relpath(origen, RAIZ)
            faltan += [f"{nombre}: {r}" for r in sorted(repo) if not os.path.exists(os.path.join(RAIZ, r))]
            faltan += [f"{nombre}: {r}" for r in sorted(locales) if not _existe_nombre(carpeta, r)]
            faltan += [f"{nombre}: {r} (dice que no se copia y está)" for r in sorted(excluidos)
                       if os.path.exists(os.path.join(carpeta, r))]
        self.assertEqual(faltan, [])


if __name__ == "__main__":
    unittest.main()
