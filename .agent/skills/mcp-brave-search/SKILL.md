---
name: mcp-brave-search
description: >
  Configura y prueba la conexión MCP brave-search de StarSeed OS y busca en la web desde una tarea.
  Úsala cuando una tarea necesite resultados web actuales (documentación, noticias, precios, estado de
  un servicio), cuando haya que comprobar que `brave_buscar` responde, o cuando la búsqueda falle por
  clave ausente, 401 o 429. La clave vive solo en una variable de entorno; nunca en el repo ni en el chat.
version: 1.0.0
---

# MCP brave-search · StarSeed OS

El servidor `scripts/puente/mcp_director.py` habla JSON-RPC 2.0 por stdio, sin dependencias.
Junto al Chat Director, la producción, sqlite y postgres, expone tres herramientas brave-search de
**solo lectura**. Se registra en los clientes con el nombre `starseed-director`.

## 1. Configurar

La conexión se define UNA vez, en una variable de entorno; aquí solo se referencia por su nombre.
Nunca escribas la clave en el repo, en un `mcp.json`, en un log ni en un prompt. Nombres aceptados,
en orden de preferencia:

1. `BRAVE_API_KEY`
2. `BRAVE_SEARCH_API_KEY`

```bash
export BRAVE_API_KEY='…'   # en el shell de la Mac o en el gestor de secretos del IDE
```

El MCP detecta la variable al arrancar. En `opencode.json` se escribe literal `{env:BRAVE_API_KEY}`;
en Claude Code, Codex o Hermes se registra con:

```bash
python3 scripts/puente/instalar_director.py            # vista previa
python3 scripts/puente/instalar_director.py --aplicar   # registra starseed-director
```

Reinicia el cliente después de registrar el servidor o de definir la variable.

## 2. Probar

```bash
python3 .agent/skills/mcp-brave-search/scripts/probar.py --simular
python3 .agent/skills/mcp-brave-search/scripts/probar.py
python3 .agent/skills/mcp-brave-search/scripts/probar.py --buscar "star seed os"
python3 -m unittest scripts.puente.test_mcp_director -q
```

`--simular` sustituye `urlopen` y comprueba el cableado completo (initialize → tools/list →
`brave_estado` → `brave_probar` → `brave_buscar`) sin red ni clave real. Sin `--simular` lanza el
servidor real por stdio y consulta Brave en vivo; el script sale con 0 solo si las tres herramientas
existen, `brave_estado` ve la variable y `brave_probar` responde «Conexión OK». `--buscar` añade una
búsqueda real y muestra sus resultados.

La prueba manual es la misma por JSON-RPC 2.0 sobre stdio:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"brave_estado","arguments":{}}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"brave_probar","arguments":{}}}' \
  | python3 scripts/puente/mcp_director.py
```

`brave_estado` debe responder `"configurado": true` y el NOMBRE de la variable; `brave_probar`,
`Conexión OK con <NOMBRE>`. Sin variable, el error dice cuál definir.

## 3. Herramientas

| Herramienta | Argumentos | Devuelve |
|---|---|---|
| `brave_estado` | ninguno | `configurado`, `variable`, `modo`, `endpoint`, `variables_aceptadas` |
| `brave_probar` | ninguno | comprobación en vivo con una búsqueda mínima de 3 resultados |
| `brave_buscar` | `q` obligatoria; `count` (1-20, por defecto 5), `country` (ISO de 2 letras), `lang` (p. ej. `es`), `freshness` (`pd`/`pw`/`pm`/`py` o `AAAA-MM-DDtoAAAA-MM-DD`) | título, URL y resumen de cada resultado |

La consulta se normaliza (espacios colapsados) y admite hasta 400 caracteres. El endpoint es
`https://api.search.brave.com/res/v1/web/search`; la clave viaja solo en la cabecera
`X-Subscription-Token` y, si apareciera en una salida o en un error, se tacha con `***`.

## 4. Uso en una tarea

1. Llama a `brave_estado`. Si `configurado` es `false`, define la variable y reinicia el cliente;
   no des la tarea por terminada sin conexión.
2. Busca con `brave_buscar`: pon una consulta concreta, `count` bajo (3-5) y, si importa la
   actualidad, `freshness` (`pw` para la última semana).
3. Contrasta los resultados con la fuente primaria antes de citarlos; el resumen de Brave no es
   la fuente, la URL sí.
4. Cierra el informe con la consulta usada, el número de resultados y las URLs que respaldan lo
   afirmado. Nunca incluyas la clave.

## Reglas

- Solo lectura: este MCP busca, no publica ni envía nada a terceros.
- Nada de sondeos en bucle: una búsqueda por pregunta, con tope de resultados.
- Un 401 significa clave no válida; un 429, límite de peticiones: no reintentes en bucle, espera o
  releva a otra fuente. Un error de red se informa y se sigue con la regla propia.
- No pegues datos personales en la consulta: viaja a Brave, un tercero.
- Para el navegador de la Mac (paneles sin API) usa las herramientas de Chrome, no este MCP.
