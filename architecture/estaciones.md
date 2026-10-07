# Estaciones: transmisiones en directo libres para todo StarSeed OS (Ola 1010E)

> Petición de Alex (2026-10-07): «añade una página, sección y función principal de StarSeed OS de
> "Estaciones" donde sean enlaces de transmisiones en directo públicas que pueden estar
> reproduciendo cualquier contenido de cualquier tipo de formato y archivo de programa,
> fundamentalmente siendo enlaces en línea de contenido libre en directo en tiempo real ya sea
> audio, vídeos, espacios de realidad virtual, eventos, anuncios, juegos con servidores públicos,
> pizarras, dashboards, programas, apps, cualquier tipo de programa incluyendo las opciones de
> transmisión con antenas de redes mesh o toda libertad de estudios de producción audiovisual con
> IA diseñado para producción en directo en StarSeed OS con cualquier formato autoadaptable».

Este archivo es la **fuente de verdad** de la ola. Lo que no esté aquí no se inventa; si el código
real choca con el contrato, gana el código y se anota en el informe de la tarea.

## 1. Reglas (no se negocian)

1. **Contenido libre en directo.** Cada estación declara su **licencia** (`cc0`, `cc-by`,
   `cc-by-sa`, `dominio-publico`, `libre-otra`, `propia-abierta`): es obligatoria y se enseña en la
   tarjeta. Una estación no es un muro de pago ni un enlace de descarga.
2. **Enlaces seguros.** Solo `https://` para fuentes externas (validado con `isSafeHttpUrl` de
   `src/lib/library/url-utils.ts` y además `protocol === "https:"`); rutas internas de StarSeed
   empiezan por `/`. Nunca `javascript:`, `data:` ni `blob:` guardados.
3. **Incrustar con aislamiento.** Todo lo web va en `<iframe>` con `sandbox={FRAME_SANDBOX}` y
   `allow={FRAME_ALLOW}` de `src/components/browser/web-frame.tsx`, `loading="lazy"`,
   `referrerPolicy="no-referrer"`. Si el sitio no se deja incrustar (`isLikelyEmbeddable` de
   `src/lib/browser/browser.ts` devuelve `false`), se ofrece «Abrir en una pestaña» en vez de un
   marco en blanco.
4. **Nada suena solo.** Autoplay siempre en silencio (`muted`), con un botón grande de «Activar
   sonido». Accesible: controles con etiqueta, foco visible, subtítulos si la fuente los trae.
5. **Formato autoadaptable.** El usuario pega un enlace y el OS deduce formato y reproductor
   (§4); la tarjeta, el reproductor y el estudio se adaptan a móvil vertical, escritorio, TV y XR.
6. **Ámbitos de Genesis.** Una estación pertenece a un **ámbito**: una persona, o una entidad
   (grupo, página, comunidad) con su `entidad_ref`. Pueden publicarla el dueño (persona) o
   owner/admin/editor de la entidad (mismos roles que `src/lib/mando/ambito.ts`).
7. **Malla.** Por la radio LoRa solo viaja un **faro** de ≤ 200 bytes (puntero: id, título corto,
   tipo, enlace corto); nunca audio ni vídeo. El medio en vivo va por internet, por el relé de
   servidor o por WebRTC entre neuronas (§7).
8. **Moderación restaurativa** (§6.4): denunciar oculta la estación SOLO para quien denuncia y
   avisa al ámbito; nunca hay borrado automático ni castigo. Quien publica puede corregir.
9. **Sin dependencias nuevas** para el enjambre. La única, `hls.js` (reproducir HLS fuera de
   Safari), la instala la dirección antes de la ola (tarea ES1010D0) y se carga con `import()`
   perezoso; si falta, el reproductor abre la fuente en una pestaña.
10. **Cliente sin `node:*`.** Todo `src/lib/estaciones/*` es puro o usa el cliente Supabase del
    navegador (`@/utils/supabase/client`). Ningún archivo de esta ola importa `node:*`.
11. **Medios del OS.** La página se registra en el dock, el catálogo de apps y la Biblioteca
    (CLAUDE.md §11), y en los kits de cada entidad (grupo/página/comunidad).

## 2. Conceptos

