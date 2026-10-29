import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { COLORES_NODO, CRISTAL, paramsMaterial } from "@/lib/xr/tokens-3d";
import type { MaterialCristal } from "@/lib/xr/calidad-perfiles";
import { aArgsMaterial, crearClaseMaterial, crearMaterial, tamanoTextoMinimo } from "../material-cristal";

const h = vi.hoisted(() => ({
    panel: null as Record<string, unknown> | null,
    texto: null as Record<string, unknown> | null,
}));

vi.mock("three", () => {
    class Falso {
        args: Record<string, unknown> | undefined;
        constructor(a?: Record<string, unknown>) {
            this.args = a;
        }
    }
    return {
        MeshBasicMaterial: class extends Falso {},
        MeshStandardMaterial: class extends Falso {},
        MeshPhysicalMaterial: class extends Falso {},
    };
});

vi.mock("@react-three/uikit", () => ({
    Container: (p: Record<string, unknown>) => {
        h.panel = p;
        return null;
    },
    Text: (p: Record<string, unknown>) => {
        h.texto = p;
        return null;
    },
}));

import { NivelCalidadContext, PanelCristal, Texto3D } from "../panel-cristal";

class FalsoBase {
    args: Record<string, unknown> | undefined;
    constructor(a?: Record<string, unknown>) {
        this.args = a;
    }
}

const THREE_FALSO = {
    MeshBasicMaterial: class extends FalsoBase {},
    MeshStandardMaterial: class extends FalsoBase {},
    MeshPhysicalMaterial: class extends FalsoBase {},
};

const MATERIALES: MaterialCristal[] = ["plano", "translucido", "vidrio-entorno", "transmision-media", "transmision-completa"];

describe("aArgsMaterial · nombres reales de three", () => {
    for (const material of MATERIALES) {
        it(`${material} conserva clase, color, opacidad y transparencia`, () => {
            const p = paramsMaterial(material, "zenith");
            const { clase, args } = aArgsMaterial(p);
            expect(clase).toBe(p.clase);
            expect(args.color).toBe(CRISTAL.fondoA.color);
            expect(args.opacity).toBe(p.opacidad);
            expect(args.transparent).toBe(p.transparente);
        });
    }

    it("vidrio-entorno usa roughness, metalness y envMapIntensity", () => {
        const { args } = aArgsMaterial(paramsMaterial("vidrio-entorno", "horizon"));
        expect(args.roughness).toBe(0.18);
        expect(args.metalness).toBe(0);
        expect(args.envMapIntensity).toBe(1);
    });

    it("transmision-media usa transmission, thickness e ior", () => {
        const { args } = aArgsMaterial(paramsMaterial("transmision-media", "logic"));
        expect(args.transmission).toBe(0.9);
        expect(args.thickness).toBe(0.12);
        expect(args.ior).toBe(1.35);
    });

    it("transmision-completa añade dispersion y grosor mayor", () => {
        const { args } = aArgsMaterial(paramsMaterial("transmision-completa", "anchor"));
        expect(args.transmission).toBe(1);
        expect(args.thickness).toBe(0.3);
        expect(args.dispersion).toBe(0.2);
    });
});

describe("paramsMaterial · preferencias y pisos", () => {
    it("reducirTransparencia fuerza MeshBasicMaterial", () => {
        const p = paramsMaterial("transmision-completa", "zenith", { reducirTransparencia: true });
        expect(aArgsMaterial(p).clase).toBe("MeshBasicMaterial");
    });

    it("contraste alto deja la opacidad en ≥ 0,92", () => {
        for (const material of MATERIALES) expect(paramsMaterial(material, "zenith", { contrasteAlto: true }).opacidad).toBeGreaterThanOrEqual(0.92);
    });

    it("con opacidadMinima 0,82 ningún nivel baja de ella", () => {
        for (const material of MATERIALES) expect(paramsMaterial(material, "horizon", { opacidadMinima: 0.82 }).opacidad).toBeGreaterThanOrEqual(0.82);
    });
});

describe("crearMaterial y crearClaseMaterial con three inyectado", () => {
    it("crearMaterial instancia la clase física con los args", () => {
        const p = paramsMaterial("transmision-completa", "anchor");
        const m = crearMaterial(THREE_FALSO, p) as { args?: Record<string, unknown> };
        expect(m).toBeInstanceOf(THREE_FALSO.MeshPhysicalMaterial);
        expect(m.args?.transmission).toBe(1);
    });

    it("crearMaterial instancia MeshBasicMaterial en el nivel plano", () => {
        const m = crearMaterial(THREE_FALSO, paramsMaterial("plano", "zenith")) as { args?: Record<string, unknown> };
        expect(m).toBeInstanceOf(THREE_FALSO.MeshBasicMaterial);
        expect(m.args?.color).toBe(CRISTAL.fondoA.color);
    });

    it("crearClaseMaterial devuelve una clase derivada que recibe los args", () => {
        const Clase = crearClaseMaterial(THREE_FALSO, paramsMaterial("vidrio-entorno", "logic"));
        const m = new Clase() as { args?: Record<string, unknown> };
        expect(m).toBeInstanceOf(THREE_FALSO.MeshStandardMaterial);
        expect(m.args?.roughness).toBe(0.18);
    });
});

describe("tamanoTextoMinimo · arco mínimo", () => {
    it("a 1,8 m y 1° mide ≈ 0,031 m", () => {
        expect(tamanoTextoMinimo(1.8)).toBeCloseTo(0.0314, 3);
    });

    it("sin grados usa TEXTO_MIN_DEG (1°)", () => {
        expect(tamanoTextoMinimo(1.8)).toBe(tamanoTextoMinimo(1.8, 1));
    });
});

describe("PanelCristal y Texto3D con uikit simulado", () => {
    beforeEach(() => {
        h.panel = null;
        h.texto = null;
    });

    it("pasa material, tamaño, curvatura y el acento vivo del nodo a Container", () => {
        renderToStaticMarkup(createElement(PanelCristal, { nodo: "horizon", ancho: 1.2, alto: 0.7, curvatura: 0.1 }));
        expect(h.panel?.width).toBe(1.2);
        expect(h.panel?.height).toBe(0.7);
        expect(h.panel?.borderBend).toBe(0.1);
        expect(h.panel?.backgroundColor).toBe(CRISTAL.fondoA.color);
        expect(h.panel?.borderColor).toBe(COLORES_NODO.horizon.vivo);
        expect(typeof h.panel?.panelMaterialClass).toBe("function");
    });

    it("toma el nivel del contexto (máxima) si no recibe prop", () => {
        renderToStaticMarkup(
            createElement(NivelCalidadContext.Provider, { value: "maxima" }, createElement(PanelCristal, { nodo: "zenith", ancho: 1, alto: 1 })),
        );
        const Clase = h.panel?.panelMaterialClass as new () => { args?: Record<string, unknown> };
        expect(new Clase().args?.transmission).toBe(1);
    });

    it("Texto3D impone el fontSize mínimo por arco", () => {
        renderToStaticMarkup(createElement(Texto3D, { distancia: 1.8 }, "Astraura"));
        expect(h.texto?.fontSize).toBeCloseTo(0.0314, 3);
        expect(h.texto?.color).toBe(CRISTAL.texto);
    });
});
