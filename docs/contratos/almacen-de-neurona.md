# Contrato · Almacén de neurona por la malla (ALM1118A)

**Estado:** diseño listo para implementar por trozos (≤ 3 archivos, ≤ 120 líneas/archivo).
**Ámbito:** capas de capacidades locales, funciones de nodo privadas y públicas, y cómo MetaGenesis usa el almacén.

---

## 1. Lo que ya existe en el código

### 1.1 Elegir medio de almacenamiento por neurona
- **`src/lib/neurons/neurons.ts`** (líneas 63, 92-94, 162, 232-233): `NeuronCapabilities` incluye `storageQuotaGb`, `storageUsedGb` (cuota y uso del navegador), y `offerStorage` en `NeuronSettings` (línea 233). El dispositivo anuncia su disco disponible y el dueño fija la cuota que ofrece a la red.
- **`src/lib/malla/cristal/destinos-almacen.ts`** (líneas 1-53): `DestinoAlmacen` tipa los destinos (`aparato`, `cerebro`, `biblioteca`, `servidor`) con motor, visibilidad pública/privada y `cerebroId` opcional. `destinosDe()` filtra por clase de dato (`interno`/`privado`/`publico`) y motores reales disponibles; **nunca** sirve dato privado/interno en destino público.

### 1.2 Enjambre de datos (semillas, imanes, espejos)
- **`src/lib/enjambre/semilla.ts`** (líneas 28-159): `Semilla` — descriptor firmado (v1, raíz Merkle SHA-256, tamaño, hoja 16 KiB, pieza 64 KiB–1 MiB, nombre, MIME, ámbito, `meta` sellada, hasta 4 espejos, firma inyectada). `leerSemilla()` valida estricta; `semillaDeArbol()` / `crearSemillaDeBytes()` construyen; `semillaMinima()` da lo justo para pedir capa y trozos.
- **`src/lib/enjambre/iman.ts`** (no leído, contrato §3): `starseed:?xt=urn:ss256:<raíz>&dn=&xl=&am=&fi=&es=&ra=&ps=` — sin claves, ≤ 2048 chars, 16 params, validación estricta (`parsearIman`/`formatearIman`).
- **`src/lib/enjambre/almacen.ts`** (líneas 18-390): `AlmacenTrozos` (interfaz) + `AlmacenBase` (lógica común: cuotas por ámbito, fijar, retener/soltar, LRU de contenido entero, desalojar). Soportes: `AlmacenMemoria` (pruebas) y `AlmacenOPFS` (app, `<raíz>/<raíz_contenido>/{meta.json,capa.bin,p<i>.bin}`).
- **`src/lib/enjambre/espejo.ts`** (contrato §9): `FuenteEspejo` — HTTPS con `Range`, verificación por trozo (capa de piezas o sidecar `.enj-capa`), anti-SSRF en 2 capas (sintáctica + resolución por puerta). Un trozo malo mata el espejo; 3 fallos seguidos también.
- **`architecture/enjambre-datos.md`** §3–§12: vocabulario, árbol, ámbitos, sellado determinista, descubrimiento por capas (vecinos, presencia, PEX, espejos, rastreador/Kademlia solo diseño), protocolo (`enj.*`), planificador por vías (`raro-primero`, `secuencial`, `urgente`, `final`, `SuperSembrador`), política cooperativa, almacén, espejos, canales, capas de conciencia por enjambre.

### 1.3 Capas de capacidades de la neurona
- **`src/lib/network/capacidades-nodo.ts`** (líneas 27-224): `CapacidadesNodo` — `nodoId`, `medio`, `needle`/`bitnet`/`jev`, `ramLibreMb`, `cpu`, `capas[]` (`id@versión`), `tokS` medidos, `bateriaPct`, `enSegundoPlano`, `ambitos[]` (`propio`/`cuenta`/`publico`), `voz` medida. `crearFichaNodo()` construye sin inventar números; `fichaCompacta()` ≤ 200 bytes para LoRa; `elegirDeliberador()`/`elegirReflejo()` eligen nodo por tok/s, CPU, RAM.
- **`src/lib/malla/puerta/capas-fuentes.ts`** (líneas 13-108): `fuentesCapasReales()` reúne servidores propios (`NEXT_PUBLIC_SUPABASE_URL` + declarados en `starseed.malla.puerta.capas.v1`), vecinos LAN (IPs de neuronas ligadas), subredes Node, routers declarados, puertos IA locales. `vecinosLanReales()` carga perezosa del motor nativo.

