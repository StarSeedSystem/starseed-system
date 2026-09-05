# Forja de Voz 1.58 — SOP de la Ola 246 (Forja de Voz 1.58)

> Fuente de verdad de la Forja de Voz 1.58. Documenta el plan para fundir el
> código de varios modelos abiertos en **UN solo programa de voz** por
> personalidad, la arquitectura ternaria (1.58-bit) y las decisiones de licencia
> y hardware. **Datos reales:** este documento NO inventa modelos ni licencias:
> todo lo que dice sobre motores, fases, módulos y decisiones nace de
> `src/lib/voces/forja/manifiesto.ts`. Léelo antes de tocar la capa de voz.
>
> Última actualización: 2026-09-05 (Ola 246).

---

## 1. Propósito

Desarrollar la voz de StarSeed OS como **un único programa** construido a partir
del código de varios modelos de código abierto, con una **variación por cada
personalidad** de Astraura. Cita de Alex, la intención fundacional:

> «desarrollar la voz con el sistema 1.58 bit fusionando los programas
> inteligentemente desde su código de varios modelos código abierto y
> desarrollando un programa único con variaciones para cada personalidad»

Esto significa, en concreto:

- **Un solo programa**, no un zoo de motores sueltos. OmniVoice es hoy la voz
  base; el destino es un **LM de tokens de audio tipo Orpheus cuantizado a
  ternario 1.58-bit** con la receta QAT de BitNet.
- **Variaciones por personalidad**, no modelos distintos: el timbre, la `instruct`,
  la semilla, la prosodia y las etiquetas de emoción se aplican *sobre el mismo
  modelo*, como capas de condicionamiento.
- **Motor único «Voz StarSeed»** (`hablarStarSeed`, niveles estudio/alta/ligera/
  mínima) como puente hacia el OS. El daemon local OmniVoice vive en
  `127.0.0.1:4500` (puerta A) o `127.0.0.1:4444` (puerta B, demonio Astraura).

---

## 2. Las cuatro fases (hitos y estado)

Tomado de `FASES_FORJA` en `src/lib/voces/forja/manifiesto.ts`. La columna
**Estado** es el agregado que esa fuente define por hito.

| # | Fase | Descripción | Hitos | Estado global |
|---|---|---|---|---|
| 1 | **programa único** | Fundir con criterio el código de varios modelos abiertos en UN programa (motor de inferencia GGUF/ternario + frontend de texto en español + condicionamiento por personalidad). OmniVoice es la voz base hoy; Orpheus+BitNet es el camino al modelo acústico 1.58-bit. | `demonio-omnivoice` (hecho) · `motor-unico-os` (hecho) · `frontend-espanol` (pendiente) · `acustico-ternario` (bloqueado-por-hardware) | En curso |
| 2 | **variaciones por personalidad** | Cada personalidad con su variación (instruct, semilla, timbre, prosodia, etiquetas de emoción) sobre el mismo modelo. | `instruct-por-personalidad` (hecho) · `variaciones-catalogo` (en-curso) · `emociones-etiquetas` (pendiente) | En curso |
| 3 | **ajustes de personalización** | Controles para cada voz (velocidad, tono, intensidad/exageración, calidez, respiración, no verbales) guardados como versiones. | `ajustes-velocidad-tono` (hecho) · `intensidad-exageracion` (pendiente) · `versiones-guardadas` (hecho) | En curso |
| 4 | **editor de voces** | Crear voces nuevas (clonación con poco audio, conversión de timbre, fusión) sobre el modelo base 1.58 local, cuando ese modelo esté desarrollado a detalle. | `clonacion-poco-audio` (pendiente) · `conversion-timbre` (pendiente) · `fusion-de-voces` (hecho) · `editor-completo` (bloqueado-por-hardware) | En curso |

> Nota: `progresoFase()` y `progresoForja()` del manifiesto computan el %
> real a partir de los hitos `hecho`; el «Estado global» de esta tabla es una
> síntesis editorial, no el número exacto.

