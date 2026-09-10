#!/bin/zsh
# Pone los servicios del Puente bajo launchd, que es quien de verdad los mantiene vivos.
#
#   bash scripts/puente/instalar-servicios.sh          # instala y arranca
#   bash scripts/puente/instalar-servicios.sh estado   # dice quién vive
#   bash scripts/puente/instalar-servicios.sh parar    # descarga todos
#
# POR QUÉ. Los lanzábamos con un demonio propio (doble fork + setsid) y aun así morían
# todos a la vez, sin marca de salida. La causa: el servidor MCP que da la terminal
# arranca con `--pgroup` y, al reiniciarse, se lleva por delante todo lo que lanzó.
# La prueba está en que el Mando fue el ÚNICO superviviente de cada masacre — y era el
# único que estaba bajo launchd. Así que van todos ahí: launchd es de macOS, sobrevive
# al reinicio del MCP, al cierre de la terminal y al arranque de la máquina, y con
# KeepAlive los levanta solo si se caen.
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
AGENTES="$HOME/Library/LaunchAgents"
PY="/usr/bin/env"
mkdir -p "$AGENTES"

servicios=(
  "vigilante:scripts/puente/vigilante-enjambre.py:"
  "guardia:scripts/puente/guardia-memoria.py:"
  "telegram:scripts/puente/telegram-puente.py:si"
  "eco:scripts/puente/eco-enjambre.py:/tmp/enjambre.log"
  "ecoides:scripts/puente/eco-a-ides.py:"
)

plist() {
  local nombre="$1" guion="$2" extra="$3"
  local etiqueta="com.starseed.$nombre"
  local args="    <string>python3</string>
    <string>$RAIZ/$guion</string>"
  [ -n "$extra" ] && [ "$extra" != "si" ] && args="$args
    <string>$extra</string>"
  # El de Telegram necesita las claves del entorno: se cargan en un shell de login.
  if [ "$extra" = "si" ]; then
    args="    <string>/bin/zsh</string>
    <string>-c</string>
    <string>set -a; [ -f \"\$HOME/.hermes/.env\" ] &amp;&amp; source \"\$HOME/.hermes/.env\"; set +a; exec python3 $RAIZ/$guion</string>"
  fi
  cat > "$AGENTES/$etiqueta.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$etiqueta</string>
  <key>ProgramArguments</key><array>
$args
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>WorkingDirectory</key><string>$RAIZ</string>
  <key>StandardOutPath</key><string>/tmp/starseed-$nombre.log</string>
  <key>StandardErrorPath</key><string>/tmp/starseed-$nombre.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>STARSEED_ROOT</key><string>$RAIZ</string>
  </dict>
</dict></plist>
PLIST
  echo "$etiqueta"
}

case "${1:-instalar}" in
  estado)
    for s in $servicios; do
      n="${s%%:*}"
      printf "%-12s %s\n" "$n" "$(launchctl list 2>/dev/null | grep "com.starseed.$n" || echo 'NO cargado')"
    done
    printf "%-12s %s\n" "mando" "$(launchctl list 2>/dev/null | grep com.starseed.mando || echo 'NO cargado')"
    ;;
  parar)
    for s in $servicios; do
      n="${s%%:*}"
      launchctl unload "$AGENTES/com.starseed.$n.plist" 2>/dev/null && echo "descargado com.starseed.$n"
    done
    ;;
  *)
    for s in $servicios; do
      n="${s%%:*}"; resto="${s#*:}"; guion="${resto%%:*}"; extra="${resto#*:}"
      etiqueta=$(plist "$n" "$guion" "$extra")
      launchctl unload "$AGENTES/$etiqueta.plist" 2>/dev/null
      launchctl load "$AGENTES/$etiqueta.plist" 2>/dev/null && echo "cargado $etiqueta"
    done
    echo
    echo "Listo. launchd los mantiene vivos aunque se reinicie el MCP, se cierre la"
    echo "terminal o se apague la Mac. Comprueba con: bash $0 estado"
    ;;
esac
