# -*- coding: utf-8 -*-
"""ENJ1126B: el enjambre no se ahoga en su propio disco (higiene + tope de worktrees no activos).

Todo con un repo git y carpetas en un directorio temporal; nada toca `~/Documents`."""
import fcntl, json, os, subprocess, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archivar_worktrees as A  # noqa: E402
import higiene_worktrees as H  # noqa: E402


def _g(ruta, *args):
    return subprocess.run(["git", "-C", str(ruta)] + A.AUTOR + list(args),
                          capture_output=True, text=True, check=True).stdout


def _montar(tmp_path, estados, con_cambios=()):
    """Repo con un worktree por tarea (`estados`: id → estado de progreso). → (repo, base_wt)."""
    repo, base = tmp_path / "repo", tmp_path / "wt"
    repo.mkdir()
    base.mkdir()
    _g(repo, "init", "-q", "-b", "main")
    (repo / "a.txt").write_text("uno\n")
    _g(repo, "add", "-A")
    _g(repo, "commit", "-q", "-m", "inicio")
    olas = repo / "starseed_memory_root" / "olas"
    olas.mkdir(parents=True)
    (olas / "progreso.json").write_text(
        json.dumps({t: {"estado": e} for t, e in estados.items()}))
    for t in estados:
        _g(repo, "worktree", "add", "-q", "-b", "ola/" + t, str(base / t))
    for t in con_cambios:
        (base / t / "trabajo.txt").write_text("sin integrar de %s\n" % t)
    return repo, base


def _apuntar(monkeypatch, tmp_path, repo, base, procesos=()):
    monkeypatch.setattr(A, "RAIZ", str(repo))
    monkeypatch.setattr(A, "WT", str(base))
    monkeypatch.setattr(A.H, "CERROJO", str(tmp_path / "integrar.lock"))
    monkeypatch.setattr(A.H, "_procesos", lambda: list(procesos))


def _envejecer(base, edades_s):
    """Fija la fecha de cada carpeta: `edades_s` = id → segundos de antigüedad."""
    ahora = time.time()
    for t, edad in edades_s.items():
        os.utime(str(base / t), (ahora - edad, ahora - edad))


def _ramas_archivo(repo):
    return set(_g(repo, "for-each-ref", "--format=%(refname:short)",
                  "refs/heads/archivo-wt/").split())


def test_fin_incluye_estados_que_dejaban_worktrees_para_siempre():
    """(1) reasignada, rechazada e integrada son finales: la higiene los poda."""
    assert {"reasignada", "rechazada", "integrada", "commit", "sustituida"} <= H.FIN
    progreso = {n: {"estado": e} for n, e in
                [("R", "reasignada"), ("X", "rechazada"), ("I", "integrada"),
                 ("P", "pendiente"), ("E", "en_curso")]}
    salen = H.candidatos(progreso, ["R", "X", "I", "P", "E"], [])
    assert salen == ["I", "R", "X"]  # lo pendiente y lo en curso nunca


def test_podar_quita_reasignada_rechazada_e_integrada(tmp_path, monkeypatch):
    repo, base = _montar(tmp_path, {"R1": "reasignada", "X1": "rechazada",
                                    "I1": "integrada", "P1": "pendiente"})
    monkeypatch.setattr(H, "CERROJO", str(tmp_path / "integrar.lock"))
    monkeypatch.setattr(H, "_procesos", lambda: [])
    quitados = H.podar(str(repo), str(base), decir=False)
    assert sorted(quitados) == ["I1", "R1", "X1"]
    assert (base / "P1").exists()  # un intento pendiente no lo toca la higiene horaria


def test_intento_fallido_archiva_con_rama_y_poda(tmp_path, monkeypatch):
    """(2) Un intento que acaba sin commit y vuelve a «pendiente» suelta su worktree."""
    repo, base = _montar(tmp_path, {"T1": "pendiente", "T2": "pendiente"}, con_cambios=["T1"])
    _apuntar(monkeypatch, tmp_path, repo, base)
    podados = A.liberar_no_vivas(min_edad_s=0, decir=lambda m: None, solo={"T1"}, espera_s=2)
    assert podados == ["T1"] and not (base / "T1").exists()
    assert (base / "T2").exists()  # solo la tarea pedida
    assert "archivo-wt/T1" in _ramas_archivo(repo)
    assert _g(repo, "show", "archivo-wt/T1:trabajo.txt") == "sin integrar de T1\n"


