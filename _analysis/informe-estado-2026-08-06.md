# Informe de estado — StarSeed OS

**Fecha:** 2026-08-06 · **Repositorio analizado:** `/root/starseed-os` · **Alcance:** subsistemas implicados en la ventana «Configuración/actualización de sistemas de Astraura en esta neurona»

---

## Advertencia previa: el rediseño ya está construido

El hallazgo más importante de este análisis invalida la premisa de trabajo habitual. **La SPEC del rediseño no describe trabajo pendiente: describe código que ya existe en disco.** El SOP `architecture/astraura-config-sistemas-neurona.md` (mtime 2026-08-06 04:39 UTC) se autodenomina «Adenda 149» y especifica exactamente lo pedido: cinco pestañas LLM/Astraura/OpenVoice/Cerebro/Señales, título dinámico por contexto, selector de personalidad, autodetección de capacidades y personalidades predeterminadas Aurora y Hermione.

Verifiqué esa afirmación directamente contra el código, no contra el SOP:

- `src/components/astraura/astraura-omnivoice-config.tsx:127` declara `SYSTEM_SECTIONS = ["llm", "astraura", "openvoice", "cerebro", "senales"]`, exactamente las cinco pestañas de la SPEC. La línea 128 añade `neuronas`, `integraciones` y `apis` solo cuando `variant === "embedded"`, de modo que el modal y el drawer muestran las cinco y la vista incrustada en `/agent` muestra ocho.
- La línea 425 del mismo archivo calcula `const heading = windowHeading(updates ?? ...)`, es decir el título dinámico real ya no se deriva del antiguo `updateReason()` sino de la nueva capa.
- `src/lib/astraura/neuron-persona-systems.ts` (550 líneas, mtime 04:54 UTC) exporta la capa de datos completa: `PersonaNeuronOverrides`, `resolvePersonaSystems()`, `detectAntennas()`, `classifyUpdates()`, `windowHeading()` y la constante `ALL_PERSONAS = "*"`.
- `src/components/astraura/persona-system-sections.tsx` exporta `PersonaSelector`, `LlmSection`, `OpenVoiceSection`, `CerebroSection` y `SenalesSection`.

Además, varios lectores de esta misma ola reportaron como «ausentes» los puntos de entrada cruzados que el SOP §6 prometía. **Esa observación ya ha caducado.** Entre las 04:39 y las 04:57 UTC otro proceso terminó de cablearlos, y a las 05:12 UTC verifiqué por grep que los cuatro existen y son funcionales:

| Superficie | Archivo y línea | Llamada real |
|---|---|---|
| Hub de Personalidades | `src/components/aurora/personalities-panel.tsx:639` | `openAstrauraConfig("llm", { personalityId: p.id })` |
| Trinity Control Center | `src/components/layout/trinity/tabs/quick-settings-tab.tsx:212` | `openAstrauraConfig()` |
| Señales | `src/components/mesh/signals-center.tsx:226` | `openAstrauraConfig("senales")` |
| Cerebro hub | `src/components/cerebro/cerebro-hub.tsx:189` | `openAstrauraConfig("cerebro")` |

La consecuencia práctica para quien planifique la siguiente ola es que **no hay que construir la ventana, hay que terminarla**. El trabajo restante es de tres naturalezas muy distintas entre sí: cablear preferencias que hoy se guardan sin efecto, cerrar dos superficies de entrada que faltan, y resolver una deuda de registro documental que ya está causando confusión de numeración.

---

## 1. Estado actual global por subsistema

### Personalidades — madurez alta, salud media, fragmentación alta

El modelo de datos es sólido y está pensado como archivo portátil, no como fila SQL. `PersonalityProfile` (en `src/lib/aurora/personalities.ts`) agrupa rasgos, prompts, herramientas, política de memoria, estilo de voz, inteligencia y conectividad en un único objeto serializable con import/export JSON, y la importación pasa por el escáner de seguridad (`scanDeep()`/`redactDeep()` de `src/lib/security/scanner`), que redacta secretos críticos por defecto. Las predeterminadas reales son Aurora y Hermione —esta última con id fijo `c9fe7030-fc68-49c6-a705-58f7900887f9`, compartido literalmente con `hermione-bridge.ts` para evitar un import circular— más cinco presets adicionales. `listPersonalityProfiles()` fusiona por id los presets nuevos que se añadan en código sin pisar personalizaciones del usuario, mecanismo por el cual Hermione apareció retroactivamente en cuentas ya existentes.

