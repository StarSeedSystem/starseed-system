// @vitest-environment jsdom
/**
 * XR1010AJ · IWER (Meta, MIT 2.5.0) emula WebXR y entra por la puerta REAL de StarSeed XR
 * (contrato `architecture/starseed-xr.md` §3 l). Sin WebGL, sin hardware y sin red: el runtime
 * se instala en `window` y se le pregunta lo mismo que se le pregunta a un visor.
 *
 * LÍMITE HONESTO: IWER no comprueba el gesto de usuario, así que abre sesión sin pulsación;
 * los gestos, el rendimiento y lo que se ve sólo se comprueban en un visor real (`/xr/diagnostico`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { XRDevice, metaQuest3 } from "iwer";
import { evaluarCapacidades, refinarFunciones } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "../aplicar-perfil";
import { entornoReal, sondearNavegador } from "../sondeo-navegador";

interface SesionIWER {
    enabledFeatures: readonly string[];
    end(): Promise<void>;
}
interface XRIWER {
    isSessionSupported(modo: string): Promise<boolean>;
    requestSession(
        modo: string,
        opciones?: { optionalFeatures?: string[]; requiredFeatures?: string[] },
    ): Promise<SesionIWER>;
}
const xrIWER = (): XRIWER => (navigator as Navigator & { xr: XRIWER }).xr;
const sonda = () => sondearNavegador({ ...entornoReal(), seguro: true });

let dispositivo: XRDevice;
let uaJsdom = "";

beforeAll(() => {
    uaJsdom = navigator.userAgent;
    // jsdom no trae esta clase y IWER la toca al instalar; se simula aquí, no en producción.
    const g = globalThis as unknown as Record<string, unknown>;
    g.WebGL2RenderingContext ??= class {};
    dispositivo = new XRDevice(metaQuest3);
    dispositivo.installRuntime();
});
afterAll(() => dispositivo?.uninstallRuntime());

async function abrir(opcionales: string[] = ["local-floor", "hand-tracking"]): Promise<SesionIWER> {
    return xrIWER().requestSession("immersive-vr", { optionalFeatures: opcionales });
}

describe("IWER · entrada emulada a VR/AR", () => {
    it("1 · el sondeo real ve navigator.xr, VR y AR, sin WebGL", async () => {
        const d = await sondearNavegador();
        expect(d.tieneXR).toBe(true);
        expect([d.vr, d.ar]).toEqual([true, true]);
        expect(d.webgl2).toBe(false);
    });

    it("2 · UA de jsdom = escritorio; UA de Quest (que pone IWER) = quest y recomienda VR", async () => {
        const conJsdom = await sondearNavegador({ ...entornoReal(), ua: uaJsdom, seguro: true });
        expect(["desconocida", "escritorio"]).toContain(evaluarCapacidades(conJsdom).plataforma);
        const quest = await sonda();
        expect(quest.ua).toContain("Quest 3");
        const c = evaluarCapacidades(quest, { contexto: "mundo-vr" });
        expect(c.plataforma).toBe("quest");
        expect(c.recomendado).toBe("vr-inmersivo");
    });

    it("3 · immersive-vr concede local-floor y hand-tracking en enabledFeatures", async () => {
        const s = await abrir();
        expect(s.enabledFeatures).toContain("local-floor");
        expect(s.enabledFeatures).toContain("hand-tracking");
        await s.end();
    });

    it("4 · ni funcionesAPedir ni la sesión concedida piden camera-access (§3 k)", async () => {
        const pedidas = funcionesAPedir(evaluarCapacidades(await sonda()), { habitacion: true });
        const todas = [...pedidas.opcionales, ...pedidas.requeridas];
        expect(todas).not.toContain("camera-access");
        const s = await abrir(todas);
        expect(s.enabledFeatures).not.toContain("camera-access");
        await s.end();
    });

    it("5 · límite de la emulación: IWER abre sesión SIN gesto de usuario", async () => {
        const primera = await abrir();
        await primera.end();
        const sinGesto = await abrir();
        expect(sinGesto.enabledFeatures).toContain("local-floor");
        await sinGesto.end();
    });

    it("6 · refinarFunciones sustituye lo esperado por lo concedido", async () => {
        const esperadas = evaluarCapacidades(await sonda());
        expect(esperadas.funciones.length).toBeGreaterThan(2);
        const refinadas = refinarFunciones(esperadas, ["local-floor", "hand-tracking", "magia"]);
        expect(refinadas.funciones).toEqual(["local-floor", "hand-tracking"]);
        expect(funcionesAPedir(refinadas)).toEqual({
            opcionales: ["hand-tracking"],
            requeridas: ["local-floor"],
        });
    });
});
