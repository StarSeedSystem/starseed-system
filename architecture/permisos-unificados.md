# Permisos del dispositivo: motores duplicados y plan de unificación

> Medido con `git grep` el 2026-11-08 sobre este worktree. **La premisa «tres motores» no se
> sostiene tal cual**: no existe ningún módulo `universalDeviceBridge` (solo aparece en la cola de
> esta tarea), y `src/lib/senses/senses.ts` **ya delega** en `request-permission.ts`
> (`senses.ts:29-34`, `:71-73`, `:348-356`, `:377-390`). Sí quedan duplicados reales fuera de esos
> dos: `install/device-install.ts`, `llamadas/medios.ts` y varias llamadas directas a la API.

## 1. Inventario medido

| Motor | Rutas y exports | Permisos que cubre | Plataformas | Importadores |
|---|---|---|---|---|
| **`request-permission`** (base de facto) | `src/lib/aurora/senses/request-permission.ts` (293 líneas): `PermisoDispositivo`, `ResultadoPermiso`, `EstadoPermisoDispositivo`, `EVENTO_PERMISO`, `requestDevicePermission`, `estadoPermiso`, `suscribirPermiso`, `entornoPermisos`, `ayudaPermiso`, `pedirPermisosEnSecuencia`, `abrirEnNavegadorSistema`, `SENSE_PERMISSION`, `TOOL_PERMISSION` | micrófono, cámara, ubicación, notificaciones, almacenamiento persistente, movimiento, archivos | Web (Chromium/Safari/Firefox), Tauri (consulta `medios_estado`) y Android | 10 archivos (8 fuente + 2 pruebas) |
| **`senses`** (catálogo y persistencia) | `src/lib/senses/senses.ts` (423 líneas): `SENSES`, `SENTIDO_A_PERMISO`, `SensesConfig`, `getSenses`, `saveSenses`, `getActiveSenses`, `setActiveSenses`, `permissionState`, `requestSense`, `visorBloqueaPermisos` | micrófono, cámara, pantalla, ubicación, portapapeles, archivos, notificaciones (delega los 5 mapeados) | Web; su persistencia es Supabase | 11 archivos (6 componentes + 5 libs) |
| **`device-install`** (tercer motor real) | `src/lib/install/device-install.ts`: `GrantState`, `PermissionReport`, `requestMaxPermissions` (`:261-343`) | notificaciones (`:299-306`), almacenamiento persistente (`:319-322`), wake lock (`:330`) | Web/PWA; no pide micrófono ni cámara | 10 archivos (8 fuente + 2 pruebas) |
| **`medios` de llamadas** (cuarto motor) | `src/lib/llamadas/medios.ts`: `obtenerMedios` (`:106`), `obtenerPista` (`:131`), `obtenerPantalla` (`:142`), `listarDispositivos`, `soportaLlamadas` | micrófono, cámara, pantalla, altavoz | Web y Tauri; errores vía `explicarFalloMedios` | 11 archivos (8 fuente + 3 pruebas) |
| **Puente nativo** (no es motor de permisos) | `src/lib/nativa/puente.ts` + `src/lib/nativa/medios-nativos.ts`: `medios_estado`, `medios_abrir_ajustes`, `serie_*`, `carpetas_*` | estado de micrófono/cámara/pantalla, serie/USB, carpetas | Tauri escritorio y Android | `medios.ts`, `llamada-directa.ts`, `transmision-medios.ts`, `carpetas-vinculadas` |

**Llamadas directas que esquivan todo motor**: `Notification.requestPermission` en
`alarms-engine.tsx:39`, `alarm-scheduler.tsx:38`, `reminders-store.ts:210` y `avisos-mensajes.ts:326`;
`getUserMedia` en `capabilities.ts:458`, `vision.ts:383`, `llamada-directa.ts:270` y
`transmision-medios.ts:91`; `getDisplayMedia` en `vision.ts:350`; `permissions.query` en
`privacidad-tab.tsx:97`, `panel-areas.tsx:87` y `camera-quick-widget.tsx:45`; `showDirectoryPicker`
en `folder-detect.ts:64`, `carpetas-vinculadas.ts:123` y `memory-sync/connect.ts:291`.
Los módulos `astraura/ui-permisos.ts`, `astraura-bots/permisos.ts`, `mando/permisos.ts` y
`espacios/permiso-espacios.ts` son permisos de **dominio/rol**, no del aparato: quedan fuera.