La salud real, sin embargo, está lastrada por dos problemas. El primero es que **conviven dos modelos de personalidad no unificados**: el legado `Personality` (`src/lib/aurora/types.ts`, CRUD sobre la tabla Supabase `aurora_personalities`, con un único `vault_id`) que sigue usando `engine.ts`, y el nuevo `PersonalityProfile` que vive en `localStorage`. El segundo es que la edición de una misma personalidad está repartida entre árboles de componentes separados: rasgos, prompts, herramientas, memoria, conectividad y voz se editan en `src/components/aurora/personalities-panel.tsx`, mientras que avatar, handle y permisos viven exclusivamente en `src/components/aurora/setup/setup-personalidad.tsx`, dentro de otro modal. La afirmación «todo editable por personalidad en un solo sitio» no era cierta ni siquiera antes de añadir las cinco pestañas nuevas.

Un matiz importante que juega a favor: las claves de personalidad (`starseed.aurora.personalities.v1`, `...personality.active.v1`, `...persona-profiles.v1`) sí están en `SYNCED_KEYS` de `src/lib/settings-sync.ts`. Eso significa que **la coherencia del perfil entre neuronas ya viene dada gratis**; lo que no existía hasta la Adenda 149 era la intersección personalidad × neurona, que es precisamente lo que aporta la capa nueva.

### Neuronas y capacidades — madurez alta, salud buena

`src/lib/neurons/neurons.ts` detecta capacidades reales mediante sondas concretas y no heurísticas de user-agent: `navigator.gpu` para WebGPU, la extensión `WEBGL_debug_renderer_info` para nombre y fabricante de GPU, `window.LanguageModel` para Chrome AI, `navigator.deviceMemory` y `hardwareConcurrency`, `navigator.storage.estimate()`, `getBattery()`, y fetch con timeout de 900 ms a `localhost:11434` y `localhost:1234` para detectar Ollama y LM Studio. Todo se persiste por `deviceId` en localStorage y se registra en la tabla Supabase `neuron_devices` con RLS por propietario y heartbeat cada 60 segundos.

El punto débil es la duplicación de motores de recomendación: `model-recommend.ts` (cualitativo, escala ideal/suficiente/justo/insuficiente) y `model-scout.ts` (cuantitativo, portado de llmfit, escala perfecto/bueno/justo/no-cabe) coexisten a propósito, y el propio encabezado de `model-scout.ts` reconoce que «ninguno sustituye al otro todavía». A esto se suman tres tablas heurísticas independientes de nombres de GPU (`gpuStrength()`, `GPU_BANDWIDTH_GBPS`, `GPU_VRAM_GB`) que pueden desincronizarse, y el uso documentado de `approxSizeGb` como proxy de número de parámetros, aproximación que el propio código admite imprecisa.

Hay además una incoherencia de ámbito con consecuencias visibles para el usuario: `installed-models.ts` y `custom-models.ts` persisten como listas planas de cuenta, sin `deviceId`, pese a que «instalado» es un hecho intrínsecamente por dispositivo (una caché WebGPU o IndexedDB no viaja). Una neurona puede mostrar un modelo como instalado sin haber descargado nunca los pesos.

### Voz y OmniVoice — madurez muy alta, salud media

Es el eje más desarrollado del sistema. `src/lib/aurora/tts-oss/engine-registry.ts` registra diez motores y define la cadena de fallback; el motor primario real es `openvoice2` (Space `myshell-ai/OpenVoiceV2`), con `omnivoice` (k2-fsa, daemon local en `127.0.0.1:4444` o Space en la nube) justo detrás. Ambos son de coste cero y funcionan sin que el usuario configure nada, lo que cumple la regla de que Aurora siempre habla. La precedencia de resolución está bien definida en `refreshPersonalityVoicePin()`: pin duro de `PersonalityIntelligence.motorVoz`, luego `voiceStyle.engine` de la personalidad, y por último el default según el modo de la neurona.

