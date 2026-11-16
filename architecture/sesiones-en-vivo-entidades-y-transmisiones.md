# Sesiones en vivo, espacios de entidad, capacidad y transmisiones (SES1115Q · 2026-11-15)

**Contrato de diseño, no código.** Dice cómo muchas personas trabajan a la vez en una misma cosa (una pizarra, un
dashboard, un escritorio, un navegador, un juego, una sala) usando los servidores, neuronas y cerebros disponibles de
la malla; cómo una página, comunidad o grupo tiene un **espacio** con las mismas secciones de un perfil; y cómo eso se
emite como **canal** (se entra y se actúa) o **estación** (se mira). Lo pidió Alex el 15-11; el control entre neuronas
(`architecture/control-remoto-entre-neuronas.md`, CRN) es su hermano, no su vehículo (§1.8).

Convención de citas: `archivo:línea` de `origin/main` (ef6f544). Lo que viene de parches aún no fusionados (UNI1115M,
NEU1115G) va marcado «(parche)». «No leído» = no lo abrí.

**Resumen que cambia el diseño.** La mitad de lo que Alex pide **ya existe con otros nombres**: un contrato de «sala»
(`src/lib/salas/`), un motor de edición colaborativa con fusión por registro y compare-and-swap (`src/lib/vivo/`), un
reparto de capacidad entre neuronas (`src/lib/recursos/`), un árbol de relevo que se recoloca (`arbol-relevo.ts:80`) y
estaciones con anfitrión, relé y denuncias. Lo que **falta** es: que las pestañas de una entidad sean salas vivas, que
la pizarra y el escritorio dejen de pisarse, una sola matriz de roles, el reemplazo del anfitrión y una oferta de
capacidad *por sesión*. El diseño propone **unir lo existente**, no una función nueva por sección.

---

## 1. Lo que existe hoy (verificado)

### 1.1 Entidades: páginas, comunidades, grupos

- Nueve tipos canónicos (`personal, comunidad, ef, partido, asamblea, grupo, evento, pagina, proyecto`),
  `src/lib/entity-kinds.ts:25-34`; cada uno con un `toolkit`. Las pestañas de un toolkit son **fijas por tipo**:
  comunidad = Proyectos, Procomún, Tesorería, Mentorías, Decisiones, Justicia (`ComunidadToolkit.tsx:46-53`); grupo =
  Sesiones, Tareas, Recursos, Eventos, Educación, Decisiones, Justicia (`GrupoToolkit.tsx:47-55`).
- La página arma sus pestañas en código: Inicio, el toolkit, Publicaciones, Miembros, Eventos…
  (`app/(app)/pagina/[slug]/page.tsx:326-380`). **No tiene** escritorios, dashboards, mensajes, pizarras, navegadores,
  cerebro, biblioteca ni Astraura. Lo que Alex quiere («las mismas secciones que un perfil») es hoy una carencia.
- Personalización por entidad: `entity_state` clave `layout` con `tabs: TabPref[]` y `TabPref = {id, visible}`
  (`entity-layout.ts:49-52, 70-80`); sólo ordena y oculta, **no** distingue público/privado ni audiencia.
- Roles, **cinco vocabularios sin unir**: (a) `os_memberships.role` admin/owner/moderator/miembro con guarda
  anti-escalada (`20260801130000_os_memberships_pk_role_guard.sql:26-40`); (b) `access_role_rank` total/owner 4,
  gestor/admin 3, colaborador/editor 2, observador/viewer 1 (`20260806120000_profile_sharing.sql:135-149`); (c)
  estaciones: sólo `owner|admin|editor` escriben (`20261010090000_os_estaciones.sql:125-146`); (d) `RolSala`
  dueño/editor/comentarista/observador (`salas/sala.ts:30`); (e) `PermisoVivo` ver/comentar/editar
  (`mensajeria/formato-tipos.ts:197`) y `os_space_editors.role` editor/viewer (`spaces.ts:44`).
- **Hallazgo de seguridad:** en `os_spaces`, `os_is_group_member(group_slug)` deja **editar a cualquier miembro** de la
  entidad, sea cual sea su rol (`20260712090100_missing_core_tables_spaces.sql:115-124, 182-200, 299-317`). Un
  «observador» de un grupo edita su pizarra. Hay que cerrarlo antes de abrir espacios de entidad (§3).
- Gobernanza: `roleOf` lee `os_memberships` y cae a `group_members`/`page_members` (`governance/permissions.ts:42-104`);
  consenso y delegación en `src/lib/governance/` (`engine.ts`, `delegations.ts`; no leídos en detalle).

### 1.2 Espacios compartidos (`os_spaces`) y cómo sincronizan

`os_spaces(kind desktop|dashboard|board, access private|profiles|invite|public, group_slug, doc jsonb, rev, device_id)` +
`os_space_editors` (`spaces.ts:42-66`). `rev` lo sube un trigger; **público = sólo lectura** por RLS (comentario en
`…spaces.sql:170-181`; el de `spaces.ts:30` que dice «público=edición» es obsoleto). Realtime sobre la fila:
`subscribeSpace` filtra por id y descarta el eco por `device_id` (`spaces.ts:503-512`).

Hay **tres mecanismos de sincronía**, de peor a mejor:

| Superficie | Mecanismo | Qué pasa con dos editores a la vez |
|---|---|---|
| **Pizarra** (`canvas-board.tsx:507-520`, `shared-board-space.ts:84-90`) | sustituye `blocks` y `edges` enteros; `updateSpaceDoc` hace `update({doc})` sin comprobar `rev` (`spaces.ts:185-196`); espera 900 ms | **gana el último**; el otro pierde su trabajo sin aviso |
| **Escritorio compartido** (`shared-desktop-space.ts:95-170`) | documento entero, gana el `savedAt` mayor, evita el eco (`:126`) | igual: se pierde el movimiento de uno |
| **Tabla, dashboard compartido** (`vivo/tabla/motor-colab.ts:1-24`, `vivo/dashboard.ts:10-16`) | **fusión por registro** con reloj y lápidas (CRDT de registros, `tabla/fusion.ts`) + guardado compare-and-swap por `rev` (`espacio.ts:74-90`), reintento ×4, borrador local, solo lectura sin permiso | convergen; mismo widget a la vez = gana la última escritura; nadie pierde lo demás |
| **Juegos y programas** (`vivo/juegos/controlador.ts:12-30`, `transporte-supabase.ts`) | diario de entradas + reglas puras, difusión por canal + guardado CAS | gana la de menor marca; la otra se reintenta o se dice «ya no era posible» |
| **Documento** (`vivo/doc-colaborativo/*`) | operaciones sobre el motor de la Protomolécula (`apps-en-la-malla.md:§11`: Yjs/Loro anotados, no añadidos) | no leído en detalle |

