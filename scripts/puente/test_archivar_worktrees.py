# -*- coding: utf-8 -*-
"""Pruebas de archivar_worktrees: nada sin guardar se pierde y el worktree queda limpio."""
import os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archivar_worktrees as A  # noqa: E402


def _g(ruta, *args):
    return subprocess.run(["git", "-C", str(ruta)] + A.AUTOR + list(args),
                          capture_output=True, text=True, check=True).stdout


def _repo_con_worktree(tmp_path):
    repo, wt = tmp_path / "repo", tmp_path / "wt" / "T1"
    repo.mkdir()
    _g(repo, "init", "-q", "-b", "main")
    (repo / "a.txt").write_text("uno\n")
    (repo / ".gitignore").write_text(".next/\n")
    _g(repo, "add", "-A")
    _g(repo, "commit", "-q", "-m", "inicio")
    _g(repo, "worktree", "add", "-q", "-b", "ola/T1", str(wt))
    return repo, wt


def test_nombre_rama_sin_choques():
    assert A.nombre_rama("T1", set(), "2026-10-20") == "archivo-wt/T1"
    hay = {"archivo-wt/T1", "archivo-wt/T1-2026-10-20"}
    assert A.nombre_rama("T1", hay, "2026-10-20") == "archivo-wt/T1-2026-10-20-2"


def test_archivar_guarda_cambios_y_archivos_nuevos(tmp_path):
    repo, wt = _repo_con_worktree(tmp_path)
    (wt / "a.txt").write_text("uno cambiado\n")
    (wt / "nuevo.txt").write_text("trabajo del agente\n")
    (wt / ".next").mkdir()
    (wt / ".next" / "cache.bin").write_text("regenerable")
    assert A.sucio(str(wt)) == 2
    ok, rama = A.archivar(str(wt), "T1", "2026-10-20")
    assert ok and rama == "archivo-wt/T1"
    assert A.sucio(str(wt)) == 0
    assert _g(repo, "show", "archivo-wt/T1:a.txt") == "uno cambiado\n"
    assert _g(repo, "show", "archivo-wt/T1:nuevo.txt") == "trabajo del agente\n"
    assert ".next" not in _g(repo, "ls-tree", "-r", "--name-only", "archivo-wt/T1")
    # La rama de la tarea no se toca.
    assert _g(repo, "show", "ola/T1:a.txt") == "uno\n"
    # Limpio, git ya deja quitarlo sin --force.
    _g(repo, "worktree", "remove", str(wt))
    assert not wt.exists()


def _hay_ref(ruta, ref):
    return subprocess.run(["git", "-C", str(ruta), "rev-parse", "-q", "--verify", ref],
                          capture_output=True).returncode == 0


def _g_y_conflicto(ruta, *args):
    """Un comando que deja conflicto termina con código 1 (no es un fallo); lo demás sí es error."""
    r = subprocess.run(["git", "-C", str(ruta)] + A.AUTOR + list(args),
                       capture_output=True, text=True)
    assert r.returncode in (0, 1), "git %s: %s" % (" ".join(args), r.stdout + r.stderr)


def _repo_a_medias(tmp_path, comando):
    """La rama del worktree con un commit propio y otra que choca: git deja el comando a medias."""
    repo, wt = _repo_con_worktree(tmp_path)
    (wt / "a.txt").write_text("la tarea lo escribió\n")
    _g(wt, "add", "-A")
    _g(wt, "commit", "-q", "-m", "en T1")
    _g(repo, "checkout", "-q", "-b", "otro", "main")
    (repo / "a.txt").write_text("otro lo pisó\n")
    _g(repo, "add", "-A")
    _g(repo, "commit", "-q", "-m", "de otro")
    sha = _g(repo, "rev-parse", "otro").strip()
    _g(repo, "checkout", "-q", "main")
    _g_y_conflicto(wt, comando, sha)  # conflicto: a.txt lo escriben los dos
    assert _hay_ref(wt, "CHERRY_PICK_HEAD" if comando == "cherry-pick" else "REVERT_HEAD")
    return repo, wt, sha


def test_cherry_pick_a_medias_se_archiva_con_las_marcas(tmp_path):
    repo, wt, sha = _repo_a_medias(tmp_path, "cherry-pick")
    assert _hay_ref(wt, "CHERRY_PICK_HEAD")
    ok, rama = A.archivar(str(wt), "T1", "2026-10-20")
    assert ok and rama == "archivo-wt/T1"
    assert not _hay_ref(wt, "CHERRY_PICK_HEAD")
    guardado = _g(repo, "show", "archivo-wt/T1:a.txt")
    assert "la tarea lo escribió" in guardado and "otro lo pisó" in guardado
    assert "<<<<<<<" in guardado, "el archivo con conflicto se tal cual, con sus marcas"
    assert "estaba a mitad del cherry-pick de %s" % sha in _g(repo, "log", "-1", "--format=%B", rama)
    assert A.sucio(str(wt)) == 0
    _g(repo, "worktree", "remove", str(wt))
    assert not wt.exists()


