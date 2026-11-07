# Contrato · Sincronización entre neuronas (2026-11-07 · MSH1107A)

Petición de Alex (07-11): «Sincronizar ahora» debe abrir AL INSTANTE en la otra neurona una ventana con
la solicitud; aceptada en las dos, las dos dicen «Vinculadas» y el vínculo se puede recordar para que en
futuros encuentros se vinculen solas. También sin internet.

Causa medida del fallo anterior: «Sincronizar ahora» solo mandaba un `presence` al relé de la cuenta
(sin internet no llega) y no existía protocolo de solicitud; la app nativa oía faros pero no tenía canal
de datos entre neuronas.

## 1 · Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Trama (puro, std) | `native/src-tauri/src/malla_local_trama.rs` | `"SSM1"·v1·tipo·largo(BE u32)·JSON`, tope 64 KiB, acuse, solo IPs privadas/enlace local, limitador por IP, buzón con nº de orden. `rustc --edition 2021 --test` |
| Canal local (Tauri) | `native/src-tauri/src/malla_local.rs` | Oyente TCP `0.0.0.0:47071` (faro + 1, comprobado al compilar), solo StarSeed OS; comandos y evento (§2) |
| Faro | `antenas.rs` | `puerto_servicio` = 47071 si el canal escucha (0 si no); `Guardian::otras_cercanas()` da las IPs de faros no reconocidos |
| Protocolo (puro) | `src/lib/malla/sincronizacion-neuronas.ts` | Mensajes, máquina de estados, vínculos, candidatos LAN, plan de vías, señales `lan:<ip>`, reconexión, vías/latencias |
| Motor | `src/lib/malla/sincronizacion-neuronas-motor.ts` | Envía/recibe/firma/guarda; arranca en `MallaNeuronasMount`; API del panel (§5) |
| Ventana global | `src/components/network/solicitud-sincronizacion.tsx` | Solicitud entrante, en curso, «Vinculadas», avisos. Una sola instancia |
| Ficha de señal | `src/components/mesh/signal-detail.tsx` | «Sincronizar ahora» → protocolo, estado en vivo, «Vincular sin internet (QR)» si no hay camino |
| Radar | `use-detected-signals.ts` + `signals.ts` | Señales `lan:<ip>` (faros que oye la app); «Sincronizar ahora» siempre activo en neuronas de la cuenta |

## 2 · Canal local nativo (solo transporta)

- `malla_local_enviar { ip, puerto?, json }` → `{ ip, puerto, ms }`: conecta (2 s), escribe la trama y
  espera el ACUSE (3 s). Sin acuse es error. `ip` debe ser privada o de enlace local (nunca internet);
  `puerto ≥ 1024` (por defecto 47071); `json` = objeto JSON ≤ 64 KiB.
- Evento `malla-local://mensaje` → `{ seq, ip, cuerpo, recibido_ms }`.
- `malla_local_recibidos { desde }` → los recibidos con `seq > desde` de los últimos 10 min (anillo de 64):
  la web los pide al arrancar.
- `malla_local_estado` → `{ escuchando, puerto, motivo, ultimo_seq, vecinos: [{ ip, propia, neurona,
  tipo, puerto, canal, visto_hace_s }] }`. `canal`: `true` su faro anuncia el canal, `false` su app es
  anterior, `null` no se sabe (faros anónimos o de otra cuenta).
- Oyente: corta conexiones que no vengan de la red local, ≤ 8 a la vez, 30 mensajes/10 s por IP, 3 s por
  conexión, un mensaje por conexión. Hilo propio: sigue con la ventana cerrada mientras la app viva.
- Lo que viaja dentro es un sobre del transporte universal `{"t":"tu.msg","v":1,"id","c","b","de"}`; el
  canal `sync` va al motor y los demás canales a `despacharTextoTransporte` (enlace `nativo:<ip>`).
  `{"t":"tu.ping"}` solo mide la ida y vuelta.

Permisos del sistema: macOS pide «Red local» (ya declarado en `Info.plist`) y puede preguntar por
conexiones entrantes si el cortafuegos está activo; Windows enseña el aviso del Firewall para el TCP
47071 (permitir «Redes privadas»). Redes de invitados con aislamiento de clientes no dejan pasar nada.

## 3 · Protocolo (canal `sync`, versión 1)

Cada mensaje va FIRMADO con la identidad de malla (`wrapSigned` v2: firma + instante + nonce) y al llegar
se comprueba firma y frescura (`unwrapSigned` + `acceptFreshness`). Sin firma válida no se enseña nada.

```
sync.solicitud  { id, de, ts, para:{neurona?,sync?}, caduca (10 s–10 min, por defecto 2 min), auto, recordar }
sync.respuesta  { id, de, ts, acepta, recordar }
sync.vinculada  { id, de, ts, recordar }      ← lo manda quien CIERRA (quien inició)
sync.cancelada  { id, de, ts }
de = { neurona, sync?, cuenta?, nombre, plataforma?, medio?, capacidades[] }   (solo datos públicos)
```

