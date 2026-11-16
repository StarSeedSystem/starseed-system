# Sesiones en vivo, fase 1 · qué tablas, funciones y migraciones hacen falta (SVQ1 · SES1116B)

Contrato de **comprobación**, no código. Sirve para que la dirección pueda comprobar y aplicar a mano en la base
viva lo que la fase 1 necesita (tareas P1-A..P1-D de `architecture/sesiones-en-vivo-entidades-y-transmisiones.md:412-417`).

Todo lo de aquí está **leído del repo** (migraciones, código y contratos). No se ha ejecutado nada ni se ha
consultado la base viva. En cada tabla, «Verificado» es lo que se lee en los archivos; «No comprobable» es lo que
sólo se sabrá con una consulta. Cuando un nombre no aparece en el repo, se dice «no encontrado» y no se inventa.

**Base viva**: el enunciado de la tarea da `pqzdpmedcsgcedkvndzl`; `src/lib/spaces/spaces.ts:8-11` habla todavía del
proyecto viejo (`nxstilnyidvkqeosofuh`) y lo da por aplicado. Cuál de los dos tiene el esquema **no está verificado**.

## 1 · Qué necesita la fase 1

| Objeto | Tipo | Para qué lo usa el código | Lo crea (archivo de migración) | Verificado leyendo | No comprobable sin la base viva |
|---|---|---|---|---|---|
| `public.os_sesiones_vivas` | tabla | pase de entrada a una app en vivo o llamada: crear, leer, invitar, terminar (`src/lib/mensajeria/sesiones-vivas.ts:49,270,309,346,411`) | `supabase/migrations/20260928120000_contactos_presencia_mensajeria.sql:103` | columnas `tipo, modo, permiso, invitados, token_publico, estado, caduca`; FK a `os_dm_threads` | que la tabla exista con esas columnas |
| `os_sesiones_vivas_select/insert/update/delete` | políticas | RLS de la tabla anterior (creador · invitados · miembros del chat) | mismo archivo `:123-143` | insert exige `creador = auth.uid()` y `hilo_id IS NULL OR is_dm_member` | que las cuatro políticas estén creadas |
| `public.unirse_sesion_publica(uuid,text)` | función | RPC del enlace público `/vivo/<id>?t=…` (`sesiones-vivas.ts:50,302`) | mismo archivo `:147` | `SECURITY DEFINER`; no devuelve `token_publico`; `GRANT` a `anon` y `authenticated` (`:164-165`) | que exista con esa firma exacta |
| `public.is_dm_member(uuid,uuid)` | función | «¿soy del chat?» en la RLS de la sesión | `supabase/migrations/20260712090200_missing_core_tables_messages.sql:74` | `SECURITY DEFINER`, estable | que exista |
| `public.os_dm_threads`, `public.os_dm_members` | tablas | FK de `hilo_id` y censo de los chats | mismo archivo `:32,44` | — | que existan |
| `public.puede_entrar_sesion`, `topic_sesion_permitido`, `topic_publico_valido` | funciones | canales Realtime **privados** `vivo:<id>` y `vivo:<id>:<token>` (`src/lib/llamadas/resolver-tema.ts:8-11`) | `supabase/migrations/20260928130000_l1-llamadas.sql:29,54,86` | el prefijo debe concordar con `tipo` (`llamada:` vs app) | que existan y que `realtime.messages` esté activo |
| `l1_sesiones_recibir/enviar_autenticado`, `..._anon` | políticas (en `realtime.messages`) | Realtime Authorization: quién recibe y quién envía en un canal de sesión | mismo archivo `:137,150,164,173` | son permisivas: sólo **añaden** acceso | que Realtime Authorization esté activado en el proyecto |
| `public.os_spaces` | tabla | la superficie compartida (pizarra, dashboard, escritorio) (`src/lib/spaces/spaces.ts:127,152,177`) | `supabase/migrations/20260712090100_missing_core_tables_spaces.sql:34` | `kind desktop|dashboard|board`, `access`, `doc`, `rev` con trigger | que exista con el `CHECK` de `kind` |
| `public.os_space_editors` | tabla | invitados y editores por cuenta (`spaces.ts:251,288`) | mismo archivo `:64` | PK `(space_id, account)`, `role editor|viewer`, `status member|invited|pending` | que exista |
| `space_can_edit`, `space_can_read`, `space_editor_status`, `space_editor_role`, `space_is_owner`, `os_owns_profile`, `os_is_group_member` | funciones | RLS de espacios (`sp_*`, `spe_*`) | mismo archivo `:115,127,141,150,160,182,208` | `os_is_group_member` mira **sólo** que haya fila en `os_memberships`, **no** el rol (hueco de §3.3) | que existan |
| `sp_select/insert/update/delete`, `spe_select/owner/self_request/self_update/self_delete` | políticas | RLS de espacios y de sus editores | mismo archivo `:279-350` | `public` = **sólo lectura** (comentario explícito en `:174-181`) | que estén creadas |
| `public.os_estaciones` | tabla | la estación de espectadores (P1-C) (`src/lib/estaciones/datos.ts:57,80,109,200`) | `supabase/migrations/20261010090000_os_estaciones.sql:42` | `tipo` admite `pizarra` y `dashboard`; `visibilidad publica|grupo` | que exista y que sus `CHECK` coincidan |
| `public.os_estaciones_denuncias` | tabla | denunciar una estación (`datos.ts:283`) | mismo archivo `:184` | PK `(estacion_id, autor_id)` | que exista |
| `os_estacion_es_miembro`, `os_estacion_puede_escribir` | funciones | RLS de estaciones: leer lo de «grupo» y escribir en nombre de una entidad | mismo archivo `:100,125` | **no** se llaman desde `datos.ts`: las invoca la política | que existan |
| `public.os_memberships` | tabla | censo de grupo: pertenencia y rol (`owner/admin/editor/miembro`) | **no encontrado**: ninguna migración de `supabase/migrations/` la crea; se usa como tabla preexistente (`20260712090100…:121`, `20261010090000…:108`, `20260801130000…:18`) | que el repo la da por existente | que exista en la base viva y qué roles tiene |
| `public.os_entity_roles` | tabla | roles por cuenta sobre una entidad (grupo, página) | `supabase/migrations/20260710000000_os_entity_roles.sql:34` (red de seguridad: `20260806120000_profile_sharing.sql:454`) | `role` es texto libre, sin `CHECK` | que exista |
| `public.access_role_rank(text)` | función | el rango de un rol: la base de «editar exige rango ≥ 2» (§3.3) | `supabase/migrations/20260806120000_profile_sharing.sql:135` | `total/owner`=4, `gestor/admin`=3, `colaborador/editor`=2, `observador/viewer`=1, otro=0 | que exista |
| `public.entity_state` | tabla | la clave `espacio` de la entidad (P1-B) | `supabase/migrations/20260712090000_missing_core_tables_library.sql:140` | único `(owner_kind, owner_id, key)`; `rev` por trigger | que exista |
| `public.es_can_read(text,text)`, `es_can_write(text,text)` | funciones | RLS de `entity_state` | mismo archivo `:120,96` | `owner_kind='other'` no `srv:` es legible por cualquiera | que existan |
| `public.os_group_rank(text)` | función | el rango que P1-A quiere usar en `sp_update` | **no encontrado**: el archivo `supabase/migrations/20261116100000_spaces_rol_grupo.sql` **no existe** en el repo | la fase 1 lo nombra, no lo tiene | si la base viva ya lo tuviera (no se puede saber) |

