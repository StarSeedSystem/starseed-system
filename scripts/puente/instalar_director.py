#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Instala el Chat Director (Ola 1004) en los IDE: registra el servidor MCP
`starseed-director` en Claude Code, Codex y Hermes, y enseña el bloque JSON para
Antigravity y Cursor.

Por defecto MUESTRA lo que haría; con `--aplicar` lo hace de verdad.
Nunca toca claves: solo rutas y nombres.
"""

import argparse, os, shutil, subprocess, sys

RAIZ = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))
MCP = os.path.join(RAIZ, "scripts", "puente", "mcp_director.py")
NOMBRE = "starseed-director"
PY = os.environ.get("STARSEED_PY3") or (
    "/opt/homebrew/bin/python3"
    if os.path.exists("/opt/homebrew/bin/python3")
    else sys.executable
)
CODEX_TOML = os.path.expanduser("~/.codex/config.toml")
HERMES_YAML = os.path.expanduser("~/.hermes/config.yaml")

INFO = {"cambiado": "cambiado", "ya": "ya estaba", "mostrado": "solo mostrado"}


def paso(titulo, hacer):
    print("\n· %s" % titulo)
    return hacer()


def copia_bak(ruta, aplicar):
    if not os.path.exists(ruta) or not aplicar:
        return
    destino = ruta + ".bak"
    if not os.path.exists(destino):
        shutil.copy2(ruta, destino)
        print("  copia de seguridad: %s" % destino)


def anexar_si_falta(ruta, marca, bloque, aplicar):
    if not os.path.exists(ruta):
        print("  no existe %s: añade a mano:\n%s" % (ruta, bloque))
        return "mostrado"
    with open(ruta, encoding="utf-8") as f:
        texto = f.read()
    if marca in texto:
        if PY not in texto and '"python3"' in texto:
            print("  %s ya estaba (con python3 a secas: cámbialo a %s)" % (NOMBRE, PY))
        else:
            print("  %s ya registrado en %s" % (NOMBRE, ruta))
        return "ya"
    if not aplicar:
        print("  añadiría a %s:\n%s" % (ruta, bloque))
        return "mostrado"
    copia_bak(ruta, aplicar)
    with open(ruta, "a", encoding="utf-8") as f:
        if not texto.endswith("\n"):
            f.write("\n")
        f.write(bloque)
    print("  añadido a %s (copia en .bak)" % ruta)
    return "cambiado"


def claude_code(aplicar):
    """Registra el MCP en Claude Code si no está ya."""
    try:
        lista = subprocess.run(
            ["claude", "mcp", "list"], capture_output=True, text=True, timeout=60
        )
    except FileNotFoundError:
        print("  `claude` no está en el PATH: ejecuta a mano:")
        print("  claude mcp add --scope user %s -- %s %s" % (NOMBRE, PY, MCP))
        return "mostrado"
    if NOMBRE in (lista.stdout + lista.stderr):
        print("  Claude Code ya tiene %s" % NOMBRE)
        return "ya"
    orden = ["claude", "mcp", "add", "--scope", "user", NOMBRE, "--", PY, MCP]
    if not aplicar:
        print("  ejecutaría: %s" % " ".join(orden))
        return "mostrado"
    r = subprocess.run(orden, capture_output=True, text=True, timeout=60)
    if r.returncode == 0:
        print("  registrado en Claude Code (ámbito user)")
        return "cambiado"
    print("  falló `claude mcp add`: %s" % (r.stderr.strip()[:200] or "error"))
    return "mostrado"


def codex(aplicar):
    """Codex: tabla [mcp_servers.starseed-director] en ~/.codex/config.toml."""
    bloque = "\n[mcp_servers.%s]\ncommand = %s\nargs = [%s]\n" % (
        NOMBRE,
        _toml_str(PY),
        _toml_str(MCP),
    )
    return anexar_si_falta(CODEX_TOML, "mcp_servers.%s]" % NOMBRE, bloque, aplicar)


def _toml_str(s):
    return '"%s"' % s.replace("\\", "\\\\").replace('"', '\\"')


def hermes(aplicar):
    """Hermes: entrada en mcp_servers de ~/.hermes/config.yaml (texto plano)."""
    bloque = "  %s:\n    command: %s\n    args:\n      - %s\n" % (NOMBRE, PY, MCP)
    if not os.path.exists(HERMES_YAML):
        print("  no existe %s: añade a mano:\nmcp_servers:\n%s" % (HERMES_YAML, bloque))
        return "mostrado"
    texto = open(HERMES_YAML, encoding="utf-8").read()
    if NOMBRE in texto:
        if PY not in texto and "command: python3" in texto:
            print(
                "  Hermes ya tiene %s (con python3 a secas: cámbialo a %s)"
                % (NOMBRE, PY)
            )
        else:
            print("  Hermes ya tiene %s" % NOMBRE)
        return "ya"
    lineas = texto.splitlines(keepends=True)
    indice = next(
        (i for i, l in enumerate(lineas) if l.startswith("mcp_servers:")), None
    )
    if indice is None:
        print(
            "  %s no tiene la clave `mcp_servers:`; añade a mano:\nmcp_servers:\n%s"
            % (HERMES_YAML, bloque)
        )
        return "mostrado"
    if not aplicar:
        print("  añadiría tras `mcp_servers:` de %s:\n%s" % (HERMES_YAML, bloque))
        return "mostrado"
    copia_bak(HERMES_YAML, aplicar)
    lineas.insert(indice + 1, bloque)
    open(HERMES_YAML, "w", encoding="utf-8").write("".join(lineas))
    print("  añadido a %s (copia en .bak)" % HERMES_YAML)
    return "cambiado"


def bloque_json():
    return (
        '{\n  "mcpServers": {\n    "%s": {\n      "command": %s,\n'
        '      "args": [%s]\n    }\n  }\n}' % (NOMBRE, _toml_str(PY), _toml_str(MCP))
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument(
        "--aplicar",
        action="store_true",
        help="aplica los cambios; sin esto solo los muestra",
    )
    op = ap.parse_args()
    print(
        "Chat Director · %s\nServidor MCP: %s"
        % ("APLICANDO cambios" if op.aplicar else "vista previa (nada cambia)", MCP)
    )
    paso("Claude Code (`claude mcp add --scope user`)", lambda: claude_code(op.aplicar))
    paso("Codex (~/.codex/config.toml)", lambda: codex(op.aplicar))
    paso("Hermes (~/.hermes/config.yaml)", lambda: hermes(op.aplicar))
    paso(
        "Antigravity y Cursor (bloque para pegar)",
        lambda: (
            print(
                "  pega esto en la configuración MCP de Antigravity y de Cursor\n"
                "  (Archivo → Ajustes → MCP, o ~/.cursor/mcp.json):\n%s" % bloque_json()
            ),
            "mostrado",
        )[1],
    )
    print("\nCuando termines: python3 scripts/puente/instalar-servicios.py")
    print("para que launchd cargue también el cartero del Chat Director.")
    if not op.aplicar:
        print("\nEsto solo enseñó lo que haría. Repite con `--aplicar` para hacerlo.")


if __name__ == "__main__":
    sys.exit(main())
