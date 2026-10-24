// @vitest-environment jsdom
/**
 * StarSeed XR · PRUEBAS CON IWER (XR1010AJ, contrato `architecture/starseed-xr.md` §3 l).
 *
 * IWER 2.5.0 (MIT, de Meta) emula la API WebXR dentro de jsdom. Aquí se comprueba la tubería REAL
 * de entrada (sondeo → capacidades → funciones → `requestSession` → `enabledFeatures`) sin visor y
 * SIN WebGL: jsdom no trae `WebGL2RenderingContext`, así que se simula la clase vacía que IWER usa
 * para parchear `makeXRCompatible`. No se prueba nada visual: eso es `/xr/diagnostico` (XR1010AI).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XRDevice, metaQuest3 } from "iwer";
import { evaluarCapacidades, refinarFunciones, type CapacidadesXR, type DatosNavegador } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "../aplicar-perfil";
import { sondearNavegador } from "../sondeo-navegador";

const UA_QUEST3 =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";

/** Lo mínimo de la sesión emulada que se lee en estas pruebas (sin WebGL ni fotogramas). */
interface SesionEmulada {
    enabledFeatures: string[];
    end(): Promise<void>;
}
interface XRConSesion {
    requestSession(modo: string, opciones?: { optionalFeatures?: string[]; requiredFeatures?: string[] }): Promise<SesionEmulada>;
}

let device: XRDevice;
/** UA de jsdom (se captura al cargar el módulo, antes de que cualquier prueba instale IWER). */
const UA_ESCRITORIO = navigator.userAgent;

async function abrirSesion(modo: string, opciones?: { optionalFeatures?: string[]; requiredFeatures?: string[] }): Promise<SesionEmulada> {
    const xr = (navigator as Navigator & { xr?: XRConSesion }).xr;
    if (!xr) throw new Error("IWER no instaló navigator.xr");
    return xr.requestSession(modo, opciones);
}

/** Capacidades como las ve la página con el UA de Quest y un mundo VR pedido. */
function capacidadesQuest(datos: DatosNavegador): CapacidadesXR {
    return evaluarCapacidades({ ...datos, ua: UA_QUEST3 }, { contexto: "mundo-vr" });
}

beforeEach(() => {
    // jsdom no implementa WebGL2; IWER solo necesita el prototipo para colgar `makeXRCompatible`.
    vi.stubGlobal("WebGL2RenderingContext", class {});
    // jsdom no marca el documento como contexto seguro; en localhost/visores reales WebXR sí lo es.
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    device = new XRDevice(metaQuest3);
    device.installRuntime({ globalObject: globalThis, forceInstall: true });
});

afterEach(async () => {
    await device.activeSession?.end().catch(() => undefined);
    device.uninstallRuntime();
    vi.unstubAllGlobals();
});

describe("IWER · entrada emulada sin visor", () => {
    it("(1) el sondeo ve navigator.xr con VR y AR", async () => {
        const datos = await sondearNavegador();
        expect(datos.tieneXR).toBe(true);
        expect(datos.vr).toBe(true);
        expect(datos.ar).toBe(true);
    });

    it("(2) plataforma por UA: jsdom queda en escritorio y el UA de Quest da quest con VR", async () => {
        const datos = await sondearNavegador();
        expect(["desconocida", "escritorio"]).toContain(evaluarCapacidades({ ...datos, ua: UA_ESCRITORIO }).plataforma);
        const quest = capacidadesQuest(datos);
        expect(quest.plataforma).toBe("quest");
        expect(quest.recomendado).toBe("vr-inmersivo");
    });

    it("(3) requestSession concede local-floor y hand-tracking", async () => {
        const sesion = await abrirSesion("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
        expect(sesion.enabledFeatures).toContain("local-floor");
        expect(sesion.enabledFeatures).toContain("hand-tracking");
        await sesion.end();
    });

    it("(4) funcionesAPedir nunca pide camera-access y la sesión concedida no la trae", async () => {
        const caps = capacidadesQuest(await sondearNavegador());
        const pedidas = funcionesAPedir(caps);
        expect([...pedidas.requeridas, ...pedidas.opcionales]).not.toContain("camera-access");
        const sesion = await abrirSesion("immersive-vr", {
            requiredFeatures: pedidas.requeridas,
            optionalFeatures: pedidas.opcionales,
        });
        expect(sesion.enabledFeatures).not.toContain("camera-access");
        await sesion.end();
    });

    it("(5) sin gesto real IWER abre igual: es un límite conocido de la emulación", async () => {
        // En un navegador real `requestSession` exige activación transitoria (un toque de la persona).
        // IWER no la comprueba; esta prueba documenta el límite, NO que baste sin gesto en un visor.
        const sesion = await abrirSesion("immersive-vr");
        expect(sesion.enabledFeatures.length).toBeGreaterThan(0);
        await sesion.end();
    });

    it("(6) refinarFunciones sustituye lo esperado por lo concedido", async () => {
        const caps = capacidadesQuest(await sondearNavegador());
        const sesion = await abrirSesion("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
        expect(refinarFunciones(caps, sesion.enabledFeatures).funciones).toEqual(["local-floor", "hand-tracking"]);
        await sesion.end();
    });
});
