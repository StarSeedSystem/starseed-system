---
name: mcp-postgres
description: Configura y prueba la conexión PostgreSQL del servidor MCP del Chat Director (STARSEED_POSTGRES_URL) y consulta tablas del OS en tareas con herramientas de solo lectura, sin exponer credenciales.
---

# MCP PostgreSQL · StarSeed OS

## Qué conecta

El servidor MCP `starseed-director` (`scripts/puente/mcp_director.py`, JSON-RPC 2.0 por stdio) añade cuatro herramientas `postgres_*` cuando hay una conexión configurada. Sirven para inspeccionar los datos del OS (tablas `os_*`) desde cualquier tarea, por el mismo canal MCP del Chat Director, sin salir del IDE.

## 1. Configurar

1. Define `STARSEED_POSTGRES_URL` en el archivo de entorno del equipo (`~/.starseed/env`). En la nube llega como secreto del repositorio y el workflow lo escribe en ese mismo archivo. El valor nunca se escribe en el repo, en un prompt, en un issue, en un log ni en el bus de eventos: aquí solo aparece el **nombre** de la variable.
2. Instala el controlador en el entorno que lanza el MCP: `python3 -m pip install 'psycopg[binary]'` (o `psycopg2`). Sin controlador, `postgres_estado` devuelve `controlador: null` y toda consulta explica qué falta.
3. Registra `python3 <raíz-del-repo>/scripts/puente/mcp_director.py` como servidor local por stdio en el IDE. Si la configuración pide la variable, usa siempre la sintaxis literal `{env:STARSEED_POSTGRES_URL}`, nunca el valor. Detalles por IDE: `references/configuracion-mcp.md`.
4. Reinicia el cliente MCP y comprueba `tools/list`: las `postgres_*` aparecen **solo** cuando la variable no está vacía. Sin ella el MCP expone únicamente las herramientas del Chat Director y llamar a una `postgres_*` devuelve el error `-32602`.

## 2. Probar

| Prueba | Orden | Esperado |
|---|---|---|
| Hermética (sin red ni credenciales) | `python3 -m pytest scripts/puente/test_mcp_postgres.py -q` | `16 passed` |
| Sin regresión del Director | `python3 -m pytest scripts/puente/test_mcp_director.py -q` | `24 passed` |
| Helper del skill (lee `~/.starseed/env` si hace falta) | `python3 .agent/skills/mcp-postgres/scripts/verificar_conexion.py` | estado saneado y «Conexión PostgreSQL correcta en <host>», salida 0 |
| En el IDE, contra la base real | `tools/call` → `postgres_probar` | el mismo mensaje; si falla, motivo saneado, nunca la URL |

El helper no imprime la URL: muestra solo `configurada`, `variable`, `host`, `controlador` y `modo`. Sale con 2 si falta la variable y con 1 si la conexión falla.

## 3. Herramientas

| Herramienta | Argumentos | Resultado |
|---|---|---|
| `postgres_estado` | ninguno | JSON con `configurada`, `variable`, `host`, `controlador`, `modo` (`solo-lectura`). Nunca devuelve la URL. |
| `postgres_probar` | ninguno | Ejecuta `SELECT 1 AS ok` con transacción de solo lectura y `rollback`; confirma host y controlador. |
| `postgres_tablas` | `esquema` (por defecto `public`, solo `^[A-Za-z_]\w*$`), `limite` (1-200, por defecto 20) | `esquema.tabla` de `information_schema.tables`. |
| `postgres_consulta` | `sql` (obligatorio), `limite` (1-200, por defecto 20) | JSON con `columnas`, `filas` y `limitada`. |

Llamada por stdio (una petición JSON por línea; antes conviene enviar `initialize`):

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"postgres_consulta","arguments":{"sql":"SELECT id, slug, name FROM os_pages ORDER BY name","limite":20}}}
```

La respuesta llega en `result.content[0].text`; si algo falla, `result.isError` es `true` y el texto empieza por `Error:`. Los errores se recortan a 500 caracteres y cualquier aparición de la URL se sustituye por `[REDACTED]`.

## 4. Reglas de uso en tareas

- Solo `SELECT`/`WITH` de una sola sentencia. Se rechazan escrituras (`INSERT`, `UPDATE`, `DELETE`, DDL), palabras como `INTO`, los `;` intermedios y lo que quede tras comentarios `/* */` o `--`. La conexión se abre con `connect_timeout=5`, se marca de solo lectura cuando el controlador lo permite, ejecuta `SET TRANSACTION READ ONLY` y siempre termina en `rollback` y `close`: esta puerta no puede modificar datos.
- Contenido = entidad única (área social): una publicación vive en una fila de `os_posts` con su `id`; al compartirla se referencia ese `id`/`slug`, no se duplica el cuerpo en otra fila.
- Filtra por `entity_slug`, `author_id` o rango de fechas antes de ordenar y usa `limite` bajo (20 por defecto): las tablas del feed pueden crecer mucho.
- Si el controlador falta o la variable no está definida, no improvises otra conexión: sigue la configuración y avisa por el canal del Chat Director.
- Textos, avisos y mensajes de error en español con acentos; nunca valores de credenciales en código, documentos ni logs.
