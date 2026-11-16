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
    "entrenar-laya",
    "afinar-adaptador",
)

_RESERVADAS_NORMALIZADAS = frozenset(RESERVADAS)


def _normalizar(dominio: str) -> str:
    partes = dominio.strip().casefold().replace("-", " ").split()
    return "-".join(partes)


def exige_humano(dominio: str) -> bool:
    return _normalizar(dominio) in _RESERVADAS_NORMALIZADAS


solo_puede_vetar = exige_humano