def test_nada_se_poda_si_el_archivo_falla(tmp_path, monkeypatch):
    repo, base = _montar(tmp_path, {"T1": "pendiente"}, con_cambios=["T1"])
    _apuntar(monkeypatch, tmp_path, repo, base)
    monkeypatch.setattr(A, "archivar", lambda ruta, n, hoy: (False, "commit: roto"))
    avisos = []
    podados = A.liberar_no_vivas(min_edad_s=0, decir=avisos.append, solo={"T1"}, espera_s=2)
    assert podados == [] and (base / "T1" / "trabajo.txt").exists()
    assert any("SE QUEDA" in a for a in avisos)


def test_cerrojo_ocupado_no_espera_mas_del_plazo(tmp_path, monkeypatch):
    repo, base = _montar(tmp_path, {"T1": "pendiente"}, con_cambios=["T1"])
    _apuntar(monkeypatch, tmp_path, repo, base)
    with open(A.H.CERROJO, "w") as otro:  # el integrador tiene main
        fcntl.flock(otro, fcntl.LOCK_EX)
        t0 = time.time()
        podados = A.liberar_no_vivas(min_edad_s=0, decir=lambda m: None, solo={"T1"}, espera_s=1)
    assert podados == [] and (base / "T1").exists()
    assert time.time() - t0 < 10


def _siete(tmp_path):
    ids = ["W%d" % i for i in range(7)]
    repo, base = _montar(tmp_path, {t: "pendiente" for t in ids}, con_cambios=ids)
    _envejecer(base, {t: 1000 + i for i, t in enumerate(ids)})  # W6 el más viejo
    return repo, base, ids


def test_tope_trabajadores_mas_2_libera_solo_lo_que_sobra(tmp_path, monkeypatch):
    """(3)+(4) Con 3 trabajadores caben 5 no activos: sobran 2 y salen los más viejos, archivados."""
    repo, base, ids = _siete(tmp_path)
    _apuntar(monkeypatch, tmp_path, repo, base)
    podados = A.liberar_no_vivas(min_edad_s=60, decir=lambda m: None, trabajadores=3, espera_s=2)
    assert sorted(podados) == ["W5", "W6"]
    quedan = sorted(d for d in os.listdir(base))
    assert quedan == ["W0", "W1", "W2", "W3", "W4"]
    assert _ramas_archivo(repo) == {"archivo-wt/W5", "archivo-wt/W6"}  # nada sin rama


def test_tope_no_toca_nada_si_cabe(tmp_path, monkeypatch):
    repo, base, ids = _siete(tmp_path)
    _apuntar(monkeypatch, tmp_path, repo, base)
    assert A.liberar_no_vivas(min_edad_s=60, decir=lambda m: None, trabajadores=5, espera_s=2) == []
    assert len(os.listdir(base)) == 7 and not _ramas_archivo(repo)


def test_con_latido_o_proceso_vivo_no_se_libera(tmp_path, monkeypatch):
    """(3) Solo las tareas en espera SIN proceso ni latido vivo; lo activo nunca."""
    repo, base, ids = _siete(tmp_path)
    ps = ["opencode run --dir /x/starseed-wt/W6 algo"]
    _apuntar(monkeypatch, tmp_path, repo, base, procesos=ps)
    monkeypatch.setattr(A.H, "tareas_que_laten", lambda olas: {"W5"})
    podados = A.liberar_no_vivas(min_edad_s=60, decir=lambda m: None, trabajadores=0, espera_s=2)
    assert "W6" not in podados and "W5" not in podados
    assert (base / "W6").exists() and (base / "W5").exists()
    assert sorted(podados) == ["W2", "W3", "W4"]  # tope 2: libres W0-W4, sobran los 3 más viejos


def test_en_curso_nunca_cuenta_como_no_activa(tmp_path, monkeypatch):
    repo, base = _montar(tmp_path, {"V1": "en_curso", "V2": "en_curso", "V3": "en_curso"},
                         con_cambios=["V1"])
    _envejecer(base, {"V1": 5000, "V2": 5000, "V3": 5000})
    _apuntar(monkeypatch, tmp_path, repo, base)
    assert A.liberar_no_vivas(min_edad_s=0, decir=lambda m: None, trabajadores=0, espera_s=2) == []
    assert (base / "V1" / "trabajo.txt").exists() and not _ramas_archivo(repo)
