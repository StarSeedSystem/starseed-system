# Ideas de mejora UX/UI — ventana «Sistemas de Astraura en esta neurona» (Adenda 149)

**Fecha:** 2026-08-06 · **Repositorio:** `/root/starseed-os` (rutas relativas a la raíz) · **Base:** seis lecturas independientes del mismo código, verificadas por grep contra el árbol actual.

Se analizaron los cuatro archivos del núcleo de la ventana 149 (`astraura-omnivoice-config.tsx`, `persona-system-sections.tsx`, `startup-updates-modal.tsx`, `astraura-config-drawer.tsx`), su capa de datos (`neuron-persona-store.ts`, `neuron-persona-systems.ts`), las superficies que enlazan con ella (personalidades, cerebro, señales, cuenta, Trinity, escritorio) y los consumidores de runtime que deberían leer sus preferencias (router, mesh, TTS, memoria). El criterio de prioridad es triple y en este orden: **(1) honestidad** — ningún control debe prometer un efecto que hoy no ocurre; **(2) accesibilidad y táctil** — lo que ya exige `MASTER.md`/`DESIGN_RULES.md` y no se cumple; **(3) impacto/esfuerzo** — se prefiere cablear piezas que YA existen en el repo (`SectionTabs.badge`, `.glass-depth`, `proceduralAvatarDataUrl`, `SignalsRadar`, `useModalA11y`, `ModelScoutPanel kind="voz"`, `describeCaps`, `engineSupportsRef`) antes que inventar módulos nuevos. Se han fusionado las ideas repetidas entre perspectivas quedándose con la formulación más concreta, y se han descartado las que contradicen la identidad o duplican algo ya resuelto. **64 ideas** tras deduplicar (de 69 propuestas).

---

## 1. Top 10 quick wins

Ordenados por relación impacto/esfuerzo. Todos son S salvo indicación, todos de impacto alto.

1. **Toast con «Deshacer» en cada edición instantánea.** Los cuatro paneles llaman `saveOverrides` al instante, en silencio, mientras el pie dice «se guarda al pulsar Aplicar»: modelo mixto y mudo. Envolver en un `applyOverride()` local que dispare toast sonner con acción «Deshacer» restaurando el raw previo. *Dónde:* `src/components/astraura/persona-system-sections.tsx` (setRule:557, toggleBrain:415, selects LLM/voz/cerebro); patrón en `src/components/library/library-catalog.tsx:340`.
2. **Focus-trap y Escape en el modal de arranque.** `startup-updates-modal.tsx:49` declara `role="dialog" aria-modal="true"` pero nunca llama `useModalA11y`: es la única ventana de arranque que se salta el patrón de la Adenda 137/142 (8 consumidores ya migrados). *Dónde:* `src/components/astraura/startup-updates-modal.tsx:49` + `src/hooks/use-modal-a11y.ts`.
3. **Insignias de override por pestaña.** `SectionTabItem.badge` ya existe y solo lo usa «astraura». Punto violeta si `getRawOverrides(deviceId, personaId)[sistema]` existe, ámbar si `classifyUpdates()` toca ese motor. Hoy hay que abrir las cinco pestañas para saber dónde tienes pines. *Dónde:* `astraura-omnivoice-config.tsx:463-468` (tabItems) + `neuron-persona-store.ts:112` + `src/components/ui/section-tabs.tsx:32`.
4. **Chips «se guarda, aún no actúa» en los tres controles inertes.** El propio SOP §9 admite tres: `permitirPago`, `cerebro.almacen` y las reglas de Señales por personalidad. Chip ámbar exactamente ahí, ni uno más. *Dónde:* `persona-system-sections.tsx` AstrauraPersonaCard:689-702, almacén:489-503, aviso Señales:572-576.
5. **El «tamaño táctil grande» debe cubrir select, switch y tab.** `apply.ts:150-155` agranda solo `button`/`[role="button"]`/`a`: los `<select>` y los `role="switch"`/`"tab"` de TODO el OS quedan fuera. Sumar `select` y `[role="tab"]`; en switch usar `transform:scale` (min-height rompe el thumb). *Dónde:* `src/lib/a11y/apply.ts:150-155`.
6. **Switches de antena envueltos en `<label>`.** `SenalesSection` no envuelve icono+nombre+Switch, a diferencia de `usarMemorias`/`syncBrains`/`permitirPago`/`autoUpdate` en los mismos dos archivos. Multiplica el área táctil del control más repetido (5 antenas × personalidad) sin tocar el `aria-label`. *Dónde:* `persona-system-sections.tsx:585-602`.
7. **Montar el scout de voz y el panel de coherencia en OpenVoice.** `ModelScoutPanel` acepta `kind="voz"` y jamás se usa (solo `LlmSection` lo monta, línea 281); `PersonaCoherencePanel` (A112) sigue sin importarse, hay solo un párrafo describiéndolo. Montar ambos por `next/dynamic` y ampliar el selector a los 10 motores de `listVoiceEngines()`. *Dónde:* `persona-system-sections.tsx` OpenVoiceSection:302-389 + `model-scout-panel.tsx:57` + `src/components/aurora/persona-coherence-panel.tsx`.
8. **Cristal de verdad en el contenedor.** El modal emblemático de la identidad «cristal líquido» es un `bg-[#0b0d12]` opaco, sin blur ni `.glass-depth`/`.glass-edge`, sobre un fondo Spline animado. Pasar a `bg-[#0b0d12]/85 backdrop-blur-[var(--glass-blur)] glass-depth glass-edge` (el token ya baja a 8px en `data-perf=eco`). *Dónde:* `astraura-omnivoice-config.tsx:456-461` + `globals.css` (~3177/3229).
9. **Piel de cabecera por contexto (4 modos, no 1).** `windowHeading()` ya devuelve `mode` pero la cabecera pinta siempre el mismo degradado cian y el mismo `Sparkles`. `HEADING_SKIN: Record<UpdateMode,{grad,icon,ring}>`: primera-vez violeta→cian/Sparkles · actualización ámbar/BellRing · recomendaciones esmeralda/Compass · al-día cian sobrio/Check. *Dónde:* `astraura-omnivoice-config.tsx:521,526,529` (mode ya calculado en :425).
10. **Gate cruzado del doble modal de primera vez.** `VoiceNeuronOnboarding` se auto-abre a los 3500 ms con `z-[10000]` sin consultar nada del `StartupUpdatesModal` (z-[120], 1200 ms); no existe gate entre ambos. Que su efecto de apertura consulte `shouldShowUpdates()` antes de dispararse. *Dónde:* `src/components/aurora/voice-neuron-onboarding.tsx:271-288` + `src/lib/astraura/startup-updates.ts`.

