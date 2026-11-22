---
name: mcp-postgres
description: Conectar y comprobar postgres desde el MCP del Chat Director de StarSeed OS (SELECT/CTE de solo lectura, credenciales solo por variable de entorno). Úsalo para consultar datos del OS en tareas sin duplicar la conexión.
---

# MCP postgres (StarSeed OS)

## La conexión es una sola entidad

La conexión se define UNA vez, en una variable de entorno; aquí solo se referencia por su nombre.
Nunca escribas la URL, la contraseña ni un project ref con credenciales en el repo, el chat, un log
ni un prompt. Nombres aceptados, en orden de preferencia:

1. `STARSEED_SUPABASE_DB_URL`
2. `SUPABASE_DB_URL`
3. `DATABASE_URL`
4. `POSTGRES_URL`
5. `POSTGRES_PRISMA_URL`

El código vive en `scripts/puente/mcp_director.py`; este documento no duplica su lógica.

## Herramientas

- `postgres_estado` — dice si hay conexión configurada y con qué **nombre** de variable.
- `postgres_probar` — ejecuta `SELECT 1` para comprobar la conexión en vivo.
- `postgres_consultar` — ejecuta una sola consulta `SELECT`/CTE, con `limite` (1-200).

Todas fuerzan `default_transaction_read_only=on` y `statement_timeout=8000` en la sesión.

## Cómo configurar la conexión

Define **una sola** de las variables de la lista anterior en tu entorno de sesión (por ejemplo
`export STARSEED_SUPABASE_DB_URL='…'` en el shell de la Mac, o el equivalente en el gestor de
secretos del IDE). No hace falta tocar `mcp_director.py` ni este skill: el MCP detecta la variable
al arrancar. Sin ella, `postgres_estado` responde `"configurado": false` y `postgres_probar`
nombra las variables que faltan. Nunca pongas el valor en `mcp.json`, en un archivo del repo ni en
un argumento de línea de comandos.

## Cómo probar la conexión

La prueba rápida recorre el protocolo completo (`initialize` → `tools/list` → `postgres_estado` →
`postgres_probar` → opcionalmente `postgres_consultar`) desde la raíz del repo:

```bash
python3 .agent/skills/mcp-postgres/scripts/probar.py
python3 .agent/skills/mcp-postgres/scripts/probar.py --sql 'SELECT slug FROM os_pages'
python3 .agent/skills/mcp-postgres/scripts/probar.py --simular
```

`--simular` comprueba el cableado con un `psql` falso y una URL de prueba: sirve cuando no hay
credenciales a mano, pero **no sustituye** a la prueba real con la variable definida. El script sale
con código 0 solo si el MCP responde, las tres herramientas existen y la conexión contesta.

La prueba manual es la misma por JSON-RPC 2.0 sobre stdio:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"postgres_estado","arguments":{}}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"postgres_probar","arguments":{}}}' \
  | python3 scripts/puente/mcp_director.py
```

`postgres_estado` debe responder `"configurado": true` y un nombre de variable; `postgres_probar`
debe responder `Conexión OK con <NOMBRE>`. Si no hay variable, el error dice cuál definir: copia la
URL de tu gestor de secretos local al entorno, nunca a un archivo del repo.

## Cómo consultar datos

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call",
 "params":{"name":"postgres_consultar",
           "arguments":{"sql":"SELECT slug, name FROM os_pages ORDER BY name","limite":20}}}
```

La consulta ha de ser una sola sentencia `SELECT`/CTE sin `;` ni comentarios; si no lleva `LIMIT`,
se añade automáticamente. La URL se reparte en variables libpq (`PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`) y jamás viaja por argumentos de línea de comandos:
`PGDATABASE` no interpreta URI (comprobado con `psql`), por eso hay que descomponerla. Si la URL
no trae `sslmode`, se usa `require` salvo en localhost. Cualquier aparecimiento del valor se tacha
en la salida y en los errores.

## Reglas

- Solo lectura: nada de `INSERT`, `UPDATE`, `DELETE`, `DDL` ni funciones que escriban.
- Un evento grueso por tarea: nada de sondeos en bucle; consulta puntual con tope de filas.
- No pegues filas con datos personales en el chat: trae solo las columnas necesarias.
- Si `psql` no está instalado o hay Timeout, se devuelve un error claro; no reintentar en bucle.
- Para el fallback de la app (Supabase/PostgREST) usa `src/utils/supabase/client.ts`, no este MCP.
