/**
 * LLA1110C · banco REAL de vídeo de llamadas (Chromium con cámara falsa, guiado por Playwright).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Dos `MotorLlamada` de verdad («mac» y «tableta») en la misma página, cada uno con su `AdaptadorMotor` y su
 * `SuperficieLlamada` montados tal cual. Lo único simulado es el aire:
 *  · la señalización va por `abrirCanalLlamadaPorTransporte` sobre un transporte en memoria;
 *  · en el modo «ble» no hay ruta IP: se tiran los candidatos ICE (y los de dentro del SDP), así WebRTC
 *    negocia pero NUNCA conecta, como entre la Mac y la tableta solo por Bluetooth;
 *  · la voz y el vídeo ligero van por un enlace de datos en memoria con colas de voz y de vídeo como el BLE
 *    (voz primero, acuse por escritura, ritmo limitado).
 * La cámara es la falsa de Chromium; `mediaDevices` se envuelve para imitar a la Mac (etiquetas vacías antes del
 * permiso, la «Desk View» del iPhone como cámara por defecto del sistema).
 */
import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import { MotorLlamada } from "@/lib/llamadas/motor";
import { abrirCanalLlamadaPorTransporte } from "@/lib/llamadas/canal-enlace-transporte";
import { fabricaCodecsSimples, type AudioVoz, type TransporteVoz } from "@/lib/llamadas/voz-datos/sesion";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";
import { crearFabricaVideoWeb, crearFuenteDePista, crearSalidaVideoWeb } from "@/lib/llamadas/video-datos/codec-web";
import { AdaptadorMotor } from "@/lib/llamadas/superficie/adaptador-motor";
import { SuperficieLlamada } from "@/components/llamadas/superficie/superficie-llamada";
import type { VistaLlamada } from "@/lib/llamadas/superficie/vista";
import type { EntornoLlamada } from "@/lib/llamadas/superficie/matriz-controles";
import { leerPreferencias } from "@/lib/llamadas/camaras";
import { anotarLlamada } from "@/lib/llamadas/voz-datos/diagnostico";
import { getDeviceId } from "@/lib/network/device-registry";

type Lado = "mac" | "tableta";
const NEURONA: Record<Lado, string> = { mac: "neurona-mac", tableta: "neurona-tab" };
const OTRO: Record<Lado, Lado> = { mac: "tableta", tableta: "mac" };

const registro: string[] = [];
fijarSumideroDiagnostico((l) => registro.push(`${Math.round(performance.now())} ${l.hito}${l.detalle ? ` ${l.detalle}` : ""}`));

/* ───────────────────────── Cámaras como en la Mac ───────────────────────── */

const md = navigator.mediaDevices;
const enumerarReal = md.enumerateDevices.bind(md);
const gumReal = md.getUserMedia.bind(md);
const camaras = {
  /** Etiquetas vacías hasta el primer permiso de cámara (como WebKit). */
  ocultarHastaPermiso: false,
  permiso: false,
  /** Nombre de cada cámara falsa por orden. */
  etiquetas: [] as string[],
  /** La que abre el sistema cuando no se pide ninguna (macOS: la Desk View del iPhone si está cerca). */
  porDefecto: 0,
  /**
   * HIPÓTESIS (sin confirmar en la Mac): WebKit no abre una segunda cámara mientras otra sigue abierta en la página.
   * Con esto, pedir otra cámara con una abierta falla con NotReadableError, como pudo pasarle a `afinarCamara`.
   */
  unaALaVez: false,
  abiertas: new Set<MediaStreamTrack>(),
  pedidas: [] as string[],
};
md.enumerateDevices = async () => {
  const l = await enumerarReal();
  let i = 0;
  return l.map((d) => {
    if (d.kind !== "videoinput") return d;
    const etiqueta = camaras.ocultarHastaPermiso && !camaras.permiso ? "" : (camaras.etiquetas[i] ?? d.label);
    const id = camaras.ocultarHastaPermiso && !camaras.permiso ? "" : d.deviceId;
    i++;
    return { deviceId: id, groupId: d.groupId, kind: d.kind, label: etiqueta, toJSON: () => ({}) } as MediaDeviceInfo;
  });
};
md.getUserMedia = async (c?: MediaStreamConstraints) => {
  camaras.pedidas.push(JSON.stringify(c?.video ?? false));
  // Sin deviceId, el «sistema» elige la suya (como macOS con la cámara de Continuidad).
  if (c?.video && !(typeof c.video === "object" && (c.video as MediaTrackConstraints).deviceId)) {
    const lista = (await enumerarReal()).filter((d) => d.kind === "videoinput");
    const d = lista[camaras.porDefecto] ?? lista[0];
    if (d) c = { ...c, video: { ...(typeof c.video === "object" ? c.video : {}), facingMode: undefined, deviceId: { exact: d.deviceId } } };
  }
  if (c?.video && camaras.unaALaVez) {
    for (const t of camaras.abiertas) if (t.readyState !== "live") camaras.abiertas.delete(t);
    if (camaras.abiertas.size) throw new DOMException("Could not start video source", "NotReadableError");
  }
  const s = await gumReal(c);
  if (c?.video) camaras.permiso = true;
  for (const t of s.getVideoTracks()) camaras.abiertas.add(t);
  // La etiqueta de la pista sigue la de la lista.
  for (const t of s.getVideoTracks()) {
    const lista = (await enumerarReal()).filter((d) => d.kind === "videoinput");
    const i = lista.findIndex((d) => d.deviceId === t.getSettings().deviceId);
    const et = camaras.etiquetas[i];
    if (et) Object.defineProperty(t, "label", { value: et, configurable: true });
  }
  return s;
};

