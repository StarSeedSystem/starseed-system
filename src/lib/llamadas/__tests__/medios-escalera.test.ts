// @vitest-environment jsdom
/**
 * LLA1111A · la escalera de relajación de la cámara (prueba.35: la FaceTime de la Mac respondía OverconstrainedError a
 * todo lo que pedía la llamada y solo abrían las cámaras del iPhone).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fijarSumideroDiagnostico } from "../voz-datos/diagnostico";
import { describirErrorMedios, escaleraCamara, obtenerMedios, relajarTrasError, resolverCamaraPedida, restriccionesVideo, textoRestricciones } from "../medios";
import { describirCamaras, guardarPreferencia } from "../camaras";
import { diagnosticarMedios } from "../permiso-medios";
import { getDeviceId } from "@/lib/network/device-registry";

describe("escaleraCamara (pura)", () => {
  it("escritorio sin cámara pedida: deseos como ideal, sin facingMode ni frameRate obligatorio; luego video:true", () => {
    const e = escaleraCamara(null, "mac");
    expect(e.map((p) => p.paso)).toEqual(["deseo", "libre"]);
    const v = e[0].video as MediaTrackConstraints;
    expect(v).not.toHaveProperty("facingMode");
    expect(v.frameRate).toEqual({ ideal: 24 });
    expect(JSON.stringify(v)).not.toMatch(/"(max|min|exact)"/);
    expect(e[1].video).toBe(true);
  });

  it("con cámara pedida: deseos + id › solo el id exacto › libre", () => {
    const e = escaleraCamara("ft", "windows");
    expect(e.map((p) => p.paso)).toEqual(["deseo", "solo-id", "libre"]);
    expect((e[0].video as MediaTrackConstraints).deviceId).toEqual({ exact: "ft" });
    expect(e[1].video).toEqual({ deviceId: { exact: "ft" } });
  });

  it("en un teléfono pide la frontal solo como preferencia (ideal), nunca exacta", () => {
    expect(restriccionesVideo(null, "android", false).facingMode).toEqual({ ideal: "user" });
    expect(restriccionesVideo(null, "ios", true)).toMatchObject({ width: { ideal: 640 }, frameRate: { ideal: 15 } });
    expect(restriccionesVideo("x", "android", false)).not.toHaveProperty("facingMode");
  });

  it("texto de restricciones y del error para el registro", () => {
    expect(textoRestricciones({ width: { ideal: 1280 }, frameRate: { ideal: 24, max: 30 }, deviceId: { exact: "abc" }, facingMode: "user" })).toBe("width:ideal=1280,frameRate:ideal=24,frameRate:max=30,deviceId:exact,facingMode:bare=user");
    expect(textoRestricciones(true)).toBe("ninguna");
    expect(describirErrorMedios({ name: "OverconstrainedError", constraint: "frameRate" })).toBe("OverconstrainedError constraint=frameRate");
    expect(describirErrorMedios({ name: "OverconstrainedError" })).toBe("OverconstrainedError constraint=?");
    expect(describirErrorMedios({ name: "NotReadableError" })).toBe("NotReadableError");
    expect(relajarTrasError({ name: "OverconstrainedError" })).toBe(true);
    expect(relajarTrasError({ name: "NotFoundError" })).toBe(true);
    expect(relajarTrasError({ name: "NotAllowedError" })).toBe(false);
    expect(relajarTrasError({ name: "NotReadableError" })).toBe(false);
  });
});

describe("resolverCamaraPedida (los ids de WebKit cambian entre arranques)", () => {
  const lista = describirCamaras([
    { id: "nuevo-ft", nombre: "FaceTime HD Camera" },
    { id: "ph", nombre: "iPhone de Alex Camera" },
  ], "mac");
  it("por id", () => {
    expect(resolverCamaraPedida(lista, "ph")?.etiqueta).toBe("iPhone de Alex Camera");
  });
  it("id viejo: por la etiqueta recordada con ese id", () => {
    expect(resolverCamaraPedida(lista, "viejo-ft", { id: "viejo-ft", etiqueta: "FaceTime HD Camera" })?.id).toBe("nuevo-ft");
  });
  it("id viejo sin etiqueta recordada (o de otra cámara): no adivina", () => {
    expect(resolverCamaraPedida(lista, "viejo-ft", null)).toBeNull();
    expect(resolverCamaraPedida(lista, "viejo-ft", { id: "otro", etiqueta: "FaceTime HD Camera" })).toBeNull();
  });
});

/* ── obtenerMedios con un mediaDevices falso que se comporta como la Mac ── */

type Disp = { id: string; label: string; rechaza?: (v: Record<string, unknown>) => string | null; ocupada?: boolean };

