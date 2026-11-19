# Contrato · Transporte adaptativo común multiantena por flujos (CTL1119 · 2026-11-19)

> **Qué es.** El control entre neuronas aprendió a elegir antena, medirla, cambiar en caliente y no
> perder la sesión. Este contrato lleva ese aprendizaje a todo el transporte P2P: archivos, voz,
> vídeo/pantalla, control y los datos que pasan por una puerta de internet compartida.
>
> **Qué no es.** No sustituye a los contratos de cada área ni cambia sus permisos. No hay código de
> producto en esta tarea: aquí quedan las decisiones, las medidas comunes y la cola que las lleva a
> `src/lib/malla`, `src/lib/network`, `src/lib/enjambre` y la puerta de internet.

## 0 · Lo que manda (petición de Alex, 18-11)

**Tarea:** `CTL1119D` (ola `CTL1119`). **Entrega:** este contrato y la cola de §10, sin código de
producto.

- Lo aprendido con el control remoto se aplica a las demás funciones de la malla P2P: transmisión de
  archivos y capas de internet de la malla comunitaria local multicapa.
- En una transmisión se usan **varios medios P2P a la vez cuando es más eficiente**, con autoenrutado
  por tipo de flujo (por ejemplo, vídeo por Wi‑Fi Direct, audio por el Wi‑Fi del router y control por
  Bluetooth directo, o la combinación que convenga).
- Cada sesión se separa en flujos con requisitos propios: **control, audio, vídeo/pantalla, archivos y
  datos de internet compartido**.
- Cada antena se **mide**; cada flujo va a la antena que mejor lo cumple (o se reparte entre varias),
  con **cambio en caliente e histéresis**; el control va siempre por la vía **más fiable y de menor
  retardo**.
- Queda **registrado qué flujo va por qué medio**, y eso se ve en el **medidor de calidad de Genesis**.
- Las reglas fijas del control no se debilitan: firma, protección contra repetición (cada orden vive
  **2 min**), topes de órdenes, aviso (punto de color con el nombre) y «Terminar»/«Quitar permiso».
  El permiso de control sigue **apagado por defecto** y solo lo acepta la persona dueña; **un voto de
  comunidad nunca anula el permiso del dueño** de un aparato personal.
- Lógica pura con pruebas: `vitest` en `src/` y `cargo test` en `native/src-tauri` cuando se toque lo
  nativo. Español neutro.

## 1 · Lo que ya existe (medido en el código, no en los contratos)

### 1.1 Control entre neuronas

| Pieza | Ruta | Qué aporta |
|---|---|---|
| Órdenes, vida y anti‑repetición | `src/lib/control-remoto/orden.ts:18` | `VIDA_ORDEN_MS = 120_000`: ninguna orden se acepta dos veces ni después de 2 min. |
| Puerta de sesión y topes | `src/lib/control-remoto/sesion.ts:41-50` | Sesión 1 h, inactividad 2 min, 5 órdenes/s y 60/min, 60 de entrada/s, 5 lecturas/s, 70/s en total. |
| Elección de antena | `src/lib/control-remoto/auto-enlace.ts:18-27` | Directo antes que relevo; histéresis de 30 %/15 ms en latencia y 50 % en caudal, 6 s de permanencia. |
| Medio real y su estado | `src/lib/control-remoto/medio.ts`, `medio-estado.ts` | Traduce el enlace vivo a medio y enseña el que se usa de verdad. |
| Latido de cuadros | `src/lib/control-remoto/pantalla-origen.ts:687` | Pide el siguiente cuadro solo cuando el anterior se pintó (sin cola) y mantiene vivo el flujo. |
| Firma y sellado de punta a punta | `src/lib/control-remoto/canal.ts:294`, `sellado.ts` | `mandarOrden` firma; el cuerpo viaja sellado; el relé no lee. |
| Lado nativo | `native/src-tauri/src/control_neuronas*.rs`, `control_pantalla*.rs`, `control_entrada*.rs` | La sesión, la pantalla, la entrada y la pausa local se comprueban en Rust/Kotlin, no solo en la página. |
| Pausa y permisos que apagan | `native/src-tauri/src/control_neuronas_logica.rs:29,370` | Ocho órdenes pasan en pausa; solo tres motivos apagan el permiso (`revocado`, `apagado-por-el-dueno`, `la-persona-quito-el-permiso`). |
| Contrato del área | `architecture/control-remoto-entre-neuronas.md` | Reglas G, niveles, indicador, «Terminar» que solo corta, «Quitar permiso». |

Evidencia (grep real, 19-11):

```bash
grep -n "VIDA_ORDEN_MS" src/lib/control-remoto/orden.ts                       # 18
grep -n "SESION_MAX_MS\|TOPE_" src/lib/control-remoto/sesion.ts              # 41-50
grep -n "PERMANENCIA_MS\|MEJORA_RTT" src/lib/control-remoto/auto-enlace.ts   # 18-25
grep -n "latidoDeCuadros" src/lib/control-remoto/pantalla-origen.ts          # 687
grep -n "ORDENES_QUE_PASAN_EN_PAUSA\|MOTIVOS_QUE_APAGAN" native/src-tauri/src/control_neuronas_logica.rs
```

### 1.2 Archivos y enjambre de datos