La salud baja por tres motivos concretos. **El primero y más grave: `voiceStyle.audioRef` no llega a la síntesis.** El campo captura voz clonada, grabada o de catálogo por personalidad, tiene UI funcional que muestra toasts de éxito («Voz asignada», «Grabación guardada») y se escribe desde `voice-neuron-onboarding.tsx` y `persona-coherence-panel.tsx` — pero verifiqué por grep que **ningún archivo de `src/lib/aurora/tts-oss/` lee `audioRef`**. A la síntesis solo llegan el id y el nombre del perfil, y `seedKindFor()` en `openvoice2.ts` únicamente reconoce por substring «aurora» y «hermione». El timbre clonado de una personalidad personalizada no suena, y la UI afirma lo contrario. El segundo motivo es que `voice-catalog.ts` mantiene un catálogo decorativo paralelo cuyos ids (`kokoro-af-bella`, `openvoice-f-aurora`) no resuelven a las voces reales de cada motor; solo viajan como un `styleHint` textual. El tercero es que el selector de motor por personalidad en `personalities-panel.tsx` expone cinco de los diez motores registrados.

### Cerebros y memoria — madurez alta en el núcleo, baja en el enlace con personalidad

El modelo real de memoria es la tabla Supabase `brain_memory_files`, con CRUD en `src/lib/cerebro/memory-files.ts` y un catálogo de 31 tipos en `src/lib/brains/memory-types.ts` más una taxonomía cognitiva ortogonal de ocho categorías. Alrededor hay piezas maduras: destinos de sincronización por cerebro (`memory-destinations.ts`, con local/starseed/external/p2p), espejo local con cola offline y fusión no destructiva (`memory-offline.ts`), y escritura automática de memorias por parte de Astraura con debounce de 8 segundos (`src/ai/astraura/memory-intelligence.ts`).

El problema es el eje que la SPEC pide. **Una personalidad no tiene memoria propia**: solo dispone de un filtro de lectura, `memoryPolicy.cerebrosPermitidos`, sobre cerebros que ya existen. El binario «local frente a servidores externos» vive en `BrainServerKind` a nivel de cerebro, no de personalidad, de modo que una personalidad hereda la mezcla del cerebro que use en lugar de decidirla. Y la única edición de ese filtro antes de la Adenda 149 era un campo de texto con ids separados por comas. A esto se añade fragmentación: existen al menos cuatro superficies «cerebro» no unificadas (`/cerebro`, `/agent?tab=cerebro`, `/agent?tab=cerebros`, `/cerebro/mapa`) y tres arrays distintos de procedencia o destino de memoria (`MemoryFile.source`, `Brain.config.memoryDestinations`, `Brain.config.memorySources[]`).

### Señales y mesh — madurez muy alta en transporte, nula en el enlace por personalidad

El subsistema mesh está bastante más desarrollado de lo que documenta `CLAUDE.md` §11: 34 archivos en `src/ai/astraura/mesh/`, no los nueve que sugiere el mapa. Hay bandas LoRa reales de 18 regiones del firmware Meshtastic y nueve presets de módem con selector inteligente (`antennas.ts`), un router de decisión síncrono con histéresis anti-aleteo (`decision-router.ts`), un planificador de transmisión puro por ámbito público/privado-local/privado-lejano (`synaptic-router.ts`), bridge real a `@meshtastic/core` por serie, BLE y daemon HTTP (`meshtastic-adapter.ts`), federación de topología entre neuronas de la cuenta sobre `os_mesh_topology`, y relé cifrado entre cuentas sobre `os_mesh_relay`.

La salud del transporte es buena. **La salud del enlace con personalidad es el peor punto de todo el informe.** El nuevo `PersonaNeuronOverrides.senales.porAntena` —el corazón de la pestaña Señales de la SPEC, con entrada, salida y ruta (auto/privada/mesh/servidor) por cada una de las cinco antenas— existe completo en persistencia y en UI, pero verifiqué por grep que **el símbolo `porAntena` no aparece en ningún archivo de `src/ai/astraura/mesh/`**. Ni `decision-router.ts`, ni `synaptic-router.ts`, ni `delivery.ts`, ni `index.ts` leen esa preferencia. El usuario puede cambiar la ruta de una antena y no ocurrirá absolutamente nada observable en el comportamiento real de la malla.

Conviene decir que esto no es un descuido oculto: el propio SOP §8 documenta la capa como «transparente» a propósito. Pero transparente y sin efecto son la misma cosa desde el punto de vista del usuario, y la SPEC pide explícitamente que todo sea editable, lo que razonablemente implica que editar tenga consecuencias.

