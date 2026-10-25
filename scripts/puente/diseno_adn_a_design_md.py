"""Módulo diseno_adn_a_design_md.py (DSN1025C).

Escribe el DESIGN.md de un contexto (formato numerado de Google Stitch, ficha
lib-awesome-design-md) a partir de su memory/diseno/adn/<slug>/dna.json.
design_md es pura y determinista: la misma entrada da la misma salida. Solo
biblioteca estándar; sin red ni efectos al importar; la E/S vive en main.
"""

import argparse
import json
import os
import re
from typing import Any, Dict, List, Optional

SIN_DATOS = "Sin datos en el ADN"
SIN_PROMPT = "Sin PROMPT.md"
MAX_LINEAS_PROMPT = 14

TITULOS = (
    "1. Visual Theme & Atmosphere",
    "2. Color Palette & Roles",
    "3. Typography Rules",
    "4. Component Stylings",
    "5. Layout Principles",
    "6. Depth & Elevation",
    "7. Do's and Don'ts",
    "8. Responsive Behavior",
    "9. Agent Prompt Guide",
)

PATRON_SLUG = re.compile(r"^[a-z0-9-]+$")


def _o(valor: Any) -> str:
    """Valor como texto; «Sin datos en el ADN» si falta."""
    if valor is None or valor == "":
        return SIN_DATOS
    return str(valor)


def _texto_breve(valor: Any) -> str:
    """Lista u objeto plano en una línea, tal cual; «Sin datos en el ADN» si falta."""
    if valor is None or valor == "":
        return SIN_DATOS
    if isinstance(valor, list):
        return ", ".join(str(x) for x in valor) if valor else SIN_DATOS
    return str(valor)


def _bloque_plano(valor: Any) -> List[str]:
    """Bullets de un dict o lista (mismo orden del json); texto simple si no."""
    if isinstance(valor, dict):
        return ["- " + str(k) + ": " + _texto_breve(v) for k, v in valor.items()] or [SIN_DATOS]
    if isinstance(valor, list):
        return ["- " + _texto_breve(x) for x in valor] or [SIN_DATOS]
    return [str(valor)]


def _seccion_1(dna: Dict[str, Any]) -> List[str]:
    """§1 · alma: una_linea, adjetivos, linaje y la lista inferido."""
    alma = dna.get("alma") or {}
    lineas: List[str] = []
    una_linea = alma.get("una_linea")
    if una_linea:
        lineas.append('**"' + str(una_linea) + '"**')
        lineas.append("")
    adjetivos = alma.get("adjetivos") or []
    if adjetivos:
        lineas.append("Adjetivos: " + ", ".join(str(a) for a in adjetivos) + ".")
    if alma.get("linaje"):
        lineas.append("Linaje: " + str(alma["linaje"]) + ".")
    inferido = dna.get("inferido") or []
    if inferido:
        lineas.append("Inferido, no medido: " + ", ".join(str(x) for x in inferido) + ".")
    return lineas


def _seccion_2(dna: Dict[str, Any]) -> List[str]:
    """§2 · paleta: nombre en negrita, hex grave, rol, cobertura y prohibidos."""
    lineas: List[str] = []
    for color in dna.get("paleta") or []:
        cobertura = color.get("cobertura")
        extras = ["rol: " + _o(color.get("rol")),
                  "cobertura: " + (str(cobertura) + "%" if cobertura is not None else SIN_DATOS)]
        lineas.append("- **" + _o(color.get("nombre")) + "** `" + _o(color.get("hex")) + "`"
                      + " — " + " · ".join(extras) + ".")
        prohibido = color.get("prohibido") or []
        if prohibido:
            lineas.append("  - Prohibido: " + ", ".join(str(x) for x in prohibido) + ".")
    return lineas if lineas else [SIN_DATOS]


def _seccion_3(dna: Dict[str, Any]) -> List[str]:
    """§3 · tipo: familias (rol, nombre y fallback); pesos y pasos si hay."""
    tipo = dna.get("tipo") or {}
    lineas: List[str] = []
    for familia in tipo.get("familias") or []:
        lineas.append("- **" + _o(familia.get("rol")) + "**: " + _o(familia.get("nombre"))
                      + " (fallback: " + _o(familia.get("fallback")) + ").")
    lineas.append("Pesos: " + _texto_breve(tipo.get("pesos")) + ".")
    lineas.append("Pasos: " + _texto_breve(tipo.get("pasos")) + ".")
    return lineas


def design_md(dna: Dict[str, Any], prompt_md: str = "") -> str:
    """DESIGN.md del contexto, en el formato numerado de Stitch."""
    meta = dna.get("meta") or {}
    lineas = ["# Design System: " + _o(meta.get("nombre")), ""]
    lineas.append("<!-- Generado desde memory/diseno/adn/" + _o(meta.get("slug"))
                  + "/dna.json (fecha " + _o(meta.get("fecha"))
                  + "). No editar a mano. -->")
    lineas.append("")
    secciones = [
        _seccion_1(dna), _seccion_2(dna), _seccion_3(dna), _seccion_4(dna),
        _seccion_5(dna), _seccion_6(dna), _seccion_7(dna), _seccion_8(dna),
        _seccion_9(prompt_md),
    ]
    for titulo, cuerpo in zip(TITULOS, secciones):
        lineas.append("## " + titulo)
        lineas.append("")
        lineas.extend(cuerpo)
        lineas.append("")
    return "\n".join(lineas).rstrip() + "\n"


