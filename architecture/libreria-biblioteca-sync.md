# 📚 Librería vs Biblioteca + Sincronización universal en tiempo real

> **SOP fuente de verdad** de la separación Librería/Biblioteca y del motor de
> sincronización por entidad y por cuenta. Actualizar ESTE doc antes de cambiar la lógica.
> Fecha: 2026-07-06 · Adenda 64.

## 1. Conceptos (definición del visionario)

| Concepto | Qué es | Ámbito |
|---|---|---|
| **Librería** | El catálogo EN LÍNEA: archivos, carpetas y categorías publicados (repos builtin + comunidad + privados). Es la "tienda"/repositorio universal navegable. | Global / red |
| **Biblioteca** | Lo GUARDADO por una entidad concreta: sus referencias organizadas en carpetas/categorías propias. | Por entidad |

- Ambas viven en la **misma sección** (`/library`) como dos áreas claramente separadas.
- **Toda entidad puede tener Biblioteca**: usuario, perfil, página, grupo, comunidad,
  evento, entidad federativa, partido… (personal o grupal/colaborativa).
- **Singularidad del contenido (Lienzo Universal)**: la Biblioteca guarda **referencias**
  a Entidades Únicas, nunca copias. Las actualizaciones del original se reflejan.

## 2. Modelo de datos

### Tabla `public.entity_state` (Supabase del OS **`nxstilnyidvkqeosofuh`**)

> ⚠️ **Corregido 2026-07-12.** Aquí ponía «Supabase `dzkjapinnewkxzjltadv`,
> migración `entity_state_sync`» — `dzkjapinnewkxzjltadv` es el proyecto de
> Nexus/Café, NO el del OS, y esa migración **nunca se aplicó en la base del OS**.
> La tabla se creó de verdad el 2026-07-12 con
> `supabase/migrations/20260712090000_missing_core_tables_library.sql`
> (RLS verificada + realtime).

- PK `(owner_kind, owner_id, key)`; `value jsonb`, `rev` (trigger +1), `updated_at`,
  `updated_by (auth.uid())`, `device_id` (neurona que escribió).
- `owner_kind`: `user|profile|page|group|community|event|ef|party|other`.
- `owner_id`: uuid del usuario (`user`) o **slug** de la entidad (resto; también acepta uuid).
- **RLS**: `user` → solo su uid. Entidades → miembros por `os_memberships.group_slug`
  o dueños por `os_groups/os_pages.owner_id`.
- **Realtime**: `entity_state` y `user_settings` están en la publicación `supabase_realtime`.

### Claves (`key`) convenidas
- `library` — Biblioteca de la entidad (ver §3).
- `board:<id>` — pizarras compartidas; `desktop:<id>` — escritorios de grupo;
  otras secciones futuras con prefijo corto y estable.

### Contrato cliente: `src/lib/sync/entity-state.ts`
`deviceId() · currentUserRef() · getEntityState(ref,key) · setEntityState(ref,key,value)
· subscribeEntityState(ref,key|null,cb)` — local-first, nunca lanza, LWW por `rev`.

## 3. Biblioteca por entidad (capa `src/lib/library/entity-library.ts`)
- Item guardado = referencia: `{ id, type: package|post|file|page|route|external, refId?,
  route?, url?, title, note?, tags[], folderId?, addedAt, addedBy }`.
- Carpetas y categorías propias por biblioteca (estructura espejo de la Librería).
- Cache local `starseed.entitylib.<kind>.<id>.v1` + nube `entity_state(key='library')`
  + suscripción realtime → cambios de otros miembros/dispositivos aparecen al momento.
- Acción global **“Guardar en biblioteca…”** (selector de entidad destino + carpeta)
  disponible en fichas de la Librería, publicaciones y archivos.

## 4. Sincronización universal en tiempo real (cuenta y grupo)
- **Ámbito cuenta** (`user_settings.prefs`, claves `SYNCED_KEYS` de `settings-sync.ts`):
  motor `src/lib/sync/realtime-sync.ts` — observa escrituras locales de claves
  sincronizadas (escritorios, memorias/cerebros, chats de Aurora, configuraciones,
  pizarras, navegador…), hace push con debounce, y se suscribe a realtime de
  `user_settings` + canal broadcast `acct:<uid>` para aplicar cambios remotos al
  instante en los demás dispositivos (eventos para que la UI se re-renderice en vivo).
