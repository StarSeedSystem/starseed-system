# Apps en la malla: abrir cualquier app desde cualquier neurona con los recursos de la red

> **Petición de Alex (2026-10-17):** «optimiza el funcionamiento de poder abrir apps en cualquier medio de servidor
> vinculado a cada cerebro de cada cuenta y grupo, incluyendo los almacenamientos y capacidades de las neuronas
> activas vinculadas y de los servidores y neuronas alrededor disponibles de la red mesh P2P multicapa […] también
> para las publicaciones, las transmisiones y estaciones de cualquier formato […] debe ser posible utilizar apps y
> programas de cualquier tipo desde cualquier neurona vinculada con los permisos, pública o privada, en tiempo real
> aunque no disponga de los recursos […] las neuronas pueden funcionar autoenrutándose como receptoras y
> transmisoras de las capacidades de todo tipo». Dio como referencia una investigación para la Mac (contenedor
> `.sparsebundle` APFS en Google Drive en modo transmitir, montar nubes y servidores con rclone + FUSE-T con caché
> VFS, y enlaces simbólicos para sacar datos pesados), pero lo quiere para cualquier sistema y para el navegador.

Amplía, sin duplicar: `colmena-relevo-contenedores.md` (neurona como contenedor de agentes),
`malla-cristalina-sio2.md` (viabilidad por dato, recibos, resonancias), `transporte-universal-sin-internet.md`,
`archivos-malla-p2p.md`, `capas-autoadaptables.md` (almacén por trozos con SHA y presupuestos por medio),
`cerebros-fusion-telepatia.md` §8 (medios del cerebro), `memoria-cerebros-sync.md` (Google Drive real),
`estaciones-en-vivo-parametricas.md` (reloj común), `dashboard-launcher-apps-y-archivos.md` §3 (cómo se abre cada app)
y `vigia-modelos.md` §5 (instalación por neurona y capa «malla»).

## 1. Qué hay hoy (medido el 2026-10-17) y qué falta

**Ya existe y se reutiliza:**
- Enlaces: `src/lib/malla/transporte-universal.ts` (local sin internet, cuenta, par entre cuentas),
  `canal-multitrayecto.ts` (un archivo por varios enlaces a la vez) y `eleccion-enlace.ts`.
- Archivos por la malla: `src/lib/network/archivos-malla.ts` (trozos con SHA-256, reanudación, OPFS).
- Inteligencia prestada: `src/lib/network/ia-por-malla.ts` (relé genérico `ia.*`: una neurona sin modelo pide a otra).
- Ficha de capacidades: `src/lib/network/capacidades-nodo.ts` (RAM libre, CPU, capas, tok/s medidos, batería).
- Almacén y reparto de capas: `src/lib/astraura/capas/almacen.ts` (trozos con SHA, LRU), `repartir.ts` (propio › par
  › espejo › servidor propio › oficial) y `perfil-medio.ts` (presupuesto por medio).
- Planificadores sueltos: `src/lib/protomolecula/planificador-computo.ts` (dónde calcular la Protomolécula) y
  `src/lib/metagenesis/colmena.ts` + `scripts/puente/colmena_logica.py` (cuántos agentes aporta un aparato).
- Servidores de cerebro N:N: `src/lib/brains/servers.ts` (`brain_servers`, `brain_server_links` con papeles
  primary, replica, compute, storage y sync). Los Ajustes del cerebro con sus medios están encolados en CB1013
  (`src/lib/cerebros/ajustes.ts` aún no existe; el diálogo muestra «en construcción»).
- Almacenamientos: `src/lib/storage/backends.ts` (con escritura real: starseed, gcs y gdrive), `router.ts`
  (`chooseBackend`) y `carpetas-vinculadas.ts` (carpetas del aparato y servicios declarados).
- Estaciones: `src/lib/estaciones/reloj-comun.ts` (un reloj para todos los medios) y faros por la malla.
- Lanzador: `src/components/dashboard/apps/app-catalog.ts` (38 apps; `open` = ruta, ventana o pestaña).
- Mac de Alex: 8 GB de RAM, 6,4 GB libres de 228 GB, Google Drive para escritorio con 4 cuentas
  (`~/Library/CloudStorage/GoogleDrive-*`), sin rclone ni FUSE instalados.

**Lo que falta:**
1. **No hay una bolsa común de recursos.** Astraura, la Protomolécula, las capas, los archivos y los agentes deciden
   cada uno por su lado dónde calcular y de dónde leer.
2. **Abrir una app es siempre local.** El catálogo no dice qué necesita cada app ni de cuántas formas puede abrirse.
   Una neurona sin recursos simplemente no puede.