Se suma un problema de solapamiento: coexisten **tres mecanismos de conectividad por personalidad** con ejes distintos. `MeshRules` (`rules.ts`: rol interactiva/relé/escucha/apagada, prioridad, clases de tráfico permitidas) sí está cableado de verdad en `decideRoute()`. `ConnectivityConfig` (`connectivity.ts`: cinco campos agregados) sí está cableado en `transmit()`. Y `porAntena` no lo está. Sus UIs viven en componentes distintos (`personalities-hub.tsx` frente a `persona-system-sections.tsx`) sin ninguna nota cruzada que explique al usuario cuál gobierna qué.

### Núcleo de inteligencia Astraura — madurez muy alta, salud buena

`astrauraChat()` en `src/ai/astraura/router.ts` clasifica la tarea en nueve tipos mediante expresiones regulares en español, estima dificultad al estilo RouteLLM, rankea candidatos del catálogo unificado y hace failover con timeout por candidato hasta un fallback local honesto que responde sin red. El catálogo (`unified-intelligence.ts`) combina el curado con el catálogo vivo de OpenRouter filtrado a modelos `:free` y con las fuentes instaladas desde la Biblioteca. La contabilidad de uso y los enfriamientos por fuente son locales por diseño y están en `NEVER_SYNCED_KEYS`.

Dos observaciones sobre el scoring. La primera es que `accessBias()` —el empujón según la clase de acceso preferida por el usuario, que es lo que alimenta la pestaña Astraura— aporta entre 0 y 4 puntos, muy por debajo de la penalización de `freeFirst` (−6), del bonus de fuente propia (+2,5 a +8) y del override manual (+100). Un usuario que fije «local primero» puede ver ese orden ignorado en la práctica. La segunda es que las fuentes registradas desde la Biblioteca heredan `preferFreeModels: true` pero sus ids no siguen la convención `:free` de OpenRouter, de modo que `scoreModelForTask()` les resta 5 puntos en lugar de sumarles 4, penalizando estructuralmente lo que el usuario instala frente al catálogo curado.

La detección de novedades (`startup-updates.ts`) compara la firma del catálogo contra un snapshot, pero solo detecta altas y bajas de identificador, no cambios de metadatos de un id existente. Un modelo que mejora de calidad o una integración que cambia de licencia no dispara la ventana.

### Superficies de configuración — madurez alta, salud media por duplicidad

La ventana ya se abre desde siete lugares: el modal de arranque `StartupUpdatesModal`, el drawer global disparado por `openAstrauraConfig()`, la pestaña `config-ia` de `/agent`, la paleta de comandos, y los cuatro accesos cruzados nuevos ya verificados. El componente soporta tres variantes (modal, embedded, drawer) y `sectionFromSynonym()` mantiene compatibilidad con los deep-links históricos, traduciendo `modelos`, `orden` y `cuenta` a `astraura`, `voz` y `omnivoice` a `openvoice`, `memoria` y `cerebros` a `cerebro`, y `señales`, `antenas` y `mesh` a `senales`.

El problema estructural es la coexistencia de **dos hubs de configuración de neurona con alcance solapado**. `AuroraSetupCenter` (título «Configurar Neurona», once pestañas propias que incluyen Personalidad, Cerebros, Servidores, Memoria, Voz, APIs, Sentidos, Conexiones y una pestaña llamada Astraura) sigue existiendo en paralelo a `AstrauraOmniVoiceConfig`. El único puente entre ambos es defensivo: `startup-updates-modal.tsx` comprueba `isSetupPending()` para no auto-abrirse si el otro está pendiente, evitando el doble modal en la primera visita. Y agrava la confusión que el nombre «Astraura» designe pestañas distintas en cada uno: en `setup-astraura.tsx` significa reparto de skills y repositorios; en la ventana nueva significa orden de clases del router.

La vía principal de Ajustes sigue apuntando al hub antiguo. En `src/app/(app)/cuenta/page.tsx:935` —la sección «Aurora e inteligencia» de `/cuenta`, que es el Config Hub real del OS, al que redirige `/settings`— el único botón llama a `openAuroraSetup()`. Verifiqué que no hay ninguna referencia a `openAstrauraConfig` en todo el archivo, cuyo mtime es del 2026-08-05, un día anterior al resto.

### Documentación y pendientes — salud baja

