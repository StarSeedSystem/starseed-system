"""Lógica pura para el servidor de oído Parakeet.

Este módulo contiene funciones puras para validar y normalizar la solicitud
de transcripción, y formatear la respuesta. No depende del modelo de transcripción
ni de ningún recurso externo, lo que permite probarlo sin red, micrófono o procesos.
"""

from __future__ import annotations

class ErrorValidacionSolicitud(Exception):
    """Excepción levantada cuando la solicitud de transcripción no es válida."""
    pass


def validar_y_normalizar_solicitud(partes: dict[str, bytes | str]) -> tuple[bytes, str, str]:
    """Valida y normaliza las partes de una solicitud de transcripción.

    Args:
        partes: Diccionario con las claves 'file' (bytes), 'model' (str) y 'language' (str).

    Returns:
        Tupla (audio_bytes, model_normalizado, language_normalizado).

    Raises:
        ErrorValidacionSolicitud: Si faltan partes, el modelo no es válido o el idioma está vacío.
    """
    # Verificar que todas las claves estén presentes
    required_keys = {"file", "model", "language"}
    if not required_keys.issubset(partes.keys()):
        missing = required_keys - set(partes.keys())
        raise ErrorValidacionSolicitud(f"Faltan campos obligatorios: {missing}")

    # Obtener los valores
    audio_bytes = partes["file"]
    model = partes["model"]
    language = partes["language"]

    # Verificar que audio_bytes sea bytes
    if not isinstance(audio_bytes, bytes):
        raise ErrorValidacionSolicitud("El campo 'file' debe ser de tipo bytes")

    # Verificar que model y language sean strings
    if not isinstance(model, str):
        raise ErrorValidacionSolicitud("El campo 'model' debe ser una cadena")
    if not isinstance(language, str):
        raise ErrorValidacionSolicitud("El campo 'language' debe ser una cadena")

    # Validar el modelo: solo se permite el modelo específico
    MODELO_ESPERADO = "nemo-parakeet-tdt-0.6b-v3"
    if model != MODELO_ESPERADO:
        raise ErrorValidacionSolicitud(
            f"Modelo no válido: se esperaba '{MODELO_ESPERADO}', se recibió '{model}'"
        )

    # Normalizar el idioma: convertir a minúsculas, eliminar espacios, y tomar la parte inicial antes de un guion
    language_norm = language.strip().lower()
    # Si hay un guion, tomar solo la primera parte (ej: es-MX -> es)
    if "-" in language_norm:
        language_norm = language_norm.split("-")[0]
    # Si después de esto está vacío, es un error
    if not language_norm:
        raise ErrorValidacionSolicitud("El idioma normalizado está vacío")

    # Devolver los valores: audio_bytes tal cual, el modelo validado (que es el esperado) y el idioma normalizado
    return audio_bytes, model, language_norm


def formatear_respuesta(texto: str, language: str) -> dict[str, str]:
    """Formatea la respuesta de transcripción en el formato esperado.

    Args:
        texto: Texto transcrito.
        language: Idioma normalizado de la transcripción.

    Returns:
        Diccionario con las claves 'text' y 'language'.
    """
    return {"text": texto, "language": language}