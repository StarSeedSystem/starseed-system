#!/usr/bin/env python3
"""Cuentas y papeles para la actividad diaria (SDP1111Qb · §4 y §5 de sintesis-diaria-autonoma).

Define los roles de cada cuenta y qué lector usa cuál. Módulo puro, sin red.
"""
from dataclasses import dataclass
from typing import Literal

Alias = Literal["alex", "fundacion"]
InstagramCuenta = Literal["sociedadstarseed", "maggasukha"]


@dataclass(frozen=True)
class CuentaPapel:
    alias: Alias
    correo: str
    para_que: str
    prioridad: int  # 1 = principal, 2 = secundario


CUENTAS: tuple[CuentaPapel, ...] = (
    CuentaPapel(
        alias="alex",
        correo="alexbordongarrigos@gmail.com",
        para_que="Drive principal, Docs, YouTube, NotebookLM, Takeout, Doc de síntesis",
        prioridad=1,
    ),
    CuentaPapel(
        alias="fundacion",
        correo="fundacionstarseed@gmail.com",
        para_que="Gmail enviados (comunidades/avisos), Drive y YouTube en segundo plano",
        prioridad=2,
    ),
)

INSTAGRAM_CUENTAS: tuple[dict, ...] = (
    {"cuenta": "sociedadstarseed", "origen": "fundacion", "para_que": "publicaciones propias y following"},
    {"cuenta": "maggasukha", "origen": "alex", "para_que": "guardados (referencias) y following (contactos/referencias)"},
)

CARPETA_ACTIVIDAD_DRIVE_ID = "1PvBnBhoxxNSBuCLSC2aQZ89Oe8mdJGB-"
SUBCARPETAS_INSTAGRAM = {
    "maggasukha": "19_ymNnvy4iDpVuCLDiC47GyG2j2DVQ5U",
    "sociedadstarseed": "1YWcHxOXG_zbE_Ea9ehuHCcVBGQcf0Z3U",
}


def papel_de(alias: Alias) -> CuentaPapel:
    """Devuelve el papel de una cuenta por su alias."""
    for cuenta in CUENTAS:
        if cuenta.alias == alias:
            return cuenta
    raise ValueError(f"Alias desconocido: {alias}")


def cuentas_para_gmail_enviados() -> tuple[Alias, ...]:
    """Gmail enviados: fundacion primero (correos a comunidades), alex después."""
    return ("fundacion", "alex")


def cuentas_para_drive_docs_youtube_notebooklm_takeout() -> tuple[Alias, ...]:
    """Drive, Docs, YouTube, NotebookLM, Takeout: alex primero (principal), fundacion después (menos frecuencia)."""
    return ("alex", "fundacion")


def cuenta_instagram_para(cuenta_ig: InstagramCuenta) -> Alias:
    """Devuelve el alias de Google correspondiente a una cuenta de Instagram."""
    for ic in INSTAGRAM_CUENTAS:
        if ic["cuenta"] == cuenta_ig:
            return ic["origen"]  # type: ignore[return-value]
    raise ValueError(f"Cuenta Instagram desconocida: {cuenta_ig}")


def subcarpeta_instagram_drive(cuenta_ig: InstagramCuenta) -> str:
    """Devuelve el ID de la subcarpeta de Drive para una cuenta de Instagram."""
    return SUBCARPETAS_INSTAGRAM[cuenta_ig]