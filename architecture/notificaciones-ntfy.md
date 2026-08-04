# 📡 SOP — Notificaciones push por dispositivo con ntfy

> Fuente técnica primaria: `claude/investigacion-tecnica-ntfy-2026-08-04.md` (Proyecto StarSeed,
> Drive/claude.ai) — investigación verificada el 2026-08-04 contra `docs.ntfy.sh` (fuente markdown
> oficial, rama `main`) y comprobación empírica de CORS/límites contra `https://ntfy.sh` con `curl`.
> Este SOP resume esa investigación en forma de contrato de implementación para el OS.

## 0. Objetivo

El OS ya tiene un sistema de notificaciones **in-app** (`src/lib/notifications/app-notify.ts`,
`AppNotifyBridge`, `NotificationsProvider`) con cuatro piezas: (1) el **Centro de Notificaciones**
persistido (`starseed.notifications.v1`, contexto `useNotifications`), (2) **popups/toasts** no
intrusivos (sonner), (3) un **puente `postMessage`** para que apps embebidas (iframe) notifiquen lo
suyo, y (4) **permisos por-app** (`starseed.apps.notify-prefs.v1`). Todo eso vive **dentro de la
pestaña del navegador**: si el usuario no tiene el OS abierto, no se entera de nada.

**ntfy añade una quinta pieza: push real por dispositivo.** Un canal pub-sub HTTP (FOSS,
autohospedable) que entrega avisos aunque el navegador esté cerrado (móvil, escritorio con la app de
ntfy, u otra pestaña). No sustituye el sistema in-app: se **espeja** hacia él (`notifyFromApp()`), así
que todo mensaje de ntfy que llega también aparece en `/notifications` si el usuario lo permite. Encaja
con las invariantes del proyecto (CLAUDE.md §6): Código Abierto absoluto, Identidad Soberana (el
usuario decide servidor y token), Privacidad ↔ Transparencia dual.

## 1. Qué es ntfy (hechos verificados)

- Pub-sub sobre HTTP simple: `POST`/`PUT` a `https://ntfy.sh/<topic>` (o el propio servidor)
  publica; cualquier suscriptor de ese tópico (app Android/iOS, navegador, `curl`, otro backend) lo
  recibe. Los tópicos **no se crean**: aparecen en cuanto alguien publica o se suscribe.
- FOSS, licencia dual Apache-2.0 + GPLv2. Autor: Philipp C. Heckel (`binwiederhier/ntfy`). Binario Go
  estático, ligero (128–300 Mi RAM recomendados) — cabe en una Raspberry Pi, NAS o mini-servidor casero.
- **Nombres de tópico**: solo `[-_A-Za-z0-9]`, máx. 64 caracteres. Los tópicos derivados de este OS
  (`ss-<hex16>`, ver §3) encajan de sobra.
- **"El tópico es la contraseña"** (cita literal de la doc oficial): sin ACL, cualquiera que conozca o
  adivine el nombre exacto puede leer y publicar. `ntfy.sh` público es así por defecto — verificado en
  vivo publicando a un tópico corto obvio y recibiendo mensajes reales de terceros en segundos.
- **CORS totalmente abierto**, confirmado por `curl -X OPTIONS https://ntfy.sh/mytopic`:
  `access-control-allow-origin: *`, `access-control-allow-methods: GET, PUT, POST, PATCH, DELETE`,
  `access-control-allow-headers: *`. Publicar y suscribirse (`fetch`, `EventSource`, `WebSocket`) desde
  el navegador funciona sin proxy backend, tanto en `ntfy.sh` como (por defecto) en self-host.
- Límites gratuitos de `ntfy.sh` anónimo (orientativos, pueden cambiar): 250 mensajes/día, 60
  peticiones de ráfaga + 1/5s por IP, adjuntos ≤2 MB. Sirve bien para desarrollo o avisos no sensibles;
  para uso serio de cuenta, self-host (§6).

## 2. Arquitectura — cliente + espejo al sistema in-app