## 2 · Orden de aplicación

Orden por marca de tiempo (los nombres llevan la fecha) y por dependencia declarada en la cabecera de cada
archivo. Casi todas son **idempotentes** (`if not exists` / `drop policy if exists`); la de la PK de `os_memberships`
**no** lo es (`:18` va sin `if exists`): aplicarla dos veces falla.

| # | Migración | Depende de | Por qué / qué exige |
|---|---|---|---|
| 1 | `20260710000000_os_entity_roles.sql` | — | crea `os_pages`, `os_groups`, `os_entity_roles` |
| 2 | `20260712090000_missing_core_tables_library.sql` | `os_memberships`, `os_groups`, `os_pages`, `os_account_profiles` | crea `entity_state` y `es_can_read/es_can_write`, que los referencian |
| 3 | `20260712090200_missing_core_tables_messages.sql` | `os_profiles` | crea `os_dm_threads`, `os_dm_members` y `is_dm_member` |
| 4 | `20260712090100_missing_core_tables_spaces.sql` | `os_memberships`, `os_account_profiles` | crea `os_spaces`, `os_space_editors` y las funciones `space_can_*` |
| 5 | `20260801130000_os_memberships_pk_role_guard.sql` | la tabla `os_memberships` debe existir | cambia su PK; **no** crea la tabla |
| 6 | `20260806120000_profile_sharing.sql` | `os_entity_roles` (1), `os_account_profiles`, `os_pages/os_groups/os_events` | crea `access_role_rank` y **recrea** toda la RLS de `os_entity_roles` |
| 7 | `20260928120000_contactos_presencia_mensajeria.sql` | (3) `is_dm_member` y `os_dm_threads` | crea `os_sesiones_vivas` y `unirse_sesion_publica` |
| 8 | `20260928130000_l1-llamadas.sql` | (7) `os_sesiones_vivas` y (3) `is_dm_member` — lo dice su cabecera `:21-22` | canales privados; necesita Realtime Authorization activa |
| 9 | `20260929090100_realtime_publicacion_minima.sql` | cualquier migración anterior que publicara tablas | **recorta** la publicación: deja fuera todo lo que no esté en su lista (ver §5) |
| 10 | `20261010090000_os_estaciones.sql` | `os_memberships`, `os_entity_roles` | crea `os_estaciones` y `os_estaciones_denuncias`; **vuelve a** publicarlas en realtime |
| — | `20261116100000_spaces_rol_grupo.sql` | (4) `os_spaces`, (6) `access_role_rank` | **no existe** en el repo: es la migración de P1-A, todavía por escribir |

