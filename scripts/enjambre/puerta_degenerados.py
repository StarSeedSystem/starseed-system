"""Puerta de validación contra archivos degenerados o truncados por LLM."""

import ast
import difflib
import re
from typing import Callable, Optional


def _tiene_marcas_conflicto(contenido: str) -> bool:
    """Detecta marcas de conflicto de git (<<<<<<< y >>>>>>>) fuera de vallas ```."""
    en_valla = 0
    vio_inicio = False
    for linea in contenido.splitlines():
        stripped = linea.strip()
        if stripped.startswith("```"):
            en_valla += 1
        if en_valla % 2 == 0:  # fuera de valla
            if stripped.startswith("<<<<<<<") or stripped == "<<<<<<<":
                vio_inicio = True
            if vio_inicio and (stripped.startswith(">>>>>>>") or stripped == ">>>>>>>"):
                return True
    return False


def _es_copia_seguridad(ruta: str, despues: str) -> bool:
    """True si el archivo es una copia de seguridad que no se está borrando."""
    if not despues:
        return False
    nombre = ruta.lower()
    if nombre.endswith((".bak", ".backup", ".orig", ".rej")):
        return True
    # .bak. seguido solo de dígitos al final
    if re.search(r"\.bak\.\d+$", nombre):
        return True
    return False


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

        # (a) el archivo ENTERO viene envuelto en una valla markdown.
        # (2026-09-21) Antes bastaba una linea cualquiera que empezara por ```
        # y eso marcaba como degenerado cualquier .py con un docstring de ejemplo
        # o cualquier .ts con un template literal: falso positivo garantizado en
        # este repo, que construye encargos con ejemplos en markdown. La
        # degeneracion real del LLM es otra: devuelve el archivo envuelto, o sea
        # la valla es lo PRIMERO o lo ULTIMO del archivo.
        if not ruta.lower().endswith(".md") and desp.strip():
            utiles = [l for l in desp.splitlines() if l.strip()]
            primera = utiles[0] if utiles else ""
            ultima = utiles[-1] if utiles else ""
            if primera.lstrip().startswith("```"):
                razones.append(f"{ruta}: el archivo empieza con una valla markdown")
            elif ultima.strip() == "```":
                razones.append(f"{ruta}: el archivo termina con una valla markdown")

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

        # (d) marcas de conflicto de git
        if _tiene_marcas_conflicto(desp):
            razones.append(f"{ruta}: marcas de conflicto de git")

        # (e) copias de seguridad
        if _es_copia_seguridad(ruta, desp):
            razones.append(f"{ruta}: copia de seguridad (no va al repo)")

    return razones


def secretos_en_cambios(
    cambios: list[tuple[str, str, str]],
    escanear: Optional[Callable[[str], list[dict]]],
) -> list[str]:
    """Escanea cambios en busca de cadenas con forma de clave.

    `cambios`: lista de (ruta, contenido_antes, contenido_despues).
    `escanear`: función que recibe un diff unificado y devuelve lista de
    dicts con claves 'archivo', 'linea', 'tipo'. En producción será
    `produccion_puertas.escanear_secretos`.

    Devuelve lista de strings "archivo:linea: posible secreto (tipo)".
    Si no hay cambios con contenido después, si escanear es None o si
    lanza excepción, devuelve [] (esta puerta nunca tumba la integración
    por un fallo propio).
    """
    if escanear is None:
        return []

    diffs: list[str] = []
    for ruta, antes, despues in cambios:
        if not despues:
            continue
        ant_lines = (antes or "").splitlines()
        desp_lines = despues.splitlines()
        diff = difflib.unified_diff(
            ant_lines,
            desp_lines,
            fromfile="a/" + ruta,
            tofile="b/" + ruta,
            lineterm="",
            n=0,
        )
        diffs.append("\n".join(diff))

    if not diffs:
        return []

    diff_unificado = "\n".join(diffs)
    try:
        hallazgos = escanear(diff_unificado)
    except Exception:
        return []

    razones: list[str] = []
    for h in hallazgos:
        archivo = h.get("archivo", "")
        linea = h.get("linea", 0)
        tipo = h.get("tipo", "desconocido")
        razones.append(f"{archivo}:{linea}: posible secreto ({tipo})")
    return razones
