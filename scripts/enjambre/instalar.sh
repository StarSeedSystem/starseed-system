#!/usr/bin/env bash
# instalar.sh · instala/comprueba/sincroniza el orquestador del enjambre versionado (Ola 259, 2026-09-06)
#
# El orquestador, sus decisiones puras (`medios.py`) y el lanzador viven aquí, en el repo,
# y deben ser idénticos byte a byte a las copias instaladas. El módulo se copia junto al
# orquestador tanto en la Mac como en la nube para que la importación sea autosuficiente.
#
# Uso:
#   ./instalar.sh             → instala (copia repo → máquina, cp -p + chmod +x, sin sudo)
#   ./instalar.sh --comprobar → solo compara md5 repo vs instalado; sale 1 si difieren
#                               e indica cuál copia es más nueva (por mtime)
#   ./instalar.sh --traer     → sentido inverso: copia lo instalado al repo (cambios en caliente)
#
# Por qué copia y no enlace simbólico: el orquestador se lanza con `setsid -f python3 -u <ruta>`
# desde rutas fijas y a veces con el repo en otro estado (worktrees, ramas); la copia instalada
# debe ser estable e independiente del checkout.
set -euo pipefail

# Carpeta donde vive este script (= scripts/enjambre/), de ahí salen las fuentes.
ORIGEN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OS="$(uname -s)"
case "$OS" in
  Darwin)
    # Mac: solo el orquestador (el lanzador de órdenes firmadas es cosa del contenedor).
    DEST_ENJAMBRE="$HOME/.local/bin/starseed-enjambre.py"
    DEST_LANZADOR=""
    ;;
  Linux)
    DEST_ENJAMBRE="$HOME/bin/starseed-enjambre.py"
    DEST_LANZADOR="$HOME/starseed-vigia/lanzador.py"
    ;;
  *)
    echo "Sistema no soportado: $OS (solo Darwin y Linux)" >&2
    exit 2
    ;;
