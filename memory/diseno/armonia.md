# Armonía, proporción y geometría

Regla de composición para interfaces StarSeed. La geometría organiza jerarquía, ritmo y foco;
nunca compite con el contenido. La base contractual es φ = 1.618, reducida a 1.25 en pantallas
estrechas (`architecture/director-diseno.md:47-56`).

## Escala tipográfica

### Escala φ para tablet, escritorio y TV

Base `1rem = 16px`; cada peldaño multiplica o divide por `1.618`. El valor existe también como
`typography.scale_ratio` y `geometry.golden_ratio` (`theme-antigravity-flux/config/theme_params.json:56-79`).

| Peldaño | px | rem | Uso |
|---|---:|---:|---|
| φ⁻² | 6.111 | 0.382 | Solo marcas no textuales; no información legible |
| φ⁻¹ | 9.889 | 0.618 | Microdato excepcional, nunca cuerpo |
| base | 16 | 1 | Cuerpo y controles |
| φ¹ | 25.888 | 1.618 | Subtítulo / `h4` |
| φ² | 41.888 | 2.618 | Título de sección / `h3` |
| φ³ | 67.776 | 4.236 | Título de vista / `h2` |
| φ⁴ | 109.665 | 6.854 | Display; solo si el viewport lo admite |

Los renglones por debajo de 16 px no sustituyen los mínimos de legibilidad. El código actual ya
ofrece `--text-fluid-*` con `clamp()`; la escala φ decide jerarquía y esos tokens resuelven el
ajuste entre viewports (`src/app/globals.css:97-105`).

### Escala 1.25 para móvil y plegable

Se usa a 430 px o menos, incluida la comprobación plegable de 280 px. Conserva cuerpo de 16 px:

| Peldaño | px | rem | Uso |
|---|---:|---:|---|
| −1 | 12.8 | 0.8 | Etiqueta secundaria; evitar en texto esencial |
| base | 16 | 1 | Cuerpo y controles |
| +1 | 20 | 1.25 | Subtítulo |
| +2 | 25 | 1.5625 | Título de bloque |
| +3 | 31.25 | 1.9531 | Título de vista |
| +4 | 39.063 | 2.4414 | Display móvil máximo habitual |

La reducción de razón evita saltos desproporcionados; no reduce dianas, contraste ni cuerpo. La
matriz contractual cubre 280, 360 y 430 px (`architecture/director-diseno.md:80-87`).

## Espaciado Fibonacci

Unidad en px con conversión sobre 16 px; elegir el siguiente peldaño antes de inventar un valor.

| Token conceptual | px | rem | Uso principal |
|---|---:|---:|---|
| `fib-2` | 2 | 0.125 | Separación óptica / hairline |
| `fib-3` | 3 | 0.1875 | Microajuste interno |
| `fib-5` | 5 | 0.3125 | Icono–texto compacto |
| `fib-8` | 8 | 0.5 | Gap corto |
| `fib-13` | 13 | 0.8125 | Padding compacto |
| `fib-21` | 21 | 1.3125 | Padding de tarjeta |
| `fib-34` | 34 | 2.125 | Separación entre bloques |
| `fib-55` | 55 | 3.4375 | Respiración de sección |
| `fib-89` | 89 | 5.5625 | Separación de escenas / hero |
| `fib-144` | 144 | 9 | Vacío compositivo amplio |

Los tokens fluidos actuales cubren de 4 a 56 px mediante `clamp()`; se usan cuando el espacio debe
interpolar, y Fibonacci decide sus hitos (`src/app/globals.css:107-113`).

## Rejilla áurea

- Dos columnas: `1 : 1.618`, equivalentes a `38.2% : 61.8%`; contenido principal en la mayor y apoyo en la menor.
- Invertir a `61.8% : 38.2%` cuando la lectura comienza en el panel dominante; no alternar sin una razón semántica.
- El foco se aproxima a una intersección áurea, pero controles y texto conservan alineación de rejilla.
- En móvil la rejilla colapsa a una columna; el orden DOM sigue propósito → acción → apoyo.
- Dashboard y cards siguen rejilla fluida con `gap`, nunca márgenes que se solapen (`design-system/starseed-system/DESIGN_RULES.md:83-109`).

## Radios armónicos

- Escala Antigravity existente: 4, 12, 24 y 42 px, más píldora 9999 px (`theme-antigravity-flux/config/theme_params.json:72-82`).
- Escala base del OS: `--radius-sm` 14 px, `--radius` 20 px, `--radius-lg` 24 px, `--radius-xl` 30 px y `--radius-2xl` 40 px (`src/app/globals.css:80-86`).
- Se elige una familia por contexto; no se mezclan ambas dentro del mismo componente ni se crea un radio intermedio.
- Círculos y píldoras se reservan para avatares, glifos y acciones compactas; una tarjeta informativa conserva esquinas, no forma de cápsula.

## Proporciones de tarjetas y medios

| Proporción | Uso |
|---|---|
| φ (`1.618:1`) | Hero, tarjeta destacada o composición con foco y apoyo |
| `3:2` | Fotografía editorial, arte y preview de documento |
| `16:9` | Vídeo, captura de pantalla y escena panorámica |
| `1:1` | Avatar, icono, cubierta compacta y celda de catálogo |

Usar `aspect-ratio` para reservar el espacio y evitar saltos; las cards con imagen ya lo exigen
(`design-system/starseed-system/DESIGN_RULES.md:98-109`). En vertical puede invertirse φ a `1:1.618`;
el contenido no se recorta para forzar una proporción.

