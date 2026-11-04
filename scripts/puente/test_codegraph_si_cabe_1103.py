"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents).
SUP0411B: (1) cuando corta un sync, escribe la hora en archivo de estado y salta si fue hace < CODEGRAPH_ESPERA_S;
(2) lanza codegraph con taskpolicy -b (QoS fondo) cuando existe; (3) CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION configurables."""
import os
import plistlib
import subprocess
import tempfile
import time

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


def _escribir_falso_codegraph(ruta_falso: str, duracion_s: int = 30) -> None:
    """Escribe un codegraph falso que duerme `duracion_s` segundos y registra cada ejecución."""
    log = ruta_falso + ".log"
    with open(ruta_falso, "w") as f:
        f.write(f"""#!/bin/bash
echo "$(date '+%s') $1 $2" >> "{log}"
if [ "$1" = "sync" ]; then
    sleep {duracion_s}
fi
exit 0
""")
    os.chmod(ruta_falso, 0o755)


def _leer_log_falso(ruta_falso: str) -> list[str]:
    log = ruta_falso + ".log"
    if not os.path.exists(log):
        return []
    with open(log, encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def _correr_sync(
    guion: str,
    falso_bin: str,
    estado: str,
    tope_s: int = 1,
    espera_s: int = 21600,
    nivel_presion: int = 1,
    raiz: str = "/tmp",
    extra_env: dict | None = None,
) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env.update({
        "CODEGRAPH_BIN": falso_bin,
        "CODEGRAPH_TOPE_S": str(tope_s),
        "CODEGRAPH_ESPERA_S": str(espera_s),
        "CODEGRAPH_NIVEL_PRESION": str(nivel_presion),
        "CODEGRAPH_ESTADO": estado,
    })
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        ["bash", guion, raiz],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_corte_deja_hora_en_estado():
    """Un sync cortado por tope deja la hora (epoch) en el archivo de estado."""
    with tempfile.TemporaryDirectory() as td:
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
        falso = os.path.join(td, "codegraph-falso")
        estado = os.path.join(td, "estado-corte")
        _escribir_falso_codegraph(falso, duracion_s=30)

        # Tope de 1s, el falso duerme 30s → será cortado
        r = _correr_sync(guion, falso, estado, tope_s=1, espera_s=0)
        assert r.returncode != 0, f"esperaba fallo por corte, rc={r.returncode}, stdout={r.stdout}, stderr={r.stderr}"

        # El archivo de estado debe contener un epoch > 0
        assert os.path.exists(estado), "no se creó archivo de estado"
        with open(estado, encoding="utf-8") as f:
            contenido = f.read().strip()
        assert contenido.isdigit(), f"estado no es epoch: {contenido!r}"
        assert int(contenido) > 0, "epoch debe ser > 0"

        # El falso debe haber sido invocado (al menos una vez)
        log = _leer_log_falso(falso)
        assert any("sync" in line for line in log), f"falso no recibió 'sync': {log}"


def test_pasada_siguiente_salta_si_corte_reciente():
    """Si el último corte fue hace < CODEGRAPH_ESPERA_S, la siguiente pasada se salta sin lanzar codegraph."""
    with tempfile.TemporaryDirectory() as td:
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
        falso = os.path.join(td, "codegraph-falso")
        estado = os.path.join(td, "estado-corte")
        _escribir_falso_codegraph(falso, duracion_s=30)

        # Primera pasada: se corta
        r1 = _correr_sync(guion, falso, estado, tope_s=1, espera_s=21600)
        assert r1.returncode != 0

        # Segunda pasada inmediata (espera_s=21600 por defecto): debe saltarse
        r2 = _correr_sync(guion, falso, estado, tope_s=1, espera_s=21600)
        assert r2.returncode == 0, f"esperaba salida 0 al saltar, rc={r2.returncode}"
        assert "me salto esta" in r2.stdout, f"mensaje de salto no encontrado: {r2.stdout}"

        # El falso NO debe haber sido invocado en la segunda pasada
        log = _leer_log_falso(falso)
        invocaciones_sync = [line for line in log if "sync" in line]
        assert len(invocaciones_sync) == 1, f"falso invocado {len(invocaciones_sync)} veces, esperaba 1: {log}"


def test_con_espera_cero_vuelve_a_lanzar():
    """Con CODEGRAPH_ESPERA_S=0, aunque haya corte reciente, vuelve a lanzar codegraph."""
    with tempfile.TemporaryDirectory() as td:
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
        falso = os.path.join(td, "codegraph-falso")
        estado = os.path.join(td, "estado-corte")
        _escribir_falso_codegraph(falso, duracion_s=30)

        # Primera pasada: se corta
        r1 = _correr_sync(guion, falso, estado, tope_s=1, espera_s=0)
        assert r1.returncode != 0

        # Segunda pasada con espera_s=0: debe volver a lanzar (y cortarse de nuevo)
        r2 = _correr_sync(guion, falso, estado, tope_s=1, espera_s=0)
        assert r2.returncode != 0, f"esperaba fallo por corte, rc={r2.returncode}"

        # El falso debe haber sido invocado DOS veces
        log = _leer_log_falso(falso)
        invocaciones_sync = [line for line in log if "sync" in line]
        assert len(invocaciones_sync) == 2, f"falso invocado {len(invocaciones_sync)} veces, esperaba 2: {log}"


def test_sync_exitoso_deja_cero_en_estado():
    """Un sync que termina con código 0 escribe 0 en el archivo de estado (no lo borra)."""
    with tempfile.TemporaryDirectory() as td:
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
        falso = os.path.join(td, "codegraph-falso")
        estado = os.path.join(td, "estado-corte")
        # Falso que sale 0 inmediatamente (sin sleep)
        _escribir_falso_codegraph(falso, duracion_s=0)

        r = _correr_sync(guion, falso, estado, tope_s=10, espera_s=0)
        assert r.returncode == 0, f"esperaba éxito, rc={r.returncode}, stderr={r.stderr}"

        # El archivo de estado debe contener exactamente "0"
        assert os.path.exists(estado), "no se creó archivo de estado tras éxito"
        with open(estado, encoding="utf-8") as f:
            contenido = f.read().strip()
        assert contenido == "0", f"estado tras éxito debe ser '0', era: {contenido!r}"


def test_usa_taskpolicy_b_cuando_existe():
    """Si /usr/sbin/taskpolicy existe, codegraph se lanza con 'taskpolicy -b' delante."""
    with tempfile.TemporaryDirectory() as td:
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
        falso = os.path.join(td, "codegraph-falso")
        estado = os.path.join(td, "estado-corte")
        taskpolicy_falso = os.path.join(td, "taskpolicy")
        _escribir_falso_codegraph(falso, duracion_s=0)

        # Creamos un taskpolicy falso que registra si se le llamó con -b
        with open(taskpolicy_falso, "w") as f:
            f.write(f"""#!/bin/bash
