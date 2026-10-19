# ADN y tokens de StarSeed OS

Fuentes del repo `StarSeedSystem/starseed-system`: `memory/diseno/adn/starseed-os/dna.json` (ADN del
2026-10-06), `memory/diseno/identidades.md`, `design-system/starseed-system/DESIGN_RULES.md`,
`theme-antigravity-flux/config/theme_params.json`, `src/app/globals.css` y
`src/components/mando/mando-cristal.css`. Si el repo cambia, manda el repo.

## 1. Alma

- **Una línea:** sistema operativo social con cristal líquido y Trinity cardinal.
- **Adjetivos:** translúcido, cardinal, soberano. **Linaje:** Trinity Liquid Crystal.
- **Energía (0–10):** densidad 6, variación 7, contraste 8, calidez 5. Distancia de lectura: 1–3 m.
- **Fundamento:** el diamante (el sistema completo, con la conciencia como esencia), la semilla como piedra
  filosofal (la estructura y método de cada persona, grupo y comunidad) y la alquimia hacia el oro (el
  desarrollo creativo, sociocultural, ecológico y autosustentable). El oro no es lucro: es lo que la
  sociedad crea y sostiene.
- **Trinity:** guía de IA arriba, creación a la izquierda, control a la derecha y raíz abajo; el centro
  queda libre (centro sagrado).

## 2. Paleta

| Rol | Token | Hex | Nombre | Cobertura objetivo |
|---|---|---|---|---|
| zenith | `--ss-zenith` | `#007FFF` | azul eléctrico | 25 % |
| horizonte | `--ss-horizonte` | `#10B981` | verde esmeralda | 25 % |
| lógica | `--ss-logica` | `#FFBF00` | ámbar solar | 20 % |
| anchor | `--ss-anchor` | `#DC143C` | carmesí sistema | 10 % |
| neutro | `--ss-nieve` | `#F8F9FA` | nieve | 20 % |
| base nocturna | `--ss-noche` | `#0A0F1D` | noche índigo (Solarpunk Harmónico, rango `#050814`–`#0A0F1D`) | fondo |

Derivados para texto sobre nieve (mismos tonos, oscurecidos hasta pasar 4.5:1): `--ss-zenith-texto`
`#0057B0`, `--ss-horizonte-texto` `#047857`. Neutros de apoyo: pizarra `#46506A`, bruma `#AEB6C8`,
noche alta `#141B2E`, nieve honda `#EDF0F4`.

**Colores del símbolo** (muestreados del `public/starseed-symbol.png`): rojo `#CC3737`/`#A52D2D`, verde
`#51CC37`/`#38A52D`, azul `#3636CC`/`#3030B5`, amarillo `#E2D640`/`#C1BD3A`, pupila `#272525`, grises
`#CCCCCC`/`#EAEAEA`/`#3A3A3A`, negro y blanco. Se usan solo para el símbolo y sus animaciones; la
interfaz y los textos usan la paleta Trinity.

## 3. Contrastes medidos (WCAG 2.x)

| Texto | Fondo | Ratio | Uso permitido |
|---|---|---|---|
| noche `#0A0F1D` | nieve | 18.13 | todo |
| zenith `#007FFF` | nieve | 3.64 | solo texto grande (24 px+) o trazos; para texto normal usa `#0057B0` (6.66) |
| horizonte `#10B981` | nieve | 2.41 | nunca como texto ni trazo esencial; usa `#047857` (5.20) |
| lógica `#FFBF00` | nieve | 1.57 | nunca como texto; solo relleno con texto noche encima |
| anchor `#DC143C` | nieve | 4.73 | todo |
| nieve | noche | 18.13 | todo |
| zenith | noche | 4.99 | todo |
| horizonte | noche | 7.53 | todo |
| lógica | noche | 11.56 | todo |
| anchor | noche | 3.83 | solo texto grande (24 px+, o 18.7 px+ en negrita) |
| cian Astraura `#00F0FF` | noche | 13.57 | todo |
| noche | zenith (relleno) | 4.99 | texto sobre botón o banda zenith |
| noche | horizonte (relleno) | 7.53 | texto sobre banda horizonte |
| noche | lógica (relleno) | 11.56 | texto sobre banda lógica |
| nieve | anchor (relleno) | 4.73 | texto sobre banda anchor |
| nieve | zenith (relleno) | 3.64 | solo texto grande |
| nieve | horizonte (relleno) | 2.41 | nunca |