- **Ámbito entidad/grupo**: `subscribeEntityState` por sección compartida.
- **Anti-eco**: `device_id` propio se ignora; al aplicar remoto se suspende el push.
- **Conflictos**: LWW por `rev`/`updated_at` (suficiente para prefs/refs; secciones
  colaborativas finas podrán evolucionar a CRDT sin cambiar la tabla).
- **Dispositivos/neuronas**: registro y latido en `public.neuron_devices`
  (id=deviceId, owner, name, kind, last_seen_at) → visibles en Ajustes.
- **Privacidad**: claves API y secretos NUNCA viajan (igual que settings-sync).
  Local-first: sin sesión todo sigue funcionando offline.

## 5. UI
- `/library`: conmutador superior **Librería | Biblioteca** (dos áreas, misma sección).
  Biblioteca: selector de entidad (Mi biblioteca + páginas/grupos/comunidades/EF donde
  soy miembro o dueño), carpetas/categorías, guardados con abrir/mover/quitar, búsqueda.
- Páginas de entidad (grupo/página/comunidad/evento/partido/EF/perfil): pestaña/herramienta
  **Biblioteca** (toolkit) montando el panel compartido de biblioteca de esa entidad.
- Ajustes → Cuenta y Sincronización: interruptor "Sincronización en tiempo real"
  (ON por defecto con sesión), estado del motor y lista de dispositivos (neuronas).
- Centro de Control: módulo de sync muestra estado realtime (conectado/último cambio).

## 6. Gestor de archivos tipo Finder en Bibliotecas (2026-07-07)
- Ítems con **etiquetas, categorías y carpetas anidadas** (parentId), todo editable y movible (drag).
- Vistas: iconos / lista / columnas, con **vista previa por formato** (imagen, audio, video, texto, código, PDF, enlace).
- **Accesos directos** (alias → apuntan a otro ítem) y **ramificaciones**: `replicar` crea una RAMA
  vinculada al original (Entidad Única: refleja actualizaciones); `duplicar` crea copia independiente.
- **Menú contextual** (clic derecho / long-press): abrir, vista previa, replicar, duplicar, copiar,
  acceso directo, mover, etiquetas, compartir, **publicar** (abre el Lienzo de Creación con el
  archivo precargado: `/publish?attach=…`), **permisos**, quitar.
- **Permisos por ítem** (`acl: {read:[], write:[]}` con usuarios de os_profiles o grupos) aplicados
  en UI + RLS de entity_state para ámbito grupal.
- Doc de biblioteca versionado (v2) con migración normalizadora desde v1.

## 7. Catálogo público de la Librería — publicar archivos/carpetas
- Tabla `library_public_items` (RLS: lectura pública, escritura del autor): categoría + carpeta +
  payload (url/route/mime/preview/ref). Realtime habilitado.
- Cualquier usuario puede **publicar un archivo en cualquier carpeta pública** de la Librería,
  o **publicar una carpeta personal completa** de su Biblioteca (los ítems se vuelcan conservando
  estructura y el original queda vinculado).

## 8. Mensajería + Servidores de apps (2026-07-07)
- **Mensajes** (`os_dm_threads/os_dm_members/os_dm_messages`, RLS por membresía con
  `is_dm_member` security definer, realtime): DMs y grupos, adjuntos de cualquier formato,
  responder/editar/borrar, guardar en Biblioteca, búsqueda de usuarios del directorio
  **`os_profiles`** (perfil sembrado al iniciar sesión, `searchable` opt-out), estilo WhatsApp/Telegram.
- **Aurora opcional por hilo** (`threads.agent` jsonb): agente personalizado que responde en el
  chat como `kind='agent'` usando Astraura (gratis-primero).
- **Servidores de apps** (`os_app_servers` + `os_app_server_members`): apps/juegos/entornos
  compartidos; visibilidad public/private/group; unirse directo (público) o **solicitud pending →
  aprobación del dueño**; estado compartido EN TIEMPO REAL vía `entity_state`
  (`owner_kind='other'`, `owner_id='srv:<uuid>'`, política `es_srv_member`) + canal broadcast
  `srv:<id>` — hook `useServerChannel` para que cualquier app sincronice entre miembros.
- Tarjeta de servidor compartible en mensajes/publicaciones/bibliotecas (refKind `server`).

