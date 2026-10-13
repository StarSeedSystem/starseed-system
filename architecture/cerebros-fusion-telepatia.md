# Cerebros: un solo cerebro por cuenta, Fusionar, Telepatía, Privados y Públicos, Conectores y Procesos activos

Contrato de la ola **CB1013** (2026-10-13). Lo pidió Alex:

> «Por alguna razón se generaron varias versiones de los cerebros en mi cuenta automáticamente, la cual debería de haber sido sólo una investiga por qué ocurrió y fusionarlas en uno solo. también para cada cerebro Añade dos opciones, una de fusionar y otra de telepatía; fusionar Mezcla todas las memorias y configuraciones de los cerebros y telepatía nada más las vincula y sincronizar con folders y configuraciones específicos y accesos especificos a gruops, comunidades o cuentas externas de otros usuarios. También mejora el diseño de los botones, principales de memorias, habilidades contexto, neuronas y personalidades (quita "de Aurora"), añade otro de Conectores y otro de procesos activos (que incluya los agentes de genesis y de poligenesis, sueños e imaginacion nen 2do plano, descargas, instalaciones y actualizaciones activas, apps en 2do plano y cada uso de cada parte del hardware de los servidores vinculados incluyendo informacion del uso de memoria ram, gpu y cpu y almacenamiento y bateria y del resto todo con datos especificos y ajustables), y del resto de cada sección de cerebro, que los textos no se corten por tamaño del boton. También añade dos pestañas principales en la sección de cerebros; privados y publicos. Los privados deben ser para las cuentas y perfiles y los publicos son para grupos y comunidades también se debe poder configurar los medios de los servidores para las capacidades y para el almacenamiento, así como el resto de configuraciones de seguridad, privacidad, vinculación y sincronización de los cerebros completos o de memorias o folders específicos.»

La sección es `/cerebro` (`src/components/cerebro/cerebro-hub.tsx`). `/cerebros` (`brains-panel.tsx`) es la «gestión avanzada» y no cambia en esta ola.

Regla de toda la ola: **basta de ilusiones**. Cada número sale de una medida real con su hora y su fuente. Si no se puede medir, se escribe «sin medida en este aparato» y nunca un 0. Si un ajuste se guarda pero todavía no se aplica, la interfaz lo dice así.

---

## §1 · Por qué había 15 cerebros y qué se hizo (hecho, 2026-10-13)

**Qué había.** La cuenta de Alex tenía 15 cerebros, todos «Cerebro StarSeed»:

- **c7755fd9**, del 6 de septiembre: el principal, con `memory.md` de 260 KB y `knowledge.md` de 566 KB.
- **3ab250b8**, del 1 de octubre: sus «Actualizaciones automáticas de Astraura» del 1 al 9 de octubre no estaban en el principal.
- **13 cerebros vacíos**, creados el 10 de octubre entre las 19:48 y las 22:29 UTC. Cada uno tenía la memoria por defecto (824 B) y un `knowledge.md` generado.

**Causa.** `ensureDefaultBrain()` llamaba a `listBrains()`, y esta se tragaba cualquier error devolviendo `[]`. El guardián de consumo del cliente (`src/lib/consumo/guardian.ts`), al llegar al presupuesto diario o con el freno remoto, frena las lecturas y deja pasar las escrituras. Así, cada arranque de la app «veía» la cuenta vacía y creaba otro cerebro por defecto. Aquel día el guardián estuvo frenando lecturas durante horas, y por eso salieron 13 en una tarde.

**Arreglo de raíz** (commit `cf787fa0`):

- `listarCerebros()` devuelve `{ ok, brains }` y su lectura va marcada como esencial (`senalEsencial`).
- `debeCrearCerebroPorDefecto()` solo crea si se cumplen tres cosas: la lectura salió bien, hay 0 cerebros y la cuenta nunca tuvo uno en ese aparato.
- `ensureDefaultBrain()` devuelve el más antiguo si hay varios.
- La bienvenida (`steps-neurona.tsx`) ya no crea un «Cerebro principal» si no pudo leer.
- Hay 4 pruebas nuevas en `src/lib/brains/__tests__/cerebro-por-defecto.test.ts`.

