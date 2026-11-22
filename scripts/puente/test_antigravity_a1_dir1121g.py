"""DIR1121G: la sonda decide la sesión de Google usando agy, no buscando archivos de credenciales."""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import antigravity_a1 as A  # noqa: E402


def test_la_sonda_pregunta_a_agy_y_no_busca_archivos():
    assert "agy models" in A.SONDA and "</dev/null" in A.SONDA
    assert "-iname" not in A.SONDA and "find " not in A.SONDA
    assert "SESION=si" in A.SONDA and "SESION=no" in A.SONDA


def _sonda_con_agy_falso(tmp_path, salida_modelos):
    falso = tmp_path / "agy"
    falso.write_text("#!/bin/sh\ncase \"$1\" in\n  --version) echo 'agy 9.9.9';;\n  models) printf '%s' \"$SALIDA\";;\n"
                     "  remote-control) exit 0;;\nesac\n")
    falso.chmod(0o755)
    env = dict(os.environ, PATH=str(tmp_path) + os.pathsep + "/usr/bin:/bin", SALIDA=salida_modelos)
    r = subprocess.run(["sh", "-c", A.SONDA], capture_output=True, text=True, env=env, timeout=90)
    return A.interpretar_sonda(r.stdout, r.returncode)


def test_con_modelos_listados_hay_sesion(tmp_path):
    d = _sonda_con_agy_falso(tmp_path, "Fetching available models...\ngemini-4-neon-high\tGemini 4 Neon (High)\n")
    assert d["agy"] is True and d["sesion"] is True


def test_sin_modelos_no_hay_sesion(tmp_path):
    d = _sonda_con_agy_falso(tmp_path, "Fetching available models...\nError: please log in\n")
    assert d["agy"] is True and d["sesion"] is False
