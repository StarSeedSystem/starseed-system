"""Módulo diseno_adn_a_design_md.py (DSN1025C).

Genera el DESIGN.md numerado (formato de Google Stitch, ficha lib-awesome-design-md)
de un contexto a partir de su memory/diseno/adn/<slug>/dna.json.

Puro y determinista: `design_md` no lee archivos ni red; misma entrada, misma salida.
Biblioteca estándar de Python, sin red ni efectos al importar.
"""

import argparse
import json
import os
import re
import sys
from typing import List

SUBDIRECTORIO_ADN = "memory/diseno/adn"

SIN_DATOS = "Sin datos en el ADN"

TITULOS = [
    "## 1. Visual Theme & Atmosphere",
    "## 2. Color Palette & Roles",
    "## 3. Typography Rules",
    "## 4. Component Stylings",
    "## 5. Layout Principles",
    "## 6. Depth & Elevation",
    "## 7. Do's and Don'ts",
    "## 8. Responsive Behavior",
    "## 9. Agent Prompt Guide",
]


def design_md(dna: dict, prompt_md: str = "") -> str:
    """Devuelve el DESIGN.md de un contexto a partir de su dna.json."""
    meta = dna.get("meta") or {}
    nombre = str(meta.get("nombre") or SIN_DATOS)
    slug = str(meta.get("slug") or "")
    fecha = str(meta.get("fecha") or SIN_DATOS)
    lineas = ["# Design System: " + nombre]
    if slug:
        lineas.append(
            "<!-- Generado desde memory/diseno/adn/" + slug + "/dna.json (fecha "
            + fecha + "). No editar a mano. -->"
        )
    lineas.extend(apartados_de(dna, prompt_md))
    return "\n".join(lineas) + "\n"


def _lista(items: object) -> list:
    """Una lista del ADN, tal cual; si no existe, vacía (nunca se inventa)."""
    if isinstance(items, list):
        return items
    return []


def _texto(valor: object) -> str:
    """Un dato del ADN como texto, o vacío si falta (nunca se inventa)."""
    if valor is None:
        return ""
    return str(valor)


def _apartado_atmosfera(dna: dict) -> List[str]:
    """Apartado 1: alma.una_linea, adjetivos, linaje e inferido marcado."""
    alma = dna.get("alma") or {}
    lineas = ["**Temática y atmósfera visual.**"]
    una_linea = _texto(alma.get("una_linea"))
    if una_linea:
        lineas.append("")
        lineas.append(una_linea)
    adjetivos = _lista(alma.get("adjetivos"))
    if adjetivos:
        lineas.append("")
        lineas.append("**Palabras clave:** " + ", ".join(_texto(a) for a in adjetivos))
    linaje = _texto(alma.get("linaje"))
    if linaje:
        lineas.append("")
        lineas.append("**Linaje:** " + linaje)
    inferido = _lista(dna.get("inferido"))
    if inferido:
        lineas.append("")
        lineas.append("**Inferido, no medido:** " + ", ".join(_texto(i) for i in inferido))
    return lineas


def _apartado_paleta(dna: dict) -> List[str]:
    """Apartado 2: cada color con su nombre, hex, rol, cobertura y prohibiciones."""
    lineas = ["La paleta con su reparto de roles:"]
    paleta = _lista(dna.get("paleta"))
    if not paleta:
        lineas.append("")
        lineas.append(SIN_DATOS)
        return lineas
    for color in paleta:
        hexa = _texto((color or {}).get("hex"))
        nombre = _texto((color or {}).get("nombre"))
        rol = _texto((color or {}).get("rol"))
        cobertura = (color or {}).get("cobertura")
        prohibido = _lista((color or {}).get("prohibido"))
        if not (hexa and nombre):
            continue
        linea = "- **" + nombre + "** (`" + hexa + "`): rol " + rol
        if cobertura is not None:
            linea += ", cobertura " + _texto(cobertura) + " %"
        lineas.append(linea)
        if prohibido:
            lineas.append(
                "  - Prohibido: " + ", ".join(_texto(p) for p in prohibido)
            )
    return lineas


