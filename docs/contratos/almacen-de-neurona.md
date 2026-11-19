# Contrato · el almacén de una neurona

**Ola:** ALM1118 · **Fecha:** 2026-11-18 · **Estado:** contrato, sin código de producto
**Tarea:** ALM1118A-d1 · **Área:** diseño y arquitectura del almacenamiento
**Depende de:** nada. **Habilita:** la cola de la §7, que materializa la parte 2 de la cadena.

Este documento fija qué guarda una neurona, dónde, para quién y con qué réplica. No implementa:
describe el contrato que el código debe cumplir. Cuando algo ya existe se cita con ruta y línea;
cuando solo está planeado se dice «objetivo» y no se presenta como hecho.

## 0 · Principios

1. **La neurona no es un disco suelto: es una capacidad con dueño.** Antes de prestar un byte hay
   un consentimiento explícito y una cuota que fija el dueño. Sin cuota no hay oferta.
2. **Lo privado se cifra en el origen.** El nodo que guarda no debe poder leer: recibe trozos
   cifrados y una raíz; ni el nombre ni el tipo de archivo viajan en claro.
3. **Lo público se direcciona por contenido.** Una capa colectiva se identifica por su raíz
   Merkle y su semilla firmada, no por una ruta de servidor ni por el id de quien la subió.
4. **Ningún principal vive en un solo medio.** Repo, memoria, versiones y capas colectivas tienen
   al menos dos copias en medios distintos, y la segunda se comprueba antes de dar la primera por
   buena.
5. **Ausencia no es error.** Si la Maggabox, un volumen o un par no está, el sistema sigue y lo
   dice; no espera ni borra para «arreglarlo».
6. **Borrar es el último paso, nunca el primero.** No se libera espacio sin copia verificada
   (tamaño, número de entradas y SHA-256) en otro medio.

## 1 · Lo que ya existe

Esta sección es inventario, no deseo. Sirve para que la implementación enchufe en lo que ya hay
en vez de inventar una segunda arquitectura de almacenamiento.

### 1.1 · Elección del medio de almacenamiento por neurona

El contrato de tipos ya modela el almacén como un recurso asignable por elemento:

- `src/lib/recursos-ia/tipos.ts:76` `TipoAlmacen`, `:87` `MedioAlmacen`, `:281` `Asignacion`,
  `:293` `Topologia`, `:308` `ConfigTopologia`; el inventario de la neurona lleva `almacenes`
  (`:165`), `almacenesSueltos` (`:175`) y `almacenesDeclarados` (`:367`).
- `src/lib/recursos-ia/deteccion.ts:204` `almacenesDeMaquina(...)` y `:492`
  `almacenesDeCarpetas(...)` clasifican volúmenes nativos y carpetas vinculadas (de esta neurona y
  de la cuenta); `:237` `esVolumenNativo`.
- `src/lib/recursos-ia/sugerencias.ts:204` `candidatos(...)`, `:155` `topologiaSugerida(...)` y
  `:451` `sugerirPlan(...)` deciden qué va a qué medio; `:29` `OpcionesPlan` y `:46`
  `VIAS_POR_DEFECTO` fijan las vías.
- `src/lib/recursos-ia/enrutado.ts:54` `destinoDeIA(...)` traduce la asignación a destino real.
- `src/lib/recursos-ia/oferta-desde-asignaciones.ts:102` `ofertaDesdeAsignaciones(...)` convierte
  la asignación en oferta publicable; suma los GB libres a `prestaMb` (`:129`) y respeta el tope
  `discoMb` (`:140`).
- `src/lib/recursos/oferta.ts:1` `OfertaNeurona` con `almacen.prestaMb` y `volumenes` (`:12-15`),
  `presta.cuenta|grupos|publico` y `presta.topes.discoMb` (`:30-38`); `:57` `ofertaVisiblePara(...)`
  y `:67` `capacidadPrestable(...)` recortan la oferta a lo consentido.
- `src/lib/recursos/bolsa.ts:17` `planificar(...)` elige entre ofertas; `src/lib/recursos/sesion-prestamo.ts:31`
  `crearSesion(...)`, `:65` `permitido(...)`, `:78` `revocar(...)`.
- `src/lib/storage/neurona-driver.ts` guarda un volumen en otra neurona o en el A1 por bandas de
  4 MiB con manifiesto y `sha256Hex`; no fija canal ni credenciales.

En corto, la elección de hoy es: detectar volúmenes y carpetas (`almacenesDeMaquina(...)`,
`almacenesDeCarpetas(...)`), descartar los que no tienen espacio o ámbito, ordenar por vía (nativo,
local, red) y capacidad, asignar cada elemento con `sugerirPlan(...)` y convertir la asignación en
oferta con `ofertaDesdeAsignaciones(...)`. Es una decisión determinista y comprobable sin disco.

La pieza que falta es la **política de almacén**: hoy el tipo y la oferta existen, pero no hay una
cuota por cuenta, ni una prueba de espacio, ni una regla de réplica que se aplique sola.

### 1.2 · El enjambre de datos: semillas, imanes y espejos

El contrato `architecture/enjambre-datos.md` (ENJ1110A) y su motor en `src/lib/enjambre/` ya
resuelven el «cómo» de guardar y encontrar contenido sin servidor central:

- **Dirección por contenido.** `src/lib/enjambre/arbol.ts:75` `geometria(...)`, `:100`
  `elegirTamanoPieza(...)` y `:132` `ConstructorArbol` construyen un árbol Merkle SHA-256 con
  hojas de 16 KiB y piezas de 64 KiB a 1 MiB. La raíz es la identidad del contenido.
- **Semilla.** `src/lib/enjambre/semilla.ts:28` `Semilla`, `:59` `leerSemilla(...)`, `:134`
  `semillaDeArbol(...)`, `:156` `semillaMinima(...)`; `:19` `AMBITOS` separa `privado`, `grupo`,
  `comunidad` y `publico`, y `:25` `MAX_ESPEJOS` acota los espejos.
- **Imán.** `src/lib/enjambre/iman.ts:24` `Iman`, `:52` `parsearIman(...)`, `:130`
  `formatearIman(...)`; el prefijo `starseed:?` (`:21`) y el límite de 2048 caracteres (`:22`)
  hacen que un imán quepa en un mensaje y no sea una URL de servidor.
- **Espejo.** `src/lib/enjambre/espejo.ts:20` `RespuestaEspejo`, `:28` `SUFIJO_CAPA = ".enj-capa"`,
  `:30` `crearFetchEspejoSeguro(...)` y `:57` `EstadoEspejo`; el fetch de espejo valida host,
  esquema y redirecciones antes de pedir una pieza.
- **Política.** `src/lib/enjambre/politica.ts:23` `ROLES_NEURONA` (`sembradora-fija`,
  `sembradora-ocasional`, `solo-recolectar`), `:79` `AJUSTES_ENJAMBRE_POR_DEFECTO` con
  `sembrarPublico: false` y `relevoCiego: false` (`:83-84`), y `:92` cuotas por ámbito
  (privado 4096 MiB, grupo 2048, comunidad 1024, público 512). `:40` `rolAutomatico(...)`,
  `:136` `cuotasEnBytes(...)`, `:246` `decidirServir(...)` y `:292` `aceptarGuardar(...)`.
