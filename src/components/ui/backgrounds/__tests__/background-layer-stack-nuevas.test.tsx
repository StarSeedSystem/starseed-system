import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { CapaDifusion } from "@/components/ui/backgrounds/capa-difusion";
import { CapaShader } from "@/components/ui/backgrounds/capa-shader";
import { createLayer, normalizeLayers } from "@/lib/appearance/background-layers";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";

const crearLayerDifusion = (overrides: Partial<BackgroundLayer> = {}): BackgroundLayer => ({
    id: "test-difusion",
    kind: "difusion",
    name: "Difusión",
    visible: true,
    opacity: 1,
    blend: "normal",
    difusion: {
        modo: "transparente",
        desenfoquePx: 0,
        opacidad: 1,
        textura: "ninguna",
    },
    transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
    mascara: "ninguna",
    ...overrides,
});

describe("CapaDifusion - renderizado", () => {
    it("renderiza capa difusion visible con modo transparente", () => {
        const layer = crearLayerDifusion({
            opacity: 0.5,
            blend: "overlay",
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstElementChild;
        expect(div).toBeTruthy();
        const style = div!.getAttribute("style") || "";
        expect(style).toContain("opacity: 0.5");
        expect(style).toContain("mix-blend-mode: overlay");
    });

    it("no renderiza capa difusion cuando visible es false", () => {
        const layer = crearLayerDifusion({
            visible: false,
            opacity: 0.5,
            blend: "normal",
        });

        const result = render(<CapaDifusion layer={layer} />);
        expect(result.container.firstChild).toBeNull();
    });

    it("no renderiza capa difusion cuando difusion es undefined", () => {
        const layer = {
            id: "test-no-difusion",
            kind: "difusion" as const,
            visible: true,
            opacity: 0.8,
            blend: "normal" as const,
        } as BackgroundLayer;

        const result = render(<CapaDifusion layer={layer} />);
        expect(result.container.firstChild).toBeNull();
    });

    it("aplica transform a la capa difusion", () => {
        const layer = crearLayerDifusion({
            opacity: 0.5,
            blend: "screen",
            transform: { x: 10, y: 15, escala: 0.8, rotacion: 45, ancho: 1, alto: 1 },
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstElementChild;
        const style = div!.getAttribute("style") || "";
        expect(style).toContain("translate(10%, 15%)");
        expect(style).toContain("scale(0.8)");
        expect(style).toContain("rotate(45deg)");
    });

    it("renderiza modo desenfoque con valor correcto", () => {
        const layer = crearLayerDifusion({
            difusion: {
                modo: "desenfoque",
                desenfoquePx: 20,
                opacidad: 0.7,
                textura: "ninguna",
            },
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstChild;
        expect(div).toBeTruthy();
    });

    it("renderiza modo blanco", () => {
        const layer = crearLayerDifusion({
            difusion: {
                modo: "blanco",
                desenfoquePx: 0,
                opacidad: 0.6,
                textura: "ninguna",
            },
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstChild;
        expect(div).toBeTruthy();
    });

    it("renderiza modo negro", () => {
        const layer = crearLayerDifusion({
            difusion: {
                modo: "negro",
                desenfoquePx: 0,
                opacidad: 0.4,
                textura: "ninguna",
            },
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstChild;
        expect(div).toBeTruthy();
    });

    it("renderiza modo tono con color", () => {
        const layer = crearLayerDifusion({
            difusion: {
                modo: "tono",
                desenfoquePx: 0,
                opacidad: 0.5,
                tono: "#ff0000",
                textura: "ninguna",
            },
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstChild;
        expect(div).toBeTruthy();
    });

    it("aplica estilo de textura grano", () => {
        const layer = crearLayerDifusion({
            difusion: {
                modo: "transparente",
                desenfoquePx: 0,
                opacidad: 1,
                textura: "grano",
            },
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstChild;
        expect(div).toBeTruthy();
    });

    it("aplica estilo de textura papel", () => {
        const layer = crearLayerDifusion({
            difusion: {
                modo: "transparente",
                desenfoquePx: 0,
                opacidad: 1,
                textura: "papel",
            },
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstChild;
        expect(div).toBeTruthy();
    });

    it("aplica estilo de textura escarcha", () => {
        const layer = crearLayerDifusion({
            difusion: {
                modo: "transparente",
                desenfoquePx: 0,
                opacidad: 1,
                textura: "escarcha",
            },
        });

        const result = render(<CapaDifusion layer={layer} />);
        const div = result.container.firstChild;
        expect(div).toBeTruthy();
    });
});

describe("CapaShader - lógica de renderizado", () => {
    it("no renderiza cuando visible es false", () => {
        const layer: BackgroundLayer = {
            id: "shader-test",
            kind: "shader",
            visible: false,
            opacity: 0.8,
            blend: "normal",
            preset: { components: [] },
            transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
            mascara: "ninguna",
        };

        const result = render(<CapaShader layer={layer} />);
        expect(result.container.firstChild).toBeNull();
    });

    it("renderiza vista previa cuando no hay WebGPU y se proporciona", () => {
        const layer: BackgroundLayer = {
            id: "shader-test",
            kind: "shader",
            visible: true,
            opacity: 0.7,
            blend: "overlay",
            preset: { components: [] },
            transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
            mascara: "ninguna",
        };

        const result = render(
            <CapaShader
                layer={layer}
                vistaPrevia="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
            />
        );
        const img = result.container.querySelector("img");
        expect(img).toBeTruthy();
        expect(img?.getAttribute("src")).toContain("data:image/png;base64");
    });

    it("no renderiza canvas cuando no hay WebGPU y sin vista previa", () => {
        const layer: BackgroundLayer = {
            id: "shader-test",
            kind: "shader",
            visible: true,
            opacity: 0.6,
            blend: "multiply",
            preset: { components: [] },
            transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
            mascara: "ninguna",
        };

        const result = render(<CapaShader layer={layer} />);
        const canvas = result.container.querySelector("canvas");
        expect(canvas).toBeNull();
    });
});

describe("createLayer - capas shader y difusion", () => {
    it("createLayer crea capa shader con defaults", () => {
        const layer = createLayer("shader");
        expect(layer.kind).toBe("shader");
        expect(layer.visible).toBe(true);
        expect(layer.opacity).toBe(1);
        expect(layer.blend).toBe("normal");
        expect(layer.preset).toBeDefined();
        expect(layer.preset?.components).toEqual([]);
        expect(layer.transform).toBeDefined();
        expect(layer.transform?.x).toBe(0);
        expect(layer.transform?.y).toBe(0);
        expect(layer.transform?.escala).toBe(1);
        expect(layer.transform?.rotacion).toBe(0);
        expect(layer.mascara).toBe("ninguna");
    });

    it("createLayer crea capa difusion con defaults", () => {
        const layer = createLayer("difusion");
        expect(layer.kind).toBe("difusion");
        expect(layer.visible).toBe(true);
        expect(layer.opacity).toBe(1);
        expect(layer.blend).toBe("normal");
        expect(layer.difusion).toBeDefined();
        expect(layer.difusion?.modo).toBe("transparente");
        expect(layer.difusion?.desenfoquePx).toBe(0);
        expect(layer.difusion?.opacidad).toBe(1);
        expect(layer.difusion?.textura).toBe("ninguna");
        expect(layer.transform).toBeDefined();
        expect(layer.transform?.x).toBe(0);
        expect(layer.transform?.escala).toBe(1);
        expect(layer.mascara).toBe("ninguna");
    });
});

describe("normalizeLayers - manejo de capas nuevas", () => {
    it("normaliza capa shader sin preset", () => {
        const raw = [{
            id: "shader-test",
            kind: "shader",
            visible: true,
            opacity: 0.8,
            blend: "screen",
        }];

        const normalized = normalizeLayers(raw);

        expect(normalized).toHaveLength(1);
        expect(normalized[0].kind).toBe("shader");
        expect(normalized[0].preset).toBeDefined();
        expect(normalized[0].transform).toBeDefined();
        expect(normalized[0].mascara).toBe("ninguna");
    });

    it("normaliza capa difusion sin config", () => {
        const raw = [{
            id: "difusion-test",
            kind: "difusion",
            visible: true,
            opacity: 0.6,
            blend: "overlay",
        }];

        const normalized = normalizeLayers(raw);

        expect(normalized).toHaveLength(1);
        expect(normalized[0].kind).toBe("difusion");
        expect(normalized[0].difusion).toBeDefined();
        expect(normalized[0].difusion?.modo).toBe("transparente");
        expect(normalized[0].transform).toBeDefined();
        expect(normalized[0].mascara).toBe("ninguna");
    });

    it("devuelve array vacío para entrada no válida", () => {
        expect(normalizeLayers(null)).toEqual([]);
        expect(normalizeLayers(undefined)).toEqual([]);
        expect(normalizeLayers({})).toEqual([]);
    });

    it("ignora capas con kind desconocido", () => {
        const raw = [{
            id: "unknown-test",
            kind: "desconocido",
            visible: true,
            opacity: 0.5,
        }];

        const normalized = normalizeLayers(raw);
        expect(normalized).toHaveLength(0);
    });
});