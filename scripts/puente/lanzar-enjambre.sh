#!/bin/zsh
# Arranca EL orquestador (uno solo, nunca dos) con las claves cargadas del entorno.
#   bash scripts/puente/lanzar-enjambre.sh [cola.json] [trabajadores]
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
COLA="${1:-starseed_memory_root/olas/cola-310-puertas-y-pendientes.json}"   # el vigilante le pasa la suya
N="${2:-2}"
PYTHON="${STARSEED_PYTHON:-/opt/homebrew/bin/python3}"
[ -x "$PYTHON" ] || PYTHON="$(command -v python3)"
cd "$RAIZ" || exit 1
# Cuenta SOLO procesos cuya orden EMPIEZA por un python: el texto del prompt que se le
# pasa a un agente contiene la ruta del orquestador, y un grep suelto se cree que es uno.
VIVOS=$(ps -eo args | grep -cE '^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py')
if [ "$VIVOS" -gt 0 ]; then
  echo "Ya hay $VIVOS orquestador(es) vivo(s). Uno solo: no lances otro."; exit 0
fi
# Puerta de sintaxis (2026-09-12): un motor de escritura dejó su respuesta de chat dentro
# de starseed-enjambre.py y llegó a main sin que nadie lo viese. Un .py que no parsea no
# se lanza, y se dice en el canal — que un SyntaxError en un log de /tmp no lo lee nadie.
ORQ="$HOME/.local/bin/starseed-enjambre.py"
if ! "$PYTHON" -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "$ORQ" 2>/tmp/starseed-orq-sintaxis.err; then
  "$PYTHON" "$RAIZ/scripts/puente/puente.py" decir "NO LANZO el enjambre: $ORQ no parsea ($(tail -1 /tmp/starseed-orq-sintaxis.err)). Restaura el archivo desde git o reinstala con scripts/enjambre/instalar.sh." 2>/dev/null
  exit 3
fi
# El orquestador ya lee los archivos de entorno como datos. No ejecutarlos como
# shell: las rutas con espacios fallan y los valores no son instrucciones.
export STARSEED_MEDIO=mac STARSEED_DONDE=mac STARSEED_ROOT="$RAIZ"
exec "$PYTHON" -u "$HOME/.local/bin/starseed-enjambre.py" "$COLA" --workers "$N" --reanudar
