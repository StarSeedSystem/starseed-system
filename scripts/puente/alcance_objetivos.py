#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Almacén PRIVADO del agente de alcance (R1, R5, R8)."""

import hashlib
import json
import os
import stat
from pathlib import Path


CARPETA_DEFECTO = os.path.expanduser("~/.starseed/alcance")
CAMPOS_PROHIBIDOS = (
    "salud",
    "religión",
    "religion",
    "creencias personales",
    "orientación",
    "orientacion",
    "política personal",
    "politica personal",
    "familia",
    "ubicación privada",
    "ubicacion privada",
    "ingresos",
    "teléfonos personales",
    "telefonos personales",
)

TIPOS_VALIDOS = ("persona", "proyecto", "organizacion")
CATEGORIAS_VALIDAS = (
    "activista",
    "desarrollador",
    "influencer",
    "proyecto-afin",
    "fundacion",
    "otro",
)
NIVELES_VALIDOS = ("alto", "medio", "bajo")


def carpeta_alcance(home=None):
    if home is not None:
        return os.path.join(home, ".starseed", "alcance")
    return CARPETA_DEFECTO


def asegurar_carpeta(home=None):
    carpeta = carpeta_alcance(home)
    os.makedirs(carpeta, mode=0o700, exist_ok=True)
    try:
        os.chmod(carpeta, 0o700)
    except Exception:
        pass
    return carpeta


def _asegurar_permisos_archivo(ruta):
    try:
        os.chmod(ruta, 0o600)
    except Exception:
        pass


def _texto_prohibido(texto):
    if not isinstance(texto, str):
        return False
    t = texto.lower()
    for p in CAMPOS_PROHIBIDOS:
        if p in t:
            return True
    return False


def _contiene_campo_prohibido(obj):
    if not isinstance(obj, dict):
        return True
    # Revisar todos los valores string recursivamente
    def revisar(x):
        if isinstance(x, str):
            if _texto_prohibido(x):
                return True
            return False
        if isinstance(x, dict):
            for k, v in x.items():
                if _texto_prohibido(str(k)):
                    return True
                if revisar(v):
                    return True
            return False
        if isinstance(x, list):
            for v in x:
                if revisar(v):
                    return True
            return False
        return False
    return revisar(obj)


def validar_objetivo(obj):
    if not isinstance(obj, dict):
        raise ValueError("objetivo inválido")
    # Rechazar campos o texto sobre temas prohibidos
    if _contiene_campo_prohibido(obj):
        raise ValueError("campo o texto prohibido")
    # Copia para no mutar
    o = dict(obj)
    # id opaco obj-...
    obj_id = o.get("id")
    if not isinstance(obj_id, str) or not obj_id.startswith("obj-"):
        raise ValueError("id opaco inválido")
    # nombre_publico
    if not isinstance(o.get("nombre_publico"), str) or not o.get("nombre_publico").strip():
        raise ValueError("nombre_publico inválido")
    # tipo
    if o.get("tipo") not in TIPOS_VALIDOS:
        raise ValueError("tipo inválido")
    # categoria
    if o.get("categoria") not in CATEGORIAS_VALIDAS:
        raise ValueError("categoria inválida")
    # nivel: sin dato = ALTO
    if "nivel" not in o or o.get("nivel") is None or o.get("nivel") == "":
        o["nivel"] = "alto"
    if o.get("nivel") not in NIVELES_VALIDOS:
        raise ValueError("nivel inválido")
    # afinidad ≤ 300
    afinidad = o.get("afinidad")
    if afinidad is not None:
        try:
            a = int(afinidad)
        except Exception:
            raise ValueError("afinidad inválida")
        if a > 300 or a < 0:
            raise ValueError("afinidad inválida")
    else:
        o["afinidad"] = 0
    # urls_oficiales https
    urls = o.get("urls_oficiales", [])
    if not isinstance(urls, list):
        raise ValueError("urls_oficiales inválidas")
    for u in urls:
        if not isinstance(u, str) or not u.startswith("https://"):
            raise ValueError("urls_oficiales deben ser https")
    # canal_contacto
    cc = o.get("canal_contacto")
    if cc is not None:
        if not isinstance(cc, dict):
            raise ValueError("canal_contacto inválido")
        medio = cc.get("medio")
        valor = cc.get("valor")
        fuente_url = cc.get("fuente_url")
        if medio is None or valor is None or fuente_url is None:
            raise ValueError("canal_contacto incompleto")
        if not isinstance(fuente_url, str) or not fuente_url.startswith("https://"):
            raise ValueError("canal_contacto requiere fuente_url pública https")
        # JAMÁS una dirección deducida por patrón - verificar que hay fuente_url pública
        if not isinstance(valor, str) or not valor.strip():
            raise ValueError("valor inválido")
        # Cualquier dirección sin fuente_url pública ya rechazada arriba
    # estado, fechas - requeridos pero no muy restrictivos
    if "estado" not in o:
        o["estado"] = "pendiente"
    if "fechas" not in o:
        o["fechas"] = {}
    return o