Todo vive en **`src/lib/notifications/ntfy.ts`** (cliente único, "use client", SSR-safe, nunca lanza):

```
NtfySettings (localStorage starseed.ntfy.settings.v1)
        │
        ├── deriveTopic() / accountTopicFor() / deviceTopicFor()  ──▶ tópicos no adivinables (§3)
        ├── resolveNtfyTopics()                                   ──▶ deriva + CACHEA en settings
        ├── publish(input)            ──▶ POST JSON a la RAÍZ del servidor (§4)
        ├── subscribe(topics, cb)     ──▶ EventSource SSE + espejo a notifyFromApp() (§5)
        ├── startNtfyBridge()         ──▶ arranca el puente cuenta+neurona (idempotente)
        └── testNtfy()                ──▶ publish() de prueba, para el botón del panel
```

El **espejo** ocurre dentro de `subscribe()`: cada mensaje `event==="message"` recibido, si
`settings.mirrorToInApp` está activo, se traduce a un `notifyFromApp({appId:"ntfy", title, body:
message, level, dedupeKey: id, popup:true})` — usa el `id` de ntfy (aleatorio por mensaje) como
`dedupeKey`, así que una reconexión SSE que re-entregue el mismo mensaje no duplica el aviso en el
Centro. La UI vive en **`src/components/notifications/ntfy-panel.tsx`** (`NtfyPanel`), un panel de
Ajustes puro (sin lógica de red propia: todo delega en `ntfy.ts`).

**Lo que falta para que esto funcione en producción — cableado pendiente** (fuera del alcance de esta
ola, que solo entrega el cliente + el panel):

1. **Montar el panel** en Ajustes: `src/app/(app)/cuenta/page.tsx`, dentro de la sección
   `<section id="notificaciones">` (línea ~886), justo después de `<AppNotificationsPanel />`
   (línea 907) — mismo patrón, mismo sitio.
2. **Montar el puente global**: crear un componente sin UI análogo a `AppNotifyBridge`
   (`src/components/notifications/app-notify-bridge.tsx`) que llame a `startNtfyBridge()` en un
   `useEffect` y lo desmonte al limpiar, y añadirlo en `src/app/layout.tsx` junto a
   `<AppNotifyBridge />` (línea ~271) — mismo patrón (bridge "sin UI hasta que hace falta").

## 3. Tópicos: cuenta y neurona (derivación no adivinable)

- **Tópico de cuenta** (`accountTopicFor(accountId)`): recibe todo lo que se publique para la cuenta,
  desde cualquier neurona. Es el que el usuario pega en la app móvil de ntfy para "recibir todo".
- **Tópico de neurona** (`deviceTopicFor(accountId, deviceId)`): dirigido a UN dispositivo concreto
  (namespaced por cuenta **y** dispositivo, para que cambiar de cuenta en el mismo aparato no reutilice
  el tópico de la cuenta anterior).
- **Derivación**: `deriveTopic(seed, salt) = "ss-" + SHA-256(seed·salt).hex.slice(0,16)`, vía
  `crypto.subtle.digest`. Nunca se usan `accountId`/email/username en claro como nombre de tópico (el
  nombre del tópico ES la contraseña de lectura/escritura sin ACL — §1).
- **Caché**: `resolveNtfyTopics()` deriva UNA vez y guarda el resultado en
  `NtfySettings.accountTopic` / `NtfySettings.deviceTopics[deviceId]`, para no recalcular el hash (y no
  reabrir SSE innecesariamente) en cada render.
