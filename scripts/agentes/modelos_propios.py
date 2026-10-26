# -*- coding: utf-8 -*-
"""Puente de modelos de los motores de agentes (ola 1023A).

Servidor propio de IA → pasarela de Experiential → OpenRouter ``:free``; gratis
primero, relevo ante 429/402 y ninguna clave impresa.
"""
from __future__ import annotations
import json
import os
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Mapping, Sequence
SERVIDOR_IA = "http://127.0.0.1:4480/v1"
PASARELA = "STARSEED_PASARELA_EXPLABS"
OPENROUTER = "https://openrouter.ai/api/v1"
RUTA_ENV = "~/.starseed/env"
MODELOS_OPENROUTER = {
    "texto": "meta-llama/llama-3.3-70b-instruct:free", "razon": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "codigo": "qwen/qwen3-coder:free", "decision": "nvidia/nemotron-3-nano-30b-a3b:free", "vision": "google/gemma-4-31b-it:free"}
_ALIAS = {"chat": "texto", "texto": "texto", "redaccion": "texto", "redacción": "texto", "fast": "texto",
          "rapida": "texto", "rápida": "texto", "reasoning": "razon", "razon": "razon", "razón": "razon",
          "razonamiento": "razon", "coding": "codigo", "code": "codigo", "codigo": "codigo", "código": "codigo",
          "reflejo": "decision", "decision": "decision", "decisiones": "decision", "vision": "vision",
          "visión": "vision", "imagen-entrada": "vision", "tools": "texto", "tool": "texto", "general": "texto"}
_PISTAS = {
    "texto": ("bitnet", "turbo", "ollama", "lmstudio", "luna", "clef", "flash", "chat"),
    "razon": ("turbo", "ollama", "lmstudio", "bitnet", "luna", "reason", "think", "clef"),
    "codigo": ("bitnet", "ollama", "lmstudio", "turbo", "code", "coder", "deepseek", "glm"),
    "decision": ("laya", "bitnet", "ollama", "lmstudio", "luna", "decision", "clef", "flash"),
    "vision": ("ollama", "lmstudio", "bitnet", "turbo", "vision", "vl", "omni", "luna"),
}
class CapacidadNoSoportada(ValueError):
    pass
@dataclass(frozen=True)
class ClienteOpenAI:
    """Destino listo para el SDK: ``base_url`` + ``modelo`` + clave privada."""
    proveedor: str
    base_url: str
    modelo: str
    api_key: str = field(default="", repr=False)
    capacidad: str = "texto"
    model = property(lambda self: self.modelo)

    def __iter__(self):
        yield self.base_url
        yield self.modelo
    def __getitem__(self, clave: str):
        return getattr(self, "modelo" if clave == "model" else clave)

    def __repr__(self) -> str:
        clave = "***" if self.api_key else ""
        return f"ClienteOpenAI(proveedor={self.proveedor!r}, base_url={self.base_url!r}, modelo={self.modelo!r}, api_key={clave!r})"

def normalizar_capacidad(capacidad: str | None) -> str:
    clave = (capacidad or "texto").strip().lower()
    if clave not in _ALIAS:
        raise CapacidadNoSoportada(f"«{capacidad}» no va por chat OpenAI-compatible")
    return _ALIAS[clave]

def leer_entorno(ruta: str = RUTA_ENV, base: Mapping[str, str] | None = None) -> dict[str, str]:
    """Entorno más ``~/.starseed/env``; lee las claves, jamás las imprime."""
    entorno = dict(os.environ if base is None else base)
    try:
        lineas = Path(ruta).expanduser().read_text(encoding="utf-8").splitlines()
    except OSError:
        return entorno
    for linea in lineas:
        nombre, _, valor = linea.strip().partition("=")
        nombre, valor = nombre.strip(), valor.strip().strip('"').strip("'")
        if nombre and valor and not nombre.startswith("#") and nombre.replace("_", "").isalnum():
            entorno[nombre] = valor
    return entorno

def modelos_del_servidor(base_url: str = SERVIDOR_IA, segundos: float = 1.5, token: str = "") -> list[str]:
    peticion = urllib.request.Request(base_url.rstrip("/") + "/models", headers={"Authorization": f"Bearer {token}"} if token else {})
    try:
        with urllib.request.urlopen(peticion, timeout=segundos) as respuesta:
            datos = json.loads(respuesta.read().decode("utf-8"))
    except (OSError, ValueError):
        return []
    return [m["id"] for m in (datos.get("data", []) if isinstance(datos, dict) else []) if isinstance(m, dict) and isinstance(m.get("id"), str)]

def _elegir(modelos: Iterable[str], capacidad: str) -> str | None:
    lista = [m for m in modelos if isinstance(m, str) and m]
    for pista in _PISTAS[capacidad]:
        for modelo in lista:
            if pista in modelo.lower():
                return modelo
    return lista[0] if lista else None

def _local(capacidad: str, entorno: Mapping[str, str], catalogo) -> ClienteOpenAI | None:
    if catalogo is None:
        modelos = modelos_del_servidor(entorno.get("STARSEED_SERVIDOR_IA_URL", SERVIDOR_IA), token=entorno.get("STARSEED_SERVIDOR_IA_TOKEN", ""))
    else:
        modelos = list(catalogo() if callable(catalogo) else catalogo)
    forzado = next((entorno[v].strip() for v in ("STARSEED_AGENTES_MODELO_LOCAL", "STARSEED_SERVIDOR_IA_MODELO") if entorno.get(v, "").strip()), "")
    modelo = forzado or _elegir(modelos, capacidad)
    base = entorno.get("STARSEED_SERVIDOR_IA_URL", SERVIDOR_IA).rstrip("/")
    return ClienteOpenAI("servidor-propio", base, modelo, entorno.get("STARSEED_SERVIDOR_IA_TOKEN", "") or "sin-clave", capacidad) if modelo else None

def _pasarela(capacidad: str, entorno: Mapping[str, str]) -> ClienteOpenAI | None:
    base = entorno.get(PASARELA + "_URL", "").strip()
    modelos = [m.strip() for m in entorno.get(PASARELA + "_MODELOS", "").split(",") if m.strip()]
    if entorno.get(PASARELA + "_MODELO", "").strip():
        modelos = [entorno[PASARELA + "_MODELO"].strip()]
    modelo = _elegir(modelos, capacidad) if base else None
    return ClienteOpenAI("experiential", base.rstrip("/"), modelo, entorno.get(PASARELA + "_KEY", "") or "sin-clave", capacidad) if modelo else None

def _openrouter(capacidad: str, entorno: Mapping[str, str]) -> ClienteOpenAI:
    modelo = entorno.get("STARSEED_AGENTES_OPENROUTER_MODELO", "").strip() or MODELOS_OPENROUTER[capacidad]
    return ClienteOpenAI("openrouter", OPENROUTER, modelo, entorno.get("OPENROUTER_API_KEY", "") or "sin-clave", capacidad)

def cliente_openai_compatible(capacidad: str = "texto", *, entorno: Mapping[str, str] | None = None,
                              catalogo_local: Sequence[str] | Callable[[], Sequence[str]] | None = None,
                              ruta_env: str = RUTA_ENV) -> ClienteOpenAI:
    """Primer destino del enrutador propio: local → Experiential → OpenRouter ``:free``."""
    cap = normalizar_capacidad(capacidad)
    env = leer_entorno(ruta_env) if entorno is None else dict(entorno)
    return _local(cap, env, catalogo_local) or _pasarela(cap, env) or _openrouter(cap, env)
