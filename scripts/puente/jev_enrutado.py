"""Enrutado opcional del enjambre mediante Jev para selección de modelos.

Este módulo proporciona funciones para:
1. Crear una ficha resumida de la tarea que Jev puede entender
2. Elegir un medio entre candidatos usando Jev cuando hay múltiples opciones
3. Generar motivos legibles para el canal de comunicaciones
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Tuple, Protocol


class JevProtocol(Protocol):
    """Protocolo que define el método elegir que Jev debe implementar."""
    
    def elegir(
        self, 
        estado: Mapping[str, Any], 
        pregunta: str, 
        opciones: Mapping[str, str], 
        nombre: str
    ) -> Tuple[str, dict, float] | None:
        """Devuelve (opción_elegida, probabilidades, confianza) o None."""
        ...


def ficha_de_tarea(tarea: Mapping[str, object]) -> str:
    """Resume la tarea en lo que importa para elegir modelo.
    
    Args:
        tarea: Diccionario con información de la tarea
        
    Returns:
        Texto corto que resume los aspectos relevantes para la selección de modelo
    """
    # Extraer título
    titulo_bruto = tarea.get("titulo", tarea.get("title", "Sin título"))
    titulo = titulo_bruto.strip() if isinstance(titulo_bruto, str) else "Sin título"
    
    # Extraer archivos
    archivos_brutos = tarea.get("archivos", tarea.get("files", ()))
    if isinstance(archivos_brutos, str):
        archivos = [archivos_brutos]
    elif isinstance(archivos_brutos, Sequence):
        archivos = [ruta for ruta in archivos_brutos if isinstance(ruta, str)]
    else:
        archivos = []
    
    # Contar archivos y obtener extensiones
    num_archivos = len(archivos)
    extensiones = set()
    for ruta in archivos:
        if isinstance(ruta, str):
            if '.' in ruta:
                ext = ruta.rsplit('.', 1)[-1].lower()
                extensiones.add(ext)
    
    # Determinar si es TypeScript o Python
    es_typescript = any(ext in {'ts', 'tsx'} for ext in extensiones)
    es_python = any(ext in {'py'} for ext in extensiones)
    lenguages = []
    if es_typescript:
        lenguages.append("TypeScript")
    if es_python:
        lenguages.append("Python")
    detalle_lenguaje = " y ".join(lenguages) if lenguages else "otro"
    
    # Verificar si toca pruebas
    pide_pruebas = bool(tarea.get("pruebas") or tarea.get("tests"))
    if not pide_pruebas:
        # Buscar en descripción o título
        textos = [str(v) for v in tarea.values() if isinstance(v, str)] + [str(a) for a in archivos]
        texto_completo = " ".join(textos).lower()
        pide_pruebas = any(palabra in texto_completo for palabra in ("prueba", "test", "testear"))
    
    # Obtener líneas si se especifican
    lineas = tarea.get("lineas", tarea.get("lines"))
    
    # Preparar detalle de extensiones
    if extensiones:
        detalle_extensiones = ", ".join(sorted(extensiones))
    else:
        detalle_extensiones = "sin extensión"
    
    # Construir la ficha siguiendo el formato original pero añadiendo campos
    partes = [titulo]
    partes.append(f"Archivos: {num_archivos} ({detalle_extensiones})")
    if isinstance(lineas, int) and lineas > 0:
        partes.append(f"{lineas} líneas")
    partes.append(f"Lenguaje: {detalle_lenguaje}")
    partes.append(f"Pruebas: {'sí' if pide_pruebas else 'no'}")
    
    return ". ".join(partes) + "."


def elegir_medio(
    tarea: Mapping[str, object], 
    candidatos: Sequence[str], 
    historial: Mapping[str, object] | None = None,
    jev: JevProtocol | None = None
) -> Tuple[str, str]:
    """Elige un medio entre los candidatos usando Jev cuando es apropiado.
    
    Args:
        tarea: Información de la tarea para crear la ficha
        candidatos: Lista de medios ya ordenados por el enrutador determinista
        historial: Información histórica (no utilizado en esta implementación)
        jev: Instancia de Jev para consultar (None para no hacer llamadas reales)
        
    Returns:
        Tupla (medio_elegido, motivo)
    """
    # Si no hay candidatos, devolver cadena vacía
    if not candidatos:
        return "", "sin candidatos disponibles"
    
    # Si solo hay un candidato, devolverlo sin consultar a Jev
    if len(candidatos) == 1:
        return candidatos[0], "único candidato disponible"
    
    # Si hay múltiples candidatos, consultar a Jev (si está disponible)
    if jev is not None:
        try:
            # Crear la ficha de la tarea
            ficha = ficha_de_tarea(tarea)
            
            # Preparar la pregunta para Jev
            pregunta = f"Dado el contexto de la tarea: '{ficha}', ¿cuál de los siguientes medios sería el más adecuado para ejecutarla?"
            
            # Preparar opciones (máximo 4 candidatos como indica el requerimiento)
            opciones = {}
            for i, candidato in enumerate(candidatos[:4]):
                opciones[f"opcion_{i}"] = candidato
            
            # Consultar a Jev
            resultado = jev.elegir(
                estado={"tarea": ficha},  # Estado simplificado para Jev
                pregunta=pregunta,
                opciones=opciones,
                nombre="medio"
            )
            
            # Procesar la respuesta de Jev
            if resultado is not None:
                opcion_elegida, probabilidades, confianza = resultado
                # Mapear la opción elegida al valor real
                if opcion_elegida in opciones:
                    medio_elegido = opciones[opcion_elegida]
                    motivo = f"Jev eligió {medio_elegido} (confianza: {confianza:.2f})"
                    return medio_elegido, motivo
            
            # Si Jev no pudo decidir, caer al determinista
            return candidatos[0], "Jev no pudo decidir; se aplica orden determinista"
            
        except Exception:
            # Si ocurre cualquier excepción, caer al determinista
            return candidatos[0], "Error al consultar a Jev; se aplica orden determinista"
    
    # Si no hay Jev disponible o no se proporcionó, caer al determinista
    return candidatos[0], "Jev no disponible; se aplica orden determinista"


def motivo_legible(eleccion: str, motivo: str) -> str:
    """Crea una frase legible para el canal de comunicaciones.
    
    Args:
        eleccion: Medio elegido (ej: "gemini-3.6-flash")
        motivo: Motivo de la elección (ej: "Jev: 3 archivos TypeScript con pruebas")
        
    Returns:
        Frase formateada para el canal
    """
    return f"Tarea -> {eleccion} ({motivo})"


# Mantener las funciones existentes para compatibilidad si fuera necesario
def texto_de_tarea(tarea: Mapping[str, object]) -> str:
    """Función de legado mantenida para compatibilidad."""
    return ficha_de_tarea(tarea)