### 1.4 Servidor de capas
- **`src/lib/nativa/relevo-capa.ts`** (líneas 6-7): lógica Rust (`servidor_capas.rs`) que lee `/version.json` publicado, baja y verifica la capa nueva, deja estado en `servidor_local_estado` (qué build corre, cuál hay publicada, cuál trae la capa lista).
- **`src/lib/nativa/estado-servidor-local.ts`** (línea 156): expone `capas_fase` y `capas_aviso` para la interfaz web.
- **`src/lib/astraura/capas/planificador.ts`** (línea 103): decide qué nodo sirve cada capa (`servidor-starseed`, `servidor-propio`, `par`, `local`, `nube`) según perfil del medio, RAM, disco y preferencias (`capa158Mesh`, `capa158Colectiva`).

### 1.5 Funciones de nodo público (rutas exactas)
| Ruta | Archivo | Qué hace |
|------|---------|----------|
| `GET /api/neurons/hermione/bridge` | `src/app/api/neurons/hermione/bridge/route.ts:85` | Health-check del puente Hermione. |
| `POST /api/neurons/hermione/bridge` | `src/app/api/neurons/hermione/bridge/route.ts:89` | Entrega mensaje a Hermes local (WS `localhost:8787`) y escribe respuesta en `astraura_messages`. |
| `POST /api/neurons/hermione/sync-capabilities` | `src/app/api/neurons/hermione/sync-capabilities/route.ts:15` | Sincroniza habilidades/conexiones de Aurora a neuronas con Hermes. |
| `GET /api/neuronas/insomne` | `src/app/api/neuronas/insomne/route.ts:1` | Estado insomne de ESTA neurona (solo local). |
| `GET /api/mando/servidor` | `src/app/api/mando/servidor/route.ts:2` | Admin de servidor Astraura 1.58 (capa nube) — solo local. |
| `POST /api/mando/almacenamiento` | `src/app/api/mando/almacenamiento/route.ts:4` | Disco de la neurona, espejo del memory root, espejo automático launchd 04:00. |
| `GET /api/astraura/nodos` | `src/app/api/astraura/nodos/route.ts:8` | Capacidades de nodos (usa `capacidades-nodo.ts`). |

### 1.6 MetaGenesis y su uso del almacén
- **`supabase/migrations/20261010100000_metagenesis_motor.sql`**: tabla `metagenesis_motor` (id=1) con `url` del túnel Cloudflare, `encendido`, `ultimo_latido`, `maquina`, `motivo`. La Mac publica; miembros de MetaGenesis leen.
- **`supabase/migrations/20261011090000_metageminis.sql`**: tablas `metageminis_*` (ramas, agentes, campañas, hallazgos, borradores, piezas, resultados, enlaces_pago, donaciones). Escribe clave de servicio; leen miembros vía `es_metagenesis()`.
- **`src/lib/enjambre/`**: motor de enjambre (semillas, imanes, almacén, espejos) que MetaGenesis usa para distribuir: capas de conciencia (pesos + manifiesto por semilla + canal), actualizaciones de app/servidor local (E2), publicaciones de Biblioteca (E3), piezas de campaña del Estudio.

---

## 2. Diseño

### 2.1 Anuncio de capacidad de almacén
Cada neurona **anuncia** en su ficha `CapacidadesNodo` / `NeuronCapabilities`:
- `storageQuotaGb` / `storageUsedGb` (del navegador, `navigator.storage.estimate()`).
- `offerStorage: boolean` (ajuste del dueño en `NeuronSettings`).
- `capas[]` instaladas (`id@versión`) y `tokS` medidos por capa.
- `ambitos[]` que sirve: `["propio", "cuenta"]` por defecto; `publico` solo si el dueño lo activa.
- **Réplica obligatoria**: todo contenido `fijado` (pin) en ámbito `propio`/`cuenta` debe tener al menos **otro medio** (otra neurona de la cuenta, servidor propio o espejo HTTPS verificado) con la misma raíz. El almacén (`AlmacenTrozos.fijar`) marca `fijado=true`; el planificador del enjambre (`SuperSembrador` + política cooperativa) asegura la réplica al servir a grupos/cuenta.

### 2.2 Espacio privado de la cuenta (E2E, solo neuronas de la misma cuenta)
- Ámbito `privado` en `Semilla`/`AlmacenTrozos`: texto cifrado determinista (`sellado-contenido.ts`), clave de contenido aleatoria por versión, nonce HMAC(clave, índice), AAD ligado a índice/tamaño.
- Clave envuelta por neurona destinataria (`recipient-crypto` / `GanchosSobre.involucrarClave`).
- Id del enjambre = `HMAC(secreto, raíz)` — **solo** quien conoce el secreto (miembros de la cuenta) puede descubrir/pedir/servir.
- La neurona **nunca** sirve ámbito `privado` a nodos fuera de la cuenta (política `permitePrivacidad` en `capacidades-nodo.ts:270` + `filtrarPorPrivacidad`).

