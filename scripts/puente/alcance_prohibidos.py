#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Guardas R5 del agente de alcance: texto y campos que JAMÁS entran.

`validar_objetivo` (en `alcance_objetivos.py`) usa esta tabla para rechazar
cualquier campo o texto sobre salud, religión o creencias personales,
orientación sexual, política personal, familia, ubicación privada, ingresos o
teléfonos personales, y para detectar teléfonos escritos con cualquier forma.
Módulo PURO de stdlib: solo entra texto, solo salen motivos de rechazo.
"""
from __future__ import annotations

import hashlib
import re

# Motivo → palabras que lo delatan (coincidencia por palabra completa).
PROHIBIDOS: dict[str, tuple[str, ...]] = {
    "salud": (
        "enfermedad", "enferma", "enfermo", "diagnóstico", "diagnostico", "síntoma", "sintoma",
        "medicación", "medicacion", "salud mental", "tratamiento médico", "hospital", "discapacidad",
    ),
    "creencias-personales": (
        "religión", "religion", "religioso", "iglesia", "cristiano", "cristiana", "musulmán",
        "musulmana", "judío", "judía", "ateo", "atea", "oración", "oracion", "creencias",
        "creencia", "bautismo", "fe personal",
    ),
    "orientación": (
        "orientación", "orientacion", "orientación sexual", "orientacion sexual", "homosexual",
        "gay", "lesbiana", "bisexual", "heterosexual", "transgénero", "transgenero", "transexual",
        "queer",
    ),
    "política personal": (
        "partido político", "partido politico", "voto", "voté", "vote", "socialista", "comunista",
        "conservador", "progresista", "izquierda", "izquierdista", "derechista", "ideología",
        "ideologia", "militancia",
    ),
    "familia": (
        "familia", "esposa", "esposo", "marido", "hijos", "hijas", "matrimonio", "casado",
        "casada", "pareja de", "abuelo", "abuela",
    ),
    "ubicación privada": (
        "domicilio", "dirección particular", "direccion particular", "dirección de casa",
        "direccion de casa", "vive en", "residencia de", "calle n.º",
    ),
    "ingresos": ("salario", "sueldo", "ingresos", "nómina", "nomina", "patrimonio", "riqueza"),
    "teléfono personal": (
        "teléfono personal", "telefono personal", "móvil personal", "movil personal",
    ),
}

# Racha de 9+ dígitos (con separadores): forma de teléfono.
TELEFONO = re.compile(r"\+?\d[\d\s().-]{8,}\d")


def textos(v: object):
    """Recorre un objetivo anidando listas/dict y cede cada texto."""
    if isinstance(v, str):
        yield v
    elif isinstance(v, (list, tuple)):
        for item in v:
            yield from textos(item)
    elif isinstance(v, dict):
        for item in v.values():
            yield from textos(item)


def prohibidos_en(texto: str) -> list[str]:
    """Lista (ordenada, sin repetidos) de motivos prohibidos en un texto."""
    bajo = texto.lower()
    hallados: list[str] = []
    for motivo, palabras in PROHIBIDOS.items():
        for palabra in palabras:
            if re.search(r"(?<!\w)" + re.escape(palabra) + r"(?!\w)", bajo):
                hallados.append(motivo)
                break
    if TELEFONO.search(bajo):
        hallados.append("teléfono personal")
    return sorted(set(hallados))


def validar_canal(canal: dict) -> list[str]:
    """El canal de contacto: direcciones SOLO si una fuente https las respalda (R1)."""
    rechazos: list[str] = []
    if not str(canal.get("fuente_url", "")).startswith("https://"):
        rechazos.append("direccion-sin-fuente-publica")  # JAMÁS una dirección deducida
    medio = str(canal.get("medio", "")).lower().replace("ó", "o").replace("é", "e")
    valor = str(canal.get("valor", ""))
    if "telefono" in medio or "movil" in medio or prohibidos_en(valor):
        rechazos.append("canal-de-telefono-prohibido")
    return rechazos


def token_supresion(correo=None, dominio=None, nombre=None) -> str:
    """Clave canónica: el correo, o el par dominio+nombre, para suprimir."""
    if correo and correo.strip():
        return "mailto:" + correo.strip().lower()
    if dominio and dominio.strip() and nombre and nombre.strip():
        return dominio.strip().lower() + "|" + nombre.strip().lower()
    raise ValueError("suprimir exige un correo, o dominio y nombre")

def hash_token(token: str) -> str:
    """SHA-256 del token; de la huella no hay vuelta atrás (R5)."""
    return hashlib.sha256(token.encode("utf-8", "replace")).hexdigest()