| Pieza | Ruta | Qué aporta |
|---|---|---|
| Motor de archivos | `src/lib/network/archivos-malla.ts` (protocolo en :17-35; estado en :1446) | Oferta → aceptar → trozos → fin → ok, SHA‑256 por trozo, reanudación con `archivo.aceptar.desde`, `archivo.progreso` y ventana de un envío. |
| Multitrayecto de archivos | `src/lib/malla/canal-multitrayecto.ts:54` y `canal-multitrayecto-vias.ts:123` | Reparte trozos por capacidad medida, con contrapresión por vía y reenvío de los últimos trozos de una vía que muere. |
| Cifrado de archivo | `src/lib/malla/canal-sellado.ts:93` | Sobre ECDH‑P‑256 → HKDF → AES‑GCM; va debajo del reparto. |
| Puerta universal | `src/lib/malla/transporte-universal.ts:1149` | Elige el enlace por `eleccion-enlace.ts:247`, arma el canal sellado y llama al motor. |
| Enjambre de datos | `src/lib/enjambre/enjambre.ts:43,109` | Sesión por contenido, siembra y recolección a la vez, con un `TransporteEnj` inyectado y planificador de vías. |
| Medida de ruta | `src/lib/network/estadisticas-enlace.ts:48` | `resumirRuta` da clase de ruta, RTT y bytes desde `getStats`. |
| Planificador de vías | `src/lib/malla/conectores/planificador-vias.ts:287` | Ordena medios por ficha, reparto de archivos grandes y escalera de formatos. |
| Contratos | `architecture/archivos-malla-p2p.md`, `architecture/datos-por-la-malla.md`, `architecture/red-sin-dependencias.md`, `architecture/transporte-universal-sin-internet.md`, `architecture/seguridad-transporte.md` | Reanudación, ventana, multitrayecto, límites honestos y qué se cifra (y qué no). |

### 1.3 Internet compartido por la malla

| Pieza | Ruta | Qué aporta |
|---|---|---|
| Servicio de puerta | `src/lib/malla/puerta/servicio.ts:283` | Anuncia la salida, elige puerta y aplica el proxy local al webview. |
| Túnel adaptativo | `src/lib/malla/puerta/tunel.ts:245` | Numeración, reordenación, ventana por capacidad medida y `INACTIVIDAD_MS = 120_000`. |
| `fetch` por la puerta | `src/lib/malla/puerta/fetch-puerta.ts:61` | Envuelve `global.fetch` sin cambiar a quien llama; no duplica un `POST`. |
| Respaldo web | `src/lib/malla/puerta-internet.ts:136,147,251` | Proxy `GET https` sellado y su cliente para cuando no hay lado Node. |
| Decisión de compartir | `src/lib/malla/auto-compartir.ts:32` | `sugerirComparticion`: batería, red medida, tope de subida y «con quién». |
| Preferencias por aparato | `src/lib/malla/preferencias-red-compartida.ts:13,37` | Interruptor local, topes y modo automático; todo apagado por defecto. |
| Lado Node | `native/servidor-local/puerta.cjs` | Abre el socket, resuelve DNS y aplica anti‑SSRF; no lee el contenido TLS. |
| Interfaz | `src/components/settings/neurons/ajuste-puerta-internet.tsx` | Interruptores, «Internet por: …», compartiendo con, Parar y Revocar. |

### 1.4 Medidores de Genesis

| Pieza | Ruta | Qué aporta |
|---|---|---|
| Tipos y claves | `src/lib/mando/medidores.ts:64` | `ClaveMedidor`, `FilaMedidor`, `DetalleMedidor`; las reglas son puras. |
| Ruta local | `src/app/api/mando/medidores/route.ts:1004,1131` | GET y POST con `guardianMando`; solo local. |
| Pantalla | `src/components/mando/centro-mando.tsx`, `src/components/mando/medidor-abrible.tsx` | Pastillas, paneles y acciones; no repiten reglas. |
| Flujos del enjambre | `src/app/api/mando/flujos/route.ts` | No es transporte de red: es el editor de flujos de Genesis. No confundir. |
| Medios de cómputo | `src/app/api/mando/medios/route.ts` | Son medios de cómputo (agentes), no antenas de red. |

**Lo que falta hoy.** La medida de caudal/RTT/pérdida existe, pero está partida: control mide en
`auto-enlace.ts` y `estadisticas-enlace.ts`; archivos mide capacidad en el multitrayecto; internet mide
la ventana del túnel. No hay un **registro único de flujo → medio** ni una **medida común** que Genesis
pueda enseñar. Eso es lo que define este contrato.

## 2 · Modelo: una sesión, varios flujos, varias antenas

### 2.1 Los cinco flujos y lo que cada uno exige

Los valores son **objetivos de diseño**, no promesas: si una antena no los cumple, se dice «sin vía que
cumpla» y no se finge. Se miden en el extremo que recibe, con la misma vara para todos los medios.

| Flujo | Retardo máximo | Caudal mínimo | Caudal ideal | Pérdida tolerable | Reparto | Regla propia |
|---|---:|---:|---:|---:|---|---|
| `control` | 200 ms | 2 kbps | 64 kbps | 0,1 % | **nunca** | Una sola vía: la directa viva de menor RTT y, a igualdad, menor pérdida. Si no hay directa, el relevo firmado. Si la mejor no cumple 200 ms o 0,1 % de pérdida, se marca degradada y se dice; no se salta a un relevo mientras haya directa. |
| `audio` | 150 ms (ida) | 48 kbps | 256 kbps | 1 % | **nunca** | Prima el **jitter** y la pérdida sobre el caudal. Un solo carril para no reordenar. |
| `video` | 400 ms | 400 kbps | 4 000 kbps | 3 % | opcional | Nunca se parte un cuadro; el reparto es por segmentos o capas independientes con reensamblado. |
| `archivos` | sin techo | 32 kbps | lo que haya | 0 % (se reintenta) | **preferente** | Trozos por todas las vías que sumen; reanudación por índice y SHA. |
| `internet` | 250 ms | 64 kbps | lo que haya | 1 % | opcional | El reparto es por **conexión/túnel**, nunca por paquete dentro de un mismo TCP. |

