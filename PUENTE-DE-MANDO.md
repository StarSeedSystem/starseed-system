# Genesis · contexto compartido de los cuatro entornos

> Generado por `scripts/puente/sincronizar-ides.py` el 2026-11-25 22:02:07 desde Genesis vivo.
> **No lo edites a mano: se regenera.** Lo permanente va en `metagenesis.md` y en `AGENTS.md`.

Este archivo es el primer mensaje del chat principal en **Claude (Cowork)**, **Codex**,
**Hermes** y **Antigravity IDE**. Los cuatro miran el mismo Genesis y dan órdenes por el
mismo canal, así que ninguno necesita que otro le resuma nada.

## Estado ahora mismo

| | |
|---|---|
| Genesis | **encendido** en http://127.0.0.1:9002/mando |
| Ola arriba | Sueños profundos 2026-11-25 |
| Agentes escribiendo | **3** |
| En esta ola | integradas 0 · en curso 1 · esperando aprobación 0 · pendientes 87 |
| Últimas 7 olas | en curso 3 · pendientes 90 · integradas 9 |
| HEAD | `63426a3ec DIR1125AI · la memoria principal CLAUDE.md pasa a llamarse metagenesis.md en tod` |
| Sin publicar | 8 commits |
| Árbol | limpio |

## Quién escribe ahora (latido de `cola-auto-1125-213149.json`, hace 0s)

| tarea | fase | modelo | lleva | quieto | bytes |
|---|---|---|---|---|---|
| `SA112570` | analizando | explabs/hy4-flash | 6 min | 1 s | 608 |
| `A13BE11E4b` | escribiendo | openrouter/nvidia/nemotron-3.5-sup | 10 min | 269 s | 71557 |
| `ENJ1125A` | hecho | freellmapi/auto | 5 min | 316 s | 56255 |
| `SA112567` | hecho | freellmapi/auto | 7 min | 416 s | 719 |
| `SA112568` | hecho | freellmapi/auto | 9 min | 526 s | 564 |
| `ALM1125H4` | tests | freellmapi/auto | 9 min | 528 s | 126084 |
| `SA112569` | hecho | freellmapi/auto | 9 min | 550 s | 386 |
| `SA112566` | hecho | groq/openai/gpt-oss-20b | 9 min | 553 s | 810 |
| `SA112565` | hecho |  | 10 min | 590 s | 273 |
| `SA112564` | hecho | groq/qwen/qwen3.8-27b | 14 min | 852 s | 1774 |
| `IMG-diaria-publicar-vector-visual-de-la-orbeb` | hecho |  | 25 min | 1479 s | 0 |
| `IMG-diaria-endpoint-api-starseed-chat-en-bacb` | hecho |  | 25 min | 1482 s | 0 |
| `IMG-diaria-convertir-modelo-a-disperso-2-4b` | hecho |  | 25 min | 1484 s | 0 |
| `ENT-agentes-referencias-diseno-agentes-re-94a280-v1` | hecho | explabs/deepseek-v4.1-flash | 25 min | 1488 s | 951 |

**Quieto por encima de 300 s con los bytes parados = API colgada, no modelo lento.**
Suéltala y dásela a un agente del IDE: `starseed-puente soltar <id>`.

## Cómo dirige cada IDE (idéntico en los cuatro)

```
starseed-puente estado                # foto viva
starseed-puente agentes               # quién escribe y desde hace cuánto
starseed-puente aprobar  <id> [...]   # desbloquea la puerta humana
starseed-puente soltar   <id> [...]   # la tarea pasa a un agente del IDE
starseed-puente reasignar <id> <modelo>
starseed-puente puertas               # tsc · vitest · build · sin publicar
```

Las órdenes se escriben en `starseed_memory_root/olas/control-<cola>.json`, que el
vigilante del orquestador lee **cada 20 s**. Da igual quién la escriba: es el mismo canal.