Para cualquier par nuevo: `python3 scripts/comprobar_adn.py --par "#RRGGBB" "#RRGGBB"`.

## 4. Tipografía

Decisión de Alex (2026-10-19): se usan todas, cada una donde mejor encaja. Como mucho tres familias por pieza.

| Rol | Familia | Respaldo | Dónde encaja |
|---|---|---|---|
| display editorial | Satoshi (500–900) | Rajdhani, Inter | manifiestos, carteles, portadas, títulos de vídeo de marca, conferencias: lo que debe sentirse premium y humano |
| titular técnico | Rajdhani (500–700) | Inter | interfaz del OS, cifras grandes, rótulos de escena, Genesis, Astraura, datos y HUD |
| cuerpo | Inter (300 aire, 400 lectura) | system-ui, sans-serif | textos, subtítulos, interfaz |
| orgánico | Quicksand (400–700) | Inter | tema Natural, Materia Viva, Fundación y ecología |
| código | JetBrains Mono | monospace | código, comandos, datos técnicos |

Licencias: Rajdhani, Inter, Quicksand y JetBrains Mono son SIL Open Font License. **Satoshi es ITF Free Font
License**: uso libre personal y comercial, pero sus archivos nunca se empaquetan ni se suben; se carga con su
CSS de Fontshare (`https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap`) en páginas, en el OS
y al renderizar vídeo; donde no se puede cargar (artefactos de Claude), se usa Rajdhani.

Escala para vídeo a 1080p (propuesta que cumple p2–p4): cuerpo 32 px, rótulo 56 px, titular 192 px
(proporción 6). En conferencia 16:9: cuerpo 28–32 px, titular 168–192 px. Base de la interfaz del OS: 16 px.

## 5. Forma, material y movimiento

- **Radios del tema** (`theme_params.json`): 4, 12, 24, 42 px y píldora 9999 px. Acciones siempre en píldora.
- **Cristal líquido:** desenfoque de fondo (16 px por defecto en el OS, 10 px en Genesis; 20 px con
  saturación 180 % en el sistema anterior para piezas destacadas), opacidad 0.6, un borde fino de luz arriba
  (`inset 0 1px 0 rgba(255,255,255,0.15)`).
- **Sombras, las dos (decisión de Alex, 2026-10-19):**
  - *Sombra simple* (`shadow-md` o `shadow-lg`, una sola) en toda la interfaz de uso: listas, formularios,
    paneles, chats, tablas. Lee mejor y pesa menos.
  - *Brillo multicapa* (resplandor ambiente del color del registro + sombra direccional + brillo especular
    interior) solo en piezas destacadas: widget de cristal enfocado, tarjeta protagonista, portada, cartel,
    título de vídeo y renders 3D. Propuesta: `0 0 32px rgba(0,127,255,0.35), 0 12px 24px rgba(0,0,0,0.35),
    inset 0 1px 0 rgba(255,255,255,0.15)`. Nunca sobre texto denso ni en más de un elemento por vista.
- **Fondos, todos en su sitio:**
  - noche `#0A0F1D`: base de la interfaz oscura y del vídeo;
  - vacío profundo `#001F3F`: escenas cósmicas, Astraura, XR y explicaciones de la red y del universo;
  - nieve `#F8F9FA`: documentos y páginas claras;
  - degradados de los temas del sistema anterior: Claridad `radial-gradient(ellipse 100% 80% at 15% 0%,
    #f0ebff 0%, #fafafa 45%, #eff6ff 100%)`, Profundidad `linear-gradient(135deg, #0a0118 0%, #0f0a2e 45%,
    #04091e 75%, #000810 100%)`, Natural `radial-gradient(ellipse 80% 60% at 25% 80%, #0a2210 0%, #0d1a0e 50%,
    #050c06 100%)`, Cristal `linear-gradient(135deg, #020618 0%, #0a1628 35%, #080420 65%, #060220 100%)`.
  Sobre cualquier fondo vivo o degradado, velo bajo el texto para mantener 4.5:1.
- **Curvas reales del OS:** `--ease-organic` `cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-glide`
  `cubic-bezier(0.16, 1, 0.3, 1)`, curva de Genesis `cubic-bezier(0.22, 0.9, 0.3, 1)`.
