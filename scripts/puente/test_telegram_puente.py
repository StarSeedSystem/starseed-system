#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lógica pura de telegram-puente, extraída para tests sin importar el módulo entero.

Las funciones aquí son copia exacta de las que usa el puente, pero sin el
ciclo ni las lecturas de red. Se comparan contra el módulo real desde los
tests; cualquier divergencia deja de pasar y se corrige en la fuente.
"""
import json, os, time

# ── constantes que también usa el puente ──────────────────────────────────
MURMURIO_MAX = 300
SECUENCIA_REPITO = 3
SIN_CREDITO_TIEMPO = 600


def _autorizado(quien, impuestos=None):
    """Devuelve True solo si el chat id coincide con el dueño."""
    cfg = impuestos if impuestos is not None else None
    if cfg is None:
        return False
    return bool(quien and cfg and str(quien) == str(cfg))


def parsear_orden(texto):
    """Devuelve (tipo, args, extra) o None."""
    if not isinstance(texto, str):
        return None
    s = texto.strip()
    if not s:
        return None
    primer = s.split()[0] if s.split() else s
    if not primer.startswith("/"):
        return ("mensaje", [s], None)
    partes = s.split(maxsplit=1)
    orden = partes[0][1:]
    args = partes[1].split() if len(partes) > 1 else []
    if orden == "ayuda":
        return ("ayuda", [], None)
    if orden == "estado":
        return ("estado", [], None)
    if orden == "agentes":
        return ("agentes", [], None)
    if orden == "olas":
        n = args[0] if args else None
        return ("olas", [n] if n else [], None)
    if orden == "cola":
        return ("cola", [], None)
    if orden == "puertas":
        return ("puertas", [], None)
    if orden == "decir":
        if not args:
            return ("error", [], "decir <texto>")
        return ("decir", [" ".join(args)], None)
    if orden == "a" and args:
        quien = args[0]
        resto = " ".join(args[1:])
        if resto:
            return ("personal", [quien, resto], None)
        return ("error", [], "a <agente> <texto>")
    if orden in ("aprobar", "rechazar", "soltar"):
        if not args:
            return ("error", [], "%s <id...>" % orden)
        return (orden, args, None)
    if orden == "reasignar" and len(args) >= 2:
        return ("reasignar", [args[0], args[1]], None)
    if orden == "reasignar":
        return ("error", [], "reasignar <id> <modelo>")
    return ("desconocida", [s], orden)


def es_repetido(linea, ultimo):
    """¿Vale la pena reenviar este evento o es ruido redundante?

    Filtra:
    · latidos (tipo=murmurio) → siempre True.
    · mensaje sin texto anterior → False (hay que enviarlo).
    · igual texto y mismo tipo y misma tarea y mismo quien → True.
    · aviso de cuota repetido dentro de SIN_CREDITO_TIEMPO → True.
    · aviso de API colgada repetido de la misma tarea → True.
    """
    if not isinstance(linea, dict) or linea is None:
        return True
    if linea.get("tipo") != "murmurio":
        if not ultimo or not isinstance(ultimo, dict):
            return False
    else:
        return True

    linea_tipo = linea.get("tipo", "")
    linea_texto = linea.get("texto", "")
    ultimo_tipo = ultimo.get("tipo") if isinstance(ultimo, dict) else None

    if linea_tipo == ultimo_tipo and linea_texto == ultimo.get("texto", ""):
        mismo_quien = linea.get("quien") == ultimo.get("quien")
        misma_tarea = (linea.get("tarea") or "") == (ultimo.get("tarea") or "")
        if mismo_quien and misma_tarea:
            return True

    # agrupación de cuota.
    if linea_tipo == "aviso" and "cuota" in linea_texto.lower():
        ultimo_epoch = ultimo.get("epoch")
        linea_epoch = linea.get("epoch")
        if isinstance(ultimo_epoch, (int, float)) and isinstance(linea_epoch, (int, float)):
            if linea_epoch >= ultimo_epoch and (linea_epoch - ultimo_epoch) < SIN_CREDITO_TIEMPO:
                return True

    # agrupación de API colgada.
    if linea_tipo == "aviso" and "colgada" in linea_texto.lower():
        antiguo = ultimo.get("texto", "")
        misma_tarea = (linea.get("tarea") or "") == (ultimo.get("tarea") or "")
        if misma_tarea and "colgada" in antiguo.lower():
            return True

    return False


def _pinta_json(linea):
    """Formatea un objeto del canal para Telegram (plain, Markdown)."""
    if not isinstance(linea, dict):
        return ""
    marca = {"error": "✗", "aviso": "!", "hecho": "✓", "mensaje": "·"}.get(
        linea.get("tipo", ""), "·")
    quien = linea.get("quien") or "?"
    tarea = (" [%s]" % linea["tarea"]) if linea.get("tarea") else ""
    momento = linea.get("t")
    msj = linea.get("texto") or ""
    if momento and len(momento) > 11:
        ts = momento[11:]
    else:
        ts = momento or ""
    return "%s *%s* _%s_%s %s" % (marca, quien, ts, tarea, msj)


def _formatear_orden_completa(accion, args, extra=None):
    """Convierte parsear_orden → texto para el canal común."""
    if accion == "mensaje":
        return args[0] if args else ""
    if accion == "decir":
        return "/decir %s" % (" ".join(args) if args else "")
    if accion in ("aprobar", "rechazar", "soltar", "reasignar"):
        base = "/%s %s" % (accion, " ".join(args))
        if extra:
            kvs = " ".join("%s=%s" % kv for kv in extra.items())
            return "%s %s" % (base, kvs)
        return base
    if accion == "personal":
        if len(args) >= 2:
            return "/a %s %s" % (args[0], args[1])
        return "/a %s" % args[0]
    if accion == "desconocida":
        return "%s: orden no reconocida" % args[0]
    if accion == "error":
        return args[0] or "orden incompleta"
    return "/%s" % accion


def arranque_completo(entorno=None):
    """Devuelve dict con ok, faltan, texto.

    Si `entorno` es un dict, se usa como sustituto de os.environ para el test.
    """
    if entorno is None:
        entorno = os.environ
    token = entorno.get("TELEGRAM_BOT_TOKEN")
    chat = entorno.get("TELEGRAM_CHAT_ID")
    faltan = []
    if not token:
        faltan.append("TELEGRAM_BOT_TOKEN")
    if not chat:
        faltan.append("TELEGRAM_CHAT_ID")
    return {
        "ok": not faltan,
        "token": bool(token),
        "chat": bool(chat),
        "faltan": list(faltan),
        "texto": ("Telegram-Puente listo para el chat %s." % chat) if not faltan
                 else ("Telegram-Puente parado: hacen falta %s como variables de entorno."
                       % ", ".join(faltan)),
    }
