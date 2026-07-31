# Gestión por neurona + refinamientos (Adenda 114)

Dos cosas: (A) **refina** los pendientes que quedaron abiertos en 111-113 y (B) avanza el roadmap
**item #4** — gestión completa de cada neurona (servidor/receptor, ubicación, ofrecer internet
público con puerto, política de memorias y bitácora independiente).

## A · Refinamientos
- **Prueba de modelo propio** (refina 113): `probeCustomModel(m)` en `custom-models.ts` — local/API
  alcanzan el endpoint (fetch `no-cors` con timeout 4 s → sabe si RESPONDE); MCP con URL se prueba,
  con nombre queda «registrado» (se valida al usarlo); sin endpoint avisa. Botón **«Probar»** en la
  ficha de cada modelo propio.
- **Persona → personalidad activa** (refina 112): en el panel «Voz coherente», botón **«Aplicar a la
  personalidad activa»** que escribe la persona (tono/emoción/rate/pitch/energy + `audioRef` builtin)
  en el `PersonalityProfile` activo vía `patchPersonalityVoice`, de modo que **persiste por
  personalidad** (no solo la modulación viva global). Si no hay personalidad activa, se aplica solo a
  la voz y se avisa.

## B · Gestión por neurona (item #4)
- `src/lib/neurons/neurons.ts` — `NeuronSettings` gana `location?`, `offerPublicInternet?`,
  `publicPort?` (el setter `setNeuronSettings` ya fusiona parches; viajan con la cuenta).
- `src/lib/neurons/neuron-logs.ts` (NUEVO): **bitácora por neurona** (buffer circular en localStorage
  por deviceId, `MAX_LOGS_PER_NEURON` = 120). `logNeuron(deviceId, level, msg)`,
  `getNeuronLogs(deviceId)` (más reciente primero), `clearNeuronLogs`, `subscribeNeuronLogs`.
  Niveles: info/warn/error/sync/net/server.
- `src/components/neurons/neuron-server-config.tsx` (NUEVO): configura ESTA neurona —
  **rol** (cerebro/receptor · servidor/provee · ambos), **ubicación**, **ofrecer internet público**
  del OS con los recursos de la neurona + **puerto** para vínculos privados, **política de memorias**
  (sync de cerebros/biblioteca/neuronas propias/externas, reutilizando los flags existentes), y la
  **bitácora** con limpieza. Cada cambio deja una entrada en el log. **Embebido** en el panel de
  Neuronas (junto a capacidades, recomendaciones y descargas).

## Verificación
`scripts/test-neuron-config.ts` (12/12): registro y orden de la bitácora, aislamiento entre neuronas,
buffer circular acotado (descarta los más viejos), limpieza, entradas inválidas ignoradas; y
`probeCustomModel` en sus ramas sin red (MCP sin servidor / API sin endpoint → fallan con mensaje;
MCP con nombre → registrado; local sin endpoint → falla).

## Estado del roadmap del mega-encargo
1. ✅ Ventana unificada de inicio/actualizaciones (111).
2. ✅ Coherencia de voz/persona + presets + idioma (112) — refinado aquí: persiste por personalidad.
3. ✅ Descarga de modelos locales en 2º plano + modelos propios (113) — refinado aquí: prueba de conexión.
4. ✅ **Gestión por neurona** (esta ola): rol servidor/receptor, ubicación, ofrecer internet+puerto,
   memorias, logs. *Pendiente fino:* que el `offerPublicInternet`/`publicPort` levante de verdad el
   servicio (hoy declara la disposición + config); ligar los logs a los eventos reales de red/sync.
5. ⏳ **Seguridad (horizonte 108)**: revocación por autoridad de cuenta, emisión/renovación de tokens,
   reloj lógico entre pares, descubrimiento automático de pares de confianza.

*Relacionado: 109 (capacidades), 111 (inicio/actualizaciones), 112 (voz coherente), 113 (descargas),
`neurons.ts` (modelo de neurona · rol · sync).*
