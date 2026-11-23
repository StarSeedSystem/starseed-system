---
name: mcp-brave-search
description: >
  Configura y prueba la conexión brave-search del MCP del Chat Director de StarSeed OS y busca en la
  web desde una tarea (título, URL y descripción). Úsala cuando una tarea necesite información actual
  de internet, cuando haya que registrar la clave de Brave en un IDE o agente, o cuando la conexión
  brave falle o se sospeche que no está configurada.
version: 1.0.0
---

# MCP brave-search · StarSeed OS

El servidor `scripts/puente/mcp_director.py` habla JSON-RPC 2.0 por stdio, sin dependencias. Junto
al Chat Director, la producción, sqlite y postgres, expone tres herramientas **brave-search**. Se
registra en los clientes con el nombre `starseed-director`.

## 1. La conexión es una sola entidad

La clave se define UNA vez, en una variable de entorno; aquí solo se referencia por su **nombre**.
Nunca escribas la clave en el repo, el chat, un log, un prompt ni un argumento de línea de comandos.
Nombres aceptados, en orden de preferencia:

1. `BRAVE_API_KEY`
2. `BRAVE_SEARCH_API_KEY`

El endpoint por defecto es `https://api.search.brave.com/res/v1/web/search`. Solo para pruebas
locales se puede inyectar `STARSEED_BRAVE_ENDPOINT`; en producción no se define.

## 2. Configurar

1. Copia la clave desde el panel de Brave Search API (`https://api.search.brave.com/app/keys`) a tu
   gestor de secretos local y expórtala en el entorno del cliente MCP:

   ```bash
   export BRAVE_API_KEY='…'
   ```

2. El servidor ya se registra con `python3 scripts/puente/instalar_director.py --aplicar`. En la
   configuración de cada cliente (`opencode.json`, `mcp.json`, etc.) la variable se escribe literal
   como `{env:BRAVE_API_KEY}`: nunca pegues el valor. Reinicia el cliente tras registrarlo.
3. Sin la variable, `brave_estado` responde `"configurada": false` y nombra las variables que faltan.

## 3. Probar

La sonda recorre el protocolo completo (`initialize` → `tools/list` → `brave_estado` → `brave_probar`
→ opcionalmente `brave_buscar`) desde la raíz del repo:

```bash
python3 .agent/skills/mcp-brave-search/scripts/probar.py
python3 .agent/skills/mcp-brave-search/scripts/probar.py --consulta 'StarSeed OS'
python3 .agent/skills/mcp-brave-search/scripts/probar.py --simular
```

`--simular` levanta un servidor HTTP local con una clave de prueba y apunta el MCP a él: comprueba
el cableado, la cabecera y la redacción de la clave **sin gastar cuota**. No sustituye a la prueba
real con `BRAVE_API_KEY` definida. El script sale con código 0 solo si el MCP responde, las tres
herramientas existen y la conexión contesta.

La prueba manual es la misma por JSON-RPC 2.0 sobre stdio:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"brave_estado","arguments":{}}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"brave_probar","arguments":{}}}' \
  | python3 scripts/puente/mcp_director.py
```

`brave_probar` debe responder `Conexión OK con BRAVE_API_KEY`. Si no hay variable, el error dice
cuál definir: copia la clave de tu gestor de secretos al entorno, nunca a un archivo del repo.

## 4. Herramientas

| Herramienta | Argumentos | Devuelve |
|---|---|---|
| `brave_estado` | ninguno | `configurada`, `variable`, `variables_aceptadas`, `modo`, `endpoint` |
| `brave_probar` | ninguno | texto `Conexión OK con <NOMBRE>: N resultados` |
| `brave_buscar` | `consulta` (obligatoria), `cuenta` (1-20, por defecto 5), `pais` (ISO-2), `idioma` (ISO-2), `frescura` (`pd`/`pw`/`pm`/`py`), `safesearch` (`off`/`moderate`/`strict`) | JSON con `consulta` y `resultados` (`titulo`, `url`, `descripcion`) |

Ejemplo de búsqueda:

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call",
 "params":{"name":"brave_buscar",
           "arguments":{"consulta":"noticias de StarSeed OS","cuenta":5,"idioma":"es",
                        "frescura":"pw","safesearch":"moderate"}}}
```

## 5. Uso en una tarea

1. Llama a `brave_estado`. Si `configurada` es `false`, revisa la variable y el registro del cliente
   antes de seguir; no des la tarea por terminada.
2. Usa `brave_buscar` con una consulta concreta y `cuenta` baja: la cuota del plan gratuito es
   limitada y se mide por consulta.
3. Cita en el informe la URL y la fecha de consulta; no pegues descripciones largas ni datos
   personales. Quédate con lo que responde a la pregunta.

## Reglas

- Solo consulta: este MCP no escribe, no publica ni envía nada por ti.
- La clave viaja solo en la cabecera `X-Subscription-Token`; cualquier aparición del valor en una
  salida o error se tacha como `***`.
- Ante `401` no insistas: corrige la variable. Ante `429` no reintentes en bucle: espera o releva.
- Un evento grueso por tarea: nada de sondeos periódicos.
- Para datos internos del OS usa sqlite o postgres; para la web, esta conexión.
