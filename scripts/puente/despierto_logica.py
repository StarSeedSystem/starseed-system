# -*- coding: utf-8 -*-
"""Capacidad «despierto» de la neurona (KAL1101B) — DECISIONES PURAS.

Con `pmset -g`, `pmset -g batt` y `pmset -g assertions` (texto) y el ajuste
`~/.starseed/despierto.json`, dice si la neurona sigue despierta, con qué herramienta, la
batería, si está enchufada y qué pasará al cerrar la tapa. Nada aquí ejecuta `pmset`, toca
disco ni pide permisos.

VERDAD QUE SE RESPETA: en un portátil Mac, cerrar la tapa duerme el sistema aunque haya
aserciones. Solo no duerme en clamshell (corriente + pantalla externa) o con
`pmset -a disablesleep 1` (requiere admin). Si va a dormir igual, la neurona se anuncia para
que la colmena pase su trabajo al A1 antes.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

UMBRAL_BATERIA = 15
_TIPOS_REPOSO = ("PreventSystemSleep", "PreventUserIdleSystemSleep", "NoIdleSleepAssertion")
_RE_ASERCION = re.compile(
    r"pid\s+(\d+)\(([^)]+)\):.*?\b(PreventSystemSleep|PreventUserIdleSystemSleep|"
    r"NoIdleSleepAssertion|PreventUserIdleDisplaySleep)\b", re.I)

def parsear_pmset_g(texto: str) -> Dict[str, Any]:
    """PURA. `pmset -g` → {dormir_sistema_min, impedido_por, sleep_disabled}.

    Solo cuenta la clave EXACTA: `displaysleep` también lleva «sleep» y no es el sistema."""
    dormir: Optional[int] = None
    impedido: List[str] = []
    desactivado = False
    for linea in str(texto or "").splitlines():
        partes = linea.strip().split()
        if not partes:
            continue
        if partes[0] == "sleep":
            m = re.search(r"\d+", partes[1] if len(partes) > 1 else "")
            dormir = int(m.group(0)) if m and int(m.group(0)) > 0 else None
            m = re.search(r"prevented by ([^)]+)\)", linea, re.I)
            if m:
                impedido = [x.strip() for x in m.group(1).split(",") if x.strip()]
        elif partes[0] == "SleepDisabled":
            desactivado = len(partes) > 1 and partes[1] == "1"
    return {"dormir_sistema_min": dormir, "impedido_por": impedido, "sleep_disabled": desactivado}

def parsear_batt(texto: str) -> Dict[str, Any]:
    """PURA. `pmset -g batt` → {bateria, enchufada, interna, cargando}.

    En un Mac de sobremesa no hay `InternalBattery`: batería None y tapa «sin-tapa»."""
    t = str(texto or "")
    interna = "InternalBattery" in t
    m = re.search(r"(\d{1,3})%", t)
    nivel = int(m.group(1)) if m and interna else None
    enchufada: Optional[bool] = True if "'AC Power'" in t else False if "'Battery Power'" in t else None
    return {"bateria": nivel, "enchufada": enchufada, "interna": interna,
            "cargando": bool(re.search(r"\b(charging|charged|AC attached)\b", t, re.I))}

def parsear_assertions(texto: str) -> List[Dict[str, Any]]:
    """PURA. `pmset -g assertions` → [{pid, proceso, tipo}] de las aserciones declaradas."""
    return [{"pid": int(m.group(1)), "proceso": m.group(2), "tipo": m.group(3)}
            for m in _RE_ASERCION.finditer(str(texto or ""))]

def leer_ajuste(texto_json: str) -> Dict[str, Any]:
    """PURA. `~/.starseed/despierto.json` → dict; {} si está vacío o roto."""
    try:
        datos: Any = json.loads(texto_json or "{}")
    except (ValueError, TypeError):
        return {}
    return datos if isinstance(datos, dict) else {}

def _despierta(g: Dict[str, Any], aserciones: List[Dict[str, Any]]) -> bool:
    """¿Algo impide AHORA el reposo del SISTEMA? La aserción de powerd solo enciende la pantalla."""
    if g.get("sleep_disabled"):
        return True
    if any(a.get("tipo") in _TIPOS_REPOSO and str(a.get("proceso") or "").lower() != "powerd"
           for a in aserciones):
        return True
    return any(str(p).lower() != "powerd" for p in g.get("impedido_por") or [])

def _herramienta(aserciones: List[Dict[str, Any]], ajuste: Dict[str, Any]) -> str:
    """Qué mantiene despierta la neurona: lo que declara el ajuste o el proceso de la aserción."""
    declarada = ajuste.get("herramienta")
    if isinstance(declarada, str) and declarada.strip():
        return declarada.strip()
    procesos = " ".join(str(a.get("proceso") or "").lower() for a in aserciones)
    return next((c for c in ("keepalive", "caffeinate", "systemd-inhibit", "insomnia")
                 if c in procesos), "")

def tapa_de(g: Dict[str, Any], batt: Dict[str, Any], ajuste: Dict[str, Any],
            pantalla_externa: Optional[bool] = None) -> str:
    """PURA. Al CERRAR la tapa: 'duerme' · 'clamshell' · 'sin-tapa' · 'desactivada'.

    La corriente sola NO basta: hace falta pantalla externa (clamshell) o `disablesleep`."""
    if g.get("sleep_disabled"):
        return "desactivada"
    if not batt.get("interna"):
        return "sin-tapa"
    externa = ajuste.get("pantalla_externa") if pantalla_externa is None else pantalla_externa
    return "clamshell" if batt.get("enchufada") is True and externa else "duerme"

def estado_despierto(pmset_g: str, pmset_batt: str, pmset_assertions: str,
                     despierto_json: str = "", pantalla_externa: Optional[bool] = None) -> Dict[str, Any]:
    """PURA. {despierta, herramienta, bateria, enchufada, tapa} con la verdad del portátil.

    `despierta` dice si algo impide el reposo AHORA; no promete que siga con la tapa cerrada."""
    g, batt = parsear_pmset_g(pmset_g), parsear_batt(pmset_batt)
    aserciones, ajuste = parsear_assertions(pmset_assertions), leer_ajuste(despierto_json)
    return {"despierta": _despierta(g, aserciones), "herramienta": _herramienta(aserciones, ajuste),
            "bateria": batt["bateria"], "enchufada": batt["enchufada"],
            "tapa": tapa_de(g, batt, ajuste, pantalla_externa)}

def dormira(estado: Dict[str, Any], umbral: int = UMBRAL_BATERIA) -> bool:
    """PURA. ¿Se dormirá al cerrar la tapa y además va justa de batería? Sin batería, nunca."""
    if str((estado or {}).get("tapa") or "") != "duerme":
        return False
    nivel = (estado or {}).get("bateria")
    return isinstance(nivel, (int, float)) and not isinstance(nivel, bool) and nivel < umbral
