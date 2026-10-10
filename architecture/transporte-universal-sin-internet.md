# SOP · Transporte universal y emparejado sin internet (2026-10-10)

Paso 3 del orden de entrega de `architecture/genesis-niveles-malla-universal-estaciones.md` (§B.2.1 y
§B.2.2). Petición de Alex: si llama o escribe a alguien que el sistema detecta en alguna señal P2P
(aunque sea de otra cuenta o de un grupo en común), el OS se vincula **en directo**, sin internet ni
servicios externos; igual para archivos, transmisiones y demás datos.

## 1 · Qué hay (todo real, nada simulado)

| Pieza | Archivo | Qué hace |
|---|---|---|
| Elección de enlace (pura) | `src/lib/malla/eleccion-enlace.ts` | Ordena los enlaces del más directo al menos directo, dice por qué descarta cada uno, reparte trozos por capacidad medida |
| Código de emparejado (puro) | `src/lib/malla/codigo-emparejado.ts` | SDP → JSON → `deflate-raw` (CompressionStream) → base64url → `SSL1z.…`; y al revés. Sin dependencias |
| Canal multitrayecto | `src/lib/malla/canal-multitrayecto.ts` | Un `CanalArchivos` que reparte los trozos de un archivo entre varios enlaces abiertos al mismo aparato |
| Registro de enlaces locales | `src/lib/malla/registro-enlaces-locales.ts` | Lista viva de enlaces emparejados sin internet (diminuto: lo leen las señales de la neurona) |
| Emparejado sin internet | `src/lib/malla/emparejar-sin-internet.ts` | RTCPeerConnection con `iceServers: []`, código de oferta/respuesta, presentación `enl.hola`, latido y medida de ruta, renegociación de audio/vídeo por el propio canal |
| Transporte universal | `src/lib/malla/transporte-universal.ts` | La puerta: `enviarMensaje`, `enviarArchivo`/`canalParaArchivo`, `abrirFlujo`, `alRecibirMensaje`, `iniciarTransporteUniversal` |
| Llamada directa | `src/lib/malla/llamada-directa.ts` | Timbre, contestar, rechazar, colgar y micro por el enlace local (máquina de estados pura `transicionLlamada`) |
| Interfaz | `src/components/network/vincular-sin-internet.tsx` | «Vincular sin internet»: QR + texto (copiar/compartir), lector por cámara (`BarcodeDetector`) o pegando, enlaces abiertos con nota, archivo, llamada y videollamada |
| Llamada flotante | `src/components/network/llamada-directa-flotante.tsx` | Timbre y llamada en curso; una sola instancia aunque esté montada dos veces |

Dónde se ve: **Centro de Conexiones → pestaña «Malla»** (arriba, antes de «Dispositivos StarSeed»), en el
Centro de Control (borde derecho) y en el menú de conexiones del escritorio. La llamada flotante y la
recepción global se montan perezosas en `MallaNeuronasMount` (todas las rutas menos `/genesis` y `/voces`).
Las señales de cada neurona (`senales-medio.ts` → panel de aparatos) cuentan «N sin internet».

Dependencia nueva: `qrcode` + `@types/qrcode` (solo se carga al dibujar un QR, con `import()`).

## 2 · Orden de los enlaces

| Rango | Enlace | Cuándo |
|---|---|---|
| 0 | `local` — emparejado sin internet (código/QR) | Siempre primero: ni servidores ni internet |
| 1 | `cuenta`/`par` con ruta medida `misma-red-local` | Canal WebRTC señalizado por internet cuyo tráfico ya va por el Wi-Fi |
| 2 | `cuenta`/`par` por internet directo o sin medir | |
| 3 | `cuenta`/`par` reenviado por TURN | |
| 4 | `rele` — relé cifrado del servidor | Solo mensajes, y solo si el destino trae su identidad de malla (`identidadRele`) |
| 5 | `lora` — Meshtastic | Solo mensajes de ≤ 200 B y con nodo de destino (`nodoLora`) |

Dentro de un rango gana la menor latencia medida y luego la mayor capacidad medida. Sin medida, detrás.
Flujos (audio/vídeo): solo `local`. Archivos: nunca relé ni LoRa; `par` solo si el vínculo tiene permiso
de archivos.

**Envío de mensajes** (`enviarMensaje(destino, canal, cuerpo)`): sobre `{"t":"tu.msg",v:1,id,c,b,de}`.
Por un canal P2P espera el acuse (`tu.ack`, 2,5 s); sin acuse prueba el siguiente; el receptor
descarta duplicados por id. Relé y LoRa viajan en la **forma corta** `{to, txt, cv:"tu:<canal>:<id>"}`
(los únicos campos que la radio deja pasar) y vuelven por la bandeja de red (`starseed:mesh-inbound`).
El resultado dice SIEMPRE qué enlace usó, si quedó confirmado y por qué se descartó cada enlace.

