#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Matriz «tipo de trabajo × modelo» (CAP1126E).

Aprende de progreso.json (integradas, fallos, segundos y coste por escritor;
ya existe merito_escritores) y de los resultados de las sugerencias aprobadas:
tipos Rust/nativo, UI/React, lógica TypeScript, pruebas, Python del puente,
documentación/contratos, arquitectura. Se recalcula a diario y la usa CAP1126A
para elegir el mejor modelo (gratis primero cuando rinde igual). Informe corto
en el pulso: qué modelo gana en cada tipo y por qué.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# ──────────────────────────────────────────────────────────────────────────────
# Tipos y constantes
# ──────────────────────────────────────────────────────────────────────────────

TIPOS_TRABAJO = [
    "rust_nativo",
    "ui_react",
    "logica_typescript",
    "pruebas",
    "python_puente",
    "documentacion_contratos",
    "arquitectura",
]

ESTADOS_BUENOS = ("commit", "integrada")
ESTADOS_MALOS = ("fallo_tsc", "fallo_tests", "bloqueada", "rechazada", "sin_cambios")

# Umbral para que un modelo de pago supere a uno gratis: necesita 1.5x la tasa de acierto
UMBRAL_PAGO_VS_GRATIS = 1.5

# Caché del recálculo diario
_CACHE_MATRIZ: dict[str, Any] | None = None
_CACHE_TIMESTAMP: float = 0.0
_CACHE_TTL_SEGUNDOS = 24 * 3600  # 24 horas

# Ruta por defecto de progreso.json
PROGRESO_PATH = Path(os.environ.get("STARSEED_ROOT", "~/Documents/starseed-os-main")).expanduser() / "starseed_memory_root" / "olas" / "progreso.json"


@dataclass
class EstadisticasModelo:
    """Estadísticas de un modelo para un tipo de trabajo."""
    aciertos: int = 0
    intentos: int = 0
    segundos_total: int = 0
    coste_total_usd: float = 0.0
    sugerencias_exito: int = 0
    sugerencias_total: int = 0

    @property
    def tasa_acierto(self) -> float:
        return self.aciertos / self.intentos if self.intentos > 0 else 0.0

    @property
    def segundos_promedio(self) -> float:
        return self.segundos_total / self.aciertos if self.aciertos > 0 else 0.0

    @property
    def coste_promedio(self) -> float:
        return self.coste_total_usd / self.aciertos if self.aciertos > 0 else 0.0

    @property
    def es_gratis(self) -> bool:
        return self.coste_total_usd == 0.0


@dataclass
class ResultadoTipo:
    """Resultado para un tipo de trabajo."""
    mejor_modelo: str
    modelos: dict[str, EstadisticasModelo] = field(default_factory=dict)
    razon: str = ""


# ──────────────────────────────────────────────────────────────────────────────
# Lectura de progreso
# ──────────────────────────────────────────────────────────────────────────────

def _leer_progreso(ruta: Path | None = None) -> dict[str, Any]:
    """Lee progreso.json desde la ruta estándar o la dada."""
    ruta = ruta or PROGRESO_PATH
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


# ──────────────────────────────────────────────────────────────────────────────
# Cálculo de la matriz
# ──────────────────────────────────────────────────────────────────────────────

def _extraer_tipo_trabajo(tarea: dict[str, Any]) -> str | None:
    """Extrae el tipo de trabajo de una tarea."""
    # Primero busca tipo_trabajo explícito
    if "tipo_trabajo" in tarea:
        return tarea["tipo_trabajo"]
    # Si no, intenta inferirlo de los archivos
    archivos = tarea.get("archivos") or []
    if not archivos:
        return None
    # Inferencia simple basada en extensiones y rutas
    for arch in archivos:
        arch_str = str(arch).lower()
        if arch_str.endswith(".rs"):
            return "rust_nativo"
        if "ui" in arch_str or "component" in arch_str or arch_str.endswith(".tsx"):
            return "ui_react"
        if arch_str.endswith(".test.ts") or arch_str.endswith(".test.tsx") or "test" in arch_str:
            return "pruebas"
        if "puente" in arch_str or arch_str.startswith("scripts/puente/"):
            return "python_puente"
        if arch_str.endswith(".md") or "doc" in arch_str or "contrato" in arch_str:
            return "documentacion_contratos"
        if "architect" in arch_str or "architecture" in arch_str:
            return "arquitectura"
    # Por defecto: lógica TypeScript
    return "logica_typescript"


