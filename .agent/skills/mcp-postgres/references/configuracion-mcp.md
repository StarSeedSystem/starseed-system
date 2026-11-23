# Registro del MCP y resolución de problemas

## Registro por stdio

El proceso es siempre el mismo; cambia solo el archivo de configuración del IDE:

- **OpenCode** (`~/.config/opencode/opencode.json`): entrada local bajo `mcp` con `command` apuntando a `python3` y `args` a la ruta absoluta de `scripts/puente/mcp_director.py`. Si la configuración necesita la variable, usa `{env:STARSEED_POSTGRES_URL}`; nunca el valor.
- **Claude Desktop / Cursor**: entrada bajo `mcpServers` con `command: "python3"`, `args: ["<raíz>/scripts/puente/mcp_director.py"]`. La variable se hereda del entorno del proceso; no hace falta repetirla en el JSON.

Tras registrar, reinicia el cliente y pide `tools/list`: debe aparecer `starseed-director` con las herramientas `director_*` y, si hay DSN, las cuatro `postgres_*`.

## Cargar la variable sin filtrarla

```bash
set -a; . ~/.starseed/env; set +a
python3 -m pytest scripts/puente/test_mcp_postgres.py -q
python3 .agent/skills/mcp-postgres/scripts/verificar_conexion.py
```

`~/.starseed/env` tiene permisos 600 y no se versiona. No lo imprimas en un log ni lo pegues en un chat.

## Fallos frecuentes

| Síntoma | Causa | Acción |
|---|---|---|
| `postgres_*` no aparecen en `tools/list` | `STARSEED_POSTGRES_URL` vacía en el proceso del IDE | exporta en `~/.starseed/env` y reinicia el IDE |
| `instala psycopg (o psycopg2)` | falta el controlador en el entorno del MCP | `python3 -m pip install 'psycopg[binary]'` |
| `PostgreSQL no está configurado: define STARSEED_POSTGRES_URL` | helper sin variable | cargar el archivo de entorno |
| `Error: …` con `[REDACTED]` | fallo de red, autenticación o TLS | leer el motivo saneado; la URL no está en el mensaje |
| `herramienta desconocida` al llamar una `postgres_*` | cliente iniciado con el DSN vacío | reiniciar el cliente tras exportar la variable |
| Consulta rechazada «de solo lectura» | `;`, DDL tras comentario o palabra bloqueada | reescribir como `SELECT`/`WITH` de una sentencia |

El `host` que muestra `postgres_estado` sale del `hostname` de la URL y es seguro registrarlo. El resto de la URL nunca.
