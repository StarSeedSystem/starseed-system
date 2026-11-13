/**
 * LLA1113C · Lo que la prueba 41 (13-11, Mac ↔ tableta Maggaboard) dejó roto, con las funciones DE VERDAD y los números
 * del registro (`evidencias/ronda41-1113/enlaces-1257.log`):
 *  · A: el vídeo de la tableta en pausa por «suelo» los 120 s con la voz sola en el carril. Su modelo leía
 *    `enlace=160k+84ms/139` … `+149ms` y el reparto daba `cabe=63` … `cabe=2`: con el ciclo fijo de 139 ms, el acuse de la
 *    tableta se comía casi todo el ciclo. Y la prueba de reanudar fallaba por UN segundo de espera que la voz sola ya tiene.
 *  · B: la cámara guardada de la tableta («camera 3, facing front») está en la lista pero no abre: se intentaba con la
 *    frontal abierta (NotReadableError), luego sola (NotFoundError a los 5,2 s) y en cada llamada otra vez.
 *  · C: la primera llamada acabó sin ninguna línea de fin: «colgar» no se reintentaba tras soltar el canal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";

vi.mock("@/lib/llamadas/senalizacion", () => ({ abrirCanalLlamada: () => null }));
vi.mock("@/lib/network/device-registry", () => ({ getDeviceId: () => "tableta-prueba" }));

import { __vaciarCamarasNoAbren, guardarPreferencia, leerPreferencias } from "@/lib/llamadas/camaras";
import { abrirCanalLlamadaPorTransporte } from "@/lib/llamadas/canal-enlace-transporte";
import { falloDefinitivo, obtenerMedios } from "@/lib/llamadas/medios";
import { MotorLlamada } from "@/lib/llamadas/motor";
import { cicloRepartoMs, ControlReparto, kbpsMaxConCiclo, retrasoAltoMs, retrasoBajoMs, SERIAL_MIN_MS, type Entrada, type ModeloEnlace, type ResumenEnlace } from "@/lib/llamadas/video-datos/reparto";
import { __vaciarReservasVoz } from "@/lib/llamadas/voz-datos/reserva";

let lineas: string[];
beforeEach(() => {
  lineas = [];
  fijarSumideroDiagnostico((l) => lineas.push(`${l.hito} ${l.detalle}`));
  __vaciarReservasVoz();
  __vaciarCamarasNoAbren();
});
afterEach(() => {
  fijarSumideroDiagnostico(null);
  vi.unstubAllGlobals();
});

/* ───────────────────────── A · reparto con el acuse de la tableta ───────────────────────── */

/** El modelo de la tableta tal como lo escribe su línea `enlace=<C>k+<R>ms/139`. */
const tableta = (rMs: number, kbps = 160): ModeloEnlace => ({ rMs, bytesPorMs: kbps / 8, fuente: "supuesto", cicloMinMs: 139 });
/** Un segundo del carril como lo resume `MedidorEnlace.cerrarVentana` (solo voz: el vídeo está en pausa). */
const segundo = (m: ModeloEnlace, voz: number, p90: number, max: number): ResumenEnlace => ({
  modelo: m,
  maxKbps: kbpsMaxConCiclo(m),
  entregadoKbps: voz,
  vozKbps: voz,
  videoKbps: 0,
  retrasoMaxMs: max,
  ocupacion: 0.6,
  esperaP90Ms: p90,
  escriturasPorS: 5,
  bytesPorEscritura: 395,
  nativoKbps: null,
  paradas: 0,
  paradaMaxMs: 0,
});
const entrada = (r: ResumenEnlace): Entrada => ({ enlace: r, limitado: true, perdidaReceptor: null, sueloKbps: 12 });

