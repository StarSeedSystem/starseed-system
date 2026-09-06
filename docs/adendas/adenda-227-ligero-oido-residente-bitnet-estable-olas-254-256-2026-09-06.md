# Adenda 227 · Modo ligero pulido, oído residente y BitNet estable

> **Fecha:** 2026-09-06 · **Olas:** 254–256 (modo ligero pulido · oído residente · BitNet estable) · **Área:** mando, voz, astraura.
> Adenda de relevo del día: lo verificado en vivo en la Mac de Alex (8 GB) el 2026-09-06 y el punto de relevo para la siguiente sesión/agente. Reglas del área: motor único «Voz StarSeed» con cuatro niveles (estudio/alta/ligera/mínima) y demonio local OmniVoice en `127.0.0.1:4500`; las rutas `/api/mando/*` son SOLO locales (404 en producción) y jamás devuelven claves ni rutas del disco; gratis primero y relevo automático ante 429/402.

---

## 1. Ola 254 · Modo ligero pulido (L2 y L3)

**L2 — `scripts/starseed-ligero.sh`** cerró las aristas del modo ligero de la Ola 253:

- **Heap de 4096 MB por defecto** para el build: el de 2048 se quedaba sin memoria y mataba la compilación en los 8 GB.
- **`construir --limpiar`**: borra `.next`, la caché de npm y `.gitnexus/parse-cache` — el aliño que liberó disco cuando un build murió con `ENOSPC` a 5,6 GB libres.
- **Comprobación de disco ≥ 4 GB antes de compilar** (un build anterior murió por falta de espacio).
- El **vigilante launchd `com.starseed.dev-vigilante`** se **descarga** al construir/arrancar y se **recarga en `dev`**.
- **`estado`** ahora reporta disco y RAM libres junto al resto.

**L3 — una sola puerta para `/api/mando/`**: las ocho rutas que aún exigían sesión **por su cuenta** — `ramificacion`, `agentes`, `colas`, `orquestar`, `grafo`, `ajustes`, `entornos`, `contextos` — repiten su propia comprobación, un parche que divergía. Todas pasan a **`guardianMando(peticion)`** con el test `src/lib/__tests__/mando-guardian-puertas.test.ts`. **Verificado:** las nueve rutas del Mando responden 200 sin sesión en modo ligero y `/mando` pinta la ola activa, lo que está en curso y los agentes en vivo de la nube.

## 2. Ola 255 · Oído residente

El demonio (`native/astraura-voice/daemon.mjs`) deja de invocar `asr_infer` por petición y carga **`asr_stream_server`** de VibeASR.cpp como **residente**: los modelos se cargan **una vez** y se habla por protocolo **stdin/stdout** (`---READY---` / `---END---` / `EXIT`, con `--no-token-stream`).

- **Sueño por inactividad**: tras 5 min sin uso (`STARSEED_ASR_SUEÑO_MS`) el residente se duerme y libera sus ~1,7 GB.
- **Carga hasta 240 s** (`STARSEED_ASR_CARGA_MS`): cargar el modelo es caro y no se mata a medio camino.
- **Presupuesto proporcional**: `presupuestoOidoMs` en `src/lib/aurora/stt-oss/vibeasr-local.ts` da `60 s + 20 s por segundo de audio`, acotado a 120–360 s (con su test en `__tests__`). El proxy `/api/voz-local/asr` sube a 370 s y el cliente a 380 s.
- **`/status.asr`** expone `residente`, `cargandoDesdeMs`, `presupuestoMs`, `cesiones` y `ultimaCesionMs`.
- **Cesión de memoria**: cuando quedan menos de 1200 MB y no hay síntesis en vuelo desde hace **10 s** (V12 bajó el margen de 60 s), el demonio cede la memoria del pool TTS (`killAllServers`); también cede **antes de cargar el residente**, y el **calentamiento inicial no cuenta como uso** (V12).
- **V10** corrigió una regresión: `reconocerResidente` había quedado **dentro de un `/**` sin cerrar** (un `ReferenceError` en `/asr`); se restauró la función y se añadió `src/lib/__tests__/daemon-voz-sintaxis.test.ts`, que detecta funciones tragadas por comentarios.
- **V11 — prioridad**: la plantilla launchd `native/astraura-voice/com.starseed.astraura-voice.plist` pasaba de `ProcessType Background` (macOS estrangulaba CPU e I/O al demonio y a sus hijos: prioridad 4 frente a 31) a **`Interactive`**; `install.mjs --reinstalar-plist` actualiza el plist ya instalado, con el test `daemon-voz-plist.test.ts`.