Notas que no se negocian:

- **Control y audio no se reparten.** Reordenar gestos o muestras de voz cuesta más de lo que aporta.
- **Vídeo** puede llevar una vía principal y una secundaria para capas o segmentos; si el reensamblado
  no está garantizado, va por una sola vía.
- **Archivos e internet** sí se reparten. En internet, cada conexión TCP conserva su carril (afinidad),
  y las conexiones nuevas eligen el carril de mejor peso; así no se rompe el orden de ningún flujo.
- Un flujo **nunca** salta a un relevo mientras exista un enlace directo vivo. El relevo es respaldo, no
  atajo; si la directa viva no cumple el mínimo del flujo, se baja el peldaño o se dice `sin-via`.

### 2.2 Antenas: qué se mide y qué no se inventa

Se reutiliza el vocabulario de `src/lib/control-remoto/medio.ts` y `auto-enlace.ts`:
`wifi-directo`, `red-local`, `internet`, `nodo`, `turn`, `servidor`, `bluetooth`, `lora`.

```ts
export type Flujo = "control" | "audio" | "video" | "archivos" | "internet";
export type Medio = "wifi-directo" | "red-local" | "internet" | "nodo" | "turn" | "servidor" | "bluetooth" | "lora";

export interface AntenaMedida {
    id: string;                 // id del enlace vivo, opaco
    medio: Medio;
    directo: boolean;           // false = relevo, TURN o servidor
    rttMs: number | null;       // null = sin medir
    jitterMs: number | null;
    kbps: number | null;
    perdidaPct: number | null;  // 0..100
    viva: boolean;              // latido dentro de su vida (§3); lo calcula el latido
    medidoEn: number;           // epoch ms de la última muestra
    fuente: "medida" | "nominal";
}
```

Reglas de honestidad:

1. `null` no es cero. Un dato que falta cuenta como «sin medir» y queda detrás de uno medido de su
   misma clase; nunca se convierte en un número inventado.
2. El caudal nominal solo sirve para **ordenar** cuando no hay medida (`CAUDAL_NOMINAL_KBPS` ya existe
   en `auto-enlace.ts:30`); si se enseña, se marca `fuente: "nominal"`. Un RTT sin medir usa para
   ordenar `RTT_SIN_MEDIR_MS = 400` (el mismo del control, `auto-enlace.ts:27`), también como nominal;
   nunca se enseña como medido.
3. La pérdida se mide con los acuses del flujo (trozos, segmentos u órdenes), no con una estimación.
4. Una antena sin latido reciente está **muerta** aunque el sistema operativo diga que la interfaz
   sigue arriba.
5. No se miden ni se registran contenidos, claves, nombres de personas, coordenadas ni rutas del disco.
   Solo flujo, medio, números y tiempos.

### 2.3 Tres niveles que no se confunden

| Nivel | Identidad | Vive mientras | Al caer una antena |
|---|---|---|---|
| **Sesión de control** | token de sesión de la neurona pareja | 1 h como máximo y 2 min sin actividad (sin cambios) | No se cierra por el cambio: espera a que el control vuelva por otra antena dentro de su vida. Si no vuelve, caduca como hoy. |
| **Sesión de transporte** | `sesionTransporte` (transferencia o emisión) | hasta 10 min sin ningún latido; después queda «suspendida» y ya no se reanuda | Sigue viva; los flujos se reenganchan por otra antena y la numeración continúa. |
| **Flujo** | `(sesionTransporte, flujo)` | su propio latido (tabla §3) | Se pausa, se elige otra antena y se reanuda desde el último acuse; no se reinicia. |

El token de sesión **no depende del medio**. Cambiar de antena no cambia la sesión, no reinicia los
números de secuencia y no vuelve a pedir consentimiento. Lo único que cierra una sesión de control son
las causas de siempre: «Terminar», «Quitar permiso», caducidad, inactividad o revocación.

## 3 · Latidos y vida por latidos

Un latido es un mensaje mínimo, sin contenido y sin claves: `{ v, sesion, flujo, seq, t }` y, si se
midió, `rttMs`. En control viaja por el canal firmado y sellado, con la misma vida de 2 min, pero se
marca como latido de transporte: no cuenta como orden ni renueva la actividad de la persona. En los
demás flujos es un mensaje de transporte y tampoco cuenta como actividad.

| Flujo | Latido cuando está callado | Vida de la vía | Vida del flujo | Qué lo mantiene vivo |
|---|---:|---:|---:|---|
| `control` | 2 s (latido de transporte; no sustituye al de cuadros de 1,5 s) | 6 s (3 latidos) | 2 min de inactividad y 1 h de techo | Órdenes y lecturas; un latido **no** renueva la sesión de control. |
| `audio` | 1 s | 3 s | 10 min sin latido | Muestras de audio o su latido de silencio. |
| `video` | 2 s o atado al cuadro | 6 s | 10 min sin latido | Cuadros o su acuse. |
| `archivos` | 3 s (`archivo.progreso`) | 9 s | 30 s sin avance = «en pausa»; 10 min = «suspendida» | Avance confirmado por el receptor. |
| `internet` | 5 s de túnel ocioso | 15 s | 2 min de túnel inactivo (`INACTIVIDAD_MS`) | Tramas, acuses y `fetch` en curso. |

