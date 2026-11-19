# Contrato · Almacén de neurona por la malla (ALM1118 · 2026-11-18)

Estado: **diseño y contrato. No se escribe código de producto en esta tarea.** Lo que ya
existe se cita con su archivo y su línea; lo que falta se marca como falta, sin adornos.

Ámbito: el disco Maggabit deja de ser la única pieza. La neurona **Maggabox** (Debian,
500 GB, ~425 GB libres) pasa a ser una neurona más de StarSeed OS, con capacidad de
almacén anunciada, espacio privado de la cuenta sellado de punta a punta, espacio público
direccionado por contenido y réplica obligatoria: **nunca es el medio único de nada
principal**. MetaGenesis la usa para respaldos, versiones, datos pesados, capas colectivas
y el contenedor en la nube.

> Regla que manda sobre todas las demás: si un dato principal vive solo en la Maggabox,
> el sistema está mal. La Maggabox acelera, acerca y descarga; no es la única casa.

---

## Índice

0. En diez líneas
1. Lo que ya existe (leído en el repo, no supuesto)
2. El diseño
3. Riesgos y lo que nunca se sirve en público
4. Cómo se ve en Genesis (área de diseño)
5. Pruebas y puertas
6. Cola propuesta
7. Decisiones abiertas
8. Fuentes y cómo se comprobó (grep)

---

## 0 · En diez líneas

1. Cada neurona **anuncia** lo que puede guardar: GB libres medidos, cuota que fija su
   dueño, ámbitos que sirve y cifrado disponible. Se anuncia lo medido; lo no medido va
   como `null`, nunca como cero ni como «sí».
2. **Privado de la cuenta**: el contenido viaja cifrado (AES-256-GCM por pieza, raíz
   Merkle sobre el texto cifrado) y la clave se envuelve **por neurona destinataria** de la
   misma cuenta. La Maggabox y los relés transportan, no leen.
3. **Público**: direccionado por contenido (`urn:ss256:<raíz>`), firmado por quien publica,
   verificable trozo a trozo por cualquiera y re-sembrable sin pedir permiso.
4. **Grupo y comunidad** conservan el ámbito que ya define `enjambre-datos.md`: cifrado,
   id de enjambre opaco por `HMAC(secreto, raíz)`.
5. La **cuota** la fija el dueño de la neurona, no el que escribe. Antes de rechazar por
   cuota se desaloja lo menos usado que **no esté fijado ni retenido y que tenga otra copia
   verificada**.
6. **Réplica obligatoria**: lo principal exige al menos dos medios distintos y una lectura
   de comprobación correcta antes de retirar la copia vieja. La Maggabox nunca cuenta como
   el único medio.
7. **Nada se borra sin copia comprobada**: se verifica tamaño, SHA-256 y lectura de vuelta;
   si falla una, no se borra. Un borrado no se propaga solo (la misma regla que ya rige en
   Google Drive).
8. **Un trabajo a la vez** sobre el medio, con contrapresión: si el disco interno sufre, se
   frena la copia; si el volumen no responde, se devuelve «sin-respuesta» y se sigue.
9. **MetaGenesis** usa este almacén para respaldos (`starseed_memory_root`, `git bundle`
   del repo), versiones, datos pesados y capas; el contenedor en la nube recibe trabajo, no
   la verdad única.
10. **Claves jamás**: ni en anuncios, ni en imanes, ni en semillas, ni en logs, ni en el
    bus. Solo nombres de variables de entorno.

---

## 1 · Lo que ya existe (leído en el repo, no supuesto)

### 1.1 · Elegir medio de almacenamiento por neurona

- **Enrutador de almacenes.** `src/lib/storage/router.ts:50` expone
  `chooseBackend(input, backends, policy)`. `RouteInput` (`:13`) lleva `sizeMb`, `kind`,
  `fundamental` y `term`; `CapacityInfo` (`:25`) describe uso y cuota; `hasCapacity`
  (`:37`) compara `used_mb + sizeMb ≤ quota_mb`. La política (`StoragePolicy`,
  `src/lib/storage/backends.ts:137`) fija `starseedMaxMb`, `keepFundamentalOnStarseed` y
  `preferLargeTarget`. Hoy decide entre el servidor StarSeed (limitado), Google Drive,
  almacén local y fuentes extensibles, con «la memoria fundamental se queda en StarSeed».
- **Registro de backends.** `src/lib/storage/backends.ts:35` (`StorageKindId`) ya incluye
  `starseed`, `gdrive`, `local`, `github`, `webdav`, `s3`, `gcs`, `ipfs`, `casaos` y
  **`neurona`** («volumen por bandas en otra neurona o en el A1»). `StorageBackend`
  (`:111`) describe cuota, uso, prioridad y estado.
- **Volumen en otra neurona.** `src/lib/storage/neurona-driver.ts:67`
  `crearDriverNeurona(transporte, opciones)` parte el archivo en bandas (`trocear`, `:22`),
  calcula SHA-256 (`sha256Hex`, `:28`), arma manifiesto (`manifiestoDe`, `:38`) y expone
  `poner`/`obtener`/`borrar` con un `TransporteNeurona` inyectado (`:11`).