| Concepto | Qué es |
|---|---|
| **Estación** | Una transmisión pública (o de grupo) con un enlace vivo. Fila de `os_estaciones`. |
| **Tipo** | Lo que se emite: `audio` · `video` · `xr` (espacio VR/3D) · `evento` · `anuncio` · `juego` · `pizarra` · `dashboard` · `programa` · `app` · `mixto`. |
| **Fuente** | De dónde sale: `enlace` (URL externa https) · `starseed` (ruta interna del OS: sala XR, dashboard compartido, juego, programa, servidor de apps, canal en vivo) · `estudio` (el Estudio de producción de StarSeed, §10). |
| **Formato** | Cómo se reproduce: deducido del enlace (§4). |
| **En directo** | Estado calculado (§5): `en-directo` · `programada` · `pausada` · `terminada`. |
| **Faro** | Anuncio diminuto de una estación por la malla (§7). |
| **Estudio** | Mesa de producción en el navegador: escenas, fuentes, rótulos, IA y salidas (§10). |

## 3. Tipos (`src/lib/estaciones/tipos.ts`, puro)

```ts
export const TIPOS_ESTACION = ["audio","video","xr","evento","anuncio","juego","pizarra","dashboard","programa","app","mixto"] as const;
export type TipoEstacion = typeof TIPOS_ESTACION[number];
export const FUENTES_ESTACION = ["enlace","starseed","estudio"] as const;
export type FuenteEstacion = typeof FUENTES_ESTACION[number];
export const LICENCIAS_LIBRES = ["cc0","cc-by","cc-by-sa","dominio-publico","libre-otra","propia-abierta"] as const;
export type LicenciaEstacion = typeof LICENCIAS_LIBRES[number];
export type VisibilidadEstacion = "publica" | "grupo";
export type EstadoDirecto = "en-directo" | "programada" | "pausada" | "terminada";

export interface Estacion {
  id: string;
  owner_id: string;
  ambito_tipo: "persona" | "entidad";
  entidad_ref: string | null;      // slug o uuid de la entidad; null en persona
  titulo: string;                  // 2..100
  descripcion: string;             // ≤ 1000
  tipo: TipoEstacion;
  fuente: FuenteEstacion;
  enlace: string;                  // https://… o /ruta-interna
  formato: string;                 // FormatoReproduccion (§4) guardado al publicar
  imagen: string | null;           // https o null
  idioma: string;                  // 'es' por defecto
  categorias: string[];            // ≤ 8, minúsculas, sin repetir
  licencia: LicenciaEstacion;
  visibilidad: VisibilidadEstacion;
  empieza_en: string | null;       // ISO; null = cuando esté en directo
  termina_en: string | null;
  ultimo_latido: string | null;    // ISO; lo escribe el emisor mientras emite
  pausada: boolean;
  en_malla: boolean;               // anunciarla por faros (§7)
  espectadores: number;            // último recuento de presencia conocido
  created_at: string;
  updated_at: string;
}
export type BorradorEstacion = Pick<Estacion,"titulo"|"tipo"|"fuente"|"enlace"|"licencia"> &
  Partial<Pick<Estacion,"descripcion"|"imagen"|"idioma"|"categorias"|"visibilidad"|"empieza_en"|"termina_en"|"en_malla"|"ambito_tipo"|"entidad_ref">>;
export type ResultadoValidacion = { ok: true; estacion: BorradorEstacion } | { ok: false; errores: string[] };
export function validarEstacion(b: BorradorEstacion): ResultadoValidacion;   // §3.1
export function normalizarCategorias(bruto: string | string[]): string[];      // como canales
export const ETIQUETA_TIPO: Record<TipoEstacion, string>;   // «Audio», «Vídeo», «Realidad virtual»…
export const ETIQUETA_LICENCIA: Record<LicenciaEstacion, string>;
```

### 3.1 `validarEstacion`

Devuelve TODOS los errores, en español y con cómo arreglarlo: título 2–100 tras `trim`;
descripción ≤ 1000; `tipo`, `fuente` y `licencia` dentro de su lista; `enlace` obligatorio:
`fuente === "enlace"` → https válido (regla 2); `fuente === "starseed" | "estudio"` → empieza por
`/` y no por `//`; `imagen` null o https; `empieza_en`/`termina_en` ISO válidos y `termina_en >
empieza_en`; `ambito_tipo === "entidad"` exige `entidad_ref`; categorías normalizadas (≤ 8, ≤ 24
caracteres cada una). El borrador devuelto sale normalizado (trim, categorías, `idioma` 'es',
`visibilidad` 'publica', `en_malla` false, `ambito_tipo` 'persona').

