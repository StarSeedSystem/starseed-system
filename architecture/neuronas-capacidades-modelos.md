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
Esta ola es la **fundación** (detección + requisitos + recomendación + pestaña). Faltan, en olas
siguientes, el resto de lo pedido:
1. **Ventana unificada de inicio/actualizaciones** de Astraura + OmniVoice: al entrar en una
   neurona por primera vez o cuando haya **nuevos modelos** (OpenRouter/OmniVoice/servidor),
   emergente con las selecciones automáticas por capacidades + preferencias de cuenta, pruebas e
   instalaciones, y actualizaciones opcionalmente automáticas. Reaparece al detectar novedades.
2. **Coherencia de voz y personalidad al cambiar de modelo**: mantener tono/emoción/carácter y
   conocimientos del cerebro aunque cambie el sistema de voz o LLM; presets de voz de referencia
   por defecto (audio refs si el modelo lo permite); detección/selección de idioma por chat, en
   **todas** las secciones de chat de Astraura.
3. **Descarga de modelos locales** en la app (segundo plano + notificaciones al completar) y gating
   por instalación del OS; integración de modelos propios por clave (API) o MCP; los de StarSeed =
   los que ofrezca el servidor oficial.
4. **Gestión completa por neurona** en la pestaña Neuronas: ubicación, estado, cerebros, antenas,
   conexiones (mesh pública/privada), vínculo a servidores, ofrecer internet público con recursos
   o puerto, logs por neurona, rol servidor/receptor y política de memorias/sincronización.

## Pendiente de seguridad (horizonte de la Adenda 108)
- **Revocación por autoridad de cuenta** (revocar la fp de un dispositivo perdido sin su clave, vía
  certificado de revocación pre-generado o firma de clave de cuenta superior).
- **Emisión/renovación de tokens** (endpoint de emisión, refresh y lista de revocación) más allá
  del `exp` estático.
- **Reloj lógico** entre pares para reconciliar orden con relojes desincronizados.
- **Descubrimiento automático de pares de confianza** desde el registro de identidades de la cuenta/grupo.

*Relacionado: `astraura-inteligencia.md` (router LLM gratis-primero), `astraura-mesh-meshtastic.md`
(neuronas = cerebro+servidor), `servidor-propio-protocolo.md` (Adendas 99-108).*
