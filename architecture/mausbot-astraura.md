# Mausbot de Astraura · el cursor con cara que también actúa (MBT1027)

**Pedido de Alex (2026-10-27):** «agrega para el funcionamiento del cursor en computadoras este bot pero fusionado con
Astraura y que sea completamente configurable y personalizable; en el Exocórtex debe haber un switch de encendido /
apagado del mausbot y se le puede ajustar a cualquiera de las personalidades y diseños del cursor ilimitados y debe
estar enlazado con la Protomolécula y todos los medios de Astraura incluyendo la orbe y el Exocórtex y tener acceso a
todo el OS que cada usuario configure para su perfil o neurona específica» — https://github.com/milind-soni/OpenMausBot

## 1. Qué es OpenMausBot y qué se toma (medido el 2026-10-27)

- **El proyecto:** app de escritorio y web (Electron, React 19, TypeScript; `v0.1.130` del 2026-10-27, 87 etiquetas,
  Apache-2.0 salvo `enterprise/`). Cada «bot» es un agente de verdad (las CLI `claude`, `codex`, `grok`, Cursor o un
  extremo compatible con OpenAI), con personalidad, modelo, aprobaciones, voz, rutinas y un ordenador (nube, VM local
  o el propio equipo). Su cara visible es la **mascota-cursor** (SupaMaus): un puntero con ojos y boca que cambia de
  expresión según lo que hace el agente.
- **La mascota:** 10 cuerpos SVG (`cursor`, `blob`, `circle`, `squircle`, `capsule`, `drop`, `shield`, `hexagon`,
  `diamond`, `star`), degradado de 3 colores, 25 expresiones de ojos con mirada, bocas animadas y estados
  (`sleeping`, `waking`, `idle`, `listening`, `thinking`, `searching`, `working`, `excited`, `surprised`,
  `suspicious`, `angry`, `drowsy`, `happy`, `curious`, `confused`, `bored`, `proud`, `shy`…). Un solo reloj de
  animación y respeto a «movimiento reducido».
- **El control del equipo:** `cua-driver` (MIT, Cua AI) con su «cursor del agente» superpuesto; solo macOS y Ubuntu
  Xorg, con permiso explícito (Accesibilidad y Grabación de pantalla en macOS), Wayland bloqueado.
- **Se toma:** el modelo de la mascota (cuerpos, expresiones, movimiento), portado a `src/lib/mausbot/` y
  `src/components/mausbot/` con atribución (piezas de referencia en `integraciones-de-codigo/openmausbot/`, que no se
  compilan). **No se instala** la app Electron en las neuronas: Astraura ya tiene agentes, personalidades, voz,
  rutinas y permisos; duplicarlos sería un segundo sistema. La app queda en la Biblioteca (`lib-openmausbot`) para
  quien la quiera aparte, y como medio externo: su motor personalizado acepta un extremo compatible con OpenAI, que
  puede ser el de Astraura.

## 2. Qué hace el Mausbot en StarSeed OS

1. **Es el cursor** (modo `cursor`): el puntero del OS pasa a ser el Mausbot de la personalidad activa.
2. **Acompaña al cursor** (modo `acompanante`): el puntero sigue siendo el del sistema y el Mausbot lo sigue con su
   cara, mira hacia donde vas y reacciona a lo que hace Astraura.
3. **Es el cursor del agente:** cuando Astraura (o un bot o agente suyo) actúa en el OS con el control de pantalla
   (`src/lib/aurora/screen-control/`), el Mausbot vuela al elemento, enseña su expresión de «trabajando» y hace el clic
   o escribe, para que la persona VEA lo que hace el agente. Si el permiso no deja actuar, señala y pregunta.
4. **Habla con todos los medios de Astraura:** la orbe (escuchar, hablar, pensar → expresiones), el Exocórtex (el
   chat lo puede invocar y apagar), la Protomolécula (diseñar cuerpos y expresiones) y los bots de Astraura.

## 3. Datos (módulos puros, sin `node:*`)

- `src/lib/mausbot/cuerpos.ts` · los 10 cuerpos portados (`CuerpoMausbot`: `id`, `nombre`, `fit`, `body` con
  `{{GRADIENT}}`, `clip`, `anchor`).
