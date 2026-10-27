"""Generador del DESIGN.md de Stitch desde el ADN de un contexto.

Lee memory/diseno/adn/<slug>/dna.json (y su PROMPT.md si existe) y compone el
DESIGN.md numerado del formato de Google Stitch: ficha lib-awesome-design-md de
config/repos-libreria-1025.json, con el DESIGN.md de la raíz como modelo. Solo
biblioteca estándar, sin red y sin efectos al importar; pura y determinista.
"""

import argparse
import json
import os
import re
import sys

SIN_DATOS = "Sin datos en el ADN"
CABECERAS = (
    "## 1. Visual Theme & Atmosphere",
    "## 2. Color Palette & Roles",
    "## 3. Typography Rules",
    "## 4. Component Stylings",
    "## 5. Layout Principles",
    "## 6. Depth & Elevation",
    "## 7. Do's and Don'ts",
    "## 8. Responsive Behavior",
    "## 9. Agent Prompt Guide",
)
SLUG_RE = re.compile(r"^[a-z0-9-]+$")
RAIZ_ADN = os.path.join("memory", "diseno", "adn")


def _txt(v):
    return str(v or "").strip()


def _num(v):
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _honesto(v):
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, sort_keys=True)
    return _num(v) if isinstance(v, (int, float)) else _txt(v)


def _dict_honesto(datos):
    """Rinde cada clave tal como está; sin dictado o vacío, nada inventado."""
    if not isinstance(datos, dict) or not datos:
        return SIN_DATOS
    return "\n".join("*   %s: %s." % (k, _honesto(v)) for k, v in datos.items())


def validar_slug(slug):
    if not SLUG_RE.fullmatch(_txt(slug)):
        raise ValueError(
            "slug inválido «%s»: solo [a-z0-9-], sin puntos ni barras" % slug)
    return slug


def _tema(dna):
    alma = dna.get("alma") or {}
    lineas = []
    if alma.get("una_linea"):
        lineas.append("«%s»" % _txt(alma["una_linea"]))
    if alma.get("adjetivos"):
        lineas.append("Adjetivos: %s." % ", ".join(
            _txt(a) for a in alma["adjetivos"]))
    if alma.get("linaje"):
        lineas.append("Linaje: %s." % _txt(alma["linaje"]))
    if dna.get("inferido"):
        lineas.append("Inferido, no medido: %s." % ", ".join(
            _txt(i) for i in dna["inferido"]))
    return "\n".join(lineas) if lineas else SIN_DATOS


def _paleta(dna):
    lineas = []
    for e in dna.get("paleta") or []:
        linea = "*   **%s** — `%s`" % (_txt(e.get("nombre")) or "sin nombre",
                                       _txt(e.get("hex")) or "sin hex")
        if e.get("rol"):
            linea += " · %s" % _txt(e["rol"])
        if e.get("cobertura") is not None:
            linea += " · %s %%" % _num(e["cobertura"])
        y_prohibido = [_txt(p) for p in e.get("prohibido") or [] if _txt(p)]
        if y_prohibido:
            linea += " · prohibido: %s" % ", ".join(y_prohibido)
        lineas.append(linea + ".")
    return "\n".join(lineas) if lineas else SIN_DATOS


def _tipo(dna):
    tipo = dna.get("tipo") or {}
    lineas = []
    familias = tipo.get("familias") or []
    if familias:
        for f in familias:
            linea = "*   **%s**: %s" % (_txt(f.get("rol")) or "sin rol",
                                        _txt(f.get("nombre")) or "sin nombre")
            if f.get("fallback"):
                linea += " (respaldo: %s)" % _txt(f["fallback"])
            lineas.append(linea + ".")
    else:
        lineas.append("Familias: %s." % SIN_DATOS)
    for clave in ("pesos", "pasos"):
        datos = tipo.get(clave)
        if datos:
            lineas.append("%s: %s." % (clave.capitalize(), _honesto(datos)))
        else:
            lineas.append("%s: %s." % (clave.capitalize(), SIN_DATOS))
    return "\n".join(lineas)


def _firmas(dna):
    lineas = []
    for f in dna.get("firmas") or []:
        jugada = _txt(f.get("jugada")) or "sin jugada"
        como = _txt(f.get("como"))
        linea = "*   **%s** — proporción: %s." % (jugada, como) if como \
            else "*   **%s**." % jugada
        lineas.append(linea)
    return "\n".join(lineas) if lineas else SIN_DATOS


