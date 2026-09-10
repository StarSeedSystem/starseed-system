#!/bin/zsh
# Enciende el puente de Telegram como demonio, con las claves del entorno.
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
cd "$RAIZ" || exit 1
# Cuenta SOLO procesos cuya orden EMPIEZA por un python. Un grep suelto contaba como
# puente el proceso de un agente, porque el TEXTO DEL PROMPT menciona este archivo — la
# misma trampa que ya nos hizo matar nuestro propio shell y contar orquestadores fantasma.
VIVOS=$(ps -eo args | grep -cE '^[^ ]*[Pp]ython[0-9.]* .*telegram-puente\.py')
if [ "$VIVOS" -gt 0 ]; then
  echo "El puente de Telegram ya está encendido ($VIVOS proceso/s)."; exit 0
fi
python3 scripts/puente/demonio.py /tmp/telegram-puente.log "$RAIZ" \
  /bin/zsh -c 'set -a; [ -f "$HOME/.hermes/.env" ] && source "$HOME/.hermes/.env"; set +a; exec python3 scripts/puente/telegram-puente.py'
sleep 5
if ps -eo args | grep -qE '^[^ ]*[Pp]ython[0-9.]* .*telegram-puente\.py'; then
  echo "Puente de Telegram encendido. Escríbele /ayuda al bot."
  echo "Registro: /tmp/telegram-puente.log"
else
  echo "No arrancó. Mira /tmp/telegram-puente.log"; tail -5 /tmp/telegram-puente.log 2>/dev/null
fi