**Fusión de datos.**

1. **Copia previa** (15 cerebros, 30 archivos, 2,4 MB) en dos sitios: `~/.starseed/backups/cerebros-alex-2026-10-13.json` y `starseed_memory_root/archivo/cerebros-duplicados-2026-10-13.json`, ambos con permisos 600.
2. **Fusión** en un único bloque que o pasa entero o no cambia nada. Al `memory.md` de c7755fd9 se añadieron las actualizaciones del 3ab250b8, bajo «Fusionado del cerebro duplicado 3ab250b8 (creado el 2026-10-01) · 2026-10-13». Luego se anotó `config.fusionados` (los 14 ids) y `config.fusionadoEn`, y se borraron los 14 duplicados con sus archivos.
3. **Resultado:** queda **1** cerebro, con `memory.md` de 265.174 B y 2 archivos.

**Hallazgo.** `brain_server_links` y `brain_selections` no tienen identidad de réplica y están en la publicación de tiempo real. Por eso **cualquier DELETE o UPDATE en ellas falla**, aunque no haya filas. La fusión lo esquivó porque los duplicados no tenían filas allí. El arreglo es una migración y necesita la palabra de Alex (§9 b).

## §2 · Pestañas principales: Privados y Públicos

| Pestaña | Para quién | `brains.scope` |
|---|---|---|
| **Privados** | la cuenta y sus perfiles | `account`, `profile` (y cualquier valor desconocido o vacío, para que nada quede escondido) |
| **Públicos** | grupos, comunidades y páginas | `group` (las comunidades son filas de `os_groups`), `page`, `community` |

- La lógica pura vive en `src/lib/cerebros/pestanas.ts`: `pestanaDeCerebro`, `cerebrosDePestana`, `pestanaDesdeUrl`. El enlace directo es `?vista=privados|publicos`.
- En **Públicos**, «Nuevo» lista los grupos, comunidades y páginas que la cuenta gestiona (`misEntidades()`) y crea el cerebro con `scope` = `group`/`page` y `scope_ref` = la entidad.
- La lectura compartida (§9 a) ya está aplicada en la base: los miembros pueden leer los cerebros públicos de sus grupos y los que les compartieron. La pestaña los enseñará cuando aterricen CB1013W y CB1013X, en solo lectura y con la marca «compartido contigo».

## §3 · Botones principales (pilares): 7 y sin texto cortado

**Los pilares.** Son siete: **Memorias**, **Habilidades**, **Contexto**, **Neuronas**, **Personalidades** (sin «de Aurora»), **Conectores** y **Procesos activos**. Se definen en `src/components/cerebro/pilares.tsx` (`PILARES`, `RejillaPilares`). En la URL, `?tab=` acepta `memoria`, `habilidades`, `contexto`, `neuronas`, `egos`, `conectores` y `procesos`; los ids viejos se mantienen.

**Diseño:**

- **Rejilla:** se adapta al ancho (`repeat(auto-fill, minmax(10.5rem, 1fr))`). En vez de forzar 5 columnas en 1.024 px, cada botón tiene al menos 168 px.
- **Orden dentro del botón:** el icono y la marca de activo van arriba. Debajo va el título en su propia línea, a todo el ancho, y debajo la descripción completa.
- **Texto:** el título solo parte entre palabras (`break-normal`, `hyphens-none`). Nada de `truncate`, `line-clamp` ni `whitespace-nowrap`. La palabra más larga («Personalidades», unos 115 px en `text-sm` semibold) cabe en los 136 px útiles.
- **Accesibilidad:** `aria-pressed`, `title` con la descripción y foco visible.

**Resto de la sección.** Ningún **botón** del cerebro corta su texto. Una prueba de guardia, `src/components/cerebro/__tests__/textos-no-cortados.test.ts`, busca `truncate`, `line-clamp-*` o `whitespace-nowrap` en la etiqueta de apertura de `<button>`/`<Button>` de `src/components/cerebro/*.tsx` y `src/components/aurora/personalities-panel.tsx`. Los nombres de archivo largos dentro de listas sí pueden recortarse, siempre con `title` que muestre el nombre entero.

