#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decisión pura del autodesarrollo (Ola 1021I, §5.3–§5.6): utilidad, cuántas,
importancia y destino; y el automático de la Ola 1024I (§3: integrar solo, reimaginar
solo o dejar en la lista manual). Sin red, sin disco y sin reloj: el mundo entra por
`existe(ruta)` y Jev por `consejo(p)`; Jev solo veta o ajusta con p ≥ 0,8 y NUNCA
convierte un «no» de la regla en un «sí». La cita que ya no está vale 0 («ya no aplica»).
Alta y crítica jamás se integran solas: ningún ajuste ni consejo lo cambia."""
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
def es_de_alex(p: Dict) -> str:
    """El motivo si toca algo que solo decide Alex (publicar, pagar, cuentas, claves…); "" si no."""
    texto = _texto(p)
    for tema in RESERVADOS:
        if re.search(rf"\b{tema}\b", texto): return f"no accionable por el enjambre ({tema}): es de Alex → pregunta"
    if CUENTAS.search(texto): return "no accionable por el enjambre (cuentas): es de Alex → pregunta"
    return ""
def es_accionable(p: Dict, existe: Existe) -> Tuple[bool, str]:
    texto = _texto(p); de_alex = es_de_alex(p)
    if de_alex: return False, de_alex
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
def _coma(x): return f"{float(x):g}".replace(".", ",")
def cuantas(utiles, rango, umbral=UMBRAL_UTIL):
    """Utilidad ≥ umbral (0,6 o el del automático), ordenadas y cortadas en rango.max; el mínimo no se rellena."""
    par = isinstance(rango, (list, tuple)) and len(rango) == 2
    maximo = rango.get("max", len(utiles)) if isinstance(rango, dict) else (rango[1] if par else rango)
    minimo = rango.get("min", 0) if isinstance(rango, dict) else (rango[0] if par else 0)
    maximo = max(0, int(len(utiles) if maximo is None else maximo)); minimo = max(0, int(minimo or 0))
    umbral = max(UMBRAL_UTIL, _num(umbral) or 0.0)
    buenas = [p for p in utiles if _num(p.get("utilidad")) is not None and float(p["utilidad"]) >= umbral]
    buenas.sort(key=lambda p: (-float(p["utilidad"]), str(p.get("id", ""))))
    elegidas = buenas[:maximo]
    if not buenas: motivo = f"ninguna propuesta alcanza utilidad ≥ {_coma(umbral)}; no se encarga nada"
    else:
        motivo = f"{len(buenas)} propuesta(s) útil(es); se encargan {len(elegidas)} (máximo {maximo})"
        if len(elegidas) < minimo: motivo += f"; el mínimo {minimo} no se rellena con inútiles"
    return {"elegidas": elegidas, "utilidad_minima": umbral, "motivo": motivo}
def _es_critica(r): return any(c in _norm(r).replace("\\", "/") for c in CRITICAS)
def _es_enrutador_ia(r):
    r = _norm(r).replace("\\", "/")
    return ("enrutador" in r or "router" in r) and ("/ai/" in r or r.startswith("src/ai") or "astraura" in r or "modelo" in r)
NIVELES = ("baja", "media", "alta", "critica")
_NIVEL = {"baja": "baja", "low": "baja", "media": "media", "medium": "media", "normal": "media",
          "alta": "alta", "high": "alta", "critica": "critica", "critical": "critica"}
def nivel(v):
    """«crítica», «critica», «critical»… → baja · media · alta · critica; "" si no se entiende."""
    return _NIVEL.get(_norm(v).strip(), "")
def importancia_visible(imp):
    """Como se guarda en propuestas.json (contrato §1, la que lee Genesis): «crítica» con acento."""
    return "crítica" if nivel(imp) == "critica" else (nivel(imp) or "media")
def importancia(p):
    """La de la regla o la que declare quien propone, la MAYOR: declarar «baja» no rebaja nada."""
    regla, declarada = _importancia_regla(p), nivel(p.get("importancia_declarada"))
    return max(regla, declarada or "baja", key=NIVELES.index)
def _importancia_regla(p):
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

# ─────────────── el automático (Ola 1024I · IMG1024C, contrato §3) ───────────────
#: Solo estas fuentes las decide el automático: las preguntas de los directores son decisiones de
#: Alex por definición y las creaciones de Astraura se aplican en su backend con su visto bueno.
FUENTES_AUTO = ("diaria", "profunda", "agentes")
#: Lo que la automática puede reimaginar sola: un contenido o una investigación no se «arregla»
#: citando archivos; eso lo reimagina Alex a mano si quiere.
TIPOS_REIMAGINABLES = ("codigo", "diseno")
MAX_NOTAS = 2000
def _auto(ajustes):
    a = (ajustes or {}).get("auto") if isinstance(ajustes, dict) else None
    return a if isinstance(a, dict) else {}
def umbral_efectivo(ajustes):
    """El del automático si «aprobar» está encendido (nunca < 0,6); si no, el 0,6 de siempre."""
    a = _auto(ajustes)
    return max(UMBRAL_UTIL, _num(a.get("umbral")) or 0.0) if a.get("aprobar") else UMBRAL_UTIL
def firma(ajustes):
    """Huella de los ajustes que deciden el automático: si cambia, lo pendiente se vuelve a mirar."""
    a = _auto(ajustes)
    return "%d|%d|%d|%s|%s" % (bool((ajustes or {}).get("automatico")), bool(a.get("aprobar")), bool(a.get("reimaginar")),
                               _coma(umbral_efectivo(ajustes)), int(_num(a.get("max_reimaginaciones")) or 0))
def version(p):
    v = p.get("version")
    return v if isinstance(v, int) and not isinstance(v, bool) and v >= 1 else 1
def reimaginaciones_libres(p, maximo):
    """Las que le quedan a la cadena: la v1 es la original, cada versión nueva gasta una."""
    return max(0, int(_num(maximo) or 0) - (version(p) - 1))
def critica(p, umbral, existe=None):
    """Las notas de una reimaginación automática: por qué no llegó y qué la haría llegar (≤ 2000)."""
    u = _num(p.get("utilidad")) or 0.0
    partes = [f"No llegó a integrarse sola: utilidad {_coma(round(u, 2))} < umbral {_coma(umbral)}."]
    if p.get("motivo"): partes.append(f"Motivo de la regla: {str(p['motivo'])[:400]}.")
    archivos = _archivos(p)
    if existe is not None and archivos:
        faltan = [a for a in archivos if not _existe(existe, a)]
        if faltan: partes.append("Archivos que no existen hoy: " + ", ".join(faltan[:10]) + ".")
    if existe is not None and not _vigente(p, existe)[0]:
        partes.append(f"La cita «{p.get('cita') or p.get('vigencia')}» ya no está en el código: búscala de nuevo o quítala.")
    if not archivos: partes.append("No cita ningún archivo del repositorio.")
    if _norm(p.get("accion")) not in VERBOS and not any(re.search(rf"\b{v}\b", _texto(p)) for v in VERBOS):
        partes.append("Le falta un verbo de acción concreto (añadir, arreglar, mejorar…).")
    factor, nota = _impacto(p)
    if nota and factor < 1: partes.append(f"Impacto/esfuerzo bajo ({nota}): acótala para que cueste menos.")
    partes.append("Hazla accionable por el enjambre: ≤ 3 archivos que existan hoy, ≤ 120 líneas por archivo, verbo de "
                  "acción y cita vigente; conserva la intención y las referencias útiles.")
    return " ".join(partes)[:MAX_NOTAS]
def veto_jev(p, consejo):
    """(vetada, nota). Jev solo frena, y solo con p ≥ 0,8; si calla o falla, manda la regla."""
    if consejo is None: return False, ""
    try: aviso = consejo(p)
    except Exception: return False, ""
    if not isinstance(aviso, dict): return False, ""
    prob = _num(aviso.get("p", aviso.get("prob")))
    if prob is None or prob < 0.8: return False, ""
    if aviso.get("veta") or aviso.get("veto") or aviso.get("accion") == "veta": return True, f"jev: p={prob:g}"
    return False, f"jev: p={prob:g}"
def automatica(p, ajustes, existe=None, consejo=None):
    """Destino de una propuesta con los ajustes completos (`validar_ajustes`). Devuelve {destino,
    aprobacion_diff, motivo, notas}: autodesarrollo (se integra sola) · reimaginando (`notas` = la
    crítica) · nueva / esperando-aprobacion / pregunta (lista manual). Con el automático entero apagado
    es `destino(p, False)`; alta y crítica salen SIEMPRE de `destino`, que nunca las integra."""
    a, aj = _auto(ajustes), ajustes if isinstance(ajustes, dict) else {}
    integra = bool(aj.get("automatico")) or bool(a.get("aprobar"))
    reimagina = bool(a.get("reimaginar"))
    imp = importancia(p); base = dict(destino(p, integra, existe), notas="")
    if imp in ("alta", "critica") or p.get("fuente") not in FUENTES_AUTO or not (integra or reimagina) or es_de_alex(p):
        return base
    def manual(d, motivo): return {"destino": d, "aprobacion_diff": False, "motivo": motivo, "notas": ""}
    amb = p.get("ambito") or "metagenesis"
    if amb != "metagenesis": return manual("nueva", f"ámbito {amb}: lo decide su dueño, no el automático de MetaGenesis")
    umbral, u = umbral_efectivo(aj), _num(p.get("utilidad")) or 0.0
    codigo = _es_codigo(p, existe)
    if integra and codigo and u >= umbral:
        vetada, nota = veto_jev(p, consejo)
        if not vetada:
            return {"destino": "autodesarrollo", "aprobacion_diff": False, "notas": "",
                    "motivo": f"utilidad {_coma(round(u, 2))} ≥ umbral {_coma(umbral)} e importancia {imp}: se integra sola" + (f" ({nota})" if nota else "")}
        return manual("nueva", f"Jev veta la integración automática ({nota}): queda en tu lista")
    quedan = reimaginaciones_libres(p, a.get("max_reimaginaciones"))
    if reimagina and u < umbral and quedan > 0 and (p.get("tipo") or "codigo") in TIPOS_REIMAGINABLES:
        return {"destino": "reimaginando", "aprobacion_diff": False, "notas": critica(p, umbral, existe),
                "motivo": f"no llega al umbral {_coma(umbral)}: se reimagina sola (le quedan {quedan})"}
    if not integra: return base
    if not codigo: return base
    sin = "; sin reimaginaciones libres" if reimagina and quedan <= 0 else ""
    return manual("nueva", f"utilidad {_coma(round(u, 2))} < umbral {_coma(umbral)}{sin}: queda en tu lista")