- `src/lib/mausbot/expresiones.ts` · las 25 expresiones y la tabla **estado de Astraura → expresión**:
  orbe (`QuantumOrbVoiceState` de `src/lib/aurora/quantum-orb-bus.ts`) `listening`/`user_speaking`→`listening`,
  `thinking`→`thinking`, `speaking`→`happy` con boca animada, `error`→`confused`, `idle`→`idle`; bot `trabajando`→
  `working`, `buscando`→`searching`, permiso pedido→`curious`, hecho→`proud`, inactivo largo→`drowsy`→`sleeping`.
- `src/lib/mausbot/disenos.ts` · `DisenoMausbot` = `{ id, nombre, cuerpo: CuerpoId | "svg", svgCuerpo?, gradiente:
  [string,string,string], cara: { ojos: boolean; boca: boolean; mirada: boolean }, tamano, rastro?, origen:
  "fabrica" | "protomolecula" | "biblioteca" | "variacion", autor? }`. **Ilimitados:** los diseños propios se guardan
  como moléculas de la Protomolécula y se comparten por Variaciones y la Biblioteca. Un SVG propio pasa por el
  saneador del OS (`sanearSvg` de `src/lib/dock/iconos/sanear-svg.ts`: sin `script`, `foreignObject`, manejadores
  `on*` ni referencias externas) antes de guardarse y antes de pintarse.
- `src/lib/mausbot/config.ts` · `ConfigMausbot` = `{ v: 1, encendido, modo: "cursor" | "acompanante" | "ambos",
  disenoPorDefecto, porPersonalidad: Record<personaId, disenoId>, actuar: NivelBot, perfiles: {}, neuronas: {} }`.
  Clave `starseed.mausbot.v1`, evento `starseed:mausbot`, en `SYNCED_KEYS` (`src/lib/settings-sync.ts`) y
  `EVENT_BY_KEY` (`src/lib/sync/realtime-sync.ts`): viaja con la cuenta. Lo de cada perfil y cada neurona gana a lo de
  la cuenta, con el mismo patrón que `src/lib/inicio/pantalla-inicial.ts` (`resolverPantallaInicial`).
  **Apagado por defecto** hasta que la persona lo encienda (un cursor nuevo no se impone a nadie).

## 4. Dónde se ve

- **Exocórtex** (`src/components/exocortex/aurora-chat-section.tsx`, pestaña de control, junto a `<AuroraAlwaysOn/>`):
  interruptor «Mausbot» con el mismo estilo (`.axc-switch`), el modo, el diseño de la personalidad activa y
  «Personalizar». Encender/apagar también por voz o chat («apaga el mausbot») con la herramienta del Exocórtex.
- **Ajustes de cursor** (`CursorSettingsPanel` en `src/components/desktop/cursor-fx.tsx`): `CursorOption` gana
  `"mausbot"`; el panel enlaza a los ajustes del Mausbot. Precedencia del puntero: Mausbot > `cursorfx` >
  `customCursorSvg` de `appearance-context` (hoy se pisan sin regla; se fija esta).
- **Ajustes del Mausbot** (`src/components/mausbot/mausbot-ajustes.tsx`): personalidad → diseño (lista de
  `listPersonalityProfiles()` de `src/lib/aurora/personalities.ts`), diseños de fábrica y propios, modo, nivel para
  actuar, y lo que cambia en este perfil o en esta neurona.
- **Montaje:** `src/components/mausbot/mausbot-host.tsx`, UNA instancia, cargada perezosa desde el layout raíz con
  `next/dynamic({ ssr: false })` en un envoltorio de cliente (regla «El layout raíz no carga motores pesados»), fuera
  de `/genesis`. Un solo bucle `requestAnimationFrame`, `transform` sin layout, `pointer-events: none`, parado con la
  pestaña oculta y quieto con «movimiento reducido». La Mac tiene 8 GB: nada de lienzos WebGL para esto.

## 5. Permisos: el Mausbot hace lo que la persona le deja, en este perfil y en esta neurona