Reglas:

1. **La vida se decide por el último latido, no por el estado de la interfaz.** Un enlace sin latido
   durante su vida se marca muerto y deja de recibir flujos nuevos.
2. **Un latido no resucita una sesión cerrada.** «Terminar» corta la sesión; «Quitar permiso» apaga el
   permiso y vacía la lista de aceptados. Ningún latido posterior los revierte.
3. **El latido de control no estira la sesión de control.** Los 2 min de inactividad y la hora de techo
   se evalúan con `estadoSesionControl(ultimaActividadMs, inicioMs, ahoraMs)`, donde `ultimaActividadMs`
   solo avanza con órdenes y lecturas reales. El latido mantiene viva la **vía**, no la sesión; si no,
   una sesión quedaría abierta para siempre por ruido de fondo.
4. **Coste:** el latido de un flujo callado no se manda más de lo que dice la tabla. Archivos e internet
   lo llevan dentro de su propio progreso o de sus acuses; no se añade un segundo mensaje.
5. **Sin latido no hay reparto:** una antena muerta no recibe trozos nuevos; los que tenía en vuelo se
   recuperan por otra vía.

## 4 · Reanudación sin perder sesión ni transferencia

### 4.1 Qué se guarda

```ts
export interface PuntoReanudacion {
    version: 1;
    sesionTransporte: string;
    flujo: Flujo;
    seqUltimo: number;          // último número continuo aplicado
    bytesAcusados: number;
    trozosAcusados: number;
    desde: number;              // primer hueco conocido: de ahí se reanuda
    raizHash: string | null;    // archivos: la raíz de la lista de hashes
    expira: number;             // no se reanuda después
}

export const VIDA_PUNTO_MS = 10 * 60_000; // sin acuses; cada acuse renueva el punto
```

- **Archivos:** se reutiliza tal cual `archivo.aceptar.desde` y `huecos` de `archivos-malla.ts`, con el
  `idTransferencia` y el `Blob` originales. El receptor calcula `desde` con lo guardado; el emisor
  retoma en ese índice y **nunca** desde 0. Un trozo cuenta solo cuando el almacén terminó de guardarlo.
- **Internet:** cada túnel guarda su numeración, su ventana y sus acuses (ya lo hace `tunel.ts`). Un
  túnel nuevo hacia la misma puerta empieza con el último número confirmado **solo para una respuesta
  idempotente** (GET, HEAD, OPTIONS); un `POST` que ya salió no se reintenta solo, como hoy. Las
  conexiones que ya estaban abiertas conservan su carril y no se mueven a mitad de respuesta.
- **Vídeo y audio:** se reanuda por segmento o por marca de tiempo, con un colchón de jitter; no se
  reenvía lo ya aplicado. El punto caduca a los 10 min sin acuses; cada acuse lo renueva.
- **Control:** no se reanuda una orden vieja. La protección contra repetición es la de siempre: una
  orden vive 2 min, se acepta una sola vez y un reintento de «repetida» usa un `seq` nuevo.

### 4.2 Cómo se reanuda

1. La antena nueva se abre y se mide antes de usarla (`rtt`, `jitter`, `kbps`, `pérdida`).
2. Se envía `reanudar { sesionTransporte, flujo, desde, prueba }`; la prueba es la firma o el token que
   ya exige ese camino. Sin prueba válida no hay reanudación.
3. El receptor contesta `reanudar-ok { estado, desde, faltan }` o `reanudar-no { motivo }`.
4. El emisor reenvía desde `desde` o desde los huecos. Lo duplicado se descarta por
   `(sesionTransporte, flujo, seq)`; nunca se aplica dos veces.
5. Al confirmar el último trozo o segmento, la antena vieja se cierra. Nunca se cierra antes: si el
   reenvío falla, la vieja sigue siendo el respaldo vivo.

### 4.3 Lo que no se pierde y lo que sí puede perderse

- **No se pierde la sesión** por cambiar de antena, por un corte corto ni por un fallo de una vía.
- **No se pierde la transferencia** mientras el receptor conserve el almacén y el punto de reanudación
  no haya expirado; cada acuse lo renueva y sin acuses caduca a los 10 min.
- **Sí se pierde** un flujo en vivo (audio/vídeo) que lleve más de su vida sin latido: se corta ese
  flujo y se avisa; la sesión de transporte y los archivos siguen.
- **Sí se pierde la sesión de control** por «Terminar», «Quitar permiso», caducidad, inactividad de
  2 min o revocación. Eso no cambia.
- Si el punto de reanudación no está o no es válido, se dice «no se pudo reanudar» y se ofrece empezar
  de nuevo. Nunca se duplica en silencio.

## 5 · Bucle de calidad/caudal

### 5.1 Una muestra cada 4 s, una media que no salta

- Cada flujo mide su antena en uso cada **4 s** (o al recibir 10 acuses, lo que llegue antes).
- RTT, jitter, caudal y pérdida se suavizan con media exponencial **α = 0,3**. Una muestra sola no
  cambia la decisión; dos seguidas malas sí bajan un peldaño.
- La pérdida se calcula sobre ventana deslizante de 30 s; un pico aislado no condena una antena.
- Si no hay medida, el valor queda `null` y el flujo se marca «sin medir»: no se usa como cero.

### 5.2 Peldaños de emisión por flujo

