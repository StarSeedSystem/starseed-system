#!/usr/bin/env python3
"""Puente de modelos del enrutador propio para cualquier motor de agentes.

Devuelve un cliente compatible con OpenAI (base_url, modelo y clave) sin SDK para los
adaptadores de agno, Mastra, LangGraph, Pydantic AI y OpenAI Agents SDK. Orden: servidor
propio de IA de la neurona (`http://127.0.0.1:4480/v1`) → pasarela de Experiential
(`STARSEED_PASARELA_EXPLABS_*`) → OpenRouter, solo `:free`. La clave nunca se imprime.
"""
from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence
SERVIDOR_IA = "http://127.0.0.1:4480/v1"
EXPLABS = "https://api.experientiallabs.ai/v1"
OPENROUTER = "https://openrouter.ai/api/v1"
RUTA_ENV = "~/.starseed/env"
MODELOS_OPENROUTER = {
    "chat": "meta-llama/llama-3.3-70b-instruct:free", "codigo": "qwen/qwen3-coder:free",
    "vision": "google/gemma-4-31b-it:free",
    "razonamiento": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "rapido": "nvidia/nemotron-nano-9b-v2:free",
}
ALIASES = {"código": "codigo", "code": "codigo", "visión": "vision", "imagen": "vision",
           "reasoning": "razonamiento", "decisión": "razonamiento", "rápido": "rapido",
           "fast": "rapido", "general": "chat"}
PISTAS = {"codigo": ("coder", "code"), "vision": ("vl", "vision", "gemma", "llava"),
          "razonamiento": ("reason", "thinker", "nemotron"), "rapido": ("nano", "flash"),
          "chat": ("instruct", "chat", "bitnet")}
def _leer_env(archivo: str | Path) -> dict[str, str]:
    """Lee un archivo de entorno sin exportarlo ni imprimir ningún valor."""
    try:
        lineas = Path(archivo).expanduser().read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    pares = (linea.strip().removeprefix("export ").split("=", 1) for linea in lineas
             if "=" in linea and not linea.strip().startswith("#"))
    return {nombre.strip(): valor.strip().strip('"').strip("'") for nombre, valor in pares}

def _entorno(entorno: Mapping[str, str] | None, archivo_env: str | Path | None) -> dict[str, str]:
    """Entorno inyectado o, en producción, el del proceso sobre `~/.starseed/env`."""
    if entorno is not None:
        return {**_leer_env(archivo_env), **entorno} if archivo_env else dict(entorno)
    return {**_leer_env(archivo_env or RUTA_ENV), **os.environ}
def _capacidad(nombre: str | None) -> str:
    """Normaliza la capacidad pedida; cualquier desconocida se comporta como chat."""
    clave = (nombre or "chat").strip().lower()
    clave = ALIASES.get(clave, clave)
    return clave if clave in MODELOS_OPENROUTER else "chat"

def _lista(valor: str | None) -> list[str]:
    return [parte.strip() for parte in (valor or "").split(",") if parte.strip()]

def _base(valor: str | None, defecto: str) -> str:
    return (valor or defecto).rstrip("/")

def _sondeo_http(base_url: str) -> list[str]:
    """Modelos del servidor propio (`GET /models`); vacío si no contesta."""
    try:
        with urllib.request.urlopen(f"{base_url}/models", timeout=0.6) as respuesta:
            datos = json.load(respuesta)
    except Exception:
        return []
    filas = datos.get("data") if isinstance(datos, dict) else None
    return [fila["id"] for fila in filas or []
            if isinstance(fila, dict) and isinstance(fila.get("id"), str)]

@dataclass(frozen=True)
class ClientePropio:
    """Destino OpenAI-compatible; `__repr__` nunca imprime la clave."""

    proveedor: str
    base_url: str
    modelo: str
    clave: str | None = None

    def __repr__(self) -> str:
        clave = "***" if self.clave else None
        return (f"ClientePropio(proveedor={self.proveedor!r}, base_url={self.base_url!r}, "
                f"modelo={self.modelo!r}, clave={clave!r})")

def cliente_openai_compatible(
    capacidad: str = "chat", *, entorno: Mapping[str, str] | None = None,
    archivo_env: str | Path | None = None,
    sonda_local: Callable[[str], Sequence[str]] | None = None,
) -> ClientePropio:
    """Primer destino disponible del enrutador propio, en el orden documentado."""
    return cadena_openai_compatible(capacidad, entorno=entorno, archivo_env=archivo_env,
                                    sonda_local=sonda_local)[0]

def cadena_openai_compatible(
    capacidad: str = "chat", *, entorno: Mapping[str, str] | None = None,
    archivo_env: str | Path | None = None,
    sonda_local: Callable[[str], Sequence[str]] | None = None,
) -> list[ClientePropio]:
    """Todos los destinos disponibles, en orden, para relevar ante 429/402."""
    env, cap, cadena = _entorno(entorno, archivo_env), _capacidad(capacidad), []
    base_local = _base(env.get("STARSEED_SERVIDOR_IA_URL"), SERVIDOR_IA)
    modelos = list((sonda_local or _sondeo_http)(base_local) or [])
    if modelos:
        elegido = next((m for m in modelos if any(p in m.lower() for p in PISTAS[cap])),
                       modelos[0])
        cadena.append(ClientePropio("servidor-propio", base_local, elegido,
                                    env.get("STARSEED_SERVIDOR_IA_TOKEN") or None))
    clave = env.get("STARSEED_PASARELA_EXPLABS_KEY") or env.get("EXPLABS_API_KEY")
    modelos = _lista(env.get("STARSEED_PASARELA_EXPLABS_MODELOS")) or _lista(
        env.get("STARSEED_PASARELA_EXPLABS_MODELO"))
    if clave and modelos:
        base = _base(env.get("STARSEED_PASARELA_EXPLABS_BASE_URL")
                     or env.get("STARSEED_PASARELA_EXPLABS_URL"), EXPLABS)
        cadena.append(ClientePropio("experiential", base, modelos[0], clave))
    modelo = env.get("STARSEED_OPENROUTER_MODELO") or ""
    if not modelo.endswith(":free"):
        modelo = MODELOS_OPENROUTER[cap]
    cadena.append(ClientePropio("openrouter", _base(env.get("STARSEED_OPENROUTER_URL"), OPENROUTER),
                                modelo, env.get("OPENROUTER_API_KEY") or None))
    return cadena