**No hay librería CRDT** en `package.json` (grep de yjs/automerge/loro vacío). Lo que existe es propio, puro y probado.
Además `src/lib/salas/` es **ya** un contrato de sala: `Sala{tipo pizarra|escritorio|dashboard|escena3d|xr, visibilidad,
transporte, miembros: RolSala}` (`sala.ts:20-46`), `puedeEditar/puedeInvitar` (`:95-113`), `elegirTransporte`
(`:133`: una sala no pública prefiere servidor privado y luego malla P2P aunque haya internet), `fusionarEstados` por
elemento con lápidas y tope de 5000 elementos vivos (`sincronia-sala.ts:47, 133`) y propiedad por épocas
(`propiedad-sala.ts:74`). Lo usan escenas 3D/XR (`vivo/espacial/canal.ts:29`), **no** la pizarra ni el escritorio.

### 1.3 Aplicaciones en vivo dentro de un chat

`os_sesiones_vivas` es el **pase** a algo que ya sincroniza: quién entra (chat, invitados, enlace público con token),
con qué permiso (`ver|comentar|editar`), si sigue abierta (`mensajeria/sesiones-vivas.ts:1-24`; enlaces `/vivo/<id>` y
`/vivo/<id>?t=<token>`; presencia con canal privado `vivo:<id>`). El catálogo (`components/messages/vivo/catalogo-vivo.ts`)
crea sala, pizarra, documento, presentación, tabla, navegador (un escritorio con una ventana), dashboard, juego,
programa, escena 3D y XR. **Esto es ya «compartir una cosa en vivo»; sólo vive en chats, no en el espacio de una
entidad.**

### 1.4 Estaciones y canales

- **Estación** = fila `os_estaciones` (`estaciones/tipos.ts:3-39`): `tipo` audio|video|xr|evento|anuncio|juego|**pizarra
  |dashboard|programa|app**|mixto, `fuente` enlace|starseed|estudio, `ambito_tipo` persona|entidad + `entidad_ref`,
  `visibilidad` publica|grupo, `empieza_en/termina_en`, `ultimo_latido`, `en_malla`, `espectadores`. Estado de directo
  por latido de 2 min (`directo.ts:3, 25-40`). RLS: pública la lee cualquiera; «grupo» sólo miembros; escribe el dueño o
  `owner|admin|editor` de la entidad (`…os_estaciones.sql:125-181`). **Moderación:** denuncias que sólo ocultan para
  quien denuncia, sin borrar (`:184-196`).
- **Sesión paramétrica** (Omnifrecuencias/Audiomorphic): viaja la entonación, no el audio, con reloj común y firmas;
  canales Supabase Realtime + enlaces locales P2P + relé propio opcional; las privadas cifradas AES-GCM
  (`sesion-en-vivo.ts`, `estaciones-en-vivo-parametricas.md:§3-4`). Los oyentes se cuentan por el **máximo** de internet
  y relé, y se suman los enlaces locales (`sesion-en-vivo.ts:283`). Coste: con N conectados ≈ 36·N² mensajes/hora en
  rondas; N=30 ≈ 29 h/mes en Supabase Free (`…parametricas.md:§4.1`); por eso existe el relé propio
  (`canal-rele.ts:1-40`), **pendiente de desplegar** en el servidor A1.
- **Canales** hoy **no son** lo que Alex describe: `src/lib/canales/` es el catálogo de canales de publicación
  atendidos por agentes telecomunicadores (Telegram activo; el resto «próximamente») y `os_canales` un directorio
  público con seguidores (`canales/canales.ts:1-12`, `publicos.ts:1-20`). **Choque de nombre:** hay que renombrar el
  actual («Difusión») o llamar a lo nuevo de otro modo (decisión D8).
- **Falso amigo:** `src/lib/espacios/` son los **Spaces de Hugging Face** (`cliente-espacios.ts:42`), nada que ver con
  los espacios de entidad. No reutilizar el nombre.

### 1.5 Llamadas y retransmisión

Motor WebRTC con malla completa: `MAX_PARTICIPANTES = 8` (`llamadas/tipos.ts:12`), `MAX_DIRECTOS = 7`
(`motor.ts:207`); sin servidor, 6 aparatos y vídeo sólo hasta 4 (`grupo-malla.ts:23-25`); TURN de Cloudflare o Metered
(`ice-servidor.ts:4-9`). La escena compartida usa **la misma malla** hasta 7 pares y cae a Supabase si se supera
(`vivo/espacial/canal-p2p.ts:13`). **No hay SFU** (reenvío selectivo): cada par sube N−1 flujos.

### 1.6 Cerebros, servidores y capacidad

- Un cerebro se enlaza N:N con servidores con rol `primary|replica|compute|storage|sync` y dirección de sync
  (`brains/servers.ts:41-109`). Lectura compartida: un cerebro público de una entidad lo leen sus miembros si su dueño
  es gestor (rango ≥ 2) (`20261013150000_cerebros_compartidos.sql:14-70`); **escribir sigue siendo del dueño**.
- **Oferta de capacidad** ya modelada: `OfertaNeurona` con cómputo, almacén, enlaces, energía y `presta{cuenta, grupos,
  publico, topes{cpuPct, ramMb, discoMb, horas, soloCargando}}` (`recursos/oferta.ts:1-40`); `capacidadPrestable` pone a
  cero con batería < 20 % sin cargar, en uso, fuera de horas o `soloCargando` sin cargador (`:52-85`). **Falta** el tope
  de ancho de banda y «sólo Wi-Fi».
