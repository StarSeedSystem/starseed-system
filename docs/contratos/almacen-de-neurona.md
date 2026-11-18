# Contrato · Almacén de neurona por la malla (capas de capacidades locales y funciones de nodo, privadas y públicas)

**ALM1118A** · 2026-11-18 · Alex Bordón Garrigós

---

## 1. Lo que ya existe

### 1.1 Elección de medio de almacenamiento por neurona

| Archivo | Qué hace | Hallazgos (grep) |
|---------|----------|------------------|
| `src/lib/mando/almacenamiento.ts` | Mide disco, regenerables, DriveFS, swap, carpetas frías, espejo automático (launchd 04:00). Solo servidor (`node:*`). | `leerAlmacenamiento()`, `espejar()`, `limpiarRegenerables()`, `aliviarMemoria()`, `moverADrive()`, `traerDeDrive()`, `espejoAutomatico()`, `medirDisco()`, `medirRegenerables()`, `detectarDrive()`, `cuotaDrive()`, `medirCarpetasFrias()`, `medirSwap()`, `memoriaDisponibleMb()`, `driveCorriendo()`, `motoresParados()` |
| `src/app/api/mando/almacenamiento/route.ts` | `GET` estado completo; `POST {accion}`: `espejar`, `limpiar`, `aliviar`, `mover`, `traer`, `espejo-automatico`. Guardián `/api/mando/*` (404 fuera de local). | `export async function GET`, `export async function POST` |
| `src/lib/neurons/neurons.ts` | `NeuronCapabilities` incluye `storageQuotaGb`, `storageUsedGb`, `discoLibreGb` (escrito por app nativa). `listNeurons()` lee `neuron_devices`. | `storageQuotaGb`, `storageUsedGb`, `discoLibreGb` en `NeuronCapabilities` |
| `src/lib/network/malla-neuronas.ts` | `FichaDispositivo.almacenamientoLibreGb` medido de `capabilities` (disco nativo o cuota navegador). Se anuncia en ficha por WebRTC. | `almacenamientoLibreDeCaps()`, `construirFicha()`, `FichaDispositivo.almacenamientoLibreGb` |
| `src/app/api/storage/gcs/sign/route.ts` | Backend REAL GCS (subir/leer/borrar). `POST` firma upload; `GET` prueba de conexión. | `export async function POST`, `export async function GET` |
| `src/app/api/storage/oauth/token/route.ts` + `callback/route.ts` | OAuth externo (Drive, GCS). Custodia `refresh_token` en servidor (AES-256-GCM, `storage_credentials`). | `export async function POST`, `export async function GET` |
| `src/lib/storage/gdrive-driver.ts` | Driver real Google Drive (sync por cerebro, regla: el más nuevo gana, ningún borrado se propaga solo). | `GDriveDriver`, `syncBrainMemoryNow` |
| `src/lib/storage/credenciales-servidor.ts` | Cifrado AES-256-GCM de credenciales OAuth en servidor (`storage_credentials`). | `cifrarCredencial()`, `descifrarCredencial()` |

**Conclusión**: Hoy la neurona **mide** su almacenamiento libre (`discoLibreGb` o cuota navegador) y lo anuncia en su ficha de malla. El almacenamiento **pesado** (carpetas frías) se mueve a Google Drive vía `moverADrive`/`traerDeDrive` (lista blanca, rsync sin `--delete`, verificación byte a byte). El **espejo** del memory root a Drive es automático (launchd 04:00) y **nunca usa `--delete`**. No hay aún **anuncio de capacidad de almacén** (GB libres + cuota del dueño) ni **espacio privado cifrado punta a punta** ni **espacio público direccionado por contenido** para capas colectivas.

---

### 1.2 Enjambre de datos (semillas, imanes, espejos)

