"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents).
SUP0411B: si un sync se corta por tope, guarda la hora; si fue hace < CODEGRAPH_ESPERA_S se salta;
un sync que acaba bien escribe 0 en el estado. codegraph se lanza con taskpolicy -b cuando existe.
"""
import os
import plistlib
import subprocess
import tempfile
import time
import shutil

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
GUIOR = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")


def test_guion_y_plist():
    texto = open(GUIOR, encoding="utf-8").read()
    assert "kern.memorystatus_vm_pressure_level" in texto and "CODEGRAPH_TOPE_S" in texto
    assert subprocess.run(["bash", "-n", GUIOR]).returncode == 0
    with open(os.path.join(RAIZ, "scripts", "codegraph", "com.starseed.codegraph-sync.plist"), "rb") as f:
        p = plistlib.load(f)
    args = p["ProgramArguments"]
    assert args[0] == "/opt/homebrew/bin/python3"
    assert args[1].endswith("/scripts/puente/lanzador-tcc.py")
    sep = args.index("--")
    assert args[sep + 1:sep + 3] == ["/bin/bash", "/Users/alex/Documents/starseed-os-main/scripts/codegraph/sync-si-cabe.sh"]
    assert GUIOR.endswith(args[sep + 2].split("starseed-os-main/", 1)[1])


def _correr_guion(env_extra=None, timeout=30):
    env = dict(os.environ)
    env.update({
        "CODEGRAPH_TOPE_S": "1",
        "CODEGRAPH_NIVEL_PRESION": "1",
        "CODEGRAPH_BIN": env_extra.get("CODEGRAPH_BIN", "") if env_extra else "",
    })
    if env_extra:
        env.update(env_extra)
    # Remove empty values
    env = {k: v for k, v in env.items() if v != ""}
    return subprocess.run(["bash", GUIOR, "/tmp"], env=env, capture_output=True, text=True, timeout=timeout)


def test_corte_deja_hora_en_estado():
    """Un corte por tope escribe la hora (epoch) en el archivo de estado."""
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "codegraph-sync-corte")
        # fake codegraph que duerme 30s (más que el tope de 1s)
        fake_bin = os.path.join(td, "codegraph")
        with open(fake_bin, "w") as f:
            f.write("#!/bin/bash\nsleep 30\n")
        os.chmod(fake_bin, 0o755)

        env = {
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_ESPERA_S": "21600",
        }
        res = _correr_guion(env, timeout=10)
        # Debe terminar por timeout (cortado por el vigilante), código != 0
        assert res.returncode != 0
        # El archivo de estado debe existir y contener un epoch > 0
        assert os.path.exists(estado)
        contenido = open(estado).read().strip()
        assert contenido.isdigit()
        assert int(contenido) > 0


def test_pasada_siguiente_se_salta_si_corte_reciente():
    """Si el último corte fue hace < CODEGRAPH_ESPERA_S, la siguiente pasada se salta sin lanzar codegraph."""
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "codegraph-sync-corte")
        fake_bin = os.path.join(td, "codegraph")
        ejecuciones = os.path.join(td, "ejecuciones.log")
        with open(fake_bin, "w") as f:
            f.write(f"#!/bin/bash\necho $(date +%s) >> {ejecuciones}\nsleep 30\n")
        os.chmod(fake_bin, 0o755)

        env_base = {
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_ESPERA_S": "21600",
        }

        # Primera pasada: se corta y escribe la hora
        _correr_guion(env_base, timeout=10)
        assert os.path.exists(ejecuciones)
        primera = open(ejecuciones).read().strip()

        # Segunda pasada inmediata: debe saltarse (no añadir al log)
        _correr_guion(env_base, timeout=5)
        segunda = open(ejecuciones).read().strip()
        assert segunda == primera, "La segunda pasada no debió lanzar codegraph"


def test_con_espera_cero_vuelve_a_lanzar():
    """Con CODEGRAPH_ESPERA_S=0, la pasada siguiente sí lanza codegraph aunque haya corte reciente."""
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "codegraph-sync-corte")
        fake_bin = os.path.join(td, "codegraph")
        ejecuciones = os.path.join(td, "ejecuciones.log")
        with open(fake_bin, "w") as f:
            f.write(f"#!/bin/bash\necho $(date +%s) >> {ejecuciones}\nsleep 30\n")
        os.chmod(fake_bin, 0o755)

        env_base = {
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_ESPERA_S": "0",  # Sin espera
        }

        # Primera pasada: se corta
        _correr_guion(env_base, timeout=10)
        assert os.path.exists(ejecuciones)
        primera = open(ejecuciones).read().strip()

        # Segunda pasada con ESPERA_S=0: debe lanzar de nuevo
        _correr_guion(env_base, timeout=10)
        segunda = open(ejecuciones).read().strip()
        assert segunda != primera, "Con ESPERA_S=0 debió lanzar codegraph de nuevo"


def test_sync_exitoso_escribe_cero_en_estado():
    """Un sync que sale con 0 escribe 0 en el archivo de estado (no lo borra)."""
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "codegraph-sync-corte")
        fake_bin = os.path.join(td, "codegraph")
        with open(fake_bin, "w") as f:
            f.write("#!/bin/bash\nexit 0\n")
        os.chmod(fake_bin, 0o755)

        env = {
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_ESPERA_S": "21600",
        }
        res = _correr_guion(env, timeout=5)
        assert res.returncode == 0
        assert os.path.exists(estado)
        contenido = open(estado).read().strip()
        assert contenido == "0"


def test_taskpolicy_se_usa_si_existe():
    """Si /usr/sbin/taskpolicy existe, codegraph se lanza con taskpolicy -b."""
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "codegraph-sync-corte")
        fake_taskpolicy = os.path.join(td, "taskpolicy")
        fake_bin = os.path.join(td, "codegraph")
        log = os.path.join(td, "cmd.log")
        # taskpolicy falso que registra cómo fue llamado y ejecuta el comando real (saltando -b)
        with open(fake_taskpolicy, "w") as f:
            f.write(f"#!/bin/bash\necho \"$@\" >> {log}\nshift\nexec \"$@\"\n")
        os.chmod(fake_taskpolicy, 0o755)
        # codegraph falso que sale 0
        with open(fake_bin, "w") as f:
            f.write("#!/bin/bash\nexit 0\n")
        os.chmod(fake_bin, 0o755)

        env = {
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_ESPERA_S": "21600",
            "PATH": td + ":" + os.environ["PATH"],  # taskpolicy falso en PATH
        }
        res = _correr_guion(env, timeout=5)
        assert res.returncode == 0
        assert os.path.exists(log)
        cmd = open(log).read().strip()
        assert cmd.startswith("-b "), f"Debe llamar taskpolicy -b, got: {cmd}"


def test_sin_taskpolicy_lanza_directo():
    """Si /usr/sbin/taskpolicy NO existe, codegraph se lanza directo."""
    with tempfile.TemporaryDirectory() as td:
        estado = os.path.join(td, "codegraph-sync-corte")
        fake_bin = os.path.join(td, "codegraph")
        log = os.path.join(td, "cmd.log")
        with open(fake_bin, "w") as f:
            f.write(f"#!/bin/bash\necho \"$@\" >> {log}\nexit 0\n")
        os.chmod(fake_bin, 0o755)

        env = {
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": fake_bin,
            "CODEGRAPH_ESPERA_S": "21600",
            "PATH": td + ":/usr/bin:/bin",  # Sin taskpolicy en PATH
        }
        res = _correr_guion(env, timeout=5)
        assert res.returncode == 0
        assert os.path.exists(log)
        cmd = open(log).read().strip()
        assert "taskpolicy" not in cmd, f"No debe usar taskpolicy, got: {cmd}"