def _es_modelo_gratis(modelo: str, coste: float) -> bool:
    """Determina si un modelo es gratis (coste 0 o proveedor conocido gratis)."""
    if coste == 0.0:
        return True
    # Proveedores conocidos gratis
    proveedores_gratis = ("gratis/", ":free", "nvidia/", "google/", "nim/")
    return any(p in modelo.lower() for p in proveedores_gratis)


def _calcular_puntuacion(est: EstadisticasModelo, sugerencias_exito: int = 0, sugerencias_total: int = 0) -> float:
    """Calcula puntuación compuesta: tasa de acierto + bonus velocidad + bonus gratis."""
    if est.intentos == 0:
        return 0.0

    # Tasa de acierto (Wilson lower bound aproximado)
    p = est.tasa_acierto
    n = est.intentos
    if n > 0:
        z = 1.96
        centro = p + z * z / (2 * n)
        margen = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
        wilson = max(0.0, (centro - margen) / (1 + z * z / n))
    else:
        wilson = 0.0

    # Bonus por velocidad (inverso del tiempo, normalizado)
    bonus_velocidad = 0.0
    if est.segundos_promedio > 0:
        # Más rápido = mejor. Normalizado contra 60s base.
        bonus_velocidad = min(0.1, 60.0 / est.segundos_promedio * 0.05)

    # Bonus por ser gratis
    bonus_gratis = 0.15 if est.es_gratis else 0.0

    # Bonus por sugerencias aprobadas
    bonus_sugerencias = 0.0
    if sugerencias_total > 0:
        bonus_sugerencias = (sugerencias_exito / sugerencias_total) * 0.1

    return wilson + bonus_velocidad + bonus_gratis + bonus_sugerencias


def calcular_matriz(
    progreso: dict[str, Any],
    sugerencias_aprobadas: list[dict[str, Any]] | None = None,
) -> dict[str, ResultadoTipo]:
    """Calcula la matriz tipo_trabajo × modelo a partir de progreso.json.

    Args:
        progreso: Diccionario con el contenido de progreso.json
        sugerencias_aprobadas: Lista opcional de sugerencias de CAP1126A con
            campos: tipo_trabajo, modelo, resultado (exito/fallo), segundos

    Returns:
        Diccionario {tipo_trabajo: ResultadoTipo}
    """
    # Acumular estadísticas por (tipo, modelo)
    stats: dict[str, dict[str, EstadisticasModelo]] = {}

    # 1. Procesar progreso.json
    for tid, tarea in (progreso or {}).items():
        if not isinstance(tarea, dict):
            continue
        modelo = tarea.get("modelo")
        if not isinstance(modelo, str) or "/" not in modelo:
            continue
        estado = tarea.get("estado")
        tipo = _extraer_tipo_trabajo(tarea)
        if not tipo:
            continue

        segundos = int(tarea.get("segundos", 0) or 0)
        coste = float(tarea.get("coste_usd", 0.0) or 0.0)

        tipo_stats = stats.setdefault(tipo, {})
        est = tipo_stats.setdefault(modelo, EstadisticasModelo())

        est.intentos += 1
        if estado in ESTADOS_BUENOS:
            est.aciertos += 1
            est.segundos_total += segundos
            est.coste_total_usd += coste
        elif estado in ESTADOS_MALOS:
            # Fallo cuenta como intento pero no como acierto
            pass

    # 2. Procesar sugerencias aprobadas
    if sugerencias_aprobadas:
        for sug in sugerencias_aprobadas:
            if not isinstance(sug, dict):
                continue
            tipo = sug.get("tipo_trabajo")
            modelo = sug.get("modelo")
            resultado = sug.get("resultado")
            if not (tipo and modelo and resultado):
                continue
            if tipo not in TIPOS_TRABAJO:
                continue

            segundos = int(sug.get("segundos", 0) or 0)

            tipo_stats = stats.setdefault(tipo, {})
            est = tipo_stats.setdefault(modelo, EstadisticasModelo())

            est.sugerencias_total += 1
            if resultado == "exito":
                est.sugerencias_exito += 1
                est.aciertos += 1  # Cuenta como acierto adicional
                est.segundos_total += segundos
            else:
                est.intentos += 1  # Cuenta como intento fallido

    # 3. Determinar mejor modelo por tipo
    resultado: dict[str, ResultadoTipo] = {}
    for tipo, modelos in stats.items():
        if not modelos:
            continue

        # Calcular puntuación para cada modelo
        puntuaciones = {}
        for modelo, est in modelos.items():
            puntuaciones[modelo] = _calcular_puntuacion(
                est,
                est.sugerencias_exito,
                est.sugerencias_total,
            )

        # Ordenar por puntuación descendente
        ordenados = sorted(puntuaciones.items(), key=lambda x: (-x[1], x[0]))
        mejor = ordenados[0][0]

        # Generar razón
        est_mejor = modelos[mejor]
        razon_partes = []
        if est_mejor.es_gratis:
            razon_partes.append("gratis")
        if est_mejor.tasa_acierto > 0:
            razon_partes.append(f"{est_mejor.aciertos}/{est_mejor.intentos} aciertos")
        if est_mejor.segundos_promedio > 0:
            razon_partes.append(f"{est_mejor.segundos_promedio:.0f}s promedio")
        razon = " · ".join(razon_partes) if razon_partes else "sin datos"

        resultado[tipo] = ResultadoTipo(
            mejor_modelo=mejor,
            modelos=modelos,
            razon=razon,
        )

    return resultado