- **Bolsa:** `planificar(PeticionBolsa, ofertas)` reparte partes `computo|bytes|ventana|relevo`; el contexto admite
  `cuenta|grupo|comunidad|publicacion|estacion` (`recursos/bolsa.ts:4-17`) y cae a `local|nube` con motivo.
- **Árbol de relevo:** cada nodo sostiene `⌊subida/kbpsFlujo⌋` hijos; `recolocar` mueve sólo la rama de quien se va
  (`arbol-relevo.ts:23, 55, 80`). **Si se va el origen, no hace nada** (`:81`): ahí falta el reemplazo del anfitrión.
- Relé de capacidades por la malla (`capacidad.*`, `capacidad-por-malla.ts:14-30`, tope 16 KB) y préstamos con
  sesión, caducidad y consumo (`cerebros/procesos-prestados.ts`). Ventana transmitida de una app de otra neurona
  (`apps-remotas/anfitrion.ts:54`).

### 1.7 Control entre neuronas (CRN)

Orden firmada por aparato (ECDSA, `seq`, nonce, caduca), vocabulario cerrado, niveles `ver ⊂ controlar ⊂ modificar ⊂
administrar` (CRN §2.1, §2.3); nodos privados (dueño da/quita acceso) y públicos (consenso configurable, §6.2-6.3);
**cláusula pétrea** (§6.4, cláusula B de §1): el voto nunca anula el permiso del dueño de un aparato personal; un
aparato personal sólo es nodo público dentro de contenedor aislado (§10). Estado real (parche UNI1115M, §12): pantalla
por pista de vídeo P2P + `gesto/tecla/texto` hacia Android; `modificar` y `administrar` **no existen**; el
interruptor nativo está apagado de fábrica; sesión 1 h, 2 min de inactividad; 60 órdenes de entrada/s.

### 1.8 Qué reutiliza y qué no (el modelo de dirección, contrastado)

| Idea de dirección | Veredicto | Por qué |
|---|---|---|
| Un solo concepto «sesión en vivo» | **Se mantiene**, y ya existe a medias | `os_spaces` + `os_sesiones_vivas` + `Sala` + `os_estaciones` son las cuatro mitades; se unen, no se inventa |
| Superficie = cualquier pestaña | Se mantiene con límite | sólo las que tienen motor con fusión (§5); navegador y app son «anfitrión único» |
| Anfitrión neurona o entidad | Se mantiene | CRN §6 ya da dueño + entidad |
| Capacidad = nodos que corren/llevan/guardan | Se mantiene y se estrecha | oferta, bolsa y árbol existen; falta atarlos a una sesión (§4) |
| Camino automático | Se mantiene | `elegirTransporte` ya lo decide por sala |
| Canal = interactúan, estación = miran | Se mantiene | coincide con `permiso editar` vs `ver` y con `tipo` de estación; ambas por enlace |
| **«Sobre el canal de control y el motor de llamadas»** (fase 1) | **Se cambia** | el canal de control lleva *órdenes sobre un aparato* con interruptor nativo, nivel y tope; sincronizar un documento por él mezclaría dos poderes y lo ataría a Android. El transporte correcto ya existe: `os_spaces` + canal de difusión (+ malla de `canal-p2p.ts`). De las llamadas se reutiliza la **malla WebRTC y la configuración ICE**, no el motor |
| Un evento = sesión programada con promesas de capacidad | Se mantiene | `empieza_en` ya está; falta la promesa (§4.4) |

---

## 2. El modelo: seis nombres

| Nombre | Definición exacta | Dueño | Se guarda en |
|---|---|---|---|
| **Sesión** | Una superficie abierta a más de una persona, con id, rol de cada una y anfitrión. Es la fila `os_spaces` (id, `kind`, `doc`, `rev`, `access`, `group_slug`) **más** su pase `os_sesiones_vivas` | quien la crea (cuenta) o la entidad | existente; sin tabla nueva en fase 1 |
| **Superficie** | Lo que se ve y se toca: `escritorio, dashboard, pizarra, navegador, documento, tabla, juego, programa, escena, sala, llamada`. Define su **tipo de sincronía** (§5) | — | `kind` + `doc.sharing`/`vivo` |
| **Espacio** (de entidad) | Lista de pestañas de una entidad, cada una = una superficie enlazada a una sesión, con visibilidad propia | la entidad | `entity_state` de la entidad, clave nueva `espacio` (no se toca `layout`) |
| **Anfitrión** | Quien manda en la sesión: una neurona (aparatos aceptados) o una entidad con rol. Hay **uno activo y suplentes ordenados** | dueño | `doc.anfitrion = {activo, suplentes[], epoca}` |
| **Capacidad** | Compromisos de una neurona con una sesión: `correr`, `llevar` (relevo), `guardar`. Sale de `OfertaNeurona`, nunca la crea | la neurona que ofrece | latido + `doc.capacidad` (ids, no datos) |
| **Emisión** | La sesión vista desde fuera: **canal** (audiencia con `editar`) o **estación** (audiencia con `ver`), pública o de grupo | quien la publica | `os_estaciones` (`tipo` y `entidad_ref` ya cubren casos) |

**Estados de una sesión:** `programada → abierta → en-directo (hay latido ≤ 2 min) → pausada → cerrada → guardada`.
`guardada` conserva el `doc` (y una copia en la Biblioteca si se pide, §7); `en-directo` ya lo calcula `estadoDirecto`.
**Evento** = sesión `programada` + lista de **promesas de capacidad** (§4.4). **Rama** = sesión nueva con copia del `doc`
de otra (`origen`, `rev_origen`) para modificar sin tocar la original.

**Mapa a lo existente.** Canal ≈ sesión con `acceso=editar` publicada; estación ≈ fila `os_estaciones` con `fuente=starseed`
y `enlace=/vivo/<id>?t=…` (`tipo` ya admite pizarra, dashboard, juego, programa, app, xr). **Novedad real:** la clave
`espacio`, `doc.anfitrion`, `doc.capacidad`, el pase de entidad (§3), una lista de promesas y la carpeta de cada neurona
(§7). Todo lo demás es unir.

### Nota 2026-11-15 · nombres propuestos por Alex