- **Almacén de trozos.** `src/lib/enjambre/almacen.ts:44` `AlmacenTrozos`, `:78` `AlmacenBase`,
  `:302` `AlmacenOPFS`; `:199` `fijar(...)` impide el desalojo de lo fijado, `:234`
  `desalojar(...)` aplica LRU por ámbito y `:177` respeta el tope de cada ámbito.
- **Protocolo y sesión.** `src/lib/enjambre/protocolo.ts:189` `leerMensajeEnj(...)` valida
  `MsgAnuncio` (`:41`), `MsgTengo` (`:54`), `MsgPide` (`:64`), `MsgTrozo` (`:72`), `MsgNo` (`:81`),
  `MsgCancela` (`:88`), `MsgPares` (`:99`), `MsgCapa` (`:105`) y `MsgCanal` (`:116`);
  `src/lib/enjambre/enjambre.ts:109` `SesionEnjambre`, `src/lib/enjambre/planificador.ts:105`
  `Planificador` y `:525` `SuperSembrador` reparten y recolectan piezas.
- **Sellado del contenido.** `src/lib/enjambre/sellado-contenido.ts:29` `BYTES_TAG`, `:33`
  `ClaveSellado`, `:86` `sellarPieza(...)`, `:110` `sellarTodo(...)`, `:147` `MetadatosSellados`,
  `:155` `sellarMetadatos(...)`, `:185` `idEnjambre(...)`, `:213` `envolverClave(...)` y `:225`
  `abrirPaqueteClave(...)`: el identificador de un enjambre privado es `HMAC(secreto, raiz)` y la
  clave viaja envuelta por destinatario.

Estado real: es una biblioteca pura y probada (`src/lib/enjambre/__tests__/arbol-sellado-iman.test.ts`,
`simulacion-enjambre.test.ts`). El cableado a la interfaz y al servidor de la neurona es la parte B
del contrato; no se presume hecho aquí.

### 1.3 · Capas de capacidades de la neurona

Hay dos cosas distintas que este documento no debe mezclar: las **capas de capacidades** (qué
puede hacer una neurona y en qué ámbito lo anuncia) y las **capas de Astraura** (pesos de modelo
que se descargan y se sirven). Las primeras:

- `src/lib/network/capacidades-nodo.ts:27` `CapacidadesNodo` declara `capas`, `tokS` y `ambitos`;
  `:11` `AmbitoFicha` es `propio | cuenta | publico` y `:14` `PrivacidadConsulta` decide qué se
  responde. `:197` `crearFichaNodo(...)`, `:238` `fichaCompacta(...)` con tope de 200 bytes
  (`:227`), `:270` `permitePrivacidad(...)` y `:277` `filtrarPorPrivacidad(...)`.
- `:310` `iniciarPublicacionCapacidades(...)` y `:347` `anunciar(...)` publican la ficha;
  `:356` `elegirDeliberador(...)` y `:376` `elegirReflejo(...)` eligen pares; `:409`
  `resumenRed(...)` resume la malla.
- `src/lib/network/ficha-propia.ts` conecta la ficha con los dos transportes
  (`publicarMalla`, `publicarServidorMalla`) y decide el medio con `medioDesdePlataforma`.
- `src/lib/malla/anuncio-capas.ts:16` `iniciarAnuncioCapas(...)` y `:21` `misCapasAnunciadas(...)`
  leen la preferencia guardada y aplican las capas anunciadas; el módulo **no anuncia contexto
  personal**: solo capas y ámbitos consentidos.
- `src/lib/astraura/capas-conciencia.ts:16` `CapaConciencia` es
  `local | mesh | nube | colectiva`; `:18` `CAPAS`, `PREFERENCIA_CAPAS_DEFECTO` (las cuatro
  activas), `leerPreferenciaCapas(...)` y `:85` `preferenciaCapasGuardada(...)`.
- `src/lib/malla/puerta/capas.ts:19` `TipoCapa` (`servidor-propio`, `lan`, `router-publico`,
  `ia-neurona`), `:31` `CapaPuerta`, `:139` `detectarCapas(...)`, `:219` `capaAlcanza(...)` y
  `:227` `capaDeDestino(...)`; una capa privada no se anuncia como pública por accidente.
- Capas de Astraura (pesos): `src/lib/astraura/capas/catalogo.ts:5` `Capa`, `:37` `EntradaCapa`,
  `:160` `leerCatalogo(...)`, `:174` `candidatosDe(...)` y `:190` `usable(...)`; una capa sin
  SHA-256 verificado no se usa. `src/lib/astraura/capas/almacen.ts:7` `Almacenamiento`, `:40`
  `EstadoAlmacen` y `:66` `UMBRAL_PERSIST_POR_DEFECTO` (50 MiB) separan memoria de persistencia;
  `src/lib/astraura/capas/repartir.ts:7` `FuenteCapa` ordena las fuentes
  (`propio`, `par`, `espejo-starseed`, `servidor-propio`, `oficial`).

### 1.4 · Servidor de capas

El «servidor de capas» no guarda archivos del usuario: sirve **capas de software versionadas**
del servidor local para que una neurona se actualice sin reinstalar. Está en Rust y en Node:

- `native/src-tauri/src/servidor_capas.rs:44` `Publico`, `:69` `LineaCapas`, `:77` `Webs`, `:83`
  `Interno`; `:587` `preparar(...)`, `:599` `preparar_android(...)`, `:634` `elegir(...)`, `:143`
  `publico()` y `:456` `estado_a_json(...)`; `:181` `servida(...)`, `:192` `registrar_sirve(...)`,
  `:198` `al_pedir_relevo(...)`, `:244` `pedir_busqueda(...)`, `:255` `dir_puente(...)`, `:260`
  `dir_servida(...)` y `:318` `lineas_recientes()`.
- `native/src-tauri/src/servidor_capas_logica.rs:31` `DIR_CAPAS`, `:37` `MANIFIESTO_EN_CAPA`,
  `:38` `FIRMA_EN_CAPA`, `:44` canal de versiones, `:47` `FORMATO`, `:51` `PROTOCOLOS_ADMITIDOS`
  y topes de descarga/expansión (`:67-71`): una capa se acepta solo con manifiesto y firma.
- `native/servidor-local/capa.mjs:277` `armar(...)` construye la capa (`.tar.gz`), `:186`
  `canalDe(...)` publica el puntero y `:212` `aPodar(...)` decide qué versiones viejas se pueden
  borrar; `native/src-tauri/src/servidor_local_logica.rs:44` `RUTA_SALUD`, `:48` `RUTA_ENTRAR`,
  `:55` `WEB_PUBLICADA` y `:109` `rutas_con_dir`.
- `src/app/api/mando/capas/route.ts:66` GET y `:106` POST leen `config/capas-astraura.json` y el
  estado local, y solo aceptan `comprobar`, `banco` y `mandar-propuesta` con guardián de mando.
  La ruta es local a propósito: no se expone en producción.

### 1.5 · Funciones de nodo público: rutas y funciones exactas

