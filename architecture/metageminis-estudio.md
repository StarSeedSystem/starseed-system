# Estudio MetaGeminis · contenido audiovisual para publicidad (contrato definitivo · 2026-10-10)

> **Por qué existe.** Alex lo pidió así (2026-10-10): «contenido audiovisual de todo tipo para publicidad
> atractiva y llamativa, innovando estilos — imágenes, vídeos, animaciones, anuncios, con animaciones 3D y
> representaciones visuales de todo tipo, para cada medio y formato, compartible y publicable en múltiples
> medios». El Estudio es la rama `estudio` de MetaGeminis (`architecture/metageminis.md` §3): convierte un
> **brief** de campaña en **piezas** y las deja **«Para aprobar»**. **Nada se publica sin la palabra de Alex.**
>
> **Qué NO es.** No es un generador mágico ni una promesa de viralidad. Es un **motor de render propio,
> gratuito y repetible** (§3) más un **banco de estilos** (§4) y una **revisión automática** (§6). Hace bien
> imagen, cartel, carrusel, banner, vídeo y animación **hechos por código**, con audio **sintetizado**; no
> hace vídeo fotorrealista generativo (§8). Toda métrica es **medida o «no medido»**, nunca estimada.

## 0. Estado real (verificado el 2026-10-10)

| Qué | Estado | Dónde |
|---|---|---|
| Catálogo de formatos verificado (51 formatos, 31 fuentes con fecha) | **Hecho y probado** (43 pruebas vitest) | `src/lib/metageminis/estudio/formatos.ts` → `scripts/sociales/estudio/formatos.json` |
| Motor de render propio (Three.js + Chromium + ffmpeg) | **Hecho y probado** (24 pruebas `unittest` sin GPU + renders reales) | `scripts/sociales/estudio/` |
| Cuatro escenas 3D | **Hechas** (Semilla estelar, Malla viva, Cristal líquido, Espiral Omnifrecuencias) | `scripts/sociales/estudio/escenas/` |
| Primera campaña «Siembra StarSeed» | **Renderizada** (cifras reales en §13) | `scripts/sociales/estudio/campanas/siembra-starseed.json` |
| Galería, manifiesto y tabla de piezas | **Hechos**: cada archivo con `sha256`, formato, duración, peso y medio | `<salida>/galeria.html`, `manifiesto.json` |
| Inserción de piezas en `metageminis_piezas` | **Pendiente**: la migración `20261011090000_metageminis.sql` sigue **sin aplicar**; el manifiesto ya trae cada fila lista (`tabla`) | §12 |
| Revisión automática completa (§6) | **Parcial**: contraste, zona segura, destellos, tamaño, peso, +faststart, sonoridad y QR están en código; subtítulos, voz y Jev están en la cola | §6, §12 |
| Servicio de render en Oracle A1 | **Pendiente** (tarea `EST-A1`); el A1 sigue ocioso | §11 |
| Generadores externos (Higgsfield, Canva, Figma, Seedance…) | **No usados** en esta tarea, por regla (§8) | §8 |

## 1. Qué produce: los seis tipos de pieza

La columna `metageminis_piezas.tipo` admite exactamente estos valores (los comprueba la base de datos). El
Estudio los usa tal cual: no inventa tipos.

| `tipo` | Qué es | Formato de la pieza (`AxB` o `AxB@duración`) | Medios típicos |
|---|---|---|---|
| `imagen` | Imagen fija con mensaje | `1080x1080` · `1080x1350` · `1200x630` · `1280x720` | Bluesky, Mastodon, Telegram, X, LinkedIn, Pinterest, web |
| `video` | Vídeo corto o explicativo | `1080x1920@15s` · `1920x1080@24s` | Reels, TikTok, Shorts, YouTube, LinkedIn |
| `animacion3d` | Escena 3D renderizada (Three.js) a vídeo | `1080x1080@10s` · `1280x720@12s` | Feed, X, Bluesky, Mastodon |
| `anuncio` | Banner con llamada a la acción (PNG y GIF animado ligero) | `300x250` · `728x90` · `320x50` · `300x600` · `160x600` · `970x250` | Redes de display, web |
| `cartel` | Cartel imprimible: PNG A3 a 300 ppp y PDF A3 con el texto en vector (fuentes incrustadas) sobre un fondo 3D a 120 ppp | `3508x4961` | Calle, centros sociales |
| `carrusel` | 3–10 láminas encadenadas (una fila por lámina) | `1080x1350` por lámina (+ PDF de documento para LinkedIn) | Instagram, LinkedIn |

