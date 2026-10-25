/**
 * ACC1025B · TarjetaBienvenida: «Te damos la bienvenida a StarSeed OS» con sus tres acciones.
 * Una pieza, dos sitios: el aviso de abajo y la puerta del centro.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render as renderCrudo, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { TarjetaBienvenida, TITULO_BIENVENIDA } from "../tarjeta-bienvenida";

const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

afterEach(() => cleanup());

function acciones() {
    return { onEntrar: vi.fn(), onIntroduccion: vi.fn(), onExplorar: vi.fn() };
}

describe("TarjetaBienvenida", () => {
    it("tiene el título y las tres acciones de siempre", () => {
        render(<TarjetaBienvenida {...acciones()} />);
        expect(screen.getByRole("heading", { name: TITULO_BIENVENIDA })).toBeInTheDocument();
        expect(TITULO_BIENVENIDA).toBe("Te damos la bienvenida a StarSeed OS");
        expect(screen.getByRole("button", { name: "Entrar o crear cuenta" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Ver la introducción" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Explorar sin cuenta" })).toBeInTheDocument();
    });

    it("cada botón llama a su acción", () => {
        const a = acciones();
        render(<TarjetaBienvenida {...a} />);
        fireEvent.click(screen.getByRole("button", { name: "Entrar o crear cuenta" }));
        fireEvent.click(screen.getByRole("button", { name: "Ver la introducción" }));
        fireEvent.click(screen.getByRole("button", { name: "Explorar sin cuenta" }));
        expect(a.onEntrar).toHaveBeenCalledTimes(1);
        expect(a.onIntroduccion).toHaveBeenCalledTimes(1);
        expect(a.onExplorar).toHaveBeenCalledTimes(1);
    });

    it("la variante «puerta» es grande y centrada; el «aviso» es la discreta de abajo", () => {
        const { rerender } = render(<TarjetaBienvenida {...acciones()} variante="puerta" />);
        const puerta = screen.getByTestId("tarjeta-bienvenida");
        expect(puerta).toHaveAttribute("data-variante", "puerta");
        expect(puerta.className).toContain("max-w-md");
        expect(puerta.querySelector(".text-center")).not.toBeNull();
        rerender(
            <AppearanceProvider>
                <TarjetaBienvenida {...acciones()} variante="aviso" />
            </AppearanceProvider>,
        );
        const aviso = screen.getByTestId("tarjeta-bienvenida");
        expect(aviso).toHaveAttribute("data-variante", "aviso");
        expect(aviso.className).not.toContain("max-w-md");
    });

    it("todos los botones tienen diana de al menos 44 px y cursor pointer", () => {
        render(<TarjetaBienvenida {...acciones()} />);
        for (const b of screen.getAllByRole("button")) {
            expect(b.className).toMatch(/cursor-pointer/);
            expect(b.className).toMatch(/h-11|min-h-\[44px\]/);
        }
    });

    it("deja sitio a la esquina (el botón de cerrar del aviso) y respeta el id del título", () => {
        render(<TarjetaBienvenida {...acciones()} idTitulo="mi-titulo" esquina={<button type="button">Cerrar el aviso</button>} />);
        expect(screen.getByRole("button", { name: "Cerrar el aviso" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: TITULO_BIENVENIDA }).id).toBe("mi-titulo");
    });
});