- **Disco de la Mac.** `src/lib/mando/almacenamiento.ts:994` `leerAlmacenamiento()` mide
  disco, regenerables, Drive y swap; `espejar()` (`:457`) lanza el espejo desacoplado;
  `moverADrive()` (`:582`) y `traerDeDrive()` (`:616`) mueven carpetas frías por `id`;
  `cuotaDrive()` (`:508`), `limpiarRegenerables()` (`:740`) y `aliviarMemoria()` (`:872`)
  cierran el cuadro. La ruta que lo sirve es `src/app/api/mando/almacenamiento/route.ts:28`
  (GET) y `:42` (POST: `espejar`, `limpiar`, `aliviar`, `mover`, `traer`,
  `espejo-automatico`), **solo local** por `guardianMando` (`:28` del propio archivo).

### 1.2 · El enjambre de datos: semillas, imanes y espejos

El motor está en `src/lib/enjambre/` y su contrato es `architecture/enjambre-datos.md`.
Es TypeScript puro, solo WebCrypto, **sin cablear a la app** (`src/lib/enjambre/index.ts`
lo dice: «nada fuera de esta carpeta lo importa todavía»).

- **Árbol y piezas.** `src/lib/enjambre/arbol.ts:100` `elegirTamanoPieza(tamano)` elige la
  menor potencia de dos entre 64 KiB y 1 MiB que deja ≤ 2048 piezas; hojas de 16 KiB y
  nodo = SHA-256(izq ‖ der). `geometria()` (`:75`) da la capa de piezas.
- **Semilla.** `src/lib/enjambre/semilla.ts:28` `Semilla` (`v`, `raiz`, `tamano`,
  `tamanoHoja`, `tamanoPieza`, `nombre`, `mime`, `ambito`, `creada`, `meta`, `espejos`,
  `firma`); `AMBITOS` (`:19`) = `privado | grupo | comunidad | publico`; `leerSemilla`
  (`:59`) valida de forma estricta y **en ámbitos no públicos exige nombre y MIME vacíos**
  (van sellados en `meta`). `MAX_ESPEJOS = 4` (`:25`).
- **Imán.** `src/lib/enjambre/iman.ts` implementa
  `starseed:?xt=urn:ss256:<raíz>&dn=…&xl=…&am=…&fi=…&es=…&ra=…&ps=…`;
  `parsearIman` (`:52`) y `formatearIman` (`:130`). **Un imán no lleva claves jamás**:
  cualquier parámetro fuera de la lista (`k`, `key`…) se rechaza entero.
- **Espejos.** `src/lib/enjambre/espejo.ts` es la «web seed» (BEP 19): pide `Range`,
  exige `206` con `Content-Range` coherente, verifica cada trozo y **descarta el espejo
  entero si un trozo no casa**. `validarUrlEspejo` (`src/lib/enjambre/url-segura.ts:40`)
  solo admite HTTPS público (anti-SSRF sintáctico).
- **Almacén de trozos.** `src/lib/enjambre/almacen.ts:44` `AlmacenTrozos`; `AlmacenBase`
  (cuentas, cuotas por ámbito, fijado, referencias y desalojo LRU), `AlmacenMemoria`
  (`:251`) y `AlmacenOPFS` (`:302`). El desalojo es de contenido entero y **nunca toca lo
  fijado ni lo retenido**.
- **Sellado determinista.** `src/lib/enjambre/sellado-contenido.ts` `sellarTodo` (`:110`)
  y `abrirTodo` (`:125`), `idEnjambre` (`:185`, `HMAC(secreto, raíz)`),
  `envolverClave` (`:213`) y `abrirPaqueteClave` (`:225`): la clave de contenido y el
  secreto del enjambre se envuelven por destinatario y **nunca viajan en el imán**.
- **Sesión y política.** `src/lib/enjambre/enjambre.ts:109` `SesionEnjambre` (recolectora
  y sembradora a la vez, `tick()` sin temporizadores propios); `cargarContenido` (`:796`).
  `src/lib/enjambre/politica.ts` decide a quién se sirve (a mis neuronas siempre, a grupos
  por turnos, a lo público solo si la persona lo activa) y `planificador.ts` reparte por
  vías medidas.

### 1.3 · Las capas de capacidades de la neurona

- **Ficha que viaja.** `src/lib/network/capacidades-nodo.ts:27` `CapacidadesNodo` lleva
  `nodoId`, `medio`, `needle`, `bitnet`, `jev`, `ramLibreMb`, `cpu`, `t` y, desde las olas
  de capas, `capas?: string[]` (`id@versión` instaladas), `tokS` **medidos**,
  `bateriaPct`, `enSegundoPlano` y `ambitos?: AmbitoFicha[]`. `AmbitoFicha` (`:9`) =
  `propio | cuenta | publico`; `permitePrivacidad` (`:270`) filtra candidatos por la
  privacidad de la tarea.
- **Preferencia de conciencia.** `src/lib/astraura/capas-conciencia.ts:15` define
  `CapaConciencia = local | mesh | nube | colectiva`; `leerPreferenciaCapas` (`:50`),
  `estadoCapas` (`:174`) y `resumenCapas` (`:213`) traducen la preferencia guardada.