/* ───────────────────────── Enlace de datos (como el BLE) entre las dos páginas ───────────────────────── */

const params = new URLSearchParams(location.search);
const LADO: Lado = params.get("lado") === "tableta" ? "tableta" : "mac";

interface OpcEnlace {
  /** Bytes por escritura y lo que tarda en volver el acuse (ms). */
  mtu: number;
  rttMs: number;
}
/** Un extremo del enlace de datos: colas de voz y de vídeo (voz primero), acuse por escritura, ritmo limitado. */
function enlaceDatos(opc: OpcEnlace, sid: string): TransporteVoz & { cerrar(): void } {
  const bc = new BroadcastChannel(`datos-${sid}`);
  const oyentes = new Set<(t: string) => void>();
  bc.onmessage = (ev) => {
    if (ev.data?.de === LADO) return;
    for (const cb of oyentes) cb(ev.data.t as string);
  };
  const voz: string[] = [];
  const vid: string[] = [];
  let bVoz = 0;
  let bVid = 0;
  let bombeando = false;
  let abierto = true;
  const bombear = async () => {
    if (bombeando) return;
    bombeando = true;
    while (abierto && (voz.length || vid.length)) {
      const deVoz = voz.length > 0; // AUDIO > VÍDEO
      const lista = deVoz ? voz : vid;
      const lote: string[] = [];
      let n = 0;
      while (lista.length && (n === 0 || n + lista[0].length <= opc.mtu)) {
        n += lista[0].length;
        lote.push(lista.shift()!);
      }
      await new Promise((r) => setTimeout(r, opc.rttMs));
      // Los bytes cuentan hasta el acuse, como en el Bluetooth de la Mac.
      if (deVoz) bVoz -= n;
      else bVid -= n;
      for (const t of lote) bc.postMessage({ de: LADO, t });
    }
    bombeando = false;
  };
  return {
    enviar(t) {
      voz.push(t);
      bVoz += t.length;
      while (bVoz > 6 * 1024 && voz.length > 1) bVoz -= voz.shift()!.length;
      void bombear();
      return "ok";
    },
    enviarVideo(t) {
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
    ocupado: () => bVoz > 2048,
    colaVozBytes: () => bVoz,
    colaVideoBytes: () => bVid,
    topeColaVideoBytes: () => 24 * 1024,
    capacidadKbps: () => Math.round((opc.mtu * 8) / opc.rttMs),
    mtu: () => 180,
    alRecibir(cb) {
      oyentes.add(cb);
      return () => void oyentes.delete(cb);
    },
    abierto: () => abierto,
    info: () => ({ tipo: "Bluetooth", cifrada: true }),
    cerrar() {
      abierto = false;
      bc.close();
    },
  };
}

/** Micro falso: tramas de 20 ms con un tono, a ritmo real. */
function audioFalso(): AudioVoz {
  let id: ReturnType<typeof setInterval> | null = null;
  let fase = 0;
  return {
    async iniciar(alTrama) {
      id = setInterval(() => {
        const pcm = new Int16Array(320);
        for (let i = 0; i < 320; i++) pcm[i] = Math.round(3000 * Math.sin((fase++ * 2 * Math.PI * 440) / 16000));
        alTrama(pcm);
      }, 20);
      return true;
    },
    reproducir() {
      /* sin altavoz */
    },
    detener() {
      if (id) clearInterval(id);
      id = null;
    },
  };
}

/* ───────────────────────── Señalización entre las dos páginas ───────────────────────── */

type Cb = (m: { cuerpo: unknown; origen: { tipo: string } }) => void;
const tirados = { ice: 0 };
function senalizacion(sinIp: boolean, sid: string) {
  const bc = new BroadcastChannel(`senal-${sid}`);
  const oy = new Set<Cb>();
  bc.onmessage = (ev) => {
    if (ev.data?.de === LADO) return;
    oy.forEach((cb) => cb({ cuerpo: ev.data.c, origen: { tipo: sinIp ? "ble" : "local" } }));
  };
  /** Sin ruta IP: fuera candidatos (sueltos o dentro del SDP). */
  const filtrar = (x: unknown): unknown => {
    if (!sinIp) return x;
    if (typeof x === "string") return x.includes("a=candidate") ? x.split(/\r\n/).filter((l) => !l.startsWith("a=candidate") && !l.startsWith("a=end-of-candidates")).join("\r\n") : x;
    if (Array.isArray(x)) return x.map(filtrar);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.candidate === "string" && (o.candidate as string).startsWith("candidate:")) return null;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        const f = filtrar(v);
        if (f === null && v !== null) return null;
        out[k] = f;
      }
      return out;
    }
    return x;
  };
  return {
    cerrar: () => bc.close(),
    deps: {
      enviar: async (_n: string, cuerpo: unknown) => {
        const c = filtrar(JSON.parse(JSON.stringify(cuerpo)));
        if (c === null) {
          tirados.ice++;
          return { ok: true, via: "ble" };
        }
        bc.postMessage({ de: LADO, c });
        return { ok: true, via: sinIp ? "ble" : "local" };
      },
      alRecibir: (cb: Cb) => {
        oy.add(cb);
        return () => void oy.delete(cb);
      },
      hayEnlace: () => true,
      yo: () => NEURONA[LADO],
    },
  };
}

