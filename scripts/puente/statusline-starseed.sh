#!/bin/bash
# Línea de estado de StarSeed para Claude Code.
# Imprime: modelo · ctx N% · $coste · carpeta (solo los campos que existan).
# Además, si el JSON de stdin trae rate_limits, escribe de forma atómica
# claude-statusline.json con solo los números (contrato §4.2).
# Un fallo al escribir nunca rompe la línea ni imprime errores.

exec 2>/dev/null

/usr/bin/python3 -c '
import json, os, sys, tempfile
from datetime import datetime

try:
    datos = json.load(sys.stdin)
except Exception:
    print("starseed")
    sys.exit(0)

partes = []

modelo = datos.get("model") or {}
nombre = modelo.get("display_name") or modelo.get("id")
if nombre:
    partes.append(str(nombre))

ctx = datos.get("context_window") or {}
usado = ctx.get("used_percentage")
if isinstance(usado, (int, float)):
    partes.append(f"ctx {usado:.0f}%")

coste = datos.get("cost") or {}
usd = coste.get("total_cost_usd")
if isinstance(usd, (int, float)):
    partes.append(f"${usd:.2f}")

espacio = datos.get("workspace") or {}
carpeta = espacio.get("current_dir")
if carpeta:
    partes.append(os.path.basename(carpeta))

print(" · ".join(partes) if partes else "starseed")

limites = datos.get("rate_limits")
if not isinstance(limites, dict):
    sys.exit(0)

try:
    def ventana(v):
        if not isinstance(v, dict):
            return None
        salida = {}
        pct = v.get("used_percentage")
        if isinstance(pct, (int, float)):
            salida["usado_pct"] = pct
        reinicia = v.get("resets_at")
        if isinstance(reinicia, (int, float)):
            salida["reinicia"] = datetime.fromtimestamp(reinicia).astimezone().isoformat()
        return salida or None

    cinco = ventana(limites.get("five_hour"))
    siete = ventana(limites.get("seven_day"))
    if not cinco and not siete:
        sys.exit(0)

    cuerpo = {"t": datetime.now().astimezone().isoformat()}
    if cinco:
        cuerpo["five_hour"] = cinco
    if siete:
        cuerpo["seven_day"] = siete

    base = os.environ.get("STARSEED_HOME") or os.path.expanduser("~")
    destino = os.path.join(base, ".starseed", "medidores-entrada", "claude-statusline.json")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(destino), suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(cuerpo, f)
    os.replace(tmp, destino)
except Exception:
    sys.exit(0)
' 2>/dev/null || printf 'starseed\n'

exit 0