- **Conciencia colectiva.** `src/lib/network/conciencia-colectiva.ts` publica los temas
  `astraura/capacidades`, `astraura/experiencias` y `astraura/adaptador` por la malla;
  `ManifiestoAdaptador` dice qué adaptador es y su SHA. `loteDeExperiencias` (`:72`) y
  `anonimizar` (`:63`) recortan lo que se comparte.
- **Anuncio en las neuronas vinculadas.** `src/lib/malla/anuncio-capas.ts` monta
  `iniciarAnuncioCapas()` y `misCapasAnunciadas()`; `capasAnunciadas`
  (`src/lib/malla/panel-vinculo.ts:239`) convierte la preferencia en
  `capa:local|mesh|nube|colectiva`, y `fijarCapacidadesAnunciadas`
  (`src/lib/malla/sincronizacion-neuronas-motor.ts:896`) lo engancha al motor.
- **Relé de capacidades.** `src/lib/network/capacidad-por-malla.ts` define el espacio de
  nombres `capacidad.*` con tipos `imagen | voz | oido | palabra | transcodificar | render
  | buscar | construir`; hoy **no incluye `almacenar`**: es el hueco que abre este contrato.
- **Dónde se ve.** `/api/mando/capas` (`src/app/api/mando/capas/route.ts:66` GET, `:106`
  POST) junta el catálogo `config/capas-astraura.json`, el estado del renovador y las
  fichas reales de `~/.starseed/capacidades-nodos.json`; solo local.

### 1.4 · El servidor de capas

`native/src-tauri/src/servidor_capas.rs` es el servidor local que se actualiza **por
capas** sin reinstalar la app (contrato `architecture/actualizaciones-por-capas-sop.md`):

- `publico()` (`:143`), `hay_pendiente()` (`:148`), `pedir_busqueda()` (`:244`),
  `preparar()` (`:587`), `elegir()` (`:634`), `tras_lista()` (`:693`), `tras_fallo()`
  (`:720`) e `iniciar_vigia()` (`:1028`).
- La decisión vive aparte y es pura: `servidor_capas_logica.rs:303` `elegir`, `:419`
  `decidir`, `:103` `ruta_segura`, `:239` `compatible`, `:395` `sobrantes`.
- El lado TypeScript que lo acompaña es `src/lib/nativa/relevo-capa.ts`.

Este servidor **no guarda contenidos de la cuenta**: guarda capas de la aplicación. Lo que
se propone aquí reutiliza su patrón (manifiesto + SHA-256 + capa a prueba / activa /
anterior + reintento), no su código de aplicación.

### 1.5 · Funciones de nodo, privadas y públicas

Hoy un nodo de MetaGenesis se identifica y late por RPC de Supabase, no por rutas de
Next. Las funciones exactas están en
`supabase/migrations/20261011100000_metagenesis_nodos.sql`:

- `metagenesis_nodo_hola` (`:194`), `metagenesis_nodo_latir` (`:208`),
  `metagenesis_nodo_ceder` (`:277`), `metagenesis_nodo_baja` (`:286`),
  `metagenesis_nodo_foto` (`:298`), `metagenesis_nodo_colas` (`:311`),
  `metagenesis_nodo_leer_colas` (`:326`), `metagenesis_nodo_bitacora` (`:334`) y
  `metagenesis_nodo_orden_resultado` (`:348`). Alta y baja de nodo:
  `metagenesis_registrar_nodo` (`:364`), `metagenesis_revocar_nodo` (`:382`) y
  `metagenesis_podar` (`:397`). Cada nodo usa **su llave** (solo se guarda su huella
  SHA-256); nunca la clave de servicio.
- **Rutas públicas o semipúblicas del nodo**: `POST /api/metagenesis/orden`
  (`src/app/api/metagenesis/orden/route.ts:21`, bearer de sesión y firma),
  `GET /api/astraura/nodos` (`src/app/api/astraura/nodos/route.ts:87`, candidatos por
  tarea y privacidad), `POST|GET /api/storage/gcs/sign`
  (`src/app/api/storage/gcs/sign/route.ts:206` y `:274`, URLs firmadas bajo `<uid>/…`) y
  `GET /api/neuronas/insomne` (`src/app/api/neuronas/insomne/route.ts`, 404 fuera de
  local).
- **Rutas privadas de la máquina**: `/api/mando/almacenamiento`, `/api/mando/capas`,
  `/api/mando/neurona` y el resto de `/api/mando/*` pasan por `guardianMando` y devuelven
  404 fuera del despliegue local.

**Ninguna de estas funciones acepta hoy bytes de almacén de una cuenta.** Son identidad,
latido, órdenes y firmas. El almacén de neurona necesita su propia puerta (sección 2).

### 1.6 · Lo que ya hay en la Maggabox, y lo que falta

