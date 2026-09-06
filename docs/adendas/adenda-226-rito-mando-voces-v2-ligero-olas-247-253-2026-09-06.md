# Adenda 226 · Rito fluido, Mando con ola activa viva, motor de voces v2 y modo ligero

> **Fecha:** 2026-09-06 · **Olas:** 247–253 (rito fluido · mando ola activa · motor de voces v2 · voz que despierta · instalador VibeASR · voz en modo ligero) · **Área:** rito, mando, voz.
> Adenda de relevo del día: lo verificado en vivo en la Mac de Alex (2026-09-05/06) y el punto de relevo para la siguiente sesión/agente. Reglas del área: motor único «Voz StarSeed» con cuatro niveles (estudio/alta/ligera/mínima) y demonio local OmniVoice en `127.0.0.1:4500`; el rito guarda su estado en la tabla `onboarding_state` (columnas `skipped`/`skipped_at`) y nunca deja al usuario en bucle; las rutas `/api/mando/*` son SOLO locales (404 en producción) y jamás devuelven claves ni rutas del disco.

---

## 1. Ola 247 · Rito fluido (un solo director de estados)

**Problema verificado:** el rito de bienvenida pedía **dos veces** el inicio de sesión y **recargaba la página** entre ventanas. La causa: la cadena encadenaba VENTANAS con marcas sueltas de `sessionStorage` (`starseed.recien.registrado`, `starseed.sistemas.launch`, `starseed.guia.tras.perfil`…) y navegaciones DURAS (`window.location.assign`); varios porteros globales reaccionaban al mismo cambio de sesión y el resultado era doble petición de login, recargas y ventanas fuera de orden.

**La solución:** `src/lib/onboarding/director-rito.ts` — **UNA sola máquina de estados**, sin React y sin Next.js (probable en Node): registro → bienvenida → sistemas → perfil → guía → hecho. Cada ventana solo pregunta «¿es mi turno?» (`esMiTurno`) y avisa al terminar (`terminarEtapa`), que solo avanza si la etapa que cierra ES la actual — una ventana que se cierra tarde ya no desordena el rito.

- Estado de la sesión en `sessionStorage` (`starseed.rito.v2`); **caducidad de 6 h** (`CADUCIDAD_MS`): un rito abandonado no secuestra la sesión al día siguiente.
- `navegarSuave`: navega con el router del App Router y, como ÚLTIMO recurso y solo tras una espera (1,5 s), con `window.location.assign` — un modal abierto puede cancelar `router.push` en silencio, y eso era lo que obligaba a recargar.
- Migración de marcas legadas: una sesión a medio rito cuando se desplegó el director deduce su etapa y borra TODAS las marcas viejas para no disparar dos flujos a la vez.
- REGLA DEL ÁREA: el estado duradero («completado/pospuesto») vive en `onboarding_state`; aquí solo se coordina la secuencia de ESTA sesión.
- R4 (misma ola): la voz queda lista desde la primera ventana — precalentado del motor al abrir `/login` y `/bienvenida` y mantenerlo caliente durante el rito.

## 2. Ola 248 · Mando: la ola activa ya no dice «0 en curso»

El Mando mostraba «0 en curso» aunque hubiera agentes vivos. Causa: los ids de tarea de la Ola 247 (R1-R4) **chocaban** con los de la Ola 227 (también R1-R4); deduplicar solo por id hacía invisibles las tareas nuevas que llegaban por el bus cuando la máquina ya conocía una cola vieja con esos ids.

`src/lib/mando/ramificacion.ts` deduplica ahora por **`ola|id`** (`claveTarea`) y casa los latidos por **`cola|id`** (`claveLatido`, normalizando el formato de cola local vs. bus: `cola-247-rito-fluido.json` vs. `247-rito-fluido`). Sin esto, el latido de «R2» de la 247 se pegaba a la «R2» de la 227. Un id solo solo se acepta si la tarea aún no tiene cola conocida. Test: `src/lib/__tests__/mando-ramificacion-ids.test.ts`. La cabecera se **relee cada 20 s**, de modo que los agentes siguen contándose aunque la pestaña esté oculta.

## 3. Ola 249 · Motor de voces v2 (manifiesto + §9 del SOP)

Dirección de Alex: **un solo programa de voz 1.58-bit** que fusiona el código de varios modelos abiertos, con **variaciones por personalidad** (no modelos distintos), ajustes por voz, y después un editor de voces sobre el modelo Astraura 1.58 local.

- Manifiesto de la Forja (`src/lib/voces/forja/manifiesto.ts`): **16 modelos de código abierto** catalogados, entre ellos **VibeVoice** y **VibeVoice-Realtime-0.5B** de Microsoft, **VibeASR.cpp** (runtime ternario 1.58-bit) y **Voicebox** de `jamiepine` (MIT). Solo MIT/Apache-2.0 en producto; lo no comercial queda como referencia de código.
- `architecture/forja-voz-158.md` §9 «Motor de voces v2»: Oído = VibeASR.cpp ternario en el demonio (primer módulo 1.58-bit real); Voz = OmniVoice hoy con VibeVoice-Realtime-0.5B como candidato a TTS en streaming; Estudio = patrones de Voicebox (cola, tomas, efectos).
- El Estudio de Voces gana una **cola de generación con estado en vivo** e **historial de tomas con linaje** (patrón Voicebox): `src/lib/voces/tomas.ts` (estado en-cola → sintetizando → lista/error, `padreId` + `version` hasta 5 generaciones, tope de 40 tomas en `localStorage`, SSR-safe).

## 4. Ola 250 · Rito sin secuestro (regresión crítica corregida)

