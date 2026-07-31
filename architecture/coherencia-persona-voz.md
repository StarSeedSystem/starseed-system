# Coherencia de persona/voz al cambiar de modelo + presets + idioma (Adenda 112)

Roadmap **item #2** del mega-encargo. Una **persona portátil** (model-agnóstica) es la fuente de
verdad del carácter de una voz —emoción, tono, energía, ritmo, timbre y una referencia de audio
opcional— y se **resuelve sobre cualquier motor de voz** preservando el carácter. Así, aunque cambie
el sistema de voz o el LLM (por neurona o dentro de una neurona), el tono, la actitud y el personaje
se mantienen automáticamente. Incluye presets de voz de referencia por defecto e idioma por chat.

## Principio
El OS ya tenía una modulación viva de estilo (`AuroraVoiceStyle`: emoción/tono/rate/pitch/energy) que
viaja por el evento `starseed:aurora-voice-style` hacia el motor activo. La Adenda 112 añade encima
una **capa de persona**: define el carácter una sola vez y lo re-aplica coherentemente a cualquier
motor. Si el motor **sabe clonar** (VoxCPM, Voicebox, GPT-SoVITS, OmniVoice, OpenVoice 2) se le pasa
además la **referencia de audio**; si no (Kokoro, Kitten, Bark, xAI, navegador), se conserva el
carácter por sus parámetros equivalentes. El carácter NUNCA se pierde al cambiar de modelo.

## Piezas
- `src/lib/aurora/lang-detect.ts` (NUEVO, puro, sin deps): `detectLang(text)` heurístico
  multilingüe (es/en/pt/fr/de/it/ca por stopwords distintivas + diacríticos, para frases cortas),
  `resolveLang(mode, text, fallback)` (auto → detecta; fijo → devuelve), `LANG_OPTIONS`, `langLabel`.
  Interfaz estable → se puede cambiar por `franc` (registro de integraciones) sin tocar consumidores.
- `src/lib/aurora/persona-coherence.ts` (NUEVO, puro; solo importa TIPOS del motor de voz):
  `PortablePersona` (emoción/tono/energía/rate/pitch/audioRefId); `PERSONA_REFERENCE_PRESETS` (10
  presets por defecto: Cálida, Serena, Enérgica, Sabia, Juguetona, Empática, Misteriosa, Alegre,
  Orion, Neutra — cada uno con una voz de referencia del catálogo); `ENGINE_SUPPORTS_REF` +
  `engineSupportsRef`; `personaToStyle`; `resolvePersonaForEngine(p, engine)` → `{style (carácter
  siempre), audioRef (solo si clona), usesRef, coherenceNote}`; `applyPersona(p, engine)` (emite el
  evento de estilo → efecto EN VIVO + devuelve la resolución); estado `getPersonaCoherence/
  setPersonaCoherence` (preset + persona custom + `langMode`) + `activePersona`.
- `src/components/aurora/persona-coherence-panel.tsx` (NUEVO): rejilla de presets (elegir aplica la
  persona EN VIVO por el canal de voz), nota de cómo se resuelve en el motor activo, **matriz de
  coherencia por motor** (carácter siempre ✓ · referencia solo si el motor clona), y selector de
  idioma por chat (automático/fijo). Montado como pestaña **«Voz coherente»** en `/agent`
  (sección Personalidades). Pestaña de app ya registrada → sin migración de dock.

## Verificación
`scripts/test-persona-coherence.ts` (48/48): integridad de presets, `personaToStyle` preserva
carácter, el carácter (emoción/tono) se preserva en los 10 motores, `audioRef` presente SOLO en los
que clonan y ausente en el resto, cambio de motor mantiene el mismo carácter con distinta capacidad de
referencia, estado/persona activa (custom > preset > neutra), y detección de idioma es/en/pt/fr/de/it
+ `resolveLang` (auto/fijo/fallback).

## Pendiente / próximos pasos
- **Aplicar a la config real por personalidad**: hoy `applyPersona` emite el estilo vivo (efecto
  inmediato) y persiste el preset/idioma; falta escribir la persona en cada `PersonalityProfile`
  (`voiceStyle`/`audioRef`) y enlazar el `langMode` a cada conversación concreta en todas las UIs de
  chat (hoy el estado es global por neurona).
- Cambiar el detector heurístico por **franc** (MIT) cuando se integre la dependencia.
- Aplicar la referencia de audio real al pipeline de clonación (`refAudio`) de los motores que lo
  soportan (hoy el resolver ya entrega el `audioRef`; falta que cada endpoint lo consuma).

Roadmap restante del mega-encargo: descarga de modelos locales en segundo plano + modelos propios por
API/MCP (item 3); gestión completa por neurona (item 4); seguridad de la 108 (item 5).

*Relacionado: 109 (recomendador de modelos), 111 (ventana de inicio/actualizaciones),
`voice-config.ts`/`voice-style.ts` (modulación de voz existente).*
