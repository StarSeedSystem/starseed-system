---
name: mcp-brave-search
description: >
  Configura y prueba la conexión MCP brave-search de StarSeed OS y busca en la web
  desde una tarea por el servidor `starseed-director`. Úsala cuando una tarea
  necesite resultados web frescos (noticias, precios, documentación), cuando haya
  que registrar el MCP en un IDE o cuando la búsqueda no responda. Es de solo
  lectura y la clave nunca sale del entorno.
version: 1.0.0
---

# MCP brave-search · StarSeed OS

El servidor `scripts/puente/mcp_director.py` habla JSON-RPC 2.0 por stdio y expone
tres herramientas brave-search de **solo lectura**. Se registra en los clientes con
el nombre `starseed-director`, junto al Chat Director, la producción, sqlite y postgres.

## La conexión es una sola entidad

La clave se define UNA vez, en una variable de entorno; aquí solo se referencia por
su nombre. Nunca escribas el valor en el repo, el chat, un log ni un prompt. Nombres
aceptados, en orden de preferencia:

1. `BRAVE_API_KEY`
2. `BRAVE_SEARCH_API_KEY`

El endpoint se puede inyectar con `STARSEED_BRAVE_URL` (solo para pruebas con un
servidor local). El código vive en `scripts/puente/mcp_director.py`; este documento
no duplica su lógica.

## Herramientas

| Herramienta | Argumentos | Devuelve |
|---|---|---|
| `brave_estado` | ninguno | `configurada`, `variable`, `endpoint`, `modo` |
| `brave_probar` | ninguno | «Conexión OK con <NOMBRE>» o el error de Brave |
| `brave_buscar` | `q` (≤400), `limite` (1-20, por defecto 5), `pais` (ISO de dos letras) | lista de `titulo`, `url`, `descripcion` |

La clave viaja solo en la cabecera `X-Subscription-Token`; jamás en la URL, en
`argv` ni en un mensaje. Un 401/403 dice «Brave rechazó la clave»; un 429 pide
esperar o usar otra fuente.

## Configurar

1. Define **una sola** variable en tu entorno de sesión o en el gestor de secretos
   del IDE (por ejemplo `export BRAVE_API_KEY='…'` en el shell de la Mac).
2. Si usas `opencode.json`, escribe el nombre literal `{env:BRAVE_API_KEY}`; nunca
   pegues la clave en la configuración.
3. Sin clave, `brave_estado` responde `"configurada": false` y `brave_probar` nombra
   la variable que falta. Reinicia el cliente MCP después de definirla.

## Probar

```bash
python3 .agent/skills/mcp-brave-search/scripts/probar_conexion.py --simular
python3 .agent/skills/mcp-brave-search/scripts/probar_conexion.py --real --consulta "StarSeed OS"
python3 .agent/skills/mcp-brave-search/scripts/probar_conexion.py --rastreo
python3 -m unittest discover -s .agent/skills/mcp-brave-search/tests -p 'test_*.py' -v
```

`--simular` levanta un Brave falso local y una clave de prueba: recorre el protocolo
completo (`initialize` → `tools/list` → `brave_estado` → `brave_probar` →
`brave_buscar` → consulta vacía rechazada) y comprueba que la clave no aparece en la
salida. No sustituye a la prueba real con la variable definida, pero sí demuestra el
cableado sin gastar cuota.

## Uso en una tarea

1. Llama a `brave_estado`. Si `configurada` es `false`, no des la tarea por terminada:
   pide la variable o usa otra fuente.
2. Busca con `brave_buscar` (`q` claro, `limite` bajo, `pais` si importa la región).
3. Cita `titulo` y `url` en el informe; no pegues descripciones con datos personales.
4. Si la búsqueda no responde, no sondees en bucle: un reintento y otra fuente.

## Reglas

- Solo lectura: no hay escritura ni estado que cambiar.
- Un evento grueso por tarea; nada de sondeos en bucle (la cuota es compartida).
- No imprimas la clave ni la eches a un log; el servidor ya la tacha de la salida.
- No inventes URLs: usa las que devuelve Brave o las del repositorio.

## Rastreo en git (reparación SUP1124)

La carpeta `.agent/` está en `.gitignore`, así que un archivo **nuevo** bajo
`.agent/skills/mcp-brave-search/` no aparece en `git status` y la nube cerraba la
tarea como «sin_cambios». Este skill lo hace visible y da el comando exacto:

```bash
python3 .agent/skills/mcp-brave-search/scripts/probar_conexion.py --rastreo
# {"carpeta": ".agent/skills/mcp-brave-search", "ignorada": true,
#  "ancla_seguida": false, "comando": "git add -f .agent/skills/mcp-brave-search"}
```

El generador de tareas se corrige en SUP1124F; aquí queda la prueba de que el skill
detecta la carpeta ignorada y no permite un cierre silencioso. La parte 1
(`mcp_director.py`, commit `991401763`) ya está en main y estas herramientas son suyas.
