# Memory Roots: Vínculo y Sincronización con Cerebros, Servidores y VMs

> Diseño de la función que permite **vincular un memory root** (`<nombre>_memory_root/`,
> local / Google Drive / remoto) al **sistema de memorias** de StarSeed, sincronizando
> **a detalle cada memoria**. Formato compartido con `starseed_memory_root/index.md`,
> `sync.md` y `memory.manifest.json`.

## Concepto
- Un **memory root** = carpeta raíz con **ramas** (subcarpetas) por tipo de memoria:
  `soul · ego · skills · style · memory · dream · accounts · tasks · logs`.
- El root se **comparte y vincula** como **servidor + almacén** de memorias a:
  - 🧠 **Cerebros** (Aurora/Astraura o del usuario).
  - 🖥️ **Servidores internos** del usuario · **servidores StarSeed** · **externos**.
  - ☁️ **Computadoras virtuales en línea** (cualquier servicio).
  - 🔌 Cualquier **servicio / plugin / conexión** integrable como servidor y almacén
    (de las memorias, su funcionamiento, configuraciones, opciones y sincronizaciones).

## Contrato (formato portátil)
`memory.manifest.json` enumera cada memoria (rama, archivo, tipo, scope, hash). El mismo
formato sirve para repo, Drive, cerebros, servidores y VMs. Ver `starseed_memory_root/sync.md`.

## Flujo de usuario (futuro)
1. Usuario: *"StarSeed, conecta este memory root con el cerebro/servidor/VM X."*
2. Selecciona origen (Drive / local / remoto) → StarSeed lee `memory.manifest.json`.
3. Previsualiza diferencias **por memoria** → confirma → sincroniza a detalle.
4. Mantiene sync (pull/push) según la política del destino.

## Estado
- ⚠️ Diseño listo; **NO conectado a cuentas reales todavía** (prueba posterior con la cuenta **Ester**).
- Puntos de integración OS: sistema de memorias de cerebros (Exocórtex), baúles, Hub de Conexiones,
  y conectores de servidores/VMs.

## Pendiente de implementar
- Tipo `memory_root` (raíz + ramas) en el modelo de memoria del OS.
- UI "Vincular memory root" en cerebro/baúl/servidor/VM.
- Lector de `memory.manifest.json` + motor de merge por `hash`/`scope`.
- Conectores de origen/destino: local, servidores (internos/StarSeed/externos), VMs en línea. (Google Drive: ver §Ola 374, ya implementado.)
- Política de sync (manual / automática) por destino.

---

## Ola 374 (2026-09-27) — Google Drive REAL como medio de cualquier cerebro/memoria

Objetivo de Alex: *"desde el mismo StarSeed OS debe haber una vinculación y sincronización
directa con el Google Drive, opcional, para cualquier medio de almacenamiento de cualquier
cerebro, como parte de los medios disponibles para cada cerebro y memoria."* Esta ola lo
implementa de verdad (no como el resto de este documento, que sigue siendo diseño futuro).

### Custodia (quién guarda el refresh token, y dónde)
Antes (Adendas 194-198) el `refresh_token` de Google vivía en `localStorage` del NAVEGADOR
(`starseed.almacenamiento.tokens.v1`): por DISPOSITIVO, no por cuenta, y sin verificar sesión
en el canje/refresco. Ahora:
- Tabla `storage_credentials` (migración `20260927100000_storage_credentials.sql`): una fila
  por `(user_id, proveedor)`, RLS **ENABLED y SIN POLÍTICAS** (ni `anon` ni `authenticated`) —
  solo `service_role` desde rutas de servidor que YA exigieron sesión Supabase.
- `src/lib/storage/credenciales-servidor.ts` (server-only, `node:crypto`): AES-256-GCM con
  clave derivada por HKDF-SHA256 de `SUPABASE_SERVICE_ROLE_KEY` (sin variable de entorno
  nueva). Rotar esa clave de servicio invalida lo cifrado — las cuentas reconectan.
- `src/app/api/storage/oauth/token/route.ts`: exige sesión Supabase (userId SIEMPRE de la
  sesión, nunca del cuerpo); `clientId` solo de entorno; 4 acciones `canjear · renovar ·
  estado · desconectar`; el refresh token JAMÁS vuelve al navegador. Migración desde
  dispositivos con un token viejo en `localStorage`: se manda una vez como
  `legacyRefreshToken` en `renovar` y el servidor lo adopta.
