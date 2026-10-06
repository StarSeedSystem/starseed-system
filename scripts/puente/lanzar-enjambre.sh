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
# (2026-10-06) La copia instalada se quedaba atrás: nadie corría instalar.sh y el arreglo
# del orquestador que ya estaba en main no llegaba al enjambre (la de ~/.local/bin no
# sabía nada del diseño ni de poner las ramas al día). Antes de lanzar, si el repo trae
# un orquestador versionado, más nuevo y que parsea, se instala. Si la instalada es más
# nueva (un arreglo en caliente), se respeta y se avisa.
INST="$RAIZ/scripts/enjambre/instalar.sh"
if [ -f "$INST" ] && ! bash "$INST" --comprobar >/tmp/starseed-orq-comprobar.txt 2>&1; then
  if grep -q "instalada es más nueva" /tmp/starseed-orq-comprobar.txt; then
    "$PYTHON" "$RAIZ/scripts/puente/puente.py" decir "Aviso: la copia instalada del orquestador es más nueva que la del repo (arreglo en caliente sin versionar). Tráela con scripts/enjambre/instalar.sh --traer." 2>/dev/null
  elif git -C "$RAIZ" diff --quiet HEAD -- scripts/enjambre/ \
    && "$PYTHON" -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "$RAIZ/scripts/enjambre/starseed-enjambre.py" 2>/dev/null; then
    bash "$INST" >/tmp/starseed-orq-instalar.txt 2>&1 \
      && "$PYTHON" "$RAIZ/scripts/puente/puente.py" decir "Orquestador puesto al día con main antes de lanzar (instalar.sh)." 2>/dev/null
  fi
fi
if ! "$PYTHON" -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "$ORQ" 2>/tmp/starseed-orq-sintaxis.err; then
  "$PYTHON" "$RAIZ/scripts/puente/puente.py" decir "NO LANZO el enjambre: $ORQ no parsea ($(tail -1 /tmp/starseed-orq-sintaxis.err)). Restaura el archivo desde git o reinstala con scripts/enjambre/instalar.sh." 2>/dev/null
  exit 3
fi
# El orquestador ya lee los archivos de entorno como datos. No ejecutarlos como
# shell: las rutas con espacios fallan y los valores no son instrucciones.
# (2026-09-16, 20:15) Codex VUELVE, con tope. Se agotó por la mañana porque, con las
# pasarelas gratuitas mudas, acabó escribiéndolo TODO: 6 de 6 tareas del día. La
# lección no es «apagarlo», es que NUNCA debe poder ocupar toda la tanda. Con
# capacidad 1 escribe como mucho un agente a la vez, y los otros dos van por
# Groq, Grok o la neurona local. Si algún día vuelve a agotarse, es que esta línea
# se subió: bájala antes de tocar nada más.
: "${STARSEED_CODEX_ESCRITOR:=1}"; export STARSEED_CODEX_ESCRITOR
: "${STARSEED_CAPACIDAD_CODEX:=1}"; export STARSEED_CAPACIDAD_CODEX
export STARSEED_MEDIO=mac STARSEED_DONDE=mac STARSEED_ROOT="$RAIZ"
exec "$PYTHON" -u "$HOME/.local/bin/starseed-enjambre.py" "$COLA" --workers "$N" --reanudar