## 4. Formato autoadaptable (`src/lib/estaciones/formato.ts`, puro)

```ts
export type FormatoReproduccion =
  | "hls" | "dash" | "audio" | "video" | "youtube" | "twitch" | "vimeo" | "peertube" | "owncast"
  | "jitsi" | "webrtc-whep" | "web" | "interno";
export type Reproductor = "nativo-audio" | "nativo-video" | "hls" | "marco" | "interno" | "pestana";
export interface FormatoDetectado {
  formato: FormatoReproduccion;
  reproductor: Reproductor;
  urlIncrustable: string | null;   // URL para el iframe (embed) o null
  soloAudio: boolean;
  motivo: string;                  // frase corta para la UI: «HLS (.m3u8)», «YouTube en directo»…
}
export function detectarFormato(enlace: string, tipo?: TipoEstacion): FormatoDetectado;
export function tipoSugerido(f: FormatoDetectado): TipoEstacion;   // para pre-rellenar el formulario
```

Tabla de detección (en este orden, por URL; sin red):

| Señal | formato | reproductor | incrustable |
|---|---|---|---|
| empieza por `/` | `interno` | `interno` | — (se navega dentro del OS) |
| `.m3u8` (o `format=m3u8`) | `hls` | `hls` | — |
| `.mpd` | `dash` | `pestana` (sin dependencia DASH) | — |
| `.mp3 .aac .ogg .opus .flac .wav`, `/stream`, `/listen`, `:8000/`, `icecast`, `shoutcast` | `audio` | `nativo-audio` | — |
| `.mp4 .webm .mov` | `video` | `nativo-video` | — |
| youtube.com/watch, /live/, youtu.be | `youtube` | `marco` | `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&mute=1` |
| twitch.tv/<canal> | `twitch` | `marco` | `https://player.twitch.tv/?channel=<canal>&parent=<host del OS>&muted=true` (el `parent` se pasa en tiempo de render) |
| vimeo.com/<id> (o /event/<id>) | `vimeo` | `marco` | `https://player.vimeo.com/video/<id>?muted=1` (o `…/event/<id>/embed`) |
| `/videos/watch/` o `/w/` (PeerTube) | `peertube` | `marco` | misma instancia con `/videos/embed/<id>` |
| `/embed.html` o host con «owncast» | `owncast` | `marco` | el enlace tal cual |
| meet.jit.si o `/jitsi` | `jitsi` | `marco` | el enlace tal cual |
| `/whep` | `webrtc-whep` | `pestana` (fase 2) | — |
| cualquier otro https | `web` | `marco` (o `pestana` si `isLikelyEmbeddable` da `false`) | el enlace |

`soloAudio` es true para `audio` y para `tipo === "audio"`. Las pruebas cubren cada fila y los
casos raros (mayúsculas, query, fragmento, puerto).

## 5. En directo, orden y filtros (`src/lib/estaciones/directo.ts`, puro)

```ts
export const LATIDO_VIVO_MS = 2 * 60_000;
export function estadoDirecto(e: Estacion, ahora: number): EstadoDirecto;
export function ordenarEstaciones(lista: Estacion[], ahora: number): Estacion[];
export interface FiltroEstaciones { tipo?: TipoEstacion | "todas"; categoria?: string; idioma?: string; texto?: string; soloEnDirecto?: boolean; ambito?: string }
export function filtrarEstaciones(lista: Estacion[], f: FiltroEstaciones, ahora: number): Estacion[];
export function categoriasPopulares(lista: Estacion[], max?: number): { categoria: string; cuenta: number }[];
```

`estadoDirecto`: `pausada` si `pausada`; `terminada` si `termina_en` pasó; `en-directo` si
`ultimo_latido` tiene menos de `LATIDO_VIVO_MS`, o si es un `enlace` externo sin latido y `ahora`
está entre `empieza_en` y `termina_en` (o sin horario: un enlace externo publicado se considera en
directo mientras no se pause ni termine); `programada` si `empieza_en` es futuro; si no,
`terminada`. Orden: en directo primero (más espectadores, luego más reciente), después
programadas por hora de inicio, después el resto por `updated_at`. `texto` busca sin acentos ni
mayúsculas en título, descripción y categorías.

