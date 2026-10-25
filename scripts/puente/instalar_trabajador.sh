#!/usr/bin/env bash
# Instalador del trabajador de la colmena (COL1012K): este aparato (macOS, Linux, WSL2 o, en experimental, Termux)
# pasa a ser contenedor de agentes del enjambre. Contrato: architecture/colmena-relevo-contenedores.md §2 y §4.
# Bash 3.2 (el de macOS): sin arrays asociativos, ${x,,} ni heredocs dentro de $( ). No instala herramientas, no usa
# sudo ni pide contraseñas (dice el comando exacto) y nunca imprime la llave: solo su huella. Todo va en main(), que
# se llama en la última línea: con «curl | bash» se lee entero antes de ejecutar nada (una descarga cortada no corre).
set -uo pipefail
main() {
DESTINO="$HOME/starseed-trabajador"
REPO="${STARSEED_REPO_URL:-https://github.com/StarSeedSystem/starseed-system.git}"
unset STARSEED_NODO_DIR STARSEED_NODO_LLAVE; NODO_DIR="$HOME/.starseed/nodo-metagenesis"  # las del servicio, que no las hereda
OPENCODE_VERSION="1.18.33"  # la misma que el A1 (deploy/oracle/nodo/preparar-a1.sh): los mismos agentes en todos
SECO=0; CODIGO=""; FALTA=0; export GIT_TERMINAL_PROMPT=0  # git tampoco puede pedir una contraseña
ayuda() { printf '%s\n' "Uso: instalar_trabajador.sh [--seco] [--emparejar <código>] [--ayuda]" "  --seco       dice lo que haría y cuántos agentes aportaría este aparato, sin tocar nada" \
  "  --emparejar  código del botón «Usar como contenedor» (caduca a los 15 min; servidor: STARSEED_EMPAREJAR_URL)" \
  "Comprueba git, Node ≥ 20.19, npm, python3 ≥ 3.9 y opencode, clona el repo en ~/starseed-trabajador, instala sus dependencias, crea la llave del nodo e instala el nodo de MetaGenesis en modo contenedor."; }
while [ $# -gt 0 ]; do case "$1" in
  --seco) SECO=1 ;; --ayuda|-h|--help) ayuda; exit 0 ;;
  --emparejar) [ $# -ge 2 ] || { echo "Falta el código tras --emparejar." >&2; exit 2; }; CODIGO="$2"; shift ;;
  *) echo "Opción desconocida: $1 (usa --ayuda)." >&2; exit 2 ;; esac; shift; done
# El código viaja dentro de un JSON: solo letras, números y guiones, para que no pueda inyectar nada.
re_codigo='^[A-Za-z0-9-]{4,40}$'
if [ -n "$CODIGO" ] && ! [[ $CODIGO =~ $re_codigo ]]; then echo "Código de emparejado no válido." >&2; exit 2; fi
# Como root (o con sudo) el repo y la llave quedarían de root en tu carpeta, y el trabajador no lo necesita.
[ "$(id -u 2>/dev/null)" = 0 ] && { echo "No me ejecutes como root ni con sudo: el trabajador corre con tu usuario." >&2; exit 1; }
hacer() { local que="$1"; shift; if [ "$SECO" = 1 ]; then echo "  [seco] haría: $que"; else "$@"; fi; }  # en seco, revisable antes
en_destino() { (cd "$DESTINO" && STARSEED_ROOT="$DESTINO" "$@"); }
SO=otro; GESTOR=""; case "$(uname -s 2>/dev/null)" in Darwin) SO=macos; GESTOR=brew ;; Linux) SO=linux ;; esac
if [ "$SO" = linux ] && { [ -n "${TERMUX_VERSION:-}" ] || [[ "${PREFIX:-}" == *com.termux* ]]; }; then SO=android; GESTOR=pkg
elif [ "$SO" = linux ] && read -r v 2>/dev/null </proc/version && [[ $v == *[Mm]icrosoft* ]]; then SO=wsl2; fi
[ "$SO" = otro ] && { echo "Este instalador es para macOS, Linux, WSL2 o Termux (en Windows, dentro de WSL2)." >&2; exit 1; }
if [ -z "$GESTOR" ]; then command -v apt-get >/dev/null 2>&1 && GESTOR=apt || { command -v dnf >/dev/null 2>&1 && GESTOR=dnf; }; fi
como_instalar() {  # el comando EXACTO para este sistema; no se ejecuta: lo decide la persona
  local s="" p; case "$GESTOR:$1" in
    *:opencode) p=$(npm prefix -g 2>/dev/null)  # el npm global del sistema (/usr con NodeSource) es de root
      case "$GESTOR" in apt|dnf) [ -n "$p" ] && [ -w "$p" ] || s="sudo " ;; esac; echo "${s}npm install -g opencode-ai@$OPENCODE_VERSION" ;;
    brew:git) echo "xcode-select --install" ;; brew:python3) echo "brew install python" ;; brew:node|brew:npm) echo "brew install node" ;;
    apt:node) echo "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs" ;;
    dnf:node) echo "curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf install -y nodejs" ;;
    apt:*) echo "sudo apt-get install -y $1" ;; dnf:*) echo "sudo dnf install -y $1" ;;
    pkg:node|pkg:npm) echo "pkg install nodejs-lts" ;; pkg:python3) echo "pkg install python" ;; pkg:*) echo "pkg install $1" ;;
    *) echo "instala $1 con el gestor de paquetes de tu sistema" ;;
  esac; }
