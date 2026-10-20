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


def test_archivar_dos_veces_no_pisa_la_rama_anterior(tmp_path):
    repo, wt = _repo_con_worktree(tmp_path)
    (wt / "a.txt").write_text("primera\n")
    assert A.archivar(str(wt), "T1", "2026-10-20") == (True, "archivo-wt/T1")
    (wt / "a.txt").write_text("segunda\n")
    ok, rama = A.archivar(str(wt), "T1", "2026-10-20")
    assert ok and rama == "archivo-wt/T1-2026-10-20"
    assert _g(repo, "show", "archivo-wt/T1:a.txt") == "primera\n"
