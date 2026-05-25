#!/bin/bash
# =====================================================================
# StarSeed OS — Script de Integración Unificada para Qwen Code (Agent)
# =====================================================================
# Este script permite invocar a Qwen Code de manera no interactiva,
# asegurando la sincronización de la memoria universal (CLAUDE.md y memory/)
# y delegando tareas de código y arquitectura al agente de terminal.

# 1. Cargar NVM y entorno Node.js
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
    nvm use v20.20.2 >/dev/null 2>&1
else
    echo "⚠️ NVM no encontrado en $NVM_DIR. Intentando ejecutar directamente..."
fi

# 2. Configurar variables de entorno y API Keys
export DASHSCOPE_API_KEY="${DASHSCOPE_API_KEY:-sk-6473637216fb4c85a2f3444c2f2aa816}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-sk-6473637216fb4c85a2f3444c2f2aa816}"

# 3. Instrucción del Sistema de Memoria Unificada (Universal Memory Protocol)
SYSTEM_INSTRUCTION="Eres parte de un equipo unificado de desarrollo de IA para StarSeed OS (SOSD).
Tu memoria y contexto provienen del sistema de memoria persistente del repositorio.
Antes de realizar cualquier cambio o análisis, DEBES leer obligatoriamente:
- El archivo raíz 'CLAUDE.md' (para entender la memoria de trabajo y el estado actual).
- La bitácora en 'memory/state.md' (para ver los últimos cambios y pendientes).
- Las decisiones arquitectónicas en 'memory/architecture.md'.
- Los principios en 'memory/principles.md'.

Al completar tu tarea de desarrollo, DEBES actualizar:
- El estado actual en 'CLAUDE.md' (para registrar avances y nuevos pendientes).
- Añadir una nueva entrada cronológica al final de 'memory/state.md' resumiendo detalladamente lo que hiciste, con formato estándar de la bitácora."

# 4. Ejecutar Qwen Code en modo agente automatizado (YOLO)
# Reenvía todos los argumentos pasados al script
qwen \
  --approval-mode yolo \
  --append-system-prompt "$SYSTEM_INSTRUCTION" \
  "$@"
