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
| **Astraura** | El sistema que decide: orden de preferencia de clases CUENTA⟷NEURONA (UI existente de la Adenda 133 íntegra), modo Automático/Fijo, `permitirPago` por personalidad, auto-actualización, novedades clasificadas (§3.5) y «Diagnosticar y reparar». |
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

## 9 · Pendiente honesto (aplazado, NO cableado aún)

- `permitirPago` por personalidad×neurona se persiste y llega al pin, pero el router solo aplica
  el filtro de pago a nivel CUENTA (herencia de la A67: `pin.permitirPago` era ya inerte). El
  interruptor lo declara («respeta el filtro global de pago de la cuenta»).
- Las reglas de Señales de una personalidad CONCRETA rigen cuando el envío lleve personalidad
  emisora; hoy `transmit`/`decideRoute` no la reciben → rigen los defaults «Todas» (TODO
  documentado en `transmit`). Entrada/`anyAlertRelayRole` son tráfico no atribuible: usan «*» por
  diseño. Un relé con entrada LoRa cerrada y salida abierta reemite alertas («repetidor sordo»).
- `cerebro.almacen` (auto/local/servidor) se persiste y se muestra, sin consumidor de runtime aún
  (siguiente ola: `memory-destinations.ts`).
- `omnivoice-hybrid.ts::neuronPrefersLocalLS` decide local/nube DENTRO del híbrido solo con la
  elección del dispositivo (no lee `voz.modo` por personalidad).
- `voiceStyle.audioRef` de personalidades custom sigue sin llegar a la síntesis (hallazgo del
  análisis de estado 2026-08-06, previo a esta ola).
- Widgets de dashboard/escritorio: sin entrada propia todavía (accesos actuales: ventana de
  arranque, drawer global, /agent config-ia + aliases `sistemas`, /cuenta, Control Center,
  Personalidades, Señales, Cerebro hub).
- Sync de la clave nueva es LWW del mapa completo (patrón de todas las claves sincronizadas):
  ediciones simultáneas en dos neuronas pueden pisarse dentro de la ventana de propagación.