3. **Nadie puede usar una app instalada en otra neurona** (no hay ventana transmitida).
4. **Las neuronas y el A1 no son almacenamiento** de otros, y las apps nativas no pueden vivir fuera del disco.
5. **Publicaciones y transmisiones** se bajan siempre del origen: quien mira no retransmite a sus vecinos.
6. **En Ajustes del cerebro** aún no hay medios (CB1013). Cuando lleguen, capacidades y almacenamiento deben
   aplicarse de verdad, no solo guardarse.

## 2. La idea: cada contexto tiene un servidor vivo hecho de toda su red

El **servidor de un contexto** (cuenta, grupo, comunidad, publicación, estación) no es una máquina: es la unión viva
de lo que ese contexto puede usar en ese momento:
1. la propia neurona;
2. las neuronas activas de la misma cuenta (primero las de la red local);
3. las neuronas de los miembros del grupo que prestan recursos a ese grupo;
4. los servidores del cerebro (`brain_server_links`: A1, servidores propios) y sus almacenamientos (Google Drive…);
5. los vecinos de la malla que ofrecen capacidad pública, con su confianza (resonancias);
6. la nube gratuita (lo que ya usa la colmena), nunca para lo privado.

Toda neurona es a la vez **receptora y transmisora**. Publica una **oferta** (qué presta) y, cuando le falta algo,
una **petición**. La **bolsa** empareja las dos con reglas puras y deterministas, y explica siempre por qué.

## 3. Oferta de cada neurona (se amplía `CapacidadesNodo`, sin romperla)

- **Cómputo:** núcleos, RAM libre, GPU y VRAM, motores locales (imagen, voz, oído, palabra, transcodificar).
- **Almacenamiento:** espacio que presta y para quién, y volúmenes cuyas bandas guarda.
- **Apps prestables:** solo las que su dueño marcó, con su versión. Nunca se anuncian nombres de archivos ni rutas.
- **Enlaces:** subida y bajada medidas, latencia a cada vecino.
- **Energía:** batería, si está cargando y si la persona la está usando ahora.
- **A quién presta:** su cuenta (sí por defecto), sus grupos (no por defecto), público (no por defecto), con topes:
  % de CPU, MB de RAM, GB de disco, horario, «solo cargando».
- Todo número es **medido**; lo que no se mide va como «sin medir», nunca inventado.

## 4. La bolsa de recursos (`src/lib/recursos/bolsa.ts`, pura)

`planificar(peticion, ofertas, reglas)` → por cada parte de la petición: dónde corre, de dónde vienen los bytes, por
qué enlace, con qué calidad, el respaldo y el motivo legible.

Reglas en este orden (las restricciones ganan siempre a las preferencias):
1. **Permisos y privacidad:** lo privado solo en neuronas de la misma cuenta o servidores del cerebro, cifrado de
   extremo a extremo; nunca en la nube compartida ni en vecinos públicos. Un grupo solo usa lo que sus miembros le
   prestan.
2. **Tiempo real:** si la latencia importa (ventanas, juegos, llamadas), solo red local o enlaces con latencia medida
   menor que el tope de la petición.
3. **Energía:** nunca una neurona con batería baja sin cargador, ni una que su dueño está usando a fondo.
4. **Capacidad:** cabe en lo que la neurona presta (no en lo que tiene).
5. **Coste:** primero lo gratuito y propio.
6. **Reparto:** si una sola no basta, la petición se ramifica (bandas desde varias fuentes, piezas de cálculo en
   varias neuronas).
7. **Suelo:** nunca «nada». Si no hay recursos, abre lo que se pueda en local o en la web y dice qué falta.

Los planificadores que ya existen pasan a pedir a la bolsa mediante adaptadores, sin cambiar lo que devuelven.

## 5. Cinco formas de abrir una app (el catálogo dice cuáles admite)

| Modo | Para qué | Cómo |
|---|---|---|
| `local` | Módulos web y PWA del OS | Corre en el navegador o la app. Lo pesado se pide como capacidad (§6). |
| `por-bandas` | Apps WASM y web de la Biblioteca, recursos grandes | La app es un **volumen por bandas** (§7). Solo se baja lo que se usa, desde vecinos, Drive o el A1, a la caché del medio. |
| `montada` | Apps nativas (.app, .exe, AppImage) que viven fuera del disco | El volumen se ve como un disco del sistema por la **pasarela local** (§7). En la Mac, opción sparse bundle en Drive (§8). |
| `transmitida` | Apps que la neurona no puede correr | Corre en otra neurona o servidor que la tiene. La ventana llega en vídeo por WebRTC y el teclado, el ratón y el tacto vuelven por un canal de datos (§9). |
| `ramificada` | Apps con partes pesadas | La interfaz va en local; el cálculo, en otras neuronas; los datos, en el volumen del contexto. |

`comoAbrir(app, neurona, plan)` elige el modo con su motivo. El menú «Abrir en…» deja elegir otro.

