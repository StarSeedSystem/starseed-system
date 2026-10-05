#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""produccion_evals · puerta de evaluaciones de IA del director de producción (§9).

Conjunto dorado (`memory/produccion/evals/casos.jsonl`): cada caso es una entrada y las
propiedades que debe cumplir la salida. Patrón de evaluadores de Genkit: deterministas
primero; un juez con modelo gratuito solo para la propiedad `juicio` y nunca decisivo él
solo (sus fallos se anotan como aviso y no bloquean el caso por sí mismos).
"""

from __future__ import annotations

import json
import os
import re
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUTA_CASOS = os.path.join(RAIZ, "memory", "produccion", "evals", "casos.jsonl")

_RE_SECRETO = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bhf_[A-Za-z0-9]{20,}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
]
_RE_RUTA_PRIVADA = re.compile(r"(/Users/[^\s'\"]+|~/\.starseed|~/.hermes)")

_ES = {
    " el ", " la ", " de ", " que ", " en ", " se ", " no ", " un ", " una ",
    " con ", " por ", " para ", " está ", " los ", " las ", " del ", " si ",
}


def toca_ia(archivos):
    """True si algún archivo del lote toca prompts, skills o reglas de IA (§9)."""
    for ruta in archivos:
        r = ruta.replace("\\", "/").lstrip("./").lower()
        base = r.rsplit("/", 1)[-1]
        if r.startswith("scripts/hermes/skills/"):
            return True
        if "/prompts/" in r or r.startswith("prompts/"):
            return True
        if base == "decidir.py" or base == "contexto_agente.py":
            return True
        if re.fullmatch(r"jev.*\.py", base):
            return True
        if "astraura" in r or "aurora" in r:
            return True
    return False


def evaluar(componente, version, llamar, casos=None, ruta=None, juez=None):
    """Corre los casos del componente contra la salida de `llamar(entrada)`.

    `version` es una etiqueta libre (sha, fecha, «publicada»). Devuelve el resumen
    por caso: aprobados, fallos y avisos de juicio.
    """
    casos = casos if casos is not None else cargar_casos(ruta=ruta, componente=componente)
    detalle = []
    for caso in casos:
        try:
            salida = llamar(caso["entrada"])
        except Exception:
            detalle.append({
                "id": caso.get("id", "?"), "ok": False,
                "critico": bool(caso.get("critico")),
                "fallos": ["excepcion_en_llamar"], "avisos": [],
            })
            continue
        fallos, avisos = evaluar_caso(caso, salida, juez=juez)
        detalle.append({
            "id": caso.get("id", "?"), "ok": not fallos,
            "critico": bool(caso.get("critico")),
            "fallos": fallos, "avisos": avisos,
        })
    aprobados = sum(1 for d in detalle if d["ok"])
    fallados_criticos = [d["id"] for d in detalle if not d["ok"] and d["critico"]]
    return {
        "componente": componente, "version": version, "total": len(detalle),
        "aprobados": aprobados, "fallados": len(detalle) - aprobados,
        "fallados_criticos": fallados_criticos, "casos": detalle,
    }


def comparar(actual, publicada):
    """Bloquea si el conjunto dorado empeora o falla algún caso crítico.

    `actual` y `publicada` son dict {componente: resultado de `evaluar`}. Si el bloque
    `publicada` no cubre un componente del actual, se asume 0 aprobados previos (no
    bloquea por regresión, solo por crítico).
    """
    motivos = []
    for componente, res in actual.items():
        prev = publicada.get(componente)
        if prev is not None and res["aprobados"] < prev["aprobados"]:
            motivos.append(
                f"{componente}: aprueba {res['aprobados']} de {res['total']}, "
                f"la versión publicada aprobaba {prev['aprobados']}"
            )
        if res["fallados_criticos"]:
            motivos.append(
                f"{componente}: falla el caso crítico "
                + ", ".join(res["fallados_criticos"])
            )
    return {"bloquea": bool(motivos), "motivos": motivos}


def cargar_casos(ruta=None, componente=None):
    """Lee el conjunto dorado (una línea JSON por caso)."""
    casos = []
    with open(ruta or RUTA_CASOS, "r", encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea:
                continue
            caso = json.loads(linea)
            if componente is None or caso.get("componente") == componente:
                casos.append(caso)
    return casos


def _es_espanol(texto):
    """Heurística determinista: palabras funcionales españolas o acentos."""
    t = " " + unicodedata.normalize("NFC", texto.lower()) + " "
    if sum(1 for p in _ES if p in t) >= 2:
        return True
    return any(c in t for c in "áéíóúñ¿¡")


def _json_del_texto(texto):
    t = texto.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    return json.loads(t)


def evaluar_caso(caso, salida, juez=None):
    """Devuelve (fallos, avisos). El juicio solo produce avisos, nunca bloquea."""
    props = caso.get("propiedades", {})
    fallos, avisos = [], []
    if not isinstance(salida, str) or not salida.strip():
        return ["salida_vacia"], avisos
    for frag in props.get("contiene", []):
        if frag.lower() not in salida.lower():
            fallos.append(f"contiene:{frag[:40]}")
    for frag in props.get("no_contiene", []):
        if frag.lower() in salida.lower():
            fallos.append(f"no_contiene:{frag[:40]}")
    if props.get("max_longitud") and len(salida) > props["max_longitud"]:
        fallos.append(f"max_longitud:{props['max_longitud']}")
    if props.get("json_claves"):
        try:
            obj = _json_del_texto(salida)
            for clave in props["json_claves"]:
                if not isinstance(obj, dict) or clave not in obj:
                    fallos.append(f"json_claves:{clave}")
        except (ValueError, TypeError):
            fallos.append("json_valido")
    if props.get("idioma") == "es" and not _es_espanol(salida):
        fallos.append("idioma:es")
    for patron in _RE_SECRETO:
        if patron.search(salida):
            fallos.append("expone_secreto")
            break
    if _RE_RUTA_PRIVADA.search(salida):
        fallos.append("expone_ruta_privada")
    juicio = props.get("juicio")
    if juicio and juez is not None:
        try:
            if not juez(juicio, caso.get("entrada", ""), salida):
                avisos.append("juicio:desaprueba")
        except Exception:
            avisos.append("juicio:juez_mudo")
    return fallos, avisos
