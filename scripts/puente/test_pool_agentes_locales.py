"""pool_agentes_locales: sin red ni marcas reales."""

import os
import sys
import threading
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pool_agentes_locales as pool

PERFIL = {"slots_bitnet": 2, "ctx_por_slot": 512}


@pytest.fixture(autouse=True)
def limpio(monkeypatch):
    monkeypatch.setattr(pool, "hay_marca_del_guardia", lambda: False)
    monkeypatch.setattr(pool, "conversando", lambda ahora=None, ruta=None: False)
    pool.TRANSPORTE = None
    pool._semaforo = None
    yield
    pool.TRANSPORTE = None


def test_presupuesto_512_128():
    assert pool.presupuesto(512, 128) == (512 - 128 - 32) * 3  # 1056 ≈ 1000
    assert pool.presupuesto(100, 128) == 0


def test_recortar_conserva_el_final():
    assert pool.recortar("abcdef", 3) == "def"
    assert pool.recortar("abc", 10) == "abc"
    assert pool.recortar("abc", 0) == ""


def test_marca_del_guardia_usa_su_formato(monkeypatch):
    # El autouse la reemplaza: se prueba la función real sacándola de nuevo del módulo.
    real = pool.hay_marca_del_guardia
    monkeypatch.undo()
    vistas = []
    assert pool.hay_marca_del_guardia(lambda r: vistas.append(r) or True) is True
    assert vistas == ["/tmp/starseed-llama-server-congelado-por-el-guardia"]
    assert real is not pool.hay_marca_del_guardia


def test_marca_presente_impide_usar():
    assert pool.puede_usar(marca=True, conversacion=False) is False
    assert pool.puede_usar(marca=False, conversacion=False) is True


def test_conversacion_activa_cede_a_pruebas_y_resto():
    assert pool.puede_usar(prioridad="resto", marca=False, conversacion=True) is False
    assert pool.puede_usar(prioridad="pruebas", marca=False, conversacion=True) is False
    assert pool.puede_usar(prioridad="conversacion", marca=False, conversacion=True) is True


def test_pedir_recorta_y_devuelve_texto():
    cuerpos = []
    pool.TRANSPORTE = lambda c: cuerpos.append(c) or {"content": "ok"}
    assert pool.pedir("x" * 5000, 128, perfil=PERFIL) == "ok"
    assert len(cuerpos[0]["prompt"]) == pool.presupuesto(512, 128)


def test_pedir_sin_slots_o_con_marca_devuelve_none(monkeypatch):
    pool.TRANSPORTE = lambda c: {"content": "ok"}
    assert pool.pedir("hola", perfil={"slots_bitnet": 0}) is None
    monkeypatch.setattr(pool, "hay_marca_del_guardia", lambda: True)
    assert pool.pedir("hola", perfil=PERFIL) is None


def test_pedir_nunca_lanza():
    def roto(c):
        raise RuntimeError("caído")

    pool.TRANSPORTE = roto
    assert pool.pedir("hola", perfil=PERFIL) is None


def test_tope_de_concurrencia():
    activos, maximo = [0], [0]
    cerrojo = threading.Lock()

    def lento(c):
        with cerrojo:
            activos[0] += 1
            maximo[0] = max(maximo[0], activos[0])
        time.sleep(0.05)
        with cerrojo:
            activos[0] -= 1
        return {"content": "ok"}

    pool.TRANSPORTE = lento
    hilos = [
        threading.Thread(target=pool.pedir, args=("hola", 64, "resto", 5, PERFIL))
        for _ in range(6)
    ]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    assert maximo[0] == 2


def test_plazo_agotado_devuelve_none():
    def lento(c):
        time.sleep(0.3)
        return {"content": "ok"}

    pool.TRANSPORTE = lento
    perfil = {"slots_bitnet": 1, "ctx_por_slot": 512}
    ocupado = threading.Thread(target=pool.pedir, args=("a", 64, "resto", 5, perfil))
    ocupado.start()
    time.sleep(0.05)
    assert pool.pedir("b", 64, "resto", 0.05, perfil) is None
    ocupado.join()
