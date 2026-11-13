/**
 * LLA1113B · Revisión de LLA1113A y el selector de cámaras de Android, con las piezas DE VERDAD:
 *  · A: `medios.ts` real (escalera, `ocupada`, `listarDispositivos`) y `MotorLlamada` real sobre un `mediaDevices` que se
 *    porta como el WebView de Android de la tableta (prueba 40): una sola cámara abierta a la vez (otra da NotReadableError,
 *    como en el registro), sin ids ni nombres de cámara hasta el primer permiso de cámara, y —lo que dejó la tercera llamada
 *    con 0 fotogramas— un intento de abrir otra con una viva deja la viva sin imagen. Nada de `ocupada: true` ya cocinado.
 *  · B: el reloj de la llamada cuando el Worker no carga o no da tics (vuelve a la página y lo dice) y sin vueltas dobles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";

vi.mock("@/lib/llamadas/senalizacion", () => ({ abrirCanalLlamada: () => null }));
vi.mock("@/lib/network/device-registry", () => ({ getDeviceId: () => "tableta-prueba" }));

import { listarDispositivos, resumenCamaras } from "@/lib/llamadas/medios";
import { MotorLlamada } from "@/lib/llamadas/motor";
import { PERIODO_TIC_MS, RelojEstable, SIN_TIC_MS, type TicWorker } from "@/lib/llamadas/reloj-estable";

const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Maggaboard Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Safari/537.36";
const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";

class Pista {
  enabled = true;
  readyState: "live" | "ended" = "live";
  muted = false;
  /** Sin imagen aunque siga «live» (lo que hizo la tableta tras el tercer intento). */
  congelada = false;
  onended: (() => void) | null = null;
  constructor(public kind: "audio" | "video", public deviceId: string, public label: string, private alParar: (p: Pista) => void) {}
  stop() {
    if (this.readyState === "ended") return;
    this.readyState = "ended";
    this.alParar(this);
  }
  getSettings() {
    return { deviceId: this.deviceId, width: 1280, height: 720 };
  }
  getCapabilities() {
    return {};
  }
  async applyConstraints() {}
}

class Flujo {
  constructor(public pistas: Pista[] = []) {}
  getTracks() {
    return this.pistas;
  }
  getAudioTracks() {
    return this.pistas.filter((p) => p.kind === "audio");
  }
  getVideoTracks() {
    return this.pistas.filter((p) => p.kind === "video");
  }
  addTrack(p: Pista) {
    if (!this.pistas.includes(p)) this.pistas.push(p);
  }
  removeTrack(p: Pista) {
    this.pistas = this.pistas.filter((x) => x !== p);
  }
}

const CAMARAS = [
  { id: "c1", label: "camera 1, facing front" },
  { id: "c3", label: "camera 3, facing front" },
  { id: "c2", label: "camera 2, facing back" },
  { id: "c0", label: "camera 0, facing back" },
];