function pista(id: string, label: string) {
  const t = { kind: "video", label, readyState: "live", stopped: false, getSettings: () => ({ deviceId: id }), stop: () => void (t.stopped = true), getCapabilities: () => ({}) };
  return t as unknown as MediaStreamTrack & { stopped: boolean };
}
function flujo(pistas: MediaStreamTrack[]) {
  const l = [...pistas];
  return {
    getVideoTracks: () => l.filter((t) => t.kind === "video"),
    getAudioTracks: () => l.filter((t) => t.kind === "audio"),
    getTracks: () => l.slice(),
    addTrack: (t: MediaStreamTrack) => void l.push(t),
    removeTrack: (t: MediaStreamTrack) => void l.splice(l.indexOf(t), 1),
  } as unknown as MediaStream;
}
function macFalsa(disp: Disp[], porDefecto = 0) {
  const pedidas: string[] = [];
  const md = {
    enumerateDevices: async () => disp.map((d) => ({ kind: "videoinput", deviceId: d.id, label: d.label })),
    getUserMedia: async (c: MediaStreamConstraints) => {
      pedidas.push(JSON.stringify(c.video));
      const v = c.video === true ? {} : (c.video as Record<string, unknown>);
      const id = (v.deviceId as { exact?: string } | undefined)?.exact;
      const fallo = (constraint: string) => Object.assign(new Error("x"), { name: "OverconstrainedError", constraint });
      const orden = id ? disp.filter((d) => d.id === id) : [disp[porDefecto], ...disp.filter((_, i) => i !== porDefecto)];
      if (!orden.length) throw Object.assign(new Error("x"), { name: "NotFoundError" });
      const d = orden.find((x) => !x.rechaza?.(v));
      if (!d) throw fallo(orden[0].rechaza?.(v) ?? "?");
      if (d.ocupada) throw Object.assign(new Error("x"), { name: "NotReadableError" });
      return flujo([pista(d.id, d.label)]);
    },
  } as unknown as MediaDevices;
  return { md, pedidas };
}
/** La regla de la Mac (hipótesis principal): un ritmo fijo de 30,00003 fps; un `frameRate.max` de 30 lo deja fuera. */
const reglaFps = (v: Record<string, unknown>) => {
  const fr = v.frameRate as { max?: number } | undefined;
  return fr && typeof fr === "object" && fr.max !== undefined && fr.max < 30.000030517578125 ? "frameRate" : null;
};
/** Otra hipótesis: `deviceId` exacto junto a un tamaño. */
const reglaIdTamano = (v: Record<string, unknown>) => ((v.deviceId as { exact?: string } | undefined)?.exact && v.width !== undefined ? "width" : null);

