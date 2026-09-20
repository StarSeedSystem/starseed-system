#!/bin/zsh
# guardar-clave.sh · guarda UNA clave en ~/.hermes/.env sin que pase por ningún sitio.
#
#   bash scripts/puente/guardar-clave.sh XAI_API_KEY
#   (pega el valor cuando lo pida y pulsa Enter; no se ve al teclearlo)
#
# Por qué existe (2026-09-16). Claude no teclea claves de terceros, ni siquiera cuando se
# lo piden: una clave pegada en un chat queda escrita en el historial y hay que rotarla.
# Pero pedirle a Alex que edite un archivo a mano tiene sus propias trampas, y una nos
# costó un día entero: `AGENT_BROWSER_EXECUTABLE_PATH` con un valor con espacios y SIN
# comillas rompía el `source` y dejaba sin cargar las 24 variables siguientes — todas las
# claves de pasarela. Este guion entrecomilla siempre, reemplaza en vez de duplicar, y
# comprueba que el archivo sigue cargándose entero después de tocarlo.
#
# El valor no se imprime, no se pasa por la línea de órdenes (no entra en el historial del
# shell) y no sale de esta máquina.
set -u

ENV_FILE="$HOME/.hermes/.env"
NOMBRE="${1:-}"

if [ -z "$NOMBRE" ]; then
  echo "Uso: bash scripts/puente/guardar-clave.sh NOMBRE_DE_LA_VARIABLE [--ambos]" >&2
  echo "Ejemplo: bash scripts/puente/guardar-clave.sh XAI_API_KEY" >&2
  echo "  --ambos: también en ~/.starseed/env (el enjambre, el renovador y Jev leen ahí)." >&2
  echo "  Sin --ambos, ~/.starseed/env solo se toca si ya tenía esa variable." >&2
  exit 2
fi
# (2026-09-20) Una clave suele vivir en DOS medios: ~/.hermes/.env (Hermes, FreeLLMAPI) y
# ~/.starseed/env (enjambre, renovador, Jev). Cambiarla en uno y no en el otro dejaba dos
# claves distintas con el mismo nombre — justo lo que pasó con apinex el 19/09 (401 en Hermes).
ARCHIVOS=("$ENV_FILE")
SEGUNDO="$HOME/.starseed/env"
if [ -f "$SEGUNDO" ] && { [ "${2:-}" = "--ambos" ] || grep -q -E "^(export )?$NOMBRE=" "$SEGUNDO"; }; then
  ARCHIVOS+=("$SEGUNDO")
fi
case "$NOMBRE" in
  [A-Z_]*[A-Z0-9_]) : ;;
  *) echo "Nombre raro: usa MAYÚSCULAS_CON_GUIONES_BAJOS" >&2; exit 2 ;;
esac

printf 'Pega el valor de %s (no se verá) y pulsa Enter: ' "$NOMBRE"
read -s VALOR
echo
if [ -z "$VALOR" ]; then echo "No pegaste nada. No toco el archivo." >&2; exit 2; fi

mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"
cp -p "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"

# Reemplaza la línea si ya existe; si no, la añade al final. Siempre entre comillas.
# El valor viaja por el entorno del proceso, NO por la línea de órdenes: así no queda en
# el historial del shell ni se ve en `ps`.
for ARCHIVO in "${ARCHIVOS[@]}"; do
  cp "$ARCHIVO" "$ARCHIVO.bak-$(date +%Y%m%d-%H%M%S)" && chmod 600 "$ARCHIVO".bak-* 2>/dev/null
  __VALOR__="$VALOR" python3 - "$ARCHIVO" "$NOMBRE" <<'PY'
import io, os, sys
ruta, nombre = sys.argv[1], sys.argv[2]
valor = os.environ["__VALOR__"]
lineas = io.open(ruta, encoding="utf-8", errors="replace").read().split("\n")
nueva = '%s="%s"' % (nombre, valor.replace('\\', '\\\\').replace('"', '\\"'))
puesto = False
for i, l in enumerate(lineas):
    izq = l.strip()
    if izq.startswith(nombre + "=") or izq.startswith("export " + nombre + "="):
        lineas[i] = nueva
        puesto = True
        break
if not puesto:
    if lineas and lineas[-1].strip() != "":
        lineas.append("")
    lineas[-1:] = [nueva, ""]
io.open(ruta, "w", encoding="utf-8").write("\n".join(lineas))
print("  %s en %s: %s" % (nombre, ruta.replace(os.path.expanduser("~"), "~"), "reemplazada" if puesto else "añadida"))
PY
  chmod 600 "$ARCHIVO"
  # Comprobación que de verdad importa: ¿sigue cargándose el archivo ENTERO?
  ERRORES=$( { set -a; source "$ARCHIVO"; set +a; } 2>&1 | head -3 )
  if [ -n "$ERRORES" ]; then
    echo "AVISO: $ARCHIVO da errores al cargarse — alguna línea está mal escrita:" >&2
    echo "$ERRORES" >&2
    echo "(hay copia de seguridad al lado, con su fecha)" >&2
    unset VALOR
    exit 1
  fi
done
unset VALOR
echo "Guardada. Los archivos se cargan enteros, sin errores."
echo "Huella (para distinguirla, nunca el valor): $(grep -E "^(export )?$NOMBRE=" "$ENV_FILE" | head -1 | sed -E 's/^(export )?[A-Z0-9_]+=//; s/^"//; s/"$//' | shasum -a 256 | cut -c1-8)"
echo "Comprueba si la pasarela responde con:"
echo "  python3 scripts/puente/renovador-pasarelas.py"