## 9. Archivos en la nube + Subida universal (2026-07-07, migración `os_files_profiles_spaces`)
- **Storage**: bucket `os-files` (público-lectura; escritura solo en tu prefijo `<uid>/…`).
- **Tabla `os_files`**: owner, profile_id, name/mime/size/path/url, device_id (neurona que subió),
  is_public, acl_read/acl_write (uuid[]), group_slug, meta. RLS + realtime.
- **Uploader universal** (componente compartido) con TRES fuentes: (1) este dispositivo,
  (2) Bibliotecas (elegir de cualquier biblioteca accesible), (3) **Neuronas** (archivos subidos
  desde otros dispositivos de la cuenta + "solicitar archivo" por broadcast `acct:<uid>` — la
  neparona destino muestra el picker y sube).
- Integrado en TODOS los contextos: mensajes, comentarios, publicaciones, bibliotecas,
  fotos de perfil/portada, memorias, chat de Aurora. Adjuntos >~800KB van a storage (URL),
  pequeños pueden seguir inline; refs {fileId,url} sincronizadas en tiempo real entre neuronas.

## 10. Perfiles múltiples por cuenta + configuración de sync
- **`os_account_profiles`**: varios perfiles por cuenta (personal/cívico/artístico/profesional/custom),
  handle único, avatar/cover, is_default. Visibles para todos (facetas públicas), escritura del dueño.
- **Política `es_profile_own`** en entity_state: ámbito `profile` accesible por la cuenta dueña.
- **Sync por defecto entre TODOS los perfiles de la cuenta**; configurable a perfiles seleccionados
  (`user_settings.prefs['starseed.sync.profiles.v1'] = {mode:'all'|'selected', profiles:[], perDevice:{kind→overrides}}`)
  con ajustes inteligentes por tipo de dispositivo (web/pwa/móvil/escritorio).
- **Escritorios anclados a perfil**: el doc local se refleja en entity_state(profile:<id>,'desktops');
  crear escritorio/dashboard/pizarra REQUIERE un perfil ancla (se siembra uno por defecto).

## 11. Espacios compartidos (`os_spaces` + `os_space_editors`)
- kind `desktop|dashboard|board`; access `private|profiles|invite|public`; allowed_profiles
  (perfiles propios o de OTRAS cuentas), group_slug (miembros del grupo editan), doc jsonb,
  rev/updated_at (trigger), realtime ON.
- `space_can_edit/read` (security definer): dueño, público, grupo, editor invitado o perfil permitido.
- Pizarras/escritorios/dashboards compartidos entre perfiles, cuentas o público, compartibles
  en grupos de cualquier tipo; edición colaborativa con LWW por rev (base para CRDT futuro).

## 12. Cerebros de contexto por biblioteca de perfil
- Cada biblioteca de perfil elige qué CEREBROS de memorias dan contexto a sus archivos
  (entity_state(profile:<id>,'library-brains') = {mode:'all'|'selected', brains:[]}).
  **Por defecto: todos los cerebros disponibles, para todos los perfiles de la cuenta.**
  Aurora usa esa selección como contexto al actuar sobre la biblioteca.

## 13. Versiones e historial por ítem (2026-07-07)
- `SavedItem.versions?: ItemVersionEntry[]` (modelo v2.1, aditivo y tolerante — su ausencia
  equivale a "sin historial todavía"). Cada entrada es un snapshot de `{title, note, content,
  url, mime, language, description}` más `at/by/label`.
- Hasta ahora no existía ninguna vía de UI para editar título/nota/contenido de un ítem YA
  guardado (solo `saveItem` re-guardaba nota/carpeta al detectar el mismo `refId/route/url`).
  Se añade `updateItemContent(ref,itemId,patch,opts?)`: ANTES de aplicar `patch`, si algún campo
  versionable cambia, empuja el estado previo a `versions` (FIFO acotado a 25 entradas — evita
  crecer sin límite el doc de biblioteca). UI: `EditItemDialog` (menú contextual → "Editar…").
- `restoreItemVersion(ref,itemId,versionId)`: snapshotea el estado ACTUAL antes de restaurar
  (para poder deshacer la propia restauración) y luego aplica los campos de la versión elegida.
- `VersionsDialog` (menú contextual → "Versiones…"): lista fecha/autor, "Restaurar" y "Comparar
  con actual" — diff de líneas simple (`simpleLineDiff` en `finder-types.ts`, LCS ingenuo pensado
  para notas/código cortos, no un motor de diff completo).

