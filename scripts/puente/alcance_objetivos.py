#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""alcance_objetivos · almacén PRIVADO del agente de alcance (R1, R5 y R8).

Todo vive en `~/.starseed/alcance/` (carpeta 700, archivos 600), NUNCA bajo
`starseed_memory_root`, que se espeja a Drive (R5). La supresión guarda SOLO el
hash SHA-256 —un correo o un nombre+dominio dan la MISMA huella— y el registro
llama a cada objetivo por su id opaco `obj-…`; cada dirección debe tener una
`fuente_url` pública https publicada por la propia entidad (R1), y nada de
salud, creencias, orientación, política personal, familia, ubicación privada,
ingresos ni teléfonos personales (R5). R8: objetivo sin nivel = ALTO (manual).

Módulo PURO de stdlib: `home` y el reloj (`ahora`) son parámetros; nada toca la red.
"""
import hashlib
import json
import os
import re
import time
import unicodedata

CARPETA_REL = (".starseed", "alcance")
PERMISO_CARPETA, PERMISO_ARCHIVO = 0o700, 0o600
NOMBRE_SUPRESION, ID_PREFIJO = "supresion.json", "obj-"
DIA = 86400
TOPE_DIARIO = 5
TEMPORALIDAD_RECORDATORIO, PAUSA_ALEX, PAUSA_NO = 14 * DIA, 90 * DIA, 180 * DIA
TIPOS = ("persona", "proyecto", "organizacion")
CATEGORIAS = ("activista", "desarrollador", "influencer", "proyecto-afin", "fundacion", "otro")
NIVELES = ("alto", "medio", "bajo")
CLASES_REGISTRO = ("envio", "recordatorio", "rechazo_alex", "no_destinatario")
MEDIOS = ("correo-propio", "correo-usuario", "formulario", "github", "red")
CAMPOS_OBJETIVO = ("id", "nombre_publico", "tipo", "categoria", "nivel", "afinidad",
                   "urls_oficiales", "canal_contacto", "estado", "fechas")
CAMPOS_CANAL = ("medio", "valor", "fuente_url")
# Temas prohibidos por R5, con límite de palabra (\w* admite plurales y derivados)
# para no confundir «repartido» con «partido»; se matcha sin acentos.
PROHIBIDOS = (
    "salud", "diagnostico", "medicacion", "enfermedad", "cancer",
    "religion", "creencia", "iglesia", "cristiano", "catolico", "evangelico",
    "budista", "musulman", "judio", "ateo", "orientacion", "sexualidad",
    "gay", "lesbiana", "bisexual", "transgenero", "heterosexual", "politica",
    "partido", "voto", "electoral", "familia", "esposo", "esposa", "pareja",
    "novio", "novia", "hijo", "hija", "hermano", "padre", "madre",
    "domicilio", "postal", "ingresos", "salario", "sueldo", "patrimonio",
    "telefono", "celular", "movil",
)
RE_SENSIBLE = re.compile(r"\b(" + "|".join(PROHIBIDOS) + r")\w*\b", re.IGNORECASE)
RE_TELEFONO = re.compile(r"\+?\d[\d\s\-().]{7,}\d")


def _sin_acentos(texto):
    return unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode("ascii")


def _sensible_en(texto):
    hallado = RE_SENSIBLE.search(_sin_acentos(texto))
    return hallado.group(0).lower() if hallado else None


def _es_https(valor):
    return isinstance(valor, str) and valor.startswith("https://") and valor.strip() == valor


def _iso(ahora):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ahora))


def ruta_carpeta(home):
    """`~/.starseed/alcance/` — nunca bajo `starseed_memory_root` (R5)."""
    return os.path.join(str(home), *CARPETA_REL)


def preparar_carpeta(home):
    ruta = ruta_carpeta(home)
    os.makedirs(ruta, exist_ok=True)
    os.chmod(ruta, PERMISO_CARPETA)
    return ruta


def _leer_json(ruta, por_defecto):
    if not os.path.exists(ruta):
        return por_defecto
    with open(ruta, "r", encoding="utf-8") as origen:
        return json.load(origen)


def _guardar_privado(home, nombre, datos):
    preparar_carpeta(home)
    ruta = os.path.join(ruta_carpeta(home), nombre)
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as destino:
        json.dump(datos, destino, ensure_ascii=False, indent=2)
    os.chmod(temporal, PERMISO_ARCHIVO)
    os.replace(temporal, ruta)
    return ruta


def _validar_canal(canal):
    """El canal de contacto: el que la entidad publica para eso, con fuente."""
    if not isinstance(canal, dict) or set(canal) != set(CAMPOS_CANAL):
        return "canal-incompleto"
    if not all(isinstance(canal[c], str) and canal[c].strip() for c in ("medio", "valor")):
        return "canal-vacio"
    if not canal["fuente_url"].strip():
        return "direccion-sin-fuente-url"
    if canal["medio"] not in MEDIOS:
        return "medio-ajeno"
    if not _es_https(canal["fuente_url"]):
        return "fuente-url-no-https"
    if RE_TELEFONO.search(canal["valor"]):
        return "telefono-personal"
    return None


def _validar_textos(objetivo):
    """Dato prohibido en los textos libres: nombre, estado o valor del canal."""
    visibles = (str(objetivo.get("nombre_publico", "")), str(objetivo.get("estado", "")),
                str(objetivo.get("canal_contacto", {}).get("valor", "")))
    for texto in visibles:
        palabra = _sensible_en(texto)
        if palabra:
            return "dato-prohibido:" + palabra
    if any(_sensible_en(url) for url in (objetivo.get("urls_oficiales") or [])):
        return "dato-prohibido-en-urls"
    return None


def validar_objetivo(objetivo):
    """None si el objetivo pasa; si no, el motivo del rechazo (R1, R5 y R8)."""
    if not isinstance(objetivo, dict):
        return "no-es-una-ficha"
    if any(campo not in CAMPOS_OBJETIVO for campo in objetivo):
        return "campo-ajeno"
    nombre = objetivo.get("nombre_publico")
    if not isinstance(nombre, str) or not nombre.strip():
        return "sin-nombre-publico"
    if objetivo.get("tipo") not in TIPOS or objetivo.get("categoria") not in CATEGORIAS:
        return "tipo-o-categoria-ajeno"
    nivel = objetivo.get("nivel")
    if nivel is not None and nivel not in NIVELES:
        return "nivel-ajeno"
    afinidad = objetivo.get("afinidad", 0)
    if not isinstance(afinidad, int) or isinstance(afinidad, bool) or not 0 <= afinidad <= 300:
        return "afinidad-fuera-de-rango"
    urls = objetivo.get("urls_oficiales", [])
    if not isinstance(urls, list) or not all(_es_https(u) for u in urls):
        return "urls-no-https"
    return _validar_canal(objetivo.get("canal_contacto")) or _validar_textos(objetivo)


def objetivo_normalizado(objetivo, ahora):
    """Ficha lista para guardar: id opaco, fechas y nivel ALTO si no lo dio nadie (R8)."""
    ficha = dict(objetivo)
    ficha["nivel"] = ficha.get("nivel") or "alto"
    ficha.setdefault("estado", "nuevo")
    ficha.setdefault("afinidad", 0)
    fechas = dict(ficha.get("fechas") or {})
    fechas["creacion"] = fechas.get("creacion") or _iso(ahora)
    fechas["actualizacion"] = _iso(ahora)
    ficha["fechas"] = fechas
    if not str(ficha.get("id", "")).startswith(ID_PREFIJO):
        semilla = ficha.get("nombre_publico", "") + ficha.get("canal_contacto", {}).get("valor", "") + str(ahora)
        ficha["id"] = ID_PREFIJO + hashlib.sha256(semilla.encode("utf-8")).hexdigest()[:10]
    return ficha


def guardar_objetivo(home, objetivo, ahora=None):
    """Valida y escribe `objetivo-<id>.json` (600); devuelve la ficha guardada."""
    motivo = validar_objetivo(objetivo)
    if motivo:
        raise ValueError(motivo)
    ficha = objetivo_normalizado(objetivo, ahora if ahora is not None else time.time())
    _guardar_privado(home, "objetivo-%s.json" % ficha["id"], ficha)
    return ficha


def leer_objetivo(home, objetivo_id):
    return _leer_json(os.path.join(ruta_carpeta(home), "objetivo-%s.json" % objetivo_id), None)


def huella_supresion(*partes):
    """SHA-256 del texto canónico: «correo» o «nombre@dominio» en minúscula."""
    return hashlib.sha256("@".join(p.strip().lower() for p in partes).encode("utf-8")).hexdigest()


def suprimir(home, *partes, ahora=None):
    """Entra en la lista de supresión: SOLO el hash se guarda (R5)."""
    huella = huella_supresion(*partes)
    entradas = _leer_json(os.path.join(ruta_carpeta(home), NOMBRE_SUPRESION), [])
    if not any(e.get("huella") == huella for e in entradas):
        instante = ahora if ahora is not None else time.time()
        entradas.append({"huella": huella, "cuando": _iso(instante)})
        _guardar_privado(home, NOMBRE_SUPRESION, entradas)
    return huella


def suprimido(home, *partes):
    huella = huella_supresion(*partes)
    for entrada in _leer_json(os.path.join(ruta_carpeta(home), NOMBRE_SUPRESION), []):
        if entrada.get("huella") == huella:
            return True
    return False


def anotar(home, objetivo_id, clase, ahora=None):
    """Anota en el registro privado: envío, recordatorio, rechazo o «no» (600)."""
    if clase not in CLASES_REGISTRO:
        raise ValueError("clase-ajena")
    registro = registro_de(home, objetivo_id)
    registro.setdefault(clase, []).append(ahora if ahora is not None else time.time())
    _guardar_privado(home, "registro-%s.json" % objetivo_id, registro)
    return registro


def registro_de(home, objetivo_id):
    return _leer_json(os.path.join(ruta_carpeta(home), "registro-%s.json" % objetivo_id), {})


def _hoy(instante):
    return int(instante // DIA)


def puede_contactar(objetivo, registro, ahora, automatico=False, tope_diario=TOPE_DIARIO):
    """(Sí, None) o (No, motivo): supresión, pausas, un mensaje y un recordatorio,
    tope diario y —R8— nivel alto NUNCA automático. Todo con instancias time.time()."""
    if registro.get("suprimido"):
        return False, "suprimido"
    rechazo_alex = registro.get("rechazo_alex") or []
    if rechazo_alex and ahora - max(rechazo_alex) < PAUSA_ALEX:
        return False, "pausa-rechazo-alex"
    no_destinatario = registro.get("no_destinatario") or []
    if no_destinatario and ahora - max(no_destinatario) < PAUSA_NO:
        return False, "pausa-no-destinatario"
    if automatico and (objetivo.get("nivel") or "alto") == "alto":
        return False, "nivel-alto-solo-manual"
    turnos = list(registro.get("envio") or []) + list(registro.get("recordatorio") or [])
    if len(turnos) >= 2:
        return False, "sin-mas-turnos"
    if len(registro.get("envio") or []) == 1 and ahora - max(registro["envio"]) < TEMPORALIDAD_RECORDATORIO:
        return False, "recordatorio-antes-de-tiempo"
    conteo_local = sum(1 for t in turnos if _hoy(t) == _hoy(ahora))
    # `envios_hoy` lo trae quien llama de todo el almacén; el conteo local cubre lo suyo.
    enviados_hoy = conteo_local + int(registro.get("envios_hoy", 0))
    if enviados_hoy >= tope_diario:
        return False, "tope-diario"
    return True, None