| Archivo | Qué hace | Hallazgos |
|---------|----------|-----------|
| `architecture/enjambre-datos.md` | Contrato completo ENJ1110A. Árbol Merkle SHA-256 (hojas 16 KiB), piezas 64 KiB–1 MiB. **Semilla** (descriptor firmado), **imán** (`starseed:?xt=urn:ss256:<raíz>…`), **espejos** HTTPS con Range (verificados por trozo). Cuatro ámbitos: público, comunidad, grupo, privado (texto cifrado determinista, árbol sobre cifrado). Descubrimiento por capas (vecinos, presencia cuenta/grupo, intercambio pares, espejos, rastreador/Kademlia solo diseño). Planificador por vías (capacidad, latencia, coste, fiabilidad). Política cooperativa (mi cuenta siempre, grupos por turnos, público opt-in, relé ciego opt-in). Canales firmados (`seq` monótona). Almacén con cuota por ámbito, LRU, fijar, referencias. | `semilla.ts`, `arbol.ts`, `iman.ts`, `enjambre.ts`, `politica.ts`, `planificador.ts`, `espejo.ts`, `url-segura.ts`, `canal.ts`, `almacen.ts` |
| `src/lib/enjambre/` | Motor puro TypeScript (WebCrypto, sin deps nuevas). 66 tests (56 unitarias + 10 simulación determinista). | `vitest run src/lib/enjambre` → 66 passed |
| `src/lib/network/archivos-malla.ts` | Transferencia archivo actual (trozo 16/63/256 KiB, SHA-256 archivo + «raíz» = SHA-256 concatenación hashes trozo). Oferta/aceptación, huecos para reanudar. **No usa árbol Merkle ni semilla/imán**. | `calcularHashLista()`, `raizDeHashes()`, `ArchivoMallaOferta`, `ArchivoMallaAceptacion` |
| `src/lib/malla/cifrado-archivo.ts` | AES-256-GCM por trozo, clave aleatoria por transferencia (texto cifrado **no estable** entre transferencias). | `cifrarTrozo()`, `descifrarTrozo()` |
| `src/lib/malla/sellado-contenido.ts` | **Sellado determinista** para enjambre: clave por contenido/versión, nonce HMAC(clave, índice), AAD fijo. Mismo claro + misma clave → misma raíz. | `ClaveSellado`, `sellarTrozo()`, `abrirTrozo()`, `sellarMetadatos()` |
| `src/lib/malla/espejo.ts` + `url-segura.ts` | Espejo HTTPS con Range, verificación por trozo (capa de piezas o sidecar `.enj-capa`). Anti-SSRF sintáctico + de resolución (puerta). | `FuenteEspejo`, `validarUrlEspejo()`, `crearFetchEspejoSeguro()` |
| `native/src-tauri/src/servidor_capas*.rs` | Actualizador y servidor local: descarga APK/capa con SHA-256 contra manifiesto, firma minisign, `curl` reanudable. **Ya son «descargar archivo con hash conocido desde URL» = espejo del enjambre**. | `canal_actualizacion.rs`, `servidor_capas.rs`, `servidor_capas_logica.rs` |

**Conclusión**: El **motor del enjambre está escrito y probado** (`src/lib/enjambre/`, 66 tests). Lo que falta es **enchufarlo** (ENJ1110B): adaptador `TransporteEnj` sobre `transporte-universal.ts`, vías de `matriz-enlaces.ts`, punto de entrada en `archivos-malla.ts`, cifrado por destinatario con `recipient-crypto`.

---

### 1.3 Capas de capacidades de la neurona

| Archivo | Qué hace | Hallazgos |
|---------|----------|-----------|
| `src/lib/astraura/capas-conciencia.ts` | Cuatro capas: `local`, `mesh`, `nube`, `colectiva`. `PreferenciaCapas` (activo, capas[], nivelador 0–100, específico). `fuentesApagadas()` devuelve ids de fuentes a apagar. `estadoCapas()` → `apagada|sin-senal|activa|sincronizada`. `resumenCapas()` para UI. `sesgoNivelador()` empuja ranking. | `CAPAS`, `PreferenciaCapas`, `leerPreferenciaCapas()`, `preferenciaCapasGuardada()`, `aCampos()`, `fuentesApagadas()`, `destinoNivelador()`, `sesgoNivelador()`, `estadoCapas()`, `resumenCapas()`, `ETIQUETA_CAPA` |
| `src/lib/astraura/capas-entidad.ts` | Capas por entidad (chat, agente, cerebro, grupo, página). `ConfigEntidad.capas` sustituye a global cuando existe. | `ConfigEntidad`, `leerCapasEntidad()`, `fusionarCapas()` |
| `src/lib/astraura/use-estado-capas.ts` | Hook React: salud de capas (`SaludCapas.local/nube/vecinosMesh/colectivaConectada/chatUsa158/meshUsada`). Usa `usePeersMalla()` para sumar vecinos mesh. | `useEstadoCapas()`, `SaludCapas` |
| `src/lib/network/capas-conciencia.ts` (en `malla/puerta/capas.ts`) | Capas **compartibles** además de internet: `servidor-propio`, `lan`, `router-publico`, `ia-neurona`. `detectarCapas()` desde fuentes (servidores propios privados, routers, LAN, puertos IA locales). Matriz de política por solicitante (misma cuenta / otra) × capa × ajustes. `evaluarDestino()` concede exactamente lo anunciado y permitido. | `TipoCapa`, `CapaPuerta`, `FuentesCapas`, `detectarCapas()`, `decidirCapa()`, `capasConcedidas()`, `capasAnunciables()`, `evaluarDestino()`, `hostEsPrivado()`, `cidrDeCapaValido()` |
| `src/lib/malla/puerta/capas-fuentes.ts` | Lee servidores propios (Supabase autoalojado + declarados en `starseed.malla.puerta.capas.v1`), vecinos LAN (motor nativo), subredes (Node), routers declarados, puertos IA locales (8000, 11434, 1234). | `CLAVE_CAPAS_DECLARADAS`, `leerCapasDeclaradas()`, `fuentesCapasReales()`, `vecinosLanReales()` |
| `src/lib/neurons/neurons.ts` | `NeuronCapabilities` incluye `memoryGb`, `deviceMemory`, `hardwareConcurrency`, `gpuRenderer`, `gpuVendor`, `storageQuotaGb`, `storageUsedGb`, `discoLibreGb`, `installedApp`, `platform`. `detectCapabilities()` medido (WebGPU, WebGL, Ollama, LM Studio, batería). | `detectCapabilities()`, `NeuronCapabilities` |
| `src/ai/astraura/model-requirements.ts` | `ModelSpec` + `HardwareReq` para LLM/voz local y servidor. `fitFor()` → `{level, fits, reasons}`. `classifyDeviceTier()` → `alto|medio|bajo|minimo`. | `LOCAL_LLM_SPECS`, `SERVER_LLM_SPECS`, `LOCAL_VOICE_SPECS`, `SERVER_VOICE_SPECS`, `fitFor()`, `classifyDeviceTier()` |
| `src/ai/astraura/model-recommend.ts` | `recommendModels(caps, {osInstalled, hasAccount})` → mejor LLM/voz con `best`/`bestLocal`/`bestServer`/`ranked`, `strategy` (local|servidor), `summary`. | `recommendModels()`, `availableNow()`, `strategy` |
| `src/components/neurons/neuron-models-panel.tsx` | UI: tarjeta capacidades + gama, LLM/voz recomendados, requisitos, disponibilidad, botón «Probar» funcional. | `<NeuronModelsPanel />` |

