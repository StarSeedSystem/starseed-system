# Vínculo entre cuentas con consentimiento (Ola 370)

> **SOP de la Ola 370 (2026-09-26/27).** Fuente de verdad del subsistema que deja que las
> neuronas de DOS CUENTAS DISTINTAS se vinculen, con consentimiento explícito de ambos lados, y
> compartan datos/IA/archivos por un canal P2P directo. Léelo antes de tocar
> `supabase/migrations/20260926190000_os_mesh_vinculos.sql`,
> `src/lib/network/vinculos-entre-cuentas.ts`, `vinculos-transiciones.ts`, `par-crypto.ts`,
> `par-signaling.ts`, o la sección «Vínculos» de `malla-neuronas-panel.tsx`.
>
> Continúa el trabajo de `architecture/malla-neuronas-autovinculo.md` (Ola 366), que dejó el
> botón «Solicitar vínculo» deshabilitado a propósito porque vincular dos CUENTAS exige
> consentimiento — a diferencia del auto-vínculo silencioso entre neuronas de la MISMA cuenta,
> que se apoya en la sesión soberana compartida y no lo necesita.

## 0. El problema que resuelve

El radar de «neuronas cercanas» (Ola 366) solo mostraba faros anónimos de otras cuentas —
detección pasiva, sin forma de hacer nada con ella. Esta ola construye el flujo completo:
**pedir → conceder permisos → conectar P2P cifrado → hablar** entre dos cuentas soberanas
distintas, sin que ningún dato de la relación pase en claro por el servidor ni por un tercero.

## 1. Modelo de datos — `os_mesh_vinculos`

Migración: `supabase/migrations/20260926190000_os_mesh_vinculos.sql`. **No aplicada por este
agente** — es la fuente de verdad SQL, a aplicar en `nxstilnyidvkqeosofuh` vía la Management API
por quien revise esta ola. Aditiva e idempotente (`create table if not exists`, `drop function
if exists` + recreate, publicación de Realtime comprobada antes de añadir).

Una fila = una relación `(de_owner, de_device) → (a_owner, a_device)`:

| Columna | Para qué |
|---|---|
| `estado` | `'pendiente' \| 'aceptado' \| 'rechazado' \| 'revocado'` — máquina de estados (ver §1.2) |
| `mensaje` | Texto opcional del solicitante, ≤280 caracteres |
| `permisos_solicitados` / `permisos` | `{ia, archivos, capacidades}` — lo que se PIDIÓ vs. lo que el receptor CONCEDIÓ al aceptar (pueden diferir; el receptor manda) |
| `sal` | HKDF salt aleatoria por vínculo (hex, no secreta), generada por el servidor al solicitar |
| `de_pub` / `a_pub` | Clave pública ECDH P-256 (JWK) de cada dispositivo, publicada al solicitar/aceptar |
| `buzon_de` / `buzon_a` | Buzón de RESPALDO de señalización WebRTC (HMAC-firmada), acotado a 40 entradas |

Índices: por `de_owner`, por `a_owner`+`estado`, por `estado`, y uno específico para el
anti-flood (`de_owner, de_device, created_at desc`).

### 1.1 Cómo sabe el solicitante quién es `a_owner`

El radar de faros (`os_mesh_relay`, `kind='beacon'`) ya es de lectura pública para cualquier
autenticado (`channel='public'`) — su columna `owner_id` es, por tanto, técnicamente legible por
cualquier cliente que decida seleccionarla; la app hoy simplemente no la pide en
`pullBeacons()`, pero eso es una CONVENCIÓN de la app, no un límite de RLS (ver §4, fuga de
metadatos). Por eso `solicitar_vinculo` resuelve `a_owner` **del lado del servidor**, a partir
del faro fresco (`payload->>'sid' = p_a_device`, `created_at > now() - 4 min`) — el cliente
nunca necesita leer `owner_id` para pedir un vínculo, así que la convención de la app se mantiene
intacta aunque no se endurece la RLS ya existente de `os_mesh_relay` (fuera de alcance de esta
ola).

### 1.2 Máquina de estados

`pendiente → aceptado | rechazado`, y desde `pendiente` o `aceptado` → `revocado` en cualquier
momento. `rechazado`/`revocado` son terminales.