/** El WebView de Android de la tableta, tal como se portó en la prueba 40. */
class WebViewAndroid {
  permisoCamara = false;
  vivas = new Set<Pista>();
  intentosConOtraViva = 0;
  rotas = new Set<string>();
  /** Si se da, cada apertura de cámara espera a esta promesa (para las carreras). */
  retener: Promise<void> | null = null;
  async getUserMedia(c: MediaStreamConstraints): Promise<Flujo> {
    const pistas: Pista[] = [];
    if (c.audio) pistas.push(new Pista("audio", "mic-1", "Micrófono", (p) => this.vivas.delete(p)));
    if (c.video) {
      if (this.retener) await this.retener;
      const v = c.video === true ? {} : (c.video as MediaTrackConstraints);
      const exacto = (v.deviceId as { exact?: string } | undefined)?.exact;
      const cam = exacto ? CAMARAS.find((x) => x.id === exacto) : CAMARAS[0];
      if (!cam) throw Object.assign(new Error("no está"), { name: "OverconstrainedError", constraint: "deviceId" });
      const viva = [...this.vivas].find((p) => p.kind === "video" && p.readyState === "live");
      if (viva) {
        // Android no abre una segunda cámara; y la que estaba abierta se queda sin imagen.
        this.intentosConOtraViva++;
        viva.congelada = true;
        throw Object.assign(new Error("Could not start video source"), { name: "NotReadableError" });
      }
      if (this.rotas.has(cam.id)) throw Object.assign(new Error("Could not start video source"), { name: "NotReadableError" });
      this.permisoCamara = true;
      const p = new Pista("video", cam.id, cam.label, (x) => this.vivas.delete(x));
      this.vivas.add(p);
      pistas.push(p);
    }
    return new Flujo(pistas);
  }
  async enumerateDevices() {
    // Antes del primer permiso de cámara: una entrada por cámara sin id ni nombre (el micro sí, ya concedido).
    return [
      { kind: "audioinput", deviceId: "mic-1", label: "Micrófono", groupId: "" },
      ...CAMARAS.map((c) => ({ kind: "videoinput", deviceId: this.permisoCamara ? c.id : "", label: this.permisoCamara ? c.label : "", groupId: "" })),
    ];
  }
  addEventListener() {}
  removeEventListener() {}
  videoVivas() {
    return [...this.vivas].filter((p) => p.kind === "video" && p.readyState === "live");
  }
}

let wv: WebViewAndroid;
let lineas: string[];

function ponerAparato(ua: string) {
  wv = new WebViewAndroid();
  vi.stubGlobal("navigator", { userAgent: ua, mediaDevices: wv, onLine: true });
  vi.stubGlobal("MediaStream", Flujo);
  const mapa = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => void mapa.set(k, v), removeItem: (k: string) => void mapa.delete(k), clear: () => mapa.clear() });
}

function motor() {
  return new MotorLlamada({ sesionId: "s-1113b", yo: { base: "tab", uid: "tab", nombre: "Tableta", avatar: null, invitado: false }, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
}

const camaraAbierta = (m: MotorLlamada) => (m as unknown as { pistaCamara: Pista | null }).pistaCamara;
const esperar = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  lineas = [];
  fijarSumideroDiagnostico((l) => lineas.push(`${l.hito} ${l.detalle}`));
});
afterEach(() => {
  fijarSumideroDiagnostico(null);
  vi.unstubAllGlobals();
});