Alex propuso el 15-11 llamar **«puentes»** a lo que lleva capacidad a través de los nodos (la `capacidad` del modelo:
correr, llevar, guardar) y **«canales»** a las neuronas que emiten y usan por cualquier capa de señal de la malla,
pública o privada (lo que el contrato llama canal/estación).

La **COLISIÓN**, en palabras: la app ya usa «puentes» para los puentes de chat (Telegram: «Puentes de Telegram»,
`src/components/chats-genesis`) y «Puente de Mando» (nombre interno que la interfaz nunca muestra: se dice Genesis);
además «puente de voz», «puente de Tauri», «puente de Aurora». Y «canal» ya se usa en «canal de control»
(control entre neuronas, CRN), «canal de datos» y «canal de pruebas».

Redacción **PROPUESTA** que mantiene todo claro, sin renombrar nada existente: en la interfaz y en el contrato, la
palabra suelta nunca se usa: siempre «puente de capacidad» (el nuevo) frente a «puente de chat» (Telegram y otros),
y «canal en vivo» (el nuevo) frente a «canal de control». «Puente de Mando» sigue siendo solo un nombre interno de
código y carpetas. En el código los identificadores nuevos llevan el complemento (`puenteCapacidad`, `canalEnVivo`).

Marca que la decisión final es de Alex y que **NO se ha renombrado nada**.
Excepción a la regla de nombres: este es un documento de arquitectura, no texto de interfaz, y SÍ puede citar
«Puente de Mando» como nombre interno.

---

## 3. Permisos

### 3.1 Una sola matriz (reemplaza los cinco vocabularios en la capa de sesión)

Se define **un rango por sesión** y cada vocabulario existente se traduce a él (tabla de traducción en código, no
migración de datos):

| Audiencia / rol de entidad | Rango de sesión | Nivel CRN equivalente | Puede |
|---|---|---|---|
| Visitante anónimo con enlace público | `ver` | `ver` | mirar; contar como espectador |
| Seguidor / miembro «observador» (rango 1) | `ver` | `ver` | mirar, reaccionar |
| Invitado «comentarista» (`PermisoVivo comentar`) | `comentar` | `ver` + comentarios | + notas y chat |
| Miembro «colaborador/editor» (rango 2) | `editar` | `controlar` | editar la superficie; entrar como participante |
| Moderador | `moderar` | `controlar` + moderación | + silenciar, expulsar, bloquear de la sesión |
| Gestor/admin (rango 3) | `gestionar` | `modificar` | + cambiar visibilidad, anfitrión, suplentes, capacidad aceptada, grabar |
| Dueño de la sesión/entidad (rango 4) | `dueño` | `administrar` | + traspasar, borrar, **ofrecer o retirar el anfitrión** |

«Nivel CRN equivalente» sólo es **analogía de poder**: las sesiones de documento **no** pasan por el canal de control
ni dan nunca más poder sobre un aparato que el que ya tiene la página (CRN §11).

### 3.2 Público o privado, por pestaña

Cada pestaña de un espacio lleva `visibilidad: publica | entidad | roles[] | privada` y `acceso_publico: ver | ninguno`.
Reglas: (1) la pestaña **no puede ser más abierta que la sesión** que enlaza; (2) cambiarla a más abierta exige
`gestionar` y avisa de lo que se verá; (3) a menos abierta es inmediato; (4) una pestaña pública sólo expone `ver` por
defecto (la RLS ya lo garantiza: público = lectura, `…spaces.sql:170-181`); (5) un espacio **hereda** el rango de la
entidad salvo que la pestaña lo suba o baje explícitamente; nunca da a un rol más de lo que tendría en la entidad.

### 3.3 Corrección previa a la fase 1

`os_is_group_member` no mira el rol: **editar exige rol**. Cambio: en `sp_update`/`space_can_edit` sustituir
`os_is_group_member(group_slug)` por `os_group_rank(group_slug) ≥ 2` (usando `access_role_rank` y la tabla de
membresías; `os_entity_roles` también cuenta como en `os_estacion_puede_escribir`). Es una migración pequeña y la **primera
cosa** de la fase 1; sin ella una pestaña de entidad editable por «observadores» es un agujero. Coste de dejarlo: alto;
de hacerlo: bajo (hay pocas filas con `group_slug`, no verificado: se mide antes).

### 3.4 Peticiones, aprobaciones y consenso

Se reutiliza CRN §6.2-6.3 tal cual: sesión **privada de entidad** → peticiones aprobadas por quien tenga `gestionar`
(patrón `os_space_editors` con `status pending/member`, `spaces.ts:364-405`); sesión **pública de entidad con gobierno
democrático** → petición firmada, quórum/umbral/caducidad por política y concesión firmada por la entidad. Suelo
heredado de CRN §9.4: `gestionar` y `dueño` nunca se ganan sólo por voto.

### 3.5 Lo que nunca se dobla (y cómo lo cumple este diseño)

1. **El permiso de un aparato es del dueño y está apagado de fábrica.** Ofrecer capacidad (§4) es otro interruptor,
   también apagado de fábrica y por aparato, dado en la propia neurona; ningún voto, rol ni mensaje lo enciende.
2. **Nada se enciende a distancia.** Una sesión sólo *pide* capacidad; la neurona decide y puede retirarla en cualquier
   momento con un toque (la sesión sigue por los suplentes).
3. **Un aparato personal sólo ofrece cómputo a otros dentro de un contenedor aislado** (CRN §10). Sin contenedor, sólo
   puede **llevar** (relevar bytes cifrados), nunca **correr** ni **guardar** en claro.
4. Quien relee contenido ajeno lo hace en sesiones **selladas** si son privadas (`CanalSellado`, CRN §2.2): el nodo
   transporta, no lee.

---

## 4. Capacidad

### 4.1 Qué puede ofrecer un nodo

| Oferta | Qué es | Dónde cabe hoy | Honesto |
|---|---|---|---|
| **Correr** | ejecutar el anfitrión de una app/juego/navegador compartido, o un servicio (render, transcodificar, IA) | `capacidad.*` por la malla (`capacidad-por-malla.ts:14`), Mac y nube | sólo en contenedor si el aparato es personal |
| **Llevar** | relevar medios y mensajes de difusión | árbol de relevo, relé propio, `en_malla` | cualquier aparato; limitado por subida |
| **Guardar** | alojar el `doc` y los archivos de la sesión | volúmenes por bandas (`apps-en-la-malla.md:§7`) | sólo si el dueño presta disco |

