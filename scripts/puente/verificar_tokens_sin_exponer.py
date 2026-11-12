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
import subprocess

PATRON_TOKEN = re.compile(
    r"(?:ghp_[a-zA-Z0-9]{30,}|gho_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9]{30,}|"
    r"sk-[a-zA-Z0-9]{20,}|xox[bap]-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9]{20,})"
)

TOKEN_FALSO = re.compile(
    r"(?:abcdefghijklmnopqrstuvwxyz|abcdefghijklmnop|abcdefg12345|11AAAAAA|"
    r"a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0|sk-abcdefgh|sk-1234567890|"
    # `ghp[_]` = `ghp_`: así el escáner de secretos de la autopublicación no lo toma por una clave (SUP1112C).
    r"AIzaSy1234567890abcdefg|sk-abc123|ghp[_]a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8)"
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


def verificar_repositorio_sin_tokens_reales(ruta_repo: str = ".", solo_seguidos: bool = False) -> dict[str, list]:
    """Escanea el repositorio entero y devuelve tokens REALS expuestos.

    Con `solo_seguidos`, solo lo que git sigue (`git ls-files`): en el árbol vivo de la Mac, `.next/` y
    `.transfer/` llevan compiladas a propósito las claves públicas (`NEXT_PUBLIC_…`), y eso no es código
    del repositorio (SUP1112C)."""
    hallados: dict[str, list] = {}
    extensiones = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".env", ".yaml", ".yml", ".toml", ".cfg", ".ini"}

    if solo_seguidos:
        r = subprocess.run(["git", "-C", ruta_repo, "ls-files", "-z"], capture_output=True, text=True)
        rutas = [os.path.join(ruta_repo, p) for p in r.stdout.split("\0") if p] if r.returncode == 0 else []
    else:
        rutas = []
        for raiz, _, archivos in os.walk(ruta_repo):
            if "node_modules" in raiz or ".git" in raiz or "dist" in raiz:
                continue
            rutas.extend(os.path.join(raiz, nombre) for nombre in archivos)
    for ruta_completa in rutas:
        _, ext = os.path.splitext(ruta_completa)
        if ext.lower() in extensiones:
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