Este es el subsistema en peor estado relativo. `memory/state.md` termina en la Adenda 138 del 2026-08-04, sin ninguna entrada para las Adendas 139 a 152. `starseed_memory_root/current-status.md` declara literalmente «Última actualización: 21 de Julio de 2026» y cubre hasta la Adenda 93. `CLAUDE.md` §11 declara su tope en la Adenda 99d del 2026-07-29. Frente a eso, los documentos del Proyecto Claude llegan hasta la Adenda 152 del 2026-08-05.

Hay además una **colisión de numeración que hay que resolver antes de escribir cualquier registro**: el SOP de hoy se titula «Adenda 149», pero ese número ya está tomado por la aprobación de ingreso a grupos documentada el 2026-08-05, e incluso existe una «Adenda 152» (decisión de modo oscuro por defecto) fechada el día anterior. La numeración dejó de ser secuencialmente fiable.

---

## 2. Mapa exacto para el rediseño de la ventana

Como la ventana ya existe, este mapa no es una propuesta de construcción sino la correspondencia verificada entre cada pestaña y los módulos que debe reutilizar —los que ya reutiliza y los que aún debería—, con rutas de archivo reales.

### Contenedor y capa transversal

El contenedor es `src/components/astraura/astraura-omnivoice-config.tsx`, que exporta `AstrauraOmniVoiceConfig` y su default. `src/components/astraura/startup-updates-modal.tsx` es un envoltorio fino de 59 líneas que solo gestiona el gate de auto-apertura y monta la variante `modal` sobre un overlay `z-[120]`. La apertura global vive en `src/lib/astraura/config-ui.ts`, cuyo `openAstrauraConfig(section?, { personalityId? })` dispara el evento `starseed:open-astraura-config` que escucha `src/components/astraura/astraura-config-drawer.tsx`, montado una sola vez en `src/app/(app)/app-globals.tsx`.

La capa de datos transversal es `src/lib/astraura/neuron-persona-systems.ts`. Su clave de persistencia es `starseed.astraura.neuron-persona.v1`, con forma `{[deviceId]: {[personaId | "*"]: overrides}}`, y su evento es `starseed:astraura-neuron-persona`. La función clave es `resolvePersonaSystems(personalityId, deviceId, caps)`, que aplica la precedencia neurona×personalidad, luego neurona con comodín `"*"`, luego personalidad, luego ajustes de neurona, luego cuenta, y por último autodetección. El tipo `Provenance` (`"neurona" | "personalidad" | "cuenta" | "auto"`) permite que la UI muestre de dónde viene cada valor efectivo, y el componente `ProvenanceChip` de `persona-system-sections.tsx:93` ya lo renderiza.

El selector de personalidad es `PersonaSelector` (`persona-system-sections.tsx:147`), alimentado por `personaChips()`, que devuelve la opción «Todas» más cada `PersonalityProfile` existente, con Aurora y Hermione entre ellos por ser presets sembrados.

El título dinámico se calcula en la línea 425 del contenedor mediante `windowHeading(updates)`, donde `updates` proviene de `classifyUpdates(caps)`. El tipo `UpdateMode` cubre los cuatro estados `"primera-vez" | "actualizacion" | "recomendaciones" | "al-dia"`, que corresponden a los tres contextos de la SPEC —neurona nueva, actualización de sistemas instalados, novedades recomendadas detectadas— más el estado neutro.

### Pestaña LLM

La sección es `LlmSection` (`persona-system-sections.tsx:200`), resuelta contra `ResolvedLlm`. Los módulos que debe reutilizar son tres. El pin de inteligencia por personalidad y por sentido es `PersonalityIntelligence` en `src/lib/aurora/personalities.ts` (modo `auto` o `fija`, `global`, `porSentido` para texto, voz, visión, código y razonamiento, más `motorVoz` y `permitirPago`); no es decorativo, lo consume `intelligencePinFor()` dentro de `astrauraChat()` en `src/ai/astraura/router.ts`. El catálogo y el ajuste hardware-modelo son `src/ai/astraura/model-requirements.ts` (`ALL_LLM_SPECS`, `classifyDeviceTier()`, `fitFor()`). Y las preferencias por neurona son `getNeuronModelPreferences(deviceId)` en `src/lib/astraura/model-preferences.ts`.

Queda un solapamiento sin resolver que conviene documentar en la propia UI: `src/components/aurora/setup/setup-sentidos.tsx` sigue siendo el único editor de `intelligence.porSentido` fuera de la ventana nueva, y opera siempre sobre la personalidad activa mediante `targetPersonality() = resolvePersonalityForContext({})`, sin selector. Además escribe también en `SensesConfig` (`starseed.aurora.senses.v1`), que es de cuenta y no de personalidad. Son dos semánticas distintas sobre el mismo concepto.

