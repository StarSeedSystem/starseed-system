#!/usr/bin/env python3
"""Comprobador del ADN de StarSeed OS (pruebas p1-p8 que se pueden medir).

Uso:
  python3 comprobar_adn.py pieza.html [--min 28]        # tamaños, hex sueltos, prohibiciones
  python3 comprobar_adn.py --cuadro fotograma.png        # p1: cobertura de acento en un fotograma
  python3 comprobar_adn.py --par "#0A0F1D" "#F8F9FA"     # p7: contraste WCAG de un par
Se pueden combinar. Sale con 1 si alguna prueba falla. Lo que no se puede medir sale como «manual».
"""
import argparse
import re
import sys
from pathlib import Path

ACENTOS = {"zenith": "#007FFF", "horizonte": "#10B981", "logica": "#FFBF00", "anchor": "#DC143C",
           "zenith-texto": "#0057B0", "horizonte-texto": "#047857"}
NEUTROS = {"nieve": "#F8F9FA", "noche": "#0A0F1D", "noche-alta": "#141B2E", "nieve-honda": "#EDF0F4",
           "pizarra": "#46506A", "bruma": "#AEB6C8", "blanco": "#FFFFFF", "negro": "#000000"}
PALETA = {v.upper() for v in list(ACENTOS.values()) + list(NEUTROS.values())}


def rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def luminancia(h):
    def canal(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb(h)
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)


