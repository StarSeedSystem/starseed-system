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
    # acento 20-30 %
    ma=re.search(r"acento\s+(\d+)\s*[–-]\s*(\d+)\s*%",c)
    if not ma:
        ma=re.search(r"acento\s+(\d+)\s*%\s*[–-]\s*(\d+)\s*%",c)
    if not ma:
        return ("manual","No se pudo extraer rango de porcentaje de acento")
    try:
        low=int(ma.group(1))
        high=int(ma.group(2))
    except:
        return ("manual","Rango de porcentaje de acento no válido")
    # métrica: porcentaje de acento
    pct=mt.get("acento_porcentaje")
    if pct is None:
        return ("manual","Métrica de porcentaje de acento no encontrada")
    if low <= pct <= high:
        return ("aprobado",f"Porcentaje de acento {pct}% dentro de [{low}%,{high}%]")
    return ("suspenso",f"Porcentaje de acento {pct}% fuera de [{low}%,{high}%]")

def _p2(c,mt):
    # máximo 3 tamaños
    ma=re.search(r"máximo\s+(\d+)\s+tamaños",c)
    if not ma:
        ma=re.search(r"max\s+(\d+)\s+tamaños",c)
    if not ma:
        return ("manual","No se pudo extraer número máximo de tamaños")
    try:
        max_tam=int(ma.group(1))
    except:
        return ("manual","Número máximo de tamaños no válido")
    # métrica: número de tamaños de texto
    num_tam=mt.get("numero_tamanos")
    if num_tam is None:
        return ("manual","Métrica de número de tamaños de texto no encontrada")
    if num_tam <= max_tam:
        return ("aprobado",f"Número de tamaños {num_tam} ≤ {max_tam}")
    return ("suspenso",f"Número de tamaños {num_tam} > {max_tam}")

def _p3(c,mt):
    # titular/cuerpo ≥ 6
    ma=re.search(r"titular/cuerpo\s*(?:>=|≥)\s*(\d+)",c)
    if not ma:
        return ("manual","No se pudo extraer ratio mínimo titular/cuerpo")
    try:
        min_ratio=int(ma.group(1))
    except:
        return ("manual","Ratio mínimo titular/cuerpo no válido")
    # métrica: ratio titular/cuerpo
    ratio=mt.get("ratio_titular_cuerpo")
    if ratio is None:
        return ("manual","Métrica de ratio titular/cuerpo no encontrada")
    if ratio >= min_ratio:
        return ("aprobado",f"Ratio titular/cuerpo {ratio} ≥ {min_ratio}")
    return ("suspenso",f"Ratio titular/cuerpo {ratio} < {min_ratio}")

def _p4(c,mt):
    # texto ≥ 28 px
    ma=re.search(r"texto\s*(?:>=|≥)\s*(\d+)\s*px",c)
    if not ma:
        return ("manual","No se pudo extraer tamaño mínimo de texto en px")
    try:
        min_px=int(ma.group(1))
    except:
        return ("manual","Tamaño mínimo de texto en px no válido")
    # métrica: tamaño mínimo de texto en px
    min_tx=mt.get("tamanio_minimo_texto")
    if min_tx is None:
        return ("manual","Métrica de tamaño mínimo de texto no encontrada")
    if min_tx >= min_px:
        return ("aprobado",f"Tamaño mínimo de texto {min_tx}px ≥ {min_px}px")
    return ("suspenso",f"Tamaño mínimo de texto {min_tx}px < {min_px}px")

def _p5(c,mt):
    # cuerpo ≤ 65 caracteres
    ma=re.search(r"cuerpo\s*(?:<=|≤)\s*(\d+)\s*caracteres",c)
    if not ma:
        ma=re.search(r"longitud\s*línea\s*(?:<=|≤)\s*(\d+)\s*caracteres",c)
    if not ma:
        return ("manual","No se pudo extraer longitud máxima de línea en caracteres")
    try:
        max_car=int(ma.group(1))
    except:
        return ("manual","Longitud máxima de línea en caracteres no válida")
    # métrica: longitud máxima de línea en caracteres
    max_lin=mt.get("longitud_maxima_linea")
    if max_lin is None:
        return ("manual","Métrica de longitud máxima de línea no encontrada")
    if max_lin <= max_car:
        return ("aprobado",f"Longitud máxima de línea {max_lin} ≤ {max_car} caracteres")
    return ("suspenso",f"Longitud máxima de línea {max_lin} > {max_car} caracteres")

def _p6(c,mt):
    # jugada rara 1 vez
    ma=re.search(r"jugada\s*rara\s*(\d+)\s*vez",c)
    if not ma:
        ma=re.search(r"jugada\s*rara\s*(\d+)\s*veces",c)
    if not ma:
        return ("manual","No se pudo extraer número de veces de la jugada rara")
    try:
        expected=int(ma.group(1))
    except:
        return ("manual","Número de veces de la jugada rara no válido")
    # métrica: número de veces que aparece la jugada rara
    count=mt.get("jugada_rara_veces")
    if count is None:
        return ("manual","Métrica de número de veces de la jugada rara no encontrada")
    if count == expected:
        return ("aprobado",f"Jugada rara aparece {count} vez(es) como se esperaba")
    return ("suspenso",f"Jugada rara aparece {count} vez(es), se esperaba {expected}")

def _p7(c,mt):
    # contraste >=4.5:1
    ma=re.search(r"contraste\s*(?:>=|≥)\s*([\d.]+)",c)
    if not ma:
        return ("manual","No se pudo extraer valor mínimo de contraste")
    try:
        min_con=float(ma.group(1))
    except:
        return ("manual","Valor mínimo de contraste no válido")
    # métrica: contraste
    contraste=mt.get("contraste")
    if contraste is None:
        return ("manual","Métrica de contraste no encontrada")
    if contraste >= min_con:
        return ("aprobado",f"Contraste {contraste} ≥ {min_con}")
    return ("suspenso",f"Contraste {contraste} < {min_con}")

def _p8(c,mt):
    # dianas >=44px
    ma=re.search(r"dianas\s*(?:>=|≥)\s*(\d+)\s*px",c)
    if not ma:
        ma=re.search(r"tamaño\s*mínimo\s*diana\s*(?:>=|≥)\s*(\d+)\s*px",c)
    if not ma:
        return ("manual","No se pudo extraer tamaño mínimo de diana en px")
    try:
        min_diana=int(ma.group(1))
    except:
        return ("manual","Tamaño mínimo de diana en px no válido")
    # métrica: tamaño mínimo de diana en px
    dia=mt.get("tamanio_minimo_diana")
    if dia is None:
        return ("manual","Métrica de tamaño mínimo de diana no encontrada")
    if dia >= min_diana:
        return ("aprobado",f"Tamaño mínimo de diana {dia}px ≥ {min_diana}px")
    return ("suspenso",f"Tamaño mínimo de diana {dia}px < {min_diana}px")

if __name__=="__main__":
    if len(sys.argv)!=3:
        print("Uso: python3 adn_comprobar.py <dna.json> <metricas.json>")
        sys.exit(1)
    with open(sys.argv[1],encoding="utf-8") as f: d=json.load(f)
    with open(sys.argv[2],encoding="utf-8") as f: mt=json.load(f)
    for pid,v,mo in evaluar(d,mt): print(f"{pid}: {v} - {mo}")