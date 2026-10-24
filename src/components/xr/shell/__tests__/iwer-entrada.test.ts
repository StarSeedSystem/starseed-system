// @vitest-environment jsdom
/**
 * StarSeed XR · ENTRADA EMULADA CON IWER (XR1010AJ, contrato `architecture/starseed-xr.md` §3 l).
 *
 * Instala `XRDevice(metaQuest3)` en jsdom y comprueba SIN WebGL la cadena real: sondeo (XR1010B),
 * capacidades del núcleo, `requestSession` y `enabledFeatures`, la lista blanca de `funcionesAPedir`
 * (XR1010D, sin `camera-access`) y `refinarFunciones`. LÍMITE HONESTO: IWER no exige gesto ni
 * reproduce mandos/manos/rendimiento; eso solo se comprueba con un visor real en `/xr/diagnostico`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { XRDevice, metaQuest3 } from "iwer";
import { evaluarCapacidades, refinarFunciones } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "../aplicar-perfil";
import { sondearNavegador } from "../sondeo-navegador";

type SesionEmulada = { enabledFeatures: readonly string[]; end(): Promise<void> };
type OpcionesSesion = { requiredFeatures?: string[]; optionalFeatures?: string[] };
type XREmulado = { requestSession(modo: string, opciones?: OpcionesSesion): Promise<SesionEmulada> };

const globo = globalThis as unknown as Record<string, unknown>;
const uaDeJsdom = navigator.userAgent;
let dispositivo: XRDevice;

/** jsdom no trae WebGL2 (IWER escribe en su prototipo al instalar), `isSecureContext` ni RAF: se simulan aquí. */
beforeAll(() => {
    const sinWebgl2 = !globo.WebGL2RenderingContext;
    if (sinWebgl2) globo.WebGL2RenderingContext = class WebGL2RenderingContextStub {};
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    if (!globo.requestAnimationFrame) globo.requestAnimationFrame = () => 0;
    if (!globo.cancelAnimationFrame) globo.cancelAnimationFrame = () => undefined;
    dispositivo = new XRDevice(metaQuest3);
    dispositivo.installRuntime();
    // IWER solo toca WebGL2 al instalar: se retira para que el sondeo vea «sin WebGL» sin ruido de jsdom.
    if (sinWebgl2) Reflect.deleteProperty(globo, "WebGL2RenderingContext");
});

afterAll(() => { dispositivo?.uninstallRuntime(); });

function pedirSesion(opciones: OpcionesSesion): Promise<SesionEmulada> {
    return (navigator.xr as unknown as XREmulado).requestSession("immersive-vr", opciones);
}
function pedirSegunFunciones(c: Parameters<typeof funcionesAPedir>[0]): Promise<SesionEmulada> {
    const { opcionales, requeridas } = funcionesAPedir(c);
    return pedirSesion({ optionalFeatures: opcionales, requiredFeatures: requeridas });
}
async function cerrar(sesion: SesionEmulada): Promise<void> {
    try { await sesion.end(); } catch { /* la sesión de prueba ya no hace falta */ }
}
async function capacidadesQuest() {
    return evaluarCapacidades(await sondearNavegador(), { contexto: "mundo-vr" });
}

describe("IWER · runtime emulado en jsdom", () => {
    it("(1) sondearNavegador ve navigator.xr con VR y AR", async () => {
        const datos = await sondearNavegador();
        expect(navigator.xr).toBeDefined();
        expect(datos).toMatchObject({ tieneXR: true, vr: true, ar: true });
        expect(datos.ua).toContain("Quest 3");
    });
    it("(2) con el UA de jsdom es escritorio/desconocida; con el de Quest, quest y VR recomendado", async () => {
        const escritorio = evaluarCapacidades({ ...(await sondearNavegador()), ua: uaDeJsdom });
        expect(["desconocida", "escritorio"]).toContain(escritorio.plataforma);
        const quest = await capacidadesQuest();
        expect(quest.plataforma).toBe("quest");
        expect(quest.recomendado).toBe("vr-inmersivo");
    });
    it("(3) requestSession devuelve una sesión con local-floor en enabledFeatures", async () => {
        const sesion = await pedirSesion({ optionalFeatures: ["local-floor", "hand-tracking"] });
        try {
            expect(sesion.enabledFeatures).toContain("local-floor");
            expect(sesion.enabledFeatures).toContain("hand-tracking");
        } finally { await cerrar(sesion); }
    });
    it("(4) funcionesAPedir no pide camera-access y la sesión concedida tampoco la tiene", async () => {
        const c = await capacidadesQuest();
        const pedidas = funcionesAPedir(c);
        expect([...pedidas.opcionales, ...pedidas.requeridas]).not.toContain("camera-access");
        const sesion = await pedirSegunFunciones(c);
        try {
            expect(sesion.enabledFeatures).not.toContain("camera-access");
            expect(sesion.enabledFeatures).toContain("local-floor");
        } finally { await cerrar(sesion); }
    });
    it("(5) LÍMITE: sin gesto real IWER abre igual; un navegador de verdad lo rechazaría", async () => {
        expect(navigator.userActivation?.isActive ?? false).toBe(false);
        const sesion = await pedirSesion({ optionalFeatures: ["local-floor"] });
        expect(sesion).toBeDefined();
        await cerrar(sesion);
    });
    it("(6) refinarFunciones cambia lo esperado por lo concedido", async () => {
        const c = await capacidadesQuest();
        const sesion = await pedirSegunFunciones(c);
        try {
            const refinadas = refinarFunciones(c, sesion.enabledFeatures);
            expect(refinadas.funciones).not.toEqual(c.funciones);
            expect(refinadas.funciones).toContain("local-floor");
            expect(refinadas.funciones).toEqual(
                [...sesion.enabledFeatures].filter((f) => c.funciones.includes(f as (typeof c.funciones)[number])),
            );
            expect(refinadas.plataforma).toBe(c.plataforma);
        } finally { await cerrar(sesion); }
    });
});