La guía del rito redirigía **TODAS** las rutas a `/escritorios`: navegaba antes de comprobar si era su turno, así que el Mando —y cualquier otra página— saltaba al escritorio. Ahora la guía **comprueba el turno primero** y solo navega desde rutas del rito, **nunca desde la consola** (`esRutaConsola`). Verificado en vivo: `/mando` se queda en `/mando`. Además, un rito viejo (más de 6 h) caduca y se borra — REGLA DEL ÁREA: el rito nunca deja al usuario en bucle.

## 5. Ola 251 · Voz que despierta

El demonio de voz (`127.0.0.1:4444`) esperaba **solo 30 s** a que el tts-server (OmniVoice Q8_0, ~900 MB) respondiera `/health`. En la Mac de 8 GB de Alex, con el dev server (3–5 GB), el backend Astraura 1.58 (1,3 GB), Ollama `qwen2.5:1.5b` (1,16 GB, que el EconomicRouter del backend Astraura recarga periódicamente) y la app de Claude, el modelo tardaba más y 30 s lo mataba antes de arrancar.

La espera ahora es **`STARSEED_VOZ_HEALTH_MS`** (por defecto **90 s**, mínimo 15 s) y, si el proceso sigue vivo, se **prolonga en tramos hasta 4 min** (no se mata un tts-server que aún carga: el CLI tendría que recargar el modelo entero, aún más caro). `/status` expone **`despertando`**, **`despertandoDesdeMs`**, **`memoriaLibreMb`** y el bloque **`asr{...}`**. El panel del Motor y el motor único distinguen «despertando (N s)» de «apagado» y esperan al demonio que despierta.

## 6. Ola 252 · Instalador VibeASR y «Oído 1.58»

`native/astraura-voice/install-vibeasr.sh` (MIT) instala VibeASR.cpp en `~/.starseed/astraura-voice/vibeasr.cpp`:
- clona con submódulos (`git submodule update --init --recursive --depth 1` para `3rdparty/llama.cpp`, que es imprescindible para `cmake`),
- compila `build/bin/asr_infer`,
- baja de Hugging Face `microsoft/VibeVoice-ASR-BitNet` los GGUF `vibeasr-vae-encoder-i8_s.gguf` (703 MB) y `vibeasr-lm-i2_s-embed-q6_k.gguf` (993 MB), comprobando tamaños y con modo `--simular`.

El demonio expone **`POST /asr`** (cola FIFO, un proceso a la vez) que **siempre entrega un WAV 16 kHz mono** a `asr_infer` (corregido en la Ola 253: antes el temporal iba como `.bin` y `asr_infer` solo acepta `.wav`/`.mp3`). El proxy `/api/voz-local/asr` y la pestaña **«Oído 1.58»** de `/voces` (`src/components/voces/panel-oido.tsx`) graban del micrófono o suben audio y transcriben, mostrando estado de instalación y RTF aproximado. **Verificado** transcribiendo una frase real de Aurora en español: RTF 13–32 bajo presión de memoria frente a ~0,5 de referencia.

## 7. Ola 253 · Voz y Mando en modo ligero

`scripts/starseed-ligero.sh {construir|arrancar|parar|estado|dev}` sirve el OS **compilado en producción** (`next start -p 9002`, ~48 MB frente a los 3–5 GB del dev server), dejando aire para la voz neuronal y el 1.58 en los 8 GB.

- **`src/lib/aurora/voz-starseed/puerta-local.ts`** (`esDespliegueLocal`, `exigirSesionSalvoLocal`): en producción solo se exige sesión si el despliegue NO es local (localhost/127.0.0.1/[::1]/*.local o `STARSEED_LOCAL=1`); **en Vercel (`VERCEL=1`) nunca se abre la puerta**.
- El **guardián del Mando** (`src/lib/mando/guardian.ts`) acepta localhost con la misma puerta, y `starseed-ligero.sh` arranca exportando **`STARSEED_MANDO=1` y `STARSEED_LOCAL=1`** — así la voz y el Puente de Mando funcionan **sin sesión en localhost**, nunca en Vercel.
- **Verificado:** tts-server listo en 30–38 s; 4,4 s de audio en 48 s.
- **Lecciones:** el build necesita **heap de 4 GB** (2 GB se queda sin memoria) y ~2 GB de disco (falló con `ENOSPC` con 5,6 GB libres; se liberó borrando `.next`, la caché de npm y `.gitnexus/parse-cache`). Documentado también en `DESPLIEGUE.md` (sección «Modo ligero en la Mac»).

## 8. Regla de trabajo de Alex (permanente)

Todo lo que pida lo ejecuta el **orquestador multiagéntico económico**; **Claude diseña las olas, supervisa en el Mando, verifica en localhost y aprueba**; nunca hace el trabajo él mismo. El orquestador ramifica por coste, releva ante 429/402 y deja el punto de relevo antes de agotar cupo.

## 9. Pendientes (para el siguiente relevo)

- **Probar el rito con una cuenta nueva** (la cuenta anterior se borró; hay respaldo JSON en `starseed_memory_root/respaldos/`).
- **Medir el RTF de VibeASR en modo ligero** (con el dev server daba 13–32; con aire de memoria debe acercarse al ~0,5 de referencia).
- **VibeVoice-Realtime-0.5B** como TTS en streaming (latencia inicial ~300 ms).
- **Efectos/perfiles estilo Voicebox** en el Estudio (módulo `efectos-y-tomas`, pendiente).
- **Que el backend Astraura use BitNet en vez de Ollama** en `economic_router.py` (repo `astraura`; requiere autorización de Alex).
- **Reiniciar Ollama.app** para que `OLLAMA_KEEP_ALIVE=0` aplique.

---

**Relevo: siguiente adenda 227**