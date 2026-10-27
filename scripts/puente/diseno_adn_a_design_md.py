"""Generador del DESIGN.md de un contexto a partir de su ADN (dna.json).

Contrato DSN1025C (architecture/repos-libreria-1025.md, §5 «Diseño», tarea
DSN1025C): escribe el DESIGN.md de un contexto en el formato NUMERADO de nueve
apartados que lee Google Stitch (ficha lib-awesome-design-md). Solo biblioteca
estándar: sin red, sin efectos al importar y determinista (misma entrada,
misma salida). El ADN manda sobre el gusto de cualquier skill; lo que falta en
el ADN no se inventa: se dice «Sin datos en el ADN». Nunca incluye logos ni
fotos con licencia (meta.no_copiado se declara como «No copiado»).
"""

import argparse
import json
import os
import re
import sys

SIN_DATOS = "Sin datos en el ADN"
SIN_PROMPT = "Sin PROMPT.md"
LINEAS_PROMPT = 14
PATRON_SLUG = re.compile(r"^[a-z0-9-]+$")
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


def _es_vacio(valor):
    if valor is None or valor == "":
        return True
    return isinstance(valor, (list, dict)) and not valor


def _dato_plano(valor):
    """Un valor del ADN como texto corto; nada se inventa."""
    if _es_vacio(valor):
        return SIN_DATOS
    if isinstance(valor, dict):
        return json.dumps(valor, ensure_ascii=False, separators=(", ", ": "))
    if isinstance(valor, list):
        return ", ".join(str(x) for x in valor)
    return str(valor)


def _seccion_tema(dna):
    alma = dna.get("alma") or {}
    lineas = []
    if alma.get("una_linea"):
        lineas.append("**%s**" % alma["una_linea"])
    if alma.get("adjetivos"):
        lineas.append(
            "Palabras clave: %s." % ", ".join(str(a) for a in alma["adjetivos"]))
    if alma.get("linaje"):
        lineas.append("Linaje: %s." % alma["linaje"])
    inferido = [str(x) for x in dna.get("inferido") or []]
    if inferido:
        lineas.append("Inferido, no medido: %s." % ", ".join(inferido))
    return lineas or [SIN_DATOS]


def _seccion_color(dna):
    lineas = []
    for entrada in dna.get("paleta") or []:
        nombre = entrada.get("nombre") or entrada.get("rol") or "(sin nombre)"
        partes = ["**%s**" % nombre]
        if entrada.get("hex"):
            partes.append("`%s`" % entrada["hex"])
        if entrada.get("rol"):
            partes.append("rol: %s" % entrada["rol"])
        if entrada.get("cobertura") is not None:
            partes.append("cobertura %s %%" % entrada["cobertura"])
        lineas.append("*   " + " — ".join(partes) + ".")
        for prohibido in entrada.get("prohibido") or []:
            lineas.append("    *   No con este color: %s." % prohibido)
    return lineas or [SIN_DATOS]


def _seccion_tipo(dna):
    tipo = dna.get("tipo") or {}
    familias = tipo.get("familias") or []
    lineas = []
    for fam in familias:
        partes = []
        if fam.get("rol"):
            partes.append("rol %s" % fam["rol"])
        if fam.get("nombre"):
            partes.append(str(fam["nombre"]))
        fila = "*   " + " — ".join(partes)
        if fam.get("fallback"):
            fila += " (fallback: %s)" % fam["fallback"]
        lineas.append(fila + ".")
    if not familias:
        lineas.append(SIN_DATOS)
    lineas.append("Pesos: %s." % _dato_plano(tipo.get("pesos")))
    lineas.append("Pasos: %s." % _dato_plano(tipo.get("pasos")))
    return lineas


def _seccion_firmas(dna):
    firmas = dna.get("firmas") or []
    if not firmas:
        return [SIN_DATOS]
    return [
        "*   **%s** — proporción: %s." % (
            f.get("jugada") or "(sin nombre)", _dato_plano(f.get("como")))
        for f in firmas
    ]


def _seccion_diccionario(dna, clave):
    dato = dna.get(clave)
    if _es_vacio(dato):
        return [SIN_DATOS]
    if not isinstance(dato, dict):
        return [_dato_plano(dato)]
    lineas = [
        "*   **%s**: %s." % (k, _dato_plano(v)) for k, v in dato.items()
    ]
    return lineas or [SIN_DATOS]


def _seccion_reglas(dna):
    lineas = ["*   No: %s." % p for p in dna.get("prohibiciones") or []]
    jugada = dna.get("jugada_rara") or {}
    if jugada.get("que"):
        extra = []
        if jugada.get("como"):
            extra.append(str(jugada["como"]))
        if jugada.get("por_que"):
            extra.append("por qué: %s" % jugada["por_que"])
        cola = " (%s)" % "; ".join(extra) if extra else ""
        lineas.append("*   Una vez: %s%s." % (jugada["que"], cola))
    for item in (dna.get("meta") or {}).get("no_copiado") or []:
        lineas.append("*   No copiado: %s." % item)
    return lineas or [SIN_DATOS]


