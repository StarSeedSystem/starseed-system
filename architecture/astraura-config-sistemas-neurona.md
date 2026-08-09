# SOP — Ventana «Configuración/actualización de sistemas de Astraura en esta neurona» (Adenda 149)

> **Fecha:** 2026-08-06 · **Estado:** fuente de verdad de esta ola.
> Rediseña la ventana emergente de Astraura+OmniVoice (Adendas 111 → 132 → 133 → 138) como
> **centro de sistemas por neurona × personalidad**, y crea la capa de datos que lo sustenta.
> Sustituye la cabecera de pestañas «Modelos · Cuenta» por **LLM · Astraura · OpenVoice · Cerebro · Señales**.

---

## 1 · Propósito

Cada **neurona** (dispositivo de la cuenta, `src/lib/neurons/neurons.ts`) debe adaptarse a cada
**personalidad** (Aurora, Hermione y las creadas por el usuario, `src/lib/aurora/personalities.ts`)
con todos sus rasgos, emociones, tono de voz, memorias y sistemas — eligiendo de forma
**automática e inteligente** las mejores opciones disponibles según las capacidades técnicas del
dispositivo, y dejando **todo editable**. La ventana es la puerta única de ese ajuste: aparece al
estrenar una neurona, al haber actualizaciones de sistemas instalados, o con recomendaciones de
novedades adecuadas detectadas automáticamente.

**Principios (Tríada §3 + invariantes §6 de CLAUDE.md):** el Exocórtex es propiedad del usuario;
gratis-y-local-primero (regla de Astraura: siempre funciona y cambia sola de fuente); defaults
soberanos con todo activado pero nada de pago sin permiso (`permitirPago`); nunca se rompe la voz
ni la inteligencia por un pin obsoleto (los pins van primero en la cadena, no son exclusivos).

## 2 · Título y modos de la ventana (contexto dinámico)

`updateReason()` (`src/lib/astraura/startup-updates.ts`) da `primera-vez | novedades | al-dia`.
La novedad se **clasifica** con el helper nuevo `classifyUpdates()` (ver §3.5) según afecte o no a
sistemas EN USO en esta neurona:

| Contexto | Título | Subtítulo |
|---|---|---|
| `primera-vez` (neurona nueva) | **Configuración de sistemas de Astraura en esta neurona** | Bienvenida: selecciones automáticas según su hardware, todo editable |
| `novedades` que afectan a sistemas instalados/en uso | **Actualización de sistemas de Astraura en esta neurona** | Qué sistemas en uso tienen versión/alternativa nueva |
| `novedades` solo de catálogo | **Recomendaciones para esta neurona** | Novedades adecuadas detectadas y sugeridas automáticamente (scout Adenda 138) |
| `al-dia` (apertura manual) | **Sistemas de Astraura en esta neurona** | Todo al día; revisar y editar |

El gate de auto-apertura, el snooze y el evento manual **no cambian** (`startup-updates-modal.tsx`
sigue siendo envoltorio fino; `shouldShowUpdates`, `subscribeStartupOpen`, `isSetupPending` intactos).

### 2b · APARICIÓN GARANTIZADA por neurona (tanda «3 olas» · petición Alex 2026-08-06)

La ventana debe aparecer automáticamente en CADA neurona: con cada actualización o recomendación
nueva de cualquier tipo, y REAPARECER al reiniciar mientras quede algo por configurar, con sus
recomendaciones inteligentes. Implementación:

- `startup-updates.ts::pendingConfiguration()` — lista honesta de lo pendiente de la neurona
  (configuración inicial sin completar; vía de voz sin elegir, pospuesta u obsoleta). `shouldShowUpdates()`
  la integra: pendiente ⇒ la ventana reaparece cada arranque (el snooze de «Recordar luego», 24 h,
  se respeta en todas las vías). `ClassifiedUpdates.pendientes` la lleva al título (`windowHeading`)
  y a la tarjeta «Configuración pendiente» con botón «Configurar ahora» por item.