## §4 · Fusionar (en cada cerebro)

**Qué hace.** Mezcla en ESTE cerebro (el destino) todas las memorias y configuraciones de los cerebros que elijas (los orígenes). Por defecto, después quita los orígenes.

**Archivos:**

- `src/lib/cerebros/fusion.ts`: el plan, puro y probado.
- `src/lib/cerebros/fusion-aplicar.ts`: lo aplica.
- `src/components/cerebro/fusionar-dialog.tsx`: el diálogo.

**El plan:** `planFusion(destino, origenes, archivos, prefs)`. No escribe nada.

1. **Archivos de memoria** (`brain_memory_files`, por `name`):
   - Si el destino no tiene ese archivo, se copia.
   - Si el contenido es igual una vez normalizado (espacios y frontmatter), se omite.
   - Si es distinto, se parte el origen por encabezados `## ` y se añaden **solo las secciones que el destino no contiene ya**. Van bajo `## Fusionado de «<nombre>» (<id 8>) · <AAAA-MM-DD>`, sin frontmatter y sin la cabecera de plantilla.
   - Cada entrada del plan dice qué archivo, cuántos bytes entran y de qué origen vienen.
2. **`includes`**: unión sin duplicados de `vaults`, `backends`, `personalities`, `runtimes`, `tokens`, `memories` y `connections`; también `permissions` por `who`. `bindScope` queda activo si lo tenía cualquiera, y `aiProvider` es el del destino o, si no tiene, el del primer origen.
3. **`servers`**: unión por `id`; si dos tienen el mismo `endpoint`, cuentan como el mismo.
4. **`config`**: el destino gana. Del origen solo entran las claves que el destino no tiene. Se añaden `fusionados: [...ids]` y `fusionadoEn`.
5. **Preferencias por cerebro** (`starseed.brain.<id>.<x>` en `localStorage`, sincronizadas a `user_settings.prefs`):
   - Si el destino no tiene la clave `<x>`, se copia.
   - Si ambas son listas, se unen por `id`, o por valor si no tienen `id`.
   - Si ambas son objetos, el destino gana y se rellenan las claves que le faltan.

**Al aplicar:**

1. **Copia de seguridad antes de escribir nada:** se descarga en el aparato `cerebros-fusion-<fecha>.json`, con todos los cerebros, archivos y preferencias implicados.
2. Se escriben los archivos (upsert por `brain_id`+`name`), el cerebro destino y las preferencias, y luego `pushPreferences()`.
3. Si se marcó «Quitar los cerebros fusionados» (marcado por defecto), se borran los orígenes. Sus archivos caen por `on delete cascade`.
4. Las selecciones (`brain_selections`) que apuntaban a un origen se mueven al destino solo cuando §9 b esté aplicada. Hasta entonces, si existe alguna, la fusión **no borra** ese origen y avisa.

**Interfaz.** El diálogo muestra la vista previa (por archivo y por sección: cuántos bytes, qué entra), la casilla de quitar orígenes y el botón «Fusionar». Al terminar dice qué pasó, con números reales.

## §5 · Telepatía (en cada cerebro)

**Qué hace.** Vincula y sincroniza **sin mezclar**. Cada cerebro sigue siendo suyo; solo se comparte lo que el vínculo dice.

**Archivos:**

- `src/lib/cerebros/telepatia.ts`: puro y probado.
- `src/lib/cerebros/telepatia-aplicar.ts`.
- `src/components/cerebro/telepatia-dialog.tsx`.

**Cómo es un vínculo:**

```ts
type DestinoTelepatia =
  | { tipo: "cerebro"; id: string }                       // otro cerebro tuyo
  | { tipo: "grupo" | "comunidad" | "pagina"; id: string } // una entidad
  | { tipo: "cuenta"; id: string };                       // cuenta externa (os_vinculos_externos)
interface VinculoTelepatico {
  id: string;
  destino: DestinoTelepatia;
  alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] };
  direccion: "enviar" | "recibir" | "ambas";
  acceso: "leer" | "escribir";
  auto: boolean;
  estado: "activo" | "pausado" | "pendiente";
  creadoEn: string;
  expiraEn?: string | null;
  ultimaSync?: string | null;
}
```