/** Lleva el control a la pausa por «suelo» como en el aparato (`cabe=2 enlace=42k+134ms/139`, 18:53:55). */
function enPausa(): { c: ControlReparto; t: number } {
  const c = new ControlReparto(115, 30);
  let t = 0;
  for (let i = 0; i < 6 && c.estado !== "pausa"; i++) c.paso((t += 1000), entrada(segundo(tableta(134, 42), 18, 327, 361)));
  expect(c.estado).toBe("pausa");
  return { c, t };
}

describe("A · el vídeo de la tableta sale cuando cabe (reparto.ts)", () => {
  it("con el acuse de la tableta, lo que cabe es lo de parada y espera: la escritura se alarga, no se queda sin sitio", () => {
    const antes = (r: number) => Math.max(0, Math.round(160 * (1 - r / 139))); // el ciclo fijo de 139 ms
    // Lo que escribió la tableta con el ciclo fijo: «cabe=63» (R 84), «cabe=38» (R 106), «cabe=2» (42k+134ms).
    expect(antes(84)).toBe(63);
    expect(antes(106)).toBe(38);
    expect(kbpsMaxConCiclo(tableta(84))).toBeGreaterThanOrEqual(63);
    expect(kbpsMaxConCiclo(tableta(106))).toBeGreaterThanOrEqual(antes(106) + 15);
    expect(kbpsMaxConCiclo(tableta(149))).toBeGreaterThanOrEqual(40); // antes: 0
    expect(kbpsMaxConCiclo(tableta(134, 42))).toBeGreaterThan(antes(134) * 42 / 160 + 8);
    expect(cicloRepartoMs(tableta(106))).toBe(106 + SERIAL_MIN_MS);
    // Los umbrales de espera de la voz, a dos ciclos del reparto: por debajo del atasco de la escalera de la voz (≥ 400 ms).
    expect(retrasoAltoMs(tableta(106))).toBe(2 * (106 + SERIAL_MIN_MS));
    expect(retrasoAltoMs(tableta(106))).toBeLessThan(400);
    expect(retrasoBajoMs(tableta(106))).toBe(Math.round(1.6 * (106 + SERIAL_MIN_MS)));
  });

  it("con el acuse de la Mac (31–79 ms en el mismo minuto; mediana ≈ 55) nada cambia", () => {
    for (const r of [31, 45, 59, 139 - SERIAL_MIN_MS]) {
      const m = tableta(r);
      expect(cicloRepartoMs(m)).toBe(139);
      expect(kbpsMaxConCiclo(m)).toBe(Math.round(160 * (1 - r / 139)));
      expect(retrasoAltoMs(m)).toBe(278);
      expect(retrasoBajoMs(m)).toBe(222);
    }
    // Sin tope de escrituras (el carril fijo del banco) tampoco.
    expect(cicloRepartoMs({ rMs: 90, bytesPorMs: 5, fuente: "ajuste" })).toBe(100);
  });

  it("en pausa, con la voz sola como en el aparato (18:55:07: voz=19 enlace=160k+84ms/139 espera=171/200ms), el vídeo vuelve", () => {
    const { c, t: t0 } = enPausa();
    let t = t0;
    let vuelta: string | null = null;
    for (let i = 0; i < 30 && !vuelta; i++) {
      const cambio = c.paso((t += 1000), entrada(segundo(tableta(84 + (i % 3) * 10), 19, 171, 200)));
      if (cambio?.estado === "activo") vuelta = cambio.motivo;
    }
    expect(vuelta).toBe("sitio-de-nuevo"); // antes: en pausa los 30 s (cabe 44–63 → presupuesto < 2 × suelo)
  });

  it("en pausa, un segundo con la voz entre los dos umbrales (uno de cada cuatro en la tableta) no borra la calma; un atasco sí", () => {
    const m = tableta(101); // bajo y alto: 1,6 y 2 ciclos del reparto
    const vuelveCon = (malo: number) => {
      const { c, t: t0 } = enPausa();
      let t = t0;
      for (let i = 0; i < 40; i++) {
        const p90 = i % 4 === 3 ? malo : 171;
        if (c.paso((t += 1000), entrada(segundo(m, 19, p90, p90 + 20)))?.estado === "activo") return true;
      }
      return false;
    };
    expect(vuelveCon(Math.round((retrasoBajoMs(m) + retrasoAltoMs(m)) / 2))).toBe(true); // antes: la calma a cero cada cuatro segundos y nunca 5 seguidos
    expect(vuelveCon(600)).toBe(false); // con atasco (más que el umbral alto) la calma vuelve a cero, como siempre
  });

  it("y se queda en pausa si de verdad no cabe (18:55:12: enlace=54k+79ms; 18:55:46: 61k+92ms)", () => {
    const { c, t: t0 } = enPausa();
    let t = t0;
    for (let i = 0; i < 40; i++) c.paso((t += 1000), entrada(segundo(i % 2 ? tableta(79, 54) : tableta(92, 61), 19, 150, 180)));
    expect(c.estado).toBe("pausa");
  });

  it("la prueba de reanudar no falla por UN segundo de espera que la voz sola ya tiene; con dos, o con un atasco claro, sí", () => {
    const vuelve = () => {
      const { c, t: t0 } = enPausa();
      let t = t0;
      for (let i = 0; i < 30 && c.estado !== "activo"; i++) c.paso((t += 1000), entrada(segundo(tableta(101), 19, 171, 200)));
      expect(c.estado).toBe("activo");
      return { c, t };
    };
    const alto = retrasoAltoMs(tableta(101));
    // Un segundo malo (la tableta en pausa dio «espera=327/361ms» y «334/340ms» sin vídeo) y luego bien: la prueba sigue.
    let { c, t } = vuelve();
    expect(c.paso((t += 1000), entrada(segundo(tableta(101), 19, alto + 20, alto + 30)))?.motivo ?? null).not.toBe("prueba-fallida");
    c.paso((t += 1000), entrada(segundo(tableta(101), 19, 200, 230)));
    c.paso((t += 1000), entrada(segundo(tableta(101), 19, 210, 240)));
    expect(c.estado).toBe("activo");
    // Dos segundos malos: la voz manda, vuelve a la pausa.
    ({ c, t } = vuelve());
    c.paso((t += 1000), entrada(segundo(tableta(101), 19, alto + 20, alto + 30)));
    expect(c.paso((t += 1000), entrada(segundo(tableta(101), 19, alto + 20, alto + 30)))?.motivo).toBe("prueba-fallida");
    // Un atasco claro: al momento.
    ({ c, t } = vuelve());
    expect(c.paso((t += 1000), entrada(segundo(tableta(101), 19, Math.round(1.6 * alto), Math.round(1.6 * alto))))?.motivo).toBe("prueba-fallida");
  });

  it("con el acuse de la Mac la prueba sigue como antes: un segundo por encima del umbral la hace fallar", () => {
    const mac = tableta(50);
    const { c, t: t0 } = enPausa();
    let t = t0;
    for (let i = 0; i < 30 && c.estado !== "activo"; i++) c.paso((t += 1000), entrada(segundo(mac, 19, 120, 140)));
    expect(c.estado).toBe("activo");
    expect(c.paso((t += 1000), entrada(segundo(mac, 19, retrasoAltoMs(mac) + 10, retrasoAltoMs(mac) + 20)))?.motivo).toBe("prueba-fallida");
  });
});

