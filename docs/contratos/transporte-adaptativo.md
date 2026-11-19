# Contrato del Transporte Adaptativo Común Multiantena por Flujos

> Lo aprendido con el control remoto (ORD1114P, CTL1117, CTL1118, PAN1115J) aplicado a las demás funciones de la malla P2P: transmisión de archivos (ARC1108, ARC1110, MPT1108) y capas de internet compartido por la malla comunitaria multicapa (auto-compartir, preferencias-red-compartida, puertas-internet).

---

## 1. Lo que ya existe (rutas exactas)

### 1.1 Control remoto entre neuronas (ya implementado)

**Contrato base:** `architecture/control-remoto-entre-neuronas.md` (ORD1114P)  
**Implementación pura (sin `node:*`, testeable):**

| Módulo | Ruta | Responsabilidad |
|--------|------|-----------------|
| **Orden firmada** | `src/lib/control-remoto/orden.ts:14-59` | Anatomía `CargaOrden` (aud, v, de, cuenta, para, nivel, sesion, seq, nonce, t, caduca, accion), verificación ECDSA P-256, `VIDA_ORDEN_MS = 120_000` (2 min), `DESFASE_MAX_MS = 5 min` |
| **Niveles y vocabulario cerrado** | `src/lib/control-remoto/niveles.ts:14-262` | Niveles `ver \| controlar \| modificar \| administrar` (fase 1 solo `ver/controlar`), `ACCIONES` con validadores tipados, `entrada` (toque/tecla/volumen/brillo/texto, tope 60/s), `senal` (vídeo) |
| **Puerta del aparato controlado** | `src/lib/control-remoto/sesion.ts:131-493` | `PuertaControl` con 13 comprobaciones secuenciales (forma, permiso encendido, misma cuenta, controlador aceptado, firma, destino, hora, seq/nonce, topes 5/s·60/min, acción conocida, argumentos, nivel, sesión viva 1 h/2 min inactividad). Topes separados: entrada 60/s, lectura 5/s, total 70/s. `terminar` (solo sesión, `terminado-por-el-dueno`) y `quitarPermiso` (apaga interruptor) no se debilitan. |
| **Canal en la app** | `src/lib/control-remoto/canal.ts:111-334` | `iniciarCanalControl()` escucha `transporte-universal` en canal `control-neuronas`, `mandarOrden()` firma+sella+envía, espera respuesta por nonce (15 s). `SesionHacia` comparte sesión con ventana (`registroGlobal`), reabre 1 vez si caducó. |
| **Sellado punta a punta** | `src/lib/control-remoto/sellado.ts` | Sobre v:3 para pública de cifrado del destino; respuesta con clave de un solo uso que trajo la orden. Sin clave de destino no sale nada (nunca en claro). |
| **Lado nativo (Rust)** | `src/lib/control-remoto/nativo.ts` | Sesión, indicador, parada, registro encadenado. `paradaNativa` cierra sesión aquí también. `intervencionLocal` (persona contesta/cuelga a mano) → `a-mano` una vez. |
| **Aviso de petición** | `src/lib/control-remoto/aviso-peticion.ts` + `aviso-peticion-salidas.ts` | Con permiso apagado, `abrir-sesion` verificada avisa a la persona (ventana/sistema/centro notificaciones). Quien manda sabe que se avisó (`aviso`). |
| **Firma por aparato (GEN1114)** | `src/lib/chats-genesis/firma-aparato.ts:648-660` | Clave por aparato, `seq` monótono compartido con chat. Color público (`#rrggbb`) y nombre de neurona viajan DENTRO de lo firmado (`presentarse`, `abrir-sesion`). |

**Reglas fijas (no se debilitan):**
- Permiso de control **apagado por defecto**; solo la persona dueña lo enciende y acepta controladores.
- `VIDA_ORDEN_MS = 2 min` (protección contra repetición).
- Topes: 5 órdenes/s, 60/min por controlador; entrada 60/s; total 70/s.
- Aviso: punto de color con nombre del controlador (CTL1117I).
- `Terminar` / `Quitar permiso` son acciones de un toque, irreversibles en esa sesión.
- Un voto de comunidad **nunca anula** el permiso del dueño de un aparato personal.

---

### 1.2 Transporte universal (mensajes, archivos, flujos)

**Contrato:** `architecture/transporte-universal-sin-internet.md` (B.2.1 de `genesis-niveles-malla-universal-estaciones.md`)  
**Implementación:** `src/lib/malla/transporte-universal.ts` (1498 líneas)

**Enlaces REALES que conoce (orden de prioridad):**

