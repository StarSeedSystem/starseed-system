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

## Decisiones de Alex 2026-10-19

Fuente: chat de Cowork del 2026-10-19. Detalle y valores en `memory/diseno/estudio-audiovisual/references/adn-y-tokens.md`.

- **Usar todas las variantes, cada una donde mejor encaje** (entre el ADN del 2026-10-06 y el sistema de Claude Design
  «StarSeed Design System»):
  - Tipografía: Satoshi para lo editorial y premium (solo por su CSS de Fontshare, licencia ITF), Rajdhani para lo técnico
    y las cifras, Inter para el cuerpo, Quicksand para lo orgánico y JetBrains Mono para el código; como mucho tres por pieza.
  - Sombras: una sola en la interfaz de uso; brillo multicapa solo en la pieza protagonista de cada vista.
  - Fondos: noche `#0A0F1D` como base, vacío profundo `#001F3F` para lo cósmico, Astraura y XR, nieve para documentos y los
    degradados Claridad, Profundidad, Natural y Cristal donde su registro lo pida.
- **Composición centrada:** los elementos con preferencia centrada en su ventana y cada ventana centrada en la pantalla,
  usando el espacio de forma inteligente para cada aparato (teléfono, tableta, escritorio, pantalla grande, XR y vídeo). Los
  controles persistentes siguen llegando desde los bordes.
- **Variaciones de identidad:** animaciones, transiciones, elementos 3D animados, tipografía, paletas, composición, iconos y
  sonido, con fundamentos, ejemplos desarrollados y referencias estudiadas de varios medios (se mide el patrón y se crea uno
  propio). Lo que Alex aprueba pasa a la Librería como variaciones públicas de su elemento.

## Intro canónica de StarSeed · «Génesis del símbolo» (aprobada por Alex el 2026-10-25)

Es **la** introducción de todo StarSeed (canales, redes, presentaciones, conferencias y vídeos del OS). Toda pieza de
vídeo que abra o cierre con la marca parte de ella; no se rehace por libre. Idea original: el doc de Alex «Identidad En
Movimiento» (Drive `1W8WFAbG31emQQPu0-QqnzJ6WoOBaEr4afwhT79O8VFE`), escena 1.

- **Archivos** (no versionados; viajan con el espejo de Drive), en `starseed_memory_root/identidad/intro/`:
  - **`escena1-v4.mp4`, la versión con sonido**: 29,6 s (27,6 de imagen y 2 s de negro para que las colas caigan
    solas), 1920×1080, 30 fps, H.264 y AAC 320k a 48 kHz, −14 LUFS y pico −1 dBTP;
  - `intro-v4-banda.wav` (banda sola, 24 bits), `capas-intro-v4-a/b.tgz` (las 9 capas para montaje: cama, corazón,
    luz, líquido, órbita, taijitu, logo, cierre, apagado y sala) y `fuentes-banda-intro-v4.tgz` (los guiones y los
    uniformes leídos de la animación);
  - `verificacion-sincronia-v4.png` (espectrograma con cada evento visual y su fotograma);
  - `escena1-v3.mp4` (la imagen aprobada, sin audio), `NOTAS-v3.md` (línea de tiempo al fotograma) y
    `fuentes-intro-v3.tgz` (composición HyperFrames con un solo canvas WebGL2; `build_v3.py` genera `index.html`).
- **Recorrido:** punto de luz → inversión → mitosis y dos esferas que orbitan y se funden líquidas → yin-yang → ojo →
  **taijitu áureo** (12,3–16,1 s: el yin-yang de espirales de Alex, con crecimiento φ por cuarto de vuelta, brotes con
  retraso 1/φ; cromo, nácar, laca y acero) → vesica → ignición del ojo, volumen 3D y prismas → la luz del ojo **descubre
  el mundo de madera viva** (ramas talladas, constelaciones, flor de la vida que se traza, cristales y neón en los rayos;
  pases de Blender) → símbolo oficial estable.
- **Cierre (desde 20,45 s):** el símbolo se reduce a 0,73 y sube; el wordmark **«StarSeed» en Rajdhani 700** sube tras una
  máscara en su línea base (mayúscula ≈ 97 px a 1080p, cara de nácar, bisel y canto de cromo extruido 8 px, contraste
  12,7:1), un destello diagonal, **fundido a negro de todo menos el ojo** (1,8 s) y **apagado de tele vieja**: párpados
  que aplastan la imagen en vertical (0,42 s) → línea brillante (0,12 s) → contracción al punto (0,30 s) → punto (0,15 s) →
  fósforo que decae (0,30 s) → negro. El punto final rima con el primero: la pieza puede ir en bucle.
