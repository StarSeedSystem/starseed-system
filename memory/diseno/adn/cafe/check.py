#!/usr/bin/env python3
import json, re, sys
def rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def lum(h):
    r, g, b = rgb(h)
    return 0.2126 * ((r/255)/12.92 if (r/255) <= 0.04045 else ((r/255 + 0.055) / 1.055) ** 2.4) + \
           0.7152 * ((g/255)/12.92 if (g/255) <= 0.04045 else ((g/255 + 0.055) / 1.055) ** 2.4) + \
           0.0722 * ((b/255)/12.92 if (b/255) <= 0.04045 else ((b/255 + 0.055) / 1.055) ** 2.4)
def con(a, b):
    x, y = sorted([lum(a), lum(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)
def px(v, u):
    return float(v) * 16 if u in ("rem", "em") else float(v) * 1.333 if u == "pt" else float(v)
try:
    d = json.load(sys.stdin)
except:
    d = {}
f = sorted({round(float(x), 1) for x in d.get("font-sizes", [])})
c = [x for x in d.get("colors", []) if isinstance(x, str) and re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$', x)]
c = [x if len(x) == 7 else "#" + "".join(y * 2 for y in x[1:]) for x in c]
r = {}
r["p2"] = ("aprobado" if len(f) <= 3 else "fallo", f"{len(f)} tamaños: {f}") if f else ("manual", "no se proporcionaron tamaños de fuente")
if len(f) >= 2:
    if f[0] > 0:
        p = f[-1] / f[0]
        r["p3"] = ("aprobado" if p >= 6 else "fallo", f"mayor/menor = {p:.2f}")
    else:
        r["p3"] = ("fallo", "tamaño mínimo cero o negativo")
else:
    r["p3"] = ("manual", "se necesitan al menos dos tamaños de fuente")
r["p4"] = ("aprobado" if f and f[0] >= 28 else "fallo", f"menor {f[0] if f else 0} px (mínimo 28)") if f else ("manual", "no se proporcionaron tamaños de fuente")
mw = d.get("max-width-ch")
pl = d.get("paragraph-lengths", [])
if mw is not None:
    r["p5"] = ("aprobado" if int(mw) <= 65 else "fallo", f"max-width {mw}ch")
elif pl:
    ml = max(pl)
    r["p5"] = ("manual" if ml > 65 else "aprobado", f"párrafo de {ml} caracteres sin max-width en ch" if ml > 65 else f"párrafos cortos (máximo {ml} caracteres)")
else:
    r["p5"] = ("manual", "no se proporcionó información de max-width o párrafos")
r["p6"] = ("manual", "jugada rara una sola vez: mírala en el storyboard")
cp = d.get("color-pairs", [])
if cp:
    vp = [(a, b) for a, b in cp if len((a, b)) >= 2 and re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$', a) and re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$', b)]
    if vp:
        vp = [(a if len(a) == 7 else "#" + "".join(y * 2 for y in a[1:]), b if len(b) == 7 else "#" + "".join(y * 2 for y in b[1:])) for a, b in vp]
        cs = [con(a, b) for a, b in vp]
        p = min(cs)
        r["p7"] = ("aprobado" if p >= 4.5 else "fallo", f"peor par {p:.2f}:1")
    else:
        r["p7"] = ("manual", "no se proporcionaron pares de colores válidos")
else:
    r["p7"] = ("manual", "no se proporcionaron pares de colores para contraste")
ie = d.get("interactive-elements", [])
if ie:
    hs = []
    for e in ie:
        h = e.get("min-height") or e.get("height")
        if h:
            if isinstance(h, str):
                m = re.match(r'([\d.]+)(px|rem|em|pt)', h)
                if m:
                    hs.append(px(float(m.group(1)), m.group(2)))
                else:
                    try:
                        hs.append(float(h))
                    except ValueError:
                        pass
            else:
                hs.append(float(h))
    if hs:
        mh = min(hs)
        r["p8"] = ("aprobado" if mh >= 44 else "fallo", f"{len(ie)} elementos interactivos; min-height {mh:.0f}px")
    else:
        r["p8"] = ("manual", f"{len(ie)} elementos interactivos; altura no declarada")
else:
    r["p8"] = ("no aplica", "sin elementos interactivos")
fc = [x for x in c if x.upper() not in {"#007FFF", "#10B981", "#FFBF00", "#DC143C", "#0057B0", "#047857", "#F8F9FA", "#0A0F1D", "#141B2E", "#EDF0F4", "#46506A", "#AEB6C8", "#FFFFFF", "#000000"}]
r["prohibiciones"] = ("fallo" if fc else "aprobado" if c else "manual", f"hex fuera de la paleta: {fc}" if fc else "ninguna" if c else "no se proporcionaron colores para verificar")
for i in range(1, 9):
    k = f"p{i}"
    e, dt = r.get(k, ("manual", "no medido en esta pasada"))
    print(f"{k}: {e} · {dt}")
if "prohibiciones" in r:
    e, dt = r["prohibiciones"]
    print(f"prohibiciones: {e} · {dt}")
s = [v[0] for v in r.values() if v[0] == "fallo"]
sys.exit(1 if s else 0)