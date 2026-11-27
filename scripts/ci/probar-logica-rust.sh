#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# probar-logica-rust — Pruebas de lógica Rust solo-std en la CI (BAP1127W).
# ---------------------------------------------------------------------------
# Recorre native/src-tauri/src/*_logica.rs, salta los que usen `crate::`,
# `use tauri` o crates externos (no son solo-std), y para cada uno ejecuta:
#   rustc --edition 2021 --test <archivo> -o "$TMP/<nombre>" && "$TMP/<nombre>" -q
# Imprime un resumen (pasan/fallan/saltados) y sale con 1 si alguno falla.
# Acepta una lista de archivos como argumentos para probar solo esos.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Directorio base del crate Tauri
TAURI_SRC="native/src-tauri/src"

# Patrones que indican que el archivo NO es solo-std
EXTERNAL_CRATE_PATTERNS=(
    "use serde"
    "use serde_json"
    "use base64"
    "use p256"
    "use tauri"
    "use crate::"
)

# Colores para salida
VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
NC='\033[0m' # Sin color

pasar=0
fallar=0
saltar=0
archivos_fallidos=()

# Función para comprobar si un archivo es solo-std
es_solo_std() {
    local archivo="$1"
    local contenido
    contenido=$(cat "$archivo" 2>/dev/null) || return 1

    for patron in "${EXTERNAL_CRATE_PATTERNS[@]}"; do
        if echo "$contenido" | grep -q "^[[:space:]]*$patron"; then
            return 1
        fi
    done
    return 0
}

# Función para probar un archivo
probar_archivo() {
    local archivo="$1"
    local nombre
    nombre=$(basename "$archivo" .rs)
    local binario="${TMPDIR:-/tmp}/${nombre}"

    echo -n "  Probando $nombre... "

    if rustc --edition 2021 --test "$archivo" -o "$binario" 2>/dev/null; then
        if "$binario" -q 2>/dev/null; then
            echo -e "${VERDE}OK${NC}"
            ((pasar++))
            rm -f "$binario"
            return 0
        else
            echo -e "${ROJO}FALLO (ejecución)${NC}"
            ((fallar++))
            archivos_fallidos+=("$nombre")
            rm -f "$binario"
            return 1
        fi
    else
        echo -e "${ROJO}FALLO (compilación)${NC}"
        ((fallar++))
        archivos_fallidos+=("$nombre")
        return 1
    fi
}

# Determinar archivos a probar
archivos_a_probar=()

if [[ $# -gt 0 ]]; then
    # Argumentos proporcionados: validar que existen
    for arg in "$@"; do
        if [[ -f "$arg" ]]; then
            archivos_a_probar+=("$arg")
        else
            echo "Advertencia: archivo no encontrado: $arg" >&2
        fi
    done
else
    # Descubrir todos los *_logica.rs
    while IFS= read -r -d '' archivo; do
        archivos_a_probar+=("$archivo")
    done < <(find "$TAURI_SRC" -maxdepth 1 -name '*_logica.rs' -print0 2>/dev/null | sort -z)
fi

if [[ ${#archivos_a_probar[@]} -eq 0 ]]; then
    echo "No se encontraron archivos *_logica.rs para probar."
    exit 0
fi

echo "Pruebas de lógica Rust solo-std"
echo "Archivos a evaluar: ${#archivos_a_probar[@]}"
echo

for archivo in "${archivos_a_probar[@]}"; do
    if es_solo_std "$archivo"; then
        probar_archivo "$archivo"
    else
        nombre=$(basename "$archivo" .rs)
        echo -e "  $nombre... ${AMARILLO}SALTADO${NC} (usa crates externos o crate::)"
        ((saltar++))
    fi
done

echo
echo "Resumen:"
echo -e "  ${VERDE}Pasan: $pasar${NC}"
echo -e "  ${ROJO}Fallan: $fallar${NC}"
echo -e "  ${AMARILLO}Saltados: $saltar${NC}"

if [[ $fallar -gt 0 ]]; then
    echo
    echo "Archivos fallidos:"
    for f in "${archivos_fallidos[@]}"; do
        echo "  - $f"
    done
    exit 1
fi

exit 0