El **medio** de cada fila sale del catálogo (`instagram`, `tiktok`, `youtube`, `x_twitter`, `linkedin`,
`bluesky`, `mastodon`, `telegram`, `facebook`, `pinterest`, `reddit`, `threads`, `discord`, `whatsapp`, `web`,
`correo`, `banner_iab`, `cartel_impreso`…) y cumple `^[a-z0-9_]{2,40}$`.

## 2. El catálogo de formatos (verificado, con fecha y con sus dudas)

**Única fuente de verdad:** `src/lib/metageminis/estudio/formatos.ts`. `node scripts/sociales/estudio/exportar_formatos.mjs`
genera `formatos.json` (lo lee el motor en Python) y `--check` falla si están desfasados (lo comprueba una
prueba). Cada formato lleva: tamaño y relación, duración mínima/recomendada/máxima, peso máximo por tipo, códec y
contenedores, **márgenes seguros** (la interfaz de la plataforma tapa partes del lienzo), zonas a evitar, y la
lista de **fuentes** (31, con URL, fecha de consulta, fecha de la fuente y confianza `oficial`/`secundaria`/
`calculo`/`repositorio`).

Reglas del catálogo:

1. **Cuando las fuentes discrepan, se dice y se elige lo conservador** (`conflictos` por formato, p. ej. el
   margen inferior de Reels: 672 px según los porcentajes de Meta frente a 340 px de otra guía; se usa 672).
2. **Una cifra sin fuente no entra.** Los márgenes que son criterio del estudio lo declaran
   (`margenesOrigen: "criterio-estudio"`).
3. **Los límites de las plataformas cambian.** Corrección hecha hoy al contrastar con búsquedas nuevas:
   Instagram Reels admite hasta **20 min** (SocialCal, 2026-03-30, modificado 2026-10-09); el catálogo decía 90 s
   (una guía anterior). La **recomendación creativa** (12–20 s) no depende del límite técnico. X: la ayuda de
   cuentas gratuitas da 140 s y 512 MB, la documentación para desarrolladores lista 20 min y 8 GB; se usa lo menor.
   YouTube Shorts: 3 min desde octubre de 2024 (confirmado).
4. **Antes de publicar una campaña nueva, se vuelven a leer los límites de sus medios** (la fuente puede haber
   cambiado). La tarea `EST-FORMATOS-REVISION` lo repite cada trimestre.

Pruebas: `npx vitest run src/lib/metageminis/estudio` (43) y `python3 -m unittest -v test_estudio` dentro de
`scripts/sociales/estudio/` (incluye la coherencia JSON↔TS).

## 3. El motor propio, y por qué es propio

**Por qué propio:** (a) **gratis**: no gasta créditos de nadie ni cuota diaria de un modelo; (b) **soberano**:
corre en cualquier medio con Chromium, ffmpeg y Python (la Mac, el contenedor, Oracle A1) sin depender de una
cuenta ni de un proveedor que cambie sus normas; (c) **repetible y verificable**: el estado de TODO fotograma es
función pura de `t` y de una semilla, así que dos renders dan los mismos píxeles y un cambio de texto no obliga
a rehacer nada a mano; (d) **honesto**: el texto es texto real de la campaña (pasa por el filtro de verdad),
no píxeles inventados por un modelo; (e) coincide con el método RISE del OS (`architecture/director-diseno.md`
§10: `render(t)` pura con semilla). El motor expone `window.__render(t)`, el mismo gancho que usaría el medidor
de movimiento de RISE.

