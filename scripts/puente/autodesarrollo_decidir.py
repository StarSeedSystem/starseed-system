#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decide qué propuestas de imaginación se vuelven tareas (IMN1021B, §5.3–§5.6).
Módulo PURO: sin red ni disco; la única verdad la trae `existe(ruta)`. Utilidad = verbo de
acción × archivos vivos × impacto/esfuerzo (si vienen) × verificación (verificado 1 ·
ajustado 0,8 · sin verificar 0,4 · sin dato 0,6) × vigencia. Publicar, comprar, cuentas,
claves o decisiones de Alex no son tareas: 0 y «pregunta». Jev entra por `consejo(p)` y solo
puede vetar (p ≥ 0,8) o afinar la prioridad; sin consejo manda la regla. Honestidad radical:
lo no verificado se dice tal cual y no se inventan citas.
"""

from __future__ import annotations
import re, unicodedata
from typing import Any, Callable, Dict, Iterable, List, Optional

UMBRAL = 0.6
PESO = {"verificado": 1.0, "ajustado": 0.8, "sin verificar": 0.4, "sin_verificar": 0.4, "sinverificar": 0.4, "sin dato": 0.6, "sin_dato": 0.6, "sin datos": 0.6}
VERBOS = re.compile(r"\b(añad|agreg|arregl|corrig|crea|crear|cambi|quit|elimin|borr|muev|mover|renombr|unific|extra|implement|migr|document|actualiz|mejor|redu|sustitu|reemplaz|divid|separ|valid|refactor|optimiz|limpi|ajust|cable|conect|proteg|evit|fusion|detect|convert|simplific|tipa|tipar|prueb|prob|comprueb|verific|revis|usar|pasar)\w*\b", re.I)
NO_CODIGO = re.compile(r"\b(comprar|contratar|pagar|suscrib|factura|crear (una )?cuenta|abrir (una )?cuenta|cuenta (de|nueva)|clave|contrase[nñ]a|api[_ ]?key|secreto|token de acceso|decisi[oó]n de alex|lo decide alex|pedir(le)? a alex|(publicar|desplegar|lanzar) (en|a) producci[oó]n)\b", re.I)
CRITICO = re.compile(r"(^|/)(src/lib/nucleo|.*identidad|.*identity|.*cuentas?|.*accounts?|.*permisos?|.*permissions?|.*sharing|.*share|.*access|.*acceso|.*gobernanza|.*governance|.*voto|.*votaci|.*politics|.*claves?|.*keys?|.*secret|.*seguridad|.*security|.*auth|supabase/migrations|\.github)([/._-]|$)|(^|/)scripts/puente/(autopublicar|publicar|instalar-servicios)\.py$", re.I)
BORRA = re.compile(r"\b(borrar|borra|eliminar|elimina|quitar|quita)\b", re.I)
DEFECTO = re.compile(r"\bvalores? (por defecto|predeterminados)|por defecto de todas las cuentas|enrutador de (ia|modelos)|router de (ia|modelos)\b", re.I)
RUTAS = ("archivos", "archivo", "ruta", "rutas")
class Puntaje(float):
    """Utilidad 0–1 que además lleva motivo, destino y factores (sigue siendo un float)."""
    def __new__(cls, v, motivo="", destino=None, accionable=False, factores=None):
        o = float.__new__(cls, max(0.0, min(1.0, round(float(v), 3)))); o.motivo, o.destino, o.accionable, o.factores = motivo, destino, accionable, factores or {}; return o
class Destino(str):
    """Destino con su importancia y si exige ver el diff antes de integrar."""
    def __new__(cls, v, nivel="", motivo=""):
        o = str.__new__(cls, v); o.importancia, o.motivo, o.aprobacion_diff = nivel, motivo, nivel == "critica"; return o
class Elegidas(list):
    motivo, utiles, minimo, maximo = "", 0, 0, 0

def _t(p): return " ".join(str(p.get(k)) for k in ("titulo", "detalle", "descripcion", "propuesta", "motivo", "cuerpo") if p.get(k))
def _cita(p):
    c = p.get("cita")
    if isinstance(c, dict): c = c.get("archivo") or c.get("ruta")
    if isinstance(c, str) and ("/" in c or "." in c.split(":")[0]): return c.strip().strip("`").split(":")[0].removeprefix("./")
    return None
def _archivos(p):
    v = []
    for k in RUTAS:
        x = p.get(k)
        v += [a.strip().strip("`").removeprefix("./") for a in (x if isinstance(x, (list, tuple)) else [x]) if isinstance(a, str) and ("/" in a or "." in a.split(":")[0])]
    c = _cita(p)
    if c: v.append(c)
    return list(dict.fromkeys(v))

def _vivo(existe, r):
    try: return bool(existe(r))
    except Exception: return False
def _es_codigo(p):
    if p.get("no_codigo") or p.get("es_codigo") is False: return False
    if p.get("es_codigo") is True: return True
    if str(p.get("tipo") or "").lower() in ("pregunta", "cuenta", "compra", "publicacion", "decision", "clave"): return False
    return not NO_CODIGO.search(_t(p)) and bool(_archivos(p))
def _peso(p):
    s = str(p.get("verificacion") or "").strip().lower().replace("-", " ")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return PESO.get(s, 0.6)

def _num(x):
    try: return float(x)
    except (TypeError, ValueError): return None
def _jev(p, consejo):
    if not consejo: return {}
    try:
        c = consejo(p)
        return c if isinstance(c, dict) else {}
    except Exception: return {}
def evaluar(p, existe, consejo=None):
    """La regla completa de §5.3, con el motivo a la vista."""
    if not _es_codigo(p): return Puntaje(0, "no es trabajo de código: lo decide una persona", "pregunta")
    if p.get("vigente") is False or p.get("cita_vigente") is False: return Puntaje(0, "ya no aplica: la cita dejó de estar en el código")
    if not VERBOS.search(_t(p)): return Puntaje(0, "no dice qué hacer: falta un verbo de acción", "pregunta")
    cita = _cita(p)
    if cita and not _vivo(existe, cita): return Puntaje(0, "ya no aplica: la cita dejó de estar en el código")
    vivos = [a for a in _archivos(p) if _vivo(existe, a)]
    if not vivos: return Puntaje(0, "ya no aplica: los archivos citados ya no existen")
    c = _jev(p, consejo)
    if c.get("veto") is True and float(c.get("p") or 0) >= 0.8: return Puntaje(0, "Jev lo veta (p=%.2f)" % float(c.get("p") or 0))
    ver, imp, esf = _peso(p), _num(p.get("impacto")), _num(p.get("esfuerzo"))
    factor = max(0.2, min(1.5, imp / esf)) if imp and esf and imp > 0 and esf > 0 else 1.0
    return Puntaje(ver * factor, "accionable: %d archivo(s) vivos · verificación %s (%.2f) · impacto/esfuerzo %.2f" % (len(vivos), p.get("verificacion") or "sin dato", ver, factor), None, True, {"verificacion": ver, "impacto": factor, "vigencia": 1.0})
def utilidad(p, existe, consejo=None):
    """La utilidad, de 0 a 1."""
    return evaluar(p, existe, consejo)
def cuantas(utiles, rango=None):
    """Las ≥ 0,6 ordenadas y cortadas en `rango.max`; el mínimo no se rellena con inútiles."""
    if isinstance(rango, (list, tuple)): rango = {"min": rango[0], "max": rango[1]}
    r = rango if isinstance(rango, dict) else {"max": rango}
    minimo, maximo = int(r.get("min") or 0), int(r.get("max") if r.get("max") is not None else 10)
    pares = [(float(u["utilidad"] if isinstance(u, dict) else u), i, u) for i, u in enumerate(utiles) if isinstance(u.get("utilidad") if isinstance(u, dict) else u, (int, float))]
    buenas = sorted([x for x in pares if x[0] >= UMBRAL], key=lambda x: (-x[0], x[1]))
    e = Elegidas(x[2] for x in buenas[:max(0, maximo)]); e.utiles, e.minimo, e.maximo = len(buenas), minimo, maximo
    if maximo <= 0: e.motivo = "el rango no permite ninguna tarea (máximo 0)"
    elif not e: e.motivo = "ninguna propuesta llega a 0,6 de utilidad; no se rellena el mínimo con inútiles"
    elif len(e) < minimo: e.motivo = "%d de %d útiles, por debajo del mínimo %d: no se rellena con inútiles" % (len(e), len(buenas), minimo)
    else: e.motivo = "%d de %d propuestas útiles, dentro del rango %d–%d; el mínimo no se rellena con inútiles" % (len(e), len(buenas), minimo, maximo)
    return e
def importancia(p):
    """crítica · alta · media · baja, según §5.5."""
    archivos = [a.lower() for a in _archivos(p)]
    if any(CRITICO.search(a) for a in archivos): return "critica"
    if len(archivos) > 3 or p.get("borra") or p.get("elimina") or BORRA.search(_t(p)) or p.get("valores_por_defecto") or p.get("defaults") or p.get("todas_las_cuentas") or p.get("enrutador_ia") or DEFECTO.search(_t(p)): return "alta"
    if not archivos or all(a.endswith((".md", ".txt")) or a.startswith(("docs/", "memory/")) for a in archivos): return "baja"
    return "baja" if str(p.get("tipo") or "").lower() in ("docs", "documentacion", "comentario", "texto") else "media"
def destino(p, automatico=True, consejo=None):
    """A dónde va la propuesta y si exige ver el diff (§5.6)."""
    if not _es_codigo(p): return Destino("pregunta", "baja", "no es trabajo de código: lo decide una persona")
    nivel, c = importancia(p), _jev(p, consejo)
    if c.get("prioridad") in ("alta", "media", "baja") and float(c.get("p") or c.get("confianza") or 0) >= 0.8 and nivel != "critica":
        nivel = c["prioridad"]
    if nivel == "critica": return Destino("esperando-aprobacion", nivel, "crítica: se aprueba y se ve el diff antes de integrar")
    if nivel == "alta": return Destino("esperando-aprobacion", nivel, "alta: espera el visto bueno de Alex")
    if automatico: return Destino("autodesarrollo", nivel, "útil y no importante: se desarrolla sola")
    return Destino("esperando-aprobacion", nivel, "automático apagado: todo espera el visto bueno")
