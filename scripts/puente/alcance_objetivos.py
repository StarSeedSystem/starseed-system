# -*- coding: utf-8 -*-
"""Almacén PRIVADO del agente de alcance (INV1025J · R1, R5, R8): 700/600 y fuera de `starseed_memory_root`."""
from __future__ import annotations
import datetime as dt, hashlib, json, os, re, secrets, unicodedata
ARCHIVOS = {"objetivos": "objetivos.json", "registro": "registro.json", "supresion": "supresion.json"}
TOPE_DIARIO, DIAS_RECORDATORIO, DIAS_RECHAZO, DIAS_NO = 5, 14, 90, 180
MENSAJES = {"mensaje", "envio", "enviado", "inicial"}; RECORDATORIOS = {"recordatorio", "seguimiento"}
RECHAZOS = {"rechazo", "rechazo_alex", "rechazado"}; NEGATIVAS = {"no", "no_destinatario", "respuesta_no", "baja"}
CAMPOS_PROHIBIDOS = ("salud", "enfermedad", "diagnostic", "discapac", "medic", "religio", "creen", "espiritual", "iglesi", "orientacion", "sexual", "politic", "partido", "voto", "ideolog", "convic", "famil", "hij", "pareja", "matrimoni", "domicili", "direccion", "ubicacion", "ingreso", "salario", "sueldo", "patrimoni", "nomina", "telefon", "movil", "celular")
_RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
def _plano(texto): return "".join(c for c in unicodedata.normalize("NFD", str(texto).lower()) if unicodedata.category(c) != "Mn")
def ruta_almacen(home=None):
    raiz = os.path.abspath(os.path.expanduser(home or "~"))
    if "starseed_memory_root" in raiz.replace("\\", "/"):
        raise ValueError("el almacén de alcance no puede vivir bajo starseed_memory_root")
    return os.path.join(raiz, ".starseed", "alcance")
def _modo(ruta, modo):
    try: os.chmod(ruta, modo)
    except OSError: pass