- **Gate de 3 vías** en `startup-updates-modal.tsx`: sin setup de Aurora pendiente → abre a los
  1200 ms; pendiente → se SUSCRIBE (`subscribeSetup`) y abre 800 ms después de que el Centro
  termine; y RED DE SEGURIDAD a los 9 s — si el Centro sigue pendiente pero NO está en pantalla
  (marcador `data-aurora-setup-center` en su overlay), abre igualmente. Cierra la regresión de la
  A132 por la que una neurona sin el setup completado no veía la ventana NUNCA.
- La ventana abierta no queda rancia: reclasifica novedades/pendientes en vivo al elegir la vía de
  voz (`starseed:voz-neurona-reopen`) o al cambiar el estado de arranque (`starseed:astraura-startup`).
- `voice-neuron-onboarding` cede el paso: no se auto-abre si esta ventana va a mostrarse (decisión:
  UNA sola ventana de primera configuración; la vía de voz se elige dentro, pestaña OpenVoice).

## 3 · Capa nueva: `src/lib/astraura/neuron-persona-systems.ts`

Módulo LIVIANO (datos + lógica pura, SSR-safe, nunca lanza) — el «salvo» por neurona del mismo
patrón que `PersonalityIntelligence` (Adenda 67): **por defecto todo `auto` y esta capa no cambia
nada**; solo al editar se crean overrides.

### 3.1 Persistencia

- Clave `starseed.astraura.neuron-persona.v1` (localStorage → viaja con la cuenta añadiéndola a
  la lista de `src/lib/settings-sync.ts`, igual que `starseed.neurons.prefs.v1`).
- Forma: `{ [deviceId]: { [personalityId | "*"]: PersonaNeuronOverrides } }`. La clave `"*"`
  son los defaults de la neurona para «Todas las personalidades».

### 3.2 Tipos (overrides TODOS opcionales = heredar/auto)

```ts
interface PersonaNeuronOverrides {
  llm?:      { fuente?: string; modelo?: string };               // pin LLM en ESTA neurona
  astraura?: { modo?: "auto"|"fija"; permitirPago?: boolean };   // sistema/router en esta neurona
  voz?:      { motor?: string;      modo?: "cloud"|"local" };    // motor OpenVoice/…, vía por neurona
  cerebro?:  { almacen?: "auto"|"local"|"servidor";
               usarMemorias?: boolean; nivelContexto?: "breve"|"completo";
               cerebrosPermitidos?: "todos" | string[]; syncBrains?: boolean };
  senales?:  { porAntena?: Record<string, AntennaRule> };        // reglas por antena
}
interface AntennaRule { enabled?: boolean; entrada?: boolean; salida?: boolean;
                        ruta?: "auto"|"privada"|"mesh"|"servidor" }  // ausente ⇒ true/auto
```

### 3.3 Detección de antenas — `detectAntennas(caps?)`

Inventario de las antenas del dispositivo con disponibilidad real (sondas defensivas):
`wifi` (navigator.onLine / connection), `bluetooth` (navigator.bluetooth), `serial`
(navigator.serial → nodo LoRa por USB), `daemon` (meshtasticd por HTTP/TCP,
`MESH_DAEMON_DEFAULT_URL`), `mesh-sim` (simulador siempre disponible). Devuelve
`{ id, label, kind, available, detail }[]`. No abre conexiones: solo capacidad.

### 3.4 Resolución — `resolvePersonaSystems(personalityId, deviceId, caps)`

Devuelve la config **efectiva** de cada sistema con su **procedencia** (`"neurona" | "personalidad"
| "cuenta" | "auto"`), aplicando la precedencia (de más específica a más general):

1. Override neurona×personalidad (esta capa) → 2. Override neurona `"*"` → 3. La personalidad
(`PersonalityProfile.intelligence/voiceStyle/memoryPolicy/connectivity`) → 4. La neurona
(`NeuronSettings`, `starseed.voz.neurona.v2`, prefs de modelos por neurona de
`model-preferences.ts`) → 5. La cuenta → 6. **AUTO** (recomendadores existentes:
`classifyDeviceTier` + `recommendedOrder`, scout de `model-recommend/model-scout`,
`buildVoiceChain`/`AUTO_ENDPOINT_ORDER`, `DEFAULT_CONNECTIVITY_CONFIG`).