- **⚠️ Honestidad — esto NO es la derivación ideal.** La investigación de referencia (§ recomendación
  de arquitectura) propone **HMAC-SHA256 con un secreto de servidor que nunca llega al navegador**,
  resuelto por un Route Handler que valida la sesión de Supabase y solo entonces calcula/devuelve el
  tópico:
  ```
  topic_cuenta   = "acct-" + hmac_sha256(SERVER_SECRET, accountId).slice(0, 32)
  topic_neurona  = "dev-"  + hmac_sha256(SERVER_SECRET, accountId + ":" + deviceId)
  ```
  Lo implementado aquí es **SHA-256 plano en el cliente** (sin secreto): más simple, cero backend
  nuevo, pero significa que quien conozca el `accountId` (uuid interno) **y** este algoritmo público
  podría recalcular el mismo tópico. El uuid v4 (~122 bits) no es trivial de adivinar a fuerza bruta —
  esto no es tan débil como un nombre de tópico elegido a mano — pero no es una garantía criptográfica
  de secreto. Migrar a la derivación HMAC server-side queda documentado como mejora futura (§11), no
  implementada en esta ola.

## 4. Publicar: navegador (CORS abierto) vs backend

- **Modo JSON** (el que usa `publish()`): `POST` a la **RAÍZ** del servidor —
  `https://ntfy.sh` o `https://ntfy.sh/`, **nunca** `https://ntfy.sh/<topic>` — con
  `Content-Type: application/json` y body `{topic, title, message, priority, tags, click, ...}`. Es el
  único campo obligatorio `topic`.
- Gracias al CORS abierto (§1), esto se hace **directo desde el navegador** con `fetch`, sin pasar por
  el backend Next.js — no añade carga al servidor de la app.
- **Auth**: si hay `NtfySettings.token`, viaja como `Authorization: Bearer tk_...` en la cabecera (la
  petición normal SÍ puede fijar cabeceras; solo `EventSource`, en suscripción, no puede — ver §5).
- **Nivel → prioridad/etiqueta**: `publish()` traduce `level` (info/success/warning/error) a
  `priority` (1–5) y a un `tag` que ntfy renderiza como emoji si coincide con un
  [shortcode](https://docs.ntfy.sh/emojis/) (`error→5/rotating_light`, `warning→4/warning`,
  `success→3/white_check_mark`, `info→3/bell`). Se puede fijar `priority`/`tags` a mano para saltarse
  el mapeo.
- **Publicar desde el navegador de un usuario hacia el tópico de OTRA cuenta nunca debería pasar** —
  no hay ningún flujo en este OS que lo haga (cada neurona solo conoce y publica en los tópicos
  derivados de SU propia cuenta autenticada). El caso razonable de publicar desde el navegador es
  exactamente este: la propia cuenta, ya autenticada, publicando en su propio tópico.
- Si en el futuro se necesita publicar hacia la cuenta de un tercero (p. ej. una notificación de
  "fulano te ha mencionado" disparada por acción de otro usuario), eso debe salir del **backend**
  (Server Action / Route Handler / Edge Function) con el token del servidor — nunca embebido en JS de
  cliente. `publish()` tal como está NO cubre ese caso (ámbito: solo la propia cuenta/neurona).

## 5. Suscribirse: SSE y reconexión

- `subscribe(topics, onMessage, opts?)` abre `GET <server>/<t1>,<t2>/sse` vía `EventSource` (el
  formato recomendado por ntfy para navegador; hay también `/json`, `/ws` y `/raw`, no usados aquí).
- **Auth con `EventSource`**: como no permite fijar cabeceras, el token viaja en la query
  `?auth=<base64 de "Bearer tk_...", SIN el '=' de relleno>` — construido con
  `btoa(...).replace(/=+$/, "")`. Es el único método viable documentado para SSE en navegador.
- Se filtra `event==="message"` (se ignoran `open`/`keepalive`/`message_delete`/`message_clear`/
  `poll_request`). Cada mensaje válido: (a) se espeja a `notifyFromApp` si `mirrorToInApp` (§2), (b) se
  entrega al callback del llamador.
- **Reconexión con backoff exponencial** (2 s → 4 s → 8 s → 16 s → 30 s, tope 30 s) si `onerror`
  dispara — cubre caídas de red, reinicios del servidor propio, etc. `attempt` se resetea a 0 en
  `onopen`. La función devuelta por `subscribe()` cierra la conexión y cancela cualquier reintento
  pendiente (sin fugas de `EventSource` ni de temporizadores).
