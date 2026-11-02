# -*- coding: utf-8 -*-
"""¿Sigue despierta esta máquina si se cierra la tapa? (KAL1101B) · lógica PURA.

Alex (01-11): «que funcionen los procesos en segundo plano aun con las pantallas cerradas o
desconectadas». VERDAD a respetar: cerrar la tapa DUERME el sistema aunque haya aserciones; solo
sigue despierto en clamshell (corriente + pantalla externa) o con `pmset -a disablesleep 1` (exige
admin). Si va a dormir igual, su trabajo pasa al A1 con la orden `desconectar` ya existente.
Todo entra por argumentos — los tres `pmset` y `~/.starseed/despierto.json` — para que cada regla
se pruebe sola (test_despierto_logica.py); quien mide y publica la capacidad del latido es
nodo_metagenesis_medio.py. SOP: architecture/neurona-insomne.md
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

#: Umbral de batería: bajo él, la neurona con tapa «duerme» se anuncia «se va a dormir»; el
#: `umbral_bateria` de `despierto.json` manda sobre este valor.
UMBRAL_BATERIA = 25

#: Aserciones que impiden el reposo DEL SISTEMA (las mismas que `impideReposo` de
#: src/lib/mando/servidor-astraura-tipos.ts: una sola verdad sobre «está despierto»).
TIPOS_DESPIERTA = ("PreventSystemSleep", "PreventUserIdleSystemSleep", "NoIdleSleepAssertion")

# Regex: «SleepDisabled 1» (pmset -g) · «92%;» e InternalBattery (pmset -g batt) ·
# «pid 1(launchd): [0x…] 22:00:00 Tipo named: "n"» (pmset -g assertions).
_RE_SLEEP_OFF = re.compile(r"^\s+SleepDisabled\s+1\s*$", re.M)
_RE_PCT = re.compile(r"(\d{1,3})%")
_RE_STATUS = re.compile(r"^\s{3}(PreventSystemSleep|PreventUserIdleSystemSleep)\s+(\d)\s*$", re.M)
_RE_OWNER = re.compile(r'pid\s+(\d+)\(([^)]+)\):\s+\[[^\]]+\]\s+\S+\s+(\w+)\s+named:\s+"([^"]*)"')


def _pct_de(texto: str) -> Optional[int]:
    m = _RE_PCT.search(texto)
    return int(m.group(1)) if m else None


def parsear_bateria(texto: Any) -> Dict[str, Any]:
    """PURA. De `pmset -g batt` («Now drawing from 'AC Power'», «-InternalBattery-0 … 92%;»):
    {porcentaje (int|None), enchufada (bool), portatil (bool)}. La interna dice si hay TAPA y la
    corriente si cierran la tapa con cargador (clamshell)."""
    t = str(texto or "")
    return {"porcentaje": _pct_de(t), "enchufada": "'AC Power'" in t, "portatil": "InternalBattery" in t}


def desactivada_pmset(texto: Any) -> bool:
    """PURA. ¿`pmset -a disablesleep 1`? Es la línea «SleepDisabled 1» del `pmset -g`."""
    return bool(_RE_SLEEP_OFF.search(str(texto or "")))


def parsear_assertions(texto: Any) -> Dict[str, Any]:
    """PURA. De `pmset -g assertions`: {despierta (bool), herramienta (str|None)}.
    `despierta` = aserción VIGENTE del sistema (estado «system-wide» a 1 o dueño de
    `TIPOS_DESPIERTA`); `herramienta` = nombre de la primera (caffeinate, keepalive…). Las de
    PANTALLA (PreventUserIdleDisplaySleep) no cuentan: duermen la pantalla, no el sistema."""
    t = str(texto or "")
    estados = {m.group(1): int(m.group(2)) for m in _RE_STATUS.finditer(t)}
    dueño: Optional[Dict[str, Any]] = None
    otro: Optional[Dict[str, Any]] = None
    for p, proc, tipo, nombre in _RE_OWNER.findall(t):
        d = {"pid": int(p), "proceso": proc, "tipo": tipo, "nombre": nombre}
        if tipo in ("PreventSystemSleep", "PreventUserIdleSystemSleep"):
            if dueño is None:  # la primera aserción DEL SISTEMA: el dueño que impide el reposo
                dueño = d
        elif dueño is None and tipo in TIPOS_DESPIERTA and otro is None:
            otro = d  # de respaldo si no hay del sistema: «NoIdleSleepAssertion» de una app
    dueño = dueño or otro
    return {"despierta": bool(dueño) or any(estados.get(k) == 1 for k in TIPOS_DESPIERTA),
            "herramienta": (dueño["nombre"][:40] or None) if dueño else None}


def tapa_de(desactivada: bool, portatil: bool, enchufada: bool, despierto_json: Any) -> str:
    """PURA. En este orden: «desactivada» > «sin-tapa» > «clamshell» > «duerme». El clamshell
    exige corriente y pantalla externa (la declara `pantalla_externa: true` en despierto.json)."""
    if desactivada:
        return "desactivada"
    if not portatil:
        return "sin-tapa"
    j = despierto_json if isinstance(despierto_json, dict) else {}
    if enchufada and bool(j.get("pantalla_externa")):
        return "clamshell"
    return "duerme"


def va_a_dormir(tapa: str) -> bool:
    """PURA. ¿Cerrar la tapa apaga el sistema? Solo con tapa «duerme» (las aserciones no la frenan)."""
    return tapa == "duerme"


def se_va_a_dormir(tapa: str, bateria: Any, umbral: int = UMBRAL_BATERIA) -> bool:
    """PURA. (KAL1101B) «Se va a dormir» = tapa «duerme» + batería bajo el umbral: `desconectar`
    guarda su trabajo y lo pasa al A1 ANTES. Sin dato de batería no se anuncia (se mide)."""
    if not va_a_dormir(tapa):
        return False
    return bateria is not None and int(bateria) < int(umbral)


def estado_despierto(pmset: Any, batt: Any, assertions: Any, despierto_json: Any = None,
                     umbral: Optional[int] = None) -> Dict[str, Any]:
    """PURA. {despierta, herramienta, bateria, enchufada, tapa, va_a_dormir, se_va_a_dormir,
    umbral_bateria}: la capacidad `despierto` que publica el latido del nodo. `umbral` (o el
    `umbral_bateria` del JSON, que manda) ajusta el anuncio de batería baja."""
    j = despierto_json if isinstance(despierto_json, dict) else {}
    tope = j.get("umbral_bateria")
    if not isinstance(tope, (int, float)) or isinstance(tope, bool):
        tope = umbral if umbral is not None else UMBRAL_BATERIA
    b = parsear_bateria(batt)
    a = parsear_assertions(assertions)
    tapa = tapa_de(desactivada_pmset(pmset), b["portatil"], b["enchufada"], j)
    return {
        "despierta": bool(a["despierta"]),
        "herramienta": a["herramienta"],
        "bateria": b["porcentaje"],
        "enchufada": b["enchufada"],
        "tapa": tapa,
        "va_a_dormir": va_a_dormir(tapa),
        "se_va_a_dormir": se_va_a_dormir(tapa, b["porcentaje"], int(tope)),
        "umbral_bateria": int(tope),
    }
