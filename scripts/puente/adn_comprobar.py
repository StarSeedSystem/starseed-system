#!/usr/bin/env python3
"""Comprobador común del ADN: medir pruebas p1-p8 con métricas reales."""
import json, re, sys

def evaluar(dna, m):
    r=[]
    for p in dna.get("pruebas",[]):
        pid=p.get("id")
        c=p.get("comprobacion","").lower().strip()
        v,mo=_one(pid,c,m)
        r.append((pid,v,mo))
    return r

def _one(pid,c,m):
    if pid=="p1": return _p1(c,m)
    if pid=="p2": return _p2(c,m)
    if pid=="p3": return _p3(c,m)
    if pid=="p4": return _p4(c,m)
    if pid=="p5": return _p5(c,m)
    if pid=="p6": return _p6(c,m)
    if pid=="p7": return _p7(c,m)
    if pid=="p8": return _p8(c,m)
    return ("manual",f"Prueba {pid}: comprobación no reconocida")

def _p1(c,mt):
    # radio 0.85rem
    ma=re.search(r"radio\s+([\d.]+)rem",c)
    if not ma: return ("manual","No se pudo extraer valor de radio en rem")
    er=float(ma.group(1))*16
    rx=mt.get("radio")
    if rx is None: rx=mt.get("radio_px") or mt.get("border_radius")
    if rx is None: return ("manual","Métrica de radio no encontrada")
    t=0.5
    if abs(rx-er)<=t: return ("aprobado",f"Radio {rx}px ≈ {er/16}rem")
    return ("suspenso",f"Radio {rx}px difiere de {er/16}rem ({er}px)")

def _p2(c,mt):
    # blur 10px
    ma=re.search(r"blur\s+([\d.]+)px",c)
    if not ma: return ("manual","No se pudo extraer valor de blur en px")
    eb=float(ma.group(1))
    bx=mt.get("blur")
    if bx is None: bx=mt.get("blur_px")
    if bx is None: return ("manual","Métrica de blur no encontrada")
    t=0.5
    if abs(bx-eb)<=t: return ("aprobado",f"Blur {bx}px ≈ {eb}px")
    return ("suspenso",f"Blur {bx}px difiere de {eb}px")

def _p3(c,mt):
    # animacion solo transform opacity
    ok=mt.get("animacion_solo_transform_opacity")
    if ok is None: ok=mt.get("animacion_transform_opacity_solo")
    if ok is None: return ("manual","Métrica de animación solo transform/opacity no encontrada")
    return ("aprobado","Animación solo usa transform y opacity") if ok else ("suspenso","Animación usa propiedades además de transform and opacity")

def _p4(c,mt):
    # sin WebGL
    nw=not mt.get("usa_webgl",False)
    if "usa_webgl" not in mt and "webgl" not in mt: return ("manual","Métrica de uso de WebGL no encontrada")
    return ("aprobado","No se usa WebGL") if nw else ("suspenso","Se usa WebGL")

def _p5(c,mt):
    # contraste >=4.5:1
    ma=re.search(r"contraste\s*>=\s*([\d.]+)",c)
    ex=float(ma.group(1)) if ma else 4.5
    ct=mt.get("contraste")
    if ct is None: return ("manual","Métrica de contraste no encontrada")
    return ("aprobado",f"Contraste {ct} >= {ex}") if ct>=ex else ("suspenso",f"Contraste {ct} < {ex}")

def _p6(c,mt):
    # dianas >=44px
    ma=re.search(r"dianas\s*>=\s*(\d+)px",c)
    ex=int(ma.group(1)) if ma else 44
    d=mt.get("diana_min_px")
    if d is None: d=mt.get("min_touch_target")
    if d is None: return ("manual","Métrica de tamaño mínimo de diana no encontrada")
    return ("aprobado",f"Diana mínima {d}px >= {ex}px") if d>=ex else ("suspenso",f"Diana mínima {d}px < {ex}px")

def _p7(c,mt):
    # prefers-reduced-motion respeta
    ok=mt.get("respeta_reduced_motion")
    if ok is None: ok=mt.get("prefers_reduced_motion_ok")
    if ok is None: return ("manual","Métrica de preferes-reduced-motion no encontrada")
    return ("aprobado","Respecta prefers-reduced-motion") if ok else ("suspenso","No respeta prefers-reduced-motion")

def _p8(c,mt):
    # no anima dimensiones
    nd=mt.get("no_anima_dimensiones")
    if nd is None:
        nd=not mt.get("anima_dimensiones",False)
        if "no_anima_dimensiones" not in mt and "anima_dimensiones" not in mt: return ("manual","Métrica de animación de dimensiones no encontrada")
    return ("aprobado","No anima dimensiones") if nd else ("suspenso","Anima dimensiones (width, height, top, left, etc.)")

if __name__=="__main__":
    if len(sys.argv)!=3:
        print("Uso: python3 adn_comprobar.py <dna.json> <metricas.json>")
        sys.exit(1)
    with open(sys.argv[1],encoding="utf-8") as f: d=json.load(f)
    with open(sys.argv[2],encoding="utf-8") as f: mt=json.load(f)
    for pid,v,mo in evaluar(d,mt): print(f"{pid}: {v} - {mo}")