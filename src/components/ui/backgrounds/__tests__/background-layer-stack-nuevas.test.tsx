/**
 * Ola 1018F · FSH1018G: la pila pinta las capas `shader` y `difusion` en su
 * orden, opacidad, mezcla, visibilidad, transform y máscara. CapaShader va
 * SIMULADA: se prueba el apilado, no el motor WebGPU (sin red, sin GPU).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { BackgroundLayerStack, estiloDifusionCapa, estiloMascara, estiloTransform } from "@/components/ui/backgrounds/background-layer-stack";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";

// El estado que el Contexto de apariencia «esconde»: cada prueba lo rellena.
const pupitre = vi.hoisted(() => ({ capas: [] as BackgroundLayer[], updateConfig: vi.fn() }));

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { background: { layers: pupitre.capas } }, updateConfig: pupitre.updateConfig }),
}));

vi.mock("@/components/backgrounds/capa-shader", () => ({
    CapaShader: ({ capa }: { capa: BackgroundLayer }) => (
        <div data-testid={`capa-shader-${capa.id}`} data-opacidad={String(capa.opacity)} data-modo={String(capa.blend)}
            data-componentes={String(capa.preset?.components?.length ?? 0)} />
    ),
}));

afterEach(() => {
    cleanup();
    pupitre.capas = [];
});

/** Una capa mínima y válida con su identidad. */
function capa(extra: Partial<BackgroundLayer> & Pick<BackgroundLayer, "kind" | "id">): BackgroundLayer {
    return { visible: true, opacity: 1, blend: "normal", ...extra } as BackgroundLayer;
}
/** Pinta la pila y devuelve sus envolturas en el orden de la configuración. */
function montar(pila: BackgroundLayer[]) {
    pupitre.capas = pila;
    const { container } = render(<BackgroundLayerStack />);
    return Array.from(container.querySelectorAll<HTMLElement>("[data-kind]"));
}
/** Cuerpo de una capa `difusion` ya montada. */
const difusionDe = (envoltura?: Element | null) => envoltura?.querySelector<HTMLElement>(".inset-0");

describe("helpers puros", () => {
    const difC = (modo: string, opacidad = 1, tono?: string, textura = "ninguna", desenfoquePx = 0) =>
        estiloDifusionCapa({ modo, opacidad, tono, textura, desenfoquePx } as never);

    it("estiloTransform describe posición, escala, rotación y tamaño relativos", () => {
        expect(estiloTransform(undefined)).toEqual({});
        expect(estiloTransform({ x: 0.1, y: 0.2, escala: 1.5, rotacion: 30, ancho: 1, alto: 1 })).toEqual({ transform: "translate(10%, 20%) scale(1.5) rotate(30deg)" });
        expect(estiloTransform({ x: 0, y: 0, escala: 1, rotacion: 0, ancho: 0.8, alto: 0.6 })).toEqual({ transform: "translate(0%, 0%) scale(1) rotate(0deg)", width: "80%", height: "60%" });
    });
    it("estiloMascara da su gradiente (con prefijo Web) o nada", () => {
        expect(estiloMascara(undefined)).toEqual({});
        expect(estiloMascara("ninguna")).toEqual({});
        expect(estiloMascara("radial").maskImage).toBe("radial-gradient(circle, black 40%, transparent 100%)");
        expect(estiloMascara("lineal").WebkitMaskImage).toBe("linear-gradient(to bottom, black 60%, transparent 100%)");
    });
    it("estiloDifusionCapa: tono con su opacidad; desenfoque difumina lo de abajo", () => {
        expect(estiloDifusionCapa(undefined)).toEqual({});
        expect(difC("transparente")).toEqual({});
        expect(difC("desenfoque", 1, undefined, "ninguna", 12)).toEqual({ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" });
        expect(difC("blanco", 0.5).background).toBe("rgba(255, 255, 255, 0.5)");
        expect(difC("negro", 0.3).background).toBe("rgba(0, 0, 0, 0.3)");
        expect(difC("tono", 1, "#7c3aed").background).toBe("#7c3aed");
        expect(String(difC("transparente", 1, undefined, "grano").backgroundImage)).toMatch(/^url\("data:image\/svg\+xml;utf8,/);
        expect(String(difC("transparente", 1, undefined, "escarcha").backgroundImage)).toContain("turbulence");
        expect(difC("transparente", 1, undefined, "papel").backgroundImage).toBeTruthy();
    });
});

describe("la pila pinta las capas nuevas", () => {
    it("respeta el ORDEN configurado y el z-index va subiendo por capa", async () => {
        const envolturas = montar([
            capa({ kind: "color", id: "c1", value: "#0a0118" }),
            capa({ kind: "shader", id: "s1", preset: { components: [{ type: "PerlinNoise", id: "p" }] } }),
            capa({ kind: "difusion", id: "d1", difusion: { modo: "desenfoque", desenfoquePx: 8, opacidad: 1, textura: "ninguna" } }),
        ]);
        expect(envolturas.map((e) => e.getAttribute("data-kind"))).toEqual(["color", "shader", "difusion"]);
        expect(envolturas.map((e) => e.style.zIndex)).toEqual(["-9", "-8", "-7"]);
        // El cuerpo shader lo pinta CapaShader (simulada), con SU preset.
        expect(await screen.findByTestId("capa-shader-s1")).toHaveAttribute("data-componentes", "1");
        // (jsdom guarda backdrop-filter como propiedad pero no en el atributo.)
        expect(difusionDe(envolturas[2])?.style.backdropFilter).toBe("blur(8px)");
    });

    it("la opacidad y la mezcla van en la envoltura; CapaShader NO las aplica otra vez", async () => {
        montar([capa({ kind: "shader", id: "s2", opacity: 0.42, blend: "screen", preset: { components: [] } })]);
        const envoltura = document.querySelector<HTMLElement>("[data-kind='shader']");
        expect(envoltura?.style.opacity).toBe("0.42");
        expect(envoltura?.style.mixBlendMode).toBe("screen");
        expect(await screen.findByTestId("capa-shader-s2")).toHaveAttribute("data-opacidad", "1");
        expect(screen.getByTestId("capa-shader-s2")).toHaveAttribute("data-modo", "normal");
    });

    it("transform y máscara se aplican a la envoltura de la capa", () => {
        montar([capa({
            kind: "difusion", id: "d2",
            difusion: { modo: "blanco", desenfoquePx: 0, opacidad: 0.4, textura: "ninguna" },
            transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 0.8, alto: 0.6 },
            mascara: "radial",
        })]);
        const envoltura = document.querySelector<HTMLElement>("[data-kind='difusion']");
        expect(envoltura?.style.width).toBe("80%");
        expect(envoltura?.style.height).toBe("60%");
        expect(envoltura?.style.maskImage).toContain("radial-gradient");
        // Difusión «blanco»: veladura blanca con SU opacidad interna.
        expect(difusionDe(envoltura)).toHaveStyle({ background: "rgba(255, 255, 255, 0.4)" });
    });

    it("una capa invisible no se pinta y sin capas la pila no pinta NADA", () => {
        expect(montar([capa({ kind: "shader", id: "s3", visible: false, preset: { components: [] } })])).toHaveLength(0);
        expect(montar([])).toHaveLength(0);
        expect(screen.queryByTestId("capa-shader-s3")).toBeNull();
    });
});