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

## Solución propuesta

Crear un archivo de configuración MCP propio y minimal para las llamadas de la flota, que incluya SOLO los servidores que el papel necesita.

### Configuración mínima actual (`~/.starseed/antigravity-config.json`)

```json
{
  "add_dirs": ["starseed_memory_root", "."],
  "memorias_metagenesis": [
    "relevo",
    "plan_de_pruebas",
    "registro_de_pruebas",
    "orquestacion-economica.md"
  ],
  "mcp_servidores": [],
  "cuenta_google_modo_lectura": true
}
```

### Configuración mínima para escritores del enjambre

```json
{
  "add_dirs": [".", "scripts/puente"],
  "memorias_metagenesis": [
    "orquestacion-economica.md"
  ],
  "mcp_servidores": [],
  "cuenta_google_modo_lectura": true
}
```

## Uso desde el script de flota

El script `scripts/puente/antigravity_flota.py` ya tiene soporte para cargar configuración desde `~/.starseed/antigravity-config.json` vía `cargar_config_agy()` y `guardar_config_agy()`.

Para pasar la configuración a cada llamada de `agy`, se puede usar:

```python
def orden_agy_con_mcp(modelo: str, worktree: str, prompt: str, config_path: str = None) -> list[str]:
    """Construye orden agy con configuración MCP específica."""
    orden = [
        "agy", "-p", prompt,
        "--model", modelo,
        "--mode", "accept-edits",
        "--sandbox",
        "--add-dir", worktree,
        "--output-format", "json"
    ]
    
    if config_path:
        orden.extend(["--mcp-config", config_path])
    
    return orden
```

## Acción pendiente para Alex

Para aplicar la configuración MCP mínima:

1. Editar `~/.gemini/antigravity/mcp_config.json` y quitar servidores no necesarios:
   - Eliminar: `gke-oss`, `alloydb-postgres`, `firebase-mcp-server`, `genkit-mcp-server`, `dart-mcp-server`
   - Mantener solo: `filesystem`, `git`, `memory` si son necesarios

2. Editar `antigravity-ide/mcp_config.json` con la misma configuración mínima

3. Si `agy` no admite `--mcp-config` por archivo, pasar la orden exacta para que Alex decida:

```bash
# Comando para usar configuración minimal
agy -p "..." --model gemini-3.8-flash-medium --mode accept-edits \
    --mcp-config ~/.starseed/antigravity-mcp-minimal.json
```

## Limpieza automática de go-build*

El script `escritor_agy.py` debe limpiar los directorios `go-build*` creados al finalizar cada llamada:

```python
import tempfile
import shutil
from pathlib import Path

def limpiar_go_builds():
    """Limpia directorios temporales de compilación Go."""
    temps_dir = Path(tempfile.gettempdir())
    for go_build in temps_dir.glob("go-build*"):
        try:
            shutil.rmtree(go_build)
        except Exception:
            pass
```

## Medida de tokens antes y después

Usar `scripts/puente/antigravity_flota.py medir-arranque <modelo>` para verificar:

- Antes: ~24,000 tokens de entrada base
- Después: objetivo < 10,000 tokens con MCP minimal

## Referencias

- Tarea: ALM1121B
- Documento causa: relevo del 21-11-21
- Archivos implicados:
  - `scripts/puente/antigravity_flota.py`
  - `scripts/puente/test_antigravity_flota.py`
  - `scripts/puente/guardia_recursos.py` (nuevo)