**Conclusión**: Las **capas de conciencia** (local/mesh/nube/colectiva) y las **capas compartibles de red** (servidor-propio/LAN/router/IA-neurona) ya existen con su modelo puro, política y UI. La neurona **anuncia** sus capacidades (hardware, capas instaladas, tok/s medidos, voz medida, ámbitos) vía `CapacidadesNodo` y `FichaDispositivo` por la malla.

---

### 1.4 Servidor de capas (layer server)

| Archivo | Qué hace | Hallazgos |
|---------|----------|-----------|
| `native/src-tauri/src/servidor_capas_logica.rs` | Núcleo puro Rust (solo `std`). Canal fijo `servidor-local` (GitHub Releases prerelease). `latest-servidor.json` → manifiesto firmado (minisign, misma clave que updater Tauri) + `.tar.gz` (≈50 MB). Manifiesto: lista archivos con SHA-256 + SHA-256 del .tar.gz. Estado: `pendiente` → prueba 60 s → `activa` (anterior queda `anterior`) o `mala` (vuelve a anterior). `ESTABLE_MS=30s`, `MAX_INTENTOS=3`. Lectura estricta de tar (solo archivos/carpetas, rutas seguras). Topes: canal 64 KB, manifiesto 16 MB, archivo 1 GB, expandido 4 GB, 100k archivos, margen disco 512 MB. | `Canal`, `Manifiesto`, `ArchivoCapa`, `build_id_seguro()`, `version()`, `version_cumple()`, `ruta_segura()`, `DIR_CAPAS`, `CANAL`, `FORMATO`, `PROTOCOLOS_ADMITIDOS`, `ESPERA_SALUD_MS`, `ESTABLE_MS`, `MAX_INTENTOS`, `TOPE_*`, `MARGEN_DISCO`, `REQUERIDOS` |
| `native/src-tauri/src/servidor_capas.rs` | Pegamento: `curl` reanudable, verifica firma minisign, `gzip` + lector tar estricto (SHA-256 archivo + cada fichero), extrae a `.extrayendo`, renombra, registra firma. Vigía del canal (cada 6 h, reintento 30 min). «Actualizar ahora» reinicia solo Node (`reiniciar.json` → Kotlin mata/reabre). Android: descarga Kotlin (`CapasAndroid.kt`, HttpURLConnection, Range), Rust verifica, mismo estado. | `buscar()`, `elegir()`, `descargar()`, `verificar()`, `extraer()`, `registrar_sirve()`, `iniciar_vigia()`, `tras_lista()`, `tras_fallo()`, `pedir_busqueda()`, `al_pedir_relevo()` |
| `src/app/api/mando/capas/route.ts` | `GET` estado capas (activa, anterior, pendiente, malas, líneas log). `POST {accion}`: `buscar`, `actualizar` (reinicia Node), `ver-manifiesto`. Solo local (`/api/mando/*`). | `export async function GET`, `export async function POST` |
| `src/components/neurons/neuron-server-config.tsx` | UI: configuración servidor por neurona (rol servidor/receptor, ofrecer internet público con puerto, logs por neurona, política memorias/sync). | `<NeuronServerConfig />` |

