import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DisenoAcciones } from "../diseno-acciones";

const props = {
    estado: "calma" as const,
    tam: 200,
    ultima: null,
    hilo: [],
    ahora: Date.now(),
    tactil: false,
    voz: false,
    preguntar: null,
    botonVoz: null,
    sugerencias: ["Resumen", "Nueva", "Ordenar"],
    onAbrirChat: vi.fn(),
    onSugerencia: vi.fn(),
};

describe("DisenoAcciones", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renderiza los botones de sugerencia y el botón de abrir chat", () => {
        const { unmount } = render(<DisenoAcciones {...props} />);
        const botones = screen.getAllByRole("button");
        expect(botones).toHaveLength(4);
        expect(screen.getByText("Resumen")).toBeInTheDocument();
        expect(screen.getByText("Abrir el chat")).toBeInTheDocument();
        unmount();
    });

    it("llama a onSugerencia con el texto correcto al clicar", () => {
        const onSugerencia = vi.fn();
        const { unmount } = render(<DisenoAcciones {...props} onSugerencia={onSugerencia} />);
        fireEvent.click(screen.getByText("Resumen"));
        expect(onSugerencia).toHaveBeenCalledWith("Resumen");
        unmount();
    });

    it("llama a onAbrirChat al clicar el botón de abrir chat", () => {
        const onAbrirChat = vi.fn();
        const { unmount } = render(<DisenoAcciones {...props} onAbrirChat={onAbrirChat} />);
        fireEvent.click(screen.getByText("Abrir el chat"));
        expect(onAbrirChat).toHaveBeenCalled();
        unmount();
    });

    it("no hay overflow horizontal cuando tam es 180 o 360", () => {
        const { container, unmount } = render(<DisenoAcciones {...props} tam={180} />);
        const root = container.querySelector('[data-testid="diseno-acciones"]') as HTMLElement;
        expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
        unmount();
        const { container: container360, unmount: unmount360 } = render(<DisenoAcciones {...props} tam={360} />);
        const root360 = container360.querySelector('[data-testid="diseno-acciones"]') as HTMLElement;
        expect(root360.scrollWidth).toBeLessThanOrEqual(root360.clientWidth);
        unmount360();
    });
});