- **Duraciones reales de interfaz:** 140 ms (rápido), 220 ms (orgánico), 240 ms (normal); presets entre
  100 y 350 ms. En vídeo, las mismas curvas con duraciones de escena (propuesta para calibrar con Alex):
  entrada de panel 600–900 ms, cambio de escena 400–600 ms, respiración del símbolo 4–6 s por ciclo.
- **Vocabulario de movimiento propio:** *siembra* (punto → brote → símbolo), *entrada cardinal* (desde el
  perímetro hacia su punto de la Trinity), *cristalización* (la malla de nodos se ordena en retícula, como
  la sílice que se vuelve cristal), *respiración* (escala 1 → 1.03 con `--ease-organic`), *horizonte* (la
  jugada rara), *alquimia* (un elemento gris se vuelve oro de lógica al cumplir su propósito).
- Solo se animan `transform` y `opacity`; nada de animar anchos, altos ni márgenes.

## 6. Registros de identidad (variantes para una identidad dinámica)

La marca es una; los registros cambian el matiz, no la jerarquía. Elige uno por pieza o por escena.

| Registro | Paleta | Cuándo |
|---|---|---|
| **Nexus / Trinity** (por defecto) | Trinity sobre noche o nieve | todo lo transversal: intros, manifiesto, el OS completo |
| **Astraura** | cian `#00F0FF` sobre cristal técnico oscuro | IA soberana, capas, agentes, procesos |
| **Genesis** | neón cian 34/211/238, violeta 167/139/250, ámbar 251/191/36; cristal 10 px, radio 0.85 rem | dirigir agentes, enjambre, MetaGenesis |
| **Malla cristalina** | Trinity + preset Quantum Hex `#020617` `#0C4A6E` `#06B6D4` `#67E8F9` | red mesh, telecomunicaciones locales, antenas |
| **Economía ecológica** | Solarpunk Aurora `#FEF9C3` `#FDE047` `#65A30D` `#15803D` o Verdant Earth | abundancia, ecología, autosustento |
| **Democracia directa** | Bauhaus Modular `#FFFFFF` `#DC2626` `#FACC15` `#1D4ED8` (sin cristal) | votaciones, propuestas, claridad institucional |
| **Café y comunidad física** | pergamino `#FDF7EA`, tinta `#3B2818`, terracota `#C05C3B`, musgo `#3F7A2A` | lugares, eventos presenciales |
| **Audiomorphic** | violeta `#A855F7` + oro `#D4AF37` sobre `#08040F` | sonido, frecuencias, experiencias inmersivas |
| **Materia Viva** | oro vivo `#E9C46A`, cristal `#7FD8E8`, bosque `#9FE870` sobre `#0D130E` | semilla, crecimiento, naturaleza y tecnología |
| **Exploración** | Aurora Borealis `#0A0E27` `#0D4068` `#10B981` `#A855F7` | multiverso, XR, futuro |
| **Energía alta** | Synthwave Horizon `#FF3CAC` `#784BA0` `#2B86C5` `#00F0FF` | lanzamientos y fiestas; nunca para lectura larga |

Los registros vienen de `memory/diseno/identidades.md` y `src/lib/themes/curated-presets.ts`. Si un
registro baja el contraste de un texto por debajo de 4.5:1, gana el contraste.

## 7. Firmas, jugada rara y prohibiciones

- Firmas: paneles cardinales desde el perímetro (1:1.618), acciones en píldora (radio > 16 px), degradado
  radial de acento con 15 % de cobertura.
- Jugada rara: una línea de horizonte cruza la Trinity sin tocar el centro (1:2). Una vez por pieza.
- Prohibido: hexadecimales sueltos, ruido decorativo, controles persistentes tapando el centro (el contenido
  sí va centrado, ver §7b), brillo multicapa en interfaz de uso, animar dimensiones.

## 7b. Composición centrada y espacio inteligente por aparato

Decisión de Alex (2026-10-19): **los elementos se colocan con preferencia centrada en su ventana y en la
pantalla**, aprovechando el espacio de forma inteligente según el aparato. Encaja con el paradigma perimetral:
el contenido se centra y las barras de control llegan desde los bordes.