### 2.3 Espacio público direccionado por contenido (capas colectivas)
- Ámbito `publico` / `comunidad`: semilla **firmada** (cuerpo canónico `cuerpoFirmable`, `FirmaEnj` con certificado de cuenta), nombre/MIME en claro, hasta 4 espejos HTTPS.
- Capas colectivas: pesan el adaptador + manifiesto → semilla por ámbito `comunidad` (o `publico` si el colectivo decide) + canal firmado `capas/<ámbito>/<nombre>` con `seq` creciente. Neuronas del ámbito cotillean `enj.canal`, bajan por enjambre (pares + espejos), verifican y activan si pasan umbral `exactitud_dorado`.
- Réplica: `SuperSembrador` (1.25× subida vs 2.5× ingenua) + espejos (GitHub Releases, Supabase Storage, servidor propio) verificados por trozo.

### 2.4 Cómo lo usa MetaGenesis
| Uso | Mecanismo | Qué almacena |
|-----|-----------|--------------|
| **Respaldos de sistemas y versiones** | Enjambre E2: canal `app/<sistema>/<canal>` firmado + espejos (GitHub Releases) + semilla por versión. | Manifiesto + raíz + SHA-256 + espejos. Neurona que ya tiene la versión siembra a vecinas sin internet (Bluetooth/Wi-Fi directo). |
| **Código con reflejo GitHub autoactualizado** | Canal `codigo/<repo>/<rama>` + enjambre para trozos grandes; espejo = GitHub Releases/Raw. | Raíz del árbol por commit; semilla mínima en imán para que otras neuronas pidan solo lo que falta. |
| **Archivos/carpetas pesados de producción/desarrollo (MetaGenesis)** | Ámbito `privado` (cuenta) o `grupo` (equipo). Semilla + almacén OPFS en neurona servidora (`offerStorage=true`). | Trozos de 64 KiB–1 MiB, capa de piezas verificada, fijados en ≥2 medios. |
| **Capas de conciencia colectivas (privadas/públicas)** | Ámbito `privado` (cuenta) / `comunidad` (colectivo) / `publico`. Semilla firmada + canal `capas/<ámbito>/<nombre>`. | Pesos del adaptador (varios archivos por bloque para reutilizar trozos entre versiones) + manifiesto. |
| **Medios de producción, contenedor en la nube** | Neurona con `offerPublicInternet` + `offerStorage` + `offerCompute` sirve como puerta (`src/lib/malla/puerta/servicio.ts`) y almacén remoto. Capas `servidor-propio` / `servidor-starseed` en `planificador.ts`. | Espejos HTTPS con `Range` verificados; carriles medidos (capacidad, latencia, coste, fiabilidad) para planificador. |
| **Funciones de nodo de neuronas públicas** | Anuncio `CapacidadesNodo` por malla (`iniciarPublicacionCapacidades` c/ 20 min) + puerta (`capasPropias`: servidores propios, LAN, routers). | `needle`/`bitnet`/`jev`, `ramLibreMb`, `cpu`, `capas[]`, `tokS`, `voz`, `ambitos[]`. |

---

## 3. Riesgos y lo que NUNCA se sirve en público

| Riesgo | Mitigación |
|--------|------------|
| **Fuga de metadatos privados** | Ámbitos `privado`/`grupo`/`comunidad`: nombre/MIME/clave van en `meta` sellada; id del enjambre = `HMAC(secreto, raíz)` opaco. Anuncios `enj.anuncio` solo llevan rol/estado; en público, semilla firmada. |
| **Deduplicación entre cuentas** | **Prohibida**: misma clave → misma raíz; distinta clave → distinta raíz. El enjambre no deduplica entre cuentas (rompería lo privado). Sí dentro de cuenta/grupo. |
| **SSRF por espejos** | 2 capas: sintáctica (`validarUrlEspejo`: solo HTTPS, puerto 443, sin IP literal privada, sin `localhost/.local/.lan/…`) + resolución por puerta (`fetch-puerta.ts`: DNS una vez, `hostEsPrivado`/`ipPrivadaOLocal` antes de conectar, anti-rebinding). |
| **Agotamiento de recursos** | Topes: 400 msg/s/par, imán ≤ 2048 chars/16 params, rango capa ≤ 512 hashes, cuota por ámbito con LRU, tope contenido 2⁴⁰ B, tope diario subida (propia/grupo/público). |
| **Repetición de canales viejos (congelación)** | `seq` monótona; `viejo` sin efecto; `ts` ≤ 24 h futuro; preguntar a varios pares + espejo y quedarse con `seq` máxima; no bajar nunca de `seq` vista. |
| **Clave de contenido filtrada / miembro expulsado** | Clave por versión: al expulsar, publicar versión nueva con clave nueva. No hay secreto retroactivo. |
| **Sellado mal usado (nonce repetido)** | API crea la clave y no deja elegir nonce; clave de un solo contenido+versión. |

