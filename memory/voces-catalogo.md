# Catálogo de Voces del Sistema StarSeed OS

> Documentación técnica del sistema de voz. Fuente de verdad para cualquier agente que necesite entender, modificar o extender la capa de síntesis de voz del OS. Última actualización: 2026-09-04 (Ola 235).

---

## 1. Modelo definitivo: motor único «Voz StarSeed»

Desde la Ola 228 el OS tiene **un solo punto de entrada** para hablar: `hablarStarSeed()` en `src/lib/aurora/voz-starseed/motor.ts`. Antes cada ventana (rito, sistemas, guía del Escritorio) elegía su motor por su cuenta y la voz sonaba distinta según por dónde saliera. Ahora hay una sola decisión arquitectónica:

- **El timbre es la identidad de la voz y NO cambia al cambiar de nivel.** El usuario escucha siempre la misma personalidad sonora.
- **El nivel solo decide QUÉ backend la sintetiza**, con más o menos precisión según el hardware disponible. Si un nivel falla, se degrada al siguiente CON EL MISMO TIMBRE y se avisa por `alDegradar`. Nunca se lanza una excepción a la interfaz.

### Los cuatro niveles

| Nivel | Backend | RAM modelo | Latencia | Calidad | Archivo |
|---|---|---|---|---|---|
| `estudio` | OmniVoice GGUF Q8_0 vía demonio local (`motor-local.ts`) | ~1000 MB | Baja (local) | Máxima, grado de estudio | `src/lib/aurora/voz-starseed/niveles.ts:34-41` |
| `alta` | OmniVoice GGUF Q4_K_M vía demonio local | ~600 MB | Baja (local) | Alta, casi estudio | `niveles.ts:42-49` |
| `ligera` | Kokoro ONNX/WASM en el navegador (`tts-oss/kokoro.ts`) | ~120 MB | Media (primera carga) | Buena y estable | `niveles.ts:50-57` |
| `minima` | Voz del sistema operativo (`speechSynthesis`) | 0 MB | Inmediata | Variable según el SO | `niveles.ts:58-65` |

La cadena de degradación es fija: `estudio → alta → ligera → minima → null`. La función `siguienteNivel()` en `niveles.ts:98-101` devuelve el siguiente escalón o `null` si ya se está en el mínimo.

### Por qué la identidad no cambia

`parametrosPorNivel()` en `motor.ts:95-114` traduce el mismo objeto `Timbre` a los parámetros nativos de cada backend:

- **estudio/alta** → `{ via: "local", voz, speed, instruct }` (OmniVoice entiende la voz neuronal, la velocidad y la instrucción de carácter).
- **ligera** → `{ via: "kokoro", voice, speed }` (Kokoro usa los mismos nombres de voz neuronal).
- **minima** → `{ via: "sistema", pitch, rate }` (la Web Speech API solo puede expresar tono y ritmo).

El timbre viaja intacto; solo cambia cómo lo expresa cada motor. Eso garantiza que Aurora suene como Aurora en cualquier dispositivo, desde un portátil con 16 GB hasta un móvil viejo sin GPU.

### Resolución automática de nivel

`resolverNivel()` en `motor.ts:73-79` combina tres fuentes en orden de prioridad:

1. Nivel explícito pasado por el llamador (`opciones.nivel`).
2. Preferencia del usuario guardada en `localStorage` bajo la clave `starseed.voz.nivel` ("auto" = decidir por hardware).
3. Mejor nivel que el hardware puede sostener ahora mismo, calculado por `nivelPara(capacidades)` en `niveles.ts:78-83`:
   - Demonio local + ≥8 GB RAM → `estudio`
   - Demonio local (sin requisito de RAM) → `alta`
   - Escritorio con WebGPU o WASM SIMD → `ligera`
   - Cualquier otro caso → `minima`

---

## 2. Las 12 voces predeterminadas

Definidas en `src/lib/aurora/timbres.ts:74-92` como el array `TIMBRES`. Cada entrada es una **receta fija** (no un ranking que se recalcula en cada pulsación):