Rozan el top y son igual de baratos: riel de override en las tarjetas (A4), enlaces cruzados reales (A6), chip de procedencia corto (M2) y chip «proceso» honesto en el chat (M13).

---

## 2. Catálogo completo por contexto

### 2.1 Ventana 149 — marco (cabecera, pestañas, pie, persistencia)

**Piel de cabecera por contexto** — ver quick win 9. *S · alto*

**Insignias de override por pestaña** — ver quick win 3; incluye además punto violeta en cada chip de personalidad con overrides, pasando `deviceId` a `PersonaSelector`. *Dónde:* `astraura-omnivoice-config.tsx:463-468` + `persona-system-sections.tsx:152-187`. *S · alto*

**Toast con «Deshacer»** — ver quick win 1. *S · alto*

**Riel de override en las tarjetas.** Una tarjeta con override es visualmente idéntica a una en auto; el único indicio es que aparece «Volver a auto», que además salta el layout al aparecer/desaparecer. Añadir `border-l-2` en el tono de la pestaña cuando `raw.<sistema>` existe y reservar siempre la altura de esa fila de acciones. *Dónde:* `persona-system-sections.tsx:221,268,319,367,430,479,565,630,673,703`. *S · alto*

**Chips «se guarda, aún no actúa»** — ver quick win 4. Es medida puente: cada chip desaparece cuando aterriza su cableado real (H1, G1, C1). *S · alto*

**Estados vacíos con acción y enlaces cruzados reales.** «Aún sin cerebros creados» y las notas con icono `ExternalLink` son texto plano sin `Link`: convertirlos en navegación real a `/senales`, `/red-mesh`, `/servidores` y `/agent?tab=cerebro` (cerrando el drawer con `onDismiss`), usar `EmptyState` con acción «Crear cerebro» / «Conectar radio LoRa» y explicar por qué una antena sale en gris. Patrón correcto en `astraura-omnivoice-config.tsx:441`. *Dónde:* `persona-system-sections.tsx:476,517-521,644-648` + `src/components/ui/empty-state.tsx`. *S · alto*

**«Volver a auto» por ámbito, con confirmación.** Hoy `BackToAuto` es por sistema y solo si ya hay override. Cabecera con contador «N ajustes propios» + menú: esta pestaña / esta personalidad / toda la neurona, vía `clearOverrides(deviceId, personaId, system?)` y `useConfirm({destructive:true})` de la A137. *Dónde:* `astraura-omnivoice-config.tsx` (cabecera) + `neuron-persona-store.ts:184` + `src/components/ui/confirm-dialog.tsx`. *M · alto*

**Resumen de cambios (diff antes/después).** Snapshot de `getRawOverrides` de todas las personas al montar; al pulsar Aplicar/Terminar (o cerrar con cambios) pintar «Qué cambia»: sistema · personalidad · antes → después, con «Descartar todo». Función pura nueva `diffOverrides()` en el store. *Dónde:* `neuron-persona-store.ts` + `astraura-omnivoice-config.tsx` handleApply:414. *M · alto*

**«Aplicar lo recomendado» accionable en updatesCard.** El card de novedades solo describe. Botón que aplica SOLO lo verificable (orden sugerido de `recommendedOrder` + specs cuyo id pase `isVoiceEngineId` o exista en `freeSources()`), y por item un chip «Ver en LLM/OpenVoice» que salta a la pestaña. Nada a ciegas. *Dónde:* `astraura-omnivoice-config.tsx:487-514` + `useSuggested():352`. *M · alto*

