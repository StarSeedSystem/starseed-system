# -*- coding: utf-8 -*-
"""Renombra el NOMBRE del producto «Puente de Mando» → «Genesis» en textos y comentarios.

No toca identificadores de código (rutas /api/mando, src/lib/mando, tablas mando_*, variables
STARSEED_MANDO*, nombres de archivo, @@MANDO@@, ids del dock ni del plugin): los respeta porque
el regex exige que «Mando» vaya suelto (sin letras, _, /, ., - ni @ pegados).
Uso: python3 genesis_renombrar.py [--aplicar] [--excluir ruta,ruta]   (desde la raíz del repo)
"""
import re
import subprocess
import sys
import collections

INCLUIR = ("src/", "scripts/", "integraciones-de-codigo/", "architecture/", "docs/", "deploy/",
           "memory/workflow-actual.md", "memory/orquestacion-economica.md", "memory/diseno/",
           "AGENTS.md", "CLAUDE.md", "README.md", "gemini.md/", "next.config.ts", "middleware.ts")
EXCLUIR = ("docs/adendas/", "memory/aprendizaje", "scripts/codex/chats.json",
           "PUENTE-DE-MANDO.md", "CLAUDE.md", "architecture/puente-mando-para-todos.md",
           "src/lib/__tests__/nombre-genesis.test.ts", "scripts/puente/genesis_renombrar.py",
           # Nombran lo viejo a propósito: la migración del dock, la redirección y el alias /mando.
           "src/lib/dock/dock-defaults.ts", "src/lib/dock/__tests__/dock-defaults.test.ts",
           "next.config.ts", "integraciones-de-codigo/claude-code/puente-de-mando/hooks/register.tsx")
EXTENSIONES = (".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".sh", ".md", ".json", ".txt",
               ".plist", ".command", ".yml", ".yaml", ".html", ".css", ".toml", ".sql")
# Carpetas donde «el Puente» y «el mando» (minúscula) siempre quieren decir el producto.
AMBITO_MANDO = ("src/components/mando/", "src/lib/mando/", "src/app/api/mando/",
                "src/app/(app)/mando/", "scripts/puente/",
                "integraciones-de-codigo/claude-code/puente-de-mando/")

SUELTO_ANTES = r"(?<![\w/.\-@])"
SUELTO_DESPUES = r"(?![\w@])"


def articulo(m, nombre="Genesis"):
    art = m.group("art")
    if art is None:
        return nombre
    a = art.lower()
    mayus = art[0].isupper()
    if a in ("el",):
        return nombre
    if a == "del":
        return ("De " if mayus else "de ") + nombre
    if a == "al":
        return ("A " if mayus else "a ") + nombre
    if a == "todo el":
        return ("Todo " if mayus else "todo ") + nombre
    return art + " " + nombre


ART = r"(?:(?P<art>[Tt]odo el|[Ee]l|[Dd]el|[Aa]l)\s+)?"
SALTO = r"\s+de(?:\s*(?:#|//|\*)\s*|\s+)"   # «de» y, si el comentario partió la línea, su marca

REGLAS_GLOBALES = [
    ("Puente de Mando", re.compile(r"\b" + ART + r"[Pp]uente" + SALTO + r"[Mm]ando(?:s)?\b"), articulo),
    ("PUENTE DE MANDO", re.compile(r"\bPUENTE DE MANDO\b"), lambda m: "GENESIS"),
    ("Centro de Mando", re.compile(r"\b" + ART + r"Centro de Mando\b"), articulo),
    ("EL MANDO", re.compile(r"\bEL MANDO\b"), lambda m: "GENESIS"),
    ("Mando suelto", re.compile(SUELTO_ANTES + ART + r"Mandos?" + SUELTO_DESPUES + r"(?! central de audio)"), articulo),
]
NO_PUENTE = r"(?!\s+(?:de\b|entre\b|con\b|cifrado|Hermes|Hermione|global|nuevo|MIC|para\b|a\b|/))"
REGLAS_AMBITO = [
    ("el Puente", re.compile(r"(?<!Agente )\b(?P<art>[Tt]odo el|[Ee]l|[Dd]el|[Aa]l)\s+Puente\b(?:\s+entero\b)?" + NO_PUENTE), articulo),
    ("el mando (minúscula)", re.compile(r"\b(?P<art>[Ee]l|[Dd]el|[Aa]l)\s+mando\b(?![\w/.\-])"), articulo),
]


def archivos():
    todos = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.split("\n")
    for a in todos:
        if not a or not a.startswith(INCLUIR) or a.startswith(EXCLUIR) or "PUENTE-DE-MANDO" in a:
            continue
        if not a.endswith(EXTENSIONES) and "." in a.rsplit("/", 1)[-1]:
            continue
        yield a


def transformar(ruta, texto, cuenta):
    nuevo = texto
    for nombre, patron, fn in REGLAS_GLOBALES:
        nuevo, k = patron.subn(fn, nuevo)
        cuenta[nombre] += k
    if ruta.startswith(AMBITO_MANDO):
        for nombre, patron, fn in REGLAS_AMBITO:
            nuevo, k = patron.subn(fn, nuevo)
            cuenta[nombre] += k
    return nuevo


def main():
    aplicar = "--aplicar" in sys.argv
    excluir = set()
    if "--excluir" in sys.argv:
        excluir = set(sys.argv[sys.argv.index("--excluir") + 1].split(","))
    cuenta = collections.Counter()
    tocados = []
    for a in archivos():
        if a in excluir:
            continue
        try:
            texto = open(a, encoding="utf-8").read()
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue
        nuevo = transformar(a, texto, cuenta)
        if nuevo != texto:
            tocados.append(a)
            if aplicar:
                with open(a, "w", encoding="utf-8") as f:
                    f.write(nuevo)
    print("reglas:", dict(cuenta))
    print("archivos:", len(tocados))
    por = collections.Counter(t.split("/")[0] + ("/" + t.split("/")[1] if t.count("/") > 1 else "") for t in tocados)
    print(dict(por.most_common(20)))


if __name__ == "__main__":
    main()
