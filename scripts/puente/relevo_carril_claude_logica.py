"""Relevo del carril de Claude (REL1026A) · lógica pura, sin disco ni red.

Por qué existe (Alex, 2026-10-26): «los directores y agentes dejaron de funcionar cuando terminó tu crédito; no
funcionó el autoenrutamiento inteligente de modelos para que sea independiente de Claude».

Lo que pasó: la sesión de Claude (Cowork) lanzó tres agentes para la Ola 1026P y a los dos minutos llegó el límite de
sesión del plan («You've hit your session limit»). Los agentes murieron y su trabajo no estaba en ninguna cola de
MetaGenesis: el enjambre gratuito no podía seguirlo porque no sabía que existía.

La regla nueva: todo lo que Claude reparte a sus agentes se anota ANTES en el registro del carril
(`starseed_memory_root/olas/carril-claude/registro.json`) con su prompt y sus archivos, y Claude mantiene un latido.
Si el latido se queda viejo, o el medidor de límites dice que la sesión o la semana se agotó, un director en Python
(cero créditos, dentro de la autocuración) convierte lo que queda en una cola normal de MetaGenesis. El enjambre la
toma con sus modelos gratuitos; lo grande lo divide el revisor de bloqueadas (más de 3 archivos → partes) y lo marcado
`capacidad: alta` va al carril de alta capacidad. Cuando Claude vuelve, ve lo relevado y no lo repite.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

#: Minutos sin latido con tareas en curso a partir de los cuales se releva.
UMBRAL_LATIDO_MIN = 45
#: Porcentaje de la ventana de Claude (sesión o semana) que se da por agotado.
UMBRAL_LIMITE_PCT = 98
ESTADOS_ABIERTOS = ("en_curso", "pendiente")


def _fecha(valor: Any) -> Optional[datetime]:
    if not isinstance(valor, str) or not valor:
        return None
    try:
        d = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.astimezone()


def tareas_abiertas(registro: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Tareas que Claude tiene repartidas y aún no cerró (ni hechas, ni relevadas, ni canceladas)."""
    return [t for t in (registro.get("tareas") or [])
            if isinstance(t, dict) and t.get("id") and t.get("estado", "en_curso") in ESTADOS_ABIERTOS]


def edad_latido_min(registro: Dict[str, Any], ahora: datetime) -> Optional[float]:
    """Minutos desde el último latido de Claude; None si nunca hubo latido."""
    d = _fecha(registro.get("latido"))
    if d is None:
        return None
    return max(0.0, (ahora - d).total_seconds() / 60)


def limite_agotado(estado_limites: Optional[Dict[str, Any]], umbral: float = UMBRAL_LIMITE_PCT) -> Optional[str]:
    """Si `limites_claude.estado()` dice que la sesión o la semana están agotadas, el motivo; si no, None.

    Una ventana ya reiniciada (`reiniciada`) cuenta como libre, y una lectura sin porcentaje no decide nada."""
    if not isinstance(estado_limites, dict):
        return None
    for campo, nombre in (("sesion", "la sesión"), ("semana", "la semana")):
        v = estado_limites.get(campo)
        if not isinstance(v, dict) or v.get("reiniciada"):
            continue
        pct = v.get("pct")
        if isinstance(pct, (int, float)) and pct >= umbral:
            cuando = v.get("reinicio") or "sin hora de reinicio"
            return "límite de Claude: %s al %d %% (vuelve %s)" % (nombre, round(pct), cuando)
    return None


def debe_relevar(registro: Dict[str, Any], ahora: datetime, estado_limites: Optional[Dict[str, Any]] = None,
                 umbral_min: float = UMBRAL_LATIDO_MIN) -> Tuple[bool, str]:
    """¿Hay que pasar al enjambre lo que Claude tenía repartido? Devuelve (sí/no, motivo legible)."""
    abiertas = tareas_abiertas(registro)
    if not abiertas:
        return False, "el carril de Claude no tiene tareas abiertas"
    agotado = limite_agotado(estado_limites)
    if agotado:
        return True, agotado
    edad = edad_latido_min(registro, ahora)
    if edad is None:
        return True, "el carril de Claude tiene %d tarea(s) abierta(s) y nunca dio latido" % len(abiertas)
    if edad >= umbral_min:
        return True, "Claude lleva %d min sin latido con %d tarea(s) abierta(s)" % (round(edad), len(abiertas))
    return False, "Claude late (hace %d min) con %d tarea(s) abierta(s)" % (round(edad), len(abiertas))


def integrada_en_main(tarea: Dict[str, Any], asuntos: Iterable[str]) -> bool:
    """La tarea ya llegó a main si algún asunto de commit lleva «· <ID>:» (la convención de las olas)."""
    marca = "· %s:" % tarea.get("id")
    return any(marca in a for a in asuntos)


