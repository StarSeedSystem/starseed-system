# SOP · Integración con el Portal StarSeed Nexus (cuenta unificada)

> Actualizado: 2026-06-10 · Regla dorada: este SOP se actualiza ANTES que el código.

## Qué es
El **Portal StarSeed Nexus** (`https://starseed-nexus.vercel.app`, repo `alexbordongarrigos/Starseed-Cafe`, carpeta local `~/Documents/StarSeed Café/app`) es la **página principal del ecosistema**. Presenta las 6 áreas (Sociedad, Network, Café, Estudio, Fundación, Audiomorphic), integra los archivos del Drive de la Fundación y se llama "StarSeed Nexus"; este repo (el SOSD) es **StarSeed OS** y vive en starseed-os.vercel.app. El Nexus aloja a **Astraura**, el Exocórtex global.

## Cuenta soberana unificada
- **Proyecto Supabase compartido:** `dzkjapinnewkxzjltadv` (eu-west-3). El Portal, el Café y este SOSD usan el MISMO proyecto → un usuario = una cuenta en todo StarSeed.
- Variables en `.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` ya apuntan a ese proyecto.
- Tablas relevantes del lado Portal/Café: `cafe_accounts` (cuenta raíz + columna `apps` jsonb con programas vinculados), `cafe_profiles` (perfiles/facetas), `wallets` (semillas + granos jsonb por tipo, FK a `auth.users`), `economy_ledger` (historial), `grain_types` y `seed_market` (catálogo + bolsa simulada beta, lectura pública).
- El SOSD puede leer/escribir la cartera vía esas tablas con la sesión del usuario (RLS por `auth.uid()`).
- El login del Portal es OTP por email (`signInWithOtp` + `verifyOtp`, storageKey `starseed.auth`). El SOSD usa su propio flujo (password) sobre los mismos `auth.users`; ambos comparten identidad.

## Exocórtex
- Portal: **Astraura** (vanilla, `assets/js/exocortex.js`) con base de conocimiento `assets/js/knowledge.js` (síntesis del Drive completo) + Gemini vía `/api/gemini` (serverless o `server.js` local). El usuario puede usar su propia clave de Google AI Studio.
- SOSD: Genkit (`src/ai/`) con `GOOGLE_GENAI_API_KEY` (ya configurada en `.env.local`). Misma clave de Google AI Studio que el Portal → "una mente, dos cuerpos".
- Sincronía de datos del usuario entre ambos: vía el proyecto Supabase compartido (cuenta, perfiles, cartera).

## Sistema de enlaces unificado (Vercel, gratuito)
| Área | URL |
|---|---|
| Portal Nexus (principal) | https://starseed-nexus.vercel.app |
| Café | https://starseed-nexus.vercel.app/cafe/ |
| StarSeed OS (este repo) | https://starseed-os.vercel.app |
| Estudio | https://starseed-nexus.vercel.app/#estudio |
| Fundación | https://starseed-nexus.vercel.app/#fundacion |
| Audiomorphic | https://audiomorphic.vercel.app |

## Pendientes naturales
- Compartir también el flujo OTP en el SOSD (opcional) para UX idéntica.
- Mover el catálogo de granos a un paquete compartido si crece.
- Rotar las claves expuestas (Supabase anon es pública por diseño; Gemini/OpenRouter/Vercel/GitHub conviene rotarlas).

## Tema Materia Viva (v1)
Nueva familia de fondos/tema portada del **rediseño del Nexus/Café** al SOSD: estética **oro + cristal + geometría sagrada** sobre verde-negro profundo, renderizada en **canvas 2D ligero** (sin three.js ni WebGL — apta para cualquier dispositivo).

