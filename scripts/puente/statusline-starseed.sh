#!/bin/zsh
# statusline-starseed.sh · línea de estado de Claude Code para StarSeed
# Imprime "modelo · ctx N% · $coste · carpeta" con los campos que existan y,
# si el JSON de stdin trae rate_limits, escribe atómicamente
# $STARSEED_HOME|HOME/.starseed/medidores-entrada/claude-statusline.json
# con solo los números. Un fallo al escribir nunca rompe la línea.

STARSEED_ENTRADA=$(cat 2>/dev/null) python3 - <<'EOF' 2>/dev/null
import sys, json, os, re
from datetime import datetime, timezone

def iso_ahora():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def main():
    crudo = os.environ.get("STARSEED_ENTRADA", "")
    try:
        d = json.loads(crudo)
    except Exception:
        print("starseed")
        return
    partes = []
    mod = d.get("model") or {}
    m = mod.get("display_name") or mod.get("id")
    if m:
        partes.append(str(m))
    ctx = (d.get("context_window") or {}).get("used_percentage")
    if isinstance(ctx, (int, float)):
        partes.append("ctx %d%%" % round(ctx))
    coste = (d.get("cost") or {}).get("total_cost_usd")
    if isinstance(coste, (int, float)):
        partes.append("$%.2f" % coste)
    carp = (d.get("workspace") or {}).get("current_dir")
    if carp:
        partes.append(os.path.basename(str(carp)) or str(carp))
    print(" · ".join(partes) if partes else "starseed")

    rl = d.get("rate_limits")
    if not isinstance(rl, dict):
        return
    salida = {"t": iso_ahora()}
    for clave, dst in (("five_hour", "five_hour"), ("seven_day", "seven_day")):
        v = rl.get(clave)
        if not isinstance(v, dict):
            continue
        pct = v.get("used_percentage")
        resets = v.get("resets_at")
        if not isinstance(pct, (int, float)):
            continue
        entrada = {"usado_pct": pct}
        if isinstance(resets, (int, float)):
            entrada["reinicia"] = datetime.fromtimestamp(
                resets, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        salida[dst] = entrada
    if len(salida) == 1:
        return
    try:
        hogar = os.environ.get("STARSEED_HOME", os.environ.get("HOME", ""))
        carpeta = os.path.join(hogar, ".starseed", "medidores-entrada")
        os.makedirs(carpeta, exist_ok=True)
        destino = os.path.join(carpeta, "claude-statusline.json")
        tmp = destino + ".tmp"
        with open(tmp, "w") as f:
            json.dump(salida, f)
        os.replace(tmp, destino)
    except Exception:
        pass

try:
    main()
except Exception:
    try:
        print("starseed")
    except Exception:
        pass
EOF
