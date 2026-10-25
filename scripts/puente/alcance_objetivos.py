# -*- coding: utf-8 -*-
"""INV1025J · almacén PRIVADO del agente de alcance (contrato §7, reglas R1/R5/R8).
Objetivos y supresión: `~/.starseed/alcance/` (carpeta 700, archivos 600), NUNCA bajo
`starseed_memory_root` (se espeja a Drive) y con solo hash SHA-256 en supresión (R5);
`home` y `ahora` inyectables; las decisiones no tocan disco ni red.
"""
import hashlib, json, os, secrets, time, unicodedata
from urllib.parse import urlparse
DIAS, TOPE_DEFECTO, TOPE_AFINIDAD = 86400.0, 5, 300
RECORDATORIO_DIAS, PAUSA_ALEX_DIAS, PAUSA_NO_DIAS = 14.0, 90.0, 180.0
OBJETIVOS = ("persona", "proyecto", "organizacion")
CATEGORIAS = ("activista", "desarrollador", "influencer", "proyecto-afin", "fundacion", "otro")
NIVELES = ("alto", "medio", "bajo")
#: R5: salud, religión/creencias, orientación, política personal, familia, ubicación privada, ingresos y teléfonos personales: claves y texto.
PROHIBIDOS = (
    "salud", "diagnostico", "enfermedad", "medicacion", "terapia", "religion", "creencia",
    "iglesia", "confesion", "orientacion", "sexualidad", "politica", "partido", "ideologia",
    "familia", "conyuge", "esposo", "esposa", "hijos", "domicilio", "ubicacion", "residencia",
    "codigo postal", "ingresos", "salario", "sueldo", "telefono", "movil", "celular", "whatsapp",
)

def _limpia(texto):
    return "".join(c for c in unicodedata.normalize("NFKD", str(texto or "")) if not unicodedata.combining(c)).lower().strip()

def carpeta_objetivos(home=None):
    """Carpeta PRIVADA del alcance (700); sin `home`, la del usuario."""
    return os.path.join(home or os.path.expanduser("~"), ".starseed", "alcance")

def nivel_de(objeto):
    """R8: un objetivo SIN nivel se trata como ALTO (solo manual)."""
    return (objeto or {}).get("nivel") if (objeto or {}).get("nivel") in NIVELES else "alto"

def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return []

def _escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    os.chmod(os.path.dirname(ruta), 0o700)
    with open(ruta + ".tmp", "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False)
    os.chmod(ruta + ".tmp", 0o600)
    os.replace(ruta + ".tmp", ruta)

def validar_objetivo(objeto):
    """PURA. None si el objetivo vale; motivo de rechazo (R1/R5) si no."""
    o = objeto if isinstance(objeto, dict) else {}
    if (malo := next((p for p in PROHIBIDOS if p in _limpia(str(o))), None)):
        return "campo o texto prohibido (R5): %s" % malo
    canal = o.get("canal_contacto") or {}
    if o.get("tipo") not in OBJETIVOS or o.get("categoria") not in CATEGORIAS:
        return "tipo o categoria fuera de lista"
    try:
        if float(o.get("afinidad") or 0) > TOPE_AFINIDAD:
            return "afinidad por encima de %d" % TOPE_AFINIDAD
    except (TypeError, ValueError):
        return "afinidad ilegible"
    if any(not str(u).startswith("https://") for u in (o.get("urls_oficiales") or [])):
        return "urls_oficiales solo https (R1)"
    if canal and not str(canal.get("fuente_url") or "").startswith("https://"):
        return "canal_contacto sin fuente_url pública (R1/R5)"
    return None

def guardar_objetivo(objeto, home=None, ahora=None):
    """Valida, completa (id opaco, nivel R8, estado, fechas) y guarda (600). → (id, motivo)."""
    ahora = time.time() if ahora is None else ahora
    o = dict(objeto or {})
    o["id"] = o.get("id") or ("obj-" + secrets.token_hex(6))
    if (motivo := validar_objetivo(o)):
        return None, motivo
    o.update(nivel=nivel_de(o), estado=o.get("estado") or "activo")
    o["fechas"] = {**(o.get("fechas") or {}), "creado": (o.get("fechas") or {}).get("creado") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora))}
    ruta = os.path.join(carpeta_objetivos(home), "objetivos.json")
    _escribir(ruta, [x for x in _leer(ruta) if x.get("id") != o["id"]] + [o])
    return o["id"], None

def huella(correo=None, dominio=None, nombre=None):
    """SHA-256 de la identidad normalizada (R5: en disco solo el hash)."""
    dato = _limpia(correo) if correo else ("%s|%s" % (_limpia(dominio or ""), _limpia(nombre or "")) if (dominio or nombre) else "")
    return hashlib.sha256(dato.encode("utf-8")).hexdigest() if dato else ""

def suprimir(correo=None, dominio=None, nombre=None, home=None):
    """Añade SOLO el hash a supresion.json (600); lo devuelve ("" si nada)."""
    h = huella(correo=correo, dominio=dominio, nombre=nombre)
    if h and h not in huellas_supresion(home):
        _escribir(os.path.join(carpeta_objetivos(home), "supresion.json"), sorted(huellas_supresion(home) | {h}))
    return h

def huellas_supresion(home=None):
    return set(_leer(os.path.join(carpeta_objetivos(home), "supresion.json")))

def puede_contactar(objeto, registro, ahora, suprimidos=(), tope=TOPE_DEFECTO, automatico=True, enviados_hoy=0):
    """PURA. (sí, motivo): supresión, nivel alto, pausas 90/180, cuota diaria y 1+1.
    `registro`: {"mensajes": [t…], "recordatorios": [t…], "rechazo_alex": t, "rechazo_no": t};
    `suprimidos`: huellas SHA-256; `automatico=True` = lo propone el agente, False ya lo aprobó
    una persona; `enviados_hoy`: envíos de HOY en total (cuota del día, 5 por defecto)."""
    o, r = objeto or {}, registro if isinstance(registro, dict) else {}
    canal, dominio = o.get("canal_contacto") or {}, urlparse((o.get("urls_oficiales") or [""])[0]).hostname or ""
    huellas = {x for x in (huella(correo=canal.get("valor")), huella(dominio=dominio, nombre=o.get("nombre_publico"))) if x}
    if huellas & set(suprimidos):
        return False, "suprimido (solo el hash se guarda, R5)"
    if automatico and nivel_de(o) == "alto":
        return False, "nivel alto: nunca automático (R8)"
    t_no, t_alex = r.get("rechazo_no"), r.get("rechazo_alex")
    if t_no and ahora - float(t_no) < PAUSA_NO_DIAS * DIAS:
        return False, "pausa de 180 días tras el «no» del destinatario"
    if t_alex and ahora - float(t_alex) < PAUSA_ALEX_DIAS * DIAS:
        return False, "pausa de 90 días tras un rechazo de Alex"
    if int(enviados_hoy or 0) >= tope:
        return False, "tope diario alcanzado (%d)" % tope
    mensajes = [float(t) for t in (r.get("mensajes") or [])]
    if r.get("recordatorios"):
        return False, "tope de 1 mensaje y 1 recordatorio (14 días)"
    if mensajes and max(mensajes) + RECORDATORIO_DIAS * DIAS > ahora:
        return False, "el recordatorio llega a los 14 días, antes no"
    return True, ("recordatorio a los 14 días, último" if mensajes else "primer contacto")

