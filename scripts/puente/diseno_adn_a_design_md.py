#!/usr/bin/env python3
"""Generador del DESIGN.md de un contexto StarSeed a partir de su ADN medido.

Lee `memory/diseno/adn/<slug>/dna.json` y escribe el DESIGN.md de ese contexto
en el formato numerado de nueve apartados que lee Google Stitch. Solo
biblioteca estándar, sin red ni efectos al importar. El ADN manda: si un dato
no está medido, se declara «Sin datos en el ADN» y nunca se inventa.
"""
import argparse
import json
import os
import re

SIN_DATOS = "Sin datos en el ADN"
SLUG_RE = re.compile(r"^[a-z0-9-]+$")


def _texto(dna: dict, prompt_md: str = "") -> str:
    """Cuerpo completo del documento (excluye el título, lo añade design_md)."""
    partes: list[str] = []
    partes.append(_seccion_tema(dna))
    partes.append(_seccion_paleta(dna))
    partes.append(_seccion_tipo(dna))
    partes.append(_seccion_firmas(dna))
    partes.append(_seccion_espacio(dna))
    partes.append(_seccion_superficie(dna))
    partes.append(_seccion_prohibiciones(dna))
    partes.append(_seccion_responsive(dna))
    partes.append(_seccion_prompt(prompt_md))
    return "\n\n".join(partes).strip("\n") + "\n"


def design_md(dna: dict, prompt_md: str = "") -> str:
    """Pura y determinista: misma entrada, misma salida."""
    meta = dna.get("meta") or {}
    nombre = meta.get("nombre", "Sin nombre")
    slug = meta.get("slug", "sin-slug")
    fecha = meta.get("fecha", "sin fecha")
    titulo = f"# Design System: {nombre}"
    # Una sola línea de comentario HTML; un md5 lento o registros se evitan a propósito.
    firma = (
        f"<!-- Generado desde memory/diseno/adn/{slug}/dna.json "
        f"(fecha {fecha}). No editar a mano. -->"
    )
    cuerpo = _texto(dna, prompt_md)
    return f"{titulo}\n{firma}\n\n{cuerpo}"


def _seccion(titulo: str, contenido: str) -> str:
    return f"## {titulo}\n\n{contenido.strip()}"


def _seccion_tema(dna: dict) -> str:
    alma = dna.get("alma") or {}
    lineas: list[str] = []
    if alma.get("una_linea"):
        lineas.append(str(alma["una_linea"]))
    adjetivos = alma.get("adjetivos") or []
    if adjetivos:
        lineas.append("Adjetivos: " + ", ".join(str(a) for a in adjetivos))
    if alma.get("linaje"):
        lineas.append(f"Linaje: {alma['linaje']}")
    inferido = dna.get("inferido") or []
    if inferido:
        lineas.append("Inferido, no medido: " + ", ".join(str(i) for i in inferido))
    contenido = "\n".join(lineas) if lineas else SIN_DATOS
    return _seccion("1. Visual Theme & Atmosphere", contenido)


def _seccion_paleta(dna: dict) -> str:
    paleta = dna.get("paleta") or []
    lineas: list[str] = []
    for color in paleta:
        nombre = str(color.get("nombre", "sin nombre"))
        hex_val = str(color.get("hex", "?"))
        rol = str(color.get("rol", "sin rol"))
        cobertura = color.get("cobertura")
        linea = f"- **{nombre}** — `{hex_val}` — {rol}."
        if cobertura is not None:
            linea += f" Cobertura: {cobertura} %."
        prohibido = color.get("prohibido") or []
        if prohibido:
            linea += f"\n  - Prohibido: {', '.join(str(p) for p in prohibido)}."
        lineas.append(linea)
    contenido = "\n".join(lineas) if lineas else SIN_DATOS
    return _seccion("2. Color Palette & Roles", contenido)


def _seccion_tipo(dna: dict) -> str:
    tipo = dna.get("tipo")
    if not tipo:
        return _seccion("3. Typography Rules", SIN_DATOS)
    lineas: list[str] = []
    for familia in tipo.get("familias") or []:
        rol = str(familia.get("rol", "sin rol"))
        nombre = str(familia.get("nombre", SIN_DATOS))
        fallback = familia.get("fallback")
        linea = f"- {rol.capitalize()}: {nombre}"
        if fallback:
            linea += f" (fallback: {fallback})"
        lineas.append(linea + ".")
    lineas.append("Pesos: " + (", ".join(str(p) for p in tipo["pesos"]) if tipo.get("pesos") else SIN_DATOS))
    lineas.append("Pasos: " + (", ".join(str(p) for p in tipo["pasos"]) if tipo.get("pasos") else SIN_DATOS))
    return _seccion("3. Typography Rules", "\n".join(lineas))


def _seccion_firmas(dna: dict) -> str:
    firmas = dna.get("firmas") or []
    lineas: list[str] = []
    for firma in firmas:
        jugada = str(firma.get("jugada", "sin nombre"))
        como = str(firma.get("como", "sin proporción"))
        # Una firma es una PROPORCIÓN de uso, no un botón suelto.
        lineas.append(f"- {jugada}: {como}")
    contenido = "\n".join(lineas) if lineas else SIN_DATOS
    return _seccion("4. Component Stylings", contenido)