El bucle no cambia permisos ni topes; solo elige el tamaño y el ritmo de lo que ya se puede enviar.

| Flujo | Peldaño 1 (mínimo) | 2 | 3 (por defecto) | 4 | 5 (máximo) |
|---|---|---|---|---|---|
| `control` | sin peldaños: 5/s, 60/min, 60/s de entrada, 5/s de lecturas y 70/s en total | igual | igual | igual | igual: **los topes no se mueven** |
| `audio` | 48 kbps, colchón 160 ms | 64 kbps, 120 ms | 96 kbps, 80 ms | 128 kbps, 60 ms | 256 kbps, 40 ms |
| `video` | 5 fps, escala 0,4, JPEG 40 | 10 fps, 0,6, 55 | 15 fps, 0,75, 70 | 24 fps, 0,9, 85 | 30 fps, 1,0, 95 |
| `archivos` | trozo 16 KiB, ventana 1 MiB | 32 KiB, 2 MiB | 63 KiB, 4 MiB | 128 KiB, 8 MiB | 128 KiB, 8 MiB, todas las vías |
| `internet` | ventana 4, trozo 4 KiB | 8, 8 KiB | 16, 16 KiB | 32, 16 KiB | 32, 32 KiB |

- **Baja** un peldaño tras **2 muestras seguidas** por debajo del mínimo del flujo.
- **Sube** uno tras **4 muestras seguidas** por encima del ideal, y nunca antes de **5 s** desde el
  último cambio.
- En el mismo tic no se baja y se sube. Un enlace que falla no baja un peldaño: se cambia de antena
  (eso es §6) y el peldaño se conserva.
- El control no tiene peldaños de caudal: sus topes son de seguridad y no se mueven.

### 5.3 Qué se registra

Una línea por cambio, con números y sin contenido:

```
transporte flujo=video sesion=<opaca> de=wifi-directo a=red-local causa=mas-caudal
  rtt=34ms kbps=8200 perdida=0.4% fps=24 nivel=4 ms=6120
```

Ni nombres de personas, ni hosts, ni rutas, ni claves. `sesion` es opaca y no se puede revertir a una
identidad.

## 6 · Elección y cambio de antena

### 6.1 Filtros que se aplican antes de puntuar

Un flujo solo considera antenas que:

1. están **vivas** (latido dentro de su vida, §3);
2. **cumplen sus mínimos** de la tabla §2.1 (retardo, caudal, pérdida). Excepción: el control puede
   usar una directa viva que no cumpla, marcándola `degradada`; nunca usa un relevo mientras haya
   directa viva.
3. son **directas**, si queda al menos una directa viva; un relevo, TURN o servidor solo entra cuando
   no queda ninguna directa viva. Esta regla ya existe para el control (`auto-enlace.ts:18`) y se
   mantiene para todos los flujos;
4. no están en **castigo** por fallos recientes (`src/lib/malla/fallos-enlaces.ts`: 30 s, 1 min, 2 min…
   hasta 10 min).

Si ninguna pasa, el resultado es `sin-via` con el motivo por flujo. No se elige «la menos mala» en
silencio; se dice qué falta.

### 6.2 Cómo se puntúa cada flujo

Con medidas ya suavizadas (§5.1), se ordena de mejor a peor:

| Flujo | Orden (mejor primero) | Por qué |
|---|---|---|
| `control` | directa viva → menor RTT → menor pérdida → menor jitter → caudal (solo desempate) | La directa viva es la fiabilidad; entre ellas manda el retardo. Si la mejor supera 0,1 % de pérdida, se marca degradada. |
| `audio` | menor jitter → menor pérdida → menor RTT → directo → caudal ≥ mínimo | La voz aguanta menos reordenamiento que un archivo. |
| `video` | `kbps × (1 − pérdida)` → menor RTT → directo | El vídeo necesita ancho; el retardo se corrige con colchón. |
| `archivos` | `kbps × (1 − pérdida)` → directo | Aquí el tiempo total es lo que importa. |
| `internet` | `kbps × (1 − pérdida) / (1 + carga)` → menor RTT → directo | La puerta ya tiene su propia ventana adaptativa. |

El elector devuelve `{ antena, motivo, degradada, sinVia }`; el reparto, `[{ id, peso }]`. `sinVia` y
`motivo` explican el no; no se inventa una antena para tapar un hueco.

### 6.3 Histéresis: no se cambia por ruido

| Flujo | Mejora mínima para cambiar | Permanencia mínima | Excepción |
|---|---|---|---|
| `control` | 15 ms y 30 % de RTT | 6 s | La antena actual falla o muere: se cambia en el acto. |
| `audio` | 20 ms de jitter y 25 % | 4 s | Ídem. |
| `video` | 50 % más de caudal | 5 s | Ídem. |
| `archivos` | 50 % más de caudal | 5 s | Ídem; el reequilibrio del reparto va aparte. |
| `internet` | 15 ms y 30 % de RTT | 6 s | Ídem. |

Los valores de control son los que ya usa `auto-enlace.ts:18-25`; no se relajan. Para los demás flujos
se copia la misma forma: un cambio exige mejora clara **y** tiempo, salvo caída.

### 6.4 Cambio en caliente, sin perder nada

1. Se abre la antena nueva y se mide (un latido y, si se puede, una muestra de RTT).
2. Se pide `reanudar` desde el último acuse (§4.2). La antena vieja **sigue viva**.
3. La nueva empieza a recibir o enviar; la vieja se queda como respaldo hasta **2 acuses seguidos**.
4. Se cierra la vieja y se registra el cambio con su causa.
5. Si la nueva falla antes del segundo acuse, no se cierra nada y se vuelve a la vieja. El flujo no se
   reinicia y el usuario no ve un corte.

