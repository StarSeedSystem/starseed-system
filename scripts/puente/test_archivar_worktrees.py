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


def test_archivar_dos_veces_no_pisa_la_rama_anterior(tmp_path):
    repo, wt = _repo_con_worktree(tmp_path)
    (wt / "a.txt").write_text("primera\n")
    assert A.archivar(str(wt), "T1", "2026-10-20") == (True, "archivo-wt/T1")
    (wt / "a.txt").write_text("segunda\n")
    ok, rama = A.archivar(str(wt), "T1", "2026-10-20")
    assert ok and rama == "archivo-wt/T1-2026-10-20"
    assert _g(repo, "show", "archivo-wt/T1:a.txt") == "primera\n"