| Aparato | Cómo se usa el espacio |
|---|---|
| Teléfono (vertical) | una columna centrada con márgenes de `space-md`; ventanas como hojas centradas que suben desde abajo; acciones principales en la zona del pulgar (abajo), dianas de 44 px o más; respeta las zonas seguras de la pantalla |
| Tableta | contenido centrado de hasta dos columnas; paneles laterales que entran desde el borde y se superponen sin empujar el centro |
| Escritorio | ventanas que abren centradas, con ancho de lectura de 65 caracteres para texto y rejillas centradas para tarjetas; la Trinity en los bordes |
| Pantalla grande, proyector o TV | composición centrada en la zona segura de títulos, texto de 28 px o más a 1080p, nada importante pegado a los bordes |
| XR | paneles centrados en el campo de visión a distancia cómoda de lectura; los controles, en arco a los lados |
| Vídeo 16:9 | título y sujeto en el centro óptico; rótulos en el tercio inferior centrados o alineados al margen de seguridad |
| Vídeo 9:16 | banda central para texto y sujeto; arriba y abajo libres para la interfaz de cada red |

Reglas: centrar no es amontonar (aire de `space-xl` a `space-3xl` alrededor del bloque central); la proporción
áurea reparte lo que rodea al centro; si el contenido no cabe centrado, se apila en una columna centrada en vez
de desbordar.

## 8. Los sistemas de diseño de StarSeed en Claude

- **Artefacto Design System «StarSeed OS»** (https://claude.ai/artifact/XGig1BviuZC1C1157GKxSL): el hogar
  en Claude desde el 2026-10-19. Tokens en dos temas (Noche y Nieve) con contrastes medidos, mundos,
  registros, fuentes reales (Rajdhani, Inter, JetBrains Mono), el símbolo y los componentes `BotonPildora`,
  `PanelCristal` y `RotuloInferior`. Construye los Slides y los Design desde él; para leerlo, lee primero su
  `project/README.md`.
- **Proyecto de Claude Design «StarSeed Design System»**
  (https://claude.ai/design/p/7b393721-3841-4f10-9a01-e2b4413a2dee): el sistema anterior, por defecto de la
  organización. **Claude Design cierra el 14-12-2026**: su sistema se pasa a Artefactos con «Migrate team
  design systems» (página de Artefactos) y llega de solo lectura; los chats y comentarios no se migran. Trae
  el kit de interfaz del OS (Header, Sidebar, Dashboard, CrystalWidget, GlassCard, LiquidButton,
  NetworkView), carteles e invitaciones de eventos. Los PDF grandes se comprimieron (3,8 y 3,3 MB, PSNR ≥ 39,9
  dB); los originales están respaldados en la Mac (`~/Documents/StarSeed-respaldos/claude-design-2026-10-19/`).
- **Mundos** («Una semilla, muchos mundos»): Sociedad violeta `#CD77F8`, StarSeed OS cian `#25D1F4`, Café
  oro de grano `#F5B91A`, Estudio fucsia `#F471F4`, Fundación verde germinación `#34D77F`, Audiomorphic
  verde azulado `#2DD29B`. Todos pasan como texto sobre noche (6.9:1 o más) y ninguno sobre nieve.
- **Del sistema anterior también:** neón lima `#39FF14` (vitalidad, izquierda), oro bruñido `#D4AF37`
  (lógica, derecha), vacío profundo `#001F3F`; cinco temas (Claridad, Profundidad, Equilibrio, Natural,
  Cristal) y ocho paletas de widgets de cristal; iconos Lucide de 1.5–2 px; llamadas a la acción «Crear»,
  «Explorar», «Contribuir», «Manifestar»; conceptos como nombres propios (La Semilla, El Fruto, La Cosecha,
  Cuenta Soberana, Exocórtex).
- **Decisiones de Alex (2026-10-19):** se usan las dos opciones de cada diferencia, cada una donde mejor
  encaja (Satoshi y Rajdhani en §4; sombra simple y brillo multicapa, y los dos fondos, en §5) y la
  composición es centrada y adaptable por aparato (§7b).

## 9. Nota sobre el comprobador del repo

`memory/diseno/adn/starseed-os/check.py` del repo aprueba las 8 pruebas sin medir nada. No lo uses como
prueba: usa `scripts/comprobar_adn.py` de esta skill, que mide de verdad lo que se puede medir y dice
«manual» en lo demás.
