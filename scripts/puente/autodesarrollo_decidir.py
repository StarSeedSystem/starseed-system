#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decisión pura del autodesarrollo (Ola 1021I, §5.3–§5.6): utilidad, cuántas,
importancia y destino. Sin red, sin disco y sin reloj: el mundo entra por
`existe(ruta)` y Jev por `consejo(p)`; Jev solo veta o ajusta con p ≥ 0,8.
La cita que ya no está vale 0 («ya no aplica»)."""
from __future__ import annotations
import re, unicodedata
from typing import Callable, Dict, Optional, Tuple
Existe = Callable[[str], bool]; UMBRAL_UTIL = 0.6
VERIFICACION = {"verificado": 1.0, "ajustado": 0.8, "sin verificar": 0.4, "sin dato": 0.6}
VERBOS = ("anadir", "agregar", "crear", "implementar", "arreglar", "corregir", "migrar", "renombrar", "eliminar", "borrar", "quitar", "documentar", "actualizar", "cablear", "optimizar", "proteger", "validar", "sincronizar", "unificar", "ajustar", "mejorar", "integrar", "evitar", "exportar", "importar", "depurar", "medir", "cambiar", "aplicar", "normalizar", "programar", "revisar", "comprobar", "verificar", "probar")
RESERVADOS = ("publicar", "publicacion", "desplegar", "deploy", "vercel", "comprar", "compra", "pagar", "pago", "suscripcion", "contrasena", "clave", "token", "credencial", "decision de alex", "decide alex", "que alex decida", "preguntar a alex", "avisar a alex", "eleccion de alex")
CUENTAS = re.compile(r"\b(crear|borrar|eliminar|gestionar|cerrar|abrir|cambiar)\s+(la\s+|las\s+)?cuentas?\b|\bcuentas?\s+(de\s+alex|de\s+usuario|bancarias?|de\s+pago)\b")
CRITICAS = ("src/lib/nucleo", "identidad", "cuentas", "permisos", "sharing/access", "gobernanza", "voto", "claves", "seguridad", "supabase/migrations", ".github/", "scripts/puente/autopublicar.py", "scripts/puente/publicar.py", "scripts/puente/instalar-servicios.py")
def _norm(v):
    t = unicodedata.normalize("NFKD", str(v or "").lower())
    return "".join(c for c in t if not unicodedata.combining(c))
def _texto(p): return _norm(f"{p.get('titulo', '')} {p.get('cuerpo', '')}")
def _archivos(p):
    b = p.get("archivos") or []
    return [str(a) for a in ([b] if isinstance(b, str) else b) if a]
def _existe(fn, r):
    try: return bool(fn(str(r)))
    except Exception: return False
def _num(v):
    try: return float(v)
    except (TypeError, ValueError): return None
def _vigente(p, existe):
    cita = p.get("cita") or p.get("vigencia")
    if not cita: return True, ""
    rutas = [cita] if isinstance(cita, str) else list(cita)
    ok = bool(rutas) and all(_existe(existe, r) for r in rutas)
    return (True, "") if ok else (False, "ya no aplica: la cita no sigue en el código")
def es_accionable(p: Dict, existe: Existe) -> Tuple[bool, str]:
    texto = _texto(p)
    for tema in RESERVADOS:
        if tema in texto: return False, f"no accionable por el enjambre ({tema}): es de Alex → pregunta"
    if CUENTAS.search(texto): return False, "no accionable por el enjambre (cuentas): es de Alex → pregunta"
    accion = _norm(p.get("accion"))
    if accion not in VERBOS and not any(re.search(rf"\b{v}\b", texto) for v in VERBOS):
        return False, "sin verbo de acción: no es una tarea de código → pregunta"
    archivos = _archivos(p); existentes = [a for a in archivos if _existe(existe, a)]
    if not existentes: return False, "ninguno de los archivos citados existe hoy → pregunta"
    return True, f"accionable: {len(existentes)} de {len(archivos)} archivo(s) citados existen"
def _verificacion(p):
    b = p.get("verificacion", p.get("verificado"))
    if b is True: return 1.0
    if b is False: return 0.4
    t = _norm(b)
    return next((v for k, v in VERIFICACION.items() if t == k or t.startswith(k)), 0.6)
def _impacto(p):
    i, e = _num(p.get("impacto")), _num(p.get("esfuerzo"))
    if i is None or e is None or e <= 0: return 1.0, ""
    return max(0.0, min(1.0, i / e)), f"impacto/esfuerzo {i:g}/{e:g}"
def _consejo(p, consejo, valor, motivo):
    if consejo is None: return valor, motivo
    try: aviso = consejo(p)
    except Exception: return valor, motivo
    if not isinstance(aviso, dict): return valor, motivo
    prob = _num(aviso.get("p", aviso.get("prob")))
    if prob is None or prob < 0.8: return valor, motivo
    nota = f"{motivo}; jev: p={prob:g}"
    if aviso.get("veta") or aviso.get("veto") or aviso.get("accion") == "veta": return 0.0, f"{nota}; Jev veta"
    d = _norm(aviso.get("prioridad") or aviso.get("ajuste"))
    delta = {"subir": .1, "alta": .1, "sube": .1, "subir prioridad": .1, "bajar": -.1, "baja": -.1, "baja prioridad": -.1}.get(d)
    if delta: return max(0.0, min(1.0, valor + delta)), f"{nota}; Jev {'sube' if delta > 0 else 'baja'} prioridad"
    return valor, nota
def utilidad(p, existe, consejo: Optional[Callable] = None):
    """Utilidad 0–1 y su motivo; 0 si no es accionable, no vigente o Jev la veta."""
    ok, motivo = es_accionable(p, existe)
    if not ok: return 0.0, motivo
    vigente, motivo_vigencia = _vigente(p, existe)
    if not vigente: return 0.0, motivo_vigencia
    factor, nota = _impacto(p); ver = _verificacion(p)
    motivo = f"{motivo}; verificación {ver:g}" + (f"; {nota}" if nota else "")
    valor, motivo = _consejo(p, consejo, factor * ver, motivo)
    return round(max(0.0, min(1.0, valor)), 4), motivo
def cuantas(utiles, rango):
    """Utilidad ≥ 0,6, ordenadas y cortadas en rango.max; el mínimo no se rellena."""
    par = isinstance(rango, (list, tuple)) and len(rango) == 2
    maximo = rango.get("max", len(utiles)) if isinstance(rango, dict) else (rango[1] if par else rango)
    minimo = rango.get("min", 0) if isinstance(rango, dict) else (rango[0] if par else 0)
    maximo = max(0, int(len(utiles) if maximo is None else maximo)); minimo = max(0, int(minimo or 0))
    buenas = [p for p in utiles if _num(p.get("utilidad")) is not None and float(p["utilidad"]) >= UMBRAL_UTIL]
    buenas.sort(key=lambda p: (-float(p["utilidad"]), str(p.get("id", ""))))
    elegidas = buenas[:maximo]
    if not buenas: motivo = "ninguna propuesta alcanza utilidad ≥ 0,6; no se encarga nada"
    else:
        motivo = f"{len(buenas)} propuesta(s) útil(es); se encargan {len(elegidas)} (máximo {maximo})"
        if len(elegidas) < minimo: motivo += f"; el mínimo {minimo} no se rellena con inútiles"
    return {"elegidas": elegidas, "utilidad_minima": UMBRAL_UTIL, "motivo": motivo}
def _es_critica(r): return any(c in _norm(r).replace("\\", "/") for c in CRITICAS)
def _es_enrutador_ia(r):
    r = _norm(r).replace("\\", "/")
    return ("enrutador" in r or "router" in r) and ("/ai/" in r or r.startswith("src/ai") or "astraura" in r or "modelo" in r)
def importancia(p):
    """Crítica (núcleo e intocable), alta (>3 archivos, borra, cuentas, router IA) o menor."""
    archivos = _archivos(p); texto = _texto(p)
    if any(_es_critica(a) for a in archivos): return "critica"
    borra = bool(p.get("borra")) or bool(re.search(r"\b(borrar|borra|eliminar|elimina|quitar|quita)\b", texto))
    todas = bool(p.get("valores_por_defecto") or p.get("afecta_todas_las_cuentas")) or "todas las cuentas" in texto
    if len(archivos) > 3 or borra or todas or p.get("enrutador_ia") or "enrutador de ia" in texto or "router de ia" in texto or any(_es_enrutador_ia(a) for a in archivos): return "alta"
    if len(archivos) >= 2 or any(a.replace("\\", "/").startswith(("src/", "scripts/puente/")) for a in archivos): return "media"
    return "baja"
def _es_codigo(p, existe):
    if "accionable" in p: return bool(p.get("accionable"))
    if p.get("es_codigo") is not None: return bool(p.get("es_codigo"))
    return es_accionable(p, existe if existe is not None else (lambda r: True))[0]
def destino(p, automatico, existe=None):
    """Destino y si hace falta ver el diff; lo que no es código va a «pregunta»."""
    imp = importancia(p); diff = imp == "critica"
    if not automatico:
        return {"destino": "esperando-aprobacion", "aprobacion_diff": diff, "motivo": "automático apagado: todo espera tu visto bueno"}
    if not _es_codigo(p, existe):
        return {"destino": "pregunta", "aprobacion_diff": False, "motivo": "no es código: lo decide Alex"}
    if imp in ("baja", "media"):
        return {"destino": "autodesarrollo", "aprobacion_diff": False, "motivo": f"utilidad accionable e importancia {imp}"}
    motivo = f"importancia {imp}: siempre con tu visto bueno" + (" y diff antes de integrar" if diff else "")
    return {"destino": "esperando-aprobacion", "aprobacion_diff": diff, "motivo": motivo}
