#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lanza un programa como hijo de python3 para que herede el permiso de disco.

POR QUÉ EXISTE. macOS protege ~/Documents con TCC, y el permiso de «Acceso total
al disco» se concede POR BINARIO, no por carpeta. En esta Mac lo tiene
/opt/homebrew/bin/python3 — por eso el vigilante, el guardia y el director leen el
repo sin problema — pero NO lo tienen /bin/zsh ni /bin/bash. De ahí que launchd
dijera «can't open input file» sobre un guion que existe y tiene permisos: el
archivo se ve (ls funciona) pero no se puede LEER (head dice «Operation not
permitted»). Medido con una sonda de launchd antes de escribir esto.

El remedio: que el shell no sea el programa del servicio, sino un hijo de python3.
Comprobado en la misma sonda: un `/bin/zsh` lanzado con subprocess desde un python3
de launchd sí lee ~/Documents, y un `node` nieto también. Mover los guiones fuera de
~/Documents no habría servido, porque lo que hacen es justamente trabajar ahí dentro.

  python3 lanzador-tcc.py [--cwd DIR] [--env-file F] [--env K=V] -- programa args...
"""
import os, signal, subprocess, sys

cwd, entorno, i = None, dict(os.environ), 1
while i < len(sys.argv) and sys.argv[i] != "--":
    if sys.argv[i] == "--cwd":
        cwd = sys.argv[i + 1]; i += 2
    elif sys.argv[i] == "--env-file":
        # Formato .env: KEY=valor, con «export» opcional y # para comentarios.
        try:
            for linea in open(os.path.expanduser(sys.argv[i + 1])):
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                if linea.startswith("export "):
                    linea = linea[7:]
                k, v = linea.split("=", 1)
                entorno[k.strip()] = v.strip().strip('"').strip("'")
        except IOError:
            pass                      # sin claves se arranca igual; ya avisará el servicio
        i += 2
    elif sys.argv[i] == "--env":
        k, v = sys.argv[i + 1].split("=", 1); entorno[k] = v; i += 2
    else:
        i += 1
orden = sys.argv[i + 1:] if i < len(sys.argv) else []
if not orden:
    sys.stderr.write("uso: lanzador-tcc.py [--cwd D] [--env-file F] [--env K=V] -- programa args\n")
    sys.exit(2)

hijo = subprocess.Popen(orden, cwd=cwd, env=entorno)

def traspasar(num, _marco):
    """launchd para el servicio mandando SIGTERM: que le llegue también al hijo."""
    try:
        hijo.send_signal(num)
    except Exception:
        pass

for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(s, traspasar)

try:
    sys.exit(hijo.wait())
except KeyboardInterrupt:
    hijo.terminate()
    sys.exit(hijo.wait())