## Reglas que valen para los cuatro

- **Un solo orquestador** (`starseed-enjambre.py`) con N trabajadores. Tres procesos a la
  vez = tres `tsc` simultáneos = la Mac de rodillas. Los AGENTES sí se multiplican: cuantos
  más, mejor, mientras cada uno trabaje en su propio worktree.
- **Nunca `next build` con el enjambre vivo.** La Mac es de 8 GB.
- **Genesis se compila fuera: nadie lanza `next build` ni `next dev` a mano.**
  Ni en la Mac ni en el 9002, ni servidores propios en otro puerto. Si Genesis
  no abre, mira `/tmp/starseed-reconstruir.log` y el estado con el MCP
  `starseed-director`, y pide `reconstruir_mando.py --una-vez --ya` o la
  compilación en el A1.
- Tres puertas antes de publicar: `tsc --noEmit`, `vitest run`, `next build` completo.
- **Nada está hecho hasta que se ve en Genesis de la Mac.**
- Claves solo en archivos de entorno (`~/.hermes/.env`, `~/.starseed/env`). En el repo,
  en documentos y en los latidos, solo NOMBRES de variable. En `opencode.json`, `{env:VAR}`.
- Nunca `amend`, `rebase` ni `force-push` para cambiar autoría.
- Cada tarea escribe un módulo puro NUEVO y pequeño; el cableado va aparte.
- Los `id` de tarea son únicos en todo el histórico **y** entre los archivos de cola vivos.

## Dónde está cada cosa

| | |
|---|---|
| Repo | `/Users/alex/Documents/starseed-os-main` |
| Rumbo y reglas permanentes | `metagenesis.md` (Claude) · `AGENTS.md` (Codex, Antigravity) · `gemini.md` |
| Estado del enjambre | `starseed_memory_root/olas/` — **no se versiona**, muere con la máquina |
| Orquestador | `scripts/enjambre/starseed-enjambre.py`, instalado en `~/.local/bin/` |
| Genesis | `http://127.0.0.1:9002/mando` — local, `/api/mando/*` devuelve 404 en producción |
| Publicado | https://starseed-os.vercel.app |

## Cómo se trabaja aquí

Esto es el MÉTODO, no el estado. Vale igual en Claude, Hermes, Codex, Cursor, VS Code o
Antigravity: quien abra un chat sobre este repo trabaja así. Lo escribe Genesis y
se regenera solo — no lo edites a mano; el original es `memory/workflow-actual.md`.

### Quién escribe qué

El **enjambre escribe el código de producto**. Los asistentes (Claude, Hermes, Codex…)
dirigen, verifican y publican: diseñan olas, las lanzan, miran Genesis, comprueban en
`localhost` y aprueban. No se escribe código de producto a mano salvo para DESHACER una
regresión. Esto lo pidió Alex expresamente y no es negociable.

**Acceso de edición total del programa: `maggasukha@star.seed`.** Hoy es la única cuenta con
acceso de desarrollador. Nuevos desarrolladores solo por votación de los que ya lo son.

### Las puertas de una tarea, en orden

alcance → **cableado** → tsc (+reparación) → vitest con el alcance de la tarea (+reparación) →
revisión de segunda opinión → integración.

Antes de arrancar el orquestador: **puerta de pasarelas** (no arranca si ninguna escribe) y
guardia de árbol limpio (no arranca con `main` sucio, pero ya no tropieza con su propia
contabilidad).

Antes de publicar, las cuatro: `npx tsc --noEmit` · `npx vitest run` · `python3 -m unittest
discover -s scripts/puente -p 'test_*.py'` · `npx next build`. Con el node del repo
(`~/.nvm/versions/node/v22.14.0/bin` primero en el PATH) y `NODE_OPTIONS=--max-old-space-size=4096`.

### Las cinco reglas que costaron un día entero cada una