---

## 3. Arquitectura del programa único

`MODULOS_PROGRAMA` en el manifiesto define los eslabones. En orden de datos:

```
┌───────────────┬───────────────┬───────────────┬───────────────┬───────────────┬───────────────┐
│ frontend de   │ condicionam.  │ modelo        │ códec /       │ servidor      │ puente con el │
│ texto (es)    │ personalidad  │ acústico      │ vocoder       │ local         │ OS            │
├───────────────┼───────────────┼───────────────┼───────────────┼───────────────┼───────────────┤
│ normalización │ instruct +    │ HOY: OmniVoice│ GGUF via      │ daemon        │ hablarStarSeed│
│ y fonemización│ semilla por   │ GGUF por      │ omnivoice.cpp │ 127.0.0.1:4444│ niveles       │
│ en español    │ timbre;       │ omnivoice.cpp │ (Q8_0/Q4_K_M) │ pool de       │ estudio/alta/ │
│ (propia)      │ etiquetas de  │ META: LM de   │ + HiFT        │ tts-server    │ ligera/minima │
│               │ emoción        │ tokens audio  │ vocoder       │               │               │
│               │               │ Orpheus, QAT  │               │               │               │
│               │               │ BitNet 1.58   │               │               │               │
└───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴───────────────┘
```

Cada módulo (id del manifiesto, origen y estado):

| Módulo | Origen | Estado | Descripción en el manifiesto |
|---|---|---|---|
| `frontend-texto` | omnivoice | en-uso | Normalización y fonemización en español propia |
| `condicionamiento-personalidad` | omnivoice, chatterbox, dia | en-desarrollo | instruct + semilla por timbre; etiquetas de emoción para las variaciones |
| `modelo-acustico` | orpheus, bitnet, cosyvoice | planeado | LM de tokens de audio tipo Orpheus cuantizado a ternario con la receta de BitNet |
| `codec-vocoder` | omnivoice, cosyvoice | en-uso | GGUF vía omnivoice.cpp (Q8_0/Q4_K_M), HiFT vocoder |
| `servidor-local` | omnivoice | en-uso | `native/astraura-voice/daemon.mjs` |
| `cache-y-cola` | omnivoice | en-uso | `src/lib/aurora/motor-local.ts` |
| `puente-os` | kokoro | en-uso | `src/lib/aurora/voz-starseed/motor.ts` (motor único) |
| `conversor-timbre` | openvoice | planeado | Conversión de timbre sobre una voz base (tone color converter) |
| `clonacion` | gpt-sovits | planeado | Clonación con 1 min de audio (VITS + GPT) |

**Piezas de servidor / puente (estado real del repo):**

- **Demonio local** `native/astraura-voice/daemon.mjs` — servidor HTTP puro
  (módulo `http`, cero dependencias) en `127.0.0.1:4444`, con **pool de
  `tts-server`** en `127.0.0.1:4500+n` y respaldo CLI one-shot. Endpoints:
  `GET /status`, `POST /tts`, `POST /identity` (NO-OP), `POST /warm`. Sanea
  `instruct` contra `VALID_INSTRUCT_TOKENS` y usa `INSTRUCT_BY_PERSONALITY`;
  `--seed` es estable por personalidad.
- **Motor único** `src/lib/aurora/voz-starseed/motor.ts` — `hablarStarSeed()`,
  `nivelActual()`, `nivelPreferido()`, `fijarNivel()`, `precalentar()`.
- **Niveles** `src/lib/aurora/voz-starseed/niveles.ts` — `estudio` (Q8_0, ≥8 GB),
  `alta` (Q4_K_M), `ligera` (Kokoro WASM), `minima` (voz del sistema). El
  **timbre no cambia al bajar de nivel**; solo cambia el backend.

---

## 4. Decisiones de licencia

- **En el producto solo MIT / Apache-2.0.** El filtro `modelosUsablesEnProducto()`
  del manifiesto excluye `estado: "descartado-para-producto"` y toda licencia
  con `NC` (en `licencia` o `licenciaPesos`).
