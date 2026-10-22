# -*- coding: utf-8 -*-
"""Lógica pura del carril de alta capacidad en la nube (ola 1022A).

Sin red, sin reloj propio y sin tocar disco: todo entra como argumento. Lo usa
`alta-capacidad-nube.py`.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

MAX_VIVAS, RESERVA_USD, GRACIA_H = 3, 10.0, 8.0
ANSI = re.compile(r"\x1b\[[0-9;?>=]*[A-Za-z]")
VIEW = re.compile(r"https://claude\.ai/code/(session_[A-Za-z0-9]+)")
TITULO = re.compile(r"Created cloud session:\s*([^\r\n]+)")


def _epoch_iso(texto: str) -> float | None:
    """Epoch de una fecha ISO con zona; None si no se puede leer."""
    if not texto:
        return None
    try:
        dt = datetime.fromisoformat(str(texto).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def cupo_nube(credito: dict, ahora: float, vivas: int, max_vivas: int = MAX_VIVAS,
              reserva_usd: float = RESERVA_USD) -> tuple[bool, str, float]:
    """(se puede lanzar, motivo en español, presupuesto de hoy en $)."""
    credito = credito if isinstance(credito, dict) else {}
    vence = _epoch_iso(credito.get("vence") or "")
    if vence is None:
        return False, "falta el vencimiento del crédito de la nube", 0.0
    if vence <= float(ahora):
        return False, "el crédito de la nube venció el %s" % credito.get("vence"), 0.0
    restante = float(credito.get("restante_usd") or 0.0)
    if restante <= float(reserva_usd):
        return False, "el crédito restante (%.2f $) está por debajo de la reserva (%.2f $)" % (
            restante, float(reserva_usd)), 0.0
    if int(vivas) >= int(max_vivas):
        return False, "ya hay %d sesiones vivas (tope %d)" % (int(vivas), int(max_vivas)), 0.0
    dias = max(1.0, (vence - float(ahora)) / 86400.0)
    presupuesto = (restante - float(reserva_usd)) / dias
    return True, "hay cupo: %.2f $ para hoy" % presupuesto, presupuesto


def rama_pedida(tid: str, fecha_aaaammdd: str) -> str:
    return "nube/cc-%s/ola/%s" % (fecha_aaaammdd, tid)


def orden_cli(modelo: str, descripcion: str) -> list[str]:
    modelo = str(modelo or "")
    descripcion = str(descripcion or "")
    if not modelo or modelo.startswith("-"):
        raise ValueError("modelo no válido: %r" % modelo)
    if not descripcion.strip():
        raise ValueError("la descripción de la sesión no puede estar vacía")
    return ["claude", "--model", modelo, "--cloud", descripcion]


def brief(plantilla: str, tarea: dict, fecha: str) -> str:
    """Sustituye los marcadores del brief; el prompt va el último y conserva sus llaves."""
    tarea = tarea if isinstance(tarea, dict) else {}
    archivos = tarea.get("archivos") or []
    texto = (plantilla or "").replace("{ID}", str(tarea.get("id") or ""))
    texto = texto.replace("{TITULO}", str(tarea.get("titulo") or ""))
    texto = texto.replace("{FECHA}", str(fecha))
    texto = texto.replace("{ARCHIVOS}", ", ".join(str(a) for a in archivos))
    return texto.replace("{PROMPT}", str(tarea.get("prompt") or ""))


def sesion_de_salida(texto: str) -> dict | None:
    """Sesión creada según la salida del CLI; None si no hay línea «View:»."""
    limpio = ANSI.sub("", str(texto or "")).replace("\r", "\n")
    m = VIEW.search(limpio)
    if not m:
        return None
    sesion = m.group(1)
    t = TITULO.search(limpio)
    return {"sesion": sesion, "url": "https://claude.ai/code/" + sesion,
            "titulo": (t.group(1).strip() if t else "")}

def viva(progreso: dict, tid: str) -> bool:
    e = (progreso or {}).get(tid) if isinstance(progreso, dict) else None
    return isinstance(e, dict) and e.get("estado") == "reasignada" and e.get("medio") == "claude-nube"

def seguir(registro: dict, ramas_remotas: set[str], progreso: dict, ahora: float,
           gracia_h: float = GRACIA_H) -> dict[str, str]:
    """«traer» / «devolver» / «esperar» / «olvidar» por tarea del registro."""
    salida: dict[str, str] = {}
    sesiones = (registro or {}).get("sesiones") if isinstance(registro, dict) else None
    for s in sesiones or []:
        if not isinstance(s, dict) or not s.get("tarea"):
            continue
        tid = str(s["tarea"])
        if not viva(progreso, tid):
            salida[tid] = "olvidar"
            continue
        rama = s.get("rama_pedida") or ""
        if rama and rama in (ramas_remotas or set()):
            salida[tid] = "traer"
            continue
        t = s.get("t")
        if not isinstance(t, (int, float)):
            salida[tid] = "esperar"
            continue
        salida[tid] = "devolver" if (float(ahora) - float(t)) > float(gracia_h) * 3600.0 else "esperar"
    return salida

def sesiones_vivas(registro: dict, progreso: dict) -> int:
    sesiones = (registro or {}).get("sesiones") if isinstance(registro, dict) else None
    vistas = set()
    for s in sesiones or []:
        if isinstance(s, dict) and s.get("tarea") and viva(progreso, str(s["tarea"])):
            vistas.add(str(s["tarea"]))
    return len(vistas)