- `scripts/puente/respaldo_maggabox.py` (ALM1118B) ya trae órdenes `plan`,
  `respaldar [--seco]`, `aliviar [--seco] [--objetivo-gb]` y `estado`; conecta por SSH con
  `BatchMode` y `ConnectTimeout=8` a `maggasukha@starseed-nodo-1.local`; escribe en
  `~/StarSeed-almacen/`; copia `starseed_memory_root` a
  `respaldos/mac/starseed_memory_root`, crea `git bundle` del repo en
  `respaldos/mac/repo-<fecha>.bundle` (conserva 7), registra en `respaldos/mac/respaldos.log`
  y excluye siempre `~/.starseed/env`, `.env*`, `~/.ssh`, `*.pem`, `*key*` y credenciales.
  `aliviar` mueve a `pesados/` solo lo regenerable y **verifica número de entradas y
  tamaño antes de retirar de la Mac**.
- Sus pruebas `scripts/puente/test_respaldo_maggabox.py` son herméticas (SSH, rsync y
  disco simulados; sin red ni `~/.ssh`).
- **Falta en el repo**: el árbol `espejo/`, `versiones/`, `capas/privadas/`,
  `capas/publicas/` y `nube/`, y los temporizadores de **espejo cada 15 min** y
  **versiones cada 1 h**. El prompt del director los da por «ya hay o habrá al pasar el
  guion del nodo»; este contrato los especifica (sección 2.8) y la cola los construye.
- El contrato del disco Maggabit (`architecture/maggabit-almacenamiento-vivo.md`) ya
  escribe el principio que aquí se hereda: su manifiesto tiene un campo
  **`solo_en_maggabit`** para listar «lo que no tiene otra casa». Eso es exactamente lo
  que este contrato prohíbe para lo principal.

---

## 2 · El diseño

### 2.1 · Vocabulario

| Palabra | Qué es |
|---|---|
| **Ficha de almacén** | El anuncio firmado de una neurona: cuánto puede guardar y con qué reglas. |
| **Espacio privado de la cuenta** | Contenido sellado; solo lo abren las neuronas de la misma cuenta. |
| **Espacio público** | Contenido direccionado por su raíz; cualquiera lo verifica y lo re-siembra. |
| **Capa pública** | Un contenido publicado como capa colectiva (puntero firmado → raíz). |
| **Réplica** | Copia verificada del mismo contenido en otro medio. |
| **Medio** | Disco, neurona, Drive, nube, GCS, A1… Cada `StorageBackend` es un medio. |
| **Copia comprobada** | Escritura terminada y lectura de vuelta con tamaño y SHA-256 correctos. |

### 2.2 · La ficha de almacén que anuncia la neurona

La neurona publica la ficha en su latido y en el anuncio de capacidades, **firmada por su
clave de dispositivo** (el verificador que ya existe: `crearVerificador`,
`src/lib/enjambre/firmas.ts:90`). Campos:

```json
{
  "v": 1,
  "nodoId": "maggabox",
  "medio": "linux",
  "libresGb": 398,
  "cuotaGb": 300,
  "usadoGb": 27,
  "reservadoGb": 25,
  "ambitos": ["propio", "cuenta", "publico"],
  "cifrado": true,
  "publico": true,
  "t": 1763500000000,
  "firma": { "fp": "…", "sig": "…", "pub": "…" }
}
```

Reglas de la ficha:

1. **Medido o `null`.** `libresGb` sale de una medición real; si no se pudo medir, `null`
   y la neurona no acepta escrituras nuevas. Nunca se anuncia un cero que parezca «lleno»
   ni un número inventado.
2. **Cuota del dueño.** `cuotaGb` la fija quien es dueño de la neurona (Alex, en la
   Maggabox), no quien escribe. `reservadoGb` protege el sistema operativo y los trabajos
   en curso. La capacidad efectiva es `min(libresGb − reservadoGb, cuotaGb − usadoGb)`.
3. **Sin rutas ni claves.** La ficha no lleva rutas de disco, ni IP, ni nombres de
   máquina, ni variables de entorno. Lleva el `nodoId` público que ya usa la malla.
4. **Un ámbito se anuncia solo si se sirve de verdad.** `ambitos` no promete: si
   `publico` está apagado, la neurona no acepta contenido público aunque tenga espacio.
5. **La ficha caduca.** Pasado el TTL (15 min, el mismo del latido de nodo), una ficha sin
   refresco no se usa para colocar contenido nuevo.

### 2.3 · Espacio privado de la cuenta, cifrado de punta a punta

Se apoya en lo que el motor del enjambre ya prueba; no se inventa otro cifrado.

- **Qué se cifra.** El contenido en claro se sella **antes** de tocar el árbol:
  `sellarTodo(clave, claro, tamanoPieza)` (`sellado-contenido.ts:110`) produce el texto
  cifrado; la raíz Merkle se calcula **sobre el texto cifrado**, así cualquiera verifica
  trozos sin poder leer.
- **Quién puede leer.** Solo una neurona de la **misma cuenta**. La clave de contenido y
  el secreto del enjambre se envuelven por destinatario con
  `envolverClave(ganchos, destinatarios, raiz, clave, secreto)` (`:213`); la neurona
  destinataria los abre con `abrirPaqueteClave` (`:225`). El sobre usa el transporte de
  `recipient-crypto` y las claves vivas o certificadas de
  `src/lib/malla/claves-destinatario.ts` (`resolverClaves`, `:64`;
  `fuenteInstantanea`, `:138`).