**Conclusión**: El **servidor de capas ya funciona en Rust** (desktop + Android), con firma minisign, verificación SHA-256 por archivo, rollback automático, vigía de canal, y UI en Genesis. Las capas de modelos de IA (BitNet, Needle, adaptadores) se distribuirán por este mismo canal (E2 de `enjambre-datos.md`).

---

### 1.5 Funciones de nodo público (rutas y funciones exactas)

#### Rutas `/api/mando/*` (solo local, guardián `guardianMando`)

| Ruta | Método | Función | Archivo |
|------|--------|---------|---------|
| `/api/mando/almacenamiento` | `GET` | `leerAlmacenamiento()` → `EstadoAlmacenamiento` | `src/app/api/mando/almacenamiento/route.ts` |
| | `POST` | `espejar()`, `limpiarRegenerables(ids)`, `aliviarMemoria()`, `moverADrive(id)`, `traerDeDrive(id)`, `espejoAutomatico(activar)` | `src/app/api/mando/almacenamiento/route.ts` |
| `/api/mando/neurona` | `GET` | `medirNeurona()` → salud (memoria, swap, demonio voz, llama-server, Ollama) | `src/app/api/mando/neurona/route.ts` |
| `/api/mando/capas` | `GET` | Estado capas servidor local (activa, anterior, pendiente, malas, líneas) | `src/app/api/mando/capas/route.ts` |
| | `POST` | `buscar`, `actualizar`, `ver-manifiesto` | `src/app/api/mando/capas/route.ts` |
| `/api/mando/medidores` | `GET` | Medidores Genesis (agentes, tareas, listas, contenedores, recursos) | `src/app/api/mando/medidores/route.ts` |

#### Rutas `/api/astraura/*` (públicas, proxy OS → neurona/nube)

| Ruta | Método | Función | Archivo |
|------|--------|---------|---------|
| `/api/astraura/nodos` | `GET` | Candidatos para tarea (local, vecino, nube) **filtrados por privacidad**. `?tarea=&privacidad=` | `src/app/api/astraura/nodos/route.ts` |
| | | `sondaLocal()` → `NodoCandidato` (vivo, latencia, RAM libre) | |
| | | `destinoNube()` → primer backend sano (env, fijo, túnel neurona) | `src/lib/astraura/destino-nube.ts` |
| | | Lee `user_settings.prefs.devices` (mis neuronas) | |
| `/api/astraura/modelos-fuentes` | `GET` | Catálogo de modelos/fuentes disponibles (gratis-primero) | `src/app/api/astraura/modelos-fuentes/route.ts` |
| `/api/astraura/decidir` | `POST` | Petición a Needle 3 (decisión tipada con probabilidad, $0.00002) | `src/app/api/astraura/decidir/route.ts` |
| `/api/astraura/conversacion` | `POST` | Chat Astraura 1.58 (router gratis-primero, capas, aprendizaje) | `src/app/api/astraura/conversacion/route.ts` |
| `/api/astraura/automejora` | `GET`/`POST` | Automejora capas colectivas (Meta^n) | `src/app/api/astraura/automejora/route.ts` |

#### Rutas `/api/neurons/hermione/*` (puente Hermione, servidor neurona = Mac)

| Ruta | Método | Función |
|------|--------|---------|
| `/api/neurons/hermione/bridge` | `GET`/`POST` | Health-check, reporte online, sincroniza capacidades |
| `/api/neurons/hermione/sync-capabilities` | `POST` | Instala capacidades en neurona destino |
| `/api/neurons/hermione/select-model` | `POST` | Selecciona modelo en neurona |
| `/api/neurons/hermione/sync-chats` | `GET`/`POST` | Backfill chats Hermes a neuronas |

#### Rutas de almacenamiento público

| Ruta | Método | Función |
|------|--------|---------|
| `/api/storage/gcs/sign` | `POST` | Firma upload GCS (backend real) |
| | `GET` | Prueba de conexión real (bucket + origen credencial) |
| `/api/storage/oauth/token` | `POST` | Inicia OAuth almacenamiento externo |
| `/api/storage/oauth/callback` | `GET` | Callback OAuth (custodia refresh_token en servidor) |

#### Funciones puras exportadas (sin red/DOM, probables tests)

