import { describe, expect, it } from "vitest";
import type { PlanEntrada } from "@/lib/xr/capacidades";
import type { ModoSesion } from "../page";

import { debeAutoEntrar } from "../page";

const PLAN_AUTO_ABRIR: PlanEntrada = {
    estrategia: "auto-al-abrir",
    modo: "vr-inmersivo",
    requiereGesto: false,
    botonUniversal: true,
    motivo: "PWA instalada en Quest: tocar el icono ya es el gesto, se entra directo.",
};
const PLAN_BOTON_UNIVERSAL: PlanEntrada = {
    estrategia: "boton-universal",
    modo: "vr-inmersivo",
    requiereGesto: true,
    botonUniversal: true,
    motivo: "Hace falta tocar el botón: el navegador no abre VR/AR sin un gesto.",
};
const PLAN_SOLO_PANTALLA: PlanEntrada = {
    estrategia: "solo-pantalla",
    modo: "3d-pantalla",
    requiereGesto: false,
    botonUniversal: false,
    motivo: "Este aparato no tiene VR ni AR.",
};

describe("debeAutoEntrar · lógica pura de entrada automática", () => {
    it("URL con modo + Quest instalada (auto-al-abrir) → devuelve el modo", () => {
        const res = debeAutoEntrar({ modo: "vr-inmersivo", plan: PLAN_AUTO_ABRIR, yaIntentado: false });
        expect(res).toBe("vr-inmersivo");
    });

    it("URL con modo + oferta-navegador → devuelve el modo", () => {
        const planOferta: PlanEntrada = { ...PLAN_AUTO_ABRIR, estrategia: "oferta-navegador", modo: "ar-passthrough" };
        const res = debeAutoEntrar({ modo: "ar-passthrough", plan: planOferta, yaIntentado: false });
        expect(res).toBe("ar-passthrough");
    });

    it("sin modo en la URL → null", () => {
        const res = debeAutoEntrar({ modo: null, plan: PLAN_AUTO_ABRIR, yaIntentado: false });
        expect(res).toBeNull();
    });

    it("ya intentado antes → null (no insiste)", () => {
        const res = debeAutoEntrar({ modo: "vr-inmersivo", plan: PLAN_AUTO_ABRIR, yaIntentado: true });
        expect(res).toBeNull();
    });

    it("iPhone (plan solo-pantalla) → null aunque haya modo en URL", () => {
        const res = debeAutoEntrar({ modo: "vr-inmersivo", plan: PLAN_SOLO_PANTALLA, yaIntentado: false });
        expect(res).toBeNull();
    });

    it("boton-universal (requiere gesto) → null (no entra solo)", () => {
        const res = debeAutoEntrar({ modo: "vr-inmersivo", plan: PLAN_BOTON_UNIVERSAL, yaIntentado: false });
        expect(res).toBeNull();
    });

    it("modo 3d-pantalla en URL con plan auto-al-abrir → null (no es inmersivo)", () => {
        const res = debeAutoEntrar({ modo: "3d-pantalla", plan: PLAN_AUTO_ABRIR, yaIntentado: false });
        expect(res).toBeNull();
    });

    it("modo ar no coincide con plan vr → null", () => {
        const res = debeAutoEntrar({ modo: "ar-passthrough", plan: PLAN_AUTO_ABRIR, yaIntentado: false });
        expect(res).toBeNull();
    });
});

describe("Page exports", () => {
    it("exports debeAutoEntrar and dynamic", async () => {
        const mod = await import("../page");
        expect(typeof mod.debeAutoEntrar).toBe("function");
        expect(mod.dynamic).toBe("force-dynamic");
        expect(typeof mod.default).toBe("function");
    });
});
