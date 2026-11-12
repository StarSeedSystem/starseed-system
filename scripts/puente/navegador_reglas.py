#!/usr/bin/env python3
"""Navegador propio · sesiones y reglas (NAV1112A · §4 y §5 del contrato).

Registro de las cuatro sesiones con sus dominios, topes y estado en
~/.starseed/navegador/estado.json (escritura atómica). Sin red.
"""
import json, os, re, time, unicodedata, urllib.parse
from datetime import datetime, timezone

RUTA_ESTADO = os.path.expanduser("~/.starseed/navegador/estado.json")
ESTADOS = ("viva", "caducada", "sin alta")
DOMINIOS_GOOGLE = ("myactivity.google.com", "www.youtube.com", "gemini.google.com", "notebooklm.google.com")
DOMINIOS_INSTAGRAM = ("www.instagram.com",)
SESIONES = {
    "google-alex": {"cuenta": "alexbordongarrigos", "dominios": DOMINIOS_GOOGLE, "paginas_al_dia": 40, "pausa_minima": 15},
    "google-fundacion": {"cuenta": "fundacionstarseed", "dominios": DOMINIOS_GOOGLE, "paginas_al_dia": 40, "pausa_minima": 15},
    "instagram-maggasukha": {"cuenta": "maggasukha", "dominios": DOMINIOS_INSTAGRAM, "paginas_al_dia": 20, "pausa_minima": 60},
    "instagram-sociedad": {"cuenta": "sociedad", "dominios": DOMINIOS_INSTAGRAM, "paginas_al_dia": 15, "pausa_minima": 60},
}
PROHIBIDOS = (
    "enviar", "send", "submit", "publicar", "publish", "post", "eliminar", "delete",
    "remove", "borrar", "seguir", "follow", "unfollow", "me gusta", "like", "unlike",
    "guardar cambios", "guardar", "save changes", "save",
)

def _ahora(ahora=None):
    if isinstance(ahora, datetime):
        return ahora.astimezone(timezone.utc) if ahora.tzinfo else ahora.replace(tzinfo=timezone.utc)
    return datetime.fromtimestamp(float(ahora if ahora is not None else time.time()), timezone.utc)

def _iso(ahora=None):
    return _ahora(ahora).strftime("%Y-%m-%dT%H:%M:%SZ")

def _normalizar(texto):
    return "".join(c for c in unicodedata.normalize("NFKD", str(texto or "").lower()) if not unicodedata.combining(c))

def permitida(sesion, url):
    regla = SESIONES.get(sesion)
    if not regla or not isinstance(url, str):
        return False
    try:
        partes = urllib.parse.urlparse(url.strip())
        puerto = partes.port
    except ValueError:
        return False
    return (partes.scheme == "https" and not partes.username and not partes.password
            and puerto in (None, 443) and (partes.hostname or "").rstrip(".").lower() in regla["dominios"])

def selector_prohibido(texto_o_selector):
    texto = _normalizar(texto_o_selector)
    return any(re.search(r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(termino), texto) for termino in PROHIBIDOS)

def _cero(valor):
    return str(valor or "").strip().lower() in ("0", "false", "no", "off")

def apagado(entorno=None, sesion=None):
    entorno = os.environ if entorno is None else entorno
    return _cero(entorno.get("STARSEED_NAVEGADOR")) or bool(
        sesion and sesion.startswith("instagram-") and _cero(entorno.get("STARSEED_NAVEGADOR_INSTAGRAM")))

def _sesion_por_defecto():
    return {"estado": "sin alta", "ultima_comprobacion": "", "dia": "", "paginas": 0, "ultima_pagina": ""}

def cargar_estado(ruta=RUTA_ESTADO):
    estado = {"sesiones": {nombre: _sesion_por_defecto() for nombre in SESIONES}}
    try:
        with open(ruta, encoding="utf-8") as fichero:
            filas = json.load(fichero).get("sesiones", {})
    except (OSError, ValueError, AttributeError):
        return estado
    for nombre in SESIONES:
        if isinstance(filas.get(nombre), dict):
            estado["sesiones"][nombre].update(filas[nombre])
    return estado

def guardar_estado(estado, ruta=RUTA_ESTADO):
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    with open(ruta + ".tmp", "w", encoding="utf-8") as fichero:
        json.dump(estado, fichero, ensure_ascii=False, indent=1)
    os.replace(ruta + ".tmp", ruta)
    return ruta

def marcar_estado(sesion, nuevo, ahora=None, ruta=RUTA_ESTADO):
    if sesion not in SESIONES or nuevo not in ESTADOS:
        raise ValueError("sesión o estado desconocido: %s/%s" % (sesion, nuevo))
    estado = cargar_estado(ruta)
    estado["sesiones"][sesion].update({"estado": nuevo, "ultima_comprobacion": _iso(ahora)})
    guardar_estado(estado, ruta)
    return estado

def anotar_pagina(sesion, ahora=None, ruta=RUTA_ESTADO):
    if sesion not in SESIONES:
        raise ValueError("sesión desconocida: %s" % sesion)
    estado = cargar_estado(ruta)
    fila = estado["sesiones"][sesion]
    dia = _ahora(ahora).strftime("%Y-%m-%d")
    fila["paginas"] = (int(fila.get("paginas") or 0) if fila.get("dia") == dia else 0) + 1
    fila["dia"], fila["ultima_pagina"] = dia, _iso(ahora)
    guardar_estado(estado, ruta)
    return estado

def dentro_de_tope(sesion, ahora=None, estado=None, ruta=RUTA_ESTADO):
    regla = SESIONES.get(sesion)
    if not regla:
        return False
    estado = cargar_estado(ruta) if estado is None else estado
    fila = (estado.get("sesiones") or {}).get(sesion) or _sesion_por_defecto()
    dia = _ahora(ahora).strftime("%Y-%m-%d")
    paginas = int(fila.get("paginas") or 0) if fila.get("dia") == dia else 0
    if fila.get("estado") != "viva" or paginas >= regla["paginas_al_dia"]:
        return False
    ultima = fila.get("ultima_pagina")
    if not ultima or fila.get("dia") != dia:
        return True
    try:
        momento = datetime.strptime(ultima, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return (_ahora(ahora) - momento).total_seconds() >= regla["pausa_minima"]
