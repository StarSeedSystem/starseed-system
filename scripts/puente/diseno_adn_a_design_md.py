"""Generador del DESIGN.md numerado (Google Stitch) desde el ADN de un contexto.
Ficha: lib-awesome-design-md (config/repos-libreria-1025.json; contrato en architecture/
repos-libreria-1025.md, apartado «Diseño»). Solo biblioteca estándar, sin red ni efectos al importar:
design_md es pura y determinista, y nunca inventa un dato que falta.
"""

import argparse
import json
import os
import re
import sys

SIN = "Sin datos en el ADN"
SIN_PROMPT = "Sin PROMPT.md"
PATRON_SLUG = re.compile(r"^[a-z0-9-]+$")
TOPE_PROMPT = 14
TITULOS = ("Visual Theme & Atmosphere", "Color Palette & Roles", "Typography Rules",
           "Component Stylings", "Layout Principles", "Depth & Elevation", "Do's and Don'ts",
           "Responsive Behavior", "Agent Prompt Guide")

def _mostrar(valor):
    return valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False, sort_keys=True)

def _apartados(dna, prompt_md):
    alma = dna.get("alma") or {}
    tipo = dna.get("tipo") or {}
    tema = [x for x in (
        alma.get("una_linea"),
        ("Adjetivos: " + ", ".join(map(_mostrar, alma["adjetivos"]))) if alma.get("adjetivos") else None,
        "Linaje: " + _mostrar(alma["linaje"]) if alma.get("linaje") else None,
        ("Inferido, no medido: " + ", ".join(map(_mostrar, dna["inferido"]))) if dna.get("inferido") else None,
    ) if x]
    paleta = []
    for e in dna.get("paleta") or []:
        partes = ["**%s**" % _mostrar(e.get("nombre"))]
        for clave, molde in (("hex", "`%s`"), ("rol", "rol %s"), ("cobertura", "cobertura %s %%")):
            if e.get(clave) is not None:
                partes.append(molde % e[clave])
        if e.get("prohibido"):
            partes.append("Prohibido: " + ", ".join(map(_mostrar, e["prohibido"])))
        paleta.append("- " + " · ".join(partes))
    familias = ["- %s: %s" % (_mostrar(f.get("rol")), _mostrar(f.get("nombre")))
                + (" (respaldo: %s)" % f["fallback"] if f.get("fallback") else "")
                for f in tipo.get("familias") or []]
    typo = (["Familias:"] + familias if familias else [SIN])
    for clave in ("pesos", "pasos"):
        typo.append("%s: %s" % (clave.capitalize(), _mostrar(tipo[clave]) if tipo.get(clave) else SIN))
    firmas = ["- %s: proporción %s" % (_mostrar(f.get("jugada")), _mostrar(f.get("como", SIN)))
              for f in dna.get("firmas") or [] if f.get("jugada")]
    guia = [x for x in (prompt_md or "").splitlines() if x.strip()][:TOPE_PROMPT]
    return tema, paleta, typo, firmas or [SIN], guia

def _ramado(valor):
    if valor is None:
        return [SIN]
    if isinstance(valor, dict):
        return ["- %s: %s" % (c, _mostrar(v)) for c, v in sorted(valor.items())]
    return [_mostrar(valor)]

def design_md(dna: dict, prompt_md: str = "") -> str:
    """Escribe el DESIGN.md completo de un contexto a partir de su dna.json."""
    tema, paleta, typo, firmas, guia = _apartados(dna, prompt_md)
    meta = dna.get("meta") or {}
    rara = dna.get("jugada_rara") or {}
    espacio = dna.get("espacio")
    responsive = _ramado(espacio) + (["Regla: espacio inteligente por aparato."]
                                     if espacio is not None else [])
    normas = ["No " + _mostrar(p) for p in dna.get("prohibiciones") or []]
    if rara.get("que"):
        normas.append("Una vez: " + rara["que"] + (" (%s)" % rara["como"] if rara.get("como") else ""))
    normas += ["No copiado: " + _mostrar(a) for a in meta.get("no_copiado") or []]
    comentario = ("<!-- Generado desde memory/diseno/adn/%s/dna.json%s. No editar a mano. -->"
                  % (meta.get("slug"), " (fecha %s)" % meta["fecha"] if meta.get("fecha") else ""))
    lineas = ["# Design System: %s" % _mostrar(meta.get("nombre")), comentario]
    cuerpos = [tema, paleta, typo, firmas, _ramado(espacio), _ramado(dna.get("superficie")),
               normas or [SIN], responsive, guia or [SIN_PROMPT]]
    for numero, cuerpo in enumerate(cuerpos, 1):
        lineas += ["", "## %d. %s" % (numero, TITULOS[numero - 1])] + cuerpo
    return "\n".join(lineas) + "\n"

def main(argv=None):
    parser = argparse.ArgumentParser(description="DESIGN.md numerado desde el ADN del contexto.")
    grupo = parser.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--slug")
    grupo.add_argument("--todos", action="store_true")
    parser.add_argument("--raiz")
    parser.add_argument("--escribir", action="store_true")
    args = parser.parse_args(argv)
    raiz = args.raiz or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    raiz_adn = os.path.join(raiz, "memory", "diseno", "adn")
    if args.todos:
        slugs = sorted(x for x in os.listdir(raiz_adn)
                       if os.path.isfile(os.path.join(raiz_adn, x, "dna.json")))
    else:
        if not args.slug or not PATRON_SLUG.fullmatch(args.slug):
            raise ValueError("slug inválido: %r (solo [a-z0-9-], sin .. ni /)" % (args.slug,))
        slugs = [args.slug]
    for slug in slugs:
        carpeta = os.path.join(raiz_adn, slug)
        ruta = os.path.join(carpeta, "dna.json")
        if not os.path.isfile(ruta):
            raise ValueError("falta dna.json en %s" % carpeta)
        with open(ruta, encoding="utf-8") as f:
            dna = json.load(f)
        prompt = os.path.join(carpeta, "PROMPT.md")
        prompt_md = open(prompt, encoding="utf-8").read() if os.path.isfile(prompt) else ""
        texto = design_md(dna, prompt_md)
        if not args.escribir:
            sys.stdout.write(texto + "\n")
            continue
        destino = os.path.join(carpeta, "DESIGN.md")
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)
        print(destino)
    return 0

if __name__ == "__main__":
    sys.exit(main())