| Módulo | Funciones clave |
|--------|-----------------|
| `src/lib/mando/almacenamiento.ts` | `interpretarDf()`, `esMismoVolumen()`, `medirDisco()`, `medirRegenerables()`, `detectarDrive()`, `cuotaDrive()`, `medirCarpetasFrias()`, `espejar()`, `moverADrive()`, `traerDeDrive()`, `espejoAutomatico()`, `limpiarRegenerables()`, `aliviarMemoria()`, `memoriaDisponibleMb()`, `driveCorriendo()`, `motoresParados()`, `leerAlmacenamiento()` |
| `src/lib/astraura/capas-conciencia.ts` | `leerPreferenciaCapas()`, `preferenciaCapasGuardada()`, `aCampos()`, `fuentesApagadas()`, `destinoNivelador()`, `sesgoNivelador()`, `estadoCapas()`, `resumenCapas()` |
| `src/lib/malla/puerta/capas.ts` | `ipv4ANumero()`, `leerCidr()`, `ipEnCidr()`, `cidrDeCapaValido()`, `hostEsPrivado()`, `detectarCapas()`, `leerCapa()`, `capaAlcanza()`, `capaDeDestino()`, `decidirCapa()`, `capasConcedidas()`, `capasAnunciables()`, `evaluarDestino()` |
| `src/lib/malla/puerta/capas-fuentes.ts` | `interpretarCapasDeclaradas()`, `leerCapasDeclaradas()`, `guardarCapasDeclaradas()`, `fuentesCapasReales()`, `vecinosLanReales()` |
| `src/lib/network/capacidades-nodo.ts` | `normalizarVoz()`, `vozMedida()`, `crearFichaNodo()`, `fichaCompacta()`, `permitePrivacidad()`, `filtrarPorPrivacidad()`, `iniciarPublicacionCapacidades()`, `anunciar()`, `elegirDeliberador()`, `elegirReflejo()`, `resumenRed()` |
| `src/lib/network/malla-neuronas.ts` | `claseRam()`, `esOrigenLocal()`, `sondaBackendLocal()`, `decidirAutovinculo()`, `vozDeEstaNeurona()`, `fichaRecibida()`, `declaracionAstrauraLocal()`, `puedeServirAstrauraPorMalla()`, `medirLatenciaAstrauraPropia()`, `construirFicha()`, `almacenamientoLibreDeCaps()`, `chipDeCaps()`, `hayQueEnviarRadar()`, `deteccionesBleRecientes()` |
| `src/lib/enjambre/*.ts` | Todo el motor (puro, 66 tests) |

---

## 2. Diseño

### 2.1 Anuncio de capacidad de almacén

Cada neurona **anuncia** en su ficha de malla (`FichaDispositivo`):

```typescript
interface FichaDispositivo {
  // ... campos existentes ...
  almacenamientoLibreGb?: number;      // GB libres medidos (disco nativo o cuota navegador)
  almacenamientoCuotaGb?: number;      // Cuota total que el dueño fija para esta neurona (GB)
  almacenamientoCuotaPct?: number;     // % de la cuota usado (0–100)
}
```

- **Medición**: `almacenamientoLibreDeCaps()` ya lee `discoLibreGb` (app nativa) o `storageQuotaGb - storageUsedGb` (navegador). Redondeo a 0.1 GB.
- **Cuota del dueño**: Nueva preferencia por neurona en `neuron_devices.capabilities.almacenamientoCuotaGb` (editable en Genesis → Neuronas → Configuración). Por defecto: **sin límite** (null = usa todo el disco libre).
- **Anuncio**: Se incluye en `construirFicha()` y viaja por WebRTC en cada latido (30 s) y en el anuncio de capacidades (`astraura/capacidades` cada 20 min).
- **Uso**: El planificador del enjambre (`planificador.ts`) y la política de la puerta (`decidirCapa()`) leen este campo para decidir qué neurona sirve un espejo o recibe una capa.

### 2.2 Espacio privado de la cuenta (cifrado punta a punta, solo neuronas de la misma cuenta)