def _hash_sha256(valor):
    if isinstance(valor, str):
        s = valor.encode("utf-8")
    else:
        s = str(valor).encode("utf-8")
    return hashlib.sha256(s).hexdigest()


def suprimir(correo_o_dominio_nombre=None, dominio=None, nombre=None, home=None):
    asegurar_carpeta(home)
    carpeta = carpeta_alcance(home)
    lista_path = os.path.join(carpeta, "supresion.json")
    # Soportar llamada suprimir(correo | dominio+nombre)
    h = None
    if correo_o_dominio_nombre is not None and dominio is None and nombre is None:
        # Puede ser correo o combinación
        h = _hash_sha256(correo_o_dominio_nombre)
    elif dominio is not None and nombre is not None:
        h = _hash_sha256(dominio + "|" + nombre)
    elif correo_o_dominio_nombre is not None:
        h = _hash_sha256(correo_o_dominio_nombre)
    else:
        raise ValueError("parámetros inválidos")
    data = {"hashes": []}
    if os.path.exists(lista_path):
        try:
            with open(lista_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {"hashes": []}
    hashes = set(data.get("hashes") or [])
    hashes.add(h)
    data["hashes"] = sorted(list(hashes))
    with open(lista_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    _asegurar_permisos_archivo(lista_path)
    return h


def _cargar_supresion(home=None):
    carpeta = carpeta_alcance(home)
    lista_path = os.path.join(carpeta, "supresion.json")
    if not os.path.exists(lista_path):
        return set()
    try:
        with open(lista_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return set(data.get("hashes") or [])
    except Exception:
        return set()


def puede_contactar(obj, registro, ahora, tope_diario=5, home=None):
    if not isinstance(obj, dict):
        return False
    # suprimido → no
    sup = _cargar_supresion(home)
    # Revisar si obj está suprimido por hash
    obj_id = obj.get("id") or obj.get("nombre_publico") or ""
    if _hash_sha256(obj_id) in sup or _hash_sha256(obj.get("nombre_publico", "")) in sup:
        return False
    if registro and isinstance(registro, dict):
        # Revisar hashes en registro
        for k in registro.keys():
            if k in sup:
                return False
    # alto perfil → nunca automático
    nivel = obj.get("nivel", "alto")
    if nivel == "alto":
        return False
    # Pausas
    if registro and isinstance(registro, dict):
        # 90 días de pausa tras un rechazo de Alex
        # 180 tras un «no» del destinatario
        last_rechazo_alex = registro.get("rechazo_alex") or registro.get("rechazoAlex")
        last_no_dest = registro.get("no_destinatario") or registro.get("rechazo_destinatario")
        # calcular días aproximados - asumir ahora en segundos o timestamp
        try:
            ahora_t = float(ahora)
        except Exception:
            return False
        if last_rechazo_alex is not None:
            try:
                t_ra = float(last_rechazo_alex)
                if ahora_t - t_ra < 90 * 86400:
                    return False
            except Exception:
                pass
        if last_no_dest is not None:
            try:
                t_nd = float(last_no_dest)
                if ahora_t - t_nd < 180 * 86400:
                    return False
            except Exception:
                pass
        # un mensaje y un recordatorio a los 14 días como máximo
        mensajes = registro.get("mensajes_enviados", 0) or 0
        ultimo_mensaje = registro.get("ultimo_mensaje")
        if mensajes >= 1 and ultimo_mensaje is not None:
            try:
                t_um = float(ultimo_mensaje)
                if ahora_t - t_um < 14 * 86400 and mensajes >= 2:  # ya enviado recordatorio?
                    # "un mensaje y un recordatorio a los 14 días como máximo" - permitir 1 + recordatorio
                    pass
            except Exception:
                pass
        if mensajes >= 2:  # mensaje + recordatorio ya enviados
            return False
        # tope diario configurable
        contactos_hoy = registro.get("contactos_hoy", 0) or 0
        if contactos_hoy >= int(tope_diario):
            return False
    else:
        pass
    return True
