#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BAP1127E · Registro de pruebas único: lectura tolerante, espejo, censo e ids canónicos.

Lógica pura (solo stdlib). No reescribe `registro.jsonl` ni toca `pruebas_malla.py`.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_ISO = re.compile(r"^\s*(?:\([^)]{0,80}\)\s+)?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)")
_CENSO = re.compile(r"(?:^|\s)censo\s+(.+)$")
_PRUEBA = re.compile(r"^(?:v?\d+\.\d+\.\d+-)?(?:prueba\.?)?(\d{1,5})$")


def _fecha(iso: str | None) -> datetime | None:
    """Marca ISO (con o sin zona) → datetime UTC; None si no se puede leer."""
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(str(iso).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc)


def normalizar(linea: str) -> dict[str, Any] | None:
    """Línea JSONL → dict; manual `{fecha,version,ronda,prueba,resultado,nota}` → fin; conductor tal cual."""
    try:
        obj = json.loads(linea)
    except (TypeError, ValueError):
        return None
    if not isinstance(obj, dict):
        return None
    if "tipo" in obj:
        return obj
    if "prueba" not in obj:
        return None
    return {
        "tipo": "fin", "id": obj.get("prueba"), "version": obj.get("version"),
        "resultado": obj.get("resultado"), "nota": obj.get("nota"),
        "t": obj.get("fecha"), "ronda": obj.get("ronda"),
    }


def leer_registro(ruta: str | Path) -> list[dict[str, Any]]:
    """Lee un JSONL tolerando líneas rotas (se saltan) y la ausencia del archivo."""
    try:
        texto = Path(ruta).read_text(encoding="utf-8")
    except OSError:
        return []
    return [o for o in (normalizar(linea) for linea in texto.splitlines() if linea.strip()) if o is not None]


def lineas_espejo(texto: str, desde_iso: str | None, hasta_iso: str | None) -> list[str]:
    """Espejo y enlaces.log `<iso> web (nombre) <iso> …` (ble.rs:1763-1775): ISO de recepción en la ventana."""
    desde, hasta = _fecha(desde_iso), _fecha(hasta_iso)
    salida: list[str] = []
    for linea in texto.splitlines():
        m = _ISO.match(linea)
        t = _fecha(m.group(1)) if m else None
        if t is None or (desde is not None and t < desde) or (hasta is not None and t > hasta):
            continue
        salida.append(linea)
    return salida


def ultimo_censo(texto: str) -> dict[str, dict[str, str | None]]:
    """La última línea `censo neurona=… rol=… …` de cada neurona; `-` → None."""
    salida: dict[str, dict[str, str | None]] = {}
    for linea in texto.splitlines():
        m = _CENSO.search(linea)
        if not m:
            continue
        campos: dict[str, str | None] = {}
        for trozo in m.group(1).split():
            clave, sep, valor = trozo.partition("=")
            if sep:
                campos[clave] = None if valor == "-" else valor
        neurona = campos.pop("neurona", None)
        if neurona and neurona != "-":
            salida[neurona] = campos
    return salida


def id_canonico(prueba_id: str, tabla: Any) -> str | None:
    """Batería, registro o `prueba N` → id canónico; None si no se conoce."""
    texto = str(prueba_id or "").strip()
    if not texto:
        return None
    canon = _mapa(tabla).get(texto.lower())
    if canon is not None:
        return canon
    m = _PRUEBA.match(texto.lower())
    return f"PRB-{int(m.group(1))}" if m else None


def _mapa(tabla: Any) -> dict[str, str]:
    """Mapa alias→canónico en minúsculas; {} si la tabla no sirve."""
    if isinstance(tabla, (str, Path)):
        try:
            tabla = json.loads(Path(tabla).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
    equivalencias = tabla.get("equivalencias", tabla) if isinstance(tabla, dict) else None
    if not isinstance(equivalencias, dict):
        return {}
    return {str(k).strip().lower(): str(v) for k, v in equivalencias.items() if isinstance(v, str)}