- **`memorias`**: nombres de archivo de `brain_memory_files`.
- **`carpetas`**: ids de raíces de memoria o de carpetas vinculadas (`starseed.brain.<id>.memoryRoots`, `carpetas-vinculadas.ts`).
- **`configuraciones`**: claves por cerebro, de esta lista: `servers`, `runtimes`, `skills`, `storage`, `apps`, `moa`, `channels`, `conectores`, `includes.personalities`.

**Dónde se guarda.** En `brain.config.telepatia: VinculoTelepatico[]` (jsonb, sin migración). Las funciones puras `validarVinculo` y `normalizarVinculos` descartan lo inválido.

**Sincronización.** `planSincronizacion(vinculo, origen, destino)` es pura y devuelve operaciones `{tipo:'archivo'|'config', nombre, de, a}`. Copia lo más nuevo según `updated_at`, **nunca borra** en el otro lado y respeta la dirección y el acceso. La memoria escrita por telepatía lleva `meta.telepatia = <id del vínculo>`.

**Cómo se aplica, según el destino:**

- **Otro cerebro tuyo:** se aplica de verdad (RLS del dueño). Corre al abrir el cerebro y cuando cambia un archivo (tiempo real de `brain_memory_files`) si `auto` está activo.
- **Grupo, comunidad o página:** se registra el permiso con `upsertGrant` sobre `{type:"brain"}`, con `granteeId` = el **slug** del grupo (así lo guarda `access.ts` en `os_spaces.group_slug`), el rol según el acceso y `sections` según el alcance. Con §9 a aplicada, sus miembros lo leen en el acto y el vínculo queda `activo`. Escribir sigue siendo solo del dueño.
- **Cuenta externa:** se crea un vínculo en `os_vinculos_externos` (`/api/externos/vinculos`), con `ambito_tipo` `cerebro`, `memoria` o `carpeta` y los permisos `leer`/`escribir`/`memoria`. El token se enseña una sola vez y nunca se guarda en la configuración.

**Interfaz.** Lista de vínculos (estado, alcance y última sincronización), «Nuevo vínculo» (destino → alcance → dirección y acceso → caducidad), «Sincronizar ahora», «Pausar» y «Quitar».

## §6 · Conectores (pilar nuevo)

**Archivos:** `src/lib/cerebros/conectores.ts` (puro y probado) y `src/components/cerebro/conectores-panel.tsx`.

**De dónde salen**, sin inventar ninguno:

| Fuente | Qué aporta |
|---|---|
| `listConnectors()` | `src/lib/connectors/*`: conectores con estado `available`/`connected`/`needs-auth` |
| `INTEGRATIONS` + `loadIntegrationConfig(id, brainId)` | integraciones de este cerebro |
| `loadAbilities()` + `ability_links` del cerebro | servidores MCP y habilidades atadas |
| `os_vinculos_externos` con `ambito` en este cerebro | cuentas externas |
| `starseed.brain.<id>.channels` | canales de mensajería |

**Tipo resultante:** `ConectorCerebro {id, nombre, tipo, estado, enCerebro, enlace}`.

- `tipo`: `conector`, `integracion`, `mcp`, `cuenta-externa` o `canal`.
- `estado`: `conectado`, `falta-clave`, `disponible` o `error`.
- `enlace`: a `/conexiones` o al panel donde se configura.

**Activar en el cerebro.** El interruptor «Usar en este cerebro» se guarda en `starseed.brain.<id>.conectores`, que se sincroniza con las preferencias.

## §7 · Procesos activos (pilar nuevo)

**Archivos:**

- `src/lib/cerebros/procesos.ts`: puro y probado.
- `src/lib/cerebros/procesos-fuentes.ts`: lee las fuentes.
- `src/components/cerebro/procesos-panel.tsx` y `procesos-hardware.tsx`: la interfaz.
- `src/lib/cerebros/procesos-preferencias.ts` y `procesos-ajustes.tsx`: los ajustes.