Estados (`transicion`, puro): saliente `enviada → recibida` (la app del otro acusó) `→ vinculada`
(respondió que sí); entrante `recibida → aceptada-por-mi → vinculada` (llega `sync.vinculada`);
`aceptada-por-el-otro` cuando la lanzó un agente (`porAgente`) y falta el sí de la persona; terminales
`rechazada`, `caducada`, `cancelada` (con motivo). Si las dos piden a la vez, cada solicitud es el «sí» de
la otra. Una solicitud sin destinatario solo vale si llegó directa (IP o enlace QR); con destinatario, solo
la neurona nombrada la enseña. Límite: 3 solicitudes/min por identidad.

Confianza: el vínculo guarda la HUELLA del otro (primer uso). Una neurona recordada con la misma huella se
acepta sola (`autoAceptable`); con otra huella se pregunta y la ventana avisa de posible suplantación.

## 4 · Vías y orden (`planDeEnvio`)

1. Canal local nativo si la app oye neuronas en esta red: exacta (IP, id del faro o última IP del vínculo)
   o, si no se sabe cuál es, difundida a las anónimas con canal (≤ 8; solo la nombrada contesta).
2. Transporte universal: enlace QR, malla P2P de la cuenta, vínculo entre cuentas, relé con identidad.
3. Relé cifrado de la cuenta sin destinatario (internet + sesión): llega cuando la otra lo consulte.
El resultado dice SIEMPRE la vía, cada intento y, si nada llega, por qué. Navegador sin internet ni app
nativa: «un navegador no puede descubrir otra neurona por sí solo» + `ofrecerQr`.

Recordar: `starseed.malla.vinculos-neuronas.v1` (este aparato, con la última IP local) y
`starseed.malla.vinculos.<neurona>.v1` (sin IPs; prefijo en `SYNCED_PREFIXES`, viaja con la cuenta).
Reconexión: cada 15 s la app mira los faros; un vínculo recordado que REAPARECE (por id de faro o por su
última IP) recibe una `sync.solicitud` con `auto:true` (≤ 1/min); también al abrirse un enlace QR con él.
Aviso discreto «Reconectada con X».

## 5 · API para el panel del vínculo (siguiente agente)

`src/lib/malla/sincronizacion-neuronas-motor.ts`:

- `vinculosDeNeuronas(): VinculoVivo[]` · `suscribirVinculos(cb): () => void` · `useVinculosNeuronas()`
- `medirVias(neurona): Promise<LatenciaVia[]>` — ping por la red local y por cada enlace abierto.
- `solicitarSincronizacion(destino, { recordar?, auto?, porAgente? })`, `responderSolicitud`,
  `cancelarSolicitud`, `recordarVinculo(neurona, bool)`, `olvidarVinculo(neurona)`, `alAvisoSync(cb)`.
- `fijarCapacidadesAnunciadas(() => string[])` — añade etiquetas PÚBLICAS a lo que anuncia esta neurona
  (p. ej. las capas de conciencia compartidas); devuelve la baja.

```ts
interface VinculoVivo {
  neurona; sync?; cuenta?; nombre; plataforma?; medio?: "app-nativa" | "navegador";
  huella?; recordado; recordadoPorElOtro; capacidades: string[];
  creado; ultimoEncuentro; ultimaVia: ViaSync | null; ultimaIp?;
  enRedLocal: boolean;
  vias: { via: ViaSync; disponible; latenciaMs: number | null; medidoEn: number | null; detalle }[];
  sincronizaciones: { id; direccion; estado; via; auto; desde; actualizada; texto }[];
}
type ViaSync = "red-local-nativa" | "enlace-local" | "malla-cuenta" | "vinculo-par" | "rele" | "lora";
```

## 6 · Pruebas y lo que necesita dos aparatos

- Rust: `rustc --edition 2021 --test native/src-tauri/src/malla_local_trama.rs` (9 pruebas, incluida una
  conversación TCP real por loopback y el caso «sin acuse no hay envío»).
- TS: `npx vitest run src/lib/malla/__tests__/sincronizacion-neuronas.test.ts
  src/lib/malla/__tests__/sincronizacion-neuronas-motor.test.ts
  src/components/network/__tests__/solicitud-sincronizacion.test.tsx` (el motor se prueba con dos y tres
  neuronas en memoria: solicitud, rechazo, cruce, cancelación, caducidad, reconexión sola, suplantación).
- A mano (dos aparatos con la app nativa en el mismo Wi-Fi, con y sin salida a internet): radar → señal
  `lan:<ip>` o neurona de la cuenta → «Sincronizar ahora» → ventana en el otro → Aceptar → «Vinculadas» en
  los dos; cerrar y abrir la app → «Reconectada». Probar también un móvil con el punto de acceso sin datos.

## 7 · Pendiente (con motivo)

- La clave de faro de la cuenta (`faro-clave.ts`) aún no se reparte a la app: sin ella los faros son
  anónimos y la primera solicitud se difunde a las neuronas anónimas de la red. Con la clave, irá exacta.
- Identidad entre cuentas sin servidor: la cuenta que dice el otro no se puede comprobar offline (se dice
  así en la ventana); la huella sí.
- `/genesis` y `/voces` no montan `MallaNeuronasMount`: allí no sale la ventana.