1. **El silencio no es aprobación.** Un `vitest` que no imprime su resumen no ha comprobado
   nada. Repítelo sin tuberías y léelo entero.
2. **Integrado no es aplicado.** Exportar una función que nadie llama es código muerto con
   aspecto de trabajo terminado. Antes de darte por terminado, `grep` que se usa fuera de su
   prueba.
3. **Si una prueba falla, se arregla el CÓDIGO, no la prueba.** Mover la referencia de un test
   hasta que le dé la razón al fallo no es arreglar: es esconderlo. (Pasó de verdad con la
   fecha de Cultura, dos veces.)
4. **Una pasarela está viva cuando devuelve tokens**, no cuando contesta a un ping. Sin clave,
   las pasarelas no dan error: dan silencio, y el silencio se parece a un agente pensando.
5. **Las claves no se teclean en un chat.** Se guardan con
   `bash scripts/puente/guardar-clave.sh NOMBRE_VARIABLE`, que entrecomilla, hace copia y
   comprueba que el archivo sigue cargándose entero. Nunca en el repo, ni en logs, ni en
   eventos, ni en memorias: solo el nombre de la variable y su huella.

### Proveedores

`python3 scripts/puente/renovador-pasarelas.py [--telegram] [--abrir]` dice el estado de cada
pasarela, qué renovar y con qué enlace. **Codex está APAGADO como escritor**
(`STARSEED_CODEX_ESCRITOR=0`): la suscripción de ChatGPT de Alex se agotó cargando con el
100 % de la escritura. La **neurona local** (Ollama en `127.0.0.1:11434`) es la única pasarela
que no puede quedarse sin cupo.

**Escritores de hoy (2026-09-20)**: `google/gemini-3.6-flash` directo (GEMINI_API_KEY; 1M de
contexto, escribe con herramientas), NIM `nemotron-3-super-120b` y `z-ai/glm-5.3`, apinex tras el
fichaje diario, y los gratuitos con herramientas de OpenRouter que el renovador trae del catálogo
cada 30 min (`modelos_extra`, siempre `:free`). Hermes dirige con `gemini-3.6-flash`.

**Higgsfield (solo con aprobación, pago):** conector MCP `https://mcp.higgsfield.ai/mcp` (Claude)
y CLI `@higgsfield/cli` (nodos) vía cuenta Fundación `fundacionstarseed`; **nada se ejecuta sin
aprobación de Maggasukha**; cada propuesta lleva proyecto, pieza, modelo, comando exacto, tomas y
créditos estimados; presupuesto por proyecto con aviso al 80 % y parada al 100 %; ejecuta solo
`higgsfield_aprobado.py`; marca: símbolo no-IA, colores de tokens, nada sin su palabra; gasto en
`starseed_memory_root/produccion/higgsfield/gasto.jsonl` (privado).

### Jev: decisiones por $0,00002, no texto

`python3 scripts/puente/veredictos.py` juzga las bloqueadas (reglas deterministas primero, Jev en
lo que queda; escribe `olas/veredictos.json` con confianza y fuente). Jev también afina Telegram
(zona de duda), clasifica errores de pasarela desconocidos y puede vetar la aprobación sola.
Consejero con umbral, nunca oráculo. **Techo 0,05 $/día y 1 $/mes**; `python3 scripts/puente/jev.py`
enseña gasto y saldo. Hay 10 $ en OpenRouter: **solo ids `:free`** para agentes y para Hermes.
Regla y detalles: `memory/orquestacion-economica.md` §9.

### Publicar

`python3 scripts/puente/publicar.py "nota"` — rama, commit, las cuatro puertas, push y
verificación cambio a cambio (integrado **y** aplicado). Nunca `git push` a mano. Nunca
`amend`, `rebase` ni `force-push`: la autoría no se toca.

### Al terminar

Toda respuesta a Alex acaba con un informe de uso: qué modelos y APIs se usaron, qué queda, y
qué opciones de enrutamiento hay. Y nunca se le dice que algo está arreglado sin haberlo visto
funcionando en `localhost`.

