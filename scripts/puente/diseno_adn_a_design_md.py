"""Generador del DESIGN.md numerado de Stitch desde dna.json (DSN1025C).
Sale entero de memory/diseno/adn/<slug>/dna.json; sin red, sin efectos al importar: mismo ADN, mismo texto."""

import argparse, json, os, re, sys

SIN_DATOS = "Sin datos en el ADN"
SIN_PROMPT = "Sin PROMPT.md"
RUTA_ADN = os.path.join("memory", "diseno", "adn")
REGLA_APARATO = "Regla del sistema: espacio inteligente por aparato (teléfono, tableta, escritorio, pantalla grande, plegable)."
PATRON_SLUG = re.compile(r"^[a-z0-9-]+$")
RAIZ_DEFECTO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

def _bloque(titulo, lineas):
    cuerpo = "\n".join(x for x in lineas if x) or SIN_DATOS
    return titulo + "\n" + cuerpo

def _con(etiqueta, valor):
    return "**%s:** %s" % (etiqueta, valor) if valor else ""

def design_md(dna: dict, prompt_md: str = "") -> str:
    """Compone el DESIGN.md completo; pura y determinista."""
    meta = dna.get("meta") or {}
    cabecera = ("# Design System: %s\n<!-- Generado desde %s/%s/dna.json (fecha %s). No editar a mano. -->"
                % (meta.get("nombre", ""), RUTA_ADN, str(meta.get("slug") or "?"), meta.get("fecha") or "sin fecha"))
    partes = [cabecera, _s1(dna), _s2(dna), _s3(dna), _s4(dna), _rejilla("## 5. Layout Principles", dna, "espacio"),
              _rejilla("## 6. Depth & Elevation", dna, "superficie"), _s7(dna),
              _rejilla("## 8. Responsive Behavior", dna, "espacio", True), _s9(prompt_md)]
    return "\n\n".join(partes) + "\n"

def _s1(dna):
    alma = dna.get("alma") or {}
    lineas = [alma.get("una_linea", ""), _con("Adjetivos", ", ".join(alma.get("adjetivos") or [])),
              _con("Linaje", alma.get("linaje")), _con("Inferido, no medido", ", ".join(dna.get("inferido") or []))]
    return _bloque("## 1. Visual Theme & Atmosphere", lineas)

def _s2(dna):
    return _bloque("## 2. Color Palette & Roles", ["- **%s** · `%s`%s%s%s" % (
        e.get("nombre", ""), e.get("hex", ""), " · rol: %s" % e["rol"] if e.get("rol") else "",
        " · cobertura: %s %%" % e["cobertura"] if e.get("cobertura") is not None else "",
        " · prohibido: %s" % ", ".join(e["prohibido"]) if e.get("prohibido") else "")
        for e in dna.get("paleta") or []])

def _s3(dna):
    tipo = dna.get("tipo") or {}
    lineas = ["- **%s:** %s (fallback: %s)" % (f.get("rol", "?"), f.get("nombre", "?"), f.get("fallback", "?"))
              for f in tipo.get("familias") or []]
    lineas += ["**%s:** %s" % (et, json.dumps(tipo[c], sort_keys=True, ensure_ascii=False) if tipo.get(c) else SIN_DATOS)
               for et, c in (("Pesos", "pesos"), ("Pasos de escala", "pasos"))]
    return _bloque("## 3. Typography Rules", lineas)

def _s4(dna):
    return _bloque("## 4. Component Stylings", ["- **%s** — %s" % (
        f.get("jugada", "?"), f.get("como", "")) for f in dna.get("firmas") or []])

def _detalle(dato):
    if not isinstance(dato, dict):
        return []
    return ["- **%s:** %s" % (k, json.dumps(v, sort_keys=True, ensure_ascii=False)
            if isinstance(v, (dict, list)) else v) for k, v in sorted(dato.items())]

def _rejilla(titulo, dna, clave, regla=False):
    detalle = _detalle(dna.get(clave))
    if regla and detalle:
        detalle.append(REGLA_APARATO)
    return _bloque(titulo, detalle)

def _s7(dna):
    lineas = ["No: %s" % p for p in dna.get("prohibiciones") or []]
    jr = dna.get("jugada_rara") or {}
    detalle = "".join("; %s: %s" % (c, jr[c]) for c in ("como", "por_que") if jr.get(c))
    if jr.get("que"):
        lineas.append("Una vez: %s%s" % (jr["que"], detalle))
    lineas += ["No copiado: %s" % (i if isinstance(i, str) else json.dumps(i, sort_keys=True,
               ensure_ascii=False)) for i in (dna.get("meta") or {}).get("no_copiado") or []]
    return _bloque("## 7. Do's and Don'ts", lineas)

def _s9(prompt_md):
    lineas = [l for l in (prompt_md or "").splitlines() if l.strip()]
    return _bloque("## 9. Agent Prompt Guide", lineas[:14] or [SIN_PROMPT])

def _carpetas(raiz):
    base = os.path.join(raiz, RUTA_ADN)
    if not os.path.isdir(base):
        raise ValueError("no existe la carpeta de ADN: " + base)
    return [n for n in sorted(os.listdir(base)) if os.path.isfile(os.path.join(base, n, "dna.json"))]

def _generar_uno(raiz, slug, escribir):
    carpeta = os.path.join(raiz, RUTA_ADN, slug)
    with open(os.path.join(carpeta, "dna.json"), encoding="utf-8") as f:
        dna = json.load(f)
    prompt = os.path.join(carpeta, "PROMPT.md")
    texto = design_md(dna, open(prompt, encoding="utf-8").read() if os.path.isfile(prompt) else "")
    destino = os.path.join(carpeta, "DESIGN.md")
    if not escribir:
        return texto
    with open(destino, "w", encoding="utf-8") as f:
        f.write(texto)
    return "escrito: " + destino

def main(argv=None):
    parser = argparse.ArgumentParser(prog="diseno_adn_a_design_md.py")
    parser.add_argument("--slug", help="contexto concreto, p. ej. cafe")
    parser.add_argument("--todos", action="store_true", help="todos los contextos con dna.json")
    parser.add_argument("--raiz", default=RAIZ_DEFECTO, help="carpeta raíz del repo")
    parser.add_argument("--escribir", action="store_true", help="escribe DESIGN.md junto a cada dna.json")
    args = parser.parse_args(argv)
    try:
        if bool(args.slug) == args.todos:
            raise ValueError("usa exactamente uno de --slug o --todos")
        if args.slug and (not PATRON_SLUG.match(args.slug) or ".." in args.slug or "/" in args.slug):
            raise ValueError("slug no válido «%s»: solo [a-z0-9-]" % args.slug)
        for slug in _carpetas(args.raiz) if args.todos else [args.slug]:
            print(_generar_uno(args.raiz, slug, args.escribir))
        return 0
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print("error: " + str(exc), file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
