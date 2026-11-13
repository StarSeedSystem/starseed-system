# -*- coding: utf-8 -*-
"""Semillas de GitHub para alcance (ALC1113).
Lee repos de config/repos-libreria-*.json y src/lib/library/.
"""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import json, re

@dataclass(slots=True)
class RepoSemilla:
    owner: str
    name: str
    url: str
    def full_name(self) -> str: return f"{self.owner}/{self.name}"

def _leer_repos_libreria() -> list[RepoSemilla]:
    semillas = []
    config_dir = Path(__file__).parent.parent.parent / "config"
    for archivo in config_dir.glob("repos-libreria-*.json"):
        try:
            data = json.loads(archivo.read_text(encoding="utf-8"))
            for pkg in data.get("paquetes", []):
                repo = pkg.get("repo", "")
                if "/" in repo:
                    owner, name = repo.split("/", 1)
                    semillas.append(RepoSemilla(owner, name, f"https://github.com/{repo}"))
        except Exception:
            pass
    return semillas

def _leer_repos_library_ts() -> list[RepoSemilla]:
    semillas = []
    lib_dir = Path(__file__).parent.parent.parent / "src" / "lib" / "library"
    if not lib_dir.exists(): return semillas
    for archivo in lib_dir.glob("repos-*.ts"):
        try:
            txt = archivo.read_text(encoding="utf-8")
            for m in re.finditer(r'"([\w-]+/[\w.-]+)"', txt):
                repo = m.group(1)
                if "/" in repo:
                    owner, name = repo.split("/", 1)
                    semillas.append(RepoSemilla(owner, name, f"https://github.com/{repo}"))
        except Exception:
            pass
    return semillas

def leer_semillas() -> list[RepoSemilla]:
    """Combina semillas de config/ y src/lib/library/; único por full_name."""
    vistos = set()
    salida = []
    for s in _leer_repos_libreria() + _leer_repos_library_ts():
        key = s.full_name().lower()
        if key not in vistos:
            vistos.add(key)
            salida.append(s)
    return salida