## 2. Solapes y resultados distintos

| Permiso | `request-permission` | `senses` | `device-install` / otros | Dónde discrepan |
|---|---|---|---|---|
| Micrófono | `getUserMedia({audio})` y corta pistas (`:49`, `:35-36`) | delega (`:389`) | `capabilities.ts:458` y `medios.ts:113` | `medios.ts` **retiene** el stream; `senses.ts:340` deduce `denied` con regex sobre el mensaje, así que un `NotAllowedError` sin la palabra «denied» queda como `prompt` |
| Cámara | `getUserMedia({video})` (`:50`) | delega (`:389`) | `vision.ts:383`, `camera-quick-widget.tsx:45` | el widget consulta `permissions.query("camera")` y Safari/Firefox lo declaran no soportado; el motor base sí lo intenta |
| Pantalla | **no la cubre**; `senses.ts:399` la pide directamente | `getDisplayMedia` (`:393-401`) | `medios.ts:146`, `vision.ts:350` | no hay estado consultable; cada sitio decide cuándo pedir y cómo mapear `AbortError` |
| Ubicación | `getCurrentPosition` con timeout 8 s (`:53-59`) | delega (`:389`) | `privacidad-tab.tsx:135` | el panel de Astraura pide sin timeout ni `maximumAge`; el motor base cachea 10 min |
| Notificaciones | `Notification.requestPermission` (`:63-64`); «default» se conserva como motivo | delega (`:389`) | `device-install.ts:306`; `avisos-mensajes.ts:326` | `device-install` convierte cualquier cosa que no sea `granted` en **`denied`**; el motor base distingue `prompt` |
| Almacenamiento | `storage.persist()` (`:66-70`); `estadoPermiso` usa `persisted()` (`:160-163`) | no lo expone | `device-install.ts:319-322` | `device-install` trata `persisted() || persist()` como concedido; el motor base devuelve `prompt` si aún no está persistido |
| Archivos | `showDirectoryPicker({mode:"readwrite"})` (`:88`) | delega a `folder-detect` (`:381-388`) | `folder-detect.ts:64` (`mode:"read"`), `carpetas-vinculadas.ts:123` (sin modo) | **mismo permiso, concesión distinta**: lectura, lectura/escritura o sin declarar |
| Movimiento | `DeviceMotionEvent.requestPermission` (`:71-79`) | no lo expone | — | sin `requestPermission` devuelve `granted` sin consultar nada (`:167`): no es un estado real |
| Bluetooth / USB-serie | **no los cubre** | no los cubre | `permisos-antenas.ts:16-85`, `BleStarSeed.kt:248-250` | solo existen en nativo; Android pide `BLUETOOTH_SCAN/CONNECT/ADVERTISE` y ubicación |

## 3. Propuesta: una API

Se queda de base **`request-permission.ts`** porque ya reúne pedir, consultar, suscribirse, explicar
el entorno y pedir en secuencia; además `senses` ya lo usa. `senses` queda como catálogo/persistencia
y el puente nativo como capa de plataforma, nunca como motor paralelo.

```ts
// src/lib/permisos/contrato.ts — puro, sin `node:*`, importable por cliente
export type EstadoPermiso = "concedido" | "denegado" | "preguntar" | "no-disponible";

export interface ResultadoPermisoOS {
  id: PermisoDispositivo;      // microfono | camara | pantalla | ubicacion | notificaciones
  estado: EstadoPermiso;       // almacenamiento | movimiento | archivos | bluetooth | serie
  motivo?: string;             // texto del navegador/SO, nunca una clave
}

export function consultarPermiso(id: PermisoDispositivo): Promise<EstadoPermiso>;
export function pedirPermiso(id: PermisoDispositivo): Promise<ResultadoPermisoOS>;
export function suscribirPermiso(
  id: PermisoDispositivo,
  cb: (estado: EstadoPermiso) => void,
): () => void;
```