| Rango | Tipo | ID ejemplo | Descripción | Admite |
|-------|------|------------|-------------|--------|
| 0 | `local` | `local:abc123` | Emparejado sin internet (código/QR) o abierto solo entre dos apps nativas (`local:nativo-…`) | msg, archivo, flujo |
| 0 | `nativo` | `nativo:192.168.1.20` | Canal TCP app nativa con neurona vinculada (MLT1107A, puerto 47071) | msg, archivo |
| 0 | `ble` | `ble:b3` | Bluetooth directo entre apps nativas (BLE1108A) | msg, archivo |
| 1 | `cuenta` | `cuenta:deviceId` | WebRTC malla de la cuenta, ruta medida `misma-red-local` | msg, archivo |
| 2 | `cuenta` | `cuenta:deviceId` | WebRTC malla de la cuenta, ruta `internet-directo` o sin medir | msg, archivo |
| 3 | `cuenta` | `cuenta:deviceId` | WebRTC malla de la cuenta, ruta `reenviado-turn` | msg, archivo |
| 4 | `rele` | `rele` | Relé cifrado servidor OS (`server-relay.uploadRelay`) | solo msg |
| 5 | `lora` | `lora` | Radio Meshtastic (`sendOverMesh`, ~200 B/paquete) | solo msg cortos |

**Elección de enlace (pura):** `src/lib/malla/eleccion-enlace.ts`
- `rangoEnlace()` define prioridad 0→5.
- Dentro del mismo rango: menor latencia medida (`rttMs`), luego mayor capacidad (`capacidadKbps`).
- `elegirEnlaces()` devuelve `Eleccion { elegidos[], descartados[] }` con motivo honesto de cada descarte.
- **Reparto multitrayecto** (`enlacesParaReparto`, `planReparto`, `crearSelectorPonderado`): solo P2P al MISMO aparato, proporcional a capacidad medida (mediana si no hay medida), selector ponderado suave (estilo nginx) que intercala enlaces.

**Archivos (agnóstico de transporte):** `src/lib/network/archivos-malla.ts`
- Protocolo `archivo.*` (oferta, aceptar, chunk, fin, ok, error, progreso, anuncio, preaceptar).
- Integridad: hash por trozo (SHA-256) + raíz sobre concatenación de hashes.
- Memoria: nunca archivo entero en RAM (OPFS/IndexedDB/memoria con tope 256 MB).
- Reanudación: `archivo.aceptar { desde, huecos[] }` → remitente manda solo lo que falta.
- Cifrado punta a punta opcional (`archivo-seguro.ts`, `archivo-seguro-real.ts`): cada trozo cifrado para el receptor.

**Flujos (audio/vídeo):** `src/lib/malla/transporte-universal.ts:1255-1285`
- `abrirFlujo(destino, stream)` → **solo por enlace local** (WebRTC directo).
- `enlaceLocalHacia(destino)` elige el más nuevo (evita enlace viejo medio abierto).
- Wi-Fi directo se retiene mientras viva el flujo (`avisarAnchoWifi` → `enlace-wifi-motor.ts`).

**Recepción global:** `iniciarTransporteUniversal()` engancha:
- Malla de la cuenta (WebRTC mesh compartido)
- Enlaces locales (código/QR, apps nativas)
- Vínculos entre cuentas (mensajes + archivos si permiso)
- Relé y LoRa (vía bandeja de red `starseed:mesh-inbound`)
- Relevo por otra neurona de la cuenta (REL1111I, `relevo/real.ts`)

---

### 1.3 Envío de archivos / enjambre de datos

**Módulos clave:**

| Módulo | Ruta | Función |
|--------|------|---------|
| **Motor de archivos** | `src/lib/network/archivos-malla.ts` | `MotorArchivos`, `CanalArchivos` (interfaz transport-agnostic), protocolos, hashes, almacenes (OPFS/IDB/memoria), reanudación, anuncios tempranos. |
| **Preparación de archivo** | `src/lib/malla/preparacion-archivo.ts` + `.worker.ts` | SHA-256 por trozo, miniatura, lista ZIP, en worker para no bloquear hilo principal. |
| **Cifrado punta a punta** | `src/lib/malla/archivo-seguro.ts` + `archivo-seguro-real.ts` | `armarCanalArchivo`: vías candidatas, planificador (`conectores/planificador-vias.ts`), multitrayecto, relés (neurona salto, servidor StarSeed, servidor propio). |
| **Elección de vías** | `src/lib/malla/conectores/planificador-vias.ts` | CAMR adaptado: `planificarVias({ tipo, bytes, urgencia, privacidad, destino }, conectores[], { bateria, coste })` → pasos con `enlaceId`, `trozos`, `bps`. |
| **Canal multitrayecto** | `src/lib/malla/canal-multitrayecto.ts` + `canal-multitrayecto-vias.ts` | Reparte trozos por varios enlaces P2P al mismo aparato, `SelectorPonderado` intercalado. |
| **Recepción sellada** | `src/lib/malla/recepcion-sellada.ts` | `recibirArchivo(motor, canal, data, { via, verificacion, verificarPermiso })` → descifra si hace falta, pasa a motor. |
| **Ajustes de vías** | `src/lib/malla/ajustes-vias-archivo.ts` | Modo `automatico` (por defecto, usa planificador), `solo-directas`, `forzar-enlace`, topes de relé. |