## 3 · Comprobaciones de SOLO LECTURA en la base viva

Todas son `select`: no escriben nada. `public` = el esquema por defecto. Cada consulta responde a una fila de §1.

| Objeto de §1 | Consulta | Lectura del resultado |
|---|---|---|
| `os_sesiones_vivas`, `os_dm_threads`, `os_dm_members`, `os_spaces`, `os_space_editors`, `os_estaciones`, `os_estaciones_denuncias`, `entity_state`, `os_entity_roles`, `os_memberships` | `select to_regclass('public.os_sesiones_vivas') as t;` (una por tabla) | `null` = la tabla no existe |
| columnas de `os_sesiones_vivas` | `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='os_sesiones_vivas' order by ordinal_position;` | si faltan `token_publico`, `invitados` o `modo`, el cliente escribe campos inexistentes |
| `unirse_sesion_publica` | `select proname, pg_get_function_identity_arguments(oid) as args from pg_proc where proname='unirse_sesion_publica' and pronamespace='public'::regnamespace;` | vacía = la RPC no existe; la firma debe ser `(uuid, text)` |
| `is_dm_member` | `select proname, pg_get_function_identity_arguments(oid) as args from pg_proc where proname='is_dm_member' and pronamespace='public'::regnamespace;` | vacía = sin ella, la RLS de la sesión no deja crear sesiones de un chat |
| `puede_entrar_sesion`, `topic_sesion_permitido`, `topic_publico_valido` | `select proname from pg_proc where proname in ('puede_entrar_sesion','topic_sesion_permitido','topic_publico_valido') and pronamespace='public'::regnamespace;` | faltan las tres = ningún canal privado de sesión (el contador de presentes queda en «no se sabe») |
| `space_can_edit`, `space_can_read`, `space_editor_status`, `space_editor_role`, `space_is_owner`, `os_owns_profile`, `os_is_group_member` | `select proname from pg_proc where proname in ('space_can_edit','space_can_read','space_editor_status','space_editor_role','space_is_owner','os_owns_profile','os_is_group_member') and pronamespace='public'::regnamespace;` | una fila por función existente |
| `access_role_rank` | `select public.access_role_rank('editor') as editor, public.access_role_rank('observador') as observador;` | error si no existe; debe devolver 2 y 1 |
| `os_estacion_es_miembro`, `os_estacion_puede_escribir` | `select proname from pg_proc where proname in ('os_estacion_es_miembro','os_estacion_puede_escribir') and pronamespace='public'::regnamespace;` | vacía = no se puede publicar ni editar una estación en nombre de una entidad |
| `es_can_read`, `es_can_write` | `select proname from pg_proc where proname in ('es_can_read','es_can_write') and pronamespace='public'::regnamespace;` | vacía = `entity_state` no tiene RLS utilizable |
| políticas de `os_sesiones_vivas` | `select policyname, cmd, roles from pg_policies where schemaname='public' and tablename='os_sesiones_vivas' order by policyname;` | faltan `select/insert/update/delete` = la tabla no es utilizable |
| políticas de `os_spaces` y `os_space_editors` | `select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('os_spaces','os_space_editors') order by tablename, policyname;` | `sp_update` con `os_is_group_member` = el hueco de §3.3 sigue abierto |
| políticas de `os_estaciones` y `os_estaciones_denuncias` | `select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename in ('os_estaciones','os_estaciones_denuncias') order by tablename, policyname;` | `select` debe ser `to anon, authenticated` para que se lean las públicas |
| políticas de `os_entity_roles` | `select policyname, cmd from pg_policies where schemaname='public' and tablename='os_entity_roles' order by policyname;` | si sigue la de 20260710000000 (`os_entity_roles_modify`), el agujero de auto-concesión sigue abierto |
| Realtime Authorization y sus políticas | `select to_regclass('realtime.messages') is not null as hay_mensajes;` y `select policyname, cmd, roles from pg_policies where schemaname='realtime' and tablename='messages' and policyname like 'l1_%';` | `hay_mensajes = false` = Realtime Authorization no está activada: los canales privados no abren |
| publicación realtime | `select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('os_sesiones_vivas','os_spaces','os_space_editors','entity_state','os_estaciones','os_estaciones_denuncias') order by tablename;` | `os_spaces`, `os_space_editors` y `entity_state` **deben** estar; `os_sesiones_vivas` **no** debe (el código lo dice: `sesiones-vivas.ts:503-505`); `os_estaciones` **debe** estar (`src/components/estaciones/directorio-estaciones.tsx:86`) |
| roles reales de `os_memberships` | `select distinct lower(role) from public.os_memberships order by 1;` | sólo el vocabulario; si aparece `pending` u otros, el rango ≥ 2 hay que calcularlo con `access_role_rank` |
| `os_group_rank` (P1-A) | `select proname from pg_proc where proname='os_group_rank' and pronamespace='public'::regnamespace;` | vacía = sigue sin existir; la fase 1 la tiene que escribir |

