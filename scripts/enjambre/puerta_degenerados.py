"""Puerta de validación contra archivos degenerados o truncados por LLM."""

import ast


def archivos_degenerados(cambios: list[tuple[str, str, str]]) -> list[str]:
    """Evalúa cambios (ruta, contenido_antes, contenido_despues) y devuelve

    una lista de razones 'ruta: motivo' si algún archivo está degenerado.
    """
    razones: list[str] = []
    for ruta, antes, despues in cambios:
        ant = antes or ""
        desp = despues or ""
        lines_ant = len(ant.splitlines())
        lines_desp = len(desp.splitlines())

        # (a) valla markdown en archivo que no es .md
        if not ruta.lower().endswith(".md"):
            if any(line.startswith("```") for line in desp.splitlines()):
                razones.append(f"{ruta}: valla markdown en archivo no-.md")

        # (b) archivo con >= 40 líneas encoge a menos de la mitad
        if lines_ant >= 40 and lines_desp < (lines_ant / 2.0):
            razones.append(
                f"{ruta}: encogió de {lines_ant} a {lines_desp} líneas (más de la mitad)"
            )

        # (c) archivo .py que no parsea con ast.parse
        if ruta.endswith(".py") and desp:
            try:
                ast.parse(desp, filename=ruta)
            except SyntaxError as exc:
                razones.append(f"{ruta}: error de sintaxis Python ({exc})")

    return razones