echo "$(date '+%s') $@" >> "{taskpolicy_falso}.log"
exec "$@"
""")
        os.chmod(taskpolicy_falso, 0o755)

        # Inyectamos PATH para que encuentre nuestro taskpolicy falso
        r = _correr_sync(
            guion, falso, estado, tope_s=10, espera_s=0,
            extra_env={"PATH": f"{td}:{os.environ['PATH']}"}
        )
        assert r.returncode == 0, f"esperaba éxito, rc={r.returncode}, stderr={r.stderr}"

        # Verificamos que taskpolicy fue llamado con -b
        with open(taskpolicy_falso + ".log", encoding="utf-8") as f:
            log_tp = f.read()
        assert "-b" in log_tp, f"taskpolicy no llamado con -b: {log_tp}"
        assert falso in log_tp, f"taskpolicy no lanzó codegraph: {log_tp}"


def test_sin_taskpolicy_lanza_directo():
    """Si /usr/sbin/taskpolicy NO existe, codegraph se lanza directo (sin taskpolicy)."""
    with tempfile.TemporaryDirectory() as td:
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
        falso = os.path.join(td, "codegraph-falso")
        estado = os.path.join(td, "estado-corte")
        _escribir_falso_codegraph(falso, duracion_s=0)

        # PATH vacío (o sin taskpolicy) → no debe encontrar taskpolicy
        r = _correr_sync(
            guion, falso, estado, tope_s=10, espera_s=0,
            extra_env={"PATH": td}  # td no tiene taskpolicy
        )
        assert r.returncode == 0, f"esperaba éxito, rc={r.returncode}, stderr={r.stderr}"

        # El falso debe haber sido invocado directamente (sin taskpolicy de por medio)
        log = _leer_log_falso(falso)
        invocaciones_sync = [line for line in log if "sync" in line]
        assert len(invocaciones_sync) == 1, f"falso invocado {len(invocaciones_sync)} veces: {log}"


def test_codegraph_bin_y_nivel_presion_configurables():
    """CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION se usan como binario y nivel de presión."""
    with tempfile.TemporaryDirectory() as td:
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
        falso = os.path.join(td, "codegraph-falso")
        estado = os.path.join(td, "estado-corte")
        _escribir_falso_codegraph(falso, duracion_s=0)

        # Usamos CODEGRAPH_NIVEL_PRESION=2 → debe saltarse por presión
        r = _correr_sync(guion, falso, estado, tope_s=10, espera_s=0, nivel_presion=2)
        assert r.returncode == 0, f"esperaba salida 0 por presión, rc={r.returncode}"
        assert "presión de memoria" in r.stdout, f"mensaje de presión no encontrado: {r.stdout}"

        # El falso NO debe haber sido invocado
        log = _leer_log_falso(falso)
        invocaciones_sync = [line for line in log if "sync" in line]
        assert len(invocaciones_sync) == 0, f"falso invocado {len(invocaciones_sync)} veces pese a presión: {log}"


def test_codegraph_bin_personalizado():
    """CODEGRAPH_BIN permite usar un binario distinto al por defecto."""
    with tempfile.TemporaryDirectory() as td:
        guion = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
        falso1 = os.path.join(td, "codegraph-falso1")
        falso2 = os.path.join(td, "codegraph-falso2")
        estado = os.path.join(td, "estado-corte")
        _escribir_falso_codegraph(falso1, duracion_s=0)
        _escribir_falso_codegraph(falso2, duracion_s=0)

        # Usamos CODEGRAPH_BIN=falso2 → debe invocar a falso2, no a falso1
        r = _correr_sync(guion, falso2, estado, tope_s=10, espera_s=0)
        assert r.returncode == 0

        log1 = _leer_log_falso(falso1)
        log2 = _leer_log_falso(falso2)
        assert not any("sync" in line for line in log1), f"falso1 invocado incorrectamente: {log1}"
        assert any("sync" in line for line in log2), f"falso2 no invocado: {log2}"