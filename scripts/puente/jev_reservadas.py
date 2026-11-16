# -*- coding: utf-8 -*-
"""Decisiones que Jev y Laya nunca toman solos.

Módulo puro sin red ni acceso al sistema de archivos.
"""

from typing import Final

RESERVADAS: Final[tuple[str, ...]] = (
    "integrar-main",
    "publicar",
    "push",
    "desplegar",
    "borrar-datos",
    "bajar-privacidad",
    "gasto-sobre-techo",
    "claves-permisos",
    "migraciones",
    "funciona-verificacion",
    "informe-veraz",
    "cambiar-umbrales-propios",
)

_RESERVADAS_SET: Final[set[str]] = set(RESERVADAS)


def _normalizar(dominio: str | None) -> str:
    if dominio is None:
        return ""
    return dominio.strip().lower().replace("_", "-").replace(" ", "-")


def exige_humano(dominio: str | None) -> bool:
    """True si el dominio está reservado (requiere decisión humana).

    Normaliza mayúsculas, guiones, guiones bajos y espacios.
    Desconocido -> False.
    """
    return _normalizar(dominio) in _RESERVADAS_SET


def solo_puede_vetar(dominio: str | None) -> bool:
    """Alias de exige_humano: indica que Jev/Laya solo pueden vetar, nunca aprobar."""
    return exige_humano(dominio)