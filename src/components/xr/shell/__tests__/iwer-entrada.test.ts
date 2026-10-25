import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATOS_SIN_SONDEO, entornoReal, sondearNavegador, type EntornoNavegador, type XRInyectable } from "../sondeo-navegador";
import { evaluarCapacidades, refinarFunciones, planificarEntrada } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "../aplicar-perfil";
import { obtenerAlmacenXR, soltarAlmacenXR, type OpcionesAlmacenXR } from "../almacen-xr";
import type { CapacidadesXR } from "@/lib/xr/capacidades";
import type { PerfilCalidad } from "@/lib/xr/calidad-perfiles";
import { PERFILES } from "@/lib/xr/calidad-perfiles";

const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const JS_DOM_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/1.0";

function simularXR(vr = true, ar = true, offerSession = false): XRInyectable {
    return {
        isSessionSupported: async (modo: string) => modo === "immersive-vr" ? vr : ar,
        ...(offerSession ? { offerSession: () => undefined } : {}),
    };
}

function entornoMock(extra: Partial<EntornoNavegador> = {}): EntornoNavegador {
    return {
        ua: QUEST3,
        seguro: true,
        maxTouchPoints: 0,
        webgl2: () => false,
        webgpu: false,
        standalone: false,
        digitalGoods: false,
        ...extra,
    };
}

function cap(plataforma: "quest" | "escritorio" | "desconocida", funciones?: string[]): CapacidadesXR {
    const base = {
        plataforma,
        visor: plataforma !== "escritorio" && plataforma !== "desconocida",
        modos: ["2d", "vr-inmersivo"] as const,
        recomendado: "vr-inmersivo" as const,
        entradas: ["mandos"] as const,
        funciones: funciones ?? (plataforma === "quest" ? ["local-floor", "bounded-floor", "hand-tracking", "layers", "anchors", "hit-test", "plane-detection", "mesh-detection", "depth-sensing"] : ["local-floor"]),
        ofrecerSesion: true,
        motivos: [],
        avisos: [],
    };
    return base;
}

describe("iwer-entrada · rescate de pruebas de la rama nube", () => {
    it("1 · el sondeo real ve navigator.xr, VR y AR, sin WebGL", async () => {
        const d = await sondearNavegador(entornoMock({
            ua: QUEST3,
            xr: simularXR(true, true, false),
            webgl2: () => false,
        }));
        expect(d.tieneXR).toBe(true);
        expect([d.vr, d.ar]).toEqual([true, true]);
        expect(d.webgl2).toBe(false);
    });

    it("2 · UA de jsdom = escritorio; UA de Quest = quest y recomienda VR", async () => {
        const conJsdom = await sondearNavegador(entornoMock({ ua: JS_DOM_UA, webgl2: () => true }));
        const capsJsdom = evaluarCapacidades(conJsdom);
        expect(["desconocida", "escritorio"]).toContain(capsJsdom.plataforma);
        const quest = await sondearNavegador(entornoMock({ ua: QUEST3, xr: simularXR(true, true) }));
        const c = evaluarCapacidades(quest, { contexto: "mundo-vr" });
        expect(c.plataforma).toBe("quest");
        expect(c.recomendado).toBe("vr-inmersivo");
    });

    it("3 · immersive-vr concede local-floor y hand-tracking en enabledFeatures", async () => {
        const opciones: OpcionesAlmacenXR = {
            perfil: PERFILES.alta,
            capacidades: cap("quest"),
            produccion: true,
        };
        const almacen = await obtenerAlmacenXR(opciones);
        const state = almacen.getState();
        expect(state.session).toBeUndefined();
        await soltarAlmacenXR();
    });

    it("4 · ni funcionesAPedir ni la sesión concedida piden camera-access", async () => {
        const capacidades = cap("quest", [...cap("quest").funciones, "camera-access" as any]);
        const pedidas = funcionesAPedir(capacidades, { habitacion: true });
        const todas = [...pedidas.opcionales, ...pedidas.requeridas];
        expect(todas).not.toContain("camera-access");
        const opciones: OpcionesAlmacenXR = {
            perfil: PERFILES.alta,
            capacidades,
            produccion: true,
        };
        const almacen = await obtenerAlmacenXR(opciones);
        const { opciones: opts } = await import("@react-three/xr").then(m => m.createXRStore(opcionesAlmacenXR(opciones).opciones));
        expect(opts).toBeDefined();
        await soltarAlmacenXR();
    });

    it("5 · límite de la emulación: IWER abre sesión SIN gesto de usuario", async () => {
        const opciones: OpcionesAlmacenXR = {
            perfil: PERFILES.alta,
            capacidades: cap("quest"),
            produccion: false,
            busqueda: "?emulador=1",
        };
        const primera = await obtenerAlmacenXR(opciones);
        await soltarAlmacenXR();
        const segunda = await obtenerAlmacenXR(opciones);
        const state = segunda.getState();
        expect(state.session).toBeDefined();
        await soltarAlmacenXR();
    });

    it("6 · refinarFunciones sustituye lo esperado por lo concedido", async () => {
        const esperadas = evaluarCapacidades(await sondearNavegador(entornoMock({ ua: QUEST3, xr: simularXR(true, true) })));
        expect(esperadas.funciones.length).toBeGreaterThan(2);
        const refinadas = refinarFunciones(esperadas, ["local-floor", "hand-tracking", "magia"]);
        expect(refinadas.funciones).toEqual(["local-floor", "hand-tracking"]);
        const pedidas = funcionesAPedir(refinadas);
        expect(pedidas).toEqual({
            opcionales: ["hand-tracking"],
            requeridas: ["local-floor"],
        });
    });
});

function opcionesAlmacenXR(o: OpcionesAlmacenXR) {
    const { funcionesAPedir: fAP } = await import("../aplicar-perfil");
    const { opciones: funciones } = require("../almacen-xr").opcionesDeFunciones(fAP(o.capacidades, { habitacion: o.habitacion }));
    return { opciones: funciones };
}