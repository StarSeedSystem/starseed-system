---
name: mcp-brave-search
description: >
  Búsqueda web real con Brave Search a través del servidor MCP del director de StarSeed.
  Úsala cuando una tarea necesite datos actuales, enlaces o noticias que el modelo no tenga,
  o cuando la búsqueda integrada del IDE no esté disponible o falle. Solo lectura: no publica,
  no inicia sesión y no envía datos privados.
metadata:
  servidor: brave-search
  transporte: mcp-stdio
  version: "1.0.0"
---

# MCP brave-search

Herramientas que expone `scripts/puente/mcp_director.py` (servidor MCP por stdio):
`brave_estado` (comprueba la conexión sin tocar la red) y `brave_buscar` (consulta la web).

## Cuándo usarla

- Hace falta información reciente o verificable con enlaces.
- La búsqueda propia del IDE no está disponible, falla o devuelve poco.

No la uses para escribir, publicar, iniciar sesión ni para repetir la misma consulta en bucle.

## Configuración

- `BRAVE_API_KEY`: clave del panel de Brave Search. El valor vive en `~/.starseed/env`;
  en el repo, en documentos y en logs solo se escribe el NOMBRE de la variable.
- `STARSEED_BRAVE_BASE` (opcional): base del API para pruebas locales; por defecto
  `https://api.search.brave.com/res/v1/web/search`.

Sin clave, `brave_buscar` devuelve un error claro y `brave_estado` responde `listo: false`.

## Cómo se llama

```bash
# estado de la conexión (sin red)
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"brave_estado","arguments":{}}}' \
  | python3 scripts/puente/mcp_director.py

# búsqueda real
printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"brave_buscar","arguments":{"consulta":"starseed os","recuento":5}}}' \
  | python3 scripts/puente/mcp_director.py
```

Argumentos de `brave_buscar`: `consulta` (obligatoria), `recuento` (1-20, por defecto 5) y
`frescura` (`pd` 24 h, `pw` 7 días, `pm` 31 días, `py` un año). Devuelve una lista numerada
con título, enlace y resumen.

## Pruebas

```bash
python3 -m unittest scripts/puente/test_mcp_director.py -v
```

Las pruebas cubren URL, formato, validaciones y una conexión real contra un servidor HTTP
local; nunca usan la clave real ni la red externa.
