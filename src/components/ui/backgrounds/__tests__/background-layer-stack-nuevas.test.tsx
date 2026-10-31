/**
 * Pruebas de las CAPAS NUEVAS de la pila de fondos (Ola 1018F · FSH1018Gc):
 * difusión (velo, tono, textura, transformación) y shader en su modo fijo (las
 * pruebas corren sin WebGPU), más el orden, la posición, la opacidad y la
 * mezcla con que BackgroundLayerStack pinta ambas sobre el motor base.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { CapaDifusion } from "@/components/backgrounds/capa-difusion";
import { CapaShader } from "@/components/backgrounds/capa-shader";
import { BackgroundLayerStack } from "@/components/ui/backgrounds/background-layer-stack";
import { createLayer, normalizeLayers } from "@/lib/appearance/background-layers";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";

// La pila lee la config desde useAppearance: la sustituimos por una lista de
// capas editable desde cada caso (la pila la normaliza igual que en producción).
const contexto = vi.hoisted(() => ({
    capasFondo: [] as unknown[],
    actualizar: vi.fn(),
}));

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: { background: { layers: contexto.capasFondo, layersVersion: 4 } },
        updateConfig: contexto.actualizar,
    }),
}));

const crearCapaDifusion = (cambios: Partial<BackgroundLayer> = {}): BackgroundLayer => ({
    ...createLayer("difusion"),
    ...cambios,
});

/** Capa shader en modo FIJO: sin WebGPU en las pruebas y sin vista previa si no se pasa. */
const crearCapaShader = (cambios: Partial<BackgroundLayer> = {}): BackgroundLayer => ({
    ...createLayer("shader"),
    preset: { components: [] },
    ...cambios,
});

// ── suites ──────────────────────────────────────────────────────────────

describe("CapaDifusion · renderizado", () => {
    it("pinta la capa visible con la opacidad y la mezcla de la capa", () => {
        const capa = crearCapaDifusion({ opacity: 0.5, blend: "overlay" });
        const { container } = render(<CapaDifusion capa={capa} />);
        const div = container.firstElementChild;
        expect(div).toBeTruthy();
        const estilo = div!.getAttribute("style") ?? "";
        expect(estilo).toContain("opacity: 0.5");
        expect(estilo).toContain("mix-blend-mode: overlay");
    });

    it("aplica la transformación de la capa: posición, escala y rotación", () => {
        const capa = crearCapaDifusion({
            opacity: 0.5,
            transform: { x: 0.1, y: 0.15, escala: 0.8, rotacion: 45, ancho: 1, alto: 1 },
        });
        const { container } = render(<CapaDifusion capa={capa} />);
        const estilo = container.firstElementChild!.getAttribute("style") ?? "";
        expect(estilo).toContain("left: 10%");
        expect(estilo).toContain("top: 15%");
        expect(estilo).toContain("scale(0.8)");
        expect(estilo).toContain("rotate(45deg)");
    });

    it("no pinta la capa invisible", () => {
        const { container } = render(<CapaDifusion capa={crearCapaDifusion({ visible: false })} />);
        expect(container.firstElementChild).toBeNull();
    });

    it("no pinta la capa sin configuración de difusión (capa vieja sin migrar)", () => {
        const capa = crearCapaDifusion();
        delete (capa as Partial<BackgroundLayer>).difusion;
        const { container } = render(<CapaDifusion capa={capa} />);
        expect(container.firstElementChild).toBeNull();
    });

    it("pinta la máscara radial de la capa", () => {
        const capa = crearCapaDifusion({ mascara: "radial" });
        const { container } = render(<CapaDifusion capa={capa} />);
        const estilo = container.firstElementChild!.getAttribute("style") ?? "";
        expect(estilo).toContain("mask-image");
    });
});