### Pestaña Astraura

No tiene sección propia en `persona-system-sections.tsx` porque reutiliza directamente la plomería del router. El módulo central es `src/lib/astraura/model-preferences.ts`: `MODEL_ACCESS_CLASSES` con las cuatro clases `local`, `starseed`, `api-free`, `api-external`; `effectiveOrder()` con la precedencia `perNeuron > perTask > perEnv > order`; `recommendedOrder({tier, online, hasLocal})` con sus cuatro ramas de autodetección; `blendOrders()` para fusionar recomendación y preferencia respetando exclusiones; y los clasificadores `llmSourceAccessClass()` y `voiceEngineAccessClass()`.

Las fuentes y el estado de actualizaciones vienen de `src/lib/astraura/startup-updates.ts` (`catalogSignature()`, `shouldShowUpdates()`, `newModelIdsSince()`, `newIntegrationsSince()`) alimentado por `src/lib/integrations/integration-registry.ts`. La disponibilidad en vivo la aporta `src/ai/astraura/availability.ts` con `detectAvailabilitySafe(6000)`.

Atención al choque de nombres ya señalado: esta pestaña «Astraura» significa router y fuentes, mientras que la pestaña homónima de `AuroraSetupCenter` (`setup-astraura.tsx`) significa reparto de skills y repositorios. Son cosas distintas con el mismo rótulo.

### Pestaña OpenVoice

La sección es `OpenVoiceSection` (`persona-system-sections.tsx:297`). Reutiliza `src/lib/aurora/tts-oss/engine-registry.ts` como registro autoritativo de los diez motores y su cadena de fallback —y es de ahí, mediante `listVoiceEngines()` y `listEngineVoices()`, de donde debe salir el selector, no del catálogo decorativo `voice-catalog.ts`—, más `PersonalityVoiceStyle` de `personalities.ts` con su `patchPersonalityVoice()`, la configuración unificada de `voice-config.ts` bajo `starseed.aurora.voice.v1`, y el modo por dispositivo de `neuron-voice-constants.ts` bajo `starseed.voz.neurona.v2`.

Falta una reutilización que el SOP §4 prometía: `src/components/aurora/persona-coherence-panel.tsx` (Adenda 112) no está importado en la sección. Verifiqué que en su lugar hay solo un párrafo descriptivo en la línea 365. El panel funciona y vive aislado como pestaña `coherencia` de `/agent`; el mecanismo real que adapta el carácter de una voz al motor disponible es `ENGINE_SUPPORTS_REF` en `src/lib/aurora/persona-coherence.ts`, que distingue los motores que clonan a partir de audio de referencia (VoxCPM, Voicebox, GPT-SoVITS, OmniVoice, OpenVoice2) de los que no (navegador, Kokoro, Kitten, Bark, xAI).

### Pestaña Cerebro

La sección es `CerebroSection` (`persona-system-sections.tsx:393`), resuelta contra `ResolvedCerebro`. Debe apoyarse en `src/lib/brains/brains.ts` para listar los cerebros de la cuenta y leer `BrainServer.kind`, que es donde vive de verdad el eje local frente a externo; en `PersonalityMemoryPolicy` de `personalities.ts` para `usarMemorias`, `nivelContexto` y `cerebrosPermitidos`; y en `src/lib/brains/memory-destinations.ts` para mostrar qué respaldo tiene cada cerebro. El precedente de UI decente para elegir cerebros por nombre en lugar de por ids separados por comas es `src/components/aurora/setup/setup-memoria.tsx`, que ya los lista como chips conmutables a partir de `listBrains()`.

El enlace bidireccional personalidad-cerebro ya existe y no debe duplicarse: `toggleBrainConnection()` en `personalities-panel.tsx:335-375` escribe simultáneamente en `Brain.includes.personalities[]`, en `memoryPolicy.cerebrosPermitidos` y en `setActivePersonality({scope:'cerebro', brainId})`.

### Pestaña Señales

