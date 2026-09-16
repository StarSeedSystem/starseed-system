"""claves_de_opencode · qué variables de entorno necesita opencode, leídas de su propia config.

Por qué existe (2026-09-16). `entorno_hijo()` del orquestador llevaba la lista de claves
ESCRITA A MANO:

    NVIDIA_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, AIHUBMIX_API_KEY,
    TOKENROUTER_API_KEY, XKIRO_API_KEY

Faltaban GROQ_API_KEY y STARSEED_PASARELA_APINEX_KEY. Resultado: por mucho que Groq
estuviera configurado y su clave fuese válida, **nunca llegaba a opencode**, y sus
modelos fallaban en silencio. Añadir un proveedor a `opencode.json` no bastaba: había
que acordarse de tocar además una lista en otro archivo, y nadie se acuerda.

La regla que sale de ahí: **la lista de claves no se escribe, se deduce**. Si un
proveedor dice en su configuración que quiere `{env:LO_QUE_SEA}`, esa variable viaja al
hijo. Añadir un proveedor mañana no exige tocar el orquestador.

Módulo PURO: entra la configuración ya leída, salen NOMBRES de variables. Nunca valores.
"""

import re

PATRON = re.compile(r"\{env:([A-Za-z_][A-Za-z0-9_]*)\}")


def variables_de(texto):
    """Nombres de variable que aparecen como `{env:NOMBRE}` en un texto."""
    if not isinstance(texto, str):
        return []
    return PATRON.findall(texto)


def _recorrer(nodo, fuera):
    if isinstance(nodo, str):
        fuera.extend(variables_de(nodo))
    elif isinstance(nodo, dict):
        for v in nodo.values():
            _recorrer(v, fuera)
    elif isinstance(nodo, (list, tuple)):
        for v in nodo:
            _recorrer(v, fuera)


def variables_necesarias(config, extra=()):
    """Todas las variables que pide la configuración de opencode, sin repetir.

    Se recorre entera y no solo `provider.*.options.apiKey`: una cabecera, una URL
    firmada o un campo nuevo pueden traer un `{env:...}` igual de necesario.

    `extra` permite sumar las que no viven en esa configuración (revisores por HTTP
    directo, por ejemplo). El orden es estable: primero las de la config, luego las
    extra, cada una una sola vez.
    """
    encontradas = []
    _recorrer(config, encontradas)
    for nombre in tuple(extra or ()):
        encontradas.append(nombre)
    vistas, fuera = set(), []
    for n in encontradas:
        if n and n not in vistas:
            vistas.add(n)
            fuera.append(n)
    return fuera


def faltantes(necesarias, disponibles):
    """Las que la configuración pide y NO están en ningún archivo de claves.

    `disponibles` es un conjunto/dict de NOMBRES. Sirve para avisar en el arranque:
    un proveedor configurado cuya clave no existe es un fallo silencioso esperando.
    """
    tiene = set(disponibles or ())
    return [n for n in (necesarias or []) if n not in tiene]
