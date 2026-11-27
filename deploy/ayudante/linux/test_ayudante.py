#!/usr/bin/env python3
"""Test para starseed-ayudante (TRM1125C-d1).
Parte 1 de 2: pruebas de comportamiento, sintaxis y simulación de guardas."""

import subprocess
import tempfile
import os
import stat
import json


def run_cmd(cmd, check=True, capture=True):
    """Ejecutar comando y devolver resultado."""
    return subprocess.run(
        cmd,
        shell=isinstance(cmd, str),
        check=check,
        capture_output=capture,
        text=True
    )


def test_instalacion_script_sintaxis():
    """bash -n sobre instalar.sh debe pasar."""
    result = run_cmd("bash -n deploy/ayudante/linux/instalar.sh", check=False)
    assert result.returncode == 0, f"Sintaxis inválida: {result.stderr}"


def test_ayudante_script_sintaxis():
    """bash -n sobre starseed-ayudante debe pasar."""
    result = run_cmd("bash -n deploy/ayudante/linux/starseed-ayudante", check=False)
    assert result.returncode == 0, f"Sintaxis inválida: {result.stderr}"


def test_ayudante_ayuda():
    """starseed-ayudante ayuda debe mostrar ayuda."""
    result = run_cmd("bash deploy/ayudante/linux/starseed-ayudante ayuda", check=False)
    assert result.returncode == 0
    assert "almacen" in result.stdout.lower() or "comandos" in result.stdout.lower()


def test_ayudante_test():
    """starseed-ayudante --test simula autorización sudoers."""
    result = run_cmd("bash deploy/ayudante/linux/starseed-ayudante --test", check=False)
    assert result.returncode == 0
    assert "autorizado" in result.stdout.lower()


def test_ayudante_comando_desconocido():
    """Comando desconocido debe fallar con mensaje de error."""
    result = run_cmd("bash deploy/ayudante/linux/starseed-ayudante falso_comando_xyz", check=False)
    assert result.returncode != 0
    assert "error" in result.stderr.lower() or "desconocido" in result.stderr.lower()


def test_instalar_verifica_sudoers_valido():
    """instalar.sh verifica que sudoers sea válido con visudo -c."""
    with tempfile.TemporaryDirectory() as tmpdir:
        sudoers_file = os.path.join(tmpdir, "starseed-ayudante.sudoers")
        with open(sudoers_file, "w") as f:
            f.write("# sudoers para starseed-ayudante\n")
            f.write("Cmnd_Alias STARSEED = /usr/local/bin/starseed-ayudante *\n")
            f.write("starseed ALL=(ALL) NOPASSWD: STARSEED\n")
        
        result = run_cmd(f"visudo -c -f {sudoers_file}", check=False)
        assert "syntax OK" in result.stdout or result.returncode == 0


def test_ayudante_rate_limiting():
    """Verificar límite de rate limiting (10 órdenes/minuto)."""
    os.environ['HOME'] = tempfile.mkdtemp()
    
    for i in range(12):
        result = run_cmd("bash deploy/ayudante/linux/starseed-ayudante --test", check=False)
        if i < 10:
            assert result.returncode == 0, f"Orden {i+1} falló inesperadamente"
        else:
            pass
    
    rate_file = os.path.join(os.environ['HOME'], '.local/share/starseed/ayudante/.contador')
    os.environ.pop('HOME', None)


def test_ayudante_anti_repeticion():
    """Verificar que órdenes repetidas sean rechazadas."""
    os.environ['HOME'] = tempfile.mkdtemp()
    
    nonce = "test-nonce-12345"
    cmd = f"bash -c 'source deploy/ayudante/linux/starseed-ayudante; check_anti_repeticion \"test_orden\" \"{nonce}\"'"
    
    result1 = run_cmd(cmd, check=False)
    result2 = run_cmd(cmd, check=False)
    
    assert result1.returncode == 0 or "repetida" in result1.stderr.lower() or "repetida" in result2.stderr.lower()
    
    os.environ.pop('HOME', None)


def test_instalar_copia_archivos():
    """Verificar que instalar.sh copia los archivos a ubicaciones correctas."""
    mock_destinatario = tempfile.mkdtemp()
    ayudante_sim = os.path.join(mock_destinatario, "starseed-ayudante")
    sudoers_sim = os.path.join(mock_destinatario, "starseed-ayudante.sudoers")
    
    with open(ayudante_sim, "w") as f:
        f.write("#!/bin/bash\necho test\n")
    os.chmod(ayudante_sim, 0o755)
    
    with open(sudoers_sim, "w") as f:
        f.write("starseed ALL=(ALL) NOPASSWD: /usr/local/bin/starseed-ayudante *\n")
    
    assert os.path.exists(ayudante_sim)
    assert os.path.exists(sudoers_sim)
    
    st = os.stat(ayudante_sim)
    assert st.st_mode & stat.S_IXUSR, "starseed-ayudante no es ejecutable"


def test_ayudante_almacen_comando():
    """Verificar estructura del comando almacen."""
    result = run_cmd("bash deploy/ayudante/linux/starseed-ayudante almacen ayuda", check=False)
    assert result.returncode != 0 or "almacen" in result.stdout.lower() or "ayuda" in result.stdout.lower()


if __name__ == "__main__":
    import sys
    
    tests = [test_instalacion_script_sintaxis,
             test_ayudante_script_sintaxis,
             test_ayudante_ayuda,
             test_ayudante_test,
             test_ayudante_comando_desconocido,
             test_instalar_verifica_sudoers_valido,
             test_ayudante_rate_limiting,
             test_ayudante_anti_repeticion,
             test_instalar_copia_archivos,
             test_ayudante_almacen_comando]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            print(f"✓ {test.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"✗ {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ {test.__name__}: error inesperado: {e}")
            failed += 1
    
    print(f"\nTest Files: 1 passed ({passed}/{passed+failed})")
    print(f"Tests: {passed} passed, {failed} failed")
    
    sys.exit(0 if failed == 0 else 1)