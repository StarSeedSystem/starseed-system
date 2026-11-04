"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents).

SUP0411B: cuando un sync se corta por tope, escribe la hora en CODEGRAPH_ESTADO;
la siguiente pasada se salta si fue hace < CODEGRAPH_ESPERA_S s.
Lanza codegraph con /usr/sbin/taskpolicy -b (QoS de fondo) cuando existe.
Variables CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION configurables."""
import os
import tempfile
import subprocess
import time

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
GUI = os.path.join(RAIZ, "scripts", "codegraph", "sync-si-cabe.sh")


def test_guion_y_plist():
    texto = open(GUI, encoding="utf-8").read()
    assert "kern.memorystatus_vm_pressure_level" in texto and "CODEGRAPH_TOPE_S" in texto
    assert subprocess.run(["bash", "-n", GUI]).returncode == 0
    import plistlib
    with open(os.path.join(RAIZ, "scripts", "codegraph", "com.starseed.codegraph-sync.plist"), "rb") as f:
        p = plistlib.load(f)
    args = p["ProgramArguments"]
    assert args[0] == "/opt/homebrew/bin/python3"
    assert args[1].endswith("/scripts/puente/lanzador-tcc.py")
    sep = args.index("--")
    assert args[sep + 1:sep + 3] == ["/bin/bash", "/Users/alex/Documents/starseed-os-main/scripts/codegraph/sync-si-cabe.sh"]
    assert GUI.endswith(args[sep + 2].split("starseed-os-main/", 1)[1])


def _escribir_falso_codegraph(ruta_bin, comportamiento, archivo_llamadas):
    """Crea un codegraph falso en ruta_bin.
    comportamiento: 'duerme' (duerme 30s) o 'sale0' (sale 0 al momento).
    Escribe en archivo_llamadas cada vez que se ejecuta."""
    contenido = f"""#!/bin/bash
echo "$(date '+%s') {comportamiento}" >> "{archivo_llamadas}"
if [ "{comportamiento}" = "duerme" ]; then
    sleep 30
else
    exit 0
fi
"""
    with open(ruta_bin, "w") as f:
        f.write(contenido)
    os.chmod(ruta_bin, 0o755)


def test_corte_deja_hora_en_estado():
    """Un sync cortado por tope escribe la hora (epoch) en CODEGRAPH_ESTADO."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "estado")
        bin_dir = os.path.join(tmp, "bin")
        os.makedirs(bin_dir)
        falso = os.path.join(bin_dir, "codegraph")
        llamadas = os.path.join(tmp, "llamadas")
        _escribir_falso_codegraph(falso, "duerme", llamadas)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_NIVEL_PRESION": "1",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_ESPERA_S": "21600",
        })

        # Ejecutar el script - debería cortarse tras 1s
        resultado = subprocess.run(["bash", GUI, RAIZ], env=env, capture_output=True, text=True, timeout=10)
        # El script debería haber sido cortado (código != 0, típicamente 143 SIGTERM o 1)
        assert resultado.returncode != 0

        # Verificar que se escribió la hora en el archivo de estado
        assert os.path.exists(estado)
        with open(estado) as f:
            contenido = f.read().strip()
        # Debe ser un número (epoch seconds)
        assert contenido.isdigit()
        hora_corte = int(contenido)
        ahora = int(time.time())
        assert abs(hora_corte - ahora) < 5  # escrito hace unos segundos


def test_pasada_siguiente_se_salta_si_corte_reciente():
    """Si el último corte fue hace < CODEGRAPH_ESPERA_S, la siguiente pasada se salta sin lanzar codegraph."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "estado")
        bin_dir = os.path.join(tmp, "bin")
        os.makedirs(bin_dir)
        falso = os.path.join(bin_dir, "codegraph")
        llamadas = os.path.join(tmp, "llamadas")
        _escribir_falso_codegraph(falso, "sale0", llamadas)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_NIVEL_PRESION": "1",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_ESPERA_S": "21600",  # 6 horas
        })

        # Simular un corte reciente (ahora - 100 segundos)
        hora_reciente = str(int(time.time()) - 100)
        with open(estado, "w") as f:
            f.write(hora_reciente)

        # Ejecutar el script - debería saltarse la ejecución
        resultado = subprocess.run(["bash", GUI, RAIZ], env=env, capture_output=True, text=True, timeout=10)
        assert resultado.returncode == 0
        assert "me salto esta" in resultado.stdout

        # Verificar que NO se llamó al codegraph falso
        assert not os.path.exists(llamadas), "codegraph no debería haberse ejecutado"


def test_con_espera_cero_vuelve_a_lanzar():
    """Con CODEGRAPH_ESPERA_S=0, vuelve a lanzar codegraph aunque haya corte reciente."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "estado")
        bin_dir = os.path.join(tmp, "bin")
        os.makedirs(bin_dir)
        falso = os.path.join(bin_dir, "codegraph")
        llamadas = os.path.join(tmp, "llamadas")
        _escribir_falso_codegraph(falso, "sale0", llamadas)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_NIVEL_PRESION": "1",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_ESPERA_S": "0",  # Sin espera
        })

        # Simular un corte reciente
        hora_reciente = str(int(time.time()) - 100)
        with open(estado, "w") as f:
            f.write(hora_reciente)

        # Ejecutar el script - debería lanzar codegraph
        resultado = subprocess.run(["bash", GUI, RAIZ], env=env, capture_output=True, text=True, timeout=10)
        assert resultado.returncode == 0

        # Verificar que SÍ se llamó al codegraph falso
        assert os.path.exists(llamadas), "codegraph debería haberse ejecutado"
        with open(llamadas) as f:
            lineas = f.readlines()
        assert len(lineas) == 1


