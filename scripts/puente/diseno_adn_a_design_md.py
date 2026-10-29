"""Generador del DESIGN.md de un contexto desde su ADN (formato Stitch)."""
import argparse
import json
import os
import re
import sys

NOMBRE_SALIDA = "DESIGN.md"
PATRON_SLUG = re.compile(r"^[a-z0-9-]+$")
SIN_DATOS = "Sin datos en el ADN"


class ErrorDesignMd(Exception):
    """Error de lectura, validación o escritura del ADN."""


def _texto(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "sí" if v else "no"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, (list, tuple)):
        return ", ".join(t for t in map(_texto, v) if t)
    if isinstance(v, dict):
        return "; ".join("%s: %s" % (k, _texto(x)) for k, x in v.items() if _texto(x))
    return str(v)


def _campo(etiqueta, valor):
    texto = _texto(valor)
    return etiqueta + texto if texto else ""


def _bloque(dato):
    if dato in (None, {}, []):
        return SIN_DATOS
    if isinstance(dato, dict):
        lineas = ("- **%s:** %s" % (k, _texto(v)) for k, v in dato.items() if _texto(v))
        return "\n".join(lineas) or SIN_DATOS
    return _texto(dato) or SIN_DATOS


def _s1(dna):
    alma = dna.get("alma") or {}
    lineas = [
        _texto(alma.get("una_linea")),
        _campo("**Adjetivos:** ", alma.get("adjetivos")),
        _campo("**Linaje:** ", alma.get("linaje")),
        _campo("**Inferido, no medido:** ", dna.get("inferido")),
    ]
    return "\n".join(x for x in lineas if x) or SIN_DATOS


def _s2(dna):
    lineas = []
    for e in dna.get("paleta") or []:
        partes = ["**%s**" % (_texto(e.get("nombre")) or _texto(e.get("rol")) or "sin nombre")]
        if _texto(e.get("hex")):
            partes.append("`%s`" % _texto(e.get("hex")))
        if _texto(e.get("rol")):
            partes.append("rol: " + _texto(e.get("rol")))
        if e.get("cobertura") is not None:
            partes.append("cobertura: %s %%" % _texto(e.get("cobertura")))
        if _texto(e.get("prohibido")):
            partes.append("prohibido: " + _texto(e.get("prohibido")))
        lineas.append("- " + " · ".join(partes))
    return "\n".join(lineas) or SIN_DATOS


def _s3(dna):
    tipo = dna.get("tipo") or {}
    lineas = []
    for f in tipo.get("familias") or []:
        linea = "- **%s:** %s" % (_texto(f.get("rol")) or "familia",
                                 _texto(f.get("nombre")) or "sin nombre")
        if _texto(f.get("fallback")):
            linea += " (fallback: %s)" % _texto(f.get("fallback"))
        lineas.append(linea)
    lineas.append(_campo("**Pesos:** ", tipo.get("pesos")))
    lineas.append(_campo("**Pasos:** ", tipo.get("pasos")))
    faltan = [c for c in ("pesos", "pasos") if not _texto(tipo.get(c))]
    if faltan:
        lineas.append("%s: %s." % (" y ".join(faltan).capitalize(), SIN_DATOS))
    return "\n".join(x for x in lineas if x) or SIN_DATOS


def _s4(dna):
    lineas = []
    for firma in dna.get("firmas") or []:
        como = _texto(firma.get("como"))
        lineas.append("- **%s**%s" % (_texto(firma.get("jugada")) or "sin nombre",
                                     (": " + como) if como else ""))
    return "\n".join(lineas) or SIN_DATOS


def _s7(dna):
    rara = dna.get("jugada_rara") or {}
    lineas = ["- **No:** " + _texto(p) for p in dna.get("prohibiciones") or [] if _texto(p)]
    if _texto(rara.get("que")):
        detalle = "- **Una vez:** " + _texto(rara.get("que"))
        extras = [x for x in (_texto(rara.get("como")), _texto(rara.get("por_que"))) if x]
        if extras:
            detalle += " (" + "; ".join(extras) + ")"
        lineas.append(detalle)
    no_copiado = [_texto(x) for x in (dna.get("meta") or {}).get("no_copiado") or [] if _texto(x)]
    if no_copiado:
        lineas.append("- **No copiado:** " + ", ".join(no_copiado))
    return "\n".join(lineas) or SIN_DATOS


