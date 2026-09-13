#!/usr/bin/env bash
# Arranque de la nube: repo limpio al día, cola generada desde git y un solo
# orquestador; al terminar publica por push o deja parches en .transfer/.
#   bash scripts/enjambre/nube-arrancar.sh
set -u
cd "${STARSEED_ROOT:-$PWD}" || exit 1
RAIZ="$PWD"
FECHA="$(date +%Y%m%d-%H%M%S)"
MINUTOS="${NUBE_MINUTOS:-25}"
TRABAJADORES="${NUBE_TRABAJADORES:-6}"

git fetch -q origin && git reset -q --hard origin/main || exit 1
[ -d node_modules ] || npm ci --include=dev || exit 1

ORQ=""
for candidato in "$HOME/.local/bin/starseed-enjambre.py" /root/bin/starseed-enjambre.py; do
  [ -f "$candidato" ] && ORQ="$candidato" && break
done
if [ -z "$ORQ" ]; then
  bash scripts/enjambre/instalar.sh || exit 1
  for candidato in "$HOME/.local/bin/starseed-enjambre.py" /root/bin/starseed-enjambre.py; do
    [ -f "$candidato" ] && ORQ="$candidato" && break
  done
fi
[ -n "$ORQ" ] || { echo "Sin orquestador instalado."; exit 1; }

# Cuenta SOLO órdenes que EMPIECEN por un python; un grep suelto se confunde.
VIVOS=$(ps -eo args | grep -cE '^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py')
if [ "$VIVOS" -gt 0 ]; then
  echo "Ya hay $VIVOS orquestador(es) vivo(s). Uno solo."; exit 0
fi

COLA="starseed_memory_root/olas/cola-nube-auto-$FECHA.json"
mkdir -p starseed_memory_root/olas
python3 - scripts/puente/cola_nube.py scripts/puente/vigilante_logica.py \
    enjambre/colas "$COLA" <<'PYEOF'
import glob, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[1])))
from cola_nube import seleccionar
colas = []
for ruta in sorted(glob.glob(os.path.join(sys.argv[3], "*.json"))):
    with open(ruta, encoding="utf-8") as f:
        colas.append((os.path.basename(ruta), json.load(f)))
asuntos = subprocess.run(
    ["git", "log", "main", "--format=%s"], capture_output=True, text=True
).stdout.splitlines()
pendientes = seleccionar(colas, asuntos)
os.makedirs(os.path.dirname(sys.argv[4]), exist_ok=True)
with open(sys.argv[4], "w", encoding="utf-8") as f:
    json.dump(pendientes, f, ensure_ascii=False, indent=1)
print(len(pendientes))
PYEOF
NTAREAS=$(python3 -c "import json;print(len(json.load(open('$COLA'))))")
if [ "$NTAREAS" -eq 0 ]; then
  echo "nada pendiente en la nube"; exit 0
fi
echo "Cola $COLA: $NTAREAS tareas pendientes."

LOG="/tmp/ola-nube-$FECHA.log"
ANTES=$(git rev-parse HEAD)
STARSEED_MEDIO=nube setsid -f python3 -u "$ORQ" "$COLA" \
  --workers "$TRABAJADORES" --reanudar > "$LOG" 2>&1 < /dev/null

LIMITE=$((MINUTOS * 60 / 30))
i=0
while [ "$i" -lt "$LIMITE" ]; do
  sleep 30; i=$((i + 1))
  ps -eo args | grep -qE '^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py' || break
done

# Publicación: solo si el orquestador dejó commits nuevos sobre origin/main.
NUEVOS=$(git rev-list --count origin/main..main 2>/dev/null || echo 0)
MODO="sin publicación"
if [ "$NUEVOS" -gt 0 ]; then
  if npx tsc --noEmit && npx vitest run; then
    LIBRE=$(df -k . | awk 'NR==2 {print $4}')
    if [ "$LIBRE" -ge 1048576 ] && \
       NODE_OPTIONS=--max-old-space-size=3072 npx next build; then
      DRY=$(git push --dry-run origin main 2>&1)
      MODO=$(python3 -c "
import sys; sys.path.insert(0, 'scripts/puente')
from cola_nube import modo_publicacion
print(modo_publicacion('''$DRY'''))
" 2>/dev/null || echo parche)
      if [ "$MODO" = "push" ]; then
        git push origin main || MODO="parche"
      fi
      if [ "$MODO" = "parche" ]; then
        mkdir -p .transfer
        git format-patch origin/main..main -o .transfer/
        echo "Parches en .transfer/:"; ls .transfer/*.patch 2>/dev/null
      fi
    else
      echo "next build falló o falta espacio: no se publica."; MODO="fallo build"
    fi
  else
    echo "tsc o tests en rojo: no se publica."; MODO="fallo puertas"
  fi
fi

INTEGRADAS=$(git log --format=%s "$ANTES"..HEAD 2>/dev/null | grep -cE '^Ola ' || true)
echo "── Resumen nube $FECHA ──"
echo "Tareas lanzadas: $NTAREAS (cola $COLA)"
echo "Commits nuevos sobre origin/main: $NUEVOS"
echo "Log del orquestador: $LOG"
echo "Modo de publicación: $MODO"
echo "Punta: $(git rev-parse --short HEAD)"