- Solo el **receptor** (`a_owner`) puede aceptar/rechazar, y solo una vez (`where estado =
  'pendiente'` en el `update`).
- **Cualquiera** de los dos lados puede revocar una solicitud pendiente o un vínculo activo.

Mirror puro en TypeScript, para poder probar la regla sin base de datos y para que la UI decida
qué botones mostrar sin adivinar (mismo patrón que `decidirAutovinculo` en `malla-neuronas.ts`):
`src/lib/network/vinculos-transiciones.ts` — `puedeTransicionar`, `siguienteEstado`,
`esEstadoTerminal`, `rolEnVinculo`, más los espejos puros del anti-flood
(`demasiadasSolicitudesRecientes`, `LIMITE_SOLICITUDES_POR_HORA = 10`), del chequeo de duplicado
(`yaExisteVinculoActivo`) y de la ventana de frescura del faro (`faroSuficientementeFresco`,
`FRESCURA_FARO_MS = 4 min`). **Si algún día diverge de la migración, la migración tiene razón** —
se actualiza este archivo para que coincida, nunca al revés.

### 1.3 Escritura: solo por 4 funciones SECURITY DEFINER

Mismo patrón que `approve_group_membership`/`reject_group_membership`
(`20260805220000_group_join_approval.sql`): la tabla **no tiene política de INSERT/UPDATE/DELETE
para `authenticated`**, así que un intento directo desde el cliente queda bloqueado por RLS (0
filas, sin excepción ruidosa). Cada función comprueba `auth.uid()` internamente y solo
transiciona la fila exacta que le corresponde — RLS no necesita saber nada de la máquina de
estados. La LECTURA sí es una política RLS normal: `auth.uid() = de_owner or auth.uid() =
a_owner` (ninguna fila es pública).

- **`solicitar_vinculo(p_a_device, p_de_device, p_mensaje, p_permisos, p_de_pub)`** — resuelve
  `a_owner` por el faro fresco, aplica el anti-flood (§5), rechaza duplicados activos, genera la
  `sal`, inserta en `pendiente`.
- **`resolver_vinculo(p_vinculo_id, p_estado, p_permisos, p_a_pub)`** — el receptor acepta
  (exige `p_a_pub`) o rechaza; solo si sigue `pendiente` y `a_owner = auth.uid()`.
- **`revocar_vinculo(p_vinculo_id)`** — cualquiera de los dos lados, desde `pendiente` o
  `aceptado`.
- **`enviar_senal_vinculo(p_vinculo_id, p_senal)`** — apéndice al buzón de respaldo (solo con el
  vínculo ya `aceptado`; recorta a 40 entradas; límite de tamaño de señal 8 KiB).

### 1.4 Realtime

Mismo arreglo que `20260803120000_realtime_os_mesh_relay.sql`: sin ser miembro de
`supabase_realtime`, un canal `postgres_changes` sobre esta tabla nunca recibiría eventos. Se
añade de forma idempotente (comprobación previa) + `replica identity full` (para que un UPDATE
—aceptar/rechazar/revocar/buzón— lleve la fila completa). **Nota de alcance:** el motor
(`useVinculosEntreCuentas`, §3) hoy **sondea** esta tabla cada `POLL_MS=8s` en vez de suscribirse
a `postgres_changes` — la publicación ya está lista para ese salto, pero conectarla queda como
mejora natural siguiente (ver §7).

## 2. Secreto de par y señalización — sin que nada viaje en claro

### 2.1 Derivación del secreto (`par-crypto.ts`)

```
ECDH P-256 (un par por DISPOSITIVO, persistente)  →  HKDF-SHA256(sal del vínculo)  →  claveParHex
```

- Cada dispositivo genera **un** par ECDH P-256 la primera vez que lo necesita, y lo **reutiliza
  para todos sus vínculos** — lo que cambia por vínculo es la `sal` (aleatoria, generada por el
  servidor al solicitar), no el par de claves.