## Geometría sagrada como estructura

Las formas establecen relaciones: intersección, crecimiento, red, volumen o recorrido visual. Se
colocan en una capa no interactiva, con opacidad baja y suficiente vacío para la información. El
precedente del escritorio usa `aria-hidden`, 22% de opacidad y contenido por encima
(`src/components/desktop/desktop-empty.tsx:19-59`; `src/components/desktop/desktop-empty.tsx:146-162`).

### Vesica Piscis

- **Uso:** dos dominios que se solapan: humano/IA, local/nube, estado anterior/nuevo.
- **Composición:** la zona común contiene la relación o acción compartida; no se usa como marco ornamental.
- **Implementación existente:** etapa II del Génesis, topología `V=2, E=1`, elegida por energía; aún no hay un drawer visual independiente (`src/lib/audiomorphic/harmonic-math.ts:15-24`; `src/lib/audiomorphic/harmonic-math.ts:106-115`).

### Semilla y Flor de la Vida

- **Uso:** estados vacíos, fondos y crecimiento de un núcleo a una red; nunca detrás de texto sin velo.
- **Semilla existente:** siete círculos, centro + seis pétalos, en el escritorio vacío (`src/components/desktop/desktop-empty.tsx:19-59`).
- **Flor existente:** `drawSeedOfLife` dibuja centro, anillo hexagonal y anillo exterior; se despacha como `flowerOfLife` (`src/lib/audiomorphic/renderer.ts:41-74`; `src/lib/audiomorphic/renderer.ts:183-196`).
- **Flor 3D existente:** 19 anillos compartiendo geometría en el espacio inmersivo (`src/components/dashboard/apps/immersive/immersive-space.tsx:79-115`).

### Metatrón y sólidos platónicos

- **Uso:** redes de dependencias, escenas 3D, topologías y sistemas complejos; no para una tarjeta corriente.
- **Metatrón existente:** centro, hexágonos interior/exterior, conexiones completas y nodos circulares (`src/lib/audiomorphic/geometry-drawers.ts:19-64`).
- **Sólidos existentes:** proyección de icosaedro con hexágono, triángulo y conexiones (`src/lib/audiomorphic/geometry-drawers.ts:109-161`).
- **Volumen alterno existente:** Merkaba, dos tetraedros intersectados, para dualidad en escena (`src/lib/audiomorphic/geometry-drawers.ts:66-107`).

### Espiral áurea

- **Uso:** ordenar el recorrido del ojo hacia un único foco; el extremo cerrado coincide con la acción o dato principal.
- **Implementación existente:** espiral logarítmica con `1.6180339`, ocho medias vueltas y respuesta a volumen (`src/lib/audiomorphic/renderer.ts:156-180`).
- **Límite:** no curvar texto ni navegación para imitarla; guía la masa, el contraste y el vacío.

### Otras formas ya disponibles

- Sri Yantra: nueve triángulos, bindu y círculos de loto (`src/lib/audiomorphic/geometry-drawers.ts:163-213`).
- Equilibrio vectorial/cuboctaedro: dos hexágonos y doce vértices (`src/lib/audiomorphic/geometry-drawers.ts:254-320`).
- Árbol de la Vida: diez nodos y 22 caminos (`src/lib/audiomorphic/geometry-drawers.ts:322-370`).
- Mandalas, fractal, chakras, Om, loto y Dharma Chakra: drawers reutilizables (`src/lib/audiomorphic/geometry-drawers.ts:418-791`).
- Toroide, nube cuántica y el catálogo completo de 20 modos: renderer central (`src/lib/audiomorphic/renderer.ts:76-154`; `src/lib/audiomorphic/renderer.ts:183-210`).

## Reglas de aplicación

1. Declarar el propósito de la pantalla y elegir una sola identidad antes de escoger una forma.
2. Elegir un foco visual; el resto de la geometría conduce a él o se elimina.
3. Usar tokens para color, radio, espacio y tipografía; ningún hex nuevo si existe token.
4. Mantener geometría en `aria-hidden` y sin eventos cuando no comunica datos.
5. Preservar contraste 4.5:1, foco visible, dianas de 44 px y alternativa sin movimiento (`design-system/starseed-system/DESIGN_RULES.md:53-67`; `design-system/starseed-system/DESIGN_RULES.md:91-96`).
6. Animar `transform` y `opacity`; detener rotaciones, pulsos y paralaje con `prefers-reduced-motion` (`src/components/mando/mando-cristal.css:8-19`; `src/components/mando/mando-cristal.css:158-172`).
7. La geometría no justifica WebGL: Canvas/SVG/CSS bastan salvo una escena espacial que ya requiera 3D.

## Matriz de comprobación

- **Tamaños:** 280; 360×780; 430×932; 768×1024; 1024×1366; 1280×800; 1920×1080; 3840×2160.
- **Entrada:** táctil y puntero; la forma nunca reduce el área activa.
- **Sistemas:** iOS, Android, macOS, Windows y Linux; comprobar safe areas, teclado virtual, scroll y fallback tipográfico.
- **Estados:** claro/oscuro, texto largo, loading/vacío/error, alto contraste y movimiento reducido.
- **Puerta:** sin overflow horizontal, sin texto cortado, contraste ≥ 4.5:1, dianas ≥ 44 px y cero errores de consola (`architecture/director-diseno.md:80-87`; `architecture/director-diseno.md:94-108`).
