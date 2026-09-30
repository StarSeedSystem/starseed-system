#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Jev en las decisiones del enjambre de CÓDIGO (2026-09-30) — solo en la zona de duda.

Auditoría de `scripts/enjambre/starseed-enjambre.py` (qué decide una regla pura hoy):

| Decisión | Regla de hoy | ¿Duda? | Aquí |
|---|---|---|---|
| Reintentar o apartar tras un fallo del PROVEEDOR (429, 5xx, «database is locked», modelo retirado) | códigos y pistas de texto: esperar y reintentar el mismo, o siguiente | no: la señal es inequívoca | se queda en la regla |
| Qué modelo va primero tras un fallo previo en ESTA tarea | los que fallaron al final, el resto en el orden rotado por id | **sí**: varios sanos y nada que los distinga | `ordenar_escritores` |
| Aceptar «sin cambios» antes de gastar todos los intentos | seguir hasta `TOPE_INTENTOS_ESCRITURA` (5 × hasta 25 min) | **sí** tras 2 intentos reales sin cambios de proveedores distintos | `parar_sin_cambios` |
| Qué revisor primero | el último que respondió, luego REVISORES | solo sin «último que respondió» | `ordenar_revisores` |

Reglas de la casa (memory/orquestacion-economica.md §9 y §17): la regla es el suelo y el
respaldo; Jev solo cambia algo con confianza (elegir ≥ 0,5; parar ≥ 0,85) y nunca convierte en
«sí» un «no» de la regla. `consultar` tiene la forma de `decidir.consultar`; si es None, lanza
o calla («medio: regla»), todo sigue exactamente como antes. Módulo PURO.
"""

UMBRAL_ESCRITOR = 0.5
UMBRAL_REVISOR = 0.5
UMBRAL_PARAR = 0.85
MIN_INTENTOS_PARA_PARAR = 2
MAX_OPCIONES = 4


def proveedor(modelo):
    return str(modelo).split("/", 1)[0]


def ficha_de_tarea(t):
    """Lo que Jev necesita saber de la tarea para elegir (sin el prompt entero)."""
    archivos = [str(a) for a in (t.get("archivos") or []) if isinstance(a, str)]
    exts = sorted({a.rsplit(".", 1)[-1].lower() for a in archivos if "." in a})
    return {"id": t.get("id"), "titulo": str(t.get("titulo") or "")[:160], "archivos": archivos[:6],
            "extensiones": exts, "enunciado": " ".join(str(t.get("prompt") or "").split())[:400]}


def _primeros_por_proveedor(candidatos, clave=lambda c: c, n=MAX_OPCIONES):
    top, vistos = [], set()
    for c in candidatos:
        p = proveedor(clave(c))
        if p in vistos:
            continue
        top.append(c)
        vistos.add(p)
        if len(top) >= n:
            break
    return top


def _consultar(consultar, *a, **k):
    if consultar is None:
        return None
    try:
        r = consultar(*a, **k)
    except Exception:
        return None
    return r if isinstance(r, dict) and r.get("medio") not in (None, "regla") else None


def ordenar_escritores(t, candidatos, fallidos, consultar, fichas=None):
    """(candidatos, nota, experiencia). Solo si la tarea ya falló aquí antes y hay ≥ 2
    proveedores distintos entre los primeros: Jev elige cuál intenta ahora."""
    candidatos = list(candidatos or [])
    if not fallidos or t.get("modelo"):
        return candidatos, "", None
    top = _primeros_por_proveedor(candidatos)
    if len(top) < 2:
        return candidatos, "", None
    fichas = fichas or {}
    estado = {"tarea": ficha_de_tarea(t), "ya_fallaron_aqui": [str(m) for m in fallidos][-4:],
              "candidatos": [dict(fichas.get(m) or {}, id=m) for m in top]}
    r = _consultar(consultar, "elegir", estado,
                   "Esta tarea de código ya falló con %s. ¿Qué modelo gratuito debe intentarla ahora para "
                   "que escriba de verdad los archivos pedidos?" % ", ".join(str(m).split("/")[-1] for m in fallidos[-3:]),
                   opciones=top, regla=top[0], quien="enjambre", dominio="enjambre:escritor")
    if not r:
        return candidatos, "", None
    elegido, conf = r.get("respuesta"), float(r.get("confianza") or 0.0)
    if elegido not in top or conf < UMBRAL_ESCRITOR or elegido == candidatos[0]:
        return candidatos, "", r.get("experiencia")
    return ([elegido] + [m for m in candidatos if m != elegido],
            "Jev elige %s para reintentar (confianza %.2f; la regla ponía %s)" % (elegido, conf, candidatos[0]),
            r.get("experiencia"))


def ordenar_revisores(candidatos, ultimo_ok, consultar, titulo=""):
    """(candidatos, nota). El «último que respondió» es la mejor señal que hay: con él manda
    la regla. Sin él, y con ≥ 2 proveedores, Jev elige quién revisa primero."""
    candidatos = list(candidatos or [])
    if ultimo_ok or len(candidatos) < 2:
        return candidatos, ""
    ids = ["%s/%s" % c for c in candidatos]
    top = _primeros_por_proveedor(ids)
    if len(top) < 2:
        return candidatos, ""
    r = _consultar(consultar, "elegir", {"diff_de": str(titulo)[:160], "revisores": top},
                   "¿Qué revisor gratuito dará la revisión más fiable de este diff (riesgos reales, sin "
                   "bloqueos por falta de contexto)?", opciones=top, regla=top[0], quien="enjambre",
                   dominio="enjambre:revisor")
    if not r or r.get("respuesta") not in top or float(r.get("confianza") or 0.0) < UMBRAL_REVISOR:
        return candidatos, ""
    i = ids.index(r["respuesta"])
    if i == 0:
        return candidatos, ""
    return [candidatos[i]] + candidatos[:i] + candidatos[i + 1:], "Jev elige revisor %s (confianza %.2f)" % (
        r["respuesta"], float(r.get("confianza") or 0.0))


def parar_sin_cambios(t, intentos, probados, quedan, salidas, consultar):
    """(parar, nota, experiencia). Tras ≥ 2 intentos reales sin cambios de proveedores
    distintos, ¿se acepta «sin cambios» ya (la tarea parece hecha o imposible tal como está
    escrita) en vez de gastar los intentos que quedan? Solo con P ≥ UMBRAL_PARAR. La regla
    —seguir hasta el tope— es el respaldo; y el director aún le da otra oportunidad
    (`reintento_sin_cambios.py`), así que parar nunca pierde la tarea."""
    if intentos < MIN_INTENTOS_PARA_PARAR or not quedan:
        return False, "", None
    if len({proveedor(m) for m in probados}) < 2:
        return False, "", None
    estado = {"tarea": ficha_de_tarea(t), "intentos_sin_cambios": int(intentos),
              "probados": [str(m) for m in probados][-5:], "quedan": len(quedan),
              "ultimas_salidas": [str(s or "")[-500:] for s in (salidas or [])][-3:]}
    r = _consultar(consultar, "si-no", estado,
                   "Varios modelos distintos terminaron SIN tocar ningún archivo. ¿La tarea parece ya hecha "
                   "o imposible tal como está escrita, de modo que otro intento sería en balde?",
                   regla="no", quien="enjambre", dominio="enjambre:sin_cambios")
    if not r or r.get("p") is None:
        return False, "", None
    p = float(r["p"])
    if p >= UMBRAL_PARAR:
        return True, "Jev: p=%.2f de que otro intento sea en balde (%d sin cambios) → acepto «sin cambios» y lo " \
                     "decide el director" % (p, intentos), r.get("experiencia")
    return False, "", r.get("experiencia")