describe("obtenerMedios por la escalera", () => {
  const lineas: string[] = [];
  const mdOriginal = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  const poner = (md: MediaDevices) => Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true });
  beforeEach(() => {
    localStorage.clear();
    lineas.length = 0;
    fijarSumideroDiagnostico((l) => void lineas.push(`${l.hito} ${l.detalle}`));
  });
  afterEach(() => {
    if (mdOriginal) Object.defineProperty(navigator, "mediaDevices", mdOriginal);
    else delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
  });

  it("la FaceTime que rechaza frameRate max abre a la primera (ya no se pide)", async () => {
    const { md, pedidas } = macFalsa([{ id: "ft", label: "FaceTime HD Camera", rechaza: reglaFps }, { id: "dv", label: "iPhone Desk View Camera" }]);
    poner(md);
    const r = await obtenerMedios({ audio: false, video: true, camaraId: "ft" });
    expect(r.error).toBeNull();
    expect(r.stream?.getVideoTracks()[0].label).toBe("FaceTime HD Camera");
    expect(pedidas).toHaveLength(1);
    expect(lineas.some((l) => /intento pedida 1\/3 paso=deseo .* ok /.test(l))).toBe(true);
  });

  it("si rechaza deviceId+tamaño: registra la restricción y abre con solo el id", async () => {
    const { md } = macFalsa([{ id: "ft", label: "FaceTime HD Camera", rechaza: reglaIdTamano }, { id: "dv", label: "iPhone Desk View Camera" }]);
    poner(md);
    const r = await obtenerMedios({ audio: false, video: true, camaraId: "ft" });
    expect(r.stream?.getVideoTracks()[0].label).toBe("FaceTime HD Camera");
    expect(lineas).toEqual(expect.arrayContaining([expect.stringMatching(/paso=deseo restr=width:ideal=1280.*deviceId:exact fallo .*error=OverconstrainedError constraint=width se relaja/), expect.stringMatching(/paso=solo-id restr=deviceId:exact ok/)]));
  });

  it("si solo abre sin restricciones: video:true y después pasa a la pedida (id viejo → por etiqueta)", async () => {
    const todo = (v: Record<string, unknown>) => (Object.keys(v).length ? "deviceId" : null);
    let primera = true;
    const base = macFalsa([{ id: "dv", label: "iPhone Desk View Camera" }, { id: "ft2", label: "FaceTime HD Camera" }]);
    // La primera vez todo lo que lleve restricciones falla (como si el permiso aún no estuviera); luego ya abre.
    const md = {
      enumerateDevices: base.md.enumerateDevices,
      getUserMedia: async (c: MediaStreamConstraints) => {
        if (primera && c.video !== true && todo(c.video as Record<string, unknown>)) throw Object.assign(new Error("x"), { name: "OverconstrainedError", constraint: "deviceId" });
        if (c.video === true) primera = false;
        return base.md.getUserMedia(c);
      },
    } as unknown as MediaDevices;
    poner(md);
    guardarPreferencia(getDeviceId() || "local", { camara: { id: "ft-viejo", etiqueta: "FaceTime HD Camera" } });
    const r = await obtenerMedios({ audio: false, video: true, camaraId: "ft-viejo" });
    expect(r.error).toBeNull();
    expect(r.stream?.getVideoTracks().map((t) => t.label)).toEqual(["FaceTime HD Camera"]);
    expect(lineas.some((l) => /paso=libre restr=ninguna ok/.test(l))).toBe(true);
    expect(lineas.some((l) => /tras-libre pedida="FaceTime HD Camera" abierta/.test(l))).toBe(true);
  });

  it("pedida a mano y ocupada: no devuelve otra cámara en silencio, dice por qué", async () => {
    const { md } = macFalsa([{ id: "dv", label: "iPhone Desk View Camera", ocupada: true }, { id: "ft", label: "FaceTime HD Camera" }], 1);
    poner(md);
    const r = await obtenerMedios({ audio: false, video: true, camaraId: "dv" });
    expect(r.stream).toBeNull();
    expect(r.error).toMatch(/ocupada/);
    expect(r.error).not.toMatch(/No encontramos/);
  });

  it("la elegida que no abre no se queda como la guardada: vuelve la última que abrió", async () => {
    const { md } = macFalsa([{ id: "dv", label: "iPhone Desk View Camera", ocupada: true }, { id: "ft", label: "FaceTime HD Camera" }], 1);
    poner(md);
    const neurona = getDeviceId() || "local";
    expect((await obtenerMedios({ audio: false, video: true, camaraId: "ft" })).error).toBeNull();
    // El motor guarda la elegida ANTES de abrirla (MotorLlamada.cambiarCamara).
    guardarPreferencia(neurona, { camara: { id: "dv", etiqueta: "iPhone Desk View Camera" } });
    expect((await obtenerMedios({ audio: false, video: true, camaraId: "dv" })).error).toMatch(/ocupada/);
    expect(JSON.parse(localStorage.getItem("starseed.llamadas.dispositivos") ?? "{}").neuronas[neurona].camara).toEqual({ id: "ft", etiqueta: "FaceTime HD Camera" });
    expect(lineas.some((l) => /preferencia-restaurada a="FaceTime HD Camera"/.test(l))).toBe(true);
  });

  it("nunca «No encontramos ninguna cámara» con cámaras en la lista", async () => {
    const siempre = () => "frameRate";
    const { md } = macFalsa([{ id: "ft", label: "FaceTime HD Camera", rechaza: siempre }]);
    poner(md);
    const r = await obtenerMedios({ audio: false, video: true });
    expect(r.stream).toBeNull();
    expect(r.error).not.toMatch(/No encontramos/);
    expect(r.error).toMatch(/constraint=frameRate/);
  });

  it("sin cámara pedida en el escritorio: la del sistema y luego la integrada; ninguna petición con facingMode", async () => {
    const { md, pedidas } = macFalsa([{ id: "dv", label: "iPhone Desk View Camera" }, { id: "ft", label: "FaceTime HD Camera", rechaza: reglaFps }], 0);
    poner(md);
    const r = await obtenerMedios({ audio: false, video: true });
    expect(r.stream?.getVideoTracks().map((t) => t.label)).toEqual(["FaceTime HD Camera"]);
    expect(pedidas.some((p) => /facingMode|"max"/.test(p))).toBe(false);
    expect(lineas).toContain('camara camara elegida="FaceTime HD Camera" (integrada) motivo=integrada');
  });
});

describe("diagnosticarMedios · OverconstrainedError", () => {
  it("no dice «no hay cámara»: dice qué restricción no aceptó", () => {
    const d = diagnosticarMedios({ name: "OverconstrainedError", constraint: "frameRate" }, { audio: false, video: true }, { nativa: true, plataforma: "macos", estado: null });
    expect(d.mensaje).toMatch(/no acepta la configuración/);
    expect(d.mensaje).toMatch(/frameRate/);
    expect(d.mensaje).not.toMatch(/No encontramos/);
    const w = diagnosticarMedios({ name: "OverconstrainedError" }, { audio: false, video: true }, { nativa: false, plataforma: "otra", estado: null });
    expect(w.causa).toBe("otro");
  });
});