# ¿$1 ≥ $2? Mayor.menor basta (Node 20.19, Python 3.9) y no depende de `sort -V`, que macOS no trae.
version_ge() { local a1 a2 b1 b2 r; IFS=. read -r a1 a2 r <<< "${1#v}"; IFS=. read -r b1 b2 r <<< "$2"
  a1=${a1//[!0-9]/}; a2=${a2//[!0-9]/}; [ "${a1:-0}" -gt "$b1" ] || { [ "${a1:-0}" -eq "$b1" ] && [ "${a2:-0}" -ge "$b2" ]; }; }
comprobar() {  # herramienta, versión mínima (vacía = cualquiera) y una orden que debe funcionar (el git de un macOS sin Xcode no)
  local h="$1" min="$2" v=""; shift 2
  command -v "$h" >/dev/null 2>&1 || { echo "  ✗ falta $h → $(como_instalar "$h")"; FALTA=1; return 1; }
  [ $# -eq 0 ] || v=$("$@" 2>/dev/null) || { echo "  ✗ $h no funciona → $(como_instalar "$h")"; FALTA=1; return 1; }
  [ -z "$min" ] || version_ge "$v" "$min" || { echo "  ✗ $h ${v:-?}: hace falta ≥ $min → $(como_instalar "$h")"; FALTA=1; return 1; }
  echo "  ✓ $h${min:+ $v}"; }
echo "Herramientas ($SO):"
comprobar git "" git --version; comprobar node 20.19 node -v && comprobar npm ""; comprobar opencode ""
comprobar python3 3.9 python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])'
if [ "$FALTA" = 1 ]; then
  [ "$GESTOR" = brew ] && ! command -v brew >/dev/null 2>&1 && echo "  Antes, Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  echo "Instala lo que falta con esos comandos y vuelve a ejecutarme: no instalo nada por mi cuenta."; exit 1; fi
# Sin systemd --user el nodo no quedaría en marcha: se dice ANTES de clonar (solo lee, también en seco).
if [[ $SO == linux || $SO == wsl2 ]] && ! systemctl --user show-environment >/dev/null 2>&1; then
  echo "systemd --user no responde: no puedo dejar el nodo en marcha en este aparato." >&2
  [ "$SO" = wsl2 ] && echo "En WSL2: pon «[boot]» y «systemd=true» en /etc/wsl.conf, ejecuta «wsl --shutdown» en Windows y vuelve a abrirlo." >&2; exit 1; fi
# Un aparato que ya es nodo (la Mac, el A1) se suma con «Usar como contenedor»: aquí se movería su servicio a otra copia.
<<<<<<< HEAD
for u in "$HOME/Library/LaunchAgents/com.starseed.nodo-metagenesis.plist" "$HOME/.config/systemd/user/starseed-nodo-metagenesis.service" "${STARSEED_UNIDAD_SISTEMA:-/etc/systemd/system/starseed-metagenesis.service}"; do
=======
SYSTEMD_SYSTEM="${STARSEED_SYSTEMD_SYSTEM_PATH:-/etc/systemd/system/starseed-metagenesis.service}"
for u in "$HOME/Library/LaunchAgents/com.starseed.nodo-metagenesis.plist" "$HOME/.config/systemd/user/starseed-nodo-metagenesis.service" "$SYSTEMD_SYSTEM"; do
>>>>>>> 2c8d60f1f (salvavidas · GCA1019O: trabajo del agente antes de las puertas (tsc / vitest))
  [ -f "$u" ] && [[ $(< "$u") != *"$DESTINO/"* ]] && { echo "Este aparato ya es un nodo de MetaGenesis ($u) con otra copia del repo: no lo toco. Usa el botón «Usar como contenedor»." >&2; exit 1; }; done
if [ ! -e "$DESTINO" ]; then hacer "git clone $REPO $DESTINO" git clone "$REPO" "$DESTINO" || { echo "No pude clonar el repositorio." >&2; exit 1; }
elif [ "$SECO" = 1 ]; then echo "Ya hay una copia en $DESTINO: preguntaría si usarla y ponerla al día (git pull --ff-only)."
else  # con `curl | bash` la entrada es el propio guion: se pregunta a la terminal y, sin terminal, es «no»
  printf "Ya hay una copia en %s. ¿La uso y la pongo al día con git pull --ff-only? [s/N] " "$DESTINO"; r=""; read -r r 2>/dev/null </dev/tty || r=""
  case "$r" in s|S|si|sí|SI|Sí) git -C "$DESTINO" pull --ff-only || { echo "No pude ponerla al día: revísala a mano." >&2; exit 1; } ;;
    *) echo; echo "No toco nada: mueve o borra $DESTINO y vuelve a ejecutarme."; exit 0 ;; esac