- La clave **privada** se genera con `extractable: false` — WebCrypto aplica esto solo a la
  mitad privada de un par asimétrico (la pública es siempre exportable, por diseño de la
  especificación, sin necesidad de pedirlo aparte). Se guarda como `CryptoKey` nativo en
  **IndexedDB** (`AlmacenParClaves`, inyectable): es el único almacén del navegador que admite un
  `CryptoKey` no extraíble vía structured clone — `localStorage` exige JSON, que exigiría
  exportarla, y eso es justo lo que se quiere evitar. Sin IndexedDB (o sin WebCrypto), degrada
  honestamente a un par en memoria de la sesión (se pierde al recargar; documentado, no fingido).
- La clave **pública** (JWK) se publica en la fila del vínculo (`de_pub`/`a_pub`) — no es dato
  sensible, solo permite a QUIEN YA CONOCE la fila derivar el mismo secreto junto con su propia
  privada.
- Con la pública del OTRO lado + la `sal` de la fila, **ambos lados derivan el mismo secreto**
  (propiedad ECDH): `deriveBits(ECDH, miPriv, suPub) → HKDF-SHA256(salt=sal, info fija) → 256
  bits`, codificados en hex (`claveParHex`). Verificado por test: dos pares de claves simulando
  los dos lados llegan al mismo hex con la misma `sal`, y a un hex DISTINTO con una `sal`
  distinta.

Contraste deliberado con el patrón ya existente en el repo: `recipient-crypto.ts` (cifrado E2E
del relé) guarda su par como JWK **extraíble** en `localStorage` porque resuelve una amenaza
distinta; aquí se pidió explícitamente que la privada de emparejamiento sea **no extraíble** — un
paso más fuerte, y por eso un módulo deliberadamente independiente en vez de reutilizar aquel.

### 2.2 Topic del canal (`topicDePar`)

`starseed-par-<hash>`, donde `<hash>` son los primeros 24 caracteres hex de
`SHA-256(claveParHex)`. Determinista (los dos lados llegan al mismo topic con la misma clave) y
distinto por vínculo (la clave lo es, porque la `sal` lo es) — nadie que no conozca el secreto de
par llega a adivinar ese nombre de canal.

### 2.3 Autenticación de cada señal — HMAC-SHA256 (`par-signaling.ts`)

Supabase Realtime **no impone autorización por canal** en este proyecto (no hay `realtime.messages`
con RLS configurada) — un topic no adivinable ya es una barrera, pero no es la única: **cada
mensaje de señalización (oferta/respuesta/ICE) se firma con HMAC-SHA256(claveParHex)** sobre su
serialización canónica (`canonicalizar()`, orden de campos fijo — nunca `JSON.stringify` de un
objeto reconstruido, cuyo orden no está garantizado entre motores). El receptor:

1. Verifica el HMAC sobre los **bytes recibidos tal cual** (nunca reconstruidos) con
   `crypto.subtle.verify` (comparación en tiempo constante del lado del motor).
2. Solo si verifica, parsea el payload a `Signal`.
3. Una señal que no verifica se **descarta silenciosamente**, nunca se procesa "por si acaso".

`send()` **nunca** manda una señal sin firmar: si el HMAC no se pudo calcular (sin WebCrypto, sin
clave), devuelve `false` en vez de arriesgarse a mandarla en claro.

### 2.4 Dos transportes, misma degradación honesta que `signaling.ts`

1. **Preferido** — Supabase Realtime *broadcast* en el topic derivado (`channel.subscribe`, con
   timeout de 4s antes de caer al fallback).
2. **Fallback** — el buzón de la propia fila (`os_mesh_vinculos.buzon_de`/`buzon_a`): se
   **escribe** por la RPC `enviar_senal_vinculo` (la tabla no admite UPDATE directo) y se **lee**
   con un `select` normal (RLS ya deja a los dos participantes leer su propia fila), sondeado
   cada 2,5s. Deduplicado localmente por identidad de payload (el servidor no borra lo ya leído,
   solo recorta a 40 entradas).

### 2.5 Reutilización de `webrtc-mesh.ts` — `createMesh`