**Modo guía «primera vez» sobre las mismas 5 pestañas (sin wizard nuevo).** Cuando `windowHeading().mode === "primera-vez"`, rail de progreso (Paso 1/5) sobre `SectionTabs` y pie «Atrás · Siguiente · Terminar» recorriendo `SYSTEM_SECTIONS`; las pestañas siguen clicables y al terminar, tarjeta resumen de lo elegido automáticamente. *Dónde:* `astraura-omnivoice-config.tsx` tabsRow:470-484, pie:726-753, heading:425. *M · alto*

**Focus-trap y Escape en el modal de arranque** — ver quick win 2. *S · alto*

**Modal centrado → sheet inferior en móvil.** El overlay `fixed inset-0 items-center justify-center p-3` desperdicia margen lateral a 375px. `sheet.tsx` ya define `side="bottom"` (0 usos en todo el repo); adoptarlo como el drawer + `env(safe-area-inset-bottom)` (14 precedentes, 0 en `astraura/*`). *Dónde:* `startup-updates-modal.tsx` + `src/components/ui/sheet.tsx` + `astraura-config-drawer.tsx`. *M · alto*

**CTAs del pie por debajo de 44px.** Los 4 botones del pie (Aplicar y continuar / Cerrar / Recordar luego / Guardar) miden ~29px (`px-3 py-1.5 text-[12px]`) siendo las acciones más pulsadas en sus tres variantes. `min-h-11` solo a esos cuatro. *Dónde:* `astraura-omnivoice-config.tsx:728-751`. *S · medio*

**`aria-pressed` en los 7 grupos de píldoras.** Modo Auto/Fija, Cuenta/Neurona, nivel de contexto, almacén, vía de voz y cerebros permitidos usan `pill()`/`pillCls()` sin estado anunciado, a diferencia de Entrada/Salida (:606-611) en el mismo archivo. *Dónde:* `persona-system-sections.tsx` (varios bloques) + `astraura-omnivoice-config.tsx:631-635`. *S · medio*

**Atajos de teclado con leyenda discreta.** 1..5 cambian de sistema, ⌘/Ctrl+Enter aplica, P abre el selector de personalidad; ←/→ ya funcionan por el roving tabindex de `SectionTabs`. Listener con guarda de `input/select/textarea` y leyenda `kbd` en el pie para que sean descubribles. *Dónde:* `astraura-omnivoice-config.tsx`. *S · medio*

**Swipe táctil entre las 5 pestañas.** En móvil solo queda tocar la píldora exacta. `onTouchStart/onTouchEnd` con el mismo arrastre+umbral de `trinity-edge-access.tsx`/`side-curtains.tsx`, sin librería nueva. *Dónde:* `astraura-omnivoice-config.tsx:470-484`. *M · medio*

**Constelación orbital de los 5 sistemas (SVG puro, navegable).** Anillo de 5 nodos bajo la cabecera: color = acento de pestaña, relleno = procedencia (hueco esmeralda auto / sólido violeta pin), aro exterior = `personaPalette(persona).primary`; clic en nodo → `setSection()`, es navegación, no adorno. ~120 líneas de SVG, sin librerías ni canvas en el modal. Es la primera vez que los 5 sistemas de una personalidad se ven JUNTOS. *Dónde:* NUEVO `src/components/astraura/persona-constellation.tsx` montado en tabsRow:470-484 + `src/lib/aurora/persona-avatar.ts::personaPalette`. *M · alto*

**Pulso de la neurona: latido con periodo derivado de salud real.** El aro de la constelación late con periodo f(salud): disponibilidad del motor de voz efectivo, `navigator.onLine`, antenas «available» sobre detectadas y caps (webgpu/ollama). Verde lento = sano, ámbar rápido = degradado. Gate duro: aro estático si `reduceMotion==='always'` o `pauseAnimations`. *Dónde:* `persona-constellation.tsx` + `engine-registry.ts:380` + `neuron-persona-systems.ts:87` + `src/lib/a11y/apply.ts:41`. *M · medio*

### 2.2 Ventana 149 — pestaña LLM

**Contexto de hardware junto al recomendador.** `LlmSection` muestra `ModelScoutPanel` sin decir de qué dispositivo habla; los chips de hardware (núcleos/RAM/GPU/WebGPU) solo existen en `NeuronModelsPanel` variante embedded. Añadir una línea con `describeCaps(caps)`, ya exportado y sin usar aquí. *Dónde:* `persona-system-sections.tsx` antes de :277 + `src/ai/astraura/model-requirements.ts`. *S · medio*

**Puente visible entre los dos recomendadores.** `model-recommend.ts` (NeuronModelsPanel) y `model-scout.ts` (ModelScoutPanel) coexisten sin puente; el propio header de `model-scout.ts` admite que «ninguno sustituye al otro todavía». Enlace «Ver análisis cuantitativo» que expanda el ModelScoutPanel del mismo kind. *Dónde:* `src/components/neurons/neuron-models-panel.tsx:120-143`. *S · medio*

**Previsualizar la cadena resultante al fijar un pin.** El invariante «un pin va primero pero nunca es exclusivo» hoy es solo un párrafo. Al elegir fuente/motor, mostrar la cadena real como fila de chips «tu pin → resto», con `freeSources()` (LLM) y `buildVoiceChain`/`AUTO_ENDPOINT_ORDER` (voz). Enseña por qué Aurora nunca se queda muda ni ciega. *Dónde:* `persona-system-sections.tsx:235-267` y `:329-348` + `engine-registry.ts:670,338`. *M · alto*