def _apartado_tipo(dna: dict) -> List[str]:
    """Apartado 3: familias tipográficas con su fallback; pesos y pasos si faltan."""
    lineas = ["Reglas de tipografía:"]
    tipo = dna.get("tipo") or {}
    familias = _lista(tipo.get("familias"))
    if familias:
        for familia in familias:
            rol = _texto((familia or {}).get("rol"))
            nombre = _texto((familia or {}).get("nombre"))
            fallback = _texto((familia or {}).get("fallback"))
            if not nombre:
                continue
            linea = "- **" + rol + "**: " + nombre
            if fallback:
                linea += " (respaldo: " + fallback + ")"
            lineas.append(linea)
    if not familias:
        lineas.append("")
        lineas.append(SIN_DATOS)
    for clave, etiqueta in (("pesos", "Pesos"), ("pasos", "Pasos")):
        if not tipo.get(clave):
            lineas.append("")
            lineas.append(etiqueta + ": " + SIN_DATOS)
    return lineas


def _apartado_firmas(dna: dict) -> List[str]:
    """Apartado 4: cada jugada firma con su proporción."""
    lineas = ["Jugadas firma, cada una como proporción:"]
    firmas = _lista(dna.get("firmas"))
    if not firmas:
        lineas.append("")
        lineas.append(SIN_DATOS)
        return lineas
    for firma in firmas:
        jugada = _texto((firma or {}).get("jugada"))
        como = _texto((firma or {}).get("como"))
        if not jugada:
            continue
        linea = "- **" + jugada + "**"
        if como:
            linea += ": " + como
        lineas.append(linea)
    return lineas


def _apartado_espacio(dna: dict) -> List[str]:
    """Apartado 5: espacio compositivo; si falta, se dice."""
    espacio = dna.get("espacio")
    if not espacio:
        return ["Rejilla y espacio: " + SIN_DATOS]
    if isinstance(espacio, dict):
        return ["Rejilla y espacio: " + json.dumps(espacio, ensure_ascii=False, sort_keys=True)]
    return ["Rejilla y espacio: " + str(espacio)]


def _apartado_superficie(dna: dict) -> List[str]:
    """Apartado 6: textura y elevación; si falta, se dice."""
    superficie = dna.get("superficie")
    if not superficie:
        return ["Textura, bordes y elevación: " + SIN_DATOS]
    if isinstance(superficie, dict):
        return [
            "Textura, bordes y elevación: "
            + json.dumps(superficie, ensure_ascii=False, sort_keys=True)
        ]
    return ["Textura, bordes y elevación: " + str(superficie)]


def _apartado_prohibiciones(dna: dict):
    """Apartado 7: prohibiciones («No»), la jugada rara («Una vez») y no copiado."""
    meta = dna.get("meta") or {}
    lineas = ["Lo que corresponde dejar fuera y la ruptura única:"]
    prohibiciones = _lista(dna.get("prohibiciones"))
    if prohibiciones:
        lineas.append("")
        lineas.extend("No " + _texto(p) for p in prohibiciones)
    rara = dna.get("jugada_rara") or {}
    if isinstance(rara, dict) and _texto(rara.get("que")):
        linea = "Una vez " + _texto(rara.get("que"))
        como = _texto(rara.get("como"))
        if como:
            linea += " (" + como + ")"
        lineas.append(linea)
    no_copiado = _lista(meta.get("no_copiado"))
    if no_copiado:
        lineas.extend("No copiado " + _texto(n) for n in no_copiado)
    return lineas


def _apartado_responsive(dna: dict) -> List[str]:
    """Apartado 8: espacio inteligente por aparato; con datos solo si hay `espacio`."""
    if not dna.get("espacio"):
        return ["Adaptación por aparato: " + SIN_DATOS]
    lineas = ["Adaptación por aparato: espacio inteligente por aparato."]
    lineas.extend(_apartado_espacio(dna))
    return lineas


def _apartado_prompt(prompt_md: str) -> List[str]:
    """Apartado 9: las primeras 14 líneas no vacías del PROMPT.md del contexto."""
    lineas_no_vacias = [l for l in prompt_md.splitlines() if l.strip()]
    if not lineas_no_vacias:
        return ["Guía de peticiones para el agente: Sin PROMPT.md"]
    return ["Guía de peticiones para el agente:"] + [l.strip() for l in lineas_no_vacias[:14]]


def apartados_de(dna: dict, prompt_md: str) -> List[str]:
    """Los nueve apartados con sus títulos exactos, en orden."""
    bloques = [
        _apartado_atmosfera(dna),
        _apartado_paleta(dna),
        _apartado_tipo(dna),
        _apartado_firmas(dna),
        _apartado_espacio(dna),
        _apartado_superficie(dna),
        _apartado_prohibiciones(dna),
        _apartado_responsive(dna),
        _apartado_prompt(prompt_md),
    ]
    lineas = []
    for titulo, bloque in zip(TITULOS, bloques):
        lineas.append(titulo)
        lineas.extend(bloque)
        lineas.append("")
    return lineas