No existe hoy una API pública anónima de almacenamiento, y este contrato no la crea. Lo que sí
existe es el bus firmado del mando y el préstamo entre neuronas de la misma cuenta:

- `src/lib/metagenesis/remoto-nodos.ts:25` `TTL_NODO_MS` (15 min), `:27` `ORDEN_CADUCA_MS`, `:29`
  `TIPOS_BUS` y `:56` `ACCIONES`, una lista blanca cerrada: `continuar`, `revisar_bloqueadas`,
  `buscar_capacidad`, `reactivar`, `buscar_trabajo`, `lanzar_cola`, `detener_cola`, `pausar`,
  `reanudar`, `ceder`, `desconectar` y `contenedor`. `:90` `ACCIONES_DEL_LIDER` limita las de
  líder; `:104` `esDestinoPara(...)`, `:128` `esAccion(...)`, `:137` `validarArgs(...)`, `:164`
  `canonico(...)` y `:187` `textoAFirmar(...)` impiden que una orden fuera de catálogo se ejecute.
- `src/lib/metagenesis/colmena.ts:14` `ContenedorNodo`, `:21` `NeuronaColmena`, `:106`
  `botonesNeurona(...)`, `:205` `comandoInstalar(...)`, `:211` `ordenDesconectar(...)` y `:215`
  `ordenContenedor(...)`: el contenedor es una acción explícita, no un modo por defecto.
- `src/lib/metagenesis/remoto.ts:59` `motorUrlValida(...)`, `:101` `ModoRemoto` y `:127`
  `crearFetchRemoto(...)`: solo se habla con el motor conocido (o los hosts declarados), nunca con
  una URL arbitraria que llegue en un mensaje.
- `src/lib/malla/transporte-universal.ts:221` `crearEnviador(...)`, `:557` `enviarMensaje`,
  `:660` `alRecibirMensaje(...)`, `:687` `despacharTextoTransporte(...)` y `:1382`
  `iniciarTransporteUniversal()`: el sobre lleva `to`, `txt` y `cv` (`:119` `formaCorta(...)`);
  `:647` `MensajeEntrante` y `:660` son la única puerta de entrada.
- `src/lib/recursos/servir-capacidades.ts:48` `crearServidor(...)` con `maxConcurrentes` y
  manejadores; `src/lib/recursos/sesion-prestamo.ts:31` `crearSesion(...)`, `:65` `permitido(...)`
  y `:78` `revocar(...)` acotan el préstamo a una sesión y un alcance.
- `src/lib/apps-remotas/anfitrion-malla.ts:21` `ventana.pedir` y `:22` `ventana.cortar`: solo se
  aceptan de otra neurona de la **misma cuenta**; el servidor no arranca hasta que llega la
  petición (`:88`).
- Rutas: `src/app/api/astraura/nodos/route.ts:87` GET (lista de nodos y estado);
  `src/app/api/mando/almacenamiento/route.ts:28` GET y `:42` POST (solo mando local);
  `src/app/api/recursos-ia/detectar/route.ts:18` GET; `src/app/api/recursos-ia/mover/route.ts:19`
  POST; `src/app/api/neurons/hermione/sync-capabilities/route.ts:15` POST (propaga capacidades,
  no archivos).
- Límites de un nodo público, ya escritos en `architecture/control-remoto-entre-neuronas.md:63`,
  `:195`, `:262-264` y `:316-319`: terminal y archivos **solo dentro de un contenedor o usuario
  aislado**, nunca la sesión personal; sin contenedor, un aparato solo puede ser **nodo público de
  transmisión**. El permiso del dueño no lo anula ningún voto.

### 1.6 · Maggabox y Maggabit: respaldo, versiones y espacio pesado

- `architecture/maggabit-almacenamiento-vivo.md` (MAG1117) define los tres volúmenes
  (`Maggabit`, `MaggabitTrabajo`, `MaggabitBoveda`), el UUID de la imagen y los estados
  `ausente | otro-disco | sin-imagen | listo`. Su **Principio 0** es el mismo de este contrato: un
  disco ausente no rompe, no espera y no se «arregla» borrando; toda orden externa lleva timeout.
- `scripts/puente/maggabit_medio.py:15-17` fija las raíces; `:31` `estado_medio(...)` es una
  decisión pura (sin disco ni red), `:75` devuelve `sin-respuesta` y `:105` separa medición de
  decisión.
- `scripts/puente/respaldo_maggabox.py:62` `DEST_HOST`, `:63` `DEST_BASE = "~/StarSeed-almacen"`,
  `:89` `ALIVIAR_BLANCA`, `:98` `ALIVIAR_NEGRA`, `:110` `excluir_secretos()`; `:249` `plan(...)`,
  `:289` `respaldar(...)`, `:448` `aliviar(...)` y `:541` `estado(...)`. `:586`
  `comando_restic_inicializar(...)` y `:597` `comando_restic_respaldar(...)` preparan el repositorio
  restic cifrado **sin contraseña en la línea de órdenes**.
- `scripts/puente/maggabit_versiones.py:38` `numero_prueba(...)`, `:46` `canal_de(...)`, `:64`
  `ficha_de(...)`, `:83` `ficha_igual(...)`, `:90` `destino_de(...)`, `:97` `plan(...)`, `:156`
  `comprobar(...)`, `:196` `ver_publicacion(...)`, `:222` `bajar(...)`, `:241` `guardar_ficha(...)`,
  `:252` `fichas_guardadas(...)`, `:272` `retirar_prueba(...)` y `:286` `revisar(...)`.
- `scripts/puente/respaldo_maggabit.py:41` `presion_por_carga(...)`, `:46` `plan_pasada(...)`, `:57`
  `correr(...)`, `:86` `una_pasada(...)`, `:123` `quedo_montadas(...)`, `:128` `expulsar(...)`,
  `:155` `tomar_cerrojo(...)` y `:184` `main(...)`.

**Verdad operativa:** `respaldo_maggabox.py` escribe `respaldos/` y `pesados/` bajo `DEST_BASE`.
En el volumen de trabajo ya hay código MAG1117 para espejos y versiones:
`scripts/puente/maggabit_repos.py:114` `plan(...)` y `:150` `ordenes(...)` usan
`TRABAJO/respaldo/repos/` para los espejos, y `scripts/puente/maggabit_clones.py:39` `plan(...)`,
`:70` `raiz_versiones(...)`, `:130` `podar(...)` y `:154`
`ejecutar_dia(...)` mantienen `TRABAJO/versiones/` con clones diarios (14 diarios y 8 semanales,
`:18-19`). Lo que **no** existe es el layout `~/StarSeed-almacen/espejo|versiones|capas|nube` ni
los temporizadores de 15 minutos y 1 hora de §2.6; son objetivo de este contrato, no código
existente.

### 1.7 · Cifrado de extremo a extremo

