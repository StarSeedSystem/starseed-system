#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Carril de alta capacidad en la nube (ola 1022A): lógica pura, sin red y sin reloj propio.

El peldaño 4a de la escalera (memory/orquestacion-economica.md §0) son sesiones de Claude
Code en la nube (`claude --model <modelo> --cloud <brief>`) pagadas con el crédito de Alex
(`~/.starseed/credito-claude-nube.json`: restante_usd, vence), que SOLO gastan esas sesiones.
Este módulo reúne las decisiones para automatizar el carril: `ahora` entra como argumento,
en segundos epoch. `cupo_nube` (¿se puede lanzar hoy y con qué presupuesto?), `rama_pedida`,
`orden_cli`, `brief`, `sesion_de_salida` (id y enlace desde la salida del CLI) y
`seguir`/`sesiones_vivas` (traer la rama, devolver el préstamo, esperar u olvidar).
"""
from __future__ import annotations

import re
from datetime import datetime

#: Medio de progreso.json que marca a una tarea prestada a una sesión en la nube.
MEDIO_NUBE = "claude-nube"

#: Horas de gracia antes de devolver una tarea sin rama remota: es un préstamo, no un traspaso.
GRACIA_H_DEFECTO = 8.0

SEGUNDOS_DIA = 86400.0

#: Secuencias ANSI del CLI (CSI: parámetros, intermedios y byte final).
ANSI = re.compile(r"\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]")


def rama_pedida(tid: str, fecha_aaaammdd: str) -> str:
    """Rama que la sesión empuja: `nube/cc-<fecha>/ola/<id>` (traer_nube la reconoce por `/ola/<id>`)."""
    return "nube/cc-%s/ola/%s" % (fecha_aaaammdd, tid)


def orden_cli(modelo: str, descripcion: str) -> list[str]:
    """Orden exacta; `--cloud` va DESPUÉS de `--model` porque toma un valor opcional.

    Rechaza una descripción vacía (la sesión saldría sin brief) y un modelo que empiece
    por «-» (el CLI lo leería como una opción y se comería el siguiente argumento).
    """
    if not str(descripcion or "").strip():
        raise ValueError("falta la descripción de la sesión en la nube")
    if str(modelo or "").startswith("-"):
        raise ValueError("el modelo no puede empezar por «-»: el CLI lo leería como una opción")
    return ["claude", "--model", modelo, "--cloud", descripcion]


def _vence_epoch(vence) -> float | None:
    """El vencimiento (ISO con zona, o epoch) → segundos; None si falta o no se entiende."""
    if isinstance(vence, bool):
        return None
    if isinstance(vence, (int, float)):
        return float(vence)
    try:
        return datetime.fromisoformat(str(vence).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def cupo_nube(credito: dict, ahora: float, vivas: int, max_vivas: int = 3, reserva_usd: float = 10.0) -> tuple[bool, str, float]:
    """Devuelve (se_lanza, motivo en español, presupuesto de hoy en $).

    Reglas del carril (memory/orquestacion-economica.md §0, peldaño 4a): no se lanza si el
    crédito venció o no declara `vence` legible, si el restante está en o por debajo de la
    reserva, o si ya hay tantas sesiones vivas como el tope. El presupuesto del día es
    (restante − reserva) repartido por los días que faltan hasta el vencimiento (mínimo 1).
    """
    d = credito if isinstance(credito, dict) else {}
    vence = _vence_epoch(d.get("vence"))
    if vence is None:
        return False, "el crédito no declara un vencimiento legible: no se lanza", 0.0
    if vence <= ahora:
        return False, "el crédito venció el %s: no se lanza" % d.get("vence"), 0.0
    restante = d.get("restante_usd")
    if isinstance(restante, bool) or not isinstance(restante, (int, float)):
        return False, "el crédito no declara saldo (restante_usd): no se lanza", 0.0
    restante_f = float(restante)
    if restante_f <= reserva_usd:
        return False, "quedan %.2f $ y la reserva es %.2f $: el crédito se cuida" % (
            restante_f, reserva_usd), 0.0
    vivas_n = int(vivas or 0)
    if vivas_n >= max_vivas:
        return False, "ya hay %d sesiones vivas y el tope es %d" % (vivas_n, max_vivas), 0.0
    dias = max(1.0, (vence - ahora) / SEGUNDOS_DIA)
    presupuesto = (restante_f - reserva_usd) / dias
    return True, "cupo listo: ≈ %.2f $ para hoy (%.1f días de crédito, %d sesiones vivas de %d)" % (
        presupuesto, dias, vivas_n, max_vivas), presupuesto


def brief(plantilla: str, tarea: dict, fecha: str) -> str:
    """Compone el brief de la sesión desde `scripts/puente/plantillas/alta-capacidad-nube.md`.

    Primero {ID}, {TITULO}, {FECHA} y {ARCHIVOS} (unidos por «, »); {PROMPT} se sustituye el
    ÚLTIMO, así las llaves que el prompt de la tarea traiga dentro no se tocan.
    """
    t = tarea if isinstance(tarea, dict) else {}
    archivos = t.get("archivos")
    texto = str(plantilla or "")
    texto = texto.replace("{ID}", str(t.get("id") or ""))
    texto = texto.replace("{TITULO}", str(t.get("titulo") or ""))
    texto = texto.replace("{FECHA}", str(fecha or ""))
    texto = texto.replace("{ARCHIVOS}", ", ".join(str(a) for a in archivos) if isinstance(archivos, list) else "")
    texto = texto.replace("{PROMPT}", str(t.get("prompt") or ""))
    return texto


def sesion_de_salida(texto: str) -> dict | None:
    """Extrae la sesión de la salida del CLI: limpia ANSI y saltos de \\r y busca `View:`.

    La salida trae `Created cloud session: <título>` y
    `View: https://claude.ai/code/session_<id>?from=cli&m=0`; la URL se devuelve sin query.
    """
    limpio = ANSI.sub("", str(texto or "")).replace("\r\n", "\n").replace("\r", "\n")
    m_view = re.search(r"View:\s*(\S+)", limpio)
    if not m_view:
        return None
    url = m_view.group(1)
    m_sesion = re.search(r"(session_[A-Za-z0-9]+)", url)
    m_titulo = re.search(r"Created cloud session:\s*(.+)", limpio)
    return {
        "sesion": m_sesion.group(1) if m_sesion else "",
        "url": url.split("?", 1)[0].split("#", 1)[0],
        "titulo": m_titulo.group(1).strip() if m_titulo else "",
    }


def _sesiones(registro) -> list[dict]:
    """Las entradas del registro `~/.starseed/alta-capacidad-nube.json`, sea {sesiones: […]} o lista."""
    if isinstance(registro, dict):
        lista = registro.get("sesiones")
    elif isinstance(registro, list):
        lista = registro
    else:
        lista = None
    return [e for e in (lista or []) if isinstance(e, dict)]


def _prestada(progreso: dict, tid: str) -> bool:
    """¿La tarea sigue `reasignada · claude-nube`? (ningún reclamador toca ese medio)."""
    v = progreso.get(tid) if isinstance(progreso, dict) else None
    return isinstance(v, dict) and v.get("estado") == "reasignada" \
        and (v.get("medio") or "") == MEDIO_NUBE


def _epoch(t) -> float | None:
    """El momento anotado (epoch o ISO) → segundos; None si no se entiende."""
    if isinstance(t, bool):
        return None
    if isinstance(t, (int, float)):
        return float(t)
    try:
        return float(str(t))
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(str(t).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def seguir(registro: dict, ramas_remotas: set, progreso: dict, ahora: float, gracia_h: float = GRACIA_H_DEFECTO) -> dict[str, str]:
    """Qué hacer con cada tarea que el registro dice prestada a una sesión en la nube.

    «traer» si su rama ya está entre las remotas y sigue `reasignada · claude-nube` (justo
    antes hay que pasarla a `pendiente` y correr `traer_nube.py revisar --aplicar`);
    «devolver» si pasaron más de `gracia_h` horas sin rama alguna (es un préstamo, no un
    traspaso); «esperar» en otro caso — incluida la sesión sin fecha legible, que no se
    juzga con datos incompletos —, y «olvidar» si la tarea ya no está reasignada.
    """
    salida: dict[str, str] = {}
    for e in _sesiones(registro):
        tid = str(e.get("tarea") or "")
        if not tid:
            continue
        if not _prestada(progreso, tid):
            salida[tid] = "olvidar"
            continue
        if str(e.get("rama_pedida") or "") in ramas_remotas:
            salida[tid] = "traer"
            continue
        t = _epoch(e.get("t"))
        if t is not None and (ahora - t) > gracia_h * 3600.0:
            salida[tid] = "devolver"
        else:
            salida[tid] = "esperar"
    return salida


def sesiones_vivas(registro: dict, progreso: dict) -> int:
    """Cuántas sesiones del registro siguen con su tarea `reasignada · claude-nube`."""
    return sum(1 for e in _sesiones(registro) if _prestada(progreso, str(e.get("tarea") or "")))