**Archivos** (`enviarArchivo(destino, blob, nombre)`): el motor de siempre (`archivos-malla.ts`). Si hay
más de un enlace P2P al MISMO aparato, un canal multitrayecto reparte los trozos por capacidad medida
(selector ponderado intercalado; se salta el enlace con la cola llena o que falla) — es la política
«masivo» del planificador CAMR adaptada (`fragmentosPorMtu` del propio CAMR; por capacidad; nunca LoRa).
El receptor espera a tener todos los trozos antes de verificar el SHA-256 (por varios caminos el «fin»
puede adelantarse). Nunca se reparte un archivo entre aparatos distintos de la misma persona.

## 3 · Emparejado sin internet: cómo y qué no puede

1. Quien empieza pulsa **«Enseñar mi código»**: RTCPeerConnection con `iceServers: []`, reúne sus
   candidatos (IP local o nombre mDNS `.local`) y enseña el código como QR y texto.
2. El otro pulsa **«Leer el código de otro aparato»** (cámara o pegar), crea su respuesta y enseña SU código.
3. Quien empezó lee la respuesta: se abre el canal directo. Los dos se presentan (`enl.hola`: nombre,
   ids de sincronización y de neurona, cuenta) y el enlace entra en el registro.

Límites honestos (se dicen en la interfaz, no se esconden):
- **Un navegador no puede descubrir solo a otro aparato sin internet.** Hace falta este gesto (o la app
  nativa, o una radio). La autonomía completa llega con la app nativa 0.4 (§B.2.3 del contrato general).
- Sin ninguna red local (ni Wi-Fi ni punto de acceso) no hay candidatos: se dice antes de enseñar código.
- Redes de invitados que aíslan clientes o puntos de acceso que bloquean mDNS: «no se alcanzaron».
- `BarcodeDetector` existe en Chrome/Edge de Android, macOS y ChromeOS; en el resto se escanea con la
  cámara del sistema y se pega el texto.
- Un enlace vive en la pestaña donde se emparejó; al cerrarla, se cierra.
- Quien responde espera hasta 3 min a que el otro lea su código; quien empieza, 25 s tras leer la respuesta.

## 4 · Consentimiento y proximidad

- Pasarse el código en persona ES el consentimiento para ESE enlace. Aun así, lo que llega por él
  nunca se acepta solo: los archivos **siempre preguntan** (`mismaCuenta:false`, permiso para preguntar).
- La cuenta que el otro aparato dice tener en `enl.hola` sirve para **enrutar** («a esta persona»),
  nunca para dar permisos: no se puede verificar sin servidor.
- Cada llamada **suena** y solo se envía audio/vídeo cuando la otra persona contesta.
- Este módulo no emite faros ni anuncia a nadie quién está cerca.
- El código no lleva claves ni tokens: solo la descripción de red que cualquiera del mismo Wi-Fi vería.

## 5 · Pruebas

`npx vitest run src/lib/malla src/components/network/__tests__/vincular-sin-internet.test.tsx` — 35
pruebas: orden y descartes de enlaces, reparto proporcional e
intercalado, mismo aparato, código ida y vuelta (comprimido y sin comprimir, extraído de un texto,
errores con su motivo), canal multitrayecto (reparto, conmutación, colas llenas, binario) y **de punta a
punta con el motor de archivos real por dos caminos con distinto retraso**, conmutación del envío con
acuse, forma corta, duplicados, máquina de estados de la llamada, y la interfaz (dice que no hay WebRTC
cuando no lo hay; enseña un enlace abierto con lo medido y sus acciones).

La parte que necesita dos aparatos reales (WebRTC sin servidores, cámara, audio) se verifica a mano en
la Mac: dos pestañas o dos aparatos en el mismo Wi-Fi → «Malla» → enseñar/leer códigos → nota, archivo,
llamada. Con el Wi-Fi sin salida a internet (o el punto de acceso de un móvil sin datos) debe seguir igual.

## 6 · Pendiente (con motivo)

- **Llamadas del chat por el enlace local**: el motor de llamadas (`src/lib/llamadas/motor.ts`) señaliza
  por canales privados de Supabase Realtime y el timbre nace de un mensaje del chat; sin internet ninguna
  de las dos cosas existe. Hace falta una `ConexionCanal` sobre el transporte universal y un timbre por
  el enlace local. Hoy, sin internet, se llama desde «Vincular sin internet» (llamada directa real).
- **Estaciones y capas de Astraura por el transporte universal**: `src/lib/estaciones/malla.ts` y
  `astraura-por-malla.ts`/`ia-por-malla.ts` siguen con su camino; tienen que pasar a `enviarMensaje` /
  `alRecibirMensaje` (canales `estacion`, `astraura`). Otra área trabaja hoy en estaciones.
- **Chat de mensajería por el enlace local**: el chat escribe en Supabase; falta encolar el mensaje por
  `enviarMensaje(…, "chat", …)` cuando no hay internet y reconciliarlo al volver.
- **App nativa 0.4**: descubrimiento UDP multicast firmado y señalizador local para los navegadores del
  mismo Wi-Fi (quita el gesto del código). Bluetooth, LoRa como señalizador y Reticulum, después.