**Medido, no supuesto**: `asr_stream_server` tarda 15 s a mano (RTF 5) y **186+ s bajo el demonio en Background** con el pool TTS vivo (castigo de prioridad). Tras V11+V12: `POST /api/voz-local/asr` → **200 en 20 s para 6,3 s de audio** (`vibeasr-1.58-residente`, RTF 2,5).

## 3. Ola 256 · BitNet estable (repo `astraura`, autorizada por Alex)

El orquestador trabaja ahora también sobre **repos Python** con `STARSEED_ROOT`, con puertas `py_compile` + `pytest`. En el repo `astraura` (`~/Documents/IA 1.58 bit`) se atacó la causa de raíz del uso de Ollama en vez del BitNet nativo:

- **B1 — `EconomicRouter._generar_local`** habla con el **llama-server BitNet nativo** (`bitnet_cpp_manager.ensure_server`, perfil background, `/v1/chat/completions`); Ollama queda solo como respaldo con **`ASTRAURA_OLLAMA_RESPALDO=1`**.
- **B2 — `_clave_servidor`**: en modo compartido **ambos perfiles comparten UNA entrada** (antes se lanzaban dos llama-server sobre el mismo puerto 8790); el `keep_alive` de Ollama baja de 30 min a **2 min** (`ASTRAURA_OLLAMA_KEEP_ALIVE`).
- **B3** — presupuesto propio del subagente (**150 s, 256 tokens**) y errores con nombre en vez de fallos mudos.
- **B4 — causa raíz del segfault**: el llama-server **segfaulteaba en `dequantize_row_i2_s` ← `ggml_backend_blas_mul_mat`** con cualquier prompt ≥ 32 tokens (26 informes en `~/Library/Logs/DiagnosticReports/llama-server-*.ips` y 68 relanzamientos en el log). Se lanza con **`-ub 24 -b 24`** (`ASTRAURA_BITNET_UBATCH`) y la **sonda de cordura** prueba un prompt ≥ 64 tokens. **Verificado**: prompt largo servido sin caída, subagente con `n_exitosos 1` y Ollama vacío.
- **B5 (en curso)** — el BitNet **duerme tras 10 min sin uso** (`ASTRAURA_BITNET_SUENO_MIN`).
- También: Ollama.app se reinició con **`OLLAMA_KEEP_ALIVE=0`**.

## 4. Lección de memoria (presupuesto de los 8 GB)

Con el oído residente cargado, el reparto real es: BitNet 1,2 GB + backend 0,7–1,2 GB + app de Claude ~0,8 GB + tts-server 0,9 GB + oído 1,7 GB → **3,3 GB comprimidos y 3,8 GB de swap**. En Apple Silicon `vm_stat` usa **páginas de 16 KB**, no de 4 KB — al leer el swap de macOS hay que escalar los valores del `vm_stat` por ese factor.

## 5. Regla de trabajo de Alex (permanente)

Todo lo que pida lo ejecuta el **orquestador multiagéntico económico**; **Claude diseña las olas, supervisa en el Mando, verifica en localhost y aprueba**; nunca hace el trabajo él mismo. El orquestador ramifica por coste, releva ante 429/402 y deja el punto de relevo antes de agotar cupo.

## 6. Pendientes (para el siguiente relevo)

- **Probar el rito con una cuenta nueva** (la cuenta anterior se borró; hay respaldo JSON en `starseed_memory_root/respaldos/`).
- **VibeVoice-Realtime-0.5B como TTS en streaming** (latencia inicial ~300 ms).
- **Efectos y perfiles estilo Voicebox** en el Estudio de Voces (la Forja).
- **Precalentar las narraciones** del rito.
- **Disco de la Mac** (sigue siendo un recurso escaso: los builds lo muerden con `ENOSPC`).

---

**Relevo: siguiente adenda 228**