def test_sync_exitoso_escribe_cero_en_estado():
    """Un sync que termina con código 0 escribe 0 en CODEGRAPH_ESTADO (no lo borra)."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "estado")
        bin_dir = os.path.join(tmp, "bin")
        os.makedirs(bin_dir)
        falso = os.path.join(bin_dir, "codegraph")
        llamadas = os.path.join(tmp, "llamadas")
        _escribir_falso_codegraph(falso, "sale0", llamadas)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_NIVEL_PRESION": "1",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_ESPERA_S": "21600",
        })

        # Ejecutar el script - debería terminar bien
        resultado = subprocess.run(["bash", GUI, RAIZ], env=env, capture_output=True, text=True, timeout=15)
        assert resultado.returncode == 0

        # Verificar que se escribió 0 en el archivo de estado
        assert os.path.exists(estado)
        with open(estado) as f:
            contenido = f.read().strip()
        assert contenido == "0"


def test_usa_taskpolicy_si_existe():
    """El script usa /usr/sbin/taskpolicy -b cuando existe."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "estado")
        bin_dir = os.path.join(tmp, "bin")
        os.makedirs(bin_dir)
        falso = os.path.join(bin_dir, "codegraph")
        llamadas = os.path.join(tmp, "llamadas")
        # Codegraph falso que registra cómo fue llamado
        contenido = f"""#!/bin/bash
echo "$(date '+%s') $@" >> "{llamadas}"
exit 0
"""
        with open(falso, "w") as f:
            f.write(contenido)
        os.chmod(falso, 0o755)

        # Crear un taskpolicy falso en PATH
        taskpolicy_dir = os.path.join(tmp, "taskpolicy_bin")
        os.makedirs(taskpolicy_dir)
        taskpolicy_falso = os.path.join(taskpolicy_dir, "taskpolicy")
        with open(taskpolicy_falso, "w") as f:
            f.write(f"""#!/bin/bash
echo "$(date '+%s') taskpolicy $@" >> "{llamadas}"
exec "$@"
""")
        os.chmod(taskpolicy_falso, 0o755)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_NIVEL_PRESION": "1",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_ESPERA_S": "21600",
            "PATH": f"{taskpolicy_dir}:{env['PATH']}",
        })

        resultado = subprocess.run(["bash", GUI, RAIZ], env=env, capture_output=True, text=True, timeout=15)
        assert resultado.returncode == 0

        # Verificar que se llamó a taskpolicy -b
        with open(llamadas) as f:
            lineas = f.read()
        assert "taskpolicy -b" in lineas


def test_variables_codegraph_bin_y_nivel_presion():
    """CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION son configurables."""
    with tempfile.TemporaryDirectory() as tmp:
        estado = os.path.join(tmp, "estado")
        bin_dir = os.path.join(tmp, "bin")
        os.makedirs(bin_dir)
        falso = os.path.join(bin_dir, "mi-codegraph")
        llamadas = os.path.join(tmp, "llamadas")
        _escribir_falso_codegraph(falso, "sale0", llamadas)

        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_NIVEL_PRESION": "3",  # Valor personalizado
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_ESPERA_S": "21600",
        })

        resultado = subprocess.run(["bash", GUI, RAIZ], env=env, capture_output=True, text=True, timeout=15)
        assert resultado.returncode == 0

        # Verificar que usó CODEGRAPH_BIN personalizado
        assert os.path.exists(llamadas)
        # Verificar que la presión de memoria usada fue la de CODEGRAPH_NIVEL_PRESION (3 >= 2 -> salta)
        # Pero como el codegraph falso sale 0, el test pasa si se ejecutó
        # La presión 3 debería hacer que se salte ANTES de lanzar codegraph
        # Esperamos que NO se ejecute codegraph
        # Nota: el script lee CODEGRAPH_NIVEL_PRESION al inicio
        with open(llamadas) as f:
            lineas = f.readlines()
        # Con presión 3 (>=2), debería saltarse la ejecución
        assert len(lineas) == 0, "Con CODEGRAPH_NIVEL_PRESION=3 debería saltarse la ejecución"


if __name__ == "__main__":
    test_guion_y_plist()
    print("test_guion_y_plist OK")
    test_corte_deja_hora_en_estado()
    print("test_corte_deja_hora_en_estado OK")
    test_pasada_siguiente_se_salta_si_corte_reciente()
    print("test_pasada_siguiente_se_salta_si_corte_reciente OK")
    test_con_espera_cero_vuelve_a_lanzar()
    print("test_con_espera_cero_vuelve_a_lanzar OK")
    test_sync_exitoso_escribe_cero_en_estado()
    print("test_sync_exitoso_escribe_cero_en_estado OK")
    test_usa_taskpolicy_si_existe()
    print("test_usa_taskpolicy_si_existe OK")
    test_variables_codegraph_bin_y_nivel_presion()
    print("test_variables_codegraph_bin_y_nivel_presion OK")
    print("\nTODOS LOS TESTS PASARON")