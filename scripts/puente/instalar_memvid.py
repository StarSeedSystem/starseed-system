#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MVD1027J · instala en la Mac el binario del servidor de cápsulas Memvid: elige
el último run verde del workflow `memvid-servidor.yml`, comprueba la huella SHA-256
del artefacto contra la que el job imprime en su resumen, lo deja en ~/.local/bin
(0755) y escribe el plist de launchd. Sin claves: gh usa la sesión ya iniciada."""

import hashlib
import json
import os
import plistlib
import re
import subprocess
import sys
import tempfile

WORKFLOW = "memvid-servidor.yml"
ARTEFACTO = "memvid-servidor-darwin-arm64"
BINARIO = os.path.expanduser("~/.local/bin/memvid-servidor")
PLIST = os.path.expanduser("~/Library/LaunchAgents/com.starseed.memvid.plist")
LOG = "/tmp/starseed-memvid.log"
SHA_RE = re.compile(r"sha-?256\s*[:=]?\s*([0-9a-fA-F]{64})", re.I)


def _gh(args, gh="gh"):
    """Una orden de gh fallida corta aquí: nada se instala a ciegas."""
    r = subprocess.run([gh] + args, capture_output=True, text=True, timeout=900)
    if r.returncode != 0:
        raise SystemExit("gh %s falló: %s" % (" ".join(args), (r.stderr or r.stdout).strip()[:200]))
    return r.stdout


def elegir_run(listado_json):
    """El de `gh run list --json` más nuevo con conclusion «success»."""
    verde = [r.get("databaseId") for r in json.loads(listado_json) if r.get("conclusion") == "success"]
    if not verde:
        raise SystemExit("ningún run verde de %s: lance el job primero" % WORKFLOW)
    return str(verde[0])


def sha_del_resumen(texto):
    """La huella que el job compiló imprime en su resumen (línea SHA-256: …)."""
    m = SHA_RE.search(texto or "")
    if not m:
        raise SystemExit("el resumen del run no trae una huella sha256")
    return m.group(1).lower()


def sha256(ruta):
    huella = hashlib.sha256()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(65536), b""):
            huella.update(trozo)
    return huella.hexdigest()


def binario_de(directorio):
    """El binario dentro del artefacto descargado (el artefacto solo trae uno)."""
    nombres = [n for _, _, ns in os.walk(directorio) for n in ns]
    if not nombres:
        raise SystemExit("el artefacto %s vino sin el binario" % ARTEFACTO)
    return os.path.join(directorio, nombres[0])


def cuerpo_plist(binario):
    """El esqueleto de los plist de `instalar-servicios.py` (KeepAlive, PATH con ~/.local/bin)."""
    return {
        "Label": "com.starseed.memvid",
        "ProgramArguments": [binario, "servir"],
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 30,
        "ProcessType": "Standard",
        "StandardOutPath": LOG,
        "StandardErrorPath": LOG,
        "EnvironmentVariables": {"PATH": os.path.expanduser("~") + "/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"},
    }


def cargar_servicio(ruta_plist):
    valido = subprocess.run(["plutil", "-lint", ruta_plist], capture_output=True).returncode == 0
    r = subprocess.run(["launchctl", "load", ruta_plist], capture_output=True)
    print("  plist %s · %s" % ("ok" if valido else "INVÁLIDO", "cargado" if r.returncode == 0 else "error"))
    return valido


def instalar(binario_path, plist_path, gh="gh", plan=False, cargar=True):
    """El ciclo: run verde → huella del resumen → descargar → comparar → copiar (0755) → plist."""
    run_id = elegir_run(_gh(["run", "list", "--workflow", WORKFLOW, "--limit", "30",
                             "--json", "databaseId,conclusion,status"], gh))
    huella_j = sha_del_resumen(_gh(["run", "view", run_id, "--log"], gh))
    if plan:
        print("plan · %s en %s (0755), plist en %s · run %s · huella %s…"
              % (ARTEFACTO, binario_path, plist_path, run_id, huella_j[:16]))
        return
    with tempfile.TemporaryDirectory() as tmp:
        destino = os.path.join(tmp, "artefacto")
        _gh(["run", "download", run_id, "--name", ARTEFACTO, "--dir", destino], gh)
        ruta_bloque = binario_de(destino)
        huella_x = sha256(ruta_bloque)
        if huella_x != huella_j:
            raise SystemExit("huella del artefacto %s ≠ del resumen %s: lance el job de nuevo"
                             % (huella_x, huella_j))
        for ruta in (binario_path, plist_path):
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta_bloque, "rb") as origen, open(binario_path, "wb") as salida:
            salida.write(origen.read())
        os.chmod(binario_path, 0o755)
        with open(plist_path, "wb") as f:
            plistlib.dump(cuerpo_plist(binario_path), f)
        os.chmod(plist_path, 0o644)
        if cargar and sys.platform == "darwin":
            cargar_servicio(plist_path)
    print("memvid-servidor instalado: %s (huella %s…, run %s) · plist %s"
          % (binario_path, huella_x[:16], run_id, plist_path))


def main(argv=None):
    args = set(sys.argv[1:] if argv is None else argv)
    instalar(BINARIO, PLIST, plan="--plan" in args, cargar="--sin-cargar" not in args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
