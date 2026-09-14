#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sugerencias del director: bandeja curada, no gritos sueltos.

Módulo puro (sin red, sin disco, sin procesos) que convierte un estado del
enjambre en una lista de sugerencias con contexto. Hoy el director solo
grita avisos («DISCO al límite») cada 3 minutos sin decir qué hacer ni por qué;
esta función produce entradas que explican qué pasó, por qué importa y qué
hacer, para que una bandeja curada las muestre.

Reglas del área:
  · /api/mando/* son solo locales. Este módulo no expone claves ni rutas del
    disco: solo opina sobre el estado que le pasan.
  · SILENCIO cuando no hay nada que decir: una bandeja con ruido es una
    bandeja que nadie mira. No se inventan sugerencias para tener relleno.

MISMA CLAVE = MISMO MENSAJE: con el mismo estado la salida es idéntica, para
que el que consume pueda deduplicar por 'clave'. Por eso 'ahora' se acepta en
la firma pero NUNCA entra en el texto ni en la clave: si dependiera del
minuto, dos pasadas seguidas producirían entradas distintas.
"""


def sugerencias(estado, ahora):
    """Traduce un estado del enjambre en una lista de sugerencias.

    Args:
        estado: dict con claves opcionales:
            disco_gb (float/int): GB libres de disco.
            bloqueantes (list[str]): ids de tareas bloqueadas que piden persona.
            ejecutables (int): tareas listas para ejecutar en el orquestador.
            orquestador_vivo (bool): si el orquestador está levantado.
            sin_publicar (int): commits sin publicar.
            minutos_quieto (int): minutos sin que el orquestador avance.
        ahora: str 'YYYY-MM-DD HH:MM:SS' (se acepta por firma, no se usa).

    Devuelve:
        lista de dicts {'clave', 'titulo', 'contexto', 'importancia', 'accion'}
        ordenada por importancia (crítica antes que alta antes que normal).
    """
    estado = dict(estado or {})
    # disco_gb solo dispara si el estado trae un valor real: un dict ausente o
    # None no debe inventar una alarma de disco que nadie pidió.
    disco_gb = estado.get("disco_gb")
    bloqueantes = estado.get("bloqueantes", []) or []
    ejecutables = estado.get("ejecutables", 0) or 0
    orquestador_vivo = bool(estado.get("orquestador_vivo"))
    sin_publicar = estado.get("sin_publicar", 0) or 0
    minutos_quieto = estado.get("minutos_quieto", 0) or 0

    resultado = _detectar(
        disco_gb,
        bloqueantes,
        ejecutables,
        orquestador_vivo,
        sin_publicar,
        minutos_quieto,
    )
    grado = {"critica": 0, "alta": 1, "normal": 2}
    return sorted(resultado, key=lambda s: grado.get(s["importancia"], 3))


def _detectar(
    disco_gb, bloqueantes, ejecutables, orquestador_vivo, sin_publicar, minutos_quieto
):
    """Escoge las sugerencias que aplican sobre el estado. Lógica pura."""
    sugerencias_out = []

    # Bloqueantes sin nada ejecutable: el enjambre no está parado por avería,
    # sino porque agotó los reintentos gratuitos. Eso no se arregla solo:
    # hace falta una persona. Es lo más urgente, va primero.
    if bloqueantes and ejecutables == 0:
        ids = ", ".join(bloqueantes)
        sugerencias_out.append(
            {
                "clave": "bloqueantes_sin_ejecutables",
                "titulo": "El enjambre está parado y estas tareas piden persona",
                "contexto": (
                    "Hay %d tareas bloqueadas (%s) y ninguna ejecutable: "
                    "el orquestador no está caído, agotó sus reintentos "
                    "gratuitos y no puede continuar sin intervención."
                )
                % (len(bloqueantes), ids),
                "importancia": "critica",
                "accion": (
                    "Revisa los ids, decide si las reasignas o las cierras "
                    "con 'starseed-puente aprobar' o 'rechazar'."
                ),
            }
        )

    # Disco al límite: lo primero que se puede quitar son los worktrees de
    # tareas ya cerradas; no hace falta tocar el código publicado.
    if disco_gb is not None and disco_gb < 5:
        sugerencias_out.append(
            {
                "clave": "disco_bajo",
                "titulo": "Disco al límite: quedan %.1f GB" % disco_gb,
                "contexto": (
                    "Quedan %.1f GB libres; con el enjambre trabajando no "
                    "es un margen cómodo y cada build o worktree nuevo "
                    "come espacio."
                )
                % disco_gb,
                "importancia": "alta",
                "accion": (
                    "Quita los worktrees de tareas cerradas (git worktree "
                    "prune/remove): son lo primero que se puede recuperar "
                    "sin tocar nada publicado."
                ),
            }
        )

    # Trabajo hecho pero sin publicar, con el orquestador apagado: hay un
    # resultado terminado que nadie va a ver. Sería una pérdida si se pierde.
    if sin_publicar > 0 and not orquestador_vivo:
        sugerencias_out.append(
            {
                "clave": "sin_publicar_orquestador_apagado",
                "titulo": "Hay %d commits sin publicar y el orquestador está apagado"
                % sin_publicar,
                "contexto": (
                    "Hay %d commits hechos sin subir y el orquestador no "
                    "está vivo, así que nadie los va a publicar por sí "
                    "solo."
                )
                % sin_publicar,
                "importancia": "normal",
                "accion": (
                    "Levanta el orquestador o publica manualmente con git "
                    "push para que el trabajo no quede en el disco."
                ),
            }
        )

    # Orquestador vivo pero llevan mucho sin avanzar: no está caído, lleva
    # parado. Distinto de los bloqueantes: aquí puede ser una API colgada.
    if orquestador_vivo and minutos_quieto > 20:
        sugerencias_out.append(
            {
                "clave": "orquestador_quieto",
                "titulo": "El orquestador lleva %d min sin avanzar" % minutos_quieto,
                "contexto": (
                    "El orquestador está vivo pero lleva %d minutos quieto: "
                    "no es que esté caído, se quedó atascado avanzando."
                )
                % minutos_quieto,
                "importancia": "alta",
                "accion": (
                    "Comprueba si una API está colgada (latido sin crecer con "
                    "load bajo) antes de culpar al modelo, y saca la tarea "
                    "con 'starseed-puente soltar'."
                ),
            }
        )

    return sugerencias_out