fi
# Decide colmena_logica (no se copia aquí) con la medida de gobernador_generico (COL1012L) si ya está en el repo.
PUENTE="$DESTINO/scripts/puente"  # en seco y sin copia vale la carpeta de este guion (con «curl | bash» no hay)
[ ! -f "$PUENTE/colmena_logica.py" ] && [ -f "$0" ] && { PUENTE="${0%/*}"; [ "$PUENTE" = "$0" ] && PUENTE=.; }
[ -f "$PUENTE/colmena_logica.py" ] || { echo "Sin copia del repo no puedo medir la capacidad: ejecútame desde una copia o sin --seco." >&2; exit 1; }
IFS= read -r -d '' PY_CAP <<'PY'
import sys; sys.path[:] = [p for p in sys.path if p not in ("", ".")] + [sys.argv[1]]  # sin la carpeta actual (ahí un
import os, shutil, colmena_logica as C  # shutil.py cualquiera ganaría) y detrás de PYTHONPATH (lo usan las pruebas)
try:
    import gobernador_generico as G; cap, origen = G.medir(), "gobernador_generico"
except ImportError:  # sin COL1012L se mide lo básico; la batería y la red no se inventan
    cap = {"so": "linux" if sys.argv[2] == "wsl2" else sys.argv[2], "nucleos": os.cpu_count() or 1,
           "ram_total_mb": os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // 2**20, "herramientas": {h: bool(
           shutil.which(h)) for h in C.HERRAMIENTAS}, "disco_libre_gb": shutil.disk_usage(os.path.expanduser("~")).free / 2**30}
    origen = "medida básica: falta gobernador_generico (COL1012L), sin batería ni red"