**«Aplicar» por fila en el scout, en vez de un cartel.** `ModelScoutPanel` gana props `personaId`/`deviceId` y botón por fila: resuelve `rec.spec.engine` contra `freeSources()`/`listVoiceEngines()` (match difuso, como ya hace `accessIcon()`) y llama `saveOverrides()`; sin match seguro, el botón no aparece. *Dónde:* `src/components/astraura/model-scout-panel.tsx` + `persona-system-sections.tsx` + `src/ai/astraura/model-scout.ts`. *M · alto*

### 2.3 Ventana 149 — pestaña Astraura

**«Permitir fuentes de pago» deja de ser cosmético.** Nueva `personaAllowsPaid(profile)` en `personalities.ts` (mismo merge neurona×personalidad que `intelligencePinFor`, sin exigir pin ni modo «fija»). `astrauraChat()` la pasa a `rankCandidates(...)` como restricción AND sobre el filtro de pago: solo puede negar, nunca aflojar el límite de cuenta. *Dónde:* `src/lib/aurora/personalities.ts` (~L1415) + `src/ai/astraura/router.ts` (rankCandidates:366, filtro:416, llamada:914). *M · alto*

**Exportar/importar en JSON la configuración de sistemas de una neurona.** `exportNeuronPersonaJson(deviceId)`/`importNeuronPersonaJson(json,deviceId)` calcadas de `exportPersonalityJson`/`importPersonalityJson`, incluidos `scanDeep`/`redactDeep` de `security/scanner`. Botón junto a «Diagnosticar y reparar»; precedente de descarga en `personalities-panel.tsx:294`. *Dónde:* `neuron-persona-store.ts` + `astraura-omnivoice-config.tsx:609-627`. *S · medio*

### 2.4 Ventana 149 — pestaña OpenVoice

**Scout de voz + panel de coherencia** — ver quick win 7. *S · alto*

**Badge honesto de clonación por referencia.** El párrafo de «coherencia de persona» es texto fijo idéntico para todos los motores. Sustituirlo por un badge en vivo con `engineSupportsRef(resolved.voz.motor)` y advertir que `voiceStyle.audioRef` aún no llega a la síntesis (0 usos en `src/lib/aurora/tts-oss/`) en vez de implicar que ya funciona. Cuando aterrice I1, el badge cambia de texto en lugar de desaparecer. *Dónde:* `persona-system-sections.tsx:370` + `src/lib/aurora/persona-coherence.ts`. *S · alto*

### 2.5 Ventana 149 — pestaña Cerebro

**Filtro de texto en los chips de cerebro.** `CerebroSection` lista todos los brains como chips planos sin buscador; con 15+ cerebros obliga a escanear varias pantallas en móvil. Filtro simple cuando `brains.length > ~8`, mismo estilo visual que los selects existentes. *Dónde:* `persona-system-sections.tsx:461-478`. *S · bajo*

### 2.6 Ventana 149 — pestaña Señales

**Switches de antena con `<label>`** — ver quick win 6. *S · alto*

**Rosa de antenas reutilizando `SignalsRadar` (no un radar nuevo).** `SignalsRadar` ya coloca cada tipo en un sector fijo y acepta `signals?: SignalSource[]`. Montarlo en `SenalesSection` alimentado desde `detectAntennas()` + las reglas `porAntena` de la personalidad, de modo que una antena cerrada por la persona se pinte `status:"off"`. Resuelve de paso la divergencia de los dos inventarios (5 vs 8) fijando cuál manda en este contexto. *Dónde:* `persona-system-sections.tsx:545-652` + `src/components/mesh/signals-radar.tsx:113` + `src/ai/astraura/mesh/signals.ts:36`. *S · alto*

**Estado legible + latido de la antena activa.** La disponibilidad se comunica SOLO con un punto de color de 6px (4 estados), lo que `DESIGN_RULES` §3 prohíbe expresamente («nunca solo color»). Micro-etiqueta textual (activa/disponible/apagada/no soportada) junto al punto y `.ss-signal-ping` en las activas, que ya degrada con reduced-motion y en `data-perf=eco`. *Dónde:* `persona-system-sections.tsx:588-595` + `globals.css` (~3404). *S · medio*

**Colapsar cada antena con `Collapsible` en móvil.** `SenalesSection` apila hasta 20 controles (switch + 2 píldoras + select × 5 antenas) por personalidad. `src/components/ui/collapsible.tsx` ya existe sin usar aquí: colapsar a nombre+estado+switch y expandir entrada/salida/ruta al tocar. *Dónde:* `persona-system-sections.tsx:578-629`. *M · medio*

### 2.7 Señales (runtime y centro de señales)

**`transmit()` recibe la personalidad emisora.** `TransmitInput` gana `personalityId` opcional y `transmit()` lo pasa a `meshOutboundAllowed(s.transport,id)`/`outboundAllowed('wifi',id)` en vez de omitir el 2º argumento (el TODO ya está escrito ahí). `decideRoute()` no necesita cambio: su único llamador (`sendOverMesh`) ya filtra por persona. Es lo que convierte las reglas de Señales por personalidad en comportamiento real. *Dónde:* `src/ai/astraura/mesh/index.ts` (TransmitInput:446-467, transmit:522-570) + `mesh/persona-antenna-gate.ts`. *M · alto*

