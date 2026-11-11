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
import type { SalidaVideo } from "@/lib/llamadas/video-datos/tipos";

type Linea = { t: number; hito: string; neurona: string | null; detalle: string };
const lineas: Linea[] = [];
const t0 = performance.now();
fijarSumideroDiagnostico((l) => lineas.push({ t: Math.round(performance.now() - t0), ...l }));

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
function enlaceBle(): [TransporteVoz, TransporteVoz] {
  const oy: [Set<(t: string) => void>, Set<(t: string) => void>] = [new Set(), new Set()];
  const lado = (i: 0 | 1): TransporteVoz => {
    const sentido = i === 0 ? "AB" : "BA";
    const voz: string[] = [];
    const vid: string[] = [];
    let bVoz = 0;
    let bVid = 0;
    let entrados = 0;
    let ultimoVideo = 0;
    let bombeando = false;
    let enVuelo: { soloVideo: boolean; ack: number; bytesVideo: number } | null = null;
    const dormir = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
    const bombear = async () => {
      if (bombeando) return;
      bombeando = true;
      while (datos.arriba && (voz.length || vid.length)) {
        const m = medida[sentido];
        const deVoz = voz.length > 0; // AUDIO > VÍDEO (como `bombear` del motor Bluetooth)
        const lista = deVoz ? voz : vid;
        const lote: string[] = [];
        let n = 0;
        while (lista.length && (n === 0 || n + lista[0].length <= ble.maxTrama)) {
          n += lista[0].length;
          lote.push(lista.shift()!);
        }
        const conVideo = lote.some(esVideoTxt);
        const conVoz = lote.some((t) => !esVideoTxt(t));
        m.escrituras++;
        if (conVideo && !conVoz) m.escriturasVideo++;
        if (conVideo && conVoz) m.escriturasMixtas++;
        const serial = (bytesAire(lote) * 8) / ble.kbps;
        m.bytesAire += bytesAire(lote);
        const t0 = performance.now();
        const bytesVideoLote = lote.filter(esVideoTxt).reduce((a, t) => a + t.length, 0);
        enVuelo = { soloVideo: conVideo && !conVoz, ack: t0 + serial + ble.rttMs, bytesVideo: bytesVideoLote };
        const perdida = Math.random() < ble.perdida;
        await dormir(serial + ble.rttMs / 2);
        if (!perdida && datos.arriba) {
          const ahora = Date.now();
          for (const t of lote) {
            if (!esVideoTxt(t)) {
              const p = leerVoz(t, ahora);
              if (p) {
                for (const u of p.unidades) m.vozTramas.add(u);
                const tr = ahora - p.ts;
                m.transitos.push(tr);
                if (tr > ble.plazoVozMs) m.tarde++;
              }
            }
            oy[1 - i].forEach((cb) => cb(t));
          }
        }
        await dormir(enVuelo.ack - performance.now());
        enVuelo = null;
        // Los bytes cuentan hasta el acuse, como en el Bluetooth de la Mac.
        if (deVoz) bVoz -= n;
        else bVid -= n;
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
          const e = enVuelo?.soloVideo ? enVuelo.ack - performance.now() : ((delante + (enVuelo?.bytesVideo ?? 0)) * 8) / ble.kbps;
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
        void bombear();
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
        void bombear();
        return tiro ? "descartado" : "ok";
      },
      // Igual que `crearTransporteVozHacia` (voz-datos/transporte.ts) en la versión que se pruebe.
      ocupado: () => (typeof vozOcupada === "function" ? vozOcupada(bVoz, 2048, ultimoVideo || undefined, Date.now()) : bVoz > 2048),
      colaVozBytes: () => bVoz,
      colaVideoBytes: () => bVid,
      topeColaVideoBytes: () => 24 * 1024,
      bytesEntrados: () => entrados,
      videoEnCarril: () => Date.now() - ultimoVideo < 2000, // VOZ1111J (como `crearTransporteVozHacia`)
      alRecibir: (cb) => (oy[i].add(cb), () => void oy[i].delete(cb)),
      abierto: () => datos.arriba,
      info: () => ({ tipo: "ble", cifrada: true }),
      capacidadKbps: () => ble.anunciadoKbps,
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
async function llamada(o: { conDatos: boolean; video?: boolean; videoFalso?: boolean; ble?: boolean; videoDatos?: boolean; opus?: boolean }) {
  n++;
  const sesionId = crypto.randomUUID();
  const [ca, cb] = bucleSenal(sesionId);
  const [ta, tb] = o.ble ? enlaceBle() : enlaceDatos();
  const hacer = (quien: "A" | "B", canal: () => ConexionCanal, tr: TransporteVoz) => {
    const m = new MotorLlamada({
      sesionId,
      yo: { base: quien === "A" ? "a-mac" : "b-tableta", uid: quien, nombre: quien, avatar: null, invitado: false },
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
  limpiar() {
    lineas.length = 0;
    audio.reproducidas.A = audio.reproducidas.B = 0;
    audio.sesiones.A = audio.sesiones.B = 0;
    cuenta.ofertas = cuenta.ofertasSinIp = cuenta.iceTirados = 0;
    extras.lan = extras.directo = null;
    vias.arriba = false;
  },
  ble,
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
  listo: true,
};