- **Actuar en el OS** usa lo que ya existe: `decidirAccion`/`NivelBot` (`src/lib/astraura-bots/permisos.ts`:
  `nada` · `proponer` · `aplicar-bajo` · `aplicar`), `validarAccion` y `NUCLEO_INTOCABLE`
  (`src/lib/astraura-bots/acciones.ts`), `decidirUi` (`src/lib/astraura/ui-permisos.ts`) y los permisos de la neurona
  (`permissionsFor(deviceId).agent` y `settingsFor(deviceId).screenVoice` de `src/lib/neurons/neurons.ts`). Hoy
  `screenVoice` solo lo lee la interfaz: **el control de pantalla debe comprobarlo** antes de cada acción (MBT1027J).
- **Por defecto `proponer`:** el Mausbot señala el elemento y pide confirmación; `aplicar-bajo` hace lo reversible
  (abrir, navegar, escribir en un borrador) y pide confirmación para lo demás; `aplicar` solo si la persona lo eligió
  para ese perfil o neurona. **Nunca** actúa sobre el núcleo intocable (`src/lib/nucleo/invariantes.ts`): salir y
  restaurar, identidad, permisos, voto, deshacer. Lo marcado `data-aurora-exclude` no existe para él.
- **Fuera del navegador** (el equipo entero): solo en la app nativa (`native/src-tauri`) y en una ola propia, con
  `cua-driver` como proveedor (macOS y Ubuntu Xorg), firmado dentro de la app, con el permiso `agent` de la neurona,
  confirmación por acción de riesgo y el cursor del agente siempre visible. **No entra en MBT1027**: exige empaquetar
  y firmar un binario y los permisos de Accesibilidad y Grabación de pantalla de cada persona.

## 6. Protomolécula, orbe, bots y Biblioteca

- **Protomolécula:** un átomo propio «Mausbot» (`registrarAtomo` en `src/lib/protomolecula/atomos/`) para diseñar el
  cuerpo (de fábrica o SVG propio), el degradado y la cara, con vista previa animada y «Usar como mi Mausbot» (para la
  personalidad activa). Los diseños son moléculas (`almacen-moleculas.ts`), así que se versionan y comparten como el
  resto.
- **Orbe:** el Mausbot escucha los mismos buses que la orbe (`src/lib/aurora/quantum-orb-bus.ts`, `useExpresionBot` de
  `src/lib/astraura-bots/adaptadores/expresion-orbe.ts`) y la orbe de la Protomolécula (`src/lib/protomolecula/
  orbe-bus.ts`). Mantener pulsado el Mausbot abre el Exocórtex de esa personalidad.
- **Bots de Astraura:** un bot puede llevar su Mausbot como «cuerpo» del cursor (`cuerpo` del bot) y su capa de
  pantalla (`CapaPantallaBot`) usa el cursor del agente.
- **Variaciones:** `src/lib/variaciones/adaptadores/ajustes.ts` (`RUTA_AJUSTES`) añade `mausbot` → `starseed.mausbot.v1`.
- **Biblioteca:** `lib-openmausbot` (`config/repos-libreria-1027.json`, autoactualizada por etiquetas `vX.Y.Z`).

## 7. Ola MBT1027 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Cola `starseed_memory_root/olas/cola-mausbot-insomne-1027.json`. Orden: datos puros (A-D) → render (E) → host y
montaje (F) → Exocórtex (G) → ajustes (H) → cursorfx (I) → cursor del agente y permisos (J) → orbe (K) →
Protomolécula (L) → Variaciones (M) → Biblioteca (N, O). La ola de la neurona insomne (INS1027) está en
`architecture/neurona-insomne.md`.

**Verificación:** tsc y vitest de cada tarea; al cerrar la ola, build compilado en la nube e instalado en la Mac, y en
`localhost:9002`: interruptor del Exocórtex encendido/apagado, cambio de personalidad → cambia el diseño, un clic de
Astraura con el cursor del agente en `proponer` (pregunta) y en `aplicar-bajo` (actúa), un diseño propio desde la
Protomolécula, y nada en `/genesis`.
