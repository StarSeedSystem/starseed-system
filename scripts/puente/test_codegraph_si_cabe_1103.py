"""1103 · AA: el sync de codegraph se salta con presión de memoria y tiene tope de tiempo.
SUP0311D: launchd lo lanza con python3 y lanzador-tcc.py (TCC no deja a /bin/bash leer en ~/Documents).
SUP0411B: tras un corte por tope, guarda la hora; si el último corte fue hace < CODEGRAPH_ESPERA_S s,
salta la pasada. Lanza con taskpolicy -b cuando existe. CODEGRAPH_BIN y CODEGRAPH_NIVEL_PRESION configurables.
"""
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
    assert "CODEGRAPH_ESTADO" in texto and "CODEGRAPH_ESPERA_S" in texto
    assert "CODEGRAPH_BIN" in texto and "CODEGRAPH_NIVEL_PRESION" in texto
    assert "/usr/sbin/taskpolicy" in texto
    assert subprocess.run(["bash", "-n", GUION]).returncode == 0
    with open(os.path.join(RAIZ, "scripts", "codegraph", "com.starseed.codegraph-sync.plist"), "rb") as f:
        p = plistlib.load(f)
    args = p["ProgramArguments"]
    assert args[0] == "/opt/homebrew/bin/python3"
    assert args[1].endswith("/scripts/puente/lanzador-tcc.py")
    sep = args.index("--")
    assert args[sep + 1:sep + 3] == ["/bin/bash", "/Users/alex/Documents/starseed-os-main/scripts/codegraph/sync-si-cabe.sh"]
    assert GUION.endswith(args[sep + 2].split("starseed-os-main/", 1)[1])


def _crear_falso_codegraph(tmpdir, comportamiento="duerme", archivo_registro=None):
    """Crea un falso codegraph en tmpdir.
    comportamiento: "duerme" (duerme 30s), "exito" (sale 0 al momento), "falla" (sale 1 al momento)
    archivo_registro: si se da, escribe una línea cada vez que se ejecuta.
    """
    falso = os.path.join(tmpdir, "codegraph")
    if comportamiento == "duerme":
        contenido = '''#!/bin/bash
if [ "$1" = "sync" ]; then
'''
        if archivo_registro:
            contenido += f'    echo "$(date +%s) ejecutado" >>"{archivo_registro}"\n'
        contenido += '''    sleep 30
    exit 0
fi
exit 1
'''
    elif comportamiento == "exito":
        contenido = '''#!/bin/bash
if [ "$1" = "sync" ]; then
'''
        if archivo_registro:
            contenido += f'    echo "$(date +%s) ejecutado" >>"{archivo_registro}"\n'
        contenido += '''    exit 0
fi
exit 1
'''
    elif comportamiento == "falla":
        contenido = '''#!/bin/bash
if [ "$1" = "sync" ]; then
'''
        if archivo_registro:
            contenido += f'    echo "$(date +%s) ejecutado" >>"{archivo_registro}"\n'
        contenido += '''    exit 1
fi
exit 1
'''
    else:
        raise ValueError(f"comportamiento desconocido: {comportamiento}")
    with open(falso, "w") as f:
        f.write(contenido)
    os.chmod(falso, 0o755)
    return falso


