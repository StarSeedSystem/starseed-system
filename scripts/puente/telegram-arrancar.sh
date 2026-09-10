#!/bin/zsh
# Enciende el puente de Telegram como demonio, con las claves del entorno.
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
cd "$RAIZ" || exit 1
if ps -eo args | grep -q "[t]elegram-puente.py"; then
  echo "El puente de Telegram ya está encendido."; exit 0
fi
python3 scripts/puente/demonio.py /tmp/telegram-puente.log "$RAIZ" \
  /bin/zsh -c 'set -a; [ -f "$HOME/.hermes/.env" ] && source "$HOME/.hermes/.env"; set +a; exec python3 scripts/puente/telegram-puente.py'
sleep 5
if ps -eo args | grep -q "[t]elegram-puente.py"; then
  echo "Puente de Telegram encendido. Escríbele /ayuda al bot."
  echo "Registro: /tmp/telegram-puente.log"
else
  echo "No arrancó. Mira /tmp/telegram-puente.log"; tail -5 /tmp/telegram-puente.log 2>/dev/null
fi
