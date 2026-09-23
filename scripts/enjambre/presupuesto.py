"""Presupuesto multiventana con reserva, ritmo y cuotas desconocidas explícitas.

Módulo puro: sin IO ni dependencias externas. Decide si un coste estimado cabe
en todas las ventanas de cuota observadas, aplicando reserva de seguridad y un
ritmo que reparte el consumo a lo largo de cada ventana.
"""

from __future__ import annotations

import math

MOTIVO_NO_VERIFICADO = "no_verificado"
MOTIVO_DATOS_INVALIDOS = "datos_invalidos"
MOTIVO_DATOS_CADUCADOS = "datos_caducados"
MOTIVO_VENTANA_VENCIDA = "ventana_vencida"
MOTIVO_RESERVA = "reserva_agotada"
MOTIVO_RITMO = "ritmo_excedido"


def _es_finito(valor: object) -> bool:
    return (
        isinstance(valor, (int, float))
        and not isinstance(valor, bool)
        and math.isfinite(valor)
    )


def _validar_ventana(v: dict, ahora: float, antiguedad_max: float) -> str | None:
    """None si la ventana es válida; motivo de rechazo en caso contrario."""
    if not isinstance(v, dict):
        return MOTIVO_DATOS_INVALIDOS
    if not isinstance(v.get("unidad"), str) or not v["unidad"]:
        return MOTIVO_DATOS_INVALIDOS
    for clave in ("limite", "usado", "inicio", "reinicio", "observado"):
        if not _es_finito(v.get(clave)):
            return MOTIVO_DATOS_INVALIDOS
    reservado = v.get("reservado", 0.0)
    if not _es_finito(reservado):
        return MOTIVO_DATOS_INVALIDOS
    if v["limite"] <= 0 or v["usado"] < 0 or reservado < 0:
        return MOTIVO_DATOS_INVALIDOS
    # La ventana debe tener duración positiva para repartir el ritmo.
    if v["reinicio"] <= v["inicio"]:
        return MOTIVO_DATOS_INVALIDOS
    # Coherencia temporal: nada de fotos del futuro ni ventanas ya vencidas.
    if v["observado"] < v["inicio"] or v["observado"] > ahora:
        return MOTIVO_DATOS_INVALIDOS
    if ahora >= v["reinicio"]:
        return MOTIVO_VENTANA_VENCIDA
    if ahora - v["observado"] > antiguedad_max:
        return MOTIVO_DATOS_CADUCADOS
    return None


def decidir_presupuesto(
    ventanas: list[dict] | None,
    costes: dict[str, float] | None,
    ahora: float,
    reserva: float = 0.2,
    antiguedad_max: float = 900.0,
    rafaga: float = 0.05,
) -> dict:
    """Decide si el coste estimado cabe en TODAS las ventanas observadas.

    Devuelve {"permitido": bool, "motivos": list[str], "reintentar_en": float|None}.
    """
    motivos: list[str] = []
    reintentar_en: float | None = None

    if (
        not isinstance(ventanas, list)
        or not ventanas
        or not isinstance(costes, dict)
        or not _es_finito(ahora)
    ):
        return {
            "permitido": False,
            "motivos": [MOTIVO_NO_VERIFICADO],
            "reintentar_en": None,
        }

    # Costes: cada estimación debe ser finita y no negativa; falta => no verificado.
    for unidad, coste in costes.items():
        if not _es_finito(coste) or coste < 0:
            return {
                "permitido": False,
                "motivos": [MOTIVO_NO_VERIFICADO],
                "reintentar_en": None,
            }

    for v in ventanas:
        motivo = _validar_ventana(v, ahora, antiguedad_max)
        if motivo is not None:
            if motivo not in motivos:
                motivos.append(motivo)
            if motivo == MOTIVO_DATOS_INVALIDOS:
                reintentar_en = None
            continue

        reservado = v.get("reservado", 0.0)
        coste = costes.get(v["unidad"])
        if coste is None:
            if MOTIVO_NO_VERIFICADO not in motivos:
                motivos.append(MOTIVO_NO_VERIFICADO)
            continue

        total = v["usado"] + reservado + coste
        techo = v["limite"] * (1.0 - reserva)
        if techo <= 0:
            if MOTIVO_DATOS_INVALIDOS not in motivos:
                motivos.append(MOTIVO_DATOS_INVALIDOS)
            reintentar_en = None
            continue
        if total > techo:
            if MOTIVO_RESERVA not in motivos:
                motivos.append(MOTIVO_RESERVA)
            # La reserva no se libera hasta el reinicio de la ventana.
            if reintentar_en is None or v["reinicio"] < reintentar_en:
                reintentar_en = float(v["reinicio"])
            continue

        tramo = v["reinicio"] - v["inicio"]
        fraccion = min(1.0, (ahora - v["inicio"]) / tramo + rafaga)
        if total > techo * fraccion:
            if MOTIVO_RITMO not in motivos:
                motivos.append(MOTIVO_RITMO)
            # Instante exacto en que el ritmo permitiría este total.
            objetivo = total / techo - rafaga
            instante = v["inicio"] + objetivo * tramo
            instante = min(instante, float(v["reinicio"]))
            if reintentar_en is None or instante < reintentar_en:
                reintentar_en = instante

    if motivos == [MOTIVO_DATOS_INVALIDOS]:
        reintentar_en = None
    return {
        "permitido": not motivos,
        "motivos": motivos,
        "reintentar_en": reintentar_en,
    }