```
campanas/<id>.json ─▶ nucleo.py (valida, filtro de verdad, plan: un MAESTRO por proporción + derivados)
        │
        ▼
 servidor.py (127.0.0.1, solo carpetas permitidas) ─▶ Chromium headless (WebGL por SwiftShader, sin GPU)
        │                                              motor.js: reloj determinista (t = i / fps, sin rAF)
        │                                              escenas/*.js (Three.js) + post.js (bloom propio, ACES, grano)
        │                                              layouts.js (tipografía cinética, zonas seguras, RISE)
        ▼
 captura.py (CDP, un fotograma a la vez) ─▶ codificar.py (ffmpeg: H.264 yuv420p +faststart; WebM VP9; GIF/APNG; PDF)
        │                                         audio.py (aevalsrc propio: drones, pulsos, campana; −14 LUFS aprox.)
        ▼
 verificar.py (contraste AA, zona segura, destellos, tamaño, peso, sonoridad, QR) ─▶ manifiesto.py ─▶ galeria.py
```

**Un solo comando** (`scripts/sociales/estudio/estudio.py`):

```bash
python3 scripts/sociales/estudio/estudio.py render --campana siembra-starseed --pieza reel --formato instagram-reels [--borrador]
python3 scripts/sociales/estudio/estudio.py lote   --campana siembra-starseed          # todos los formatos, reanuda lo ya hecho
python3 scripts/sociales/estudio/estudio.py listar|validar|vista|verificar|galeria --campana siembra-starseed
```

`--borrador` renderiza 3D a baja resolución y a mitad de tamaño, sin manifiesto: sirve para iterar en segundos.
`vista --tiempos 1,5,9` saca fotogramas sueltos (JPG) para mirarlos antes de gastar un render. La salida por
defecto es `/mnt/user-data/outputs/metageminis/<campaña>/` con una subcarpeta por medio.

**Decisiones de ingeniería que conviene no deshacer** (cada una nació de un fallo real de hoy):

- **Un maestro por proporción.** Reels, TikTok y Shorts comparten un único render 1080×1920; los otros formatos
  de la misma proporción se derivan escalando. Los **márgenes del maestro son la unión de los más estrictos** de
  todo el grupo, así el archivo cumple en todos los medios a la vez. Los formatos «compatibles» (mismo tamaño,
  p. ej. Stories o WhatsApp) solo añaden una fila al manifiesto: el archivo no se duplica.
- **Un solo Chromium a la vez** y cede el turno mientras haya `next build` o `vitest` en el contenedor
  (`captura.esperar_carga_pesada`: espera hasta 20 min, con aviso).
- **Formatos de más de 10 megapíxeles (cartel A3, 3508×4961) se maquetan a la mitad** (1754×2481 px CSS) y se
  capturan con `clip.scale = 2`; el PDF sale con el texto vectorial y el fondo 3D a 120 ppp (medido con `pdfimages`); el PNG sí es de 300 ppp completos. A tamaño completo el Chromium con WebGL de
  SwiftShader se cae al abrir el lienzo; medido hoy.
- **Temporales y perfil de Chromium en RAM** (`ESTUDIO_TMP=/dev/shm/estudio`, `TMPDIR=/dev/shm/tmp`): el disco
  raíz del contenedor tenía 146 MB libres y los maestros de vídeo pesan cientos de MB.
- **El velo de legibilidad es un degradado con `smoothstep`**: un degradado lineal con un codo se ve como una
  «línea de horizonte» sobre la escena (se vio en seis piezas y se corrigió).
- **El fogonazo de la germinación es local, no de pantalla completa.** La onda de choque era un plano de tamaño
  fijo que con la cámara cerca bañaba todo el fotograma en gris; ahora su tamaño es proporcional a la escena.
- **Audio**: sintetizado por el propio estudio (cama de drones con frecuencias de Omnifrecuencias, pulsos con
  envolvente, campana a 528 Hz), mezcla estéreo con reverberación propia, **normalizada a −14 LUFS** (±1,5 se
  verifica) con pico ≤ −1 dBTP y fundidos de entrada y salida. Nada de música ni muestras de terceros.
- **Tipografías**: solo las que el OS ya sirve (Rajdhani, Inter, JetBrains Mono), licencia SIL OFL, vendidas en
  `scripts/sociales/estudio/fuentes/` con su `LICENCIAS.md`. Los logos salen de `public/logo.png` y
  `public/starseed-symbol.png`, nunca redibujados.
- **El servidor estático local solo sirve cuatro carpetas** (plantilla, escenas, fuentes, `three` de `node_modules`)
  y dos imágenes de marca; no hay forma de leer otro archivo del repositorio a través de él (hay una prueba).

