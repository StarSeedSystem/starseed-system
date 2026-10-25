/**
 * StarSeed XR · sesiones WEBXR EMULADAS con iwer (rescate de la rama nube/40121447096 · RTXR1010AK).
 * Recorre el camino real: sondearNavegador → evaluarCapacidades → funcionesAPedir → requestSession
 * (enabledFeatures). Corre en el entorno `node` de vitest: aquí se montan los globales mínimos
 * (document, storage, rAF) que un navegador daría de serie.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XRDevice, metaQuest3 } from "iwer";
import { evaluarCapacidades, plataformaDeDatos, refinarFunciones, type CapacidadesXR } from "@/lib/xr/capacidades";
import { _olvidarWebgl2, entornoReal, sondearNavegador } from "../sondeo-navegador";
import { funcionesAPedir } from "../aplicar-perfil";

interface SesionEmulada {
    enabledFeatures: Set<string>;
    end(): Promise<void>;
}
interface XREmulada {
    requestSession(modo: string, opciones?: { requiredFeatures?: string[]; optionalFeatures?: string[] }): Promise<SesionEmulada>;
    isSessionSupported(modo: string): Promise<boolean>;
}

const UA_JSDOM = "Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/24.0.0";

const sonda = async (): Promise<Awaited<ReturnType<typeof sondearNavegador>>> => sondearNavegador(entornoReal());

let dispositivo: XRDevice | null = null;

function montar(): XREmulada {
    const contenedor = {
        dataset: {}, appendChild: () => undefined, innerHTML: "", style: {},
        addEventListener: () => undefined, removeEventListener: () => undefined,
        getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
    };
    const canvas = { dataset: {}, style: {}, getContext: () => null };
    vi.stubGlobal("WebGL2RenderingContext", class {});
    vi.stubGlobal("document", {
        createElement: (etiqueta: string) => (etiqueta === "canvas" ? canvas : contenedor),
        createElementNS: () => contenedor,
        body: contenedor,
    });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined });
    vi.stubGlobal("requestAnimationFrame", (a: (t: number) => void) => setTimeout(() => a(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", (t: number) => clearTimeout(t));
    vi.stubGlobal("window", { isSecureContext: true, matchMedia: () => ({ matches: false }) });
    dispositivo = new XRDevice(metaQuest3);
    dispositivo.installRuntime();
    const xr = (navigator as Navigator & { xr?: XREmulada }).xr;
    if (!xr) throw new Error("IWER no instaló navigator.xr");
    return xr;
}

beforeEach(() => { _olvidarWebgl2(); });

afterEach(() => {
    dispositivo?.uninstallRuntime();
    dispositivo = null;
    vi.unstubAllGlobals();
    _olvidarWebgl2();
});

describe("sondeo real del emulador", () => {
    it("el sondeo real ve navigator.xr, VR y AR, sin WebGL 2", async () => {
        montar();
        const d = await sonda();
        expect(d.tieneXR).toBe(true);
        expect([d.vr, d.ar]).toEqual([true, true]);
        expect(d.webgl2).toBe(false);
    });

    it("UA de jsdom = escritorio; UA del visor emulado = quest y recomienda VR en un mundo VR", async () => {
        montar();
        const deJsdom = await sondearNavegador({ ...entornoReal(), ua: UA_JSDOM, seguro: true });
        expect(["desconocida", "escritorio"]).toContain(plataformaDeDatos(deJsdom));
        const d = await sonda();
        expect(d.ua).toContain("Quest 3");
        const c = evaluarCapacidades(d, { contexto: "mundo-vr" });
        expect(c.plataforma).toBe("quest");
        expect(c.recomendado).toBe("vr-inmersivo");
    });
});

describe("sesión concedida por el emulador", () => {
    it("immersive-vr concede local-floor y hand-tracking en enabledFeatures", async () => {
        const xr = montar();
        const s = await xr.requestSession("immersive-vr", { requiredFeatures: ["local-floor"], optionalFeatures: ["hand-tracking"] });
        expect([...s.enabledFeatures]).toContain("local-floor");
        expect([...s.enabledFeatures]).toContain("hand-tracking");
        await s.end();
    });

    it("ni las funciones pedidas ni la sesión concedida piden camera-access (§3 k)", async () => {
        const xr = montar();
        const pedidas = funcionesAPedir(evaluarCapacidades(await sonda()), { habitacion: true });
        const todas = [...pedidas.opcionales, ...pedidas.requeridas];
        expect(todas).not.toContain("camera-access");
        const s = await xr.requestSession("immersive-vr", { requiredFeatures: pedidas.requeridas, optionalFeatures: pedidas.opcionales });
        expect([...s.enabledFeatures]).not.toContain("camera-access");
        await s.end();
    });

    it("límite honesto de la emulación: IWER abre la segunda sesión SIN gesto de usuario", async () => {
        const xr = montar();
        const primera = await xr.requestSession("immersive-vr", { requiredFeatures: ["local-floor"] });
        await primera.end();
        const sinGesto = await xr.requestSession("immersive-vr", { requiredFeatures: ["local-floor"] });
        expect([...sinGesto.enabledFeatures]).toContain("local-floor");
        await sinGesto.end();
    });

    it("refinarFunciones sustituye lo esperado por lo concedido y lo pedido queda coherente", async () => {
        montar();
        const esperadas: CapacidadesXR = evaluarCapacidades(await sonda());
        expect(esperadas.funciones.length).toBeGreaterThan(2);
        const refinadas = refinarFunciones(esperadas, ["local-floor", "hand-tracking", "magia"]);
        expect(refinadas.funciones).toEqual(["local-floor", "hand-tracking"]);
        expect(funcionesAPedir(refinadas)).toEqual({ opcionales: ["hand-tracking"], requeridas: ["local-floor"] });
    });
});

