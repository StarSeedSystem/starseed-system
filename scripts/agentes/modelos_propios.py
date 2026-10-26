#!/usr/bin/env python3
"""Puente de modelos propios para cualquier motor de agentes (2026-10-23).

Un contrato de agente, varios motores (agno, mastra, langgraph, pydantic-ai,
openai-agents-python): todos usan un cliente compatible con OpenAI y los modelos salen
del enrutador propio, gratis primero: servidor de IA de la neurona (127.0.0.1:4480/v1),
pasarela de Experiential (STARSEED_PASARELA_EXPLABS_* de ~/.starseed/env) y OpenRouter
solo :free. Nunca se imprime una clave: se devuelve el NOMBRE de su variable. `relevar`
pasa al siguiente ante 429/402 y devuelve None al final (no se insiste). Pruebas sin red.
"""
from __future__ import annotations

import os
import urllib.error
import urllib.request

ARCHIVOS_DE_CLAVES = ("~/.starseed/env", "~/.hermes/.env")
SERVIDOR_IA = "http://127.0.0.1:4480/v1"
EXPLABS = "https://api.experientiallabs.ai/v1"
OPENROUTER = "https://openrouter.ai/api/v1"
MODELO_LOCAL = "bitnet/bitnet-b1.58-2b-4t"
GRATIS_OPENROUTER = ("deepseek/deepseek-v4-flash-0731:free", "nex-agi/nex-n2.5-pro:free")

def cliente(proveedor, base_url, modelo, capacidad, gratis=True, clave_env=None, motivo=""):
    """Un destino OpenAI-compatible ya resuelto. ``clave_env`` es un NOMBRE, no el valor."""
    return dict(proveedor=proveedor, base_url=base_url, modelo=modelo, capacidad=capacidad,
                gratis=gratis, clave_env=clave_env, motivo=motivo)

def _entorno(entorno=None):
    """Entorno efectivo: inyectado, o proceso + archivos de claves (solo nombres)."""
    if entorno is not None:
        return {str(k): str(v) for k, v in entorno.items() if v is not None}
    salida = dict(os.environ)
    for ruta in ARCHIVOS_DE_CLAVES:
        try:
            with open(os.path.expanduser(ruta), encoding="utf-8") as f:
                for linea in f:
                    nombre, _, valor = linea.strip().partition("=")
                    if valor and not nombre.startswith("#"):
                        salida.setdefault(nombre.strip().removeprefix("export ").strip(), valor.strip().strip("\"'"))
        except OSError: pass
    return salida

def _primero(env, *nombres):
    """El primer valor no vacío de ``nombres``. PURA."""
    for nombre in nombres:
        valor = str(env.get(nombre) or "").strip()
        if valor:
            return valor
    return ""

def _lista(texto):
    """Ids separados por comas, sin espacios ni vacíos. PURA."""
    return [x.strip() for x in str(texto or "").split(",") if x.strip()]

def _modelo(env, prefijo, capacidad, defecto):
    """Modelo por capacidad (``PREFIJO_<CAPACIDAD>``) con el genérico de respaldo. PURA."""
    cap = str(capacidad or "chat").upper().replace("-", "_").replace(" ", "_")
    return _primero(env, f"{prefijo}_{cap}", prefijo) or defecto

def _responde(proveedor, base_url, timeout=0.6):
    """¿Contesta el servidor local en ``/v1/models``? Sondeo corto; se inyecta."""
    try:
        with urllib.request.urlopen(base_url.rstrip("/") + "/models", timeout=timeout) as r:
            return 200 <= int(r.status) < 500
    except urllib.error.HTTPError as e:
        return int(e.code) in (401, 403)  # vivo, aunque pida token
    except Exception: return False  # noqa: BLE001

def candidatos(capacidad="chat", *, entorno=None, disponible=None):
    """Proveedores disponibles para ``capacidad``, en el orden del enrutador propio."""
    env, sondeo, fuera = _entorno(entorno), disponible or _responde, []
    if str(env.get("STARSEED_SERVIDOR_IA", "1")).strip() != "0":
        base = (_primero(env, "STARSEED_SERVIDOR_IA_URL") or SERVIDOR_IA).rstrip("/")
        modelo = _modelo(env, "STARSEED_SERVIDOR_IA_MODELO", capacidad, MODELO_LOCAL)
        if sondeo("servidor-ia", base):
            fuera.append(cliente("servidor-ia", base, modelo, capacidad, True, None,
                                 "motor local de la neurona"))
    clave = _primero(env, "STARSEED_PASARELA_EXPLABS_KEY", "EXPLABS_API_KEY")
    modelos = _lista(_primero(env, "STARSEED_PASARELA_EXPLABS_MODELOS"))
    if clave and modelos:
        base = (_primero(env, "STARSEED_PASARELA_EXPLABS_URL") or EXPLABS).rstrip("/")
        modelo = _modelo(env, "STARSEED_PASARELA_EXPLABS_MODELO", capacidad, modelos[0])
        fuera.append(cliente("explabs", base, modelo if modelo in modelos else modelos[0],
                             capacidad, True, "STARSEED_PASARELA_EXPLABS_KEY",
                             "pasarela de Experiential (gratis o promoción)"))
    clave = _primero(env, "OPENROUTER_API_KEY", "OPENROUTER_SHARED_KEY")
    if clave:
        base = (_primero(env, "STARSEED_OPENROUTER_URL") or OPENROUTER).rstrip("/")
        modelos = _lista(_primero(env, "STARSEED_OPENROUTER_MODELOS")) or list(GRATIS_OPENROUTER)
        modelo = _modelo(env, "STARSEED_OPENROUTER_MODELO", capacidad, modelos[0])
        if not modelo.endswith(":free"):
            modelo = next((m for m in modelos if m.endswith(":free")), GRATIS_OPENROUTER[0])
        fuera.append(cliente("openrouter", base, modelo, capacidad, True, "OPENROUTER_API_KEY", "OpenRouter, solo :free"))
    return fuera

def cliente_openai_compatible(capacidad="chat", *, entorno=None, disponible=None):
    """El primer proveedor del enrutador propio para ``capacidad``, o None si no hay."""
    return next(iter(candidatos(capacidad, entorno=entorno, disponible=disponible)), None)

def relevar(usado, capacidad="chat", *, entorno=None, disponible=None):
    """El siguiente tras ``usado`` (429/402); None si ya no queda ninguno."""
    cadena = candidatos(capacidad, entorno=entorno, disponible=disponible)
    nombres = [c["proveedor"] for c in cadena]
    nombre = usado.get("proveedor") if isinstance(usado, dict) else str(usado or "")
    if nombre not in nombres:
        return cadena[0] if cadena else None
    i = nombres.index(nombre) + 1
    return cadena[i] if i < len(cadena) else None

def cabeceras(destino, entorno=None):
    """Cabeceras para llamar al destino. La clave se lee del entorno y NUNCA se imprime."""
    env = _entorno(entorno)
    clave = env.get(destino.get("clave_env") or "") or ""
    fuera = {"Content-Type": "application/json"}
    if clave:
        fuera["Authorization"] = "Bearer " + clave
    if destino.get("proveedor") == "openrouter":
        fuera.update({"HTTP-Referer": "https://starseed-os.vercel.app", "X-Title": "StarSeed OS - Genesis"})
    return fuera