**Coste medido** (contenedor de 2 CPU, sin GPU, calidad final): ≈ 1,3 s por fotograma de 1080×1920 y ≈ 4–7 s por
fotograma 3D de un estático grande; un banner IAB, 1–2 s; el cartel A3 a tamaño completo, ≈ 80 s. Lo que no se ha
medido (el A1, la Mac) se dice en §11.

## 4. Estilos: lo que hay y cómo se innova con método

Cuatro escenas 3D propias, coherentes con el ADN de StarSeed OS (Trinity sobre negro azulado, cristal líquido,
biomimética). Todas son `crear(ctx) → { escena, camara, post, actualizar(t) }` con semilla: mismo número, mismo
mundo.

| `id` de escena | Gesto | Dónde brilla | Detalles técnicos |
|---|---|---|---|
| `semilla-estelar` | Una semilla de luz late, germina (onda de choque) y crece en una red de neuronas con las cuatro ramas Trinity; la cámara se aleja y gira | Reels, anuncios verticales, láminas «Todo comienza» y «Siembra con nosotros» | Ramificación con ángulos ≈ 40° y razón de longitudes 0,58 (biomimético), raíces simétricas, cintas con cabeza luminosa, pulsos que viajan al ritmo del audio |
| `malla-viva` | Nodos que se enlazan sin internet; ondas de antena entre grupos de colores | YouTube 16:9, lámina «Tecnología en común» | Enlaces con arco, anillos de alcance, fondo estelar y nebulosas |
| `cristal-liquido` | Vidrio refractivo con los cuatro colores Trinity, orbitado por un anillo | Feed 1:1, láminas de presentación | Fresnel, ruido de vidrio, aberración cromática sutil |
| `espiral-omnifrecuencias` | Espiral audiomórfica de puntos que late con el audio sintetizado | Feed 4:5, banners horizontales | Disposición en espiral áurea, color por frecuencia |

Comunes: bloom en tres niveles hecho a mano (sin addons), tonemapping ACES, viñeta, grano determinista por número
de fotograma, tipografía cinética con jerarquía (kicker → titular con una palabra de acento en color Trinity →
sub → CTA), **transiciones RISE** (cada texto entra y sale con un solo gesto: desenfoque + desplazamiento corto
con `easeOutCubic`, y la escena nunca se queda quieta).

### 4.1 Innovar con método (reglas)

1. **Cada pieza lleva una sola identidad de las seis del OS** (`architecture/director-diseno.md` §9: OS/Nexus,
   Genesis, Astraura, Café, Audiomorphic, Materia Viva). Esta campaña usa la de StarSeed OS.
2. **Cada campaña prueba al menos tres estilos** con el mismo mensaje; así se compara el estilo y no el mensaje.
   «Siembra StarSeed» usa las cuatro escenas con el mismo texto central.
3. **Un estilo nuevo entra al banco** solo si Alex aprueba la pieza y las métricas **reales** (§10) no la dejan
   por debajo de la media de su campaña.
4. **Prohibidos:** personas reales sin permiso, voces clonadas, logos o marcas ajenas, música con derechos,
   destellos peligrosos (> 3 por segundo, WCAG 2.3.1), imitar el aspecto de una institución, y cualquier efecto
   que oculte que el texto es de un agente de IA.

Banco de estilos pendientes (cada uno, una tarea del enjambre en §12): `geometria-sagrada-cinetica` (bucle perfecto),
`isometrico-3d` (Semilla → Fruto → Cosecha), `pizarra-trazo` (dibujo que se hace delante del espectador),
`collage-recortado` (voluntariado, carteles), `datos-vivos` (un dato REAL con su fuente a la vista),
`cartel-propaganda-sereno` (calle y centros sociales), `audio-reactivo` (eventos).

## 5. Reglas de contenido (lo que el filtro y las personas vigilan)

- **Cero ilusiones.** Ninguna cifra, testimonio, logro, premio ni promesa inventada. `nucleo.mentiras_en` rechaza
  antes de renderizar: porcentajes, importes, «N usuarios/miembros», «miles de…», promesas («garantizado»,
  «rentabilidad»), logros («ya somos…», «premiado»), testimonios, superlativos y afirmaciones de salud. Está probado.
  Lo que está en marcha se dice **«en construcción»**; los principios de diseño se dicen **«se diseña como…»**
  o **«principio de diseño: …»**, no como hechos ya logrados.