- **Membresía.** Antes de abrir, la neurona comprueba que la clave del par pertenece a un
  aparato de su cuenta (la misma comprobación que `fuenteInstantanea` recibe como
  `esDeLaCuenta`, `claves-destinatario.ts:138`). Un aparato de otra cuenta, aunque tenga el
  sobre, no puede abrirlo.
- **Lo que ve el medio.** La Maggabox ve **tamaño, raíz y trozos**, nunca el nombre, el
  MIME ni el contenido: nombre y MIME viajan sellados en `meta`
  (`sellarMetadatos`, `sellado-contenido.ts:155`).
- **Id opaco.** En lo no público, el id que circula es `HMAC(secreto, raíz)`
  (`idEnjambre`, `:185`); quien no es de la cuenta no reconoce el contenido.
- **Precio declarado.** Dos cuentas con el mismo archivo y distinta clave producen raíces
  distintas: **no hay deduplicación entre cuentas**. Es el precio de que lo privado sea
  privado y se asume.

### 2.4 · Espacio público direccionado por contenido (capas colectivas)

- **Dirección = raíz.** `urn:ss256:<raíz>`; el tamaño y el tamaño de pieza salen del imán o
  de la semilla. `elegirTamanoPieza` (`arbol.ts:100`) garantiza que dos neuronas que solo
  conocen la raíz y el tamaño coinciden.
- **Publicar** es firmar una `Semilla` de ámbito `publico` y dar un imán. La firma se
  verifica con `crearVerificador` y, si hay certificado de cuenta, con `verificarCert`.
- **Servir** es ser espejo: `espejo.ts` exige `Range` y verifica cada trozo; un trozo malo
  mata ese espejo. La Maggabox puede servir por HTTPS detrás de la puerta anti-SSRF del OS.
- **Capas colectivas** usan el **canal** firmado (`canal.ts`): puntero
  `(huella del editor, nombre, seq) → raíz`; gana la `seq` más alta. Una capa pública no
  se lista: se pide por su puntero. **No hay listado de directorio.**
- **Cualquiera re-siembra**, y por eso el público es la forma más barata de que una capa
  colectiva no dependa de la Maggabox.
- **Lo público se puede auditar**: todo trozo se verifica contra la raíz antes de servirse
  y después de bajarse.

### 2.5 · Cuota, contrapresión y desalojo

- **Cuotas por ámbito** con el `Cuotas = Partial<Record<Ambito, number>>` que ya tipa
  `almacen.ts`; la cuota del dueño manda sobre la suma de ámbitos.
- **Antes de rechazar**, se desaloja lo menos usado (LRU) **del mismo ámbito** que no esté
  `fijado` ni `retenido` y que **tenga otra copia comprobada**. Un contenido a medias no se
  desaloja a medias: se va entero o no se va.
- **Un trabajo a la vez** sobre cada medio. Si el disco interno está bajo presión, se frena
  con `--bwlimit` (como ya hace `maggabit-almacenamiento-vivo.md`); si el volumen no
  responde, «sin-respuesta» y se sigue.
- **Nada de sondeos en bucle**: la ficha se refresca con el latido (15 min) y los trabajos
  se disparan por temporizador, no por consulta constante.

### 2.6 · Réplica obligatoria: nunca un solo medio

Se clasifica el contenido antes de decidir dónde vive:

| Clase | Ejemplos | Réplica mínima |
|---|---|---|
| **Principal** | `starseed_memory_root`, repo y versiones, datos de cuenta, producción | **2 medios distintos**, y uno **fuera de la Maggabox** |
| **Pesado** | cachés de compilación, artefactos, material de producción regenerable | 1 medio, con la receta de reconstrucción escrita |
| **Público** | capas colectivas públicas, publicaciones | 1 medio + la posibilidad de re-sembrar por cualquiera |
| **Efímero** | temporales de un trabajo | 0 medios garantizados |

- La regla se evalúa con un **manifiesto** como el de `memoria-manifiesto.ts`
  (`construirManifiesto`, `:29`; `divergencias`, `:56`), que ya agrupa copias por huella y
  destino. Si un principal queda con `destinos.length === 1`, se marca **en riesgo** y se
  replica antes de cualquier poda.
- **La Maggabox nunca es el único destino** de un principal. Si es la única copia, el
  sistema lo dice en Genesis y lo arregla; no lo esconde.
- **Nunca se borra sin copia comprobada.** La secuencia es: escribir en destino temporal →
  leer de vuelta → comparar tamaño y SHA-256 → mover a su sitio → solo entonces se puede
  retirar la copia anterior. Si falla cualquier paso, no se borra.
- **Un borrado no se propaga solo.** La regla de Drive (`gdrive-brain-sync.md`: «el más
  nuevo gana, ningún borrado se propaga solo») se hereda aquí.

### 2.7 · Cómo lo usa MetaGenesis