def _volcar(ruta, datos):
    with open(os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    _modo(ruta, 0o600)
def preparar_almacen(home=None):
    carpeta = ruta_almacen(home)
    os.makedirs(carpeta, mode=0o700, exist_ok=True)
    _modo(carpeta, 0o700)
    for nombre, archivo in ARCHIVOS.items():
        ruta = os.path.join(carpeta, archivo)
        if not os.path.exists(ruta): _volcar(ruta, {} if nombre == "registro" else [])
        _modo(ruta, 0o600)
    return carpeta
def leer(nombre, home=None, defecto=None):
    preparar_almacen(home)
    try: return json.load(open(os.path.join(ruta_almacen(home), ARCHIVOS[nombre]), encoding="utf-8"))
    except (OSError, ValueError): return defecto if defecto is not None else ({} if nombre == "registro" else [])
def escribir(nombre, datos, home=None):
    preparar_almacen(home)
    ruta = os.path.join(ruta_almacen(home), ARCHIVOS[nombre])
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    _volcar(tmp, datos)
    os.replace(tmp, ruta)
    _modo(ruta, 0o600)
    return ruta
def _sensible(dato, canal=False):
    if isinstance(dato, dict): return any(_sensible(k) or _sensible(v, canal or k == "canal_contacto") for k, v in dato.items())
    if isinstance(dato, (list, tuple)): return any(_sensible(v, canal) for v in dato)
    if not isinstance(dato, str): return False
    texto = _plano(dato)
    telefono = bool(re.search(r"(?<![\w/:.-])\+?\d(?:[\s().-]?\d){8,}(?![\w])", dato)) and not bool(re.search(r"\d{4}-\d{2}-\d{2}", dato))
    postal = bool(re.search(r"\b(calle|avenida|avda|paseo|plaza|carrera|carretera)\b\s+[\w\s]*\d", dato, re.I))
    return any(p in texto for p in CAMPOS_PROHIBIDOS) or telefono or postal or (bool(_RE_EMAIL.search(dato)) and not canal)
def _fecha(valor=None):
    if isinstance(valor, dt.datetime): return valor if valor.tzinfo else valor.replace(tzinfo=dt.timezone.utc)
    if isinstance(valor, dt.date): return dt.datetime(valor.year, valor.month, valor.day, tzinfo=dt.timezone.utc)
    if isinstance(valor, (int, float)): return dt.datetime.fromtimestamp(valor, dt.timezone.utc)
    try:
        fecha = dt.datetime.fromisoformat(str(valor or "").replace("Z", "+00:00"))
        return fecha if fecha.tzinfo else fecha.replace(tzinfo=dt.timezone.utc)
    except ValueError: return dt.datetime.now(dt.timezone.utc)
def validar_objetivo(objetivo, ahora=None):
    if not isinstance(objetivo, dict) or _sensible(objetivo): raise ValueError("objetivo inválido o con datos sensibles")
    tipo, categoria = str(objetivo.get("tipo") or "").lower(), str(objetivo.get("categoria") or "").lower()
    nivel = str(objetivo.get("nivel") or "alto").lower()
    if tipo not in {"persona", "proyecto", "organizacion"} or categoria not in {"activista", "desarrollador", "influencer", "proyecto-afin", "fundacion", "otro"} or nivel not in ("alto", "medio", "bajo"):
        raise ValueError("tipo, categoría o nivel no válidos")
    try: afinidad = int(objetivo.get("afinidad") or 0)
    except (TypeError, ValueError): raise ValueError("afinidad no numérica")
    if not 0 <= afinidad <= 300: raise ValueError("afinidad fuera de 0..300")
    urls = objetivo.get("urls_oficiales") or []
    if not isinstance(urls, list) or any(not str(u).startswith("https://") for u in urls): raise ValueError("urls_oficiales debe ser una lista https")
    canal = objetivo.get("canal_contacto")
    if canal is not None:
        if not isinstance(canal, dict): raise ValueError("canal_contacto inválido")
        valor, fuente = str(canal.get("valor") or "").strip(), str(canal.get("fuente_url") or "")
        if not canal.get("medio") or not valor or not fuente.startswith("https://"): raise ValueError("canal sin medio, valor o fuente_url pública")
        if _RE_EMAIL.search(valor) and not _RE_EMAIL.fullmatch(valor): raise ValueError("correo inválido")
    oid = str(objetivo.get("id") or ("obj-" + secrets.token_hex(6)))
    if not re.fullmatch(r"obj-[A-Za-z0-9_-]+", oid): raise ValueError("id opaco inválido")
    salida = json.loads(json.dumps(objetivo))
    salida.update({"id": oid, "nivel": nivel, "afinidad": afinidad, "estado": objetivo.get("estado") or "nuevo"})
    salida.setdefault("urls_oficiales", [])
    salida.setdefault("fechas", {"creado": _fecha(ahora).isoformat()})
    return salida
def huella(valor): return hashlib.sha256(_plano(str(valor).strip()).encode("utf-8")).hexdigest()
def suprimir(valor=None, nombre=None, *, correo=None, dominio=None, home=None):
    texto = str(correo if correo is not None else (("%s|%s" % (dominio or valor or "", nombre)) if nombre is not None else (dominio or valor or ""))).strip()
    if not texto: raise ValueError("falta correo o dominio+nombre")
    marca, lista = huella(texto), set(leer("supresion", home) or [])
    if marca not in lista: escribir("supresion", sorted(lista | {marca}), home)
    return marca
def esta_suprimido(valor=None, nombre=None, *, correo=None, dominio=None, home=None):
    return huella(str(correo if correo is not None else (("%s|%s" % (dominio or valor or "", nombre)) if nombre is not None else (dominio or valor or ""))).strip()) in set(leer("supresion", home) or [])
def _eventos(registro):
    fuente = (registro.get("eventos") or registro.get("envios") or registro.get("enviados") or registro.get("mensajes") or []) if isinstance(registro, dict) else (registro or [])
    salida = []
    for evento in fuente if isinstance(fuente, list) else []:
        if isinstance(evento, dict):
            tipo = str(evento.get("tipo") or evento.get("evento") or "mensaje").lower()
            salida.append((tipo, _fecha(evento.get("fecha") or evento.get("cuando") or evento.get("en"))))
        else: salida.append(("mensaje", _fecha(evento)))
    return [(tipo, fecha) for tipo, fecha in salida if fecha]
def puede_contactar(objetivo, registro, ahora=None, tope_diario=TOPE_DIARIO, automatico=True):
    obj, ahora, eventos = validar_objetivo(objetivo, ahora), _fecha(ahora), _eventos(registro)
    if automatico and obj["nivel"] == "alto": return False
    if obj.get("suprimido") or (isinstance(registro, dict) and registro.get("suprimido")): return False
    canal = str((obj.get("canal_contacto") or {}).get("valor") or "")
    hashes = set(registro.get("supresion") or registro.get("hashes") or registro.get("suprimidos") or registro.get("lista_supresion") or []) if isinstance(registro, dict) else set()
    if canal and hashes and huella(canal) in hashes: return False
    for tipo, fecha in eventos:
        if tipo in RECHAZOS and (ahora - fecha).days < DIAS_RECHAZO: return False
        if tipo in NEGATIVAS and (ahora - fecha).days < DIAS_NO: return False
    enviados = sum(1 for tipo, fecha in eventos if fecha.date() == ahora.date() and tipo in MENSAJES | RECORDATORIOS)
    if isinstance(registro, dict):
        enviados = max(enviados, int(registro.get("envios_hoy") or registro.get("enviados_hoy") or registro.get("mensajes_hoy") or 0))
        tope_diario = int(registro.get("tope_diario") or tope_diario)
    if enviados >= int(tope_diario): return False
    mensajes = [fecha for tipo, fecha in eventos if tipo in MENSAJES]
    if any(tipo in RECORDATORIOS for tipo, _ in eventos) or len(mensajes) > 1: return False
    return not mensajes or (ahora - max(mensajes)).days >= DIAS_RECORDATORIO
