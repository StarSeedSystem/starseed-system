#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Maggabit · plan de repos de GitHub (MAG1117): espejo, paquete y código abierto.

Módulo puro: `plan` decide las acciones y `ordenes` las traduce a comandos git
exactos. La E/S (reloj, subprocess, lectura de disco) es una capa fina aparte y
todo inyectable. Reglas del contrato: con el disco ausente nada falla ni espera;
nunca se borra en el origen; todo subprocess lleva timeout y ante un volumen que
no responde se anota «sin-respuesta», nunca se cuelga; nunca se imprimen ni se
registran tokens, claves ni URLs con credenciales.

Las rutas de las acciones usan prefijos literales: «TRABAJO/» (raíz del volumen
de trabajo, donde viven los espejos) y «RAIZ/» (raíz de MetaGenesis, donde viven
los paquetes y el código abierto); la capa de E/S los resuelve contra sus raíces
reales. Un clon grande cortado por la red no deja espejo, así que la pasada
siguiente lo reintenta sola.

Pruebas: scripts/puente/test_maggabit_repos.py (herméticas: no tocan /Volumes,
la red, ~/.starseed ni el disco real; ninguna ejecuta git).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

CUENTAS = ("StarSeedSystem", "alexbordongarrigos")
SEMILLA = "StarSeedSystem/starseed-system"
SEMILLA_REFERENCIA = "~/Documents/starseed-os-main"
PASOS = ("clonar", "actualizar", "empaquetar", "abrir", "avanzar")

__all__ = ["CUENTAS", "SEMILLA", "SEMILLA_REFERENCIA", "PASOS", "plan", "ordenes"]


def _nombre(repo: Dict[str, Any]) -> Optional[str]:
    """Nombre completo «cuenta/repo» de un repo de GitHub, o None si no sale."""
    full = repo.get("full_name") or repo.get("nombre") or ""
    if isinstance(full, str) and "/" in full:
        return full
    cuenta = repo.get("cuenta") or repo.get("owner")
    if isinstance(cuenta, dict):
        cuenta = cuenta.get("login")
    nombre = repo.get("repo") or repo.get("name")
    if isinstance(cuenta, str) and isinstance(nombre, str) and cuenta and nombre:
        return f"{cuenta}/{nombre}"
    return None


def _url(repo: Dict[str, Any], full: str) -> str:
    """URL pública de clonado del repo (nunca lleva credenciales)."""
    for clave in ("clone_url", "html_url", "url"):
        valor = repo.get(clave)
        if isinstance(valor, str) and valor.startswith("https://github.com/"):
            return valor
    return f"https://github.com/{full}.git"


def _rama(repo: Dict[str, Any]) -> str:
    """Rama por defecto de GitHub del repo (main si no la dice)."""
    rama = repo.get("default_branch") or repo.get("rama")
    return rama if isinstance(rama, str) and rama else "main"


def _accion(full: str, paso: str, url: str, rama: str,
            nota: Optional[str] = None) -> Dict[str, Any]:
    """Una acción del plan: una por repo y paso, con sus rutas plantilla."""
    cuenta, _, nombre = full.partition("/")
    datos: Dict[str, Any] = {
        "id": full,
        "cuenta": cuenta,
        "repo": nombre,
        "paso": paso,
        "url": url,
        "rama": rama,
        "espejo": f"TRABAJO/respaldo/repos/{cuenta}/{nombre}.git",
        "paquete": f"RAIZ/MetaGenesis/repos-paquetes/{cuenta}__{nombre}.bundle",
        "paquete_tmp": (
            f"RAIZ/MetaGenesis/repos-paquetes/{cuenta}__{nombre}.bundle.tmp"
        ),
        "destino": f"RAIZ/MetaGenesis/codigo/{cuenta}/{nombre}",
    }
    if nota is not None:
        datos["nota"] = nota
    return datos


def _paso_espejo(full: str, espejo: Optional[Dict[str, Any]],
                 guardada: Optional[str], url: str, rama: str
                 ) -> List[Dict[str, Any]]:
    """Acciones de espejo (clonar/actualizar/empaquetar) para un repo."""
    if espejo is None:
        return [_accion(full, "clonar", url, rama)]
    if espejo.get("sin_respuesta"):
        return [_accion(full, "actualizar", url, rama, nota="sin-respuesta")]
    acciones = [_accion(full, "actualizar", url, rama)]
    huella = espejo.get("huella")
    if huella is None:
        return acciones + [_accion(full, "empaquetar", url, rama, nota="vacío")]
    if huella != guardada:
        return acciones + [_accion(full, "empaquetar", url, rama)]
    return acciones