## 6. Datos

### 6.1 Migración `supabase/migrations/20261010090000_os_estaciones.sql`

Idempotente como `20260908050000_os_canales.sql`. Tabla `public.os_estaciones` con las columnas de
`Estacion` (§3) y sus `check` (`tipo`, `fuente`, `licencia`, `visibilidad`, longitudes, `ambito_tipo
in ('persona','entidad')`, `entidad_ref is not null` si es entidad, `array_length(categorias,1) <=
8`); índices `(created_at desc)`, `(tipo, updated_at desc)`, `(ultimo_latido desc)`,
`(entidad_ref)`. Tabla `public.os_estaciones_denuncias (estacion_id, autor_id, motivo ≤ 300,
created_at, primary key (estacion_id, autor_id))`. RLS: lectura de `os_estaciones` para todos
(`anon` incluido) si `visibilidad = 'publica'`; si es `grupo`, solo miembros activos de la entidad
(misma consulta de pertenencia que `mando_rol` de `20261008090100_mando_politicas.sql`, con
`account_id`); escritura (`insert/update/delete`) del `owner_id = auth.uid()`, o de owner/admin/
editor de la entidad. Denuncias: insertar la propia (`autor_id = auth.uid()`), leer solo las
propias y las de estaciones de las que eres dueño. Ambas tablas a `supabase_realtime` (bloque `DO`
como en canales). Trigger `updated_at`. Sin `grant … to anon` salvo el `select` de la política.
**No se aplica a ninguna base de datos en esta ola** (lo decide Alex).

### 6.2 Capa de datos (`src/lib/estaciones/datos.ts`, cliente)

```ts
export async function listarEstaciones(o?: { limite?: number; ambito?: string; tipo?: TipoEstacion }): Promise<Estacion[]>; // nunca lanza: [] si falla
export async function obtenerEstacion(id: string): Promise<Estacion | null>;
export async function publicarEstacion(b: BorradorEstacion): Promise<{ ok: true; estacion: Estacion } | { ok: false; error: string }>;
export async function editarEstacion(id: string, parche: Partial<BorradorEstacion>): Promise<…mismo…>;
export async function latirEstacion(id: string, espectadores?: number): Promise<boolean>;   // ultimo_latido = now()
export async function pausarEstacion(id: string, pausada: boolean): Promise<boolean>;
export async function terminarEstacion(id: string): Promise<boolean>;                       // termina_en = now()
export async function denunciarEstacion(id: string, motivo: string): Promise<boolean>;
export function ocultasLocales(): Set<string>;  // localStorage 'starseed.estaciones.ocultas.v1', con try/catch
export function ocultarLocal(id: string): void;
```

Validan con `validarEstacion` antes de escribir, guardan el `formato` de `detectarFormato`, y
usan `createClient()` de `@/utils/supabase/client` (el singleton) inyectable para las pruebas.

### 6.3 Presencia y chat

Espectadores y chat de una estación: canal Realtime `estacion:<id>` (presence + broadcast
`chat`, mensajes efímeros, ≤ 500 caracteres, sin guardar). El dueño, mientras su página de
emisión está abierta, llama a `latirEstacion` cada 60 s con el recuento de presencia.

### 6.4 Denuncias

`denunciarEstacion` + `ocultarLocal`: la estación desaparece para quien denuncia y el dueño ve
«N denuncias» en su tarjeta con los motivos. Nada se borra solo.

## 7. Malla (`src/lib/estaciones/malla.ts`)

```ts
export function faroDeEstacion(e: Estacion): { id: string; kind: "estacion"; name: string; category: TipoEstacion; media_url: string } ; // ≤ 200 bytes en JSON
export function bytesDeFaro(f: ReturnType<typeof faroDeEstacion>): number;
export async function anunciarEnMalla(e: Estacion, deps?: { uploadPublic?; enqueueMeshSync? }): Promise<{ servidor: boolean; radio: boolean }>;
export function estacionesDeFaros(items: { body: unknown }[]): Array<Pick<Estacion,"id"|"titulo"|"tipo"|"enlace"> & { oidaPorMalla: true }>;
```