## 4 · Migraciones que parecen NO aplicadas (según los propios archivos y `architecture/`)

| Migración | Lo que dice el archivo | Dónde |
|---|---|---|
| `20261010090000_os_estaciones.sql` | la cabecera dice «**NO SE APLICA** a ninguna base de datos en esta ola» | `supabase/migrations/20261010090000_os_estaciones.sql:16` |
| el mismo archivo | pero el final dice «**APLICADA Y PROBADA** (2026-10-10, integrador…)» y cita `supabase/pruebas/rls-1010c.sql` | mismo archivo `:262-271` |
| `architecture/estaciones.md` | «**No se aplica a ninguna base de datos en esta ola** (lo decide Alex)» | `architecture/estaciones.md:190` |
| `20260928130000_l1-llamadas.sql` | «Mientras esta migración NO esté aplicada, el cliente no puede entrar en los canales privados» | `supabase/migrations/20260928130000_l1-llamadas.sql:15-16` |
| `architecture/sesiones-en-vivo-entidades-y-transmisiones.md` | «Sí una base Supabase con `os_sesiones_vivas` aplicada (**la migración puede faltar** en la viva)» | `architecture/sesiones-en-vivo-entidades-y-transmisiones.md:419-420` |
| `20261116100000_spaces_rol_grupo.sql` | **el archivo no existe**: es la migración de P1-A, «la primera cosa de la fase 1» | `architecture/sesiones-en-vivo-entidades-y-transmisiones.md:203-205,414` |
| `20260711120000_realtime_publication.sql` | «⚠️ **NO aplicada automáticamente**: revisar y aplicar vía dashboard/CLI» | `supabase/migrations/20260711120000_realtime_publication.sql:11` |
| `20261114180000_senales_posicion_privada.sql` | «**sin aplicar**: la aplica la dirección» (añade políticas en `realtime.messages`, la misma tabla que L1) | `architecture/mapa-de-senales.md:191` |
| fuera de la fase 1 | marcados «NO APLICADA» / «SIN aplicar» y **no** hacen falta para sesiones en vivo: `20260926190000_os_mesh_vinculos.sql:61`, `20261010130000_genesis_operaciones.sql:18`, `20261010140000_os_versiones.sql:2`, `20261011120000_puerta_datos.sql:3`, `20261011150000_astraura_bots.sql:3` | los archivos citados |

**Lo que NO se puede saber leyendo**: si esas migraciones están o no en la base viva. El repo no guarda el
historial de la base (no hay tabla de migraciones aplicadas en el repo); sólo queda la comprobación de §3.

## 5 · Riesgos de aplicar cada una

