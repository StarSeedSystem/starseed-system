#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Piezas puras del enrutador propio de modelos (AGF1023B): sin red, disco ni reloj."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable

PREFERENCIAS = {
    "texto": ("chat", "instruct", "bitnet", "llama", "qwen", "gemma"),
    "razon": ("reason", "thinking", "think", "r1", "deepseek"),
    "codigo": ("coder", "code", "devstral", "qwen"),
    "vision": ("vision", "vl", "multimodal", "llava"),
    "voz": ("voice", "audio", "whisper"),
    "decision": ("jev", "decision", "systemone", "clef"),
}
ALIAS = {"chat": "texto", "conversacion": "texto", "reasoning": "razon",
         "razonamiento": "razon", "code": "codigo", "programacion": "codigo",
         "imagen": "vision", "decisiones": "decision"}


@dataclass(frozen=True)
class ClienteOpenAI:
    """Lo mínimo que entiende cualquier motor: URL, modelo y clave (sin mostrarla)."""

    base_url: str
    modelo: str
    clave: str = field(default="", repr=False)
    origen: str = "servidor-propio"

    def __iter__(self):
        """Permite ``base_url, modelo = cliente`` además de los atributos."""
        return iter((self.base_url, self.modelo))

    def cabeceras(self) -> dict[str, str]:
        return {"Authorization": "Bearer " + self.clave} if self.clave else {}


def _plano(texto: object) -> str:
    sin = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return sin.lower().strip()


def elegir_modelo(modelos: Iterable[object], capacidad: str = "texto") -> str | None:
    """El mejor modelo del catálogo para esa capacidad; sin pistas, el primero. PURO."""
    ids = [m.strip() for m in (modelos or []) if isinstance(m, str) and m.strip()]
    if not ids:
        return None
    clave = ALIAS.get(_plano(capacidad), _plano(capacidad))
    for pista in PREFERENCIAS.get(clave, ()):
        for modelo in ids:
            if pista in _plano(modelo):
                return modelo
    return ids[0]


def parsear_env(texto: str) -> dict[str, str]:
    """Lee un archivo de claves al estilo ``export NOMBRE="valor"``. PURO."""
    fuera: dict[str, str] = {}
    for linea in (texto or "").splitlines():
        linea = linea.strip()
        linea = linea[7:].lstrip() if linea.startswith("export ") else linea
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        nombre, valor = linea.split("=", 1)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", nombre.strip()):
            fuera[nombre.strip()] = valor.strip().strip("\"'")
    return fuera


def modelos_gratuitos(datos: object) -> list[str]:
    """Ids de una lista, ``{"modelos":[]}`` o la forma ``{"data":[]}`` de OpenRouter."""
    if isinstance(datos, dict):
        datos = datos.get("modelos") or datos.get("data") or []
    if not isinstance(datos, list):
        return []
    ids = [m.get("id") if isinstance(m, dict) else m for m in datos]
    return [m for m in ids if isinstance(m, str) and m.strip()]
