#!/usr/bin/env python3
"""oracle_claves · lleva las variables pedidas a una máquina Oracle, por SSH, sin imprimirlas.

Uso: oracle_claves.py <maquina> [--simular] VAR1 VAR2 …

Lee SOLO las variables pedidas de `~/.starseed/env` de ESTA máquina, construye el archivo
en memoria y lo deja en `/etc/starseed/env` de la máquina remota (IP desde
`~/.starseed/oracle.json`, llave `~/.ssh/starseed_oracle_ed25519`, usuario `starseed`)
por la entrada estándar de ssh, con `sudo install -m 600 -o root`. No crea archivos
temporales locales y NUNCA imprime valores: solo «VAR1 ✓, VAR2 (no está en tu env)».

Contrato: architecture/oracle-nube.md §5 (env.ejemplo → /etc/starseed/env, 600, root).
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

PATRON_NOMBRE = re.compile(r"^[A-Z][A-Z0-9_]+$")
DESTINO_REMOTO = "/etc/starseed/env"
USUARIO = os.environ.get("STARSEED_ORACLE_USUARIO", "starseed")


def leer_env(texto):
    """NOMBRE=valor línea a línea, ignorando comentarios y vacías. Nunca se imprime."""
    salida = {}
    for linea in texto.splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        nombre, _, valor = linea.partition("=")
        nombre = nombre.strip()
        salida[nombre] = valor.strip().strip('"').strip("'")
    return salida


def validar_nombres(nombres):
    """Devuelve (válidos, rechazados). Nombre de variable: [A-Z][A-Z0-9_]+."""
    validos, rechazados = [], []
    for nombre in nombres:
        (validos if PATRON_NOMBRE.match(nombre) else rechazados).append(nombre)
    return validos, rechazados


def construir_contenido(env, nombres):
    """(contenido, presentes, ausentes): solo las pedidas, en el orden pedido."""
    presentes, ausentes, lineas = [], [], []
    for nombre in nombres:
        if nombre in env:
            presentes.append(nombre)
            lineas.append(f"{nombre}={env[nombre]}")
        else:
            ausentes.append(nombre)
    return "\n".join(lineas) + "\n" if lineas else "", presentes, ausentes
