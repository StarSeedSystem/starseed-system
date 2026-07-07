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

### Tabla `public.entity_state` (Supabase `dzkjapinnewkxzjltadv`, migración `entity_state_sync`)
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
