import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { VariacionesHost } from "../variaciones-host";
import { abrirVariaciones } from "../variaciones-bus";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));

// OPF1024H: el anfitrión ya no esquiva Escape por su cuenta; lo hace la pila de OSWindow, con el mismo resultado.

const claves = () => Array.from(document.querySelectorAll("[data-ss-variaciones]")).map((n) => n.getAttribute("data-ss-variaciones"));
const pulsarEscape = () => act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

describe("VariacionesHost · Escape con la pila (OPF1024H)", () => {
    afterEach(() => cleanup());

    it("Escape cierra solo la de arriba, también la que se trajo al frente al reabrirla", () => {
        render(<VariacionesHost />);
        act(() => { abrirVariaciones("widget:reloj"); abrirVariaciones("ajuste:tema"); });
        expect(claves()).toEqual(["widget:reloj", "ajuste:tema"]);
        // Reabrir la primera la trae al frente sin duplicarla.
        act(() => { abrirVariaciones("widget:reloj"); });
        expect(claves()).toEqual(["ajuste:tema", "widget:reloj"]);
        pulsarEscape();
        expect(claves()).toEqual(["ajuste:tema"]);
        pulsarEscape();
        expect(claves()).toEqual([]);
    });

    it("la X de una ventana cierra esa ventana", () => {
        render(<VariacionesHost />);
        act(() => { abrirVariaciones("widget:reloj"); abrirVariaciones("ajuste:tema"); });
        const equis = screen.getAllByRole("button", { name: "Cerrar ventana" });
        fireEvent.click(equis[equis.length - 1]);
        expect(claves()).toEqual(["widget:reloj"]);
    });
});