**Nada se reimplementa:** los recomendadores, catálogos, cadena de voz y router actuales son la
fuente; esta capa solo resuelve y persiste elecciones.

### 3.5 Novedades por sistema — `classifyUpdates()`

Sobre `newModelIdsSince()` / `newIntegrationsSince()` (Adenda 111): separa las novedades que
afectan a sistemas **en uso** en esta neurona (motor LLM/voz efectivo de alguna personalidad,
fuentes activas) de las **solo-catálogo** → decide el modo del título (§2) y alimenta el
resumen de novedades de la pestaña Astraura.

## 4 · Las 5 pestañas de la barra superior

Ids nuevos de `SetupSection`: `llm · astraura · openvoice · cerebro · senales` (la variante
`embedded` del hub conserva además `neuronas · integraciones · apis`). Sinónimos retro-compatibles
en `sectionFromSynonym`: `modelos/orden/cuenta/estrategia → astraura`, `voz/omnivoice → openvoice`,
`señales/antenas/conectividad → senales`, `memoria/cerebros → cerebro`. Deep-links `?tab=` intactos.

| Pestaña | Contenido (módulos reales reutilizados) |
|---|---|
| **LLM** | Modelo LLM efectivo por personalidad en esta neurona (procedencia visible) + editor de pin `fuente/modelo` (clases de `MODEL_ACCESS_META`; catálogo del scout) + `ModelScoutPanel kind="llm"` (Adenda 138) con «Usar sugerido» aplicado a la personalidad seleccionada. |
| **Astraura** | La vista de RELACIONES (petición Alex 2026-08-06): tabla «Relaciones de modelos y sistemas por personalidad en esta neurona» (`PersonaCompareTable` con navegación: pulsar personalidad la selecciona, pulsar sistema abre su pestaña; «Igualar a esta» con confirmación) + modo Automático/Fija y permitir pago POR personalidad (`AstrauraPersonaCard`) + orden de preferencia de clases CUENTA⟷NEURONA (UI de la A133 íntegra), auto-actualización, novedades clasificadas (§3.5), «Aplicar lo recomendado», export/import JSON y «Diagnosticar y reparar». |
| **OpenVoice** | Voz por personalidad: motor efectivo + editor de pin (motores de `listVoiceEngines` disponibles en esta neurona; primario `openvoice2`), vía de la neurona nube⟷local (`NeuronVoiceChoice` compacto, clave `starseed.voz.neurona.v2`) y coherencia de persona (Adenda 112: `PersonaCoherencePanel`/nota de coherencia — el carácter se conserva en todos los motores). |
| **Cerebro** | Memoria por personalidad (`memoryPolicy`: usar memorias, nivel de contexto, cerebros permitidos de `listBrains()`), almacén auto/local/servidor con la capacidad real (`storageQuotaGb/UsedGb`, CasaOS, servidores de `brains/servers.ts`), sincronizar cerebros con esta neurona (`NeuronSettings.syncBrains`) y enlaces a `/agent?tab=cerebro` y `/servidores`. |
| **Señales** | Antenas detectadas (§3.3) con interruptores **entrada/salida** y **ruta** (auto/privada/mesh/servidor — política de la red sináptica Adenda 99) por antena y por personalidad; accesos rápidos malla/internet público (`ConnectivityConfig` de la neurona); enlaces a `/senales` y al Centro de Conexiones. |

**Selector de personalidad:** fila de chips bajo la cabecera — «Todas» (defaults de la neurona,
clave `"*"`) + cada `PersonalityProfile` (`listPersonalityProfiles()`, activa primero, con su
icono Lucide). Todo lo editado aplica a la personalidad seleccionada; cada control muestra su
estado efectivo con procedencia y botón «volver a auto» (quitar override). La ventana puede
abrirse con una personalidad preseleccionada (§6).

**Defaults:** todo activado y en `auto`; la selección automática prioriza las opciones más
completas y de mayor capacidad disponibles para el dispositivo (gama por `classifyDeviceTier`),
manteniendo la coherencia de la personalidad en todos los sentidos (voz por persona portátil,
memoria por política de la personalidad, señales por su `connectivity`).

