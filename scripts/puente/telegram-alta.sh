#!/bin/zsh
# Alta del bot de Telegram, sin que el token pase por ningún sitio visible.
#
#   bash scripts/puente/telegram-alta.sh
#
# Te pide el token en una entrada OCULTA (no se ve al teclear, no queda en el
# historial del shell), lo guarda en ~/.hermes/.env con permisos 600, averigua
# solo el chat id y lo guarda también. No imprime el token jamás.
set -e
ENV="$HOME/.hermes/.env"
touch "$ENV"; chmod 600 "$ENV"

if ! grep -q '^TELEGRAM_BOT_TOKEN=' "$ENV" 2>/dev/null; then
  echo "Pega el token de BotFather (no se verá al teclear) y pulsa Enter:"
  read -rs TOKEN
  echo
  [ -z "$TOKEN" ] && { echo "Token vacío. Nada guardado."; exit 1; }
  printf '\nTELEGRAM_BOT_TOKEN=%s\n' "$TOKEN" >> "$ENV"
  echo "Token guardado en ~/.hermes/.env (permisos 600)."
else
  echo "Ya había un TELEGRAM_BOT_TOKEN en ~/.hermes/.env; lo uso."
  TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV" | tail -1 | cut -d= -f2-)
fi

echo
echo "Comprobando el bot…"
NOMBRE=$(curl -s -m 20 "https://api.telegram.org/bot$TOKEN/getMe" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["result"]["username"] if d.get("ok") else "")' 2>/dev/null || true)
[ -z "$NOMBRE" ] && { echo "El token no vale: getMe no responde ok. Revócalo en BotFather y vuelve a empezar."; exit 1; }
echo "Bot vivo: @$NOMBRE"

if grep -q '^TELEGRAM_CHAT_ID=' "$ENV" 2>/dev/null; then
  echo "Ya hay un TELEGRAM_CHAT_ID guardado. Listo."
  exit 0
fi

echo
echo "Ahora ESCRÍBELE ALGO a @$NOMBRE en Telegram (un «hola» basta)."
echo "Esperando tu mensaje…"
for i in $(seq 1 60); do
  CHAT=$(curl -s -m 20 "https://api.telegram.org/bot$TOKEN/getUpdates" \
    | python3 -c 'import sys,json
d=json.load(sys.stdin)
r=[u for u in d.get("result",[]) if u.get("message")]
print(r[-1]["message"]["chat"]["id"] if r else "")' 2>/dev/null || true)
  [ -n "$CHAT" ] && break
  sleep 3
done
[ -z "$CHAT" ] && { echo "No llegó ningún mensaje en 3 minutos. Escríbele y vuelve a lanzar esto."; exit 1; }
printf 'TELEGRAM_CHAT_ID=%s\n' "$CHAT" >> "$ENV"
echo "Chat id guardado: $CHAT"
echo
echo "Alta completa. Enciende el puente con:"
echo "  bash scripts/puente/telegram-arrancar.sh"