- **Ámbito**: `privado` en el enjambre (`architecture/enjambre-datos.md` §4). Contenido cifrado con **sellado determinista** (`sellado-contenido.ts`): clave aleatoria 256 bits por contenido/versión, nonce `HMAC(clave, "ss-enj-nonce-v1|" + índice)`, AAD fijo.
- **Clave**: Se envuelve **por neurona destinataria** con `recipient-crypto` (ECDH X25519, sobre firmado). El paquete lleva clave + secreto del enjambre (HMAC(secreto, raíz)), ligados a la raíz. **Nunca va en el imán, ni en el anuncio, ni en la semilla**.
- **Acceso**: Solo neuronas de la **misma cuenta** (verificadas por certificado de cuenta → neurona, `identidad/`). La política de la puerta (`decidirCapa()`) concede `servidor-propio` y `lan` solo a `mismaCuenta: true` (ajuste `compartirServidoresPropios` encendido por defecto).
- **Almacén**: `AlmacenTrozos` con cuota por ámbito (`privado: 4096 MiB` por defecto). LRU por contenido entero (un contenido a medias no sirve). `fijar()` para no desalojar (backups, versiones).
- **Réplica obligatoria**: Cada contenido en ámbito `privado` **debe tener al menos 2 copias** en neuronas distintas de la cuenta (o 1 neurona + 1 servidor propio). El planificador (`SuperSembrador` para grupos, `raro-primero` para privado) asegura replicación antes de dar por completada la siembra.

### 2.3 Espacio público direccionado por contenido (capas colectivas)

- **Ámbito**: `publico` o `comunidad` en el enjambre. Contenido **en claro** (público) o **cifrado determinista** con clave conocida por miembros (comunidad).
- **Direccionamiento**: **Imán** (`starseed:?xt=urn:ss256:<raíz>&am=publico&es=<espejo>…`). La raíz = identificación global. Cualquiera que tenga el imán pide la capa de piezas (`enj.capa`) a pares o espejos, verifica contra la raíz.
- **Capas colectivas** (adaptadores Needle/BitNet, manifiestos `actual@sha`): Se empaquetan como contenido, se publica **semilla** por ámbito (`comunidad` recomendado, §11.5), y **canal firmado** `capas/<ámbito>/<nombre>` con `seq` monótona (§10). Neuronas del ámbito cotillean `enj.canal`, comparan `seq`, bajan por enjambre (pares + espejos), verifican, evalúan (`exactitud_dorado`), y **solo entonces activan**.
- **Espejos obligatorios**: Cada capa colectiva pública debe tener **≥ 2 espejos HTTPS con Range** (Supabase Storage, GitHub Releases, servidor propio). El motor los trata como vías más (coste 0.3, fiabilidad 0.9). Un trozo malo mata ese espejo para la sesión.
- **Política**: `Sembrar contenido público` = opt-in (apagado por defecto, §16.1). Topes diarios: 256 MiB subida pública. Relé ciego = opt-in aparte.

### 2.4 Réplica obligatoria de lo principal en otro medio

| Qué | Dónde | Cómo |
|-----|-------|------|
| **Memory root** (respaldos, verificaciones, aprendizaje, olas/pasos, mando/chats, informes) | Google Drive (DriveFS) → `My Drive/StarSeed_Memory_Root/neurona-<host>/` | `espejar()` (rsync sin `--delete`, excluye `.env*`, `*.wav`), launchd diario 04:00 (`espejoAutomatico(true)`). **Nunca medio único**. |
| **Carpetas frías** (transfer, respaldos, exports, verificaciones, aprendizaje-export, aprendizaje-corpus/meses-anteriores, opencode-logs) | Google Drive → `…/frio/<id>/` | `moverADrive(id)` (rsync, verifica conteo+bytes, deja symlink, borra local solo tras verificación). `traerDeDrive(id)` invierte. |
| **Versiones de la app / capas de modelos** | GitHub Releases (canal `servidor-local`) + **enjambre** (E2) | `latest-servidor.json` firmado (minisign) → manifiesto firmado → `.tar.gz` con SHA-256 por archivo. Neurona que ya tiene la capa la **siembra** a vecinas sin internet (Bluetooth/Wi-Fi directo); quien no tiene ruta usa espejo (GitHub Releases). |
| **Cerebros / memorias / personalidades** | Supabase (cuenta) + **enjambre** (ámbito `privado`/`grupo`) + Drive (espejo) | `syncBrainMemoryNow` (driver `gdrive` real, réplica best-effort, fallo en `result.replicas` + `warning` sin romper subida). Enjambre: semilla por cerebro, canal `cerebros/<id>`, réplica a ≥ 2 neuronas de la cuenta. |
| **Backups de sistemas y sus versiones** | Drive (espejo memory root) + **enjambre** (ámbito `privado`) | Cada backup = contenido enjambre con semilla firmada. Réplica a ≥ 2 neuronas. |

**Regla de oro**: **Nunca medio único de lo principal**. Mínimo 2 copias en medios/distintos (neurona + Drive, neurona + neurona, neurona + servidor propio, enjambre + Drive).

### 2.5 Uso por MetaGenesis