r = C.capacidad_contenedor(cap); print("%d|%d|%s|%s" % (r["agentes"], int(r["apto"]), r["motivo"], origen))
PY
CAP=$(python3 -c "$PY_CAP" "$PUENTE" "$SO") && [ -n "$CAP" ] || { echo "No pude medir la capacidad de este aparato." >&2; exit 1; }
IFS='|' read -r AGENTES APTO MOTIVO ORIGEN <<< "$CAP"
echo "Capacidad ($ORIGEN): $AGENTES agente(s). $MOTIVO"
[ "$APTO" = 1 ] || { echo "Este aparato no puede ser contenedor ahora: no instalo el nodo." >&2; exit 1; }
hacer "npm ci --include=dev en $DESTINO" en_destino npm ci --include=dev || { echo "npm ci falló (mira arriba)." >&2; exit 1; }
# El nodo solo imprime su id y la huella de su llave: el secreto se queda en su archivo 0600.
NODO="(nodo)"; HUELLA=""; re_llave='Nodo ([A-Za-z0-9._-]+) .*huella de su llave: ([0-9a-f]+)'
if [ "$SECO" = 1 ]; then echo "  [seco] haría: python3 scripts/puente/nodo_metagenesis.py llave (solo enseña la huella)"
elif SAL=$(en_destino python3 scripts/puente/nodo_metagenesis.py llave) && echo "$SAL" && [[ $SAL =~ $re_llave ]]; then NODO="${BASH_REMATCH[1]}"; HUELLA="${BASH_REMATCH[2]}"
else echo "No pude crear la llave del nodo o leer su huella." >&2; exit 1; fi
# Modo contenedor = el contenedor.json de la orden `contenedor` del nodo, que un aparato nuevo no puede recibir aún
# (no tiene el secreto común, §5): se deja aquí, en su carpeta, antes de arrancar el servicio.
TRAB=$(( AGENTES < 1 ? 1 : AGENTES ))  # 0 = «en espera» por la batería: se apunta 1 de tope, no 0 para siempre
hacer "modo contenedor con $TRAB agente(s) en $NODO_DIR/contenedor.json" python3 -I -c 'import json, os, pathlib, sys, time
os.makedirs(sys.argv[1], mode=0o700, exist_ok=True); pathlib.Path(sys.argv[1], "contenedor.json").write_text(json.dumps({"activo": True, "trabajadores": int(sys.argv[2]), "t": time.time()}))' "$NODO_DIR" "$TRAB"
if [ "$SO" = android ]; then echo "Termux no tiene launchd ni systemd: arranca el nodo con «cd $DESTINO && python3 scripts/puente/nodo_metagenesis.py servir»."
else hacer "nodo_metagenesis.py instalar (launchd en macOS, systemd --user en Linux/WSL2)" \
  en_destino python3 scripts/puente/nodo_metagenesis.py instalar || { echo "No pude instalar el nodo." >&2; exit 1; }; fi
# systemd --user para el nodo al cerrar la última sesión (un servidor por SSH): se avisa, no se cambia.
[[ $SO == linux || $SO == wsl2 ]] && [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != yes ] && echo "Aviso: el nodo se para al cerrar tu última sesión; para que siga, ejecuta «loginctl enable-linger $(id -un)»."
if [ -z "$CODIGO" ]; then echo "Último paso: vuelve a ejecutarme con --emparejar <código> (botón «Usar como contenedor»)."
elif [ "$SECO" = 1 ]; then echo "  [seco] haría: enviar el código, el id del nodo y la huella (nunca la llave) a STARSEED_EMPAREJAR_URL"
elif [[ ${STARSEED_EMPAREJAR_URL:-} != https://* ]]; then echo "pendiente: falta STARSEED_EMPAREJAR_URL (https://…, el servidor que emitió el código)."
else  # el cuerpo va por la entrada de curl, no por su línea de órdenes (que cualquiera ve con `ps`)
  ESTADO=$(curl -sS -m 20 --proto '=https' -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' --data @- \
    "$STARSEED_EMPAREJAR_URL" 2>/dev/null <<< "{\"codigo\":\"$CODIGO\",\"nodo\":\"$NODO\",\"huella\":\"$HUELLA\"}")
  case "$ESTADO" in 2??) echo "Emparejado: este aparato ya trabaja para tu cuenta como contenedor." ;;
    503) echo "pendiente: falta la migración de nodos (§8)" ;;  # sin las tablas de nodos no hay llaves por aparato
    *) echo "No se pudo emparejar (HTTP ${ESTADO:-sin respuesta}); el código caduca a los 15 min: pide otro." >&2; exit 1 ;; esac
fi
}
main ${1+"$@"}  # la forma portable de pasar los argumentos con `set -u` aunque no haya ninguno (bash viejos)