- **Pesos CC-BY-NC quedan como referencia de código, nunca como pesos.** Son
  `fish-speech` (`CC-BY-NC-SA-4.0`) y `f5-tts` (`CC-BY-NC-4.0`): de ellos **solo**
  se toman patrones (p. ej. streaming por trozos, referencia de flow matching),
  jamás sus pesos.

| Modelo | Licencia (código) | Pesos | Uso en producto |
|---|---|---|---|
| OmniVoice | Apache-2.0 | — | Sí (voz base) |
| Kokoro | Apache-2.0 | — | Sí (nivel ligera) |
| Orpheus | Apache-2.0 | — | Sí (meta del modelo acústico) |
| BitNet | MIT | — | Sí (inferencia ternaria + receta QAT) |
| Chatterbox | MIT | — | Sí (control de exageración) |
| CosyVoice 2 | Apache-2.0 | — | Sí (arquitectura de referencia) |
| VoxCPM | Apache-2.0 | — | Sí (síntesis en espacio continuo) |
| GPT-SoVITS | MIT | — | Sí (flujo de clonación) |
| OpenVoice V2 | MIT | — | Sí (conversor de timbre) |
| Dia | Apache-2.0 | — | Sí (etiquetas no verbales) |
| KittenTTS | Apache-2.0 | — | Sí (reserva, sin novedad) |
| Fish-Speech | Apache-2.0 | CC-BY-NC-SA-4.0 | **No** (referencia de código) |
| F5-TTS | MIT | CC-BY-NC-4.0 | **No** (referencia de código) |

---

## 5. Qué se toma de cada modelo

Desde `MODELOS_FUENTE` (campo `queTomamos`), resumido:

| Modelo | Estado | Qué se toma |
|---|---|---|
| OmniVoice (k2-fsa) | en-uso | Motor de inferencia GGUF (omnivoice.cpp) que corre en el demo 127.0.0.1:4444; esquema de «instruct» por timbre; semilla determinista por personalidad |
| Kokoro-82M | en-uso | Vía WASM en navegador (nivel ligera); diseño de voces por vector de estilo (`voice` + `speed`) |
| VoxCPM | candidato | Sintetizar en espacio continuo (sin códec discreto) para el módulo acústico |
| Orpheus TTS | candidato-principal | Receta «LM de texto → tokens de audio» sobre backbone Llama (lo que BitNet b1.58 cuantiza a ternario); etiquetas de emoción para variaciones por personalidad |
| Fish-Speech | descartado-para-producto | Solo patrones de código (streaming por trozos), nunca sus pesos |
| Chatterbox | candidato | Control continuo de «exageración/intensidad» como ajuste de personalización |
| F5-TTS | descartado-para-producto | Referencia de flow matching para un vocoder ligero |
| CosyVoice 2 | candidato | Separación tokens semánticos → flow matching → vocoder, como arquitectura de referencia |
| GPT-SoVITS | candidato | Flujo de clonación con poco audio para el editor de voces (fase 4) |
| OpenVoice V2 | candidato | Conversor de timbre como capa de «variación por personalidad» sin reentrenar |
| Dia | candidato | Etiquetas no verbales (risa, suspiro) para expresividad |
| KittenTTS | en-uso | Referencia de tamaño mínimo (nada nuevo) |
| BitNet b1.58 | en-uso | Motor de inferencia ternario y receta QAT para el modelo acústico |

---

## 6. Realidad del hardware

- **La Mac de 8 GB solo infiere.** Caben **una** copia del modelo (~900 MB con
  Q8_0) residente; el demonio Astraura con su pool evita levantar dos copias a la
  vez. Síntesis local ~9× tiempo real sobre CPU (Apple Silicon usa Metal).
- **Entrenar o cuantizar requiere GPU en la nube.** El QAT 1.58-bit de un LM de
  tokens de audio tipo Orpheus (hito `acustico-ternario`) y el editor completo
  están **bloqueados-por-hardware**: no se hacen en local.