**Indicador vivo de reglas de antena en el centro de Señales.** El botón «Señales por personalidad» es mudo: no dice si hay alguna regla activa. Contador junto a él recorriendo `personaChips()` sobre `getRawOverrides`, tipo «3 antenas con reglas propias». *Dónde:* `src/components/mesh/signals-center.tsx:222-231`. *S · alto*

### 2.8 Cerebro (runtime y hub)

**`cerebro.almacen` decide de verdad el destino de sync.** `syncBrainMemoryNow()` lee `resolvePersonaSystems(personaId,deviceId).cerebro.almacen`: `local` desactiva starseed/external ese ciclo (solo mirror local), `servidor` fuerza el push, `auto` = igual que hoy. El mirror local (`memory-offline.ts`) nunca se toca; sin overrides guardados, comportamiento byte-idéntico al previo. *Dónde:* `src/lib/brains/memory-destinations.ts` + `neuron-persona-systems.ts::resolvePersonaSystems`. *M · alto*

**Mostrar qué personalidades usan el cerebro activo.** `activeBrain.includes.personalities` ya existe (lo escribe `toggleBrainConnection` en `personalities-panel.tsx`) pero `cerebro-hub` nunca lo pinta. Listar nombres/iconos junto al selector: dato ya cargado, cero cálculo nuevo. *Dónde:* `src/components/cerebro/cerebro-hub.tsx:226-245` + `src/lib/brains/brains.ts` + `src/lib/aurora/personalities.ts`. *S · alto*

### 2.9 Voz (runtime OpenVoice / OmniVoice)

**La voz grabada o clonada de una personalidad se sintetiza de verdad.** `delegateOpenVoice2()` ya resuelve `profile` antes de llamar a `synthesizeOpenVoice2()`; falta convertir `profile.voiceStyle.audioRef.dataUrl` (kind recorded/library) a Blob y pasarlo como `refBlob` (kind builtin sigue con la semilla). Hoy ningún archivo de `tts-oss/` lee `audioRef` pese a que la UI confirma «Voz asignada». *Dónde:* `src/lib/aurora/tts-oss/neural-tts.ts:1734-1781` → `tts-oss/openvoice2.ts:953` (ya acepta `refBlob`). *M · alto*

**`neuronPrefersLocalLS()` escucha a la personalidad, no solo al dispositivo.** Nuevo parámetro `personalityId`: consulta primero `voz.modo` del override neurona×personalidad (`neuron-persona-store.ts::getOverrides`, el mismo import sin ciclos que ya usa `persona-antenna-gate.ts`) y solo si no hay override cae a `starseed.voz.neurona.v2`. `OmniSynthOptions` gana `personalityId`, sembrado igual que `ensureLocalIdentity(profile?.id)` dos líneas antes. *Dónde:* `tts-oss/omnivoice-hybrid.ts` (:454, usos :883/:985) + `neural-tts.ts:1701-1707`. *S · medio*

**Evitar el doble modal de primera vez** — ver quick win 10. *S · alto*

### 2.10 Personalidades

**Selector de personalidad con orbe, no con icono de 12px.** `PersonaSelector` pinta un lucide de `h-3 w-3`; ya existe `proceduralAvatarDataUrl()` (orbe de cristal determinista por rasgos) y `personaPalette().primary`. Usar el patrón real de setup-personalidad: `getPersonaProfile(id).avatar || proceduralAvatarDataUrl(p)` como orbe de 18px con anillo del hue de la persona; ampliar `PersonaChip` en consecuencia. *Dónde:* `persona-system-sections.tsx:152-187` + `src/lib/aurora/persona-avatar.ts:98,213` + `setup/setup-personalidad.tsx:158` + `neuron-persona-systems.ts:415,423`. *M · alto*

**`PersonaSelector`: geometría y semántica.** Es un `overflow-x-auto` a mano, sin máscara de fundido ni snap, con targets ~24px, mientras dos líneas arriba `SectionTabs` ya resuelve fundido+snap+roving-tabindex+36-44px (fix A132). Reusar esa geometría; **decisión pendiente**: hoy anida un segundo `role="tablist"` sin tabpanel (dos tablists hermanos), así que conviene exponer un `role="radiogroup"` en el componente reutilizado en vez de heredar `tablist`. *Dónde:* `persona-system-sections.tsx:152-187` + `src/components/ui/section-tabs.tsx`. *M · alto*

**Copiar configuración: de otra personalidad o de otra neurona.** El store ya es `{[deviceId]:{[personaId]:overrides}}` y viaja con la cuenta, así que copiar es lectura pura. Exportar `listConfiguredDevices()` y `copyOverrides(from,to,systems[])`; popover «Copiar de…» con `listNeurons()` para nombres, checkboxes por sistema y previsualización antes de escribir. Habilita también J6. *Dónde:* `neuron-persona-store.ts` + `src/lib/neurons/neurons.ts:516` + `astraura-omnivoice-config.tsx` (cabecera). *M · alto*

