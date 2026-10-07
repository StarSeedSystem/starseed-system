# Identidades visuales por contexto

Fuente operativa del director de diseño. Cada ficha fija el propósito, el público, la paleta tokenizada,
la tipografía, los materiales, el movimiento, los motivos geométricos y los límites del contexto.
Si un token ya existe, se usa antes que un hexadecimal suelto
(`design-system/starseed-system/DESIGN_RULES.md:18-49`).

## StarSeed OS / Nexus

- **Propósito y público:** sistema operativo social y portal general; guía IA arriba, creación a la izquierda, control a la derecha y raíz abajo. Es la identidad transversal para cualquier persona del ecosistema (`DESIGN.md:10-31`).
- **Paleta/tokens:** `palette.trinity.zenith.active` `#007FFF`, `horizonte.panel` `#10B981`, `logica.active` `#FFBF00`, `base.active` `#DC143C`; neutro `#F8F9FA` (`theme-antigravity-flux/config/theme_params.json:25-53`).
- **Tipografía:** `font_family_main` Inter, `font_family_headline` Rajdhani/Inter y `font_family_code` JetBrains Mono; base `16px`, peso 300 para aire y 400 para lectura (`theme-antigravity-flux/config/theme_params.json:56-70`).
- **Material y movimiento:** cristal líquido translúcido, blur y refracción; paneles cardinales que entran desde el perímetro y acciones tipo píldora (`DESIGN.md:40-53`; `DESIGN.md:60-98`).
- **Motivo / no hacer:** Trinity y centro sagrado como estructura; no ocupar el lienzo central con controles persistentes ni sustituir profundidad por ruido decorativo (`DESIGN.md:55-58`).

## Astraura

- **Propósito y público:** inteligencia soberana 1.58: motor ternario, procesos autónomos, agentes y avisos para quien dirige su exocórtex (`src/data/starseed-command-listings.ts:43-54`).
- **Paleta/tokens:** acento identitario cian `#00F0FF`; superficies `--aw-shell`, `--aw-surface`, `--aw-field`; tintas `--aw-ink`, `--aw-text`, `--aw-muted` (`src/data/starseed-command-listings.ts:43-49`; `src/app/globals.css:3601-3620`).
- **Tipografía:** escala compacta documentada: hint 10 px, cuerpo 11 px, título 12 px semibold y valor 13 px; hereda la familia activa del OS (`src/app/globals.css:3590-3595`).
- **Material y movimiento:** cristal técnico oscuro o velo claro, con líneas y focos tokenizados; el movimiento queda subordinado a procesos y estado, no a adorno (`src/app/globals.css:3601-3641`).
- **Motivo / no hacer:** binario, orbe y capas de sistema; no reintroducir la antigua isla negra con `text-white`, `bg-white` o hex repetidos (`src/app/globals.css:3571-3588`).

## Genesis

- **Propósito y público:** instrumento operativo para observar y dirigir agentes en una Mac de 8 GB; prima lectura inmediata y bajo coste (`src/components/mando/mando-cristal.css:1-19`).
- **Paleta/tokens:** `--mc-neon-cian` 34/211/238, `--mc-neon-violeta` 167/139/250, `--mc-neon-ambar` 251/191/36; cristal, borde, canto y radio `0.85rem` (`src/components/mando/mando-cristal.css:22-35`).
- **Tipografía:** hereda `--font-body` Inter/pila del sistema para densidad operativa; no declara una familia paralela (`src/app/globals.css:71-78`).
- **Material y movimiento:** cristal de blur 10 px y relieve por luz; 140/240 ms, solo `transform` y `opacity`, una animación infinita (`src/components/mando/mando-cristal.css:37-75`; `src/components/mando/mando-cristal.css:77-148`).
- **Motivo / no hacer:** planos de cristal centrados, barras y pastillas; nada de WebGL, perspectiva, cinco sombras o animar dimensiones; respetar `prefers-reduced-motion` (`src/components/mando/mando-cristal.css:3-19`; `src/components/mando/mando-cristal.css:150-172`).

## StarSeed Café

- **Propósito y público:** cafetería, menú, vasos y economía; puerta cálida y comunitaria, física y digital (`architecture/design-system-figma.md:10-15`; `architecture/design-system-figma.md:45-48`).
- **Paleta/tokens:** claro pergamino `#fdf7ea`, tinta `#3B2818`, `--primary-hsl` terracota `#C05C3B`, acento musgo `#3f7a2a`; oscuro `#0d130e`, oro `#E9C46A`, lima `#9FE870` (`src/app/globals.css:2567-2584`; `src/app/globals.css:2587-2667`).
- **Tipografía:** Fraunces en titulares y Space Mono en etiquetas; la guía de marca suma Space Grotesk para cuerpo/interfaz (`src/app/globals.css:2683-2708`; `architecture/design-system-figma.md:17-20`).
- **Material y movimiento:** pergamino/cristal cálido, botones de oro fundido y respiración con `--ease-organic`/`--ease-glide` a 220 ms (`src/app/globals.css:2720-2789`).
- **Motivo / no hacer:** curvas orgánicas y bosque dorado; no dejar que Materia Viva reemplace la terracota sobre crema ni usar dorado de bajo contraste (`src/app/globals.css:2710-2717`).