## 14. Ramas: vista de linaje + fusión (2026-07-07)
- Nuevo campo `SavedItem.branchOf?: string` (v2.1): id ESTABLE, dentro de ESTA MISMA biblioteca,
  del ítem inmediato del que se ramificó `replicateItem()`. Resuelve la ambigüedad de `refId2`
  (que apunta al id del recurso en su sistema de origen, no al ítem local) permitiendo construir
  un árbol de linaje fiable. Ramas creadas ANTES de esta clave (sin `branchOf`) se resuelven con
  un fallback de mejor esfuerzo comparando `refId2` — documentado como best-effort, no garantizado.
- `branchesOf(doc,itemId)` / `originOfBranch(doc,item)` (finder-types.ts): derivan hijos/padre.
- `mergeBranch(ref,branchItemId,{removeBranchAfter?})`: escribe los campos actuales de la rama
  (título/nota/contenido/url/tags…) sobre el ítem ORIGEN, snapshoteando antes el estado previo del
  origen en SU historial de versiones (§13) — la fusión es reversible vía "Restaurar". Con
  confirmación en UI (`BranchesDialog`); eliminar la rama tras fusionar es opcional y por defecto
  DESMARCADO (no destructivo).

## 15. Comentarios en archivos y carpetas (2026-07-07)
- Hilo ligero por ítem/carpeta en `entity_state(ref, key='lib-comments:<targetId>')` — NO en el
  doc principal de biblioteca, para no acoplar su LWW/tamaño a hilos que crecen sin límite. Capa
  nueva `src/lib/library/item-comments.ts`. `targetId` = `item.id` o `folder.id` (ambos ya llevan
  prefijo único de `makeId()`: `item-`/`folder-`/`alias-`/`branch-`, sin colisión entre espacios).
- Realtime vía `subscribeEntityState` (mismo mecanismo que el resto de este SOP, §4).
  `useLibComments(ref,targetId)`: alta/edición/borrado optimistas + reconciliación LWW simple.
- UI: `CommentsDialog`, acción "Comentarios…" en el menú contextual (ítems y carpetas).

## 16. Repositorios creables (estilo GitHub) dentro de la Biblioteca (2026-07-07)
- **Decisión de diseño:** un "repositorio" es una `LibraryFolder` (§3, ya soporta anidación) con
  metadatos añadidos `folder.repo?: RepoMeta` — reutiliza ÍNTEGRAMENTE `entity-library.ts` como
  backend de su contenido (archivos/carpetas = ítems/carpetas normales dentro de esa carpeta) en
  vez de inventar un almacén paralelo. `RepoMeta = { description?, visibility:'privado'|'publico',
  license?, topics[], readme (markdown editable), releases: RepoRelease[], forkedFrom?, createdAt }`.
- **Visibilidad pública** = publicable al catálogo comunitario (`library_public_items`, categoría
  `"repo"` — ya prevista en `public-catalog.ts` desde la Adenda 64) mediante la función YA
  EXISTENTE `publishFolder()`, sin duplicar lógica de publicación. "Publicar versión" (release con
  nota) añade una entrada a `repo.releases[]` y, si el repo es público, vuelca de nuevo la carpeta
  (nueva instantánea). Honesto: cada "release" pública es una fila nueva en `library_public_items`
  (no un diff real de git) — así se explica en la UI.
- Acciones estilo GitHub (`src/lib/library/user-repos.ts`, ficha `RepoDetailSheet`):
  - **Replicar** (fork): copia recursiva de carpeta+ítems a la biblioteca del usuario actual, con
    `repo.forkedFrom` apuntando al origen (propio o ajeno, si es visible por ACL).
  - **Instalar**: solo si el repo contiene ítems `type:"package"` válidos → los instala vía
    `packages.ts:install()` (reutilizado, cero lógica nueva). Si no hay ninguno, la acción se
    OCULTA — honesto, nunca finge instalar algo que no es un paquete.
  - **Descargar**: .zip client-side (`src/lib/files/simple-zip.ts`, formato ZIP sin compresión
    "STORE", sin dependencias nuevas) con el README.md + contenido de los ítems (texto inline o
    mejor esfuerzo de `fetch` de su `url`; lo que no se puede traer por CORS queda como referencia
    de enlace dentro del zip — nunca se pierde silenciosamente).
  - **Guardar / Compartir**: mismos mecanismos que el resto de la Biblioteca (`SaveToLibrary`,
    enlace profundo `deepLinkForFolder`).