def test_corte_deja_hora_en_estado():
    """Un sync que se corta por tope deja la hora (epoch) en el archivo de estado."""
    with tempfile.TemporaryDirectory() as tmpdir:
        estado = os.path.join(tmpdir, "estado")
        registro = os.path.join(tmpdir, "registro")
        falso = _crear_falso_codegraph(tmpdir, "duerme", registro)
        
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_ESPERA_S": "21600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "HOME": tmpdir,  # para que el directorio por defecto exista
        })
        
        # Ejecutar el guion - debería cortarse tras 1 segundo
        resultado = subprocess.run(
            ["bash", GUION, tmpdir],
            env=env,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        # Verificar que el archivo de estado contiene un timestamp (no 0)
        assert os.path.exists(estado), f"Archivo de estado no creado. stdout: {resultado.stdout}, stderr: {resultado.stderr}"
        with open(estado) as f:
            contenido = f.read().strip()
        assert contenido.isdigit(), f"Estado debería ser epoch: '{contenido}'"
        assert int(contenido) > 0, f"Estado debería ser > 0: '{contenido}'"
        
        # Verificar que el falso codegraph se ejecutó
        assert os.path.exists(registro), "El falso codegraph no se ejecutó"
        with open(registro) as f:
            lineas = f.readlines()
        assert len(lineas) == 1, f"Debería ejecutarse una vez: {lineas}"


def test_pasada_siguiente_se_salta_sin_lanzar_falso():
    """Tras un corte, la pasada siguiente se salta sin lanzar el falso codegraph."""
    with tempfile.TemporaryDirectory() as tmpdir:
        estado = os.path.join(tmpdir, "estado")
        registro = os.path.join(tmpdir, "registro")
        falso = _crear_falso_codegraph(tmpdir, "duerme", registro)
        
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_ESPERA_S": "21600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "HOME": tmpdir,
        })
        
        # Primera ejecución: se corta
        resultado1 = subprocess.run(
            ["bash", GUION, tmpdir],
            env=env,
            capture_output=True,
            text=True,
            timeout=30
        )
        assert os.path.exists(estado)
        with open(estado) as f:
            ts1 = int(f.read().strip())
        assert ts1 > 0
        
        # Segunda ejecución inmediata: debería saltarse
        resultado2 = subprocess.run(
            ["bash", GUION, tmpdir],
            env=env,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        # Verificar que salió con 0 y no ejecutó el falso
        assert resultado2.returncode == 0, f"Debería salir 0: {resultado2.returncode}, stdout: {resultado2.stdout}"
        assert "me salto esta" in resultado2.stdout, f"Debería loguear salto: {resultado2.stdout}"
        
        # Verificar que el falso NO se ejecutó de nuevo
        with open(registro) as f:
            lineas = f.readlines()
        assert len(lineas) == 1, f"Falso no debería ejecutarse de nuevo: {lineas}"


def test_con_espera_cero_vuelve_a_lanzar():
    """Con CODEGRAPH_ESPERA_S=0, vuelve a lanzar el codegraph tras un corte."""
    with tempfile.TemporaryDirectory() as tmpdir:
        estado = os.path.join(tmpdir, "estado")
        registro = os.path.join(tmpdir, "registro")
        falso = _crear_falso_codegraph(tmpdir, "duerme", registro)
        
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "1",
            "CODEGRAPH_ESPERA_S": "0",  # Sin espera
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "HOME": tmpdir,
        })
        
        # Primera ejecución: se corta
        resultado1 = subprocess.run(
            ["bash", GUION, tmpdir],
            env=env,
            capture_output=True,
            text=True,
            timeout=30
        )
        assert os.path.exists(estado)
        with open(estado) as f:
            ts1 = int(f.read().strip())
        assert ts1 > 0
        
        # Segunda ejecución inmediata con ESPERA_S=0: debería lanzar de nuevo
        resultado2 = subprocess.run(
            ["bash", GUION, tmpdir],
            env=env,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        # Verificar que el falso se ejecutó de nuevo (dos veces total)
        with open(registro) as f:
            lineas = f.readlines()
        assert len(lineas) == 2, f"Debería ejecutarse dos veces con ESPERA_S=0: {lineas}"


def test_sync_exitoso_escribe_cero_en_estado():
    """Un sync que termina con exit 0 escribe 0 en el archivo de estado."""
    with tempfile.TemporaryDirectory() as tmpdir:
        estado = os.path.join(tmpdir, "estado")
        registro = os.path.join(tmpdir, "registro")
        falso = _crear_falso_codegraph(tmpdir, "exito", registro)
        
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_ESPERA_S": "21600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "HOME": tmpdir,
        })
        
        resultado = subprocess.run(
            ["bash", GUION, tmpdir],
            env=env,
            capture_output=True,
            text=True,
            timeout=15
        )
        
        assert resultado.returncode == 0, f"Debería salir 0: {resultado.returncode}, stderr: {resultado.stderr}"
        
        # Verificar que el estado es 0
        assert os.path.exists(estado), "Archivo de estado no creado"
        with open(estado) as f:
            contenido = f.read().strip()
        assert contenido == "0", f"Estado debería ser 0 tras éxito: '{contenido}'"
        
        # Verificar que el falso se ejecutó
        assert os.path.exists(registro), "El falso codegraph no se ejecutó"
        with open(registro) as f:
            lineas = f.readlines()
        assert len(lineas) == 1, f"Debería ejecutarse una vez: {lineas}"