- **Mientras tanto se avanza en lo que no pide GPU:** frontend de texto en
  español, condicionamiento por personalidad, etiquetas de emoción, ajustes de
  personalización y el editor sobre el motor actual (OmniVoice).
- **Eficiencia por cuantización:** pesos ternarios −1/0/+1 — sin GPU ni
  multiplicaciones en coma flotante, solo sumas en CPU. Es lo que permite que un
  móvil viejo y un portátil sin gráfica corran lo mismo (fundamento en
  `src/lib/aurora/timbres.ts`).

---

## 7. Dónde vive cada cosa en el repo

| Responsabilidad | Ruta | Notas |
|---|---|---|
| Demonio local (pool de tts-server, puerta B) | `native/astraura-voice/daemon.mjs` | 127.0.0.1:4444; respaldo CLI one-shot; `VALID_INSTRUCT_TOKENS` |
| Motor local (sondeo + síntesis) | `src/lib/aurora/motor-local.ts` | Cache 5 min; marca «ausente 3 min» |
| Motor único «Voz StarSeed» (puente OS) | `src/lib/aurora/voz-starseed/motor.ts` | `hablarStarSeed()`; clave LS `starseed.voz.nivel` |
| Niveles (estudio/alta/ligera/mínima) | `src/lib/aurora/voz-starseed/niveles.ts` | `nivelPara()`, cadena de degradación |
| **Manifiesto de la Forja (fuente de datos)** | `src/lib/voces/forja/manifiesto.ts` | `MODELOS_FUENTE`, `FASES_FORJA`, `MODULOS_PROGRAMA` |
| Panel de la Forja (UI, **planificado**) | `src/components/voces/panel-forja.tsx` | Aún por crear (esta ola) |
| Endpoint de la Forja (**planificado**) | `src/app/api/voz/forja/route.ts` | Aún por crear (esta ola) |
| Catálogo de voces (documentación) | `memory/voces-catalogo.md` | Reglas del área, mapa de motores y timbres |

---

## 8. Próximos pasos concretos (para el enjambre)

| # | Tarea | Archivo | Criterio de verificación |
|---|---|---|---|
| 1 | Crear el panel de la Forja que lea `MODELOS_FUENTE`/`FASES_FORJA`/`MODULOS_PROGRAMA` del manifiesto y muestre fases con su progreso (`progresoFase`) | `src/components/voces/panel-forja.tsx` | `tsc --noEmit` limpio; cursor-pointer en clicable; no `any` |
| 2 | Crear la ruta API `/api/voz/forja` que devuelva el manifiesto serializado (solo lectura, sin secretos) | `src/app/api/voz/forja/route.ts` | `GET` responde JSON con modelos/fases/módulos; `tsc` limpio |
| 3 | Documentar el estado de la fase 2 (catálogo de variaciones por personalidad) en `memory/voces-catalogo.md` | `memory/voces-catalogo.md` | Tabla de variaciones consistente con `instruct` por timbre |
| 4 | Avanzar `frontend-espanol` (normalización/fonemización propia): módulo aislado con tests | `src/lib/voces/forja/` (módulo nuevo) | Tests de fonemización en español pasan; sin `any` |
| 5 | Añadir etiquetas de emoción al condicionamiento por personalidad (fase 2, hito `emociones-etiquetas`) | `src/lib/aurora/voz-starseed/` o manifiesto | `tsc` limpio; etiquetas mapeadas por personalidad |
| 6 | Control continuo de «exageración/intensidad» (fase 3, hito `intensidad-exageracion`) | `src/lib/voces/forja/manifiesto.ts` + UI | Parámetro persistido; se refleja en el timbre sintetizado |

> Reglas transversales: TypeScript estricto sin `any`; cursor-pointer en lo
> clicable; comentarios y textos en español (con acentos); nunca escribir claves
> ni rutas de secretos; no tocar archivos fuera de la lista salvo imprescindible.