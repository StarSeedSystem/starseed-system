"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents)."""
import os
import plistlib
import subprocess

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def test_guion_y_plist():
    guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
    texto = open(guion, encoding="utf-8").read()
    assert "kern.memorystatus_vm_pressure_level" in texto and "CODEGRAPH_TOPE_S" in texto
    assert subprocess.run(["bash", "-n", guion]).returncode == 0
    with open(os.path.join(RAIZ, "scripts", "codegraph", "com.starseed.codegraph-sync.plist"), "rb") as f:
        p = plistlib.load(f)
    args = p["ProgramArguments"]
    # (SUP0311D, 03-11) Con «/bin/bash guion» launchd daba «Operation not permitted» en cada pasada:
    # el guion vive en ~/Documents y /bin/bash no tiene permiso de disco. El programa es python3.
    assert args[0] == "/opt/homebrew/bin/python3"
    assert args[1].endswith("/scripts/puente/lanzador-tcc.py")
    sep = args.index("--")
    assert args[sep + 1:sep + 3] == ["/bin/bash", "/Users/alex/Documents/starseed-os-main/scripts/codegraph/sync-si-cabe.sh"]
    assert guion.endswith(args[sep + 2].split("starseed-os-main/", 1)[1])
