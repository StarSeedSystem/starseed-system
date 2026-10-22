#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ajustes y horario del autodesarrollo (§4 de architecture/imaginacion-autodesarrollo.md): puro,
sin red, sin disco y con el reloj por parámetro; «lo importante siempre con visto bueno» es fijo."""

import copy
VISTO_BUENO_IMPORTANTES = True

AJUSTES_POR_DEFECTO: dict = {
    "automatico": True,
    "rango": {"min": 0, "max": 10},
    "fuentes": {"diaria": True, "profunda": True, "astraura": True, "directores": True},
    "horario": {"modo": "inteligente", "repartir": True,
                "franjas": [{"dias": list(range(7)), "desde": "02:00", "hasta": "06:00"}]},
    "profunda": {"cada_dias": 7},
}


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _hora_ms(v):
    hh, mm = (v[:2], v[3:]) if isinstance(v, str) and len(v) == 5 and v[2] == ":" else ("", "")
    return v if (hh + mm).isdigit() and int(hh) <= 23 and int(mm) <= 59 else None


def _franja_valida(f):
    if not isinstance(f, dict) or not isinstance(f.get("dias"), list):
        return None
    desde, hasta = _hora_ms(f.get("desde")), _hora_ms(f.get("hasta"))
    dias = sorted({x for x in f["dias"] if isinstance(x, int) and not isinstance(x, bool) and 0 <= x <= 6})
    return None if desde is None or hasta is None or not dias else {"dias": dias, "desde": desde, "hasta": hasta}


def _rango_valida(r):
    if not isinstance(r, dict):
        return {"min": 0, "max": 10}
    mn = max(0, min(10, r.get("min"))) if isinstance(r.get("min"), int) and not isinstance(r["min"], bool) else 0
    mx = max(0, min(10, r.get("max"))) if isinstance(r.get("max"), int) and not isinstance(r["max"], bool) else 10
    return {"min": min(mn, mx), "max": max(mn, mx)}


def validar_ajustes(d) -> dict:
    """Lo inválido vuelve al defecto; el rango se acota a 0–10 y min ≤ max."""
    a = copy.deepcopy(AJUSTES_POR_DEFECTO)
    a["importantes_visto_bueno"] = VISTO_BUENO_IMPORTANTES
    if not isinstance(d, dict):
        return a
    if isinstance(d.get("fuentes"), dict):
        a["fuentes"].update({k: v for k, v in d["fuentes"].items() if k in a["fuentes"] and isinstance(v, bool)})
    h = d.get("horario") if isinstance(d.get("horario"), dict) else {}
    a["horario"]["modo"] = h.get("modo") if h.get("modo") in ("inteligente", "franjas") else a["horario"]["modo"]
    validas = [f for f in (_franja_valida(x) for x in h.get("franjas") or []) if f] if isinstance(h.get("franjas"), list) else []
    a["horario"]["franjas"] = validas or a["horario"]["franjas"]
    a["horario"]["repartir"] = h.get("repartir") if isinstance(h.get("repartir"), bool) else a["horario"]["repartir"]
    p = d.get("profunda") if isinstance(d.get("profunda"), dict) else {}
    cada = p.get("cada_dias")
    if isinstance(cada, int) and not isinstance(cada, bool) and cada >= 0:
        a["profunda"]["cada_dias"] = cada
    a["rango"] = _rango_valida(d.get("rango"))
    if isinstance(d.get("automatico"), bool):
        a["automatico"] = d["automatico"]
    return a


def en_franja(ahora, franjas) -> bool:
    """¿Está `ahora` dentro de alguna franja? Las que cruzan medianoche, incluidas."""
    try:
        t, dia = ahora.hour * 60 + ahora.minute, ahora.weekday()
    except AttributeError:
        return False
    for f in franjas if isinstance(franjas, list) else []:
        f = _franja_valida(f)
        if f is None:
            continue
        desde, hasta = int(f["desde"][:2]) * 60 + int(f["desde"][3:]), int(f["hasta"][:2]) * 60 + int(f["hasta"][3:])
        if (desde <= hasta and dia in f["dias"] and desde <= t <= hasta) or (
            desde > hasta and ((dia in f["dias"] and t >= desde) or ((dia - 1) % 7 in f["dias"] and t <= hasta))
        ):
            return True
    return False


def toca_ejecutar(ahora, horario, capacidad):
    """(bool, motivo): «inteligente» pide algún hueco + proveedores con cupo + presión < 2
    (prefiere la noche); «franjas», solo estar dentro de una."""
    if not isinstance(horario, dict) or horario.get("modo") not in ("inteligente", "franjas"):
        return False, "modo de horario inválido o ausente"
    franjas = horario.get("franjas") if isinstance(horario.get("franjas"), list) else []
    if horario["modo"] == "franjas":
        return ((True, "dentro de las franjas de horario") if en_franja(ahora, franjas)
                else (False, "fuera de las franjas de horario"))
    t = (ahora.hour * 60 + ahora.minute) if hasattr(ahora, "hour") else -1
    if t < 0:
        return False, "reloj inválido"
    cap = capacidad if isinstance(capacidad, dict) else {}
    huecos = max(_num(cap.get(k)) or 0 for k in ("huecos_mac", "huecos_a1", "huecos_nube"))
    cupo = _num(cap.get("proveedores_con_cupo")) or 0
    presion = _num(cap.get("presion_mac"))
    faltas = [texto for texto, vale in (
        ("sin hueco libre en mac, A1 ni nube", huecos > 0), ("sin proveedores con cupo", cupo > 0),
        ("presión de la Mac alta o desconocida", presion is not None and presion < 2)) if not vale]
    if faltas:
        return False, "; ".join(faltas)
    if 6 * 60 <= t < 22 * 60:
        return True, "hay capacidad libre; lo preferente es dejarlo para la noche"
    return True, "noche con capacidad libre: mac, A1 o nube con huecos y proveedores con cupo"


def lotes(n, franjas_restantes, repartir) -> list:
    """Reparte n tareas entre las franjas que quedan hoy; sin repartir, todo al primer lote."""
    total = _num(n)
    if total is None or total <= 0 or not isinstance(franjas_restantes, list) or not franjas_restantes:
        return []
    total = int(total)
    if not isinstance(repartir, bool) or not repartir or len(franjas_restantes) == 1:
        return [total] + [0] * (len(franjas_restantes) - 1)
    base, resto = divmod(total, len(franjas_restantes))
    return [base + (1 if i < resto else 0) for i in range(len(franjas_restantes))]