describe("A · cámaras en el WebView de Android (medios.ts y motor de verdad)", () => {
  it("antes del permiso de cámara la lista no está vacía «porque no hay»: se cuentan las ocultas, y al abrir la cámara salen todas con nombre", async () => {
    ponerAparato(UA_ANDROID);
    const antes = await listarDispositivos();
    expect(antes.camaras).toEqual([]);
    expect(antes.ocultas?.camaras).toBe(4);
    expect(resumenCamaras(antes, "android")).toBe("n=0 con-nombre=0 ocultas=4");

    const m = motor();
    await m.prepararMedios({ audio: true, video: false }); // llamada empezada solo con voz
    await esperar();
    expect(m.estado().dispositivos.camaras).toEqual([]);
    expect(m.estado().dispositivos.ocultas?.camaras).toBe(4);
    expect(await m.alternarCamara()).toBeNull();
    await esperar();
    // El motor vuelve a listar tras abrir: el selector ya tiene las cuatro, con su nombre del sistema.
    expect(m.estado().dispositivos.camaras.map((c) => c.nombre)).toEqual(CAMARAS.map((c) => c.label));
    expect(lineas.some((l) => /^camara lista n=0 con-nombre=0 ocultas=4/.test(l))).toBe(true);
    expect(lineas.some((l) => /^camara lista n=4 con-nombre=4 ocultas=0 lista=integrada:camera 1, facing front\|/.test(l))).toBe(true);
    m.colgar();
  });

  it("cambiar de cámara en Android suelta la de ahora ANTES de abrir la pedida: nunca dos a la vez, la nueva abre y la vieja queda cerrada", async () => {
    ponerAparato(UA_ANDROID);
    const m = motor();
    await m.prepararMedios({ audio: true, video: true });
    await esperar();
    const delantera = camaraAbierta(m)!;
    expect(delantera.label).toBe("camera 1, facing front");
    expect(await m.cambiarCamara("c2")).toBeNull();
    expect(wv.intentosConOtraViva).toBe(0); // con LLA1113A: 1 (y la delantera se quedaba sin imagen)
    expect(delantera.readyState).toBe("ended");
    expect(camaraAbierta(m)?.label).toBe("camera 2, facing back");
    expect(camaraAbierta(m)?.congelada).toBe(false);
    expect(m.estado().camara).toBe(true);
    expect(m.estado().seleccion.camaraId).toBe("c2");
    expect(wv.videoVivas()).toHaveLength(1);
    expect(lineas.some((l) => /^camara cambiar con-camara=si de="camera 1, facing front" a="camera 2, facing back" misma=no modo=serie/.test(l))).toBe(true);
    expect(lineas.some((l) => /^camara cambiar en-serie pedida=abre hueco-ms=\d+/.test(l))).toBe(true);
    m.colgar();
    expect(wv.videoVivas()).toHaveLength(0);
  });

  it("si la pedida no abre, vuelve la de antes (viva y con imagen), la elegida no cambia y se dice por qué", async () => {
    ponerAparato(UA_ANDROID);
    const m = motor();
    await m.prepararMedios({ audio: true, video: true });
    await esperar();
    wv.rotas.add("c2");
    const err = await m.cambiarCamara("c2");
    expect(err).toMatch(/ocupada|no se pudo abrir/i);
    expect(m.estado().camara).toBe(true);
    expect(camaraAbierta(m)?.label).toBe("camera 1, facing front");
    expect(camaraAbierta(m)?.readyState).toBe("live");
    expect(m.estado().seleccion.camaraId).toBe("c1");
    expect(wv.videoVivas()).toHaveLength(1);
    expect(lineas.some((l) => /vuelve-la-de-antes=si a="camera 1, facing front"/.test(l))).toBe(true);
    m.colgar();
  });

  it("apagar la cámara mientras se cambia: queda apagada de verdad (ninguna cámara abierta ni enviándose)", async () => {
    ponerAparato(UA_ANDROID);
    const m = motor();
    await m.prepararMedios({ audio: true, video: true });
    await esperar();
    let soltar: () => void = () => undefined;
    wv.retener = new Promise<void>((r) => (soltar = r));
    const cambio = m.cambiarCamara("c2");
    await esperar();
    const apagar = m.alternarCamara(); // la persona pulsa «Apagar cámara» con el cambio a medias
    soltar();
    wv.retener = null;
    await cambio;
    await apagar;
    expect(m.estado().camara).toBe(false);
    expect(wv.videoVivas()).toHaveLength(0);
    m.colgar();
  });

  it("colgar mientras se cambia: no queda ninguna cámara abierta", async () => {
    ponerAparato(UA_ANDROID);
    const m = motor();
    await m.prepararMedios({ audio: true, video: true });
    await esperar();
    let soltar: () => void = () => undefined;
    wv.retener = new Promise<void>((r) => (soltar = r));
    const cambio = m.cambiarCamara("c2");
    await esperar();
    m.colgar();
    soltar();
    await cambio;
    expect(wv.videoVivas()).toHaveLength(0);
  });

  it("en el escritorio se sigue abriendo primero la pedida (sin hueco) y en serie solo si dice «ocupada» (sin `ocupada` cocinado)", async () => {
    ponerAparato(UA_MAC);
    const m = motor();
    await m.prepararMedios({ audio: true, video: true });
    await esperar();
    expect(await m.cambiarCamara("c2")).toBeNull();
    expect(wv.intentosConOtraViva).toBe(1); // el WebView de mentira no abre dos: NotReadableError real → `ocupada` → en serie
    expect(camaraAbierta(m)?.label).toBe("camera 2, facing back");
    expect(wv.videoVivas()).toHaveLength(1);
    expect(lineas.some((l) => /modo=paralelo/.test(l)) && lineas.some((l) => /en-serie motivo=ocupada/.test(l))).toBe(true);
    m.colgar();
  });
});