/* ───────────────────────── B · la cámara guardada que no abre (medios.ts) ───────────────────────── */

const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Maggaboard Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Safari/537.36";

class Pista {
  enabled = true;
  readyState: "live" | "ended" = "live";
  constructor(public kind: "audio" | "video", public deviceId: string, public label: string, private alParar: (p: Pista) => void) {}
  stop() {
    if (this.readyState === "ended") return;
    this.readyState = "ended";
    this.alParar(this);
  }
  getSettings() {
    return { deviceId: this.deviceId, width: 640, height: 480 };
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

/**
 * El WebView de la tableta como en la prueba 41 (18:54:20–18:54:28): sin `deviceId` abre la frontal («camera 1»); con otra
 * abierta, NotReadableError; «camera 3» está en la lista pero sola da NotFoundError (con su id exacto y con solo el id); y
 * la que se acaba de soltar, pedida por su id exacto, NotFoundError («intento reabrir 1/3 … deviceId:exact fallo ms=20»).
 */
class WebView41 {
  vivas = new Set<Pista>();
  intentosConOtraViva = 0;
  pedidasC3 = 0;
  soltadas = new Set<string>();
  async getUserMedia(c: MediaStreamConstraints): Promise<Flujo> {
    const pistas: Pista[] = [];
    if (c.audio) pistas.push(new Pista("audio", "mic-1", "Micrófono", (p) => this.vivas.delete(p)));
    if (c.video) {
      const v = c.video === true ? {} : (c.video as MediaTrackConstraints);
      const exacto = (v.deviceId as { exact?: string } | undefined)?.exact;
      if (exacto === "c3") this.pedidasC3++;
      if ([...this.vivas].some((p) => p.kind === "video" && p.readyState === "live")) {
        this.intentosConOtraViva++;
        throw Object.assign(new Error("Could not start video source"), { name: "NotReadableError" });
      }
      if (exacto === "c3" || (exacto && this.soltadas.has(exacto))) throw Object.assign(new Error("Requested device not found"), { name: "NotFoundError" });
      const cam = exacto ? CAMARAS.find((x) => x.id === exacto)! : CAMARAS[0];
      const p = new Pista("video", cam.id, cam.label, (x) => {
        this.vivas.delete(x);
        this.soltadas.add(x.deviceId);
      });
      this.vivas.add(p);
      pistas.push(p);
    }
    return new Flujo(pistas);
  }
  async enumerateDevices() {
    return [{ kind: "audioinput", deviceId: "mic-1", label: "Micrófono", groupId: "" }, ...CAMARAS.map((c) => ({ kind: "videoinput", deviceId: c.id, label: c.label, groupId: "" }))];
  }
  addEventListener() {}
  removeEventListener() {}
}

let wv: WebView41;
function ponerTableta() {
  wv = new WebView41();
  vi.stubGlobal("navigator", { userAgent: UA_ANDROID, mediaDevices: wv, onLine: true });
  vi.stubGlobal("MediaStream", Flujo);
  const mapa = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => mapa.get(k) ?? null, setItem: (k: string, v: string) => void mapa.set(k, v), removeItem: (k: string) => void mapa.delete(k), clear: () => mapa.clear() });
}