Límites por tipo de aparato (de §3 de CRN y de lo medido en llamadas):

| Aparato | Corre | Lleva | Guarda | Nota |
|---|---|---|---|---|
| Mac (nativa) | sí, con contenedor | sí | sí | 8 GB de RAM: no ofrece cómputo pesado por defecto |
| Servidor/nube (A1, Coolify) | sí | sí | sí | siempre encendido: el suplente natural |
| Android (tableta/móvil) | no por defecto | sí, en Wi-Fi y cargando | poco | la batería y el sistema lo cortan en segundo plano |
| Navegador sin app | no | sólo mientras la pestaña está abierta | no | puede ser anfitrión de un `doc`, no de un servicio |
| iOS | no | limitado | no | sin proceso en segundo plano fiable |

### 4.2 Cómo lo ofrece y limita su dueño

En la ficha de la neurona (ya existe «Recursos» con topes, `recursos-ia/*`; no leído en detalle): un interruptor
**«Ofrecer a sesiones en vivo»**, apagado, y debajo los topes que `oferta.ts` ya tiene —CPU %, RAM, disco, **horario**,
**sólo cargando**— más dos que **faltan y se añaden**: `soloWifi` y `kbpsSubidaMax`. «A quién»: cuenta / grupos /
entidades concretas / público (ya es `presta.{cuenta,grupos,publico}`, `oferta.ts:28-35`). Presets: **Cuidadoso**
(sólo cargando, Wi-Fi, 50 %), **Generoso**, **Personalizado**.

### 4.3 Cómo elige la sesión y cómo anula la persona

1. `planificar` (bolsa) recibe la petición con `contexto.tipo = "estacion" | "grupo" | "comunidad"` y `partes`: una de
   `computo` (si la superficie necesita anfitrión), una `relevo`, una `bytes`.
2. Candidatas = ofertas que `ofertaVisiblePara` deja ver **y** que aceptaron esa sesión (§4.4). Orden: capacidad,
   subida, latencia, id (el orden determinista de `arbol-relevo.ts:34-47`).
3. Se eligen **el activo y dos suplentes** (para correr) y un árbol de relevo (para llevar). Se guarda en `doc.anfitrion`.
4. **Anulación:** el `gestionar` ve la lista con «por qué éste» («más subida, cargando, 12 ms») y puede fijar, quitar o
   vetar un nodo; lo fijado se respeta salvo que ese nodo se vaya. Sin nodos aptos, cae a `local`/`nube` y **lo dice**
   (`SueloPlan`, `bolsa.ts:13`).

### 4.4 Eventos y promesas

Un evento es una sesión `programada`. Cualquier miembro con permiso de ver puede **prometer** capacidad: «pongo mi
tableta a llevar, de 18:00 a 20:00». La promesa es una fila (neurona, sesión, tipo, ventana); **no** reserva nada: al
empezar el evento la neurona recibe «¿activar?» (si el interruptor general está encendido) y decide. Resumen visible:
«3 nodos prometidos, 2 listos». Una promesa no cumplida no penaliza a nadie.

---

## 5. Seguir vivos cuando un nodo se va

Se distingue por **tipo de sincronía** (no por sección). Objetivos medibles:

| Tipo | Superficies | Mecanismo que **ya** tiene el código | Qué falta | Recuperación objetivo | Pérdida objetivo |
|---|---|---|---|---|---|
| **A · Fusión desde cualquier copia** | tabla, dashboard, documento, pizarra, escritorio (cuando migren) | registros con reloj y lápidas, CAS por `rev`, borrador local, reintentos 2/5/15/30 s (`motor-colab.ts`, `espacio.ts:74`) | pizarra y escritorio aún usan documento entero (§1.2) | **0 s** si queda un participante o la nube; sin nadie, al volver | 0 si todos fusionan; ≤ 1 ráfaga (600 ms–5 s) si cae justo al editar |
| **B · Anfitrión único** | navegador compartido, app/juego con estado, escena con avatares | juegos: diario + reglas puras, **cualquiera reconstruye** (`controlador.ts:12-30`); escena: estado por `pedir-estado`; épocas de propiedad (`propiedad-sala.ts:74`) | **reemplazo de anfitrión**: no existe | 3-8 s (3 latidos perdidos + reconstrucción + `epoca+1`) | juegos: 0 (diario guardado); navegador/app: pierde el estado volátil de la página; escena: poses de ≤ 10 Hz |
| **C · Medios** | audio/vídeo, pantalla, cámara | árbol de relevo con `recolocar` (`arbol-relevo.ts:80`), HLS por la malla con respaldo al origen, relé propio | si cae el **origen** no hay plan | árbol: rama movida en < 5 s; origen: 5-15 s al suplente | los espectadores de la rama ven un salto o buffering ≤ 5 s; el directo no se reanuda hacia atrás |

**Reemplazo de anfitrión (nuevo, mínimo).** El anfitrión activo escribe un latido cada 5 s en `doc.anfitrion.t`. Si los
suplentes no lo ven en 15 s, el primero **reclama** subiendo `epoca` por CAS sobre `rev`: gana quien lo logre; el
anterior, si vuelve, ve `epoca` mayor y pasa a participante (la misma regla que `aceptarEscritura`). El nuevo anfitrión
reconstruye desde el `doc` guardado y el diario. Un tope: 3 cambios en 5 min y se queda con la nube y avisa.

**Lo que se pierde, dicho a la persona:** «El anfitrión se desconectó. Continuamos en <nodo>. Se perdieron los últimos
N segundos de <cosa>.» No se oculta.

---

## 6. Escala: cuántos caben y dónde hace falta un nodo

Aritmética por camino (v = flujo de vídeo, kbps; N participantes; E espectadores):