def _reglas(dna):
    lineas = []
    for p in dna.get("prohibiciones") or []:
        if _txt(p):
            lineas.append("*   No %s." % _txt(p))
    jr = dna.get("jugada_rara") or {}
    if _txt(jr.get("que")):
        linea = "*   Una vez: %s" % _txt(jr["que"])
        if _txt(jr.get("como")):
            linea += ", %s" % _txt(jr["como"])
        if _txt(jr.get("por_que")):
            linea += " (por qué: %s)" % _txt(jr["por_que"])
        lineas.append(linea + ".")
    no_copiado = ((dna.get("meta") or {}).get("no_copiado") or [])
    for item in no_copiado:
        if _txt(item):
            lineas.append("*   No copiado: %s." % _txt(item))
    return "\n".join(lineas) if lineas else SIN_DATOS


def _guia(prompt_md):
    lineas = [l for l in (prompt_md or "").splitlines() if l.strip()][:14]
    return "\n".join(lineas) if lineas else "Sin PROMPT.md"


def design_md(dna, prompt_md=""):
    """Compondo los nueve apartados numerados del formato de Stitch."""
    if not isinstance(dna, dict):
        dna = {}
    meta = dna.get("meta") or {}
    nombre = _txt(meta.get("nombre")) or _txt(meta.get("slug")) or "sin nombre"
    slug = _txt(meta.get("slug")) or "sin-slug"
    comentario = "<!-- Generado desde memory/diseno/adn/%s/dna.json" % slug
    fecha = _txt(meta.get("fecha"))
    if fecha:
        comentario += " (fecha %s)" % fecha
    comentario += ". No editar a mano. -->"
    cuerpo_espacio = _dict_honesto(dna.get("espacio"))
    respuesta = [cuerpo_espacio]
    if cuerpo_espacio != SIN_DATOS:
        respuesta.append("*   Regla del OS: espacio inteligente por aparato "
                         "(móvil, tablet, escritorio, plegable y TV).")
    partes = [_tema(dna), _paleta(dna), _tipo(dna), _firmas(dna),
              cuerpo_espacio, _dict_honesto(dna.get("superficie")),
              _reglas(dna), "\n".join(respuesta), _guia(prompt_md)]
    bloque = "\n\n".join("%s\n%s" % (c, b) for c, b in zip(CABECERAS, partes))
    return "\n\n".join(["# Design System: %s" % nombre, comentario,
                        bloque]) + "\n"


def _raiz_por_defecto():
    """La carpeta del repo: dos niveles arriba del archivo (scripts/puente/)."""
    aqui = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(aqui))


def _listar_slugs(ruta_adn):
    if not os.path.isdir(ruta_adn):
        raise ValueError("no existe " + ruta_adn)
    return sorted(d for d in os.listdir(ruta_adn) if os.path.isfile(
        os.path.join(ruta_adn, d, "dna.json")))


def _generar(carpeta, escribir):
    """Devuelve el texto; con escribir=True deja el DESIGN.md junto a dna.json."""
    ruta_dna = os.path.join(carpeta, "dna.json")
    if not os.path.isfile(ruta_dna):
        raise ValueError("falta dna.json en " + carpeta)
    with open(ruta_dna, encoding="utf-8") as f:
        dna = json.load(f)
    ruta_prompt = os.path.join(carpeta, "PROMPT.md")
    prompt = ""
    if os.path.isfile(ruta_prompt):
        with open(ruta_prompt, encoding="utf-8") as f:
            prompt = f.read()
    texto = design_md(dna, prompt)
    if escribir:
        with open(os.path.join(carpeta, "DESIGN.md"), "w",
                  encoding="utf-8") as f:
            f.write(texto)
    return texto


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="diseno_adn_a_design_md.py",
        description="Escribe (o imprime) el DESIGN.md de cada contexto "
                    "desde su ADN.")
    grupo = parser.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--slug", help="un contexto: memory/diseno/adn/<slug>")
    grupo.add_argument("--todos", action="store_true",
                       help="todos los contextos con dna.json")
    parser.add_argument("--raiz", default=None,
                        help="carpeta del repo (por defecto, la del archivo)")
    parser.add_argument("--escribir", action="store_true",
                        help="escribe DESIGN.md; sin él solo imprime")
    args = parser.parse_args(argv)
    ruta_adn = os.path.join(args.raiz or _raiz_por_defecto(), RAIZ_ADN)
    try:
        slugs = _listar_slugs(ruta_adn) if args.todos else [validar_slug(
            args.slug)]
        for slug in slugs:
            carpeta = os.path.join(ruta_adn, slug)
            texto = _generar(carpeta, args.escribir)
            if args.escribir:
                print("escrito: %s" % os.path.join(carpeta, "DESIGN.md"))
            else:
                print(texto)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
