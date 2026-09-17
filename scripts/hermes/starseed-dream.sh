#!/bin/bash
# ═══ StarSeed · Dream Autónomo Adaptativo (solo modelos GRATUITOS) ═══
# Contrato: starseed_memory_root/dream/dream.md · Catálogo: dream/modelos-gratuitos.md
ROOT="/Users/alex/Documents/starseed-os-main/starseed_memory_root"
REPO="/Users/alex/Documents/starseed-os-main"
DATE=$(date +%Y-%m-%d); HORA=$(date +%H:%M)
OUT="$ROOT/dream/sugerencias-$DATE.md"
# Pares "proveedor|modelo": el Dream dependia SOLO de OpenRouter y se quedaba mudo
# los dias en que su cuota gratuita estaba agotada. Ahora releva a otros proveedores.
# Candidatos, por pasarela. Se ORDENAN abajo según el informe de sondas: lo que
# de verdad escribe hoy va primero. Solo proveedores que Hermes tiene
# configurados (`provider_models_cache.json`); groq NO está ahí, aunque el
# enjambre lo use.
MODELS=(
  "apinex|free/glm-5.3-flash"
  "apinex|free/deepseek-v4-pro-0813"
  "apinex|free/gemini-3.1-pro"
  "apinex|free/qwen-3.8-max"
  "nvidia|moonshotai/kimi-k3"
  "openrouter|nvidia/nemotron-3-ultra-550b-a55b:free"
  "openrouter|nvidia/nemotron-3-super-120b-a12b:free"
  "xkiro|qwen/qwen3.7-plus:free"
  "xkiro|minimax/minimax-m3:free"
  "openrouter|poolside/laguna-xs-2.1:free"
  "openrouter|nvidia/nemotron-nano-9b-v2:free"
)

# ── Preguntar qué escribe HOY en vez de fiarse de una lista fija ──────────────
# El Dream estuvo MUDO el 16 y el 17 («sin respuesta de modelos gratuitos hoy»),
# y no era culpa suya: sus seis modelos eran todos de openrouter y xkiro, las
# dos pasarelas que llevaban dos días sin cupo. El enjambre ya sabía cuáles
# escriben —lo mide el renovador cada rato y lo deja en pasarelas-informe.json—
# pero el Dream no lo miraba. Dos informes perdidos por no preguntar.
# Ahora se reordena: primero los de las pasarelas que ESCRIBEN, después el resto
# (por si el informe está viejo o se equivoca: nunca se descarta un candidato,
# solo se le cambia el turno).
ORDENADOS="$(
  ROOT_REPO="$REPO" python3 - "${MODELS[@]}" <<'PYORD' 2>/dev/null
import json, os, sys
pares = sys.argv[1:]
try:
    with open(os.path.expanduser("~/.starseed/pasarelas-informe.json"), encoding="utf-8") as f:
        inf = json.load(f)
    vivas = {r.get("clave") for r in inf.get("pasarelas", []) if r.get("estado") in ("escribe", "lenta")}
except Exception:
    vivas = set()
if vivas:
    pares.sort(key=lambda x: 0 if x.split("|", 1)[0] in vivas else 1)
print("\n".join(pares))
PYORD
)"
if [ -n "$ORDENADOS" ]; then
  MODELS=(); while IFS= read -r l; do [ -n "$l" ] && MODELS+=("$l"); done <<< "$ORDENADOS"
fi
LIMIT=420  # seg max por modelo (el watchdog evita el timeout del cron)

