#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""alcance_objetivos · almacén PRIVADO del agente de alcance (INV1025J).
Objetivos, supresión y pausas. Los archivos viven en `~/.starseed/alcance/` (carpeta 700,
archivos 600) y nunca bajo `starseed_memory_root` (R5). La supresión guarda solo hashes
SHA-256 y ningún dato sensible de personas (R1, R5, R8). `home` y el reloj se inyectan.
El disco está en `alcance_almacen`, de la misma ola.
"""
import hashlib, json, os, re, sys
from datetime import datetime, timedelta, timezone
DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
import alcance_almacen as A  # noqa: E402  (carpeta 700 / archivos 600, escritura atómica)
carpeta = A.carpeta
TIPOS = ("persona", "proyecto", "organizacion")
CATEGORIAS = ("activista", "desarrollador", "influencer", "proyecto-afin", "fundacion", "otro")
NIVELES, MEDIOS = ("alto", "medio", "bajo"), ("correo", "formulario", "github", "red")
CAMPOS = ("id", "nombre_publico", "tipo", "categoria", "nivel", "afinidad", "urls_oficiales",
          "canal_contacto", "estado", "fechas")
TOPE_DIARIO, PAUSA_ALEX, PAUSA_NO, DIAS_RECORDATORIO = 5, 90, 180, 14
TERMINOS = ("salud", "enfermedad", "diagnost", "discapac", "medicament", "alergi", "religio",
            "creencia", "iglesia", "espiritual", "orientacion sexual", "sexual", "lgbt",
            "politica", "partido ", "voto ", "familia", "hijo", "hija", "esposa", "esposo",
            "marido", "pareja", "domicilio", "casa particular", "ubicacion privada", "ingreso",
            "salario", "sueldo", "patrimonio", "telefono", "celular", "movil", "whatsapp")
CORREO = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
def validar_objetivo(obj):
    """Motivos por los que NO se guarda (lista vacía = válido). Rechaza datos sensibles (R5)."""
    if not isinstance(obj, dict):
        return ["el objetivo debe ser un objeto"]
    m = ["campo no permitido: %s" % c for c in obj if c not in CAMPOS]
    m += ["dato sensible: %s" % t for t in TERMINOS if t in json.dumps(obj, ensure_ascii=False).lower()]
    x = obj.get("canal_contacto")
    c, canal = x if isinstance(x, dict) else {}, isinstance(x, dict)
    u = obj.get("urls_oficiales")
    checks = (
        (not str(obj.get("nombre_publico") or "").strip(), "falta nombre_publico"),
        (obj.get("tipo") not in TIPOS, "tipo inválido"), (obj.get("categoria") not in CATEGORIAS, "categoria inválida"),
        (obj.get("nivel") not in (None, "") and obj.get("nivel") not in NIVELES, "nivel inválido"),
        (not isinstance(u, list) or not u or any(not str(v).startswith("https://") for v in u),
         "urls_oficiales deben ser https"),
        (not canal, "falta canal_contacto"),
        (canal and c.get("medio") not in MEDIOS, "medio inválido"),
        (canal and not str(c.get("valor") or "").strip(), "canal_contacto sin valor"),
        (canal and not str(c.get("fuente_url") or "").startswith("https://"),
         "dirección sin fuente_url pública"),
        (canal and re.fullmatch(r"[\d\s().+-]{8,}", str(c.get("valor") or "")), "teléfono personal"),
    )
    return m + [texto for cond, texto in checks if cond]
def guardar_objetivo(obj, home=None, ahora=None):
    """Normaliza (sin nivel = alto), valida y guarda. Devuelve el objetivo guardado."""
    o = dict(obj or {})
    momento = (ahora or datetime.now(timezone.utc)).isoformat()
    o.setdefault("id", "obj-" + hashlib.sha256((str(o.get("nombre_publico")) + momento).encode()).hexdigest()[:16])
    o.setdefault("nivel", "alto"); o.setdefault("estado", "nuevo"); o.setdefault("afinidad", 0)
    o.setdefault("fechas", {"creado": momento, "actualizado": momento})
    motivos = validar_objetivo(o)
    if motivos:
        raise ValueError("; ".join(motivos))
    doc = A.leer("objetivos.json", {}, home) or {}
    lista = [v for v in doc.get("objetivos") or [] if v.get("id") != o["id"]]
    A.escribir("objetivos.json", {"version": 1, "objetivos": lista + [o]}, home)
    return o
def huella(identificador):
    return hashlib.sha256(str(identificador or "").strip().lower().encode("utf-8")).hexdigest()
def suprimir(identificador, home=None):
    """Guarda SOLO el hash SHA-256 de un correo o de «dominio+nombre» (R5)."""
    h, doc = huella(identificador), A.leer("supresion.json", {}, home) or {}
    hashes = list(doc.get("hashes") or [])
    if h not in hashes:
        hashes.append(h)
    A.escribir("supresion.json", {"version": 1, "hashes": hashes}, home)
    return h
def _fecha(valor):
    try:
        d = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
def _suprimido(obj, reg):
    h = set(reg.get("hashes") or reg.get("supresion") or [])
    vals = ((obj.get("canal_contacto") or {}).get("valor"), obj.get("nombre_publico"))
    return any(huella(v) in h for v in vals if v)
def _en_pausa(reg, oid, quien, ahora, dias):
    fechas = [_fecha(r.get("fecha")) for r in reg.get("rechazos") or []
              if r.get("objetivo") == oid and r.get("quien") == quien]
    return any(f and 0 <= (ahora - f).total_seconds() < dias * 86400 for f in fechas)
def _no(motivo):
    return {"puede": False, "automatico": False, "motivo": motivo, "tipo": None}
def puede_contactar(obj, registro, ahora=None, tope_diario=TOPE_DIARIO):
    """Devuelve {puede, automatico, motivo, tipo}. Alto perfil (o sin nivel) nunca es automático."""
    reg, obj = registro or {}, obj or {}
    ahora = ahora or datetime.now(timezone.utc)
    ahora = ahora.replace(tzinfo=timezone.utc) if ahora.tzinfo is None else ahora
    oid, nivel = obj.get("id"), obj.get("nivel") or "alto"
    if _suprimido(obj, reg):
        return _no("suprimido")
    if _en_pausa(reg, oid, "alex", ahora, PAUSA_ALEX):
        return _no("pausa-rechazo-alex")
    if _en_pausa(reg, oid, "destinatario", ahora, PAUSA_NO):
        return _no("pausa-no-destinatario")
    envios = [e for e in reg.get("envios") or [] if e.get("objetivo") == oid]
    mensajes = [e for e in envios if not e.get("recordatorio")]
    if not mensajes:
        tipo = "mensaje"
    elif any(e.get("recordatorio") for e in envios):
        return _no("secuencia-agotada")
    else:
        f = _fecha(mensajes[0].get("fecha"))
        if f is None or (ahora - f).total_seconds() < DIAS_RECORDATORIO * 86400:
            return _no("recordatorio-aun-no")
        tipo = "recordatorio"
    hoy = ahora.date()
    usados = sum(1 for e in reg.get("envios") or [] if (_fecha(e.get("fecha")) or ahora).date() == hoy)
    if usados >= tope_diario:
        return _no("tope-diario")
    return {"puede": True, "automatico": nivel != "alto", "motivo": "ok", "tipo": tipo}