def escribir_design_md(raiz: str, slug: str) -> str:
    """Lee dna.json y PROMPT.md del slug y escribe DESIGN.md junto a ellos."""
    error, detalle = validar_slug(slug)
    if error:
        raise ValueError(detalle)
    carpeta = carpeta_adn(raiz, slug)
    with open(os.path.join(carpeta, "dna.json"), "r", encoding="utf-8") as fuente:
        dna = json.load(fuente)
    ruta_prompt = os.path.join(carpeta, "PROMPT.md")
    prompt_md = ""
    if os.path.exists(ruta_prompt):
        with open(ruta_prompt, "r", encoding="utf-8") as fuente_prompt:
            prompt_md = fuente_prompt.read()
    texto = design_md(dna, prompt_md)
    destino = os.path.join(carpeta, "DESIGN.md")
    with open(destino, "w", encoding="utf-8") as fichero:
        fichero.write(texto)
    return destino


def carpeta_adn(raiz: str, slug: str) -> str:
    """Carpeta `memory/diseno/adn/<slug>` dentro de la raíz dada."""
    return os.path.join(raiz, SUBDIRECTORIO_ADN, slug)


PATRON_SLUG = re.compile(r"^[a-z0-9-]+$")


def validar_slug(slug: str):
    """(error, detalle) del slug: solo [a-z0-9-], sin `..` ni `/`."""
    if not slug or not PATRON_SLUG.match(slug) or ".." in slug or "/" in slug:
        return True, "slug inválido: " + repr(slug) + " (solo [a-z0-9-])"
    return False, ""


def slugs_de_todos(raiz: str) -> List[str]:
    """Los slugs con dna.json, en orden estable."""
    directorio = os.path.join(raiz, SUBDIRECTORIO_ADN)
    try:
        nombres = sorted(os.listdir(directorio))
    except OSError:
        return []
    salidas = []
    for nombre in nombres:
        if not PATRON_SLUG.match(nombre):
            continue
        if os.path.exists(os.path.join(directorio, nombre, "dna.json")):
            salidas.append(nombre)
    return salidas


def main(argv=None) -> int:
    """CLI: --slug <s> o --todos; --raiz <repo>; --escribir escribe o imprime."""
    parser = argparse.ArgumentParser(description="Genera DESIGN.md desde dna.json")
    parser.add_argument("--slug")
    parser.add_argument("--todos", action="store_true")
    parser.add_argument("--raiz", default=_raiz_por_defecto())
    parser.add_argument("--escribir", action="store_true")
    args = parser.parse_args(argv)
    if args.slug:
        error, detalle = validar_slug(args.slug)
        if error:
            print(detalle, file=sys.stderr)
            return 2
    if not args.slug and not args.todos:
        print("Indica --slug <s> o --todos.", file=sys.stderr)
        return 2
    slugs = slugs_de_todos(args.raiz) if args.todos else [args.slug]
    if not slugs:
        print("No hay dna.json para " + str(args.slug or "--todos"), file=sys.stderr)
        return 1
    fallo = False
    for slug in slugs:
        if args.escribir:
            try:
                ruta = escribir_design_md(args.raiz, slug)
            except (OSError, ValueError) as fallo_io:
                print(str(fallo_io), file=sys.stderr)
                fallo = True
                continue
            print(ruta)
        else:
            try:
                print(_leer_y_generar(args.raiz, slug))
            except OSError as fallo_lectura:
                print(str(fallo_lectura), file=sys.stderr)
                fallo = True
    return 1 if fallo else 0


def _leer_y_generar(raiz: str, slug: str) -> str:
    """Lee dna.json (y PROMPT.md si hay) y devuelve el texto del DESIGN.md."""
    carpeta = carpeta_adn(raiz, slug)
    with open(os.path.join(carpeta, "dna.json"), "r", encoding="utf-8") as fuente:
        dna = json.load(fuente)
    ruta_prompt = os.path.join(carpeta, "PROMPT.md")
    prompt_md = ""
    if os.path.exists(ruta_prompt):
        with open(ruta_prompt, "r", encoding="utf-8") as fuente_prompt:
            prompt_md = fuente_prompt.read()
    return design_md(dna, prompt_md)


def _raiz_por_defecto() -> str:
    """Dos niveles arriba de este archivo: la raíz del repositorio."""
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


if __name__ == "__main__":
    sys.exit(main())