**Rutas de envío reales (grep):**
- `enviarArchivo()` → `transporte-universal.ts:1149-1169` → `canalParaArchivo()` → `eleccion-enlace.ts` → `planificador-vias.ts` → `canal-multitrayecto.ts` → `MotorArchivos.enviarArchivo()`
- `enviarMensaje()` → `transporte-universal.ts:557-610` → `crearEnviador()` → `elegirEnlaces()` → `enviarP2PReal()` / `enviarRele()` / `enviarLora()` / `enviarNativo()` / `enviarBle()` / `relevo()`

---

### 1.4 Internet compartido por la malla comunitaria multicapa

**Módulos clave:**

| Módulo | Ruta | Función |
|--------|------|---------|
| **Preferencias por aparato** | `src/lib/malla/preferencias-red-compartida.ts` | `PreferenciasRedAparato { compartir, maximoCon, soloWifi, kbpsSubidaMax, reservaBateriaPct, automatico, compartirMedidas }` en localStorage, saneadas al leer. |
| **Reglas automáticas** | `src/lib/malla/auto-compartir.ts` | `sugerirComparticion({ puertas, preferencias, estado, ahora })` → decisiones `ofrecer/retirar/mantener` con 9 comprobaciones (interruptor, máximo, Wi-Fi, batería, subida, medida, tope mensual, uso actual). |
| **Puertas de internet** | `src/lib/malla/cristal/puertas-internet.ts` | `PuertaInternet { id, compartir, subidaKbps, medida, topeMensualMb, usadoMesMb, reservaDuenoPct }`; `decidirCompartir()` nativa (Rust) o fallback JS. |
| **Anuncio en presencia** | `src/lib/neurons/presencia.ts:70-77, 190-194` | `PresenciaMedio.of = { c, a, i }` (cómputo, almacenamiento, internet) via `settingsFor(n).offerPublicInternet`. |
| **Ficha geo** | `src/lib/senales/geo/ficha-geo.ts:148-149` | Muestra «Cómputo, almacenamiento e internet compartido» desde `presencia.of`. |
| **Política de compartir** | `src/lib/malla/puerta/politica.ts` | Entre neuronas de la MISMA cuenta: compartir ENCENDIDO por defecto con topes (datos/día, batería, subida). |

**Rutas de decisión (grep):**
- `sugerirComparticion()` → `auto-compartir.ts:32-164` (pura, 9 pasos)
- `decidirCompartir()` → `cristal/puertas-internet.ts:168` (nativa) / `politica.ts` (fallback)
- `preferencias-red-compartida.ts:86-94` → `aPreferenciasCompartida()` adapta a `PreferenciasRedCompartida`

---

## 2. Diseño del módulo común: Transporte Adaptativo Multiantena por Flujos

### 2.1 Principios rectores

1. **Una sesión = múltiples flujos** con requisitos propios (retardo, caudal, fiabilidad).
2. **Cada antena/medio se mide** de forma continua (latencia, caudal, pérdidas, disponibilidad).
3. **Asignación por flujo** a la mejor antena (o reparto entre varias) con **cambio en caliente e histéresis**.
4. **Control siempre por la vía más fiable y de menor retardo** (rango 0, confirmado).
5. **Registro visible** en medidor de calidad (Genesis): qué flujo va por qué medio, con métricas en vivo.
6. **Autoenrutado inteligente por tipo de flujo**: vídeo por Wi-Fi Direct, audio por Wi-Fi router, control por Bluetooth directo, archivos por multitrayecto, internet compartido por la antena con más caudal sostenido.

### 2.2 Arquitectura del módulo común

```
src/lib/transporte-adaptativo/
├── tipos.ts                    # Tipos puros compartidos
├── latidos/
│   ├── generador.ts           # Latidos por flujo (configurable: 1-30 s)
│   ├── monitor.ts             # Ventana deslizante, detección de vida/muerte
│   └── reanudacion.ts         # Reanudación sin perder sesión ni transferencia
├── calidad/
│   ├── medidor.ts             # Métricas comunes (fps/caudal, retardo, pérdidas, medio)
│   ├── bucle.ts               # Bucle calidad/caudal (PID simple + histéresis)
│   └── selector-antena.ts     # Elección y cambio de antena con histéresis
├── flujos/
│   ├── clasificador.ts        # Clasifica flujo: control | audio | video | archivo | internet-compartido
│   ├── requisitos.ts          # Requisitos por tipo (retardo máx, caudal mín, fiabilidad)
│   └── asignador.ts           # Asigna cada flujo a antena(s) óptima(s)
├── antenas/
│   ├── inventario.ts          # Antenas disponibles (LoRa, Wi-Fi, BT, celular, Wi-Fi Direct, mesh)
│   ├── medicion.ts            # Mide cada antena (RTT, throughput, loss, disponible)
│   └── historial.ts           # Ventana temporal para histéresis
├── registro/
│   └── calidad-visible.ts     # Qué flujo → qué medio, métricas, para Genesis
└── index.ts                   # Exportaciones públicas
```