- `src/lib/malla/cifrado-archivo.ts:27` `CAPACIDAD_CIFRADO_ARCHIVO = "archivo.e2e.v1"`, `:29`
  `BYTES_TAG_GCM`, `:31` `ETIQUETA_SIN_CIFRADO_ARCHIVO`, `:33` `TIPO_OFERTA_CIFRADA`; `:69`
  `ClaveContenido`, `:89` `importarClaveContenido(...)`, `:102` `crearClaveContenido(...)`, `:111`
  `nonceTrozo(...)`, `:121` `aadTrozo(...)`, `:126` `sellarTrozo(...)`, `:144` `abrirTrozo(...)`,
  `:166` `ManifiestoArchivo`, `:207` `DestinatarioArchivo`, `:241` `sellarOferta(...)` y `:280`
  `abrirOferta(...)`. Cada trozo va en AES-256-GCM; la clave de contenido se envuelve por
  destinatario, y el nonce de 12 bytes combina 4 de identificador de transferencia y 8 de índice.
- `src/lib/malla/claves-destinatario.ts:20` `ORDEN_ORIGENES`, `:133` `AlmacenClavesCuenta` y `:138`
  `fuenteInstantanea(almacen, esDeLaCuenta)`: una clave de instantánea solo se usa si la neurona es
  de la cuenta.
- `src/lib/malla/sesion-cifrada.ts:35` `VERSION_CIFRADO`, `:36` `TIPO_TRAMA_CIFRADA = "nl.cif"`,
  `:37` `TIPO_ACUERDO = "nl.cs"`, `:42-44` rotación a las 500 tramas, 15 minutos o 32 MiB, y `:148`
  `decidirModo(...)`.
- `src/lib/enjambre/sellado-contenido.ts:185` `idEnjambre(...)` deriva el identificador de enjambre
  con HMAC del secreto y la raíz; `:213` `envolverClave(...)` y `:225` `abrirPaqueteClave(...)`
  envuelven la clave para los destinatarios autorizados.

Lo que ve el nodo que guarda: raíz, tamaño, trozos cifrados y sobres de clave. No ve nombre, tipo,
contenido ni la lista de destinatarios en claro. Guardar `ETIQUETA_SIN_CIFRADO_ARCHIVO` en un
ámbito privado es una violación del contrato, no una opción.

### 1.8 · Verdad operativa: qué está hecho y qué falta

| Pieza | Hoy | Falta para cumplir este contrato |
|---|---|---|
| Medio de almacenamiento por neurona | Tipos, detección, sugerencia y oferta (`tipos.ts`, `deteccion.ts`, `sugerencias.ts`, `oferta.ts`) | Cuota por cuenta aplicada y prueba de espacio antes de aceptar |
| Enjambre de datos | Biblioteca pura con Merkle, semilla, imán, espejo, política, almacén y pruebas | Cableado a interfaz y servidor (parte B de ENJ1110) |
| Capas de capacidades | Ficha, anuncio, elección de pares y capas de puerta | Campo de almacén en la ficha y límites por ámbito |
| Servidor de capas | Rust + Node, manifiesto firmado y canal de versiones | Nada: no es almacén de usuario y no debe usarse como tal |
| Nodo público | Bus firmado, lista blanca y contrato de contenedor aislado | Ejecución pública real y cuotas; hoy no existe API anónima |
| Maggabox | `respaldos/` y `pesados/`; espejos y versiones en `TRABAJO/`; restic preparado | `espejo/`, `versiones/`, `capas/`, `nube/` y temporizadores del layout nuevo |
| Cifrado E2E | Archivo y sesión cifrados; claves envueltas por destinatario | Envolver claves de almacén por cuenta y rotarlas |
| Réplica | Campo `Asignacion.replicas` y verificación de espejos en MAG1117 | Regla automática que impida cerrar con una sola copia |

## 2 · Diseño del almacén de una neurona

### 2.1 · Vocabulario

- **Dueño:** la persona o cuenta que enciende la neurona y decide qué presta.
- **Cuenta:** el conjunto de neuronas que comparten identidad y claves. Una neurona puede servir a
  varias cuentas, pero cada cuenta tiene su espacio y sus claves.
- **Ámbito:** `privado` (solo neuronas de la misma cuenta), `grupo`, `comunidad` o `publico`.
  Son los mismos cuatro de `src/lib/enjambre/semilla.ts:19`; no se inventa un quinto.
- **Pieza:** trozo cifrado y direccionable por hash; la unidad de almacenamiento y de réplica.
- **Raíz:** SHA-256 del árbol Merkle que identifica el contenido completo.
- **Principal:** lo que no se puede perder: historia de `main`, `starseed_memory_root`, versiones
  publicadas, capas colectivas de la Fundación y todo lo marcado como fijado.
- **Medio:** un dispositivo o volumen físico distinto (disco interno, SSD externo, Maggabox,
  contenedor en la nube con volumen propio). Dos carpetas del mismo disco no son dos medios.

El almacén de una neurona **no es un sistema de archivos montado en remoto**. Es un almacén de
objetos: se aceptan piezas con su manifiesto firmado y su raíz; nunca se aceptan rutas POSIX,
enlaces simbólicos, permisos de archivo ni escrituras arbitrarias de un par.

### 2.2 · Capacidad anunciada: GB libres y cuota del dueño

La neurona anuncia almacén igual que anuncia cómputo, dentro de `OfertaNeurona`
(`src/lib/recursos/oferta.ts:1`). El anuncio debe llevar, como mínimo:

| Campo | Significado | Regla |
|---|---|---|
| `libreMb` | espacio realmente libre en el volumen elegido | se mide, no se estima por el tamaño del disco |
| `prestaMb` | lo que el dueño permite prestar | `min(libreMb - reserva, cuotaMb)` |
| `cuotaMb` | tope que fija el dueño por cuenta o global | si no hay cuota, no hay oferta |
| `reservaMb` | colchón que nunca se toca | `max(5 GiB, 10 % del volumen)` |
| `medios[]` | volúmenes y su clase (interno, externo, Maggabox, nube) | al menos uno; la clase importa para la réplica |
| `prueba` | nonce firmado + GB comprometidos | se responde leyendo y escribiendo un bloque temporal y se borra |

Reglas:

1. La oferta se recalcula al cambiar el volumen, no cada minuto; si el volumen desaparece, la
   oferta baja a cero y **no** se bloquea la neurona.
2. El dueño puede bajar la cuota en cualquier momento. Al bajarla, la neurona deja de aceptar
   contenido nuevo y **no** borra lo existente para «cumplir»: avisa y espera órdenes.
3. No se ofrece el disco del sistema por debajo de la reserva. Llenar el disco no es generosidad:
   es una avería.
4. La prueba de espacio es obligatoria antes de aceptar un principal; sin prueba, el contenido va
   a un medio de confianza o no se guarda.
5. La cuota se aplica por cuenta y por ámbito, no solo global. El límite de `privado` no se come el
   de `comunidad` ni el de `publico` (`src/lib/enjambre/politica.ts:136` `cuotasEnBytes(...)`).

### 2.3 · Espacio privado de cuenta: cifrado de punta a punta

- **Quién puede escribir:** solo una neurona de la misma cuenta. El aceptador comprueba cuenta y
  clave antes de escribir (`src/lib/enjambre/politica.ts:292` `aceptarGuardar(...)` con
  `tengoClave`); sin sobre de clave válido, se rechaza.
