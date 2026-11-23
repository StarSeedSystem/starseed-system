#!/bin/bash
# Sanador del A1: ejecuta oracle_nodo.py desplegar-bots --aplicar tras cada publicación
# y avisa en el canal "Audiovisual y diseño" de Telegram.

set -euo pipefail

RAIZ_REPO="/home/starseed/starseed-system"
SCRIPT_ORACLE_NODO="${RAIZ_REPO}/scripts/puente/oracle_nodo.py"
ENV_FILE="/home/starseed/.starseed/env"

log() {
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*"
}

# Cargar variables de entorno para el token de Telegram
if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck source=/dev/null
    source "${ENV_FILE}"
fi

# Función para enviar mensaje al canal Audiovisual y diseño
avisar_audiovisual() {
    local mensaje="$1"
    if [[ -n "${TELEGRAM_SINTESIS_BOT_TOKEN:-}" && -n "${TELEGRAM_SINTESIS_CHAT_ID:-}" ]]; then
        python3 -c "
import urllib.request, urllib.parse, os
token = os.environ.get('TELEGRAM_SINTESIS_BOT_TOKEN', '')
chat = os.environ.get('TELEGRAM_SINTESIS_CHAT_ID', '')
if token and chat:
    url = f'https://api.telegram.org/bot{token}/sendMessage'
    data = urllib.parse.urlencode({'chat_id': chat, 'text': mensaje}).encode()
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=10) as resp:
            pass
    except Exception:
        pass
" || true
    fi
}

main() {
    log "Iniciando sanador: despliegue de bots en el A1"

    # Ejecutar desplegar-bots
    local salida
    salida=$(python3 "${SCRIPT_ORACLE_NODO}" desplegar-bots --aplicar 2>&1)
    local rc=$?

    if [[ ${rc} -eq 0 ]]; then
        log "desplegar-bots completado correctamente"
        # Extraer commit y estado del servicio del JSON de salida
        local commit
        commit=$(echo "${salida}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('commit', '?'))" 2>/dev/null || echo "?")
        local cambiado
        cambiado=$(echo "${salida}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('cambiado', False))" 2>/dev/null || echo "false")
        local inicio_servicio
        inicio_servicio=$(echo "${salida}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('inicio_servicio', '?'))" 2>/dev/null || echo "?")

        if [[ "${cambiado}" == "True" || "${cambiado}" == "true" ]]; then
            avisar_audiovisual "🤖 Sanador A1: bots actualizados tras publicación
Commit: ${commit}
Servicio starseed-peticiones-telegram reiniciado
Inicio: ${inicio_servicio}"
        else
            log "No hubo cambios en archivos de peticiones; bots no reiniciados"
            avisar_audiovisual "🤖 Sanador A1: publicación procesada, sin cambios en peticiones_*.py
Commit: ${commit}
Bots ya están al día"
        fi
    else
        log "ERROR en desplegar-bots: ${salida}"
        avisar_audiovisual "⚠️ Sanador A1: FALLO al desplegar bots tras publicación
Error: ${salida:0:300}"
        exit 1
    fi
}

main "$@"