El faro usa el tipo de malla existente **`post`** (sus campos permitidos ya incluyen `id`,
`kind`, `name`, `category`, `media_url`: no se toca `FIELD_WHITELIST`): `name` = título recortado
a 48 caracteres, `media_url` = el enlace (si pasa de 120 caracteres, la ruta interna
`/estaciones/<id>`). Se emite por `uploadPublic({ cls: "P2", ptype: "post", body: faro, oid:
"estacion:" + id })` de `src/ai/astraura/mesh/server-relay.ts` y, si hay radio, por
`enqueueMeshSync({ type: "post", cls: "P2", body: faro })` de `src/ai/astraura/mesh/sync.ts`.
Ambas dependencias se inyectan (pruebas sin red). `estacionesDeFaros` convierte lo recibido del
feed público (`pullPublicFeed`) en estaciones «oídas por la malla» (insignia en la tarjeta).

## 8. Fuentes internas (`src/lib/estaciones/internas.ts`)

```ts
export async function estacionesInternas(deps?): Promise<Estacion[]>;
```

Convierte en estaciones de solo lectura (`fuente: "starseed"`, `licencia: "propia-abierta"`,
id `interna:<clase>:<refId>`) lo que ya está vivo y es público en el OS: servidores de apps
públicos (`listServers("public")` de `src/lib/servers/app-servers.ts`; `kind` juego → tipo
`juego`, programa → `programa`, entorno → `xr`, app/otro → `app`; enlace `app_route` o la ruta
del servidor), dashboards compartidos (`listarDashboardsVivos()` de `src/lib/vivo/dashboard.ts`
→ tipo `dashboard`, enlace `/dashboard-compartido?id=<refId>`) y juegos vivos
(`listarEspaciosVivos` de `src/lib/vivo/juegos/espacio-vivo.ts` → `juego`). Nunca lanza; cada
fuente que falla se salta. No se guardan en `os_estaciones`.

## 9. Interfaz

- **`/estaciones`** (`src/app/(app)/estaciones/page.tsx` → `DirectorioEstaciones`): cabecera
  «Estaciones · en directo ahora», fila horizontal de las que están en directo, filtros por tipo
  (chips con icono), búsqueda, categorías populares, rejilla de `TarjetaEstacion`, botón
  «Publicar estación» y «Abrir el estudio». Vivo con `useRealtimeRows("os_estaciones", …)` de
  `src/lib/realtime/realtime.ts`; mezcla las internas (§8) y las oídas por malla (§7).
- **`TarjetaEstacion`**: imagen o degradado por tipo, insignia «● EN DIRECTO» (o la hora si está
  programada), tipo, licencia, ámbito («de <entidad>»), espectadores, insignia «malla» si llegó
  por faro, menú (denunciar/ocultar; editar/pausar/terminar si es tuya).
- **`/estaciones/[id]`** (`detalle-estacion.tsx`): `ReproductorEstacion` grande, título,
  descripción, licencia, espectadores (presencia), chat efímero, «Compartir», «Abrir en una
  pestaña», y para el dueño: «Estoy emitiendo» (latido), pausar, terminar, anunciar en la malla.
- **`ReproductorEstacion`** (`src/components/estaciones/reproductor-estacion.tsx`): decide por
  `detectarFormato`: `<audio>`/`<video>` nativos (`controls playsInline muted`), HLS nativo si
  `canPlayType("application/vnd.apple.mpegurl")` y si no `import("hls.js")` (si falla →
  `pestana`), `<iframe>` aislado para `marco`, `next/link` para `interno`, y botón «Abrir en una
  pestaña» siempre visible. Relación de aspecto: 16:9; `soloAudio` → barra compacta con ecualizador
  animado (respeta `prefers-reduced-motion`); en móvil vertical ocupa el ancho.
- **`NuevaEstacion`** (diálogo): pegar enlace → vista previa del formato detectado y del tipo
  sugerido; título, descripción, tipo, licencia (obligatoria, con explicación de una línea por
  licencia), categorías, idioma, horario opcional, ámbito (persona o una entidad donde seas
  owner/admin/editor), «Anunciar también por la malla». Errores de `validarEstacion` junto al campo.