- **Qué ve el anfitrión:** raíz, tamaño, número de piezas y sobres de clave. No ve nombre, tipo ni
  contenido. El nombre y el tipo van en `MetadatosSellados`
  (`src/lib/enjambre/sellado-contenido.ts:147`) y solo se abren con la clave de contenido que la
  cuenta envuelve para sus neuronas.
- **Cómo se identifica:** `idEnjambre = HMAC(secreto, raiz)` (`:185`). Sin el secreto de la cuenta
  no se puede correlacionar el contenido con una persona ni con otra copia.
- **Claves:** la clave de contenido se envuelve por destinatario (`:213` `envolverClave(...)`); el
  anfitrión guarda sobres, no claves. La rotación reenvuelve para las neuronas vivas de la cuenta y
  retira los sobres viejos; no exige volver a subir el contenido.
- **Revocación:** se deja de servir, se borran los sobres de la neurona revocada y se marca la copia
  como no válida. El borrado físico de las piezas espera a que la cuenta confirme que hay otra
  réplica sana.

Un nodo de otra cuenta **nunca** es espejo de un espacio privado, aunque tenga espacio y buena
voluntad. La privacidad no se delega en la confianza del operador.

### 2.4 · Espacio público: direccionado por contenido

- **Identidad:** raíz Merkle + semilla firmada por el autor (`src/lib/enjambre/semilla.ts:134`
  `semillaDeArbol(...)`). No hay carpeta por usuario ni URL de servidor: hay contenido y firmas.
- **Imanes:** el imán (`starseed:?...`) es la forma de compartir sin servidor
  (`src/lib/enjambre/iman.ts:52`). Un imán no contiene rutas ni credenciales; si no cabe en 2048
  caracteres, se comparte la semilla, no un enlace gigante.
- **Publicación:** solo si el dueño activó `sembrarPublico` (`src/lib/enjambre/politica.ts:83`),
  el ámbito es `publico` y la capa es colectiva. Por defecto está apagado y así se queda hasta que
  alguien lo encienda a sabiendas.
- **Deduplicación:** global por raíz. Si dos cuentas publican el mismo contenido, se guarda una vez;
  eso no revela que la otra cuenta lo tenga, porque el contenido ya es público.
- **Espejos:** cualquier neurona con espacio y política puede espejar una capa pública
  (`src/lib/enjambre/espejo.ts:30`). Un espejo se valida contra la raíz y la firma; no se confía en
  el hash que declara el espejo.
- **Capas colectivas:** las capas de Astraura y las capas de capacidades públicas usan este espacio.
  Las capas de modelo, además, exigen SHA-256 verificado en el catálogo
  (`src/lib/astraura/capas/catalogo.ts:190` `usable(...)`).

### 2.5 · Réplica obligatoria del principal en otro medio

Ningún principal se considera guardado con una sola copia. La regla es **2 + 1**:

1. **Dos copias en medios distintos** (no dos carpetas del mismo disco).
2. **Una de ellas fuera del aparato de origen**: Maggabox o el volumen del contenedor en la nube.
3. **La segunda se verifica leyendo**: se recalculan los SHA-256 de las piezas, se reconstruye la
   raíz y se compara el número de entradas y el tamaño. Un `rsync` que terminó sin error no es una
   verificación.

- Lo privado solo se replica entre neuronas de la misma cuenta; la copia de nube, si existe, va
  cifrada y con claves envueltas para esa cuenta.
- Lo público se replica en cualquier espejo que cumpla la política; la calidad se mide por raíz
  verificada, no por número de espejos.
- Un elemento con una sola copia se marca `replicaPendiente` y **no** se puede borrar, mover ni
  dar por bueno. `Asignacion.replicas` (`src/lib/recursos-ia/tipos.ts:281`) ya expresa la intención;
  lo que falta es la puerta que la haga cumplir.
- La Maggabox puede ser una de las copias, nunca la única. Si está ausente, el principal sigue en
  el otro medio y el sistema lo dice (`scripts/puente/maggabit_medio.py:31`).

### 2.6 · Estructura objetivo de `~/StarSeed-almacen/`

| Ruta | Contenido | Frecuencia | Estado |
|---|---|---|---|
| `espejo/` | espejo del repo y de `starseed_memory_root` sin secretos | cada 15 min | objetivo |
| `versiones/` | fichas de versión publicadas y `git bundle` (se conservan 7); los clones diarios siguen en `TRABAJO/versiones/` | cada hora | objetivo |
| `respaldos/` | `mac/starseed_memory_root`, `repo-<fecha>.bundle`, `respaldos.log` | diario | existe |
| `pesados/` | regenerables movidos tras copia verificada | a demanda | existe |
| `capas/privadas/<cuenta>/<raiz>/` | piezas cifradas y sobres de clave | según publicación | objetivo |
| `capas/publicas/<raiz>/` | piezas públicas y manifiesto firmado | según publicación | objetivo |
| `nube/` | índice de lo que vive en el contenedor; no es una copia | cada hora | objetivo |
| `restic-secretos/` | repositorio restic cifrado, solo secretos | diario | preparado, sin contraseña en órdenes |

Los temporizadores no se ejecutan dentro del enjambre: se instalan como trabajos del sistema
(launchd en la Mac) y respetan el Principio 0. `nube/` contiene punteros y TTL, no el contenido:
un contenedor efímero no es un medio de almacenamiento permanente.

### 2.7 · Ciclo de vida de una pieza

1. **Oferta:** la neurona publica `libreMb`, `prestaMb`, cuota y prueba. Sin consentimiento no hay
   oferta.
2. **Aceptación:** se comprueban cuenta, ámbito, cuota, firma y que el dueño permite ese ámbito.
3. **Recepción:** se escribe en un temporal, se calcula el SHA-256, se hace `fsync` y se renombra
   solo si coincide. Un trozo que no coincide se descarta y se pide a otro par.
4. **Indexación:** se guarda el manifiesto con raíz, tamaño, ámbito, dueño y fecha; el índice es
   local y no se publica.
5. **Réplica:** se aplica 2 + 1 antes de marcar el principal como guardado.
6. **Servicio:** se verifica el hash de la pieza **antes** de enviarla; no se sirve un trozo que no
   coincida con la raíz solicitada.
7. **Desalojo:** LRU dentro del ámbito, nunca sobre lo fijado, lo principal ni lo que tiene una sola
   copia. Se borra primero lo regenerable.
8. **Revocación o baja:** se deja de servir, se borran claves y se espera confirmación de réplica
   antes del borrado físico.

### 2.8 · Invariantes

- **I1.** Ninguna ruta de un par se interpreta como ruta del sistema.
- **I2.** Ningún byte privado se escribe en claro en un medio que no sea de la cuenta.
- **I3.** Ningún principal queda con una sola copia ni se borra sin lectura de verificación.
- **I4.** Ningún contenido público se sirve sin raíz y firma válidas.
- **I5.** Ninguna cuota se supera; si se supera, se deja de aceptar, no se borra lo ajeno.
- **I6.** Ningún nodo público recibe la sesión personal de nadie.
- **I7.** Ningún espejo se cree por su propio hash; se recalcula.
- **I8.** Ningún trabajo de almacén corre sin timeout ni sin cerrojo.
- **I9.** Ningún secreto entra en `respaldos/`, `espejo/` ni `pesados/`; solo en el repositorio
  restic cifrado.
