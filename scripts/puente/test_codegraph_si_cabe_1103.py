"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents)."""
import os
import plistlib
import subprocess
import tempfile

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


def _run_sync(env, guion, raiz="/tmp"):
    return subprocess.run(["bash", guion, raiz], env=env, capture_output=True, text=True, timeout=15)


def test_corte_guarda_estado_y_salta():
    guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "estado")
        marker = os.path.join(td, "runs")
        fake = os.path.join(td, "fake")
        with open(fake, "w") as f:
            f.write("#!/bin/bash\n")
            f.write(f'echo run >> "{marker}"\n')
            f.write("sleep 30\n")
        os.chmod(fake, 0o755)
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_BIN": fake,
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_NIVEL_PRESION": "1",
            "CODEGRAPH_ESTADO": estado,
        })
        r1 = _run_sync(env, guion)
        assert os.path.isfile(estado)
        c1 = open(estado).read().strip()
        assert c1.isdigit() and int(c1) > 0
        assert open(marker).read().strip().count("run") == 1
        r2 = _run_sync(env, guion)
        out = r2.stdout + r2.stderr
        assert "me salto esta" in out
        assert open(marker).read().strip().count("run") == 1


def test_espera_cero_relanza():
    guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "estado")
        marker = os.path.join(td, "runs")
        fake = os.path.join(td, "fake")
        with open(fake, "w") as f:
            f.write("#!/bin/bash\n")
            f.write(f'echo run >> "{marker}"\n')
            f.write("sleep 30\n")
        os.chmod(fake, 0o755)
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_BIN": fake,
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_NIVEL_PRESION": "1",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_ESPERA_S": "0",
        })
        _run_sync(env, guion)
        assert open(marker).read().strip().count("run") == 1
        _run_sync(env, guion)
        assert open(marker).read().strip().count("run") == 2


def test_sync_exito_deja_cero():
    guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "estado")
        fake = os.path.join(td, "fake")
        with open(fake, "w") as f:
            f.write("#!/bin/bash\n")
            f.write("exit 0\n")
        os.chmod(fake, 0o755)
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_BIN": fake,
            "CODEGRAPH_TOPE_S": "5",
            "CODEGRAPH_NIVEL_PRESION": "1",
            "CODEGRAPH_ESTADO": estado,
        })
        _run_sync(env, guion)
        assert os.path.isfile(estado)
        assert open(estado).read().strip() == "0"
