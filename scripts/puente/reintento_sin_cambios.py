#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Da una segunda oportunidad a las tareas «sin_cambios» con otro proveedor.

POR QUÉ. 2026-09-12: apinex/free/muse-spark-1.3 devolvió 1,5 KB y cero diff en cuatro
tareas nuevas (p316E, MD7, zAR3, LT3). El orquestador las marcó `sin_cambios`, que no
es estado automático: el vigilante no las reintenta y nadie las reasigna. Se quedaron
pudriendo una ola entera.

Esto es módulo PURO: `candidatas` decide a quién reintentar y con qué modelo;
`marcar` devuelve el progreso nuevo con la tarea de vuelta a `pendiente`.
Escribir el archivo y anunciarlo es cosa del director.

Reglas:
  · solo `sin_cambios` cuyo id NO figure ya en main (misma regla de token entero que
    reconciliar_progreso.en_main);
  · nunca una tarea ya reintentada (reintentos >= 1): si el segundo proveedor tampoco
    escribe, que la vea una persona, no un bucle;
  · el modelo alternativo es el primero libre distinto del que la produjo;
  · excluir modelos cuyo proveedor esté caído o sin cupo hasta una hora futura.
"""

import ast
from datetime import datetime
from reconciliar_progreso import en_main

SIN_CAMBIOS = "sin_cambios"
NOTA_REINTENTO = "reintento por sin_cambios con %s"


def modelos_enjambre(ruta):
    """Lee la lista MODELOS de starseed-enjambre.py con ast, sin ejecutar el archivo."""
    arbol = ast.parse(open(ruta, encoding="utf-8").read(), ruta)
    for nodo in arbol.body:
        if isinstance(nodo, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == "MODELOS" for t in nodo.targets
        ):
            return list(ast.literal_eval(nodo.value))
    return []


def _parsear_datetime(valor):
    """Convierte string o datetime a datetime naive (UTC/local compatible).

    Acepta:
      - datetime: devuelve como está
      - 'YYYY-MM-DD HH:MM:SS' (naive): devuelve parsed
      - ISO 8601 con Z o ±HH:MM: convierte a naive sin offset
    """
    if isinstance(valor, datetime):
        return valor
    if isinstance(valor, str):
        # Formato orquestador: 'YYYY-MM-DD HH:MM:SS'
        if len(valor) == 19 and valor[10] == ' ':
            return datetime.strptime(valor, '%Y-%m-%d %H:%M:%S')
        # ISO con Z: 'YYYY-MM-DDTHH:MM:SSZ' → parse y quita Z
        if 'T' in valor and valor.endswith('Z'):
            return datetime.fromisoformat(valor.replace('Z', '+00:00')).replace(tzinfo=None)
        # ISO con offset: 'YYYY-MM-DDTHH:MM:SS±HH:MM' → parse y quita tzinfo
        if 'T' in valor and ('+' in valor or valor.rfind('-') > 10):
            return datetime.fromisoformat(valor).replace(tzinfo=None)
    raise ValueError(f"Formato de fecha no reconocido: {valor}")


def _proveedor_excluido(modelo, salud, ahora):
    """Devuelve True si el modelo debe excluirse por salud del proveedor.

    Un modelo se excluye si su proveedor está caído o sin cupo hasta una hora futura.
    El prefijo de proveedor es lo antes de la primera "/" (ej: 'apinex' de 'apinex/free/gemini').
    """
    if not salud or not modelo:
        return False

    # Extraer prefijo de proveedor: lo antes del primer "/"
    proveedor = modelo.split('/', 1)[0]

    # Buscar en salud (clave puede ser proveedor directo o variante)
    estado_prov = salud.get(proveedor, {})
    if not isinstance(estado_prov, dict):
        return False

    # Excluir si estado == "caido"
    if estado_prov.get("estado") == "caido":
        return True

    # Excluir si sin_cupo_hasta es posterior a ahora
    sin_cupo = estado_prov.get("sin_cupo_hasta")
    if sin_cupo:
        try:
            ahora_dt = _parsear_datetime(ahora)
            sin_cupo_dt = _parsear_datetime(sin_cupo)
            if sin_cupo_dt > ahora_dt:
                return True
        except Exception:
            # Si no se puede parsear, no excluir (mejor que quedarse sin opción)
            pass

    return False


def candidatas(progreso, asuntos_main, modelos_libres, salud=None, ahora=None):
    """Devuelve [(id, modelo_alternativo)] para cada sin_cambios reintentable.

    Args:
        progreso: dict de tareas (id → {estado, modelo, ...})
        asuntos_main: list de asuntos de commits en main
        modelos_libres: list de modelos disponibles
        salud: dict con salud de proveedores {proveedor: {estado, sin_cupo_hasta, ...}} o None
        ahora: string 'YYYY-MM-DD HH:MM:SS' o datetime (OBLIGATORIO)

    Levanta ValueError si ahora es None.
    """
    if ahora is None:
        raise ValueError("ahora es obligatorio (formato 'YYYY-MM-DD HH:MM:SS' o datetime)")

    salud = salud or {}
    elegidas = []

    for tid, v in progreso.items():
        if not isinstance(v, dict) or v.get("estado") != SIN_CAMBIOS:
            continue
        if en_main(tid, asuntos_main):  # ya está en main: era falso sin_cambios
            continue
        if (v.get("reintentos") or 0) >= 1:  # ya tuvo su segunda oportunidad
            continue

        # Filtrar modelos: excluir los del mismo proveedor, los caídos y los sin cupo
        modelos_validos = [
            m for m in modelos_libres
            if m != v.get("modelo")  # distinto del que la produjo
            and not _proveedor_excluido(m, salud, ahora)
        ]

        if not modelos_validos:  # sin alternativa válida
            continue

        modelo = modelos_validos[0]
        elegidas.append((tid, modelo))

    return elegidas


def marcar(progreso, tid, modelo):
    """Devuelve el progreso nuevo con la tarea de vuelta a pendiente. No toca el original."""
    p = {k: dict(v) if isinstance(v, dict) else v for k, v in progreso.items()}
    v = p[tid]
    v.update(
        estado="pendiente",
        reintentos=(v.get("reintentos") or 0) + 1,
        nota=NOTA_REINTENTO % modelo,
    )
    return p