## 6. Capacidades prestadas: el relé `capacidad.*`

Se generaliza el relé de `ia-por-malla.ts` a cualquier capacidad: `imagen`, `voz`, `oido`, `palabra`,
`transcodificar`, `render`, `buscar` y `construir`. Mensajes `pedir`, `trozo`, `fin`, `error` y `cancelar`, los mismos
topes de tamaño y la misma reanudación. La neurona que sirve controla la admisión (sus topes de préstamo), lleva una
cola, puede cancelar y anota cada préstamo (para Procesos activos).

## 7. Volúmenes por bandas y pasarela local (la idea del sparse bundle, para todos)

- **Volumen por bandas:** cualquier app, carpeta o publicación pesada se guarda como un manifiesto de bandas de 4 MiB
  con su SHA-256 (las bandas se piden y verifican con el mismo motor que las capas). Igual que el sparse bundle de
  la Mac: el volumen puede ser enorme y solo se baja lo que se abre.
- **Réplicas:** según importancia y privacidad (privado: neuronas de la cuenta y servidores del cerebro; público:
  también vecinos). Cada banda tiene al menos 2 copias vivas cuando hay sitio; si una neurona se va, otra la copia.
- **Lectura:** cada banda viene de la fuente más rápida que la tenga, varias a la vez (`canal-multitrayecto`), y se
  verifica antes de usarse.
- **Caché del medio:** navegador (OPFS) con el presupuesto de `perfil-medio.ts`; app nativa con su presupuesto de
  disco (15 % del libre, tope de 8 GB). Expulsión de lo menos usado.
- **Pasarela local** (solo app nativa y servidores): sirve los volúmenes al sistema por WebDAV en `127.0.0.1` para que
  el Finder, el Explorador o el gestor de archivos los vean como un disco, sin controladores:
  - **macOS:** WebDAV propio del sistema (`mount_webdav`) o `rclone nfsmount` (usa el NFS del sistema, sin FUSE). Con
    nfsmount, ejecutar desde el volumen sí; escribir, por la pasarela (hay fallos de escritura reportados).
  - **Windows:** el cliente WebDAV del propio Windows (`net use`), sin WinFsp.
  - **Linux:** `rclone mount` (FUSE del sistema) o davfs2.
  - **rclone** (MIT, 1.75.2) puede ir como programa auxiliar de la app nativa, con caché `--vfs-cache-mode full`,
    que es la que necesitan las apps para leer y escribir a saltos.
- Las órdenes exactas por sistema las da `src/lib/recursos/montaje.ts`, con un botón de copiar, y la app nativa las
  ejecuta solo con el permiso de la persona.

## 8. Mac de Alex: la receta de la investigación, como opción segura

En «Neurona › Almacenamiento» de la app nativa en macOS:
- **Apps en la nube:** crea un sparse bundle APFS en una carpeta de Google Drive en modo transmitir (bandas de unos
  8 MB) y lo monta. Las .app conservan permisos y firmas porque viajan dentro de la imagen, no sueltas.
- **Mover datos pesados de una app:** con la app cerrada: copia la carpeta (`ditto`), verifica, deja la original
  renombrada como respaldo, crea el enlace simbólico, prueba que la app abre y solo entonces ofrece borrar el
  respaldo. Si algo falla, vuelve atrás sola.
- Nunca mientras la app esté abierta, nunca sin respaldo y nunca sin la palabra de la persona. Avisa de que no se
  expulse el disco ni se cierre Google Drive con una app abierta desde la nube.
- FUSE-T no se incluye en StarSeed: su licencia solo es gratis para uso no comercial. Una persona puede instalarlo
  ella misma para su uso propio.

## 9. Ventana transmitida (usar una app que está en otra neurona)

- **Anfitrión (app nativa):** lista las ventanas de las apps prestables, captura solo la elegida (`xcap` o
  `screencapturekit` en macOS, `windows-capture` en Windows) y recibe el teclado y el ratón con `enigo`, limitados a
  esa ventana. La webview dibuja los fotogramas en un lienzo y los manda como pista de vídeo WebRTC
  (`canvas.captureStream`) por el enlace que elija la bolsa.
- **Calidad:** resolución y fotogramas según el ancho medido del enlace y lo que pueda decodificar quien recibe.
- **Servidores Linux (A1):** apps Linux completas con Selkies (MPL-2.0), apagado por defecto y encendido bajo demanda
  detrás de Caddy con sesión.
- **Seguridad:** solo apps que el dueño marcó, una sesión con permiso por uso (caduca y se revoca), un aviso visible
  en el anfitrión mientras se usa, un botón para cortar, y nada de pasar contraseñas.

## 10. Publicaciones, transmisiones y estaciones: quien mira también reparte