El requisito de reusar la negociación WebRTC ya endurecida (Ola 366: glare cortés/descortés,
buffer de ICE antes de la oferta, reintento con backoff) sin tocar el mesh compartido
intra-cuenta se resolvió **extrayendo el núcleo**: `initMesh(myDeviceId, userId)` (la firma
pública que ya usaba el mesh compartido) pasa a ser un envoltorio fino sobre
`createMesh(myDeviceId, contextId, transport: SignalTransport)`, donde `transport` es
`{send, subscribe}`. `initMesh` sigue construyendo el mismo transporte de siempre
(`sendSignal`/`subscribeSignals` de `signaling.ts`); el motor de vínculos (§3) llama a
`createMesh` directamente con `crearTransporteSenalPar(...)` como transporte — **un `MeshHandle`
dedicado por vínculo**, nunca el mesh compartido. Verificado con la suite completa de
`webrtc-mesh.test.ts`/`signaling.test.ts`/`malla-neuronas.test.ts` sin cambios de comportamiento
(29/29 antes de sumar los tests nuevos de esta ola).

## 3. El motor — `useVinculosEntreCuentas` (`vinculos-entre-cuentas.ts`)

Montado **una sola vez**, junto a `useMallaNeuronas`, en `MallaNeuronasMount` — mismo patrón, con
un mesh COMPLETAMENTE separado del intra-cuenta.

Cada `POLL_MS = 8s`:
1. Lista mis filas de `os_mesh_vinculos` (`de_owner = yo` o `a_owner = yo`), las publica en el
   store de módulo que lee `useVinculos()`.
2. Por cada fila `estado = 'aceptado'` con la clave pública del OTRO lado ya presente: deriva
   `claveParHex` → `topic` → abre un `MeshHandle` dedicado (`createMesh` + `crearTransporteSenalPar`)
   si no existe ya uno para ese `vinculoId`, y llama a `connectToDevice`.
3. Cierra el `MeshHandle` de cualquier vínculo que ya no siga `aceptado` (revocado desde
   cualquier lado, por ejemplo).
4. Publica los peers activos (`useVinculosPeers()`/`vinculosActivos()`) con su estado de canal
   (`conectado`/`conectando`/`fallido`/`sin-vinculo`) y latencia.

**Heartbeat de latencia**: protocolo reservado `{t:"vinculo:hb", at}` / `{t:"vinculo:hb-ack", at}`
sobre el data channel de cada vínculo, cada 30s — mismo patrón que el heartbeat de ficha de
`malla-neuronas.ts`. Cualquier otro payload (JSON con otra forma, o texto plano) se reenvía tal
cual a `onMensajeDePar` — es el mensaje de OTRA capa (relé de IA, archivos), nunca interpretado
aquí.

`refrescarVinculosAhora()` fuerza un sondeo inmediato (sin esperar `POLL_MS`) — la UI la llama
justo después de solicitar/aceptar/rechazar/revocar, para que el panel refleje el cambio al
instante en vez de esperar hasta 8s.

## 4. API para otras capas (relé de IA, transferencia de archivos)

Expuesta por `src/lib/network/vinculos-entre-cuentas.ts`, para que las otras dos áreas de la Ola
370 (relé de IA sobre la malla, transferencia P2P de archivos) reutilicen el canal ya abierto de
un vínculo aceptado, sin abrir uno propio:

```ts
// Lectura reactiva (componentes React) y síncrona (código no-React: relé, motor de archivos).
useVinculosPeers(): PeerVinculo[]
vinculosActivos(): PeerVinculo[]
// PeerVinculo: { vinculoId, deviceId, ownerOtro, permisos: {ia, archivos, capacidades}, canal, latenciaMs? }

// Envío/recepción por el canal YA abierto de un vínculo (nunca abre uno nuevo).
enviarAPar(vinculoId: string, data: string): boolean
onMensajeDePar(cb: (vinculoId: string, data: string) => void): () => void  // devuelve unsubscribe
```

**Responsabilidad del llamador**: cada capa comprueba ELLA MISMA `permisos.ia`/
`permisos.archivos` antes de usar el canal — este módulo no impone el permiso en el transporte
(mismo principio que `capaMeshCompartiendo()`, que la impone el LLAMADOR de
`setupConcienciaSync`, no `webrtc-mesh.ts`). `enviarAPar` devuelve `false` sin lanzar si el
vínculo no existe o el canal no está abierto — nunca abre uno nuevo por su cuenta (eso lo decide
únicamente el motor, al ver `estado='aceptado'`).

