# Neuronas — Capacidades de hardware y modelos recomendados (Adenda 109)

Cada neurona (dispositivo con la cuenta) detecta sus capacidades reales y recibe una
recomendación inteligente de los mejores modelos de IA (Astraura/OpenRouter/local) y de
voz (OmniVoice) para ella, con los **requisitos mínimos de CPU/GPU/RAM** de cada opción y
una prueba funcional. Es la base de la política local-vs-servidor.

## Principio local-vs-servidor
- **Modelos LOCALES** (WebGPU/WebLLM, Ollama/LM Studio, descargables, motores de voz Kokoro/
  Piper/XTTS/Bark…): corren **en el dispositivo** → tienen requisitos reales de hardware. Para
  usarlos hace falta la **app del OS instalada** (stack local) y capacidad suficiente.
- **Modelos de SERVIDOR** (StarSeed oficial, OpenRouter, servidor propio por API/MCP): corren
  **en el servidor** → **sin requisito de hardware local**, funcionan en **cualquier neurona**
  donde entre la cuenta sin instalar nada (basta conexión y, a veces, una clave).
- Por defecto: si la app está instalada y el dispositivo es capaz → **local** (privado, offline);
  si no → **servidor StarSeed**. Todo ajustable luego por chat, personalidad y cerebro.

## Piezas
- **Detección de hardware** — `src/lib/neurons/neurons.ts` · `detectCapabilities()` /
  `NeuronCapabilities`. Ya cubría CPU (`hardwareConcurrency`), RAM (`deviceMemory`), WebGPU,
  almacenamiento, batería, Ollama/LM Studio. **Adenda 109 añade GPU**: `gpuRenderer`/`gpuVendor`
  vía `WEBGL_debug_renderer_info` + `webgl2`. Todo defensivo/SSR-safe.
- **Requisitos por modelo** — `src/ai/astraura/model-requirements.ts` (NUEVO, puro). `ModelSpec`
  + `HardwareReq` para modelos locales de LLM y voz y para los de servidor (req vacío). Tablas
  `LOCAL_LLM_SPECS`, `SERVER_LLM_SPECS`, `LOCAL_VOICE_SPECS`, `SERVER_VOICE_SPECS`. Funciones
  `fitFor(caps, spec)` → `{level: ideal|suficiente|justo|insuficiente, fits, reasons}`,
  `classifyDeviceTier(caps)` → `alto|medio|bajo|minimo` (la gama «alto» exige GPU dedicada o
  Apple Silicon), `describeReq`, `describeCaps`, `runsRemotely`.
- **Recomendador** — `src/ai/astraura/model-recommend.ts` (NUEVO, puro). `recommendModels(caps,
  {osInstalled, hasAccount})` → mejor LLM y voz con `best` / `bestLocal` / `bestServer` / `ranked`,
  `availableNow(caps, spec, osInstalled)`, `strategy` (local|servidor) y `summary`. El
  «bestServer» prefiere el servidor **StarSeed oficial**; el «best» por defecto es local solo si
  la app está instalada, la gama no es mínima y hay un local disponible que encaje ≥ suficiente.
- **UI** — `src/components/neurons/neuron-models-panel.tsx` (NUEVO): tarjeta de capacidades
  detectadas + gama, LLM y voz recomendados por acceso con badge de encaje, requisitos mínimos por
  opción, disponibilidad, racional y **botón «Probar»** funcional (WebGPU pide adaptador real,
  Chrome AI comprueba `LanguageModel`, Ollama detecta el servidor local, servidor comprueba
  conexión; local no instalado indica qué falta).

## Dónde se ve (superficies)
- **Astraura AI** (`src/app/(app)/agent/page.tsx`): nueva pestaña **«Neuronas»** en la sección
  Infraestructura (junto a Cerebros/Servidores) → `NeuronModelsPanel`. Es pestaña dentro de la app
  `/agent` ya registrada; **no** requiere migración de dock.
- **Cerebro → Neuronas** (`src/components/cerebro/neuronas-panel.tsx`): el panel se **embebe**
  (`<NeuronModelsPanel embedded />`) encima de la gestión de neuronas existente (presencia,
  permisos, rol, CasaOS…).

