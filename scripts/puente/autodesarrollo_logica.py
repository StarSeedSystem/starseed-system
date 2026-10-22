#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ajustes y horario del autodesarrollo (IMN1021A · §4 de architecture/imaginacion-autodesarrollo.md).
Módulo PURO (sin red, sin disco, reloj por parámetro); lo usa el director de autodesarrollo (IMN1021D); los
valores viven en ~/.starseed/autodesarrollo.json. Fijo y NO un ajuste: lo importante SIEMPRE espera el visto
bueno de Alex (importante_trae_visto_bueno): nada lo apaga, nada lo vuelve configurable."""
import re
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

RE_HORA = re.compile(r"^(2[0-3]|[01]\d):[0-5]\d$")
DIAS = tuple(range(7))  # 0 = lunes … 6 = domingo (los números de weekday de datetime)
MODOS = ("inteligente", "franjas")
FUENTES = ("diaria", "profunda", "astraura", "directores")
PRESION_TOPE = 2  # «la Mac sin presión de memoria»: desde aquí, no escribe nadie
AJUSTES_POR_DEFECTO: Dict[str, Any] = {
    "automatico": True,
    "rango": {"min": 0, "max": 10},  # cuántas tareas autodesarrolladas por ciclo
    "fuentes": {f: True for f in FUENTES},
    "horario": {"modo": "inteligente", "repartir": True,
                "franjas": [{"dias": [0, 1, 2, 3, 4, 5, 6], "desde": "02:00", "hasta": "06:00"}]},
    "profunda": {"cada_dias": 7},  # imaginación profunda cada 7 días (0 = nunca)
}
def _ent(v: Any, base: int, bajo: int, alto: int, acota: bool) -> int:
    # El entero si lo entiende: acotado al rango (acota) o solo si cabe en él (si no, al defecto).
    if isinstance(v, bool) or not isinstance(v, int):
        return base
    return max(bajo, min(alto, v)) if acota else (v if bajo <= v <= alto else base)
def _num(v: Any) -> int:  # número de capacidad tal cual; lo que falta o no se entiende, 0
    return v if isinstance(v, int) and not isinstance(v, bool) else 0
def _a_minutos(hh_mm: str) -> int:  # «02:00» → 120 (RE_HORA exige los dos dígitos)
    return int(hh_mm[:2]) * 60 + int(hh_mm[3:])
def validar_franjas(franjas: Any) -> List[Dict[str, Any]]:  # lo inválido se tira, lo válido sale fiel
    validas: List[Dict[str, Any]] = []
    for f in franjas if isinstance(franjas, list) else []:
        f = f if isinstance(f, dict) else {}
        desde, hasta, dias = f.get("desde"), f.get("hasta"), f.get("dias")
        if (isinstance(desde, str) and isinstance(hasta, str) and desde != hasta
                and RE_HORA.match(desde) and RE_HORA.match(hasta)  # desde == hasta: franja nula
                and isinstance(dias, list) and dias
                and all(isinstance(x, int) and not isinstance(x, bool) and x in DIAS for x in dias)):
            validas.append({"dias": sorted({int(x) for x in dias}), "desde": desde, "hasta": hasta})
    return validas

def validar_ajustes(d: Any) -> Dict[str, Any]:  # lo inválido vuelve al defecto; no muta nada
    a: Dict[str, Any] = deepcopy(AJUSTES_POR_DEFECTO)
    d = d if isinstance(d, dict) else {}
    if isinstance(auto := d.get("automatico"), bool):
        a["automatico"] = auto
    if isinstance(r := d.get("rango"), dict):
        hi = _ent(r.get("max"), a["rango"]["max"], 0, 10, True)
        a["rango"] = {"min": min(_ent(r.get("min"), a["rango"]["min"], 0, 10, True), hi),
                      "max": hi}  # acotado a 0-10 y min ≤ max, como manda el SOP
    if isinstance(f := d.get("fuentes"), dict):
        for k in FUENTES:  # lo que no sea bool vuelve a encendida, su defecto
            if isinstance(f.get(k), bool):
                a["fuentes"][k] = f[k]
    if isinstance(h := d.get("horario"), dict):
        for k, v in (("modo", h.get("modo")), ("repartir", h.get("repartir"))):
            if k == "modo" and v in MODOS or k == "repartir" and isinstance(v, bool):
                a["horario"][k] = v
        if franjas := validar_franjas(h.get("franjas")):  # vacías o inválidas: al defecto
            a["horario"]["franjas"] = franjas
    if isinstance(p := d.get("profunda"), dict):  # cada_dias: 0 = nunca; fuera de 0-365, al defecto
        a["profunda"]["cada_dias"] = _ent(p.get("cada_dias"), a["profunda"]["cada_dias"], 0, 365, False)
    return a

def importante_trae_visto_bueno() -> bool:  # regla FIJA: lo importante SIEMPRE espera a Alex
    return True
def en_franja(ahora: Optional[Any], franjas: Any) -> bool:  # las de medianoche incluyen la cola
    if not isinstance(ahora, datetime):
        return False
    minutos, hoy = ahora.hour * 60 + ahora.minute, ahora.weekday()
    for f in validar_franjas(franjas):
        dias, ini, fin = set(f["dias"]), _a_minutos(f["desde"]), _a_minutos(f["hasta"])
        if ini < fin:  # franja de la misma madrugada
            if hoy in dias and ini <= minutos < fin:
                return True
        elif minutos >= ini and hoy in dias:
            return True  # cruza medianoche: tramo previo, el día en que empieza
        elif minutos < fin and (hoy - 1) % 7 in dias:
            return True  # cruza medianoche: tramo cruzado, por el día de inicio
    return False

def toca_ejecutar(ahora: Optional[Any], horario: Any, capacidad: Any) -> Tuple[bool, str]:
    """¿Soltar ahora? (¿sí?, motivo). Capacidad = {huecos_mac, huecos_a1, huecos_nube,
    proveedores_con_cupo, presion_mac}: lo que falta cuenta como 0 y la presión sin medir bloquea
    (sin saber cómo está la Mac de 8 GB no se estorba). En «franjas» solo manda el horario."""
    h = horario if isinstance(horario, dict) else AJUSTES_POR_DEFECTO["horario"]
    franjas = validar_franjas(h.get("franjas")) or AJUSTES_POR_DEFECTO["horario"]["franjas"]
    modo = h.get("modo") if h.get("modo") in MODOS else "inteligente"
    if modo == "franjas":
        dentro = en_franja(ahora, franjas)
        legible = ", ".join("%s–%s" % (f["desde"], f["hasta"]) for f in franjas)
        return dentro, ("dentro de una franja" if dentro else "fuera de las franjas") + " (%s)" % legible
    c = capacidad if isinstance(capacidad, dict) else {}
    mac, a1, nube = (_num(c.get(k)) for k in ("huecos_mac", "huecos_a1", "huecos_nube"))
    huecos = "Mac %d · A1 %d · nube %d" % (mac, a1, nube)
    if not isinstance(presion := c.get("presion_mac"), int) or isinstance(presion, bool):
        return False, "presión de la Mac sin medir: no se estorba a ciegas"
    if max(mac, a1, nube) <= 0:
        return False, "sin hueco libre (%s)" % huecos
    if (cupo := _num(c.get("proveedores_con_cupo"))) <= 0:
        return False, "sin proveedores con cupo"
    if presion >= PRESION_TOPE:
        return False, "presión de la Mac %d ≥ %d: no estorbo al enjambre" % (presion, PRESION_TOPE)
    return True, ("inteligente: hueco libre (%s), %d proveedor(es) con cupo y Mac sin presión (%d), "
                  "prefiriendo la noche" % (huecos, cupo, presion))
def lotes(n: Any, franjas_restantes: Any, repartir: bool) -> List[int]:
    # Un entero por franja que suma n; con repartir equitativo (las de más, arriba), sin él todo
    # de golpe en la primera; con n ≤ 0 o sin franjas que queden, no hay lotes.
    cuantas = n if isinstance(n, int) and not isinstance(n, bool) else 0
    m = len(franjas_restantes) if isinstance(franjas_restantes, list) else 0
    if cuantas <= 0 or m == 0:
        return [0] * m
    if not repartir:
        return [cuantas] + [0] * (m - 1)
    base, sobra = divmod(cuantas, m)
    return [base + (1 if i < sobra else 0) for i in range(m)]
