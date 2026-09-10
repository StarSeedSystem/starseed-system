#!/bin/zsh
# Arranca EL orquestador (uno solo, nunca dos) con las claves cargadas del entorno.
#   bash scripts/puente/lanzar-enjambre.sh [cola.json] [trabajadores]
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
COLA="${1:-starseed_memory_root/olas/cola-310-puertas-y-pendientes.json}"
N="${2:-5}"
cd "$RAIZ" || exit 1
# Cuenta SOLO procesos cuya orden EMPIEZA por un python: el texto del prompt que se le
# pasa a un agente contiene la ruta del orquestador, y un grep suelto se cree que es uno.
VIVOS=$(ps -eo args | grep -cE '^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py')
if [ "$VIVOS" -gt 0 ]; then
  echo "Ya hay $VIVOS orquestador(es) vivo(s). Uno solo: no lances otro."; exit 0
fi
set -a
[ -f "$HOME/.hermes/.env" ] && source "$HOME/.hermes/.env"
[ -f "$HOME/.starseed/env" ] && source "$HOME/.starseed/env"
set +a
export STARSEED_MEDIO=mac STARSEED_DONDE=mac STARSEED_ROOT="$RAIZ"
exec python3 -u "$HOME/.local/bin/starseed-enjambre.py" "$COLA" --workers "$N" --reanudar
