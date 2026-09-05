# Adenda 225 · Fuentes gratuitas, GitNexus, chats con voz, Mando vivo, Forja de Voz 1.58

> **Fecha:** 2026-09-05 · **Ola:** 246 (forja de voz 1.58) · **Área:** voz, mando.
> Adenda de relevo del día: lo verificado en vivo y el punto de relevo para la siguiente sesión/agente. Reglas del área: motor único «Voz StarSeed» con cuatro niveles y demonio local OmniVoice en `127.0.0.1:4500`; las rutas `/api/mando/*` son SOLO locales (404 en producción) y jamás devuelven claves ni rutas del disco.

---

## 1. Fuentes gratuitas para la orquestación económica (Adenda 219)

Tres incorporaciones que ya operan en la flota sin tocar código:

- **LLM7.io** (`https://api.llm7.io/v1`, opcional `LLM7_API_KEY`) — entra **sin clave** y sirve `gpt-oss` (20 B) y `minimax-m2.7` (verificados hoy, revisión real en 14 s). Con token sube a 44 modelos y de 10 a 40 req/min. Es el **revisor siempre disponible** (aguanta aunque se agoten xKiro y aihubmix), por lo que la cadena de revisión lo lleva en cabeza.
- **FreeTheAi** (`https://api.freetheai.xyz/v1`, `FREETHEAI_API_KEY`) — 60+ modelos; la clave la genera Alex desde su Discord (`/signup` + `/checkin` diario). Solo Alex la crea; los agentes nunca tocan el panel.
- **Pasarela OpenAI-compatible por entorno** — cualquier enrutador entra con cuatro variables en `~/.starseed/env` (chmod 600): `STARSEED_PASARELA_<NOMBRE>_URL` (base `/v1`), `_KEY` (`sin-clave` si no exige), `_MODELOS` (revisores en orden; el primero es la sonda) y `_RPM` (10 por defecto). El orquestador (`starseed-enjambre.py`) la sondea, la mete en `REVISORES`/`CUPOS_RPM` y `llamar_llm` le habla; el catálogo del Mando (`/api/mando/modelos`, `modelosPasarelas()`) la lista y `llamarModelo` la usa. Verificado con pasarela de prueba sobre LLM7 (sonda 1,1 s, respuesta 3,8 s). Candidato: **freellmapi** en local (`http://127.0.0.1:3001/v1`, 29 proveedores, ~40 MB) cuando Alex cargue sus claves en su panel.

Detalles en `memory/orquestacion-economica.md` §5. Claves solo en
`~/.starseed/env` y `~/.hermes/.env`; jamás en el repo ni en memorias.

## 2. GitNexus (grafo del código) en la orquestación

`npm i -g gitnexus && gitnexus analyze --skip-agents-md --skip-skills
--no-stats .` deja en `.gitnexus/` (652 MB, ignorado por git) un grafo del
repositorio: **70.844 nodos, 177.834 aristas, 1.578 comunidades y 909
flujos**. Indexar cuesta 337 s y 2,2 GB de pico → **solo en la nube**; la
Mac recibe el índice copiado (`tar` de `.gitnexus/`) y consulta. Consultar
cuesta 1-2 s y cero tokens. Tres usos reales:

1. **`mapa_codigo(t)`** → en el contexto de cada tarea: símbolos (archivo:líneas) y flujos ligados al título y a los archivos, más los comandos `gitnexus context|impact|query|detect-changes`.
2. **`impacto_cambios("ola/<id>")`** antes de la revisión → paso `impacto` (archivos, símbolos, flujos, riesgo low…critical) que entra en el prompt del revisor.
3. **Acción `mapa` de la orbe del Mando** — `consultarGrafo()` ejecuta `gitnexus context|impact|query` y lo deja como turno «grafo» del chat. El Mando pinta el chip de impacto en «Esperando tu visto bueno».

Habilidad interna: `.agent/skills/grafo-codigo/SKILL.md`. **No** se monta
como servidor MCP en opencode: 17 herramientas por turno cuestan más
contexto del que ahorran. Licencia PolyForm Noncommercial: uso interno,
nunca dentro del producto.

## 3. Ola 245 · G1 (test de `extraerAcciones`) — caso real

Tarea G1 escrita por **Kimi K3** en la nube, revisada por **qwen3.7-plus**
y aprobada desde el Mando de la Mac con el chip de impacto; integrada en
`331f914`. Kimi corrigió un fallo real: la propiedad `consulta` no se
propagaba al ejecutor de acciones del Mando y las preguntas del usuario
quedaban sin reenviar al grafo.