- `startNtfyBridge()` compone `resolveNtfyTopics()` + `subscribe()` para el caso de uso real: recibir
  en el Centro de Notificaciones todo lo dirigido a la cuenta o a esta neurona. Reacciona a cambios de
  ajustes (reabre si cambia servidor/token/activación) y es idempotente (una sola conexión activa por
  pestaña).

## 6. Self-host vs ntfy.sh público

- **`ntfy.sh` público cachea los mensajes en texto plano en su servidor** (12h por defecto) y sus
  logs incluyen tópico + IP (lo reconoce el propio FAQ oficial). Choca con "Privacidad ↔ Transparencia
  dual" (CLAUDE.md §6) y con que la Cuenta es el "ancla legal soberana" del usuario. **No debe ser el
  canal por defecto para nada sensible** (alertas de seguridad de cuenta, contenido de mensajes
  privados, votos, ubicación…) — ver §8.
- Sirve bien para desarrollo/staging o avisos no sensibles ("tu build ha terminado") mientras no haya
  infraestructura propia lista — que es exactamente por qué `NtfySettings.server` por defecto es
  `https://ntfy.sh` y por qué `enabled` por defecto es **`false`** (opt-in explícito).
- **Self-host recomendado** (encaja con Cloud Run, ya usado como alternativa soberana del proyecto —
  CLAUDE.md §2 — o con un nodo casero/CasaOS):
  ```yaml
  # docker-compose.yml — instancia privada mínima
  services:
    ntfy:
      image: binwiederhier/ntfy
      restart: unless-stopped
      command: serve
      environment:
        NTFY_BASE_URL: https://ntfy.tudominio.com
        NTFY_CACHE_FILE: /var/lib/ntfy/cache.db
        NTFY_AUTH_FILE: /var/lib/ntfy/auth.db
        NTFY_AUTH_DEFAULT_ACCESS: deny-all   # CRÍTICO: por defecto es read-write (público total)
        NTFY_BEHIND_PROXY: "true"            # si hay reverse proxy/TLS delante
      volumes: ["./ntfy-data:/var/lib/ntfy"]
      ports: ["8093:80"]
  ```
  Con `auth-default-access: deny-all` + un token por cuenta/dispositivo (`ntfy token add` o
  `auth-tokens` declarativo), el tópico deja de ser la única barrera — defensa en profundidad, no
  fiarlo todo al secreto del nombre derivado (§3).
- No figura como app oficial de CasaOS a día de la investigación, pero al ser un único contenedor
  Docker sin dependencias exóticas se instala como cualquier stack personalizado (Portainer, Unraid,
  Synology, CasaOS "instalación personalizada").

## 7. App móvil, UnifiedPush e iOS

- **Android**: Google Play, F-Droid (build sin Firebase) o APK firmado desde GitHub Releases.
  **iOS**: solo App Store. Suscribirse a un tópico se hace dentro de la propia app (servidor + nombre
  de tópico) — el usuario pega ahí el tópico de cuenta o de neurona que copia desde `NtfyPanel`.
- **UnifiedPush (solo Android)**: ntfy puede actuar como distribuidor UnifiedPush del sistema — apps
  compatibles pueden usarlo en vez de depender de Firebase, opcionalmente contra un servidor propio.
  Instalación de un paso: elegirlo como distribuidor en la app.
- **iOS — limitación real, no solucionable solo con self-host**: Apple restringe fuertemente el
  proceso en segundo plano; es **imposible** tener push instantáneo en iOS sin un servidor central
  conectado a APNs. Un servidor self-hosted reenvía un `poll_request` (solo el ID del mensaje + el hash
  SHA-256 del tópico — **nunca el contenido**) a un servidor *upstream* (típicamente el propio
  `ntfy.sh`, vía `upstream-base-url: https://ntfy.sh`), que lo empuja por Firebase→APNs; el iPhone
  entonces hace *polling* directo al servidor propio para bajar el mensaje real. Sin
  `upstream-base-url`, self-host en iOS sigue funcionando, pero con retraso de hasta horas. Alternativa
  (proyecto aparte, no trivial): compilar y firmar una app iOS propia con certificado APNs propio.