## Audiomorphic

- **Propósito y público:** visualizador de sonido y consciencia para exploración audiovisual e inmersiva; dispone de 20 geometrías nativas (`src/lib/library/packages.ts:1400-1407`).
- **Paleta/tokens:** violeta `#A855F7` + oro `#D4AF37` sobre negro `#08040f/#150b24`; claro lila con primario `#7C3AED` y oro viejo `#B8860B` (`src/app/globals.css:3004-3051`; `src/app/globals.css:3075-3115`).
- **Tipografía:** hereda `--font-body` del OS; la identidad se expresa por color, ritmo y geometría, no por una familia local no declarada (`src/app/globals.css:71-78`; `src/app/globals.css:3004-3020`).
- **Material y movimiento:** cristal ceremonial lila/negro, halo dorado y respuesta audio-reactiva; radios `0.875rem–2rem` (`src/app/globals.css:3059-3071`; `src/app/globals.css:3118-3177`).
- **Motivo / no hacer:** geometría sagrada como visualización funcional; no tapar controles ni presentar VR/AR como nativo del OS, pues ese modo sigue en la app original (`src/lib/audiomorphic/geometry-drawers.ts:1-16`; `src/lib/library/packages.ts:1402-1407`).

## Materia Viva

- **Propósito y público:** fondo orgánico para lienzos, portal y áreas donde naturaleza y tecnología deben convivir (`architecture/design-system-figma.md:10-15`; `architecture/design-system-figma.md:30-34`).
- **Paleta/tokens:** `--materia-accent` oro vivo `#E9C46A`; variantes cristal líquido `#7FD8E8` y bosque dorado `#9FE870`, con sus `--primary-hsl`, `--ring-hsl` y RGB (`src/app/globals.css:2458-2485`).
- **Tipografía:** lenguaje común Fraunces/Space Grotesk/Space Mono; en el OS hereda `--font-body` si el contexto no activa otra marca (`architecture/design-system-figma.md:17-20`; `src/app/globals.css:71-78`).
- **Material y movimiento:** canvas verde-negro `#0d130e→#16210f`, cristal orgánico y bordes/glow derivados del token de acento (`architecture/design-system-figma.md:30-31`; `src/app/globals.css:2494-2507`).
- **Motivo / no hacer:** crecimiento radial, semilla y flor; no volver opaco el shell ni imponer el oro sobre Café claro (`src/app/globals.css:2503-2507`; `src/app/globals.css:2710-2717`).

## Presets curados

### Synthwave Horizon

- **Propósito/público:** sesiones creativas de alta energía; retrofuturismo ochentero cyberdélico.
- **Paleta/tipo:** swatch `#FF3CAC`, `#784BA0`, `#2B86C5`, `#00F0FF`; Space Grotesk 1× (`src/lib/themes/curated-presets.ts:43-72`).
- **Material/movimiento:** cristal 18, opacidad .7, neón, pulso, 200 ms y entrada slide; motivo horizonte degradado. No usarlo para lectura larga o calma (`src/lib/themes/curated-presets.ts:51-81`).

### Tokyo Midnight

- **Propósito/público:** creatividad nocturna y superficies densas de carácter cyberpunk.
- **Paleta/tipo:** `#0d0221`, `#ff206e`, `#41ead4`, `#fbff12`; Source Code Pro .95× (`src/lib/themes/curated-presets.ts:84-110`).
- **Material/movimiento:** cristal 24, borde 2, rejilla, neón, 120 ms y slide. No extender la saturación a cuerpos largos (`src/lib/themes/curated-presets.ts:92-120`).

### Solarpunk Aurora

- **Propósito/público:** trabajo diurno optimista, naturaleza y tecnología en simbiosis.
- **Paleta/tipo:** `#fef9c3`, `#fde047`, `#65a30d`, `#15803d`; Outfit 1.05× (`src/lib/themes/curated-presets.ts:123-147`).
- **Material/movimiento:** cristal claro, radio 28, píldoras líquidas, 280 ms y entrada elástica; motivo solar/orgánico. No convertirlo en verde ornamental sin función (`src/lib/themes/curated-presets.ts:130-156`).

### Verdant Earth

