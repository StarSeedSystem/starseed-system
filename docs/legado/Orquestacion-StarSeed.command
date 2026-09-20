#!/bin/zsh
# ════════════════════════════════════════════════════════════════════
# StarSeed · Orquestación en vivo — lanzador de doble clic (Adenda 185)
# Abre el Centro de Mando agéntico en http://localhost:8899:
#   · arranca el visor si no está escuchando
#   · revive el backend 1.58 (launchd) si está caído (sin matarlo si vive)
#   · abre el navegador en la página directamente
# ════════════════════════════════════════════════════════════════════
export PATH="$HOME/.local/bin:$HOME/.opencode/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
VISOR="$HOME/Documents/IA 1.58 bit/backend/orquestacion_visor.py"

echo "◈ StarSeed · Orquestación en vivo"

# 1) Backend 1.58 (datos en vivo) — solo si NO responde ya
if ! curl -s -m 2 http://127.0.0.1:8000/api/status >/dev/null 2>&1; then
  echo "  · Backend 1.58 caído → reviviendo por launchd…"
  launchctl kickstart "gui/$(id -u)/com.starseed.astraura" >/dev/null 2>&1
fi

# 2) Visor / Centro de Mando — arrancar si el puerto 8899 no responde
if ! curl -s -m 2 http://localhost:8899/ >/dev/null 2>&1; then
  echo "  · Arrancando el Centro de Mando…"
  nohup python3 "$VISOR" >/tmp/visor.log 2>&1 &
  for i in {1..20}; do
    sleep 1
    curl -s -m 2 http://localhost:8899/ >/dev/null 2>&1 && break
  done
else
  echo "  · Centro de Mando ya estaba activo."
fi

# 3) Abrir en el navegador, directo
if curl -s -m 3 http://localhost:8899/ >/dev/null 2>&1; then
  echo "  · Abriendo http://localhost:8899 …"
  open "http://localhost:8899"
else
  echo "  ⚠ No se pudo abrir (revisa /tmp/visor.log)."
fi

sleep 1
