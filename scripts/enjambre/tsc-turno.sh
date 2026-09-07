#!/usr/bin/env bash
# tsc-turno.sh — un solo `tsc` a la vez en TODA la máquina (2026-09-07, Ola 261).
#
# Por qué existe (verificado 2026-09-06, contenedor 2 CPU / 7 GB): tres tsc simultáneos
# (la puerta del orquestador + uno por agente que corría `npx tsc` por su cuenta) pusieron
# la máquina a 6,4 GB y load 21, con los logs congelados 15 min. Los agentes ya no ejecutan
# `npx tsc` suelto: pasan por este script, que comparte el MISMO cerrojo-directorio
# (~/.starseed/cerrojos/pesado.lock) que usa el orquestador.
#
# Diseño seguro (fallos del intento anterior, rama rechazada ola/P6):
#   (a) `set -e` mataba el script si tsc fallaba y el cerrojo quedaba para siempre;
#       aquí NO hay -e: se captura rc=$? y el cerrojo se libera SIEMPRE con `trap`.
#   (b) la caché usaba `git ls-files` (solo archivos rastreados) y un archivo nuevo sin
#       `git add` daba un falso «sin cambios»; ahora se usa `-co` (incluye sin rastrear).
#
# Portable a macOS bash 3.2: sin mapfile, sin ${var,,}, sin declare -A.
set -uo pipefail

CERROJOS="$HOME/.starseed/cerrojos"
LOCK="$CERROJOS/pesado.lock"
ESPERA_S=5
MAX_ESPERA_S=1200      # 20 min esperando el turno
MAX_EDAD_CERROJO_S=1800 # 30 min: un cerrojo más viejo cuenta como huérfano
RC=0

mkdir -p "$CERROJOS"

# md5sum solo existe en Linux; en macOS hay `md5 -q` con el mismo resultado.
_hasher() {
    if command -v md5sum >/dev/null 2>&1; then md5sum; else md5 -q; fi
}

# Extrae la primera columna (el hash) tanto de `md5sum` («hash  fichero») como de `md5 -q`.
_primer_campo() { cut -d' ' -f1; }

# Limpieza de huérfanos: si el cerrojo existe pero su dueño ya no vive (`kill -0` falla)
# o tiene más de 30 min, se elimina anotando el motivo. Sin esto, un tsc matado a la
# fuerza deja el cerrojo puesto y TODAS las olas se quedan esperando eternamente.
_limpiar_huerfano() {
    [ -d "$LOCK" ] || return 0
    local pid ep ahora motivo=""
    pid=$(cut -d' ' -f1 "$LOCK/dueno" 2>/dev/null)
    ep=$(cut -d' ' -f2 "$LOCK/dueno" 2>/dev/null)
    ahora=$(date +%s)
    case "${pid:-x}" in
        ''|*[!0-9]*) motivo="dueño ilegible" ;;
        *)
            if ! kill -0 "$pid" 2>/dev/null; then
                motivo="dueño muerto (pid $pid)"
            elif [ -n "${ep:-}" ] && [ $(( ahora - ep )) -gt $MAX_EDAD_CERROJO_S ]; then
                motivo="más de 30 min de antigüedad (pid $pid)"
            fi ;;
    esac
    if [ -n "$motivo" ]; then
        echo "cerrojo huérfano eliminado: $motivo" >&2
        rm -rf "$LOCK"
    fi
}

# Adquirir el turno: mkdir es la única operación atómica de «uno gana» que sirve igual
# en Linux y en macOS. Si el archivo `dueno` no se llegó a escribir (crash entre mkdir y
# la escritura), la propia limpieza de huérfanos lo recoge en la siguiente vuelta.
_tomar_cerrojo() {
    local t0
    # Compatibilidad: versiones viejas del orquestador usaban un ARCHIVO pesado.lock
    # (flock); un archivo aquí rompería mkdir para siempre, así que se descarta.
    [ -f "$LOCK" ] && rm -f "$LOCK"
    t0=$(date +%s)
    while :; do
        _limpiar_huerfano
        if mkdir "$LOCK" 2>/dev/null; then
            printf '%s %s\n' "$$" "$(date +%s)" > "$LOCK/dueno"
            return 0
        fi
        if [ $(( $(date +%s) - t0 )) -ge $MAX_ESPERA_S ]; then
            echo "tsc-turno: $(( MAX_ESPERA_S / 60 )) min de espera agotados; fuerzo el turno" >&2
            rm -rf "$LOCK"
            mkdir "$LOCK" 2>/dev/null && printf '%s %s\n' "$$" "$(date +%s)" > "$LOCK/dueno"
            return 0
        fi
        sleep "$ESPERA_S"
    done
}

# Liberación segura: solo se borra el directorio si el `dueno` registrado es ESTE pid —
# si nuestro turno expiró y otro ya ganó el cerrojo, no se lo quitamos.
_liberar() {
    local pid
    pid=$(cut -d' ' -f1 "$LOCK/dueno" 2>/dev/null || true)
    if [ "${pid:-}" = "$$" ]; then rm -rf "$LOCK"; fi
}
trap '_liberar' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Hash de cambios: contenido de todos los .ts/.tsx/tsconfig, rastreados O NO (`-co`),
# para que un archivo nuevo sin `git add` también invalide la caché en verde.
_hash_cambios() {
    # xargs no hereda funciones del shell: se resuelve el binario concreto primero.
    local cmd qf
    if command -v md5sum >/dev/null 2>&1; then cmd="md5sum"; qf=""; else cmd="md5"; qf="-q"; fi
    git ls-files -z -co --exclude-standard -- '*.ts' '*.tsx' 'tsconfig*.json' 2>/dev/null \
        | xargs -0 "$cmd" $qf 2>/dev/null | "$cmd" $qf | cut -d' ' -f1
}

# Fichero de caché POR REPO, fuera del árbol (nada de tocar .gitignore).
_cache_repo() {
    printf '%s/tsc-cache-%s' "$CERROJOS" "$(printf '%s' "$PWD" | _hasher | _primer_campo)"
}

_tomar_cerrojo

CACHE="$(_cache_repo)"
HASH_AHORA="$(_hash_cambios)"
CACHE_HASH=""
CACHE_RC=""
if [ -f "$CACHE" ]; then
    CACHE_HASH=$(sed -n '1p' "$CACHE" 2>/dev/null || true)
    CACHE_RC=$(sed -n '2p' "$CACHE" 2>/dev/null || true)
fi

if [ -n "$HASH_AHORA" ] && [ "$HASH_AHORA" = "${CACHE_HASH:-}" ] && [ "${CACHE_RC:-}" = "0" ]; then
    echo "tsc: sin cambios desde la última pasada en verde"
    exit 0
fi

echo "tsc-turno: turno tomado (pid $$), compilando…" >&2
NODE_OPTIONS=--max-old-space-size=2560 npx tsc --noEmit --skipLibCheck
RC=$?
if [ -n "$HASH_AHORA" ]; then
    printf '%s\n%s\n' "$HASH_AHORA" "$RC" > "$CACHE"
fi
exit "$RC"