describe("CapaDifusion · modos y texturas", () => {
    const interiorDe = (container: HTMLElement): HTMLElement => {
        // El primer div es el envoltorio (transformación); el segundo lleva el velo.
        const interior = container.firstElementChild!.querySelector("div");
        expect(interior).not.toBeNull();
        return interior!;
    };

    it("pinta el modo desenfoque con los píxeles pedidos", () => {
        const capa = crearCapaDifusion({
            difusion: { modo: "desenfoque", desenfoquePx: 20, opacidad: 0.7, textura: "ninguna" },
        });
        const { container } = render(<CapaDifusion capa={capa} />);
        // jsdom guarda `backdrop-filter` solo como propiedad, no en el atributo style.
        expect(interiorDe(container).style.backdropFilter).toBe("blur(20px)");
    });

    it("pinta el modo blanco con la opacidad del velo", () => {
        const capa = crearCapaDifusion({
            difusion: { modo: "blanco", desenfoquePx: 0, opacidad: 0.6, textura: "ninguna" },
        });
        const { container } = render(<CapaDifusion capa={capa} />);
        expect((interiorDe(container).getAttribute("style") ?? "").includes("rgba(255, 255, 255, 0.6)")).toBe(true);
    });

    it("pinta el modo negro con la opacidad del velo", () => {
        const capa = crearCapaDifusion({
            difusion: { modo: "negro", desenfoquePx: 0, opacidad: 0.4, textura: "ninguna" },
        });
        const { container } = render(<CapaDifusion capa={capa} />);
        expect((interiorDe(container).getAttribute("style") ?? "").includes("rgba(0, 0, 0, 0.4)")).toBe(true);
    });

    it("pinta el modo tono con el color dado (color-mix)", () => {
        const capa = crearCapaDifusion({
            difusion: { modo: "tono", desenfoquePx: 0, opacidad: 0.5, tono: "#ff8800", textura: "ninguna" },
        });
        const { container } = render(<CapaDifusion capa={capa} />);
        expect(interiorDe(container)).toBeTruthy();
    });

    it("pinta las tres texturas como teselas de ruido SVG local (sin pedir nada a la red)", () => {
        for (const textura of ["grano", "papel", "escarcha"] as const) {
            const capa = crearCapaDifusion({
                difusion: { modo: "transparente", desenfoquePx: 0, opacidad: 1, textura },
            });
            const { container, unmount } = render(<CapaDifusion capa={capa} />);
            expect((interiorDe(container).getAttribute("style") ?? "").includes("data:image/svg+xml")).toBe(true);
            unmount();
        }
    });
});

describe("CapaShader · renderizado", () => {
    it("no pinta la capa invisible", () => {
        const { container } = render(<CapaShader capa={crearCapaShader({ visible: false })} />);
        expect(container.firstElementChild).toBeNull();
    });

    it("muestra la vista previa fija del set cuando no hay WebGPU", () => {
        const capa = crearCapaShader({ opacity: 0.7, blend: "overlay" });
        const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
        const { container } = render(<CapaShader capa={capa} vistaPrevia={dataUrl} />);
        const img = container.querySelector("img");
        expect(img).toBeTruthy();
        expect(img?.getAttribute("src")).toContain("data:image/png;base64");
        const estilo = img!.getAttribute("style") ?? "";
        expect(estilo).toContain("opacity: 0.7");
        expect(estilo).toContain("mix-blend-mode: overlay");
    });

    it("sin vista previa ni WebGPU no pinta nada: se ve el motor base", () => {
        const { container } = render(<CapaShader capa={crearCapaShader()} />);
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector("canvas")).toBeNull();
    });

    it("capa shader sin preset (no migrada) se queda en fijo y no pinta nada", () => {
        const capa = crearCapaShader();
        delete (capa as Partial<BackgroundLayer>).preset;
        const { container } = render(<CapaShader capa={capa} />);
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector("canvas")).toBeNull();
    });
});

describe("createLayer · capas shader y difusión", () => {
    it("crea la capa shader con sus valores por defecto", () => {
        const capa = createLayer("shader");
        expect(capa.kind).toBe("shader");
        expect(capa.visible).toBe(true);
        expect(capa.opacity).toBe(1);
        expect(capa.blend).toBe("normal");
        expect(capa.preset).toBeDefined();
        expect(capa.preset?.components).toEqual([]);
        expect(capa.transform?.x).toBe(0);
        expect(capa.transform?.escala).toBe(1);
        expect(capa.transform?.rotacion).toBe(0);
        expect(capa.mascara).toBe("ninguna");
    });

    it("crea la capa difusión con sus valores por defecto", () => {
        const capa = createLayer("difusion");
        expect(capa.kind).toBe("difusion");
        expect(capa.visible).toBe(true);
        expect(capa.blend).toBe("normal");
        expect(capa.difusion?.modo).toBe("transparente");
        expect(capa.difusion?.desenfoquePx).toBe(0);
        expect(capa.difusion?.opacidad).toBe(1);
        expect(capa.difusion?.textura).toBe("ninguna");
        expect(capa.transform?.y).toBe(0);
        expect(capa.transform?.escala).toBe(1);
        expect(capa.mascara).toBe("ninguna");
    });
});

describe("normalizeLayers · capas nuevas (migración v4)", () => {
    it("normaliza una capa shader sin preset y le da transformación y máscara neutras", () => {
        const capas = normalizeLayers([
            { id: "shader-test", kind: "shader", visible: true, opacity: 0.8, blend: "screen" },
        ]);
        expect(capas).toHaveLength(1);
        expect(capas[0].kind).toBe("shader");
        expect(capas[0].preset).toBeDefined();
        expect(capas[0].transform).toBeDefined();
        expect(capas[0].mascara).toBe("ninguna");
    });

    it("normaliza una capa difusión sin configuración y le da el modo transparente", () => {
        const capas = normalizeLayers([
            { id: "difusion-test", kind: "difusion", visible: true, opacity: 0.6, blend: "overlay" },
        ]);
        expect(capas).toHaveLength(1);
        expect(capas[0].difusion?.modo).toBe("transparente");
        expect(capas[0].transform).toBeDefined();
        expect(capas[0].mascara).toBe("ninguna");
    });

    it("devuelve la pila vacía cuando la entrada no es válida", () => {
        expect(normalizeLayers(null)).toEqual([]);
        expect(normalizeLayers(undefined)).toEqual([]);
        expect(normalizeLayers({})).toEqual([]);
    });

    it("ignora las capas con kind desconocido", () => {
        const capas = normalizeLayers([
            { id: "unknown-test", kind: "desconocido", visible: true, opacity: 0.5 },
        ]);
        expect(capas).toHaveLength(0);
    });
});

