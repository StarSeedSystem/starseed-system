import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import instalar_ia_nodo as I  # noqa: E402

PERFIL = {"slots_bitnet": 1, "capas_que_caben": ["needle", "laya"]}


def fijar(mp):
    mp.setattr(I, "BITNET_COMMIT", "abc123")
    mp.setattr(I, "BITNET_SHA256", "f" * 64)


def capas(p):
    return [x["capa"] for x in p["pasos"]]


def test_plan_linux_trae_unidad_con_memorymax(monkeypatch):
    fijar(monkeypatch)
    p = I.plan(PERFIL, "linux", 8000, node="/opt/node/bin/node")
    assert set(capas(p)) == {"bitnet", "needle", "laya"}
    unidad = next(x for x in p["pasos"] if x["tipo"] == "escribir")["contenido"]
    assert "MemoryMax=5G" in unidad and "STARSEED_LAYA_PUERTO=4470" in unidad
    assert "ExecStart=/opt/node/bin/node " in unidad


def test_plan_macos_laya_sin_systemd(monkeypatch):
    fijar(monkeypatch)
    p = I.plan(PERFIL, "darwin", 8000, node="/usr/bin/node")
    laya = [x for x in p["pasos"] if x["capa"] == "laya"]
    assert len(laya) == 1 and laya[0]["env"]["STARSEED_LAYA_PUERTO"] == "4470"


def test_pasos_son_listas_nunca_shell(monkeypatch):
    fijar(monkeypatch)
    for x in I.plan(PERFIL, "linux", 8000)["pasos"]:
        assert isinstance(x.get("args", []), list)


def test_commit_sin_fijar_dice_pendiente():
    p = I.plan(PERFIL, "linux", 8000)
    assert p["pasos"][0]["tipo"] == "pendiente" and "pendiente de fijar" in p["pasos"][0]["nota"]


def test_sin_visto_bueno_no_aplica(monkeypatch):
    fijar(monkeypatch)
    llamadas = []
    ok, motivo = I.aplicar(I.plan(PERFIL, "linux", 8000), False, llamadas.append)
    assert not ok and "visto-bueno" in motivo and llamadas == []


def test_sha_distinto_aborta_antes_de_ejecutar(monkeypatch):
    fijar(monkeypatch)
    llamadas = []
    ej = lambda paso: llamadas.append(paso["tipo"]) or 0  # noqa: E731
    ok, motivo = I.aplicar(I.plan(PERFIL, "linux", 8000), True, ej, sha=lambda r: "0" * 64, escribir=lambda *a: None)
    assert not ok and "SHA-256" in motivo and llamadas == ["descarga"]


def test_android_sin_soporte():
    p = I.plan(PERFIL, "android", 8000)
    assert p["estado"] == "sin-soporte" and p["pasos"] == [] and "android" in p["motivo"]
    assert I.aplicar(p, True, lambda x: 0)[0] is False


def test_sin_ram_no_pone_laya(monkeypatch):
    fijar(monkeypatch)
    assert "laya" not in capas(I.plan(PERFIL, "linux", 3000))


def test_aplicar_completo_con_sha_correcto(monkeypatch):
    fijar(monkeypatch)
    hechos = []
    ok, _ = I.aplicar(I.plan(PERFIL, "darwin", 8000, node="n"), True, lambda p: hechos.append(p["capa"]) or 0,
                      sha=lambda r: "f" * 64)
    assert ok and hechos == ["bitnet", "bitnet", "needle", "laya"]