**Tipos** (puros):

```ts
type TipoProceso = "genesis" | "poligenesis" | "sueno" | "imaginacion" | "descarga" | "instalacion"
  | "actualizacion" | "app-fondo" | "servicio";
interface ProcesoActivo { id: string; tipo: TipoProceso; nombre: string;
  estado: "en-marcha" | "esperando" | "pausado" | "fallando"; progreso: number | null; // 0..1; null = sin medida
  donde: string; desde: number | null; detalle?: string; fuente: string; }
interface HardwareServidor { id: string; nombre: string; tipo: "mac" | "a1" | "neurona" | "nube" | "otro";
  cpuPct: number | null; nucleos: number | null; carga: number | null;
  ramUsadaMb: number | null; ramTotalMb: number | null;
  gpuPct: number | null; gpuNombre: string | null;
  discoLibreGb: number | null; discoTotalGb: number | null;
  bateriaPct: number | null; cargando: boolean | null;
  medidoEn: number | null; fuente: string; }
```

**Fuentes.** Las de la Mac (`/api/mando/*`) solo responden en la Mac o con sesión de MetaGenesis. El adaptador las intenta con un tope de 4 s y, si no responden, sigue con las demás.

| Qué | Fuente |
|---|---|
| Agentes de Genesis | `/api/mando/agentes` (sesiones y procesos) y `/api/mando/medidores` (`latidos`); desde cualquier aparato, `leerEstadoAutonomo()` (nodos de MetaGenesis con sus orquestadores) |
| PoliGenesis | `leerHistorial()` (operaciones `propuesta` en curso) y `propuestasDe()` de mis entidades |
| Sueños | `/api/mando/suenos`; `fetchAstraura158DreamStatus` |
| Imaginación | `fetchAstraura158ImaginationStatus`; `listRuns()` de `imagine_runs` con estado en curso |
| Descargas e instalaciones | `useInstalaciones()` / `sincronizarInstalaciones()`, estados `pedida`/`descargada` |
| Actualizaciones | `use-estado-actualizaciones.ts` (capas por aparato) y `/api/library/actualizaciones` |
| Apps en segundo plano | ventanas minimizadas de `readDesktopsSnapshot()`, tareas de `task-manager.ts` y neuronas con `visible=false` de `usePresenciaNeuronas()` |

**Hardware de cada servidor o neurona vinculada:**

| Servidor | Fuente |
|---|---|
| Esta Mac | **`/api/mando/hardware`, nueva** (§7.1) |
| A1 | `leerEstadoAutonomo()` + `cpu_pct`/`ram_total_mb`/`disco_total_gb`, **nuevos** en la salud del nodo (§7.2) |
| Neuronas de navegador | `neuron_devices.capabilities`: batería y cuota de almacenamiento. CPU y GPU dicen «sin medida en este aparato» |

**§7.1 · `/api/mando/hardware`** (solo local, detrás de `guardianMando`). La lógica va en `src/lib/mando/hardware.ts`:

| Medida | Cómo |
|---|---|
| CPU % | dos lecturas de `os.cpus()` separadas 400 ms |
| RAM | `os.totalmem()` y `vm_stat` en macOS |
| GPU % | `ioreg -r -d 1 -c IOAccelerator`, `PerformanceStatistics` → «Device Utilization %» (sin sudo) |
| Disco | `fs.statfs` de la raíz del repo |
| Batería | `pmset -g batt` |

Los analizadores de `ioreg` y `pmset` son puros y probados. La respuesta se cachea 3 s y comparte su cálculo entre peticiones (`compartirCalculo`).

**§7.2 · Salud del nodo de MetaGenesis.** En `scripts/puente/nodo_metagenesis_medio.py` se añaden `cpu_pct` (dos lecturas de `/proc/stat`, o `os.getloadavg`/núcleos marcado como `estimado` en macOS), `ram_total_mb` y `disco_total_gb`. La vista (`nodo_metagenesis_logica.py`) los pasa y `NodoVista` en TS los recibe.

**Ajustables** (`starseed.cerebros.procesos.v1`, sincronizado):