---

## Síntesis diaria autónoma (SDP1111)

La síntesis de producción audiovisual ya no depende de la tarea programada de Claude. Funciona desde MetaGenesis con sus directores, agentes de Imaginación, Jev, Laya y la flota gratuita. El agente `scripts/puente/agente_sintesis.py` (cableado en `director_autodesarrollo.py`) ejecuta tres fases diarias: recolectar y encargar análisis (00:30 CDMX), redactar y revisar (06:30), y verificar/entregar (07:54 objetivo). La entrega va al chat propio de Telegram
(@StarSeed_Design_bot, chat_id 8670436815) y, si Drive está vinculado, crea un Doc en la carpeta
`1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI`. El parte diario para que Claude nube tenga contexto se genera
con `parte_diario_metagenesis.py` vía timer oneshot diario a las 07:30 en el A1 (líder de
dirección). `buzon_telegram.py` queda sin cablear. La migración `20261108120000_metagenesis_buzon.sql`
la aplica el director al publicar.

## Navegador propio de MetaGenesis (NAV1112)

Lectores diarios en el A1 (Oracle, siempre encendido) que acceden con sesiones iniciadas manualmente
por Alex a: `myactivity.google.com` (YouTube visto, Búsqueda, Gemini), `www.youtube.com` (inicio e
historial), `notebooklm.google.com` (cuadernos, fuentes, notas) y `www.instagram.com/saved` (guardados
de maggasukha) + seguidos. Sustituye a SDP1111M (navegador en la Mac) y elimina la dependencia de
Takeout (cada 2 meses), exportación manual de Instagram y CLI de NotebookLM en la Mac — estos tres
quedan como respaldo. Seguridad: solo lectura, dominios permitidos por sesión, sin puertos hacia
fuera, perfiles 0700, cerrojo y `STARSEED_NAVEGADOR=0` / `STARSEED_NAVEGADOR_INSTAGRAM=0` para apagar.
Documentación en `architecture/navegador-propio-metagenesis.md`.

## Peticiones por Telegram (PET1112)

El bot **@StarSeed_Design_bot** («Síntesis de producción StarSeed») atiende a Alex desde el A1 sin la Mac.
Escucha por long polling, guarda peticiones en `~/.starseed/peticiones/cola.json`, usa FreeLLMAPI local
(modelos gratuitos con nombre) y NotebookLM (infografía, audio, vídeo, presentación, mapa mental, informe,
questionario, tarjetas, tabla) con la última síntesis o el cuaderno de producción. Comandos: `/estado`,
`/ayuda`, `/encargos`, `/pausa`, `/sigue`, `/cancela`. La sesión de NotebookLM es solo del A1 (único dueño);
se renueva cada 20 min con `auth refresh`; si cae, `navegador_alta.py notebooklm` usa la sesión `google-alex`
del navegador propio para importar cookies al CLI. Claves en `~/.starseed/env`, preferencias en
`~/.starseed/peticiones/preferencias.json`. Detalles en `architecture/peticiones-telegram-a1.md`.

## Despacho de peticiones con salud y alcance (PET1116)

Enrutador con salud (FreeLLMAPI → NIM → OpenRouter `:free` → Hermes) nunca deja una petición fallida.
Tipos: «encargo» (planificación por frentes), «alcance» (creador/canal/vídeo a analizar y contactar, informe+ficha+mensaje **pendiente de aprobación** con plantilla `ALC-NICK-1116`), «descartar» (tema/fuente a quitar), «notebooklm» (formato concreto), «respuesta». Una URL en el mensaje es FUENTE que se usa (YouTube → NotebookLM, Drive → add-drive, web → add). Una petición fallida abre reparación automática en `cola-auto-salud` con traza y aviso al chat. Detalles en `architecture/peticiones-direccion-1116.md`.

