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


@pytest.mark.skipif(not shutil.which("bash"), reason="no hay bash")
def test_tsc_turno_no_le_quita_el_turno_a_un_dueno_vivo(cerrojos_tmp, tmp_path):
    """(2026-10-11) A los 20 min se FORZABA el turno borrando el cerrojo de la puerta del
    orquestador, que seguía compilando: dos tsc de ~3,5 GB a la vez en la Mac de 8 GB.
    Ahora, agotada la espera con un dueño vivo, no compila (rc 75) y el cerrojo sigue suyo."""
    repo = tmp_path / "repo"
    repo.mkdir()
    marca = tmp_path / "npx-llamado"
    falso_npx = tmp_path / "npx"
    falso_npx.write_text("#!/bin/sh\ntouch '%s'\nexit 0\n" % marca, encoding="utf-8")
    falso_npx.chmod(0o755)
    pesado = os.path.join(str(cerrojos_tmp), ".starseed", "cerrojos", "pesado.lock")
    os.makedirs(pesado)
    with open(os.path.join(pesado, "dueno"), "w", encoding="utf-8") as f:
        f.write("%d %d\n" % (os.getpid(), int(time.time())))  # dueño vivo y reciente
    env = dict(os.environ)
    env["PATH"] = "%s:%s" % (tmp_path, env.get("PATH", ""))
    env["HOME"] = str(cerrojos_tmp)
    env["STARSEED_TSC_ESPERA_S"] = "1"
    env["STARSEED_TSC_MAX_ESPERA_S"] = "2"
    r = subprocess.run(["bash", SCRIPT], cwd=str(repo), env=env,
                       capture_output=True, text=True, timeout=60)
    assert r.returncode == 75, r.stderr
    assert "NO compilé" in r.stderr
    assert not marca.exists()  # tsc nunca arrancó
    assert open(os.path.join(pesado, "dueno")).read().split()[0] == str(os.getpid())


