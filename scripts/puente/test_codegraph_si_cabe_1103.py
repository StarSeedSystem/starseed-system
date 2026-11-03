"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo."""
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
    assert p["ProgramArguments"][:2] == ["/bin/bash", guion]