### Lo que NUNCA se sirve en público
1. **Ámbito `privado`** — solo neuronas de la misma cuenta (y relés permitidos explícitamente).
2. **Ámbito `grupo`/`comunidad`** — solo miembros del grupo/comunidad (id enjambre = HMAC secreto).
3. **Claves de contenido** — nunca en imán, semilla, anuncio, canal; solo en sobre por destinatario (`recipient-crypto`).
4. **Nombre/MIME de contenido no público** — van en `meta` sellada (base64).
5. **Pesos de capas sin pasar evaluación** — solo se activa tras umbral `exactitud_dorado`; canal decide qué hay disponible, no qué se activa.
6. **Datos de donantes (Stripe)** — solo importe/estado/moneda en `metageminis_donaciones`; Stripe guarda lo personal.
7. **URL del túnel Cloudflare de MetaGenesis** — solo la leen miembros (`es_metagenesis()`); nunca se imprime ni guarda fuera de `metagenesis_motor`.
8. **Capacidades de nodo sin medir** — `tokS`/`voz`/`bitnet` solo si hay medidas reales; `null` = «sin medir», nunca se inventa.
9. **Réplica única de lo principal** — **regla dura**: todo lo fijado (`fijado=true`) en ámbito `propio`/`cuenta` debe tener ≥ 1 réplica en otro medio (otra neurona, servidor propio, espejo verificado). La Maggabox **nunca** es medio único de nada principal.

---

## 4. Referencias de código (grep exacto)

| Concepto | Archivo:línea |
|----------|---------------|
| `NeuronCapabilities.storageQuotaGb` | `src/lib/neurons/neurons.ts:92` |
| `NeuronSettings.offerStorage` | `src/lib/neurons/neurons.ts:233` |
| `DestinoAlmacen` + `destinosDe()` | `src/lib/malla/cristal/destinos-almacen.ts:1-53` |
| `Semilla` + `leerSemilla()` | `src/lib/enjambre/semilla.ts:28-94` |
| `AlmacenTrozos` + `AlmacenBase` | `src/lib/enjambre/almacen.ts:44-247` |
| `AlmacenOPFS` (app) | `src/lib/enjambre/almacen.ts:302-390` |
| `FuenteEspejo` + anti-SSRF | `architecture/enjambre-datos.md:169-181` |
| `CapacidadesNodo` + `crearFichaNodo()` | `src/lib/network/capacidades-nodo.ts:27-224` |
| `fuentesCapasReales()` | `src/lib/malla/puerta/capas-fuentes.ts:77-108` |
| `relevo-capa.ts` (Rust) | `src/lib/nativa/relevo-capa.ts:6-7` |
| `planificador.ts` (capas por nodo) | `src/lib/astraura/capas/planificador.ts:103` |
| `/api/neurons/hermione/bridge` | `src/app/api/neurons/hermione/bridge/route.ts:85,89` |
| `/api/neurons/hermione/sync-capabilities` | `src/app/api/neurons/hermione/sync-capabilities/route.ts:15` |
| `/api/mando/servidor` | `src/app/api/mando/servidor/route.ts:2` |
| `/api/mando/almacenamiento` | `src/app/api/mando/almacenamiento/route.ts:4` |
| `metagenesis_motor` tabla | `supabase/migrations/20261010100000_metagenesis_motor.sql:24` |
| `metageminis_*` tablas | `supabase/migrations/20261011090000_metageminis.sql:29-200` |
| `neuron_devices` tabla | `supabase/migrations/20260712090100_missing_core_tables_spaces.sql:357` |
| Política privacidad ámbitos | `src/lib/network/capacidades-nodo.ts:270-282` |
| Réplica obligatoria (diseño) | `architecture/enjambre-datos.md:155-156, 198-204` |