- **Navegador (Web Push)**: ntfy soporta Web Push nativo (`ntfy.sh/app`), pero solo funciona contra
  EL MISMO servidor que sirve la web app (una identidad VAPID por origen) y exige HTTPS con certificado
  válido — no aplica directamente a "recibir en el navegador del OS mientras la pestaña está cerrada"
  salvo que se despliegue esa pieza específica (fuera del alcance de este SOP; hoy la vía soportada es
  `subscribe()` con la pestaña abierta, más las apps móviles/UnifiedPush para el resto).

## 8. Privacidad — qué NO hacer

- **No** usar `ntfy.sh` público para contenido con datos personales o sensibles. Si se usa de todos
  modos, fijar como mínimo la cabecera `Cache: no` (alias `X-Cache: no`) en esa publicación para que el
  servidor no la guarde — es una CABECERA HTTP, no un campo del body JSON ni un tag; hoy `publish()` no
  la expone como opción (ver §11), así que quien necesite este caso debe llamar a `fetch` a mano con esa
  cabecera en vez de usar `publish()`.
- **No** poner datos sensibles en `title`/`message`/`tags` en texto plano sobre el servicio público:
  preferir un mensaje genérico ("Tienes una notificación nueva") + `click` a una URL del OS que exige
  login para ver el contenido real.
- **No** reutilizar un mismo tópico global para todas las cuentas — cada cuenta y cada neurona tienen
  el suyo, derivado (§3).
- **No** confiar el control de acceso solo al secreto del nombre del tópico en un servidor propio —
  combinarlo con ACL/token real (`auth-default-access: deny-all`, §6).
- **No** dejar `auth-default-access` en su valor por defecto (`read-write`, público total) en una
  instancia privada, salvo que sea intencionadamente un tablón público.
- **No** hay hoy ningún flujo que publique desde el navegador de un usuario hacia el tópico de OTRA
  cuenta (§4) — si se añade alguno en el futuro, debe salir del backend con su propio token, nunca del
  cliente.

## 9. Integración en Ajustes

- **Panel**: `NtfyPanel` (`src/components/notifications/ntfy-panel.tsx`) — activar/desactivar,
  servidor (ntfy.sh o propio), ver/copiar tópico de cuenta y de esta neurona, token opcional,
  interruptores `publishFromBrowser`/`mirrorToInApp`, botón «Enviar prueba» (`testNtfy()`), y el aviso
  honesto de §6/§8. Ubicación prevista: sección «Notificaciones y recordatorios» de
  `src/app/(app)/cuenta/page.tsx` (ver §2, pendiente de cablear).
- **Sincronización con la cuenta (`SYNCED_KEYS`) — NO hecho todavía, y ojo con cómo se hace.**
  `starseed.ntfy.settings.v1` **no** está hoy en `SYNCED_KEYS` de `src/lib/settings-sync.ts`, ni cae en
  ningún prefijo de `SYNCED_PREFIXES` (el único es `starseed.brain.`). Esto es intencional en esta
  ola: los ajustes de ntfy son, por ahora, **por dispositivo/navegador**. Si en el futuro se quiere que
  "activé ntfy en el portátil" también aparezca activado en el móvil:
  1. Añadir `"starseed.ntfy.settings.v1"` a `SYNCED_KEYS`.
  2. **Imprescindible**: `NtfySettings.token` es un secreto (igual que `apiKey` en las integraciones —
     ver `AURORA_VOICE_SYNC_KEY` en `settings-sync.ts` como plantilla exacta a imitar). Sin este paso,
     el token de un servidor propio se subiría en texto plano a `user_settings.prefs`, repitiendo el
     antipatrón que la Adenda 68·A ya corrigió para la voz de Aurora. Hace falta una función
     `sanitizeNtfyForCloud()`/`mergeNtfyLocalSecrets()` (mismo contrato que
     `sanitizeVoiceForCloud`/`mergeVoiceLocalSecrets`) enchufada en `sanitizeForCloud()`/
     `mergeLocalSecrets()` antes de sincronizar.
  3. `deviceTopics` no necesita viajar: cada neurona deriva el suyo localmente y de forma determinista
     (mismo `accountId` + mismo algoritmo ⇒ mismo tópico en cualquier dispositivo, sin coordinación).
  Este archivo (`ntfy.ts`) deliberadamente **no** toca `settings-sync.ts` — ver instrucciones de esta
  ola.