**Colisión reservada**: un mensaje con la forma exacta `{t:"vinculo:hb"}`/`{t:"vinculo:hb-ack"}`
es interceptado por el heartbeat de este módulo y nunca llega a `onMensajeDePar` — otras capas no
deben usar esa forma para su propio protocolo.

## 5. UI — `malla-neuronas-panel.tsx`

Mobile-first, iconos lucide, `cursor-pointer`, sin emojis (mismo estilo que el resto del panel).

- **Radar de cercanas** (`CercanaRow`): el botón «Solicitar vínculo», antes deshabilitado a
  propósito (Ola 366), ahora se **habilita solo si el faro trae `syncId`** (el `syncDeviceId` del
  otro lado — sin él no hay con qué pedir el vínculo). Al pulsar, abre
  `SolicitarVinculoDialog`: mensaje opcional (≤280) + casillas de permisos (IA / archivos /
  capacidades), todas OFF por defecto.
- **Solicitudes entrantes** (`VinculoEntranteCard`): tarjeta tipo notificación, «`<etiqueta>`
  quiere vincularse contigo», con el mensaje entre comillas si lo hay, y **Aceptar** (abre
  `AceptarVinculoDialog` — el receptor elige SUS PROPIOS permisos, independientes de lo pedido) /
  **Rechazar**.
- **Vínculos con otras cuentas** (`VinculoRowItem`, sección `VinculosSection`): lista con estado
  (`EstadoVinculoBadge`), permisos concedidos (`ResumenPermisos`) y, si está `aceptado`, el estado
  de la conexión P2P («conectado · N ms» / «conectando» / «fallido»), más **Revocar**.
- Tercera pestaña «Vínculos (N)» en el panel, con una insignia ámbar del número de solicitudes
  entrantes pendientes.
- **Las etiquetas respetan la privacidad del otro lado** (anónimo por defecto, mismo criterio que
  el resto del radar) — el vínculo no revela más identidad de la que el faro ya exponía.

Cada acción (solicitar/aceptar/rechazar/revocar) llama a `refrescarVinculosAhora()` justo después
de la RPC, para que la UI no espere el próximo sondeo del motor.

## 6. Modelo de amenazas

| Amenaza | Mitigación | Límite honesto |
|---|---|---|
| **Suplantación** (alguien firma como si fuera el otro dispositivo) | El secreto de par se deriva por ECDH de las privadas NO EXTRAÍBLES de cada lado — nadie que no tenga la privada real de un dispositivo puede derivar `claveParHex` ni, por tanto, firmar HMAC válidos para ese vínculo. | La PRIMERA vez que se publica `de_pub`/`a_pub` no hay verificación fuera de banda de que esa clave pertenece a quien dice — como con casi todo emparejamiento por clave pública sin PKI (TOFU: *trust on first use*). Fuera de alcance de esta ola. |
| **Inyección de señales** (un tercero manda ofertas/ICE falsas al canal) | Topic no adivinable (`sha256(claveParHex)`) + HMAC-SHA256 obligatorio en cada mensaje — una señal sin firma válida se descarta ANTES de tocar `webrtc-mesh.ts`. | Ninguno conocido dentro del alcance: sin la clave, ni el topic ni la firma son alcanzables. |
| **Fuga de metadatos** (quién se vinculó con quién, cuándo) | La tabla es de lectura RLS estricta (`de_owner`/`a_owner` únicamente) — nadie fuera del vínculo ve la fila. | `os_mesh_relay.owner_id` (el faro que resuelve `a_owner`) es de lectura pública para cualquier autenticado por su RLS YA EXISTENTE (`channel='public'`, ver §1.1) — esta ola no la endurece porque está fuera de su alcance (afecta a todo el subsistema de faros, no solo a los vínculos); se documenta aquí para que la próxima ola que toque `os_mesh_relay` lo sepa. |
| **Solicitudes de spam** | `solicitar_vinculo` cuenta las solicitudes del MISMO `de_device` en la última hora y corta a partir de 10 (`LIMITE_SOLICITUDES_POR_HORA`) — es la comprobación de la propia RPC, NO una política RLS aparte (no puede haber una: no existe INSERT directo que una RLS pudiera vigilar; toda escritura pasa por esta función, así que es el punto de aplicación natural). | El tope es por dispositivo emisor, no por cuenta — una cuenta con muchas neuronas tiene, en la práctica, un tope agregado más alto. Deliberado (mismo espíritu que el resto de topes del repo: generoso, corta bucles, no estorba el uso normal). |
| **Repetición de una señal ya usada** | Cada `Signal` lleva `nonce`; el receptor deduplica por nonce visto (recorte a 256, igual que `signaling.ts`). | — |

