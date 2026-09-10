#!/bin/zsh
# Abre el chat principal del Puente de Mando en el IDE que le pidas, con el
# contexto compartido ya cargado. Refresca el contexto antes, siempre.
#   bash scripts/puente/abrir-chat.sh codex|hermes|antigravity|todos
RAIZ="${STARSEED_ROOT:-/Users/alex/Documents/starseed-os-main}"
cd "$RAIZ" || exit 1
export PATH="$HOME/.local/bin:$PATH"
bash scripts/puente/arrancar-mando.sh >/dev/null 2>&1
python3 scripts/puente/sincronizar-ides.py --solo >/dev/null 2>&1
SALUDO="Eres el chat principal del Puente de Mando de StarSeed OS en este IDE. Lee AGENTS.md y PUENTE-DE-MANDO.md de la raiz del repositorio antes de nada: ahi esta el estado vivo del enjambre, regenerado desde localhost:9002. Dirige el enjambre con 'starseed-puente' (estado, agentes, aprobar, soltar, reasignar, puertas). No arranques un segundo orquestador y no ejecutes 'next build' con el enjambre vivo. Dime que ves en el Mando ahora mismo y que es lo siguiente mas rentable."
abrir_codex() {
  command -v codex >/dev/null || { echo "codex no esta en el PATH"; return 1; }
  echo "→ Codex: abriendo chat en $RAIZ"
  codex "$SALUDO"
}
abrir_hermes() {
  [ -x "$HOME/.hermes/bin/hermes" ] || command -v hermes >/dev/null || { echo "hermes no encontrado"; return 1; }
  echo "→ Hermes: el contexto esta en ~/.hermes/PUENTE-DE-MANDO.md"
  ("$HOME/.hermes/bin/hermes" 2>/dev/null || hermes) 
}
abrir_antigravity() {
  echo "→ Antigravity: abriendo el repositorio (el chat lee gemini.md y AGENTS.md)"
  open -a "Antigravity IDE" "$RAIZ" 2>/dev/null || echo "no pude abrir Antigravity IDE"
}
case "${1:-todos}" in
  codex) abrir_codex ;;
  hermes) abrir_hermes ;;
  antigravity) abrir_antigravity ;;
  todos) abrir_antigravity; echo; echo "Para Codex:   bash scripts/puente/abrir-chat.sh codex"; echo "Para Hermes:  bash scripts/puente/abrir-chat.sh hermes" ;;
  *) echo "uso: abrir-chat.sh codex|hermes|antigravity|todos" ;;
esac
