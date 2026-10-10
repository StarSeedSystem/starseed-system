# Mapa 3D de señales reales — UN solo mapa: Mapa 3D de neuronas + Radar de señales (2026-10-10)

> **SOP de esta ola.** Fuente de verdad del instrumento único que sustituye a dos: el «Mapa 3D de
> neuronas activas» de `/red-mesh` (Adenda 98) y el «Radar de señales reales». Léelo antes de tocar
> `src/lib/senales/*`, `src/components/mesh/mapa-senales/*`, `signals-radar.tsx` o la colocación de
> señales (`src/ai/astraura/mesh/signals.ts`). **Hay un único mapa:** no se crea otro en
> `src/lib/mesh/` ni en otra carpeta; se amplía este.

## 0. El encargo (Alex, verbatim)

«fusiona el Mapa 3D de neuronas activas con el Radar de señales reales y mejora su estética y
funciones del UI y UX con más y mejores características y funciones para el mapa 3D inteligente con
las señales reales y un diseño intuitivo atractivo estético coherente bien organizado con sentido
atractivo para poder entender fácilmente y **cada elemento y valor del diseño del mapa 3D sea real,
coherente y estético**».

La última cláusula manda sobre todo lo demás: **ningún canal visual del mapa significa algo que no
se haya medido**. Si un dato no existe, se dibuja como «no medido» y se dice por qué.

## 1. Qué es el mapa (y qué reúne)

Un solo instrumento, dos vistas del MISMO modelo (3D y plano) y un mini radar, para todo lo que esta
neurona percibe de verdad:

- **«Tú»** en el centro (este aparato, desde este medio).
- **Otros aparatos de tu cuenta** (neuronas, una por aparato) con su **estado en vivo** (activa ahora ·
  segundo plano · en línea · desconectada) y sus **medios abiertos** (rombos que orbitan al aparato).
- **El enlace real** hasta cada aparato, medido: P2P en la misma red local · P2P por internet directo ·
  P2P reenviado por TURN · P2P con ruta sin medir · directo sin internet (código/QR) · relé cifrado de
  la cuenta · radio LoRa; sin enlace = línea punteada y el **motivo** («desconectada, último latido
  hace 9 min», «el canal P2P falló: …»). La latencia sale del canal (RTT), nunca se rellena.