### 2.3 Latidos y vida por latidos

**Concepto:** Cada flujo emite latidos periódicos (configurables por tipo de flujo). La ausencia de latidos durante `N` ventanas marca el flujo como «degradado» o «muerto», disparando reasignación.

```typescript
// src/lib/transporte-adaptativo/tipos.ts
export type TipoFlujo = "control" | "audio" | "video" | "archivo" | "internet-compartido";

export interface ConfigLatido {
  intervaloMs: number;        // 1000 (control) | 2000 (audio) | 1000 (video) | 5000 (archivo) | 10000 (internet)
  ventanaVida: number;        // cuántos intervalos sin latido = muerto (3-5)
  ventanaDegradado: number;   // cuántos intervalos sin latido = degradado (1-2)
}

export const CONFIG_LATIDO_POR_FLUJO: Record<TipoFlujo, ConfigLatido> = {
  control: { intervaloMs: 1000, ventanaVida: 3, ventanaDegradado: 1 },
  audio: { intervaloMs: 2000, ventanaVida: 3, ventanaDegradado: 1 },
  video: { intervaloMs: 1000, ventanaVida: 5, ventanaDegradado: 2 },
  archivo: { intervaloMs: 5000, ventanaVida: 3, ventanaDegradado: 1 },
  "internet-compartido": { intervaloMs: 10000, ventanaVida: 3, ventanaDegradado: 2 },
};
```

**Implementación:**
- `GeneradorLatidos` emite `LatidoFlujo { flujoId, tipo, seq, timestamp, metricas? }` por cada flujo activo.
- `MonitorLatidos` mantiene ventana deslizante por `flujoId`, detecta `vivo | degradado | muerto`.
- Al detectar `muerto`: dispara `reasignarFlujo(flujoId, motivo: "latido-perdido")`.
- Al detectar `degradado`: baja prioridad en selector de antena, prepara alternativa.

### 2.4 Reanudación sin perder sesión ni transferencia

**Principio:** La sesión (identidad, permisos, claves) y la transferencia (archivo, flujo) son ortogonales. Una caída de medio no rompe la sesión ni la transferencia.

```typescript
// src/lib/transporte-adaptativo/latidos/reanudacion.ts
export interface EstadoTransferencia {
  flujoId: string;
  tipo: TipoFlujo;
  // Para archivos:
  archivoId?: string;
  trozosEnviados: number[];
  trozosConfirmados: number[];
  huecos: Array<[number, number]>;
  // Para flujos:
  ssrc?: number;
  ultimaSecuencia?: number;
  // Común:
  antenaActual: string;
  sesionId: string;           // sesión de control / vínculo / malla
  puedeReanudar: boolean;
}

export interface PlanReanudacion {
  accion: "continuar" | "cambiar-antena" | "reanudar-desde" | "cancelar";
  nuevaAntena?: string;
  desdeTrozo?: number;
  huecos?: Array<[number, number]>;
  motivo: string;
}
```

**Reglas:**
- **Archivos:** `archivo.aceptar { desde, huecos }` ya existe (ARC1108B). El módulo común expone `calcularPlanReanudacion(estado, nuevaAntena)` que usa `huecosDe()` y `primerFaltante()` de `archivos-malla.ts`.
- **Flujos (audio/video):** Renegociación ICE/RTSP sobre nueva antena; `ssrc` y secuencia se conservan.
- **Control:** `SesionHacia` ya reabre 1 vez si caducó (`canal.ts:341-370`). El módulo común integra esto: `reanudarSesionControl(sesionId, nuevaAntena)`.
- **Internet compartido:** La puerta (`PuertaInternet`) se reevalúa con `sugerirComparticion()` al cambiar antena.

### 2.5 Bucle de calidad / caudal

**Objetivo:** Ajustar bitrate, resolución, FPS, tamaño de trozo, redundancia según métricas reales.

```typescript
// src/lib/transporte-adaptativo/calidad/bucle.ts
export interface MetricasFlujo {
  flujoId: string;
  tipo: TipoFlujo;
  antena: string;
  // Comunes:
  rttMs: number | null;
  perdidaPct: number;         // 0-100
  jitterMs: number | null;
  // Por tipo:
  fps?: number;               // video
  bitrateKbps?: number;       // audio/video
  throughputKbps?: number;    // archivo/internet
  bufferedAmount?: number;    // backpressure
  timestamp: number;
}

export interface DecisionCalidad {
  flujoId: string;
  accion: "mantener" | "subir-calidad" | "bajar-calidad" | "cambiar-antena" | "pausar";
  parametros: {
    bitrateKbps?: number;
    fps?: number;
    resolucion?: string;
    tamanoTrozo?: number;
    redundancia?: number;     // FEC, retransmisiones
  };
  motivo: string;
  confianza: number;          // 0-1 (para histéresis)
}
```

