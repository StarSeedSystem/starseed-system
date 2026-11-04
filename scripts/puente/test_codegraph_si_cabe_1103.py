"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents).
SUP0411B: si un sync se corta por tope, escribe la hora en CODEGRAPH_ESTADO y la siguiente pasada
se salta si el corte fue hace menos de CODEGRAPH_ESPERA_S (por defecto 6 h). Usa taskpolicy -b (QoS fondo).
Un sync que acaba con 0 escribe 0 en el estado. Variables CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION para probar."""
import os
import plistlib
import subprocess
import tempfile
import time
import shutil

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def test_guion_y_plist():
    guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
    texto = open(guion, encoding="utf-8").read()
    assert "kern.memorystatus_vm_pressure_level" in texto and "CODEGRAPH_TOPE_S" in texto
    assert subprocess.run(["bash", "-n", guion]).returncode == 0
    with open(os.path.join(RAIZ, "scripts", "codegraph", "com.starseed.codegraph-sync.plist"), "rb") as f:
        p = plistlib.load(f)
    args = p["ProgramArguments"]
    assert args[0] == "/opt/homebrew/bin/python3"
    assert args[1].endswith("/scripts/puente/lanzador-tcc.py")
    sep = args.index("--")
    assert args[sep + 1:sep + 3] == ["/bin/bash", "/Users/alex/Documents/starseed-os-main/scripts/codegraph/sync-si-cabe.sh"]
    assert guion.endswith(args[sep + 2].split("starseed-os-main/", 1)[1])


def test_corte_deja_hora_en_estado_y_siguiente_se_salta():
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "codegraph-sync-corte")
        fake_bin = os.path.join(tmp, "codegraph")
        with open(fake_bin, "w") as f:
            f.write("#!/bin/bash\nsleep 30\n")
        os.chmod(fake_bin, 0o755)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_ESPERA_S": "3600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_NIVEL_PRESION": "1",
        })
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")

        # Primera pasada: se corta por tope
        r = subprocess.run(["bash", guion, tmp], env=env, capture_output=True, text=True, timeout=20)
        assert r.returncode != 0  # cortado por TERM
        assert os.path.exists(estado)
        with open(estado) as f:
            primer_corte = int(f.read().strip())
        assert primer_corte > 0

        # Segunda pasada: debe saltarse sin lanzar el falso
        marca = os.path.join(tmp, "fake-ran")
        with open(fake_bin, "w") as f:
            f.write(f"#!/bin/bash\ntouch {marca}\nsleep 30\n")
        os.chmod(fake_bin, 0o755)

        r2 = subprocess.run(["bash", guion, tmp], env=env, capture_output=True, text=True, timeout=5)
        assert r2.returncode == 0
        assert "me salto esta" in r2.stdout
        assert not os.path.exists(marca), "el falso no debió correr"


def test_con_espera_cero_vuelve_a_lanzar():
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "codegraph-sync-corte")
        fake_bin = os.path.join(tmp, "codegraph")
        marca = os.path.join(tmp, "fake-ran")
        with open(fake_bin, "w") as f:
            f.write(f"#!/bin/bash\ntouch {marca}\nsleep 30\n")
        os.chmod(fake_bin, 0o755)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_ESPERA_S": "0",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_NIVEL_PRESION": "1",
        })
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")

        # Poner una hora antigua en el estado
        with open(estado, "w") as f:
            f.write(str(int(time.time()) - 7200))

        r = subprocess.run(["bash", guion, tmp], env=env, capture_output=True, text=True, timeout=20)
        assert r.returncode != 0  # cortado por tope
        assert os.path.exists(marca), "el falso debió correr con ESPERA_S=0"


def test_sync_exitoso_escribe_cero_en_estado():
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "codegraph-sync-corte")
        fake_bin = os.path.join(tmp, "codegraph")
        with open(fake_bin, "w") as f:
            f.write("#!/bin/bash\nexit 0\n")
        os.chmod(fake_bin, 0o755)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_ESPERA_S": "3600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_NIVEL_PRESION": "1",
        })
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")

        r = subprocess.run(["bash", guion, tmp], env=env, capture_output=True, text=True, timeout=10)
        assert r.returncode == 0
        with open(estado) as f:
            val = f.read().strip()
        assert val == "0", f"estado debe ser 0, era '{val}'"