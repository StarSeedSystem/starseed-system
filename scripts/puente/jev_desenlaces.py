#!/usr/bin/env python3
"""Desenlace de una decisión: qué cuenta como verdad (JLA1116A).

El maestro no es Jev; es el desenlace (`architecture/jev-entrena-laya.md` §3).
`desenlace_de(fila)` recibe una fila ya leída (dict) y dice si la decisión
acertó, con hechos: el resultado posterior de un veredicto de bloqueada,
una tarea integrada o revertida del progreso, una aprobación sola con su
sha integrado o revertido, una publicación con su despliegue verde o rojo,
o una corrección explícita de Alex (`corregida_por: alex`). La opinión de
Jev nunca es desenlace: un ejemplo que solo la tiene se etiqueta «debil» y
no entra en el afinado ni en la evaluación. Sin dato → verdad None.
Módulo puro: no lee disco ni usa red; las filas llegan por argumento.
"""


def _tipo_de(f):
    """El tipo de la fila: el campo `tipo` si lo trae, si no se infiere de sus claves."""
    if f.get("tipo"):
        return str(f["tipo"])
    if "resultado" in f:
        return "veredicto"
    if "despliegue" in f:
        return "publicacion"
    if "corregida_por" in f:
        return "correccion"
    if "sha" in f:
        return "aprobacion"
    if "estado" in f:
        return "tarea"
    return ""


def _opinion_jev(exp):
    """True si el ejemplo trae la opinión de Jev (respuestas u opinion_jev)."""
    if exp.get("opinion_jev"):
        return True
    return bool(exp.get("respuestas"))


def desenlace_de(fila):
    """{"verdad": True|False|None, "fuente": str} a partir de una fila ya leída."""
    f = fila if isinstance(fila, dict) else {}
    tipo = _tipo_de(f)
    if tipo == "veredicto":
        r = f.get("resultado")
        return {"verdad": r if isinstance(r, bool) else None, "fuente": tipo}
    if tipo == "tarea":
        e = str(f.get("estado") or "")
        v = True if e == "integrada" else False if e == "revertida" else None
        return {"verdad": v, "fuente": tipo}
    if tipo == "aprobacion":
        e = str(f.get("estado") or "")
        # Sin sha no hay hecho comprobable: una aprobación sola no prueba nada.
        v = None if not str(f.get("sha") or "").strip() else (
            True if e == "integrado" else False if e == "revertido" else None)
        return {"verdad": v, "fuente": tipo}
    if tipo == "publicacion":
        d = str(f.get("despliegue") or "")
        v = True if d == "verde" else False if d == "rojo" else None
        return {"verdad": v, "fuente": tipo}
    if tipo == "correccion":
        if str(f.get("corregida_por") or "").strip().lower() == "alex".lower():
            return {"verdad": False, "fuente": tipo}
        return {"verdad": None, "fuente": tipo}
    if _opinion_jev(f):
        return {"verdad": None, "fuente": "jev"}
    return {"verdad": None, "fuente": ""}


def etiqueta_de(exp, desenlace):
    """«verdad» | «debil» (solo opinión de Jev) | «sin_dato» para un ejemplo."""
    d = desenlace if isinstance(desenlace, dict) else {}
    if d.get("verdad") is True or d.get("verdad") is False:
        return "verdad"
    e = exp if isinstance(exp, dict) else {}
    if d.get("fuente") == "jev" or _opinion_jev(e):
        return "debil"
    return "sin_dato"
