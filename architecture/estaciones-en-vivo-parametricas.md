# Estaciones EN VIVO paramétricas · Omnifrecuencias y Audiomorphic sincronizadas al milisegundo

> SOP de la ola del 2026-10-10. Contrato general: `architecture/genesis-niveles-malla-universal-estaciones.md` §C.
> Estaciones de siempre: `architecture/estaciones.md`. Transporte sin internet: `architecture/transporte-universal-sin-internet.md`.

## 0. Qué pidió Alex y qué hay

En las entonaciones de Omnifrecuencias, transmitir en directo en una estación **pública o privada** de
StarSeed OS vinculada a la misma sesión; al publicar se elige el enlace de una entonación y aparece en la
app (Entonaciones › Comunidad) y en **Transmisiones** del OS con el mismo enlace y los mismos datos en
tiempo real, lo más P2P posible, iniciable y sincronizable desde los dos medios con precisión de
milisegundos; el motor de Omnifrecuencias en segundo plano en todo el OS; y Audiomorphic con sesiones de
espirales como estaciones con su configuración completa.

Diseño fijado: **transmisión paramétrica, no de audio**. Viaja la entonación (parámetros) y una línea de
tiempo con instantes en un **reloj común**; cada medio genera el sonido en local con Web Audio programado
al instante exacto. Cabe en cualquier antena.

| Pieza | Archivo | Puro |
|---|---|---|
| Modelo, posición, transiciones, fase, saneado, enlaces | `src/lib/estaciones/transmision-parametrica.ts` | sí |
| Reloj común (NTP, deriva, sondeo) | `src/lib/estaciones/reloj-comun.ts` | sí |
| Llaves, firma, id autocertificado, cifrado de privadas | `src/lib/estaciones/cripto-estacion.ts` | sí (WebCrypto) |
| Sesión conectada (sobres, firmas, lotes, papeles) | `src/lib/estaciones/sesion-en-vivo.ts` | sí (canales inyectados) |
| Canales reales: Supabase Realtime + enlaces locales P2P | `src/lib/estaciones/canales-estacion.ts` | no |
| Motor de sonido programado + latencia de salida | `src/lib/estaciones/motor-estacion.ts` | tramos/mapeo sí |
| Estación global de la pestaña (suena en todo el OS) | `src/lib/estaciones/estacion-global.ts` | no |
| Crear y publicar una sesión | `src/lib/estaciones/crear-sesion.ts` | no |
| Llaves de mis sesiones (solo este aparato) | `src/lib/estaciones/llaves-locales.ts` | no |
| De dónde sale la entonación/espiral | `src/lib/estaciones/opciones-entonacion.ts` | no |
| Enlace «Nueva estación» ya rellena (widget, versión integrada) | `src/lib/estaciones/enlace-nueva-en-vivo.ts` | sí |
| Puente `postMessage` con la app oficial | `src/lib/estaciones/puente-omnifrecuencias.ts` | partes |
| Interfaz | `src/components/estaciones/en-vivo/*` (panel, minicontrol, montaje, formulario, textos) | — |
| Ruta | `src/app/(app)/estaciones/vivo/[sesion]/page.tsx` | — |
| Para el repo de Omnifrecuencias | `integraciones-de-codigo/omnifrecuencias/` (módulo, componente, INSTRUCCIONES.md) | — |

Pruebas: `src/lib/estaciones/__tests__/{reloj-comun,transmision-parametrica,sesion-en-vivo,motor-y-puente,integracion-omnifrecuencias}.test.ts`
y `src/components/estaciones/__tests__/{formato-en-vivo,panel-en-vivo,nueva-estacion-en-vivo}.test.*`.

## 1. Modelo

- **Ficha** (`FichaSesion`): `id` (huella de la llave pública), fuente (`omnifrecuencias|audiomorphic`),
  título, **enlace de la entonación** (https o ruta del OS), `pk`, `privada`, parámetros y `creada`.
  Omnifrecuencias: hasta 16 osciladores con la forma de la app (Hz, onda, volumen, posición 3D x/y/z,
  segunda onda y mezcla, pulsos isocrónicos, transición ida/vuelta). Audiomorphic: el diccionario plano de
  `VisualizerParams` (números, booleanos y textos cortos).
- **Línea de tiempo**: acciones `iniciar | pausar | reanudar | parametros | volumen | terminar` con su
  instante `t` en el reloj común y un número `n` (µs del instante + 3 cifras de azar: dos medios del mismo
  anfitrión no se pisan). Hasta 64; las viejas se resumen en una acción `base` (`compactarLinea`) que
  conserva la posición en cualquier instante posterior (probado con 90 acciones aleatorias).
