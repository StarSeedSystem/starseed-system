# -*- coding: utf-8 -*-
"""Lógica pura del carril de alta capacidad en la nube (ola 1022A).

Nada de red, procesos ni reloj propio: `ahora` entra como epoch y todo lo demás son datos.
La usa `alta-capacidad-nube.py` para lanzar, seguir y traer las sesiones de Claude Code en la
nube sin gastar el crédito de Alex a ciegas (`memory/orquestacion-economica.md` §0, peldaño 4a).

Decisiones: cupo del crédito, nombre de la rama pedida, orden de la CLI, brief, sesión que
devuelve la salida, qué sesiones traer/devolver/olvidar y cuántas siguen vivas.
"""
from __future__ import annotations

import datetime as _dt
import re

#: `View: https://claude.ai/code/session_<id>?from=cli&m=0` (puede traer ANSI y \r alrededor).
_SESION = re.compile(r"View:\s*(https://claude\.ai/code/session_([A-Za-z0-9]+))")
_TITULO = re.compile(r"Created cloud session:\s*(.+)")
_ANSI = re.compile(r"\x1b\[[0-9;?>]*[A-Za-z]")


def _a_epoch(valor):
    """Epoch de un número o de una fecha ISO (con o sin zona, con `Z`); None si no se entiende."""
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return float(valor)
    texto = str(valor or "").strip()
    if not texto:
        return None
    if texto.endswith("Z"):
        texto = texto[:-1] + "+00:00"
    try:
        return _dt.datetime.fromisoformat(texto).timestamp()
    except ValueError:
        return None


def cupo_nube(credito, ahora, vivas, max_vivas=3, reserva_usd=10.0):
    """PURA. (se puede lanzar, motivo en español, presupuesto de hoy en $).

    No se lanza si el crédito venció (o no se sabe cuándo vence), si el saldo ya está en la
    reserva o por debajo, o si hay `max_vivas` sesiones trabajando. El presupuesto de hoy es lo
    que queda por encima de la reserva repartido entre los días que faltan (mínimo uno).
    """
    d = credito if isinstance(credito, dict) else {}
    try:
        restante = float(d.get("restante_usd"))
    except (TypeError, ValueError):
        return False, "no hay saldo declarado del crédito de la nube", 0.0
    vence = _a_epoch(d.get("vence"))
    if vence is None:
        return False, "falta la fecha de vencimiento del crédito de la nube", 0.0
    if float(ahora) >= vence:
        return False, "el crédito de la nube venció el %s" % d.get("vence"), 0.0
    if restante <= float(reserva_usd):
        return False, ("queda %.2f $ y la reserva es %.2f $: no se gasta el final del crédito"
                       % (restante, reserva_usd)), 0.0
    if int(vivas) >= int(max_vivas):
        return False, "ya hay %d sesiones vivas (el máximo es %d)" % (int(vivas), int(max_vivas)), 0.0
    dias = max(1.0, (vence - float(ahora)) / 86400.0)
    presupuesto = round(max(0.0, restante - float(reserva_usd)) / dias, 2)
    return True, "hay cupo: %.2f $ al día hasta el vencimiento" % presupuesto, presupuesto


def rama_pedida(tid, fecha_aaaammdd):
    """PURA. La rama que se le pide empujar a la sesión (la reconoce `traer_nube` por /ola/<ID>)."""
    return "nube/cc-%s/ola/%s" % (str(fecha_aaaammdd), str(tid))


def orden_cli(modelo, descripcion):
    """PURA. La orden EXACTA: `claude --model <modelo> --cloud <descripción>`.

    El orden importa: `--cloud` toma un valor opcional y, si va antes de `--model`, se queda
    sin descripción. Se rechaza un modelo que empiece por `-` o una descripción vacía.
    """
    modelo = str(modelo or "").strip()
    if not modelo or modelo.startswith("-"):
        raise ValueError("modelo inválido: %r" % (modelo,))
    if not str(descripcion or "").strip():
        raise ValueError("la descripción (brief) no puede estar vacía")
    return ["claude", "--model", modelo, "--cloud", str(descripcion)]


def brief(plantilla, tarea, fecha):
    """PURA. El brief de la sesión: la plantilla con los datos de la tarea.

    El prompt de la tarea se sustituye el ÚLTIMO: si trae llaves (`{ID}`, `{FECHA}`…) se quedan
    tal cual, porque son parte de las instrucciones y no huecos de la plantilla.
    """
    t = tarea if isinstance(tarea, dict) else {}
    texto = str(plantilla or "")
    texto = texto.replace("{ID}", str(t.get("id", "")))
    texto = texto.replace("{TITULO}", str(t.get("titulo", "")))
    texto = texto.replace("{FECHA}", str(fecha))
    archivos = t.get("archivos") or []
    texto = texto.replace("{ARCHIVOS}", ", ".join(str(a) for a in archivos))
    texto = texto.replace("{PROMPT}", str(t.get("prompt", "")))
    return texto


def sesion_de_salida(texto):
    """PURA. De la salida del CLI, {"sesion", "url", "titulo"} o None si no hay `View:`."""
    limpio = _ANSI.sub("", str(texto or "")).replace("\r", "")
    m = _SESION.search(limpio)
    if not m:
        return None
    url = m.group(1).split("?", 1)[0]
    titulo = ""
    tm = _TITULO.search(limpio)
    if tm:
        titulo = tm.group(1).strip()
    return {"sesion": "session_" + m.group(2), "url": url, "titulo": titulo}


def _entrada(progreso, tid):
    e = (progreso or {}).get(tid)
    return e if isinstance(e, dict) else {}


def _es_del_carril(entrada):
    return (entrada.get("estado") == "reasignada"
            and (entrada.get("medio") or "") == "claude-nube")


def sesiones_vivas(registro, progreso):
    """PURA. Cuántas sesiones del registro siguen con su tarea `reasignada · claude-nube`."""
    sesiones = (registro or {}).get("sesiones") or []
    return sum(1 for s in sesiones
               if isinstance(s, dict) and _es_del_carril(_entrada(progreso, s.get("tarea"))))


def seguir(registro, ramas_remotas, progreso, ahora, gracia_h=8):
    """PURA. Qué hacer con cada sesión del registro: «traer», «devolver», «esperar» u «olvidar».

    «traer» si su rama ya está en el remoto y la tarea sigue en el carril; «devolver» si pasó
    la gracia sin rama (es un préstamo, no un traspaso); «olvidar» si la tarea ya no está en el
    carril (la dirección la movió por otro camino). El resto espera.
    """
    salida = {}
    remotas = set(ramas_remotas or ())
    for s in (registro or {}).get("sesiones") or []:
        if not isinstance(s, dict) or not s.get("tarea"):
            continue
        tid = s["tarea"]
        if not _es_del_carril(_entrada(progreso, tid)):
            salida[tid] = "olvidar"
        elif s.get("rama_pedida") in remotas:
            salida[tid] = "traer"
        else:
            t0 = _a_epoch(s.get("t"))
            if t0 is not None and float(ahora) - t0 > float(gracia_h) * 3600.0:
                salida[tid] = "devolver"
            else:
                salida[tid] = "esperar"
    return salida