CTX="$(mktemp)"
{
  echo "### current-status.md"; cat "$ROOT/current-status.md" 2>/dev/null
  echo; echo "### metodologia-ia.md"; cat "$ROOT/metodologia-ia.md" 2>/dev/null
  echo; echo "### tasks abiertas"; grep "^- \[ \]" "$ROOT/tasks/tasks.md" 2>/dev/null | tail -45
  echo; echo "### logs (ultimas 50)"; tail -50 "$ROOT/logs/logs.md" 2>/dev/null
  echo; echo "### git log"; git -C "$REPO" log --oneline -12 2>/dev/null
  # ── Estado VIVO: lo que hasta ahora solo veia el Puente de Mando ──────────────
  # El Dream sonaba con las memorias y las adendas, pero no sabia que estaba
  # pasando AHORA: que olas corren, que agente escribe que tarea, que proveedores
  # estan caidos, cuantos commits esperan. Sin eso sus sugerencias iban a ciegas.
  echo; echo "### ESTADO VIVO (olas, agentes, procesos, proveedores, chats)"
  "$HOME/.local/bin/starseed-contexto-vivo" 2>/dev/null
  echo; echo "### ultimo informe de ola"
  ls -t "$ROOT/relevo/"informe-*.md 2>/dev/null | head -1 | xargs -I{} head -30 {} 2>/dev/null
  echo; echo "### relevo"; head -40 "$ROOT/relevo/relevo.md" 2>/dev/null
} > "$CTX"

PROMPT="Eres el sistema Dream Autonomo de StarSeed OS (contrato en dream/dream.md). Analiza el CONTEXTO y responde SOLO con un informe markdown en espanol, con secciones exactas: '## Top 3 accionables' (con impacto/esfuerzo), '## Mejoras detectadas', '## Riesgos', '## Ideas nuevas' y '## Estado del enjambre' (dos o tres lineas sobre las olas y agentes de AHORA, sacadas del ESTADO VIVO: que se esta escribiendo, que proveedores estan caidos y cuantos commits esperan publicacion). Se concreto y cita archivos, tareas y olas por su id. No propongas tocar secretos ni deploys.

CONTEXTO:
$(cat "$CTX")"

for PAR in "${MODELS[@]}"; do
  PROV="${PAR%%|*}"; M="${PAR#*|}"
  TMP="$(mktemp)"
  ( hermes -z "$PROMPT" -m "$M" --provider "$PROV" --safe-mode > "$TMP" 2>/dev/null ) &
  PID=$!; SECS=0
  while kill -0 $PID 2>/dev/null; do
    sleep 5; SECS=$((SECS+5))
    if [ $SECS -ge $LIMIT ]; then kill -9 $PID 2>/dev/null; break; fi
  done
  wait $PID 2>/dev/null
  RESP="$(cat "$TMP")"; rm -f "$TMP"
  if [ ${#RESP} -gt 400 ] && echo "$RESP" | grep -q "Top 3"; then
    {
      echo "# 🌙 Dream — Sugerencias $DATE"
      echo
      echo "$RESP"
      echo
      echo "---"
      echo "_Generado por starseed-dream.sh · $PROV/$M · $DATE $HORA · 100% gratuito_"
    } > "$OUT"
    echo "[$DATE] (dream) Sugerencias del Dream autonomo con $PROV/$M -> dream/sugerencias-$DATE.md" >> "$ROOT/logs/logs.md"
    # Al Telegram de Alex (canal `hermes-telegram`, dm 8670436815): un sueño que nadie
    # lee no sirve de nada. Se manda el encabezado y los accionables, no el informe entero.
    RESUMEN="$(printf '%s' "$RESP" | sed -n '/## Top 3 accionables/,/## Mejoras detectadas/p' | head -22)"
    hermes send -q "🌙 Dream StarSeed · $DATE
$RESUMEN

Informe completo: starseed_memory_root/dream/sugerencias-$DATE.md
Puente de Mando: http://localhost:9002/mando" >/dev/null 2>&1 || true
    echo "🌙 Dream OK ($PROV/$M) -> $OUT"
    rm -f "$CTX"; exit 0
  fi
done
echo "[$DATE] (dream) Dream autonomo: ningun modelo gratuito respondio (revisar dream/modelos-gratuitos.md)" >> "$ROOT/logs/logs.md"
echo "🌙 Dream sin respuesta de modelos gratuitos hoy"
rm -f "$CTX"; exit 1
