// @vitest-environment jsdom
/**
 * XR1010AJ · IWER (Meta, MIT) emula WebXR dentro de jsdom: sin visor, sin red y sin WebGL de verdad.
 * Contrato `architecture/starseed-xr.md` §3 (l). Lo que aquí pasa NO demuestra que se vea bien en un
 * visor; eso solo se comprueba con el visor puesto en `/xr/diagnostico` (XR1010AI).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { XRDevice, metaQuest3 } from "iwer";
import { evaluarCapacidades, refinarFunciones } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "../aplicar-perfil";
import { sondearNavegador, type EntornoNavegador } from "../sondeo-navegador";

type SesionEmulada = { enabledFeatures: string[]; end(): Promise<void> };
type XREmulada = {
    isSessionSupported(modo: string): Promise<boolean>;
    requestSession(modo: string, init?: { requiredFeatures?: string[]; optionalFeatures?: string[] }): Promise<SesionEmulada>;
};

const JS_DOM_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/1.0";

let dispositivo: XRDevice;
const abiertas: SesionEmulada[] = [];

function xrEmulada(): XREmulada {
    return navigator.xr as unknown as XREmulada;
}

function entorno(ua: string): EntornoNavegador {
    return {
        ua, seguro: true, xr: xrEmulada(), maxTouchPoints: 0,
        webgl2: () => false, webgpu: false, standalone: false, digitalGoods: false,
    };
}

async function abrir(modo: string, init?: { requiredFeatures?: string[]; optionalFeatures?: string[] }): Promise<SesionEmulada> {
    const sesion = await xrEmulada().requestSession(modo, init);
    abiertas.push(sesion);
    return sesion;
}

beforeAll(() => {
    // jsdom no trae WebGL2 y `installRuntime` toca su prototipo: se simula esa pieza mínima aquí,
    // nunca en el código de producción.
    vi.stubGlobal("WebGL2RenderingContext", class {});
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    dispositivo = new XRDevice(metaQuest3, { canvasContainer: document.createElement("div") });
    dispositivo.installRuntime({ forceInstall: true });
});

afterEach(async () => {
    for (const sesion of abiertas.splice(0)) await sesion.end().catch(() => undefined);
});

afterAll(() => {
    dispositivo.uninstallRuntime();
    vi.unstubAllGlobals();
});

describe("IWER · entrada emulada a WebXR", () => {
    it("(1) el sondeo ve navigator.xr con VR y AR, sin WebGL", async () => {
        expect(navigator.userAgent).toContain("Quest 3");
        const d = await sondearNavegador(entorno(navigator.userAgent));
        expect(d.tieneXR).toBe(true);
        expect([d.vr, d.ar]).toEqual([true, true]);
        expect(d.webgl2).toBe(false);
    });

    it("(1b) sin entorno inyectado, el sondeo lee el navigator.xr real", async () => {
        expect(navigator.xr).toBeDefined();
        const d = await sondearNavegador();
        expect(d).toMatchObject({ tieneXR: true, vr: true, ar: true });
        expect(d.ua).toContain("Quest 3");
    });

    it("(2) UA de jsdom = escritorio; UA de Quest = quest con VR recomendada", async () => {
        const jsdom = evaluarCapacidades(await sondearNavegador(entorno(JS_DOM_UA)));
        expect(["desconocida", "escritorio"]).toContain(jsdom.plataforma);

        const quest = evaluarCapacidades(await sondearNavegador(entorno(navigator.userAgent)), { contexto: "mundo-vr" });
        expect(quest.plataforma).toBe("quest");
        expect(quest.recomendado).toBe("vr-inmersivo");
    });

    it("(3) requestSession inmersivo concede local-floor y hand-tracking", async () => {
        const sesion = await abrir("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
        expect(sesion.enabledFeatures).toContain("local-floor");
        expect(sesion.enabledFeatures).toContain("hand-tracking");
    });

    it("(4) funcionesAPedir nunca pide camera-access y la sesión no lo concede", async () => {
        const c = evaluarCapacidades(await sondearNavegador(entorno(navigator.userAgent)));
        const pedidas = funcionesAPedir(c);
        const todas = [...pedidas.requeridas, ...pedidas.opcionales];
        expect(todas).not.toContain("camera-access");
        const sesion = await abrir("immersive-vr", { requiredFeatures: pedidas.requeridas, optionalFeatures: pedidas.opcionales });
        expect(sesion.enabledFeatures).not.toContain("camera-access");
        expect(sesion.enabledFeatures).toContain("local-floor");
    });

    it("(5) LÍMITE de la emulación: sin gesto real IWER abre la sesión igual", async () => {
        // En un navegador de verdad `requestSession` exige activación del usuario; IWER no la comprueba.
        const sesion = await abrir("immersive-vr", { optionalFeatures: ["local-floor"] });
        expect(sesion.enabledFeatures).toContain("local-floor");
    });

    it("(6) refinarFunciones cambia lo esperado por lo concedido", async () => {
        const c = evaluarCapacidades(await sondearNavegador(entorno(navigator.userAgent)));
        const sesion = await abrir("immersive-vr", { requiredFeatures: ["local-floor"], optionalFeatures: ["hand-tracking"] });
        const refinadas = refinarFunciones(c, sesion.enabledFeatures);
        expect(refinadas.funciones).toEqual(["local-floor", "hand-tracking"]);
        expect(refinadas.funciones).not.toContain("plane-detection");
        expect(refinadas.plataforma).toBe(c.plataforma);
    });
});