## 5 · Archivos de la ola

- **NUEVO** `src/lib/astraura/neuron-persona-store.ts` — STORE núcleo sin dependencias (solo safe-storage): tipos, persistencia con fusión campo-a-campo («*»⊕personalidad, antena a antena) y PODA (un campo `undefined` explícito borra; nunca queda `{}` fantasma que enmascare la herencia). Los consumidores de runtime importan de aquí (cero ciclos).
- **NUEVO** `src/lib/astraura/neuron-persona-systems.ts` — capa alta (§3): resolución con procedencia, detectAntennas, classifyUpdates, windowHeading, personaChips; re-exporta el store entero.
- **NUEVO** `src/components/astraura/persona-system-sections.tsx` — selector de personalidad + secciones LLM/OpenVoice/Cerebro/Señales + `AstrauraPersonaCard` (modo/pago por personalidad).
- **NUEVO** `src/ai/astraura/mesh/persona-antenna-gate.ts` — puerta de antenas para el mesh (§5b), importa SOLO el store.
- **MOD** `src/components/astraura/astraura-omnivoice-config.tsx` — títulos §2, pestañas §4, montaje de secciones; conserva variantes modal/embedded/drawer, persistencia y «Configuración completa».
- **MOD** `src/lib/astraura/config-ui.ts` — `openAstrauraConfig(section?, { personalityId? })` (detail ampliado, retro-compatible).
- **MOD** `src/components/astraura/astraura-config-drawer.tsx` — pasa `initialPersonalityId`; textos accesibles nuevos.
- **MOD** `src/components/astraura/startup-updates-modal.tsx` — solo comentarios/aria (el gate no cambia).
- **MOD** `src/lib/settings-sync.ts` — añade `starseed.astraura.neuron-persona.v1` **y** repara `starseed.astraura.model-order.v1` (tenía evento en realtime-sync pero nunca viajaba).
- **MOD** `src/lib/sync/realtime-sync.ts` — `EVENT_BY_KEY` de la clave nueva → `starseed:astraura-neuron-persona` (un cambio remoto refresca el panel en vivo).
- **MOD** superficies §6 (botones/atajos donde ya exista el patrón; sin rutas nuevas → no toca dock/launcher).

## 5b · Cableado de RUNTIME (2ª ola de la 149 — los overrides ACTÚAN)

Regla de todos los puntos: **camino rápido sin overrides = comportamiento byte-idéntico al previo** (verificado por revisión adversarial dedicada + 146/146 tests mesh + suite temporal de 10 casos sobre pines/memoria/voz).

- **LLM** — `personalities.ts::intelligencePinFor`: el pin `llm.{fuente,modelo}` de la neurona va PRIMERO (no exclusivo, mismo contrato que el pin de personalidad, incluso el tratamiento de `"auto"`); aplica a TODOS los sentidos del router (también «voz» = LLM de tareas rápidas; el MOTOR de voz es otro plano). `astraura.modo:"auto"` de la neurona fuerza automática aunque la personalidad esté «fija».
- **VOZ** — `engine-registry.ts`: paso 0 de `refreshPersonalityVoicePin` lee `voz.motor` del override (validado con `isVoiceEngineId`); `personalityVoiceEnginePin()` relee EN FRESCO (un cambio del panel aplica en la frase siguiente); `voz.modo` (cloud/local/fastweb) de la personalidad activa manda sobre la elección por dispositivo al ordenar la cadena.
- **MEMORIA** — `personalities.ts::effectiveMemoryPolicy(p)` fusiona `memoryPolicy` con `cerebro.{usarMemorias,nivelContexto,cerebrosPermitidos}` y alimenta `compilePersonalityPrompt` (único lector de runtime).
- **SEÑALES** — `mesh/persona-antenna-gate.ts` (`antennaRuleFor`/`outboundAllowed`/`inboundAllowed`/`preferredRouteFor`; la antena lógica «lora» manda sobre el enlace físico serial/BLE/daemon) cableado en 4 puntos: `sendOverMesh` (salida por malla → reutiliza el rol «off»), `transmit` (flags: sin salida wifi → sin servidor/público), `deliverInbound` (entrada por antena; los llamantes de red externa pasan `antena:"wifi"` para no matar relé/feed/realtime al cerrar LoRa), y `decideRoute` (ruta preferida inclina SOLO entre vías ya legales; «auto» no cambia nada). `preferredRouteFor` recorre la especificidad fija lora→serial→bluetooth→daemon→wifi y toma la primera regla activa con salida y ruta ≠ auto.
- **SYNC** — la clave viaja con la cuenta (settings-sync) y refresca en vivo (realtime-sync); los consumidores leen fresco de localStorage, así que el sync aplica sin depender del evento.

