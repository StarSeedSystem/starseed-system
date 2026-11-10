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

type Linea = { t: number; hito: string; neurona: string | null; detalle: string };
const lineas: Linea[] = [];
const t0 = performance.now();
fijarSumideroDiagnostico((l) => lineas.push({ t: Math.round(performance.now() - t0), ...l }));

/* ── Ruta IP simulada: por PC, con estado forzado mientras está cortada ── */
const red = { ip: true, retardoIceMs: 1500, ipVista: { A: true as boolean | null, B: true as boolean | null } };
const PCReal = window.RTCPeerConnection;
const pcs: RTCPeerConnection[] = [];
class PCBanco extends PCReal {
  constructor(c?: RTCConfiguration) {
    super(c);
    pcs.push(this);
  }
  get iceConnectionState(): RTCIceConnectionState {
    return red.ip ? super.iceConnectionState : super.iceConnectionState === "new" ? "new" : "failed";
  }
  get connectionState(): RTCPeerConnectionState {
    return red.ip ? super.connectionState : super.connectionState === "new" ? "new" : "failed";
  }
}
(window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCBanco;
function cambiarRedIp(on: boolean) {
  red.ip = on;
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

/* ── Audio falso de la voz por datos: tono de 20 ms; cuenta lo que se reproduce ── */
const audio = { reproducidas: { A: 0, B: 0 }, sesiones: { A: 0, B: 0 } };
function audioFalso(quien: "A" | "B"): AudioVoz {
  let t: ReturnType<typeof setInterval> | null = null;
  return {
    async iniciar(alTrama) {
      audio.sesiones[quien]++;
      let fase = 0;
      t = setInterval(() => {
        const pcm = new Int16Array(320);
        for (let k = 0; k < 320; k++) pcm[k] = Math.round(8000 * Math.sin((fase++ * 2 * Math.PI * 440) / 16000));
        alTrama(pcm);
      }, 20);
      return true;
    },
    reproducir() {
      audio.reproducidas[quien]++;
    },
    detener() {
      if (t) clearInterval(t);
      t = null;
    },
  };
}

/* ── Una llamada entre A y B ── */
let n = 0;
async function llamada(o: { conDatos: boolean; video?: boolean }) {
  n++;
  const sesionId = crypto.randomUUID();
  const [ca, cb] = bucleSenal(sesionId);
  const [ta, tb] = enlaceDatos();
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
            codecs: () => fabricaCodecsSimples(),
            intervaloMs: 500,
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
      await el.play();
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
  videoRemoto,
  estadoNeg,
  limpiar() {
    lineas.length = 0;
    audio.reproducidas.A = audio.reproducidas.B = 0;
    audio.sesiones.A = audio.sesiones.B = 0;
    cuenta.ofertas = cuenta.ofertasSinIp = cuenta.iceTirados = 0;
  },
  listo: true,
};
