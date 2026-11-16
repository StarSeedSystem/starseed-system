# -*- coding: utf-8 -*-
"""Freno por el mismo motivo en las tareas del enjambre."""
import re


def motivo_de(nota: str) -> str:
    if not isinstance(nota, str):
        return ""
    s = nota.lower()
    s = re.sub(r'\b(t\d+|ola/\w+|[a-f0-9]{7,40})\b', '', s)
    s = re.sub(r'[/\\].*?(?=\s|$)', '', s)
    s = re.sub(r'\d+', '', s)
    s = s.strip()
    return s[:80]


def frenar_por_mismo_motivo(entradas: list, ventana: int = 10, minimo: int = 5, umbral: float = 0.6) -> tuple:
    if not isinstance(entradas, list):
        return False, ""
    validas = []
    for e in entradas:
        if isinstance(e, dict):
            validas.append(e)
    if not validas:
        return False, ""

    def clave_orden(x):
        return x.get("fin", 0) or 0

    ordenadas = sorted(validas, key=clave_orden, reverse=True)
    recientes = ordenadas[:ventana]

    terminadas = []
    for e in recientes:
        estado = str(e.get("estado", "")).lower()
        if estado not in ("hecho", "integrada", "ok"):
            terminadas.append(e)

    if len(terminadas) < minimo:
        return False, ""

    conteo = {}
    for e in terminadas:
        nota = str(e.get("nota", ""))
        motivo = motivo_de(nota)
        conteo[motivo] = conteo.get(motivo, 0) + 1

    total_term = len(terminadas)
    for motivo, c in conteo.items():
        fraccion = c / total_term
        if fraccion >= umbral:
            frase = "se frena: %d de las últimas %d tareas acabaron por «%s»; añadir escritores no lo arregla" % (c, total_term, motivo or "error")
            return True, frase

    return False, ""
