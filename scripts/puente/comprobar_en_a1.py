#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comprobar en el A1 de Oracle el trabajo que llega de la nube.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
import time

# Import local modules
try:
    from . import oracle_nodo
    from . import traer_nube
except ImportError:
    import oracle_nodo
    import traer_nube

def comprobar(base_sha, shas, cambiados, timeout=900):
    # Check if A1 is occupied or not responding
    estado_a1, _, _ = oracle_nodo.estado(guardar=False)
    if not estado_a1:
        return False, "A1 no responde", True
    if estado_a1.get("fase") == "cola":
        return False, "A1 ocupado con una cola", True

    # Create temporary directory on A1
    rc, salida = oracle_nodo.ssh("mktemp -d")
    if rc != 0:
        return False, "no se pudo crear directorio temporal en A1: " + salida, True
    temp_dir = salida.strip()

    try:
        # Add worktree detached at base_sha
        rc, salida = oracle_nodo.ssh(
            "git -C /home/starseed/starseed-system worktree add --detach {} {}".format(temp_dir, base_sha)
        )
        if rc != 0:
            return False, "no se pudo preparar el worktree: " + salida, True

        # Cherry-pick each sha
        for sha in shas:
            rc, salida = oracle_nodo.ssh(
                "git -C {} cherry-pick {}".format(temp_dir, sha)
            )
            if rc != 0:
                oracle_nodo.ssh("git -C {} cherry-pick --abort".format(temp_dir))
                return False, "conflicto al aplicar commit {}: {}".format(sha, salida), False

        # Prepare list of changed files
        if isinstance(cambiados, str):
            cambiado_list = [cambiados]
        else:
            cambiado_list = list(cambiados)

        # Check for TS changes and run tsc and vitest related
        if traer_nube.archivos_ts(cambiado_list):
            # Run tsc
            rc, salida = oracle_nodo.ssh(
                "cd {} && npx tsc --noEmit --skipLibCheck".format(temp_dir),
                timeout=timeout
            )
            if rc != 0:
                return False, "tsc falló: " + salida, False
            # Run vitest related for TS files changed
            import re
            codigo_ts = [c for c in cambiado_list if c.startswith("src/") and re.search(r"\.(ts|tsx)$", c)]
            if codigo_ts:
                files_str = " ".join(codigo_ts)
                rc, salida = oracle_nodo.ssh(
                    "cd {} && npx vitest related --run --maxWorkers=2 --minWorkers=1 --passWithNoTests {}".format(temp_dir, files_str),
                    timeout=timeout
                )
                if rc != 0:
                    return False, "pruebas de vitest fallaron: " + salida, False

        # Run puente Python tests
        py_tests = traer_nube.pruebas_python(cambiado_list)
        if py_tests:
            rc, salida = oracle_nodo.ssh(
                "cd {} && python -m pytest -q -p no:cacheprovider {}".format(temp_dir, " ".join(py_tests)),
                timeout=timeout
            )
            if rc not in (0, 5):  # 5 = no tests found
                return False, "pruebas del puente fallaron: " + salida, False

        return True, "tsc y pruebas relacionadas en verde en A1", False
    finally:
        # Clean up worktree and temporary directory
        oracle_nodo.ssh("git -C /home/starseed/starseed-system worktree remove --force {}".format(temp_dir))
        oracle_nodo.ssh("rm -rf {}".format(temp_dir))