/** Un Worker de mentira: su tic lo da el reloj falso de vitest. `muerto`: nunca da tics. */
function workerFalso(opc: { muerto?: boolean } = {}): TicWorker & { terminado: boolean; revocado: number } {
  let id: ReturnType<typeof setInterval> | null = null;
  const w = {
    onmessage: null as ((e: unknown) => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    terminado: false,
    revocado: 0,
    revocar() {
      w.revocado++;
    },
    postMessage(m: unknown) {
      if (id !== null) clearInterval(id);
      id = null;
      const ms = (m as { ms?: number })?.ms ?? 0;
      if (ms > 0 && !opc.muerto) id = setInterval(() => w.onmessage?.({ data: 1 }), ms);
    },
    terminate() {
      if (id !== null) clearInterval(id);
      id = null;
      w.terminado = true;
    },
  };
  return w;
}

describe("B · el reloj de la llamada cuando el Worker falla", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("un Worker que no carga (error después de crearlo, p. ej. una CSP sin blob:) se suelta, se dice y manda la página", () => {
    const lineasR: string[] = [];
    const w = workerFalso();
    const reloj = new RelojEstable({ crearWorker: () => w, anotar: (d) => lineasR.push(d) });
    let n = 0;
    reloj.cada(() => n++, PERIODO_TIC_MS);
    w.onerror?.({ message: "blocked" });
    expect(reloj.estado().conWorker).toBe(false);
    expect(w.terminado).toBe(true);
    expect(w.revocado).toBe(1);
    expect(lineasR.some((l) => /^reloj worker-fallo/.test(l))).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(n).toBeGreaterThanOrEqual(45); // la página sigue a su ritmo
    reloj.detener();
  });

  it("un Worker que nunca da un tic se da por muerto a los SIN_TIC_MS y lo dice", () => {
    const lineasR: string[] = [];
    const w = workerFalso({ muerto: true });
    const reloj = new RelojEstable({ crearWorker: () => w, anotar: (d) => lineasR.push(d) });
    reloj.cada(() => undefined, PERIODO_TIC_MS);
    vi.advanceTimersByTime(SIN_TIC_MS + 200);
    expect(reloj.estado().conWorker).toBe(false);
    expect(lineasR.some((l) => /^reloj worker-sin-tic tras=\d+ms/.test(l))).toBe(true);
    reloj.detener();
  });

  it("con Worker y página a la vez: ni vueltas dobles (≤ 1 por periodo de media) ni deriva, y dice una vez que el Worker corre", () => {
    const lineasR: string[] = [];
    const w = workerFalso();
    const reloj = new RelojEstable({ crearWorker: () => w, anotar: (d) => lineasR.push(d), visibilidad: () => "visible" });
    let n = 0;
    reloj.cada(() => n++, PERIODO_TIC_MS);
    vi.advanceTimersByTime(10_000);
    expect(n).toBeGreaterThanOrEqual(480);
    expect(n).toBeLessThanOrEqual(505);
    expect(lineasR.filter((l) => /^reloj worker-activo primer-tic=\d+ms visible=visible/.test(l))).toHaveLength(1);
    expect(w.revocado).toBe(1); // la URL del Blob se suelta tras el primer tic
    reloj.detener();
    expect(w.terminado).toBe(true);
  });
});
