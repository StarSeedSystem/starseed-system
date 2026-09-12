#!/bin/zsh
# Levanta el Puente de Mando en localhost:9002 como demonio de verdad.
# Doble fork + setsid: sobrevive a que se cierre la terminal, el IDE o el puente
# con la sesión que lo lanzó. Cualquiera de los cuatro entornos puede ejecutarlo.
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
PUERTO="${STARSEED_MANDO_PUERTO:-9002}"
if curl -s -o /dev/null -m 3 "http://localhost:$PUERTO/mando"; then
  echo "El Mando ya responde en http://localhost:$PUERTO/mando"; exit 0
fi
if [ ! -f "$RAIZ/.next/BUILD_ID" ]; then
  echo "No hay build. 'next start' sirve el build compilado, así que compila primero:"
  echo "  cd $RAIZ && npx next build      (con el enjambre PARADO)"; exit 1
fi
python3 - "$RAIZ" "$PUERTO" <<'PY'
import os, subprocess, sys
raiz, puerto = sys.argv[1], sys.argv[2]
if os.fork() > 0: sys.exit(0)
os.setsid()
if os.fork() > 0: os._exit(0)
log = open("/tmp/starseed-mando.log", "a")
os.chdir(raiz)
env = {**os.environ, "STARSEED_MANDO": "1", "STARSEED_LOCAL": "1"}
subprocess.call(["npx", "next", "start", "-p", puerto], stdout=log,
                stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, env=env)
os._exit(0)
PY
sleep 6
if curl -s -o /dev/null -m 5 "http://localhost:$PUERTO/mando"; then
  echo "Mando encendido: http://localhost:$PUERTO/mando"
else
  echo "No arrancó. Mira /tmp/starseed-mando.log"; exit 1
fi
