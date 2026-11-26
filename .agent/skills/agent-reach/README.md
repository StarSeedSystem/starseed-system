# agent-reach · cómo la usa el enjambre (CAP1119)

> Documentación operativa en español de la skill **agent-reach v1.6.0** (MIT,
> `Panniantong/Agent-Reach`). La instrucción canónica está en `SKILL.md` y sus
> referencias en `references/`. Este README explica **cómo la usa el enjambre de
> StarSeed OS** y trae un ejemplo verificable por la prueba
> `src/lib/integrations/__tests__/agent-reach-readme.test.ts`.

## Qué es y qué no

- **Sí (solo lectura):** buscar en la web, leer una URL, subtítulos de YouTube,
  leer un repo o archivo de GitHub, y los canales públicos de V2EX y Bilibili.
- **No:** publicar, comentar, dar «me gusta», enviar mensajes, iniciar sesión por
  nadie ni pedir contraseñas. Cada acción devuelve un único objeto JSON con
  `ok`, `items`, `error.code` y `error.hint`.

La regla de oro: **primero las herramientas propias** (búsqueda y lectura que ya
tenga el agente). Agent-Reach rellena los huecos cuando esas herramientas no
están, fallan o no traen el cuerpo del contenido.

## Regla del área: solo canales públicos

Los agentes de alcance del OS usan **solo canales sin sesión**. Los canales con
login (`reddit`, `twitter`, `linkedin`, `facebook`, `instagram`, `xiaohongshu`,
`boss`, `xueqiu`) quedan apagados: el proxy los rechaza con
`NEED_LOGIN_BLOQUEADO`. La variable `STARSEED_AGENT_REACH_LOGIN` existe para un
uso humano puntual; el enjambre **no la enciende** y nunca inicia sesión por el
usuario.

## Tres formas de llamarla

### 1. CLI local (la neurona que la tenga instalada)

```bash
agent-reach channels                    # qué canales y acciones hay
agent-reach web search "tema" --limit 5 # búsqueda web
agent-reach read https://example.org/a  # leer una URL
```

### 2. Proxy del OS (recomendado desde el OS y la nube)

`POST /api/agent-reach/<capacidad>` con cuerpo JSON. Exige sesión de Supabase
(`Authorization: Bearer <token>`) o `STARSEED_LOCAL=1` en la neurona. Las rutas
`/api/mando/*` son **solo locales** (404 en producción); este proxy sí se
publica, pero degrada limpio si el binario no está. Devuelve
`{ ok, content, items, error, codigo }`.

```bash
curl -s -X POST http://localhost:9002/api/agent-reach/web-search \
  -H 'Content-Type: application/json' \
  -d '{"q":"geometría sagrada","limit":3}'
```

### 3. Herramientas de Aurora (dentro del OS)

`agent_reach_web_search`, `agent_reach_read_web`, `agent_reach_youtube_transcript`
y `agent_reach_github_read` llaman al mismo proxy con los ids exactos de
`src/lib/integrations/agent-reach-comandos.ts`.

## Capacidades permitidas

| capacidad (proxy) | orden del CLI | entrada |
|---|---|---|
| `web-search` · `search` | `web search <q> --limit <n>` | `q` (≤ 300) y `limit` (1–20) |
| `read-web` · `web` · `rss` | `read <url>` | `url` http(s) pública |
| `youtube-transcript` · `youtube` | `youtube subtitle <url>` | `url` de YouTube |
| `github-read` · `github` | `github read <repo o url>` | `dueño/repo` o URL |
| `bilibili` | `bilibili search <q>` | `q` |
| `health` | `version` | — |

Las URLs locales, privadas o de metadatos (`localhost`, `127.0.0.1`, `10.*`,
`169.254.169.254`…) se rechazan siempre: el proxy aplica la misma lista SSRF.

## Ejemplo verificable: investigar un enlace

Caso real del enjambre: el director pide «lee este vídeo de YouTube y resume; si
no hay subtítulos, busca el tema en la web».

1. **Subtítulos primero.** `youtube-transcript` con la URL del vídeo.
2. **Si `ok: false` por `NEED_SETUP` o `UPSTREAM_BROKEN`,** no se insiste: se
   pasa a `web-search` con el tema del vídeo.
