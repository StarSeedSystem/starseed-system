#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sintesis_avances · hitos de la síntesis en el chat (SIN1116B §3.2).

Publica una línea por hito sin duplicar:
- Arranque 06:30: agentes y tema del día
- Agentes: cada uno terminado, con propuestas nuevas y descartadas por repetidas
- Redacción: qué modelo o NotebookLM
- Entrega: enlace al Doc y resumen
- Multiformato: avance n/9 e índice final
- Si a las 09:00 no hay síntesis: «va retrasada por <motivo>; MetaGenesis está en <acción>»
- Al día siguiente: seguimiento de recomendaciones de ayer (aprobadas, encargadas, integradas)

Núcleo puro con E/S inyectable. Estado en ~/.starseed/sintesis/avances-<fecha>.json
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Optional

# ────────────────────────────── constantes ──────────────────────────────

DIR_ESTADO = Path.home() / ".starseed" / "sintesis"
DIR_ESTADO.mkdir(parents=True, exist_ok=True)

HITOS_TIPOS = (
    "arranque",
    "agente",
    "redaccion",
    "entrega",
    "multiformato",
    "retraso",
    "seguimiento",
)

ZONA_MEXICO = "America/Mexico_City"
HORA_ARRANQUE = 6.5      # 06:30
HORA_RETRASO = 9.0       # 09:00


# ────────────────────────────── utilidades puras ──────────────────────────────

def _fecha_cdmx(ahora: Optional[float] = None) -> str:
    """Fecha en zona horaria de Ciudad de México (AAAA-MM-DD)."""
    if ahora is None:
        ahora = time.time()
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(ZONA_MEXICO)
        return datetime.fromtimestamp(ahora, tz).date().isoformat()
    except Exception:
        return datetime.fromtimestamp(ahora, timezone.utc).date().isoformat()


def _hora_cdmx(ahora: Optional[float] = None) -> float:
    """Hora decimal en zona horaria de Ciudad de México."""
    if ahora is None:
        ahora = time.time()
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(ZONA_MEXICO)
        dt = datetime.fromtimestamp(ahora, tz)
        return dt.hour + dt.minute / 60.0
    except Exception:
        dt = datetime.fromtimestamp(ahora, timezone.utc)
        return dt.hour + dt.minute / 60.0


def _archivo_estado(fecha: str) -> Path:
    """Ruta del archivo de estado para una fecha."""
    return DIR_ESTADO / f"avances-{fecha}.json"


def _leer_estado(fecha: str) -> dict[str, Any]:
    """Lee el estado de hitos para una fecha."""
    ruta = _archivo_estado(fecha)
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"fecha": fecha, "hitos": [], "enviados": set()}


def _escribir_estado(fecha: str, estado: dict[str, Any]) -> None:
    """Escribe el estado de hitos para una fecha (atómico)."""
    ruta = _archivo_estado(fecha)
    tmp = ruta.with_suffix(".tmp")
    # Convert set to list for JSON serialization
    datos = dict(estado)
    if "enviados" in datos and isinstance(datos["enviados"], set):
        datos["enviados"] = list(datos["enviados"])
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    tmp.replace(ruta)


def _clave_hito(tipo: str, detalle: str = "") -> str:
    """Genera clave única para un hito (para deduplicación)."""
    base = f"{tipo}:{detalle}".lower().strip()
    return re.sub(r"[^a-z0-9:_\-]", "_", base)[:80]


def _ya_enviado(estado: dict[str, Any], clave: str) -> bool:
    """Verifica si un hito ya fue enviado."""
    enviados = estado.get("enviados", [])
    if isinstance(enviados, set):
        return clave in enviados
    return clave in set(enviados)


def _marcar_enviado(estado: dict[str, Any], clave: str) -> None:
    """Marca un hito como enviado."""
    if "enviados" not in estado:
        estado["enviados"] = set()
    elif isinstance(estado["enviados"], list):
        estado["enviados"] = set(estado["enviados"])
    estado["enviados"].add(clave)
    estado["hitos"].append({
        "clave": clave,
        "timestamp": time.time(),
        "tipo": clave.split(":")[0] if ":" in clave else clave,
    })


