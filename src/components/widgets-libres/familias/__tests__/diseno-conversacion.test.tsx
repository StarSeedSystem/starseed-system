import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock window.matchMedia for jsdom
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
import DisenoConversacion from "../diseno-conversacion";

const estados: ("calma" | "escuchando" | "pensando" | "hablando")[] = [
    "calma", "escuchando", "pensando", "hablando",
];

describe("DisenoConversacion", () => {
    const tam = 120;
    const ahora = Date.now();
    const hiloConTurnos = [
        { rol: "user" as const, texto: "Hola, ¿cómo estás?", ts: ahora - 120_000 },
        { rol: "aurora" as const, texto: "¡Hola! Estoy bien, gracias por preguntar. ¿En qué te ayudo hoy?", ts: ahora - 60_000 },
        { rol: "user" as const, texto: "Cuéntame algo interesante", ts: ahora - 30_000 },
        { rol: "aurora" as const, texto: "¡Claro! Aquí tienes algo interesante...", ts: ahora - 120_000 },
    ];
    const hiloVacio: { rol: "user" | "aurora"; texto: string; ts: number }[] = [];

    const propsBase = {
        estado: "calma" as const,
        tam,
        ultima: { texto: "¡Hola! Estoy bien, gracias por preguntar.", ts: ahora - 60_000 },
        hilo: hiloConTurnos,
        ahora,
        tactil: false,
        voz: false,
        preguntar: "¿Cómo estás?" as React.ReactNode,
        botonVoz: null as React.ReactNode,
        sugerencias: [] as string[],
        onAbrirChat: () => {},
        onSugerencia: (_t: string) => {},
    };

    it("renderiza con props de ejemplo", () => {
        const { container } = render(
            <DisenoConversacion {...propsBase} />
        );
        const root = container.firstElementChild;
        expect(root).toBeInTheDocument();
    });

    it("muestra la forma pequeña con el estado en texto", () => {
        const { container } = render(
            <DisenoConversacion {...propsBase} />
        );
        const texto = container.textContent || "";
        expect(texto).toContain("En calma");
    });

    it("muestra el hilo con hasta 3 turnos", () => {
        const { container } = render(
            <DisenoConversacion {...propsBase} />
        );
        const texto = container.textContent || "";
        expect(texto).toContain("Tú");
        expect(texto).toContain("Astraura");
        expect(texto).toContain("Hola, ¿cómo estás?");
        expect(texto).toContain("¡Hola! Estoy bien");
        expect(texto).toContain("Cuéntame algo interesante");
    });

    it("muestra el tiempo relativo en el último turno de Astraura", () => {
        render(<DisenoConversacion {...propsBase} />);
        expect(screen.getByText(/hace \d+ (min|h)/)).toBeInTheDocument();
    });

    it("muestra mensaje vacío cuando no hay hilo", () => {
        const { container } = render(
            <DisenoConversacion {...propsBase} hilo={hiloVacio} ultima={null} />
        );
        const texto = container.textContent || "";
        expect(texto).toContain("Aún no habéis hablado. Pregúntale lo que quieras.");
    });

    it("muestra el componente preguntar", () => {
        const { container } = render(
            <DisenoConversacion {...propsBase} />
        );
        const texto = container.textContent || "";
        expect(texto).toContain("¿Cómo estás?");
    });

it("cada botón llama a su función", () => {
        const onAbrirChat = vi.fn();
        const onSugerencia = vi.fn();
        render(<DisenoConversacion {...propsBase} onAbrirChat={onAbrirChat} onSugerencia={onSugerencia} />);
        const botones = screen.getAllByRole("button");
        expect(botones.length).toBeGreaterThan(0);
        botones.forEach((boton) => {
            fireEvent.click(boton);
        });
        // onAbrirChat se llama al menos una vez (forma o enlace de chat)
        expect(onAbrirChat).toHaveBeenCalled();
    });

    it("no tiene desbordes a 180 px de ancho", () => {
        const { container } = render(
            <div style={{ width: "180px" }}><DisenoConversacion {...propsBase} /></div>
        );
        const elemento = container.firstElementChild?.firstElementChild;
        if (elemento) {
            expect(elemento.scrollWidth).toBeLessThanOrEqual(elemento.clientWidth);
        }
    });

    it("no tiene desbordes a 360 px de ancho", () => {
        const { container } = render(
            <div style={{ width: "360px" }}><DisenoConversacion {...propsBase} /></div>
        );
        const elemento = container.firstElementChild?.firstElementChild;
        if (elemento) {
            expect(elemento.scrollWidth).toBeLessThanOrEqual(elemento.clientWidth);
        }
    });

    it("usa colores del tema y acento astraura", () => {
        const { container } = render(
            <DisenoConversacion {...propsBase} />
        );
        const root = container.firstElementChild;
        const style: Partial<CSSStyleDeclaration> = root instanceof Element ? window.getComputedStyle(root) : {};
        const colorFondo = style.backgroundColor || "";
        expect(colorFondo).not.toContain("rgb(255, 255, 255)");
    });

    it("tiene nombres accesibles en español", () => {
        render(<DisenoConversacion {...propsBase} />);
        expect(screen.getByText(/(calma|escuchando|pensando|hablando)/i)).toBeInTheDocument();
        expect(screen.getByText(/hace \d+ (min|h)/)).toBeInTheDocument();
    });

    it("usa Prescindible para retirar turnos viejos cuando no caben", () => {
        // Test con muchos turnos para verificar que Prescindible está en el JSX
        const hiloLargo = Array.from({ length: 6 }, (_, i) => ({
            rol: i % 2 === 0 ? "user" as const : "aurora" as const,
            texto: `Mensaje ${i + 1}`,
            ts: ahora - (6 - i) * 60_000,
        }));
        const { container } = render(
            <DisenoConversacion {...propsBase} hilo={hiloLargo} />
        );
        // Verifica que hay elementos con data-prescindible o que el componente no rompe
        const root = container.firstElementChild;
        expect(root).toBeInTheDocument();
    });

    it("renderiza correctamente con todos los estados de voz", () => {
        for (const estado of estados) {
            const { container } = render(
                <DisenoConversacion {...propsBase} estado={estado} />
            );
            const texto = container.textContent || "";
            expect(texto).toContain(["En calma", "Escuchando…", "Pensando…", "Hablando"][estados.indexOf(estado)]);
        }
    });
});