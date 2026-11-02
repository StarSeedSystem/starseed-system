# -*- coding: utf-8 -*-
"""alma_familias · las familias de 7 días: grupos de propuestas repetidas para evitar duplicar trabajo.

    python3 scripts/puente/alma_familias.py [--raiz R] [--json]

Familias: las 3 primeras palabras del título antes de ':' o '(' (normalizado).
Ej: «Publicar los 59 commits» y «Publicar los 140 commits (HEAD x)» son la misma familia.

Lee de `starseed_memory_root/imaginacion/propuestas.json` y `starseed_memory_root/olas/`:
- propuestas nuevas no aprobadas (seguimiento)
- tareas abiertas (pendiente, en_curso, reasignada)
- propuestas ya aprobadas (descartada, hecha, sustituida, informe)

Filtro: sólo las de los últimos DIAS días (7 por defecto) y con utilidad > 0.5.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import imaginacion_plantilla as P

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIAS = 7
UTILIDAD_MIN = 0.5

def familias(por_fecha=None, raiz=RAIZ, dias=DIAS, utilidad_min=UTILIDAD_MIN):
    """{familia: propuestas} de las últimas `dias` con utilidad >= `utilidad_min`."""
    mem = os.path.join(raiz, "starseed_memory_root")
    props = _cargar_propuestas(mem)
    prog = _cargar_progreso(mem)
    desde = (datetime.now() - timedelta(days=dias)).date().isoformat()
    familias_dict = {}
    for p in (props or []):
        if _es_familia_valida(p, prog, desde, utilidad_min):
            f = P.familia(p.get("titulo"))
            familias_dict.setdefault(f, []).append(p)
    return familias_dict

def _cargar_propuestas(mem):
    path = os.path.join(mem, "imaginacion", "propuestas.json")
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, list) else (d.get("propuestas") if isinstance(d, dict) else [])
    except (OSError, ValueError):
        return []

def _cargar_progreso(mem):
    path = os.path.join(mem, "olas", "progreso.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}

def _es_familia_valida(prop, prog, desde, utilidad_min):
    """True si la propuesta está activa y reciente."""
    if not isinstance(prop, dict):
        return False
    estado = str(prop.get("estado") or "")
    if estado in ("descartada", "hecha", "sustituida", "informe"):
        return False
    utilidad = float(prop.get("utilidad") or 0)
    if utilidad < utilidad_min:
        return False
    origen = prop.get("origen") or {}
    fecha = str(origen.get("fecha") or "")[:10]
    if fecha and fecha < desde:
        return False
    return True

def texto_familias(raiz=RAIZ, dias=DIAS, max_chars=4000):
    """Texto de las familias para el contexto medido (≤ 4000 caracteres)."""
    familias_dict = familias(raiz=raiz, dias=dias)
    if not familias_dict:
        return ""
    lines = ["- " + " ×".join("%s (%d)" % (k, len(v)) for k, v in sorted(familias_dict.items(), key=lambda x: -len(x[1]))[:8])]
    return "\n".join(lines)[:max_chars]

def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", default=RAIZ)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--dias", type=int, default=DIAS)
    ap.add_argument("--utilidad", type=float, default=UTILIDAD_MIN)
    a = ap.parse_args(argv)
    fams = familias(raiz=a.raiz, dias=a.dias, utilidad_min=a.utilidad)
    if a.json:
        print(json.dumps(fams, ensure_ascii=False, indent=1))
    else:
        if fams:
            print("Familias de los últimos %d días:" % a.dias)
            for f, props in sorted(fams.items(), key=lambda x: -len(x[1])):
                print("  - %s: %d propuestas" % (f, len(props)))
        else:
            print("Sin familias nuevas en los últimos %d días." % a.dias)
    return 0

if __name__ == "__main__":
    sys.exit(main())