- **Ids añadidos** a `config.background.type` (unión en `src/context/appearance-context.tsx`, cambio aditivo, sin romper configs existentes): `materia-oro-vivo` (ámbar/oro), `materia-cristal-liquido` (cian/lavanda), `materia-bosque-dorado` (lima/musgo).
- **Implementación:**
  - `src/components/backgrounds/materia-viva-background.tsx` — componente `MateriaVivaBackground` (props `variant` + `intensity`) + host `MateriaVivaBackgroundHost` que se auto-activa cuando `type` empieza por `materia-` (mismo patrón que `LiquidPsychedelicBackground`). Base radial verde-negra (#0d130e→#16210f), Flor de la Vida de 19 círculos en rotación lenta (trazo dorado rgba(233,196,106,α)), ~90 partículas doradas/lima/cian ascendentes con wrap, y brillo especular que sigue al cursor (suavizado). Bucle rAF con pausa en `document.hidden`, consciente de `devicePixelRatio`, `prefers-reduced-motion` → fotograma estático, desmontaje limpio.
  - Host montado en `src/app/layout.tsx` junto a los demás fondos globales.
  - Selector en `src/components/settings/appearance/background-settings.tsx`: pestaña **"Materia Viva ✦"** con 3 tarjetas de preset (previsualización CSS animada: gradiente dorado + punto flotante) + deslizador **Intensidad** (0–100, guardado como `background.intensity` 0..1, campo opcional para retro-compatibilidad — escala cantidad de partículas y alfa del patrón).
- **Opciones configurables:** variante (3 paletas) e intensidad; conviven con filtros, overlay y animaciones de fondo ya existentes.
- Se publica como **opciones de personalización de la red** disponibles para cualquier usuario del SOSD, bajo el principio de **código abierto absoluto** (§6 de CLAUDE.md): el mismo lenguaje visual del Nexus/Café queda elegible —nunca impuesto— en cada perfil del OS.

### v1.1 — Materia Viva integrada por defecto + acentos de interfaz (2026-06-11)
El tema deja de ser una opción escondida y pasa a ser el lenguaje visual por defecto del OS (sigue siendo 100% personalizable):

- **Fondo por defecto:** `defaultConfig.background.type = "materia-oro-vivo"` en `src/context/appearance-context.tsx`. Cambio aditivo: las configs guardadas en `localStorage` (`appearance-config-v2`) se mergean encima del default y **no se tocan** — solo cuentas sin config guardada ven el nuevo default; cualquier usuario puede volver a webgl/liquid/etc. desde Ajustes → Apariencia.
- **Acentos coherentes (`data-materia`):** cuando `background.type` empieza por `materia-`, `applyStyles` pone `document.body.dataset.materia = <variante>` (p.ej. `data-materia="oro-vivo"`) y lo retira al cambiar a otro tema. En `globals.css`, bajo `body[data-materia…]`, un bloque pequeño define `--materia-accent` (+ `--materia-accent-rgb`) y ajusta `--primary-hsl`/`--ring-hsl` por variante — dorado `#E9C46A` (oro-vivo), cian cristal `#7FD8E8` (cristal-liquido), lima `#9FE870` (bosque-dorado) — más bordes/glows sutiles vía `color-mix` en superficies de tarjeta (`.card-glass`, `.liquid-glass-panel`) y un borde global cálido en modo oscuro. Sin `data-materia` el bloque no tiene efecto: los temas existentes no cambian.
- **Shell del dashboard translúcido bajo materia:** el layout del grupo `(main)` (`src/app/(main)/layout.tsx`) recibe clases estables `os-main-shell` / `os-main-scroll`; bajo `body[data-materia]` su `bg-background` opaco pasa a transparente para que el canvas global Materia Viva respire detrás de los widgets. Fuera de materia, el comportamiento es exactamente el anterior.

## OmniDock responsive (fix 2026-06-11)
El dock Trinity (Anchor/`OmniDock`) desbordaba en pantallas ≤480px: 11 botones de 56px + gaps + padding ≈ 745px > viewport, y con `overflow-visible` los extremos quedaban cortados fuera de pantalla. Fix en `src/components/layout/omni-dock.tsx` **sin quitar ninguna función**:
- La píldora de cristal conserva su borde/fondo intactos; dentro, un strip con clase `omni-dock-strip` (definida en `globals.css`) que en `<1024px` activa scroll horizontal con `scroll-snap` (snap-center por item), scrollbar oculta, **máscara de degradado** en ambos bordes como pista visual de que hay más items, y `overscroll-behavior-x: contain`.
- Items `shrink-0` con tamaño táctil compacto en `<lg` (48px ≥ mínimo táctil de 44px, gaps reducidos — así los 12 items por defecto caben enteros en 768px sin scroll) y `safe-area-inset-bottom` en el wrapper para móviles con notch/gesture bar.
- En `≥1024px` (lg) todo queda como estaba: overflow visible, tamaños 64px, tooltips intactos. (El breakpoint es lg y no sm porque con los 11 items por defecto a 64px el contenido mide ~897px — también desbordaba en tablets 640–1023px, verificado empíricamente con Playwright a 768px.)

## Tema "StarSeed Café" (data-os-theme, v1 · 2026-06-11)

> Tema de identidad completo y **opcional** que viste TODO el OS con el lenguaje visual del portal hermano StarSeed Café/Nexus (`~/Documents/StarSeed Café/app` — `assets/css/tokens.css` + `cafe/cafe.css` son la referencia canónica, solo lectura). El tema por defecto del OS **no cambia**: `cafe` es una opción nueva.

### Mecanismo (tres capas que conviven, ninguna sustituye a otra)
1. **next-themes (clase en `<html>`)** sigue gobernando la *atmósfera* claro/oscuro (`light|dark|grey|natural|glass|custom`).
2. **`AppearanceConfig` (localStorage `appearance-config-v2`)** gana un campo aditivo `themeStore.osTheme?: "default" | "cafe"` (opcional → configs guardadas siguen siendo válidas). `applyStyles()` lo refleja como atributo **`data-os-theme="cafe"` en `<html>`** (y lo elimina con `default`).
3. **`globals.css`** define bajo `html[data-os-theme="cafe"]` un recubrimiento completo de variables del design system (`--background/--card/--popover/--primary/--secondary/--accent/--muted/--border/--input/--ring` + `-hsl`, radios, sombras glass, charts) con **dos variantes**:
   - **Café claro** (base, atmósferas claras): pergamino crema `#fdf7ea→#e8dabc`, tinta café `#3B2818`, primario terracota `#C05C3B`, secundario ámbar `#F6A21E`, acento verde musgo `#3f7a2a`, bordes oro suave.
   - **Café oscuro** (`html[data-os-theme="cafe"]:is(.dark,.natural,.glass)`): verde-negro `#0d130e/#16210f`, tinta crema `#eef3e6`, primario oro `#E9C46A`, secundario terracota, acento lima `#9FE870`, bordes oro al ~35%, cristal cálido (rgba verde-oliva en vez de blanco/gris frío).
   - Tipografía del tema: titulares serif **Fraunces** (`--font-headline`) y etiquetas mono **Space Mono** (`--font-code`), cargadas por `@import` de Google Fonts con fallback elegante (Georgia/monospace).
   - Como el atributo vive en `<html>`, **afecta a todas las rutas y componentes** que consumen tokens (dashboard, network/*, hub, agent, library, explorer, profile, settings, login, widgets, dialogs, dock — el dock/curtains no se tocan: heredan vars).
4. **Selector**: Ajustes → Apariencia → pestaña Galería, nueva sección "Tema del sistema" (`src/components/settings/appearance/os-theme-selector.tsx`) con tarjetas de preset y mini-preview dark/light; persiste como el resto de la config (mismo `updateSection("themeStore", …)`).

### Tokens de movimiento (Respiración Digital)
`:root` publica curvas orgánicas del Café como tokens globales: `--ease-organic (.22,1,.36,1)`, `--ease-glide (.16,1,.3,1)`, `--ease-elastic (.34,1.56,.64,1)`, `--ease-soft (.4,.1,.2,1)` + duraciones `--dur-fast/--dur-base/--dur-slow` (150/220/300ms, `--dur-base` sincronizada con `animations.transitionDuration` del config). La regla de transición global existente pasa a consumir `var(--ease-glide, …)` con el mismo fallback que tenía (mejora, no rompe). Bajo `cafe`, hovers/aperturas/modales usan `--ease-organic`.

### Pulido de widgets (kit)
- Se define `.custom-scrollbar` (la clase ya la usaba `WidgetShell` pero **no existía en CSS**) → scrollbar fina.
- `WidgetShell` gana clase estable `os-widget-shell` (hover-elevación, `focus-within` visible, borde oro bajo cafe) y titular con `font-headline`; primitives: empty state con icono Lucide en `MiniList`, `tabular-nums` ya presente en métricas. API intacta: cero props nuevas obligatorias, cero datos eliminados.

### Invariantes
- Cambio 100% aditivo (unión de tipos opcional); `default` = comportamiento idéntico al actual byte a byte.
- Personalización soberana (§6 código abierto): el lenguaje Café queda **elegible, nunca impuesto**.
- Convive con Materia Viva (`data-materia` en `<body>`) — de hecho `materia-oro-vivo` + `cafe` es la combinación de marca completa.

## Widget Cartera StarSeed (v1)

> Añadido: 2026-06-11 · Widget de dashboard del SOSD que consume **la cuenta soberana unificada** (proyecto Supabase compartido `dzkjapinnewkxzjltadv`). Componente: `src/components/dashboard/widgets/cartera-starseed.tsx` · Tipo de widget: `CARTERA_STARSEED` (registrado en `dashboard-types.ts`, `widget-registry.tsx`, `widget-manifest.ts`, `dashboard-defaults.ts` y `add-widget-dialog.tsx`; disponible en la Biblioteca de Widgets para añadir manualmente — **no** se fuerza en los tableros predeterminados).

### Fuentes de datos (cliente browser `@/utils/supabase/client`)
| Tabla | Acceso | Uso en el widget |
|---|---|---|
| `grain_types` (id, name, color, emoji, seeds_per_100g, blurb) | Lectura pública | Catálogo de granos: pills con emoji + gramos, color por tipo |
| `seed_market` (day, seed_eur, index_eur; ~180 filas asc) | Lectura pública | Últimas ~60 filas → sparkline SVG inline de `seed_eur` + último valor + delta 7d % |
| `wallets` (user_id, semillas int, granos jsonb por tipo) | RLS `auth.uid()` | Saldo de Semillas (contador grande, verde) y gramos por tipo de grano |
| `economy_ledger` (user_id, kind, seeds, granos jsonb, name, ts) | RLS `auth.uid()` | Mini-lista de los últimos 6 movimientos (kind + name + ±semillas) |

### Estados
- **Cargando:** skeleton con pulso (bloques `bg-muted` animados).
- **Error:** mensaje + botón "Reintentar" (relanza la carga completa).
- **Sin sesión:** muestra el **mercado público** (sparkline + último valor + delta 7d + catálogo de granos) y un **CTA "Iniciar sesión"** hacia `/login`. No se consulta ninguna tabla privada.
- **Con sesión:** Semillas (contador grande verde), granos por tipo (pills emoji + g, color por tipo), sparkline del mercado y últimos movimientos del ledger. Si el usuario aún no tiene fila en `wallets`, se muestra cartera a 0 (no es error).
- **Siempre:** nota al pie "modo beta simulada" — bolsa y cartera son simuladas en fase beta; ninguna operación mueve valor real.

### Invariantes respetadas
- Identidad Soberana: solo se leen filas del propio `auth.uid()`; lo público (mercado, catálogo) es transparente para todos.
- Sin dependencias nuevas; UI con el kit existente (`WidgetShell`) + Tailwind; sparkline como SVG inline (stroke `#9FE870`, relleno degradado sutil).
- El widget es de **solo lectura** en v1 (no escribe en `wallets` ni `economy_ledger`).

## Trinity Móvil (v1 · 2026-06-11)

> Tres bloques para que el OS sea plenamente usable en pantallas táctiles sin chocar con los gestos del sistema operativo del dispositivo. SOP escrito ANTES del código (regla dorada). Ningún comportamiento de escritorio cambia; ninguna función se elimina.

### Bloque 1 — Widgets del dashboard: arrastre táctil con pulsación mantenida

**Problema (causa raíz verificada en runtime).** El grid del dashboard usa `react-grid-layout` v2.2.2 (`src/components/dashboard/grid-area.tsx`): `<ResponsiveGridLayout isDraggable={isEditMode} draggableHandle=".drag-handle">`. Inspeccionando el árbol de fibers en vivo se confirmó que **RGL 2.2.2 NO cablea `draggableHandle` hasta el item**: `GridLayout.props.draggableHandle = ".drag-handle"` pero `GridItem.props.handle = undefined` → `DraggableCore.props.handle = ""` (drag desde CUALQUIER punto del widget). En `handleDragStart` de react-draggable 4.5.0, con handle vacío, **todo `touchstart` sobre el widget en modo edición hace `e.preventDefault()`** (línea «Prevent scrolling on mobile devices») → el scroll muere y el widget se arrastra: exactamente el bug reportado. Además cada wrapper lleva `draggable={isEditMode}` (HTML5 DnD para transferir widgets entre paneles), que en táctil puede secuestrar el gesto con el drag nativo (iOS) y en ratón congela el drag de RGL al primer paso (conflicto pre-existente, intacto).

**Solución (solo `grid-area.tsx` + hook nuevo + CSS Module; cero cambios en widgets/).**
1. **Puerta de captura:** el contenedor del grid escucha `onTouchStartCapture`. Si `isEditMode` y el target está dentro de un `.react-grid-item` (y NO es `.drag-handle` ni `.react-resizable-handle`, que conservan su comportamiento inmediato actual): `e.stopPropagation()` → el `touchstart` nunca llega al listener nativo de DraggableCore → el navegador scrollea con libertad. El ratón no pasa por aquí (solo eventos touch): escritorio idéntico.
2. **Armado por pulsación mantenida (~320 ms):** en ese mismo capture se inicia un timer de 320 ms con la posición inicial. `touchmove` >10 px o `touchend` antes de tiempo → cancela (gana el scroll). Si el timer vence: `navigator.vibrate?.(10)`, se marca el widget como **armado** (estado `touchArmedId`), se eleva visualmente (scale 1.03 + sombra + glow dorado `#D4AF37`, transición líquida con overshoot) vía clase de CSS Module en el div interior (no en el `.react-grid-item`, cuyo `transform` pertenece a RGL).
3. **Entrega del gesto a RGL:** al armar, `flushSync` aplica `draggableHandle=undefined` (temporal, solo mientras hay armado) y se re-despacha un `TouchEvent('touchstart')` sintético con el Touch vivo sobre el `.react-grid-item` → DraggableCore inicia el drag normal de RGL **en el mismo gesto**. Como el touchstart real no fue `preventDefault`-eado, el navegador aún podría iniciar scroll: mientras dure el armado se registra un `touchmove` global `{passive:false}` que hace `preventDefault()` → el dedo arrastra el widget sin que la página se mueva. En navegadores sin constructor `TouchEvent` (iOS viejo), fallback: el widget queda armado ~4 s y el siguiente toque lo arrastra directamente.
4. **Soltar:** `onDragStop` de RGL ya persistía el layout (`handleDragStop`); ahí mismo se desarma, se retira el bloqueo de scroll y la clase de elevación cae con `cubic-bezier(.34,1.56,.64,1)` (asentamiento con rebote suave tipo spring).
5. **Higiene táctil:** wrappers con `touch-action: pan-y`, `-webkit-touch-callout: none` y `draggable={isEditMode && !coarse}` (el HTML5 DnD entre paneles sigue intacto con ratón; en táctil se desactiva porque era el secuestrador del scroll). Elementos interactivos (`button, a, input, …`) no arman el drag: sus taps siguen funcionando.

**Invariantes:** con ratón todo sigue exactamente igual que en producción (drag desde el cuerpo del widget y desde la ✋, resize, HTML5 DnD entre paneles — la puerta de captura solo escucha eventos touch). En táctil no se pierde ninguna función: mover = mantener pulsado ~320 ms; redimensionar = handle de resize (exento de la puerta); arrastre inmediato = ✋ (exenta); scroll = deslizar.

### Bloque 2 — TrinityFab: los 4 menús cardinales sin gestos de borde

**Problema.** Zenith/Horizon/Logic/Anchor se abren hoy por sensores de borde con *dwell* de hover (`perimeter-interface.tsx`) — gesto inexistente en táctil y en conflicto con los gestos del SO móvil (atrás, control center). API real de apertura: `usePerimeter().setActiveEdge('zenith'|'horizon'|'logic'|'anchor'|null)` (`src/context/perimeter-context.tsx`); las cortinas y el dock solo observan `activeEdge`.

**Solución.** Nuevo `src/components/layout/trinity-fab.tsx` (+ `trinity-fab.module.css`), montado como hermano del dock dentro de `omni-dock.tsx` (mismo árbol del layout raíz → presente en todas las páginas). Sin lógica duplicada: cada pétalo hace toggle con el MISMO `setActiveEdge` que usan sensores y atajos (`activeEdge === edge ? null : edge`).
- **Diseño:** botón circular cristal líquido 56 px con anillo cónico de los 4 colores cardinales (N azul `#007FFF`, E ámbar `#FFBF00`, S carmesí `#DC143C`, O lima `#39FF14`) y sigil central de 4 puntos en cruz. Al tocar, despliega 4 pétalos-gema (44 px) en cruz con stagger líquido; cada uno con su icono lucide (Sparkles=Zenith, Layout=Horizon, Settings2=Logic, LayoutGrid=Anchor) y aria-label.
- **Posición:** bottom-right por defecto, sobre `env(safe-area-inset-bottom)` y por encima del área del dock; **draggable** con pointer events (umbral 10 px distingue tap de drag) y al soltar se ancla al borde izquierdo o derecho más cercano; posición persistida en `localStorage 'os.trinity.fab.pos'`. z-index 85: sobre el dock (70), bajo las cortinas (90+).
- **Visibilidad:** preferencia `localStorage 'os.trinity.fab'` = `'auto' | 'on' | 'off'` (default `auto`). En `auto`: visible si `(pointer: coarse)` **o** viewport ≤1024 px; en desktop fino >1024 no se renderiza (return null). Reacciona en vivo a `resize`, `matchMedia.change`, evento `storage` y al CustomEvent `starseed:trinity-fab-pref` (mismo tab).
- **Ajustes:** nuevo panel `src/components/settings/trinity/trinity-fab-settings.tsx` (carpeta nueva — NO se toca `settings/appearance/**`), pestaña "Trinity" añadida a la página existente `/settings` (`src/app/(main)/settings/page.tsx`): selector Auto/Visible/Oculto con explicación de los 4 nodos cardinales y estado en vivo ("se muestra ahora en este dispositivo: sí/no").
- **Notas de implementación:** al abrirse anclado a un borde, el núcleo se desplaza ~64px hacia el centro para que el pétalo lateral no caiga fuera del viewport (verificado a 390: pétalo E pasaba de right=416 a right=375). `globals.css` fuerza `button { border-radius: var(--radius) !important }` (forma orgánica global) → el módulo declara `border-radius: 9999px !important` (clase > selector de elemento a igual importancia) para que núcleo y pétalos sean gemas circulares.

### Bloque 3 — Los 4 menús Trinity completos en pantallas chicas (320–768)

**Auditoría empírica (Playwright táctil, viewports 320/360/390/768) — hallazgos:**
1. **Logic (E) ROTO en móvil — trampa de containing block:** en `side-curtains.tsx`, el panel Logic es un `motion.div` con `animate={{ x: 0, y: "-50%" }}`; ese transform residual convierte al wrapper (que en móvil mide `w-auto` ≈ 2px pegado al borde derecho) en **containing block** de cualquier descendiente `position: fixed`. El `ControlCenter` móvil usaba `fixed inset-0` → quedaba confinado a esa franja de 2px y su contenido se derramaba FUERA del viewport (a 320px: root l=320 r=322, 86 elementos entre x=321 y x=577 — invisibles). El botón X de cierre tampoco era tocable.
2. **Anchor (S):** sin desbordes reales — los items "fuera" del viewport están dentro del strip `.omni-dock-strip` con scroll-x + snap (fix previo del 2026-06-11); `document.scrollWidth` = viewport ✓.
3. **Zenith (N) / Horizon (O):** medición tras corregir Logic (el panel Sentidos de Zenith usa también `fixed inset-0` bajo el mismo transform, pero su curtain ya es casi fullscreen ⇒ efecto benigno; se verifica empíricamente).

**Correcciones (solo `src/components/layout/**` — sin quitar opciones):**
- `side-curtains.tsx` (Logic): el wrapper pasa a posicionarse SIN depender de transform vertical: móvil `inset-0` (panel a pantalla completa real), escritorio `md:inset-auto md:top-0 md:bottom-0 md:right-4` + centrado vertical por flex/márgenes (técnica top-0/bottom-0 + my-auto en el modo pizarra). La animación queda solo en `x` (slide lateral), eliminando el `y:"-50%"` que creaba la trampa. El visor de pizarras conserva su tamaño (w-full→90vw/85vw, alto 100dvh→90vh md).
- `trinity/control-center.tsx`: deja de auto-posicionarse `fixed inset-0` (era la víctima de la trampa); ahora rellena a su padre (`w-full h-full` en móvil) y conserva exactamente sus tamaños de escritorio (`md:w-[420px] md:h-[600px]`, `lg:w-[460px] lg:h-[640px]`, mismos bordes/cristal). Cero opciones eliminadas.
- Donde la auditoría detecte anchos fijos/desbordes residuales en Zenith/Horizon a 320px: `max-width: 100%`, `min-w-0`, paddings con `clamp()` y scroll interno — sin retirar funciones.

### Verificación empírica Trinity Móvil (Playwright headless + CDP touch, 2026-06-11)
- **Bloque 1 (táctil, 390×844, modo edición):** swipe vertical sobre un widget → la página scrollea (scrollTop 0→32) y el `transform` RGL del widget NO cambia (`translate(18px,18px)` antes y después). Pulsación mantenida 450 ms → `armed=true` + `react-draggable-dragging=true` en el MISMO gesto (vibración + glow dorado, captura `os2-touch-armed.png`); al mover el dedo el widget sigue (`translate(148px,128px)`) sin que crezca el scroll; al soltar asienta con spring. **Regresión escritorio (1280, ratón):** drag desde cuerpo y desde la ✋ idénticos a producción (bit a bit; la puerta solo escucha touch).
- **Bloque 2 (FAB):** presente a 390 (auto), pétalos en cruz dentro del viewport (E right=375<390 gracias al desplazamiento de apertura), Zenith y Logic abren por pétalo (capturas `os2-fab-*.png`); a 1280 con puntero fino **no se renderiza** (0 nodos en DOM) y con pref `'on'` sí (override). Panel `/settings` → pestaña Trinity operativo: "Oculto" desmonta el FAB en vivo (`os.trinity.fab='off'`), "Auto" lo restaura.
- **Bloque 3 (320/360/390/768):** tras el fix de Logic, **0 elementos desbordados** en Anchor/Logic/Horizon en todos los anchos y `document.scrollWidth == viewport` siempre; en Zenith solo queda un rect "fuera" del div decorativo de rayos `w-[600px]`, clipado por el `overflow-hidden` del curtain (sin efecto visual). Logic pasó de franja de 2 px fuera de pantalla a fullscreen real en móvil y conserva su panel flotante 420/460 px en ≥768. Capturas: `os2-{zenith,horizon,logic,anchor}-390.png` y `os2-logic-320.png` (peor caso arreglado).
- **Type-check:** `npx tsc --noEmit --incremental` = 153 errores, exactamente los preexistentes (0 nuevos; ninguno en los archivos nuevos). El TS2322 de `grid-area.tsx` es previo: los tipos de RGL v2 no declaran `isDraggable`/`draggableHandle` en `Responsive` aunque el runtime los acepta.

## Trinity Móvil · Bloque 4 — Acceso por bordes + pulsación configurable (v2 · 2026-06-13)

> Amplía el Bloque 1 (pulsación) y el Bloque 2 (FAB) con lo pedido por Alex: que la pulsación para mover widgets sea de **3 s y configurable**, y que los 4 menús Trinity se abran en táctil con **asas de borde no intrusivas** y **deslizando desde cada orilla**, todo ajustable. SOP antes que código; nada se elimina; el escritorio (ratón) no cambia.

### Modelo de configuración (aditivo, `appearance-context.tsx`)
Se añaden dos sub-objetos **opcionales** a `config.trinity` (deepMerge rellena las configs guardadas, que siguen siendo válidas byte a byte):
- `trinity.touch`: `{ holdMs: number (default 3000), haptics: boolean (default true) }`.
- `trinity.edgeAccess`: `{ mode: "auto"|"on"|"off" (auto), edges: { zenith|horizon|logic|anchor: { handle, swipe } } (todas true), handleLength % (28), handleThickness px (5), handleOpacity 0–1 (0.22), swipeThreshold px (56) }`.

### Pulsación mantenida configurable
`use-touch-drag-arming.ts` pasa de constante `HOLD_MS=320` a `useTouchDragArming(enabled, { holdMs, haptics })` con refs vivas (no re-suscribe listeners al cambiar el ajuste). `grid-area.tsx` lee `config.trinity.touch`. Default 3000 ms (literal "3 segundos"); ajustable 300–4000 ms en Ajustes → Trinity → "Gestos y bordes táctiles". Toda la mecánica del Bloque 1 intacta (cancelar por movimiento >10px, vibración, entrega del gesto a RGL, fallback iOS).

### Acceso por bordes (`trinity-edge-access.tsx` + `.module.css`, montado en `app/layout.tsx`)
Componente nuevo bajo `PerimeterProvider`. No duplica lógica: ambas vías hacen toggle con el MISMO `usePerimeter().setActiveEdge`. Solo escucha eventos touch (ratón intacto). `mode` auto = `(pointer:coarse)` o ≤1024px.
- **Asas:** una píldora fina por orilla (color cardinal), centrada, longitud/grosor/opacidad configurables; `handleOpacity` baja en reposo ("no intrusivo") y sube al tocar/activar. Tap = toggle de ese menú. z-index 84 (bajo FAB 85 y cortinas 90+).
- **Deslizar:** `touchstart` en los 24px de la orilla → si el dedo avanza hacia dentro ≥ `swipeThreshold` (y el gesto no es demasiado paralelo al borde) abre el menú con vibración + destello (`swipeGhost`). Bloqueado si ya hay un menú abierto.
- **Ajustes:** `src/components/settings/trinity/trinity-edge-settings.tsx`, en la pestaña Trinity (junto al panel del FAB): slider de pulsación + háptica, modo global, asa/deslizar por orilla, y apariencia de las asas. Usa `updateConfig` (deepMerge → preserva hermanos anidados).

**Invariantes:** sensores de borde de ratón, FAB, dock y cortinas sin cambios; todo es opcional y desactivable; ninguna opción previa se retira.

## Sincronización de preferencias con la cuenta StarSeed (v1 · 2026-06-13)

`src/lib/settings-sync.ts` + panel `src/components/settings/account/account-sync-panel.tsx` (en Ajustes → Perfil). Lleva las preferencias locales a la cuenta soberana compartida (Supabase `dzkjapinnewkxzjltadv`) para recuperarlas en cualquier dispositivo / superficie del ecosistema (Nexus, Café, OS).
- **Claves sincronizadas** (`SYNCED_KEYS`, ampliable sin migración): `appearance-config-v2`, `starseed.dock.items.v1`, `os.trinity.fab`, `os.trinity.fab.pos`, `starseed_user_memory`.
- **Opt-in y tolerante a fallos:** no actúa hasta que el usuario pulsa subir/recuperar; si no hay sesión o falta la tabla, lo informa sin romper nada (localStorage sigue siendo la fuente de verdad offline). Al recuperar, escribe en localStorage y recarga para que todos los contextos relean limpio.
- **Migración SQL (ejecutar una vez en Supabase, RLS por usuario):**
  ```sql
  create table if not exists public.user_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    prefs jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
  );
  alter table public.user_settings enable row level security;
  create policy "own settings" on public.user_settings
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```

> ⚠️ **Verificación pendiente:** estos cambios (v2) NO se han podido type-checkear en runtime en esta sesión (el sandbox Linux no arrancó por falta de disco en el Mac). Revisados por lectura. Ejecutar `npx tsc --noEmit` y `npm run dev` antes de desplegar.
