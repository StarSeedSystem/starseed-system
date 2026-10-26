#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puente de modelos del enrutador propio para los motores de agentes (AGF1023B).

Orden de la casa: servidor propio de IA (127.0.0.1:4480/v1) → pasarela de Experiential
(``STARSEED_PASARELA_EXPLABS_*``) → OpenRouter. De OpenRouter solo se aceptan ids
``:free``. Todo acceso externo se inyecta: las pruebas no tocan red ni claves.
"""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Callable, Mapping

try:  # admite tanto ``import modelos_propios`` como ``scripts.agentes.modelos_propios``
    from .enrutador_propio import (  # noqa: F401  (se reexportan para los adaptadores)
        ClienteOpenAI, elegir_modelo, modelos_gratuitos, parsear_env,
    )
except ImportError:
    from enrutador_propio import (  # noqa: F401
        ClienteOpenAI, elegir_modelo, modelos_gratuitos, parsear_env,
    )

ENV = "~/.starseed/env"
GRATUITOS = "~/.starseed/openrouter-gratuitos.json"
SERVIDOR_IA = "http://127.0.0.1:4480/v1"
EXPLABS = "https://api.experientiallabs.ai/v1"
OPENROUTER = "https://openrouter.ai/api/v1"
TIEMPO_S = 2.0


def _leer_archivo(ruta: str) -> str:
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _valores(entorno: Mapping[str, object] | None,
             leer_env: Callable[[], str] | None) -> dict[str, str]:
    """Entorno efectivo: primero el archivo de claves, luego lo ya exportado."""
    valores: dict[str, str] = {}
    if leer_env is not None:
        try:
            valores.update(parsear_env(leer_env()))
        except OSError:
            pass
    elif entorno is None:
        valores.update(parsear_env(_leer_archivo(ENV)))
    valores.update(os.environ if entorno is None else entorno)
    return {str(k): str(v) for k, v in valores.items() if isinstance(v, (str, int, float))}


def _lista(texto: object) -> list[str]:
    return [t.strip() for t in str(texto or "").split(",") if t.strip()]


def _sondear(base_url: str, clave: str = "") -> list[str] | None:
    """Sondeo de ``GET /models``. Nunca imprime la clave; si falla, devuelve None."""
    cabeceras = {"Accept": "application/json"}
    if clave:
        cabeceras["Authorization"] = "Bearer " + clave
    try:
        peticion = urllib.request.Request(base_url.rstrip("/") + "/models", headers=cabeceras)
        with urllib.request.urlopen(peticion, timeout=TIEMPO_S) as respuesta:
            return modelos_gratuitos(json.loads(respuesta.read().decode("utf-8")))
    except Exception:
        return None


def cliente_openai_compatible(
    capacidad: str = "texto",
    *,
    entorno: Mapping[str, object] | None = None,
    leer_env: Callable[[], str] | None = None,
    leer_archivo: Callable[[str], str] | None = None,
    sonda: Callable[[str, str], list[str] | None] | None = None,
) -> ClienteOpenAI | None:
    """Cliente del enrutador propio: propio → Experiential → OpenRouter ``:free``."""
    v = _valores(entorno, leer_env)
    sonda = sonda or _sondear
    lector = leer_archivo or (_leer_archivo if entorno is None and leer_env is None else (lambda _r: ""))
    sufijo = capacidad.upper()

    base = (v.get("STARSEED_SERVIDOR_IA_URL") or SERVIDOR_IA).rstrip("/")
    clave = v.get("STARSEED_SERVIDOR_IA_TOKEN", "")
    catalogo = sonda(base, clave)
    modelo = v.get("STARSEED_SERVIDOR_IA_MODELO_" + sufijo) or v.get("STARSEED_SERVIDOR_IA_MODELO")
    modelo = modelo or elegir_modelo(catalogo, capacidad)
    if modelo and catalogo is not None:
        return ClienteOpenAI(base, modelo, clave, "servidor-propio")

    base = (v.get("STARSEED_PASARELA_EXPLABS_URL") or EXPLABS).rstrip("/")
    clave = v.get("STARSEED_PASARELA_EXPLABS_KEY", "")
    if clave:
        lista = _lista(v.get("STARSEED_PASARELA_EXPLABS_MODELO_" + sufijo)
                       or v.get("STARSEED_PASARELA_EXPLABS_MODELOS"))
        modelo = elegir_modelo(lista, capacidad) or elegir_modelo(sonda(base, clave), capacidad)
        if modelo:
            return ClienteOpenAI(base, modelo, clave, "experiential")

    base = (v.get("STARSEED_OPENROUTER_URL") or OPENROUTER).rstrip("/")
    clave = v.get("OPENROUTER_API_KEY", "")
    if not clave:
        return None
    lista = _lista(v.get("STARSEED_OPENROUTER_MODELO_" + sufijo)
                   or v.get("STARSEED_OPENROUTER_MODELO")
                   or v.get("STARSEED_OPENROUTER_MODELOS"))
    if not lista:
        ruta = v.get("STARSEED_OPENROUTER_GRATUITOS") or GRATUITOS
        try:
            lista = modelos_gratuitos(json.loads(lector(ruta)))
        except (TypeError, ValueError):
            lista = []
    lista = lista or sonda(base, clave) or []
    modelo = elegir_modelo([m for m in lista if m.lower().endswith(":free")], capacidad)
    return ClienteOpenAI(base, modelo, clave, "openrouter:free") if modelo else None