**Algoritmo (PID simplificado + histéresis):**
1. Cada `intervaloMs` (ver `CONFIG_LATIDO_POR_FLUJO`) recopila `MetricasFlujo`.
2. Compara contra `RequisitosFlujo` (ver §2.7).
3. Si `perdidaPct > 5%` O `rttMs > retardoMax` → `bajar-calidad` o `cambiar-antena`.
4. Si `perdidaPct < 1%` Y `rttMs < retardoMax * 0.5` Y `throughput > caudalMin * 1.5` → `subir-calidad`.
5. **Histéresis:** `confianza` debe superar 0.7 para `cambiar-antena`; 0.5 para `subir/bajar-calidad`. Ventana de 3 mediciones consistentes antes de actuar.

### 2.6 Elección y cambio de antena con histéresis y reparto multiantena

**Inventario de antenas (extiende `antennaInventory` de `antennas.ts`):**

```typescript
// src/lib/transporte-adaptativo/antenas/inventario.ts
export interface AntenaDisponible {
  id: string;                 // "wifi-direct", "wifi-router", "bluetooth", "lora", "celular", "mesh-cuenta", "mesh-par", "rele"
  tipo: "wifi-direct" | "wifi-router" | "bluetooth" | "lora" | "celular" | "mesh-cuenta" | "mesh-par" | "rele";
  etiqueta: string;
  // Medidas actuales (actualizadas cada latido):
  rttMs: number | null;
  throughputKbps: number | null;
  perdidaPct: number;
  disponible: boolean;
  // Capacidad teórica (para planificación inicial):
  capacidadMaxKbps: number;
  retardoBaseMs: number;
  // Coste:
  costeEnergetico: "bajo" | "medio" | "alto";
  usaDatosMedidos: boolean;
  // Qué flujos admite:
  admite: Record<TipoFlujo, boolean>;
}
```

**Selector con histéresis:**

```typescript
// src/lib/transporte-adaptativo/calidad/selector-antena.ts
export interface ContextoSeleccion {
  flujoId: string;
  tipo: TipoFlujo;
  requisitos: RequisitosFlujo;
  antenaActual: string | null;
  antenas: AntenaDisponible[];
  historial: MetricasFlujo[];     // últimas N mediciones por antena
}

export function seleccionarAntena(ctx: ContextoSeleccion): { antenaId: string; confianza: number; motivo: string } {
  // 1. Filtrar antenas que admiten el tipo de flujo y están disponibles
  const candidatas = ctx.antenas.filter(a => a.disponible && a.admite[ctx.tipo]);
  if (!candidatas.length) return { antenaId: "", confianza: 0, motivo: "ninguna antena disponible para este flujo" };

  // 2. Puntuar cada antena según requisitos (0-1)
  const puntuadas = candidatas.map(a => ({
    antena: a,
    puntaje: puntuarAntena(a, ctx.requisitos, ctx.historial),
    esActual: a.id === ctx.antenaActual,
  }));

  // 3. Histéresis: si hay antena actual con puntaje >= 0.6, mantenerla salvo que otra supere por > 0.2
  const actual = puntuadas.find(p => p.esActual);
  const mejor = puntuadas.reduce((m, p) => p.puntaje > m.puntaje ? p : m, puntuadas[0]);

  if (actual && actual.puntaje >= 0.6 && mejor.puntaje - actual.puntaje < 0.2) {
    return { antenaId: actual.antena.id, confianza: actual.puntaje, motivo: "histéresis: antena actual suficiente" };
  }

  // 4. Para archivos/internet-compartido: considerar reparto multiantena
  if (["archivo", "internet-compartido"].includes(ctx.tipo) && puntuadas.filter(p => p.puntaje > 0.5).length >= 2) {
    const elegidas = puntuadas.filter(p => p.puntaje > 0.5).map(p => p.antena.id);
    return { antenaId: elegidas.join("+"), confianza: mejor.puntaje, motivo: `reparto multiantena: ${elegidas.join(", ")}` };
  }

  return { antenaId: mejor.antena.id, confianza: mejor.puntaje, motivo: `mejor puntuación (${mejor.puntaje.toFixed(2)})` };
}

function puntuarAntena(a: AntenaDisponible, req: RequisitosFlujo, historial: MetricasFlujo[]): number {
  // Latencia (peso 0.4): inversa, saturada en retardoMax
  const lat = a.rttMs ?? a.retardoBaseMs;
  const pLat = lat ? Math.max(0, 1 - lat / req.retardoMaxMs) : 0.5;

  // Caudal (peso 0.4): lineal hasta caudalMin, luego saturado
  const thr = a.throughputKbps ?? a.capacidadMaxKbps * 0.7;
  const pThr = thr ? Math.min(1, thr / req.caudalMinKbps) : 0.5;

  // Fiabilidad (peso 0.2): 1 - pérdida
  const pFiab = 1 - a.perdidaPct / 100;

  // Penalizar coste energético alto si hay alternativas
  const pCoste = a.costeEnergetico === "alto" ? 0.8 : a.costeEnergetico === "medio" ? 0.9 : 1.0;

  // Penalizar datos medidos si no está permitido (contexto del flujo)
  const pMedido = a.usaDatosMedidos ? 0.7 : 1.0;

  return (pLat * 0.4 + pThr * 0.4 + pFiab * 0.2) * pCoste * pMedido;
}
```

