# -*- coding: utf-8 -*-
"""Tests del cerrojo «pesado» compartido orquestador ⇄ tsc-turno.sh (2026-09-07, Ola 261, P6b).

Cubre los dos fallos del intento anterior (rama ola/P6 rechazada):
(a) el cerrojo se libera SIEMPRE, también cuando el cuerpo lanza excepción;
(b) un pesado.lock con dueño muerto se limpia solo (no bloquea todas las olas);
y la regla espejo: un dueño VIVO y reciente NO se toca. Además, prueba de regresión
sobre el script bash: tsc fallando debe salir ≠ 0 y dejar el cerrojo liberado.
"""
import importlib.util
import os
import shutil
import subprocess
import sys
import time

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules.setdefault("enjambre", enjambre)
ESPEC.loader.exec_module(enjambre)

SCRIPT = os.path.join(os.path.dirname(RUTA), "tsc-turno.sh")


@pytest.fixture
def cerrojos_tmp(tmp_path, monkeypatch):
    """CERROJOS aislado por prueba."""
    monkeypatch.setattr(enjambre, "CERROJOS", str(tmp_path))
    return tmp_path


def test_cerrojo_pesado_se_libera_con_excepcion(cerrojos_tmp):
    """El cuerpo puede explotar: el finally del cerrojo-directorio lo suelta igual."""
    ruta = os.path.join(str(cerrojos_tmp), "pesado.lock")
    with pytest.raises(RuntimeError):
        with enjambre.cerrojo("pesado"):
            assert os.path.isdir(ruta)
            assert open(os.path.join(ruta, "dueno")).read().split()[0] == str(os.getpid())
            raise RuntimeError("tsc murió a medias")
    assert not os.path.exists(ruta)


def test_cerrojo_pesado_limpia_dueno_muerto(cerrojos_tmp):
    """Un pesado.lock con pid inexistente es basura: se elimina al pedir el turno."""
    ruta = os.path.join(str(cerrojos_tmp), "pesado.lock")
    os.mkdir(ruta)
    with open(os.path.join(ruta, "dueno"), "w", encoding="utf-8") as f:
        f.write("99999999 %d" % int(time.time()))  # pid que no puede estar vivo
    with enjambre.cerrojo("pesado"):
        assert os.path.isdir(ruta)  # turno tomado: el huérfano se limpió
    assert not os.path.exists(ruta)


def test_cerrojo_pesado_respeta_dueno_vivo(cerrojos_tmp):
    """Dueño vivo (este mismo proceso) y reciente: la limpieza NO lo toca."""
    ruta = os.path.join(str(cerrojos_tmp), "pesado.lock")
    os.mkdir(ruta)
    with open(os.path.join(ruta, "dueno"), "w", encoding="utf-8") as f:
        f.write("%d %d" % (os.getpid(), int(time.time())))
    assert not enjambre._limpiar_pesado_huerfano(ruta)
    assert os.path.isdir(ruta)


@pytest.mark.skipif(not shutil.which("bash"), reason="no hay bash")
def test_tsc_turno_falla_y_libera(cerrojos_tmp, tmp_path, monkeypatch):
    """tsc fallando: rc ≠ 0, cerrojo liberado y caché rc ≠ 0 (regresión del trap)."""
    repo = tmp_path / "repo"
    repo.mkdir()
    falso_npx = tmp_path / "npx"
    falso_npx.write_text("#!/bin/sh\nexit 3\n", encoding="utf-8")
    falso_npx.chmod(0o755)
    env = dict(os.environ)
    env["PATH"] = "%s:%s" % (tmp_path, env.get("PATH", ""))
    env["HOME"] = str(cerrojos_tmp)  # cerrojos y caché van al tmp vía $HOME
    r = subprocess.run(["bash", SCRIPT], cwd=str(repo), env=env,
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 3
    pesado = os.path.join(str(cerrojos_tmp), ".starseed", "cerrojos", "pesado.lock")
    assert not os.path.exists(pesado)