# ────────────────────────────── generadores de líneas ──────────────────────────────

def linea_arranque(agentes: list[str], tema: str) -> str:
    """Línea de arranque: '06:30: agentes y tema del día'."""
    agentes_str = ", ".join(agentes) if agentes else "sin agentes definidos"
    return f"06:30: {agentes_str} · {tema}"


def linea_agente(nombre: str, nuevas: int, descartadas: int) -> str:
    """Línea de agente terminado: 'Agente X: N nuevas, M descartadas por repetidas'."""
    partes = []
    if nuevas > 0:
        partes.append(f"{nuevas} nuevas")
    if descartadas > 0:
        partes.append(f"{descartadas} descartadas por repetidas")
    detalle = "; ".join(partes) if partes else "sin cambios"
    return f"Agente {nombre}: {detalle}"


def linea_redaccion(modelo: str, via: str = "modelo") -> str:
    """Línea de redacción: 'Redacción: NotebookLM (gemini-flash-lite)' o 'Redacción: modelo X'."""
    if via == "notebooklm":
        return f"Redacción: NotebookLM ({modelo})"
    return f"Redacción: {modelo}"


def linea_entrega(enlace_doc: str, resumen_chars: int) -> str:
    """Línea de entrega: 'Entrega: <enlace> - Resumen de X caracteres'."""
    return f"Entrega: {enlace_doc} - Resumen de {resumen_chars} caracteres"


def linea_multiformato(completados: int, total: int = 9, final: bool = False) -> str:
    """Línea de multiformato: 'Multiformato: 3/9 completados' o 'Multiformato: 9/9 ✓ índice final'."""
    if final:
        return f"Multiformato: {total}/{total} ✓ índice final"
    return f"Multiformato: {completados}/{total} completados"


def linea_retraso(motivo: str, accion: str) -> str:
    """Línea de retraso a las 09:00: 'va retrasada por <motivo>; MetaGenesis está en <acción>'."""
    return f"va retrasada por {motivo}; MetaGenesis está en {accion}"


def linea_seguimiento(aprobadas: int, encargadas: int, integradas: int, rechazadas: int = 0, ya_existen: int = 0) -> str:
    """Línea de seguimiento al día siguiente: 'Seguimiento: X aprobadas, Y encargadas, Z integradas'."""
    partes = []
    if aprobadas > 0:
        partes.append(f"{aprobadas} aprobadas")
    if encargadas > 0:
        partes.append(f"{encargadas} encargadas")
    if integradas > 0:
        partes.append(f"{integradas} integradas")
    if rechazadas > 0:
        partes.append(f"{rechazadas} rechazadas")
    if ya_existen > 0:
        partes.append(f"{ya_existen} ya existían")
    if not partes:
        return "Seguimiento: sin recomendaciones previas"
    return f"Seguimiento: {', '.join(partes)}"


# ────────────────────────────── API principal ──────────────────────────────

