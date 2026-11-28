# agent-reach · sentidos web de solo lectura para el enjambre

> Skill local copiada de [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach)
> v1.6.0 (MIT, ver `LICENSE`). Las instrucciones del modelo están en `SKILL.md`; este README es
> la guía de uso del enjambre: qué se puede pedir, cómo se llama desde el OS y qué reglas no se
> saltan nunca.

## Qué es y qué no es

Agent Reach abre la web pública a los agentes: busca, lee páginas, baja transcripciones de
YouTube, lee repos de GitHub y feeds RSS. **Es solo lectura**: nunca publica, comenta, da «me
gusta» ni envía mensajes. No inicia sesión por nadie ni pide contraseñas, cookies ni claves.

En StarSeed OS no se lanza el CLI desde el navegador. Todo pasa por el proxy propio
`/api/agent-reach/<capacidad>` (ruta de Next, solo servidor), que:

- exige sesión de Supabase o `STARSEED_LOCAL=1` en la neurona;
- valida la entrada (SSRF, argumentos con guion, URLs http/https sin credenciales);
- lanza el binario `agent-reach` sin shell, con tiempo límite y salida acotada;
- si el binario no está, degrada limpio con `ok:false` y la pista de instalación.

## Reglas duras del área

- **Solo lectura.** Nada de escribir en la plataforma. La skill no publica ni modifica.
- **Sin claves.** No hay API keys: búsqueda y lectura van por servicios públicos. Nunca se piden
  ni se imprimen credenciales.
- **Canales con sesión apagados (R1).** `reddit`, `reddit-search` y `twitter` requieren iniciar
  sesión con navegador anti-detección; el proxy los rechaza con `NEED_LOGIN_BLOQUEADO` salvo
  `STARSEED_AGENT_REACH_LOGIN=1`. El enjambre no los usa.
- **Gratis primero.** Sin cuotas ni créditos; ante `RATE_LIMITED`/`TIMEOUT` se espera o se releva
  a otra fuente, nunca se insiste en bucle.
- **Nada de rutas ni claves del disco** en las respuestas: el proxy solo devuelve contenido e
  `items`.

## Capacidades del proxy

Ids exactos que acepta `src/lib/integrations/agent-reach-comandos.ts` (fuente única; la prueba
`src/lib/integrations/__tests__/agent-reach-readme.test.ts` vigila que no haya deriva):

| id | qué hace | entrada |
|---|---|---|
| `web-search` (alias `search`) | búsqueda web multi-backend gratis | `{ q, limit? }` |
| `read-web` (alias `web`, `rss`) | lee una página, feed o post → Markdown | `{ url }` |
| `youtube-transcript` (alias `youtube`) | transcripción por subtítulos | `{ url }` |
| `github-read` (alias `github`) | lee archivo o repo público | `{ url }` o `{ repo }` |
| `bilibili` | busca en Bilibili | `{ q }` |
| `health` | comprueba que el CLI responde | — (GET) |
| `reddit`, `reddit-search`, `twitter` | **apagados (R1)**: `NEED_LOGIN_BLOQUEADO` | — |

`limit` se acota entre 1 y 20 (por defecto 5).

## Ejemplo de uso · buscar y leer

Desde la neurona o cualquier superficie del OS se llama al proxy, no al CLI:

```bash
# 1) buscar en la web (capacidad web-search)
curl -s -X POST http://localhost:9002/api/agent-reach/web-search \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $STARSEED_TOKEN" \
  -d '{"q": "BitNet 1.58 en producción", "limit": 5}'

# 2) leer una URL concreta (capacidad read-web)
curl -s -X POST http://localhost:9002/api/agent-reach/read-web \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $STARSEED_TOKEN" \
  -d '{"url": "https://example.org/articulo"}'
```

Respuesta correcta: `{ "ok": true, "content": "…Markdown…", "items": [ … ] }`.

Desde código de cliente ya existe el cliente tipado (`src/lib/integrations/clients/agent-reach.ts`):

```ts
import { web_search, read_web } from "@/lib/integrations/clients/agent-reach";

const r = await web_search(cfg, { q: "geometría sagrada", limit: 3 });
if (r.ok) console.log((r.data as { content: string }).content);
```

## Cuando algo falla

El proxy devuelve `{ ok:false, error, codigo }`. Se ramifica por `codigo` (los mismos del CLI):

| código | qué hacer |
|---|---|
| `NEED_SETUP` | falta el binario o una dependencia; instalar con la orden de abajo |
| `NEED_LOGIN` | el canal pide sesión y está apagado (R1); no se inicia sesión por nadie |
| `UPSTREAM_BROKEN` | la plataforma falló; decirlo y no reintentar en bucle |
| `TIMEOUT` | tardó demasiado; comprobar `health` y esperar |
| `RATE_LIMITED` | límite del origen; esperar y relevar a otra fuente |
| `PLATFORM_BLOCKED` | captcha o verificación; se detiene, no se cambia de cuenta |
| `BUSY` | navegador ocupado; reintentar más tarde |
| `NOT_FOUND` | el recurso no existe; revisar el enlace |
| `BAD_INPUT` | argumentos inválidos; ver la tabla de capacidades |

## Instalación (solo en la neurona que lanza el CLI)

```bash
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
agent-reach doctor --text
```

Queda en `~/.local/bin`. **Aviso:** el paquete «agent-reach» de **PyPI no es este proyecto**; no
uses `pip` ni `npx`. En Vercel no hay CLI: el proxy degrada limpio (`ok:false`) y Aurora sigue con
las alternativas configuradas (SearXNG, Crawl4AI).

## Dónde vive cada pieza

- Instrucciones del modelo: `.agent/skills/agent-reach/SKILL.md`; referencias en `references/`.
- Capacidades → argv y lectura del JSON: `src/lib/integrations/agent-reach-comandos.ts`.
- Proxy local: `src/app/api/agent-reach/[capability]/route.ts`.
- Cliente tipado: `src/lib/integrations/clients/agent-reach.ts`; descriptor: `src/lib/integrations/registry.ts`.

## Prueba

```bash
npx vitest run src/lib/integrations/__tests__/agent-reach-readme.test.ts
npx vitest run src/lib/integrations/__tests__/agent-reach-comandos.test.ts
```