def _paso_codigo(full: str, abierto: Optional[Dict[str, Any]],
                 url: str, rama: str) -> List[Dict[str, Any]]:
    """Acciones de código abierto (abrir/avanzar) para un repo."""
    if abierto is None:
        return [_accion(full, "abrir", url, rama)]
    if abierto.get("sin_respuesta"):
        return [_accion(full, "avanzar", url, rama, nota="sin-respuesta")]
    if abierto.get("avanza") is False:
        return [_accion(full, "avanzar", url, rama, nota="NO-AVANZA")]
    return [_accion(full, "avanzar", url, rama)]


def plan(repos: List[Dict[str, Any]], espejos: Dict[str, Dict[str, Any]],
         paquetes: Dict[str, str], abiertos: Dict[str, Dict[str, Any]]
         ) -> List[Dict[str, Any]]:
    """Plan de acciones: una por repo y paso, agrupadas por paso.

    `espejos` trae el estado leído de cada espejo ({"huella": …} o
    {"sin_respuesta": True}); `paquetes` la huella de referencias guardada de
    cada paquete; `abiertos` el clon abierto ({"avanza": False} si el avance
    rápido no es posible). Las anotaciones («vacío», «NO-AVANZA»,
    «sin-respuesta») viajan en `nota` y `ordenes` no genera comandos para ellas.
    """
    vistos: List[str] = []
    for repo in repos:
        full = _nombre(repo)
        if full is None or full in vistos:
            continue
        if full.partition("/")[0] in CUENTAS:
            vistos.append(full)
    por_paso: Dict[str, List[Dict[str, Any]]] = {paso: [] for paso in PASOS}
    for full in vistos:
        repo = next(r for r in repos if _nombre(r) == full)
        url, rama = _url(repo, full), _rama(repo)
        espejo = espejos.get(full)
        pasos = _paso_espejo(full, espejo, paquetes.get(full), url, rama)
        pasos += _paso_codigo(full, abiertos.get(full), url, rama)
        for accion in pasos:
            por_paso[accion["paso"]].append(accion)
    resultado: List[Dict[str, Any]] = []
    for paso in PASOS:
        resultado.extend(por_paso[paso])
    return resultado


_SIN_ORDEN = ("vacío", "NO-AVANZA", "sin-respuesta")


def ordenes(accion: Dict[str, Any]) -> List[List[str]]:
    """Comandos exactos de una acción (lista vacía para las anotadas).

    Nunca se fuerza nada: un avance que no sea rápido no se ejecuta y
    queda anotado «NO-AVANZA» para revisarlo a mano. El paquete se escribe a
    .tmp y se renombra al final para no dejar bundles a medias. El espejo de
    «SEMILLA» se siembra con `--reference-if-able` contra la copia local del OS
    y luego se repackea y quita sus alternates, para no bajar 1,1 GB.
    """
    if accion.get("nota") in _SIN_ORDEN:
        return []
    paso, espejo = accion["paso"], accion["espejo"]
    destino, url, rama = accion["destino"], accion["url"], accion["rama"]
    if paso == "clonar":
        base = ["git", "clone", "--mirror"]
        if accion["id"] == SEMILLA:
            base += ["--reference-if-able", SEMILLA_REFERENCIA]
        ordenes_clonado = [base + [url, espejo]]
        if accion["id"] == SEMILLA:
            ordenes_clonado.append(["git", "-C", espejo, "repack", "-a", "-d"])
            ordenes_clonado.append(
                ["rm", "-f", f"{espejo}/objects/info/alternates"]
            )
        return ordenes_clonado
    if paso == "actualizar":
        return [["git", "-C", espejo, "remote", "update", "--prune"]]
    if paso == "empaquetar":
        return [
            ["git", "-C", espejo, "bundle", "create", accion["paquete_tmp"],
             "--all"],
            ["mv", accion["paquete_tmp"], accion["paquete"]],
        ]
    if paso == "abrir":
        return [
            ["git", "clone", "--no-hardlinks", espejo, destino],
            ["git", "-C", destino, "remote", "set-url", "origin", url],
        ]
    if paso == "avanzar":
        return [
            ["git", "-C", destino, "fetch", "--prune", "origin"],
            ["git", "-C", destino, "merge", "--ff-only", f"origin/{rama}"],
        ]
    return []