- **Respaldos.** `respaldo_maggabox.py` ya manda `starseed_memory_root` y el `git bundle`
  del repo. El contrato añade: cada respaldo entra en el manifiesto con su SHA-256 y su
  medio; un principal con una sola copia se replica a un segundo medio (Drive, A1 o GCS).
- **Datos pesados.** Lo regenerable se mueve a `pesados/` **solo tras copia verificada** y
  nunca si está en cola o en uso. Lo que no se puede reconstruir no es «pesado»: es
  principal y exige réplica.
- **Versiones.** `versiones/` guarda las versiones completas y listas para instalar; se
  conservan las últimas y las estables, como ya hace `maggabit_versiones.py` en el disco
  Maggabit (`canal-pruebas` conserva 3, nunca toca una estable).
- **Capas.** `capas/privadas/` sirve capas colectivas cifradas de la cuenta;
  `capas/publicas/` sirve capas públicas verificables. Son ámbitos distintos y **no se
  mezclan**: una capa privada no se publica por el solo hecho de estar en la Maggabox.
- **Contenedor en la nube.** El contenedor recibe trabajo y artefactos, no la verdad
  única. Lo que produzca se replica al medio principal y entra en el manifiesto; un
  contenedor que se apaga no puede llevarse la única copia.
- **Órdenes.** MetaGenesis manda por `POST /api/metagenesis/orden` y por las RPC
  `metagenesis_nodo_*`; el almacén añade una orden nueva de recolección («recolecta lo que
  falte», «verifica esta réplica») con la misma firma y lista blanca.

### 2.8 · El nodo Maggabox y sus temporizadores

- **Máquina**: Debian, 500 GB, ~425 GB libres. Es una neurona `linux` con una llave
  propia; nunca usa la clave de servicio.
- **Árbol de trabajo** (en el nodo):

```text
~/StarSeed-almacen/
  espejo/            copia viva del repo y de lo que cambia (cada 15 min)
  versiones/         versiones completas e instaladores (cada 1 h)
  respaldos/         respaldos de sistemas y de la Mac (ya existe: respaldos/mac)
  pesados/           datos pesados y regenerables, tras copia verificada (ya existe)
  capas/privadas/    capas colectivas cifradas de la cuenta
  capas/publicas/    capas colectivas públicas
  nube/              lo que baja o sube del contenedor de MetaGenesis
  estado/            manifiesto, latidos y registro de trabajos
```

- **Temporizadores**: `espejo.timer` cada 15 min y `versiones.timer` cada 1 h, con
  `Persistent=true` en systemd para no perder la pasada si el nodo estaba apagado, y
  «un trabajo a la vez» (`flock` o el cerrojo del propio guion). El respaldo general sigue
  a su ritmo (6 h en el plist de ejemplo).
- **Latido**: publica la ficha de almacén y el estado de los trabajos por las RPC del nodo;
  si el nodo cae, su ficha caduca y no se coloca contenido nuevo allí.
- **Salud**: si un temporizador falla tres veces seguidas, se dice **una vez** (como
  `avisos()` de `maggabit_verificar.py`) y no se repite en cada vuelta.

### 2.9 · Recorridos

1. **Publicar una capa pública**: no se sella (va en claro) → `Semilla` pública firmada →
   subir trozos a la Maggabox y/o GCS → imán con espejos → canal firmado con `seq` nueva.
2. **Guardar algo privado de la cuenta**: clave de contenido nueva → `sellarTodo` →
   `Semilla` privada con `meta` sellada → envolver clave a las neuronas de la cuenta →
   copiar trozos a la Maggabox → verificar en destino → replicar a un segundo medio.
3. **Leer**: resolver la clave del sobre → pedir trozos por la malla o por un espejo →
   verificar contra la raíz → `abrirTodo` → escribir en el almacén local.
4. **Replicar**: comparar manifiestos por huella → elegir un medio con capacidad y ámbito
   compatible → copiar → leer de vuelta → anotar la nueva copia.
5. **Podar**: solo contenido con réplica comprobada; se anota en el manifiesto y se avisa
   una vez.

---

## 3 · Riesgos y lo que nunca se sirve en público

### 3.1 · Lo que **nunca** se sirve en público

1. **Claves y secretos**: variables de entorno, `~/.starseed/env`, `.env*`, `~/.ssh`,
   `*.pem`, `*.p12`, credenciales de conectores y tokens OAuth. Ni en un anuncio, ni en
   un imán, ni en una semilla, ni en un log, ni en el bus de eventos.
2. **Contenido privado en claro**: ni el nombre, ni el MIME, ni el cuerpo. Lo único que
   puede ver el medio es el tamaño, la raíz del cifrado y los trozos cifrados.
3. **Metadatos de la cuenta**: ids de dispositivo, identidad de la malla, biometría, PIN,
   passkeys y claves de recuperación.
4. **Rutas y topología**: rutas absolutas del disco, IPs internas, nombres de máquina,
   usuarios del sistema y la lista de nodos de una cuenta.
5. **Listados de directorio**: lo público se pide por raíz o por canal; el almacén público
   **no enumera** lo que tiene.
6. **Contenido sin verificar**: un trozo que no casa con la raíz no se sirve nunca, ni se
   guarda como bueno.
