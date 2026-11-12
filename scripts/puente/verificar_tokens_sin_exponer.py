# -*- coding: utf-8 -*-
"""Verificar que no hay tokens reales expuestos en el código actual.

Por qué existe: El Dream mencionó un posible riesgo de token `gho_` en remoto `astraura`.
Este módulo verifica que el código actual no expone tokens reales.

Un token es considerado "falso" (de prueba) si:
- Usa caracteres secuenciales como abcdefghijklmnopqrstuvwxyz o abcdefg12345
- Usa patrones comunes de test como 11AAAAAA, sk-abc, sk-false
"""

import os
import re

PATRON_TOKEN = re.compile(
    r"(?:ghp_[a-zA-Z0-9]{30,}|gho_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9]{30,}|"
    r"sk-[a-zA-Z0-9]{20,}|xox[bap]-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9]{20,})"
)

TOKEN_FALSO = re.compile(
    r"(?:abcdefghijklmnopqrstuvwxyz|abcdefghijklmnop|abcdefg12345|11AAAAAA|"
    r"a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0|sk-abcdefgh|sk-1234567890|"
    r"AIzaSy1234567890abcdefg|sk-abc123|ghp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8)"
)


def es_token_falso(texto: str) -> bool:
    """Detecta si un token parece ser de prueba/falso."""
    return bool(TOKEN_FALSO.search(texto))


def buscar_tokens_reales_en_archivo(ruta: str) -> list[tuple[int, str]]:
    """Devuelve lista de (número de línea, línea) con tokens REALS (no de prueba)."""
    resultados = []
    if not os.path.isfile(ruta):
        return resultados

    try:
        with open(ruta, "r", encoding="utf-8", errors="ignore") as f:
            for num, linea in enumerate(f, 1):
                if PATRON_TOKEN.search(linea) and not TOKEN_FALSO.search(linea):
                    resultados.append((num, linea.rstrip()))
    except Exception:
        pass
    return resultados


def verificar_repositorio_sin_tokens_reales(ruta_repo: str = ".") -> dict[str, list]:
    """Escanea el repositorio entero y devuelve tokens REALS expuestos."""
    hallados: dict[str, list] = {}
    extensiones = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".env", ".yaml", ".yml", ".toml", ".cfg", ".ini"}

    for raiz, _, archivos in os.walk(ruta_repo):
        if "node_modules" in raiz or ".git" in raiz or "dist" in raiz:
            continue
        for nombre in archivos:
            _, ext = os.path.splitext(nombre)
            if ext.lower() in extensiones:
                ruta_completa = os.path.join(raiz, nombre)
                coincidencias = buscar_tokens_reales_en_archivo(ruta_completa)
                if coincidencias:
                    hallados[ruta_completa] = coincidencias
    return hallados


def verificar_memory_root_sin_tokens_reales() -> dict[str, list]:
    """Escanea el starseed_memory_root para tokens REALS expuestos."""
    raiz = "starseed_memory_root"
    if not os.path.isdir(raiz):
        return {}

    hallados: dict[str, list] = {}
    for raiz_actual, _, archivos in os.walk(raiz):
        for nombre in archivos:
            ruta_completa = os.path.join(raiz_actual, nombre)
            coincidencias = buscar_tokens_reales_en_archivo(ruta_completa)
            if coincidencias:
                hallados[ruta_completa] = coincidencias
    return hallados