- Estética: la de los paneles de cristal del OS (tokens existentes, nada de colores sueltos),
  iconos de lucide, sin emojis como iconos, accesible (WCAG AA, dianas de 44 px).

## 10. Estudio de producción en directo con IA (`/estaciones/estudio`)

Mesa de producción en el navegador para emitir DESDE StarSeed, autoadaptable a cualquier salida.

- **Escenas y fuentes** (`src/lib/estaciones/estudio-escenas.ts`, puro): `Fuente` = `camara` ·
  `pantalla` · `microfono` · `imagen` (https) · `texto` (rótulo) · `enlace` (otra estación como
  ventana) · `estacion-interna` (ruta del OS). `Escena { id, nombre, capas: Capa[] }` con `Capa {
  fuente, x, y, ancho, alto (0..1), z, visible, volumen? }`. Plantillas: «Presentador», «Pantalla +
  cámara», «Entrevista (2)», «Solo audio», «Rótulo a pantalla completa». `SALIDAS`: `horizontal`
  (1920×1080), `vertical` (1080×1920), `cuadrada` (1080×1080), `solo-audio`, `malla-baja`
  (640×360, ≤ 300 kbps). `adaptarEscena(escena, salida)` recoloca las capas sin deformar (las de
  pantalla completa se quedan a pantalla completa; el resto mantiene su ancla y proporción).
- **Mezclador** (`src/lib/estaciones/mezclador.ts`): compone las capas visibles en un `<canvas>`
  (`requestAnimationFrame`, 30 fps o 15 en `malla-baja`) y mezcla los audios con `AudioContext`
  → `MediaStream` (`canvas.captureStream()` + pista de audio). Salidas: **grabar**
  (`MediaRecorder`, webm), **emitir a un servidor propio** por WHIP (`fetch` POST del SDP a la URL
  WHIP que pegue el usuario, `RTCPeerConnection`; la URL y el token se guardan solo en
  `localStorage` del navegador, nunca en la base de datos) y **emitir a la red StarSeed** como
  canal en vivo (WebRTC de `src/components/posts/live-channel.tsx` / `MotorLlamada`, hasta 8
  espectadores directos). Todo lo del navegador se inyecta para las pruebas.
- **Asistente IA** (`src/lib/estaciones/asistente-estudio.ts`): con `astrauraChat` de
  `src/ai/astraura/router.ts` (gratis y local primero, como todo el OS): `generarRotulos(tema)`,
  `generarGuion(tema, minutos)`, `describirEstacion(titulo, tipo)` (rellena descripción y
  categorías del formulario), `sugerirEscena(estado)` (qué escena conviene ahora según quién habla
  y qué fuente está activa; devuelve el id, el usuario confirma). Respuestas en JSON validado; si
  la IA falla o devuelve basura, mensaje honesto y nada cambia.
- **UI** (`src/components/estaciones/estudio-produccion.tsx`): vista previa grande, lista de
  escenas (clic = en el aire), capas de la escena con visibilidad/volumen, selector de salida,
  botones Grabar · Emitir (StarSeed / servidor propio) · Publicar como estación (crea la estación
  con `fuente: "estudio"` y enlace `/estaciones/<id>`), panel del asistente IA.

## 11. Registro en los medios del OS

- Dock: preset `{ id: 'estaciones', label: 'Estaciones', iconKey: 'Cast', path: '/estaciones',
  color: 'rose', enabled: true, origin: 'preset' }` (añadir `Cast` a `DockIconKey` y
  `DOCK_ICON_MAP`), `estaciones` en `DOCK_DEFAULT_ON_IDS`, `DOCK_DEFAULTS_VERSION` 22 → **23** con
  su nota, y su espejo en `FALLBACK_SEEDS`.
- Catálogo: `APP_CATALOG` id `estaciones` («Estaciones», short «Estaciones», categoría
  `starseed`, `status: "native"`, `open: { primary: "route", allowed: ["route","window","tab"],
  route: "/estaciones" }`) en `APP_COLLECTIONS.starseed` y `.media`. La app `radio` («Radio en
  vivo», hoy `soon`) pasa a abrir `/estaciones?tipo=audio` con `status: "native"`.