## Verificación
- `scripts/test-model-recommend.ts` (34/34): gama por capacidades, servidor siempre encaja,
  WebGPU sin WebGPU→insuficiente, disponibilidad con/sin app, estrategia local (gama alta+app) vs
  servidor (media sin app · móvil · desconocido), bestServer=StarSeed, `describeReq`.

## Pendiente / próximos pasos (roadmap del mega-encargo)
Esta ola es la **fundación** (detección + requisitos + recomendación + pestaña). El resto está
integrado en olas posteriores; ver `gestion-por-neurona.md` (item #4) para el estado:
1. **Ventana unificada de inicio/actualizaciones** de Astraura + OmniVoice — ✅ hecha (Adenda 111,
   `startup-updates-modal.tsx` + `startup-updates.ts`, `src/app/(app)/app-providers.tsx`; contrato
   propio: `ventana-inicio-actualizaciones.md`).
2. **Coherencia de voz y personalidad al cambiar de modelo** — ✅ hecha (Adenda 112,
   `persona-coherence.ts` + `lang-detect.ts`, `persona-coherence-panel.tsx`; contrato propio:
   `coherencia-persona-voz.md`).
3. **Descarga de modelos locales** en segundo plano + notificaciones + modelos propios (API/MCP)
   — ✅ hecha (Adenda 113, `model-downloads.ts`, `custom-models.ts`, `model-downloads-panel.tsx`,
   `model-download-notifier.tsx`; contrato propio: `descargas-modelos-locales-propios.md`).
4. **Gestión completa por neurona** en la pestaña Neuronas (ubicación, rol servidor/receptor,
   ofrecer internet público con puerto, logs por neurona, política de memorias/sincronización) —
   ✅ hecha (Adenda 114, `neuron-server-config.tsx`, `neuron-logs.ts`, `neurons.ts`; contrato propio:
   `gestion-por-neurona.md`).

## Pendiente de seguridad (horizonte de la Adenda 108)
- **Revocación por autoridad de cuenta** (revocar la fp de un dispositivo perdido sin su clave, vía
  certificado de revocación pre-generado o firma de clave de cuenta superior) — ✅ hecha (Adenda 115:
  `mesh-identity.ts::getRevocationCert()` persiste el acta de revocación pre-generada;
  `server-relay.ts::registerIdentity()` la sube a la cuenta como `kind:"revocation-cert"`,
  `revokeDeviceByCert()` la publica, `refreshRevocations()` la honra; panel en
  `connectivity-config-panel.tsx`).
- **Emisión/renovación de tokens** (endpoint de emisión, refresh y lista de revocación) más allá
  del `exp` estático — ✅ hecha (Adenda 117: servidor de referencia con `verifySignedToken`
  HMAC/SHA256 de clave rotable, `/tokens/issue`/`/tokens/rotate-key`, `/tokens/revoke`; cliente en
  `src/ai/astraura/mesh/server-admin.ts` con `issueServerToken`, `refreshServerToken`,
  `revokeServerToken`, `rotateServerTokenKey`; UI en
  `src/components/connectivity/server-token-admin.tsx`; contrato propio:
  `refinamientos-pex-tokens-oferta.md`).
- **Reloj lógico** entre pares para reconciliar orden con relojes desincronizados — ✅ hecha
  (Adenda 115: `mesh/logical-clock.ts` con `tick()`/`observe()`/`current()`/`compareLamport()`,
  persistido; estampa `lc` en los envelopes a servidores propios y en `pullFromEndpoint`;
  columna en Postgres/SQLite; contrato: `seguridad-revocacion-reloj.md`; tests:
  `scripts/test-logical-clock.ts` 12/12).
- **Descubrimiento automático de pares de confianza** desde el registro de identidades de la
  cuenta/grupo — a medias: hay PEX de confianza filtrable por allowlist en el servidor de
  referencia (`docs/examples/starseed-mesh-server/index.mjs`, Adenda 117) y descubrimiento
  pasivo de nodos en `mesh/discovery.ts` (Adenda 97), pero la conexión automática "desde el
  registro de identidades de la cuenta/grupo" no está integrada.

*Relacionado: `astraura-inteligencia.md` (router LLM gratis-primero), `astraura-mesh-meshtastic.md`
(neuronas = cerebro+servidor), `servidor-propio-protocolo.md` (Adendas 99-108).*