- **Nodos LoRa y BLE/Wi-Fi** con su intensidad (SNR/RSSI → calidad) y su distancia.
- **Faros de otras cuentas, anónimos por defecto** («Neurona de otra cuenta #n»): sin nombre ni id en
  pantalla. Solo la cuenta que eligió **«Visible»** en su privacidad de malla se muestra con lo que
  marcó compartir (§3.4).
- **Tu neurona en el centro** (3D y plano): su nombre, la foto o el avatar 3D del perfil activo, el
  nombre del perfil y los datos reales (aparato, medios abiertos, señales), con acceso a sus ajustes
  (§3.5). Cada TIPO de señal tiene su icono propio (§3.6).
- **Antenas propias** (discos pequeños del centro) y **sectores** del suelo por familia de antena.
- **Anillos de distancia solo donde la distancia existe** (ver §3.2).
- **Ficha con cada valor y su fuente** (medido · declarado · estimado · «no medido»).
- **Filtros** por familia y por cuenta (Mi cuenta · Otras cuentas · Sin cuenta StarSeed) y «Ocultar
  desconectados»; vista **3D / Plano**; **modo compacto** de móvil; **leyenda corta**.

## 2. Arquitectura

```
useDetectedSignals ┐
useMallaNeuronasEstado().misDispositivos (filas, enlace P2P, medios)   ┐
usePresenciaNeuronas() (medios abiertos y sus señales, en vivo)        ├─► useMapaVivo ─► senales + vivo + yo
useEnlacesLocales() (enlaces directos sin internet)                    │      (puro: aparatos.ts, cuentas.ts,
medirSenales() / describirMedio() / uidActual() (este medio)           ┘       escalas.ts, enlaces.ts)
                                   │
                    construirModeloMapa (modelo.ts, PURO) ──► ModeloMapa
                    ┌───────────────┼────────────────────┐
              Escena3D (R3F,    VistaPlana (SVG;     SignalsRadar (wrapper de
              perezosa)         rotulos.ts)          VistaPlana: mini radar)
```

### Modelo puro — `src/lib/senales/` (sin React, sin three, sin red, sin `node:*`)

| Archivo | Papel |
|---|---|
| `tipos-vivo.ts` | Contrato: `Cuenta`, `Dato`/`EstadoDato`, `FichaMapa`, `EnlaceMapa`/`ClaseEnlace`, `EstadoAparato`, `MedioMapa`, `VivoMapa`, `EntradaYo`, `AnilloAlcance`, `EscalaId` |
| `escalas.ts` | Las dos escalas log (**largo** LoRa 30 m–6 km · **corto** BLE/Wi-Fi 1–300 m), `reubicar` (BLE/Wi-Fi a escala corta), `factorError`, `anillosDeAlcance` |
| `cuentas.ts` | `cuentaDe`, `anonimizarAjenas`, contadores y filtro por cuenta |
| `enlaces.ts` | `clasificarEnlace` (clase real del enlace), `enlaceDeSenal`, `ETIQUETA_CLASE`, `ESTILO_ENLACE`, `valorEnlace` |
| `aparatos.ts` | `construirVivo` (cruza filas de la malla + presencia + enlaces locales), `estadoAparato`, `subtituloAparato`, `senalDeEnlaceLocal` |
| `medios.ts` | `crearMedio`, `datosDeSenalesMedio`, `fichaDeYo` |
| `fichas-base.ts` · `fichas.ts` | `dato`/`noMedido` y `fichaDeSenal` (posición, enlace, métricas, cada una con su fuente) |
| `mapa-3d.ts` | Constantes compartidas (ángulos, colores, sectores), altura, forma, halo, marcadores, medios, antenas propias, filtros, etiquetas, textos, **encuadre de cámara** |
| `modelo.ts` | `construirModeloMapa(EntradaModelo) → ModeloMapa`: UN modelo que dibujan el 3D, el plano y el mini radar |
| `rotulos.ts` | `colocarRotulos`: dónde caben los textos del plano sin taparse (prioridad, alternativas, zonas reservadas) |
| `preferencias-mapa.ts` · `webgl.ts` | Preferencias del dispositivo (`starseed.mapa-senales.v1`, saneadas, todo en try/catch) y sonda de WebGL |

### Componentes — `src/components/mesh/mapa-senales/`

| Archivo | Papel |
|---|---|
| `mapa-senales.tsx` | Pieza pública `MapaSenales` (`compacto`, `soloPlano`, `onOpenMesh`): cabecera, selector 3D ⇄ Plano, preferencias, red de seguridad al plano |
| `contenido-mapa.tsx` | `ContenidoMapa`: filtros, selección única (Tú / medio / señal), ficha, escena o plano, escanear BLE y sondear, avisos, leyenda |
| `use-mapa-vivo.ts` · `use-antenas-propias.ts` · `use-compacto.ts` | Reúnen las fuentes reales (un reloj que se detiene con la pestaña oculta); antenas de este medio; `max-width: 639px` tras montar |
| `barra-resumen.tsx` · `barra-mapa.tsx` · `leyenda-mapa.tsx` | Chips de estado con recuentos reales, controles (altura, cámara, etiquetas, girar), leyenda corta |
| `lista-senales.tsx` · `secciones-ficha.tsx` | Lista accesible y ficha (`FichaPanel`, `SignalDetailCard` con `ficha`) |
| `escena-3d.tsx` | **Único archivo con three/R3F**, cargado con `next/dynamic` sin SSR. Cámara, `GestorEtiquetas`, `dpr`/`frameloop` por modo |
| `marcador-3d.tsx` · `medio-3d.tsx` · `suelo-3d.tsx` · `etiqueta-3d.tsx` · `glifo-forma.tsx` · `limite-escena.tsx` | Marcadores, medios, suelo/sectores/anillos/antenas, etiqueta DOM, glifos, error boundary |
| `vista-plana.tsx` | El MISMO modelo en SVG: móviles, equipos modestos y red de seguridad sin WebGL |
| `src/components/mesh/signals-radar.tsx` | Wrapper de `VistaPlana` (API conservada) para el mini radar del dashboard |
| `src/components/mesh/mesh-map-3d.tsx` | Compat: reexporta `MapaSenales` como `MeshMap3D` |
| `red-mesh-center.tsx` · `signals-center.tsx` | `/red-mesh`: `<MapaSenales />` (y `<MapaSenales compacto soloPlano />` en el panel ligero); Hub de Conexiones → Señales: `<MapaSenales compacto={compact \|\| undefined} onOpenMesh=… />` |

## 3. Qué significa cada canal visual (y de dónde sale su valor)

| Canal | Significa | Origen del valor |
|---|---|---|
| **Núcleo** (color) | Calidad medida: fuerte ≥ 62 · media ≥ 34 · débil < 34 · gris «sin métrica» | `signal.quality` (SNR/RSSI/latencia reales); `null` ⇒ gris |
| **Forma** + **aro** + **cuña del suelo** | Familia de antena (LoRa esfera, relé octaedro, cuenta icosaedro, IP cilindro, BLE caja, USB cono) | `signal.antenna` |
| **Punto de estado** | Activa ahora · segundo plano · en línea · desconectada | Presencia en vivo (medios abiertos, `visible`) o, sin ella, el latido de `neuron_devices` |
| **Línea al centro** | Enlace MEDIDO; color y trazo = clase de enlace; continua = canal abierto, punteada = relé / LoRa / sin enlace | `clasificarEnlace` / `enlaceDeSenal` (§1) |
| **Rombos** | Medios abiertos de un aparato (a la vista = verde, segundo plano = ámbar) | `PresenciaMedio` |
| **Altura** (solo 3D) | El eje elegido: calidad · frescura (10 min) · saltos (4) · plano. **Sin dato ⇒ suelo y translúcido** | `quality`, `lastHeard`, métrica «Saltos» |
| **Halo del suelo** | Rango de precisión: continuo = GPS de ambos extremos; punteado = distancia RF con rumbo desconocido; grande = sin posición | `placement.mode`, `accuracyFrac` |
| **Posición** | Con GPS real: rumbo y distancia verdaderos (−z = norte). Sin GPS: el ángulo NO es un rumbo; queda dentro del sector de su antena | `placement` |
| **Pulso** | Oída hace < 30 s (y nada más late) | `lastHeard` |
| **Punto blanco** | Declara una cuenta StarSeed | `signal.starseed` |
| **Aro ámbar** + aviso | Viene del simulador de la malla: NO existe en el aire | `signal.simulated` |
| **Discos pequeños del centro** | Antenas de ESTA neurona; las que no existen no se dibujan | `detectSignals()` |
| **Marca «N · norte real»** | Solo aparece si alguna señal se coloca con GPS | `resumen.gps > 0` |

### 3.1 Cuentas y anonimato

`cuentaDe`: **propia** (el servidor verificó que es de tu cuenta) · **otra** (faro de otra cuenta; la
red no revela quién es y el mapa tampoco: `anonimizarAjenas` quita `name`/`neuronId` y sufija «#n» por
orden de id) · **ninguna** (BLE, Wi-Fi, LoRa ajeno, serie). Los enlaces directos sin internet NO se
anonimizan: los emparejó la persona a propósito. `starseed.sourceId` se conserva para las acciones
reales, pero nunca se enseña.

### 3.2 Anillos de distancia: solo con distancia

Dos escalas log (`ESCALAS` en `escalas.ts`): **largo** (LoRa, marcas 100 m · 1 km · 5 km) y **corto**
(BLE/Wi-Fi, marcas 3 · 10 · 30 · 100 · 300 m). Un anillo existe solo donde hay distancia:

- algún elemento colocado con **GPS de ambos extremos** (`placement.mode === "gps"`; hoy solo los
  nodos LoRa) → **círculo completo** (rumbo real), etiqueta «100 m»;
- solo distancia **estimada por RF** → **arco limitado al sector de su antena**, punteado y marcado
  «≈» (±factor de error del modelo, `factorError`, mostrado en la ficha);
- sin ninguna distancia (relé, cuentas, serie, sin posición) → **ningún anillo**.

`reubicar` pasa BLE/Wi-Fi por RSSI a la escala corta para que la distancia dibujada y la escrita digan
lo mismo; sin posición, la marca se coloca por calidad dentro del sector y la ficha explica el rango.

### 3.3 Fichas: cada valor con su fuente

`fichaDeSenal`, `fichaDeYo` y las fichas de medio devuelven `Dato { etiqueta, valor, fuente, estado,
nota }` con `estado` ∈ **medido · declarado · estimado · no-medido**. Todo valor que no se midió se
llama «no medido» y la nota dice por qué (nunca «0», nunca un guion mudo). `secciones-ficha.tsx` los
pinta con un distintivo por estado y la fuente en una frase.

Lo que **no** hay, a propósito: haz de radar giratorio, ondas de adorno desde el centro, satélites,
enlaces inventados, alturas por defecto, nombres de otras cuentas. Si algo se mueve, es porque una
señal se oyó hace menos de 30 s o porque la persona activó «Girar».

### 3.4 Datos públicos: `starseed.mesh.privacy.v1` manda

El faro del relé (`os_mesh_relay`, `kind=beacon`) es anónimo salvo que su dueña elija otra cosa. La
privacidad de la malla (`src/ai/astraura/mesh/privacy.ts`) añade dos interruptores, apagados de fábrica:
`shareAvatar` (foto del perfil) y `shareDevice` (tipo de aparato). Solo con `publicRadar === "visible"`
el faro lleva `payload.pub = { a?, d? }`; con «anónima» u «oculta» no lleva nada. Quien lee un faro con
`pub` lo trata como **cuenta pública** (`esPublica`) y `anonimizarAjenas` la exceptúa; sin `pub`, sigue
anónima aunque el dato trajera una foto. Al leer, la foto pasa por `avatarUrlSegura` (solo https o ruta
propia; nunca IP privada, localhost ni credenciales) y el tipo de aparato por una lista cerrada. El
lector manda: «ver datos públicos de otras cuentas» (`verPublicos`, encendido por defecto, en las
preferencias del mapa) vuelve anónimas a todas. Tus propios aparatos llevan la foto de tu perfil.
Modelo puro: `radar-publico.ts` (qué se emite y cómo se lee) con pruebas en `__tests__/radar-publico.test.ts`.

### 3.5 El centro: neurona, perfil y ajustes

`centro.ts` (`construirCentro`) junta nombre de la neurona, perfil activo (`os_account_profiles` o, sin
faceta, el perfil de la cuenta con `avatar_url`), medios abiertos y señales, cada dato con su fuente.
La imagen la decide `decidirAvatar` (`perfil-centro.ts`): avatar 3D solo si es GLB/glTF, su peso se
**midió** (HEAD) y no pasa de 1,5 MB, y no hay modo ligero ni movimiento reducido; si no, la foto como
cartel; si no hay foto, las iniciales; siempre con el motivo. Sin presencia en vivo, «otros medios no
medidos». Los ajustes (`ajustes-centro.tsx`): nombre de la neurona (`setNeuronName`) y privacidad del radar
(anónima · visible · oculta, y qué compartir), con vista previa de lo que ve el resto.

### 3.6 Un icono por tipo de señal

`iconos.ts` decide el icono de cada señal desde un dato que ella declara: antena (LoRa, relé, IP,
Bluetooth, USB/serie), tipo de aparato de la cuenta (móvil, tablet, portátil, escritorio, servidor,
desconocido) o enlace directo sin internet. Mismo glifo en 3D (`icono-3d.tsx`, primitivas de three), en el
plano y en la lista/leyenda/filtros (`icono-2d.tsx`). El icono dice QUÉ ES; el color y el brillo siguen
diciendo la calidad medida.

## 4. Funciones para quien lo usa

- **Filtros** por familia (chips con recuento real), por cuenta y «Ocultar desconectados»; en compacto
  se pliegan en un `<details>` «Filtros».
- **Eje de altura** conmutable (3D): Calidad · Frescura · Saltos · Plano; la leyenda explica el elegido
  (en compacto la nota va bajo el lienzo para no tapar marcas).
- **Etiquetas «las que caben»**: `GestorEtiquetas` (3D) y `colocarRotulos` (plano) dejan solo las que no
  se pisan (prioridad: elegida, apuntada, luego por calidad; máx. 8 en compacto, 16 en completo).
  En el plano un rótulo prueba su sitio natural y sus alternativas (arriba, abajo, otros puntos del
  anillo); lo elegido o apuntado (prioridad ≥ 100) se dibuja siempre.
- **Cámara** (3D): «Recentrar», «Desde arriba», vuelo suave a la señal elegida, «Girar», encuadre por
  forma del lienzo (`encuadreCamara`).
- **Selección única**: tocar un marcador, un medio, «Tú» o una fila cambia lo mismo en lienzo y lista;
  la ficha sustituye a la lista y «Todas las señales» vuelve.
- **Escanear BLE** y **Sondear** (acciones reales sobre `useDetectedSignals`), aviso del simulador y
  aviso si la presencia en vivo no está conectada (entonces el estado sale del último latido, cada 5 min).
- **Plano** como modo elegible y como red de seguridad: sin WebGL, con el contexto perdido o si la
  escena lanza un error, se muestra el plano con las mismas señales y un aviso que dice por qué.
- **Modo compacto** (`useCompacto`, `max-width: 639px`, o `compacto` forzado por el contenedor): lienzo
  de 320 px, `ligero` (menos `dpr`), menos etiquetas, filtros plegados, leyenda corta.
- **Preferencias del dispositivo** recordadas (se leen tras montar: sin desajuste de hidratación).
- **`prefers-reduced-motion`**: sin giro, pulsos ni vuelos suaves; el botón «Girar» desaparece.
- **Pestaña oculta**: nada se repinta ni sondea (reloj `useAhora` detenido, `frameloop="demand"`).

## 5. Reglas duras (no romper)

1. **Solo `escena-3d.tsx` importa three/R3F** y se carga perezosa. Nada de WebGL en el paquete común ni
   en el layout raíz (ver CLAUDE.md §«Publicar»). Ningún `node:*` en estos archivos ni en
   `src/lib/senales/` (el modelo lo importan componentes de cliente).
2. **Una sola fuente de constantes** (ángulos, colores, sectores, escalas): `mapa-3d.ts` y `escalas.ts`;
   el plano, el mini radar y la escena las importan. No las dupliques.
3. **Las etiquetas de drei NO capturan puntero.** `Etiqueta3D` pasa `pointerEvents="none"`,
   `wrapperClass="pointer-events-none"` y `style={{pointerEvents:"none"}}`: drei deja sus contenedores en
   `auto` y la etiqueta de apuntado quedaba encima del marcador y **se tragaba el clic**, además de
   robar arrastres a la cámara (medido en navegador real). Guarda: `__tests__/etiqueta-sin-puntero.test.ts`.
   En el plano, los `<text>` llevan `pointerEvents="none"`.
4. **Bucle de render bajo demanda** (`frameloop="demand"`); `"always"` solo con giro elegido o con alguna
   señal < 30 s. Con movimiento reducido, nunca.
5. **Honestidad primero**: un valor sin medir se dibuja «no medido» (suelo + translúcido + texto). Antes de
   añadir un canal visual, di de qué dato real sale; si no hay, no se añade. Un anillo sin distancia no
   existe; una cuenta ajena no tiene nombre; una latencia sin medir se dice «latencia sin medir».
6. **Un solo mapa**: no crees `src/lib/mesh/mapa-senales-*.ts` ni un segundo componente de mapa. Se amplía
   `modelo.ts` y `mapa-senales/`.
7. Textos en español, iconos lucide, `cursor-pointer` en lo clicable, móvil primero; el producto se llama
   **Genesis** (guardia `nombre-genesis.test.ts`).
8. Un rótulo del plano está donde dice su dato o no se ve: no se desplaza lejos de su anillo/marca para
   «caber».

## 6. Pruebas y cómo se verificó

Vitest (`npx vitest run src/lib/senales src/components/mesh/mapa-senales src/components/mesh/__tests__/signals-radar.test.tsx
src/components/dashboard/widgets/_social-d/__tests__/radar-internet-widget.test.tsx`):

- `src/lib/senales/__tests__/`: `escalas` (escalas, anillos solo con distancia, `reubicar`), `cuentas`
  (anonimato), `enlaces` (cada clase y motivo), `aparatos` (estado, enlaces, subtítulo), `fichas` (valor +
  fuente + «no medido»), `mapa-3d` (altura, formas, halos, sectores con `RingGeometry` real, norte, filtros,
  etiquetas, encuadre), `modelo` (UN modelo para todas las vistas), `rotulos`, `preferencias-mapa`.
- `src/components/mesh/mapa-senales/__tests__/`: `mapa-senales.test.tsx` (lienzo sustituido por un doble:
  filtros, selección, fichas, compacto, reduced-motion, fallback), `vista-plana.test.tsx` (SVG real: sin
  barrido, círculo solo con GPS y arcos «≈», color de línea por clase medida, medios pulsables, teclado),
  `secciones-ficha.test.tsx`, `etiqueta-sin-puntero.test.ts`; `src/components/mesh/__tests__/signals-radar.test.tsx`.
- **Verificación visual real (2026-10-10)**: banco aparte (esbuild con stubs + Tailwind CLI + Chromium
  headless con WebGL por software) sobre datos de los agregadores reales. Escenarios: completo (3D y plano),
  selección de aparato / «Tú» / medio, móvil 390 px compacto y no compacto, tablet 820 px, sin presencia,
  vacío, filtro «Otras cuentas», movimiento reducido. Sin errores de consola. Encontró y corrigió:
  «desconectada · desconectada», rótulos del plano pisándose (→ `rotulos.ts`), rótulos sobre marcas y medios
  (zonas reservadas), nombres de anillo «≈» ocultos por la fila de marcas (arcos con prioridad y más
  alternativas), nota de altura tapando marcas en móvil. El banco NO vive en el repo (es andamiaje).
- **Pendiente de la Mac**: ver el lienzo con la GPU real (aquí fue SwiftShader) y con señales reales de su
  radio y de sus otros aparatos. `bash scripts/starseed-ligero.sh construir`, reiniciar, abrir `/red-mesh`
  y Hub de Conexiones → Internet; comprobar con un segundo aparato abierto: aparece como aparato, con su
  medio y su enlace (clase + latencia), y al cerrarlo pasa a «desconectada» con su motivo.

## 7. Cómo ampliarlo sin romper la honestidad

- **Nuevo tipo de señal**: añade la antena en `signals.ts`/`radar-fusion.ts` (colocación y calidad se
  calculan allí) y su forma/color en `FORMA_POR_FAMILIA`/`KIND_*` de `mapa-3d.ts`. Si mide distancia, añade
  su familia a `ESCALA_FAMILIA` (`escalas.ts`); si no, no tendrá anillo.
- **Nueva clase de enlace**: tipo en `ClaseEnlace`, texto en `ETIQUETA_CLASE`/`CORTA`, trazo en
  `ESTILO_ENLACE`, rama en `clasificarEnlace` y prueba. El motivo de «sin enlace» es obligatorio.
- **Nuevo dato en la ficha**: `dato(etiqueta, valor, fuente, estado)`; si falta, `noMedido(...)` con motivo.
- **Nuevo eje de altura**: función pura en `mapa-3d.ts` que devuelva `{y, medida}` + entrada en `MODOS_ALTURA`
  y `leyendaAltura` + prueba. Si la señal no informa el dato: `medida: false`.
- **Nuevo control**: en `barra-mapa.tsx` y su preferencia saneada en `preferencias-mapa.ts`.
- **Navegación por teclado dentro del lienzo 3D** (mover foco entre marcadores con flechas) queda como tarea
  abierta: hoy el teclado se cubre con la lista y con el plano (marcas con `role="button"`, Enter/Espacio).

## 8. Fuera de alcance de esta ola

- El encargo «actualizaciones por capas y niveles Genesis» (`architecture/actualizaciones-por-capas-y-niveles.md`)
  no se ejecutó aquí: el encargo de Alex fue este mapa.
- No se tocó `memory/state.md` ni `CLAUDE.md` (otros agentes trabajan en el mismo árbol): la bitácora la
  anota el director/orquestador con el resumen de la ola.
- Sin migraciones ni dependencias nuevas (three, @react-three/fiber, drei y lucide ya estaban).
- **Historia**: la base del mapa (`mapa-3d.ts`, escena, lista, radar plano) la escribió el agente de
  Actualizaciones; el coordinador la reasignó a esta ola («un solo mapa, no dos»). Un hilo gemelo llegó a
  escribir una segunda implementación (`src/lib/mesh/mapa-senales-*.ts`, `src/components/mesh/mapa-fusionado/`);
  se retiró del árbol (sin referencias) y no forma parte del producto.
