"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents).
SUP0411B: si un sync se corta por tope, guarda la hora y espera CODEGRAPH_ESPERA_S antes de reintentar;
lanza codegraph con taskpolicy -b (QoS fondo) cuando existe; CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION
para pruebas."""
import os
import plistlib
import subprocess
import tempfile
import time

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
GUION = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")
# (Supervisión 1104b) Con la Mac a carga 50–60 el codegraph falso, lanzado con `taskpolicy -b`, tardaba más de
# 1 s en arrancar: el vigilante lo cortaba antes de que escribiera su línea (FileNotFoundError, 2 de 3 vueltas).
# El tope de las pruebas deja tiempo a que arranque, y el plazo de cada vuelta aguanta la Mac cargada.
TOPE_PRUEBA = "10"
PLAZO_PRUEBA = 90


def test_guion_y_plist():
    texto = open(GUION, encoding="utf-8").read()
    assert "kern.memorystatus_vm_pressure_level" in texto and "CODEGRAPH_TOPE_S" in texto
    assert subprocess.run(["bash", "-n", GUION]).returncode == 0
    with open(os.path.join(RAIZ, "scripts", "codegraph", "com.starseed.codegraph-sync.plist"), "rb") as f:
        p = plistlib.load(f)
    args = p["ProgramArguments"]
    # (SUP0311D, 03-11) Con «/bin/bash guion» launchd daba «Operation not permitted» en cada pasada:
    # el guion vive en ~/Documents y /bin/bash no tiene permiso de disco. El programa es python3.
    assert args[0] == "/opt/homebrew/bin/python3"
    assert args[1].endswith("/scripts/puente/lanzador-tcc.py")
    sep = args.index("--")
    assert args[sep + 1:sep + 3] == ["/bin/bash", "/Users/alex/Documents/starseed-os-main/scripts/codegraph/sync-si-cabe.sh"]
    assert GUION.endswith(args[sep + 2].split("starseed-os-main/", 1)[1])


def _escribir_falso_codegraph(ruta_bin, comportamiento, registro_ejecuciones):
    """Escribe un codegraph falso en ruta_bin.
    comportamiento: 'duerme' (duerme 30s) o 'exito' (sale 0 al momento).
    registro_ejecuciones: archivo donde escribir una línea cada vez que se ejecuta."""
    with open(ruta_bin, "w") as f:
        f.write(f"""#!/bin/bash
echo "$(date +%s) codegraph-falso {comportamiento} pid=$$" >> "{registro_ejecuciones}"
if [ "{comportamiento}" = "duerme" ]; then
  sleep 120
fi
exit 0
""")
    os.chmod(ruta_bin, 0o755)


def test_corte_deja_marca_y_siguiente_salta():
    """Un sync cortado por tope deja la hora en el estado; la pasada siguiente se salta sin lanzar el falso."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "codegraph-sync-corte")
        bin_falso = os.path.join(tmp, "codegraph")
        registro = os.path.join(tmp, "ejecuciones.log")
        raiz_falsa = os.path.join(tmp, "repo")
        os.makedirs(raiz_falsa, exist_ok=True)

        _escribir_falso_codegraph(bin_falso, "duerme", registro)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": TOPE_PRUEBA,
            "CODEGRAPH_ESPERA_S": "21600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": bin_falso,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "HOME": tmp,
        })

        # Primera pasada: se corta por tope (1s) → debe escribir timestamp en estado
        r1 = subprocess.run(["bash", GUION, raiz_falsa], env=env, capture_output=True, text=True, timeout=PLAZO_PRUEBA)
        assert r1.returncode != 0, "La primera pasada debía ser cortada (returncode != 0)"

        # Verificar que se escribió timestamp (>0) en el archivo de estado
        assert os.path.exists(estado), "Debe existir el archivo de estado tras el corte"
        with open(estado) as f:
            corte1 = int(f.read().strip() or "0")
        assert corte1 > 0, f"El estado debe contener timestamp >0, tiene: {corte1}"

        # Verificar que el falso codegraph se ejecutó una vez
        time.sleep(0.5)
        with open(registro) as f:
            lineas1 = f.read().strip().splitlines()
        assert len(lineas1) == 1, f"El falso codegraph debió ejecutarse 1 vez, se ejecutó {len(lineas1)}"

        # Segunda pasada (inmediata): debe saltarse sin lanzar el falso
        r2 = subprocess.run(["bash", GUION, raiz_falsa], env=env, capture_output=True, text=True, timeout=PLAZO_PRUEBA)
        assert r2.returncode == 0, "La segunda pasada debe salir con 0 (salto)"

        # Verificar que el falso NO se ejecutó de nuevo
        time.sleep(0.5)
        with open(registro) as f:
            lineas2 = f.read().strip().splitlines()
        assert len(lineas2) == 1, f"El falso codegraph no debió ejecutarse en la segunda pasada, se ejecutó {len(lineas2)}"

        # Verificar mensaje de salto en stdout
        assert "me salgo esta" in r2.stdout or "me salgo esta" in r2.stderr