- Biblioteca: paquete `app-estaciones` en `CORE_ROUTE_PACKAGES` de `src/lib/library/packages.ts`
  (`payload: { route: "/estaciones" }`, icono ya existente en su mapa).
- Kits de entidad: herramienta «Estaciones» en `src/components/social/toolkits/` que lista las
  estaciones de la entidad (`listarEstaciones({ ambito })`) y abre `NuevaEstacion` con el ámbito
  puesto, para grupos, páginas y comunidades.

## 12. Tareas (Ola 1010E)

| id | qué | archivos | depende |
|---|---|---|---|
| ES1010D0 | (dirección) `hls.js` en `package.json` + lock, contrato, cola | — | — |
| ES1010A | tipos y validación (§3) | `src/lib/estaciones/tipos.ts`, `__tests__/tipos.test.ts` | — |
| ES1010B | formato autoadaptable (§4) | `formato.ts`, `__tests__/formato.test.ts` | A |
| ES1010C | en directo, orden, filtros (§5) | `directo.ts`, `__tests__/directo.test.ts` | A |
| ES1010Dm | migración + prueba de SQL (§6.1) | `supabase/migrations/20261010090000_os_estaciones.sql`, `src/lib/estaciones/__tests__/migracion-estaciones.test.ts` | A |
| ES1010E | capa de datos (§6.2) | `datos.ts`, `__tests__/datos.test.ts` | A, B, Dm |
| ES1010F | malla (§7) | `malla.ts`, `__tests__/malla.test.ts` | A |
| ES1010G | fuentes internas (§8) | `internas.ts`, `__tests__/internas.test.ts` | A |
| ES1010H | reproductor (§9) | `src/components/estaciones/reproductor-estacion.tsx`, `__tests__/reproductor-estacion.test.tsx` | B (y D0, hecho antes de lanzar) |
| ES1010I | tarjeta (§9) | `tarjeta-estacion.tsx`, `__tests__/tarjeta-estacion.test.tsx` | C |
| ES1010J | directorio (§9) | `directorio-estaciones.tsx`, `__tests__/directorio-estaciones.test.tsx` | E, F, G, I |
| ES1010K | publicar (§9) | `nueva-estacion.tsx`, `__tests__/nueva-estacion.test.tsx` | B, E |
| ES1010L | páginas y detalle (§9, §6.3) | `src/app/(app)/estaciones/page.tsx`, `src/app/(app)/estaciones/[id]/page.tsx`, `src/components/estaciones/detalle-estacion.tsx` | H, J, K |
| ES1010M | escenas del estudio (§10) | `estudio-escenas.ts`, `__tests__/estudio-escenas.test.ts` | A |
| ES1010N | mezclador (§10) | `mezclador.ts`, `__tests__/mezclador.test.ts` | M |
| ES1010O | asistente IA (§10) | `asistente-estudio.ts`, `__tests__/asistente-estudio.test.ts` | A |
| ES1010P | estudio UI + página (§10) | `src/components/estaciones/estudio-produccion.tsx`, `src/app/(app)/estaciones/estudio/page.tsx` | N, O, E |
| ES1010Q | dock (§11) | `src/components/layout/dock-config.ts`, `src/lib/dock/dock-defaults.ts`, `src/lib/dock/__tests__/dock-estaciones.test.ts` | L |
| ES1010R | catálogo y Biblioteca (§11) | `src/components/dashboard/apps/app-catalog.ts`, `src/lib/library/packages.ts` | L |
| ES1010S | kit de entidad (§11) | `src/components/social/toolkits/estaciones-entidad.tsx`, `src/components/social/toolkits/index.tsx`, `src/components/social/toolkits/__tests__/estaciones-entidad.test.tsx` | E, K |

## 13. Fuera de esta ola (anotado, no se hace)

Reproductor DASH y WHEP propios; retransmitir audio en vivo entre neuronas por la malla WebRTC
(`webrtc-mesh.ts` hoy lleva solo datos); SFU propia para más de 8 espectadores directos;
subtítulos automáticos en el estudio (el ASR residente es de la Mac); grabaciones guardadas en el
almacenamiento del usuario; aplicar la migración en Supabase (decisión de Alex).
