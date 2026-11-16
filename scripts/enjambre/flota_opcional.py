# -*- coding: utf-8 -*-
"""Flota opcional: abliteration.ai y modelo privado del A1.

Este módulo gestiona los proveedores opcionales que se añaden al flota
gratuita bajo condiciones específicas:
- abliteration.ai: solo con variable STARSEED_ABLITERATION=1 y créditos permitidos
- modelo privado: solo si está vivo y actualizado (< 10 min), nunca en rol direccion

(2026-11-16, TAREA MQA4)
"""
import json
import os
import urllib.request

ROL_ESCRITOR_REVISOR = {"escritor", "revisor"}
ROL_PERMITIDO = {"sueno-mapa", "sueno-reduce", "sueno-contraste", "sintesis", "direccion"}
ABLITERATION_CREDITOS_URL = "https://api.abliteration.ai/v1/credits"
ABLITERATION_MODEL = "abliterated-model"
ABLITERATION_PROVIDER = "abliteration"
PRIVADO_PROVIDER = "privado"
TIEMPO_MAX_ACTUALIZACION_MIN = 10


def _verificar_abliteration_creditos(ahora_iso: str) -> bool:
    """Comprueba si abliteration tiene créditos permitidos vía API.
    
    Devuelve True si:
    - La API responde con status 200
    - La respuesta tiene 'data.total_credits' como número
    - total_credits > 0 (hay saldo disponible)
    
    Nunca lanza; False en caso de error.
    """
    clave = os.environ.get("ABLITERATION_API_KEY")
    if not clave:
        return False
    
    try:
        req = urllib.request.Request(
            ABLITERATION_CREDITOS_URL,
            headers={"Authorization": f"Bearer {clave}"},
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            if resp.status != 200:
                return False
            data = json.load(resp)
            creditos = data.get("data", {}).get("total_credits")
            return isinstance(creditos, (int, float)) and creditos > 0
    except Exception:
        return False


def agregar_opcionales(
    lista: list,
    rol: str,
    entorno: dict,
    estado_abliteration: dict,
    estado_privado: dict,
    ahora_iso: str,
) -> list:
    """Agrega proveedores opcionales al final de la lista.
    
    Reglas:
    - rol 'escritor' o 'revisor' → lista sin cambios
    - 'abliteration' entra si STARSEED_ABLITERATION=1 y creditos permitidos
    - 'privado' entra si vivo y actualizado (< 10 min), NUNCA en 'direccion'
    
    Args:
        lista: Lista de pares (proveedor, modelo) existentes
        rol: Rol de la tarea (sueno-mapa, sueno-reduce, sueno-contraste, 
             sintesis, direccion, escritor, revisor)
        entorno: No usado (para compatibilidad con firma futura)
        estado_abliteration: {'permitido': bool} indica si créditos disponibles
        estado_privado: {'vivo': bool, 'actualizado hace minutos': float}
        ahora_iso: Timestamp ISO para cálculos de frescura
    
    Returns:
        Nueva lista con opcionales agregados al final, manteniendo orden estable.
        El motivo de cada opcional rechazado se anota (retornado aparte).
    """
    if rol in ROL_ESCRITOR_REVISOR:
        return list(lista)
    
    resultado = list(lista)
    motivos_rechazo = {}
    
    if rol not in ROL_PERMITIDO:
        return resultado, []
    
    if _debe_agregar_abliteration(rol, estado_abliteration, ahora_iso):
        resultado.append((ABLITERATION_PROVIDER, ABLITERATION_MODEL))
    else:
        motivo = _motivo_abliteration(estado_abliteration)
        if motivo:
            motivos_rechazo["abliteration"] = motivo
    
    if _debe_agregar_privado(rol, estado_privado, ahora_iso):
        etiqueta = estado_privado.get("etiqueta", "modelo-privado")
        resultado.append((PRIVADO_PROVIDER, etiqueta))
    else:
        motivo = _motivo_privado(rol, estado_privado, ahora_iso)
        if motivo:
            motivos_rechazo["privado"] = motivo
    
    return resultado, motivos_rechazo


def _debe_agregar_abliteration(rol: str, estado_abliteration: dict, ahora_iso: str) -> bool:
    """Determina si se debe agregar abliteration."""
    if rol in ROL_ESCRITOR_REVISOR:
        return False
    
    habilitado = os.environ.get("STARSEED_ABLITERATION", "0") == "1"
    if not habilitado:
        return False
    
    permitido = estado_abliteration.get("permitido", False)
    return bool(permitido)


def _motivo_abliteration(estado_abliteration: dict) -> str | None:
    """Devuelve el motivo por el que abliteration no se agregó."""
    habilitado = os.environ.get("STARSEED_ABLITERATION", "0") == "1"
    if not habilitado:
        return "STARSEED_ABLITERATION no está habilitado"
    
    if not estado_abliteration.get("permitido"):
        return "abliteration creditos no permitidos"
    
    return None


def _debe_agregar_privado(rol: str, estado_privado: dict, ahora_iso: str) -> bool:
    """Determina si se debe agregar el modelo privado."""
    if rol == "direccion":
        return False
    
    vivo = estado_privado.get("vivo", False)
    if not vivo:
        return False
    
    minutos_actualizacion = estado_privado.get("actualizado hace minutos", float("inf"))
    if minutos_actualizacion >= TIEMPO_MAX_ACTUALIZACION_MIN:
        return False
    
    return True


def _motivo_privado(rol: str, estado_privado: dict, ahora_iso: str) -> str | None:
    """Devuelve el motivo por el que el modelo privado no se agregó."""
    if rol == "direccion":
        return "rol direccion: respuesta a Telegram no puede esperar minutos"
    
    if not estado_privado.get("vivo", False):
        return "estado_privado.vivo es False"
    
    minutos = estado_privado.get("actualizado hace minutos", float("inf"))
    if minutos >= TIEMPO_MAX_ACTUALIZACION_MIN:
        return f"actualización hace {minutos} minutos (límite: {TIEMPO_MAX_ACTUALIZACION_MIN})"
    
    return None