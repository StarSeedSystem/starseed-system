// @vitest-environment jsdom
/**
 * StarSeed XR · ENTRADA EMULADA CON IWER (XR1010AJ). Contrato: `architecture/starseed-xr.md` §3 (l) 2.
 * IWER 2.5.0 (MIT, Meta) emula la WebXR Device API: `XRDevice(metaQuest3)` instalado sobre `window`, probando
 * sondeo, capacidades, `requestSession`, `enabledFeatures` y `refinarFunciones` SIN visor y SIN WebGL.
 * Límite honesto de la emulación: IWER abre sesión sin gesto del mundo real; gestos, rendimiento y lo que se
 * ve solo se comprueban en `/xr/diagnostico` con el visor puesto (XR1010AI).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { metaQuest3, XRDevice, type XRSystem } from "iwer";
import { evaluarCapacidades, plataformaDeDatos, refinarFunciones, type DatosNavegador } from "@/lib/xr/capacidades";
import { esFuncionXR } from "@/lib/xr/tipos";
import { DATOS_SIN_SONDEO, sondearNavegador } from "../sondeo-navegador";
import { funcionesAPedir } from "../aplicar-perfil";

const xrDe = () => (navigator as unknown as { xr?: XRSystem }).xr;
type TipoXR = NonNullable<ReturnType<typeof xrDe>>;
type SesionXR = Awaited<ReturnType<TipoXR["requestSession"]>>;

/** Petición en la forma de iwer; `FuncionXR` admite nombres (`layers`) que el tipo de iwer no lista. */
const pedir = (o: { requeridas?: readonly string[]; opcionales?: readonly string[] }): never =>
    ({ requiredFeatures: o.requeridas, optionalFeatures: o.opcionales }) as never;

const UA_JSDOM = navigator.userAgent;

/** Trozo de una sesión ya utilizada: `end()` el desbloquea y un tick deja al `activeSession` limpio. */
async function cerrar(s: SesionXR): Promise<void> {
    await s.end();
    await new Promise((r) => setTimeout(r, 0));
}

describe("evaluarCapacidades por UA (núcleo puro, sin IWER)", () => {
    it("el UA de jsdom no es de visor: plataforma escritorio y 3D en pantalla", () => {
        const d: DatosNavegador = { ...DATOS_SIN_SONDEO, ua: UA_JSDOM, vr: false, ar: false, seguro: true, webgl2: true };
        const c = evaluarCapacidades(d);
        expect(["desconocida", "escritorio"]).toContain(c.plataforma);
        expect(c.recomendado).toBe("3d-pantalla");
    });

    it("con el UA de Quest inyectado: plataforma quest y modo recomendado vr-inmersivo", () => {
        const d: DatosNavegador = {
            ...DATOS_SIN_SONDEO, ua: metaQuest3.userAgent, tieneXR: true, vr: true, ar: false, seguro: true, webgl2: true,
        };
        const c = evaluarCapacidades(d);
        expect(c.plataforma).toBe("quest");
        expect(plataformaDeDatos(d)).toBe("quest");
        expect(c.recomendado).toBe("vr-inmersivo");
    });
});

describe("con IWER instalado en window", () => {
    /* jsdom no trae WebGL: `installRuntime` de IWER toca `WebGL2RenderingContext.prototype`. Se simula aquí, no en producción. */
    class LienzoFalso {}
    (globalThis as Record<string, unknown>).WebGLRenderingContext = LienzoFalso;
    (globalThis as Record<string, unknown>).WebGL2RenderingContext = class extends LienzoFalso {};

    let xr: TipoXR;
    beforeAll(() => {
        new XRDevice(metaQuest3).installRuntime({ globalObject: window });
        xr = xrDe()!;
    });

    it("sondearNavegador ve navigator.xr con vr: true y ar: true", async () => {
        const d = await sondearNavegador();
        expect(d.tieneXR).toBe(true);
        expect(d.vr).toBe(true);
        expect(d.ar).toBe(true);
    });

    it("el UA que IWER inyecta (Quest 3) se etiqueta quest y da VR inmersivo para un mundo VR", async () => {
        const d = await sondearNavegador();
        expect(d.ua).toContain("OculusBrowser"); // el propio UA del aparato emulado, no el de jsdom
        // jsdom no es contexto seguro (`seguro: false`) y el núcleo lo respeta; aquí se etiqueta lo que ve un visor de verdad: https, siempre en Quest.
        const c = evaluarCapacidades({ ...d, seguro: true }, { contexto: "mundo-vr" });
        expect(c.plataforma).toBe("quest");
        expect(c.recomendado).toBe("vr-inmersivo");
    });

    it("requestSession('immersive-vr') con local-floor y hand-tracking devuelve enabledFeatures con local-floor", async () => {
        const s: SesionXR = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
        expect(s.enabledFeatures).toContain("local-floor");
        expect(s.enabledFeatures).toContain("hand-tracking");
        await cerrar(s);
    });

    it("funcionesAPedir no pide camera-access y la sesión concedida no la tiene", async () => {
        const d = await sondearNavegador();
        const f = funcionesAPedir(evaluarCapacidades(d));
        expect(f.opcionales).not.toContain("camera-access");
        expect(f.requeridas).not.toContain("camera-access");
        const s = await xr.requestSession("immersive-vr", pedir(f));
        expect(s.enabledFeatures).not.toContain("camera-access");
        await cerrar(s);
        // Y aunque se la pidiera a mano, el aparato emulado no la soporta: nunca se concede.
        const s2 = await xr.requestSession("immersive-vr", { optionalFeatures: ["camera-access"] } as never);
        expect(s2.enabledFeatures).not.toContain("camera-access");
        await cerrar(s2);
    });

    it("LÍMITE de la emulación: IWER concede requestSession sin gesto del mundo real", async () => {
        // En un navegador real, sin gesto, lanzaría NotAllowedError; IWER no lo exige: por eso esta pieza
        // se vuelve a comprobar en /xr/diagnostico con el visor puesto (XR1010AI).
        const s: SesionXR = await xr.requestSession("immersive-vr");
        expect(s.enabledFeatures.length).toBeGreaterThan(0);
        await cerrar(s);
    });

    it("refinarFunciones sustituye lo esperado por lo concedido", async () => {
        const c = evaluarCapacidades({ ...(await sondearNavegador()), seguro: true });
        expect(c.funciones).toContain("layers"); // esperada para Quest…
        const s = await xr.requestSession("immersive-vr", pedir(funcionesAPedir(c)));
        const refinado = refinarFunciones(c, s.enabledFeatures);
        expect(refinado.funciones).toEqual(s.enabledFeatures.filter(esFuncionXR));
        expect(refinado.funciones).not.toContain("layers"); // …pero IWER no la concede, y manda lo concedido
        expect(refinado.funciones).toContain("local-floor");
        await cerrar(s);
    });
});
