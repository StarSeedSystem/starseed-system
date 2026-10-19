#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

# Paleta de colores de StarSeed OS (extraída del comprobador de referencia)
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

def main():
    try:
        data = json.load(sys.stdin)
    except:
        data = {}
    
    # Extraer información útil del JSON
    # Asumimos que el JSON podría contener propiedades de diseño
    font_sizes = data.get("font-sizes", [])
    colors = data.get("colors", [])
    elements = data.get("elements", [])
    styles = data.get("styles", {})
    
    resultados = {}
    
    # p2: Número de tamaños de fuente (debe ser ≤ 3)
    if font_sizes:
        tamanos = sorted({round(float(fs), 1) for fs in font_sizes})
        resultados["p2"] = (
            "aprobado" if len(tamanos) <= 3 else "fallo",
            f"{len(tamanos)} tamaños: {tamanos}"
        )
    else:
        resultados["p2"] = ("manual", "no se proporcionaron tamaños de fuente")
    
    # p3: Proporción entre el tamaño más grande y el más pequeño (debe ser ≥ 6)
    if font_sizes and len(font_sizes) >= 2:
        tamanos = sorted({round(float(fs), 1) for fs in font_sizes})
        if tamanos[0] > 0:
            prop = tamanos[-1] / tamanos[0]
            resultados["p3"] = (
                "aprobado" if prop >= 6 else "fallo",
                f"mayor/menor = {prop:.2f}"
            )
        else:
            resultados["p3"] = ("fallo", "tamaño mínimo cero o negativo")
    else:
        resultados["p3"] = ("manual", "se necesitan al menos dos tamaños de fuente")
    
    # p4: Tamaño mínimo de fuente (debe ser ≥ 28px por defecto)
    if font_sizes:
        tamanos = sorted({round(float(fs), 1) for fs in font_sizes})
        minimo = 28  # valor por defecto del comprobador de referencia
        if tamanos:
            resultados["p4"] = (
                "aprobado" if tamanos[0] >= minimo else "fallo",
                f"menor {tamanos[0]} px (mínimo {minimo})"
            )
        else:
            resultados["p4"] = ("manual", "no se pudieron determinar tamaños de fuente")
    else:
        resultados["p4"] = ("manual", "no se proporcionaron tamaños de fuente")
    
    # p5: max-width en ch (debe ser ≤ 65) o longitud de párrafos
    # Asumimos que podría venir en el JSON
    max_width_ch = data.get("max-width-ch")
    paragraph_lengths = data.get("paragraph-lengths", [])
    
    if max_width_ch is not None:
        resultados["p5"] = (
            "aprobado" if int(max_width_ch) <= 65 else "fallo",
            f"max-width {max_width_ch}ch"
        )
    elif paragraph_lengths:
        max_len = max(paragraph_lengths) if paragraph_lengths else 0
        if max_len > 65:
            resultados["p5"] = (
                "manual",
                f"párrafo de {max_len} caracteres sin max-width en ch"
            )
        elif paragraph_lengths:
            resultados["p5"] = (
                "aprobado",
                f"párrafos cortos (máximo {max_len} caracteres)"
            )
        else:
            resultados["p5"] = ("manual", "sin información de párrafos")
    else:
        resultados["p5"] = ("manual", "no se proporcionó información de max-width o párrafos")
    
    # p6: No está claramente definida en el comprobador de referencia
    # La mencionamos como "jugada rara una sola vez"
    resultados["p6"] = ("manual", "jugada rara una sola vez: mírala en el storyboard")
    
    # p7: Contraste WCAG (debe ser ≥ 4.5 para texto normal)
    # Necesitamos pares de colores (texto, fondo)
    color_pairs = data.get("color-pairs", [])
    if color_pairs and len(color_pairs) > 0:
        peores_contraste = []
        for pair in color_pairs:
            if len(pair) >= 2:
                fg, bg = pair[0], pair[1]
                # Asegurarnos de que sean colores válidos
                if re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$', fg) and \
                   re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$', bg):
                    c = contraste(fg, bg)
                    peores_contraste.append(c)
        
        if peores_contraste:
            peor = min(peores_contraste)
            resultados["p7"] = (
                "aprobado" if peor >= 4.5 else "fallo",
                f"peor par {peor:.2f}:1"
            )
        else:
            resultados["p7"] = ("manual", "no se proporcionaron pares de colores válidos")
    else:
        resultados["p7"] = ("manual", "no se proporcionaron pares de colores para contraste")
    
    # p8: Elementos interactivos con min-height ≥ 44px
    interactive_elements = data.get("interactive-elements", [])
    if interactive_elements:
        heights = []
        for elem in interactive_elements:
            # Asumimos que cada elemento tiene información de altura
            height = elem.get("min-height") or elem.get("height")
            if height:
                # Convertir a px si es necesario
                if isinstance(height, str):
                    # Intentar extraer valor y unidad
                    match = re.match(r'([\d.]+)(px|rem|em|pt)', height)
                    if match:
                        valor, unidad = match.groups()
                        heights.append(px(valor, unidad))
                    else:
                        # Asumir que está en px si no tiene unidad
                        try:
                            heights.append(float(height))
                        except:
                            pass
                else:
                    heights.append(float(height))
        
        if heights:
            min_height = min(heights)
            resultados["p8"] = (
                "aprobado" if min_height >= 44 else "fallo",
                f"{len(interactive_elements)} elementos interactivos; min-height {min_height:.0f}px"
            )
        else:
            resultados["p8"] = ("manual", f"{len(interactive_elements)} elementos interactivos; altura no declarada")
    else:
        resultados["p8"] = ("no aplica", "sin elementos interactivos")
    
    # Prohibiciones: colores fuera de paleta
    forbidden_colors = []
    if colors:
        for color in colors:
            if isinstance(color, str) and re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$', color):
                # Normalizar a formato de 6 dígitos
                if len(color) == 4:
                    color = "#" + "".join(c * 2 for c in color[1:])
                if color.upper() not in PALETA:
                    forbidden_colors.append(color)
    
    if forbidden_colors:
        resultados["prohibiciones"] = (
            "fallo",
            f"hex fuera de la paleta: {forbidden_colors}"
        )
    else:
        resultados["prohibiciones"] = (
            "aprobado" if colors else "manual",
            "ninguna" if colors else "no se proporcionaron colores para verificar"
        )
    
    # Salida en el formato esperado
    # Primero los principios p1-p8
    for i in range(1, 9):
        key = f"p{i}"
        estado, detalle = resultados.get(key, ("manual", "no medido en esta pasada"))
        print(f"{key}: {estado} · {detalle}")
    
    # Luego prohibiciones y avisos (si existen)
    for key in ["prohibiciones"]:  # aviso no se implementa por simplicidad
        if key in resultados:
            estado, detalle = resultados[key]
            print(f"{key}: {estado} · {detalle}")
    
    # Código de salida: 1 si alguna prueba falló (pero no manual)
    fallos = [v[0] for k, v in resultados.items() if v[0] == "fallo"]
    sys.exit(1 if fallos else 0)

if __name__ == "__main__":
    main()