7. **La sesión personal de nadie**: un aparato personal solo puede ser nodo público dentro
   de un contenedor o usuario aislado (regla ya escrita en
   `architecture/control-remoto-entre-neuronas.md:195`).

### 3.2 · Riesgos y su respuesta

| Riesgo | Respuesta del contrato |
|---|---|
| La Maggabox se convierte en el único medio | Manifiesto con `solo_en_maggabit` prohibido para principales; réplica a un segundo medio antes de podar |
| Borrado que se pierde | Nunca se borra sin copia comprobada (tamaño + SHA-256 + lectura de vuelta) |
| Borrado que se propaga solo | Se hereda la regla de Drive: el más nuevo gana, ningún borrado se propaga solo |
| Cuota agotada | Cuota del dueño, reserva del sistema, desalojo LRU de lo que tenga otra copia y rechazo honesto con motivo |
| Disco exFAT o volumen mudo | Todo subprocess con timeout; «sin-respuesta» y se sigue (principio 0 de Maggabit) |
| SSRF por un espejo malicioso | `validarUrlEspejo` sintáctico + la puerta de internet con DNS resuelto y anti-rebinding |
| Rebinding o redirección | `redirect: "manual"` y revalidar cada salto (`crearFetchEspejoSeguro`) |
| Trozo envenenado | Verificación por trozo contra la raíz; un trozo malo descarta el espejo entero |
| Cifrado mal usado | Clave por contenido y versión, nonce derivado de clave + índice, AAD con índice y total |
| Fuga por el contenedor de la nube | El contenedor no guarda la verdad única; lo producido se replica y entra en el manifiesto |
| Ficha mentida o vieja | Ficha firmada, medida o `null`, con TTL de 15 min |
| Nodo comprometido | Llave por nodo (solo su huella en la base), revocación por `UPDATE`, y el nodo no puede leer lo privado |
| Dos cuentas deduplicadas por accidente | En lo privado no hay deduplicación: raíces distintas por clave |
| Saturación del nodo | Un trabajo a la vez, contrapresión y `--bwlimit` |
| Reloj y caducidades | Los sobres y las órdenes llevan su tiempo; un reloj muy desviado no se toma por verdad |

---

## 4 · Cómo se ve en Genesis (área de diseño)

No hay UI nueva en esta tarea, pero el contrato fija cómo se enseñará para que el diseño no
invente otra identidad. Manda `memory/diseno/` (`identidades.md`, `armonia.md`,
`referencias.md`) y los tokens existentes.

- **Identidad**: Genesis (cristal operativo, `--mc-neon-cian` 34/211/238, violeta
  167/139/250, ámbar 251/191/36, radio `0.85rem`). No se introduce un hex nuevo si existe
  token; los estados usan el color semántico ya presente (ámbar = aviso, rojo = en riesgo).
- **Composición**: una tarjeta por neurona en rejilla de dos columnas `1 : 1.618`
  (contenido en la mayor, réplica y estado en la menor); en móvil colapsa a una columna en
  orden propósito → acción → apoyo.
- **Espaciado y escala**: peldaños Fibonacci (`8 · 13 · 21 · 34 · 55`) y escala tipográfica
  φ en tablet/escritorio/TV; escala 1.25 por debajo de 430 px, conservando cuerpo de 16 px.
- **Medidor de capacidad**: barra con `libres`, `cuota` y `reservado`; el número es el
  dato, la barra solo lo acompaña. Sin animación infinita; `transform` y `opacity` a
  140–240 ms y alternativa con `prefers-reduced-motion`.
- **Estado de réplica**: pastilla «2 medios · verificado» o «1 medio · en riesgo»; nunca
  un check sin fecha. El detalle enseña el manifiesto por huella y destino.
- **Geometría**: la flor de la vida o la vesica solo como capa `aria-hidden` de fondo,
  opacidad baja y sin eventos; jamás detrás de texto sin velo.
- **Accesibilidad**: contraste ≥ 4.5:1, dianas ≥ 44 px, foco visible, `cursor-pointer` en
  lo clicable, iconos Lucide (nunca emojis como icono) y textos en español con acentos.
- **Pantallas a comprobar**: 280, 360×780, 430×932, 768×1024, 1024×1366, 1280×800,
  1920×1080 y 3840×2160; táctil y puntero; claro/oscuro, texto largo, vacío, error, alto
  contraste y movimiento reducido. Puerta: sin overflow horizontal, sin texto cortado y
  sin errores de consola.

---

## 5 · Pruebas y puertas

- **Lógica pura con pruebas, sin red ni aparatos reales.** Cada módulo nuevo separa la
  decisión (funciones puras: ficha, ámbitos, réplica, plan de espejo) de la E/S (disco,
  SSH, `fetch`). Las pruebas usan datos inventados y dobles; jamás tocan `/Volumes`, la
  red, `~/.ssh` ni `~/.starseed`.
- **Vitest** para TypeScript: `import { describe, it, expect } from "vitest"`, sin
  `vi.mock` de módulos de Node y sin importar un `route.ts`.
