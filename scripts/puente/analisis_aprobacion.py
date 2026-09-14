from typing import Dict, List, Optional, Union
import json
import re

# Constantes
MOTIVO_RUTINA = "pedido por la cola"
REVISOR_RESPONDIO = "respondio"
REVISOR_BLOQUEANTE = "bloqueante"


def construir_prompt(ficha: Dict, diff: str, contexto: str) -> str:
    """Construye el prompt para el analista de aprobación.

    Args:
        ficha: Diccionario con la información de la ficha de la tarea.
        diff: Diferencias del código.
        contexto: Contexto adicional para el analista.

    Returns:
        str: Prompt para el analista.
    """
    # Recortar el diff a 24000 caracteres si es necesario
    diff_recortado = diff[:24000]
    recortado = len(diff) > 24000

    # Construir el prompt
    prompt = f"""
    Analiza el siguiente cambio de código y decide si debe ser aprobado, rechazado o marcado como dudoso.
    
    Información de la tarea:
    - ID: {ficha.get("id", "N/A")}
    - Título: {ficha.get("titulo", "N/A")}
    - Rama: {ficha.get("rama", "N/A")}
    - SHA: {ficha.get("sha", "N/A")}
    - Estado: {ficha.get("estado", "N/A")}
    - Modelo: {ficha.get("modelo", "N/A")}
    - Dificultad: {ficha.get("dificultad", "N/A")}
    - Revisor: {ficha.get("revisor", "N/A")}
    - Faltan: {ficha.get("faltan", "N/A")}
    - Motivo VB: {ficha.get("motivo_vb", "N/A")}
    
    Diferencias del código:
    {diff_recortado}
    {"[DIFERENCIAS RECORTADAS]" if recortado else ""}
    
    Contexto adicional:
    {contexto}
    
    Instrucciones:
    1. Decide si el cambio debe ser aprobado, rechazado o marcado como dudoso.
    2. Indica tu confianza en la decisión (alta, media, baja).
    3. Proporciona razones para tu veredicto.
    4. Identifica posibles riesgos.
    5. Indica qué aspectos deben revisarse.
    
    Responde SOLO en formato JSON con la siguiente estructura:
    {{
        "veredicto": "aprobar"|"rechazar"|"dudoso",
        "confianza": "alta"|"media"|"baja",
        "razones": ["..."],
        "riesgos": ["..."],
        "que_revisar": ["..."]
    }}
    """
    return prompt


def leer_veredicto(salida: str) -> Dict:
    """Lee el veredicto del analista y lo normaliza.

    Args:
        salida: Salida del analista.

    Returns:
        Dict: Veredicto normalizado.
    """
    # Buscar el primer objeto JSON equilibrado
    json_match = re.search(r"\{.*?\}", salida, re.DOTALL)
    if not json_match:
        return {
            "veredicto": "dudoso",
            "confianza": "baja",
            "razones": ["el analista no devolvió un veredicto legible"],
            "riesgos": [],
            "que_revisar": [],
        }

    try:
        veredicto = json.loads(json_match.group())
    except json.JSONDecodeError:
        return {
            "veredicto": "dudoso",
            "confianza": "baja",
            "razones": ["el analista no devolvió un veredicto legible"],
            "riesgos": [],
            "que_revisar": [],
        }

    # Validar el veredicto
    if not isinstance(veredicto, dict):
        return {
            "veredicto": "dudoso",
            "confianza": "baja",
            "razones": ["el analista no devolvió un veredicto legible"],
            "riesgos": [],
            "que_revisar": [],
        }

    veredicto_valido = veredicto.get("veredicto") in ["aprobar", "rechazar", "dudoso"]
    confianza_valida = veredicto.get("confianza") in ["alta", "media", "baja"]

    if not veredicto_valido or not confianza_valida:
        return {
            "veredicto": "dudoso",
            "confianza": "baja",
            "razones": ["el analista no devolvió un veredicto legible"],
            "riesgos": [],
            "que_revisar": [],
        }

    return veredicto


def puede_aprobar_solo(veredicto: Dict, ficha_verde: bool) -> bool:
    """Determina si una tarea puede ser aprobada automáticamente.

    Args:
        veredicto: Veredicto del analista.
        ficha_verde: Indica si la ficha está en verde.

    Returns:
        bool: True si la tarea puede ser aprobada automáticamente, False en caso contrario.
    """
    return (
        veredicto.get("veredicto") == "aprobar"
        and veredicto.get("confianza") == "alta"
        and ficha_verde
    )