## 6 · Superficies donde vive (medios correctos, CLAUDE.md §11)

Ya existentes y conservadas: auto-apertura por neurona; drawer global (`openAstrauraConfig`);
pestaña **Configuración IA** de /agent (hub embedded); CTAs en Nexus y Modelos & Proveedores;
botón «Configurar IA» de la cabecera de /agent. Nuevas entradas de esta ola: botón «Sistemas en
esta neurona» en el hub/panel de **Personalidades** (abre con esa personalidad preseleccionada);
acceso desde la pestaña de ajustes rápidos del **Trinity Control Center** (`quick-settings-tab`);
enlaces cruzados desde **Señales** (`/senales`) y **Cerebro** (pestaña de /agent) hacia su pestaña
correspondiente. No se crean rutas nuevas (no aplica migración de dock).

## 7 · Diseño

Crystal Liquid Glass (design-system/starseed-system/MASTER.md): tarjetas `border-white/10
bg-white/[0.03]`, acentos por pestaña (LLM cian · Astraura ámbar · OpenVoice fucsia · Cerebro
violeta · Señales esmeralda — coherente con Trinity), iconos Lucide (nunca emoji), `cursor-pointer`
en todo lo clicable, transiciones 150–300 ms, `SectionTabs` con desbordamiento scrolleable (fix
A132), procedencia como chips pequeños, aria-labels en controles por antena y por personalidad.
Responsive: chips y rejillas envuelven; el modal mantiene `max-h-[88dvh]` con cuerpo scrolleable.

## 8 · Verificación de la ola

`tsc --noEmit` limpio · `next build` OK (✓ Compiled successfully) · 146/146 tests de
`scripts/test-mesh-core.ts` (incluye `decideRoute` con la puerta nueva) · DOS revisiones
adversariales dedicadas (diseño/UI y cableado de runtime) con sus hallazgos ALTO/MEDIO corregidos
en esta misma ola (fusión campo-a-campo con poda, única fuente de verdad de `syncBrains`, tarjeta
Astraura por personalidad, pin LLM aplicado también al sentido «voz» del router, cache de deviceId
eliminada del gate) · deep-links viejos (`?tab=modelos|voz|cuenta|orden`) verificados · sin
overrides el comportamiento del router/voz/memoria/señales es EXACTAMENTE el previo.

## 9 · Estado tras la tanda «3 olas» (2026-08-06/07)

**CABLEADO en la tanda (ya NO pendiente):**
- `permitirPago` por personalidad×neurona → `personalities.ts::personaAllowsPaid` +
  `router.ts::rankCandidates(opts)`: restricción AND que SOLO puede negar (nunca afloja el
  filtro de cuenta ni «only-free»). El campo del perfil solo hereda en `modo:"fija"` (su ámbito
  histórico) — tratarlo en «auto» habría vetado las fuentes de pago de toda cuenta por su default
  `false` (CRÍTICO cazado por la revisión adversarial de la tanda, corregido).
- Señales por personalidad emisora → `TransmitInput.personalityId` llega a las puertas de antena
  (`meshOutboundAllowed`/`outboundAllowed`); `publishForContext`/`transmitForContext` lo propagan.
- `cerebro.almacen` → `memory-destinations.ts::effectiveBrainStore` (local = sin push a
  starseed/external ese ciclo; servidor = forzar push; auto = idéntico a antes).
