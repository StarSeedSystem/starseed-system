/**
 * Banco real de LLA1110D: DOS motores de llamada de verdad (MotorLlamada) en una página de Chromium, con
 * RTCPeerConnection reales y la cámara y el micro falsos de Chromium. Se unen por:
 *  · una señalización en bucle (presencia + señales), que puede soltar los candidatos ICE mientras «no hay IP»;
 *  · un enlace de datos simulado (como el Bluetooth L2CAP) con retardo, capacidad y pérdida controlables.
 * La «ruta IP» se controla con `redIp`: apagada, la señalización no entrega candidatos (ICE no puede conectar, como por
 * Bluetooth) y, en una conexión ya hecha, el estado ICE se fuerza a «failed» (simulación del corte a nivel de estado).
 * `hayRutaIp` (lo que el motor CREE) se controla aparte con `ipVista`, para reproducir la prueba 33 (IP real, «sin IP» visto).
 */
import { MotorLlamada } from "@/lib/llamadas/motor";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";
import { fabricaCodecsSimples, type AudioVoz, type TransporteVoz } from "@/lib/llamadas/voz-datos/sesion";
import type { ConexionCanal } from "@/lib/llamadas/senalizacion";
import type { MetaPresencia, SenalLlamada } from "@/lib/llamadas/tipos";
import type { MuestraCarril } from "@/lib/llamadas/carriles";
// MLL1111C: la cola del timbre (en el árbol viejo no existe: el módulo llega vacío y se usa el intento único de antes).
import * as ColaTimbre from "@/lib/malla/cola-timbre";
import { crearFabricaCodecsWeb } from "@/lib/llamadas/voz-datos/audio-web";
import * as PaqueteVoz from "@/lib/llamadas/voz-datos/paquete";
import * as transporteVoz from "@/lib/llamadas/voz-datos/transporte";
import { crearFabricaVideoWeb, crearFuenteDePista, crearSalidaVideoWeb } from "@/lib/llamadas/video-datos/codec-web";
// LLA1112A (B): qué motor lleva la llamada a una neurona con enlace local Y Bluetooth (en el árbol viejo no existe: llega
// vacío y la llamada va, como entonces, por la llamada directa) y la llamada directa misma, con un enlace local de mentira.
import * as RutaLlamada from "@/lib/llamadas/ruta-llamada-neurona";
import * as Directa from "@/lib/malla/llamada-directa";
import * as RegistroLocal from "@/lib/malla/registro-enlaces-locales";
import type { SalidaVideo } from "@/lib/llamadas/video-datos/tipos";

type Linea = { t: number; hito: string; neurona: string | null; detalle: string };
const lineas: Linea[] = [];
const t0 = performance.now();
fijarSumideroDiagnostico((l) => lineas.push({ t: Math.round(performance.now() - t0), ...l }));

/*
 * LLA1113A · Temporizadores LENTOS de la página (prueba 40, Mac sin nadie delante): WebKit alinea los temporizadores de una
 * página oculta o tapada a 1 s. La firma en el registro del aparato: «espera=992…1015/0ms» en `video-datos reparto` y
 * `voz-datos nivel` (la espera medida es el hueco entre dos muestras de 20 ms que llegaron con 1 s entre medias, y el máximo
 * queda en 0), 48 veces en las dos llamadas limpias y ninguna en las rondas anteriores. El motor ve sus setInterval/
 * setTimeout de la página por `__bancoT` (ver `construir.mjs`); con `lentos.activo` cada uno corre como mucho una vez por
 * segundo y los plazos cortos se alargan hasta el siguiente segundo entero. Lo del banco (carril, oído) sigue con los reales.
 */
const lentos = { activo: false };
{
  const RI = window.setInterval.bind(window);
  const CI = window.clearInterval.bind(window);
  const RT = window.setTimeout.bind(window);
  const CT = window.clearTimeout.bind(window);
  (globalThis as unknown as { __bancoT: unknown }).__bancoT = {
    setInterval: (f: (...x: unknown[]) => void, ms?: number, ...x: unknown[]) => {
      const p = Math.max(0, Number(ms) || 0);
      if (p >= 1000) return RI(f, p, ...x);
      let ult = -Infinity;
      return RI(() => {
        const ahora = Date.now();
        if (lentos.activo && ahora - ult < 990) return;
        ult = ahora;
        f(...x);
      }, p);
    },
    setTimeout: (f: (...x: unknown[]) => void, ms?: number, ...x: unknown[]) => {
      const p = Math.max(0, Number(ms) || 0);
      if (!lentos.activo || p >= 1000) return RT(f, p, ...x);
      const ahora = Date.now();
      return RT(f, Math.ceil((ahora + p + 1) / 1000) * 1000 - ahora, ...x);
    },
    clearInterval: (id: number) => CI(id),
    clearTimeout: (id: number) => CT(id),
  };
}