| Migración | Qué endurece o cambia | Qué dejaría de poder hacer un usuario hoy | ¿Trae reversa? |
|---|---|---|---|
| `20260712090100_missing_core_tables_spaces.sql` | hoy `sp_update` y `space_can_edit` conceden edición a **cualquier** miembro del grupo (`os_is_group_member`, `:194,304`): el hueco de §3.3 | con P1-A (rango ≥ 2), los miembros con rol `miembro` o `moderator` dejan de editar la pizarra del grupo; siguen editando los que sean `editor`/`admin`/`owner` | no hay `_rollback.sql`; P1-A tiene que traer la suya |
| `20261010090000_os_estaciones.sql` | la escritura pasa a ser del dueño **o** de `owner/admin/editor` de la entidad (`os_estacion_puede_escribir`, `:125-146`); `insert` exige `entidad_ref` si el ámbito es entidad | una cuenta con rol `miembro` que hoy edita una estación de su grupo deja de poder editarla; publicar «en nombre de» un grupo sin `entidad_ref` se rechaza | no hay `_rollback.sql`; es idempotente y se puede volver a aplicar |
| `20260806120000_profile_sharing.sql` | **elimina todas** las políticas vivas de `os_entity_roles` y las recrea (§7, `:551-556`) | nadie puede auto-concederse `owner` de una entidad ajena; si alguna cuenta gestionaba una entidad sólo por la política vieja, pierde ese acceso | rollback **dentro del archivo** (al final), no es `_rollback.sql`; y reabre el agujero |
| `20260801130000_os_memberships_pk_role_guard.sql` | cambia la PK de `os_memberships` (`:18-19`) y degrada a `miembro` los roles privilegiados autoasignados que no son la dueña real (`:53`) | si el cambio de PK encuentra FKs que la referencian, la sentencia falla y no se aplica nada; además **no es repetible**: `drop constraint` va sin `if exists` (`:18`) | no hay `_rollback.sql`; el archivo dice que ya se aplicó por Management API (`:13-14`) |
| `20260929090100_realtime_publicacion_minima.sql` | quita de la publicación toda tabla que no esté en su lista | **si se aplica después** de la de estaciones, `os_estaciones` y `os_estaciones_denuncias` salen de la publicación y el directorio de estaciones deja de actualizarse en vivo (`src/components/estaciones/directorio-estaciones.tsx:86`) | no hay `_rollback.sql`; se arregla reaplicando `20261010090000` |
| `20260928130000_l1-llamadas.sql` | añade políticas **permisivas** a `realtime.messages`: sólo añaden acceso, no quitan | si Realtime Authorization está apagada, el bloque `DO` avisa y no hace nada (`:129-132`): el contador de presentes queda en «no se sabe», sin caer a un canal público. **No** hay que desactivar «Allow public access» (`:18-19`) | no hay `_rollback.sql`; la reversa es `drop policy if exists l1_sesiones_* on realtime.messages;` |
| `20260928120000_contactos_presencia_mensajeria.sql` | añade `os_profiles_select_companeros_chat` (`:87-90`): **ensancha** la visibilidad | los compañeros de un DM ven tu perfil aunque no sea público; crear una sesión con `hilo_id` de un chat ajeno se rechaza | no hay `_rollback.sql` |
| `20260712090000_missing_core_tables_library.sql` | `entity_state` con `es_can_read` que hace legible para cualquiera con cuenta todo `owner_kind='other'` que no sea `srv:` | al guardar la clave `espacio` de una entidad, ese contenido queda legible por cualquiera con cuenta (según la política) | no hay `_rollback.sql` |
| `20260710000000_os_entity_roles.sql` | crea `os_entity_roles` con `os_entity_roles_modify`, que permite autoasignarse `owner` (`:56-66`) | nada; es un agujero que la fase 1 cierra con `20260806120000` | no hay `_rollback.sql` |
| `20260712090200_missing_core_tables_messages.sql` | crea `is_dm_member`; no cambia permisos previos | nada | no hay `_rollback.sql` |
| `20261116100000_spaces_rol_grupo.sql` (P1-A, **no existe**) | el riesgo es el ya descrito: endurecer la edición de `os_spaces` | miembros de rango bajo dejan de editar los espacios de su grupo | todavía no; hay que escribirla con su reversa |

---

*Documento de comprobación, sin código aplicado. Lo verificado sale de leer `supabase/migrations/` y el código;
lo no comprobable, de las consultas de §3 sobre la base viva. No se ha ejecutado ninguna migración ni ninguna
consulta.*