- **Quien llega tarde** (`posicionEn(estado, t)`): fase, `ancla` (instante en que la reproducción valdría 0),
  posición acumulada con las pausas, parámetros y volumen vigentes, y la próxima acción. Nadie le pone al
  día: con la ficha y la línea calcula dónde va.
- **Fase**: `inicioEnFase(ancla, desde, f)` da el siguiente cruce por cero: un oscilador que entra tarde
  suena en la misma fase que los demás (con el error del reloj). Con transiciones de frecuencia la fase no
  es exacta (se dice).
- **Transiciones**: `valoresOscilador(o, s)` reproduce la ida y vuelta de la app (`vueltas` pasadas extra,
  `infinito`, al acabar se queda en el final; onda A→B con la mezcla). Determinista.
- **Fusión**: `fusionarEstados` une por `n` (idempotente); una `base` lo resume todo lo anterior.
- **Saneado** de todo lo que llega de fuera: límites de Hz (0,1–24 000), volumen, posiciones, 16
  osciladores, 64 acciones, 24 KB por estado, enlaces solo https o rutas `/…` (nunca `//`, `javascript:`).

## 2. Reloj común

NTP sobre el canal de la propia estación. `muestraNtp(t0,t1,t2,t3)`: desfase `((t1−t0)+(t2−t3))/2`,
retardo `(t3−t0)−(t2−t1)`. `estimarDesfase`:

- mediana de la mitad con menos retardo de los últimos 2 min (inmune a colas);
- con ≥ 4 rondas que abarcan ≥ 90 s, **deriva** por mínimos cuadrados pesados (1/retardo²) con la mejor
  muestra de cada ronda; el reloj la compensa al dar la hora. Probado: un reloj 50 ppm rápido sigue a
  < 1 ms 5 min después de la última medida en red local (sin compensar serían 15 ms).
- Se enseñan DOS números: **precisión** (dispersión medida) y **cota** (mitad del mayor retardo usado: el
  error máximo si ida y vuelta tardaran distinto). Probado que el error real cae dentro de la cota. Sin
  muestras: «Midiendo la hora común…», nunca un ± inventado.

Sondeo (`programarSondeo`): ráfaga de 8 preguntas cada 150 ms al empezar; luego rondas de 3 cada 30 s que se
doblan hasta 5 min. Las preguntas públicas salen en el mismo instante en que se anota t0 (sin promesas por
medio: una prueba destapó 5–10 ms de sesgo cuando salían tras un `await`). t1/t3 se anotan al recibir,
antes de verificar firmas o descifrar. Firmar la respuesta añade ≈ 0,05–0,2 ms al camino de vuelta (sesgo de
la mitad), por debajo de lo que se enseña.

**Una sola referencia**: el medio que creó la sesión (`registro.referencia`). Otros medios con control
(enlace de control) se sincronizan con ella y solo contestan la hora si no la oyen en 30 s (estrato 1). Los
oyentes prefieren el estrato más bajo.

Precisión que cabe esperar (lo honesto): por enlace local emparejado, ida y vuelta de pocos ms → ± menos de
1 ms. Por internet (Supabase Realtime) la ida y vuelta es de 40–150 ms: la precisión medida suele ser de
pocos ms, pero la **cota** es de decenas de ms y así se enseña.

**Latencia de salida**: el motor programa con `AudioContext.getOutputTimestamp()` (qué muestra suena en el
altavoz en qué instante de `performance.now()`), de modo que el sonido SALE en el instante común; si el
navegador no lo da, `currentTime − (outputLatency + baseLatency)`. El panel enseña cuánta latencia se
compensa y de dónde sale. Los auriculares Bluetooth pueden añadir más de lo que el navegador declara (se
dice).

## 3. Identidad, firma y estaciones privadas

- Al crear: par **ECDSA P-256**; `id = base64url(SHA-256(pk))[0..22]`. El enlace se **autocertifica**:
  `llaveCasaConId` comprueba que la llave de la ficha da su id; si no, la sesión se cierra.
- Solo quien tiene la llave privada firma `estado`, `accion` y `pong`. Lo no firmado o firmado con otra llave
  se descarta y se cuenta (`descartados`, visible en el panel). Los oyentes no pueden mandar a todos.
- **Privadas**: token de 128 bits. Tema del canal `estacion-p:` + SHA-256(`tema:id:token`) (solo lo calcula
  quien tiene el token) y todo cifrado con AES-GCM (clave = SHA-256(`cifrado:id:token`)). La firma cubre el
  texto cifrado. El token y la ficha viajan en el **fragmento** del enlace (`#f=…&k=…`), que el navegador no
  manda a ningún servidor. No salen en el directorio. Sin tablas nuevas.