| Necesidad | Cómo lo resuelve el almacén de neurona |
|-----------|----------------------------------------|
| **Respaldos de sistemas y versiones** | Cada neurona espeja su memory root a Drive (automático 04:00). MetaGenesis lee `starseed_memory_root/` desde Drive (espejo) o pide a la neurona líder por enjambre (ámbito `privado`). |
| **Código con reflejo GitHub autoactualizado** | `alcance-github-1113.md` → `alcance_github.py` escribe fichas en `starseed_memory_root/alcance/github/<fecha>.json`. Esas fichas son contenido enjambre (semilla + imán), replicadas a neuronas de la cuenta. |
| **Archivos y carpetas pesados de producción/desarrollo vía MetaGenesis** | Carpeta fría `aprendizaje-corpus` (meses anteriores) → `moverADrive()`. MetaGenesis usa `traerDeDrive()` para traer corpus a neurona que entrena. Enjambre reparte capas de modelos entrenados (E4). |
| **Capas de conciencia colectivas privadas de la cuenta** | Ámbito `privado` en enjambre. Clave envuelta a mis neuronas. Réplica obligatoria ≥ 2. Canal `capas/privado/<nombre>` firmado por editor de la cuenta. |
| **Capas de conciencia colectivas públicas** | Ámbito `comunidad` (cifrado, clave a miembros) o `publico` (claro). Espejos obligatorios (≥ 2). Canal `capas/publico/<nombre>` o `capas/comunidad/<nombre>`. MetaGenesis publica nuevas versiones de adaptadores; neuronas las bajan, evalúan, activan. |
| **Medios de producción** | Cada medio (modelo, adaptador, dataset) = contenido enjambre con semilla. MetaGenesis siembra desde neurona con GPU; otras neuronas recolectan por enjambre (pares + espejos). |
| **Contenedor en la nube de MetaGenesis** | El contenedor (A1, Cloud Run, Oracle) es **otra neurona** con `medio: "nube"` y `discoLibreGb` grande. Anuncia capacidad de almacén. MetaGenesis mueve carpeta fría `exports`/`verificaciones` a la nube (`moverADrive` pero a bucket GCS/S3 vía puerta `servidor-propio`). |
| **Funciones de nodo de neuronas públicas** | Neurona pública = `ambitos: ["publico"]` en `CapacidadesNodo` + `FichaDispositivo`. Ofrece: `servidor-propio` (Supabase autoalojado), `router-publico` (internet compartido), `ia-neurona` (Astraura/Ollama local). La puerta (`evaluarDestino()`) concede solo lo anunciado y permitido por política. |

---

## 3. Riesgos y lo que NUNCA se sirve en público

### 3.1 Riesgos identificados

| Riesgo | Mitigación |
|--------|------------|
| **Fuga de claves/secretos en espejos** | Espejo **nunca** usa `--delete`. Excluye `.env*`, `*.gguf`, `*.wav`. `moverADrive()` rechaza carpetas con `.env*` en raíz. `cuotaDrive()` en macOS devuelve `null` (DriveFS miente) → no expone cuota real. |
| **Análisis de tráfico en enjambre público** | Id de enjambre **opaco** en ámbitos no públicos (`HMAC(secreto, raíz)`). Sin nombres/MIME en anuncios. Cifrado de enlace (`sesion-cifrada`) oculta mensajes. **No hay padding ni mezcla**: tamaño y momento de piezas se ven. |
| **Envenenamiento (trozo corrupto)** | Verificación **antes de guardar**: longitud exacta → hash pieza → prueba Merkle contra raíz. Trozo malo = golpe a vía (veto exponencial) y a par (vetado al 3er golpe). Espejo malo se descarta. |
| **Sybil en enjambre público** | Golpes y límites por id de neurona (ligado a certificado cuenta→neurona). `raro-primero` cuenta copias solo de pares no vetados. Servir depende de relación (cuenta, miembro, id conocido). |
| **Repetición de canales viejos (congelación)** | `seq` monótona, `viejo` sin efecto, `ts` ≤ 24 h futuro. Mitigación: preguntar a varios pares + espejo, quedarse con `seq` máxima, no bajar nunca de `seq` ya vista. |
| **SSRF por espejos** | Dos capas: (1) sintáctica (`url-segura.ts`: solo `https:`, sin user/pass, puerto 443, sin IP privada/literal, sin `localhost/.local/.internal/.lan/.home`); (2) de resolución: `fetch` de la puerta resuelve DNS **una vez** y comprueba IP (`hostEsPrivado`, `ipPrivadaOLocal`) antes de conectar. |
| **Clave de contenido filtrada / miembro expulsado** | Clave **por versión**: al expulsar se publica otra versión con clave nueva. No hay secreto retroactivo. |
| **Agotamiento de recursos** | 400 msg/s por par; validación y longitudes máximas; imán ≤ 2048 chars/16 params; rango capa ≤ 512 hashes; `maxSubidas`; tope diario por categoría; cuota por ámbito con desalojo LRU; tope contenido 2⁴⁰ B. |
| **Réplica única (punto de fallo único)** | **Regla**: réplica obligatoria ≥ 2 en medios/distintos. Planificador lo asegura (`SuperSembrador` para grupos, `raro-primero` para privado). |