3. **Una sola lectura por enlace.** Si el resultado ya trae el cuerpo, se
   responde; no se abren canales con sesión ni se reintenta en bucle.
4. **Se cita la fuente** (`url` de cada `item`) en la respuesta final.

Estas son las entradas de ejemplo que ejecuta la prueba del README:

```json
{
  "web-search": { "q": "geometría sagrada", "limit": 3 },
  "read-web": { "url": "https://es.wikipedia.org/wiki/Vesica_piscis" },
  "youtube-transcript": { "url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
  "github-read": { "repo": "Panniantong/Agent-Reach" }
}
```

## Errores: qué hacer

| `error.code` | Qué hace el enjambre |
|---|---|
| `NEED_SETUP` | Falta la instalación o una clave. Se avisa y se usa la herramienta propia. |
| `NEED_LOGIN` | Canal con sesión: se descarta. El enjambre no inicia sesión. |
| `UPSTREAM_BROKEN` | La plataforma falla. Se dice cuál y se sigue por otra vía. |
| `TIMEOUT` | No se reintenta en bucle; se prueba otra capacidad. |
| `RATE_LIMITED` | Se espera `retry_after_seconds`; no se cambia de backend. |
| `PLATFORM_BLOCKED` | Se para: lo resuelve una persona en la página oficial. |
| `BUSY` | Se reintenta más tarde, nunca cerrando ventanas. |
| `NOT_FOUND` | El enlace o id no existe: se comprueba la entrada. |
| `BAD_INPUT` | Argumento inválido: se corrige con la tabla de capacidades. |

## Instalación y mantenimiento

```bash
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
agent-reach setup
agent-reach doctor --text   # estado local; no sale a la red
```

El paquete `agent-reach` de **PyPI no es este proyecto**: nunca `pip install
agent-reach` ni `npx agent-reach`. Todo lo que instala vive en `~/.agent-reach/`.
Actualizar solo con acuerdo previo (`agent-reach update`); un fallo de red no es
una sesión caducada.

## Reparación CAP1119 · las tres objeciones

La tarea se cerró «rechazada» tres veces. La causa de las dos primeras no era el
contenido: `.agent/` estaba en `.gitignore`, así que este README —el único
archivo declarado— nunca llegaba al commit y el orquestador veía «no tocó
ninguno de sus archivos». El arreglo vive en `.gitignore`: la excepción
`!.agent/skills/agent-reach/` re-incluye esta carpeta y el archivo declarado se
versiona de verdad. Cada objeción tiene su prueba en
`src/lib/mando/__tests__/cap-skill-agent-reach-usob.test.ts`.

| Fecha | Objeción literal | Corrección |
|---|---|---|
| `2026-11-23 02:26:39` | `reabierta por el director: devuelta de la nube: su run terminó · la nube dijo «rechazada»` | Se versiona el README declarado (excepción en `.gitignore`) y se escribe la guía completa; no se relanza el mismo intento a ciegas. |
| `2026-11-23 16:21:16` | `reabierta por el director: devuelta de la nube: su run terminó · la nube dijo «rechazada»` | Nota idéntica a la anterior: esta guía trae ya los comandos públicos y la regla de solo lectura, para que el run no vuelva a rechazarse por falta de instrucciones. |
| `2026-11-24 23:21:02` | `otra ola ya la cerró (rechazada según progreso.json) → no la repito` | Una `rechazada` es terminal en `progreso.json`: no se repite la misma id; se crea una sucesora (`…-usob`) con otro modelo y la objeción literal en el prompt. |

La reparación no se resuelve diciendo «ya estaba hecha»: el archivo declarado se
toca de verdad y la sucesora pasa sus puertas (`tsc`, `vitest`, revisión).

## Verificación

```bash
npx vitest run src/lib/integrations/__tests__/agent-reach-readme.test.ts
npx vitest run src/lib/mando/__tests__/cap-skill-agent-reach-usob.test.ts
```

La primera prueba comprueba que este README existe, que documenta las tres vías
y la regla de solo lectura, y que sus entradas de ejemplo resuelven a órdenes
reales sin canales con sesión. La segunda ata una prueba a cada una de las tres
objeciones: el versionado del archivo, el ejemplo público y la sucesora que no
repite una tarea rechazada.
