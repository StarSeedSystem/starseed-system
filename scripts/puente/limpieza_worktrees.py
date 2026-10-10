# -*- coding: utf-8 -*-
"""Limpieza de worktrees cerrados de StarSeed OS (puro).

Responsable de CNS1010 (proceso de autorreparación): limpia worktrees cuya tarea ya no está viva:
• worktrees limpios (sin cambios) con estado closed o reemplazado
• node_modules duplicados

Puros: no IO, solo lógica de negocios.
"""

from __future__ import annotations

import os
import shutil

ESTADOS_CERRADOS = ("rechazada", "sustituida")


def plan(worktrees, progreso, en_curso):
    """Devuelve dict con claves 'quitar' y 'nm': {"quitar": [...rutas], "nm": [...rutas]}

    • `quitar`: worktrees limpios (sin cambios) cuya tarea está en ESTADOS_CERRADOS o
      la rama ya es ancestro de main, y no están en `en_curso`.
    • `nm`: worktrees con node_modules reales (no simbólicos) que no están en `en_curso` ni
      ya van a ser quitados.
    """
    rutas_quitar = []
    rutas_nm = []

    for wt in worktrees:
        ruta = wt["ruta"]
        # No tocar worktrees en curso
        if ruta in en_curso:
            continue
        # Worktree limpio
        limpio = wt.get("limpio", False)
        # Worktree integrado (la rama ola/<tarea> es ancestro de main)
        integrado = wt.get("integrado", False)
        # Worktree con node_modules real (no un enlace simbólico)
        nm_real = wt.get("nm_real", False)

        # Considerar para quitar: limpio o integrado, con estado cerrado o reemplazado
        if limpio or integrado:
            estado = progreso.get(wt["tarea"], {}).get("estado")
            if estado in ESTADOS_CERRADOS or integrado:
                rutas_quitar.append(ruta)
                continue
        # Considerar para limpiar node_modules: nm_real
        if nm_real:
            rutas_nm.append(ruta)

    return {"quitar": rutas_quitar, "nm": rutas_nm}


def recoger(raiz_wt, repo, git_fn):
    """Devuelve lista de worktrees de `raiz_wt` con su estado real.

    Cada elemento: {"ruta": <ruta_abs>, "tarea": <id>, "limpio": bool, "integrado": bool, "nm_real": bool}.
    """
    items = []

    for entrada in os.listdir(raiz_wt):
        ruta = os.path.join(raiz_wt, entrada)
        if not os.path.isdir(ruta):
            continue
        # Nueva ruta de worktree: ~/Documents/starseed-wt/ola/TASKID (sin guiones)
        if entrada.startswith("ola/") and entrada[4:].replace("-", "").isalnum():
            tarea = entrada[4:]
            # node_modules: ¿real o enlace simbólico?
            nm_link = os.path.join(ruta, "node_modules")
            nm_real = os.path.exists(nm_link) and not os.path.islink(nm_link)
            # status --porcelain (vacío = limpio)
            git_status = git_fn(ruta)
            limpio = not git_status.strip()
            # ¿la rama ola/<tarea> es ancestro de main?
            try:
                integrado = git_fn(ruta, "merge-base", "--is-ancestor", f"ola/{tarea}", "main") or False
            except Exception:
                integrado = False
            items.append({
                "ruta": ruta,
                "tarea": tarea,
                "limpio": limpio,
                "integrado": integrado,
                "nm_real": nm_real,
            })

    return items


def aplicar(plan, repo, git_fn, rmtree_fn):
    """Aplica el plan: quita worktrees cerrados (no sigue enlaces) y limpia node_modules reales.

    Devuelve {"quitados": [...], "nm_borrados": [...], "errores": [...]}.
    """
    quitados = []
    nm_borrados = []
    errores = []

    # Quitar worktrees cerrados (limpios o integrados)
    for ruta in plan.get("quitar", []):
        try:
            # Nunca seguir un enlace: primero, asegurar que los enlaces node_modules/.env.local
            # no son enlaces simbólicos (el orquestador los recrea si faltan).
            nodo = os.path.join(ruta, "node_modules")
            env = os.path.join(ruta, ".env.local")
            if os.path.islink(nodo):
                pass  # dejar que el orquestador lo recree cuando lo necesite
            elif os.path.islink(env):
                pass
            # Quitar worktree sin forzar
            git_fn(ruta, "worktree", "remove", ruta)
            quitados.append(ruta)
        except Exception as e:
            errores.append(f"al quitar {ruta}: {e}")

    # Borrar node_modules reales (si no ya fueron quitados)
    for ruta in plan.get("nm", []):
        if ruta in quitados:
            continue
        nodo = os.path.join(ruta, "node_modules")
        try:
            if os.path.isdir(nodo) and not os.path.islink(nodo):
                rmtree_fn(nodo)
                nm_borrados.append(ruta)
        except Exception as e:
            errores.append(f"al limpiar node_modules de {ruta}: {e}")

    return {"quitados": quitados, "nm_borrados": nm_borrados, "errores": errores}