- **Reglas que se heredan:** el centro es sagrado (composición centrada y centro óptico vertical); la luz principal llega
  de arriba a la derecha; el material del símbolo es cristal y metal pulido sobre materia orgánica; el movimiento nace del
  centro y vuelve a él; los empalmes se hacen por corte invisible (diferencia media < 0,04/255), no por fundidos.
- **Banda sonora (v4, 2026-10-25)**, conducida por la propia animación: los uniformes de la composición se leen a
  240 Hz con `window.__frame(t)` y mueven paneo, profundidad (la cámara mira a −z), velocidad y golpes. Armonía de toda
  la pieza: **Mi lidio en entonación justa**, la del sonido oficial. El motivo se anuncia por partes:
  - la estrella (E5) en el punto de luz, con el latido en 0,32 y 0,64 s;
  - el disparo de la neurona en 1,05 s, con luz que inunda;
  - la **quinta** E4–B4 cuando la mitosis separa los dos puntos (2,62 s);
  - la órbita: cada esfera tiene voz (la blanca brillante, la negra oscura), con paneo, Doppler, cercanía y un latido
    en cada cruce;
  - las **tres fusiones** suenan a la tríada E–G♯–B (6,28 · 7,02 · 7,73 s);
  - el yin-yang que nace (10,0 s), y la **♯4 lidia** cuando se forma el ojo;
  - los brotes áureos con retraso 1/φ (12,65 · 12,98 · 13,24 s), con remolino y metales;
  - el **sonido oficial completo** (ver abajo), con sus 12 estrellas sobre los 12 prismas;
  - la luz que descubre la madera y recorre el símbolo;
  - el nombre: **«Star» (B4, 20,78 s) · «Seed» (E4, 21,30 s)**, quinta que resuelve en casa;
  - el destello, las 13 constelaciones y la flor de la vida que canta al trazarse;
  - el ojo que queda encendido (E5) y el apagado de tele: sube una quinta, zumbido de la línea, caída al punto y
    E6 que rima con la primera estrella;
  - un último latido en el negro (bucle).
  - Medido: golpes a −2…+5 ms de su fotograma; arco de sonoridad con la cima en la tierra (−8 LUFS momentáneos).
- Los vídeos de presentación con animaciones gráficas se hacen después, en otro chat.

## Sonido oficial del símbolo StarSeed · «Semilla estelar» (aprobado por Alex el 2026-10-25)

Es **el** sonido que acompaña al símbolo en cualquier pieza audiovisual donde aparezca (intros, cierres, cortinillas,
anuncios, presentaciones, la app). No se compone otro: se usa este, entero o en su versión corta.

- **Motivo:** Mi lidio en entonación justa, **E4 → B4 → A♯4 → F♯4** (sube una quinta: los dos círculos; cae por la
  cuarta aumentada lidia hasta la novena: la semilla que baja del cosmos y se planta). Pulso **a = 0,55 s**, con
  eventos áureos 0 · a · aφ² · 2aφ² = **0 · 0,55 · 1,44 · 2,88 s**.
- **Lo que pasa:** debajo nacen 12 parciales en tiempos áureos (las 12 facetas). En la tierra estalla un **Mi
  maj9♯11** con trueno grave, un cielo de **12 estrellas** que frenan y una octava que florece después del golpe.
- **Timbres:** campana estelar (FM suave con parciales de vidrio 2,76 · 5,40 y un gemelo que respira), drone aditivo,
  pad lidio, sub con caída de tono, cristales que titilan, sala estelar de 4,2 s y ecos ping-pong áureos
  (0,382 / 0,618 s).
- **Versiones** (en `starseed_memory_root/identidad/logo-sonoro/oficial/`):
  - **completa**: 10,3 s, la cola cae sola y el último segundo queda a −32 dB del pico;
  - **corta**: 4,7 s, a = 0,16 s;
  - las dos a −14 LUFS y pico −1,4 dBTP, sin clics, en WAV 48 kHz/24 bits y MP3 320k;
  - las capas para montaje (`capas-semilla-estelar.tgz`: motivo, armonía, trueno, estrellas y sala);
  - las fuentes (`semilla_oficial.py`).
- **Cómo se encaja en una pieza:** `semilla_oficial.render(tiempos=[…4 instantes…], estrellas=[…12…])` acepta otros
  instantes, para que los tonos caigan sobre los movimientos del símbolo. Las proporciones no se tocan: el pulso
  sigue en 0,55 s si la animación lo permite. En la intro: estrella 14,40 (disco áureo en reposo) · quinta 14,95
  (empieza el drenaje) · lidio 15,84 (termina de desenrollarse) · **tierra 17,28 (la luz nace en el ojo)**, y las 12
  estrellas sobre los 12 prismas (17,49–18,09). Antes de la tierra crece de −3 a 0 dB, para que el golpe sea la cima.
- **No hacer:** recortarlo antes de que caiga su cola; cambiar sus notas, su afinación o el orden de sus
  eventos; ponerle un fundido corto.
