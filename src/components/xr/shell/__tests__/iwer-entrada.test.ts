import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapasXR } from "../capas-xr";
import { DATOS_SIN_SONDEO, entornoReal, sondearNavegador } from "../sondeo-navegador";
import type { EntornoNavegador, XRInyectable } from "../sondeo-navegador";
import { evaluarCapacidades } from "@/lib/xr/capacidades";
import type { CapacidadesXR } from "@/lib/xr/capacidades";
import type { FuncionXR } from "@/lib/xr/tipos";

const uaJsdom = "Mozilla/5.0 (jsdom)";
/** Simula un navegador sin DOM para aislar el sondeo del entorno real. */
function simular(entorno: Partial<EntornoNavegador>): void {
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { userAgent: entorno.ua ?? uaJsdom, maxTouchPoints: 0 });
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("WebGL2RenderingContext", undefined);
}

beforeEach(() => { simular({ ua: uaJsdom, seguro: true }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("iwer-entrada (XR1010A)", () => {
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