def contraste(a, b):
    x, y = sorted([luminancia(a), luminancia(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)


def px(valor, unidad):
    v = float(valor)
    return v * 16 if unidad in ("rem", "em") else v * 1.333 if unidad == "pt" else v


def revisar_archivo(ruta, minimo):
    texto = Path(ruta).read_text(encoding="utf-8", errors="replace")
    sin_defs = re.sub(r"--[\w-]+\s*:\s*[^;]+;", "", texto)
    hex_sueltos = sorted({h.upper() for h in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", sin_defs)})
    fuera_paleta = [h for h in hex_sueltos if (h if len(h) == 7 else "#" + "".join(c * 2 for c in h[1:])) not in PALETA]
    tamanos = [px(v, u) for v, u in re.findall(r"font-size\s*:\s*([\d.]+)(px|rem|em|pt)", texto)]
    tamanos += [float(v) for v in re.findall(r'font-size="([\d.]+)', texto)]
    tamanos = sorted({round(t, 1) for t in tamanos})
    anima_dim = re.findall(r"(?:transition(?:-property)?|animation)[^;{}]*\b(width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*)\b", texto)
    keyframes_dim = re.findall(r"@keyframes[^{]*\{[^@]*?\b(width|height|margin|padding)\s*:", texto, flags=re.S)
    sombras_multiples = [s for s in re.findall(r"box-shadow\s*:\s*([^;}]+)", texto) if "," in re.sub(r"\([^)]*\)", "", s)]
    ancho_ch = [int(n) for n in re.findall(r"max-width\s*:\s*(\d+)ch", texto)]
    parrafos = [re.sub(r"<[^>]+>", "", p).strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", texto, flags=re.S)]
    interactivos = len(re.findall(r"<(button|a\s|input|select)|role=\"button\"", texto))
    altos = [px(v, u) for v, u in re.findall(r"min-height\s*:\s*([\d.]+)(px|rem)", texto)]
    r = {}
    r["p2"] = ("aprobado" if len(tamanos) <= 3 else "fallo", f"{len(tamanos)} tamaños: {tamanos}")
    if len(tamanos) >= 2:
        prop = tamanos[-1] / tamanos[0]
        r["p3"] = ("aprobado" if prop >= 6 else "fallo", f"mayor/menor = {prop:.2f}")
    else:
        r["p3"] = ("manual", "menos de dos tamaños declarados")
    if tamanos:
        r["p4"] = ("aprobado" if tamanos[0] >= minimo else "fallo", f"menor {tamanos[0]} px (mínimo {minimo})")
    else:
        r["p4"] = ("manual", "sin tamaños declarados")
    if ancho_ch:
        r["p5"] = ("aprobado" if max(ancho_ch) <= 65 else "fallo", f"max-width {max(ancho_ch)}ch")
    elif parrafos and max(len(p) for p in parrafos) > 65:
        r["p5"] = ("manual", f"párrafo de {max(len(p) for p in parrafos)} caracteres sin max-width en ch")
    else:
        r["p5"] = ("aprobado" if parrafos else "manual", "párrafos cortos" if parrafos else "sin párrafos")
    if interactivos:
        ok = altos and min(altos) >= 44
        r["p8"] = ("aprobado" if ok else "manual", f"{interactivos} elementos interactivos; min-height {altos or 'sin declarar'}")
    else:
        r["p8"] = ("no aplica", "sin elementos interactivos")
    prohibido = []
    if fuera_paleta:
        prohibido.append(f"hex fuera de la paleta: {fuera_paleta}")
    if anima_dim or keyframes_dim:
        prohibido.append(f"anima dimensiones: {sorted(set(anima_dim + keyframes_dim))}")
    if sombras_multiples:
        prohibido.append(f"sombras múltiples: {len(sombras_multiples)}")
    r["prohibiciones"] = ("fallo" if prohibido else "aprobado", "; ".join(prohibido) or "ninguna")
    if hex_sueltos and not fuera_paleta:
        r["aviso"] = ("aviso", f"{len(hex_sueltos)} hex de la paleta escritos sin variable: usa var(--ss-…)")
    return r


def revisar_cuadro(ruta):
    try:
        from PIL import Image
    except ImportError:
        return {"p1": ("manual", "falta Pillow (pip install pillow)")}
    img = Image.open(ruta).convert("RGB")
    img.thumbnail((480, 480))
    pix = list(img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata())
    acentos = [rgb(h) for h in ACENTOS.values()]

    def cerca(p, c, tol=70):
        return sum((a - b) ** 2 for a, b in zip(p, c)) <= tol * tol

    n = sum(1 for p in pix if any(cerca(p, c) for c in acentos))
    cobertura = 100 * n / len(pix)
    return {"p1": ("aprobado" if 20 <= cobertura <= 30 else "fallo", f"acento {cobertura:.1f} % del cuadro (20–30 %)")}


def main():
    ap = argparse.ArgumentParser(description="Comprobador del ADN de StarSeed OS")
    ap.add_argument("archivo", nargs="?")
    ap.add_argument("--min", type=float, default=28)
    ap.add_argument("--cuadro")
    ap.add_argument("--par", nargs=2, action="append", metavar=("TEXTO", "FONDO"))
    a = ap.parse_args()
    res = {}
    if a.archivo:
        res.update(revisar_archivo(a.archivo, a.min))
    if a.cuadro:
        res.update(revisar_cuadro(a.cuadro))
    if a.par:
        peor = None
        for fg, bg in a.par:
            c = contraste(fg, bg)
            print(f"contraste {fg} sobre {bg}: {c:.2f}:1 · texto normal {'sí' if c >= 4.5 else 'no'} · grande {'sí' if c >= 3 else 'no'}")
            peor = c if peor is None else min(peor, c)
        res["p7"] = ("aprobado" if peor >= 4.5 else "fallo", f"peor par {peor:.2f}:1")
    for p in ("p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"):
        estado, detalle = res.get(p, ("manual", "no medido en esta pasada" if p != "p6" else "jugada rara una sola vez: mírala en el storyboard"))
        print(f"{p}: {estado} · {detalle}")
    for k in ("prohibiciones", "aviso"):
        if k in res:
            print(f"{k}: {res[k][0]} · {res[k][1]}")
    sys.exit(1 if any(v[0] == "fallo" for v in res.values()) else 0)


if __name__ == "__main__":
    main()
