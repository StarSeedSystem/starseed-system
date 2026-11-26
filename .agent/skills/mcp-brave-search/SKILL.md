---
name: mcp-brave-search
description: Configurar y probar la conexión MCP brave-search de StarSeed OS para buscar en la web desde una tarea. Úsala cuando una tarea necesite buscar información actual en la web por MCP, cuando haya que registrar `starseed-director` en un IDE o agente, o cuando la conexión brave-search no responda. Es solo lectura: nunca revela la clave.
---

# MCP brave-search · StarSeed OS

El servidor `scripts/puente/mcp_director.py` habla JSON-RPC 2.0 por stdio, sin dependencias.
Junto al Chat Director y a la dirección de producción, expone tres herramientas brave-search de
**solo lectura**. Se registra en los clientes con el nombre `starseed-director`.

## 1. Configurar

1. La clave se elige de `BRAVE_API_KEY` o `BRAVE_SEARCH_API_KEY` (en ese orden de preferencia)
   y **solo viaja en la cabecera `X-Subscription-Token`**; su valor nunca se escribe en el repo,
   se pasa por argv ni se devuelve en un mensaje. El endpoint se puede inyectar con
   `STARSEED_BRAVE_URL` (útil para probar con un servidor local).

2. Registro en los clientes (sin `--aplicar` solo muestra lo que cambiaría):

   ```bash
   python3 scripts/puente/instalar_director.py            # vista previa
   python3 scripts/puente/instalar_director.py --aplicar   # Claude Code, Codex, Hermes; muestra JSON para Antigravity y Cursor
   ```

3. El servidor lee la variable de entorno del cliente MCP. En `opencode.json` la variable se
   escribe literal como `{env:BRAVE_API_KEY}`; nunca pegues en la config claves, tokens ni rutas
   de otros equipos. Reinicia el cliente después de registrar el servidor.

## 2. Probar

```bash
python3 .agent/skills/mcp-brave-search/scripts/probar.py --simular
python3 .agent/skills/mcp-brave-search/scripts/probar.py --q "StarSeed OS"
python3 -m unittest scripts.puente.test_mcp_director.PruebasBrave -v
```

`--simular` levanta un servidor HTTP falso que responde como Brave Search; comprueba el cableado
completo (`initialize` → `tools/list` → `brave_estado` → `brave_probar` → opcionalmente
`brave_buscar`) sin necesidad de credenciales reales. El script sale con código 0 solo si el MCP
responde, las tres herramientas existen y la conexión contesta. **No sustituye** a la prueba real
con la variable definida.

La prueba manual es la misma por JSON-RPC 2.0 sobre stdio:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"brave_estado","arguments":{}}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"brave_probar","arguments":{}}}' \
  | python3 scripts/puente/mcp_director.py
```

`brave_estado` debe responder `"configurada": true` y un nombre de variable; `brave_probar`
debe responder `Conexión OK con <NOMBRE>`. Si no hay variable, el error dice cuál definir: copia
la clave de tu gestor de secretos local al entorno, nunca a un archivo del repo.

## 3. Herramientas

| Herramienta | Argumentos | Devuelve |
|---|---|---|
| `brave_estado` | ninguno | `configurada`, `variable`, `endpoint`, `modo` |
| `brave_probar` | ninguno | mensaje `Conexión OK con <VARIABLE>: N resultado(s)…` |
| `brave_buscar` | `q` (obligatorio, ≤400), `limite` (1-20, por defecto 5), `pais` (ISO-2 opcional) | JSON con `titulo`, `url`, `descripcion` (sin HTML) |

## 4. Uso en una tarea

1. Llama a `brave_estado`. Si `configurada` es `false`, revisa la variable y el registro del
   cliente antes de seguir; no des la tarea por terminada.
2. Usa `brave_probar` para verificar que la clave funciona contra la API real.
3. Busca con `brave_buscar`: `q` es la consulta, `limite` controla cuántos resultados,
   `pais` regionaliza (p. ej. `ES`, `US`). La descripción viene limpia de etiquetas HTML.
4. Cierra el informe con la consulta ejecutada, el número de resultados y las URLs relevantes.
   No imprimas la clave ni la cabecera de autenticación en el chat.

## Reglas

- Solo lectura: la clave nunca sale en la URL, argv, logs ni respuestas; solo en la cabecera
  `X-Subscription-Token`.
- Un evento grueso por tarea: nada de sondeos en bucle; búsqueda puntual con tope de resultados.
- No pegues claves ni respuestas crudas con la cabecera en el chat: quédate con título, URL y
  descripción.
- Si la API devuelve 401/403, la clave es inválida; si 429, se agotó la cuota: espera o usa
  otra fuente. El error nunca revela la clave.
- Para búsquedas desde la app (no MCP) usa el proveedor correspondiente, no este MCP.