def registrar_hito(
    tipo: str,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
    **kwargs,
) -> Optional[str]:
    """Registra un hito y devuelve la línea para el chat (None si duplicado).

    Args:
        tipo: Tipo de hito ('arranque', 'agente', 'redaccion', 'entrega', 'multiformato', 'retraso', 'seguimiento')
        fecha: Fecha en AAAA-MM-DD (default: hoy en CDMX)
        ahora: Timestamp para testing (default: time.time())
        **kwargs: Parámetros según tipo:
            - arranque: agentes=list[str], tema=str
            - agente: nombre=str, nuevas=int, descartadas=int
            - redaccion: modelo=str, via='modelo'|'notebooklm'
            - entrega: enlace_doc=str, resumen_chars=int
            - multiformato: completados=int, total=9, final=bool
            - retraso: motivo=str, accion=str
            - seguimiento: aprobadas, encargadas, integradas, rechazadas, ya_existen (todos int)

    Returns:
        Línea formateada para el chat, o None si ya se envió este hito.
    """
    if tipo not in HITOS_TIPOS:
        raise ValueError(f"Tipo de hito inválido: {tipo}. Válidos: {HITOS_TIPOS}")

    if fecha is None:
        fecha = _fecha_cdmx(ahora)
    if ahora is None:
        ahora = time.time()

    estado = _leer_estado(fecha)

    # Generar línea y clave según tipo
    if tipo == "arranque":
        linea = linea_arranque(kwargs.get("agentes", []), kwargs.get("tema", ""))
        clave = _clave_hito(tipo, kwargs.get("tema", ""))
    elif tipo == "agente":
        linea = linea_agente(kwargs.get("nombre", ""), kwargs.get("nuevas", 0), kwargs.get("descartadas", 0))
        clave = _clave_hito(tipo, kwargs.get("nombre", ""))
    elif tipo == "redaccion":
        linea = linea_redaccion(kwargs.get("modelo", ""), kwargs.get("via", "modelo"))
        clave = _clave_hito(tipo, kwargs.get("modelo", ""))
    elif tipo == "entrega":
        linea = linea_entrega(kwargs.get("enlace_doc", ""), kwargs.get("resumen_chars", 0))
        clave = _clave_hito(tipo, kwargs.get("enlace_doc", "")[:50])
    elif tipo == "multiformato":
        final = kwargs.get("final", False)
        if final:
            linea = linea_multiformato(kwargs.get("total", 9), kwargs.get("total", 9), final=True)
        else:
            linea = linea_multiformato(kwargs.get("completados", 0), kwargs.get("total", 9))
        clave = _clave_hito(tipo, f"{kwargs.get('completados', 0)}" if not final else "final")
    elif tipo == "retraso":
        linea = linea_retraso(kwargs.get("motivo", ""), kwargs.get("accion", ""))
        clave = _clave_hito(tipo, kwargs.get("motivo", "")[:30])
    elif tipo == "seguimiento":
        linea = linea_seguimiento(
            kwargs.get("aprobadas", 0), kwargs.get("encargadas", 0),
            kwargs.get("integradas", 0), kwargs.get("rechazadas", 0), kwargs.get("ya_existen", 0)
        )
        clave = _clave_hito(tipo, fecha)
    else:
        return None

    # Deduplicación
    if _ya_enviado(estado, clave):
        return None

    _marcar_enviado(estado, clave)
    _escribir_estado(fecha, estado)
    return linea


def verificar_retraso(
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
    hay_sintesis: bool = False,
    motivo: str = "redacción en curso",
    accion: str = "generando síntesis",
) -> Optional[str]:
    """Verifica si a las 09:00 CDMX hay síntesis; si no, registra hito de retraso.

    Args:
        fecha: Fecha a verificar (default: hoy CDMX)
        ahora: Timestamp para testing
        hay_sintesis: True si ya existe síntesis válida para hoy
        motivo: Motivo del retraso
        accion: Acción actual de MetaGenesis

    Returns:
        Línea de retraso si procede, None si no (ya hay síntesis o no son las 09:00).
    """
    if fecha is None:
        fecha = _fecha_cdmx(ahora)
    if ahora is None:
        ahora = time.time()

    hora = _hora_cdmx(ahora)
    if hora < HORA_RETRASO:
        return None  # Aún no son las 09:00

    if hay_sintesis:
        return None  # Ya hay síntesis, no hay retraso

    # Verificar si ya se envió aviso de retraso hoy
    estado = _leer_estado(fecha)
    clave_retraso = _clave_hito("retraso", motivo[:30])
    if _ya_enviado(estado, clave_retraso):
        return None

    return registrar_hito("retraso", fecha=fecha, ahora=ahora, motivo=motivo, accion=accion)