## Autorreparación de sesiones (SES1113)

Sanador en `scripts/puente/sanador_sesiones.py`: corre cada 15 min en el A1 y a demanda. Comprueba y repara sesiones (NotebookLM, google-oauth, Higgsfield, FreeLLMAPI/NIM, Telegram) con recetas ordenadas; **Claude nunca es un paso necesario**; la caída de un proveedor se rodea por la ruta gratuita. Regla de despliegue: tests del repo cubren los arreglos antes de sustituir herramienta en servicio.

## Alcance por GitHub (ALC1113)

GitHub es una fuente nueva de contactos técnicos. El agente de alcance (`scripts/puente/alcance_github.py`) extrae perfiles, organizaciones, grupos y desarrolladores de proyectos/repos relacionados con StarSeed. El agente de lista (`scripts/puente/alcance_lista.py`) fusiona estos contactos con la lista de Maggasukha y el sistema de fichas existente (`starseed_memory_root/alcance/`). Las fichas candidatas tienen `fuente: "github"` y están en estado `esperando-aprobacion`. La aprobación es exacta: texto, destinatario y canal deben coincidir. Los envíos respetan las reglas de la plataforma de cada sitio. GitHub entra como parte del alcance técnico regular en el director de desarrollo autónomo y su recomendación forma parte de la síntesis diaria.

## Fallo y arreglo de la síntesis diaria (SIN1114)

El 2026-11-14 no hubo síntesis: el agente nativo quedó en `entregar` sin texto, el respaldo de
las 08:30 del A1 dejó de correrse al pasar el bot al módulo del repo, los tests de
`test_agente_sintesis.py` escribían Docs vacíos en el Drive real y el multiformato eligió uno
de esos Docs como «última síntesis». La del día se completó por la vía puntual del A1
(`sintesis_hoy.py 2026-11-14`: investigación profunda, informe con el protocolo completo,
resumen por Telegram y los 9 formatos de NotebookLM en Drive › Síntesis diarias › «Síntesis
diaria 2026-11-14 · formatos»); su registro queda en
`starseed_memory_root/produccion-audiovisual/sintesis/2026-11-14.md`. Diagnóstico y arreglo
permanente (`STARSEED_PRUEBAS=1`, síntesis por fecha del título con mínimo de 4.000 caracteres,
respaldo diario en el bot del repo, registros y limpieza sin borrar) en
`architecture/sintesis-diaria-arreglo-1114.md`.

## Síntesis diaria autónoma con contexto (SIN1116)

La síntesis sale cada día **sin Claude**: el agente nativo (`scripts/puente/agente_sintesis.py`) usa el enrutador gratuito con modelos nombrados (orden: `gemini-flash-lite` → NIM `minimax-m3.1-flash` → `nemotron-3.5-lightning`), claves leídas por `entorno.leer_clave()` (acepta `export VAR=…`). Respaldo del A1 a las 08:30 con NotebookLM (investigación profunda, informe con protocolo completo, contexto vivo, 9 formatos). El bot y el agente publican avances en el chat por hitos (arranque 06:30, agentes, redacción, entrega, multiformato); a las 09:00 sin síntesis avisan motivo y acción. Cada agente recibe **paquete de contexto vivo** (lo integrado 30 días, producción audiovisual, alcance, investigaciones 7 días, recuerdos LEANN por rol, libreta JLA1116) y el **libro de recomendaciones** (`starseed_memory_root/sintesis/recomendaciones.jsonl`) con estados propuesta→aprobada/rechazada/ya existe/encargada/integrada. **Filtro de novedad** (LEANN/TF-IDF 14 días) descarta o replantea propuestas repetidas; revisor gratuito puntúa novedad/concreción/anclaje (≥6/10). **Una tarea crítica nunca queda huérfana en silencio**: el líder reencola desde el contrato o escala a Mando y chat (caso SIN1114C).