def _s9(prompt_md):
    lineas = [x.rstrip() for x in (prompt_md or "").splitlines() if x.strip()]
    return "\n".join(lineas[:14]) if lineas else "Sin PROMPT.md"


def design_md(dna, prompt_md=""):
    """Devuelve el DESIGN.md del ADN; puro y determinista."""
    if not isinstance(dna, dict):
        raise ErrorDesignMd("el ADN debe ser un objeto")
    meta = dna.get("meta") or {}
    espacio = dna.get("espacio")
    responsive = (_bloque(espacio) + "\n\nEspacio inteligente por aparato."
                  if espacio else SIN_DATOS)
    bloques = [
        "# Design System: " + (_texto(meta.get("nombre")) or "Sin nombre"),
        "<!-- Generado desde memory/diseno/adn/%s/dna.json (fecha %s). "
        "No editar a mano. -->" % (_texto(meta.get("slug")) or "sin-slug",
                                  _texto(meta.get("fecha")) or "sin fecha"),
        "## 1. Visual Theme & Atmosphere\n" + _s1(dna),
        "## 2. Color Palette & Roles\n" + _s2(dna),
        "## 3. Typography Rules\n" + _s3(dna),
        "## 4. Component Stylings\n" + _s4(dna),
        "## 5. Layout Principles\n" + _bloque(espacio),
        "## 6. Depth & Elevation\n" + _bloque(dna.get("superficie")),
        "## 7. Do's and Don'ts\n" + _s7(dna),
        "## 8. Responsive Behavior\n" + responsive,
        "## 9. Agent Prompt Guide\n" + _s9(prompt_md),
    ]
    return "\n\n".join(bloques) + "\n"


def _validar_slug(slug):
    if not isinstance(slug, str) or not PATRON_SLUG.match(slug) \
            or ".." in slug or "/" in slug:
        raise ErrorDesignMd("slug no válido: %r" % (slug,))
    return slug


def _generar_para(raiz, slug):
    _validar_slug(slug)
    carpeta = os.path.join(raiz, "memory", "diseno", "adn", slug)
    ruta_dna = os.path.join(carpeta, "dna.json")
    if not os.path.isfile(ruta_dna):
        raise ErrorDesignMd("falta dna.json en " + carpeta)
    with open(ruta_dna, encoding="utf-8") as archivo:
        dna = json.load(archivo)
    prompt = ""
    ruta_prompt = os.path.join(carpeta, "PROMPT.md")
    if os.path.isfile(ruta_prompt):
        with open(ruta_prompt, encoding="utf-8") as archivo:
            prompt = archivo.read()
    return carpeta, design_md(dna, prompt)


def _slugs_disponibles(raiz):
    base = os.path.join(raiz, "memory", "diseno", "adn")
    if not os.path.isdir(base):
        raise ErrorDesignMd("no existe " + base)
    slugs = [n for n in sorted(os.listdir(base)) if PATRON_SLUG.match(n)
             and os.path.isfile(os.path.join(base, n, "dna.json"))]
    if not slugs:
        raise ErrorDesignMd("no hay ADN en " + base)
    return slugs


def main(argv=None):
    analizador = argparse.ArgumentParser(prog="diseno_adn_a_design_md.py")
    grupo = analizador.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--slug", help="contexto de memory/diseno/adn/<slug>")
    grupo.add_argument("--todos", action="store_true", help="todos los ADN disponibles")
    analizador.add_argument(
        "--raiz",
        default=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")),
        help="carpeta del repositorio")
    analizador.add_argument("--escribir", action="store_true",
                            help="escribe DESIGN.md junto al dna.json")
    args = analizador.parse_args(argv)
    raiz = os.path.abspath(args.raiz)
    try:
        slugs = _slugs_disponibles(raiz) if args.todos else [_validar_slug(args.slug)]
        for slug in slugs:
            carpeta, texto = _generar_para(raiz, slug)
            if args.escribir:
                with open(os.path.join(carpeta, NOMBRE_SALIDA), "w", encoding="utf-8") as archivo:
                    archivo.write(texto)
            else:
                print(texto, end="")
        return 0
    except (ErrorDesignMd, OSError, ValueError) as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
