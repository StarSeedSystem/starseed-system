#!/usr/bin/env bash
# ============================================================================
# PUBLICAR OLA 3 (Adenda 155) — Astraura 1.58-bit como sistema primario del OS
# ----------------------------------------------------------------------------
# Deja el OS OFICIAL actualizado: verifica, commitea y publica los dos repos.
# Vercel redespliega solo al recibir `main` en StarSeedSystem/starseed-system.
#
#   bash publicar-ola3.sh            → verifica, commitea y PUBLICA (push)
#   bash publicar-ola3.sh --dry-run  → solo enseña qué haría (no toca nada)
#
# Rutas por defecto (cámbialas con OS_DIR / IA_DIR si mueves las carpetas).
# ============================================================================
set -uo pipefail

OS_DIR="${OS_DIR:-$HOME/Documents/starseed-os-main}"
IA_DIR="${IA_DIR:-$HOME/Documents/IA 1.58 bit}"
DRY=""; [ "${1:-}" = "--dry-run" ] && DRY="echo [dry-run]"

say() { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m  ! %s\033[0m\n" "$*"; }

# ── 1 · Motor BitNet: guarda del parche ReLU² y recompilación ───────────────
say "1/5 · Motor BitNet nativo (parche ReLU² y binarios)"
if [ -d "$IA_DIR/backend/BitNet" ]; then
  bash "$IA_DIR/backend/scripts/check_bitnet_patch.sh" || {
    warn "Falta el parche ReLU²: el modelo 2B-4T degeneraría (PPL 40.9 vs 5.38). Abortando."; exit 1; }
  if [ ! -x "$IA_DIR/backend/BitNet/build/bin/llama-server" ]; then
    warn "No hay llama-server compilado; se compila ahora (puede tardar)."
    $DRY cmake --build "$IA_DIR/backend/BitNet/build" --target llama-server llama-cli -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
  else
    warn "Recompila tras el parche para que el binario lleve ReLU²:"
    $DRY cmake --build "$IA_DIR/backend/BitNet/build" --target llama-server llama-cli -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
  fi
else
  warn "Sin submódulo BitNet en $IA_DIR/backend — se salta la compilación."
fi

# ── 2 · Verificación funcional real del backend (si está vivo) ──────────────
say "2/5 · Verificación funcional real (backend en 127.0.0.1:8000)"
if curl -fsS -m 5 http://127.0.0.1:8000/api/status >/dev/null 2>&1; then
  ( cd "$IA_DIR/backend" && $DRY python3 scripts/verify_real_ola3.py ) || warn "La verificación no pasó del todo: revísala antes de publicar."
else
  warn "El backend no responde: arráncalo (uvicorn app.main:app --port 8000) y repite para verificar en real."
fi

# ── 3 · Puertas del OS ─────────────────────────────────────────────────────
say "3/5 · Puertas del OS (tsc · tests · build)"
( cd "$OS_DIR" && $DRY npx tsc --noEmit -p . && $DRY npx vitest run && $DRY npx next build ) || {
  warn "Alguna puerta falló: NO se publica."; exit 1; }

# ── 4 · Commit y push del backend soberano ─────────────────────────────────
say "4/5 · Repo Astraura 1.58 (StarSeedSystem/astraura)"
( cd "$IA_DIR" \
  && $DRY git add -A backend/app backend/scripts scripts frontend/src README.md Dockerfile .gitignore \
       backend/BitNet/3rdparty/llama.cpp/src/models/bitnet.cpp backend/BitNet/include \
  && $DRY git commit -m "feat(ola3): motor BitNet nativo real + puente StarSeed 1.1.0

- Parche CRITICO ReLU^2 en llama.cpp (bitnet-b1.58 usa relu2, no SiLU): PPL 40.9 -> 5.38
- llama-server gestionado en dos perfiles (interactivo / fondo con nice) sobre el mismo GGUF i2_s
- Plantilla de chat oficial + pre-tokenizer llama-bpe + presupuesto de contexto honesto
- Puente /api/starseed: eventos con reparto justo por proceso, unread_count, procesos normalizados,
  disparo de imaginacion NO bloqueante (la rama llega por eventos)
- cognition: prioridad de turno y timeouts adaptativos a la velocidad medida
- scripts: check_bitnet_patch.sh, verify_real_ola3.py (11/11 PASS en real), repack_i2s_gguf.py" \
  && $DRY git push origin HEAD ) || warn "Revisa el commit/push del backend."

# ── 5 · Commit y push del OS (esto dispara el deploy de Vercel) ─────────────
say "5/5 · Repo StarSeed OS (StarSeedSystem/starseed-system) → deploy"
( cd "$OS_DIR" \
  && $DRY git add -A src architecture memory supabase CLAUDE.md next.config.ts starseed_memory_root \
  && $DRY git commit -m "feat(adenda-155): Astraura 1.58-bit como sistema primario del OS (Ola 3)

- Studio 1.58 completo (13 pestañas s158/*) sobre los endpoints reales del backend soberano
- Siembra de las 10 personalidades (p158-*) y de los agentes (agent158-*) con su primario fijado
- Feed de eventos -> centro de notificaciones del OS (ack, deep-links, tira en Trinity)
- Tarjetas: procesos autonomos 1.58 (config de personalidad) y backend 1.58 (neuronas)
- Modal Ver proceso: ramificacion y agentes 1.58
- Catalogos propios: spec local del motor 1.58, integracion registrada, listado publico y comandos
- Docs y memorias: SOP 14.5-14.7, state.md, current-status, memory root (logs/tareas/skills/memory)
- Verificado en real: 11/11 PASS con el modelo cargado; tsc 0, vitest 90/90, next build OK" \
  && $DRY git push origin HEAD ) || warn "Revisa el commit/push del OS."

say "Listo. Vercel redespliega solo desde main: https://starseed-os.vercel.app"
echo "   Si el push va a otra rama, abre el PR y haz merge a main para que se publique."