describe("BackgroundLayerStack · capas nuevas en su orden, posición y mezcla", () => {
    /** Ajusta la lista de capas que `useAppearance` (sustituido) devuelve a la pila. */
    const conCapas = (capas: BackgroundLayer[]) => {
        contexto.capasFondo.length = 0;
        contexto.capasFondo.push(...capas);
    };

    beforeAll(() => {
        contexto.capasFondo.length = 0;
    });

    afterEach(() => {
        contexto.capasFondo.length = 0;
    });

    it("pinta cada capa en su posición de la pila, con su opacidad y su mezcla", () => {
        conCapas([
            crearCapaDifusion({ opacity: 0.5, blend: "overlay" }),
            crearCapaShader({ opacity: 0.7, blend: "screen" }),
        ]);
        const { container } = render(<BackgroundLayerStack />);
        // Los envoltorios fijos de la pila salen en el orden de la lista: la
        // difusión (la más baja) primero y el shader encima.
        expect(container.children).toHaveLength(2);
        const difusion = container.children[0] as HTMLElement;
        const shader = container.children[1] as HTMLElement;
        const estiloDifusion = difusion.getAttribute("style") ?? "";
        expect(estiloDifusion).toContain("opacity: 0.5");
        expect(estiloDifusion).toContain("mix-blend-mode: overlay");
        const estiloShader = shader.getAttribute("style") ?? "";
        expect(estiloShader).toContain("opacity: 0.7");
        expect(estiloShader).toContain("mix-blend-mode: screen");
    });

    it("aplica la transformación y la máscara de la capa shader dentro de su capa", () => {
        conCapas([
            crearCapaShader({
                transform: { x: 0.1, y: 0.2, escala: 1.5, rotacion: 30, ancho: 0.5, alto: 0.5 },
                mascara: "radial",
            }),
        ]);
        const { container } = render(<BackgroundLayerStack />);
        const envoltorioInterno = container.firstElementChild!.querySelector("div");
        expect(envoltorioInterno).toBeTruthy();
        const estilo = envoltorioInterno!.getAttribute("style") ?? "";
        expect(estilo).toContain("left: 10%");
        expect(estilo).toContain("top: 20%");
        expect(estilo).toContain("scale(1.5)");
        expect(estilo).toContain("rotate(30deg)");
        expect(estilo).toContain("mask-image");
    });

    it("las capas invisibles no se pintan y quedan solo las encendidas", () => {
        conCapas([
            crearCapaDifusion({ visible: false }),
            crearCapaShader({ opacity: 0.8 }),
        ]);
        const { container } = render(<BackgroundLayerStack />);
        expect(container.children).toHaveLength(1);
        expect((container.children[0] as HTMLElement).getAttribute("style") ?? "").toContain("opacity: 0.8");
    });

    it("el z-index de la pila sube por capa (-9, -8 …) y sin capas no pinta NADA", () => {
        conCapas([
            createLayer("color"),
            crearCapaShader({ blend: "normal" }),
            crearCapaDifusion({ blend: "normal" }),
        ]);
        const { container, unmount } = render(<BackgroundLayerStack />);
        // La primera capa visible → -9 (sobre el motor base) y van subiendo; así la
        // lista manda y el orden de pintado coincide con el de la configuración.
        expect([...container.children].map((e) => (e as HTMLElement).style.zIndex)).toEqual(["-9", "-8", "-7"]);
        unmount();
        conCapas([]);
        const vacio = render(<BackgroundLayerStack />);
        expect(vacio.container.firstElementChild).toBeNull();
        unmount();
    });

    it("la opacidad y la mezcla de la capa shader NO se aplican dos veces (envoltorio + capa)", () => {
        conCapas([crearCapaShader({ opacity: 0.5, blend: "multiply" })]);
        const { container } = render(<BackgroundLayerStack />);
        const envoltorioInterno = container.firstElementChild!.querySelector("div");
        const estiloInterno = envoltorioInterno!.getAttribute("style") ?? "";
        expect(estiloInterno).not.toContain("opacity: 0.5");
        expect(estiloInterno).not.toContain("mix-blend-mode: multiply");
        const estiloEnvoltorio = (container.firstElementChild as HTMLElement).getAttribute("style") ?? "";
        expect(estiloEnvoltorio).toContain("opacity: 0.5");
        expect(estiloEnvoltorio).toContain("mix-blend-mode: multiply");
    });
});