def generar_seguimiento(
    fecha_ayer: Optional[str] = None,
    ahora: Optional[float] = None,
    recomendaciones_ayer: Optional[list[dict[str, Any]]] = None,
    leer_recomendaciones_fn: Optional[Callable[[], list[dict[str, Any]]]] = None,
) -> Optional[str]:
    """Genera línea de seguimiento de recomendaciones del día anterior.

    Args:
        fecha_ayer: Fecha de ayer en CDMX (AAA-MM-DD)
        ahora: Timestamp para testing
        recomendaciones_ayer: Lista de recomendaciones (inyectable para testing)
        leer_recomendaciones_fn: Función para leer recomendaciones (inyectable)

    Returns:
        Línea de seguimiento formateada.
    """
    if fecha_ayer is None:
        hoy = _fecha_cdmx(ahora)
        ayer_dt = datetime.fromisoformat(hoy) - timedelta(days=1)
        fecha_ayer = ayer_dt.date().isoformat()

    # Obtener recomendaciones de ayer
    if recomendaciones_ayer is not None:
        recs = recomendaciones_ayer
    elif leer_recomendaciones_fn is not None:
        recs = leer_recomendaciones_fn()
    else:
        # Fallback: leer de libro_recomendaciones
        try:
            from libro_recomendaciones import listar_recomendaciones
            recs = listar_recomendaciones()
        except ImportError:
            recs = []

    # Filtrar por fecha de ayer
    recs_ayer = [r for r in recs if r.get("fecha", "").startswith(fecha_ayer)]

    # Contar por estado
    contadores = {"aprobada": 0, "encargada": 0, "integrada": 0, "rechazada": 0, "ya_existe": 0}
    for r in recs_ayer:
        estado = r.get("estado", "propuesta")
        if estado in contadores:
            contadores[estado] += 1

    if sum(contadores.values()) == 0:
        return None  # No hay recomendaciones de ayer

    return registrar_hito(
        "seguimiento",
        fecha=fecha_ayer,  # Se registra en la fecha de ayer
        ahora=ahora,
        aprobadas=contadores["aprobada"],
        encargadas=contadores["encargada"],
        integradas=contadores["integrada"],
        rechazadas=contadores["rechazada"],
        ya_existen=contadores["ya_existe"],
    )


def obtener_hitos_fecha(fecha: str) -> list[dict[str, Any]]:
    """Obtiene todos los hitos registrados para una fecha."""
    estado = _leer_estado(fecha)
    return estado.get("hitos", [])


def limpiar_estado_fecha(fecha: str) -> None:
    """Limpia el estado de una fecha (para testing)."""
    ruta = _archivo_estado(fecha)
    if ruta.exists():
        ruta.unlink()


# ────────────────────────────── integración con agente nativo y respaldo ──────────────────────────────