- **`unittest`** (ejecutable con `pytest`) para el nodo Python, con `subprocess` y sistema
  de archivos simulados, como ya hace `scripts/puente/test_respaldo_maggabox.py`.
- **Puertas del repo**: `bash scripts/enjambre/tsc-turno.sh` (nunca `npx tsc` directo) y
  `npx vitest run <archivo o carpeta concreta>` (nunca la suite entera). Cada ejecución
  debe imprimir su resumen (`Test Files … passed`, `Tests … passed`); sin resumen no se
  comprobó nada.
- **Prueba de restauración**: un respaldo no está verificado hasta que se restaura en una
  carpeta temporal y se compara el commit o el SHA-256. Es la misma idea que
  `plan_verificacion` de `maggabit_verificar.py`.
- **Nada de borrar sin copia comprobada** se prueba con un caso explícito: destino que no
  responde → no se borra; SHA distinto → no se borra.

---

## 6 · Cola propuesta

La construcción va por partes en
`starseed_memory_root/olas/cola-almacen-neurona-1118.json` (5 tareas pequeñas, cada una de
≤ 3 archivos y ≤ 120 líneas por escritura, con su prueba):

| Id | Qué construye |
|---|---|
| `ALM1118C` | Ficha de capacidad de almacén (GB libres, cuota del dueño, contrapresión) |
| `ALM1118D` | Ámbitos y custodia: privado de la cuenta / público y quién puede leer |
| `ALM1118E` | Réplica obligatoria: nada principal en un solo medio ni solo en la Maggabox |
| `ALM1118F` | Backend «almacén de neurona» en el registro y el enrutador |
| `ALM1118G` | Nodo de almacén en la Maggabox: espejo y versiones sin borrar sin copia |

El cableado a la UI y a las rutas de Next va en una ola posterior, cuando las piezas puras
estén verdes.

---

## 7 · Decisiones abiertas (para Alex)

1. **Cuota por defecto** de la Maggabox: la propuesta es 300 GB de cuota con 25 GB
   reservados; el resto queda libre para el sistema y los trabajos.
2. **Retención**: cuántas versiones diarias y semanales se conservan en `versiones/`
   (hoy el disco Maggabit usa 14 diarios y 8 semanas).
3. **Rotación de la clave de contenido**: hoy es una por contenido y versión; falta decidir
   si se re-sella al cambiar de medio o de miembro de la cuenta.
4. **Moderación de capas públicas**: quién puede publicar una capa colectiva pública y con
   qué firma de cuenta.
5. **Tope del contenedor en la nube**: cuánto puede ocupar lo que baja del contenedor antes
   de replicarse y podarse.

---

## 8 · Fuentes y cómo se comprobó (grep)

Comandos usados para no suponer nada (ejecutados sobre este repo):

```bash
grep -n "export function chooseBackend" src/lib/storage/router.ts
grep -n "export type StorageKindId\|export interface StorageBackend\|interface StoragePolicy" src/lib/storage/backends.ts
grep -n "export function crearDriverNeurona" src/lib/storage/neurona-driver.ts
grep -n "export async function espejar\|moverADrive\|traerDeDrive\|leerAlmacenamiento" src/lib/mando/almacenamiento.ts
grep -n "export interface Semilla\|export function leerSemilla" src/lib/enjambre/semilla.ts
grep -n "export function parsearIman\|export function formatearIman" src/lib/enjambre/iman.ts
grep -n "export function elegirTamanoPieza" src/lib/enjambre/arbol.ts
grep -n "export class AlmacenBase\|export interface AlmacenTrozos" src/lib/enjambre/almacen.ts
grep -n "export function sellarTodo\|abrirTodo\|idEnjambre\|envolverClave" src/lib/enjambre/sellado-contenido.ts
grep -n "export class SesionEnjambre" src/lib/enjambre/enjambre.ts
grep -n "export interface CapacidadesNodo" src/lib/network/capacidades-nodo.ts
grep -n "export type CapaConciencia\|leerPreferenciaCapas\|estadoCapas" src/lib/astraura/capas-conciencia.ts
grep -n "pub fn publico\|pub fn elegir\|pub fn preparar\|pub fn iniciar_vigia" native/src-tauri/src/servidor_capas.rs
grep -n "CREATE OR REPLACE FUNCTION public.metagenesis_nodo_" supabase/migrations/20261011100000_metagenesis_nodos.sql
grep -n "export async function GET\|export async function POST" src/app/api/metagenesis/orden/route.ts src/app/api/astraura/nodos/route.ts src/app/api/storage/gcs/sign/route.ts
grep -rn "StarSeed-almacen" scripts/puente
```

Documentos que mandan: `architecture/enjambre-datos.md`,
`architecture/maggabit-almacenamiento-vivo.md`, `architecture/persistencia-entre-medios.md`,
`architecture/datos-por-la-malla.md`, `architecture/control-remoto-entre-neuronas.md`,
`architecture/colmena-relevo-contenedores.md` y `memory/diseno/`.

> Este contrato no escribe código de producto. Las tareas de la cola sí; cada una entra por
> las puertas de siempre y nada está hecho hasta que se ve en Genesis de la Mac.