### 6.5 Reparto multiantena

- **Peso:** `peso = max(1, kbps) × (1 − pérdida/100) / (1 + rtt/200)`. Sin medida, se usa el nominal
  marcado como tal y se limita su peso.
- **Cuota mínima** por vía: 10 %; **máxima**: 70 %. Así ninguna vía se muere de hambre ni una sola
  acapara un flujo que sí tolera reparto.
- **Reequilibrio** cada 2 s con **25 % de histéresis**; los trozos/segmentos ya enviados no se mueven.
- **Rescate:** si una vía muere, sus últimos trozos no confirmados se reenvían por las demás (ya lo hace
  `canal-multitrayecto.ts` y `canal-multitrayecto-vias.ts`).
- **Control y audio no participan** en el reparto. Vídeo solo por segmentos/capas independientes.
  Internet reparte por túnel/conexión, no por paquete.

### 6.6 La vía de control siempre manda

Aunque el autoenrutado sea común, el control conserva sus invariantes:

- Una sola vía: la directa viva de menor RTT y, a igualdad, menor pérdida; si no hay directa viva, el
  relevo firmado. Si la mejor directa no cumple 200 ms o 0,1 % de pérdida, se marca degradada y se dice.
- Órdenes firmadas, con vida de 2 min y sin repetición (`orden.ts:18`).
- Topes de `sesion.ts:41-50` intactos: 5/s y 60/min de órdenes de app, 60/s de entrada, 5/s de
  lecturas y 70/s en total.
- Aviso visible (punto de color con el nombre completo) y «Terminar»/«Quitar permiso» con el
  significado de `CTL1118G`.
- Si no hay vía que cumpla, el control **no se degrada a ciegas**: se dice el motivo y se espera.

## 7 · Medidas comunes y medidor de calidad en Genesis

### 7.1 Una sola forma de medida

```ts
export interface MedidaTransporte {
    t: number;                 // epoch ms
    sesion: string;            // opaca, sin identidad
    flujo: Flujo;
    medio: Medio;
    directo: boolean;
    rttMs: number | null;
    jitterMs: number | null;
    kbps: number | null;       // caudal
    fps: number | null;        // solo vídeo/pantalla; null en los demás
    perdidaPct: number | null;
    fuente: "medida" | "nominal";
}

export interface FilaCalidadTransporte {
    flujo: Flujo;
    medio: Medio | null;
    directo: boolean;
    fps: number | null;
    kbps: number | null;
    rttMs: number | null;
    perdidaPct: number | null;
    estado: "vivo" | "cambiando" | "en-pausa" | "suspendido" | "sin-via";
    desde: number;             // desde cuándo va por ese medio
    motivo: string;            // frase corta y honesta para la interfaz
}
```

`fps` y `kbps` son excluyentes en la práctica: vídeo/pantalla enseña fps y caudal; los demás, caudal.
Los dos caben en la misma fila para no inventar dos medidores distintos.

### 7.2 El medidor de calidad

- Una pastilla **«Calidad de transporte»** en Genesis (clave nueva `calidad-transporte` en
  `ClaveMedidor`, `src/lib/mando/medidores.ts:64`) con una fila por flujo:
  `flujo · medio (directo/relevo) · fps o kbps · RTT · pérdida · estado · desde`.
- Al abrirla, el detalle enseña **qué flujo va por qué medio** y el histórico reciente de cambios
  (`de → a`, causa, números). Es el «registro de qué flujo va por qué medio» que pidió Alex.
- Fuente: el registro de medidas del transporte, leído por la ruta **local** de siempre,
  `/api/mando/medidores?clave=calidad-transporte` (GET) con `guardianMando`. En producción esa ruta
  responde **404** y nunca devuelve claves, rutas del disco ni contenido.
- Sin datos, la pastilla dice «sin medidas» y no pinta un cero engañoso.
- La medida se toma en el aparato que transporta, no en un servidor central: el medidor de Genesis es
  el instrumento local, y así lo dice.

## 8 · Autoenrutado por tipo de flujo: ejemplos, no promesas

El ejemplo de Alex —**vídeo por Wi‑Fi Direct, audio por el Wi‑Fi del router y control por Bluetooth
directo**— es una salida típica, no una regla fija. Decide la medida de cada antena en ese momento.
Estas son las combinaciones que el elector debe producir:

| Situación | `control` | `audio` | `video` | `archivos` | `internet` |
|---|---|---|---|---|---|
| Tres directas: Wi‑Fi Direct, router y Bluetooth | Bluetooth si tiene el menor RTT y ninguna pérdida | Wi‑Fi del router si su jitter es el menor | Wi‑Fi Direct por caudal | todas las que sumen; Bluetooth solo si aporta y no rompe el reparto | router o la de mejor peso |
| Sin Wi‑Fi Direct | Bluetooth | router | router, con peldaño de emisión más bajo | router + Bluetooth (trozos pequeños) | router |
| Solo relevo/TURN/servidor | la mejor vía firmada; si no cumple 200 ms, `sin-via` | la de menor jitter; si no, bajar códec | bajar fps y escala; si no cumple, `sin-via` | sigue (más lento), con reanudación | la puerta disponible |
| Solo LoRa | `sin-via` (no cumple retardo) | `sin-via` | `sin-via` | no lleva archivos | no lleva internet |
| Ninguna viva | `sin-via` con motivo | `sin-via` con motivo | `sin-via` con motivo | `sin-via` con motivo | `sin-via` con motivo |