**Reparto multiantena (para archivos e internet compartido):**
- Usa `planReparto()` de `eleccion-enlace.ts` (proporcional a capacidad medida).
- `SelectorPonderado` intercala trozos entre antenas elegidas.
- Cada antena reporta su `throughputKbps` real → recálculo periódico del reparto.

### 2.7 Medidas comunes para medidores de Genesis

**Métricas unificadas por flujo (lo que ve Genesis):**

```typescript
// src/lib/transporte-adaptativo/calidad/medidor.ts
export interface MetricasGenesis {
  flujoId: string;
  tipo: TipoFlujo;
  sesionId: string;
  // Identificación del medio:
  antenaId: string;           // "wifi-direct", "wifi-router+bluetooth", "mesh-cuenta", etc.
  antenaEtiqueta: string;     // "Wi-Fi Direct + Bluetooth (reparto 70/30)"
  // Métricas en vivo (actualizadas cada latido):
  rttMs: number | null;
  jitterMs: number | null;
  perdidaPct: number;
  // Por tipo:
  fps?: number;               // video/pantalla
  bitrateKbps?: number;       // audio/video
  throughputKbps?: number;    // archivo/internet
  // Estado:
  estado: "vivo" | "degradado" | "muerto" | "reanudando" | "pausado";
  // Historial (últimos 60 s, para gráficas):
  serie: Array<{ t: number; rtt: number; perdida: number; thr: number }>;
  // Calidad agregada (0-100):
  calidad: number;
  // Último cambio de antena:
  ultimoCambio?: { t: number; de: string; a: string; motivo: string };
}
```

**Registro visible en Genesis (calidad-visible.ts):**
- Tabla por flujo: `Tipo | Antena(s) | RTT | Pérdida | Caudal/FPS | Estado | Último cambio`
- Gráficas de serie temporal por métrica (RTT, pérdida, caudal).
- Alerta visual si `estado !== "vivo"` o `calidad < 50`.
- Botón «Forzar cambio de antena» (respeta histéresis, anula solo con confirmación).

### 2.8 Requisitos por tipo de flujo (configuración base)

```typescript
// src/lib/transporte-adaptativo/flujos/requisitos.ts
export interface RequisitosFlujo {
  retardoMaxMs: number;       // RTT máximo tolerable
  caudalMinKbps: number;      // caudal mínimo sostenido
  perdidaMaxPct: number;      // pérdida máxima tolerable
  jitterMaxMs?: number;       // jitter máximo (audio/video)
  fiabilidadMin: number;      // 0-1, probabilidad de entrega
  prioridadAntena: string[];  // orden de preferencia de antenas (para desempate)
}

export const REQUISITOS_POR_FLUJO: Record<TipoFlujo, RequisitosFlujo> = {
  control: {
    retardoMaxMs: 100,
    caudalMinKbps: 10,
    perdidaMaxPct: 1,
    fiabilidadMin: 0.999,
    prioridadAntena: ["bluetooth", "wifi-direct", "mesh-cuenta", "wifi-router", "rele"],
  },
  audio: {
    retardoMaxMs: 150,
    caudalMinKbps: 64,
    perdidaMaxPct: 3,
    jitterMaxMs: 30,
    fiabilidadMin: 0.98,
    prioridadAntena: ["wifi-router", "wifi-direct", "mesh-cuenta", "bluetooth", "celular", "rele"],
  },
  video: {
    retardoMaxMs: 200,
    caudalMinKbps: 500,
    perdidaMaxPct: 2,
    jitterMaxMs: 50,
    fiabilidadMin: 0.97,
    prioridadAntena: ["wifi-direct", "wifi-router", "mesh-cuenta", "celular", "rele"],
  },
  archivo: {
    retardoMaxMs: 1000,
    caudalMinKbps: 100,
    perdidaMaxPct: 5,
    fiabilidadMin: 0.99,
    prioridadAntena: ["wifi-direct", "wifi-router", "mesh-cuenta", "mesh-par", "bluetooth", "celular", "rele"],
  },
  "internet-compartido": {
    retardoMaxMs: 500,
    caudalMinKbps: 200,
    perdidaMaxPct: 3,
    fiabilidadMin: 0.95,
    prioridadAntena: ["wifi-router", "wifi-direct", "celular", "mesh-cuenta", "mesh-par"],
  },
};
```