- **Hechos que usa la campaña y de dónde salen:** código abierto bajo AGPL-3.0 (`LICENSE`, `package.json`),
  OS funcionando en `starseed-os.vercel.app` (CLAUDE.md §1), malla P2P y IA local 1,58 bits **en construcción**
  (CLAUDE.md §11, `architecture/astraura-158-sistema-primario.md`), estaciones de Omnifrecuencias **en
  construcción**, tríada y fases Semilla/Fruto/Cosecha (CLAUDE.md §3–§5).
- **Hechos a confirmar por Alex antes de publicar** (el Estudio no puede comprobarlos desde un contenedor): que el
  repositorio `StarSeedSystem/starseed-system` sea **público** y acepte *issues* y *pull requests* (la lámina 4
  dice «el repositorio es abierto: issues y pull requests»); que `starseed-os.vercel.app` siga siendo la dirección
  oficial; que el voluntariado tenga a quién escribir (hoy el CTA lleva a la web, no a un formulario).
- **Donaciones.** Mientras no exista un enlace de Stripe **confirmado por un dueño** (`metageminis_enlaces_pago.activo`),
  toda pieza dice **«Donaciones: enlace próximamente»** y el QR lleva a `https://starseed-os.vercel.app`. Cuando el
  enlace exista, se renderiza una variante con su QR; nunca se imprime un enlace de pago sin confirmar.
- **Originalidad y licencias.** Todo es original: escenas, audio, composición. Tipografías OFL. Ninguna marca,
  logo, personaje ni música de terceros. El QR se genera con el paquete `qrcode` del repositorio y se **decodifica
  de vuelta** para comprobar que lleva la dirección esperada.
- **Idioma y tono.** Español primero y versión en inglés de cada pieza clave (reel, YouTube, feed, carrusel,
  imágenes, banners y cartel). Tono pro-comunitario, activista, esperanzador, con respeto, empatía y compasión;
  nada de miedo, culpa ni manipulación.
- **Aviso de agente de IA.** El texto que acompaña cada pieza (`textos_acompanantes` de la campaña) dice que lo
  preparó «MetaGeminis, agente de IA de StarSeed» y que Alex lo aprobó antes de publicarse.
- **Accesibilidad.** Contraste mínimo WCAG AA medido sobre el fondo REAL (fotograma con el texto oculto, percentil
  95 de luminancia bajo cada línea); tamaños de texto pensados para móvil; los GIF y vídeos no superan 3 destellos
  por segundo; los textos largos tienen versión estática. Faltan los subtítulos (`EST-SUBTITULOS`).

## 6. Revisión automática antes de «Para aprobar»

| Control | Cómo se comprueba | Estado |
|---|---|---|
| Formato válido y coincide con lo declarado | `fila_valida()` (regex de la tabla) y lectura de la cabecera real (ffprobe / Pillow) | **Hecho** |
| Duración y fps dentro del catálogo | `nucleo.validar_campana` + ffprobe | **Hecho** |
| Peso: vídeo ≤ 15 MB y ≤ tope del medio; imagen ≤ tope del formato | `codificar.derivar_mp4` ajusta el CRF hasta caber; se verifica | **Hecho** |
| Códec H.264 `yuv420p` y `+faststart` | ffprobe y lectura del átomo `moov` | **Hecho** |
| Huella | `sha256` de cada archivo en el manifiesto | **Hecho** |
| Contraste AA | `verificar.medir_contraste` sobre fotogramas clave sin texto | **Hecho** |
| Zona segura / interfaz de la plataforma | `verificar.comprobar_zona_segura` con los márgenes del catálogo | **Hecho** |
| Destellos ≤ 3 por segundo (WCAG 2.3.1) | luminancia por fotograma (signalstats) y recuento con histéresis | **Hecho** |
| Sonoridad −14 LUFS ±1,5, pico ≤ −1 dBTP | `ebur128` de ffmpeg | **Hecho** |
| QR decodifica a la dirección esperada | OpenCV `QRCodeDetector` | **Hecho** |
| Verdad (sin cifras ni promesas) | `nucleo.mentiras_en` sobre todo texto visible o publicado | **Hecho** (red de seguridad, no sustituye a una persona) |
| Revisión visual de fotogramas clave | quien renderiza mira los PNG/JPG (lo hizo el autor, hoy); Alex mira la galería | **Manual** |
| Subtítulos y descripción alternativa | `.vtt` y texto alternativo por pieza | **Pendiente** (`EST-SUBTITULOS`) |
| Puntuación de Jev | `decidir.py puntuar` (§7) | **Pendiente** de cablear (`EST-REVISION`) |
| Contenido sintético declarado | etiqueta en el texto acompañante y casilla de cada plataforma al publicar | **Manual** al publicar |