- **I10.** Ningún cambio de cuota, ámbito o réplica se aplica sin registro en `respaldos.log`.

## 3 · Uso por MetaGenesis

MetaGenesis usa el almacén de las neuronas para tres cosas: respaldar, soltar peso y operar el
contenedor en la nube. En las tres, la regla es la misma: **la nube y la Maggabox son medios, no
dueños**. Ninguna orden de MetaGenesis puede convertir un medio en el único lugar donde vive algo
principal.

### 3.1 · Respaldos

- **Qué se respalda:** `starseed_memory_root` (sin secretos), la historia del repo como
  `git bundle` y las fichas de versión. Los secretos no se copian a `respaldos/`: su único destino
  permitido es el repositorio restic cifrado, cuyas órdenes ya están preparadas.
- **Cómo:** `scripts/puente/respaldo_maggabox.py` con `plan` (qué haría), `respaldar` (ejecuta),
  `aliviar` (suelta regenerables con copia verificada) y `estado` (lee el resultado). `plan` y
  `aliviar --seco` son el modo por defecto de revisión; nada se borra en el mismo paso en que se
  copia.
- **Rotación:** se conservan 7 `git bundle` (`repo-<fecha>.bundle`) y se escribe una línea en
  `respaldos/mac/respaldos.log`. La rotación no borra el bundle más nuevo ni el que está en uso.
- **Verificación:** un respaldo solo se marca bueno si se puede leer de vuelta: número de
  entradas, tamaño y SHA-256. Si la Maggabox está `ausente` o `sin-imagen`, el respaldo queda
  `pendiente` y el sistema sigue; no se reintenta en bucle ni se borra la copia local.
- **Periodicidad:** el ejemplo de launchd corre cada 6 horas (21600 s). Es una sugerencia
  operativa, no una promesa de este contrato; lo que sí es obligatorio es que cada pasada tenga
  cerrojo y timeout.

### 3.2 · Datos pesados

- **Qué se puede soltar:** solo lo declarado regenerable en `ALIVIAR_BLANCA` (`:89`):
  `.next/cache`, `node_modules/.cache`, `*.log`, `logs/*.log` y worktrees `starseed-wt-*` que no
  pertenezcan a una cola activa.
- **Qué no se toca nunca:** lo de `ALIVIAR_NEGRA` (`:98`): archivos de entorno, estado local,
  claves, `.ssh`, certificados, `*.pem`, `*key*`, `starseed_memory_root` y `.git`. Tampoco se toca
  un worktree con tarea viva: el filtro por id de cola activa es obligatorio.
- **Orden:** medir → copiar a `pesados/` → verificar (tamaño, número de archivos y SHA-256) →
  recién entonces borrar el original. Si la verificación falla, no se borra y se avisa.
- **Datos de la nube:** lo que produce el contenedor se descarga a `pesados/` y se indexa en
  `nube/`; el contenedor no es la copia de verdad. Un dato pesado producido en la nube y no
  replicado se marca `replicaPendiente`.

### 3.3 · Contenedor en la nube

- El contenedor de MetaGenesis es **efímero y aislado**. No monta el home del dueño, no ve su
  sesión y no recibe secretos en claro (`architecture/control-remoto-entre-neuronas.md:63`).
- Se gobierna por el bus firmado de `src/lib/metagenesis/remoto-nodos.ts:56` (`ACCIONES`) y por
  `ordenContenedor(...)` (`src/lib/metagenesis/colmena.ts:215`). No se inventa un canal nuevo para
  almacenar.
- Puede **sembrar capas públicas** y servir de espejo mientras viva; no puede ser espejo de un
  espacio privado de otra cuenta ni almacén único de un principal.
- `nube/` guarda el índice con TTL, no el contenido. Cuando el contenedor muere, el índice marca
  los punteros como vencidos y el principal debe estar en otro medio.
- Si el contenedor necesita un volumen persistente, ese volumen cuenta como **un medio** para la
  regla 2 + 1, con su propio estado y su propia verificación; no se presume durable.

### 3.4 · Límites de MetaGenesis sobre el almacén

MetaGenesis **no** puede: subir secretos a un medio no cifrado; usar la Maggabox como única copia;
borrar para liberar cuota; montar el home del dueño en un nodo público; aceptar una pieza sin
verificar su hash; ni dar por buena una réplica sin lectura. Cuando una orden choca con un
invariante de §2.8, la orden se rechaza y se explica; no se «adapta» el invariante.

## 4 · Riesgos

### 4.1 · Técnicos

| Riesgo | Causa típica | Mitigación en este contrato |
|---|---|---|
| Disco lleno | se ofrece el total y no lo libre; se ignoran los temporales | `prestaMb = min(libre - reserva, cuota)`; reserva de 5 GiB o 10 % |
| Corrupción silenciosa | se copia y no se lee de vuelta | SHA-256 por pieza y reconstrucción de la raíz antes de marcar bueno |
| Escritura parcial | se renombra antes de `fsync` | temporal + `fsync` + rename solo si el hash coincide |
| «Réplica» en el mismo disco | dos carpetas del mismo volumen | la clase de medio cuenta; mismo disco no suma |
| Desalojo de lo importante | LRU sin marcar fijados | `fijar(...)` y prohibición de desalojar principales o copias únicas |
| Fuga por metadatos | nombre, tipo o dueño en claro | metadatos sellados; el índice local no se publica |
| Espejo malicioso | devuelve otro contenido o redirige | fetch validado (`crearFetchEspejoSeguro`) y hash recalculado |
| Zip bomb / archivo gigante | capa con manifiesto falso | topes de descarga, expansión y número de archivos (`servidor_capas_logica.rs:67-71`) |
| Travesía de rutas | nombre de pieza con `../` o enlace simbólico | el almacén es de objetos, no de rutas; se rechaza toda ruta |
| Pérdida de claves | se borra la clave de cuenta | la pérdida de clave es pérdida de datos; se avisa y se exige copia de recuperación |
| Contenedor escapado | nodo público sin aislamiento | contenedor o usuario aislado; si no hay, solo transmisión |
| Cuota que miente | carrera entre dos escrituras | reserva atómica por ámbito y reconciliación al arrancar |

### 4.2 · Operativos

- **Maggabox ausente o con otro disco.** El nombre `/Volumes/Maggabit` no basta: se comprueba el
  UUID y el estado (`ausente | otro-disco | sin-imagen | listo`). Un disco ajeno con el mismo
  nombre no se toca.
- **Respaldo que nunca se restauró.** Un backup sin prueba de lectura es una hipótesis. La
  verificación de §3.1 es parte del respaldo, no un extra.
- **Rotación agresiva.** Conservar 7 bundles y borrar el más nuevo por error es peor que no rotar.
  La rotación respeta el paquete en uso y el más reciente.
- **Trabajo sin cerrojo.** Dos pasadas de respaldo o de alivio a la vez pueden mover el mismo
  archivo; el cerrojo es obligatorio (`scripts/puente/respaldo_maggabit.py:155`).
- **Reloj y TTL.** Un contenedor con reloj adelantado puede declarar vencido un índice sano; se usa
  el reloj del mando y se tolera deriva.