| Camino | Participantes | Espectadores | Cuenta |
|---|---|---|---|
| **Malla directa** (WebRTC todos con todos) | llamada 8 (`tipos.ts:12`), escena 8 (`canal-p2p.ts:13`), sin servidor 6, vídeo ≤ 4 (`grupo-malla.ts:23-25`) | los mismos | conexiones = N(N−1)/2; cada par sube **N−1** flujos. A 700 kbps (`KBPS_VIDEO_POR_PAR`): N=4 sube 2,1 Mbps; N=8 sube 4,9 Mbps (tope móvil típico) |
| **Difusión de datos** (documento, no vídeo) | decenas: es un mensaje por cambio | cientos | mensajes Realtime = cambios × conectados; Supabase Free 2 M/mes ≈ N=10 → 8 400/h (`…parametricas.md:§4.1`) |
| **Relevo en árbol** (vídeo/audio a muchos) | — | E ≈ Σ hijos del árbol | un nodo con subida S sostiene ⌊S/v⌋ hijos (`capacidadRelevo`, `arbol-relevo.ts:23`): 5 Mbps / 700 kbps = 7 hijos; con 3 niveles de 7 → **7 + 49 + 343 ≈ 400** espectadores con un origen que sube sólo 7 flujos |
| **Capa de servidores (relé/SFU propio)** | decenas | miles | el relé propio reparte texto, **no vídeo** (`canal-rele.ts:1-27`); un SFU **no existe**; hasta tenerlo, el vídeo a miles necesita HLS desde un nodo de nube |

**Dónde hace falta un nodo:** (1) más de 8 participantes **con** vídeo → no cabe en malla: pasan a «hablan 4, el resto
mira» y sólo los que hablan están en malla; (2) más de ~30 espectadores en una sesión de datos → relé propio, para no
gastar la cuota de Realtime; (3) más de ~7 espectadores de **vídeo** → árbol con al menos un nodo de relevo con subida
medida; (4) más de ~400 → nodo de nube con HLS. El sistema avisa en la tarjeta («Sois 9: pasamos a modo mirar para
5»).

---

## 7. Encontrar y conservar

**Secciones.** «Estaciones» ya existe (listado por directo/programada/pausada/terminada, filtros por tipo, categoría,
idioma, texto, ámbito, `estaciones/directo.ts:11-24, 25-40`). «Canales» se rehace como entrada de **canales
interactivos** (renombrando el actual, D8). Ambas muestran lo mismo en dos pestañas: **Ahora**, **Programado**, **Guardado**.

- **Carpetas por neurona:** cada neurona organiza lo que ha guardado en carpetas propias con filtro (tipo, entidad,
  etiqueta), orden (reciente, más visto, alfabético) y búsqueda de texto. Es **preferencia local** de la neurona,
  sincronizada con su cuenta (`user-prefs`), no dato de la entidad. Falta todo esto (no hay carpetas de estaciones; no
  leído en `components/estaciones/*`).
- **Marca de directo:** toda pestaña enlazada a una sesión `en-directo` lleva un punto rojo y «EN VIVO · 12». Si el
  anfitrión cae, pasa a «Reconectando…» y si no vuelve en 2 min a «Terminó». Se calcula con `estadoDirecto` y la
  presencia (`vivo:<id>`). La marca **no se puede apagar** en pestañas ajenas: es lo que distingue una emisión.
- **Enlaces y vista previa:** `/vivo/<id>` (con cuenta) y `/vivo/<id>?t=<token>` (público; el token nunca vuelve al
  cliente, `sesiones-vivas.ts:14-17`). La vista previa dice **tipo, anfitrión, cuántos hay, si pide cuenta, y si se
  puede participar o sólo mirar**, y nunca el contenido de una sesión privada.
- **Adjuntar desde un enlace externo** a la sección de otra persona: «Añadir como pestaña viva» crea una referencia
  (no copia) con la marca de emisión; si la sesión se cierra, la pestaña se queda como «Terminó» y se puede quitar.
- **Rama:** «Duplicar para modificar» crea una sesión nueva con el `doc` copiado y `origen`. Si es un juego de una
  Biblioteca, copia el paquete (el catálogo de la Biblioteca está en `packages.ts`, **no leído**).
- **Grabar a la Biblioteca:** el `doc` final (y, si es medios, el HLS) se guarda como artículo de la Biblioteca de quien lo
  pide y con licencia explícita (estaciones ya exigen licencia, `tipos.ts:9-10`). No se graba sin `gestionar` y sin
  banda «grabando» visible a todos.

---

## 8. La experiencia: cinco flujos

Regla común: **máximo tres decisiones**, el valor por defecto siempre sirve, palabras de persona.

**1 · Compartir una pestaña en vivo desde mi neurona.**
Pantalla: pestaña (pizarra, dashboard…) → menú ⋯ → **«Compartir en vivo»**. Hoja: «¿Con quién?» **[Mis neuronas] [Una
página o grupo ▾] [Cualquiera con enlace]** · «¿Pueden editar o sólo mirar?» **[Editar] [Mirar]** · [Compartir]. Por
defecto: *Mis neuronas, Editar.* Resultado: «Compartida. 1 persona dentro.» + botón **Copiar enlace**.

**2 · Abrir el espacio de una página y trabajar una pestaña con otros.**
Página → pestañas con puntos: **Inicio · Pizarra ● · Dashboard · Publicaciones…** (el punto es EN VIVO). Se toca
*Pizarra*: «Estás con 3 personas. Marta edita». Tres decisiones como máximo: **entrar editando / entrar mirando /
pedir permiso** (si el rol sólo da `ver`: «Pedir editar» → aprobación de gestión).

**3 · Crear un evento y prometer capacidad.**
Entidad → **Eventos → Nuevo en vivo**. Nombre, **qué superficie** (lista con iconos), **cuándo**. Debajo: «¿Quién puede
entrar? **[Todos mirando] [Sólo miembros]**». Después del botón: «¿Quieres ayudar con tu neurona? **[No, gracias]
[Llevar la emisión] [Llevar y correr]**» (sólo aparecen opciones que ese aparato puede dar). Resultado: «Evento creado.
Nadie ha prometido capacidad aún; la nube lo sostendrá.»