| id | Nombre | Género | Voz interna | Speed | Instruct | Expr (arco/vivacidad/calidez) | Descripción |
|---|---|---|---|---|---|---|---|
| `fem-aurora` | Aurora | femenina | `ef_dora` | 1.00 | `female, young adult, moderate pitch` | 0.16 / 0.10 / 0.14 | Cálida, cercana y natural |
| `fem-luna` | Luna | femenina | `ef_dora` | 1.14 | `female, young adult, high pitch` | 0.22 / 0.20 / 0.10 | Luminosa y expresiva |
| `fem-vega` | Vega | femenina | `ef_dora` | 0.86 | `female, middle-aged, low pitch` | 0.10 / 0.05 / 0.06 | Profunda y envolvente |
| `fem-iris` | Iris | femenina | `ef_dora` | 1.28 | `female, teenager, very high pitch` | 0.26 / 0.28 / 0.12 | Ágil, viva y despierta |
| `masc-orion` | Orión | masculina | `em_alex` | 0.94 | `male, middle-aged, low pitch` | 0.13 / 0.08 / 0.08 | Grave y sereno |
| `masc-atlas` | Atlas | masculina | `em_santa` | 0.86 | `male, elderly, very low pitch` | 0.08 / 0.04 / 0.04 | Rotundo y solemne |
| `masc-hermes` | Hermes | masculina | `em_alex` | 1.18 | `male, young adult, moderate pitch` | 0.24 / 0.26 / 0.16 | Cercano y conversacional |
| `masc-kepler` | Kepler | masculina | `em_santa` | 1.02 | `male, middle-aged, moderate pitch` | 0.11 / 0.06 / 0.10 | Suave y reflexivo |
| `neu-zenit` | Zenit | neutra | `em_alex` | 1.06 | `young adult, moderate pitch` | 0.15 / 0.14 / 0.10 | Equilibrado y claro |
| `neu-eco` | Eco | neutra | `ef_dora` | 0.92 | `middle-aged, low pitch, whisper` | 0.10 / 0.07 / 0.07 | Sereno, sin marca |
| `neu-nova` | Nova | neutra | `em_alex` | 1.22 | `teenager, high pitch` | 0.23 / 0.24 / 0.13 | Brillante y despierto |
| `neu-solis` | Solis | neutra | `em_santa` | 1.10 | `elderly, very low pitch` | 0.12 / 0.06 / 0.09 | Amplio y calmado |

### Dónde se definen y cómo se editan

- **Fuente de verdad en código:** `src/lib/aurora/timbres.ts` (array `TIMBRES`, líneas 74-92). Cambios aquí afectan a todos los usuarios que no hayan personalizado.
- **Catálogo editable en runtime:** `src/lib/aurora/voces-catalogo.ts` construye una vista `VozEditable` sobre `TIMBRES`. Las ediciones del usuario se guardan en `localStorage` bajo la clave `starseed.voces.v1` y tienen precedencia sobre el código. Funciones clave:
  - `cargarVoces()` — devuelve las 12 base sustituidas por sus ediciones + clones.
  - `guardarVoz(v)` — persiste una edición (marca `origen: "editada"`).
  - `clonarVoz(id, nombre)` — crea una variante propia con id `clon-<base>-<n>` sin tocar la original.
  - `restablecerVoz(id)` — borra la edición y vuelve al valor de `TIMBRES`.
  - `exportarVoces()` / `importarVoces(json)` — backup completo del catálogo.
- **Interfaz de usuario:** `/voces` (montada en el Studio 1.58 como sección de VoiceStudio). Lee de `voces-catalogo.ts` y escribe en la misma clave `starseed.voces.v1`.
- **Predeterminados por género:** `TIMBRE_PREDETERMINADO` en `timbres.ts:94-98` → `femenina: fem-aurora`, `masculina: masc-orion`, `neutra: neu-zenit`.
- **Base autónoma:** `TIMBRE_AUTONOMO_BASE = "neu-zenit"` (`timbres.ts:105`). La voz autónoma parte de la neutra como base más libre de marca.

### Expresividad (Adenda 215)

Cada timbre lleva tres números en `expr` que convierten una voz plana en un personaje:

- **arco** — cuánto CAE el tono del principio al final de la frase (declinación entonativa). Sin ella suena a lista de la compra.
- **vivacidad** — cuánto varía la velocidad entre cláusulas. Alto = ágil y conversacional; bajo = pausado y solemne.
- **calidez** — cuánto se abre el tono en las cláusulas de apertura (cercanía percibida).

Estos valores los aplica `partirEnClausulas()` + el bucle de entrega expresiva en `voz-rito.ts:321-357` cuando habla por la vía del sistema, y el agente de entonación (`agente-entonacion.ts`) cuando decide el timbre en modo autónomo.

---

## 3. Daemon local OmniVoice

### Qué es

OmniVoice es el motor de síntesis neuronal de Astraura 1.58-bit. Corre como un **demonio HTTP local** en `127.0.0.1:4500` y acepta peticiones de síntesis con modelos GGUF cuantizados (Q8_0 para estudio, Q4_K_M para alta). Al ser un proceso separado del navegador, no compite por recursos con la UI y puede usar toda la RAM/CPU disponible.