def _seccion_responsive(dna):
    if _es_vacio(dna.get("espacio")):
        return [SIN_DATOS]
    lineas = [
        "Espacio inteligente por aparato (teléfono, tableta, escritorio, "
        "pantalla grande, XR y vídeo):"
    ]
    lineas.extend(_seccion_diccionario(dna, "espacio"))
    return lineas


def _seccion_prompt(prompt_md):
    lineas = [l.strip() for l in (prompt_md or "").splitlines() if l.strip()]
    if not lineas:
        return [SIN_PROMPT]
    return ["```text"] + lineas[:LINEAS_PROMPT] + ["```"]


def design_md(dna: dict, prompt_md: str = "") -> str:
    """Pura y determinista: mismo dna y prompt_md, mismo texto."""
    meta = dna.get("meta") or {}
    slug = meta.get("slug") or "(sin slug)"
    fecha = meta.get("fecha") or "(sin dato)"
    cabecera = [
        "# Design System: %s" % (meta.get("nombre") or "(sin nombre)"),
        "<!-- Generado desde memory/diseno/adn/%s/dna.json (fecha %s). "
        "No editar a mano. -->" % (slug, fecha),
    ]
    secciones = [
        (TITULOS[0], _seccion_tema(dna)),
        (TITULOS[1], _seccion_color(dna)),
        (TITULOS[2], _seccion_tipo(dna)),
        (TITULOS[3], _seccion_firmas(dna)),
        (TITULOS[4], _seccion_diccionario(dna, "espacio")),
        (TITULOS[5], _seccion_diccionario(dna, "superficie")),
        (TITULOS[6], _seccion_reglas(dna)),
        (TITULOS[7], _seccion_responsive(dna)),
        (TITULOS[8], _seccion_prompt(prompt_md)),
    ]
    bloques = ["\n".join(cabecera)]
    for titulo, lineas in secciones:
        bloques.append(titulo + "\n" + "\n".join(lineas))
    return "\n\n".join(bloques) + "\n"


def raiz_por_defecto():
    """La carpeta del repo: dos niveles arriba del archivo (scripts/puente)."""
    return os.path.abspath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def ruta_dna(raiz, slug):
    return os.path.join(raiz, "memory", "diseno", "adn", slug, "dna.json")


def validar_slug(slug):
    if not PATRON_SLUG.match(slug or ""):
        raise ValueError(
            "slug no válido «%s»: solo [a-z0-9-], sin .. ni /" % slug)


def slugs_disponibles(raiz):
    base = os.path.join(raiz, "memory", "diseno", "adn")
    if not os.path.isdir(base):
        return []
    return sorted(
        n for n in os.listdir(base)
        if os.path.isfile(os.path.join(base, n, "dna.json"))
    )


def generar_para(raiz, slug, escribir=False):
    """Lee dna.json (+ PROMPT.md si existe) y devuelve el DESIGN.md."""
    validar_slug(slug)
    ruta = ruta_dna(raiz, slug)
    if not os.path.isfile(ruta):
        raise FileNotFoundError(
            "falta dna.json en memory/diseno/adn/%s/" % slug)
    with open(ruta, encoding="utf-8") as f:
        dna = json.load(f)
    ruta_prompt = os.path.join(os.path.dirname(ruta), "PROMPT.md")
    prompt_md = ""
    if os.path.isfile(ruta_prompt):
        with open(ruta_prompt, encoding="utf-8") as f:
            prompt_md = f.read()
    texto = design_md(dna, prompt_md)
    if escribir:
        destino = os.path.join(os.path.dirname(ruta), "DESIGN.md")
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)
    return texto


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="diseno_adn_a_design_md.py",
        description=(
            "Escribe el DESIGN.md de un contexto desde su "
            "memory/diseno/adn/<slug>/dna.json."
        ),
    )
    parser.add_argument("--slug", help="contexto concreto (solo [a-z0-9-])")
    parser.add_argument(
        "--todos", action="store_true",
        help="todos los contextos con dna.json")
    parser.add_argument(
        "--raiz", default=None,
        help="carpeta del repo (por defecto, dos niveles arriba de este archivo)")
    parser.add_argument(
        "--escribir", action="store_true",
        help="escribe DESIGN.md junto al dna.json; sin ella solo imprime")
    args = parser.parse_args(argv)
    raiz = args.raiz or raiz_por_defecto()
    try:
        if args.todos and args.slug:
            parser.error("usa --slug o --todos, no las dos")
        if args.todos:
            slugs = slugs_disponibles(raiz)
            if not slugs:
                raise FileNotFoundError(
                    "no hay dna.json bajo memory/diseno/adn en %s" % raiz)
            for slug in slugs:
                if not args.escribir:
                    print("===== %s =====" % slug)
                print(generar_para(raiz, slug, args.escribir))
            return 0
        if args.slug:
            print(generar_para(raiz, args.slug, args.escribir))
            return 0
        parser.error("indica --slug <s> o --todos")
    except (ValueError, FileNotFoundError, OSError, json.JSONDecodeError) as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