**4 · Entrar a un canal desde un teléfono.**
Enlace → página de entrada con vista previa («Pizarra de estudio · 5 dentro · Ana anfitriona · Puedes dibujar»). Una
decisión: **[Entrar]** (si pide cuenta: «Con una cuenta puedes dibujar; sin ella sólo ves»). El teléfono entra con
cámara/micro **apagados**; los activa con un botón. Si no cabe vídeo para todos: «Sois 9: te mostramos a los 4 que
hablan.»

**5 · Ver una estación y pasar a participar.**
Estaciones → tarjeta **EN VIVO · 28** → ver (siempre modo mirar). Botón **«Unirme»** sólo si la emisión es un canal: abre
la hoja de rol (**Participar / Pedir turno**). Al pasar, no se corta el vídeo: se añade la capa de edición encima. Al
volver a «Mirar» se retira sin perder sitio.

---

## 9. Seguridad en salas públicas

- **Roles de moderación** (rango `moderar`, §3.1): silenciar a alguien, quitarle el editar, **expulsar de la sesión**,
  **bloquear de la entidad** (usando el bloqueo existente de cuentas; no leído), cerrar la sesión. Sólo `gestionar` o
  más cambia la visibilidad.
- **Denunciar:** el patrón de estaciones (`os_estaciones_denuncias`, una por cuenta y sesión, sólo oculta para quien
  denuncia, `…os_estaciones.sql:184-196`) se amplía a sesiones y a **personas dentro de la sesión**; los moderadores ven
  las denuncias de su sesión (misma RLS que estaciones). Nada se borra solo.
- **Menores y desconocidos por defecto:** no existe aún dato fiable de edad en el código que leí (grep sin resultado; no
  leído `os_profiles`). Por eso se diseña **sin depender de edad**: un desconocido entra con **cámara y micro apagados,
  sin chat privado, sin enlaces ni archivos subidos, sin ver la lista completa de participantes** (sólo cuántos);
  los participantes ven de los demás sólo nombre y avatar. Si una cuenta declara ser menor (D7), además: no entra en
  salas públicas con micro, no recibe mensajes de desconocidos y las salas públicas le muestran la banda «sala pública».
- **Qué se registra y cuánto:** registro de solo-añadir **de la sesión** (entradas, salidas, quién cambió permisos,
  expulsiones, denuncias, grabaciones): **30 días** en sesiones públicas, **7** en privadas, sin contenido ni
  capturas; los medios en directo **no** se guardan salvo grabación explícita visible. Visible para `gestionar`.
- **Un nodo que releva contenido ajeno:** ve **bytes cifrados** si la sesión es privada (sellado extremo a extremo) y
  contenido en claro sólo si es pública, porque es pública. **No es responsable de revisar** lo que releva, pero **sí**
  de: no guardarlo más allá de la sesión (buffer corto), no reenviarlo fuera de ella y dejar de llevarlo cuando se lo pide
  su dueño o la sesión se cierra. Un nodo no puede ver otra cosa del aparato (cláusula D de CRN §1).
- **Abuso de capacidad ofrecida:** una sesión no puede exigir más de lo prometido; los topes de §4.2 se aplican en la
  neurona, no en la sesión.

---

## 10. Fases

Probadas en: Mac (nativa), tableta Android, móvil Android del dueño.

### Fase 1 · «Compartir en vivo» un dashboard o pizarra entre mis neuronas y una página (una ola, 4 tareas)

**Entregable que Alex usa:** en cualquier pizarra o dashboard suyo, «Compartir en vivo» → elegir **Mis neuronas** y/o **una
página suya** → la pizarra/dashboard aparece como **pestaña «en vivo»** en esa página, con punto rojo y contador; los
miembros con rol `editor` la editan **sin pisarse**; cualquiera con el enlace de «Mirar» la ve como espectador
(estación de tipo pizarra/dashboard) y se cuenta.

Se apoya en lo existente (`os_spaces`, `os_sesiones_vivas`, `MotorColab`, `os_estaciones`); **no** usa el canal de
control ni el motor de llamadas. Transporte: Supabase Realtime (ya probado) + relé propio si está desplegado.

| Tarea | Qué hace | Archivos que posee (nuevos salvo indicación) |
|---|---|---|
| **P1-A · Cerrar el hueco y migrar la pizarra** | migración que exige rango ≥ 2 (§3.3) y **pizarra con fusión por registro + CAS**: `blocks`/`edges` como registros con reloj y lápida (como `vivo/dashboard.ts`), sobre `MotorColab`. El escritorio **no** entra en fase 1 | `supabase/migrations/*_spaces_rol_grupo.sql` · `src/lib/vivo/pizarra.ts` + `__tests__` · cambio acotado en `src/lib/sync/shared-board-space.ts` y `components/canvas/canvas-board.tsx:507-520` |
| **P1-B · Espacio de la página** | clave `entity_state` `espacio` = `[{id, titulo, tipo, sesionId, visibilidad, accesoPublico}]`; pestañas dinámicas en página y grupo a partir de ella; quién ve cada pestaña (§3.2); alta/baja con `gestionar` | `src/lib/entidad-espacio/{modelo,permisos,usar-espacio}.ts` + `__tests__` · bloque aditivo `# SES1115Q` en `app/(app)/pagina/[slug]/page.tsx` y `grupo/[slug]/page.tsx` junto a `baseTabs` |
| **P1-C · «Compartir en vivo» y marca de directo** | la hoja del flujo 1 (§8), creación del pase (`os_sesiones_vivas`) y de la **estación** de espectadores (`tipo pizarra\|dashboard`, `enlace /vivo/<id>?t=`), marca EN VIVO y contador por presencia, «Pedir editar» | `src/components/vivo-entidad/{compartir-en-vivo,marca-directo,pedir-editar}.tsx` + `__tests__` · `src/lib/vivo-entidad/{estacion-de-sesion,traduccion-roles}.ts` |
| **P1-D · Pruebas y contrato** | tabla de traducción de roles (§3.1) con pruebas de que **un observador no edita**, de convergencia de dos editores (el mismo caso que hoy pierde datos), y guía de prueba en los tres aparatos | `src/lib/vivo-entidad/__tests__/*` · `pruebas-reales/ses1115q.md` |

