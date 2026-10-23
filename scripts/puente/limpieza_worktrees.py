# scripts/puente/limpieza_worktrees.py
import os
from typing import List, Dict, Any

#: (2026-10-23) También las integradas («commit») y las descartadas: un worktree LIMPIO de una tarea
#: que ya está en main no guarda nada que no esté en su rama `ola/<ID>`.
ESTADOS_CERRADOS = ("rechazada", "sustituida", "commit", "hecho", "descartada")

def plan(worktrees: List[Dict[str, Any]], progreso: Dict[str, Any], en_curso: List[str]) -> Dict[str, List[str]]:
    """
    Devuelve {"quitar": [rutas], "nm": [rutas]} basado en el estado de los worktrees.
    """
    quitar = []
    nm = []
    for wt in worktrees:
        ruta = wt["ruta"]
        tarea = wt["tarea"]
        limpio = wt["limpio"]
        integrada = wt["integrada"]
        nm_real = wt["nm_real"]
        # Condiciones para quitar: worktree limpio y (estado cerrado o integrada) y no en curso ni pendiente/en_curso
        estado = progreso.get(tarea, {}).get("estado", "")
        if limpio and (estado in ESTADOS_CERRADOS or integrada) and tarea not in en_curso and estado not in ("pendiente", "en_curso"):
            quitar.append(ruta)
        # Condiciones para nm: node_modules real y no en curso y no en quitar (aunque no esté limpio)
        if nm_real and tarea not in en_curso and ruta not in quitar:
            nm.append(ruta)
    return {"quitar": quitar, "nm": nm}

def recoger(raiz_wt: str, repo: str, git_fn) -> List[Dict[str, Any]]:
    """
    Lista los worktrees en raiz_wt y devuelve una lista de dicts con:
    {ruta, tarea, limpio, integrada, nm_real}
    """
    worktrees = []
    # Asumimos que los worktrees son directorios inmediatos en raiz_wt
    for nombre in os.listdir(raiz_wt):
        ruta = os.path.join(raiz_wt, nombre)
        if not os.path.isdir(ruta):
            continue
        # El nombre del directorio es el <tarea> parte (sin el prefijo "ola/")
        tarea = nombre
        # limpio: git status --porcelain vacío
        limpio = not git_fn(ruta, "status --porcelain")
        # integrada: rama ola/<tarea> es ancestro de main
        integrada = (git_fn(ruta, f"merge-base --is-ancestor ola/{tarea} main") == 0)
        # nm_real: node_modules es un directorio y no un enlace simbólico
        nm_path = os.path.join(ruta, "node_modules")
        nm_real = os.path.isdir(nm_path) and not os.path.islink(nm_path)
        worktrees.append({
            "ruta": ruta,
            "tarea": tarea,
            "limpio": limpio,
            "integrada": integrada,
            "nm_real": nm_real
        })
    return worktrees

def aplicar(plan: Dict[str, List[str]], repo: str, git_fn, rmtree_fn) -> Dict[str, List[str]]:
    """
    Ejecuta el plan: para cada ruta en "quitar", primero elimina enlaces node_modules y .env.local si son enlaces,
    luego elimina el worktree con git worktree remove. Para "nm", elimina el directorio node_modules.
    Devuelve {"quitados": [...], "nm_borrados": [...], "errores": [...]}
    """
    quitados = []
    nm_borrados = []
    errores = []
    # Procesar quitar primero
    for ruta in plan.get("quitar", []):
        try:
            # Eliminar enlaces node_modules y .env.local si son enlaces
            for enlace in ["node_modules", ".env.local"]:
                path = os.path.join(ruta, enlace)
                if os.path.islink(path):
                    os.unlink(path)
            # Eliminar el worktree
            git_fn(ruta, "worktree remove", ruta)  # Asumimos que git_fn toma el comando y args
            quitados.append(ruta)
        except Exception as e:
            errores.append(f"Error al quitar {ruta}: {e}")
    # Procesar nm
    for ruta in plan.get("nm", []):
        try:
            nm_path = os.path.join(ruta, "node_modules")
            if os.path.isdir(nm_path) and not os.path.islink(nm_path):
                rmtree_fn(nm_path)
                nm_borrados.append(ruta)
            else:
                print(f"DEBUG: nm_path={nm_path}, isdir={os.path.isdir(nm_path)}, islink={os.path.islink(nm_path)}")
        except Exception as e:
            errores.append(f"Error al eliminar node_modules en {ruta}: {e}")
    return {"quitados": quitados, "nm_borrados": nm_borrados, "errores": errores}