# ── (SUP0111J, 2026-11-01) el tsc que lanza tsc-turno no vive más que su turno ni sin quien espere ──
def _vivo(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    st = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return bool(st) and not st.startswith("Z")  # un zombi ya no retiene memoria


def _esperar(cond, tope_s=15.0):
    t0 = time.time()
    while time.time() - t0 < tope_s:
        if cond():
            return True
        time.sleep(0.2)
    return cond()


def _npx_que_cuelga(tmp_path):
    """npx falso con la forma de `npx → node tsc`: un hijo que duerme; deja los dos pids escritos."""
    pids = tmp_path / "pids"
    npx = tmp_path / "npx"
    npx.write_text("#!/bin/sh\necho $$ >> '%s'\nsleep 60 &\necho $! >> '%s'\nwait\n" % (pids, pids),
                   encoding="utf-8")
    npx.chmod(0o755)
    return pids


def _entorno(cerrojos_tmp, tmp_path, **extra):
    env = dict(os.environ)
    env["PATH"] = "%s:%s" % (tmp_path, env.get("PATH", ""))
    env["HOME"] = str(cerrojos_tmp)
    env.update(extra)
    return env


def _cerrojos(cerrojos_tmp):
    return os.path.join(str(cerrojos_tmp), ".starseed", "cerrojos")


@pytest.mark.skipif(not shutil.which("bash") or not shutil.which("pgrep"), reason="sin bash o pgrep")
def test_tsc_turno_corta_el_tsc_que_pasa_del_plazo(cerrojos_tmp, tmp_path):
    """Medido el 31-10: un tsc de un agente muerto siguió 3 h con 4,6 GB y, pasados 30 min, su
    cerrojo contaba como huérfano y entró otro tsc. Ahora, al plazo, se corta el árbol entero
    (npx y su hijo), sale 75 sin escribir la caché y suelta el cerrojo."""
    repo = tmp_path / "repo"
    repo.mkdir()
    pids = _npx_que_cuelga(tmp_path)
    env = _entorno(cerrojos_tmp, tmp_path, STARSEED_TSC_MAX_S="2", STARSEED_TSC_VIGILA_S="1")
    t0 = time.time()
    r = subprocess.run(["bash", SCRIPT], cwd=str(repo), env=env, capture_output=True, text=True, timeout=60)
    assert r.returncode == 75, r.stderr
    assert "NO compilé" in r.stderr and "huérfano" in r.stderr
    assert time.time() - t0 < 40
    vistos = [int(x) for x in pids.read_text().split()]
    assert len(vistos) == 2
    assert _esperar(lambda: not any(_vivo(p) for p in vistos)), "el árbol de tsc sigue vivo"
    assert not os.path.exists(os.path.join(_cerrojos(cerrojos_tmp), "pesado.lock"))
    assert [f for f in os.listdir(_cerrojos(cerrojos_tmp)) if f.startswith("tsc-cache-")] == []


@pytest.mark.skipif(not shutil.which("bash") or not shutil.which("pgrep"), reason="sin bash o pgrep")
def test_tsc_turno_corta_el_tsc_si_su_agente_murio(cerrojos_tmp, tmp_path):
    """El agente muere a media compilación y su shell queda adoptado por init (el caso del 31-10):
    tsc-turno lo ve en su vigilancia, corta el tsc y sale 75 sin esperar al plazo."""
    repo = tmp_path / "repo"
    repo.mkdir()
    pids = _npx_que_cuelga(tmp_path)
    rc, err, shell = tmp_path / "rc", tmp_path / "err", tmp_path / "pid-del-shell"
    env = _entorno(cerrojos_tmp, tmp_path, STARSEED_TSC_MAX_S="300", STARSEED_TSC_VIGILA_S="1")
    # El «agente» (sh de fuera) lanza su shell (sh de dentro) y muere cuando tsc ya compila.
    interior = "echo $$ > '%s'; bash '%s' 2> '%s'; echo $? > '%s'" % (shell, SCRIPT, err, rc)
    agente = 'sh -c "$0" & while [ ! -s "$1" ]; do sleep 0.2; done; exit 0'
    subprocess.run(["sh", "-c", agente, interior, str(pids)], cwd=str(repo), env=env, timeout=60,
                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.5)
    padre = subprocess.run(["ps", "-o", "ppid=", "-p", shell.read_text().strip()],
                           capture_output=True, text=True).stdout.strip()
    if padre not in ("1", ""):
        _esperar(lambda: rc.exists(), 320)  # con un subreaper no hay huérfano que ver
        pytest.skip("aquí los huérfanos no los adopta init (padre %s)" % padre)
    assert _esperar(lambda: rc.exists() and rc.read_text().strip() != "", 40), "tsc-turno no salió"
    assert rc.read_text().strip() == "75", err.read_text()
    assert "ya no existe" in err.read_text()
    vistos = [int(x) for x in pids.read_text().split()]
    assert vistos and _esperar(lambda: not any(_vivo(p) for p in vistos)), "el árbol de tsc sigue vivo"
    assert not os.path.exists(os.path.join(_cerrojos(cerrojos_tmp), "pesado.lock"))


@pytest.mark.skipif(not shutil.which("bash") or not shutil.which("pgrep"), reason="sin bash o pgrep")
def test_tsc_turno_con_un_padre_que_no_es_shell_y_adoptado_por_init_si_espera(cerrojos_tmp, tmp_path):
    """Un pytest (o un orquestador) lanzado con nohup tiene ppid 1 y SÍ lee el resultado: no es el
    shell huérfano de un agente. Medido al probar SUP0111J: scripts/enjambre con nohup salía 75."""
    repo = tmp_path / "repo"
    repo.mkdir()
    npx = tmp_path / "npx"
    npx.write_text("#!/bin/sh\nsleep 2\nexit 0\n", encoding="utf-8")
    npx.chmod(0o755)
    rc, err, quien = tmp_path / "rc", tmp_path / "err", tmp_path / "pid-del-python"
    env = _entorno(cerrojos_tmp, tmp_path, STARSEED_TSC_VIGILA_S="1")
    py = ("import os, subprocess, sys, time; open(%r, 'w').write(str(os.getpid())); time.sleep(1); "
          "r = subprocess.run(['bash', %r], stderr=open(%r, 'w')); open(%r, 'w').write(str(r.returncode))"
          % (str(quien), SCRIPT, str(err), str(rc)))
    subprocess.run(["sh", "-c", '"$0" -c "$1" &', sys.executable, py], cwd=str(repo), env=env, timeout=60,
                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert _esperar(lambda: rc.exists() and rc.read_text().strip() != "", 60), "tsc-turno no salió"
    assert rc.read_text().strip() == "0", err.read_text()


@pytest.mark.skipif(not shutil.which("bash"), reason="no hay bash")
def test_tsc_turno_en_verde_sigue_escribiendo_la_cache(cerrojos_tmp, tmp_path):
    """La vigilancia no cambia el camino normal: tsc en verde → rc 0, caché con rc 0 y, en la
    segunda pasada sin cambios, «sin cambios» sin volver a llamar a npx."""
    repo = tmp_path / "repo"
    repo.mkdir()
    llamadas = tmp_path / "llamadas"
    npx = tmp_path / "npx"
    npx.write_text("#!/bin/sh\necho x >> '%s'\nexit 0\n" % llamadas, encoding="utf-8")
    npx.chmod(0o755)
    env = _entorno(cerrojos_tmp, tmp_path, STARSEED_TSC_VIGILA_S="1")
    r = subprocess.run(["bash", SCRIPT], cwd=str(repo), env=env, capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    caches = [f for f in os.listdir(_cerrojos(cerrojos_tmp)) if f.startswith("tsc-cache-")]
    assert len(caches) == 1
    assert open(os.path.join(_cerrojos(cerrojos_tmp), caches[0])).read().split()[1] == "0"
    r2 = subprocess.run(["bash", SCRIPT], cwd=str(repo), env=env, capture_output=True, text=True, timeout=60)
    assert r2.returncode == 0 and "sin cambios" in r2.stdout
    assert llamadas.read_text().split() == ["x"]