Prohibiciones:

- No se pone el control por LoRa «porque hay algo». Una orden que llega minutos tarde no es control.
- No se sube el control a un relevo si hay una directa viva que cumple, aunque el relevo mida menos
  RTT en una muestra aislada.
- No se reparte el control ni el audio para «aprovechar» dos antenas.
- No se finge una emisión: si el vídeo no llega al mínimo, se baja el peldaño y se dice; si ni así,
  `sin-via`.

## 9 · Lo que no se debilita (reglas fijas)

Estas reglas valen para el módulo común y para cualquier adaptación de antena. Ninguna tarea de este
contrato puede saltárselas ni bajarlas «para que fluya mejor».

1. **Firma.** Cada orden de control se firma y se verifica como hoy (`sesion.ts`, `canal.ts`). Elegir
   antena no firma, no salta la firma ni acepta una orden sin verificar.
2. **Anti‑repetición de 2 min.** `VIDA_ORDEN_MS = 120_000` (`orden.ts:18`). Una orden se aplica una
   sola vez; el reintento de «repetida» usa `seq` nuevo y una sola vez. Cambiar de vía no reabre una
   orden caducada.

   El módulo puro copia estos números para no arrastrar cripto al test; una prueba de cableado
   comprueba que siguen coincidiendo con `orden.ts` y `sesion.ts`, y falla si no.
3. **Topes.** 5/s y 60/min de órdenes de app, 60/s de entrada, 5/s de lecturas y 70/s en total
   (`sesion.ts:41-50`). El adaptador no añade ráfagas ni usa latidos para esquivar el tope.
4. **Aviso.** Punto de color con el nombre completo de quien controla, panel que se pliega y «Terminar»
   a la vista. Cambiar de antena no oculta el aviso ni lo hace intermitente.
5. **«Terminar» y «Quitar permiso».** «Terminar» cierra **solo** la sesión; «Quitar permiso» cierra y
   apaga el permiso de ese aparato (`CTL1118G`, `MOTIVOS_QUE_APAGAN` en `control_neuronas_logica.rs:370`).
   Ningún cambio de medio los suaviza.
6. **Permiso de control apagado por defecto.** Solo la persona dueña lo enciende y solo ella acepta a un
   controlador en el diálogo nativo. La adaptación no enciende, no acepta y no pide por ella.
7. **La comunidad no manda en un aparato personal.** Un voto de comunidad, grupo o entidad **nunca**
   anula el permiso del dueño de un aparato personal. Como mucho, se le pide; la decisión es suya.
8. **Pausa local.** `ORDENES_QUE_PASAN_EN_PAUSA` sigue con las ocho órdenes de `control_neuronas_logica.rs:29`;
   un latido de transporte no quita la pausa ni la simula.
9. **Nada de contenido en registros.** Ni texto, ni audio, ni coordenadas, ni nombres de personas, ni
   claves, ni rutas del disco. Solo flujo, medio, números y tiempos.
10. **La adaptación no es una puerta de permisos.** No concede control, archivos ni internet; solo elige
    por dónde va lo que ya estaba permitido. Los permisos siguen en sus puertas (control, archivos,
    puerta de internet).

## 10 · La cola que lo lleva a archivos e internet

Archivo: `starseed_memory_root/olas/cola-transporte-adaptativo-1119.json`. Mismo formato que las demás
colas: `{ "ola": "...", "tareas": [{ id, ola, titulo, archivos, depende, prompt, estado }] }`. Cada tarea cabe
en **≤ 3 archivos** y **≤ 120 líneas por archivo**, y trae su prueba pura.

| Id | Tarea | Archivos | Prueba | Depende |
|---|---|---|---|---|
| `TAD1119A` | Núcleo: flujos, requisitos, antenas y elección con histéresis; reparto y `sin-via` | `src/lib/transporte-adaptativo/tipos.ts`, `src/lib/transporte-adaptativo/eleccion.ts`, `src/lib/transporte-adaptativo/__tests__/eleccion.test.ts` | `npx vitest run src/lib/transporte-adaptativo/__tests__/eleccion.test.ts` | — |
| `TAD1119B` | Latidos y vida por latidos: sesión de control, sesión de transporte, flujo y vía | `src/lib/transporte-adaptativo/latido.ts`, `src/lib/transporte-adaptativo/__tests__/latido.test.ts` | `npx vitest run src/lib/transporte-adaptativo/__tests__/latido.test.ts` | `TAD1119A` |
| `TAD1119C` | Bucle de calidad/caudal con media exponencial, peldaños y anti‑oscilación | `src/lib/transporte-adaptativo/calidad.ts`, `src/lib/transporte-adaptativo/medidas.ts`, `src/lib/transporte-adaptativo/__tests__/calidad.test.ts` | `npx vitest run src/lib/transporte-adaptativo/__tests__/calidad.test.ts` | `TAD1119A`, `TAD1119B` |
| `TAD1119D` | Reanudación: punto, huecos, idempotencia y anti‑repetición de 2 min | `src/lib/transporte-adaptativo/reanudacion.ts`, `src/lib/transporte-adaptativo/__tests__/reanudacion.test.ts` | `npx vitest run src/lib/transporte-adaptativo/__tests__/reanudacion.test.ts` | `TAD1119A`, `TAD1119B` |
| `TAD1119E` | Archivos: adaptador que usa el elector común sobre `canal-multitrayecto`, con reanudación | `src/lib/malla/archivos-adaptativo.ts`, `src/lib/malla/transporte-universal.ts`, `src/lib/malla/__tests__/archivos-adaptativo.test.ts` | `npx vitest run src/lib/malla/__tests__/archivos-adaptativo.test.ts` | `TAD1119A`, `TAD1119C`, `TAD1119D` |
| `TAD1119F` | Internet compartido: prioridad por flujo y afinidad de túnel en la puerta | `src/lib/malla/puerta/prioridad-flujos.ts`, `src/lib/malla/puerta/tunel.ts`, `src/lib/malla/puerta/__tests__/prioridad-flujos.test.ts` | `npx vitest run src/lib/malla/puerta/__tests__/prioridad-flujos.test.ts` | `TAD1119A`, `TAD1119C`, `TAD1119D` |

