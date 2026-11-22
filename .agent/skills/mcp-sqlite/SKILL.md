---
name: mcp-sqlite
description: >
  Configura y prueba la conexión MCP sqlite de StarSeed OS y consulta bases sqlite locales desde una tarea.
  Úsala cuando una tarea necesite leer datos de una base sqlite local (estado, memoria o inventario) por MCP,
  cuando haya que registrar `starseed-director` en un IDE o agente, o cuando la conexión sqlite no responda
  o se sospeche que está sin conectar. Es solo lectura: nunca escribe en la base.
version: 1.0.0
---

# MCP sqlite · StarSeed OS

El servidor `scripts/puente/mcp_director.py` habla JSON-RPC 2.0 por stdio, sin dependencias.
Junto al Chat Director y a la dirección de producción, expone cuatro herramientas sqlite de
**solo lectura**. Se registra en los clientes con el nombre `starseed-director`.

## 1. Configurar

1. La base se elige con `STARSEED_SQLITE_RUTA` (por defecto `~/.starseed/mcp-sqlite/starseed.db`)
   y debe existir. El servidor la confina al repo, a `~/.starseed/mcp-sqlite/` o al directorio
   de la ruta fijada; cualquier otra ruta se rechaza.
2. Registro en los clientes (sin `--aplicar` solo muestra lo que cambiaría):

   ```bash
   python3 scripts/puente/instalar_director.py            # vista previa
   python3 scripts/puente/instalar_director.py --aplicar   # Claude Code, Codex, Hermes; muestra JSON para Antigravity y Cursor
   ```

3. El servidor lee `STARSEED_SQLITE_RUTA` del entorno del cliente MCP. En `opencode.json` la
   variable se escribe literal como `{env:STARSEED_SQLITE_RUTA}`; nunca pegues en la config
   claves, tokens ni rutas de otros equipos. Reinicia el cliente después de registrar el servidor.

## 2. Probar

```bash
python3 .agent/skills/mcp-sqlite/scripts/probar_conexion.py --temporal
python3 .agent/skills/mcp-sqlite/scripts/probar_conexion.py --ruta /ruta/a/base.sqlite
python3 -m unittest scripts.puente.test_mcp_director -q
```

`--temporal` crea una base desechable con una tabla `tarea`; sin esa opción se prueba la base
configurada. El probe lanza el servidor real por stdio e imprime un JSON con `ok` y los pasos
`initialize`, `tools/list`, `sqlite_estado`, `sqlite_tablas`, `sqlite_esquema`, `sqlite_consulta`,
`parametros` y `solo_lectura`. Con `ok: true` la conexión está lista; con `ok: false`, `detalle`
dice qué paso falló. Comprueba también que un `DELETE` sea rechazado.

## 3. Herramientas

| Herramienta | Argumentos | Devuelve |
|---|---|---|
| `sqlite_estado` | ninguno (usa la variable de entorno; ignora `ruta`) | `configurada`, `ruta`, `conectada`, `tablas` |
| `sqlite_tablas` | `ruta` opcional | nombres de tablas, sin las internas `sqlite_` |
| `sqlite_esquema` | `tabla` obligatoria, `ruta` opcional | sentencia `CREATE TABLE` |
| `sqlite_consulta` | `sql` (`SELECT`/`WITH`), `parametros` (lista), `limite` (1-200, por defecto 50), `ruta` opcional | `columnas`, `filas`, `truncada` |

## 4. Uso en una tarea

1. Llama a `sqlite_estado`. Si `configurada` o `conectada` es `false`, revisa la variable y el
   registro del cliente antes de seguir; no des la tarea por terminada.
2. Descubre con `sqlite_tablas` y `sqlite_esquema`: no supongas nombres de tablas ni columnas.
3. Consulta con `SELECT` o `WITH`, valores siempre en `parametros` (`?`) y `limite` bajo.
4. Cierra el informe con la ruta de la base, la consulta ejecutada y el número de filas leídas.
   Si hiciera falta escribir, se abre otra tarea: este MCP no tiene herramientas de escritura.

## Reglas

- La conexión se abre en `mode=ro`: no hay `INSERT`, `UPDATE`, `DELETE` ni `DROP`; toda consulta
  que no empiece por `SELECT` o `WITH` se rechaza.
- Nunca interpoles valores en el SQL: usa marcadores `?` y la lista `parametros`.
- No imprimas claves ni filas sensibles en el informe: quédate con columnas y recuentos.
- Si `conectada: false`, comprueba permisos de lectura y que el archivo exista; no intentes
  repararlo escribiendo desde la tarea ni matando procesos con `pkill -f`.