### Dónde vive

- **Binario y modelos:** instalados por el Instalador Universal del OS (sección «Instalador Universal & Scan» del Studio 1.58). Los modelos GGUF se descargan bajo demanda.
- **Cliente en el OS:** `src/lib/aurora/motor-local.ts` — funciones `estadoMotorLocal()`, `hablarLocalPorFrases()`, `precalentarMotorLocal()`, `anticiparLocal()`, `pararLocal()`. Todas hacen fetch a `http://127.0.0.1:4500/...`.
- **Proxy para la nube:** `/api/ai/astraura-158/*` reenvía al backend Cloud Run cuando el daemon local no está.

### Cómo se levanta y se comprueba

```bash
# Comprobar si el daemon responde
curl -s http://127.0.0.1:4500/health

# Desde el OS: estado estructurado
# motor-local.ts → estadoMotorLocal() devuelve { listo, version, modelo }
```

El OS sondea el daemon automáticamente en `precalentar()` (`motor.ts:249-265`) y en cada llamada a `hablarPorLocal()` (`motor.ts:135-144`). Si el daemon no responde, `estadoMotorLocal().listo === false` y el motor único degrada al siguiente nivel sin error visible.

### Qué pasa si está apagado

Nada catastrófico. El motor único baja de nivel:

1. Intenta `estudio` → falla porque el daemon no responde.
2. Intenta `alta` → mismo daemon, mismo fallo.
3. Intenta `ligera` → Kokoro WASM en el navegador (si el modelo está descargado).
4. Intenta `minima` → voz del sistema operativo (siempre funciona).

El usuario ve el indicador de nivel actual (`nombreNivelActual()` en `motor.ts:268-272`) y puede instalar el daemon desde el Instalador Universal para recuperar la calidad alta.

---

## 4. Cómo mejorar una voz

### Editar → Probar → Guardar

1. Abrir `/voces` (o la sección VoiceStudio del Studio 1.58).
2. Seleccionar una voz existente. Modificar speed, instruct, expr.
3. Pulsar «Probar» → llama a `hablarStarSeed()` con el timbre modificado pero SIN guardar.
4. Si gusta, «Guardar» → `guardarVoz()` persiste en `starseed.voces.v1` con `origen: "editada"`.
5. Si no, «Restablecer» → `restablecerVoz()` borra la edición y vuelve al valor de `TIMBRES`.

### Clonar → Crear variante propia

1. En `/voces`, seleccionar una voz base y pulsar «Clonar».
2. `clonarVoz(id, nombre)` crea una copia con id `clon-<base>-<n>` y `origen: "clon"`.
3. Editar la copia libremente. La original queda intacta.
4. Los clones aparecen en `cargarVoces()` filtrados por `origen === "clon"`.

### Subir cambios a los valores por defecto

Las ediciones en `localStorage` son **por usuario y por dispositivo**. Para cambiar los valores por defecto de TODOS los usuarios:

1. Editar directamente `src/lib/aurora/timbres.ts` (array `TIMBRES`).
2. Validar que los tokens de `instruct` están en `VALID_INSTRUCT_TOKENS` del daemon (solo tokens de género/edad/tono; texto libre en español es rechazado por `sanitizeInstruct`).
3. Commit + push → deploy automático en Vercel.
4. Los usuarios que no hayan personalizado esa voz recibirán el nuevo valor en la siguiente carga. Los que sí la editaron mantienen su versión (su edición tiene precedencia).

### Añadir una voz nueva al catálogo base

1. Añadir una entrada a `TIMBRES` en `timbres.ts:74-92` con id único, voz neuronal válida (`ef_dora`, `em_alex` o `em_santa`), speed, instruct y expr dentro de rangos seguros.
2. Si es de un género nuevo o necesita una voz neuronal distinta, añadirla primero al daemon OmniVoice.
3. Actualizar `TIMBRE_PREDETERMINADO` si la nueva voz debe ser la predeterminada de su género.
4. Documentar en esta tabla (§2) y en el changelog de la ola correspondiente.

---

## 5. Camino del motor propio universal

### Estado actual

El motor propio hoy es **OmniVoice + Kokoro** como vías complementarias. OmniVoice requiere un daemon local; Kokoro corre en el navegador pero con modelos más pequeños (~120 MB vs ~1000 MB). Ambos usan las mismas voces neuronales (`ef_dora`, `em_alex`, `em_santa`) para garantizar coherencia.

