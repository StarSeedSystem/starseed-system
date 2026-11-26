# Almacenes de los cerebros (capas de conciencia de memorias)

Contrato de la dirección (25-11-2026, petición de Maggasukha). Lo leen todas las tareas de la ola
`almacenes-cerebros-1125` (ALC1125*). Memoria del área: `areas/almacenamientos-cerebros`.
Se apoya en lo que ya existe: `src/lib/storage/` (backends, router, carpetas vinculadas, driver de
neurona, Drive), `src/lib/brains/` (memory-destinations, servers con `LinkRole`, sync),
`architecture/memoria-cerebros-sync.md`, `architecture/maggabit-almacenamiento-vivo.md` y
`architecture/almacenamiento-distribuido.md`. No se reescribe nada de eso: se amplía.

## Qué pidió Maggasukha

Cualquier almacenamiento (USB, disco, SSD, SD, NAS, el disco de una neurona o nodo, la nube) se
usa a través de los cerebros, en la capa de conciencia de memorias, con opciones profesionales de:
sincronización, vinculación, tipo de uso, carpetas concretas, reparto de capacidad entre nodos
privados y públicos, organización, administración y preferencias. Una USB puede llevar un cerebro
privado entero, una copia de seguridad, una neurona o un nodo; o solo carpetas o capas de una parte
de un cerebro, que tienen que estar en línea para que otras neuronas las usen. Copias como réplicas
independientes o como **respaldo vivo** que se actualiza solo en tiempo real al conectarse (por la
cuenta o por un servidor). **Fragmentación segura y reparto democrático** del almacenamiento (y de
las demás capacidades que se ofrecen como señales de capas: internet y procesamiento) entre todas
las personas que lo usen, público o privado, por cualquier señal autoenrutable de la malla P2P.
Formatear y modificar los medios libremente. Cualquier formato de cualquier hardware compatible.
Todo personalizable.

## 1. El almacén

Un **almacén** es un medio con identidad estable (UUID del volumen + número de serie del aparato;
nunca la ruta de montaje, que cambia). Lo detecta la neurona donde está conectado.

- Tipo: extraíble (USB, SD), disco interno, de red (NAS, servidor), nube (Drive, GCS, S3, WebDAV),
  neurona o nodo de la malla.
- Datos medidos: total, libre, velocidad real (lectura y escritura medidas, no la del catálogo),
  salud (SMART donde se pueda leer), sistema de archivos, si está en línea y desde qué neurona.
- **Formato universal**: dentro de cualquier sistema de archivos que el sistema operativo sepa
  montar (ext4, btrfs, xfs, exFAT, FAT32, NTFS, APFS, HFS+), StarSeed escribe la misma estructura
  portable: `.starseed/almacen.json` (manifiesto: id, dueño, qué cerebros o partes guarda, cifrado,
  versión del formato) y bloques direccionados por su hash. El mismo disco sirve en cualquier sistema.

## 2. Modalidades de uso (por almacén y por carpeta)

| Modalidad | Qué es |
|---|---|
| Cerebro completo | Lleva un cerebro entero (privado o de grupo). Al conectarlo en cualquier neurona, se abre con su desbloqueo. |
| Parte de un cerebro | Lleva carpetas o capas concretas. El cerebro sabe dónde está cada parte; si el medio no está en línea, esa parte se muestra «fuera de línea», no desaparece. |
| Réplica independiente | Copia congelada en un momento: no se sincroniza. |
| Respaldo vivo | Copia que se pone al día sola: en tiempo real, al conectarse, programada o a mano. Con versiones (instantáneas del sistema de archivos donde existan, como btrfs; si no, versiones por bloques). |
| Neurona o nodo almacén | Ofrece capacidad a la malla: privada (la cuenta), de grupo o comunidad, o pública. |
| Secundario | Datos útiles pero regenerables (cachés, compilaciones, pesados del desarrollo). |

## 3. Mapa de ubicaciones (capa de memorias)

Cada cerebro guarda dónde vive cada carpeta y memoria, cuántas copias hay y cuáles están en línea.
Regla: lo fundamental tiene **al menos dos copias en medios distintos**; un medio extraíble nunca es
la única copia de algo fundamental salvo que el dueño lo elija sabiendo el riesgo (aviso claro).

## 4. Sincronización

Por vínculo: dirección (enviar, recibir, ambas), cuándo (tiempo real, al conectar, programada, a
mano), qué (carpetas, tipos, tamaños), por qué medio (el autoenrutado elige malla local, Bluetooth,
internet o servidor según disponibilidad y coste). **Los conflictos nunca pisan**: se guardan las
dos versiones como variaciones y se avisa. Lo que llega de otros se acepta a mano por defecto (regla
vigente); «aceptar sin preguntar» solo por neurona reconocida y apagado por defecto.

## 5. Fragmentación segura y reparto democrático

- Lo que se reparte se **cifra en la neurona del dueño** antes de salir (AES-GCM con WebCrypto; las
  llaves nunca salen en claro, regla de claves vigente). Los nodos guardan fragmentos opacos.
- Código de borrado Reed-Solomon (k de n): con k fragmentos cualesquiera se reconstruye; se reparan
  solos cuando un nodo se va.
- Colocación según ofertas, salud y diversidad (no todo en el mismo aparato, red o persona).
- Reciprocidad: quien ofrece capacidad gana cupo; las reglas de cupo de un grupo o comunidad las
  decide su asamblea (PoliGenesis). Lo mismo vale para internet y procesamiento ofrecidos como
  señales de capas (`internet-compartido` y `capacidad-por-malla` ya existen: se reutilizan).

## 6. Formatear y modificar

Desde el OS, en la neurona que tiene el medio conectado: formatear (con el formato que se elija),
renombrar, montar y desmontar, y ver su contenido resumido antes. Guardas que no se quitan:
- Nunca el disco del sistema.
- Se muestra lo que hay y cuánto ocupa; si el medio guarda la **única copia** de algo, no se borra
  sin que el dueño lo confirme a sabiendas.
- Confirmación escrita (el nombre del medio) en **esa** neurona. Una orden remota nunca formatea
  sola (regla del control entre neuronas).
- Camino con privilegios propio de cada sistema: Linux con udisks2 por D-Bus (zbus, ya está en el
  árbol), macOS con `diskutil`, Windows con `Format-Volume` y su UAC; Android no deja a las apps
  formatear: se guía al ajuste del sistema.

## 7. Medidores y MetaGenesis

Cada almacén tiene su medidor (usado, libre, salud, en línea, copias de lo fundamental). En
MetaGenesis, el disco nuevo de la Maggabox entra en el medidor de almacenamiento junto a la Mac, el
disco interno de la Maggabox, el A1 y el Drive.

**Disco nuevo de la Maggabox** (25-11): Samsung HM500JI, 500 GB, USB 2.0 (~30 MB/s), btrfs con
`compress=zstd:1`, montado en `/srv/starseed-almacen` (con `nofail`). Subvolúmenes: `cerebros`
(capas privadas de la cuenta), `respaldos` (respaldos vivos y versiones), `desarrollo` (pesados
regenerables del enjambre y de producción), `publico` (capacidad ofrecida a la malla) y
`.instantaneas`. Es medio secundario y de respaldo: **nunca el único** de nada fundamental.

## Puertas de la ola

Pruebas de cada archivo; tsc; sin dependencias npm nuevas (Reed-Solomon en TypeScript propio,
cifrado con WebCrypto); en Rust solo crates que ya están; los comandos nativos nuevos se registran
en `COMANDOS_APP`, en la capability y en el inventario de permisos (lección de DIR1125T).
