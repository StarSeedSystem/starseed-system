#!/usr/bin/env python3
"""Presupuesto diario del crédito de Claude (PRE1113D).

Solo lee las lecturas que guarda `limites_claude.py` (no cambia su formato) y responde: cuánto
se gastó hoy, cuál es la cuota justa de hoy, cuándo se acaba la semana al ritmo actual y un veredicto
que una dirección puede cumplir: holgado / justo / corto, más si cabe una oleada nueva en la sesión.
Nunca inventa: con lecturas viejas o ausentes dice «desconocido» y la edad de la última lectura.

  presupuesto_claude.py estado [--json]    todo lo anterior
  presupuesto_claude.py veredicto          una línea
  presupuesto_claude.py levantar           «gastar hasta el reinicio»: anulación fechada, caduca sola
  presupuesto_claude.py quitar             borra la anulación (el único archivo que este programa crea)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import limites_claude as L  # noqa: E402

ANULACION = os.path.expanduser(os.environ.get("STARSEED_PRESUPUESTO_ANULACION",
                                              "~/.starseed/presupuesto-claude-anulacion.json"))

# Umbrales en un solo sitio; cada uno se puede cambiar con STARSEED_PRESUPUESTO_<NOMBRE en mayúsculas>.
UMBRALES = {
    "frescura_min": 120.0,        # una lectura más vieja que esto no se usa para decidir
    "hueco_max_min": 60.0,        # entre dos lecturas más separadas que esto no hubo «horas de trabajo»
    "ventana_ritmo_h": 3.0,       # horas de trabajo sobre las que se mide el ritmo
    "ritmo_min_h": 0.5,           # con menos horas de trabajo medidas no se da ritmo
    "horas_dia": 16.0,            # horas de trabajo por día para proyectar hasta el reinicio
    "holgado_frac": 0.6,          # holgado: lo proyectado y lo gastado hoy caben en esta fracción
    "corto_restante_pct": 5.0,    # corto: quedan menos de estos puntos de semana
    "sesion_oleada_pct": 70.0,    # una oleada nueva solo si la sesión no pasa de aquí
}
FUERTE, DEFECTO, LIBRE = 2, 1, 0
ORDEN = {"holgado": 0, "justo": 1, "corto": 2}
PERMITE = {"holgado": FUERTE, "justo": DEFECTO, "corto": LIBRE}
NIVEL_TXT = {FUERTE: "el modelo más fuerte", DEFECTO: "el modelo por defecto", LIBRE: "solo el enjambre libre"}


def umbrales(env: Optional[Dict[str, str]] = None) -> Dict[str, float]:
    env = os.environ if env is None else env
    r = dict(UMBRALES)
    for k in r:
        try:
            r[k] = float(env["STARSEED_PRESUPUESTO_" + k.upper()])
        except (KeyError, ValueError):
            pass
    return r


def _t(texto: Any) -> Optional[datetime]:
    try:
        return L._fecha(texto)
    except ValueError:
        return None


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


# ── series ──────────────────────────────────────────────────────────────────────────────────────

def tramos(lecturas: List[dict], campo: str) -> List[Tuple[datetime, datetime, float, bool]]:
    """Pares consecutivos (t0, t1, puntos, valido). Un descenso o un cambio de reinicio es un comienzo
    nuevo: ese tramo no suma (valido False), nunca resta."""
    serie = []
    for lec in lecturas if isinstance(lecturas, list) else []:
        if not isinstance(lec, dict):
            continue
        t, p = _t(lec.get("t")), _num(lec.get(campo + "_pct"))
        if t is not None and p is not None:
            serie.append((t, p, lec.get(campo + "_reinicio")))
    serie.sort(key=lambda x: x[0])
    out = []
    for (t0, p0, r0), (t1, p1, r1) in zip(serie, serie[1:]):
        if t1 <= t0:
            continue
        nuevo = p1 < p0 or (r0 and r1 and r0 != r1)
        out.append((t0, t1, 0.0 if nuevo else p1 - p0, not nuevo))
    return out


def usado_entre(tr: List[tuple], desde: datetime, hasta: datetime) -> float:
    """Puntos usados en [desde, hasta], repartiendo linealmente los tramos que lo cruzan."""
    total = 0.0
    for t0, t1, d, ok in tr:
        if not ok or t1 <= desde or t0 >= hasta:
            continue
        total += d * ((min(t1, hasta) - max(t0, desde)).total_seconds() / (t1 - t0).total_seconds())
    return total


def ritmo(tr: List[tuple], u: Dict[str, float]) -> Dict[str, Any]:
    """Puntos por hora de trabajo en las últimas `ventana_ritmo_h` horas de trabajo (los huecos
    largos y los comienzos nuevos no cuentan como tiempo)."""
    horas, puntos = 0.0, 0.0
    for t0, t1, d, ok in reversed(tr):
        dt = (t1 - t0).total_seconds() / 3600
        if not ok or dt * 60 > u["hueco_max_min"]:
            continue
        usar = min(dt, u["ventana_ritmo_h"] - horas)
        puntos += d * usar / dt
        horas += usar
        if horas >= u["ventana_ritmo_h"] - 1e-9:
            break
    return {"horas_medidas": round(horas, 2),
            "por_hora": round(puntos / horas, 2) if horas >= u["ritmo_min_h"] else None}


# ── un medidor semanal ───────────────────────────────────────────────────────────────────────────

def medidor(lecturas: List[dict], campo: str, ahora: datetime, u: Dict[str, float]) -> Dict[str, Any]:
    ult = None
    for lec in reversed(lecturas if isinstance(lecturas, list) else []):
        if isinstance(lec, dict) and _num(lec.get(campo + "_pct")) is not None:
            ult = lec
            break
    if ult is None:
        return {"estado": "sin lecturas", "motivo": "no hay lecturas de este medidor"}
    t = _t(ult.get("t"))
    edad = (ahora - t).total_seconds() / 60 if t else None
    reinicio = _t(ult.get(campo + "_reinicio"))
    base = {"pct": _num(ult.get(campo + "_pct")), "lectura": ult.get("t"), "edad_min": None if edad is None else round(edad),
            "reinicio": ult.get(campo + "_reinicio")}
    if edad is None or reinicio is None:
        return {**base, "estado": "sin lecturas", "motivo": "la última lectura no tiene fecha o reinicio válidos"}
    if edad > u["frescura_min"]:
        return {**base, "estado": "vieja", "motivo": "última lectura hace %d min (límite %d)" % (edad, u["frescura_min"])}
    if reinicio <= ahora:
        return {**base, "estado": "reiniciada", "motivo": "el reinicio ya pasó y aún no hay lectura nueva"}
    tr = tramos(lecturas, campo)
    medianoche = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    hoy = usado_entre(tr, medianoche, ahora)
    h24 = usado_entre(tr, ahora - timedelta(hours=24), ahora)
    rit = ritmo(tr, u)
    queda = 100 - base["pct"]
    horas_reinicio = (reinicio - ahora).total_seconds() / 3600
    dias = max(1, math.ceil(horas_reinicio / 24))
    cuota = (queda + hoy) / dias
    trabajo_h = horas_reinicio * u["horas_dia"] / 24
    proy = rit["por_hora"] * trabajo_h if rit["por_hora"] is not None else None
    agota = antes = None
    if rit["por_hora"]:
        h_trab = queda / rit["por_hora"]
        agota = (ahora + timedelta(hours=h_trab * 24 / u["horas_dia"])).isoformat(timespec="minutes")
        antes = h_trab < trabajo_h
    elif rit["por_hora"] == 0:
        antes = False
    return {**base, "estado": "ok", "queda_pct": round(queda, 1), "usado_hoy": round(hoy, 1), "usado_24h": round(h24, 1),
            "ritmo_por_hora_trabajo": rit["por_hora"], "horas_ritmo_medidas": rit["horas_medidas"],
            "dias_hasta_reinicio": dias, "horas_hasta_reinicio": round(horas_reinicio, 1),
            "cuota_hoy": round(cuota, 1), "queda_hoy": round(cuota - hoy, 1),
            "proyeccion_hasta_reinicio": None if proy is None else round(proy, 1),
            "se_agota": agota, "se_agota_antes_del_reinicio": antes}


def veredicto_medidor(m: Dict[str, Any], u: Dict[str, float]) -> Tuple[Optional[str], str]:
    if m.get("estado") != "ok":
        return None, m.get("motivo", "sin datos")
    if m["queda_pct"] <= u["corto_restante_pct"]:
        return "corto", "quedan %.0f puntos de semana" % m["queda_pct"]
    if m["queda_hoy"] <= 0:
        return "corto", "la cuota de hoy (%.0f) ya está gastada" % m["cuota_hoy"]
    if m["ritmo_por_hora_trabajo"] is None:
        return None, "sin ritmo fiable (%.1f h de trabajo medidas)" % m["horas_ritmo_medidas"]
    if m["se_agota_antes_del_reinicio"]:
        return "justo", "al ritmo actual (%.1f/h) se agota antes del reinicio" % m["ritmo_por_hora_trabajo"]
    if (m["proyeccion_hasta_reinicio"] <= u["holgado_frac"] * m["queda_pct"]
            and m["usado_hoy"] <= u["holgado_frac"] * m["cuota_hoy"]):
        return "holgado", "al ritmo actual sobra margen hasta el reinicio"
    return "justo", "alcanza al ritmo actual, sin margen para oleadas grandes"


# ── anulación fechada ────────────────────────────────────────────────────────────────────────────

def leer_anulacion(ruta: Optional[str] = None) -> Optional[dict]:
    try:
        with open(ruta or ANULACION, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else None
    except (OSError, ValueError):
        return None


def anulacion_vigente(a: Optional[dict], ahora: datetime, reinicio_semana: Optional[datetime]) -> Optional[dict]:
    """Vigente si «hasta» no pasó y la semana que la originó sigue siendo la actual."""
    if not a:
        return None
    hasta = _t(a.get("hasta"))
    if hasta is None or hasta <= ahora:
        return None
    if reinicio_semana is not None and reinicio_semana > hasta + timedelta(minutes=1):
        return None
    return a


# ── todo junto ──────────────────────────────────────────────────────────────────────────────────

def calcular(lecturas: List[dict], ahora: datetime, anulacion: Optional[dict] = None,
             u: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    u = u or umbrales()
    ultima = None
    for lec in reversed(lecturas if isinstance(lecturas, list) else []):
        if isinstance(lec, dict) and _t(lec.get("t")):
            ultima = lec
            break
    semana = medidor(lecturas, "semana", ahora, u)
    modelo = medidor(lecturas, "modelo", ahora, u)
    modelo["nombre"] = ultima.get("modelo_nombre") if ultima else None
    ses = _sesion(ultima, ahora, u)
    vs, rs = veredicto_medidor(semana, u)
    vm, rm = veredicto_medidor(modelo, u)
    cands = [(v, r, n) for v, r, n in ((vs, rs, "semana"), (vm, rm, "modelo de arriba")) if v]
    if cands:
        v, r, n = max(cands, key=lambda c: ORDEN[c[0]])
        ver, razon = v, "%s: %s" % (n, r)
    else:
        ver, razon = "desconocido", "semana: %s" % rs
    real = ver
    reinicio_sem = _t(semana.get("reinicio")) if semana.get("reinicio") else None
    anul = anulacion_vigente(anulacion, ahora, reinicio_sem)
    if anul:
        ver, razon = "holgado", "el dueño levantó el límite hasta %s (sin el permiso sería «%s»: %s)" % (anul.get("hasta"), real, razon)
    permite = PERMITE.get(ver)
    return {"ahora": ahora.isoformat(timespec="seconds"), "semana": semana, "modelo": modelo, "sesion": ses,
            "veredicto": ver, "veredicto_sin_anulacion": real, "razon": razon,
            "permite": None if permite is None else NIVEL_TXT[permite], "nivel_permitido": permite,
            "anulacion": anul, "umbrales": u}


def _sesion(ult: Optional[dict], ahora: datetime, u: Dict[str, float]) -> Dict[str, Any]:
    if not ult or _num(ult.get("sesion_pct")) is None:
        return {"estado": "sin lecturas", "oleada_cabe": None, "motivo": "no hay lectura de sesión"}
    t, reinicio = _t(ult.get("t")), _t(ult.get("sesion_reinicio"))
    edad = (ahora - t).total_seconds() / 60 if t else None
    base = {"pct": _num(ult["sesion_pct"]), "reinicio": ult.get("sesion_reinicio"), "edad_min": None if edad is None else round(edad)}
    if edad is None or reinicio is None:
        return {**base, "estado": "sin lecturas", "oleada_cabe": None, "motivo": "lectura sin fecha o reinicio válidos"}
    if reinicio <= ahora:
        return {**base, "pct": 0.0, "estado": "reiniciada", "oleada_cabe": True, "motivo": "la ventana ya se reinició"}
    if edad > u["frescura_min"]:
        return {**base, "estado": "vieja", "oleada_cabe": None, "motivo": "última lectura hace %d min" % edad}
    cabe = base["pct"] <= u["sesion_oleada_pct"]
    return {**base, "estado": "ok", "oleada_cabe": cabe, "oleada_a_las": None if cabe else ult.get("sesion_reinicio"),
            "minutos_para_reinicio": int((reinicio - ahora).total_seconds() // 60),
            "motivo": "sesión al %.0f %%" % base["pct"] + ("" if cabe else " (más de %.0f %%)" % u["sesion_oleada_pct"])}


def linea(r: Dict[str, Any]) -> str:
    s = r["sesion"]
    if s.get("oleada_cabe") is None:
        o = "oleada nueva: no se sabe (%s)" % s["motivo"]
    elif s["oleada_cabe"]:
        o = "oleada nueva: cabe (%s)" % s["motivo"]
    else:
        o = "oleada nueva: no hasta las %s (%s)" % (s["oleada_a_las"], s["motivo"])
    return "Presupuesto de Claude: %s · %s · %s" % (r["veredicto"].upper(), r["razon"], o)


def nivel_modelo(nombre: Optional[str]) -> Optional[int]:
    n = (nombre or "").lower()
    if not n or "sin declarar" in n:
        return None
    if any(k in n for k in ("fable", "opus")):
        return FUERTE
    if any(k in n for k in ("sonnet", "claude")):
        return DEFECTO if "haiku" not in n else LIBRE
    return LIBRE


def aviso_para_modelo(nombre: Optional[str], lecturas: Optional[List[dict]] = None, ahora: Optional[datetime] = None,
                      anulacion: Optional[dict] = None) -> Optional[str]:
    """Texto de aviso si el modelo pedido es más fuerte de lo que permite el veredicto; si no, None."""
    pedido = nivel_modelo(nombre)
    if pedido is None:
        return None
    if lecturas is None:
        lecturas, anulacion = L.leer().get("lecturas", []), leer_anulacion()
    r = calcular(lecturas, ahora or datetime.now().astimezone(), anulacion)
    if r["nivel_permitido"] is None or pedido <= r["nivel_permitido"]:
        return None
    return "AVISO de presupuesto: pediste %s y el veredicto «%s» solo permite %s. %s" % (
        nombre, r["veredicto"], NIVEL_TXT[r["nivel_permitido"]], linea(r))


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="orden", required=True)
    e = sub.add_parser("estado"); e.add_argument("--json", action="store_true")
    sub.add_parser("veredicto"); sub.add_parser("levantar"); sub.add_parser("quitar")
    x = p.parse_args(argv)
    ahora = datetime.now().astimezone()
    lecturas = L.leer().get("lecturas", [])
    if x.orden == "levantar":
        sem = _t((lecturas[-1] if lecturas else {}).get("semana_reinicio"))
        if sem is None or sem <= ahora:
            print("No se puede levantar: no hay un reinicio de semana futuro en las lecturas.", file=sys.stderr)
            return 1
        os.makedirs(os.path.dirname(ANULACION) or ".", exist_ok=True)
        with open(ANULACION, "w", encoding="utf-8") as f:
            json.dump({"modo": "gastar-hasta-el-reinicio", "desde": ahora.isoformat(timespec="seconds"),
                       "hasta": sem.isoformat()}, f, ensure_ascii=False)
        print("Límite levantado hasta %s (caduca solo en el reinicio de la semana)." % sem.isoformat())
        return 0
    if x.orden == "quitar":
        try:
            os.remove(ANULACION)
            print("Anulación quitada.")
        except OSError:
            print("No había anulación.")
        return 0
    r = calcular(lecturas, ahora, leer_anulacion())
    if x.orden == "estado" and x.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    elif x.orden == "veredicto":
        print(linea(r))
    else:
        print(linea(r))
        for n, m in (("semana", r["semana"]), ("modelo " + str(r["modelo"].get("nombre") or ""), r["modelo"])):
            if m["estado"] != "ok":
                print("  %s: %s" % (n, m.get("motivo")))
                continue
            print("  %s %.0f %% · hoy %.1f · 24 h %.1f · ritmo %s/h · cuota de hoy %.1f (quedan %.1f) · agota %s" % (
                n, m["pct"], m["usado_hoy"], m["usado_24h"], m["ritmo_por_hora_trabajo"], m["cuota_hoy"], m["queda_hoy"],
                (m["se_agota"] + (" ANTES del reinicio" if m["se_agota_antes_del_reinicio"] else " (tras el reinicio)")) if m["se_agota"] else "sin ritmo"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
