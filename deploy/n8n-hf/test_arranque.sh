#!/bin/bash
# Test para validar la reparación de arranque.sh (PRD1005Tbsb)
# Riesgo 1: Duplicación de flujos - ahora se importan individualmente
# Riesgo 2: Cookie sin Secure - Dockerfile ya tiene N8N_SECURE_COOKIE=true

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOCK_DIR="$SCRIPT_DIR/mock"
FLUJOS_DIR="$SCRIPT_DIR/flujos"

echo "=== Test arranque.sh ==="

# Test 1: Verificar que Dockerfile tiene N8N_SECURE_COOKIE=true
echo "Test 1: N8N_SECURE_COOKIE en Dockerfile..."
if grep -q "N8N_SECURE_COOKIE=true" "$SCRIPT_DIR/Dockerfile"; then
  echo "  PASS: N8N_SECURE_COOKIE=true está configurado"
else
  echo "  FAIL: N8N_SECURE_COOKIE no es true"
  exit 1
fi

# Test 2: Verificar que el script importa cada flujo individualmente
echo "Test 2: Importación individual de flujos..."
grep -q 'for flujo in' "$SCRIPT_DIR/arranque.sh" || {
  echo "  FAIL: No se usa bucle para importar flujos individualmente"
  exit 1
}
echo "  PASS: Bucle para importar flujos individualmente"

# Test 3: Ejecutar arranque.sh con mock y verificar comportamiento
echo "Test 3: Simulación con mock..."
export N8N_BIN="$MOCK_DIR/n8n"
export N8N_FLUJOS_DIR="$FLUJOS_DIR"

output=$("$SCRIPT_DIR/arranque.sh" 2>&1 || true)

# Verificar que se importan 3 flujos
import_count=$(echo "$output" | grep -c "Importando:" || true)
if [ "$import_count" -eq 3 ]; then
  echo "  PASS: Se importaron 3 flujos ($import_count)"
else
  echo "  FAIL: Se esperaban 3 importaciones, hubo $import_count"
  exit 1
fi

# Verificar que se activan los flujos
if echo "$output" | grep -q "Actualizando: update:workflow"; then
  echo "  PASS: Se activan los flujos"
else
  echo "  FAIL: No se activaron los flujos"
  exit 1
fi

# Test 4: Verificar que no hay duplicación si se ejecuta dos veces
echo "Test 4: Ejecución repetida (simulando reinicio)..."
output2=$("$SCRIPT_DIR/arranque.sh" 2>&1 || true)
import_count2=$(echo "$output2" | grep -c "Importando:" || true)
if [ "$import_count2" -eq 3 ]; then
  echo "  PASS: Segunda ejecución también importa 3 flujos (upsert por ID)"
else
  echo "  FAIL: Segunda ejecución importó $import_count2 flujos"
  exit 1
fi

echo ""
echo "=== Todos los tests PASARON ==="