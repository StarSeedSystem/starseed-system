// @vitest-environment jsdom
/**
 * XR1010AJ · PRUEBAS CON IWER (contrato `architecture/starseed-xr.md` §3 l.2). IWER 2.5.0 (MIT, Meta) emula
 * la API WebXR dentro de jsdom: sin visor, sin red y sin WebGL. Se comprueba que el sondeo ve el runtime,
 * que las capacidades salen del UA, que la sesión concede lo pedido, que `camera-access` no aparece nunca y
 * que `refinarFunciones` sustituye lo esperado por lo concedido.
 *
 * LÍMITE HONESTO: IWER no exige un gesto real de la persona al pedir sesión (el navegador sí lo exige fuera de
 * una PWA instalada en Quest). IWER tampoco sustituye a un visor: gestos, rendimiento y lo que se ve solo se
 * comprueban con el aparato, en `/xr/diagnostico`. Aquí solo pasan tsc y vitest.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { XRDevice, metaQuest3 } from "iwer";
import { evaluarCapacidades, refinarFunciones } from "@/lib/xr/capacidades";
import { esFuncionXR } from "@/lib/xr/tipos";
import { funcionesAPedir } from "../aplicar-perfil";
import { sondearNavegador } from "../sondeo-navegador";

interface XRSesionEmulada {
    enabledFeatures: string[];
    end(): Promise<void>;
}

interface XRSistemaEmulado {
    requestSession(
        modo: string,
        opciones?: { optionalFeatures?: string[]; requiredFeatures?: string[] },
    ): Promise<XRSesionEmulada>;
}

const UA_JSOM = navigator.userAgent;
let dispositivo: XRDevice;

function sistemaXR(): XRSistemaEmulado {
    const xr = (navigator as unknown as { xr?: XRSistemaEmulado }).xr;
    if (!xr) throw new Error("IWER no instaló navigator.xr");
    return xr;
}

beforeAll(() => {
    // IWER toca `WebGL2RenderingContext.prototype` al instalar el runtime; jsdom no trae WebGL. Se simula
    // SOLO esa pieza mínima en la prueba, nunca en el código de producción.
    if (typeof WebGL2RenderingContext === "undefined") vi.stubGlobal("WebGL2RenderingContext", class {});
    // jsdom no trae lienzo: `getContext` devolvería null con un aviso en stderr. Se simula lo mismo, en silencio.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    // jsdom no implementa `isSecureContext`; localhost/https es contexto seguro en un navegador real.
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    dispositivo = new XRDevice(metaQuest3);
    dispositivo.installRuntime();
});

afterAll(() => {
    dispositivo?.uninstallRuntime();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("IWER en jsdom · sondeo y capacidades", () => {
    it("(1) sondearNavegador ve navigator.xr con VR y AR", async () => {
        const datos = await sondearNavegador();
        expect(navigator.xr).toBeDefined();
        expect(datos).toMatchObject({ tieneXR: true, vr: true, ar: true });
        expect(datos.ua).toContain("Quest 3");
    });

    it("(2) plataforma por UA: jsdom es escritorio; el UA de Quest es quest y recomienda VR inmersivo", async () => {
        const datos = await sondearNavegador();
        const enJsdom = evaluarCapacidades({ ...datos, ua: UA_JSOM });
        expect(["desconocida", "escritorio"]).toContain(enJsdom.plataforma);
        const enQuest = evaluarCapacidades(datos, { contexto: "mundo-vr" });
        expect(enQuest.plataforma).toBe("quest");
        expect(enQuest.recomendado).toBe("vr-inmersivo");
    });
});

describe("IWER en jsdom · sesión y funciones", () => {
    it("(3) requestSession('immersive-vr') concede local-floor y hand-tracking", async () => {
        const sesion = await sistemaXR().requestSession("immersive-vr", {
            optionalFeatures: ["local-floor", "hand-tracking"],
        });
        expect(sesion.enabledFeatures).toContain("local-floor");
        expect(sesion.enabledFeatures).toContain("hand-tracking");
        await sesion.end();
    });

    it("(4) funcionesAPedir no pide camera-access y la sesión concedida no la trae", async () => {
        const capacidades = evaluarCapacidades(await sondearNavegador(), { contexto: "mundo-vr" });
        const pedidas = funcionesAPedir(capacidades);
        const todas = [...pedidas.opcionales, ...pedidas.requeridas];
        expect(todas).not.toContain("camera-access");
        const sesion = await sistemaXR().requestSession("immersive-vr", { optionalFeatures: todas });
        expect(sesion.enabledFeatures).not.toContain("camera-access");
        await sesion.end();
    });

    it("(5) límite de la emulación: IWER abre sin gesto real; el navegador del visor sí lo exige", async () => {
        // En jsdom no hay activación de usuario y aun así resuelve: comodidad de IWER, no una promesa del OS.
        // Fuera de una PWA instalada en Quest, el navegador real solo abre la sesión tras tocar un botón.
        const sesion = await sistemaXR().requestSession("immersive-vr");
        expect(sesion).toBeDefined();
        await sesion.end();
    });

    it("(6) refinarFunciones sustituye lo esperado por lo concedido", async () => {
        const capacidades = evaluarCapacidades(await sondearNavegador(), { contexto: "mundo-vr" });
        const pedidas = funcionesAPedir(capacidades);
        const sesion = await sistemaXR().requestSession("immersive-vr", {
            optionalFeatures: pedidas.opcionales,
            requiredFeatures: pedidas.requeridas,
        });
        const refinadas = refinarFunciones(capacidades, sesion.enabledFeatures);
        expect(refinadas.funciones).toEqual(sesion.enabledFeatures.filter(esFuncionXR));
        expect(refinadas.funciones).toContain("local-floor");
        expect(refinadas.funciones).not.toContain("layers"); // IWER no emula capas
        expect(refinadas.funciones).not.toEqual(capacidades.funciones);
        await sesion.end();
    });
});