- **Credenciales vencidas.** Sin credenciales de nube, el respaldo de nube queda pendiente; no se
  reintenta en bucle ni se borra la copia local.
- **Secreto en el lugar equivocado.** Un `.env` dentro de `respaldos/` o de un bundle es una fuga
  silenciosa; las listas negras se aplican antes de copiar, no después.

### 4.3 · De privacidad y de diseño

- **Análisis de tráfico.** Aunque el contenido vaya cifrado, el tamaño y el momento de una copia
  pueden revelar actividad. Los trozos tienen tamaño fijo por pieza y las claves se rotan; no se
  promete anonimato de tráfico.
- **Correlación por identificador.** Reutilizar el mismo secreto de cuenta en dos enjambres los
  correlaciona. Cada cuenta y cada ámbito usa su secreto; el identificador se deriva, no se comparte.
- **Deduplicación como canal lateral.** La deduplicación global solo se aplica a contenido público.
  En privado, el identificador que ve el nodo se deriva con HMAC por cuenta y la semilla no se
  publica en claro; dos cuentas no comparten el mismo identificador.
- **Borrado incompleto.** En SSD y en copias de seguridad, «borrar» no siempre es físico. Se revoca
  la clave y se asume que el ciphertext puede sobrevivir; por eso lo privado se cifra en origen.
- **Nodo público como almacén gratis.** Sin cuota, prueba y reputación, un nodo público se llena de
  datos ajenos. Este contrato exige cuota, consentimiento y revocación; no hay escritura anónima.
- **Abuso de confianza en el operador.** El operador de un nodo público no debe poder leer, ni
  siquiera con acceso al disco. Si el diseño necesita que lea, el diseño está mal.

## 5 · Lo que nunca se sirve en público

Lista cerrada. Si algo no está autorizado aquí, no se publica; la duda se resuelve con «no».

1. **Secretos y credenciales:** archivos de entorno, claves SSH, certificados, `*.pem`, `*key*`,
   tokens, cookies, contraseñas de restic, estado de sesión y cualquier material de recuperación.
2. **Contenido privado de una cuenta:** archivos personales, chats, `starseed_memory_root`, piezas
   del ámbito `privado`, manifiestos con nombres y sobres de clave.
3. **Claves y material criptográfico:** claves de contenido sin envolver, secretos de enjambre,
   claves privadas de identidad y frases de recuperación.
4. **Datos de otra cuenta:** ni el contenido, ni su hash, ni la lista de sus neuronas, ni siquiera
   «para comprobar» si existe.
5. **Rutas e infraestructura:** rutas del sistema, nombres de usuario, IP internas, mapa de discos,
   nombres de hosts y credenciales de la Maggabox.
6. **Índices y listados:** un listado de directorio, un índice de piezas o un log con nombres de
   archivo. El almacén público se consulta por raíz, no por catálogo.
7. **Ejecutables y código sin revisar:** una capa pública solo se sirve con manifiesto y firma
   verificados; nunca se ejecuta ni se sirve un binario arbitrario de un par.
8. **Respaldos de secretos fuera de restic:** ningún `.env`, base de estado o clave se copia a
   `respaldos/`, `espejo/` o `pesados/`, aunque el destino sea «privado».
9. **La sesión personal y el home del dueño:** un nodo público nunca los expone; solo contenedor o
   usuario aislado, y solo lo que el dueño declaró como nodo.
10. **Contenido sin consentimiento:** cualquier cosa que el dueño no haya marcado como `publico`,
    aunque técnicamente se pueda leer. La capacidad técnica no es permiso.

Lo que sí puede servirse en público: piezas direccionadas por raíz, una semilla firmada, un imán y
los metadatos que el autor haya decidido publicar. Nada más.

## 6 · Criterios de aceptación

Una implementación cumple este contrato cuando:

1. **Es un módulo puro y pequeño.** Cada tarea añade como máximo 3 archivos y 120 líneas por
   archivo, con su prueba unitaria al lado. Nada de red, disco, reloj real ni hardware dentro de la
   lógica; las medidas entran como parámetros.
2. **No usa `any`,** no importa un `route.ts` desde una prueba y no hace `vi.mock` de módulos de
   Node. Las pruebas usan `import { describe, it, expect } from "vitest"`.
3. **Aplica la cuota antes de aceptar.** Un intento por encima de `cuotaMb`, de `libreMb` o de la
   reserva se rechaza con motivo, sin efectos laterales. La cuota es por cuenta y por ámbito.
4. **No acepta privado sin clave.** Un `privado` sin sobre válido o de otra cuenta se rechaza
   siempre, aunque haya espacio.
5. **No publica sin permiso.** Con `sembrarPublico: false` o `presta.publico` apagado, nada se
   publica ni se anuncia como público.
6. **No marca réplica sin lectura.** `replicaOk` solo es verdadero después de recalcular hashes,
   reconstruir la raíz y comparar tamaño y número de entradas.
7. **No permite borrar sin copia.** `puedeBorrar` devuelve `false` y un motivo legible si el
   elemento es principal, está fijado, o su única otra copia no está verificada.
8. **No se cae si falta el medio.** Con la Maggabox ausente, otro disco o sin imagen, el resultado
   es `pendiente`, no una excepción, no un bucle y no un borrado.
9. **No sirve un hash que no coincide.** Una pieza alterada por un espejo se descarta y se registra;
   nunca se entrega al consumidor.
10. **Es visible y auditable.** El estado (cuota, usado, libre, réplicas, pendientes) se puede leer
    sin abrir una consola y queda en el log; nada se deduce de un mensaje críptico.

Escenarios mínimos que deben estar en pruebas:

- cuota justa, cuota superada y reserva que impide ofrecer el último GB;
- privado de la misma cuenta, privado de otra cuenta y privado sin clave;
- público apagado por defecto, público encendido con consentimiento y público sin firma;
- réplica en el mismo disco (no cuenta), en dos medios (cuenta) y sin lectura (no cuenta);
- borrado bloqueado por copia única y permitido con copia verificada;
- Maggabox `ausente`, `otro-disco`, `sin-imagen` y `listo`;
- espejo que devuelve un trozo con hash distinto;
- restauración de prueba: se lee el respaldo y se compara la raíz.

Puertas: `bash scripts/enjambre/tsc-turno.sh`, `npx vitest run <archivo>` con resumen leído, y
revisión. Un `tsc` en verde no sustituye la prueba de restauración ni la visibilidad en Genesis.

## 7 · Cola propuesta

Seis tareas pequeñas, cada una con su prueba, que implementan la lógica pura de este contrato sin
tocar rutas ni cableado. La parte 2 de la cadena materializa este bloque en
`starseed_memory_root/olas/cola-almacen-neurona-1118.json`; aquí queda como fuente de verdad para
que no se pierda ni se reinterprete.