**Autoenrutado inteligente (ejemplos):**
- **Videollamada:** video → Wi-Fi Direct (alta capacidad, baja latencia), audio → Wi-Fi router (estable), control → Bluetooth directo (fiable, bajo retardo).
- **Transferencia grande:** archivo → reparto Wi-Fi Direct (70%) + Wi-Fi router (30%) según capacidad medida.
- **Internet compartido:** puerta → Wi-Fi router (caudal sostenido) + celular (respaldo si Wi-Fi cae).
- **Solo LoRa disponible:** control → LoRa (mensajes cortos, 2 min vida), audio/video/archivo → NO DISPONIBLE (se informa al usuario).

---

## 3. Cola de tareas (3-6 tareas pequeñas)

**Archivo:** `starseed_memory_root/olas/cola-transporte-adaptativo-1119.json`

```json
{
  "ola": "transporte-adaptativo-1119",
  "tareas": [
    {
      "id": "TA1",
      "ola": "transporte-adaptativo-1119",
      "titulo": "Tipos puros y configuración base del transporte adaptativo",
      "archivos": [
        "src/lib/transporte-adaptativo/tipos.ts"
      ],
      "depende": [],
      "prompt": "Crear módulo puro `src/lib/transporte-adaptativo/tipos.ts` con: `TipoFlujo` (control|audio|video|archivo|internet-compartido), `ConfigLatidoPorFlujo`, `RequisitosFlujo`, `MetricasFlujo`, `MetricasGenesis`, `AntenaDisponible`, `EstadoTransferencia`, `PlanReanudacion`, `DecisionCalidad`. Exportar `CONFIG_LATIDO_POR_FLUJO` y `REQUISITOS_POR_FLUJO` como constantes. Sin dependencias externas, solo tipos. ≤120 líneas."
    },
    {
      "id": "TA2",
      "ola": "transporte-adaptativo-1119",
      "titulo": "Generador y monitor de latidos por flujo",
      "archivos": [
        "src/lib/transporte-adaptativo/latidos/generador.ts",
        "src/lib/transporte-adaptativo/latidos/monitor.ts"
      ],
      "depende": ["TA1"],
      "prompt": "Crear `generador.ts`: `GeneradorLatidos` que emite `LatidoFlujo { flujoId, tipo, seq, timestamp }` por cada flujo activo con intervalo configurable por `TipoFlujo` (usa `CONFIG_LATIDO_POR_FLUJO`). Crear `monitor.ts`: `MonitorLatidos` con ventana deslizante por `flujoId`, detecta `vivo|degradado|muerto` según `ventanaVida/ventanaDegradado`. Emite eventos `cambio-estado` y `latido-perdido`. Tests en `src/lib/transporte-adaptativo/latidos/__tests__/`. ≤120 líneas c/u."
    },
    {
      "id": "TA3",
      "ola": "transporte-adaptativo-1119",
      "titulo": "Reanudación de transferencias sin perder sesión",
      "archivos": [
        "src/lib/transporte-adaptativo/latidos/reanudacion.ts"
      ],
      "depende": ["TA1", "TA2"],
      "prompt": "Crear `reanudacion.ts`: `calcularPlanReanudacion(estado: EstadoTransferencia, nuevaAntena: string): PlanReanudacion`. Para archivos: usa `huecosDe()` y `primerFaltante()` de `archivos-malla.ts` (reexportar). Para flujos: conserva `ssrc` y secuencia, prepara renegociación ICE. Para control: integra con `SesionHacia.abrir(true)` de `control-remoto/canal.ts`. Para internet-compartido: reevalúa `sugerirComparticion()`. Tests puros. ≤120 líneas."
    },
    {
      "id": "TA4",
      "ola": "transporte-adaptativo-1119",
      "titulo": "Inventario y medición de antenas/medios",
      "archivos": [
        "src/lib/transporte-adaptativo/antenas/inventario.ts",
        "src/lib/transporte-adaptativo/antenas/medicion.ts"
      ],
      "depende": ["TA1"],
      "prompt": "Crear `inventario.ts`: `construirInventarioAntenas(): AntenaDisponible[]` que extiende `antennaInventory()` de `ai/astraura/mesh/antennas.ts` añadiendo Wi-Fi Direct, mesh-cuenta, mesh-par, rele, y campos `capacidadMaxKbps`, `retardoBaseMs`, `costeEnergetico`, `usaDatosMedidos`, `admite[TipoFlujo]`. Crear `medicion.ts`: `MedidorAntenas` que actualiza `rttMs`, `throughputKbps`, `perdidaPct`, `disponible` cada latido usando datos de `eleccion-enlace.ts` (enlaces P2P), `server-relay.ts` (relé), `mesh/store.ts` (LoRa). Tests con mocks. ≤120 líneas c/u."
    },
    {
      "id": "TA5",
      "ola": "transporte-adaptativo-1119",
      "titulo": "Selector de antena con histéresis y reparto multiantena",
      "archivos": [
        "src/lib/transporte-adaptativo/calidad/selector-antena.ts"
      ],
      "depende": ["TA1", "TA4"],
      "prompt": "Crear `selector-antena.ts`: `seleccionarAntena(ctx: ContextoSeleccion)` implementando algoritmo del §2.6: filtra por `admite[tipo]` y `disponible`, puntúa con `puntuarAntena()` (latencia 0.4, caudal 0.4, fiabilidad 0.2, penaliza coste/medidos), aplica histéresis (mantener actual si puntaje≥0.6 y diferencia<0.2), para archivo/internet-compartido devuelve reparto multiantena (`antenaId: "wifi-direct+wifi-router"`) si ≥2 antenas con puntaje>0.5. Usa `planReparto` de `eleccion-enlace.ts` para calcular reparto. Tests exhaustivos. ≤120 líneas."
    },
    {
      "id": "TA6",
      "ola": "transporte-adaptativo-1119",
      "titulo": "Bucle de calidad/caudal y registro visible para Genesis",
      "archivos": [
        "src/lib/transporte-adaptativo/calidad/bucle.ts",
        "src/lib/transporte-adaptativo/calidad/medidor.ts",
        "src/lib/transporte-adaptativo/registro/calidad-visible.ts"
      ],
      "depende": ["TA1", "TA2", "TA4", "TA5"],
      "prompt": "Crear `bucle.ts`: `BucleCalidad` que cada intervalo recopila `MetricasFlujo`, compara con `RequisitosFlujo`, emite `DecisionCalidad` (mantener/subir/bajar/cambiar-antena/pausar) con PID simple + histéresis (ventana 3 mediciones, confianza≥0.7 para cambiar antena). Crear `medidor.ts`: `MedidorGenesis` que agrega `MetricasGenesis` por flujo (serie temporal 60s, calidad 0-100, estado). Crear `calidad-visible.ts`: `RegistroCalidadVisible` que expone `getTablaFlujos()`, `getSerie(flujoId, metrica)`, `getAlertas()` para que Genesis pinte tabla y gráficas. Tests de integración con mocks de antenas. ≤120 líneas c/u."
    }
  ]
}
```