### Decisiones abiertas

- **Dataset propio:** aún no existe un corpus de voz StarSeed grabado específicamente. Las voces actuales son modelos open-source (Kokoro/Chatterbox/VoxCPM) fine-tuneados con instrucciones de estilo. Un dataset propio permitiría clonar voces de la comunidad con consentimiento y entrenar un modelo base StarSeed.
- **Clonación por usuario:** `generarTimbreUnico()` en `timbres.ts:157-185` crea timbres aleatorios dentro de rangos seguros, pero no clona la voz real del usuario. La clonación real requiere un WAV de referencia (`local.ref`) y soporte en el daemon para few-shot adaptation. Está diseñado pero no implementado.
- **Adaptación por hardware:** `detectarCapacidades()` en `capacidades.ts` mide RAM, WebGPU, WASM SIMD y presencia del daemon, pero no adapta la calidad del modelo en tiempo real (solo elige nivel). Futuro: streaming de chunks de audio para reducir latencia percibida, o modelos dinámicos que ajustan quantization según carga térmica.
- **Voces multilingües:** los instruct actuales son en inglés (`female, young adult, moderate pitch`) porque el daemon los sanitiza contra un whitelist en inglés. Soporte para instruct en español requiere ampliar `VALID_INSTRUCT_TOKENS` en el backend.

---

## 6. Historial: por qué la voz cambiaba entre ventanas

### El problema (antes de la Ola 227)

Cada superficie del OS (rito, chat, guía, notificaciones) tenía su propia lógica de selección de motor:

- El rito usaba `voz-rito.ts` con relevo verificado.
- El chat usaba `speakWithConfiguredEngine()` directamente.
- La guía del Escritorio usaba `speechSynthesis` sin verificación.
- Las notificaciones usaban un camino distinto.

Resultado: la misma personalidad sonaba con voces distintas según la ventana activa. El usuario percibía inconsistencia y perdía confianza en la identidad de Aurora.

### La solución (Olas 227-228)

1. **Ola 227:** se unificó la selección de timbre en `timbreEfectivo()` (`voz-rito.ts:120-162`), que respeta el modo de voz (autónoma/fija) y delega en el agente de entonación cuando corresponde.
2. **Ola 228:** se creó el motor único `hablarStarSeed()` (`motor.ts:196-242`) como **único punto de entrada**. Todas las superficies pasan por él. El timbre viaja como parámetro; el nivel se resuelve una sola vez. La degradación es grácil y nunca cambia la identidad.
3. **Verificación:** se comprobó en localhost que las 12 voces suenan idénticas en `/agent`, `/dashboard`, `/escritorios` y el rito de onboarding. El nivel mostrado en la UI coincide con el backend activo.

### Lecciones aprendidas

- **La identidad de la voz es un contrato con el usuario.** Cambiarla involuntariamente rompe la ilusión de continuidad. El timbre debe ser inmutable a través de contextos.
- **El nivel es un detalle de implementación.** Al usuario le importa QUE suene bien en su equipo, no CÓMO se logra. La UI muestra el nivel como información, no como elección identitaria.
- **La degradación debe ser silenciosa.** Si el daemon falla, el usuario no debe ver un error sino escuchar la misma voz con menor fidelidad. El aviso `alDegradar` es para la UI, no para el usuario final.
- **Los instruct en español fallan.** El daemon sanitiza contra un whitelist en inglés. Documentado en `timbres.ts:77` y pendiente de ampliación.

---

## Referencias cruzadas

- Motor único: `src/lib/aurora/voz-starseed/motor.ts`
- Niveles: `src/lib/aurora/voz-starseed/niveles.ts`
- Capacidades hardware: `src/lib/aurora/voz-starseed/capacidades.ts`
- Timbres (catálogo base): `src/lib/aurora/timbres.ts`
- Catálogo editable: `src/lib/aurora/voces-catalogo.ts`
- Rito de voz (entrada histórica, ahora delega en motor único): `src/lib/aurora/voz-rito.ts`
- Motor local (cliente del daemon): `src/lib/aurora/motor-local.ts`
- Kokoro WASM: `src/lib/aurora/tts-oss/kokoro.ts`
- Speak router (cadena OSS): `src/lib/aurora/tts-oss/speak-router.ts`
- Agente de entonación: `src/lib/aurora/agente-entonacion.ts`
- Onboarding (usa el rito): `src/lib/onboarding/onboarding.ts`, `src/components/onboarding/onboarding-wizard.tsx`

</content>