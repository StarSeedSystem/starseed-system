# -*- coding: utf-8 -*-
"""Ola 1103 · G: el orquestador se pone al día solo (instalar y reiniciar en un momento seguro)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import orquestador_al_dia as O  # noqa: E402


def test_diferencias_y_decision(tmp_path):
    repo, inst = tmp_path / "repo", tmp_path / "inst"
    repo.mkdir()
    inst.mkdir()
    for n, t in (("starseed-enjambre.py", "a"), ("analista.py", "b"), ("test_x.py", "t"), ("conftest.py", "c")):
        (repo / n).write_text(t)
    (inst / "starseed-enjambre.py").write_text("a")
    (inst / "analista.py").write_text("viejo")
    os.utime(inst / "analista.py", (1000, 1000))
    difs = O.diferencias(str(repo), str(inst))
    assert [d[0] for d in difs] == ["analista.py"]
    assert O.decidir_instalar(difs)[0] == "instalar"
    assert O.decidir_instalar([])[0] == "nada"
    assert O.decidir_instalar([("analista.py", 100.0, 200.0)])[0] == "avisar"
    assert O.decidir_instalar([("nuevo.py", 100.0, None)])[0] == "instalar"


def test_etime_y_orquestadores():
    assert O.minutos_de_etime("01-23:07:07") == 86400 + 23 * 3600 + 7 * 60 + 7
    assert O.minutos_de_etime("05:22") == 322
    assert O.minutos_de_etime("x") is None
    ps = ("14184 01-23:07:07 /usr/bin/python3 -u /Users/a/.local/bin/starseed-enjambre.py cola.json --work\n"
          "  999 00:10 python3 orquestador_al_dia.py --aplicar starseed-enjambre.py\n"
          "  123 00:10 /bin/zsh\n")
    vivos = O.orquestadores(ps, 1_000_000)
    assert vivos == [(14184, 1_000_000 - (86400 + 23 * 3600 + 7 * 60 + 7))]


def test_decidir_reinicio():
    inst = 10_000.0
    vivos = [(1, 5_000.0), (2, 10_500.0)]
    assert O.decidir_reinicio(vivos, inst, inst + 60)[0] == []                   # en la gracia
    assert O.decidir_reinicio(vivos, inst, inst + O.GRACIA_S + 1)[0] == [1]       # solo el viejo
    assert O.decidir_reinicio(vivos, inst, inst + O.GRACIA_S + 1, ultimo_reinicio=inst)[0] == []
    assert O.decidir_reinicio([(2, 10_500.0)], inst, inst + 9999)[0] == []
    assert O.decidir_reinicio(vivos, None, inst)[0] == []


def test_revisar_sin_tocar_la_maquina(monkeypatch, tmp_path):
    inst = tmp_path / "starseed-enjambre.py"
    inst.write_text("x")
    os.utime(inst, (10_000, 10_000))
    monkeypatch.setattr(O, "DESTINO", str(tmp_path))
    hechos = {}
    r = O.revisar(aplicar=True, ahora=10_000 + O.GRACIA_S + 5,
                  difs_fn=lambda: [("analista.py", 9_000.0, 8_000.0)],
                  instalar_fn=lambda: (True, ""),
                  ps_fn=lambda: "42 01:00:00 python3 /x/starseed-enjambre.py cola.json\n",
                  detener_fn=lambda pids: {"enviados": pids, "siguen": []},
                  estado={}, guardar=lambda d: hechos.update(d))
    assert r["instalar"] == "instalar" and r["reinicio"] == [42]
    assert any("instalado" in h for h in r["hechos"]) and any("reinicio seguro" in h for h in r["hechos"])
    assert hechos.get("ultimo_reinicio")