def _seccion_4(dna: Dict[str, Any]) -> List[str]:
    """§4 · firmas: jugada y proporción («como»)."""
    lineas: List[str] = []
    for firma in dna.get("firmas") or []:
        lineas.append("- **" + _o(firma.get("jugada")) + "**: " + _o(firma.get("como")))
    return lineas if lineas else [SIN_DATOS]


def _seccion_5(dna: Dict[str, Any]) -> List[str]:
    """§5 · espacio; «Sin datos en el ADN» si falta."""
    espacio = dna.get("espacio")
    return _bloque_plano(espacio) if espacio else [SIN_DATOS]


def _seccion_6(dna: Dict[str, Any]) -> List[str]:
    """§6 · superficie; «Sin datos en el ADN» si falta."""
    superficie = dna.get("superficie")
    return _bloque_plano(superficie) if superficie else [SIN_DATOS]


def _seccion_7(dna: Dict[str, Any]) -> List[str]:
    """§7 · prohibiciones «No», jugada_rara «Una vez» y no_copiado «No copiado»."""
    meta = dna.get("meta") or {}
    lineas: List[str] = []
    for prohibicion in dna.get("prohibiciones") or []:
        lineas.append("- No: " + str(prohibicion) + ".")
    rara = dna.get("jugada_rara") or {}
    if rara.get("que"):
        frase = "- Una vez: " + str(rara["que"])
        if rara.get("como"):
            frase += " — " + str(rara["como"])
        lineas.append(frase + ".")
        if rara.get("por_que"):
            lineas.append("  - Por qué: " + str(rara["por_que"]) + ".")
    for item in meta.get("no_copiado") or []:
        lineas.append("- No copiado: " + str(item) + ".")
    return lineas if lineas else [SIN_DATOS]


def _seccion_8(dna: Dict[str, Any]) -> List[str]:
    """§8 · espacio y la regla «espacio inteligente por aparato»."""
    espacio = dna.get("espacio")
    if not espacio:
        return [SIN_DATOS]
    return _bloque_plano(espacio) + ["- Espacio inteligente por aparato."]


def _seccion_9(prompt_md: str) -> List[str]:
    """§9 · las primeras 14 líneas no vacías del PROMPT.md."""
    lineas = [linea.strip() for linea in prompt_md.splitlines() if linea.strip()]
    return lineas[:MAX_LINEAS_PROMPT] if lineas else [SIN_PROMPT]


def _raiz_por_defecto() -> str:
    """Raíz del repo: la carpeta del archivo, dos niveles arriba."""
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _validar_slug(slug: str) -> str:
    """Solo [a-z0-9-]; un slug con puntos, barras o vacío se rechaza."""
    if not slug or not PATRON_SLUG.fullmatch(slug):
        raise SystemExit("Slug no válido: " + repr(slug)
                         + " (solo [a-z0-9-], sin '..' ni '/').")
    return slug


def _cargar_dna(carpeta: str, slug: str) -> Dict[str, Any]:
    """Lee dna.json de la carpeta del slug; error honesto si falta o no parsea."""
    try:
        with open(os.path.join(carpeta, "dna.json"), "r", encoding="utf-8") as fp:
            dato = json.load(fp)
    except FileNotFoundError:
        raise SystemExit("No hay dna.json en memory/diseno/adn/" + slug + "/.")
    except json.JSONDecodeError as error:
        raise SystemExit("dna.json de " + slug + " no parsea: " + str(error))
    if not isinstance(dato, dict):
        raise SystemExit("dna.json de " + slug + " no es un objeto.")
    return dato


def _cargar_prompt(carpeta: str) -> str:
    """Texto de PROMPT.md de la carpeta; vacío (no error) si no existe."""
    try:
        with open(os.path.join(carpeta, "PROMPT.md"), "r", encoding="utf-8",
                  errors="ignore") as fp:
            return fp.read()
    except OSError:
        return ""


def main(argv: Optional[List[str]] = None) -> int:
    """CLI: --slug <s> o --todos; --raiz <repo>; --escribir (sin él imprime)."""
    parser = argparse.ArgumentParser(
        description="Escribe el DESIGN.md de un contexto a partir de su ADN.")
    grupo = parser.add_mutually_exclusive_group()
    grupo.add_argument("--slug", help="slug de la carpeta ADN, p. ej. cafe")
    grupo.add_argument("--todos", action="store_true",
                       help="todos los contextos con dna.json")
    parser.add_argument("--raiz", default=None,
                        help="raíz del repo (por defecto, la de este archivo)")
    parser.add_argument("--escribir", action="store_true",
                        help="escribe DESIGN.md junto a dna.json (imprimir si no)")
    args = parser.parse_args(argv)
    if not args.slug and not args.todos:
        raise SystemExit("Pasa --slug <s> o --todos.")
    if args.slug:
        _validar_slug(args.slug)
    raiz = args.raiz or _raiz_por_defecto()
    base = os.path.join(raiz, "memory", "diseno", "adn")
    if args.slug:
        slugs = [args.slug]
    else:
        try:
            slugs = sorted(s for s in os.listdir(base)
                           if PATRON_SLUG.fullmatch(s)
                           and os.path.isfile(os.path.join(base, s, "dna.json")))
        except OSError as error:
            raise SystemExit("No se puede leer " + base + ": " + str(error))
    for slug in slugs:
        carpeta = os.path.join(base, slug)
        texto = design_md(_cargar_dna(carpeta, slug), _cargar_prompt(carpeta))
        if args.escribir:
            with open(os.path.join(carpeta, "DESIGN.md"), "w", encoding="utf-8") as fp:
                fp.write(texto)
            print("escrito: memory/diseno/adn/" + slug + "/DESIGN.md")
        else:
            print(texto)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