La sección es `SenalesSection` (`persona-system-sections.tsx:533`). El inventario procede de `detectAntennas()` en `neuron-persona-systems.ts:189`, que reutiliza `externalLink`, `bluetoothLink` y `serialLink` de `src/ai/astraura/mesh/connectivity.ts` más `getConnectivitySettings().meshEnabled`, y devuelve las cinco antenas `wifi`, `bluetooth`, `serial`, `lora` y `daemon`. La resolución por antena la da `effectiveAntennaRule()` (línea 246).

Para que la pestaña tenga efecto real hay que enlazarla con los tres módulos que hoy la ignoran: `decideRoute()` en `src/ai/astraura/mesh/decision-router.ts`, `planTransmission()` en `synaptic-router.ts`, y las funciones `transmit()`, `transmitForContext()` y `sendOverMesh()` de `src/ai/astraura/mesh/index.ts`. El punto de inserción natural es donde `sendOverMesh()` ya lee `getMeshRules(neuronId)`, porque ahí ya existe el patrón de consultar una preferencia por personalidad antes de enrutar.

Dos avisos para el diseño de esta pestaña. Primero, `MeshPrivacySettings.relayUse` está fijado a `"all"` por decisión de producto y `setMeshPrivacy()` ignora cualquier intento de cambiarlo; no se debe prometer editarlo. Segundo, hay dos inventarios de antenas independientes —`detectAntennas()` con cinco entradas y `detectSignals()` de `mesh/signals.ts` con ocho— que solo comparten `connectivity.ts`; conviene decidir cuál es autoritativo antes de que diverjan.

---

## 3. Gaps y riesgos concretos

**Gap 1 — La pestaña Señales persiste sin efecto.** Es el más grave porque es directamente visible como funcionalidad rota. El símbolo `porAntena` solo aparece en el módulo que lo define y en el que lo pinta; ningún router lo lee. El usuario cambia una ruta y el comportamiento de la malla no varía.

**Gap 2 — Los overrides sincronizan pero no refrescan.** `starseed.astraura.neuron-persona.v1` está correctamente en `SYNCED_KEYS` (`settings-sync.ts:85`), pero **no tiene entrada en `EVENT_BY_KEY` de `src/lib/sync/realtime-sync.ts`**. Un cambio hecho en otra neurona se escribe en localStorage y no dispara `starseed:astraura-neuron-persona`, que es justamente el evento al que se suscribe `subscribeNeuronPersona()`. La UI ya montada no se entera hasta recargar. Es exactamente el mismo tipo de fallo que la Adenda 68 corrigió en su día para otras claves de Aurora.

**Gap 3 — Simétrico e inverso: `starseed.astraura.model-order.v1` sí tiene entrada en `EVENT_BY_KEY` (línea 195) pero no está en `SYNCED_KEYS`.** Como `applyRemoteChanges()` filtra por `isSyncedKey()` antes de aplicar, esa entrada es código muerto: el orden de clases de acceso que alimenta la pestaña Astraura nunca viaja entre neuronas, pese a que la UI lo etiqueta como ámbito «Cuenta» y el comentario de cabecera del propio módulo afirma que sí sincroniza.

**Gap 4 — Dos superficies de entrada sin cerrar.** `/cuenta`, que es el Config Hub real, sigue abriendo únicamente `AuroraSetupCenter`. Y no hay ninguna referencia a `openAstrauraConfig` en `src/components/widgets` ni en `src/components/dashboard`, de modo que la integración en widgets que pide la SPEC está sin empezar.

**Gap 5 — La voz clonada por personalidad no suena.** `voiceStyle.audioRef` tiene captura completa y confirmación visual al usuario, pero ningún archivo de síntesis lo lee. Esto es peor que una funcionalidad ausente porque la interfaz afirma activamente que ha funcionado.

Junto a estos cinco, hay riesgos de segundo orden que conviene tener presentes: los enlaces cruzados desde la ventana hacia `/senales`, `/red-mesh` y `/servidores` son texto decorativo con icono `ExternalLink`, sin `Link` ni `href` reales (comprobado: la única aparición en `persona-system-sections.tsx:634` es tipográfica); la coexistencia de dos hubs de configuración con alcance solapado y sin jerarquía declarada desde Ajustes; los tres mecanismos de conectividad por personalidad sin puente ni nota cruzada; y el hecho de que el SOP fechado hoy contenga en su §6 afirmaciones que no eran ciertas en el momento de escribirse —resultaron ciertas horas después, pero eso significa que el SOP no es verificable por sí solo y cualquier sesión futura debe hacer grep antes de confiar en él.

