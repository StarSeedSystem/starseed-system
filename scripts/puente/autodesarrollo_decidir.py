#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decisión pura del autodesarrollo (Ola 1021I, §5.3–§5.6): utilidad, cuántas,
importancia y destino; y el automático de la Ola 1024I (§3: integrar solo, reimaginar
solo o dejar en la lista manual). Sin red, sin disco y sin reloj: el mundo entra por
`existe(ruta)` y Jev por `consejo(p)`; Jev solo veta o ajusta con p ≥ 0,8 y NUNCA
convierte un «no» de la regla en un «sí». La cita que ya no está vale 0 («ya no aplica»).
Alta y crítica jamás se integran solas: ningún ajuste ni consejo lo cambia.
Ola 1025S (IMG1025A): el automático decide también las creaciones de Astraura y lo que no es código
(utilidad por sustancia, `utilidad_propuesta`), descarta duplicadas y reparte las reimaginaciones."""
from __future__ import annotations
import json, re, unicodedata
from typing import Callable, Dict, Optional, Tuple
Existe = Callable[[str], bool]; UMBRAL_UTIL = 0.6
VERIFICACION = {"verificado": 1.0, "ajustado": 0.8, "sin verificar": 0.4, "sin dato": 0.6}
VERBOS = ("anadir", "agregar", "crear", "implementar", "arreglar", "corregir", "migrar", "renombrar", "eliminar", "borrar", "quitar", "documentar", "actualizar", "cablear", "optimizar", "proteger", "validar", "sincronizar", "unificar", "ajustar", "mejorar", "integrar", "evitar", "exportar", "importar", "depurar", "medir", "cambiar", "aplicar", "normalizar", "programar", "revisar", "comprobar", "verificar", "probar")
RESERVADOS = ("publicar", "publicacion", "desplegar", "deploy", "vercel", "comprar", "compra", "pagar", "pago", "suscripcion", "contrasena", "clave", "credencial", "decision de alex", "decide alex", "que alex decida", "preguntar a alex", "avisar a alex", "eleccion de alex")
CUENTAS = re.compile(r"\b(crear|borrar|eliminar|gestionar|cerrar|abrir|cambiar)\s+(la\s+|las\s+)?cuentas?\b|\bcuentas?\s+(de\s+alex|de\s+usuario|bancarias?|de\s+pago)\b")
#: Tipos de acceso abierto que, enumerados junto a «pago», describen un sitio y NO son una decisión de Alex
#: (Ola 1029A · IMG1029A): «acceso (libre, registro, pago)» no es «hay que pagar».
ACCESO_ABIERTO = ("libre", "gratis", "abierto", "registro")
_ENUM_ACCESO = re.compile(r"\b(?:libre|gratis|abierto|registro)\b(?:\s*(?:,|/|\bo\b)\s*(?:con\s+)?"
                          r"(?:libre|gratis|abierto|registro|coste|pago\b(?!\s+(?:de|del|por|para)\b)))+")
#: Credenciales escritas de cualquier forma (también dentro de un nombre de archivo: «r2_credentials.json»).
SECRETOS = re.compile(r"credencial|credential|password|passwd|contrasena|api[_-]?key|private[_-]?key"
                      # «token» solo como credencial (Ola 1025S): «quitar ese token del sandbox» o «tokens del modelo»
                      # no son de Alex; «token de acceso», «API token», «GITHUB_TOKEN» o «bearer» sí.
                      r"|\b(?:access|api|auth|bearer|refresh|personal|secret)[ _-]?tokens?\b|\b[a-z0-9]+_tokens?\b"
                      r"|\btokens?\s+(?:de|del)\s+(?:acceso|api|autenticacion|github|vercel|supabase|cuenta|sesion|usuario)\b"
                      r"|\bbearer\b")
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
def _sin_tipos_de_acceso(texto):
    """Quita las enumeraciones de tipos de acceso («libre, registro, pago»): describen un sitio, no una tarea.
    «pagar», «comprar», «suscripción» y «pago de…» se quedan: esos sí los decide Alex."""
    def _fuera(m):
        dentro = m.group(0)
        if re.search(r"\bpago\s+(?:de|del|por|para)\b", dentro): return dentro
        tiene_pago = re.search(r"\bpago\b", dentro)
        tiene_abierto = any(re.search(rf"\b{t}\b", dentro) for t in ACCESO_ABIERTO)
        return "" if tiene_pago and tiene_abierto else dentro
    return _ENUM_ACCESO.sub(_fuera, re.sub(r"\([^()]*\)", _fuera, texto))
def es_de_alex(p: Dict) -> str:
    """El motivo si toca algo que solo decide Alex (publicar, pagar, cuentas, claves…); "" si no."""
    texto = _sin_tipos_de_acceso(_texto(p))
    for tema in RESERVADOS:
        if re.search(rf"\b{tema}\b", texto): return f"no accionable por el enjambre ({tema}): es de Alex → pregunta"
    if CUENTAS.search(texto): return "no accionable por el enjambre (cuentas): es de Alex → pregunta"
    if SECRETOS.search(texto): return "no accionable por el enjambre (credenciales): es de Alex → pregunta"
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
def nivel_astraura(v):
    """El `importance_level` del backend 1.58 (low · medium · high · critical_security) → nuestro nivel."""
    t = _norm(v).strip()
    return "critica" if t.startswith(("critical", "critica")) else nivel(t)
def importancia_declarada(p):
    """La que declara quien propone: `importancia_declarada` y, en Astraura, su `origen.importance_level`
    (Ola 1025S: una creación que Astraura marca «critical_security» no es «baja» por no citar archivos)."""
    niveles = [nivel(p.get("importancia_declarada"))]
    o = p.get("origen") if isinstance(p.get("origen"), dict) else {}
    if p.get("fuente") == "astraura": niveles.append(nivel_astraura(o.get("importance_level")))
    niveles = [n for n in niveles if n]
    return max(niveles, key=NIVELES.index) if niveles else ""
def importancia(p):
    """La de la regla o la que declare quien propone, la MAYOR: declarar «baja» no rebaja nada."""
    regla, declarada = _importancia_regla(p), importancia_declarada(p)
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

# ─────────────── el automático (Ola 1024I · IMG1024C, contrato §3; Ola 1025S · IMG1025A) ───────────────
#: Las fuentes que decide el automático. Desde la Ola 1025S también Astraura (sus creaciones y ramas se
#: aplican en su backend 1.58); las preguntas de los directores siguen siendo decisiones de Alex.
FUENTES_AUTO = ("diaria", "profunda", "agentes", "astraura")
#: Lo que se puede reimaginar solo: desde la Ola 1025S, cualquier tipo (el analista reimagina en modo
#: libre). Lo de Astraura no: vive en su backend y una versión de la flota no se puede aplicar allí.
TIPOS_REIMAGINABLES = ("codigo", "diseno", "contenido", "investigacion", "otro")
#: Lo que, si no es una tarea de código accionable, se integra como ENTREGABLE (el analista en modo libre).
TIPOS_ENTREGABLE = ("diseno", "contenido", "investigacion", "otro")
#: Por dónde se integra una propuesta aprobada: cola de código, backend de Astraura o entregable libre.
VIAS = ("codigo", "astraura", "entregable")
#: Lo que espera una decisión (para las duplicadas): nunca lo que ya decidió Alex ni lo que está en vuelo.
PENDIENTES = ("nueva", "pregunta", "esperando-aprobacion", "autodesarrollo")
#: Versión de las reglas: entra en la firma, así lo pendiente se vuelve a decidir cuando cambian.
#: Ola 1029A · IMG1029A: sube para que las preguntas viejas por «(libre, registro, pago)» se decidan otra vez
#: sin tocar `director_autodesarrollo.py` (allí `auto_firma != firma` las vuelve a evaluar).
REGLAS = "1029A"
#: Reimaginaciones nuevas del automático por ciclo (el director corre cada 15 min) y en vuelo a la vez:
#: así 230 propuestas no salen de golpe hacia los modelos gratuitos. Lo de Alex no cuenta: se hace siempre.
TOPE_POR_CICLO, MAX_EN_VUELO = 12, 24
MAX_NOTAS = 2000
#: Variantes de una misma familia (la misma idea repetida por archivo) que se guardan en la primera.
MAX_VARIANTES = 20
#: Sustancia de lo que no es código: caracteres útiles, elementos de estructura y referencias https
#: con los que la medida llega a 1 (pesos 0,5 · 0,25 · 0,25).
LARGO_PLENO, ESTRUCTURA_PLENA, REFERENCIAS_PLENAS = 1500, 6, 3
NOMBRES_JSON = ("agent", "agente", "name", "nombre", "title", "titulo")
CAPACIDADES_JSON = ("capabilities", "capacidades", "skills", "habilidades", "tools", "herramientas", "functions", "funciones")
def _auto(ajustes):
    a = (ajustes or {}).get("auto") if isinstance(ajustes, dict) else None
    return a if isinstance(a, dict) else {}
def umbral_efectivo(ajustes):
    """El del automático si «aprobar» está encendido (nunca < 0,6); si no, el 0,6 de siempre."""
    a = _auto(ajustes)
    return max(UMBRAL_UTIL, _num(a.get("umbral")) or 0.0) if a.get("aprobar") else UMBRAL_UTIL
def firma(ajustes):
    """Huella de los ajustes (y de la versión de las reglas) que deciden el automático: si cambia, lo
    pendiente se vuelve a mirar."""
    a = _auto(ajustes)
    return "%s|%d|%d|%d|%s|%s" % (REGLAS, bool((ajustes or {}).get("automatico")), bool(a.get("aprobar")), bool(a.get("reimaginar")),
                                  _coma(umbral_efectivo(ajustes)), int(_num(a.get("max_reimaginaciones")) or 0))
def version(p):
    v = p.get("version")
    return v if isinstance(v, int) and not isinstance(v, bool) and v >= 1 else 1
def reimaginaciones_libres(p, maximo):
    """Las que le quedan a la cadena: la v1 es la original, cada versión nueva gasta una."""
    return max(0, int(_num(maximo) or 0) - (version(p) - 1))

# ── por dónde se integra y cuánto vale lo que no es código (Ola 1025S) ──
def via(p, existe=None):
    """codigo (tarea accionable para el enjambre) · astraura (se aplica en su backend) · entregable (lo que no es
    código: diseño, contenido, investigación u otro; lo produce el analista en modo libre). Un «codigo» que no
    es accionable sigue siendo código: se reimagina para que lo sea, nunca se convierte en un ensayo."""
    if p.get("fuente") == "astraura": return "astraura"
    if _es_codigo(p, existe): return "codigo"
    return "entregable" if (p.get("tipo") or "codigo") in TIPOS_ENTREGABLE else "codigo"
_COMENTARIO = re.compile(r"/\*.*?\*/|<!--.*?-->|(?:^|(?<=\s))//[^\n]*", re.S | re.M)
_URL_HTTPS = re.compile(r"https://[^\s)\]>\"'`]+")
def _texto_util(cuerpo):
    """El cuerpo sin comentarios de código ni cuerpos vacíos `{ }`: un esqueleto de función no es sustancia."""
    t = _COMENTARIO.sub(" ", str(cuerpo or ""))
    t = re.sub(r"\{\s*\}", " ", t)
    return re.sub(r"\s+", " ", t).strip()
def medir_sustancia(p):
    """{caracteres, estructura, referencias}: caracteres útiles del cuerpo, elementos de estructura Markdown
    (títulos, puntos de lista, filas de tabla y párrafos de ≥ 40 caracteres) y referencias https distintas
    (las de `referencias` y las del texto). PURA."""
    cuerpo = str(p.get("cuerpo") or "")
    if cuerpo.strip() == str(p.get("titulo") or "").strip(): cuerpo = ""
    lineas = cuerpo.splitlines()
    titulos = sum(1 for x in lineas if re.match(r"^\s{0,3}#{1,6}\s+\S", x))
    puntos = sum(1 for x in lineas if re.match(r"^\s*(?:[-*+]|\d+[.)])\s+\S", x))
    tabla = sum(1 for x in lineas if re.match(r"^\s*\|.*\|\s*$", x) and not re.match(r"^\s*\|[\s:|-]+\|\s*$", x))
    parrafos = sum(1 for b in re.split(r"\n\s*\n", _COMENTARIO.sub(" ", cuerpo)) if len(_texto_util(b)) >= 40)
    refs = {str(r.get("url")) for r in (p.get("referencias") or []) if isinstance(r, dict) and str(r.get("url") or "").startswith("https://")}
    refs |= {u.rstrip(".,;:") for u in _URL_HTTPS.findall(cuerpo)}
    return {"caracteres": len(_texto_util(cuerpo)), "estructura": titulos + puntos + tabla + parrafos, "referencias": len(refs)}
def _valor_sustancia(m):
    return round(0.5 * min(1.0, m["caracteres"] / LARGO_PLENO) + 0.25 * min(1.0, m["estructura"] / ESTRUCTURA_PLENA)
                 + 0.25 * min(1.0, m["referencias"] / REFERENCIAS_PLENAS), 4)
def _frena(p, consejo, valor, motivo):
    """Jev de consejero: solo FRENA (veta → 0, «bajar» → −0,1) y solo con p ≥ 0,8; nunca sube nada."""
    if consejo is None: return valor, motivo
    try: aviso = consejo(p)
    except Exception: return valor, motivo
    if not isinstance(aviso, dict): return valor, motivo
    prob = _num(aviso.get("p", aviso.get("prob")))
    if prob is None or prob < 0.8: return valor, motivo
    nota = f"{motivo}; jev: p={prob:g}"
    if aviso.get("veta") or aviso.get("veto") or aviso.get("accion") == "veta": return 0.0, f"{nota}; Jev veta"
    if _norm(aviso.get("prioridad") or aviso.get("ajuste")) in ("bajar", "baja", "baja prioridad"):
        return max(0.0, round(valor - 0.1, 4)), f"{nota}; Jev baja prioridad"
    return valor, nota
def utilidad_libre(p, consejo=None):
    """Utilidad 0–1 de lo que no es código (contenido, diseño, investigación): sustancia = 0,5 × longitud útil
    (1500 caracteres = 1) + 0,25 × estructura (6 elementos = 1) + 0,25 × referencias https (3 = 1). PURA y
    determinista; Jev solo puede frenarla."""
    m = medir_sustancia(p)
    motivo = "sustancia: %d caracteres útiles, %d elemento(s) de estructura, %d referencia(s) https" % (m["caracteres"], m["estructura"], m["referencias"])
    if not m["caracteres"]: return _frena(p, consejo, 0.0, "vacía: solo trae el título")
    return _frena(p, consejo, _valor_sustancia(m), motivo)
def _sustancial(v):
    if isinstance(v, bool) or v is None: return False
    if isinstance(v, (int, float)): return True
    if isinstance(v, str): return len(v.strip()) >= 3 and _norm(v).strip() not in ("todo", "tbd", "n/a", "none", "null", "...")
    if isinstance(v, (list, tuple)): return any(_sustancial(x) for x in v)
    if isinstance(v, dict): return any(_sustancial(x) for x in v.values())
    return False
def utilidad_astraura(p, consejo=None):
    """Utilidad 0–1 de una creación (o rama) de Astraura. JSON válido con nombre y capacidades → 0,9; con ≥ 3
    campos sustanciales → 0,8; con 1–2 → 0,4; vacío → 0,05; roto → 0,1. En texto, la sustancia de
    `utilidad_libre` (un esqueleto de código con la función vacía vale casi 0). PURA; Jev solo frena."""
    cuerpo = str(p.get("cuerpo") or "").strip()
    if not cuerpo or cuerpo == str(p.get("titulo") or "").strip():
        return _frena(p, consejo, 0.05, "creación de Astraura vacía: solo trae el título")
    if cuerpo[0] not in "{[":
        valor, motivo = utilidad_libre(p)
        return _frena(p, consejo, valor, "creación de Astraura en texto · " + motivo)
    try: obj = json.loads(cuerpo)
    except ValueError: return _frena(p, consejo, 0.1, "creación de Astraura con el JSON roto")
    if isinstance(obj, dict):
        campos = [k for k, v in obj.items() if _sustancial(v)]
        nombre = any(isinstance(obj.get(k), str) and _sustancial(obj.get(k)) for k in NOMBRES_JSON)
        capacidades = any(isinstance(obj.get(k), (list, dict)) and _sustancial(obj.get(k)) for k in CAPACIDADES_JSON)
        if nombre and capacidades: valor, motivo = 0.9, "JSON válido con nombre y capacidades (%d campos sustanciales)" % len(campos)
        elif len(campos) >= 3: valor, motivo = 0.8, "JSON válido con %d campos sustanciales" % len(campos)
        elif campos: valor, motivo = 0.4, "JSON válido con solo %d campo(s) sustancial(es)" % len(campos)
        else: valor, motivo = 0.05, "JSON vacío"
    elif isinstance(obj, list):
        n = sum(1 for x in obj if _sustancial(x))
        valor, motivo = (0.6, "lista JSON de %d elementos" % n) if n >= 3 else ((0.3, "lista JSON de %d elemento(s)" % n) if n else (0.05, "lista JSON vacía"))
    else: valor, motivo = 0.1, "JSON sin estructura"
    return _frena(p, consejo, valor, "creación de Astraura: " + motivo)
def utilidad_propuesta(p, existe, consejo=None):
    """La utilidad que usa el director (Ola 1025S): la de código (`utilidad`) para lo que va a la cola de código;
    la de Astraura o la de sustancia para lo demás. Lo de Alex vale 0, venga por donde venga."""
    camino = via(p, existe)
    if camino == "codigo": return utilidad(p, existe, consejo)
    alex = es_de_alex(p)
    if alex: return 0.0, alex
    return utilidad_astraura(p, consejo) if camino == "astraura" else utilidad_libre(p, consejo)
def ya_autorizada_por_astraura(p):
    """Una rama que el orquestador de Astraura ya autorizó y ejecuta (`requires_user_approval: false` y estado
    que no es «pending_approval»): Astraura no pide nada, así que no hay nada que decidir aquí."""
    o = p.get("origen") if isinstance(p.get("origen"), dict) else {}
    if p.get("fuente") != "astraura" or o.get("requires_user_approval") is not False: return False
    estado = _norm(o.get("status")).strip()
    return bool(estado) and estado not in ("pending_approval", "pending", "pendiente")

# ── duplicadas y orden ──
def titulo_normalizado(t):
    """Sin acentos, emojis ni puntuación, en minúsculas y con un espacio entre palabras."""
    return re.sub(r"[^a-z0-9]+", " ", _norm(t)).strip()
#: El nombre de archivo con el que termina un título («… para Dockerfile / IDEA.md / setup.sh»).
_ARCHIVO_FINAL = re.compile(r"(?:^|\s)(?:[A-Za-z0-9_.\-/]+\.(?:tsx?|jsx?|py|mjs|cjs|json|md|sql|ya?ml|css|scss|sh|toml|txt)|Dockerfile|Makefile|Procfile|Vagrantfile|Justfile|Rakefile)\s*$", re.I)
def familia(p):
    """La misma idea sin el nombre de archivo final: «Optimización ARM NEON para X» → «optimización arm neon para».
    Así las copias que solo cambian el archivo se deciden una sola vez. PURA."""
    t = str(p.get("titulo") or "")
    m = _ARCHIVO_FINAL.search(t)
    if m: t = t[:m.start()]
    return re.sub(r"\s+", " ", _norm(t)).strip()
def agrupar(propuestas):
    """[(secundaria, primaria)] de la misma fuente y familia que esperan una decisión: la primera es la
    primaria y las demás no crean otra. PURA (el director es quien marca «agrupada» y guarda las variantes)."""
    primarias, fuera = {}, []
    for p in propuestas:
        if not isinstance(p, dict) or (p.get("estado") or "nueva") not in PENDIENTES: continue
        if p.get("fuente") not in FUENTES_AUTO: continue  # lo de Alex (directores) no se agrupa solo
        fam = familia(p)
        if not fam: continue
        clave = (p.get("fuente"), fam)
        if clave not in primarias: primarias[clave] = p
        else: fuera.append((p, primarias[clave]))
    return fuera
def arreglo_de_estado(p):
    """El cambio para que el estado y el motivo no se contradigan. Una «descartada» con un motivo de
    «pregunta» no es descartada por duplicada ni por Astraura: se devuelve a «pregunta». PURA."""
    if p.get("estado") != "descartada" or "pregunta" not in _norm(p.get("motivo")): return {}
    if p.get("duplicada_de"):
        razon = f"duplicada de {p['duplicada_de']}"
        return {"motivo": razon, "motivo_destino": p.get("motivo_destino") or razon}
    if ya_autorizada_por_astraura(p):
        razon = "Astraura ya la autorizó y la ejecuta sola (no pide tu aprobación): no hay nada que decidir"
        return {"motivo": razon, "motivo_destino": p.get("motivo_destino") or razon}
    destino = str(p.get("motivo_destino") or "")
    if destino and "pregunta" not in _norm(destino): return {"motivo": destino}
    return {"estado": "pregunta", "motivo_destino": "la automática no la puede hacer: la decides tú"}
def reciente(p):
    """Clave «más reciente»: la fecha de su origen, los números de su id (las marcas de tiempo de Astraura,
    la fecha de un agente) y su instante. Mayor = más reciente."""
    o = p.get("origen") if isinstance(p.get("origen"), dict) else {}
    return (str(o.get("fecha") or ""), tuple(int(x) for x in re.findall(r"\d+", str(p.get("id") or ""))[:8]),
            str(p.get("t") or ""), str(p.get("id") or ""))
def duplicadas(propuestas):
    """[(duplicada, id de la que se queda)]. Entre las PENDIENTES de una misma fuente automática y ámbito con el
    mismo título normalizado se queda la más reciente; las demás se descartan (y se pueden rescatar). PURA."""
    grupos = {}
    for p in propuestas:
        if not isinstance(p, dict) or (p.get("estado") or "nueva") not in PENDIENTES or p.get("fuente") not in FUENTES_AUTO: continue
        t = titulo_normalizado(p.get("titulo"))
        if t: grupos.setdefault((p.get("fuente"), p.get("ambito") or "metagenesis", t), []).append(p)
    fuera = []
    for g in grupos.values():
        if len(g) > 1:
            g = sorted(g, key=reciente, reverse=True)
            fuera += [(p, g[0].get("id")) for p in g[1:]]
    return fuera
def orden_reimaginar(propuestas):
    """Primero la más importante y, dentro, la más reciente (el tope por ciclo corta por aquí). PURA."""
    return sorted(propuestas, key=lambda p: (NIVELES.index(importancia(p)), reciente(p)), reverse=True)

def critica(p, umbral, existe=None):
    """Las notas de una reimaginación automática: por qué no llegó y qué la haría llegar (≤ 2000). Lo que no
    es código se juzga por su sustancia; el código, por lo que lo hace accionable."""
    u = _num(p.get("utilidad")) or 0.0
    partes = [f"No llegó a integrarse sola: utilidad {_coma(round(u, 2))} < umbral {_coma(umbral)}."]
    if p.get("motivo"): partes.append(f"Motivo de la regla: {str(p['motivo'])[:400]}.")
    if via(p, existe) == "entregable":
        m = medir_sustancia(p)
        if m["caracteres"] < LARGO_PLENO: partes.append(f"Desarróllala hasta un entregable completo (hoy {m['caracteres']} caracteres útiles; ≈ {LARGO_PLENO} o más, sin relleno).")
        if m["estructura"] < ESTRUCTURA_PLENA: partes.append("Dale estructura: secciones con título, listas y párrafos claros.")
        if m["referencias"] < REFERENCIAS_PLENAS: partes.append(f"Apóyala en referencias https verificables (hoy {m['referencias']}; al menos {REFERENCIAS_PLENAS}), nunca inventadas.")
        partes.append(f"Conserva la intención, el tipo «{p.get('tipo') or 'otro'}» y las referencias útiles; no inventes datos ni citas.")
        return " ".join(partes)[:MAX_NOTAS]
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
def _origen_importancia(p):
    o = p.get("origen") if isinstance(p.get("origen"), dict) else {}
    return f" (Astraura la marca «{o['importance_level']}»)" if p.get("fuente") == "astraura" and o.get("importance_level") else ""
def automatica(p, ajustes, existe=None, consejo=None):
    """Destino de una propuesta con los ajustes completos (`validar_ajustes`). Devuelve {destino, aprobacion_diff,
    motivo, notas}: autodesarrollo (código que se integra solo) · aprobada (lo que no es código y se integra solo:
    en Astraura o como entregable) · reimaginando (`notas` = la crítica) · descartada (Astraura ya la autorizó) ·
    nueva / esperando-aprobacion / pregunta (lista manual). Con el automático entero apagado es `destino(p, False)`;
    alta y crítica NUNCA se integran ni se reimaginan solas, y lo de Alex nunca se toca solo."""
    a, aj = _auto(ajustes), ajustes if isinstance(ajustes, dict) else {}
    integra = bool(aj.get("automatico")) or bool(a.get("aprobar"))
    reimagina, boton = bool(a.get("reimaginar")), bool(a.get("aprobar")) or bool(a.get("reimaginar"))
    imp = importancia(p); base = dict(destino(p, integra, existe), notas="")
    camino = via(p, existe)
    # Lo que no es código solo lo decide el botón de la Ola 1024I, nunca el «automático» viejo de la 1021I.
    if p.get("fuente") not in FUENTES_AUTO or not (integra or reimagina) or (camino != "codigo" and not boton):
        return base
    def manual(d, motivo): return {"destino": d, "aprobacion_diff": False, "motivo": motivo, "notas": ""}
    alex = es_de_alex(p)
    if alex: return dict(base, motivo=alex.replace(" → pregunta", "") + ": la decides tú")
    if camino == "astraura" and ya_autorizada_por_astraura(p):
        return manual("descartada", "Astraura ya la autorizó y la ejecuta sola (no pide tu aprobación): no hay nada que decidir")
    if imp in ("alta", "critica"):
        if camino == "codigo": return base
        return manual("esperando-aprobacion", f"importancia {importancia_visible(imp)}{_origen_importancia(p)}: siempre con tu visto bueno")
    amb = p.get("ambito") or "metagenesis"
    if amb != "metagenesis": return manual("nueva", f"ámbito {amb}: lo decide su dueño, no el automático de MetaGenesis")
    umbral, u = umbral_efectivo(aj), _num(p.get("utilidad")) or 0.0
    aprueba = integra if camino == "codigo" else bool(a.get("aprobar"))
    if aprueba and u >= umbral:
        vetada, nota = veto_jev(p, consejo)
        if vetada: return manual("nueva", f"Jev veta la integración automática ({nota}): queda en tu lista")
        cola = f"utilidad {_coma(round(u, 2))} ≥ umbral {_coma(umbral)} e importancia {imp}: se integra sola"
        extra = f" ({nota})" if nota else ""
        if camino == "codigo": return {"destino": "autodesarrollo", "aprobacion_diff": False, "notas": "", "motivo": cola + extra}
        donde = "se aplica en Astraura" if camino == "astraura" else "la flota prepara el entregable"
        return manual("aprobada", f"{cola} ({donde}){extra}")
    quedan = reimaginaciones_libres(p, a.get("max_reimaginaciones"))
    tipo = p.get("tipo") or "codigo"
    if reimagina and u < umbral and quedan > 0 and camino != "astraura" and tipo in TIPOS_REIMAGINABLES:
        return {"destino": "reimaginando", "aprobacion_diff": False, "notas": critica(p, umbral, existe),
                "motivo": f"no llega al umbral {_coma(umbral)}: se reimagina sola (le quedan {quedan})"}
    if camino == "codigo":
        if not integra or not _es_codigo(p, existe): return base
        sin = "; sin reimaginaciones libres" if reimagina and quedan <= 0 else ""
        return manual("nueva", f"utilidad {_coma(round(u, 2))} < umbral {_coma(umbral)}{sin}: queda en tu lista")
    if u >= umbral: return manual("esperando-aprobacion", f"utilidad {_coma(round(u, 2))} ≥ umbral pero la aprobación automática está apagada: espera tu visto bueno")
    if camino == "astraura":
        return manual("nueva", f"utilidad {_coma(round(u, 2))} < umbral {_coma(umbral)}: queda en tu lista (la rehace Astraura, no la flota)")
    sin = "; sin reimaginaciones libres" if reimagina and quedan <= 0 else ""
    return manual("nueva", f"utilidad {_coma(round(u, 2))} < umbral {_coma(umbral)}{sin}: queda en tu lista")
