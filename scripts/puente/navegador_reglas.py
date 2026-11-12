# -*- coding: utf-8 -*-
"""Reglas puras del navegador propio (NAV1112A · contrato §4 y §5).

Sin red: sesiones, dominios, selectores prohibidos, topes y estado atómico.
"""
from __future__ import annotations

import datetime as dt
import json, os
import re
import unicodedata
from urllib.parse import urlsplit

ESTADOS = ("viva", "caducada", "sin alta")
DOMINIOS_GOOGLE = ("myactivity.google.com", "www.youtube.com", "gemini.google.com", "notebooklm.google.com")
DOMINIOS_INSTAGRAM = ("www.instagram.com",)
SESIONES = {
    "google-alex": {"dominios": DOMINIOS_GOOGLE, "paginas_al_dia": 40, "pausa_minima": 15},
    "google-fundacion": {"dominios": DOMINIOS_GOOGLE, "paginas_al_dia": 40, "pausa_minima": 15},
    "instagram-maggasukha": {"dominios": DOMINIOS_INSTAGRAM, "paginas_al_dia": 8, "pausa_minima": 60},
    "instagram-sociedad": {"dominios": DOMINIOS_INSTAGRAM, "paginas_al_dia": 8, "pausa_minima": 60},
}
PROHIBIDOS = ("enviar", "publicar", "eliminar", "seguir", "me gusta", "guardar cambios", "send", "publish", "delete", "remove", "follow", "like", "save")

def ruta_estado():
    """El estado privado del navegador, siempre fuera del repo."""
    return os.path.join(os.path.expanduser("~"), ".starseed", "navegador", "estado.json")

def _defecto_sesion():
    return {"estado": "sin alta", "ultima_comprobacion": None, "paginas_hoy": {"fecha": None, "cuenta": 0}}

def estado_inicial():
    """El registro completo con las cuatro sesiones sin dar de alta."""
    return {"sesiones": {nombre: _defecto_sesion() for nombre in SESIONES}}

def leer_estado(ruta=None):
    """Lee el estado guardado y completa lo que falte con el registro inicial."""
    try:
        with open(ruta or ruta_estado(), encoding="utf-8") as archivo:
            guardado = json.load(archivo)
    except (OSError, ValueError):
        guardado = {}
    estado = estado_inicial()
    for nombre, datos in (guardado.get("sesiones") or {}).items():
        if nombre in estado["sesiones"] and isinstance(datos, dict):
            estado["sesiones"][nombre].update(datos)
    return estado

def guardar_estado(estado, ruta=None):
    """Escritura atómica: temporal en la misma carpeta y `os.replace` al final."""
    ruta = ruta or ruta_estado()
    os.makedirs(os.path.dirname(ruta), mode=0o700, exist_ok=True)
    temporal = "%s.tmp-%d" % (ruta, os.getpid())
    with open(temporal, "w", encoding="utf-8") as archivo:
        json.dump(estado, archivo, ensure_ascii=False, indent=1)
    try:
        os.chmod(temporal, 0o600)
    except OSError:
        pass
    os.replace(temporal, ruta)
    return ruta

def permitida(sesion, url):
    """Solo https y solo un dominio de la lista de esa sesión."""
    reglas = SESIONES.get(sesion)
    if not reglas or not isinstance(url, str):
        return False
    partes = urlsplit(url)
    if partes.scheme.lower() != "https" or not partes.hostname:
        return False
    host = partes.hostname.lower().rstrip(".")
    return any(host == dominio or host.endswith("." + dominio) for dominio in reglas["dominios"])

def _normalizar(texto):
    plano = "".join(c for c in unicodedata.normalize("NFD", str(texto).lower())
                    if unicodedata.category(c) != "Mn")
    return " " + re.sub(r"[^a-z0-9]+", " ", plano).strip() + " "

def selector_prohibido(texto_o_selector):
    """True si el texto o selector nombra una acción de escritura prohibida."""
    texto = _normalizar(texto_o_selector)
    return any(" %s " % prohibido in texto for prohibido in PROHIBIDOS)

def dentro_de_tope(sesion, ahora=None, ruta=None):
    """True si a la sesión le quedan páginas para hoy según su tope diario."""
    reglas = SESIONES.get(sesion)
    if not reglas:
        return False
    ahora = ahora or dt.datetime.now(dt.timezone.utc)
    if isinstance(ahora, dt.date) and not isinstance(ahora, dt.datetime):
        ahora = dt.datetime(ahora.year, ahora.month, ahora.day, tzinfo=dt.timezone.utc)
    if ahora.tzinfo is None:
        ahora = ahora.replace(tzinfo=dt.timezone.utc)
    hoy = ahora.astimezone(dt.timezone.utc).date().isoformat()
    paginas = leer_estado(ruta)["sesiones"][sesion].get("paginas_hoy") or {}
    cuenta = paginas.get("cuenta", 0) if paginas.get("fecha") == hoy else 0
    return cuenta < reglas["paginas_al_dia"]

def marcar_estado(sesion, valor, ahora=None, ruta=None):
    """Anota viva, caducada o sin alta y la última comprobación; nunca navega."""
    if sesion not in SESIONES or valor not in ESTADOS:
        raise ValueError("sesión o estado no válido")
    estado = leer_estado(ruta)
    estado["sesiones"][sesion]["estado"] = valor
    momento = ahora or dt.datetime.now(dt.timezone.utc)
    if isinstance(momento, dt.datetime):
        estado["sesiones"][sesion]["ultima_comprobacion"] = momento.isoformat()
    guardar_estado(estado, ruta)
    return estado["sesiones"][sesion]

def _falso(valor):
    return str(valor if valor is not None else "").strip().lower() in ("0", "false", "no", "off")

def apagado(entorno=None, sesion=None):
    """El interruptor global apaga todo; el de Instagram solo sus dos sesiones."""
    entorno = os.environ if entorno is None else entorno
    if _falso(entorno.get("STARSEED_NAVEGADOR")):
        return True
    return bool(sesion and sesion.startswith("instagram")
                and _falso(entorno.get("STARSEED_NAVEGADOR_INSTAGRAM")))