## 7. Qué falta / mejoras naturales siguientes

- **Realtime sobre la propia tabla**: el motor sondea `os_mesh_vinculos` cada 8s en vez de
  suscribirse a `postgres_changes` (la publicación ya la incluye, lista para ese salto) —
  recortado por alcance/esfuerzo de esta ola, no por límite técnico.
- **TURN**: sigue sin haberlo (mismo límite heredado de `webrtc-mesh.ts`/Ola 366) — un NAT
  simétrico en ambos lados puede impedir la conexión P2P del vínculo igual que el mesh
  intra-cuenta.
- **Verificación fuera de banda de la clave pública** (TOFU, ver §6): no implementada.
- **Endurecer la RLS de `os_mesh_relay.owner_id`**: fuera de alcance de esta ola (afecta a todo
  el subsistema de faros).

## 8. Tests

- `src/lib/network/__tests__/vinculos-transiciones.test.ts` — máquina de estados pura, anti-flood,
  duplicado, frescura del faro (15 tests).
- `src/lib/network/__tests__/par-crypto.test.ts` — derivación ECDH mutua (mismo hex en ambos
  lados), distinción por `sal`, manejo de claves inválidas, determinismo/distinción de topic,
  HMAC firmar/verificar/manipulado/clave equivocada/firma inválida (9 tests).
- `src/lib/network/__tests__/par-signaling.test.ts` — entrega por Realtime simulado, caída al
  buzón de respaldo cuando Realtime no llega a `SUBSCRIBED`, rechazo de una señal sin firmar o con
  firma de otra clave (7 tests).
- `src/components/network/__tests__/malla-neuronas-panel-vinculos.test.tsx` — botón habilitado
  solo con `syncId`, diálogo de solicitud con mensaje+permisos, tarjeta entrante con
  aceptar/rechazar, diálogo de aceptación con permisos propios, vínculo activo con estado de canal
  + revocar, sección honesta sin filas (7 tests). Estas pruebas envuelven el panel en
  `AppearanceProvider` (igual que `dialogo-instalar.test.tsx`): `DialogContent`
  (`@/components/ui/dialog.tsx`) llama a `useAppearance()` en su propio render, incluso con el
  diálogo cerrado, así que cualquier prueba que monte el panel con un `Dialog` en su árbol
  necesita ese contexto — y, sin `globals: true` en `vitest.config.ts`, cada archivo de prueba de
  componentes debe llamar `cleanup()` en su propio `afterEach` (si no, el árbol de una prueba
  queda en el DOM y contamina las consultas por texto/rol de la siguiente).

Resultado verificado en esta ola: **135 tests / 15 archivos en verde**
(`src/lib/network src/components/network`) y `tsc --noEmit -p .` limpio. `next build` **no** se
ejecutó (regla del área: nunca con el enjambre vivo / nunca en esta sesión de agente).

## 9. Qué necesita dos cuentas/dispositivos reales para verificarse

Todo lo anterior se verificó con tests unitarios (WebCrypto real en Node 20, dobles de
Supabase/Realtime/WebRTC) y lectura de código — **nunca** con:
- La migración aplicada de verdad contra `nxstilnyidvkqeosofuh` (RLS, las 4 RPC,
  `solicitar_vinculo` resolviendo un faro real).
- Dos cuentas reales distintas completando el flujo solicitar → aceptar → conectar P2P → hablar.
- Entrega real de broadcast de Supabase Realtime entre dos navegadores/dispositivos distintos
  (el fallback de buzón sí quedó cubierto por RPC real solo en el sentido de que la función SQL
  existe y fue revisada, no ejecutada).
- Comportamiento real de ICE/NAT (con o sin TURN) entre dos redes distintas para un vínculo entre
  cuentas.
