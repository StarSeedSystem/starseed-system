# Avisos de mensajes nuevos (contrato · NOT1108A · 2026-11-08)

**Caso real (08-11).** Alex mandó un mensaje de prueba de la Mac a la tableta por Mensajes › Neuronas (enlace
local de la malla). El mensaje llegó, pero nada lo avisó: ni dentro del OS estando en otra sección, ni fuera
de la app (segundo plano) en las notificaciones del aparato. Causa: el buzón de la malla
(`src/lib/mensajeria/neuronas/buzon.ts`) guardaba el mensaje y solo sacaba un toast suelto para archivos y
transmisiones; nadie llamaba al centro de notificaciones ni a las notificaciones del sistema, y la app nativa
no tenía ningún camino de aviso.

## 1. Qué aviso merece cada mensaje

Lógica pura: `src/lib/notifications/avisos-mensajes-logica.ts` (`decidirAviso`).

| Dónde está la persona | Aviso |
|---|---|
| En ESE chat, con la app a la vista (visible y con foco) | Ninguno (lo está leyendo) |
| En otra sección del OS u otro chat, con la app a la vista | Toast dentro del OS con «Abrir» + centro de notificaciones (campana) |
| App oculta, minimizada, sin foco o en segundo plano | Notificación del SISTEMA + centro (para verlo al volver) |
| Chat silenciado (ajustes del chat o ventana de silencio de Ajustes de Mensajería) | Ninguno (los contadores sí suben) |

Además, los permisos de la app «Mensajes» (`messages`) de Ajustes → Notificaciones: «Avisos» (centro) y
«Popups» (toast y notificación del sistema). Un mismo mensaje (mismo id, llegue por la malla, por el canal de
la cuenta o por los dos) se avisa UNA vez.

## 2. Piezas (sin sistemas paralelos)

| Pieza | Archivo |
|---|---|
| Decisión, ruta de cada chat, texto, deduplicación — 12 pruebas | `src/lib/notifications/avisos-mensajes-logica.ts` |
| Aviso de un mensaje: centro de siempre (`notifyFromApp`, app `messages`), toast de sonner que navega sin recargar, sistema (app nativa o navegador), config del respaldo nativo, permisos, «Probar» — 13 pruebas (navegador y app) | `src/lib/notifications/avisos-mensajes.ts` |
| El chat a la vista (sin dependencias: lo fija el hilo de neurona y la página de Mensajes) | `src/lib/notifications/chat-abierto.ts` |
| Contador del icono de Mensajes del dock (ligero) | `src/lib/notifications/no-leidos-mensajes.ts` + `omni-dock.tsx` (`badge` del item `messages`) |
| Montaje global (sin UI): navegación de Next, notificación pulsada, chats del servidor | `src/components/notifications/avisos-mensajes-mount.tsx` (layout raíz) |
| Quién avisa: mensajes de neurona (`recibirNeurona`) y chats por la malla (`recibirChat`) | `src/lib/mensajeria/neuronas/buzon.ts` |
| Chats del servidor: `INSERT` en `os_dm_messages` de otra persona (sin hilos de Correos) | `escucharChatsServidor` en `avisos-mensajes.ts` |
| Abrir el chat de un aviso: `/messages?vista=neuronas&neurona=<clave>` y `/messages?vista=mensajes&hilo=<id>` | `src/app/(main)/messages/page.tsx`, `PanelNeuronas.abrirClave` |
| Web/PWA: clic en la notificación → enfoca la app y le pide abrir el chat (`starseed:abrir-ruta`) o abre una ventana — 3 pruebas con el SW de verdad | `public/sw-v8.js` (`notificationclick`) |
| App nativa: enseñar, pulsar, permiso, canal de Android, respaldo nativo — 5 pruebas | `native/src-tauri/src/avisos_mensajes.rs` |
| Tipos y comandos de la app desde la web (contrato vigilado por `contrato-rust.test.ts`) | `src/lib/nativa/avisos-nativos.ts` |
| «Probar notificaciones» y estado por plataforma | `src/components/settings/notifications/probar-notificaciones.tsx` (Ajustes → Notificaciones) |

**Contadores.** La pestaña «Neuronas» ya tenía su pastilla (`useNoLeidosNeuronas`). El icono de Mensajes del
dock suma los no leídos EXACTOS de las neuronas (bandeja de la malla, `leidoHasta`) y los mensajes de chats del
servidor que llegaron en esta sesión sin abrir su chat (abrirlo los quita). Los exactos de los chats siguen
en la pastilla «Mensajes» de la página, que lee el servidor.

## 3. Por plataforma

