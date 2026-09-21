"""Selección pura de modelos del catálogo vivo de Anthropic."""

import re


ORDEN_FAMILIAS = {"haiku": 0, "sonnet": 1, "opus": 2}


def cabeceras_api(clave: str, contenido: bool = False) -> dict[str, str]:
    """Construye las cabeceras nativas exigidas por la API de Anthropic."""
    cabeceras = {
        "x-api-key": clave,
        "anthropic-version": "2023-06-01",
        "User-Agent": "starseed-enjambre/2 (+starseed-os)",
    }
    if contenido:
        cabeceras["Content-Type"] = "application/json"
    return cabeceras


def _familia(valor: str) -> str | None:
    """Reconoce una familia como palabra completa, no como subcadena accidental."""
    piezas = re.split(r"[^a-z0-9]+", valor.lower())
    return next((familia for familia in ORDEN_FAMILIAS if familia in piezas), None)


def ordenar_por_precio(modelos: list[dict]) -> list[str]:
    """Devuelve ids por coste de familia y, dentro de ella, por novedad."""
    validos: list[tuple[str, str, str]] = []
    for modelo in modelos:
        identificador = modelo.get("id")
        if not isinstance(identificador, str) or not identificador:
            continue
        nombre = modelo.get("display_name")
        familia = _familia(
            " ".join((identificador, nombre if isinstance(nombre, str) else ""))
        )
        if familia is None:
            continue
        creado = modelo.get("created_at")
        validos.append(
            (familia, creado if isinstance(creado, str) else "", identificador)
        )

    # Dos ordenaciones estables: primero novedad descendente y después coste ascendente.
    validos.sort(key=lambda item: (item[1], item[2]), reverse=True)
    validos.sort(key=lambda item: ORDEN_FAMILIAS[item[0]])
    return [identificador for _, _, identificador in validos]


def escalon(nivel: int, ids: list[str]) -> str | None:
    """Elige Haiku o Sonnet; Opus queda reservado a una decisión humana."""
    familia = {1: "haiku", 2: "sonnet"}.get(nivel)
    if familia is None:
        return None
    return next(
        (identificador for identificador in ids if _familia(identificador) == familia),
        None,
    )