---

## 4. Integración con lo existente (puntos de conexión)

| Módulo nuevo | Conecta con | Cómo |
|--------------|-------------|------|
| `latidos/generador` | `control-remoto/canal.ts` | `SesionHacia` usa latidos de control (1s) para detectar degradación antes de los 2 min de `VIDA_ORDEN_MS` |
| `latidos/monitor` | `transporte-universal.ts` | `abrirFlujo` / `enviarArchivo` registran flujo en monitor; `iniciarTransporteUniversal` arranca generador global |
| `reanudacion` | `archivos-malla.ts`, `control-remoto/canal.ts` | `calcularPlanReanudacion` llama a `huecosDe/primerFaltante` y `SesionHacia.abrir(true)` |
| `antenas/inventario` | `eleccion-enlace.ts`, `antennas.ts` | `construirInventarioAntenas` consume `enlacesDisponibles()` y `antennaInventory()` |
| `antenas/medicion` | `eleccion-enlace.ts`, `server-relay.ts`, `mesh/store.ts` | `MedidorAntenas` lee `rttMs`, `capacidadKbps` de `EnlaceDisponible`; `status` de LoRa; `uploadRelay` latency |
| `selector-antena` | `eleccion-enlace.ts` | `seleccionarAntena` devuelve `antenaId` que `elegirEnlaces` respeta via `destino.enlaceId` forzado |
| `bucle` | `archivos-malla.ts`, `llamadas/*` | `DecisionCalidad` ajusta `bitrateKbps`, `fps`, `tamanoTrozo` pasando opciones a motores |
| `medidor` + `calidad-visible` | Genesis (`src/lib/mando/medidores.ts`) | `RegistroCalidadVisible` expone API que Genesis consume en medidor «Calidad de transporte» |

---

## 5. Reglas de implementación (recordatorio)

- **Puro, sin `node:*`**, testeable con `vitest` en `src/lib/transporte-adaptativo/__tests__/`.
- **≤ 3 archivos por tarea, ≤ 120 líneas por archivo** (escritura por trozos: esqueleto → completar).
- **Tests de comportamiento** por interfaz pública, no acoplados a implementación.
- **Sin `any`**. Textos en español neutro con acentos.
- **Nada de código de producto en esta tarea**: solo contrato y cola.
- **Puertas**: tsc → vitest → revisión → integración. Nada hecho hasta verse en Genesis de la Mac.