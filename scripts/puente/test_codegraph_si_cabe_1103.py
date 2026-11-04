"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents).
SUP0411B: si un sync se corta por tope, espera CODEGRAPH_ESPERA_S antes de reintentar;
lanza con taskpolicy -b (QoS fondo) cuando existe; variables CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION."""
import os
import plistlib
import subprocess
import tempfile
import time
import shutil

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
GUION = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")


def test_guion_y_plist():
    texto = open(GUION, encoding="utf-8").read()
    assert "kern.memorystatus_vm_pressure_level" in texto and "CODEGRAPH_TOPE_S" in texto
    assert subprocess.run(["bash", "-n", GUION]).returncode == 0
    with open(os.path.join(RAIZ, "scripts", "codegraph", "com.starseed.codegraph-sync.plist"), "rb") as f:
        p = plistlib.load(f)
    args = p["ProgramArguments"]
    assert args[0] == "/opt/homebrew/bin/python3"
    assert args[1].endswith("/scripts/puente/lanzador-tcc.py")
    sep = args.index("--")
    assert args[sep + 1:sep + 3] == ["/bin/bash", "/Users/alex/Documents/starseed-os-main/scripts/codegraph/sync-si-cabe.sh"]
    assert GUION.endswith(args[sep + 2].split("starseed-os-main/", 1)[1])


def _correr_guion(env: dict, timeout: int = 30) -> subprocess.CompletedProcess:
    """Ejecuta el guion con el entorno dado y captura salida."""
    entorno = dict(os.environ)
    entorno.update(env)
    return subprocess.run(["bash", GUION], env=entorno, capture_output=True, text=True, timeout=timeout)


def test_salto_por_presion_memoria():
    """Con CODEGRAPH_NIVEL_PRESION >= 2 se salta y sale 0."""
    res = _correr_guion({"CODEGRAPH_NIVEL_PRESION": "2", "CODEGRAPH_TOPE_S": "1"})
    assert res.returncode == 0
    assert "presión de memoria 2" in res.stdout


def test_corte_por_tope_deja_hora_en_estado():
    """Un sync que se corta por tope escribe la hora (epoch) en CODEGRAPH_ESTADO."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "corte")
        falso = os.path.join(tmp, "codegraph")
        with open(falso, "w") as f:
            f.write("#!/bin/bash\nsleep 30\n")
        os.chmod(falso, 0o755)

        res = _correr_guion({
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_ESPERA_S": "3600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_NIVEL_PRESION": "1",
        }, timeout=10)
        assert res.returncode != 0
        assert os.path.exists(estado)
        corte = int(open(estado).read().strip())
        assert corte > 0
        assert abs(corte - int(time.time())) < 5


def test_pasada_siguiente_se_salta_si_corte_reciente():
    """Si el último corte fue hace menos de CODEGRAPH_ESPERA_S, la pasada siguiente no lanza el falso."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "corte")
        falso = os.path.join(tmp, "codegraph")
        ejecuciones = os.path.join(tmp, "ejecuciones")
        with open(falso, "w") as f:
            f.write(f"#!/bin/bash\necho $$ >> {ejecuciones}\nsleep 30\n")
        os.chmod(falso, 0o755)

        # Primera pasada: se corta y deja hora en estado
        _correr_guion({
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_ESPERA_S": "3600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_NIVEL_PRESION": "1",
        }, timeout=10)

        # Leer PIDs de la primera pasada
        pids_antes = open(ejecuciones).read().strip().split() if os.path.exists(ejecuciones) else []

        # Segunda pasada inmediata: debe saltarse sin lanzar el falso
        res = _correr_guion({
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_ESPERA_S": "3600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_NIVEL_PRESION": "1",
        }, timeout=10)
        assert res.returncode == 0
        assert "la última pasada se cortó hace" in res.stdout
        # No debe haber NUEVOS PIDs en el archivo
        pids_despues = open(ejecuciones).read().strip().split() if os.path.exists(ejecuciones) else []
        assert pids_despues == pids_antes


def test_con_espera_cero_vuelve_a_lanzar():
    """Con CODEGRAPH_ESPERA_S=0 vuelve a lanzar el falso aunque el corte sea reciente."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "corte")
        falso = os.path.join(tmp, "codegraph")
        ejecuciones = os.path.join(tmp, "ejecuciones")
        with open(falso, "w") as f:
            f.write(f"#!/bin/bash\necho $$ >> {ejecuciones}\nexit 0\n")
        os.chmod(falso, 0o755)

        # Simular un corte reciente escribiendo hora actual en estado
        with open(estado, "w") as f:
            f.write(str(int(time.time())))

        res = _correr_guion({
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_ESPERA_S": "0",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_NIVEL_PRESION": "1",
        }, timeout=10)
        assert res.returncode == 0
        assert os.path.exists(ejecuciones)
        assert open(ejecuciones).read().strip() != ""


def test_sync_exitoso_escribe_cero_en_estado():
    """Un sync que termina con código 0 escribe 0 en el archivo de estado (no lo borra)."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "corte")
        falso = os.path.join(tmp, "codegraph")
        with open(falso, "w") as f:
            f.write("#!/bin/bash\nexit 0\n")
        os.chmod(falso, 0o755)

        # Poner una hora vieja en estado para que no se salte
        with open(estado, "w") as f:
            f.write(str(int(time.time()) - 100000))

        res = _correr_guion({
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_ESPERA_S": "3600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_NIVEL_PRESION": "1",
        }, timeout=10)
        assert res.returncode == 0
        assert os.path.exists(estado)
        assert open(estado).read().strip() == "0"


def test_usa_taskpolicy_cuando_existe():
    """Si /usr/sbin/taskpolicy existe, el guion lo usa para lanzar codegraph."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "corte")
        falso = os.path.join(tmp, "codegraph")
        taskpolicy_falso = os.path.join(tmp, "taskpolicy")
        capturado = os.path.join(tmp, "capturado")
        with open(falso, "w") as f:
            f.write(f"#!/bin/bash\necho $@ >> {capturado}\nexit 0\n")
        os.chmod(falso, 0o755)
        with open(taskpolicy_falso, "w") as f:
            f.write(f"#!/bin/bash\necho taskpolicy $@ >> {capturado}\nexec \"$@\"\n")
        os.chmod(taskpolicy_falso, 0o755)

        # Poner el taskpolicy falso en PATH
        path_con_taskpolicy = f"{tmp}:{os.environ['PATH']}"

        res = _correr_guion({
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_ESPERA_S": "3600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "PATH": path_con_taskpolicy,
        }, timeout=10)
        assert res.returncode == 0
        assert os.path.exists(capturado)
        contenido = open(capturado).read()
        assert "taskpolicy" in contenido
        assert "-b" in contenido


def test_no_usa_taskpolicy_si_no_existe():
    """Si /usr/sbin/taskpolicy NO existe, el guion lanza codegraph directamente."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "corte")
        falso = os.path.join(tmp, "codegraph")
        capturado = os.path.join(tmp, "capturado")
        with open(falso, "w") as f:
            f.write(f"#!/bin/bash\necho $@ >> {capturado}\nexit 0\n")
        os.chmod(falso, 0o755)

        # PATH SIN taskpolicy
        path_sin_taskpolicy = "/usr/bin:/bin"

        res = _correr_guion({
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_ESPERA_S": "3600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "PATH": path_sin_taskpolicy,
        }, timeout=10)
        assert res.returncode == 0
        assert os.path.exists(capturado)
        contenido = open(capturado).read()
        assert "taskpolicy" not in contenido