Lo que no pasa la lista **no se encola**: vuelve al borrador con el motivo.

## 7. Flujo completo: del brief a la métrica

```
brief ─▶ guion ─▶ borrador ─▶ revisión visual ─▶ render final ─▶ Jev (puntuar) ─▶ «Para aprobar» ─▶ Alex ─▶ publicar ─▶ medir ─▶ lección
```

1. **Brief** (lo escribe la rama `campanas` o Alex): `metageminis_campanas.brief`. Campos: `mensaje`, `objetivo`
   (`visitas | voluntarios | donaciones | alianzas | difusion`), `publico`, `fase` (`semilla | fruto | cosecha`),
   `tono`, `estilos`, `medios`, `formatos`, `llamada_a_la_accion`, `identidad`, `accesibilidad`, `idioma`, `no_hacer`.
   Ningún campo puede llevar claves ni datos personales.
2. **Guion**: `campanas/<id>.json` — `marca`, `paleta`, `reglas`, `guiones` (beats con `t`, `d`, `titular`,
   `acento`, `lista`, `cta`, `aviso`…, en `es` y `en`), `piezas` (tipo, formatos, escena, audio, laminas) y
   `textos_acompanantes`. `estudio.py validar` lo cruza con el catálogo y el filtro de verdad.
3. **Borrador**: `estudio.py render --borrador` y `vista --tiempos …` (segundos, sin manifiesto).
4. **Revisión visual** (obligatoria): se miran los fotogramas clave de cada pieza —legibilidad, zonas seguras,
   contraste, que nada se corte, que el texto no tenga faltas— y se corrige el guion o la escena **antes** de
   gastar el render final. Hoy ese paso encontró y corrigió: el fogonazo gris de la germinación, la banda
   horizontal del velo, el cartel A3 que tumbaba el navegador y dos frases que presentaban principios de diseño
   como hechos.
5. **Render final**: `estudio.py lote`. Reanuda lo ya hecho, un Chromium a la vez, espera a `next build`/`vitest`.
6. **Jev** (`scripts/puente/decidir.py puntuar`): consejero con umbral, **nunca oráculo**. Pregunta por pieza:
   `python3 scripts/puente/decidir.py puntuar --estado @<fila-del-manifiesto.json> --pregunta "¿Cumple la pieza verdad, legibilidad y tono?" --niveles bajo,medio,alto --regla medio --quien estudio`.
   La regla de respaldo es **«medio»**; Jev solo **frena** (nivel «bajo» con p ≥ 0,8 devuelve la pieza a revisión),
   jamás convierte un «no» en «sí» ni aprueba. Cada decisión deja su experiencia (`decidir.py confirmar`).
7. **«Para aprobar»**: se insertan las filas `tabla` del manifiesto en `metageminis_piezas` con `estado =
   'para_aprobar'` (la base **rechaza** cualquier otro estado al insertar). Alex las ve en MetaGenesis y las
   **aprueba o descarta** con un toque; la pieza aprobada **no se puede cambiar** (archivo, huella, formato,
   medio y tipo quedan congelados). Una pieza descartada guarda el motivo y el estudio aprende de él.
8. **Publicar** (§9) y **medir** (§10).

## 8. Generadores externos: solo como complemento, y nunca con créditos sin permiso

El motor propio cubre todo lo que necesita esta campaña. Hay cosas que un generador externo haría mejor
(vídeo fotorrealista, personajes, doblaje, maquetación asistida); se anotan aquí para no inventar capacidades:

| Servicio (conectado a la sesión de Claude de Alex) | Para qué serviría | Límite de uso |
|---|---|---|
| **Higgsfield** (`generate_video`, `ads_studio`, `generate_image`, `generate_audio`) | Vídeo y anuncios generativos | Pide créditos; cada herramienta de generación tiene su cotización (`ads_studio_quote`, `models_explore`) |
| **Canva** (`generate-design`, `export-design`) | Maquetación asistida y plantillas de marca | Edita diseños reales de Alex; exportar no cuesta, generar puede |
| **Figma** (`use_figma`, `generate_image`, `export_video`) | Pasar un diseño del estudio a un archivo editable | Escribe en archivos de Alex |
| **Seedance y similares** | Vídeo generativo | De pago |

**Regla permanente (CLAUDE.md, «Economía de créditos»):** **NUNCA se gastan créditos de pago sin la palabra de
Alex.** Si una pieza justificaría un generador externo, el Estudio **no lo lanza**: deja una **cotización en la
cola «Para aprobar»** con: proveedor, qué se generaría, **créditos estimados con la fuente de la cifra** (la
herramienta de cotización del proveedor, no una suposición) y la fecha. Sin cotización real no se encola. En
esta tarea **no se usó ninguno**: ni se llamó a sus herramientas, ni se consumió un solo crédito. Una pieza hecha
con un generador lleva `generado_con` en su ficha y la etiqueta de contenido sintético.

## 9. Aprobar y publicar

**Nada se publica desde el Estudio.** Después de «aprobado»:

- **API oficial con aviso de IA** (la subida puede ejecutarla un agente **solo si `estado = 'aprobado'`**; cada
  conector se niega si no): Bluesky (`app.bsky.feed.post`, cuenta con etiqueta de bot y contraseña de aplicación),
  Telegram (Bot API; archivos hasta 50 MB), YouTube (`videos.insert`, **privado o no listado** hasta la
  aprobación), GitHub.
- **Lo publica una persona** (las reglas del medio prohíben o desaconsejan la automatización): Instagram, TikTok,
  X, Facebook, Pinterest, Reddit, LinkedIn, Mastodon según servidor, PeerTube. El panel marca la pieza «aprobada,
  a publicar a mano» y Alex la marca «publicada» (`metageminis_marcar_hecho`).
- Cada enlace lleva `utm_source=<medio>&utm_campaign=<campaña>&utm_content=<estilo>` (`EST-UTM`).
- El directorio de sitios y sus reglas están en `architecture/metageminis.md` §9; la infraestructura de
  publicación del OS, en `architecture/director-produccion.md`.

## 10. Medir y aprender (solo datos reales)

- `metageminis_piezas.metricas` guarda **lo que el medio entrega de verdad** (visualizaciones, clics, respuestas,
  guardados). Lo que no se mide no se escribe; el panel dice «no medido».
- Seguimiento compara estilos **dentro de la misma campaña** (mismo mensaje) y escribe una lección corta como
  hallazgo de tipo `aviso` («el estilo X aguantó mejor en 9:16; el Y en cartel»). Una diferencia con menos de diez
  impresiones por variante se anota «sin conclusión». La lección alimenta el siguiente brief y el banco de estilos.
- Las donaciones se atribuyen por la etiqueta del enlace de pago y se cuentan **solo** cuando Stripe las confirma
  (`architecture/metageminis.md` §8).

## 11. Dónde corre: enjambre gratuito, Mac y Oracle A1

| Medio | Qué hace del Estudio | Estado |
|---|---|---|
| Enjambre gratuito (modelos con cupo) | Escribe guiones y textos (rama `campanas`) y escenas nuevas por tareas pequeñas (≤ 3 archivos, ≤ 120 líneas) | Las tareas están en §12 |
| Contenedor de la nube (esta sesión) | Renderiza: 2 CPU, 7 GB, sin GPU; es donde se hizo «Siembra StarSeed» | **Medido** (§13) |
| La Mac de Alex | Mira la galería, aprueba, publica a mano; recibe la carpeta con `device_commit_files` | Entregado |
| **Oracle A1** (`starseed-a1`, 2 OCPU, 12 GB, aarch64) | Servicio de render permanente que consume la cola de campañas | **Pendiente**; **no medido en el A1** |

**El A1 necesita carga real antes del 2026-10-14 a las 23:00 UTC.** Oracle puede reclamar la máquina si durante
7 días la CPU (p95), la red y la memoria están **a la vez** por debajo del 20 % (`architecture/oracle-consumo.md`);
hoy están en 0,5 % de CPU y 5,3 % de memoria. El render de campañas es una carga **real y útil** para él, pero
hay que decirlo sin adornos:

