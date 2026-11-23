# Configuración MCP mínima para llamadas de Antigravity

**Fecha:** 2026-11-21 (GEM1119)

## Problema identificado

El MCP `gke-oss` se compila en cada llamada de Antigravity:

```bash
go run github.com/GoogleCloudPlatform/gke-mcp@latest
```

Esto genera ~1 GB en la carpeta temporal (`go-build*`) y si la llamada se corta por tiempo, el resto se queda en disco. Además, se cargan diez servidores MCP innecesarios:

- Kubernetes
- AlloyDB
- Dart
- Firebase
- Genkit
- gke-oss (el que causa el problema)

Estos no se usan por el enjambre y inflan los ~24,000 tokens de entrada medidos por llamada.

## Solución implementada

**`scripts/puente/antigravity_flota.py`** ahora incluye:

### 1. Configuración MCP mínima por defecto

```json
{
  "mcpServers": {
    "starseed-director": {
      "command": "python3",
      "args": ["scripts/puente/mcp_director.py"]
    }
  }
}
```

Para el director (papel `director_presidente`). Para otros papeles, se genera config vacía.

### 2. Generar configuración MCP mínima

```bash
python3 scripts/puente/antigravity_flota.py mcp --generar
# Genera ~/.starseed/antigravity-mcp-minimal.json
```

### 3. Limpiar go-build* temporales

```bash
python3 scripts/puente/antigravity_flota.py limpiar-go-build
```

### 4. Comparar tokens con/sin MCP

```bash
python3 scripts/puente/antigravity_flota.py comparar-tokens gemini-3.8-flash-medium
```

### 5. Metas y recomendaciones

```bash
python3 scripts/puente/antigravity_flota.py metas
```

Muestra:
- Orden para Alex si agy no admite `--mcp-config`
- Ordenes para deshabilitar Java en worktrees
- Carpetas volátiles para excluir de Drive
- Verificación de `.metadata_never_index` (Spotlight)

## Uso desde el script de flota

### Función `mcp_configuraion_minima(papeles_necesarios)`

 genera configuración MCP con SOLO los servidores estrictamente necesarios.

### Función `orden_agy_con_mcp()`

Construye orden agy con configuración MCP específica:

```python
def orden_agy_con_mcp(
    prompt: str,
    modelo: str,
    mcp_config_path: Path | None = None,
    modo: str = "plan",
    timeout_s: int = 180,
    add_dirs: list[str] | None = None,
) -> list[str]:
```

### Función `comparar_tokens_mcp()`

Mide tokens reales con y sin MCP mínimo:

```python
def comparar_tokens_mcp(modelo: str = "gemini-3.8-flash-low") -> dict:
    """Compara tokens de entrada con y sin MCP mínimo."""
```

## Acción pendiente para Alex

### 1. Editar configuraciones MCP existentes

Editar `~/.gemini/antigravity/mcp_config.json` y quitar servidores no necesarios:

```bash
# Comando para usar configuración minimal
STARSEED_MCP_CONFIG=~/.starseed/antigravity-mcp-minimal.json \
  agy -p "..." --model gemini-3.8-flash-medium --mode plan \
  --print-timeout 60s --output-format json
```

**SI** `agy` no admite `--mcp-config`, usar la variable de entorno `STARSEED_MCP_CONFIG`.

### 2. Deshabilitar Java en worktrees del enjambre

El script `escritor_agy.py` no toca configuración personal de Alex. Para evitar que
Antigravity IDE arranque 5 procesos Java por worktree:

```bash
mkdir -p <worktree>/.vscode && \
echo '{"java": {"enabled": false}}' > <worktree>/.vscode/settings.json
```

### 3. Carpetas volátiles de starseed_memory_root

Ver `generar_lista_carpetas_volatiles()` en el script. Sugerencia: instantánea diaria
comprimida en lugar de copia continua de:

- `starseed_memory_root/.tmp.driveupload` (2,6 GB de 2 191 trozos)
- `starseed_memory_root/chat.jsonl`
- `starseed_memory_root/progreso.json`

### 4. Spotlight indexing en worktrees

Crear `.metadata_never_index` en:

```bash
# En cada worktree del enjambre
touch <worktree>/.metadata_never_index

# En directorios temporales go-build*
touch /tmp/go-build*/.metadata_never_index
```

## Medida de tokens

**Antes (con MCPs innecesarios):** ~24,000 tokens de entrada base
**Después (con MCP mínimo):** objetivo < 10,000 tokens

Ver `scripts/puente/MCP_CONFIG_MINIMA.md` o ejecutar:
```bash
python3 scripts/puente/antigravity_flota.py comparar-tokens
```

## Referencias

- Tarea: ALM1121B
- Documento causa: relevo del 21-11-21
- Archivos implicados:
  - `scripts/puente/antigravity_flota.py`
  - `scripts/puente/test_antigravity_flota.py`
  - `scripts/puente/guardia_recursos.py`
  - `scripts/puente/escritor_agy.py`