| Ajuste | Valor |
|---|---|
| Tipos visibles | — |
| Intervalo | 5-120 s, 15 s por defecto (solo con la pestaña visible) |
| Umbrales de aviso | CPU 85 %, RAM 90 %, disco 90 %, batería 20 % |
| Servidores ocultos | — |

Los **límites por cerebro y servidor** (CPU % y RAM máximos para las tareas de este cerebro) se guardan en `starseed.brain.<id>.limites` y se muestran como «guardado; lo aplicará el orquestador», porque hoy nadie los aplica.

**Acciones.** Solo las que ya existen: cancelar una instalación (store), restaurar o cerrar una ventana en segundo plano (desktop-store) y abrir Genesis para un agente. Lo demás es solo lectura.

## §8 · Ajustes del cerebro: medios, seguridad, privacidad, vinculación y sincronización

**Archivos:**

- `src/lib/cerebros/ajustes.ts`: puro y probado.
- `src/components/cerebro/ajustes-cerebro-dialog.tsx`, `ajustes-medios.tsx`, `ajustes-seguridad.tsx` y `ajustes-sync.tsx`.

**A qué se aplica.** Un selector «Aplicar a» elige entre el cerebro completo, una memoria (archivo) o una carpeta.

**Modelo**, en `brain.config.ajustes` (jsonb):

```ts
type Capacidad = "texto" | "imagen" | "voz" | "video" | "embeddings" | "agentes";
interface AjustesObjetivo {
  privacidad: "privado" | "perfil" | "grupo" | "publico";
  cifradoLocal: boolean;
  medios: { capacidades: Partial<Record<Capacidad, string>>; almacenamiento: string[] }; // ids de servidor/medio o "auto"
  sync: { direccion: "enviar" | "recibir" | "ambas" | "ninguna"; auto: boolean; destinos: string[] };
  acceso: { quien: string; nivel: "leer" | "escribir" | "admin" }[];
}
interface AjustesCerebro { cerebro: AjustesObjetivo; memorias: Record<string, Partial<AjustesObjetivo>>; carpetas: Record<string, Partial<AjustesObjetivo>>; }
```

`ajustesEfectivos(ajustes, objetivo)` aplica la herencia: lo de la memoria o carpeta pisa lo del cerebro.

**Medios.**

- **Capacidades:** los servidores salen de `brain.servers`, las neuronas, el A1 y los proveedores (`includes.aiProvider`, `.moa`).
- **Almacenamiento:** `config.memoryDestinations` (local, StarSeed, externos, P2P) más `destinosDe()` de la malla (MC1012P) para explicar adónde va cada dato.

**Qué se aplica ya y qué no.** Cada ajuste lleva una marca de si **se aplica ya** o **solo se guarda**.

| Ajuste | Estado |
|---|---|
| Destinos de memoria | se aplica (`syncBrainMemoryNow`) |
| Privacidad que cambia de pestaña | se aplica (`scope`) |
| Permisos del cerebro entero (Compartir / Telepatía) | se aplica (lectura, §9 a) |
| Permisos por memoria o carpeta | solo se guarda (la lectura compartida es por cerebro entero) |
| Cifrado local | solo se guarda hasta su tarea propia |

## §9 · Migraciones: aprobadas por Alex y aplicadas (2026-10-13)

Alex: «apruebo todo». Archivo: `supabase/migrations/20261013150000_cerebros_compartidos.sql`, idempotente y aplicado en el proyecto activo.

- **a) Lectura compartida.** La función `security definer` `cerebro_compartido_conmigo(brain_id)` devuelve verdadero en tres casos:
  - si eres el dueño;
  - si el **dueño** compartió el cerebro con permisos universales (`os_spaces` con `doc.sharing.resource = {type:'brain', id}`), con las mismas reglas que `sp_select`: público, miembro del grupo del espacio, perfil propio o editor «member»/«invited»;
  - si es un cerebro público (`scope` group/community/page) de una entidad que su dueño posee o gestiona (rango ≥ 2) y tú eres miembro (dueño, rol en `os_entity_roles` u `os_memberships`). Sin la condición del dueño, cualquiera podría colgar un cerebro en un grupo ajeno.

  Las políticas `br_compartido_leer` y `bmf_compartido_leer` son **solo de lectura**: escribir sigue siendo cosa del dueño. `anon` no puede llamar a la función.
