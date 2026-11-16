#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Libreta de ejemplos para afinado de Jev (MGM1110B).

Contrato: Módulo con lectores INYECTADOS (`leer_captura`, `leer_experiencias`, `leer_desenlaces`).
Deduplica, excluye dominios privados (`DOMINIOS_PRIVADOS`), une por id, y genera JSONL
para el afinado (solo etiquetas 'verdad', sin privados).
"""
import json
import hashlib

DOMINIOS_PRIVADOS = {"Telegram", "chats", "buzón"}
ESTRATOS_OBJETIVO = (
    "noul:bloqueadas",
    "noul:aprobacion",
    "noul:produccion",
    "choice:enjambre:escritor",
    "choice:ramas-nube",
)

def _huella(item):
    """Genera una huella única del contenido del item."""
    s = json.dumps(item, sort_keys=True)
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def construir(leer_captura, leer_experiencias, leer_desenlaces):
    """Une capturas y experiencias, etiqueta con desenlaces, excluye privados y deduplica."""
    capturas = list(leer_captura())
    experiencias = {e["id"]: e for e in leer_experiencias()}
    
    libreta = []
    vistas = set()

    for c in capturas:
        # Excluir dominio privado
        if c.get("dominio") in DOMINIOS_PRIVADOS:
            continue
            
        c_id = c["id"]
        experiencia = experiencias.get(c_id)
        
        # Etiqueta de desenlace
        etiqueta = leer_desenlaces.etiqueta_de(c_id)
        
        item = {
            "captura": c,
            "experiencia": experiencia,
            "etiqueta": etiqueta
        }
        
        # Deduplicación por huella
        h = _huella(item)
        if h not in vistas:
            libreta.append(item)
            vistas.add(h)
            
    return libreta

def resumen(libreta):
    """Resumen por estrato y etiqueta, sin texto."""
    contadores = {"estrato": {}, "etiqueta": {}}
    for item in libreta:
        captura = item["captura"]
        etiqueta = item["etiqueta"]
        
        # Estratos
        for estrato in captura.get("estratos", []):
            contadores["estrato"][estrato] = contadores["estrato"].get(estrato, 0) + 1
            
        # Etiquetas
        contadores["etiqueta"][etiqueta] = contadores["etiqueta"].get(etiqueta, 0) + 1
        
    return contadores

def a_jsonl(libreta, solo_verdad=True):
    """JSONL para afinado: solo etiqueta 'verdad' y no privado."""
    lineas = []
    for item in libreta:
        if solo_verdad and item["etiqueta"] != "verdad":
            continue
        
        # El afinado requiere estructura clara, deduplicada y sin privados.
        # Captura y experiencia ya vienen limpias de la captura, 
        # pero re-verificamos el dominio por seguridad.
        if item["captura"].get("dominio") in DOMINIOS_PRIVADOS:
            continue
            
        lineas.append(json.dumps({
            "captura": item["captura"],
            "experiencia": item["experiencia"],
            "etiqueta": item["etiqueta"]
        }))
    return "\n".join(lineas)
