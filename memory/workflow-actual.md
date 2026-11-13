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

La síntesis de producción audiovisual ya no depende de la tarea programada de Claude. Funciona
desde MetaGenesis con sus directores, agentes de Imaginación, Jev, Laya y la flota gratuita.
El agente `scripts/puente/agente_sintesis.py` (cableado en `director_autodesarrollo.py`) ejecuta
tres fases diarias: recolectar y encargar análisis (00:30 CDMX), redactar y revisar (06:30), y
verificar/entregar (07:54 objetivo). La entrega va al chat propio de Telegram
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
cuestionario, tarjetas, tabla) con la última síntesis o el cuaderno de producción. Comandos: `/estado`,
`/ayuda`, `/encargos`, `/pausa`, `/sigue`, `/cancela`. La sesión de NotebookLM es solo del A1 (único dueño);
se renueva cada 20 min con `auth refresh`; si cae, `navegador_alta.py notebooklm` usa la sesión `google-alex`
del navegador propio para importar cookies al CLI. Claves en `~/.starseed/env`, preferencias en
`~/.starseed/peticiones/preferencias.json`. Detalles en `architecture/peticiones-telegram-a1.md`.
