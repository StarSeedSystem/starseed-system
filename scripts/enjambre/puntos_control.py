"""Puntos de control (COL1012D): cada 5 min el trabajo a medias de un agente deja
de vivir solo en el disco de su aparato. Contrato: architecture/colmena-relevo-contenedores.md.

Módulo sin estado global: quien llama inyecta `sh` (ejecutor de comandos) y `commit`
(salvavidas) para poder probarlo sin git ni disco reales. Recuerda quién debe punto
en memoria del proceso: el archivo `olas/puntos-control.json` lo escribe `anotar`.
"""

import importlib.util
import json
import os
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

#: periodo entre puntos de control por tarea (segundos); el máximo que se pierde.
PUNTO_CONTROL_S = 300


def _cargar_colmena():
    """Importa scripts/puente/colmena_logica.py POR RUTA (no hay paquete instalable)."""
    ruta = os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "puente", "colmena_logica.py")
    )
    spec = importlib.util.spec_from_file_location("colmena_logica", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


colmena = _cargar_colmena()


def sh_por_defecto(args: List[str], cwd: Optional[str] = None, timeout: int = 30) -> Tuple[int, str]:
    """Ejecutor real: subprocess con cwd, igual que el `sh` del orquestador."""
    import subprocess

    try:
        r = subprocess.run(
            args, cwd=cwd, timeout=timeout, capture_output=True, text=True
        )
        return r.returncode, (r.stdout or "").strip()
    except Exception:
        return 1, ""


def hay_cambios(worktree: str, sh: Callable[..., Tuple[int, str]]) -> bool:
    """True si el worktree tiene diferencias (`git status --porcelain` no vacío)."""
    rc, st = sh(["git", "status", "--porcelain"], cwd=worktree, timeout=30)
    return rc == 0 and bool((st or "").strip())


def revisar(tareas_vivas: Iterable[Dict[str, Any]], ahora: float, guardar: Callable[[str], Any],
            sh: Optional[Callable[..., Tuple[int, str]]] = None) -> List[str]:
    """Para cada tarea viva decide (colmena_logica.debe_guardar_punto) si toca punto y, si toca,
    llama a `guardar(tid)`. Devuelve los tid guardados (para pruebas y registros).

    Cada item de `tareas_vivas` es {id, fase, cambios?, worktree?, punto?}. Si `cambios` no
    viene calculado y hay `sh` y `worktree`, se mide aquí con git status."""
    ejecutor = sh or sh_por_defecto
    guardados: List[str] = []
    for t in tareas_vivas or ():
        tid = str(t.get("id") or t.get("tid") or "")
        if not tid:
            continue
        tarea = dict(t)
        if "cambios" not in tarea and tarea.get("worktree"):
            try:
                tarea["cambios"] = hay_cambios(str(tarea["worktree"]), ejecutor)
            except Exception:
                tarea["cambios"] = False
        if not colmena.debe_guardar_punto(tarea, ahora):
            continue
        try:
            guardar(tid)
            guardados.append(tid)
        except Exception:
            pass
    return guardados


def anotar(ruta_json: str, tid: str, rama: str, sha: Optional[str], ahora: float) -> None:
    """Escribe de forma ATÓMICA (tmp + os.replace) `{tid: {rama, sha, t}}` en `ruta_json`."""
    datos = _leer(ruta_json)
    datos[tid] = {"rama": rama, "sha": sha, "t": float(ahora)}
    _escribir(ruta_json, datos)


def quitar(ruta_json: str, tid: str) -> bool:
    """Borra `tid` del archivo de puntos (escritura atómica). True si estaba."""
    datos = _leer(ruta_json)
    if tid not in datos:
        return False
    datos.pop(tid)
    _escribir(ruta_json, datos)
    return True


def _leer(ruta_json: str) -> Dict[str, Any]:
    try:
        with open(ruta_json, "r", encoding="utf-8") as f:
            datos = json.load(f)
        return datos if isinstance(datos, dict) else {}
    except Exception:
        return {}


def _escribir(ruta_json: str, datos: Dict[str, Any]) -> None:
    """Escritura atómica: tmp en la MISMA carpeta + os.replace (un corte nunca deja
    el archivo a medias, que es exactamente el fallo contra el que nace este módulo)."""
    os.makedirs(os.path.dirname(os.path.abspath(ruta_json)), exist_ok=True)
    tmp = ruta_json + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)
    os.replace(tmp, ruta_json)


def cargar(ruta_json: str) -> Dict[str, Any]:
    """Lee el archivo de puntos {tid: {rama, sha, t}}; {} si no existe o está roto."""
    return _leer(ruta_json)
