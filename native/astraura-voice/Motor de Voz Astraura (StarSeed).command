#!/bin/bash
# ============================================================================
# StarSeed OS — Motor de Voz Astraura · lanzador de doble clic (macOS)
# ----------------------------------------------------------------------------
# Doble-clica este archivo para INSTALAR (o actualizar) y ARRANCAR el motor de
# voz local de Astraura. Deja el servicio corriendo en segundo plano en
# http://127.0.0.1:4444 para que StarSeed OS lo use como voz de borde (edge).
# ============================================================================

cd "$(dirname "$0")" || exit 1
clear
echo ""
echo "  🌌  StarSeed · Motor de Voz Astraura (OmniVoice local)"
echo "  ─────────────────────────────────────────────────────────"
echo "  Voz local privada para Aurora. Se instala una vez y se"
echo "  actualiza sola. Cuando esté lista, StarSeed OS la usará"
echo "  automáticamente (y usará la nube si no está disponible)."
echo ""

# ── 1 · Localizar Node ───────────────────────────────────────────────────────
NODE_BIN="$(command -v node 2>/dev/null)"
if [ -z "$NODE_BIN" ]; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.nvm/versions/node"/*/bin/node; do
    [ -x "$p" ] && NODE_BIN="$p" && break
  done
fi
if [ -z "$NODE_BIN" ]; then
  echo "  ✗ No encuentro Node.js. Instálalo desde https://nodejs.org (versión 18 o superior)"
  echo "    y vuelve a abrir este lanzador."
  echo ""
  echo "  Pulsa una tecla para cerrar…"
  read -r -n 1 -s
  exit 1
fi
echo "  ✓ Node: $NODE_BIN ($("$NODE_BIN" --version 2>/dev/null))"

# ── 2 · Instalar / actualizar (idempotente) ──────────────────────────────────
echo ""
echo "  ▸ Instalando/actualizando el motor (esto puede tardar la 1ª vez:"
echo "    clona, compila y descarga el modelo)…"
echo ""
"$NODE_BIN" install.mjs
INSTALL_CODE=$?
if [ $INSTALL_CODE -ne 0 ]; then
  echo ""
  echo "  ⚠ El instalador terminó con avisos (código $INSTALL_CODE)."
  echo "    Revisa el registro:  ~/.starseed/astraura-voice/logs/build.log"
fi

# ── 3 · Asegurar que el daemon está en marcha ────────────────────────────────
echo ""
echo "  ▸ Comprobando el daemon en http://127.0.0.1:4444 …"
is_up() { curl -s -m 2 "http://127.0.0.1:4444/status" >/dev/null 2>&1; }

# El servicio launchd ya debería haberlo arrancado; damos margen y, si no,
# lo lanzamos en segundo plano nosotros.
for _ in 1 2 3 4 5 6 7 8; do
  is_up && break
  sleep 1
done

if ! is_up; then
  echo "    · el servicio aún no responde; lo arranco en segundo plano…"
  mkdir -p "$HOME/.starseed/astraura-voice/logs"
  nohup "$NODE_BIN" daemon.mjs >>"$HOME/.starseed/astraura-voice/logs/daemon.out.log" 2>&1 &
  disown 2>/dev/null || true
  for _ in 1 2 3 4 5 6; do
    is_up && break
    sleep 1
  done
fi

echo ""
if is_up; then
  echo "  ─────────────────────────────────────────────────────────"
  echo "  ✓ Motor de Voz Astraura EN MARCHA."
  STATUS_JSON="$(curl -s -m 2 http://127.0.0.1:4444/status 2>/dev/null)"
  echo "    /status → $STATUS_JSON"
  echo ""
  echo "    Ya puedes cerrar esta ventana. StarSeed OS usará esta voz"
  echo "    local automáticamente. Se arrancará sola en cada inicio de"
  echo "    sesión y se mantendrá actualizada."
else
  echo "  ⚠ El daemon no responde todavía. Puede que aún falten los"
  echo "    binarios o el modelo (revisa los avisos de arriba)."
  echo "    Vuelve a abrir este lanzador cuando tengas conexión, o mira:"
  echo "      ~/.starseed/astraura-voice/logs/build.log"
  echo "      ~/.starseed/astraura-voice/logs/daemon.log"
fi
echo "  ─────────────────────────────────────────────────────────"
echo ""
echo "  Pulsa una tecla para cerrar…"
read -r -n 1 -s
echo ""
