// @vitest-environment jsdom
/**
 * StarSeed XR · PRUEBA DE ENTRADA CON IWER (XR1010AJ, contrato §3 l.2).
 *
 * IWER (`iwer` 2.5.0, MIT, de Meta) emula la API WebXR dentro de jsdom: se instala un
 * `XRDevice(metaQuest3)` y su runtime en `window` para probar el sondeo, las capacidades y
 * `requestSession` SIN visor y SIN WebGL. El núcleo (`src/lib/xr`) no se toca: se usa su API real.
 *
 * Límite honesto de la emulación (§3 l.4): en un visor de verdad `requestSession` exige un gesto
 * de la persona; IWER lo concede sin gesto (no simula activación de usuario). Esta prueba lo deja
 * anotado, no lo celebra: lo que se ve, los gestos y el rendimiento solo se comprueban con el visor
 * real en `/xr/diagnostico`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { XRDevice, metaQuest3 } from "iwer";
import { evaluarCapacidades, refinarFunciones } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "@/components/xr/shell/aplicar-perfil";
import { sondearNavegador, type EntornoNavegador, type XRInyectable } from "@/components/xr/shell/sondeo-navegador";

interface SesionIWER {
    enabledFeatures: string[];
    end(): Promise<void>;
}

interface SistemaIWER {
    isSessionSupported(modo: string): Promise<boolean>;
    requestSession(modo: string, opciones?: { optionalFeatures?: string[] }): Promise<SesionIWER>;
}

/** jsdom no trae `WebGL2RenderingContext` y `installRuntime` toca su prototipo: se simula aquí, no en producción. */
const GLOBAL = globalThis as unknown as Record<string, unknown>;
if (typeof GLOBAL.WebGL2RenderingContext === "undefined") {
    GLOBAL.WebGL2RenderingContext = class WebGL2RenderingContextFalso {};
}
// jsdom avisa «Not implemented» al pedir un contexto WebGL: aquí no hay WebGL ni hace falta.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: () => null, configurable: true });

const sistema = (): SistemaIWER => navigator.xr as unknown as SistemaIWER;

/** El mismo `navigator.xr` emulado, con el UA que se quiera pasar al sondeo (sin tocar el del proceso). */
const entornoConUA = (ua: string): EntornoNavegador => ({
    ua, seguro: true, xr: navigator.xr as unknown as XRInyectable, maxTouchPoints: 0,
    webgl2: () => false, webgpu: false, standalone: false, digitalGoods: false,
});

/** Abre una sesión y la cierra pase lo que pase (IWER solo admite una activa a la vez). */
async function conSesion<T>(modo: string, cuerpo: (s: SesionIWER) => Promise<T>, opciones?: { optionalFeatures?: string[] }): Promise<T> {
    const sesion = await sistema().requestSession(modo, opciones);
    try { return await cuerpo(sesion); } finally { await sesion.end(); }
}

let device: XRDevice;
let uaJsdom = "";

beforeAll(() => {
    uaJsdom = navigator.userAgent;
    device = new XRDevice(metaQuest3);
    device.installRuntime();
});

afterAll(() => {
    device?.uninstallRuntime();
});

describe("IWER · entrada a VR/AR emulada sin visor", () => {
    it("(1) sondearNavegador ve navigator.xr con VR y AR", async () => {
        expect(typeof navigator.xr).toBe("object");
        const datos = await sondearNavegador();
        expect(datos.tieneXR).toBe(true);
        expect(datos.vr).toBe(true);
        expect(datos.ar).toBe(true);
    });

    it("(2) con el UA de jsdom la plataforma no es un visor; con el UA de Quest sí es quest y recomienda VR", async () => {
        const deJsdom = evaluarCapacidades(await sondearNavegador(entornoConUA(uaJsdom)));
        expect(["desconocida", "escritorio"]).toContain(deJsdom.plataforma);

        const deQuest = evaluarCapacidades(
            await sondearNavegador(entornoConUA(metaQuest3.userAgent)),
            { contexto: "mundo-vr" },
        );
        expect(deQuest.plataforma).toBe("quest");
        expect(deQuest.recomendado).toBe("vr-inmersivo");
        expect(deQuest.modos).toEqual(expect.arrayContaining(["vr-inmersivo", "ar-passthrough"]));
    });

    it("(3) requestSession concede la sesión con local-floor entre sus enabledFeatures", async () => {
        await conSesion("immersive-vr", async (sesion) => {
            expect(sesion.enabledFeatures).toContain("local-floor");
            expect(sesion.enabledFeatures).toContain("hand-tracking");
        }, { optionalFeatures: ["local-floor", "hand-tracking"] });
    });

    it("(4) funcionesAPedir nunca pide camera-access y la sesión concedida tampoco la trae", async () => {
        const capacidades = evaluarCapacidades(
            await sondearNavegador(entornoConUA(metaQuest3.userAgent)),
            { contexto: "mundo-vr" },
        );
        const pedidas = funcionesAPedir(capacidades, { habitacion: true });
        expect([...pedidas.opcionales, ...pedidas.requeridas]).not.toContain("camera-access");
        await conSesion("immersive-vr", async (sesion) => {
            expect(sesion.enabledFeatures).not.toContain("camera-access");
        }, { optionalFeatures: [...pedidas.opcionales, ...pedidas.requeridas] });
    });

    it("(5) LÍMITE DE LA EMULACIÓN: IWER abre la sesión sin gesto; el visor real exige activación", async () => {
        // jsdom no tiene activación de usuario y aun así la promesa se resuelve: IWER no la comprueba.
        // Esto NO demuestra que se pueda entrar sin tocar nada en un visor: allí manda el navegador.
        await conSesion("immersive-vr", async (sesion) => {
            expect(sesion.enabledFeatures.length).toBeGreaterThan(0);
        });
    });

    it("(6) refinarFunciones sustituye lo esperado por lo concedido", async () => {
        const capacidades = evaluarCapacidades(
            await sondearNavegador(entornoConUA(metaQuest3.userAgent)),
            { contexto: "mundo-vr" },
        );
        expect(capacidades.funciones).toContain("hand-tracking");
        expect(capacidades.funciones).toContain("mesh-detection");
        await conSesion("immersive-vr", async (sesion) => {
            const refinadas = refinarFunciones(capacidades, sesion.enabledFeatures);
            expect(refinadas.funciones).toContain("local-floor");
            expect(refinadas.funciones).not.toContain("mesh-detection");
            expect(refinadas.funciones).not.toContain("camera-access");
            for (const f of sesion.enabledFeatures) {
                if (f === "local-floor" || f === "hand-tracking") expect(refinadas.funciones).toContain(f);
            }
        }, { optionalFeatures: ["local-floor", "hand-tracking"] });
    });
});