def test_espera_cero_vuelve_a_lanzar():
    """Con CODEGRAPH_ESPERA_S=0, tras un corte vuelve a lanzar el falso."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "codegraph-sync-corte")
        bin_falso = os.path.join(tmp, "codegraph")
        registro = os.path.join(tmp, "ejecuciones.log")
        raiz_falsa = os.path.join(tmp, "repo")
        os.makedirs(raiz_falsa, exist_ok=True)

        _escribir_falso_codegraph(bin_falso, "duerme", registro)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": TOPE_PRUEBA,
            "CODEGRAPH_ESPERA_S": "0",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": bin_falso,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "HOME": tmp,
        })

        # Primera pasada: se corta por tope
        r1 = subprocess.run(["bash", GUION, raiz_falsa], env=env, capture_output=True, text=True, timeout=PLAZO_PRUEBA)
        assert r1.returncode != 0

        time.sleep(0.5)
        with open(registro) as f:
            lineas1 = f.read().strip().splitlines()
        assert len(lineas1) == 1

        # Segunda pasada con ESPERA_S=0: debe volver a lanzar el falso (y cortarlo de nuevo)
        r2 = subprocess.run(["bash", GUION, raiz_falsa], env=env, capture_output=True, text=True, timeout=PLAZO_PRUEBA)
        assert r2.returncode != 0

        time.sleep(0.5)
        with open(registro) as f:
            lineas2 = f.read().strip().splitlines()
        assert len(lineas2) == 2, f"El falso codegraph debió ejecutarse 2 veces, se ejecutó {len(lineas2)}"


def test_sync_exitoso_deja_cero_en_estado():
    """Un sync que termina con éxito (exit 0) deja 0 en el archivo de estado."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "codegraph-sync-corte")
        bin_falso = os.path.join(tmp, "codegraph")
        registro = os.path.join(tmp, "ejecuciones.log")
        raiz_falsa = os.path.join(tmp, "repo")
        os.makedirs(raiz_falsa, exist_ok=True)

        _escribir_falso_codegraph(bin_falso, "exito", registro)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": TOPE_PRUEBA,
            "CODEGRAPH_ESPERA_S": "21600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": bin_falso,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "HOME": tmp,
        })

        # Ejecutar sync que termina bien
        r = subprocess.run(["bash", GUION, raiz_falsa], env=env, capture_output=True, text=True, timeout=PLAZO_PRUEBA)
        assert r.returncode == 0, f"Sync exitoso debe retornar 0, retornó {r.returncode}: {r.stderr}"

        # Verificar que el estado es 0
        assert os.path.exists(estado), "Debe existir el archivo de estado tras sync exitoso"
        with open(estado) as f:
            valor = f.read().strip()
        assert valor == "0", f"Estado debe ser '0' tras éxito, tiene: '{valor}'"

        # Verificar que el falso se ejecutó
        time.sleep(0.5)
        with open(registro) as f:
            lineas = f.read().strip().splitlines()
        assert len(lineas) == 1, "El falso codegraph debió ejecutarse 1 vez"


def test_taskpolicy_b_si_existe():
    """Si /usr/sbin/taskpolicy existe, el falso codegraph se lanza con taskpolicy -b."""
    # Este test verifica que el guion construye el comando con taskpolicy cuando existe.
    # En la mayoría de sistemas no macOS no existirá, pero en macOS sí.
    # Aquí solo verificamos que el guion contiene la lógica.
    texto = open(GUION, encoding="utf-8").read()
    assert "taskpolicy" in texto
    assert "command -v /usr/sbin/taskpolicy" in texto
    assert "/usr/sbin/taskpolicy -b" in texto


def test_codegraph_bin_y_nivel_presion_configurables():
    """CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION son configurables por variable de entorno."""
    texto = open(GUION, encoding="utf-8").read()
    assert "CODEGRAPH_BIN" in texto
    assert "CODEGRAPH_NIVEL_PRESION" in texto
    assert "/Users/alex/.local/bin/codegraph" in texto  # valor por defecto
    assert "kern.memorystatus_vm_pressure_level" in texto  # origen por defecto de NIVEL_PRESION