- **Llaves locales** (`llaves-locales.ts`, `starseed.estaciones.vivo.v1`): solo en este aparato. NO van a
  la cuenta: son credenciales y la regla de identidad soberana (CLAUDE.md §6, `settings-sync.ts`) dice que
  no viajan solas. Para controlar desde otro aparato: **«Controlar desde otro aparato»** copia el enlace de
  control (`#…&c=<JWK>`); al abrirlo se comprueba que la llave es la de la sesión y se guarda.

### 3.1 De dónde sale la entonación (`opciones-entonacion.ts`)

Omnifrecuencias: tu última sesión de la versión integrada (`getLastSession`), la biblioteca de frecuencias y
sinergias de la app (`frequencyData` + `frequencyToOscillators`, el mismo código), los presets del widget
(`BUILTIN_PRESETS`, el binaural se convierte en dos osciladores izquierda/derecha), una frecuencia suelta o
JSON pegado (osciladores de la app, entonación o ficha). Audiomorphic: tus presets
(`starseed.audiomorphic.presets.v1`), los parámetros por defecto o JSON.

## 4. Sesión y canales

Sobre: `{"t":"est","s":id,"e":evento,"d":json | "x":cifrado,"f":firma}`. Eventos: `estado`, `accion`,
`pedir`, `ping`, `pong` (en lote `{l:[…]}`).

- Las acciones se programan **0,6 s por delante** en el reloj común: llegan a todos antes de su instante y
  empiezan a la vez.
- El anfitrión repite el estado cada 30 s (repara mensajes perdidos) y contesta `pedir` (como mucho una vez
  por segundo y canal). Un oyente pide el estado al arrancar, al abrirse cada canal (`alAbrir`) y cada 5 s
  hasta oír al anfitrión.
- Las respuestas de hora se agrupan en **lotes de 200 ms** (un mensaje para muchos oyentes; lo que tarda el
  lote se descuenta en la fórmula: probado sin pérdida de precisión).
- Canales (`canales-estacion.ts`):
  - **internet**: Supabase Realtime, difusión del tema + presencia para contar conectados;
  - **local**: cada enlace P2P emparejado sin internet vivo en la pestaña (`registro-enlaces-locales.ts`, el
    mismo del transporte universal). Coste cero y ± menos de 1 ms. Las estaciones van por ahí sin tocar el
    transporte universal (que es punto a punto con acuses y no sirve para difundir con hora exacta).

### 4.1 Coste en mensajes de Realtime (Supabase Free: 2 M/mes)

Cada mensaje de difusión cuenta una vez por cada conectado que lo recibe. Con N conectados y en régimen
(rondas cada 5 min): preguntas ≈ 36·N²/h, respuestas ≤ 36·N²/h (en lote suelen ser menos), latidos 120·N/h.
N = 10 → ≈ 8 400/h (≈ 238 h de estación al mes en el plan gratuito); N = 30 → ≈ 68 000/h (≈ 29 h/mes). Al
entrar cada persona: unas 16·N. Por enlaces locales no cuesta nada. Para audiencias grandes: tarea
`EV-ORACLE` (servidor de estaciones en Oracle con respuestas de hora uno a uno).

## 5. Sonido en todo el OS

- `MotorSonido` (`motor-estacion.ts`): mismo grafo que la app (dos ondas mezclables → volumen → pulsos →
  PannerNode escala 10 con z invertida → vca del tramo → master). Cada 200 ms mira 1,5 s por delante
  (`tramosEntre`, puro) y reconcilia: tramos nuevos se construyen y arrancan en su cruce por cero; un fin
  nuevo (pausa) se programa con un fundido de 20 ms que acaba en el instante exacto; un cambio de
  parámetros parte el tramo en su instante; un cambio de volumen no lo corta. Transiciones con rampas
  lineales de 250 ms exactas en sus extremos. No toca el audio hasta que la persona pulsa «Escuchar aquí».
- `estacion-global.ts`: una estación por pestaña que sigue sonando al navegar; silenciar/volumen locales
  (no afectan a nadie), acciones para todos (con control), latido de la fila del directorio cada 60 s
  mientras suena (el directorio solo dice «en directo» si el anfitrión está de verdad).
- `montaje-estacion-vivo.tsx` en el layout raíz (`<SoloFueraDeConsola>` junto a `OmniAppHost`): diminuto; carga
  minicontrol, motor y puente solo al sintonizar, si había una estación antes de recargar, o cuando la app
  oficial habla el protocolo.