- **Vídeo y audio por segmentos (HLS):** un cargador propio para hls.js (ya está en el repo) pide cada segmento
  primero a los vecinos del contexto, por la malla, y si no llega a tiempo, al origen. Al recibirlo, lo anuncia:
  ya es transmisor. Su subida tiene el tope que su dueño preste.
- **Calidades:** la neurona más fuerte del contexto transcodifica la escalera de calidades (`capacidad.transcodificar`)
  para las débiles.
- **Árbol de relevo:** para muchos receptores, la bolsa arma un árbol donde las neuronas con más subida van en el
  centro. Si una se va, solo se recoloca su rama.
- **Estaciones paramétricas:** siguen con el reloj común; se añade el relevo de faros y segmentos.
- **Archivos de publicaciones, mensajes y Biblioteca:** como volúmenes por bandas, replicados según lo que se mira.

## 11. Eventos en tiempo real, para todo contexto

Un canal de eventos por contexto: reloj lógico híbrido sobre el desfase del reloj común, sin duplicados, orden
causal, acuses y reintentos, y reparto por el árbol de relevo. Los documentos vivos siguen con las operaciones de la
Protomolécula. Yjs y Loro (MIT) quedan anotados como alternativas por si hicieran falta; no se añaden ahora.

## 12. Dónde se ve

- **Lanzador:** «Abrir en…» con la neurona o servidor elegido y el motivo.
- **Neuronas:** «Prestar recursos» (cómputo, almacenamiento, apps, ancho) con sus topes y a quién.
- **Cerebro › Ajustes › Medios** (CB1013): usará `src/lib/cerebros/medios-efectivos.ts` para que capacidades y
  almacenamiento se apliquen de verdad.
- **Cerebro › Procesos activos:** lo que esta neurona presta y lo que toma prestado, con su consumo.
- **Genesis › Recursos de la red** (solo en la Mac): ofertas, préstamos vivos y salud de las réplicas.

## 13. Licencias comprobadas el 2026-10-17

| Pieza | Versión | Licencia | Uso |
|---|---|---|---|
| rclone | 1.75.2 | MIT | pasarela y montaje (auxiliar opcional) |
| FUSE-T | 1.2.6 | gratis solo no comercial | **no se incluye** |
| WinFsp | — | GPLv3 con excepción FLOSS; comercial cerrado de pago | **no se incluye** (Windows usa su WebDAV) |
| xcap | 0.9.8 | Apache-2.0 | captura de ventanas |
| screencapturekit | 11.0.0 | MIT o Apache-2.0 | captura en macOS |
| windows-capture | 2.0.1 | MIT | captura en Windows |
| enigo | 0.6.1 | MIT | teclado y ratón |
| Selkies | — | MPL-2.0 | apps Linux en el A1 |
| noVNC · guacamole-common-js | 1.7.0 · 1.5.0 | MPL-2.0 · Apache-2.0 | respaldo para escritorios remotos |
| hls.js | 1.7.3 (repo 1.6.x) | Apache-2.0 | reproductor con cargador propio |
| p2p-media-loader | 4.0.0 | Apache-2.0 | referencia de diseño (no se añade) |
| iroh · iroh-blobs | 1.3.0 · 0.103.1 | MIT o Apache-2.0 | candidato nativo para bandas verificadas (no se añade) |
| Yjs · Loro · Automerge | 13.6.33 · 1.16.4 · 3.5.0 | MIT | alternativas de sincronía (no se añaden) |
| v86 · browser_wasi_shim | 0.5.471 · 0.4.2 | BSD-2 · MIT o Apache-2.0 | futuro: programas no web en el navegador |

## 14. Tareas (Ola 1017A, `cola-apps-malla-1017.json`)

| Bloque | Tareas |
|---|---|
| Bolsa | A oferta · B bolsa · C adaptadores de los planificadores · D sesión de préstamo |
| Capacidades | E relé `capacidad.*` · F servir capacidades (admisión y cola) · G transcodificar en el A1 |
| Volúmenes | H manifiesto y réplicas · I caché por medio · J lector multifuente · K almacenamiento «neurona» |
| Montaje | L órdenes por sistema · M sparse bundle y datos pesados en la Mac |
| Apps | N modos del catálogo y `comoAbrir` · O menú «Abrir en…» · P ventana remota nativa · Q anfitrión web · R cliente web · S Selkies en el A1 |
| Medios | T cargador HLS por la malla · U disponibilidad · V árbol de relevo · W eventos del contexto |
| Ajustes y vista | X prestar recursos · Y su panel · Z medios efectivos del cerebro · Za procesos prestados · Zb Genesis › Recursos de la red |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost (Lanzador › Abrir en…, Neuronas › Prestar recursos, Genesis › Recursos de la red).