**Chip «N sistemas ajustados aquí» en la tarjeta y KPI en el hub.** Ninguna tarjeta de personalidad indica si tiene overrides de esta neurona. Chip contando claves no vacías de `getRawOverrides(deviceId, p.id)` junto al botón «Sistemas en esta neurona», y KPI agregado en el panel de control. *Dónde:* `personalities-panel.tsx:594-644` (junto a `badgesFor`) + `personalities-hub.tsx:276-305`. *S · medio*

**Modo Resonancia: cuánto encaja la configuración con la personalidad.** Función pura `resonanceScore(personaId, deviceId)` que detecta contradicciones reales: `audioRef` presente + motor sin `engineSupportsRef`; `memoryPolicy.usarMemorias` vs `cerebro.usarMemorias`; `intelligence.modo "fija"` anulado por `astraura.modo "auto"` de la neurona; `connectivity.meshEnabled` con todas las antenas mesh cerradas. Chip 0-100 junto al selector + lista de desajustes con botón «arreglar». *Dónde:* `neuron-persona-systems.ts` (nueva export) + `persona-system-sections.tsx:152-187` + `persona-coherence.ts:49`. *M · alto*

**Badge de coherencia de la personalidad entre neuronas.** `listNeurons()[].id` ES la clave `deviceId` del store y la clave viaja en `SYNCED_KEYS`: `getRawOverrides(otraNeurona, personaId)` se lee sin red extra. Chip «Aurora suena distinta en 2 de tus 4 neuronas» + desglose por sistema + acción «Igualar en todas mis neuronas» (`saveOverrides` por deviceId, reusa J3). *Dónde:* `neuron-persona-systems.ts` (nueva `personaDivergence`) + `neurons.ts:516` + cabecera de Llm/OpenVoiceSection. *M · alto*

**Comparador de personalidades en esta neurona.** Toggle «Comparar» que llama `resolvePersonaSystems(id, deviceId, caps)` por cada chip y pinta tabla compacta (LLM · motor de voz · memoria · antenas cerradas) resaltando solo las diferencias, con acción por fila «Igualar a esta personalidad». Eje complementario al de J6: dentro de una neurona, no entre neuronas. *Dónde:* NUEVO `src/components/astraura/persona-compare-table.tsx` + `neuron-persona-systems.ts:220`. *M · medio*

### 2.11 Cuenta

**Estado en vivo en la tarjeta «Sistemas de Astraura en esta neurona».** La tarjeta de `/cuenta` es texto fijo sin ningún dato real, a diferencia de «Aurora conoce mi contexto» justo debajo, que sí muestra caps/cerebros. Añadir una línea con LLM/voz efectivos y nº de señales con regla propia vía `resolvePersonaSystems(ALL_PERSONAS, deviceId, null)`. *Dónde:* `src/app/(app)/cuenta/page.tsx:949-966` + `neuron-persona-systems.ts`. *M · alto*

**El buscador de Ajustes ignora los 5 sistemas.** `SETTINGS_SEARCH_INDEX` no tiene ni una entrada de la 149. Añadir campo opcional `action?: () => void` al tipo y ~8 entradas («motor de voz», «antena LoRa», «cerebros permitidos», «permitir pago»…) que llamen `openAstrauraConfig(section, {personalityId})`; además, campo de filtro en la cabecera del modal que resalte el control coincidente. *Dónde:* `src/components/settings/settings-search.tsx:44-66,66+,319` + `astraura-omnivoice-config.tsx`. *M · alto*

### 2.12 Control center y escritorio

**Mini-panel de los 5 sistemas en Trinity quick-settings.** El único botón «Sistemas de Astraura (esta neurona)» no muestra estado alguno. Acompañarlo de 5 chips (LLM cian · Astraura ámbar · OpenVoice fucsia · Cerebro violeta · Señales esmeralda) con su valor efectivo y acceso directo a `openAstrauraConfig(tab)`. *Dónde:* `src/components/layout/trinity/tabs/quick-settings-tab.tsx:209-227`. *M · alto*

**Escritorio: estado real en el Córtex Astraura.** El escritorio es la única superficie de la SPEC con cobertura cero (ningún `openAstrauraConfig` en `src/components/dashboard` ni `/widgets`) y ese widget es hoy 100% datos simulados por hash. Franja inferior con la constelación compacta (A17) de los 5 sistemas de la personalidad activa vía `resolvePersonaSystems()` + clic → `openAstrauraConfig()`. Alternativa si no encaja: widget nuevo con `WidgetShell` (patrón de `system-status-widget.tsx`) registrado en `dashboard-types.ts`/`widget-manifest.ts`/`widget-registry.tsx`. *Dónde:* `src/components/dashboard/widgets/gen2/astraura-cortex-widget.tsx` + `src/lib/astraura/config-ui.ts` (ya registrado en `widget-manifest.ts:42`). *S-M · medio*

**Paleta de comandos: una entrada por sistema, no una genérica.** Hoy hay una sola acción «Configuración de Astraura / OmniVoice». Añadir 5 entradas («…: LLM», «…: Astraura», «…: OpenVoice», «…: Cerebro», «…: Señales») llamando `openAstrauraConfig(section)`, más una con la personalidad activa. Es el modo más barato de dar a conocer las puertas. *Dónde:* `src/components/layout/command-palette.tsx:250-276` + `src/lib/astraura/config-ui.ts:35`. *S · medio*

