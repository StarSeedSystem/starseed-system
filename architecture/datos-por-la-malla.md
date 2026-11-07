# Contrato · Datos de cualquier formato por la malla (NEU1107A · 2026-11-07)

Petición de Alex (07-11): los chats de neuronas, de personas y de grupos no son solo texto. Llevan
llamadas de voz y vídeo, pantalla compartida, transmisiones en tiempo real y archivos de cualquier
formato, por la malla o por cualquier medio, respetando el «Medio de transmisión» de cada chat
(automático o métodos elegidos). Cada llamada, archivo o transmisión dice por qué vía fue (la misma
pastilla de vía que los mensajes) y, si ningún medio sirve, el motivo honesto. Nada se inventa: lo
que no se midió es «sin medir».

## 1 · Qué tipo de dato va por qué medio (hoy)

| Medio (ajustes del chat) | Mensaje | Archivo | Llamada (voz, vídeo, pantalla) | Transmisión en vivo |
|---|---|---|---|---|
| Enlace directo sin internet (`local`) | sí | sí (≤ 4 GB) | sí: llamada directa 1:1 | sí |
| Wi-Fi local (P2P de la cuenta) | sí | sí (≤ 4 GB) | no (*) | sí |
| P2P por internet / TURN | sí | sí (≤ 4 GB) | no (*) | sí |
| Servidor StarSeed | sí | neurona propia: ≤ 50 MB | sí: sistema de llamadas | neurona propia: sí |
| Relé cifrado | sí | no | no | no |
| LoRa (Meshtastic) | ≤ 200 B | no | no | no |
| Bluetooth | aún sin enlace en el navegador | no | no | no |
| Correo @star.seed | solo en Correos | adjuntos de Correos (servidor) | no | no |

(*) La malla de la cuenta son canales de DATOS: no lleva audio ni vídeo. La llamada con internet
abre su propia conexión WebRTC, señalizada por el servidor (con TURN si lo hay), y añade los enlaces
sin internet del chat como canal directo. Por eso, con internet, «llamada» cuenta como servidor.

- **Archivos P2P**: el motor de siempre (`src/lib/network/archivos-malla.ts`): oferta → el receptor
  ACEPTA → trozos de 16 KB a disco, lista de SHA-256, reintento por trozo, reanuda desde el último
  guardado y multitrayecto si hay varios enlaces al mismo aparato y el chat los permite todos (si
  no, se fuerza uno: `enlaceForzadoParaArchivo`). Confirmaciones: Enviado · Recibido · Verificado.
- **Archivos por el servidor** (solo a tus propias neuronas): almacenamiento de la cuenta, sin
  recomprimir, con el SHA-256 del archivo entero en el anuncio; el otro aparato lo baja y lo verifica.
- **Llamadas**: `planLlamada` (neuronas) y `planLlamadaChat` (personas y grupos). Sin servidor, la
  llamada directa va por el enlace emparejado (1:1, misma red, sin TURN) con su timbre propio; con
  servidor, el sistema de llamadas (`MotorLlamada`) con los enlaces locales DE ESE CHAT como
  `canalesDirectos`. Un enlace cuyo aparato es de alguien que no está en el chat no recibe nada.
- **Transmisiones en vivo** (`flujo-datos.ts`): abrir · trozos · cerrar, sin acuse por trozo; el
  receptor acusa cada 10 trozos o 2 s (recibidos y perdidos). Formatos: texto (el último gana), JSON
  (registros) y binario (base64, se junta al cerrar, ≤ 64 MB en memoria). Lo vivo no se guarda.

## 2 · Decisiones puras y pruebas

| Módulo (puro, sin red ni DOM) | Decide | Pruebas |
|---|---|---|
| `src/lib/mensajeria/neuronas/datos-neurona.ts` | `LLEVA`/`motivoNoLleva`, `planParaDatos` (reutiliza `mediosParaEnviar`), `planLlamada`, topes por medio, vía de archivos y flujos, fases y registro de llamadas, vista previa segura, lo que se acepta de la red | `__tests__/datos-neurona.test.ts` |
| `src/lib/mensajeria/neuronas/flujo-datos.ts` | protocolo `fd.*`, reductor del flujo, acuses, troceo | `__tests__/flujo-datos.test.ts` |
| `src/lib/llamadas/medio-llamada-chat.ts` | `planLlamadaChat`, `enlacesDelChat` | `src/lib/llamadas/__tests__/medio-llamada-chat.test.ts` |
| `src/lib/malla/eleccion-enlace.ts` | qué enlace real llega a qué destino (se reutiliza) | `eleccion-enlace.test.ts` |

