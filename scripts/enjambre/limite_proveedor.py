# -*- coding: utf-8 -*-
"""Qué pasarelas pueden con un prompt de este tamaño — decisión PURA.

POR QUÉ EXISTE (2026-09-14, medido en los logs de la ola 323). Tres tareas seguidas
—p323A, p323E, p323G— acabaron en `sin_cambios` tras 38 minutos y SEIS modelos cada una.
El enrutamiento ya cruzaba proveedores (eso se arregló ayer), así que el problema no era
rendirse pronto: era gastar los intentos en sitios donde el intento no podía salir bien.
Textual, del log de p323A:

    Error: Request too large for model `openai/gpt-oss-120b` ... on tokens per minute (TPM):
    Limit 8000, Requested 19596, please reduce your message size and try again.

    Error: Request too large for model `qwen/qwen3.8-27b` ... on input tokens per minute
    (ITPM): Limit 7000, Requested 22381

Dos de los seis intentos de CADA tarea se iban en Groq, cuyo tramo gratuito admite 7-8 mil
tokens por minuto cuando el prompt de una tarea de esta casa ronda los 20 mil. No es un fallo
transitorio que merezca un reintento: es una imposibilidad aritmética, y se conoce ANTES de
llamar. Cada intento así cuesta unos 15 segundos de reloj y, peor, un hueco en la rotación
que se le quita a un modelo que sí habría podido.

Este módulo no llama a nadie ni lee nada: solo dice qué modelos tienen sitio para el prompt.
"""

# Tokens de ENTRADA que cada pasarela admite de verdad en su tramo gratuito.
#
# Groq son los números que el propio error devuelve (ITPM 7000 / TPM 8000); se deja el menor
# de los dos, que es el que manda. El resto de pasarelas no han rechazado nunca un prompt de
# esta casa por tamaño, así que van con el techo por defecto: la lista es de EXCEPCIONES
# CONOCIDAS, no un catálogo de ventanas de contexto. Añadir aquí un proveedor sin haber visto
# su rechazo en un log sería adivinar, y adivinando se apartan modelos que sí servían.
TOPES_ENTRADA = {
    "groq": 7000,
}

# Lo que se supone que admite cualquier pasarela de la que no sabemos nada malo.
TOPE_POR_DEFECTO = 120000

# Castellano con código mezclado: ~3 caracteres por token. Es una estimación deliberadamente
# PESIMISTA (el ratio real suele ser 3,5-4), porque equivocarse por arriba solo aparta un
# modelo de más, mientras que equivocarse por abajo devuelve el fallo que esto viene a evitar.
CARACTERES_POR_TOKEN = 3


def proveedor_de(modelo):
    """«groq/openai/gpt-oss-120b» → «groq»."""
    return str(modelo).split("/", 1)[0] if "/" in str(modelo) else str(modelo)


def estimar_tokens(texto):
    """Tokens aproximados de un texto. Nunca negativo, nunca None."""
    if not texto:
        return 0
    return len(texto) // CARACTERES_POR_TOKEN + 1


def tope_de(modelo):
    """Tokens de entrada que admite la pasarela de ese modelo."""
    return TOPES_ENTRADA.get(proveedor_de(modelo), TOPE_POR_DEFECTO)


def cabe(modelo, tokens):
    """¿Cabe un prompt de `tokens` en esa pasarela?"""
    return int(tokens) <= tope_de(modelo)


def filtrar_por_tamano(modelos, tokens):
    """Devuelve (viables, apartados_con_motivo).

    `apartados` son pares (modelo, motivo) para dejar dicho en el log POR QUÉ no se intentó.
    Un modelo apartado en silencio es indistinguible de un modelo olvidado.

    SALVAGUARDA: si ningún modelo cabe, se devuelven TODOS como viables. Más vale intentarlo
    y que el proveedor diga que no, que quedarse sin rotación y marcar la tarea `sin_cambios`
    sin haber llamado a nadie — ese fue exactamente el fallo del 2026-09-04 con VZ2.
    """
    viables, apartados = [], []
    for m in modelos:
        if cabe(m, tokens):
            viables.append(m)
        else:
            apartados.append(
                (m, "%s admite %d tokens de entrada y el prompt pide %d"
                 % (proveedor_de(m), tope_de(m), int(tokens)))
            )
    if not viables:
        return list(modelos), []
    return viables, apartados