- **Notificaciones de la propia app «ntfy»**: los mensajes espejados llegan al Centro con
  `appId:"ntfy"`. Como no hay un paquete de Biblioteca ni una entrada en `app-catalog.ts` con ese id,
  `resolveAppMeta()` (`app-notify.ts`) cae al nombre literal `"ntfy"` — es un origen del **sistema**,
  no una app instalada, y no necesita entrada en el catálogo para funcionar.

## 10. Mapa de archivos

- `src/lib/notifications/ntfy.ts` — cliente único (ajustes, derivación de tópicos, publish, subscribe,
  puente, prueba). Ver cabecera del archivo para el listado exacto de piezas.
- `src/components/notifications/ntfy-panel.tsx` — `NtfyPanel`, panel de Ajustes (solo vista).
- `src/lib/notifications/app-notify.ts` — sistema in-app existente; `notifyFromApp()` es el punto de
  espejo que usa `ntfy.ts` (no modificado por esta ola).
- `src/lib/neurons/neurons.ts` — `thisDeviceId()`, identidad de la neurona usada para el tópico de
  dispositivo (no modificado por esta ola).
- `src/lib/settings-sync.ts` — dueño de `SYNCED_KEYS`/`sanitizeForCloud`; ver §9 para el cambio
  pendiente (no aplicado por esta ola).
- *(Pendiente de crear, fuera de esta ola)*: bridge global sin UI (`ntfy-bridge.tsx` o similar) que
  llame a `startNtfyBridge()` desde `src/app/layout.tsx`.

## 11. Límites honestos (v1)

- **Derivación de tópicos por SHA-256 plano en el cliente, no HMAC server-side** (§3) — la mejora
  documentada (Route Handler + `SERVER_SECRET`) no está implementada.
- **Sin Web Push real**: `subscribe()` requiere la pestaña del OS abierta (o el navegador vivo, según
  soporte de `EventSource` en segundo plano); para "push aunque el navegador esté cerrado" hoy depende
  de la **app móvil de ntfy** (§7), no de este cliente web.
- **`NtfyPanel` no reacciona a un login/logout en vivo**: si el usuario inicia sesión con el panel ya
  abierto, los tópicos no se re-derivan solos (hay que reabrir el panel o refrescar). `startNtfyBridge`
  sí reacciona a cambios de **ajustes**, no a cambios de **sesión**.
- **`publish()` no fija `Cache: no` por defecto**: quien publique contenido sensible debe recordar
  pedirlo explícitamente (o, mejor, usar un servidor propio — §6/§8) — no hay barrera automática en el
  cliente contra publicar algo sensible al servicio público.
- **Sin sincronización de ajustes entre dispositivos todavía** (§9) — y el paso para añadirla no es
  trivial (requiere sanear el token, no es un simple añadido a `SYNCED_KEYS`).
- **Sin `Cache: no` automático ni límites de tasa propios**: este cliente no impone ninguna limitación
  adicional sobre las de ntfy mismo (§1); un uso masivo de `publish()` puede toparse con los límites del
  servidor (gratis o propio) sin aviso previo más allá del `{ok:false, error}` de la respuesta HTTP.