Criterios de aceptación de la cola:

- `TAD1119A` debe fallar primero con una prueba que pida «control por la directa viva de menor RTT y, a
  igualdad, menor pérdida; vídeo por la de más caudal, directa antes que relevo, histéresis y `sin-via`». Después, el código justo para pasarla.
- Cada tarea añade **una sola costura** (≤ 40 líneas en el archivo de producto que ya existe) y no toca
  `src/lib/control-remoto/**` ni `native/src-tauri/**`. Si al implementarla hace falta cambiar una
  constante de control, la tarea **se para** y se avisa: no se cambia por la puerta de atrás.
- `TAD1119E` y `TAD1119F` son las únicas que tocan archivos de producto ya existentes; su prueba es
  pura y usa canales simulados, sin red real, sin `vi.mock` de módulos de Node y sin importar un
  `route.ts`.
- Si alguna tarea acaba tocando Rust, corre `cargo test --lib` en `native/src-tauri`; hoy ninguna lo
  necesita.

### 10.1 Qué NO entra en esta cola

- El montaje visual de la pastilla «Calidad de transporte» en `centro-mando.tsx` y su lectura en
  `/api/mando/medidores` es una tarea de seguimiento de 1–2 archivos: este contrato la deja definida
  (§7) pero la cola se queda en 6 para no pasar del tope. No se da por hecha.
- El cableado del latido de control al canal firmado, con una marca que lo excluya de la actividad de
  `sesion.ts`, es una tarea de seguimiento: la cola deja la lógica pura y la regla escrita, pero no toca
  el producto de control en esta ola.
- La migración del vídeo de Android a WebRTC nativo (H.264/VP8 sobre `MediaProjection`) sigue fuera:
  es un plan de varios días ya anotado en `CTL1118F`.
- Cualquier cambio de permisos, niveles, regla G o del diálogo nativo. Este contrato no los toca.

## 11 · Límites honestos

- **Nada de esto está probado en dos aparatos reales.** La formación de Wi‑Fi Direct, el jitter real de
  cada router y la convivencia de Bluetooth + Wi‑Fi en un Android de gama media no se pueden demostrar
  en un contenedor. Las pruebas de la cola son lógica pura con medidas simuladas.
- **LoRa no sirve para control, audio, vídeo, archivos ni internet.** Su retardo y su caudal no cumplen
  ningún mínimo de §2.1; se dice y no se finge.
- **El navegador no da todo.** `getStats` varía entre WebView y WebKitGTK; lo que no se mida queda
  `null` y se marca «sin medir».
- **El reparto gasta más batería y más radio.** Solo se reparte cuando mejora el tiempo total o la
  fiabilidad; no se reparte por lucir dos antenas.
- **El punto de reanudación vive en el aparato.** Si la app se reinicia y el almacén no lo conservó,
  no hay reanudación; se dice y se ofrece empezar de nuevo.
- **La puerta de internet sigue viendo host y volumen** (nunca el contenido). Este contrato no la
  convierte en VPN ni promete anonimato.
- **Sin cifrado nuevo.** El módulo común elige vía; el sellado de control, el cifrado de archivo
  (`canal-sellado.ts`) y el TLS de la puerta siguen siendo los que son. No se envía nada en claro por
  una vía nueva.

## 12 · Decisiones y verificación de esta tarea

- **Un solo elector para todos los flujos**, parametrizado por requisitos. No se copia la lógica de
  `auto-enlace.ts` cinco veces: se reutiliza su forma y sus umbrales de control.
- **Control y audio no se reparten.** Es la decisión que más aleja este diseño de un «balanceo de
  carga» genérico: el orden y el retardo valen más que el caudal.
- **La sesión no depende del medio.** Es lo que permite cambiar de antena sin cerrar sesión ni
  reiniciar una transferencia.
- **Los latidos miden vida de transporte, no actividad de la persona.** Así no se estira la sesión de
  control ni se debilita su caducidad de 2 min.
- **El medidor es local y honesto.** Sin datos, «sin medidas»; sin vía, «sin-via»; sin prueba en
  aparatos, se dice.

Verificación de esta tarea (sin código de producto):

```bash
python3 -m json.tool starseed_memory_root/olas/cola-transporte-adaptativo-1119.json >/dev/null
# y, cuando se implementen las tareas de la cola, la prueba de cada fila de §10:
npx vitest run src/lib/transporte-adaptativo/__tests__/eleccion.test.ts
```

Las pruebas de `src/lib/control-remoto/` y `cargo test --lib control_neuronas_logica` deben seguir en
verde: este contrato no cambia ninguna de sus constantes.