def test_presion_memoria_salta_sin_tocar_estado():
    """Con presión de memoria ≥ 2, salta la pasada sin tocar el archivo de estado."""
    with tempfile.TemporaryDirectory() as tmpdir:
        estado = os.path.join(tmpdir, "estado")
        registro = os.path.join(tmpdir, "registro")
        falso = _crear_falso_codegraph(tmpdir, "exito", registro)
        
        # Pre-crear estado con un valor
        with open(estado, "w") as f:
            f.write("1234567890")
        
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_ESPERA_S": "21600",
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_NIVEL_PRESION": "2",  # Presión alta
            "HOME": tmpdir,
        })
        
        resultado = subprocess.run(
            ["bash", GUION, tmpdir],
            env=env,
            capture_output=True,
            text=True,
            timeout=10
        )
        
        assert resultado.returncode == 0, f"Debería salir 0: {resultado.returncode}"
        assert "presión de memoria" in resultado.stdout, f"Debería loguear presión: {resultado.stdout}"
        
        # Verificar que el estado NO cambió
        with open(estado) as f:
            contenido = f.read().strip()
        assert contenido == "1234567890", f"Estado no debería cambiar: '{contenido}'"
        
        # Verificar que el falso NO se ejecutó
        assert not os.path.exists(registro), "El falso no debería ejecutarse con presión alta"


def test_sync_fallido_no_escribe_cero():
    """Un sync que falla (exit != 0) no escribe 0 en el estado."""
    with tempfile.TemporaryDirectory() as tmpdir:
        estado = os.path.join(tmpdir, "estado")
        registro = os.path.join(tmpdir, "registro")
        falso = _crear_falso_codegraph(tmpdir, "falla", registro)
        
        # Pre-crear estado con un timestamp de corte anterior (hace 1 hora)
        corte_anterior = int(time.time()) - 3600
        with open(estado, "w") as f:
            f.write(str(corte_anterior))
        
        env = os.environ.copy()
        env.update({
            "CODEGRAPH_TOPE_S": "10",
            "CODEGRAPH_ESPERA_S": "1",  # Solo 1 segundo de espera para no saltar
            "CODEGRAPH_ESTADO": estado,
            "CODEGRAPH_BIN": falso,
            "CODEGRAPH_NIVEL_PRESION": "1",
            "HOME": tmpdir,
        })
        
        resultado = subprocess.run(
            ["bash", GUION, tmpdir],
            env=env,
            capture_output=True,
            text=True,
            timeout=15
        )
        
        assert resultado.returncode != 0, f"Debería fallar: {resultado.returncode}"
        
        # Verificar que el estado NO cambió a 0 (mantiene el timestamp del corte anterior)
        with open(estado) as f:
            contenido = f.read().strip()
        assert contenido == str(corte_anterior), f"Estado no debería cambiar a 0: '{contenido}'"


if __name__ == "__main__":
    # Ejecutar tests manualmente si se invoca directamente
    import sys
    test_guion_y_plist()
    print("test_guion_y_plist: OK")
    test_corte_deja_hora_en_estado()
    print("test_corte_deja_hora_en_estado: OK")
    test_pasada_siguiente_se_salta_sin_lanzar_falso()
    print("test_pasada_siguiente_se_salta_sin_lanzar_falso: OK")
    test_con_espera_cero_vuelve_a_lanzar()
    print("test_con_espera_cero_vuelve_a_lanzar: OK")
    test_sync_exitoso_escribe_cero_en_estado()
    print("test_sync_exitoso_escribe_cero_en_estado: OK")
    test_presion_memoria_salta_sin_tocar_estado()
    print("test_presion_memoria_salta_sin_tocar_estado: OK")
    test_sync_fallido_no_escribe_cero()
    print("test_sync_fallido_no_escribe_cero: OK")
    print("\nTodos los tests pasaron.")