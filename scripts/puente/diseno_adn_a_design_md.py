"""Generador del DESIGN.md de un contexto a partir de su ADN.

Formato numerado de nueve apartados (Stitch). Sin red y sin efectos al importar.
"""

import argparse, json, re, sys
from pathlib import Path

SIN_DATOS = "Sin datos en el ADN"
PATRON_SLUG = re.compile(r"^[a-z0-9-]+$")

def _texto(valor):
    if valor is None:
        return ""
    if isinstance(valor, (list, tuple)):
        return ", ".join(str(v) for v in valor if str(v).strip())
    return str(valor).strip()

def _bloque(datos):
    if not datos:
        return SIN_DATOS
    return "\n".join("- %s: %s" % (str(k).replace("_", " "), _texto(v))
                     for k, v in datos.items() if _texto(v)) or SIN_DATOS

def design_md(dna, prompt_md=""):
    """Devuelve el DESIGN.md del ADN dado; misma entrada, misma salida."""
    meta, alma, tipo = (dna.get(k) or {} for k in ("meta", "alma", "tipo"))
    slug = _texto(meta.get("slug")) or "sin-slug"
    lineas = [
        "# Design System: " + (_texto(meta.get("nombre")) or "Sin nombre"), "",
        "<!-- Generado desde memory/diseno/adn/%s/dna.json (fecha %s). "
        "No editar a mano. -->" % (slug, _texto(meta.get("fecha")) or SIN_DATOS), "",
        "## 1. Visual Theme & Atmosphere", "",
        _texto(alma.get("una_linea")) or SIN_DATOS,
    ]
    for clave, etiqueta in (("adjetivos", "Adjetivos"), ("linaje", "Linaje"),
                            ("inferido", "Inferido, no medido")):
        valor = dna.get(clave) if clave == "inferido" else alma.get(clave)
        if valor:
            lineas.append("**%s:** %s." % (etiqueta, _texto(valor)))
    lineas += ["", "## 2. Color Palette & Roles", ""]
    paleta = dna.get("paleta") or []
    for e in paleta:
        lineas.append(
            "- **%s** — `%s` · rol: %s · cobertura: %s %% · prohibido: %s" % (
                _texto(e.get("nombre")) or SIN_DATOS, _texto(e.get("hex")) or SIN_DATOS,
                _texto(e.get("rol")) or SIN_DATOS, _texto(e.get("cobertura")) or SIN_DATOS,
                _texto(e.get("prohibido")) or "ninguno"))
    lineas += [SIN_DATOS] if not paleta else []
    lineas += ["", "## 3. Typography Rules", ""]
    familias = tipo.get("familias") or []
    for fam in familias:
        lineas.append("- **%s**: %s (fallback: %s)" % (
            _texto(fam.get("rol")) or SIN_DATOS, _texto(fam.get("nombre")) or SIN_DATOS,
            _texto(fam.get("fallback")) or SIN_DATOS))
    lineas += [SIN_DATOS] if not familias else []
    lineas += ["- Pesos: " + (_texto(tipo.get("pesos")) or SIN_DATOS),
               "- Pasos: " + (_texto(tipo.get("pasos")) or SIN_DATOS)]
    lineas += ["", "## 4. Component Stylings", ""]
    firmas = dna.get("firmas") or []
    for firma in firmas:
        lineas.append("- **%s** — %s" % (
            _texto(firma.get("jugada")) or SIN_DATOS,
            _texto(firma.get("como")) or SIN_DATOS))
    lineas += [SIN_DATOS] if not firmas else []
    lineas += ["", "## 5. Layout Principles", "", _bloque(dna.get("espacio")),
               "", "## 6. Depth & Elevation", "", _bloque(dna.get("superficie"))]
    lineas += ["", "## 7. Do's and Don'ts", ""]
    lineas += ["- No: " + _texto(p) for p in dna.get("prohibiciones") or []]
    rara = dna.get("jugada_rara") or {}
    if rara.get("que"):
        cola = " · ".join(x for x in (_texto(rara.get("como")), _texto(rara.get("por_que"))) if x)
        lineas.append("- Una vez: %s%s" % (_texto(rara.get("que")), " (" + cola + ")" if cola else ""))
    if meta.get("no_copiado"):
        lineas.append("- No copiado: " + _texto(meta.get("no_copiado")))
    lineas += ["", "## 8. Responsive Behavior", ""]
    lineas += ([_bloque(dna.get("espacio")), "", "Espacio inteligente por aparato."]
               if dna.get("espacio") else [SIN_DATOS])
    lineas += ["", "## 9. Agent Prompt Guide", ""]
    guia = [x.rstrip() for x in (prompt_md or "").splitlines() if x.strip()][:14]
    lineas += guia or ["Sin PROMPT.md"]
    return "\n".join(lineas).rstrip() + "\n"

def _generar(raiz, slug):
    carpeta = Path(raiz) / "memory" / "diseno" / "adn" / slug
    ruta = carpeta / "PROMPT.md"
    dna = json.loads((carpeta / "dna.json").read_text(encoding="utf-8"))
    return design_md(dna, ruta.read_text(encoding="utf-8") if ruta.is_file() else ""), carpeta

def main(argv=None):
    raiz = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(
        description="Genera el DESIGN.md de un contexto desde su ADN.")
    grupo = parser.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--slug")
    grupo.add_argument("--todos", action="store_true")
    parser.add_argument("--raiz", default=str(raiz))
    parser.add_argument("--escribir", action="store_true")
    args = parser.parse_args(argv)
    if args.todos:
        base = Path(args.raiz) / "memory" / "diseno" / "adn"
        slugs = sorted(p.parent.name for p in base.glob("*/dna.json"))
    else:
        slugs = [args.slug]
    for slug in slugs:
        if not PATRON_SLUG.match(slug or "") or ".." in slug:
            print("slug inválido: %r" % slug, file=sys.stderr)
            return 2
        texto, carpeta = _generar(args.raiz, slug)
        if args.escribir:
            destino = carpeta / "DESIGN.md"
            destino.write_text(texto, encoding="utf-8")
            print(destino)
        else:
            print(texto, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