### 2.13 Transversal y design system

**Acento por pestaña real en la barra (SOP §7 hoy incumplido).** `SectionTabs` fija `border-primary/40 bg-primary/15 text-primary` para las cinco: los acentos LLM cian · Astraura ámbar · OpenVoice fucsia · Cerebro violeta · Señales esmeralda solo existen dentro de las tarjetas. Añadir `accent?` opcional a `SectionTabItem` con mapa de tonos; sin `accent` = `primary`, así los otros 14 consumidores no cambian. *Dónde:* `src/components/ui/section-tabs.tsx:24-37,128-149` + `SECTION_META` en `astraura-omnivoice-config.tsx:131`. *M · alto*

**Chip de procedencia: frase de 9px → etiqueta corta + icono + tooltip.** `ProvenanceChip` mete «automático (mejor disponible)» o «definido por la personalidad» en una píldora `text-[9px]`, el texto más pequeño de todo el OS. Partir `PROVENANCE_LABEL` en `SHORT` (Auto · Neurona · Persona · Cuenta) a 10px con icono (Wand2/Cpu/UserCog/User) y la frase larga en `title`. *Dónde:* `persona-system-sections.tsx:93-104` + `neuron-persona-systems.ts:435-440`. *S · alto*

**Cristal de verdad en el contenedor** — ver quick win 8; incluye alinear el drawer `sm:max-w-md` (448px) con los 560px del modal. *S · alto*

**Suelo de contraste y escala tipográfica.** Reparto real en los dos archivos: 45×10px · 22×11px · 13×12px · 2×15px · 1×9px; y 14 usos de `text-white/35`/`/40` dan ≈3,0-3,8:1 sobre `#0b0d12` (`/45` ≈4,5:1, justo al límite) cuando el checklist de `MASTER.md` exige 4,5:1. Suelo propuesto: hint 10px solo desde `white/50-55`, cuerpo 11px `white/70`, título de tarjeta 12px semibold, valor efectivo 13px. *Dónde:* `persona-system-sections.tsx:270,285,369,476,518,628,645,705` + `astraura-omnivoice-config.tsx:510,678,706` (y el resto de `text-[9|10|11px]`). *M · alto*

**Microinteracciones: píldoras vivas y cross-fade al cambiar de contexto.** `pill()`/`pillCls()` solo tienen `transition-colors` sin duración explícita y el cuerpo cambia de golpe al pulsar otra personalidad o pestaña. Añadir `duration-200`, `active:scale-[0.97]` y `shadow-[0_0_10px_-2px]` en el tono activo; y una `key` compuesta de sección + personalidad con `animate-in fade-in-0 slide-in-from-bottom-1 duration-200` en el cuerpo (tailwindcss-animate ya instalado). *Dónde:* `persona-system-sections.tsx:78-90` + `astraura-omnivoice-config.tsx:173-178,554` + `tailwind.config.ts:123`. *S · alto*

**Skeletons con la geometría real, no un spinner centrado.** `SectionLoading` y `SectionSpin` son el mismo spinner duplicado en dos archivos; cada sección colapsa a UNA línea y luego salta a tarjeta completa (peor en `AstrauraPersonaCard`, que empuja el bloque de orden). Un `SystemCardSkeleton` compartido con `.loading-shimmer` y la altura de la tarjeta destino. *Dónde:* `astraura-omnivoice-config.tsx:82-88` + `persona-system-sections.tsx:57-63,216,312,410,555,668` + `globals.css` (~2255). *M · medio*

**Una sola firma visual para las 5 entradas a la ventana.** El mismo destino se ve distinto en cada sitio: botón gris+Cpu, tarjeta cian+Bot, píldora fucsia+UserCog, enlace fucsia+BrainCog y tarjeta fucsia+Bot con CTA sólido. Exportar `SECTION_META` y un `<AstrauraSystemsButton section persona? variant="card|pill|link">` que tome icono y tono de la pestaña destino. *Dónde:* `personalities-panel.tsx:639` · `quick-settings-tab.tsx:212` · `signals-center.tsx:226` · `cerebro-hub.tsx:189` · `cuenta/page.tsx:949-965`. *M · alto*

**Capa de tokens propia de la ventana (preparar modo claro sin barrido ciego).** 155 utilidades duras (`text-white/*`, `bg-white/[0.0x]`, `border-white/10`, `bg-[#0b0d12]`) entre los dos archivos: en tema claro la ventana queda como isla oscura. Declarar `.astraura-window` en `globals.css` con `--aw-surface/-line/-text/-muted/-accent` resueltas bajo `.dark` y `:root:not(.dark)`, y sustituir por `bg-[var(--aw-surface)]` etc. Convierte el futuro modo claro en un cambio de hoja de estilo en vez de 155 ediciones. *Dónde:* `src/app/globals.css` (bloque nuevo) + los dos archivos de la ventana; criterio en `claude/pendiente-modo-claro-2026-08-05` §2. *L · alto*

**El «tamaño táctil grande» cubre select, switch y tab** — ver quick win 5. *S · alto*

