# -*- coding: utf-8 -*-
"""Almacén privado del alcance (R1, R5, R8): objetivos, supresión y pausas.
Vive en `~/.starseed/alcance/` (700/600), nunca bajo `starseed_memory_root`; sin red."""
import hashlib, json, os, re, unicodedata, urllib.parse
from datetime import datetime, timedelta
CARPETA = (".starseed", "alcance")
NIVELES, TIPOS = ("alto", "medio", "bajo"), ("persona", "proyecto", "organizacion")
CATEGORIAS = ("activista", "desarrollador", "influencer", "proyecto-afin", "fundacion", "otro")
MEDIOS = ("correo-propio", "correo-usuario", "formulario", "github", "red")
PROHIBIDAS = ("salud", "enfermedad", "diagnostico", "medico", "medica", "medicamento", "discapacidad", "religion", "creencia", "iglesia", "espiritual", "orientacion", "homosexual", "heterosexual", "bisexual", "lesbiana", "gay", "politica", "partido", "voto", "militante", "ideologia", "familia", "hijo", "hijos", "matrimonio", "pareja", "conyuge", "domicilio", "ubicacion", "direccion", "calle", "avenida", "codigo postal", "ingresos", "salario", "sueldo", "patrimonio", "telefono", "movil", "celular", "whatsapp")
def _plano(t): return "".join(c for c in unicodedata.normalize("NFKD", str(t).lower()) if not unicodedata.combining(c))
def _prohibido(t):
    p = re.sub(r"[^a-z0-9]+", " ", _plano(t))
    return any(re.search(r"\b" + re.escape(x) + r"\b", p) for x in PROHIBIDAS)
def _url_publica(url):
    try: p = urllib.parse.urlsplit(str(url))
    except ValueError: return False
    h = (p.hostname or "").lower()
    if p.scheme != "https" or not h or p.username or p.password: return False
    if h in ("localhost", "127.0.0.1", "::1", "169.254.169.254") or h.endswith(".local"): return False
    if re.match(r"(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\.", h): return False
    return "." in h
def nivel_de(o):
    n = (o or {}).get("nivel")
    return n if n in NIVELES else "alto"
def validar_objetivo(o):
    """(válido, motivo). Rechaza campos sensibles y direcciones sin fuente pública."""
    if not isinstance(o, dict): return False, "objetivo inválido"
    pila: list = [o]
    while pila:
        d = pila.pop()
        for k, v in (d.items() if isinstance(d, dict) else enumerate(d)):
            if _prohibido(k): return False, "campo prohibido: " + str(k)
            if isinstance(v, str) and not v.lower().startswith("http") and _prohibido(v): return False, "texto prohibido: " + str(k)
            if isinstance(v, (dict, list)): pila.append(v)
    oid = str(o.get("id") or "")
    if not oid.startswith("obj-") or len(oid) < 6: return False, "id opaco inválido"
    if o.get("tipo") not in TIPOS or o.get("categoria") not in CATEGORIAS: return False, "tipo o categoría inválidos"
    if "nivel" in o and o["nivel"] not in NIVELES: return False, "nivel inválido"
    a = o.get("afinidad", 0)
    if not isinstance(a, int) or isinstance(a, bool) or not 0 <= a <= 300: return False, "afinidad fuera de 0..300"
    urls = o.get("urls_oficiales") or []
    if not isinstance(urls, list) or any(not _url_publica(u) for u in urls): return False, "urls_oficiales deben ser https públicas"
    c = o.get("canal_contacto") or {}
    if not isinstance(c, dict) or c.get("medio") not in MEDIOS or not c.get("valor"): return False, "canal_contacto inválido"
    if not _url_publica(c.get("fuente_url")): return False, "dirección sin fuente_url pública"
    return True, ""
def raiz(home=None):
    r = os.path.join(os.path.realpath(os.path.expanduser(home or "~")), *CARPETA)
    if "starseed_memory_root" in r.split(os.sep): raise ValueError("almacén privado bajo starseed_memory_root")
    return r