describe("B · la cámara guardada que no abre en Android (medios.ts de verdad)", () => {
  it("nunca dos cámaras a la vez; la guardada que no abre se olvida con un aviso claro, queda la del aparato, y en la llamada siguiente no se vuelve a pedir", async () => {
    ponerTableta();
    guardarPreferencia("tableta-prueba", { camara: { id: "c3", etiqueta: "camera 3, facing front" } });
    const r = await obtenerMedios({ audio: true, video: true });
    expect(wv.intentosConOtraViva).toBe(0); // antes: 1 (NotReadableError con la frontal abierta, 18:54:22)
    const v = r.stream?.getVideoTracks()[0] as unknown as Pista | undefined;
    expect(v?.label).toBe("camera 1, facing front");
    expect(v?.readyState).toBe("live");
    expect(r.aviso).toMatch(/No se pudo abrir Cámara frontal.*Puertos › Cámara/);
    expect(leerPreferencias("tableta-prueba").camara).toBeUndefined();
    expect(lineas.some((l) => /^camara preferida-olvidada elegida="camera 3, facing front" error=NotFoundError/.test(l))).toBe(true);
    // La llamada siguiente (misma sesión o tras reiniciar: ya no está guardada): ni un intento con «camera 3».
    for (const t of r.stream!.getTracks()) (t as unknown as Pista).stop();
    const antes = wv.pedidasC3;
    const r2 = await obtenerMedios({ audio: true, video: true });
    expect(wv.pedidasC3).toBe(antes);
    expect((r2.stream?.getVideoTracks()[0] as unknown as Pista | undefined)?.label).toBe("camera 1, facing front");
    expect(r2.aviso).toBeNull();
  });

  it("solo se olvida por un fallo de la cámara, no por un «ahora no»: ocupada por otra app en el escritorio o sin permiso, se guarda", () => {
    expect(falloDefinitivo("NotFoundError", "android")).toBe(true);
    expect(falloDefinitivo("NotFoundError", "mac")).toBe(true);
    expect(falloDefinitivo("OverconstrainedError constraint=deviceId", "mac")).toBe(true);
    expect(falloDefinitivo("NotReadableError", "android")).toBe(true); // sola en la tableta: no hay otra app que la tenga
    expect(falloDefinitivo("NotReadableError", "mac")).toBe(false); // en la Mac suele ser otra app (Zoom, FaceTime…)
    expect(falloDefinitivo("NotAllowedError", "android")).toBe(false);
  });

  it("lo que abre el sistema solo no queda como preferencia; lo que la persona elige en «Puertos», sí", async () => {
    ponerTableta();
    const m = new MotorLlamada({ sesionId: "s-1113c", yo: { base: "tab", uid: "tab", nombre: "Tableta", avatar: null, invitado: false }, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
    await m.prepararMedios({ audio: true, video: false });
    expect(await m.alternarCamara()).toBeNull();
    expect(leerPreferencias("tableta-prueba").camara).toBeUndefined(); // antes: la que abrió el sistema quedaba guardada
    await m.alternarCamara(); // apagar
    await m.cambiarCamara("c2"); // elegida con la cámara apagada
    expect(await m.alternarCamara()).toBeNull();
    expect(leerPreferencias("tableta-prueba").camara?.id).toBe("c2");
    m.colgar();
  });
});

/* ───────────────────────── C · cómo acaba una llamada ───────────────────────── */

describe("C · «colgar» no se pierde al soltar el canal, y el fin queda en el registro", () => {
  it("si el primer envío de «colgar» no tiene acuse, se reintenta aunque el canal ya esté suelto, y se anota", async () => {
    const envios: Array<{ ok: boolean; t: string }> = [];
    let n = 0;
    const canal = abrirCanalLlamadaPorTransporte("tableta", "s-1", "clave-mac", {
      enviar: async (_n, cuerpo) => {
        const c = cuerpo as { t: string; senal?: { tipo: string } };
        const ok = c.t !== "llc.senal" || n++ > 0; // el primer «colgar» sin acuse (Mac sin memoria, voz esperando 1,5 s)
        envios.push({ ok, t: `${c.t}${c.senal ? `:${c.senal.tipo}` : ""}` });
        return { ok, via: "ble" };
      },
      alRecibir: () => () => undefined,
      hayEnlace: () => true,
      yo: () => "mac",
      esperar: async () => undefined,
    });
    canal.enviar({ tipo: "colgar", de: "yo" });
    canal.soltar(); // el motor suelta el canal en el mismo instante (`colgar` → `limpiar`)
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(envios.filter((e) => e.t === "llc.senal:colgar").map((e) => e.ok)).toEqual([false, true]); // antes: [false]
    expect(lineas.some((l) => /^senal-enviada colgar via=ble intento=2/.test(l))).toBe(true);
  });

  it("colgar deja «fin por=colgar …» en el registro", () => {
    vi.stubGlobal("navigator", { userAgent: UA_ANDROID, onLine: true });
    const m = new MotorLlamada({ sesionId: "s-1113c-fin", yo: { base: "mac", uid: "mac", nombre: "Mac", avatar: null, invitado: false }, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
    m.colgar("Has salido de la llamada.");
    expect(lineas.some((l) => /^fin por=colgar motivo="Has salido de la llamada." contestada=no dur-s=0/.test(l))).toBe(true);
  });
});