/* ── Ruta IP simulada: por PC, con estado forzado mientras está cortada ── */
const red = {
  ip: true,
  retardoIceMs: 1500,
  ipVista: { A: true as boolean | null, B: true as boolean | null },
  // MLL1111C: «estado» fuerza ICE a «failed» al cortar (como antes); «silencio» deja ICE «conectado» y congela los bytes de
  // entrada (lo que pasa de verdad al apagar el Wi-Fi del otro: ICE tarda 5–30 s en enterarse).
  modoCorte: "estado" as "estado" | "silencio",
};
const PCReal = window.RTCPeerConnection;
const pcs: RTCPeerConnection[] = [];
class PCBanco extends PCReal {
  constructor(c?: RTCConfiguration) {
    super(c);
    pcs.push(this);
  }
  get iceConnectionState(): RTCIceConnectionState {
    return red.ip || red.modoCorte === "silencio" ? super.iceConnectionState : super.iceConnectionState === "new" ? "new" : "failed";
  }
  get connectionState(): RTCPeerConnectionState {
    return red.ip || red.modoCorte === "silencio" ? super.connectionState : super.connectionState === "new" ? "new" : "failed";
  }
  private congelado: RTCStatsReport | null = null;
  // MLL1111C: con la IP cortada no entra nada: los contadores de getStats se quedan donde estaban.
  async getStats(sel?: MediaStreamTrack | null): Promise<RTCStatsReport> {
    if (!red.ip && this.congelado) return this.congelado;
    const r = await super.getStats(sel ?? null);
    if (red.ip && !sel) this.congelado = r;
    return r;
  }
}
(window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCBanco;
function cambiarRedIp(on: boolean, o: { senal?: boolean } = {}) {
  red.ip = on;
  // MLL1111C: la señal del sistema (online/offline) cuando la hay; sin ella, solo la comprobación de vida.
  if (o.senal) window.dispatchEvent(new Event(on ? "online" : "offline"));
  for (const pc of pcs) {
    try {
      pc.dispatchEvent(new Event("iceconnectionstatechange"));
      pc.dispatchEvent(new Event("connectionstatechange"));
    } catch {
      /* cerrada */
    }
  }
}

/* ── Señalización en bucle ── */
interface Extremo {
  meta: MetaPresencia | null;
  pres: Set<(p: MetaPresencia[]) => void>;
  sen: Set<(s: SenalLlamada) => void>;
}
const cuenta = { ofertasSinIp: 0, ofertas: 0, iceTirados: 0 };
function bucleSenal(sesionId: string): [() => ConexionCanal, () => ConexionCanal] {
  const ex: [Extremo, Extremo] = [
    { meta: null, pres: new Set(), sen: new Set() },
    { meta: null, pres: new Set(), sen: new Set() },
  ];
  const lista = () => ex.map((e) => e.meta).filter((m): m is MetaPresencia => !!m);
  const avisarPres = () => setTimeout(() => ex.forEach((e) => e.pres.forEach((cb) => cb(lista()))), 30);
  const conn = (i: 0 | 1): ConexionCanal => {
    const yo = ex[i];
    const otro = ex[1 - i];
    let suelto = false;
    return {
      sesionId,
      tema: `directo:${sesionId}`,
      clave: () => yo.meta?.id ?? "",
      suscrito: () => !suelto,
      estado: () => "dentro",
      presencia: () => lista(),
      onPresencia: (cb) => (yo.pres.add(cb), () => void yo.pres.delete(cb)),
      onSenal: (cb) => (yo.sen.add(cb), () => void yo.sen.delete(cb)),
      onSuscrito: (cb) => (setTimeout(() => cb(true), 10), () => undefined),
      onEstado: () => () => undefined,
      enviar: (s) => {
        if (suelto) return;
        let x = s;
        if (s.tipo === "senal") {
          if (s.desc?.type === "offer") {
            cuenta.ofertas++;
            if (!red.ip) cuenta.ofertasSinIp++;
          }
          // Sin IP, los candidatos no sirven: no se entregan (por Bluetooth ICE nunca conecta).
          if (s.ice && !red.ip) {
            cuenta.iceTirados += s.ice.length;
            if (!s.desc) return;
            x = { ...s, ice: undefined };
          }
        }
        // Los candidatos tardan lo que tarda ICE de verdad en un aparato (≈1.5 s en la prueba 33).
        setTimeout(() => otro.sen.forEach((cb) => cb(x)), x.tipo === "senal" && x.ice ? red.retardoIceMs : 40);
      },
      publicar: (m) => {
        yo.meta = m;
        avisarPres();
      },
      retirar: () => {
        yo.meta = null;
        avisarPres();
      },
      soltar: () => {
        suelto = true;
      },
    };
  };
  return [() => conn(0), () => conn(1)];
}

/* ── Enlace de datos simulado (Bluetooth L2CAP): retardo, capacidad, pérdida ── */
const datos = { arriba: true, retardoMs: 60, kbps: 165, perdida: 0 };
function enlaceDatos(): [TransporteVoz, TransporteVoz] {
  const oy: [Set<(t: string) => void>, Set<(t: string) => void>] = [new Set(), new Set()];
  const libre = [0, 0];
  const lado = (i: 0 | 1): TransporteVoz => ({
    enviar(texto) {
      if (!datos.arriba) return "cerrado";
      if (Math.random() < datos.perdida) return "ok";
      const ahora = performance.now();
      const ms = (texto.length * 8) / datos.kbps;
      libre[i] = Math.max(libre[i], ahora) + ms;
      const llega = libre[i] - ahora + datos.retardoMs;
      setTimeout(() => {
        if (datos.arriba) oy[1 - i].forEach((cb) => cb(texto));
      }, llega);
      return "ok";
    },
    ocupado: () => libre[i] - performance.now() > 120,
    alRecibir: (cb) => (oy[i].add(cb), () => void oy[i].delete(cb)),
    abierto: () => datos.arriba,
    info: () => ({ tipo: "ble", cifrada: true }),
    capacidadKbps: () => datos.kbps,
  });
  return [lado(0), lado(1)];
}

/* ── (LLA1111B) Enlace como el Bluetooth de verdad (bluetooth-directo-motor): carriles de voz y de vídeo con prioridad
 * estricta (la voz primero), cada escritura agrupa lo que haya en UN carril (hasta 16 KiB), parada y espera (la
 * siguiente escritura no sale hasta el acuse: serialización + ida y vuelta), bytes contados hasta el acuse, tope de la
 * cola de voz 6 KiB y de vídeo 24 KiB (se tira lo más viejo). Mide la voz (pérdida, tránsito, espera tras vídeo) y lo
 * que llega de vídeo. `ble.kbps` se puede cambiar a mitad de llamada; `capacidadKbps()` dice lo anunciado al abrir. ── */
const ble = { kbps: 160, rttMs: 42, perdida: 0, maxTrama: 16 * 1024, plazoVozMs: 200, anunciadoKbps: 160, cifrado: false };
/**
 * (VOZ1111J) Lo que pesa una escritura EN EL AIRE: un texto solo va tal cual; varios, en un `nl.lote` (JSON de JSON: cada
 * comilla interior se escapa) como `armarTrama` de `malla/red-local-nativa.ts`. Con `ble.cifrado` (el enlace de la Mac y
 * la tableta cifra, CIF1108A) el cuerpo sale en `{"t":"nl.cif",…,"c":<base64>}`: 4/3 del cuerpo + ≈ 96 B por escritura.
 */
function bytesAire(lote: string[]): number {
  const cuerpo = lote.length > 1 ? JSON.stringify({ t: "nl.lote", m: lote }).length : lote[0].length;
  return ble.cifrado ? Math.ceil(cuerpo / 3) * 4 + 96 : cuerpo;
}
/** (VOZ1111J) Lee un paquete de voz en cualquier formato que entienda el árbol probado: unidades de 20 ms que trae. */
type LectorVoz = (t: string, ahora?: number) => { ts: number; unidades: number[] } | null;
const lectorNuevo = (PaqueteVoz as unknown as { unidadesPaqueteVoz?: LectorVoz }).unidadesPaqueteVoz;
const leerVoz: LectorVoz =
  typeof lectorNuevo === "function"
    ? lectorNuevo
    : (t) => {
        if (!t.startsWith('{"t":"voz.p"')) return null;
        const p = PaqueteVoz.leerPaquete(t);
        return p ? { ts: p.ts, unidades: p.tramas.map((_, k) => p.q + k) } : null;
      };
interface MedidaSentido {
  vozTramas: Set<number>;
  vozQMin: number;
  vozQMax: number;
  transitos: number[];
  tarde: number;
  esperaTrasVideoMax: number;
  esperasTrasVideo: number;
  escrituras: number;
  escriturasVideo: number;
  escriturasMixtas: number;
  bytesVoz: number;
  bytesVideo: number;
  tirados: number;
  esperasLargas: Array<{ t: number; ms: number; solo: boolean; kbps: number }>;
  /** (VOZ1111J) Paquetes de voz que entraron y bytes que salieron al aire. */
  paquetesVoz: number;
  bytesAire: number;
}
const nuevaMedida = (): MedidaSentido => ({ vozTramas: new Set(), vozQMin: Infinity, vozQMax: -1, transitos: [], tarde: 0, esperaTrasVideoMax: 0, esperasTrasVideo: 0, escrituras: 0, escriturasVideo: 0, escriturasMixtas: 0, bytesVoz: 0, bytesVideo: 0, tirados: 0, paquetesVoz: 0, bytesAire: 0, esperasLargas: [] });
const medida: Record<"AB" | "BA", MedidaSentido> = { AB: nuevaMedida(), BA: nuevaMedida() };
// En el árbol viejo no existe (sale `undefined`): el banco usa entonces el umbral de antes.
const vozOcupada = (transporteVoz as { vozOcupada?: (c: number, u: number, v: number | undefined, a: number) => boolean }).vozOcupada;
const esVideoTxt = (t: string) => t.startsWith('{"t":"voz.v"');
/**
 * (LLA1111Q) Carril CALIBRADO con el registro de la prueba 37 (Mac ↔ tableta por Bluetooth, 11-11 19:19–19:21 UTC). El
 * carril fijo de arriba es exactamente lo que suponía el modelo (capacidad fija, acuse fijo de 42 ms, sin límite de
 * escrituras) y por eso no podía fallar como el aparato. De dónde sale cada número:
 *  · Acuse por escritura `R` = 25 + Exp(media 30) ms, tope 115 ms, casi independiente del tamaño: ida y vuelta del
 *    autotest 48–75 ms; lo que leyó el modelo en las escrituras pequeñas, «+23ms» a «+124ms» (Mac `enlace=15k+32ms`,
 *    `56k+97ms`, `116k+124ms`; tableta `38k+106ms`, `49k+120ms`).
 *  · Serialización `C` = 35–70 B de aire por ms en cada escritura: el canal rápido mide sus propios mensajes de 4–6 KB
 *    en 104–201 ms (`l2cap-kbps … kbps=380 (4942 B en 104 ms)`, `kbps=192 (4834 B en 201 ms)`, `kbps=261 (6206 B en
 *    190 ms)`): con el acuse de arriba quedan 35–90 B/ms; 35–70 da una mediana de ≈ 255 kb/s en mensajes de 5 KB
 *    (la mediana de las 8 líneas del día es 258).
 *  · Cifrado como el enlace real (CIF1108A, `sesion-cifrada.ts`): base64 (4/3) + `SOBRECARGA_FIJA` (96 B) por escritura,
 *    y el claro de una escritura hasta `limitesParaCifrado(16 KiB)` = 11 816 B y 32 textos por lote (`MAX_POR_LOTE`).
 *  · El emisor de verdad (`bluetooth-directo-motor.ts`, `bombear`): parada y espera, control > voz/datos por turnos >
 *    vídeo, y la CUBETA de escrituras (`nuevaCubeta`: el otro admite 120 mensajes / 10 s; se manda al 60 % con ráfaga
 *    del 30 % → 36 de ráfaga y 7,2 escrituras/s sostenidas). Cada escritura gasta una ficha, sea del tamaño que sea.
 *  · Lo demás que va por el mismo enlace: la señalización de la llamada (Mac «senal-enviada app via=ble» a las :47,5,
 *    :51,5, :55,5, :59,5…: cada ≈ 4 s, más la presencia cada 10 s → una cada 3,3 s, ≈ 400 B, por control) y el espejo del registro (BLE1109B, mensajes de 4–6 KB: los que mide `l2cap-kbps`, ≈ cada
 *    30 s, por datos).
 *  · Lo que la app nativa mide (`l2cap-kbps`, mensajes ≥ 2 KiB: bytes·8 / ida y vuelta) llega a la web como
 *    `capacidadKbps` del enlace; empieza en 261 (la línea de las 19:19:45, justo antes de la llamada).
 */
const bleReal = {
  activo: false,
  rMinMs: 25,
  rExtraMediaMs: 30,
  rMaxMs: 115,
  cMinBporMs: 35,
  cMaxBporMs: 70,
  fichasCap: 36,
  fichasPorMs: 72 / 10_000,
  maxClaroTrama: 11_816,
  maxPorLote: 32,
  controlCadaMs: 3300,
  controlBytes: 400,
  espejoCadaMs: 30_000,
  espejoBytes: 5000,
  kbpsNativoInicial: 261,
  semilla: 37,
  /**
   * LLA1112A: el lado B (la tableta) escribe más despacio y A RÁFAGAS (null: los dos lados iguales, el `ble-real` de siempre).
   * Sale de la única llamada válida de la prueba 39 (03:47:04–03:47:54 UTC, Mac en reposo), líneas de la tableta:
   *  · acuse por escritura más largo: el modelo de la tableta lee `enlace=160k+70ms` y `+85ms` (la Mac, `+13ms` a `+59ms`)
   *    → R = 45 + Exp(35) ms, tope 160;
   *  · serialización más lenta: la tableta mide `l2cap-kbps … kbps=162 (2586 B en 127 ms)` (la Mac, 171–381 kb/s en el
   *    mismo minuto) → 20–45 B de aire por ms;
   *  · a ráfagas: su voz espera `espera=164/155ms` (p90/máx) con `esc=6x621` y `esc=5x57` (escrituras pequeñas y pocas), la
   *    Mac oye su voz con `inventado=67%` en sus peores 5 s y la tableta registra `tardias=994 … jitter=400ms` de la voz de
   *    la Mac: los dos sentidos se le atascan a la vez, que es lo que hace una pausa del aparato (radio o hilo de la
   *    WebView) y no la capacidad. Se modela como PARADAS del lado B: cada Exp(media `paradaCadaMs`) ms, durante
   *    U(`paradaMinMs`, `paradaMaxMs`) ms, B ni escribe ni entrega a su web lo que le llega; al acabar sale todo junto.
   *  · lo que mide su app nativa empieza en 162 (la línea de las 03:47:52).
   */
  ladoB: null as null | {
    rMinMs: number;
    rExtraMediaMs: number;
    rMaxMs: number;
    cMinBporMs: number;
    cMaxBporMs: number;
    kbpsNativoInicial: number;
    paradaCadaMs: number;
    paradaMinMs: number;
    paradaMaxMs: number;
  },
};
/** LLA1112A: lo que dice `bleReal.ladoB` para la tableta del registro de la prueba 39. */
const LADO_TABLETA_39 = { rMinMs: 45, rExtraMediaMs: 35, rMaxMs: 160, cMinBporMs: 20, cMaxBporMs: 45, kbpsNativoInicial: 162, paradaCadaMs: 2000, paradaMinMs: 150, paradaMaxMs: 450 };
/** LLA1112A: hasta cuándo está parado el lado B (ms de `performance.now()`), y cuántas paradas hubo. */
const paradaB = { hasta: 0, n: 0, ms: 0 };
/** Generador con semilla (mulberry32): cada corrida del carril calibrado ve la misma secuencia de acuses. */
function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** (LLA1111Q) Lo que midió cada lado en el carril calibrado (para el informe del caso). */
const medidaReal = { escrituras: [0, 0], esperaFichaMs: [0, 0], kbpsNativo: [0, 0], acuses: [[] as number[], [] as number[]] };
const temporizadoresReal: Array<ReturnType<typeof setInterval>> = [];
function enlaceBle(): [TransporteVoz, TransporteVoz] {
  const oy: [Set<(t: string) => void>, Set<(t: string) => void>] = [new Set(), new Set()];
  // LLA1112A: lo que llega al lado B mientras está parado se le entrega junto, en orden, al acabar la parada.
  const retenidos: string[] = [];
  let soltarRetenidos: ReturnType<typeof setTimeout> | null = null;
  const entregar = (a: 0 | 1, t: string) => {
    const espera = a === 1 && bleReal.ladoB ? paradaB.hasta - performance.now() : 0;
    if (espera <= 0 && !retenidos.length) {
      oy[a].forEach((cb) => cb(t));
      return;
    }
    retenidos.push(t);
    if (soltarRetenidos) return;
    const vaciar = () => {
      const e = paradaB.hasta - performance.now();
      if (e > 0) {
        soltarRetenidos = setTimeout(vaciar, e);
        return;
      }
      soltarRetenidos = null;
      for (const x of retenidos.splice(0)) oy[1].forEach((cb) => cb(x));
    };
    soltarRetenidos = setTimeout(vaciar, Math.max(0, espera));
  };
  if (bleReal.activo && bleReal.ladoB) {
    // Paradas del lado B: cada Exp(media) ms, una de U(min, max) ms.
    const rndP = azar(bleReal.semilla + 4242);
    const prog = () => {
      const lb = bleReal.ladoB;
      if (!lb) return;
      const cada = -lb.paradaCadaMs * Math.log(1 - rndP() * 0.999);
      const h = setTimeout(() => {
        const dur = lb.paradaMinMs + rndP() * (lb.paradaMaxMs - lb.paradaMinMs);
        paradaB.hasta = performance.now() + dur;
        paradaB.n++;
        paradaB.ms += dur;
        prog();
      }, cada);
      temporizadoresReal.push(h as unknown as ReturnType<typeof setInterval>);
    };
    prog();
  }
  const lado = (i: 0 | 1): TransporteVoz => {
    const sentido = i === 0 ? "AB" : "BA";
    const voz: string[] = [];
    const vid: string[] = [];
    // LLA1111Q (carril calibrado): control (señalización) y datos (espejo del registro) del mismo enlace.
    const ctl: string[] = [];
    const dat: string[] = [];
    const real = bleReal.activo;
    const rnd = azar(bleReal.semilla + i * 7919);
    // LLA1112A: el lado B con sus números si el caso lo pide (la tableta del registro de la prueba 39).
    const P = real && i === 1 && bleReal.ladoB ? { ...bleReal, ...bleReal.ladoB } : bleReal;
    const parado = () => (i === 1 && bleReal.ladoB ? paradaB.hasta - performance.now() : 0);
    let fichas = bleReal.fichasCap;
    let fichasEn = performance.now();
    let turnoVoz = true;
    let kbpsNativo = P.kbpsNativoInicial;
    medidaReal.kbpsNativo[i] = kbpsNativo;
    let bVoz = 0;
    let bVid = 0;
    let entrados = 0;
    let ultimoVideo = 0;
    let bombeando = false;
    let enVuelo: { soloVideo: boolean; ack: number; bytesVideo: number } | null = null;
    // LLA1111Q: lo que el emisor mide de cada escritura del carril de la llamada (como `escriturasLlamada` del motor).
    const escrituras: Array<{ fin: number; ms: number; bytes: number }> = [];
    const juntoVoz = new Set<(audio: boolean) => void>();
    const dormir = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
    const tomarFicha = async () => {
      for (;;) {
        const ahora = performance.now();
        fichas = Math.min(bleReal.fichasCap, fichas + (ahora - fichasEn) * bleReal.fichasPorMs);
        fichasEn = ahora;
        if (fichas >= 1) {
          fichas -= 1;
          return;
        }
        const e = Math.max(1, Math.ceil((1 - fichas) / bleReal.fichasPorMs));
        medidaReal.esperaFichaMs[i] += e;
        await dormir(e);
      }
    };
    if (real) {
      // Señalización de la llamada y espejo del registro, como en el aparato (ver `bleReal`).
      const relleno = (t: string, n: number) => JSON.stringify({ t, x: "x".repeat(Math.max(0, n - 20)) });
      const hCtl = setInterval(() => {
        if (!datos.arriba) return;
        ctl.push(relleno("llc.senal", bleReal.controlBytes));
        void bombear();
      }, bleReal.controlCadaMs);
      const hDat = setInterval(() => {
        if (!datos.arriba) return;
        dat.push(relleno("ble.espejo", bleReal.espejoBytes));
        void bombear();
      }, bleReal.espejoCadaMs);
      temporizadoresReal.push(hCtl, hDat);
    }
    const bombear = async () => {
      if (bombeando) return;
      bombeando = true;
      while (datos.arriba && (voz.length || vid.length || ctl.length || dat.length)) {
        const m = medida[sentido];
        // AUDIO > VÍDEO (como `bombear` del motor Bluetooth); en el carril calibrado, control primero y voz/datos por turnos.
        let lista: string[];
        if (ctl.length) lista = ctl;
        else if (voz.length && dat.length) {
          lista = turnoVoz ? voz : dat;
          turnoVoz = !turnoVoz;
        } else if (voz.length) lista = voz;
        else if (vid.length) lista = vid;
        else lista = dat;
        const deVoz = lista === voz;
        const deVid = lista === vid;
        const lote: string[] = [];
        let n = 0;
        const maxTrama = real ? bleReal.maxClaroTrama : ble.maxTrama;
        while (lista.length && (n === 0 || (n + lista[0].length <= maxTrama && (!real || lote.length < bleReal.maxPorLote)))) {
          n += lista[0].length;
          lote.push(lista.shift()!);
        }
        if (real) await tomarFicha();
        // LLA1112A: mientras el lado B está parado no escribe (lo que se junte sale en la escritura siguiente).
        while (parado() > 0) await dormir(parado());
        const conVideo = lote.some(esVideoTxt);
        const conVoz = (deVoz || deVid) && lote.some((t) => !esVideoTxt(t));
        m.escrituras++;
        if (conVideo && !conVoz) m.escriturasVideo++;
        if (conVideo && conVoz) m.escriturasMixtas++;
        let aire = bytesAire(lote);
        let serial: number;
        let acuse: number;
        if (real) {
          aire = Math.ceil(aire / 3) * 4 + 96; // cifrado del enlace (si `ble.cifrado` no lo ha puesto ya)
          if (ble.cifrado) aire = bytesAire(lote);
          const c = P.cMinBporMs + rnd() * (P.cMaxBporMs - P.cMinBporMs);
          serial = aire / c;
          acuse = Math.min(P.rMaxMs, P.rMinMs - P.rExtraMediaMs * Math.log(1 - rnd() * 0.999));
          medidaReal.escrituras[i]++;
          if (medidaReal.acuses[i].length < 5000) medidaReal.acuses[i].push(Math.round(acuse));
          // Lo que mide la app nativa (`l2cap-kbps`): mensajes ≥ 2 KiB, bytes·8 / ida y vuelta.
          if (aire >= 2048) {
            kbpsNativo = Math.round((aire * 8) / (serial + acuse));
            medidaReal.kbpsNativo[i] = kbpsNativo;
          }
        } else {
          serial = (aire * 8) / ble.kbps;
          acuse = ble.rttMs;
        }
        m.bytesAire += aire;
        const t0 = performance.now();
        const bytesVideoLote = lote.filter(esVideoTxt).reduce((a, t) => a + t.length, 0);
        enVuelo = { soloVideo: conVideo && !conVoz, ack: t0 + serial + acuse, bytesVideo: bytesVideoLote };
        const perdida = Math.random() < ble.perdida;
        await dormir(serial + acuse / 2);
        // LLA1112A: una parada del lado B con la escritura en vuelo la alarga hasta que acaba (la radio se paró con ella).
        if (parado() > 0) {
          const extra = parado();
          await dormir(extra);
          enVuelo.ack += extra;
        }
        if (!perdida && datos.arriba && (deVoz || deVid)) {
          const ahora = Date.now();
          // LLA1112A: si el que recibe es el lado B y está parado, lo recibe al acabar la parada.
          const retenB = i === 0 && bleReal.ladoB ? Math.max(0, paradaB.hasta - performance.now()) : 0;
          for (const t of lote) {
            if (!esVideoTxt(t)) {
              const p = leerVoz(t, ahora);
              if (p) {
                for (const u of p.unidades) m.vozTramas.add(u);
                const tr = ahora + retenB - p.ts;
                m.transitos.push(tr);
                if (tr > ble.plazoVozMs) m.tarde++;
              }
            }
            entregar((1 - i) as 0 | 1, t);
          }
        }
        await dormir(enVuelo.ack - performance.now());
        enVuelo = null;
        if (deVoz || deVid) {
          const fin = performance.now();
          escrituras.push({ fin, ms: Math.max(1, fin - t0), bytes: n });
          if (escrituras.length > 32) escrituras.splice(0, escrituras.length - 32);
        }
        // Los bytes cuentan hasta el acuse, como en el Bluetooth de la Mac.
        if (deVoz) bVoz -= n;
        else if (deVid) bVid -= n;
      }
      bombeando = false;
    };
    return {
      enviar(t) {
        if (!datos.arriba) return "cerrado";
        const m = medida[sentido];
        const pv = esVideoTxt(t) ? null : leerVoz(t, Date.now());
        if (pv) {
          m.paquetesVoz++;
          for (const u of pv.unidades) {
            m.vozQMin = Math.min(m.vozQMin, u);
            m.vozQMax = Math.max(m.vozQMax, u);
          }
          // Espera que le pone el VÍDEO a este paquete de voz: si sale una escritura solo de vídeo, lo que le falta (con su
          // acuse); si no, lo que tardan en serializarse los bytes de vídeo que van delante (en la escritura en vuelo y en el carril).
          const delante = voz.filter(esVideoTxt).reduce((a, x) => a + x.length, 0);
          // LLA1111Q: en el carril calibrado, a la serialización media del aire (cifrado: 4/3) y no a `ble.kbps`.
          const porMs = real ? ((P.cMinBporMs + P.cMaxBporMs) / 2) * 0.75 : ble.kbps / 8; // LLA1112A: la del lado que escribe
          const e = enVuelo?.soloVideo ? enVuelo.ack - performance.now() : (delante + (enVuelo?.bytesVideo ?? 0)) / porMs;
          if (e > 0) m.esperasTrasVideo++;
          // VOZ1111L: también CUÁNDO (para saber si la espera larga es de la caída, de la vuelta o de siempre).
          if (e > 200) m.esperasLargas.push({ t: Math.round(performance.now()), ms: Math.round(e), solo: !!enVuelo?.soloVideo, kbps: ble.kbps });
          m.esperaTrasVideoMax = Math.max(m.esperaTrasVideoMax, Math.round(e));
        }
        if (esVideoTxt(t)) {
          m.bytesVideo += t.length;
          ultimoVideo = Date.now();
        } else m.bytesVoz += t.length;
        voz.push(t);
        bVoz += t.length;
        entrados += t.length;
        let tiro = false;
        while (bVoz > 6 * 1024 && voz.length > 1) {
          bVoz -= voz.shift()!.length;
          m.tirados++;
          tiro = true;
        }
        // Como el motor: el bombeo arranca en una microtarea (lo encolado en el mismo turno va en la misma escritura).
        void Promise.resolve().then(() => bombear());
        if (!esVideoTxt(t)) for (const cb of Array.from(juntoVoz)) cb(!!pv); // LLA1111Q (`alSalirVoz`)
        return tiro ? "descartado" : "ok";
      },
      enviarVideo(t) {
        if (!datos.arriba) return "cerrado";
        const m = medida[sentido];
        m.bytesVideo += t.length;
        vid.push(t);
        bVid += t.length;
        let tiro = false;
        while (bVid > 24 * 1024 && vid.length > 1) {
          bVid -= vid.shift()!.length;
          tiro = true;
        }
        void Promise.resolve().then(() => bombear());
        return tiro ? "descartado" : "ok";
      },
      // Igual que `crearTransporteVozHacia` (voz-datos/transporte.ts) en la versión que se pruebe.
      ocupado: () => (typeof vozOcupada === "function" ? vozOcupada(bVoz, 2048, ultimoVideo || undefined, Date.now()) : bVoz > 2048),
      colaVozBytes: () => bVoz,
      escrituras: () => escrituras.slice(),
      alSalirVoz: (cb: (audio: boolean) => void) => (juntoVoz.add(cb), () => void juntoVoz.delete(cb)),
      // LLA1111Q: el carril calibrado lleva la cubeta del motor (7,2 escrituras/s); el fijo no tiene tope.
      escriturasPorS: () => (real ? Math.round(bleReal.fichasPorMs * 10_000) / 10 : null),
      colaVideoBytes: () => bVid,
      topeColaVideoBytes: () => 24 * 1024,
      bytesEntrados: () => entrados,
      videoEnCarril: () => Date.now() - ultimoVideo < 2000, // VOZ1111J (como `crearTransporteVozHacia`)
      alRecibir: (cb) => (oy[i].add(cb), () => void oy[i].delete(cb)),
      abierto: () => datos.arriba,
      info: () => ({ tipo: "ble", cifrada: true }),
      // LLA1111Q: en el carril calibrado, lo último que midió la app nativa (como `enlaces()[…].capacidadKbps`).
      capacidadKbps: () => (real ? kbpsNativo : ble.anunciadoKbps),
    } as TransporteVoz;
  };
  return [lado(0), lado(1)];
}

/* ── (LLA1111B) Lo que se pinta de vídeo ligero en cada lado (marca de tiempo de cada imagen) ── */
const pintadas: Record<"A" | "B", number[]> = { A: [], B: [] };
function salidaContada(quien: "A" | "B"): SalidaVideo | null {
  const s = crearSalidaVideoWeb();
  if (!s) return null;
  const pintar = s.pintar.bind(s);
  s.pintar = (img) => {
    pintadas[quien].push(performance.now());
    pintar(img);
  };
  return s;
}

/* ── Audio falso de la voz por datos: tono de 20 ms; cuenta lo que se reproduce ── */
/**
 * (VOZ1111J) Oído del banco: cada 2 s el que habla manda una MARCA (60 ms del tono a 2,5×) y el que oye la detecta al
 * reproducirla: boca-oído = cuándo se reprodujo − cuándo se capturó. Un HUECO audible es una trama reproducida casi
 * muda (la ocultación que se apaga o el silencio de un vaciado) o 60 ms o más sin reproducir nada.
 */
const audio = { reproducidas: { A: 0, B: 0 }, sesiones: { A: 0, B: 0 } };
const oido = {
  marcas: { A: [] as number[], B: [] as number[] },
  bocaOido: { A: [] as number[], B: [] as number[] },
  huecos: { A: [] as Array<{ t: number; ms: number; sinSonar?: boolean }>, B: [] as Array<{ t: number; ms: number; sinSonar?: boolean }> },
  ultima: { A: 0, B: 0 },
  enHueco: { A: 0, B: 0 },
  enMarca: { A: false, B: false },
  rms: { A: [] as number[], B: [] as number[] },
};
const AMP_TONO = 8000;
function audioFalso(quien: "A" | "B"): AudioVoz {
  let t: ReturnType<typeof setInterval> | null = null;
  const otro = quien === "A" ? "B" : "A";
  const cerrarHueco = (ahora: number) => {
    if (oido.enHueco[quien]) {
      oido.huecos[quien].push({ t: oido.enHueco[quien], ms: Math.round(ahora - oido.enHueco[quien]) });
      oido.enHueco[quien] = 0;
    }
  };
  return {
    async iniciar(alTrama) {
      audio.sesiones[quien]++;
      let fase = 0;
      let n = 0;
      t = setInterval(() => {
        const marca = n % 100 < 3;
        if (n % 100 === 0) oido.marcas[quien].push(performance.now());
        n++;
        const amp = marca ? AMP_TONO * 2.5 : AMP_TONO;
        const pcm = new Int16Array(320);
        for (let k = 0; k < 320; k++) pcm[k] = Math.round(amp * Math.sin((fase++ * 2 * Math.PI * 440) / 16000));
        alTrama(pcm);
      }, 20);
      return true;
    },
    reproducir(pcm: Int16Array) {
      audio.reproducidas[quien]++;
      const ahora = performance.now();
      let s = 0;
      for (let k = 0; k < pcm.length; k++) s += pcm[k] * pcm[k];
      const rms = Math.sqrt(s / Math.max(1, pcm.length));
      if (oido.rms[quien].length < 4000) oido.rms[quien].push(Math.round(rms));
      const nominal = AMP_TONO / Math.SQRT2;
      // Marca: subida por encima de 1,6× lo normal → boca-oído contra la última marca del otro (cada 2 s, sin ambigüedad).
      if (rms > nominal * 1.6) {
        if (!oido.enMarca[quien]) {
          const e = oido.marcas[otro].filter((x) => x <= ahora && ahora - x < 1900).pop();
          if (e !== undefined) oido.bocaOido[quien].push(Math.round(ahora - e));
        }
        oido.enMarca[quien] = true;
      } else oido.enMarca[quien] = false;
      // Sin reproducir nada ≥ 60 ms: hueco (lo que el temporizador de 20 ms no dio).
      const prev = oido.ultima[quien];
      if (prev && ahora - prev >= 60 && !oido.enHueco[quien]) oido.huecos[quien].push({ t: prev, ms: Math.round(ahora - prev), sinSonar: true });
      oido.ultima[quien] = ahora;
      if (rms < nominal * 0.35) {
        if (!oido.enHueco[quien]) oido.enHueco[quien] = ahora;
      } else cerrarHueco(ahora);
    },
    detener() {
      if (t) clearInterval(t);
      t = null;
    },
  };
}

/* ── MLL1111C: otros carriles simulados (Wi-Fi directo y red del router), con su medida ── */
const extras: { lan: { kbps: number; rtt: number } | null; directo: { kbps: number; rtt: number } | null } = { lan: null, directo: null };
function carrilesExtra(): MuestraCarril[] {
  const out: MuestraCarril[] = [];
  if (extras.lan) out.push({ carril: "lan-tcp", arriba: true, kbps: extras.lan.kbps, rttMs: extras.lan.rtt });
  if (extras.directo) out.push({ carril: "wifi-direct", arriba: true, kbps: extras.directo.kbps, rttMs: extras.directo.rtt });
  return out;
}

/* ── MLL1111C: el timbre con vías simuladas (ninguna, y una que liga más tarde) ── */
const vias = { arriba: false, oyentes: new Set<(v: string) => void>(), intentos: 0 };
function abrirVia(nombre = "bluetooth") {
  vias.arriba = true;
  vias.oyentes.forEach((cb) => cb(nombre));
}
async function timbre(ventanaMs = 30_000): Promise<{ ok: boolean; intentos: number; ms: number; cola: boolean; motivo: string }> {
  vias.intentos = 0;
  const t0 = performance.now();
  const avisar = async () => {
    vias.intentos++;
    await new Promise((r) => setTimeout(r, 30));
    return vias.arriba;
  };
  const conCola = typeof (ColaTimbre as { VENTANA_TIMBRE_MS?: unknown }).VENTANA_TIMBRE_MS === "number";
  if (!conCola) {
    // El código de antes: un intento y, si falla, «inicio paso=timbre fallo» sin reintento.
    const ok = await avisar();
    return { ok, intentos: vias.intentos, ms: Math.round(performance.now() - t0), cola: false, motivo: ok ? "primer-intento" : "fallo-sin-reintento" };
  }
  const r = await ColaTimbre.timbreConCola({
    avisar,
    alVia: (cb) => (vias.oyentes.add(cb), () => void vias.oyentes.delete(cb)),
    anotar: (d) => lineas.push({ t: Math.round(performance.now() - t0), hito: "inicio", neurona: null, detalle: `paso=timbre ${d}` }),
    ventanaMs,
  });
  return { ...r, ms: Math.round(r.ms), cola: true };
}

/* ── Una llamada entre A y B ── */
let n = 0;
async function llamada(o: { conDatos: boolean; video?: boolean; videoFalso?: boolean; ble?: boolean; videoDatos?: boolean; opus?: boolean; rutaConPruebas?: boolean; mismaCuenta?: boolean }) {
  n++;
  const sesionId = crypto.randomUUID();
  const [ca, cb] = bucleSenal(sesionId);
  const [ta, tb] = o.ble ? enlaceBle() : enlaceDatos();
  const hacer = (quien: "A" | "B", canal: () => ConexionCanal, tr: TransporteVoz) => {
    const m = new MotorLlamada({
      sesionId,
      // LLA1112A (C): dos aparatos de la misma cuenta se presentan con el mismo nombre («Yo» sin servidor).
      yo: { base: quien === "A" ? "a-mac" : "b-tableta", uid: o.mismaCuenta ? "cuenta" : quien, nombre: o.mismaCuenta ? "Yo" : quien, avatar: null, invitado: false },
      iceServers: [],
      hayTurn: false,
      tema: null,
      canalesDirectos: () => [canal()],
      colgarAlQuedarSolo: true,
      vozDatos: o.conDatos
        ? {
            neurona: quien === "A" ? "B" : "A",
            transporteHacia: () => (datos.arriba ? tr : null),
            hayRutaIp: () => red.ipVista[quien],
            crearAudio: () => audioFalso(quien),
            codecs: () => (o.opus ? crearFabricaCodecsWeb() : fabricaCodecsSimples()),
            intervaloMs: 500,
            carrilesExtra: () => carrilesExtra(),
            // LLA1112A (C): la ruta anunciada lleva tráfico solo si la IP es de verdad (`red.ip`); su fuente, la red nativa.
            ...(o.rutaConPruebas ? { rutaIpConTrafico: () => red.ip, fuenteRutaIp: () => (red.ipVista[quien] ? "nativo" : null) } : {}),
            ...(o.mismaCuenta ? { nombreAparato: quien === "A" ? "Maggaboard" : "MaggaBook" } : {}),
            // MLL1111C: «vídeo ligero» de mentira: deja que el selector elija el enlace de datos para el vídeo (sin códec).
            // (LLA1111B) `videoDatos`: el vídeo ligero de verdad (WebCodecs) con la salida contada del banco.
            ...(o.videoFalso
              ? { video: { fabrica: () => Promise.reject(new Error("banco: sin vídeo ligero")), fuenteDePista: () => null, crearSalida: () => null } }
              : o.videoDatos
                ? { video: { fabrica: () => crearFabricaVideoWeb(), fuenteDePista: (p: MediaStreamTrack) => crearFuenteDePista(p), crearSalida: () => salidaContada(quien) } }
                : {}),
          }
        : undefined,
    });
    return m;
  };
  const A = hacer("A", ca, ta);
  const B = hacer("B", cb, tb);
  await Promise.all([A.prepararMedios({ audio: true, video: !!o.video }), B.prepararMedios({ audio: true, video: !!o.video })]);
  A.entrar();
  B.entrar();
  return { A, B, sesionId };
}

/** Lee del vídeo remoto: cuadros decodificados (getStats) y si un píxel del centro no es negro. */
async function videoRemoto(m: MotorLlamada): Promise<{ pista: string | null; cuadros: number; noNegro: boolean }> {
  const otro = m.estado().participantes.find((p) => !p.yo);
  const s = otro?.stream ?? null;
  const v = s?.getVideoTracks()[0] ?? null;
  let cuadros = 0;
  for (const pc of pcs) {
    try {
      const st = await pc.getStats();
      st.forEach((r) => {
        if (r.type === "inbound-rtp" && r.kind === "video" && v && r.trackIdentifier === v.id) cuadros = Math.max(cuadros, r.framesDecoded ?? 0);
      });
    } catch {
      /* cerrada */
    }
  }
  let noNegro = false;
  if (s && v && v.readyState === "live") {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.srcObject = new MediaStream([v]);
    document.body.appendChild(el);
    try {
      // play() puede no resolverse nunca si la pista no trae cuadros: tope de 3 s (el banco no se cuelga).
      await Promise.race([el.play(), new Promise((r) => setTimeout(r, 3000))]);
      await new Promise((r) => setTimeout(r, 400));
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 48;
      const g = c.getContext("2d")!;
      g.drawImage(el, 0, 0, 64, 48);
      const d = g.getImageData(0, 0, 64, 48).data;
      let suma = 0;
      for (let k = 0; k < d.length; k += 4) suma += d[k] + d[k + 1] + d[k + 2];
      noNegro = suma / (d.length / 4) > 30;
    } catch {
      noNegro = false;
    }
    el.remove();
  }
  return { pista: v ? v.readyState : null, cuadros, noNegro };
}

/**
 * LLA1112A · (B) La llamada directa con un enlace local de mentira hacia una tableta que contesta sola: se quita el enlace
 * (el Wi-Fi de la tableta se apaga) y se mira qué dice la llamada a los 2 s. Es lo que pasó en la prueba 39 (04:29):
 * «La llamada falló… Se perdió el enlace directo» con el Bluetooth abierto.
 */
async function directaCaeWifi(): Promise<{ faseTras2s: string; fin: string | null; motivo: string | null }> {
  const id = "local:banco-wifi";
  const oy = new Set<(d: string | ArrayBuffer) => void>();
  const enlace = {
    id,
    par: { nombre: "Maggaboard", neuronDeviceId: "nTab", origen: "red-local-nativa" as const },
    desde: Date.now(),
    abierto: () => true,
    rttMs: () => 5,
    ruta: () => null,
    capacidadKbps: () => null,
    enviar: (t: string) => {
      // La tableta contesta en cuanto suena.
      try {
        const o = JSON.parse(t) as { t?: string; id?: string };
        if (o.t === "ll.sonar") setTimeout(() => oy.forEach((cb) => cb(JSON.stringify({ t: "ll.aceptar", id: o.id, enlace: id }))), 50);
      } catch {
        /* nada */
      }
      return true;
    },
    enviarBinario: () => true,
    bufferedAmount: () => 0,
    alMensaje: (cb: (d: string | ArrayBuffer) => void) => (oy.add(cb), () => void oy.delete(cb)),
    ponerPistas: async () => true,
    alFlujoRemoto: () => () => undefined,
    cerrar: () => undefined,
  };
  RegistroLocal.registrarEnlaceLocal(enlace);
  Directa.asegurarEscuchaLlamadas();
  await Directa.llamarPorEnlace(id, false);
  await new Promise((r) => setTimeout(r, 600));
  RegistroLocal.quitarEnlaceLocal(id);
  await new Promise((r) => setTimeout(r, 2000));
  const e = Directa.estadoLlamadaDirecta();
  const r = { faseTras2s: e.fase, fin: e.fin, motivo: e.motivo };
  Directa.colgarLlamada();
  return r;
}

/** LLA1112A · (B) Qué motor elige el árbol probado para una neurona con enlace local y un Bluetooth. */
function motorParaWifiYBluetooth(): string {
  const f = (RutaLlamada as { rutaLlamadaNeurona?: (e: { via: "enlace-local"; permiteLocal: boolean; enlacesSinIp: number }) => { motor: string } | undefined }).rutaLlamadaNeurona;
  const r = typeof f === "function" ? f({ via: "enlace-local", permiteLocal: true, enlacesSinIp: 1 }) : undefined;
  return r?.motor ?? "directa";
}

function estadoNeg() {
  return pcs.map((p) => p.signalingState);
}

(window as unknown as Record<string, unknown>).banco = {
  lineas,
  red,
  datos,
  audio,
  cuenta,
  pcs,
  cambiarRedIp,
  llamada,
  extras,
  vias,
  abrirVia,
  timbre,
  videoRemoto,
  estadoNeg,
  directaCaeWifi,
  motorParaWifiYBluetooth,
  limpiar() {
    lineas.length = 0;
    audio.reproducidas.A = audio.reproducidas.B = 0;
    audio.sesiones.A = audio.sesiones.B = 0;
    cuenta.ofertas = cuenta.ofertasSinIp = cuenta.iceTirados = 0;
    extras.lan = extras.directo = null;
    vias.arriba = false;
  },
  ble,
  bleReal,
  medidaReal,
  pararReal() {
    for (const h of temporizadoresReal.splice(0)) {
      clearInterval(h);
      clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
    }
  },
  // LLA1112A: el lado B de la tableta (prueba 39) y sus paradas.
  ladoTableta39: LADO_TABLETA_39,
  paradaB,
  medida,
  pintadas,
  /** (LLA1111B) Resumen de un tramo [desde, hasta) en ms de `performance.now()` y la medida de voz acumulada. */
  resumenTramo(desde: number, hasta: number) {
    const fps = (q: "A" | "B") => {
      const l = pintadas[q].filter((t) => t >= desde && t < hasta);
      const seg = Math.max(1, (hasta - desde) / 1000);
      const ventanas: number[] = [];
      for (let t = desde; t + 5000 <= hasta; t += 5000) ventanas.push(l.filter((x) => x >= t && x < t + 5000).length / 5);
      let hueco = 0;
      let prev = desde;
      for (const x of l) {
        hueco = Math.max(hueco, x - prev);
        prev = x;
      }
      hueco = Math.max(hueco, hasta - prev);
      return { fps: Math.round((l.length / seg) * 10) / 10, ventanas5s: ventanas, huecoMaxMs: Math.round(hueco) };
    };
    return { enA: fps("A"), enB: fps("B") };
  },
  resumenVoz() {
    const r: Record<string, unknown> = {};
    for (const k of ["AB", "BA"] as const) {
      const m = medida[k];
      const esperadas = m.vozQMax >= m.vozQMin ? m.vozQMax - m.vozQMin + 1 : 0;
      const tr = [...m.transitos].sort((a, b) => a - b);
      const pc = (p: number) => (tr.length ? tr[Math.min(tr.length - 1, Math.floor(p * tr.length))] : null);
      r[k] = {
        tramasEsperadas: esperadas,
        perdidaPct: esperadas ? Math.round((1000 * (esperadas - m.vozTramas.size)) / esperadas) / 10 : null,
        paquetes: tr.length,
        transitoP50: pc(0.5),
        transitoP95: pc(0.95),
        transitoMax: tr.length ? tr[tr.length - 1] : null,
        tardePct: tr.length ? Math.round((1000 * m.tarde) / tr.length) / 10 : null,
        esperaTrasVideoMaxMs: m.esperaTrasVideoMax,
        esperasTrasVideo: m.esperasTrasVideo,
        escrituras: m.escrituras,
        escriturasSoloVideo: m.escriturasVideo,
        escriturasMixtas: m.escriturasMixtas,
        kbpsVoz: null,
        bytesVoz: m.bytesVoz,
        bytesVideo: m.bytesVideo,
        tiradosColaVoz: m.tirados,
        paquetesVoz: m.paquetesVoz,
        esperasLargas: m.esperasLargas.slice(0, 20),
        kbpsAire: null,
        bytesAire: m.bytesAire,
      };
    }
    return r;
  },
  /** (VOZ1111J) Lo que se oye en cada lado en [desde, hasta): boca-oído de las marcas y huecos audibles. */
  resumenOido(desde: number, hasta: number) {
    const r: Record<string, unknown> = {};
    for (const q of ["A", "B"] as const) {
      const bo = [...oido.bocaOido[q]].sort((a, b) => a - b);
      const pc = (p: number) => (bo.length ? bo[Math.min(bo.length - 1, Math.floor(p * bo.length))] : null);
      // Audible: una trama casi muda (ocultación que se apaga, silencio) o ≥ 150 ms sin reproducir. Menos de 150 ms sin
      // reproducir es el temporizador de 20 ms de la página que llega tarde (el worklet de verdad guarda 240 ms): se cuenta
      // aparte (`saltosTemporizador`), no es audio perdido.
      const todos = oido.huecos[q].filter((x) => x.t >= desde && x.t < hasta);
      const h = todos.filter((x) => !x.sinSonar || x.ms >= 150);
      const rms = [...oido.rms[q]].sort((a, b) => a - b);
      r[q] = {
        marcasOidas: bo.length,
        bocaOidoP50: pc(0.5),
        bocaOidoP95: pc(0.95),
        huecos: h.length,
        // Huecos por NO reproducir nada ≥ 60 ms (búfer vacío o el temporizador de 20 ms del navegador que no llegó).
        huecosSinSonar: h.filter((x) => x.sinSonar).length,
        saltosTemporizador: todos.length - h.length,
        msHuecos: h.reduce((a, x) => a + x.ms, 0),
        huecoMaxMs: h.reduce((a, x) => Math.max(a, x.ms), 0),
        huecosPorMin: Math.round((h.length / Math.max(1, (hasta - desde) / 60000)) * 10) / 10,
        rmsMediana: rms.length ? rms[Math.floor(rms.length / 2)] : null,
      };
    }
    return r;
  },
  reiniciarMedida() {
    medidaReal.escrituras = [0, 0];
    medidaReal.esperaFichaMs = [0, 0];
    medidaReal.acuses = [[], []];
    medida.AB = nuevaMedida();
    medida.BA = nuevaMedida();
    for (const q of ["A", "B"] as const) {
      oido.bocaOido[q].length = 0;
      oido.huecos[q].length = 0;
      oido.rms[q].length = 0;
      oido.enHueco[q] = 0;
    }
    pintadas.A.length = 0;
    pintadas.B.length = 0;
  },
  /** LLA1113A: temporizadores de la página lentos (`ble-lento`). */
  lentos,
  listo: true,
};