| Medio | Notificación del sistema | Al pulsarla |
|---|---|---|
| Escritorio (macOS, Windows, Linux) | `aviso_mensaje` → `tauri-plugin-notification` (≥ 2.8, ya era dependencia; permisos `notification:*` ya concedidos en `default.json`) | `on_action` (`tap`) → enfoca la ventana, guarda la ruta pendiente y emite `starseed://aviso-abrir`; la web navega |
| Android (APK) | Lo mismo, en el canal **«Mensajes»** (`mensajes`, importancia alta, vibración; lo crea la app la primera vez). `POST_NOTIFICATIONS` ya estaba en el manifiesto; en Android 13+ se pide en tiempo de ejecución la primera vez que se abre Mensajes (`pedirPermisoUnaVez`) o desde «Probar notificaciones» | El plugin abre la app; `on_action` guarda la ruta y la emite; si la web no estaba viva, la pide al volver (`avisos_pendiente`, vale 10 min) |
| Web / PWA | `registration.showNotification` del service worker (o `new Notification`), solo con permiso del navegador (nunca se pide solo: «Probar notificaciones») | `notificationclick` del SW: enfoca la ventana y le manda `starseed:abrir-ruta`; sin ventana, `openWindow(ruta)` |

La web siempre le cuenta a la app nativa cada mensaje nuevo (`aviso_mensaje` con `sistema: false` si no hace
falta aviso): así el respaldo nativo no avisa dos veces.

## 4. Segundo plano en Android: qué corre y qué no

- **wry** llama a `WebView.onPause()` al pausar la actividad (`WryActivity.kt`), no a `pauseTimers()`: la página
  pasa a oculta y Chromium frena sus temporizadores (≤ 1/s, y 1/min tras 5 min), pero los eventos de red
  (WebSocket del canal de la cuenta, `RTCDataChannel` de la malla, los eventos que Rust emite a la webview) se
  siguen atendiendo **mientras el proceso viva**. Con el servicio «Segundo plano» (`ServicioAntenas`,
  primer plano tipo `connectedDevice`) el proceso no pasa a «en caché» y Android no lo congela: el aviso sale
  desde la web, que está viva aunque no se vea. Ese es el caso que cubre esta entrega por la vía web.
- **Sin WebView** (la persona quitó la app de recientes con el servicio vivo, o su JS está congelado): el canal
  local de Rust (TCP 47071, `malla_local.rs`) sigue recibiendo. Cada trama con un `tu.msg` del canal
  `neurona` (suelto o en un `nl.lote`) pasa por `avisos_mensajes::al_recibir_local`: si la web no lo apunta en
  **6 s**, Rust lo avisa él, con los mismos filtros que la web (para esta neurona, no un eco, chat no
  silenciado; la web le pasa su neurona, su cuenta y los silenciados con `avisos_config`, guardados en
  `<app_data>/avisos-mensajes.json`). Solo de una IP que el faro reconoce como **neurona de esta cuenta**
  (clave de faro) y con ese remitente: cualquiera de la red puede escribir al 47071 y no debe poder inventar
  avisos. Lo que llegó así sigue en el buzón de Rust (64 mensajes, 10 min) y la web lo recoge al volver
  (`malla_local_recibidos`).
- **Sin proceso** (Android lo mató o el servicio está apagado): no hay nada que reciba; haría falta un empuje
  del sistema (FCM), que no existe aquí. Lo que llegue por el canal de la cuenta se pierde (es efímero) y por la
  malla el emisor lo deja «en espera» y lo reintenta (buzón de la malla).

## 5. Comandos (todos en `COMANDOS_APP` de `build.rs` y con `allow-*` en `default.json`)

| Comando | Qué hace |
|---|---|
| `aviso_mensaje {id, clave, titulo, cuerpo, ruta, sistema}` | Apunta el mensaje; con `sistema`, lo enseña (una vez por id). Solo rutas internas |
| `avisos_config {config: {neurona, uid, silenciados, sistema}}` | Para el respaldo nativo (se guarda en disco) |
| `avisos_estado` | Plataforma, permiso del sistema, canal, foco, ruta pendiente, respaldo, último error |
| `avisos_pedir_permiso` | Android 13+: el diálogo de `POST_NOTIFICATIONS` |
| `avisos_pendiente` | La ruta de la última notificación pulsada (y la olvida) |

## 6. Qué llega con qué

- **Solo con publicar la web**: avisos dentro del OS (toast + centro), contador del dock, chats del servidor,
  notificación del sistema en navegador/PWA y su clic (SW v8), «Probar notificaciones».
- **Con una build nativa nueva**: la notificación del sistema en la app de escritorio y en la APK, el canal
  «Mensajes», pulsar para abrir el chat, el permiso de Android 13+ y el respaldo nativo. Con una app anterior,
  la web detecta que el comando no existe y lo dice en «Probar notificaciones» (no rompe nada).

## 7. Cómo se prueba

```bash
NODE_ENV=test npx vitest run src/lib/notifications/__tests__ src/lib/pwa/__tests__/sw-v8-avisos.test.ts src/lib/nativa/__tests__/contrato-rust.test.ts
# Rust (en el crate real): cargo test --lib avisos_mensajes
```

En un aparato: Ajustes → Notificaciones → «Avisos de mensajes en este aparato» dice el permiso, el canal y el
medio; «Probar en 5 s» y pasar la app a segundo plano. Prueba real: Mac → tableta por Mensajes › Neuronas
(1) con la tableta en Escritorios (toast con «Abrir»), (2) con la app en segundo plano (notificación del
sistema; pulsarla abre el chat), (3) con la app quitada de recientes y «Segundo plano» encendido (respaldo
nativo, ≈ 6 s), (4) con el chat silenciado (nada).
