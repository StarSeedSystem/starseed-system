"""Evaluador de pruebas con umbrales numéricos (BAP1127P · D.5). PURO: solo números, ningún modelo decide el verde.

evaluar(medidas, umbrales, nivel) → {veredicto: verde|rojo|sin-dato, por_prueba: {id: {valor, umbral, ok, motivo}}}
regresiones(actual, anterior, tolerancia) → pruebas que empeoran más de la tolerancia aunque sigan sobre el umbral.
Una medida ausente es «sin-dato», nunca verde.
"""
from __future__ import annotations

from typing import Any

import registro_pruebas_logica as RP

NIVELES = ("anillo", "publica")
TOLERANCIA = 0.15


def _regla(cfg: dict[str, Any], nivel: str) -> dict[str, Any]:
    """La regla del nivel; si «publica» no define una propia, vale la del anillo."""
    return cfg.get(nivel) or cfg.get("anillo") or {}


def _num(x: Any) -> float | None:
    if isinstance(x, bool) or not isinstance(x, (int, float)) or x != x:
        return None
    return float(x)


def _por_canon(medidas: dict[str, Any], equivalencias: Any) -> dict[str, Any]:
    salida: dict[str, Any] = {}
    for clave, valor in (medidas or {}).items():
        canon = RP.id_canonico(clave, equivalencias) or str(clave)
        salida[canon] = valor
    return salida


def _juzgar(valor: Any, regla: dict[str, Any]) -> tuple[bool | None, str]:
    """(ok, motivo); ok None = sin dato."""
    if "igual" in regla:
        if not isinstance(valor, dict) or valor.get("valor") is None or valor.get("esperado") is None:
            return None, "falta el hash medido o el esperado"
        ok = valor["valor"] == valor["esperado"]
        return ok, "hash idéntico" if ok else "el hash no coincide"
    n = _num(valor)
    if n is None:
        return None, "sin medida"
    if "min" in regla:
        ok = n >= regla["min"]
        return ok, ("%g ≥ %g" % (n, regla["min"])) if ok else "%g no llega al mínimo %g" % (n, regla["min"])
    if "max" in regla:
        ok = n <= regla["max"]
        return ok, ("%g ≤ %g" % (n, regla["max"])) if ok else "%g supera el máximo %g" % (n, regla["max"])
    if "max_excl" in regla:
        ok = n < regla["max_excl"]
        return ok, ("%g < %g" % (n, regla["max_excl"])) if ok else "%g no es menor que %g" % (n, regla["max_excl"])
    return None, "el umbral no define regla"


def evaluar(medidas: dict[str, Any], umbrales: dict[str, Any], nivel: str = "anillo",
            equivalencias: Any = None) -> dict[str, Any]:
    if nivel not in NIVELES:
        raise ValueError("nivel desconocido: %r" % (nivel,))
    cfg = (umbrales or {}).get("pruebas", umbrales or {})
    dadas = _por_canon(medidas, equivalencias if equivalencias is not None else {})
    por_prueba: dict[str, Any] = {}
    for pid, c in cfg.items():
        regla = _regla(c, nivel)
        valor = dadas.get(pid)
        ok, motivo = _juzgar(valor, regla)
        por_prueba[pid] = {"valor": valor, "umbral": regla, "ok": ok, "motivo": motivo}
    oks = [p["ok"] for p in por_prueba.values()]
    veredicto = "rojo" if False in oks else "sin-dato" if (not oks or None in oks) else "verde"
    return {"veredicto": veredicto, "por_prueba": por_prueba}


def regresiones(actual: dict[str, Any], anterior: dict[str, Any], umbrales: dict[str, Any] | None = None,
                tolerancia: float = TOLERANCIA, equivalencias: Any = None) -> list[str]:
    """Pruebas numéricas que empeoran más de `tolerancia` (relativa) respecto a la corrida anterior.

    «Mejor» es más alto si el umbral es `min` y más bajo si es `max`/`max_excl`; sin umbrales, se supone más alto = mejor."""
    cfg = (umbrales or {}).get("pruebas", umbrales or {})
    act = _por_canon(actual, equivalencias if equivalencias is not None else {})
    ant = _por_canon(anterior, equivalencias if equivalencias is not None else {})
    malas: list[str] = []
    for pid in sorted(set(act) & set(ant)):
        a, b = _num(act[pid]), _num(ant[pid])
        if a is None or b is None or b == 0:
            continue
        r = _regla(cfg.get(pid, {}), "anillo")
        menor_es_mejor = "max" in r or "max_excl" in r
        peor = (a - b) / abs(b) if menor_es_mejor else (b - a) / abs(b)
        if peor > tolerancia:
            malas.append(pid)
    return malas
