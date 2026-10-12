# -*- coding: utf-8 -*-
"""Comprobar en el A1 de Oracle los cambios que llegan de la nube."""
from __future__ import annotations

import os
import subprocess
import tempfile
import time
from typing import List, Tuple

# Import oracle_nodo for SSH and estado
import oracle_nodo


def comprobar(base_sha: str, shas: List[str], cambiados: List[str], timeout: int = 900) -> Tuple[bool, str, bool]:
    """Comprueba en el A1 los cambios que llegan de la nube.

    Args:
        base_sha: el sha de la main que se usó como base (la última main enviada al A1).
        shas: lista de shas que se veulent cherry-pick sobre el base_sha.
        cambiados: lista de archivos que cambiaron en el commit (en el Mac).
        timeout: tiempo en segundos para esperar la respuesta del A1.

    Returns:
        (ok, detalle, del_medio): 
        - ok: True si las pruebas pasaron en el A1, False si fallaron.
        - detalle: mensaje de error o éxito.
        - del_medio: True si el fallo fue del A1 (ocupado o no respondiendo) y se debe reintentar, False si el fallo fue del trabajo.
    """
    # First, check if the A1 is occupied or not responding
    try:
        estado_a1, nodo, servicios = oracle_nodo.estado(guardar=False)
        if nodo.get("fase") == "cola":
            return (False, "A1 ocupado con una cola", True)
    except Exception as e:
        # If we cannot get the estado, assume not responding
        return (False, f"No se pudo obtener el estado del A1: {e}", True)

    # If there are no shas to check, then we don't need to run any checks
    if not shas:
        return (True, "No hay shas que comprobar", False)

    # We'll create a temporary directory on the Mac for the bundle and the changed files list.
    with tempfile.TemporaryDirectory(prefix="comprobar_a1_") as tmpdir:
        bundle_file = os.path.join(tmpdir, "comprobar.bundle")
        changed_file = os.path.join(tmpdir, "changed_files.txt")

        # Write the changed files list
        with open(changed_file, 'w') as f:
            for file in cambiados:
                f.write(file + "\n")

        # Create the bundle containing the shas
        if shas:
            cmd = ["git", "bundle", "create", bundle_file] + shas
            rc, salida = oracle_nodo._git(cmd, cwd=oracle_nodo.RAIZ)
            if rc != 0:
                return (False, f"No se pudo crear el bundle: {salida}", False)
        else:
            # This case is already handled above, but just in case.
            return (True, "No hay shas que comprobar", False)

        # Transfer the bundle and the changed files list to the A1
        ip = oracle_nodo._ip()
        if not ip:
            return (False, "No se pudo obtener la IP del A1", True)

        # Transfer bundle
        remote_bundle = "/tmp/comprobar.bundle"
        scp_cmd = ["scp", "-i", oracle_nodo.LLAVE, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
                   "-o", "StrictHostKeyChecking=accept-new", "-o", "LogLevel=ERROR", "-o", "ServerAliveInterval=30",
                   bundle_file, f"{oracle_nodo.USUARIO_SSH}@{ip}:{remote_bundle}"]
        try:
            result = subprocess.run(scp_cmd, capture_output=True, text=True, timeout=60)
            if result.returncode != 0:
                return (False, f"Error al transferir el bundle: {result.stderr}", False)
        except Exception as e:
            return (False, f"Excepción al transferir el bundle: {e}", False)

        # Transfer changed files list
        remote_changed = "/tmp/changed_files.txt"
        scp_cmd = ["scp", "-i", oracle_nodo.LLAVE, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
                   "-o", "StrictHostKeyChecking=accept-new", "-o", "LogLevel=ERROR", "-o", "ServerAliveInterval=30",
                   changed_file, f"{oracle_nodo.USUARIO_SSH}@{ip}:{remote_changed}"]
        try:
            result = subprocess.run(scp_cmd, capture_output=True, text=True, timeout=60)
            if result.returncode != 0:
                return (False, f"Error al transferir la lista de archivos cambiados: {result.stderr}", False)
        except Exception as e:
            return (False, f"Excepción al transferir la lista de archivos cambiados: {e}", False)

        # Now, on the A1, we create a temporary worktree and run the checks.
        # We'll generate a unique directory name for the worktree.
        worktree_dir = f"/home/starseed/starseed-system-tmp-{os.getpid()}-{int(time.time())}"

        # Build the script to run on the A1
        script = f"""
        set -e
        WORKTREE="{worktree_dir}"
        BUNDLE="{remote_bundle}"
        CHANGED_FILES="{remote_changed}"
        BASE_SHA="{base_sha}"
        # Go to the repository
        cd /home/starseed/starseed-system
        # Remove any existing worktree at the same location (if any)
        git worktree remove --force "$WORKTREE" 2>/dev/null || true
        rm -rf "$WORKTREE"
        # Create the worktree detached at base_sha
        git worktree add --detach "$WORKTREE" "$BASE_SHA"
        cd "$WORKTREE"
        # Link node_modules
        if [ ! -e node_modules ]; then
            ln -s /home/starseed/starseed-system/node_modules .
        fi
        # Unbundle the bundle
        git bundle unbundle "$BUNDLE"
        # Cherry-pick the shas (in reverse order to get oldest first)
        {' '.join([f'git cherry-pick {sha}' for sha in reversed(shas)])}
        # Now, compute what to check using the traer_nube module
        # We'll change to the worktree directory and run Python to import traer_nube
        TS_CHANGED=$(cd /home/starseed/starseed-system && python3 -c "
import sys
sys.path.insert(0, '.')
import traer_nube
changed = [line.strip() for line in open('$CHANGED_FILES') if line.strip()]
has_ts = traer_nube.archivos_ts(changed)
ts_files = [c for c in changed if c.startswith('src/') and c.endswith(('.ts','.tsx'))]
if has_ts or ts_files:
    print('1')
else:
    print('0')
                ")
        TS_FILES=$(cd /home/starseed/starseed-system && python3 -c "
import sys
sys.path.insert(0, '.')
import traer_nube
changed = [line.strip() for line in open('$CHANGED_FILES') if line.strip()]
ts_files = [c for c in changed if c.startswith('src/') and c.endswith(('.ts','.tsx'))]
print(' '.join(ts_files))
                ")
        PY_TESTS=$(cd /home/starseed/starseed-system && python3 -c "
import sys
sys.path.insert(0, '.')
import traer_nube
changed = [line.strip() for line in open('$CHANGED_FILES') if line.strip()]
tests = traer_nube.pruebas_python(changed)
print(' '.join(tests))
                ")
        # Run tsc if needed
        if [ "$TS_CHANGED" = "1" ]; then
            echo "Running tsc..."
            npx tsc --noEmit --skipLibCheck 2>&1 | tee tsc.log
            if [ $? -ne 0 ]; then
                echo "TSC FAILED"
                cat tsc.log
                exit 1
            fi
        fi
        # Run vitest related for the TS files if needed
        if [ -n "$TS_FILES" ]; then
            echo "Running vitest related on $TS_FILES"
            npx vitest related --run --maxWorkers=2 --minWorkers=1 --passWithNoTests $TS_FILES 2>&1 | tee vitest.log
            if [ $? -ne 0 ]; then
                echo "VITEST FAILED"
                cat vitest.log
                exit 1
            fi
        fi
        # Run pytest for the Python bridge tests if needed
        if [ -n "$PY_TESTS" ]; then
            echo "Running pytest on $PY_TESTS"
            python3 -m pytest -q -p no:cacheprovider $PY_TESTS 2>&1 | tee pytest.log
            if [ $? -ne 0 ]; then
                echo "PYTEST FAILED"
                cat pytest.log
                exit 1
            fi
        fi
        echo "ALL CHECKS PASSED"
        exit 0
        """

        # Run the script on the A1 via ssh
        rc, salida = oracle_nodo.ssh(script, timeout=timeout)
        if rc != 0:
            # The script failed on the A1
            return (False, f"Las pruebas fallaron en el A1: {salida}", False)
        else:
            return (True, "Todas las pruebas pasaron en el A1", False)