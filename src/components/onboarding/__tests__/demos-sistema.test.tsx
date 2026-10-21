import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ComponentType } from "react";
import {
    ProtomoleculaDemo,
    MallaDemo,
    CapasConcienciaDemo,
    NeuronasCerebroDemo,
    DEMOS_SISTEMA,
    type DemoSistemaProps,
} from "../demos-sistema";

afterEach(cleanup);

const CASOS: Array<[string, ComponentType<DemoSistemaProps>, RegExp]> = [
    ["Protomolécula", ProtomoleculaDemo, /^Protomolécula: .*molécula viva.*geometría sagrada/],
    ["Malla", MallaDemo, /^Redes mesh: .*Wi‑Fi.*radio LoRa, sin internet/],
    ["Capas de conciencia", CapasConcienciaDemo, /^Capas de conciencia de Astraura: .*colectiva está en camino/],
    ["Neuronas y cerebro", NeuronasCerebroDemo, /^Neuronas y cerebro: .*alimentan tu cerebro/],
];

describe("guía · demostraciones del sistema (GUI1021D)", () => {
    for (const [nombre, Demo, etiqueta] of CASOS) {
        for (const reduce of [false, true]) {
            it(`${nombre} (reduce=${reduce}) dibuja un SVG con su etiqueta accesible en español`, () => {
                const { container } = render(<Demo accent="#C9A8FF" reduce={reduce} />);
                const svg = container.querySelector("svg");
                expect(svg).not.toBeNull();
                const img = screen.getByRole("img", { name: etiqueta });
                expect(img).toBe(svg);
                expect(img.getAttribute("viewBox")).toBe("0 0 200 112");
            });
        }
    }

    it("lo que aún no existe se dice: la capa colectiva va «en camino»", () => {
        const { container } = render(<CapasConcienciaDemo accent="#00E5FF" reduce />);
        const textos = Array.from(container.querySelectorAll("text"), (t) => t.textContent);
        expect(textos).toEqual(["local", "malla", "nube", "colectiva", "en camino"]);
    });

    it("la malla enseña el aviso «sin internet» y sus tres aparatos", () => {
        const { container } = render(<MallaDemo accent="#00E5FF" reduce />);
        const textos = Array.from(container.querySelectorAll("text"), (t) => t.textContent);
        expect(textos).toEqual(expect.arrayContaining(["sin internet", "Wi‑Fi", "radio LoRa", "móvil", "portátil", "antena"]));
    });

    it("dos demos a la vez no comparten el id de su degradado", () => {
        const { container } = render(
            <>
                <ProtomoleculaDemo accent="#C9A8FF" reduce />
                <NeuronasCerebroDemo accent="#C9A8FF" reduce />
            </>,
        );
        const ids = Array.from(container.querySelectorAll("radialGradient"), (g) => g.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it("DEMOS_SISTEMA las ofrece por la clave de su tema de la guía", () => {
        expect(Object.keys(DEMOS_SISTEMA)).toEqual(["protomolecula", "malla", "capas-conciencia", "neuronas-cerebro"]);
    });
});
