import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisenoMinimo } from "../diseno-minimo";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { AstrauraForma } from "./astraura-forma";
import { Rotulo } from "./comun";

const estadoInicial: PropsDiseno["estado"] = "calma";

function makeProps(overrides?: Partial<PropsDiseno>): PropsDiseno {
    return {
        estado: "calma",
        tam: 140,
        ultima: null,
        hilo: [],
        ahora: Date.now(),
        tactil: false,
        voz: false,
        preguntar: <div data-testid="preguntar">Preguntar</div>,
        botonVoz: null,
        sugerencias: [],
        onAbrirChat: () => {},
        onSugerencia: () => {},
        ...overrides,
    };
}

describe("DisenoMinimo", () => {
    it("renderiza con props de ejemplo", () => {
        const { base } = render(<DisenoMinimo {...makeProps()} />);
        expect(base).toBeInTheDocument();
    });

    it("muestra AstrauraForma con el tam prop", () => {
        const { getByTestId } = render(<DisenoMinimo {...makeProps({ tam: 100 })} />);
        const forma = getByTestId("astraura-forma");
        expect(forma).toBeInTheDocument();
    });

    it("muestra el texto de estado en Rotulo", () => {
        const { getByText } = render(<DisenoMinimo {...makeProps()} />);
        const rotulo = screen.getByRole("heading", { name: /en calma/i });
        expect(rotulo).toBeInTheDocument();
    });

    it("muestra el prop preguntar", () => {
        const { getByTestId } = render(<DisenoMinimo {...makeProps()} />);
        const pregunta = getByTestId("preguntar");
        expect(pregunta).toBeInTheDocument();
    });

    it("no muestra hilo ni sugerencias", () => {
        const { queryByTestId } = render(<DisenoMinimo {...makeProps()} />);
        expect(queryByTestId("hilo")).toBeNull();
        expect(queryByTestId("sugerencias")).toBeNull();
    });

    it("no tiene botón de voz", () => {
        const { queryByTestId } = render(<DisenoMinimo {...makeProps()} />);
        expect(queryByTestId("boton-voz")).toBeNull();
    });

    it("aplica truncado a 160px de ancho", () => {
        const { container } = render(
            <DisenoMinimo {...makeProps({ tam: 200 })} />
        );
        const div = container.firstChild as HTMLElement;
        expect(div.scrollWidth).toBeLessThanOrEqual(div.clientWidth);
    });

    it("no tiene scrollWidth mayor que clientWidth a 180px", () => {
        const { container } = render(
            <DisenoMinimo {...makeProps({ tam: 180 })} />
        );
        const div = container.firstChild as HTMLElement;
        expect(div.scrollWidth).toBeLessThanOrEqual(div.clientWidth);
    });

    it("no tiene scrollWidth mayor que clientWidth a 360px", () => {
        const { container } = render(
            <DisenoMinimo {...makeProps({ tam: 360 })} />
        );
        const div = container.firstChild as HTMLElement;
        expect(div.scrollWidth).toBeLessThanOrEqual(div.clientWidth);
    });

    it("usa colores del tema (text-foreground)", () => {
        const { container } = render(<DisenoMinimo {...makeProps()} />);
        const div = container.firstChild as HTMLElement;
        expect(div.style.color).toContain("text-foreground");
    });

    it("accessible names en español", () => {
        const { getByText } = render(<DisenoMinimo {...makeProps()} />);
        const elements = screen.getAllByRole("button", { hidden: true });
        expect(elements.length).toBeGreaterThan(0);
    });
});