**Necesita antes:** nada de CRN. Sí una base Supabase con `os_sesiones_vivas` aplicada (la migración puede faltar en la
viva: el código ya devuelve `MENSAJE_SIN_DESPLEGAR`, `sesiones-vivas.ts:24-25`; confirmar en los aparatos).

**Qué prueba el dueño:** (1) en la Mac, pizarra → «Compartir en vivo» → su página; (2) en la tableta, entrar por la
pestaña de la página y dibujar a la vez que la Mac: **ambos trazos quedan**; (3) en el móvil, abrir el enlace de mirar:
cuenta como espectador y no puede editar; (4) quitar el rol `editor` a la cuenta de la tableta: deja de poder escribir.

### Fases siguientes

| Fase | Entrega | Necesita | Archivos |
|---|---|---|---|
| **2 · Escritorio y navegador vivos + canal interactivo** | migrar el escritorio a fusión por registro; pestaña «Escritorios», «Navegadores»; sección **Canales** (interactivos) con carpetas/filtros (§7); **rama** y grabación | fase 1 | `src/lib/vivo/escritorio.ts`, `components/estaciones/*` (ampliar), `app/(app)/canales/*` |
| **3 · Malla P2P y relé** | camino P2P para sesiones de datos con `canal-p2p.ts`; despliegue del relé propio y el cuenta-oyentes; modo «hablan 4, miran el resto» | fase 2 + servidor A1 | `src/lib/vivo/canal-sesion-p2p.ts`, `servicios/estaciones-rele/*` |
| **4 · Capacidad y anfitrión suplente** | interruptor «Ofrecer a sesiones», topes `soloWifi`/`kbpsSubidaMax`, promesas de eventos, **reemplazo de anfitrión** y árbol con origen suplente | fase 3; contenedor aislado (tarea aparte, CRN §4) | `src/lib/recursos/*` (ampliar), `src/lib/vivo/anfitrion.ts`, `components/recursos-ia/*` |
| **5 · Entidad con espacio completo** | pestañas Mensajes, Cerebro, Biblioteca, Astraura de la entidad; nodos de entidad y consenso (CRN §6.3) | fase 4; CRN fase 4 | `src/lib/entidad-espacio/*`, `src/lib/nodos/*` |
| **6 · VR/AR y juegos de la Biblioteca** | salas 3D/XR como superficie de entidad; ejecutar un juego de la Biblioteca como anfitrión único | fases 2 y 4 | `src/lib/vivo/espacial/*`, `src/components/xr/shell/*` |

---

## 11. Decisiones abiertas para Alex (8)

1. **¿Una sola matriz de roles para sesiones, traduciendo los cinco vocabularios, o unificar la base de datos?**
   *Recomiendo traducir* (§3.1) y unificar después. Cambiarlo luego cuesta una migración de roles con sus pruebas.
2. **Cerrar ya el hueco de «cualquier miembro edita» (§3.3).** *Recomiendo sí, como primera tarea.* Si se pospone, las
   pestañas de entidad nacen con un agujero.
3. **Transporte de sesiones de datos: ¿Supabase Realtime en fase 1 y P2P/relé en fase 3?** *Recomiendo sí.* Cambiar
   luego es barato porque el motor ya separa transporte y fusión.
4. **Consenso de entidades sobre el anfitrión de una sesión pública:** *Recomiendo* que el anfitrión lo fije
   `gestionar`; el voto sólo decide **políticas**. Cambiar a voto: una migración y la UI.
5. **Retención del registro: 30 días públicas / 7 privadas.** *Recomiendo esas cifras* hasta ver uso real.
6. **Quién puede grabar a la Biblioteca:** *recomiendo `gestionar`* con aviso visible a todos. Cambiar a «cualquiera»
   es una línea, pero no se puede des-grabar.
7. **¿Hay edad declarada en las cuentas?** *Recomiendo* añadirla como dato opcional «soy menor» sin fecha de nacimiento
   (mínimo dato). Cambiarlo después obliga a reaprobar salas públicas.
8. **Nombre:** hoy «Canales» son canales de publicación por agentes (Telegram). *Recomiendo* renombrarlos a **«Difusión»**
   y reservar «Canales» para lo interactivo. Renombrar después rompe enlaces y textos guardados.

---

## 12. Lo que añadiría y lo que desaconsejo

**Añadiría:**
- **Estado de sesión legible**: una sola línea siempre visible («Sala de Ana · 5 dentro · pasa por 2 nodos · si Ana se
  va, sigue Mac») — es la honestidad de Alex hecha pantalla.
- **«Repetir lo que pasó»**: el diario de entradas que ya llevan juegos y programas permite reproducir una sesión como
  vídeo sin grabar vídeo (coste cero en banda).
- **Modo «sólo un rato»**: una sesión pública con caducidad por defecto de 24 h; nada queda abierto por olvido.
- **Plantillas de espacio** para entidad (asamblea, aula, círculo, taller) reusando `salas/plantillas-sala.ts:64`.
- **Prueba de latencia previa**: antes de abrir un directo, medir enlace y decir si «cabe» el vídeo (se mide ya en
  `estadisticas-enlace.ts`, no leído).

**Desaconsejo:**
- **Meter CRDT genérico (Yjs/Loro) ahora.** Lo existente fusiona por registro y es puro y probado; sólo documentos de texto
  largos lo necesitarían (ya anotado en `apps-en-la-malla.md:§11`).
- **Usar el canal de control (CRN) como vehículo de documentos** (§1.8): mezcla poderes y ata a Android.
- **Anfitrión por voto de la comunidad** para algo que corre en un aparato personal: choca con la cláusula pétrea.
- **Prometer miles de espectadores de vídeo** antes de tener un SFU o HLS desde nube; hoy la escala honesta es ≈ 400 por
  árbol (§6).
- **Un «canal» por sección**: duplicaría lo que `os_spaces` + `os_estaciones` ya resuelven.

---

*Contrato SES1115Q. No incluye código. Lo no leído (Biblioteca/`packages.ts`, `components/estaciones/*`, `recursos-ia/*`,
mapa de señales, bloqueo de cuentas, `os_profiles`) está dicho arriba; quien construya la fase 1 debe leer P1-A..D contra
lo que ahí falta. Primera línea de la fase 1: §3.3.*