- Creación: `CreateRepoDialog` (nombre/descripción/visibilidad/categoría/licencia/topics/README) →
  `createRepo()`. Cualquier carpeta existente se puede "Convertir en repositorio…" (añade `repo`
  meta sin mover nada).

## 17. Repos externos conectados — GitHub, lectura pública (2026-07-07)
- Nuevo `SavedItemType: "repo"` (a nivel de ÍTEM, distinto del folder-repo de §16): referencia a
  un repositorio git externo con una instantánea de metadatos cacheada
  (`SavedItem.connectedRepo?: ConnectedRepoMeta`) para poder listarlo/verlo offline.
- Proxy de servidor GET-only `src/app/api/github-repo/[owner]/[repo]/route.ts` (mismo patrón que
  `api/huggingbay`): combina en una sola llamada `GET /repos/{owner}/{repo}`, `/readme`
  (decodificado de base64 en el servidor) y `/releases` de `api.github.com`. Sin token (lectura
  pública) → límite honesto de 60 peticiones/hora por IP, avisado en la UI si se agota. Sin
  superficie SSRF: host de destino fijo, `owner`/`repo` validados con regex estricta antes de
  construir la URL.
- `src/lib/library/connected-repos.ts`: `parseRepoUrl()`, `connectRepo()` (guarda el ítem),
  `resyncConnectedRepo()` ("sincronizar metadatos"), `githubZipUrl()` (enlace directo al zip que
  sirve GitHub — no pasa por nuestro proxy, es descarga/navegación directa del navegador),
  `tryInstallManifest()` (intenta `starseed.repo.json` en la rama por defecto vía `addRepoByUrl()`
  YA EXISTENTE de `packages.ts`; si no existe, honesto: "este repo no publica un catálogo de
  paquetes StarSeed").
- UI: `ConnectRepoDialog` (pegar URL) + `ConnectedRepoSheet` (ficha: README renderizado con
  `react-markdown` —dependencia ya presente en el repo—, releases, acciones Sincronizar
  /Instalar/Descargar/Guardar/Compartir/Abrir en GitHub). Mismo mecanismo sirve para "conectar" los
  propios repos StarSeed builtin (URL de GitHub del proyecto).

## 18. Menú contextual: más acciones por formato + destino de instalación + relacionados (2026-07-07)
- `finder-view.tsx` calcula `extraActionsFor(item)` según `itemFormat()`/`item.type` y se las pasa
  a `FinderContextMenu` como lista genérica `{label,icon,onClick}` — el menú NO hardcodea cada
  formato, solo renderiza lo que le llega (extensible sin tocar el menú de nuevo):
  - imagen → "Fondo de escritorio" (`setWallpaper` del escritorio activo, `desktop-store.ts`) y
    "Foto de perfil" (`updateProfile(activeProfileId(),{avatarUrl})`, `profiles.ts`) — ambas
    funciones ya existentes, sin lógica nueva de escritorio/perfil.
  - markdown/código → "Copiar contenido" directo (sin abrir vista previa) y, solo markdown,
    "Convertir en memoria de cerebro" (abre `InstallToDialog` en la pestaña Cerebro).
  - audio/vídeo → "Reproducir en ventana" (`openWindow()` del escritorio activo con el contenido).
  - zip → "Ver contenido" (lee el central directory del .zip vía `listZipEntries()` — solo
    nombres/tamaños, sin descomprimir; honesto si el `fetch` falla por CORS).
  - pdf → sin cambios (herramientas Stirling ya enlazadas en otra superficie del OS).
- **"Instalar/guardar en…"** (`InstallToDialog`): un único diálogo con 4 destinos reales (nunca
  inventados): Biblioteca/carpeta (`saveItem`), Escritorio como acceso directo (`addIcon` de
  `desktop-store.ts`), Cerebro como memoria (empuja una referencia estable a
  `Brain.includes.memories` vía `saveBrain()` — campo YA existente en `brains.ts`), Servidor/host
  configurado (reenvía título/nota/url/contenido a un `BrainServer.endpoint` propio vía el proxy
  genérico YA EXISTENTE `api/integrations/proxy` — marcado explícitamente como "mejor esfuerzo":
  funciona si ese host expone `/starseed/import`, y se muestra la respuesta real, nunca un éxito
  fingido).
- **"Archivos relacionados"**: `relatedItemsOf(doc,item)` en `finder-types.ts` (mismas etiquetas o
  misma carpeta, scoring simple) — sección en `ItemPreviewPane` bajo las etiquetas.