Motores (cliente, perezosos): `archivos-neurona.ts`, `llamadas-neurona.ts`, `flujos-neurona.ts`;
transporte: `abrirCanalDatos` (canal de datos en vivo por UN enlace P2P) en `transporte-universal.ts`;
llamada directa con pantalla en `llamada-directa.ts` (`llamarPorEnlace(…, { pistaPantalla })`).

## 3 · Dónde se ve

- **Mensajes › Neuronas › un chat**: en la cabecera, llamada de voz, videollamada y compartir
  pantalla; en el compositor, el clip (varios archivos, también arrastrando) y «Transmitir en vivo».
  Cada burbuja: tarjeta de archivo (progreso, aceptar/rechazar, cancelar, reanudar, SHA-256, vista
  previa y guardar), de llamada (sonando → en curso → duración, perdida, rechazada) o de flujo.
- **Chats de personas y grupos**: si el medio del chat no incluye el servidor, o no hay internet,
  aparece la barra «Por la malla» (archivos P2P a cada miembro; en un 1:1, llamada directa de voz,
  vídeo o pantalla). Los botones de llamada de la cabecera siguen `planLlamadaChat`: servidor con
  canales directos del chat, o llamada directa sin internet si es lo único posible, o el motivo.
- **Correos**: el buzón @star.seed aún solo va por el servidor (`NO_ADMITIDOS.correo`); al adjuntar
  se dice por dónde viaja y que por la malla se manda desde el chat o la pestaña «Neuronas».

## 4 · Límites honestos

**Navegador**
- Compartir pantalla (`getDisplayMedia`) solo en navegadores de escritorio; se pide en el mismo
  gesto del botón. En móvil, el botón dice que no se eligió pantalla.
- Un enlace sin internet vive en la PESTAÑA donde se emparejó; al cerrarla, se cae (y se dice).
- Lo recibido y verificado se guarda en IndexedDB (cuota del navegador). De lo enviado se guarda una
  copia ≤ 512 MB para reanudar tras recargar; más grande, solo se reanuda con la pestaña viva.
- Sin TURN, el P2P por internet puede no conectar tras NAT simétricos (se dice al fallar ICE).
- Nunca se ejecuta lo recibido: HTML y similares se enseñan como texto plano; el resto, «Guardar».

**App nativa (Tauri)**
- El canal local nativo (`malla_local_enviar`, por IP en la red local) lleva hoy la sincronización
  de neuronas; aún no es un `EnlaceDisponible` del transporte universal, así que no lleva archivos,
  flujos ni señales de llamada (pendiente §5). Pantalla compartida en el WebView: sin verificar.
- Bluetooth y LoRa como portadores de datos llegan con la app nativa; LoRa seguirá siendo solo texto.

## 5 · Pendiente (con motivo)

- **Verificar con dos aparatos reales** (no se puede en una sola máquina): llamada directa con
  pantalla por un enlace emparejado; archivo de >1 GB reanudado tras recargar; transmisión en vivo
  con acuses; timbre de una llamada por internet entre dos neuronas; llamada desde un chat 1:1 sin
  internet con su burbuja por «chat-malla»; archivos a cada miembro de un grupo por la malla.
- **Canal local nativo en el transporte universal** (enlace `nativo:<ip>`): archivos, flujos y
  señalización de llamadas entre apps nativas de la misma red sin emparejar con código.
- **Llamadas de grupo sin internet**: estrella por varios enlaces locales con timbre por el enlace
  y una sala que no dependa de la sesión del servidor.
- **Correos por la malla**: guardar y reenviar del buzón por la malla, y reconciliar al volver.
- **Archivos a otras cuentas por el servidor** desde el chat de neurona (hoy solo P2P: el
  almacenamiento de la cuenta solo comparte con tus propias neuronas).
- **Flujos de audio/vídeo genéricos** por canal de datos (hoy el audio y el vídeo van como llamada).