/* ───────────────────────── Una llamada ───────────────────────── */

const ENTORNO: EntornoLlamada = { pantalla: true, androidWebView: false, macWebView: false, movil: false, camaras: 2, pip: true, pantallaCompleta: true, setSinkId: true, rutasNativas: 0, grabadora: false };
const VACIA: VistaLlamada = { estado: "inactiva", tipo: "voz", nombre: "", yo: "", desde: null, local: null, remoto: null, micro: false, camara: false, compartiendoPantalla: false };

interface Llamada {
  n: string;
  motor: MotorLlamada;
  adaptador: AdaptadorMotor;
  cerrar(): void;
}
let actual: Llamada | null = null;
const oyentesLlamada = new Set<() => void>();

function Pane() {
  const ll = useSyncExternalStore(
    (cb) => {
      oyentesLlamada.add(cb);
      return () => void oyentesLlamada.delete(cb);
    },
    () => actual,
  );
  const ad = ll?.adaptador ?? null;
  const vista = useSyncExternalStore(ad ? ad.suscribir : () => () => undefined, ad ? ad.vista : () => VACIA);
  return (
    <div data-lado={LADO} style={{ position: "relative", width: 480, height: 640, transform: "translateZ(0)", overflow: "hidden", background: "#223" }}>
      <p style={{ color: "#fff", font: "12px sans-serif", margin: 4 }}>{LADO}</p>
      {ad && <SuperficieLlamada key={ll?.n} vista={vista} acciones={{ ...ad.acciones, descartar: () => undefined }} tamanoInicial="panel" />}
    </div>
  );
}