def hito_arranque_nativo(
    agentes: list[str],
    tema: str,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de arranque del agente nativo (06:30)."""
    return registrar_hito("arranque", fecha=fecha, ahora=ahora, agentes=agentes, tema=tema)


def hito_agente_nativo(
    nombre: str,
    nuevas: int,
    descartadas: int,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de agente nativo terminado."""
    return registrar_hito("agente", fecha=fecha, ahora=ahora, nombre=nombre, nuevas=nuevas, descartadas=descartadas)


def hito_redaccion_nativa(
    modelo: str,
    via: str = "modelo",
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de redacción del agente nativo."""
    return registrar_hito("redaccion", fecha=fecha, ahora=ahora, modelo=modelo, via=via)


def hito_entrega_nativa(
    enlace_doc: str,
    resumen_chars: int,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de entrega del agente nativo."""
    return registrar_hito("entrega", fecha=fecha, ahora=ahora, enlace_doc=enlace_doc, resumen_chars=resumen_chars)


def hito_multiformato_nativo(
    completados: int,
    total: int = 9,
    final: bool = False,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de multiformato del agente nativo."""
    return registrar_hito("multiformato", fecha=fecha, ahora=ahora, completados=completados, total=total, final=final)


# Versiones para el respaldo (mismo comportamiento, distinta procedencia en logs)
def hito_arranque_respaldo(
    agentes: list[str],
    tema: str,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de arranque del respaldo (08:30)."""
    return registrar_hito("arranque", fecha=fecha, ahora=ahora, agentes=agentes, tema=tema)


def hito_agente_respaldo(
    nombre: str,
    nuevas: int,
    descartadas: int,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de agente respaldo terminado."""
    return registrar_hito("agente", fecha=fecha, ahora=ahora, nombre=nombre, nuevas=nuevas, descartadas=descartadas)


def hito_redaccion_respaldo(
    modelo: str,
    via: str = "notebooklm",
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de redacción del respaldo (siempre via notebooklm)."""
    return registrar_hito("redaccion", fecha=fecha, ahora=ahora, modelo=modelo, via=via)


def hito_entrega_respaldo(
    enlace_doc: str,
    resumen_chars: int,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de entrega del respaldo."""
    return registrar_hito("entrega", fecha=fecha, ahora=ahora, enlace_doc=enlace_doc, resumen_chars=resumen_chars)


def hito_multiformato_respaldo(
    completados: int,
    total: int = 9,
    final: bool = False,
    fecha: Optional[str] = None,
    ahora: Optional[float] = None,
) -> Optional[str]:
    """Registra hito de multiformato del respaldo."""
    return registrar_hito("multiformato", fecha=fecha, ahora=ahora, completados=completados, total=total, final=final)


# ────────────────────────────── CLI / pruebas ──────────────────────────────

if __name__ == "__main__":
    import sys

    # Demo rápido
    if len(sys.argv) > 1 and sys.argv[1] == "demo":
        print("=== Demo sintesis_avances ===")
        hoy = _fecha_cdmx()
        limpiar_estado_fecha(hoy)

        print("\n1. Arranque:")
        linea = hito_arranque_nativo(["contactos", "noticias", "referencias", "actividad", "ideas", "guiones", "youtube"], "Síntesis diaria StarSeed")
        print(f"   {linea}")

        print("\n2. Agentes:")
        for nombre, nuevas, descartadas in [
            ("contactos", 5, 2), ("noticias", 3, 1), ("referencias", 4, 0),
            ("actividad", 2, 3), ("ideas", 6, 1), ("guiones", 2, 0), ("youtube", 3, 2),
        ]:
            linea = hito_agente_nativo(nombre, nuevas, descartadas)
            print(f"   {linea}")

        print("\n3. Redacción:")
        linea = hito_redaccion_nativa("gemini-1.5-flash-lite")
        print(f"   {linea}")

        print("\n4. Entrega:")
        linea = hito_entrega_nativa("https://docs.google.com/document/d/abc123", 2150)
        print(f"   {linea}")

        print("\n5. Multiformato progresivo:")
        for i in range(1, 10):
            linea = hito_multiformato_nativo(i)
            print(f"   {linea}")
        linea = hito_multiformato_nativo(9, final=True)
        print(f"   {linea}")

        print("\n6. Retraso (simulando 09:15 sin síntesis):")
        # Forzar hora 09:15 para demo
        linea = registrar_hito("retraso", fecha=hoy, ahora=time.time(), motivo="investigación profunda", accion="consultando fuentes")
        print(f"   {linea}")

        print("\n7. Seguimiento (simulando ayer):")
        ayer = (datetime.fromisoformat(hoy) - timedelta(days=1)).date().isoformat()
        recs_fake = [
            {"fecha": f"{ayer}T10:00:00", "estado": "aprobada"},
            {"fecha": f"{ayer}T11:00:00", "estado": "aprobada"},
            {"fecha": f"{ayer}T12:00:00", "estado": "encargada"},
            {"fecha": f"{ayer}T13:00:00", "estado": "integrada"},
            {"fecha": f"{ayer}T14:00:00", "estado": "rechazada"},
        ]
        linea = generar_seguimiento(fecha_ayer=ayer, recomendaciones_ayer=recs_fake)
        print(f"   {linea}")

        print("\n=== Estado guardado ===")
        estado = _leer_estado(hoy)
        print(json.dumps(estado, ensure_ascii=False, indent=2)[:2000])