- `minicontrol-estacion.tsx`: barra flotante (abajo a la izquierda, sin tapar el mini-reproductor central):
  estado, posición, precisión medida, escuchar / pausar para todos (o silenciar aquí), volumen y salir. Se
  oculta en la página de la propia estación.

## 6. Interfaz

- **Nueva estación** (`nueva-estacion.tsx`): selector de fuente «Enlace o ruta» (lo de siempre) ·
  «Entonación de Omnifrecuencias en vivo» · «Espirales de Audiomorphic en vivo» → `FuenteEnVivo`: título,
  enlace de la entonación, parámetros (biblioteca, una frecuencia o JSON), pública/privada. Al publicar:
  «Abrir la estación», «Copiar enlace/invitación» y «Enlace de control (tus aparatos)».
  `/estaciones?nueva=omnifrecuencias#p=…&t=…&e=…` lo abre ya relleno (lo usa la app desde fuera del OS).
- En el directorio, las tarjetas de estas estaciones llevan la insignia «sincronizada» (`tarjeta-estacion.tsx`), y la
  fila sigue a la sesión: latido mientras suena, `pausada` y `termina_en` cuando la línea llega a esas acciones
  (y se limpia `termina_en` si vuelve a empezar).
- Las públicas entran en **Transmisiones** (`os_estaciones`, fuente `starseed`, tipo `audio` u `mixto`,
  enlace `/estaciones/vivo/<id>?f=…`). La ficha de detalle (`/estaciones/<fila>`) y la ruta
  `/estaciones/vivo/<id>` pintan `PanelEnVivo`: fase y posición, entonación, **reloj común (± medido, cota,
  medidas, deriva)**, latencia de salida compensada, canales abiertos y conectados, escuchar/silenciar y
  volumen aquí, y con control «Iniciar / Pausar / Reanudar para todos», «Empezar de nuevo», «Terminar».
- Audiomorphic: el panel pinta `AudiomorphicCanvas` con los parámetros vigentes, parado si la sesión no
  suena. **La configuración está sincronizada; la imagen se genera en cada aparato y reacciona a su propio
  sonido, así que no es idéntica fotograma a fotograma** (se dice en el panel).

## 7. Puente con la app oficial (`postMessage` v1)

`puente-omnifrecuencias.ts`. Mensajes `{ ss: "estacion", v: 1, tipo, … }`. El OS solo atiende orígenes de
las webs oficiales (`APPS_OFICIALES.*.web`) o de `NEXT_PUBLIC_ORIGENES_PUENTE_ESTACION` (https o
localhost), y de otro marco; contesta al marco que preguntó con su origen exacto.

| app → OS | OS → app |
|---|---|
| `hola {app, suena}` | `bienvenida {capacidades, estacion}` |
| `latido {suena}` | — |
| `reloj-ping {id, t0}` | `reloj-pong {id, t0, t1, t2, comun}` (hora común) |
| `crear {titulo, enlace, params\|osciladores, volumen?, privada}` | `creada {id, enlace, enlaceControl, directorio}` / `error` |
| `sintonizar {enlace}` | `estado {estacion}` en cada cambio (≤ 4/s) |
| `accion {accion, params\|osciladores?, volumen?}` | `resultado {ok, motivo?}` |
| `salir {}` | `estado {estacion: null}` |

La foto que recibe la app no lleva llaves, tokens ni la llave pública (probado). Con `suena: true` el OS se
silencia en esa pestaña mientras la app dé latidos (12 s) sin pisar el silencio que la persona puso a mano.
El código y los pasos EXACTOS para el repo de la app: `integraciones-de-codigo/omnifrecuencias/INSTRUCCIONES.md`
(el repo `StarSeedSystem/generador_frecuencias` no es accesible desde el contenedor; el director lo aplica).
Una prueba del OS importa ese módulo y comprueba que habla lo mismo.

## 8. Lo que NO hace (y por qué)

- No transmite audio grabado ni micrófono: es paramétrica por diseño (§C).
- Audiomorphic: no hay una imagen idéntica fotograma a fotograma (el renderer acumula estela y reacciona al
  audio local). Tampoco aplica la sesión a la capa de fondo del OS todavía (tarea `EV-FONDO`).
- Sin respuestas de hora uno a uno por internet: la difusión de Supabase lo manda todo a todos (coste §4.1).
- Las llaves de control no viajan con la cuenta (identidad soberana): se usa el enlace de control.
- La app oficial no está tocada desde aquí: queda el paquete listo.
