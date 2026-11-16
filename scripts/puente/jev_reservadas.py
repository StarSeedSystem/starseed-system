"""Decisiones que Jev y Laya nunca pueden aprobar por sí solas."""

import re

RESERVADAS: tuple[str, ...] = (
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


def _normalizar(dominio: str) -> str:
    """Reduce mayúsculas y separadores al nombre de dominio canónico."""
    return re.sub(r"[\s_-]+", "-", str(dominio).strip().lower()).strip("-")


def exige_humano(dominio: str) -> bool:
    """Indica si la decisión exige aprobación humana."""
    return _normalizar(dominio) in RESERVADAS


def solo_puede_vetar(dominio: str) -> bool:
    """Alias explícito: en una decisión reservada, Jev y Laya pueden vetar y avisar, nunca aprobar."""
    return exige_humano(dominio)