/** Abre la llamada en ESTE lado (la Mac llama; la tableta entra en la misma sesión). */
async function llamar(o: { sid: string; sinIp?: boolean; enlace?: OpcEnlace; video?: boolean; ipFantasma?: boolean }) {
  // `ipFantasma`: el aparato cree que puede haber ruta IP (Wi-Fi encendido) pero no la hay: WebRTC negocia (ofertas
  // por Bluetooth) y no conecta nunca, como la llamada 3 de prueba.33.
  const sinIp = o.sinIp ?? true;
  const sen = senalizacion(sinIp || !!o.ipFantasma, o.sid);
  const datos = enlaceDatos(o.enlace ?? { mtu: 512, rttMs: 30 }, o.sid);
  const canal = abrirCanalLlamadaPorTransporte(NEURONA[OTRO[LADO]], o.sid, `${LADO}:t`, sen.deps);
  const motor = new MotorLlamada({
    sesionId: o.sid,
    yo: { base: LADO, uid: LADO, nombre: LADO === "mac" ? "Mac" : "Tableta", avatar: null, invitado: false },
    canalesDirectos: () => [canal],
    vozDatos: {
      transporteHacia: () => datos,
      hayRutaIp: () => (o.ipFantasma ? null : sinIp ? false : null),
      crearAudio: () => audioFalso(),
      codecs: () => fabricaCodecsSimples(),
      neurona: NEURONA[OTRO[LADO]],
      video: { fabrica: () => crearFabricaVideoWeb(), fuenteDePista: (p) => crearFuenteDePista(p), crearSalida: () => crearSalidaVideoWeb() },
    },
    intervaloStatsMs: 60_000,
  });
  // Las mismas dependencias de cámara y registro que pone `depsParaLlamada` en la app (si el adaptador las admite).
  const adaptador = new AdaptadorMotor(motor, {
    titulo: LADO === "mac" ? "Tableta" : "Mac",
    unoAUno: true,
    entorno: () => ENTORNO,
    preferenciaCamara: () => leerPreferencias(getDeviceId() || "local").camara ?? null,
    anotar: (l: string) => anotarLlamada(l.startsWith("camara ") ? "camara" : "medio=video-datos", null, l.replace(/^camara /, "")),
  } as ConstructorParameters<typeof AdaptadorMotor>[1]);
  actual = {
    n: o.sid,
    motor,
    adaptador,
    cerrar() {
      sen.cerrar();
      datos.cerrar();
    },
  };
  oyentesLlamada.forEach((cb) => cb());
  await motor.prepararMedios({ audio: true, video: !!o.video });
  motor.entrar();
  return o.sid;
}

function colgar() {
  if (!actual) return;
  actual.motor.colgar();
  actual.adaptador.destruir();
  const a = actual;
  setTimeout(() => a.cerrar(), 500);
  actual = null;
  oyentesLlamada.forEach((cb) => cb());
}

function resumen() {
  if (!actual) return null;
  const e = actual.motor.estado();
  const v = actual.adaptador.vista();
  return {
    fase: e.fase,
    medio: e.medio?.texto ?? null,
    camara: e.camara,
    aviso: v.aviso ?? null,
    motivoCamara: v.motivos?.camara ?? null,
    tipo: v.tipo,
    estado: v.estado,
    remoto: v.remoto ? v.remoto.getVideoTracks().map((t) => `${t.readyState}${t.muted ? "/muted" : ""}`) : null,
    remotoLienzo: !!v.remotoLienzo,
    camaras: e.dispositivos.camaras.map((c) => c.nombre),
    seleccion: e.seleccion.camaraId,
    pistaCamara: v.pistaCamara?.label ?? null,
    videoDatos: e.videoDatos ?? null,
  };
}

(window as unknown as { banco: unknown }).banco = {
  lado: LADO,
  camaras,
  registro,
  llamar,
  colgar,
  resumen,
  vista: () => actual?.adaptador.vista() ?? null,
  acciones: () => actual?.adaptador.acciones ?? null,
  motor: () => actual?.motor ?? null,
  tirados: () => tirados,
};

createRoot(document.getElementById("raiz")!).render(
  <Pane />,
);
