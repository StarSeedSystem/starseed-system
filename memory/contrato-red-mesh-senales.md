# Red Mesh · Señales · Inferencia Distribuida · Voz suptonica (1.58/needle)

Hoja de ruta de integración de tres proyectos externos en StarSeed OS, para la red mesh,
la sección Señales, la biblioteca y el estudio de voces. **El orden de las olas lo deciden
los directores** (`scripts/puente/prioridad_logica.py`, determinista y explicable): este
documento es el contrato que ordenar y partir en tareas, no una lista fija.

Repos anclados (referencias abiertas, Apache-2.0 / MIT):
1. NVIDIA **Personal AI Router (PAIR)** — router de inferencia local que reparte peticiones
   entre nodos de la misma red. Endpoints Ollama- y OpenAI-compatibles.
   → https://github.com/NVIDIA/Personal-AI-Router
2. **buildwithparallel** — kit off-grid de networking soberano (mesh radios, Wi-Fi HaLow,
   Reticulum, ATAK, redes local-first con hardware de commodity). «Para la gente», batería
   de herramientas que se adaptan y mejoran.
   → https://buildwithparallel.com · https://github.com/buildwithparallel
3. **Supertone Supertonic / supertonic-oss-archive** — TTS on-device veloz, 31 idiomas,
   inferencia ONNX **sin GPU**, multimedio (py/web/java/cpp/c#/go/swift/rust/flutter).
   → https://github.com/supertone-oss-archive/supertonic (archivado: se toma código como
   referencia ARRIBA; adaptación y mejora propias).

## Qué YA existe en el repo (no duplicar, anclar sobre esto)
- Red mesh: `src/ai/astraura/mesh/` — `decision-router.ts`, `synaptic-router.ts`,
  `synaptic.ts`, `federation.ts`, `meshtastic-adapter.ts`, `signals.ts`, `servers.ts`,
  `antenna.ts`/`bandas`, `recorrido`, `native-access`, `use-mesh.ts`, `types.ts`.
- WebRTC + señalización LAN: `src/lib/network/webrtc-mesh.ts`, `signaling.ts`,
  `device-registry.ts`, `capacidades-nodo.ts` (`anunciar`, `elegirDeliberador`,
  `elegirReflejo`, `resumenRed`), `neuron-network.ts`, `conciencia-colectiva.ts`,
  `lan-sync.ts`.
- UI de Señales ya montada: `src/app/(app)/senales/page.tsx` → `SignalsCenter`
  (`src/components/mesh/signals-center.tsx`, prop `embedded` y `compact`), arranca con
  `startMeshSubsystem()` desde `src/ai/astraura/mesh`.
- Rutas: `/senales`, `/red-mesh`, `/red-3d`; dashboard/dock registra apps en
  `src/components/dashboard/apps/app-catalog.ts` y dock en
  `src/components/layout/dock-config.ts` + `src/lib/dock/dock-defaults.ts`.
- Voz: estudio de voces en `memory/estudio-voces.md` y `memory/voces-catalogo.md`; motor
  «Voz StarSeed» en `src/lib/aurora/voz-starseed/` (`niveles.ts`, `motor.ts`,
  `capacidades.ts`); núcleo 1.58/needle en `memory/astraura-nucleo-158-needle3.md`.

## Contrato de integración (qué construir, en qué capa)
A. **PAIR como «red de inferencia» de la mesh.** El router enruta cada petición independiente
   a un nodo capaz (no une GPUs ni trocea un modelo). En StarSeed es el segundo piso del
   enrutamiento: `decision-router`/`synaptic-router` deciden el nodo por `capacidades-nodo`;
   PAIR sirve la capa de transporte local entre esos nodos, con sus endpoints
   Ollama/OpenAI-compatibles. No reemplaza el orquestador ni el pago por clique, solo añade
   nodos locales como cola de inferencia gratuita del estudio.
B. **buildwithparallel como capa de transporte mesh de largo alcance.** Abstraer el vínculo
   físico: red local WebRTC para lo cercano, y plug-in de radios mesh / Wi-Fi HaLow /
   Reticulum para fuera de cobertura. `meshtastic-adapter.ts` ya existe; hay que añadirle los
   adaptadores Reticulum y Wi-Fi HaLow como transporte alternativo del mismo bus de señales.
   Regla dura: la capa de aplicación (señalización, identidad mesh, cifrado) se queda tal cual;
   solo cambia el transporte.
C. **Supertonic como voz de borde on-device.** No necesita GPU → encaja con el motor 1.58-bit
   y needle del estudio. Se integra como un nivel más del motor «Voz StarSeed»
   (`voz-starseed/niveles.ts`): nivel «suptónica» (ONNX local, 31 idiomas, baja latencia)
   entre el nivel local 1.58 y el de nube. `capacidades.ts` detecta el soporte ONNX y la
   disponibilidad del runtime; `niveles.ts` define el nivel y sus requisitos. Los pesos se
   descargan con `model-downloads.ts`/`installed-models.ts` y se indexan en la biblioteca.

## Criterios de calidad (todas las olas)
- Módulos puros pequeños (≤3 archivos, ≤120 líneas por archivo); cableado en su propia tarea.
- Puertas antes de publicar: `npx tsc --noEmit`, `npx vitest run`, `npx next build`.
- Sin `any`; textos en español con acentos; claves solo en archivos de entorno.
- Nada de `vi.mock` de módulos de Node ni importar `route.ts` desde un test.
- Nada se publica sin verse en el Mando (`http://localhost:9002/mando`).
- Seguridad de rutas API: sesión requerida, destino fijo local (nunca URL del cliente),
  límite de frecuencia, sin exponer rutas del disco (patrón `/api/voz/salud`).

## Qué se espera del estudio de voces al cerrar
`memory/estudio-voces.md` debe documentar la nueva «vía suptónica»: qué hace (voz on-device
sin GPU), cómo convive con el núcleo 1.58-bit y needle (mismo contrato de `niveles.ts`), qué
modelos/idiomas cubre, y cómo la mesh la reparte (un nodo sin GPU con suficiente RAM puede
asumir la voz de la flota). No se duplica nada ya documentado para 1.58.