esac
DEST_DIR="$(dirname "$DEST_ENJAMBRE")"
# (2026-09-14) El orquestador importa `limite_proveedor` al cargarse: si la copia instalada
# no lo lleva al lado, NO ARRANCA. Va aquí y no en un requirements para que la instalación
# siga siendo autosuficiente, que es toda la razón de ser de este script.
#
# (2026-09-21) Y esa lista estaba escrita A MANO, así que cada módulo nuevo la dejaba
# incompleta sin avisar. p316Gb añadió `puerta_degenerados.py` el día 21 a las 00:05 y
# desde ese minuto TODOS los runs de la nube morían en 0,2 s con
# «ModuleNotFoundError: No module named 'puerta_degenerados'» — y terminaban EN VERDE,
# porque la orden acababa en `|| true`. Seis horas de nube regalada. Ahora la lista se
# DEDUCE del directorio: todo .py que no sea prueba viaja al lado del orquestador. Un
# módulo nuevo se instala solo, que es la única forma de que esto no vuelva a pasar.
MODULOS=()
for _m in "$ORIGEN_DIR"/*.py; do
  _b="$(basename "$_m")"
  case "$_b" in
    starseed-enjambre.py|test_*.py|conftest.py) continue ;;
  esac
  MODULOS+=("$_b")
done

# md5 portable: macOS trae `md5 -q`, Linux `md5sum`.
if command -v md5 >/dev/null 2>&1; then
  md5_de() { md5 -q "$1"; }
elif command -v md5sum >/dev/null 2>&1; then
  md5_de() { md5sum "$1" | awk '{print $1}'; }
else
  echo "No hay ni md5 ni md5sum en esta máquina" >&2
  exit 2
fi

# mtime portable (segundos epoch): macOS `stat -f %m`, Linux `stat -c %Y`.
mtime_de() {
  if [ "$OS" = "Darwin" ]; then stat -f %m "$1"; else stat -c %Y "$1"; fi
}

# copia_de <origen> <destino>: crea el directorio, copia preservando mtimes y da +x.
copia_de() {
  mkdir -p "$(dirname "$2")"
  cp -p "$1" "$2"
  chmod +x "$2"
  echo "  $2  [md5 $(md5_de "$2")]"
}

# compara_par <nombre> <repo> <instalado>: usada por --comprobar; devuelve 1 si difieren.
compara_par() {
  local nombre="$1" repo="$2" inst="$3"
  if [ ! -f "$inst" ]; then
    echo "✗ $nombre: NO está instalado en $inst"
    return 1
  fi
  local m_repo m_inst
  m_repo="$(md5_de "$repo")"
  m_inst="$(md5_de "$inst")"
  if [ "$m_repo" = "$m_inst" ]; then
    echo "✓ $nombre: coinciden (md5 $m_repo)"
    return 0
  fi
  if [ "$(mtime_de "$repo")" -gt "$(mtime_de "$inst")" ]; then
    echo "✗ $nombre: DIFIEREN — la copia del repo es más nueva (instala con: $0)"
  else
    echo "✗ $nombre: DIFIEREN — la copia instalada es más nueva (tráela con: $0 --traer)"
  fi
  echo "    repo:      $m_repo  $repo"
  echo "    instalado: $m_inst  $inst"
  return 1
}

SRC_ENJAMBRE="$ORIGEN_DIR/starseed-enjambre.py"
SRC_LANZADOR="$ORIGEN_DIR/lanzador.py"

case "${1:-}" in
  --comprobar)
    echo "Comparando md5 (repo vs instalado)…"
    ok=0
    compara_par "orquestador" "$SRC_ENJAMBRE" "$DEST_ENJAMBRE" || ok=1
    for _b in "${MODULOS[@]}"; do
      compara_par "$_b" "$ORIGEN_DIR/$_b" "$DEST_DIR/$_b" || ok=1
    done
    if [ -n "$DEST_LANZADOR" ]; then
      compara_par "lanzador" "$SRC_LANZADOR" "$DEST_LANZADOR" || ok=1
    fi
    exit $ok
    ;;
  --traer)
    echo "Trayendo las copias instaladas al repo…"
    copia_de "$DEST_ENJAMBRE" "$SRC_ENJAMBRE"
    for _b in "${MODULOS[@]}"; do
      if [ -f "$DEST_DIR/$_b" ]; then
        copia_de "$DEST_DIR/$_b" "$ORIGEN_DIR/$_b"
      else
        echo "  $_b aún no está instalado; conservo la fuente del repo"
      fi
    done
    if [ -n "$DEST_LANZADOR" ]; then
      copia_de "$DEST_LANZADOR" "$SRC_LANZADOR"
    fi
    echo "Hecho: revisa `git diff scripts/enjambre/` antes de versionar."
    ;;
  "")
    # Uso ${OS} con llaves: el carácter «…» (puntos suspensivos Unicode) que le sigue lo toma
    # bash 3.2 de macOS (con `set -u`) como parte del nombre de la variable, provocando
    # «OS…: unbound variable». En Linux (bash 5) no fallaba, pero es portátil escribir con llaves.
    echo "Instalando en ${OS}…"
    echo "  origen orquestador [md5 $(md5_de "$SRC_ENJAMBRE")]"
    copia_de "$SRC_ENJAMBRE" "$DEST_ENJAMBRE"
    for _b in "${MODULOS[@]}"; do
      copia_de "$ORIGEN_DIR/$_b" "$DEST_DIR/$_b"
    done
    if [ -n "$DEST_LANZADOR" ]; then
      echo "  origen lanzador    [md5 $(md5_de "$SRC_LANZADOR")]"
      copia_de "$SRC_LANZADOR" "$DEST_LANZADOR"
    fi
    echo "Hecho. Comprueba cuando quieras con: $0 --comprobar"
    ;;
  *)
    echo "Uso: $0 [--comprobar|--traer]" >&2
    exit 2
    ;;
esac