## 4. Mando vivo (cabecera, pestañas ocultas, nube sin lanzador)

- **Cabecera se relee cada 20 s** (antes solo al montar). Con agentes vivos y la pestaña oculta, la cuenta «0 en curso» quedaba congelada; ahora el sondeo es global y los agentes siguen contándose aunque el usuario no esté mirando la pestaña.
- **Medidor «Nube sin lanzador»**: cuando una orden firmada lleva más de 90 s sin recogerse, el Mando avisa arriba. Causa típica: el lanzador `~/starseed-vigia/lanzador.py` del contenedor muere con cada reinicio. Relanzarlo con `setsid -f python3 -u ~/starseed-vigia/lanzador.py`.

## 5. Voz StarSeed — el motor único habla en los chats

- **Medición negativa del demonio solo se cachea 15 s** (antes 5 min). Si el daemon no responde una vez, se reintenta casi de inmediato.
- **Timeout del proxy `/api/voz-local` ya no marca el daemon como muerto para toda la página**: cada intento se evalúa aparte y se reintenta.
- **Chat de Astraura habla por `hablarStarSeed`**: demonio neuronal con cola, espera y **una sola síntesis a la vez** (watchdog por cláusula hasta 150 s) y anticipación de la siguiente cláusula. Voz activa por defecto en los chats.
- **`/voces` es una página mínima** (solo el estudio y la orbe).

Regla del área: `src/lib/aurora/voz-starseed/niveles.ts` define los
cuatro niveles; el timbre NO cambia al cambiar de nivel, solo cambia el
backend. Si un nivel falla, se baja al siguiente **con el mismo timbre** y
se avisa por `alDegradar`.

## 6. Chats: ajustes con valores efectivos, escritura cómoda, carga global

- **Menú de ajustes** muestra los **valores efectivos por defecto**: capacidades del dispositivo (lo que el motor único detecta), habilidades activas y servicios conectados. El usuario ve de un vistazo qué tendría efecto aunque nunca haya tocado la configuración.
- **Cuadro de escritura a tamaño de conversación** (alto flexible según el hilo, sin recortar a 1-2 líneas).
- **Indicador de carga global de 2 px** en la parte superior: muestra peticiones en vuelo con umbral de 250 ms (sondeos excluidos, para que no parpadee con cada `setInterval`).

## 7. Dirección de Alex para el Estudio de Voces (Forja 1.58)

Resumen de `architecture/forja-voz-158.md` en 8-10 líneas:

- **Una sola voz**, no un zoo de motores: hoy **OmniVoice** corre en el demonio local `127.0.0.1:4444`; la meta es un **LM de tokens de audio tipo Orpheus cuantizado a 1.58-bit** con la receta QAT de BitNet.
- **Variaciones por personalidad**, no modelos distintos: timbre, `instruct`, semilla, prosodia y etiquetas de emoción se aplican *sobre el mismo modelo* como capas de condicionamiento.
- **Cuatro fases**: (1) programa único, (2) variaciones por personalidad, (3) ajustes de personalización, (4) editor de voces. Orígenes: OmniVoice, Kokoro, Orpheus, BitNet, Chatterbox, VoxCPM, CosyVoice 2, GPT-SoVITS, OpenVoice V2, Dia y KittenTTS. Solo MIT/Apache-2.0 en producto; `fish-speech` y `f5-tts` quedan como **referencia de código** (sus pesos son CC-BY-NC).
- **Motor único «Voz StarSeed»** (`hablarStarSeed` en `src/lib/aurora/voz-starseed/motor.ts:196`) como puente al OS.

**Regla de trabajo dada por Alex:** todo lo que pida lo ejecuta el
orquestador multiagéntico; Claude supervisa, dirige y verifica. El
orquestador ramifica por coste, releva ante 429/402 y nunca deja a un
proveedor sin cupo.

## 8. Pendiente (para el siguiente relevo)

- **Verificar en el navegador de Alex** la voz de los chats con sesión iniciada: en el panel embebido (preview de Vercel) las rutas `/api/ai/*` devuelven **401 sin sesión** y no se puede oír la voz ahí.
- **Investigar qué carga `qwen2.5:1.5b` en Ollama**: apareció como dependencia en una traza; confirmar si es residuo de un test o si lo trae el backend 1.58.
- **Precalentar narraciones**: `scripts/voz-precalentar.mjs` (pendiente de crear) para que el primer `hablarStarSeed` de cada sesión no pague la latencia del demonio.
- **Commits sin publicar** esperan la palabra de Alex (no se hace push sin su visto bueno).

---

**Relevo: siguiente adenda 226**