- `voiceStyle.audioRef` → síntesis real (`neural-tts` → `openvoice2` con `refBlob`+`refKey`,
  decodificación base64 propia — CSP-safe — con caché por personalidad; corrupto ⇒ semilla).
- `voz.modo` por personalidad en el híbrido (`omnivoice-hybrid::neuronPrefersLocalLS(personalityId)`).
- Botones predeterminados del dock garantizados en TODAS las neuronas/cuentas
  (`dock-config.ts`: `ensureDefaultDockItems` CONTINUA para 'senales' y 'red-feed' + migración
  v13 — cierra el agujero de banderas locales vs clave sincronizada). Personalizable: un botón
  presente pero deshabilitado por el usuario se respeta.

**Cerrado después de la tanda (2026-08-09):**
- RUTA PREFERIDA por personalidad: `DecideRouteInput.personaId` →
  `decision-router.ts::decideRoute` llama `preferredRouteFor(input.personaId)`; `sendOverMesh`
  propaga su `neuronId` (el MISMO id que ya gobierna las puertas de antena) y `turn.ts` añade
  `personalityId: persona?.profile?.id` a su `transmitForContext`. Sin personalidad el valor viaja
  `undefined` y el router decide EXACTAMENTE igual que antes (defaults «*»). `transmit` no llama a
  `decideRoute` (planifica por `deriveNetworkContext`+`deliver`), así que ahí la personalidad sigue
  actuando solo por las puertas de salida — que es todo lo que esa vía usa. 149/149 tests de
  `scripts/test-mesh-core.ts` (3 nuevos: «*» sin persona · persona que fuerza mesh · persona ajena
  que NO hereda).
- PAGO del puente Hermione unificado con el AND del router: `hermione-bridge` usa
  `account.allowConfiguredPaid === true && personaAllowsPaid(profile) !== false`; el servidor
  (`hermione-server`, sin acceso a localStorage) aplica el espejo `personaPaidVerdictFromPin`
  (veto del perfil SOLO en modo «fija»). CAMBIO INTENCIONAL: cuenta-off + pin-true ya NO habilita
  pago (cierra un agujero de gasto; la cuenta manda, la persona solo niega). 16/16 verificados.
- `voz.modo:"cloud"` EXPLÍCITO por personalidad ahora pone la NUBE primero aunque el daemon local
  esté vivo, con el local como RESPALDO (`OmniRouteDecision.localFallback`; la voz nunca se rompe;
  `local_only`/`cloud_only` de privacidad siguen mandando). La elección por DISPOSITIVO conserva
  su semántica histórica («el local, si lo instalas, la adelanta») — asimetría documentada.
- MIGRACIÓN REALTIME `20260711120000_realtime_publication.sql` APLICADA al proyecto del OS
  (`nxstilnyidvkqeosofuh`) vía Management API (HTTP 201) y verificada: `entity_state`, `os_posts`,
  `os_profiles`, `canvases`, `os_spaces`, `os_space_editors`, `user_settings` y `proposals` están
  en `supabase_realtime`.
- ESCRITORIO con estado real: el widget Córtex Astraura añade la franja «sistemas de esta neurona»
  (5 chips con valores de `resolvePersonaSystems`, import perezoso, clic → `openAstrauraConfig`);
  `quick-settings-tab` pasa a import perezoso (no arrastra personalities al chunk de Trinity).

**Pendiente honesto (aplazado):**
- Entrada/`anyAlertRelayRole`: tráfico no atribuible, usan «*» por diseño; «repetidor sordo»
  (entrada LoRa cerrada + salida abierta reemite alertas) documentado como semántica.
- Trampa de foco vs capas portalizadas: mitigada con guarda global en `use-modal-a11y` (cede ante
  alertdialog/sonner); revisar el ciclo completo si se añaden más capas.
- Las SUGERENCIAS del widget Córtex siguen simuladas (la franja de sistemas ya es real); sync LWW
  del mapa completo (patrón general de claves sincronizadas); rotar service_role + DashScope
  (acción de Alex en los dashboards); modo claro global (la capa `--aw-*` ya deja la ventana lista).