def test_revert_a_medias_se_archiva_igual(tmp_path):
    repo, wt, sha = _repo_a_medias(tmp_path, "revert")
    assert _hay_ref(wt, "REVERT_HEAD")
    ok, rama = A.archivar(str(wt), "T1", "2026-10-20")
    assert ok and rama == "archivo-wt/T1"
    assert not _hay_ref(wt, "REVERT_HEAD")
    assert "estaba a mitad del revert de %s" % sha in _g(repo, "log", "-1", "--format=%B", rama)
    assert A.sucio(str(wt)) == 0
    _g(repo, "worktree", "remove", str(wt))


def _secuenciador(wt):
    p = _g(wt, "rev-parse", "--git-path", "sequencer").strip()
    return p if os.path.isabs(p) else os.path.join(str(wt), p)


def test_cherry_pick_sin_commit_de_varios_a_medias_se_archiva(tmp_path):
    """(SUP0811J) Lo que dejó el integrador en 8 worktrees de verdad (08-11): `cherry-pick -n` de VARIOS
    commits con conflicto. git guarda `sequencer/` y NO escribe CHERRY_PICK_HEAD (con --no-commit no lo
    hace), pero `switch` se niega igual: «cannot switch branch while cherry-picking»."""
    repo, wt = _repo_con_worktree(tmp_path)
    (wt / "a.txt").write_text("la tarea lo escribió\n")
    _g(wt, "add", "-A")
    _g(wt, "commit", "-q", "-m", "en T1")
    _g(repo, "checkout", "-q", "-b", "otro", "main")
    (repo / "a.txt").write_text("otro lo pisó\n")
    _g(repo, "add", "-A")
    _g(repo, "commit", "-q", "-m", "de otro 1")
    sha1 = _g(repo, "rev-parse", "HEAD").strip()
    (repo / "b.txt").write_text("de otro 2\n")
    _g(repo, "add", "-A")
    _g(repo, "commit", "-q", "-m", "de otro 2")
    sha2 = _g(repo, "rev-parse", "HEAD").strip()
    _g(repo, "checkout", "-q", "main")
    _g_y_conflicto(wt, "cherry-pick", "-n", sha1, sha2)  # conflicto en el primero: a.txt
    assert not _hay_ref(wt, "CHERRY_PICK_HEAD")
    assert os.path.isdir(_secuenciador(wt))
    tipo, corto = A.a_medias(str(wt))  # `todo` guarda el sha abreviado
    assert tipo == "cherry-pick" and len(corto) >= 7 and sha1.startswith(corto)
    ok, rama = A.archivar(str(wt), "T1", "2026-10-20")
    assert ok and rama == "archivo-wt/T1", rama
    assert not os.path.isdir(_secuenciador(wt))
    guardado = _g(repo, "show", "archivo-wt/T1:a.txt")
    assert "la tarea lo escribió" in guardado and "otro lo pisó" in guardado and "<<<<<<<" in guardado
    assert "estaba a mitad del cherry-pick de %s" % corto in _g(repo, "log", "-1", "--format=%B", rama)
    assert _g(repo, "show", "ola/T1:a.txt") == "la tarea lo escribió\n"  # la rama de la tarea no se toca
    assert A.sucio(str(wt)) == 0
    _g(repo, "worktree", "remove", str(wt))
    assert not wt.exists()


def test_sin_nada_a_medias_no_hay_secuenciador(tmp_path):
    repo, wt = _repo_con_worktree(tmp_path)
    assert A.a_medias(str(wt)) is None
    (wt / "a.txt").write_text("cambio suelto\n")
    assert A.a_medias(str(wt)) is None


def test_archivar_dos_veces_no_pisa_la_rama_anterior(tmp_path):
    repo, wt = _repo_con_worktree(tmp_path)
    (wt / "a.txt").write_text("primera\n")
    assert A.archivar(str(wt), "T1", "2026-10-20") == (True, "archivo-wt/T1")
    (wt / "a.txt").write_text("segunda\n")
    ok, rama = A.archivar(str(wt), "T1", "2026-10-20")
    assert ok and rama == "archivo-wt/T1-2026-10-20"
    assert _g(repo, "show", "archivo-wt/T1:a.txt") == "primera\n"
