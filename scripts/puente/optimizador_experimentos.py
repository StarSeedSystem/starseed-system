# -*- coding: utf-8 -*-
"""optimizador_experimentos · director optimizador (StarSeed OS, 2026-10-04).

Ciclo de vida de los experimentos (§6 del contrato director-optimizador.md):
cada cambio de perilla se abre con métricas base y una ventana (120 min),
y al cerrarse se confirma o se deshace solo según la mejora. `evaluar` es pura;
`abiertos`/`anotar` tocan solo el JSONL (ruta inyectable); `cerrar` devuelve
el acierto a Jev mediante un callback inyectable (en producción,
`decidir.py confirmar`).
"""

from __future__ import annotations

import hashlib
import json
import os

RUTA_DEFECTO = os.path.expanduser("~/.starseed/optimizador/experimentos.jsonl")
VENTANA_MIN = 120
UMBRAL_MEJORA = 0.10

# Sentido de cada métrica objetivo: "mas" si más es mejor, "menos" si menos lo es.
SENTIDO = {
    "integradas_h": "mas",
    "fraccion_escribiendo": "mas",
    "tasa": "mas",
    "listas": "menos",
    "segundos_mediana": "menos",
    "segundos_p90": "menos",
    "fallos": "menos",
    "swap_usado_mb": "menos",
    "jev_dia_usd": "menos",
    "opus_semana_pct": "menos",
    "supabase_pct_dia": "menos",
    "commits_por_run": "mas",
    "runs_nube_dia": "menos",
}
SENTIDO_DEFECTO = "mas"


def abrir(accion, perilla, antes, despues, metrica_objetivo, base, jev_exp, ahora):
    """Crea el registro de un experimento abierto (sin escribir en disco)."""
    t = int(ahora)
    semilla = f"{accion}|{perilla}|{t}|{jev_exp}"
    return {
        "id": "exp-" + hashlib.sha1(semilla.encode("utf-8")).hexdigest()[:12],
        "t": t,
        "accion": accion,
        "perilla": perilla,
        "antes": antes,
        "despues": despues,
        "metrica_objetivo": metrica_objetivo,
        "base": base,
        "ventana_min": VENTANA_MIN,
        "jev_exp": jev_exp,
        "estado": "abierto",
        "cierre": None,
    }


def _mejora_relativa(metrica, base, actual):
    """Signo positivo = mejora, negativo = empeora; respeta SENTIDO."""
    if base is None or actual is None:
        return None
    try:
        b = float(base)
        a = float(actual)
    except (TypeError, ValueError):
        return None
    if b == 0:
        if a == b:
            return 0.0
        return 1.0 if (a > b) == (SENTIDO.get(metrica, SENTIDO_DEFECTO) == "mas") else -1.0
    bruta = (a - b) / abs(b)
    return bruta if SENTIDO.get(metrica, SENTIDO_DEFECTO) == "mas" else -bruta


def evaluar(exp, m_actual, ahora):
    """Pura. Dentro de la ventana → "esperar"; mejora ≥ 10 % → "confirmar";
    empeora → "deshacer"; sin empeorar (0–10 %) → "confirmar" (contrato §6:
    'no empeora con menos coste' también confirma)."""
    ventana_s = int(exp.get("ventana_min", VENTANA_MIN)) * 60
    if int(ahora) - int(exp["t"]) < ventana_s:
        return "esperar"
    mejora = _mejora_relativa(exp.get("metrica_objetivo"), exp.get("base"), m_actual)
    if mejora is None:
        return "esperar"
    if mejora >= UMBRAL_MEJORA:
        return "confirmar"
    if mejora < 0:
        return "deshacer"
    return "confirmar"


def abiertos(ruta=RUTA_DEFECTO):
    """Lee el JSONL y devuelve los registros con estado 'abierto'.
    Las líneas rotas se ignoran (el archivo sigue siendo legible)."""
    vivos = []
    if not os.path.exists(ruta):
        return vivos
    with open(ruta, "r", encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea:
                continue
            try:
                reg = json.loads(linea)
            except json.JSONDecodeError:
                continue
            if isinstance(reg, dict) and reg.get("estado") == "abierto":
                vivos.append(reg)
    return vivos


def anotar(ruta, registro):
    """Append-only: añade el registro como una línea JSON (crea la carpeta)."""
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as f:
        f.write(json.dumps(registro, ensure_ascii=False, sort_keys=True) + "\n")
    return registro


def cerrar(exp, veredicto, ahora, confirmar_jev):
    """Cierra el experimento: estado 'confirmado'|'deshecho' según el veredicto
    ('confirmar'|'deshacer') y devuelve el acierto a Jev: si el veredicto es
    confirmar el cambio funcionó (acierto "si"), si se deshace, "no".
    `confirmar_jev(jev_exp, acierto)` es inyectable."""
    if veredicto not in ("confirmar", "deshacer"):
        raise ValueError(f"veredicto desconocido: {veredicto!r}")
    cerrado = dict(exp)
    cerrado["estado"] = "confirmado" if veredicto == "confirmar" else "deshecho"
    cerrado["cierre"] = {"t": int(ahora), "veredicto": veredicto}
    acierto = "si" if veredicto == "confirmar" else "no"
    if confirmar_jev is not None:
        confirmar_jev(cerrado.get("jev_exp"), acierto)
    return cerrado