- El navegador guarda en memoria/localStorage solo el ACCESS TOKEN de corta vida
  (`src/lib/storage/oauth-almacenamiento.ts`, `src/lib/storage/carpetas-remotas.ts::tokenVigente`).

### Driver real (I/O)
`src/lib/storage/gdrive-driver.ts` (client-safe, solo `fetch`): `probarDrive`,
`asegurarCarpeta` (crea/reencuentra `StarSeed/cerebros/<nombre>` nivel a nivel),
`subirArchivo`/`actualizarArchivo`/`descargar`/`descargarBlob`/`borrar`,
`buscarPorPropiedades` (dedup por `appProperties`), `obtenerEnlaceVista`. Backoff en
429/5xx; errores claros en español en 401/403 (reconectar).

### Backend genérico (`storage_backends`, kind `gdrive`)
`src/lib/storage/backends.ts`: `gdrive` entra en `REAL_DRIVER_KINDS` junto a `starseed`/`gcs`.
`testBackend`/`putObjectToBackend`/`getObjectUrlFromBackend`/`deleteObjectFromBackend` tienen
rama real (dedup por `appProperties.osPath`; sin carpeta configurada, se crea
`StarSeed/archivos` automáticamente). `getObjectUrlFromBackend` en Drive devuelve el
`webViewLink` (abre en la interfaz de Drive, requiere estar conectado con esa cuenta — NO es
un blob público como la URL firmada de GCS, y se documenta así en el código).

### Sync de memorias por cerebro
`src/lib/storage/gdrive-brain-sync.ts` separa lógica PURA (`decidirAccionArchivo`,
`planificarSincronizacion` — sin red, 100% testeada) de la ejecución
(`sincronizarCerebroConDrive`). Regla: **el más nuevo gana** (misma regla que
`memory-sync/connect.ts::importRootToBrain`); un empate no escribe nada; NINGÚN borrado se
propaga automáticamente en ninguna dirección — un archivo sin contraparte se CREA en el otro
lado, nunca se borra por ausencia. Deduplicación por `appProperties {brainId, memoryId}`.
Archivos creados a mano en la carpeta de Drive se detectan (`nuevosDesdeDrive`) y se importan
como ficheros de memoria nuevos.

Wired en `src/lib/brains/memory-destinations.ts::syncBrainMemoryNow`: cada backend
`storage_backends` con `kind:'gdrive', scope:'brain', scope_ref:<brainId>` se sincroniza en el
mismo ciclo que "starseed"/"external", respetando `cerebro.almacen` ("local" no lo toca).
El fichero por fichero (`brain_memory_files.source === 'gdrive'`) usa el MISMO driver:
`server_config.{folderId, fileId}` se actualiza tras cada push/pull real.

### UI
`src/components/cerebro/memory-sources-panel.tsx` (Cerebro → Memoria → Fuentes): tarjeta
«Google Drive (opcional)» — conectar (popup OAuth) → correo de la cuenta → carpeta del
cerebro (automática o «Elegir otra» con el Picker de Google) → modo Espejo/Principal →
«Sincronizar ahora» con el último resultado → «Desconectar» (revoca en Google + borra la fila
de servidor). Badge en `src/components/brains/memory-graph.tsx` (barra de destinos). Bug
corregido en `src/components/senses/carpetas-vinculadas-card.tsx`: guardaba solo el NOMBRE de
la carpeta elegida en el Picker, nunca su `id` real — ahora `carpetas-vinculadas.ts` tiene
`CarpetaVinculada.folderId`.

### Fallback legado (no extender)
`src/lib/storage/route-memory.ts` (rama `gdrive`) sigue llamando al bot externo
`starseed-neurocortex` con `account_id=<uid>` SIN autenticar — se deja como fallback de lo ya
existente, marcado con un TODO en el código; todo lo nuevo usa el driver de esta ola.

### Seguridad
Alcance real `drive.file` (Adenda 196): el OS solo ve lo que él mismo crea o lo que el
usuario elige explícitamente con el selector de Google — nunca todo el Drive.

### Verificación pendiente con cuenta real
Todo lo de esta ola se probó con mocks (vitest) y `tsc`. Falta verificar en producción con una
cuenta de Google real: el flujo de consentimiento completo, la creación de la carpeta, un
ciclo de sync con conflicto real, y la desconexión. Lo hará Alex/el responsable del despliegue.