```json
{
  "ola": "almacen-neurona-1118",
  "tareas": [
    {
      "ola": "ALM1118",
      "id": "ALM1118N1",
      "titulo": "Cuota de almacén por cuenta y ámbito",
      "archivos": ["src/lib/recursos/almacen-cuota.ts", "src/lib/recursos/__tests__/almacen-cuota.test.ts"],
      "depende": [],
      "prompt": "Módulo puro: cuotaEfectiva, puedeAceptar y motivoRechazo. Entran cuota del dueño, usado, libre, reserva (max(5 GiB,10 %)) y ámbito (privado|grupo|comunidad|publico). prestaMb = min(libre - reserva, cuota); nunca negativos; sin cuota se rechaza; no borra nada. Sin any, ≤120 líneas por archivo, pruebas vitest de cuota justa, superada y reserva. No toques rutas ni código existente."
    },
    {
      "ola": "ALM1118",
      "id": "ALM1118N2",
      "titulo": "Prueba de espacio y reducción de la oferta",
      "archivos": ["src/lib/recursos/almacen-prueba.ts", "src/lib/recursos/__tests__/almacen-prueba.test.ts"],
      "depende": ["ALM1118N1"],
      "prompt": "Módulo puro: planPruebaEspacio, evaluarPruebaEspacio y ofertaTrasMedicion. Compara espacio declarado y medido, aplica reserva y cuota, y devuelve una oferta recortada o motivo. Estados del medio: ausente|otro-disco|sin-imagen|listo; ausente baja la oferta a cero sin lanzar. Sin any, ≤120 líneas por archivo, pruebas vitest de los cuatro estados y del último GB reservado. No toques rutas ni código existente."
    },
    {
      "ola": "ALM1118",
      "id": "ALM1118N3",
      "titulo": "Principal, réplica 2+1 y permiso de borrado",
      "archivos": ["src/lib/recursos/almacen-replica.ts", "src/lib/recursos/__tests__/almacen-replica.test.ts"],
      "depende": [],
      "prompt": "Módulo puro: clasificarPrincipal, estadoReplica y puedeBorrar. Regla 2+1: dos copias en medios de clase distinta y una fuera del origen; dos carpetas del mismo disco no suman. puedeBorrar devuelve false con motivo si es principal, está fijado o la otra copia no está verificada. Sin any, ≤120 líneas por archivo, pruebas vitest de mismo disco, dos medios, copia única y fijado. No toques rutas ni código existente."
    },
    {
      "ola": "ALM1118",
      "id": "ALM1118N4",
      "titulo": "Verificación de copia y plan de alivio",
      "archivos": ["src/lib/recursos/almacen-verificacion.ts", "src/lib/recursos/__tests__/almacen-verificacion.test.ts"],
      "depende": ["ALM1118N3"],
      "prompt": "Módulo puro: huellaDeCopia, copiaVerificada y planAlivio. La huella usa número de entradas, bytes y lista de SHA-256; copiaVerificada exige lectura y raíz igual. planAlivio solo acepta rutas de la lista blanca y rechaza secretos, .git, memoria y worktrees con cola activa. Sin any, ≤120 líneas por archivo, pruebas vitest de copia buena, copia truncada y ruta prohibida. No toques rutas ni código existente."
    },
    {
      "ola": "ALM1118",
      "id": "ALM1118N5",
      "titulo": "Almacén en la ficha de capacidades",
      "archivos": ["src/lib/network/almacen-ficha.ts", "src/lib/network/__tests__/almacen-ficha.test.ts"],
      "depende": ["ALM1118N2"],
      "prompt": "Módulo puro: almacenEnFicha, fichaAlmacenCompacta y ambitosPermitidos. Añade libreMb, prestaMb y ámbitos a la ficha sin pasar de 200 bytes; no incluye rutas, discos ni ids de dueño. ambitosPermitidos cruza consentimiento del dueño, ámbito pedido y política. Sin any, ≤120 líneas por archivo, pruebas vitest de ficha con y sin público y de tope de tamaño. No toques rutas ni código existente."
    },
    {
      "ola": "ALM1118",
      "id": "ALM1118N6",
      "titulo": "Lista cerrada de lo publicable",
      "archivos": ["src/lib/enjambre/publico-permitido.ts", "src/lib/enjambre/__tests__/publico-permitido.test.ts"],
      "depende": ["ALM1118N3"],
      "prompt": "Módulo puro: esPublicable y motivoNoPublicable con la lista cerrada de §5. Exige ámbito publico, consentimiento, raíz y firma verificadas; rechaza secretos, claves, rutas, datos de otra cuenta, índices y ejecutables sin firma. Sin any, ≤120 líneas por archivo, pruebas vitest de cada familia prohibida y del caso permitido. No toques rutas ni código existente."
    }
  ]
}
```

Criterio de cierre de la cola: las seis en verde, sin `any`, con sus pruebas y sin tocar rutas. El
cableado a la interfaz, a `/api/mando/almacenamiento` y a la Maggabox es una tarea posterior, no
parte de esta cola.

## 8 · Referencias

**Contratos de arquitectura**

- `architecture/enjambre-datos.md` — semillas, imanes, espejos, ámbitos y almacén de trozos.
- `architecture/control-remoto-entre-neuronas.md` — nodo público, contenedor aislado y cláusula
  pétrea del dueño.
- `architecture/maggabit-almacenamiento-vivo.md` — volúmenes, UUID, estados y Principio 0.
- `architecture/datos-por-la-malla.md` — medios y límites de datos por la malla.
- `architecture/archivos-malla-p2p.md` — transferencia de archivos entre neuronas.
- `architecture/capas-autoadaptables.md` — capas de Astraura, SHA-256 y banco de modelos.
- `docs/actualizaciones-y-versiones.md` — canal de versiones y fichas.

**Código de referencia**

- `src/lib/recursos-ia/{tipos,deteccion,sugerencias,enrutado,oferta-desde-asignaciones}.ts`
- `src/lib/recursos/{oferta,bolsa,sesion-prestamo,servir-capacidades}.ts`
- `src/lib/storage/neurona-driver.ts`
- `src/lib/enjambre/{arbol,semilla,iman,espejo,politica,almacen,protocolo,enjambre,planificador,sellado-contenido}.ts`
- `src/lib/network/{capacidades-nodo,ficha-propia}.ts`, `src/lib/astraura/capas-conciencia.ts`
- `src/lib/malla/{puerta/capas,cifrado-archivo,claves-destinatario,sesion-cifrada}.ts`
- `src/lib/metagenesis/{remoto-nodos,remoto,colmena}.ts`
- `native/src-tauri/src/{servidor_capas,servidor_capas_logica,servidor_local_logica}.rs` y
  `native/servidor-local/capa.mjs`
- `scripts/puente/{respaldo_maggabox,maggabit_medio,maggabit_versiones,respaldo_maggabit}.py`

**Convenciones**

- Español con acentos; sin `any`; pruebas con `vitest` y `globals: false`; prohibido importar un
  `route.ts` desde una prueba y prohibido `vi.mock` de módulos de Node.
- Rutas relativas dentro del repo. Ninguna clave ni valor de entorno en este documento, en los
  logs o en los commits; solo nombres de variable cuando haga falta.
- Un cambio de este contrato se acompaña de su tarea en la cola y de la prueba que lo cubre.

**Revisión**

- 2026-11-18 · ALM1118A-d1 · primera versión. Inventario verificado contra el código de la ola;
  lo planeado se marca como objetivo y no se presenta como hecho.

*Fin del contrato.*
