#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ajustes y horario del autodesarrollo (PURO: sin red ni disco, reloj por parámetro).
Contrato: architecture/imaginacion-autodesarrollo.md §4. Días 0 = lunes … 6 = domingo; una
franja que cruza la medianoche pertenece al día en que EMPIEZA. «Lo importante con visto
bueno» NO es un ajuste: ninguna clave lo apaga."""
from __future__ import annotations

import copy
import re
from datetime import datetime, timedelta

AJUSTES_POR_DEFECTO = {
    "automatico": True,
    "rango": {"min": 0, "max": 10},
    "fuentes": {"diaria": True, "profunda": True, "astraura": True, "directores": True},
    "horario": {
        "modo": "inteligente",
        "franjas": [{"dias": [0, 1, 2, 3, 4, 5, 6], "desde": "02:00", "hasta": "06:00"}],
        "repartir": True,
    },
    "profunda": {"cada_dias": 7},
}
_HORA = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def _min(hhmm):
    m = _HORA.match(hhmm) if isinstance(hhmm, str) else None
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def _entero(v, defecto, lo, hi):
    return defecto if isinstance(v, bool) or not isinstance(v, int) else max(lo, min(hi, v))


def _franja(f):
    if not isinstance(f, dict):
        return None
    dias = f.get("dias")
    if not isinstance(dias, list):
        return None
    dias = sorted({d for d in dias if isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6})
    if not dias or None in (_min(f.get("desde")), _min(f.get("hasta"))) or f["desde"] == f["hasta"]:
        return None
    return {"dias": dias, "desde": f["desde"], "hasta": f["hasta"]}


def validar_ajustes(d):
    """Devuelve ajustes completos y válidos; lo inválido vuelve al defecto."""
    r = copy.deepcopy(AJUSTES_POR_DEFECTO)
    if not isinstance(d, dict):
        return r
    if isinstance(d.get("automatico"), bool):
        r["automatico"] = d["automatico"]
    rg = d.get("rango") if isinstance(d.get("rango"), dict) else {}
    mn = _entero(rg.get("min"), r["rango"]["min"], 0, 10)
    mx = _entero(rg.get("max"), r["rango"]["max"], 0, 10)
    r["rango"] = {"min": min(mn, mx), "max": mx}
    fu = d.get("fuentes") if isinstance(d.get("fuentes"), dict) else {}
    for k in r["fuentes"]:
        if isinstance(fu.get(k), bool):
            r["fuentes"][k] = fu[k]
    h = d.get("horario") if isinstance(d.get("horario"), dict) else {}
    if h.get("modo") in ("inteligente", "franjas"):
        r["horario"]["modo"] = h["modo"]
    if isinstance(h.get("repartir"), bool):
        r["horario"]["repartir"] = h["repartir"]
    if isinstance(h.get("franjas"), list):
        validas = [x for x in (_franja(f) for f in h["franjas"]) if x]
        if validas or h["franjas"] == []:
            r["horario"]["franjas"] = validas
    p = d.get("profunda") if isinstance(d.get("profunda"), dict) else {}
    r["profunda"]["cada_dias"] = _entero(p.get("cada_dias"), 7, 0, 365)
    return r


def _dentro(ahora, f):
    a, desde, hasta = ahora.hour * 60 + ahora.minute, _min(f["desde"]), _min(f["hasta"])
    if desde < hasta:
        return ahora.weekday() in f["dias"] and desde <= a < hasta
    if a >= desde:
        return ahora.weekday() in f["dias"]
    return (ahora - timedelta(days=1)).weekday() in f["dias"] and a < hasta


def en_franja(ahora: datetime, franjas) -> bool:
    return any(_dentro(ahora, f) for f in map(_franja, franjas or []) if f)


def toca_ejecutar(ahora: datetime, horario, capacidad):
    """(bool, motivo). Inteligente: huecos, cupo y Mac sin presión; de día pide ≥ 2 huecos."""
    h = validar_ajustes({"horario": horario})["horario"]
    if h["modo"] == "franjas":
        if en_franja(ahora, h["franjas"]):
            return True, "dentro de una franja elegida"
        return False, "fuera de las franjas elegidas"
    c = capacidad if isinstance(capacidad, dict) else {}
    huecos = sum(max(0, c.get(k) or 0) for k in ("huecos_mac", "huecos_a1", "huecos_nube"))
    if huecos <= 0:
        return False, "no hay huecos libres en la Mac, el A1 ni la nube"
    if (c.get("proveedores_con_cupo") or 0) <= 0:
        return False, "ningún proveedor tiene cupo"
    if (c.get("presion_mac") or 0) >= 2:
        return False, "la Mac tiene presión de memoria"
    if 7 <= ahora.hour < 22 and huecos < 2:
        return False, "de día se espera a tener al menos 2 huecos (se prefiere la noche)"
    return True, f"hay capacidad libre ({huecos} huecos)"


def lotes(n, franjas_restantes, repartir=True):
    """Reparte `n` entre las franjas que quedan hoy; el sobrante, a las primeras."""
    n, k = max(0, int(n or 0)), max(0, int(franjas_restantes or 0))
    if k == 0:
        return []
    if not repartir:
        return [n] + [0] * (k - 1)
    base, resto = divmod(n, k)
    return [base + (1 if i < resto else 0) for i in range(k)]