- **b) Identidad de réplica `full`** en `brain_server_links` y `brain_selections`. Ya se pueden borrar y cambiar sus filas.
- **c) Índice único `brains_un_cerebro_por_defecto`** en `brains (owner)` donde `config->>'template' = 'starseed-default'`. Antes de crearlo había 8 cuentas con un cerebro por defecto cada una.

**Probado antes de aplicar**, dentro de una transacción que se deshizo:

| Caso | Resultado |
|---|---|
| Sin compartir | otra cuenta ve 0 cerebros y 0 memorias de Alex |
| Compartido por invitación | esa cuenta ve 1 cerebro y 2 memorias, no puede cambiarlo (0 filas) y una tercera ve 0 |
| Grupo | el miembro ve el cerebro del grupo y NO el que colgó alguien que no lo gestiona; quien no es miembro ve 0 |
| Índice único | un segundo cerebro por defecto se rechaza |
| Identidad de réplica | borrar y cambiar enlaces funciona |

**Lo que falta en el cliente:** `listBrains` y `listMemoryFiles` filtran por `owner`, así que todavía no enseñan lo compartido. Lo traen CB1013W (lectura) y CB1013X (pestañas del hub).

## §10 · Ola CB1013

**Base adelantada por Claude** (CB1013A, en `main`):

- `pestanas.ts` con su prueba y `pilares.tsx`.
- El hub con las pestañas y los 7 pilares.
- Los botones Fusionar, Telepatía y Ajustes de cada cerebro.
- Cinco componentes de partida, que dicen con honestidad «lo está construyendo el enjambre (tarea …)» hasta que su tarea los sustituya: `conectores-panel.tsx`, `procesos-panel.tsx`, `fusionar-dialog.tsx`, `telepatia-dialog.tsx` y `ajustes-cerebro-dialog.tsx`.

**Cola.** `starseed_memory_root/olas/cola-cerebros-1013.json`, con 23 tareas (CB1013B-X). Cada tarea toca 3 archivos como mucho, con 120 líneas nuevas por archivo como mucho. Lo puro va con pruebas. Salvo CB1013X, ninguna tarea toca `cerebro-hub.tsx`: cada una sustituye su componente de partida.

| Tareas | Qué traen |
|---|---|
| B, C, D | Fusionar: plan puro, aplicar con copia, diálogo |
| E, F, G | Telepatía: lógica pura, aplicar (cerebro propio, grupo/comunidad/página, cuenta externa), diálogo |
| H, I | Conectores: lógica pura; fuentes y panel |
| J, K, L, N, O, P | Procesos activos: tipos y hardware, normalizadores, fuentes del cliente, panel, tarjetas de hardware, ajustes |
| M | `/api/mando/hardware` (CPU, RAM, GPU, disco y batería de la Mac) |
| Q | `cpu_pct`, `ram_total_mb` y `disco_total_gb` en la salud del nodo de MetaGenesis (A1) |
| R, S, T | Ajustes del cerebro: modelo con herencia; diálogo y Medios; Seguridad, privacidad, vinculación y sincronización |
| U, V | Textos no cortados en el resto de la sección y prueba de guardia |
| W, X | Cerebros compartidos contigo: lectura (W) y su sitio en las pestañas, en solo lectura (X, la única que toca el hub) |

**Verificación.**

- **Puertas:** tsc, vitest related y pytest del puente.
- **En `localhost:9002/cerebro`:**
  - las dos pestañas con sus cuentas;
  - los 7 botones sin texto partido a 1.280 px y a 390 px;
  - fusionar dos cerebros de prueba (la copia se descarga, la memoria se une y el origen se quita);
  - un vínculo de telepatía entre dos cerebros propios (sincroniza y no borra);
  - procesos con CPU, RAM, GPU, disco y batería reales de la Mac y del A1.