Sobre riesgos ajenos a la ventana pero vivos: la tarea P-2 de `starseed_memory_root/tasks/tasks.md` (rotación de la clave `service_role` de `nxstilnyidvkqeosofuh` y de una clave DashScope filtradas en el historial de git) sigue listada como crítica sin marcar. No pude confirmar si se resolvió; si sigue abierta es una exposición de seguridad real, no documental.

---

## 4. Orden de implementación recomendado

El criterio de ordenación es sencillo: primero lo que hoy miente al usuario, después lo que hoy no llega al usuario, y por último lo que consolida.

**Primero, dar efecto a la pestaña Señales.** Es lo único del rediseño que está construido y no funciona. La intervención es acotada: hacer que `decideRoute()`, `planTransmission()` y `sendOverMesh()` consulten `resolvePersonaSystems().senales.porAntena` como capa aditiva sobre las reglas existentes, siguiendo el patrón que `sendOverMesh()` ya usa con `getMeshRules()`. Debe hacerse sin romper `MeshRules` ni `ConnectivityConfig`, que sí funcionan, y decidiendo explícitamente la precedencia entre los tres.

**Segundo, cerrar los dos bugs de sincronización, que son de una línea cada uno.** Añadir `"starseed.astraura.neuron-persona.v1": ["starseed:astraura-neuron-persona"]` a `EVENT_BY_KEY` en `realtime-sync.ts`, con lo que los overrides pasan a refrescar la UI en vivo. Y decidir sobre `model-order.v1`: o se añade a `SYNCED_KEYS` para que su entrada en `EVENT_BY_KEY` deje de ser código muerto y el comentario del módulo pase a ser cierto, o se retira esa entrada y se corrige la etiqueta «Cuenta» de la UI. Ambas opciones son defendibles; lo que no es defendible es el estado actual. Conviene además preservar el no-sync deliberado de `starseed.voz.neurona.v2`, que es una elección de hardware por dispositivo y no debe viajar.

**Tercero, cerrar las dos superficies de entrada que faltan.** En `/cuenta`, sección `aurora-ia`, añadir junto al botón existente un acceso a `openAstrauraConfig()`, dejando claro en el texto qué configura cada uno de los dos hubs mientras sigan coexistiendo. Y añadir la entrada en al menos un widget de dashboard, que es la única de las cinco superficies de la SPEC sin ninguna cobertura.

**Cuarto, conectar `audioRef` a la síntesis.** Pasar el blob o la semilla desde `voiceStyle.audioRef` hasta `resolveReference()` de `openvoice2.ts`, que hoy solo acepta `refBlob` y `seedAttrs` explícitos del llamador. Es la diferencia entre que «elegir voz por personalidad» signifique elegir motor o signifique elegir timbre. Si esto no se aborda en esta ola, lo mínimo honesto es cambiar los toasts para que no afirmen un éxito que no se produce.

**Quinto, resolver la numeración y registrar la ola.** Antes de escribir nada en memoria hay que confirmar un número libre —«149» está tomado por la aprobación de ingreso a grupos y ya existe una 152—, y entonces registrar en `memory/state.md`, mover los ítems correspondientes de `starseed_memory_root/tasks/tasks.md` a `past_task.md`, y actualizar `CLAUDE.md` §11 con los nuevos accesos. La deuda acumulada es de unas catorce adendas y crece; cualquier agente que arranque leyendo solo `CLAUDE.md` y `memory/` trabajará hoy con información de hace una semana larga.

**Sexto, y ya como consolidación de fondo:** decidir la jerarquía entre `AuroraSetupCenter` y `AstrauraOmniVoiceConfig` —fusión o coexistencia declarada, pero no ambigüedad—, resolver el choque de nombre de la pestaña «Astraura», convertir los enlaces cruzados decorativos en navegación real, unificar los dos inventarios de antenas, y ampliar el selector de motor de voz para que exponga los diez motores de `listVoiceEngines()` en lugar de cinco. Ninguna de estas es urgente; todas reducen el coste de la siguiente ola.

---

*Informe generado el 2026-08-06 a las 05:12 UTC. Todas las afirmaciones sobre presencia o ausencia de símbolos fueron verificadas por grep contra el árbol de trabajo en ese instante. Dado que se detectó otro proceso escribiendo en estos mismos archivos entre las 04:39 y las 04:57 UTC, conviene re-verificar antes de planificar trabajo derivado.*
