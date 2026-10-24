/** XR1010D · perfil de calidad → sesión, y almacén XR. Sin WebXR ni red: sesión, renderer y librería se inyectan. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { FUNCIONES_ESPERADAS, type CapacidadesXR } from "@/lib/xr/capacidades";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { FuncionXR, PlataformaVisor } from "@/lib/xr/tipos";
import { ajustesDePerfil, aplicarASesion, escalaParaSesion, funcionesAPedir } from "../aplicar-perfil";
import { crearAlmacenXR, obtenerAlmacenXR, opcionesAlmacenXR, soltarAlmacenXR, type CrearXRStore } from "../almacen-xr";

const fabrica = vi.hoisted(() => {
    interface Sesion { end(): Promise<void> }
    interface Falso { opciones: unknown; destruido: boolean; sesion?: Sesion; getState(): { session?: Sesion }; destroy(): void }
    const creados: Falso[] = [];
    const crear = (opciones: unknown): Falso => {
        const f: Falso = { opciones, destruido: false, getState: () => ({ session: f.sesion }), destroy: () => { f.destruido = true; } };
        return creados.push(f), f;
    };
    return { creados, crear };
});
vi.mock("@react-three/xr", () => ({ createXRStore: fabrica.crear }));

const cap = (plataforma: PlataformaVisor, funciones: FuncionXR[] = FUNCIONES_ESPERADAS[plataforma]): CapacidadesXR => ({
    plataforma, visor: true, modos: ["2d", "vr-inmersivo", "ar-passthrough"], recomendado: "vr-inmersivo",
    entradas: ["mandos"], funciones, ofrecerSesion: true, motivos: [], avisos: [],
});
const base = { perfil: PERFILES.alta, capacidades: cap("quest") };
afterEach(async () => { await soltarAlmacenXR(); fabrica.creados.length = 0; });

describe("funcionesAPedir", () => {
    it("nunca incluye camera-access, ni aunque se cuele en las funciones (lista blanca)", () => {
        const coladas = [...FUNCIONES_ESPERADAS.quest, "camera-access"] as unknown as FuncionXR[];
        const f = funcionesAPedir(cap("quest", coladas), { habitacion: true });
        expect([...f.opcionales, ...f.requeridas]).not.toContain("camera-access");
    });
    it("plane-detection solo con habitación y solo en requeridas; local-floor requerida", () => {
        const sin = funcionesAPedir(cap("quest"));
        expect([...sin.opcionales, ...sin.requeridas]).not.toContain("plane-detection");
        const con = funcionesAPedir(cap("quest"), { habitacion: true });
        expect(con.requeridas).toEqual(["local-floor", "plane-detection"]);
        expect(con.opcionales).toEqual(expect.arrayContaining(["hand-tracking", "layers"]));
        expect(con.opcionales).not.toContain("plane-detection");
    });
    it("con habitación no exige plane-detection donde la plataforma no la ofrece", () => {
        expect(funcionesAPedir(cap("android-xr"), { habitacion: true }).requeridas).toEqual(["local-floor"]);
    });
});

describe("ajustesDePerfil", () => {
    const hz = [72, 90, 120];
    it("usa el refresco preferido si está soportado (72/90/120)", () => {
        expect(ajustesDePerfil(PERFILES.minima, hz).frameRate).toBe(72);
        expect(ajustesDePerfil(PERFILES.alta, hz).frameRate).toBe(90);
        expect(ajustesDePerfil(PERFILES.maxima, hz)).toEqual({ foveacion: 0, frameRate: 120, escala: 1.3 });
    });
    it("si no está, el mayor soportado por debajo; si no hay ninguno debajo, el menor soportado", () => {
        expect(ajustesDePerfil(PERFILES.maxima, [72, 90]).frameRate).toBe(90);
        expect(ajustesDePerfil(PERFILES.minima, [90, 120]).frameRate).toBe(90);
    });
    it("sin lista de soportados, frameRate es undefined", () => {
        expect([ajustesDePerfil(PERFILES.media).frameRate, ajustesDePerfil(PERFILES.media, []).frameRate]).toEqual([undefined, undefined]);
        expect([escalaParaSesion(1.3, 1.2), escalaParaSesion(1.3, Number.NaN)]).toEqual([1.2, 1]);
    });
});

describe("aplicarASesion", () => {
    it("aplica foveación y refresco soportado", () => {
        const setFoveation = vi.fn();
        const updateTargetFrameRate = vi.fn(async () => undefined);
        const n = aplicarASesion({ updateTargetFrameRate, supportedFrameRates: new Float32Array([72, 90, 120]) }, { xr: { setFoveation } }, { foveacion: 0.3, frameRate: 90 });
        expect(n).toBe(2);
        expect([setFoveation.mock.calls[0][0], updateTargetFrameRate.mock.calls[0]]).toEqual([0.3, [90]]);
    });
    it("sesión sin updateTargetFrameRate y renderer sin setFoveation: no lanza", () => {
        expect(() => aplicarASesion({}, { xr: {} }, { foveacion: 1, frameRate: 72 })).not.toThrow();
        expect(aplicarASesion({}, {}, { foveacion: 1, frameRate: 72 })).toBe(0);
    });
    it("un fallo síncrono o un rechazo no rompen nada y se avisan; un Hz no soportado no se pide", async () => {
        const alFallar = vi.fn();
        const updateTargetFrameRate = vi.fn(() => Promise.reject(new Error("no")));
        const setFoveation = () => { throw new Error("sin capa"); };
        expect(aplicarASesion({ updateTargetFrameRate }, { xr: { setFoveation } }, { foveacion: 0.5, frameRate: 72 }, alFallar)).toBe(1);
        await new Promise((r) => setTimeout(r, 0));
        expect(alFallar.mock.calls.map((c) => c[0])).toEqual(["foveacion", "frameRate"]);
        updateTargetFrameRate.mockClear();
        aplicarASesion({ updateTargetFrameRate, supportedFrameRates: [72, 90] }, {}, { foveacion: 0, frameRate: 120 });
        expect(updateTargetFrameRate).not.toHaveBeenCalled();
    });
});

describe("almacén XR", () => {
    it("emulate es false en producción aunque haya ?emulador=1, y por defecto (NODE_ENV de pruebas)", () => {
        expect(opcionesAlmacenXR({ ...base, produccion: true, busqueda: "?emulador=1" }).opciones.emulate).toBe(false);
        expect(opcionesAlmacenXR(base).opciones.emulate).toBe(false);
        expect(opcionesAlmacenXR({ ...base, produccion: false, busqueda: "?modo=vr" }).opciones.emulate).toBe(false);
        expect(opcionesAlmacenXR({ ...base, produccion: false, busqueda: "?modo=vr&emulador=1" }).opciones.emulate).toEqual({ type: "metaQuest3", inject: true });
    });
    it("offerSession y enterGrantedSession encendidos; funciones explícitas; perfil → foveación, Hz y escala", () => {
        const { opciones: o, sinTraducir } = opcionesAlmacenXR({ ...base, produccion: true });
        expect([o.offerSession, o.enterGrantedSession, o.foveation]).toEqual([true, true, 0.3]);
        expect([o.planeDetection, o.bodyTracking, o.domOverlay, o.handTracking, o.layers]).toEqual([false, false, false, true, true]);
        expect(opcionesAlmacenXR({ ...base, habitacion: true }).opciones.planeDetection).toBe("required");
        expect(sinTraducir).toEqual(["bounded-floor"]);
        expect(typeof o.frameRate === "function" && o.frameRate(new Float32Array([72, 90, 120]))).toBe(90);
        expect(typeof o.frameBufferScaling === "function" && o.frameBufferScaling(1.1)).toBe(1.1);
        expect(JSON.stringify(o)).not.toContain("camera");
    });
    it("crearAlmacenXR pasa las opciones a la fábrica inyectada", () => {
        const crear = vi.fn<CrearXRStore>(); crearAlmacenXR({ ...base, produccion: true }, crear);
        expect(crear.mock.calls[0][0]?.emulate).toBe(false);
    });
    it("obtenerAlmacenXR: perezoso, uno solo; se rehace si cambian las funciones sin sesión, no con sesión", async () => {
        expect(fabrica.creados).toHaveLength(0);
        const [a, b] = await Promise.all([obtenerAlmacenXR(base), obtenerAlmacenXR({ ...base, perfil: PERFILES.minima })]);
        expect(a === b && fabrica.creados.length === 1).toBe(true);
        const c = await obtenerAlmacenXR({ ...base, habitacion: true });
        expect(fabrica.creados[0].destruido).toBe(true);
        fabrica.creados[1].sesion = { end: vi.fn(async () => undefined) };
        expect(await obtenerAlmacenXR(base)).toBe(c);
        expect(fabrica.creados).toHaveLength(2);
    });
});