- Una campaña completa son **≈ 80 min** de CPU a plena carga en el contenedor (3.640 fotogramas de vídeo). Para
  mover el **p95** de CPU por encima del 20 % haría falta que el render ocupara **más del 5 % del tiempo**
  (≈ 8,4 h por semana): una campaña suelta no basta; una **cola permanente de variantes por estilo** (§4.1 pide
  tres estilos por campaña) sí puede, con trabajo que se usa.
- La **memoria** es lo más sencillo de mantener alta: un Chromium con WebGL de SwiftShader ocupa del orden de
  1,5–2,5 GB mientras renderiza (medido en el contenedor, ver §13) frente al umbral de 2,4 GB (20 % de 12). Pero
  solo cuenta si es **sostenido**: lo garantizan los servicios del compose (BitNet, Postgres…), no el render.
- **Compatibilidad aarch64:** Playwright publica Chromium para Linux arm64, ffmpeg y Pillow están en apt/pip y
  `three` es JavaScript puro; **no está probado en el A1** (`EST-A1` empieza por ejecutar
  `estudio.py render --borrador` allí y apuntar los segundos por fotograma reales).
- El servicio respeta al gobernador: **1 agente permanente** y un Chromium a la vez; el render cede el turno si
  hay otra carga pesada. Los temporales van a `/dev/shm`.

## 12. Qué falta y cómo se reparte (tareas del enjambre, ≤ 3 archivos y ≤ 120 líneas por archivo)

| Id | Qué | Archivos |
|---|---|---|
| `EST-SUBTITULOS` | `.vtt`/`.srt` desde los beats y versión con subtítulos quemados (ffmpeg) | `subtitulos.py`, `test_subtitulos.py` |
| `EST-REVISION` | `revisar.py`: lee el manifiesto, repite los controles de §6, llama a Jev y escribe `revision.json` y el SQL de inserción | `revisar.py`, `test_revisar.py` |
| `EST-INSERTAR` | Inserta las filas `tabla` del manifiesto en `metageminis_piezas` cuando la migración esté aplicada | `insertar_piezas.py`, `test_insertar.py` |
| `EST-VOZ` | Voz en off con el TTS propio del OS (en la Mac o el A1), mezclada bajo el dron a −14 LUFS | `voz.py`, `test_voz.py` |
| `EST-ESTILO-GEOMETRIA` | Escena `geometria-sagrada-cinetica` con bucle perfecto | `escenas/geometria-cinetica.js` |
| `EST-ESTILO-ISOMETRICO` | Escena `isometrico-3d` Semilla → Fruto → Cosecha | `escenas/isometrico-fases.js` |
| `EST-A1` | Servicio de render en Oracle A1: Dockerfile, servicio en `compose-a1.yml` y consumidor de cola | `deploy/oracle/estudio.Dockerfile`, `scripts/sociales/estudio/servicio.py`, `test_servicio.py` |
| `EST-UTM` | Enlaces con `utm_*` por medio y estilo, y verificación | `utm.py`, `test_utm.py` |
| `EST-CAMPANA-2` | Segunda campaña (candidata con fecha: Hacktoberfest, hasta 2026-10-31) con su guion y filtro de verdad | `campanas/generar_hacktoberfest.py` |
| `EST-FORMATOS-REVISION` | Re-verificación trimestral del catálogo con fecha y diferencias | `revisar_formatos.py`, `test_revisar_formatos.py` |

Los textos completos de cada tarea (prompt autosuficiente) se entregaron al orquestador en el informe de esta ola.

## 13. Resultado verificado de la primera campaña

_(Se completa con las cifras reales del lote al terminarlo; ver el manifiesto: `manifiesto.json` y `galeria.html`.)_

## 14. Cómo se cambia este contrato

Regla dorada del repositorio: **primero este documento, luego el código.** Un formato nuevo se añade en
`formatos.ts` (con fuente y fecha) y se regenera el JSON; una escena nueva, en `escenas/` con una pieza de la
campaña que la use y una revisión de fotogramas; un control nuevo, en `verificar.py` con su prueba. Al terminar,
una línea en `memory/state.md`.
