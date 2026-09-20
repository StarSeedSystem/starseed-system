#!/usr/bin/env bash
# Arranque del medio «nube-hf» (Space de Hugging Face). Ver Dockerfile.
set -uo pipefail

REPO_URL="${STARSEED_REPO_URL:-https://github.com/StarSeedSystem/starseed-system.git}"
ROOT="${STARSEED_ROOT:-$HOME/starseed-system}"
WORKERS="${STARSEED_WORKERS:-2}"
LOG="$HOME/enjambre-nube-hf.log"
ESTADO="$HOME/estado-nube-hf.json"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

# 1. Claves: de los secretos del Space (variables de entorno) a ~/.starseed/env.
#    Solo se copian las que existan; nunca se imprimen. `set -a` + source en el orquestador.
escribir_env() {
  local f="$HOME/.starseed/env"; : > "$f"; chmod 600 "$f"
  local n=0
  for v in GEMINI_API_KEY GOOGLE_GENERATIVE_AI_API_KEY NVIDIA_API_KEY NVIDIA_SHARED_KEY OPENROUTER_API_KEY \
           XKIRO_API_KEY AIHUBMIX_API_KEY TOKENROUTER_API_KEY GROQ_API_KEY STARSEED_PASARELA_GROQ_KEY \
           STARSEED_PASARELA_GROQ_URL STARSEED_PASARELA_GROQ_MODELOS STARSEED_PASARELA_GROQ_RPM \
           HF_TOKEN STARSEED_LANZADOR_SECRETO STARSEED_NUBE_TOKEN; do
    if [ -n "${!v:-}" ]; then printf '%s=%q\n' "$v" "${!v}" >> "$f"; n=$((n+1)); fi
  done
  log "env: $n variables presentes (nombres, nunca valores)"
}

# 2. Repo + dependencias + orquestador (idempotente).
preparar_repo() {
  if [ ! -d "$ROOT/.git" ]; then
    log "clonando $REPO_URL"
    git clone --depth 50 "$REPO_URL" "$ROOT" >> "$LOG" 2>&1 || { log "clone falló"; return 1; }
  fi
  cd "$ROOT" || return 1
  git config user.email "enjambre-nube-hf@starseed.local"; git config user.name "Enjambre StarSeed (nube-hf)"
  git fetch -q origin main && git reset -q --hard origin/main
  if [ ! -x node_modules/.bin/tsc ]; then
    log "npm ci"
    npm ci --no-audit --no-fund --loglevel=error >> "$LOG" 2>&1 || log "npm ci con avisos"
  fi
  bash scripts/enjambre/instalar.sh >> "$LOG" 2>&1 || true
  mkdir -p "$STARSEED_WT" starseed_memory_root/olas
}

# 3. La cola de la nube: la más reciente de enjambre/colas/cola-nube-*.json con
#    tareas que aún no figuran en main (por id en el mensaje de commit) ni en progreso.
cola_pendiente() {
  python3 - "$ROOT" <<'EOF'
import glob, json, os, subprocess, sys
root = sys.argv[1]
colas = sorted(glob.glob(os.path.join(root, "enjambre", "colas", "cola-nube-*.json")), key=os.path.getmtime, reverse=True)
prog = {}
try:
    p = json.load(open(os.path.join(root, "starseed_memory_root", "olas", "progreso.json")))
    prog = p.get("tareas") if isinstance(p.get("tareas"), dict) else p
except Exception:
    pass
hechos = subprocess.run(["git", "log", "--format=%s", "-500"], cwd=root, capture_output=True, text=True).stdout
for c in colas:
    try:
        tareas = json.load(open(c))
    except Exception:
        continue
    tareas = tareas if isinstance(tareas, list) else tareas.get("tareas") or []
    vivas = []
    for t in tareas:
        tid = t.get("id")
        e = prog.get(tid); e = e if isinstance(e, dict) else {"estado": e}
        if e.get("estado") in ("commit", "integrada", "sustituida", "descartada", "reasignada"):
            continue
        if ("%s:" % tid) in hechos and "salvavidas" not in hechos:
            continue
        vivas.append(tid)
    if vivas:
        print(c); sys.exit(0)
sys.exit(1)
EOF
}

escribir_env
preparar_repo || log "sin repo; reintento en el bucle"

# 4. Servidor HTTP de estado y bundles (mantiene el Space despierto y es la vía de vuelta).
python3 "$HOME/servidor.py" >> "$LOG" 2>&1 &

# 5. Bucle: una cola cada vez; entre colas, pull y espera.
while true; do
  cd "$ROOT" 2>/dev/null || { sleep 60; preparar_repo; continue; }
  git fetch -q origin main 2>/dev/null && git merge -q --ff-only origin/main 2>/dev/null || true
  if COLA=$(cola_pendiente); then
    log "arranco $(basename "$COLA") con $WORKERS trabajadores"
    set -a; . "$HOME/.starseed/env"; set +a
    python3 -u "$HOME/bin/starseed-enjambre.py" "$COLA" --workers "$WORKERS" >> "$LOG" 2>&1
    log "cola terminada: $(git log --oneline origin/main..main | wc -l) commit(s) por entregar"
  else
    sleep 120
  fi
done