### 3.2 Lo que NUNCA se sirve en público (lista cerrada)

1. **Claves privadas / secretos / `.env*` / `*.gguf` / tokens OAuth / `refresh_token`** — Solo en servidor (custodia AES-256-GCM) o en neurona del dueño (ámbito `privado`).
2. **Datos biométricos brutos** — Invariant: «no se almacenan datos biométricos brutos» (CLAUDE.md §3).
3. **Memorias/cerebros personales** — Ámbito `privado` (clave envuelta a mis neuronas). Ni en público, ni en comunidad sin consentimiento.
4. **Chats privados / logs de agentes / telemetría personal** — Ámbito `privado`. Solo neuronas de la cuenta.
5. **Identificadores de dispositivo/neurona/malla sin consentimiento** — `starseed.device.id`, `starseed.neuron.device-id`, `starseed.mesh.device-id.v1` se fusionan con alias sincronizado; **no se anuncian en público** (solo en ficha de malla entre neuronas de la cuenta).
6. **Capas de conciencia privadas (adaptadores personales)** — Ámbito `privado` o `grupo` (clave envuelta). Solo `capas/colectiva` o `capas/publico` viajan en público.
7. **Índices del grafo de código (`.gitnexus/`)** — Marcado `seguro: false` en regenerables; no se limpia ni se espeja.
8. **Correos de commits / issues no pedidos / datos privados fuera del repo público** — Regla CLAUDE.md § «Alcance por GitHub».
9. **Rutas absolutas del disco de la neurona** — `almacenamiento.ts` y `/api/mando/*` **nunca** devuelven rutas absolutas crudas (usar `rutaVisible()` → `~/…`).
10. **Salud del BitNet / llama-server / Ollama de otra cuenta** — `/api/astraura/nodos` filtra por `privacidad`: lo privado solo sale a `mismaCuenta` o `servidor-propio`.

---

## Apéndice: Referencias de código (grep exacto)

```bash
# Almacenamiento neurona (medición, Drive, espejo, limpieza, alivio)
grep -rn "leerAlmacenamiento\|espejar\|limpiarRegenerables\|aliviarMemoria\|moverADrive\|traerDeDrive\|espejoAutomatico\|medirDisco\|medirRegenerables\|detectarDrive\|cuotaDrive\|medirCarpetasFrias\|memoriaDisponibleMb\|driveCorriendo\|motoresParados" src/lib/mando/almacenamiento.ts

# Capas de conciencia (local/mesh/nube/colectiva, nivelador, salud)
grep -rn "CAPAS\|PreferenciaCapas\|leerPreferenciaCapas\|preferenciaCapasGuardada\|aCampos\|fuentesApagadas\|destinoNivelador\|sesgoNivelador\|estadoCapas\|resumenCapas\|SaludCapas\|useEstadoCapas" src/lib/astraura/capas-conciencia.ts

# Capas compartibles (servidor-propio, lan, router-publico, ia-neurona)
grep -rn "TipoCapa\|CapaPuerta\|FuentesCapas\|detectarCapas\|decidirCapa\|capasConcedidas\|capasAnunciables\|evaluarDestino\|hostEsPrivado\|cidrDeCapaValido" src/lib/malla/puerta/capas.ts

# Enjambre de datos (motor puro, 66 tests)
ls src/lib/enjambre/
vitest run src/lib/enjambre

# Servidor de capas (Rust puro + pegamento)
grep -rn "Canal\|Manifiesto\|ArchivoCapa\|build_id_seguro\|version_cumple\|ruta_segura\|DIR_CAPAS\|CANAL\|FORMATO\|ESPERA_SALUD_MS\|ESTABLE_MS\|MAX_INTENTOS\|TOPE_\|MARGEN_DISCO\|REQUERIDOS" native/src-tauri/src/servidor_capas_logica.rs

# Funciones de nodo público (rutas exactas)
grep -rn "export async function GET\|export async function POST" src/app/api/mando/ src/app/api/astraura/ src/app/api/neurons/hermione/ src/app/api/storage/

# Ficha de dispositivo y anuncio de capacidades
grep -rn "FichaDispositivo\|CapacidadesNodo\|construirFicha\|anunciar\|vozMedida\|normalizarVoz\|fichaCompacta\|permitePrivacidad" src/lib/network/malla-neuronas.ts src/lib/network/capacidades-nodo.ts
```