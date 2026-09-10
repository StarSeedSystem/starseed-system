#!/usr/bin/env python3
"""Lanza algo como demonio de verdad: doble fork + setsid.

macOS no trae `setsid`, y un `(nohup … &)` suelto muere cuando se cierra la terminal,
el IDE o el puente con la sesión que lo lanzó — hoy se perdieron dos builds por eso.

  python3 scripts/puente/demonio.py <log> <directorio> <orden> [args...]
"""
import os, subprocess, sys
if len(sys.argv) < 4:
    print(__doc__); sys.exit(2)
if os.fork() > 0: sys.exit(0)
os.setsid()
if os.fork() > 0: os._exit(0)
log = open(sys.argv[1], "w")
os.chdir(sys.argv[2])
rc = subprocess.call(sys.argv[3:], stdout=log, stderr=subprocess.STDOUT,
                     stdin=subprocess.DEVNULL)
log.write("\n__EXIT__=%d\n" % rc); log.flush()
os._exit(0)
