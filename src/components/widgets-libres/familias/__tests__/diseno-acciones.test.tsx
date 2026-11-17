import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Shim de window.matchMedia para jsdom (lo leen los ganchos de presupuesto de render).
global.window.matchMedia = global.window.matchMedia || function () {
    return {
        matches: false,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {},
    };
};
import DisenoAcciones from "../diseno-acciones";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";

const SUGERENCIAS = ["Resúmeme mi día", "¿Qué hay nuevo en la red?", "Ayúdame a ordenar mis tareas de hoy"];

const propsBase: PropsDiseno = {
    estado: "calma",
    tam: 96,
    ultima: { texto: "FRASE-QUE-NO-DEBE-APARECER", ts: 0 },
    hilo: [],
    ahora: 0,
    tactil: true,
    voz: false,
    preguntar: <button type="button">¿Cómo estás?</button>,
    botonVoz: null,
    sugerencias: SUGERENCIAS,
    onAbrirChat: () => {},
    onSugerencia: (_t: string) => {},
};

describe("DisenoAcciones", () => {
    it("renderiza con props de ejemplo", () => {
        const { container } = render(<DisenoAcciones {...propsBase} />);
        expect(container.firstElementChild).toBeInTheDocument();
    });

    it("muestra la forma y el estado en texto", () => {
        render(<DisenoAcciones {...propsBase} />);
        expect(screen.getByRole("status")).toHaveTextContent("En calma");
        expect(screen.getByRole("button", { name: /Abrir el chat de Astraura/ })).toBeInTheDocument();
    });

    it("dice el estado en texto para cada estado del asistente", () => {
        const estados = ["calma", "escuchando", "hablando", "pensando"] as const;
        const textos = ["En calma", "Escuchando…", "Hablando", "Pensando…"];
        estados.forEach((estado, i) => {
            const { container } = render(<DisenoAcciones {...propsBase} estado={estado} />);
            expect(container.textContent).toContain(textos[i]);
        });
    });

    it("muestra las sugerencias y el atajo fijo «Abrir el chat»", () => {
        render(<DisenoAcciones {...propsBase} />);
        SUGERENCIAS.forEach((s) => expect(screen.getByRole("button", { name: s })).toBeInTheDocument());
        expect(screen.getByRole("button", { name: /^Abrir el chat$/ })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Atajos para empezar rápido" })).toBeInTheDocument();
    });

    it("muestra como mucho 4 sugerencias de la tarea que lo monta", () => {
        render(<DisenoAcciones {...propsBase} sugerencias={["s1", "s2", "s3", "s4", "s5", "s6"]} />);
        expect(screen.getByRole("button", { name: "s4" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "s5" })).toBeNull();
        expect(screen.queryByRole("button", { name: "s6" })).toBeNull();
    });

    it("no muestra el hilo ni la última frase (eso es del diseño Conversación)", () => {
        const { container } = render(<DisenoAcciones {...propsBase} />);
        expect(container.textContent).not.toContain("FRASE-QUE-NO-DEBE-APARECER");
    });

    it("cada sugerencia llama a onSugerencia con su texto", () => {
        const onSugerencia = vi.fn();
        render(<DisenoAcciones {...propsBase} onSugerencia={onSugerencia} />);
        SUGERENCIAS.forEach((s) => fireEvent.click(screen.getByRole("button", { name: s })));
        expect(onSugerencia).toHaveBeenCalledTimes(SUGERENCIAS.length);
        SUGERENCIAS.forEach((s) => expect(onSugerencia).toHaveBeenCalledWith(s));
    });

    it("el atajo fijo y la forma llaman a onAbrirChat", () => {
        const onAbrirChat = vi.fn();
        render(<DisenoAcciones {...propsBase} onAbrirChat={onAbrirChat} />);
        fireEvent.click(screen.getByRole("button", { name: /^Abrir el chat$/ }));
        fireEvent.click(screen.getByRole("button", { name: /Abrir el chat de Astraura/ }));
        expect(onAbrirChat).toHaveBeenCalledTimes(2);
    });

    it("acento de PALETAS.astraura y nunca fondo blanco fijo", () => {
        const { container } = render(<DisenoAcciones {...propsBase} />);
        const punto = container.querySelector("[data-acento]");
        expect(punto?.getAttribute("style") ?? "").toMatch(/00F0FF|0,\s*240,\s*255/i);
        const root = container.firstElementChild as HTMLElement;
        expect(window.getComputedStyle(root).backgroundColor).not.toContain("rgb(255, 255, 255)");
    });

    it("no tiene desbordes a 180 px de ancho", () => {
        const { container } = render(<div style={{ width: "180px" }}><DisenoAcciones {...propsBase} /></div>);
        const el = container.firstElementChild as HTMLElement;
        expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth);
    });

    it("no tiene desbordes a 360 px de ancho", () => {
        const { container } = render(<div style={{ width: "360px" }}><DisenoAcciones {...propsBase} /></div>);
        const el = container.firstElementChild as HTMLElement;
        expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth);
    });
});