def tarea_de_relevo(tarea: Dict[str, Any], ola_relevo: str, relevados: Iterable[str] = ()) -> Dict[str, Any]:
    """La tarea del carril convertida al formato de una cola de MetaGenesis (id con sufijo «-rc»).

    Una dependencia que también se releva pasa a su «-rc»; las demás se quedan como estaban."""
    relevados = set(relevados)
    archivos = [a for a in (tarea.get("archivos") or []) if isinstance(a, str) and a]
    aviso = ("RELEVO DEL CARRIL CLAUDE (REL1026A): esta tarea la empezó un agente de Claude que se quedó sin crédito. "
             "Empieza desde main (lo que hubiera escrito no llegó). Si al leer el código ya está hecha, responde NO APLICA "
             "con la prueba. Si es más de lo que cabe en una tarea (más de 3 archivos), haz la primera parte coherente "
             "y deja dicho qué falta: el revisor la dividirá.\n\n")
    nueva: Dict[str, Any] = {
        "id": "%s-rc" % tarea["id"],
        "ola": ola_relevo,
        "titulo": tarea.get("titulo") or tarea["id"],
        "archivos": archivos,
        "depende": [d + "-rc" if d in relevados else d for d in (tarea.get("depende") or [])],
        "prompt": aviso + (tarea.get("prompt") or ""),
        "origen": "relevo-carril-claude",
        "relevo_de": tarea["id"],
    }
    if tarea.get("capacidad") == "alta":
        nueva["capacidad"] = "alta"
    if tarea.get("importancia"):
        nueva["importancia"] = tarea["importancia"]
    return nueva


def planificar_relevo(registro: Dict[str, Any], asuntos: Iterable[str], ahora: datetime) -> Dict[str, Any]:
    """Qué hacer con cada tarea abierta: las que ya están en main se cierran como hechas; el resto va a la cola."""
    asuntos = list(asuntos)
    sello = ahora.strftime("%Y%m%d-%H%M")
    ola = "Relevo del carril Claude · %s" % sello
    abiertas = tareas_abiertas(registro)
    hechas = [t["id"] for t in abiertas if integrada_en_main(t, asuntos)]
    pendientes = [t for t in abiertas if t["id"] not in hechas]
    ids = [t["id"] for t in pendientes]
    cola = [tarea_de_relevo(t, ola, ids) for t in pendientes]
    return {"nombre_cola": "cola-relevo-claude-%s.json" % sello, "cola": cola, "hechas": hechas, "ola": ola}


def aplicar_plan(registro: Dict[str, Any], plan: Dict[str, Any], ahora: datetime, motivo: str) -> Dict[str, Any]:
    """Devuelve el registro con cada tarea marcada (hecha o relevada a su cola) y el relevo anotado. No muta."""
    relevadas = {t["relevo_de"] for t in plan.get("cola") or []}
    hechas = set(plan.get("hechas") or [])
    tareas = []
    for t in registro.get("tareas") or []:
        t = dict(t)
        if t.get("id") in hechas:
            t["estado"] = "hecha"
        elif t.get("id") in relevadas:
            t["estado"] = "relevada"
            t["cola_relevo"] = plan.get("nombre_cola")
        tareas.append(t)
    relevos = list(registro.get("relevos") or [])[-19:]
    relevos.append({"t": ahora.isoformat(), "motivo": motivo, "cola": plan.get("nombre_cola") if relevadas else None,
                    "relevadas": sorted(relevadas), "hechas": sorted(hechas)})
    return {**registro, "tareas": tareas, "relevos": relevos}


def registrar(registro: Dict[str, Any], nuevas: List[Dict[str, Any]], ahora: datetime) -> Dict[str, Any]:
    """Añade (o reemplaza por id) las tareas que Claude reparte, abiertas y con latido al momento."""
    por_id = {t.get("id"): dict(t) for t in registro.get("tareas") or [] if isinstance(t, dict)}
    for n in nuevas:
        if not isinstance(n, dict) or not n.get("id") or not n.get("prompt"):
            raise ValueError("cada tarea del carril necesita id y prompt")
        por_id[n["id"]] = {**n, "estado": n.get("estado", "en_curso"), "desde": ahora.isoformat()}
    return {**registro, "tareas": list(por_id.values()), "latido": ahora.isoformat()}


def cerrar(registro: Dict[str, Any], ids: Iterable[str], estado: str = "hecha") -> Dict[str, Any]:
    """Claude cierra lo que terminó (hecha) o descarta (cancelada)."""
    ids = set(ids)
    return {**registro, "tareas": [dict(t, estado=estado) if t.get("id") in ids else t
                                   for t in registro.get("tareas") or []]}