- **Propósito/público:** convivencia, cultura y trabajo orgánico de baja estridencia.
- **Paleta/tipo:** `#1a2e1a`, `#3d5c3d`, `#7d9b76`, `#c8e0bf`; Outfit 1× (`src/lib/themes/curated-presets.ts:160-179`).
- **Material/movimiento:** cristal 12, radio 32, fluidez .5, 320 ms y fade; motivo hoja/jardín. No añadir neón ni acelerarlo (`src/lib/themes/curated-presets.ts:167-188`).

### Bauhaus Modular

- **Propósito/público:** edición de código y gobernanza con función explícita y geometría dura.
- **Paleta/tipo:** `#ffffff`, `#dc2626`, `#facc15`, `#1d4ed8`; Space Grotesk 1× (`src/lib/themes/curated-presets.ts:192-212`).
- **Material/movimiento:** sin cristal ni radios, borde 3 y sombra dura; 100 ms, sin hover ni transición de página; motivo cuadrado. No suavizar con blur, glow o píldoras (`src/lib/themes/curated-presets.ts:199-220`).

### Monaco Noir

- **Propósito/público:** perfil o presentación de lujo sobrio con un solo acento.
- **Paleta/tipo:** `#0a0a0a`, `#1a1a1a`, `#ca8a04`, `#fde047`; Satoshi 1× (`src/lib/themes/curated-presets.ts:225-245`).
- **Material/movimiento:** casi opaco, cristal desactivado, 180 ms y fade; motivo diamante. No multiplicar acentos ni efectos (`src/lib/themes/curated-presets.ts:232-254`).

### Iridescent Pearl

- **Propósito/público:** presentaciones y perfiles futuristas de carácter etéreo.
- **Paleta/tipo:** `#fce7f3`, `#ddd6fe`, `#a5f3fc`, `#fef9c3`; Outfit 1× (`src/lib/themes/curated-presets.ts:258-280`).
- **Material/movimiento:** cristal holográfico 32, aberración 5, orbes, pulso, 350 ms y entrada elástica; motivo gema. No sacrificar contraste al efecto irisado (`src/lib/themes/curated-presets.ts:265-289`).

### Origami Paper

- **Propósito/público:** concentración y escritura en un entorno mínimo.
- **Paleta/tipo:** `#ffffff`, `#f5f5f4`, `#e7e5e4`, `#78716c`; Inter .95× (`src/lib/themes/curated-presets.ts:293-312`).
- **Material/movimiento:** papel sólido, sin cristal ni glow, radio 4, 200 ms y fade; motivo pliegue. No introducir neón, blur ni fondos activos (`src/lib/themes/curated-presets.ts:300-320`).

### Aurora Borealis

- **Propósito/público:** exploración y multiverso en atmósferas futuristas.
- **Paleta/tipo:** `#0a0e27`, `#0d4068`, `#10b981`, `#a855f7`; Satoshi 1× (`src/lib/themes/curated-presets.ts:325-347`).
- **Material/movimiento:** WebGL líquido, cristal 28, orbes, 300 ms y entrada scale; motivo aurora. No colocarlo detrás de texto sin velo adaptativo (`src/lib/themes/curated-presets.ts:332-355`).

### Terracotta Warm

- **Propósito/público:** convivencia y cultura con calidez mediterránea.
- **Paleta/tipo:** `#fef3e2`, `#f4a261`, `#e76f51`, `#264653`; Outfit 1.05× (`src/lib/themes/curated-presets.ts:360-380`).
- **Material/movimiento:** cristal 8, radio 24, 250 ms y fade; motivo arcilla/adobe. No confundirlo con los tokens oficiales de Café (`src/lib/themes/curated-presets.ts:367-388`).

### Quantum Hex

- **Propósito/público:** exploración técnica, redes y topologías futuristas.
- **Paleta/tipo:** `#020617`, `#0c4a6e`, `#06b6d4`, `#67e8f9`; Source Code Pro .95× (`src/lib/themes/curated-presets.ts:393-413`).
- **Material/movimiento:** WebGL hexagonal, cristal 16, rejilla, 180 ms y scale; motivo hexágono. No usar la rejilla como ruido sobre contenido denso (`src/lib/themes/curated-presets.ts:400-421`).

### Lavender Mist

- **Propósito/público:** concentración, escritura y superficies suaves de baja tensión.
- **Paleta/tipo:** `#faf5ff`, `#e9d5ff`, `#d8b4fe`, `#9333ea`; Outfit 1× (`src/lib/themes/curated-presets.ts:426-446`).
- **Material/movimiento:** niebla radial, cristal 14, orbes, pulso, 300 ms y fade; motivo nube. No bajar contraste por mantener la suavidad (`src/lib/themes/curated-presets.ts:433-454`).