Mapeo único: `granted→concedido`, `denied→denegado`, `prompt→preguntar`,
`unsupported|error→no-disponible`. Se respeta lo que decide cada plataforma: en web solo se dispara
el diálogo del navegador; en Tauri `permisos_medios.rs:65` decide origen propio y el SO pregunta; en
Android los permisos en tiempo de ejecución siguen siendo del SO (`BleStarSeed.kt:248-250`); en iOS
solo se pide dentro de un gesto. Pantalla y portapapeles se piden al usar: `consultarPermiso`
devuelve `no-disponible` y `pedirPermiso` es el único camino.

## 4. Pasos de migración (≤ 3 archivos y ≤ 120 líneas cada uno)

| Orden | Paso y archivos | Prueba |
|---|---|---|
| 0 | **Contrato puro** nuevo `src/lib/permisos/contrato.ts` (tipos + `normalizarEstado`) y su prueba `src/lib/permisos/__tests__/contrato.test.ts`. No cambia comportamiento. | Tabla de los 5 estados viejos → 4 nuevos, incluido `error` |
| 1 | **Compatibilidad**: en `request-permission.ts` añadir `consultarPermiso`/`pedirPermiso` como alias de `estadoPermiso`/`requestDevicePermission`, conservando las firmas viejas. Sin tocar importadores. | `contrato.test.ts` + prueba pura de los alias con un `navigator` inyectado |
| 2 | **`senses`**: sustituir `resultadoASentido` (`senses.ts:333-342`) por `normalizarEstado`; en `senses-panel.tsx:66` usar el `SENTIDO_A_PERMISO` ya exportado. | `src/lib/senses/__tests__/sentido-a-permiso.test.ts` (mapa y estados, sin DOM real) |
| 3 | **`device-install`**: `requestMaxPermissions` delega en `pedirPermiso("notificaciones"/"almacenamiento")` y conserva `PermissionReport`. | `src/lib/install/__tests__/device-install.test.ts` con `Notification`/`storage` simulados |
| 4 | **Medios**: extraer de `request-permission` un `solicitarMedios` que devuelva el stream; usarlo en `medios.ts:106`, `llamada-directa.ts:263` y `transmision-medios.ts:90`. | `permiso-medios.test.ts`, `llamada-directa-permisos.test.ts` y `medios.test.ts` |
| 5 | **UI**: `privacidad-tab.tsx:88-160`, `panel-areas.tsx:75-99` y `camera-quick-widget.tsx:45` usan `consultarPermiso` y borran su `permissions.query`. | Pruebas de componente con `navigator.permissions` simulado |

## 5. Riesgos y lo que exige aparatos reales

- **Dos avisos seguidos**: el navegador solo muestra un diálogo por gesto; pedir dos permisos en
  paralelo hace que el segundo se descarte en silencio. Usar `pedirPermisosEnSecuencia` y no pedir
  si `consultarPermiso` ya dice `concedido`.
- **Android**: `POST_NOTIFICATIONS` (13+), `BLUETOOTH_SCAN/CONNECT/ADVERTISE` (12+) y ubicación para
  BLE en versiones viejas; el WebView de Android no trae `getDisplayMedia`. El puente nativo debe
  seguir siendo el único que habla con el SO.
- **WebKit/Safari**: no expone micrófono/cámara en `permissions.query`, no tiene `getDisplayMedia`
  en iOS, no tiene `showDirectoryPicker` y exige gesto para notificaciones y `DeviceMotionEvent`.
- **Visores embebidos** (Claude/Electron/Tauri): suprimen los diálogos; `entornoPermisos` ya los
  detecta y ofrece «Abrir en tu navegador».
- **Discrepancias de estado**: `denied` frente a `prompt` y `default` frente a `denied` son la causa
  de que la UI diga «no funciona» cuando en realidad nunca preguntó.
- **Aparatos reales**: iPhone/Safari, Android Chrome y WebView de la app, macOS con TCC, Windows con
  WebView2 y hardware Bluetooth/serie. Nada de eso se puede validar con `vitest`; las pruebas solo
  cubren la decisión pura.