def preparar(home=None):
    r = raiz(home)
    os.makedirs(r, mode=0o700, exist_ok=True)
    os.chmod(r, 0o700)
    return r
def _escribir(ruta, datos):
    tmp = ruta + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f: json.dump(datos, f, ensure_ascii=False, indent=2, sort_keys=True)
    os.chmod(tmp, 0o600)
    os.replace(tmp, ruta)
def _leer(ruta, defecto):
    try:
        with open(ruta, "r", encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return defecto
def cargar_objetivos(home=None):
    d = _leer(os.path.join(preparar(home), "objetivos.json"), [])
    return d if isinstance(d, list) else []
def guardar_objetivo(o, home=None):
    ok, motivo = validar_objetivo(o)
    if not ok: return False, motivo
    lista = [x for x in cargar_objetivos(home) if x.get("id") != o["id"]]
    lista.append(o)
    _escribir(os.path.join(preparar(home), "objetivos.json"), lista)
    return True, ""
def _canonico(e):
    if isinstance(e, (tuple, list)) and len(e) == 2: return "%s|%s" % (_plano(e[0]).strip(), " ".join(_plano(e[1]).split()))
    t = str(e or "").strip()
    if "@" not in t and "+" in t: return _canonico(t.split("+", 1))
    return " ".join(_plano(t).split())
def huella(e): return hashlib.sha256(_canonico(e).encode("utf-8")).hexdigest()
def cargar_supresion(home=None):
    d = _leer(os.path.join(preparar(home), "supresion.json"), [])
    return [h for h in d if isinstance(h, str) and re.fullmatch(r"[0-9a-f]{64}", h)] if isinstance(d, list) else []
def suprimir(e, home=None):
    h = huella(e); lista = cargar_supresion(home)
    if h not in lista:
        lista.append(h)
        _escribir(os.path.join(preparar(home), "supresion.json"), sorted(lista))
    return h
def _suprimido(o, r):
    if o.get("suprimido") is True or r.get("suprimido") is True: return True
    hashes = set(r.get("suprimidos") or []); v = (o.get("canal_contacto") or {}).get("valor")
    if not v: return False
    dom = str(v).split("@")[1].strip().lower() if "@" in str(v) else ""
    pruebas = [huella(v)] + ([huella((dom, o.get("nombre_publico", "")))] if dom else [])
    return any(p in hashes for p in pruebas)
def _fecha(v):
    if isinstance(v, datetime): return v
    try: return datetime.fromisoformat(str(v))
    except (TypeError, ValueError): return None
def puede_contactar(o, registro, ahora=None, tope_diario=5):
    """Puerta del envío automático: nivel alto nunca es automático (R8)."""
    r = registro or {}; ahora = ahora or datetime.now()
    if _suprimido(o, r): return False, "suprimido"
    if nivel_de(o) == "alto": return False, "nivel-alto-solo-manual"
    oid = str(o.get("id") or "")
    for clave, dias, motivo in (("rechazo_alex", 90, "pausa-rechazo-90d"), ("no_destinatario", 180, "pausa-no-180d")):
        f = _fecha((r.get(clave) or {}).get(oid))
        if f and ahora - f < timedelta(days=dias): return False, motivo
    def lista(clave):
        d = (r.get(clave) or {}).get(oid) or []
        return [f for f in (_fecha(x) for x in d) if f is not None]
    mensajes, recordatorios = lista("mensajes"), lista("recordatorios")
    if recordatorios or len(mensajes) > 1: return False, "seguimiento-cerrado"
    if mensajes and ahora - mensajes[-1] < timedelta(days=14): return False, "recordatorio-antes-de-14-dias"
    hoy = [f for f in (_fecha(x) for x in (r.get("envios") or [])) if f and f.date() == ahora.date()]
    if len(hoy) >= int(tope_diario): return False, "tope-diario"
    return True, "ok"