def _detalle(bloque, sangria: str = "  ") -> str:
    """Rinde un bloque del ADN como líneas 'clave: valor', sin inventar nada."""
    if isinstance(bloque, dict):
        lineas = []
        for clave, valor in bloque.items():
            if isinstance(valor, (dict, list)):
                lineas.append(f"{sangria}{clave}: {json.dumps(valor, ensure_ascii=False, sort_keys=True)}")
            else:
                lineas.append(f"{sangria}{clave}: {valor}")
        return "\n".join(lineas)
    return f"{sangria}{bloque}"


def _seccion_espacio(dna: dict) -> str:
    espacio = dna.get("espacio")
    contenido = _detalle(espacio, "") if espacio else SIN_DATOS
    return _seccion("5. Layout Principles", contenido)


def _seccion_superficie(dna: dict) -> str:
    superficie = dna.get("superficie")
    contenido = _detalle(superficie, "") if superficie else SIN_DATOS
    return _seccion("6. Depth & Elevation", contenido)


def _seccion_prohibiciones(dna: dict) -> str:
    meta = dna.get("meta") or {}
    lineas: list[str] = []
    for prohibicion in dna.get("prohibiciones") or []:
        lineas.append(f"- No {prohibicion}")
    rara = dna.get("jugada_rara") or {}
    if rara:
        fragmento = f"- Una vez: {rara.get('que', '')} ({rara.get('como', '')})"
        if rara.get("por_que"):
            fragmento += f": {rara['por_que']}"
        lineas.append(fragmento)
    for copiado in meta.get("no_copiado") or []:
        lineas.append(f"- No copiado: {copiado}")
    contenido = "\n".join(lineas) if lineas else SIN_DATOS
    return _seccion("7. Do's and Don'ts", contenido)


def _seccion_responsive(dna: dict) -> str:
    espacio = dna.get("espacio")
    if not espacio:
        return _seccion("8. Responsive Behavior", SIN_DATOS)
    lineas = ["Espacio inteligente por aparato"]
    detalle = _detalle(espacio, "- ")
    if detalle:
        lineas.append(detalle)
    return _seccion("8. Responsive Behavior", "\n".join(lineas))


def _seccion_prompt(prompt_md: str) -> str:
    lineas = [ln for ln in (prompt_md or "").splitlines() if ln.strip()]
    contenido = "\n".join(lineas[:14]) if lineas else "Sin PROMPT.md"
    return _seccion("9. Agent Prompt Guide", contenido)


def _adn_dir(raiz: str, slug: str) -> str:
    if not SLUG_RE.match(slug):
        raise SystemExit(
            f"Slug no válido: {slug!r}. Solo se admiten minúsculas, números y guiones."
        )
    return os.path.join(raiz, "memory", "diseno", "adn", slug)


def _generar(raiz: str, slug: str, escribir: bool) -> str:
    carpeta = _adn_dir(raiz, slug)
    ruta_dna = os.path.join(carpeta, "dna.json")
    with open(ruta_dna, encoding="utf-8") as lector:
        dna = json.load(lector)
    ruta_prompt = os.path.join(carpeta, "PROMPT.md")
    prompt_md = ""
    if os.path.exists(ruta_prompt):
        with open(ruta_prompt, encoding="utf-8") as lector:
            prompt_md = lector.read()
    documento = design_md(dna, prompt_md)
    if escribir:
        destino = os.path.join(carpeta, "DESIGN.md")
        with open(destino, "w", encoding="utf-8") as escritor:
            escritor.write(documento)
    return documento


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(
        description="Genera el DESIGN.md de un contexto desde su dna.json."
    )
    grupo = parser.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--slug", help="contexto concreto, por ejemplo cafe")
    grupo.add_argument("--todos", action="store_true", help="todos los contextos con dna.json")
    parser.add_argument(
        "--raiz", default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        help="carpeta del repo (por defecto, tres niveles arriba del script)"
    )
    parser.add_argument("--escribir", action="store_true",
                        help="escribe el DESIGN.md; sin ella solo imprime")
    argumentos = parser.parse_args(argv)
    raiz = os.path.abspath(argumentos.raiz)
    carpeta_adn = os.path.join(raiz, "memory", "diseno", "adn")
    if argumentos.todos:
        slugs = sorted(
            nombre for nombre in os.listdir(carpeta_adn)
            if SLUG_RE.match(nombre)
            and os.path.isfile(os.path.join(carpeta_adn, nombre, "dna.json"))
        )
    else:
        slugs = [argumentos.slug]
    for slug in slugs:
        documento = _generar(raiz, slug, argumentos.escribir)
        if argumentos.escribir:
            print(f"Escrito memory/diseno/adn/{slug}/DESIGN.md")
        else:
            print(documento, end="" if documento.endswith("\n") else "\n")


if __name__ == "__main__":
    main()
