#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""La cola de la nube viaja en un commit SUELTO, nunca en main (2026-09-24).

Alex: «¿las 40 que faltan por publicar son las mismas?». Casi: 36 de las 40 eran
«enjambre: reparto a la nube (GitHub Actions) · cola-nube-…», un commit en main por
cada reenvío de las mismas 3 tareas (CU3br, p318Jb, p318Jc) cada ~20 minutos.

La nube no necesita esos commits en main: necesita una referencia con el código de
la Mac y la cola. Aquí se construye ese commit con un ÍNDICE TEMPORAL, así que no se
mueve ninguna rama, no se toca el índice de trabajo y no se escribe nada en el árbol.
`nube-gh.py lanzar` empuja el sha a su rama `colas/nube-*` y dispara el workflow con
esa referencia. En main solo entra trabajo, no el papeleo del reparto.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile


def commit_suelto_con_cola(raiz: str, cola: str, mensaje: str) -> str:
    """sha de un commit = árbol de HEAD + `cola` (ruta relativa a `raiz`), padre HEAD.

    No mueve ninguna rama ni toca el índice real. Sirve aunque la cola esté ignorada
    por `.gitignore` (se añade con `-f` al índice temporal). Lanza RuntimeError con el
    motivo si git falla.
    """
    carpeta = tempfile.mkdtemp(prefix="cola-nube-indice-")
    env = dict(os.environ, GIT_INDEX_FILE=os.path.join(carpeta, "index"))

    def git(*args: str) -> str:
        r = subprocess.run(
            ["git", *args], cwd=raiz, env=env, capture_output=True, text=True, timeout=60
        )
        if r.returncode != 0:
            raise RuntimeError(
                "git %s: %s" % (args[0], ((r.stderr or r.stdout) or "?").strip()[-300:])
            )
        return r.stdout.strip()

    try:
        git("read-tree", "HEAD")
        git("add", "-f", "--", cola)
        arbol = git("write-tree")
        return git("commit-tree", arbol, "-p", "HEAD", "-m", mensaje)
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)
