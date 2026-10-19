#!/usr/bin/env python3
"""Comprobador ADN (referencia: memory/diseno/estudio-audiovisual/scripts/comprobar_adn.py).

Mide p1-p8 sobre la carpeta recibida (dna.json + PROMPT.md + referencia/).
Lo que no se puede medir con las métricas recibidas sale como «manual».
Nunca imprime «aprobado» a ciegas.
"""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Referencia de paleta (de comprobar_adn.py)
PALETA = {v.upper() for v in [
    "#007FFF", "#10B981", "#FFBF00", "#DC143C", "#0057B0", "#047857",
    "#F8F9FA", "#0A0F1D", "#141B2E", "#EDF0F4", "#46506A", "#AEB6C8",
    "#FFFFFF", "#000000"
]}


def main(carpeta):
    res = {}

    # p1: referencia de imagen (manual si no hay referencia o no hay Pillow)
    ref_dir = os.path.join(carpeta, "referencia") if carpeta else ""
    ref_img = None
    if ref_dir and os.path.isdir(ref_dir):
        for nombre in sorted(os.listdir(ref_dir)):
            if not nombre.startswith("."):
                ref_img = os.path.join(ref_dir, nombre)
                break
    if ref_img and os.path.isfile(ref_img):
        try:
            from PIL import Image
            img = Image.open(ref_img).convert("RGB")
            img.thumbnail((480, 480))
            pix = list(img.getdata())
            acentos = [[0, 127, 255], [16, 185, 129], [255, 191, 0], [220, 20, 60]]
            def cerca(p, c, tol=70):
                return sum((a-b)**2 for a,b in zip(p,c)) <= tol*tol
            n = sum(1 for p in pix if any(cerca(p, ac) for ac in acentos))
            cobertura = 100 * n / len(pix) if pix else 0
            res["p1"] = ("aprobado" if 20 <= cobertura <= 30 else "fallo",
                        f"acento {cobertura:.1f} % del cuadro (20-30 %)")
        except Exception:
            res["p1"] = ("manual", "falta Pillow o imagen no legible")
    else:
        res["p1"] = ("manual", "sin referencia de imagen en referencia/")

    # p6: jugada rara (leer dna.json, nunca aprobar a ciegas)
    dna = {}
    ruta_dna = os.path.join(carpeta, "dna.json") if carpeta else None
    if ruta_dna and os.path.isfile(ruta_dna):
        try:
            with open(ruta_dna, encoding="utf-8") as f:
                dna = json.load(f)
        except Exception:
            pass
    jugada = (dna.get("jugada_rara") or {}).get("que", "")
    res["p6"] = ("manual" if not jugada else ("aprobado" if jugada else "fallo"),
                "jugada rara una sola vez: " + ("presente" if jugada else "ausente"))
    # Regla: nunca «aprobado» automático sin evidencia; mantenemos manual
    # si no hay forma de contar ocurrencias en el archivo de referencia.
    res["p6"] = ("manual", "jugada rara una sola vez: mírala en el storyboard o PROMPT.md")

    # p7: contraste (manual; requiere métricas que no vienen por defecto)
    res["p7"] = ("manual", "contraste requiere métricas medidas (par de colores)")

    # p2-p5 y p8: medir sobre PROMPT.md si existe, de lo contrario manual
    ruta_prom = os.path.join(carpeta, "PROMPT.md") if carpeta else None
    if ruta_prom and os.path.isfile(ruta_prom):
        try:
            texto = open(ruta_prom, encoding="utf-8", errors="replace").read()
        except Exception:
            texto = ""
    else:
        texto = ""

    # p2: tamaños declarados (revisar_archivo de referencia, simplificado)
    tamanos = sorted({round(float(v), 1) for v in re.findall(r"font-size\s*:\s*([\d.]+)(px|rem|em|pt)", texto)})
    res["p2"] = ("aprobado" if len(tamanos) <= 3 else "fallo", f"{len(tamanos)} tamaños: {tamanos}" if tamanos else "sin tamaños declarados")

    # p3: proporción mayor/menor
    if len(tamanos) >= 2:
        prop = tamanos[-1] / tamanos[0] if tamanos[0] > 0 else 0
        res["p3"] = ("aprobado" if prop >= 6 else "fallo", f"mayor/menor = {prop:.2f}")
    else:
        res["p3"] = ("manual", "menos de dos tamaños declarados")

    # p4: tamaño mínimo
    res["p4"] = ("aprobado" if (tamanos and tamanos[0] >= 28) else ("manual" if not tamanos else "fallo"),
                f"menor {tamanos[0]} px (mínimo 28)" if tamanos else "sin tamaños declarados")

    # p5: cuerpo <= 65 chars o max-width en ch
    parrafos = [re.sub(r"<[^>]+>", "", p).strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", texto, flags=re.S)]
    ancho_ch = [int(n) for n in re.findall(r"max-width\s*:\s*(\d+)ch", texto)]
    if ancho_ch:
        res["p5"] = ("aprobado" if max(ancho_ch) <= 65 else "fallo", f"max-width {max(ancho_ch)}ch")
    elif parrafos and max(len(p) for p in parrafos) > 65:
        res["p5"] = ("manual", f"párrafo de {max(len(p) for p in parrafos)} caracteres sin max-width en ch")
    else:
        res["p5"] = ("manual" if not parrafos else ("aprobado" if parrafos else "manual"),
                    "párrafos cortos" if parrafos else "sin párrafos")
    if not texto:
        res["p5"] = ("manual", "sin PROMPT.md para medir")

    # p8: dianas interactivas >= 44 px
    interactivos = len(re.findall(r"<(button|a\s|input|select)|role=\"button\"", texto))
    altos = [float(v) for v in re.findall(r"min-height\s*:\s*([\d.]+)(px|rem)", texto)]
    if interactivos:
        ok = altos and min(altos) >= 44
        res["p8"] = ("aprobado" if ok else "manual", f"{interactivos} interactivos; min-height {altos or 'sin declarar'}")
    else:
        res["p8"] = ("manual", "sin elementos interactivos en PROMPT.md")

    # Prohibiciones (revisar archivo de referencia si existe, o PROMPT.md)
    archivo_a_revisar = ruta_prom if texto else None
    prohibido = []
    if archivo_a_revisar and os.path.isfile(archivo_a_revisar):
        sin_defs = re.sub(r"--[\w-]+\s*:\s*[^;]+;", "", texto)
        hex_sueltos = sorted({h.upper() for h in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", sin_defs)})
        fuera_paleta = [h for h in hex_sueltos if (h if len(h) == 7 else "#" + "".join(c*2 for c in h[1:])) not in PALETA]
        if fuera_paleta:
            prohibido.append(f"hex fuera de la paleta: {fuera_paleta}")
        anima_dim = re.findall(r"(?:transition(?:-property)?|animation)[^;{}]*\b(width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*)\b", texto)
        keyframes_dim = re.findall(r"@keyframes[^{]*\{[^@]*?\b(width|height|margin|padding)\s*:", texto, flags=re.S)
        if anima_dim or keyframes_dim:
            prohibido.append(f"anima dimensiones: {sorted(set(anima_dim + keyframes_dim))}")
        sombras = [s for s in re.findall(r"box-shadow\s*:\s*([^;}]+)", texto) if "," in re.sub(r"\([^)]*\)", "", s)]
        if sombras:
            prohibido.append(f"sombras múltiples: {len(sombras)}")
    res["prohibiciones"] = ("fallo" if prohibido else "aprobado", "; ".join(prohibido) or "ninguna")

    # Aviso (hex sueltos de paleta sin variable)
    aviso = None
    if archivo_a_revisar and os.path.isfile(archivo_a_revisar) and texto:
        sin_defs = re.sub(r"--[\w-]+\s*:\s*[^;]+;", "", texto)
        hex_sueltos = sorted({h.upper() for h in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", sin_defs)})
        if hex_sueltos and not (res.get("prohibiciones", ("aprobado",))[0] == "fallo" and "hex fuera" in (res.get("prohibiciones", ("",))[1] or "")):
            aviso = ("aviso", f"{len(hex_sueltos)} hex de la paleta escritos sin variable: usa var(--ss-…)")
    if aviso:
        res["aviso"] = aviso

    # Salida estándar (esperada por diseno_adn.ejecutar_pruebas)
    for p in ("p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"):
        estado, detalle = res.get(p, ("manual", "no medido"))
        print(f"{p}: {estado} · {detalle}")
    for k in ("prohibiciones", "aviso"):
        if k in res:
            print(f"{k}: {res[k][0]} · {res[k][1]}")

    # Nunca salir con 0 si hay fallos; manual no es fallido.
    fallos = [k for k, v in res.items() if isinstance(v, tuple) and v[0] == "fallo" and k.startswith("p")]
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    carpeta = sys.argv[1] if len(sys.argv) > 1 else "."
    main(carpeta)