**Chevron propio en los `<select>` nativos.** Los selects de Fuente/Modelo/Motor/Ruta no usan `appearance-none`: la flecha nativa del navegador rompe el estilo del sistema. Mantener `<select>` nativo (coherente con `setup-sentidos.tsx`/`setup-memoria.tsx`, mejor a11y táctil) pero envolver con `relative` + `ChevronDown` absoluto. *Dónde:* `persona-system-sections.tsx:238-266,331-347,614-623`. *S · bajo*

**Exportar el hook de resolución.** `useResolved()` (`resolvePersonaSystems` + suscripción en vivo al store y a `NEURON_EVENT`) es privado del archivo. Exportarlo como `useResolvedPersonaSystems` para que `/cuenta`, quick-settings y los widgets lean estado en vivo sin duplicar la lógica de suscripción: habilita directamente K1 y L1. *Dónde:* `persona-system-sections.tsx:123`. *S · medio*

**El orbe de Aurora tiñe según la clase del motor que respondió.** Suscribir el orbe a `ROUTE_EVENT`/`lastRoute()` y mapear `llmSourceAccessClass(sourceId)` a un cardinal Trinity (local=Horizon verde · starseed=Zenith azul · api-free=Logic ámbar · api-external=Anchor rojo) como mezcla de BAJO peso sobre las cintas, sin competir nunca con la energía de voz. Soberanía visible sin abrir panel; misma leyenda de color en `RouteChip` para que se aprenda. *Dónde:* `src/components/aurora/aurora-orb.tsx` + `router.ts:457` + `src/lib/astraura/model-preferences.ts:576` + `src/components/aurora/route-chip.tsx`. *M · alto*

**El chip «proceso» del chat deja de inventar quién respondió.** `chat-surface.tsx` descarta el retorno de `astrauraChat()` y fija `meta.provider = activeProviderConfig.label` (estático); capturar `const res = await astrauraChat(...)` y mapear `res.route` (sourceLabel/modelLabel/tier/local/attempts) a `AuroraMessageMeta`. Extraer `ProcessLine` (hoy local, no exportado) a componente compartido y montarlo también aquí. *Dónde:* `src/components/agent/chat-surface.tsx:280-310` + `src/components/exocortex/aurora-chat-view.tsx:415` + `router.ts:457`. *S · alto*

**Sonificación sutil opcional: una nota por sistema al guardar.** La ventana persiste al instante y en silencio absoluto. Módulo mínimo WebAudio (oscilador ~120 ms, gain ≤0.04, pentatónica, una nota por sistema; nota descendente al «volver a auto»). OFF por defecto, interruptor junto a accesibilidad, mudo si `reduceMotion==='always'`, `pauseAnimations` o `document.hidden`. Complementa el toast (A3), no lo sustituye. *Dónde:* NUEVO `src/lib/astraura/system-chime.ts` disparado desde `saveOverrides`/`clearOverrides` + gate con `src/lib/a11y/apply.ts`. *S · medio*

---

## 3. Olas sugeridas

**Ola 1 — «Que no mienta y no duela» (honestidad + accesibilidad + quick wins).** Todo lo S de impacto alto: los 10 quick wins, más riel de override, enlaces cruzados y estados vacíos reales, CTAs ≥44px, `aria-pressed`, chip de procedencia corto, microinteracciones, contador de reglas en el centro de Señales, personalidades del cerebro activo, `describeCaps` y puente entre recomendadores, export/import JSON, filtro de cerebros, chip «proceso» honesto y exportación de `useResolved` (que desbloquea la ola 2). Criterio de cierre: ningún control de la ventana promete un efecto que no ocurre, y ninguna diana táctil queda por debajo de 44px.

**Ola 2 — «Que se entienda de un vistazo» (legibilidad, comparación y superficies).** Acento por pestaña real, suelo de contraste y escala tipográfica, skeletons con geometría, firma visual única de las 5 entradas, chevrones; «volver a auto» por ámbito, diff antes/después, «aplicar lo recomendado», sheet inferior en móvil, atajos y swipe; orbe + geometría/semántica del `PersonaSelector`, copiar configuración, chip «N ajustes» y KPI, comparador de personalidades; estado en vivo en `/cuenta` y en el buscador de Ajustes, mini-panel de Trinity, escritorio y paleta de comandos; rosa de antenas, estado textual y colapsables. Criterio de cierre: el estado efectivo de los 5 sistemas se lee sin abrir la ventana, y dentro de ella se ve de un vistazo qué se ha tocado.

**Ola 3 — «Que actúe de verdad y respire» (runtime real + capa creativa + tokens).** Cableado de los pendientes del SOP §9: `cerebro.almacen` → `memory-destinations`, `transmit(personalityId)`, `personaAllowsPaid` en el router, `audioRef` → síntesis real, `neuronPrefersLocalLS` por personalidad; y encima la capa expresiva que solo tiene sentido con datos verdaderos: previsualización de la cadena de pin, «Aplicar» por fila en el scout, modo guía de primera vez, constelación y pulso de salud, resonancia y divergencia entre neuronas, orbe teñido por clase de motor, sonificación opcional y la capa de tokens `.astraura-window` que abre el modo claro. Criterio de cierre: desaparecen los tres chips «se guarda, aún no actúa» y la ventana es un órgano legible del exocórtex, no una pila de formularios.