# ──────────────────────────────────────────────────────────────────────────────
# Recalculo diario con caché
# ──────────────────────────────────────────────────────────────────────────────

def recalcular_diario(forzar: bool = False, ruta_progreso: Path | None = None) -> dict[str, ResultadoTipo]:
    """Recalcula la matriz diariamente (con caché de 24h).

    Args:
        forzar: Ignora la caché y recalcula siempre
        ruta_progreso: Ruta alternativa a progreso.json

    Returns:
        Matriz calculada {tipo: ResultadoTipo}
    """
    global _CACHE_MATRIZ, _CACHE_TIMESTAMP

    ahora = time.time()
    if not forzar and _CACHE_MATRIZ is not None and (ahora - _CACHE_TIMESTAMP) < _CACHE_TTL_SEGUNDOS:
        return _CACHE_MATRIZ

    progreso = _leer_progreso(ruta_progreso)
    _CACHE_MATRIZ = calcular_matriz(progreso)
    _CACHE_TIMESTAMP = ahora
    return _CACHE_MATRIZ


# ──────────────────────────────────────────────────────────────────────────────
# Informe para el pulso
# ──────────────────────────────────────────────────────────────────────────────

def informe_pulso(matriz: dict[str, ResultadoTipo]) -> str:
    """Genera informe corto para el pulso diario.

    Formato: "tipo: modelo (razón); tipo: modelo (razón)..."
    """
    if not matriz:
        return "Matriz vacía: sin datos de progreso aún."

    lineas = []
    for tipo in TIPOS_TRABAJO:
        if tipo not in matriz:
            continue
        r = matriz[tipo]
        lineas.append(f"{tipo}: {r.mejor_modelo} ({r.razon})")

    return "; ".join(lineas)


def mejor_modelo_para(tipo: str, matriz: dict[str, ResultadoTipo] | None = None) -> str | None:
    """Devuelve el mejor modelo para un tipo de trabajo.

    Usa la matriz dada o recalcula si no se proporciona.
    """
    if matriz is None:
        matriz = recalcular_diario()
    if tipo not in matriz:
        return None
    return matriz[tipo].mejor_modelo


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Uso: python3 matriz_modelos_trabajo.py <comando> [args]")
        print("Comandos:")
        print("  matriz          - Muestra la matriz completa")
        print("  informe         - Informe corto para el pulso")
        print("  mejor <tipo>    - Mejor modelo para un tipo")
        print("  recalcular      - Fuerza recálculo ignorando caché")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "matriz":
        m = recalcular_diario()
        for tipo, r in m.items():
            print(f"\n{tipo}:")
            print(f"  Mejor: {r.mejor_modelo} ({r.razon})")
            for modelo, est in r.modelos.items():
                print(f"    {modelo}: {est.aciertos}/{est.intentos} aciertos, "
                      f"{est.segundos_promedio:.0f}s, ${est.coste_promedio:.4f}, "
                      f"sug: {est.sugerencias_exito}/{est.sugerencias_total}")

    elif cmd == "informe":
        m = recalcular_diario()
        print(informe_pulso(m))

    elif cmd == "mejor":
        if len(sys.argv) < 3:
            print("Falta tipo de trabajo")
            sys.exit(1)
        tipo = sys.argv[2]
        m = recalcular_diario()
        mejor = mejor_modelo_para(tipo, m)
        print(mejor or "sin datos")

    elif cmd == "recalcular":
        m = recalcular_diario(forzar=True)
        print("Recalculado:", informe_pulso(m))

    else:
        print(f"Comando desconocido: {cmd}")
        sys.exit(1)