/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectorPar } from "../selector-par";
import { IDIOMAS } from "@/lib/idiomas/idiomas";

const INSTALADOS_EJEMPLO = ["Xenova/opus-mt-es-en", "Xenova/opus-mt-en-es"] as const;

const idiomasMock = [...IDIOMAS.slice(0, 10)];

beforeEach(() => {
    cleanup();
});

afterEach(() => {
    cleanup();
});

describe("SelectorPar", () => {
    it("muestra los dos selectores con botón de intercambiar", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        expect(screen.getByRole("combobox", { name: /de/i })).toBeTruthy();
        expect(screen.getByRole("combobox", { name: /a/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Intercambiar idiomas" })).toBeTruthy();
    });

    it("muestra el idioma seleccionado en cada dropdown", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        expect(screen.getByText("Español")).toBeTruthy();
        expect(screen.getByText("English")).toBeTruthy();
    });

    it("abre el dropdown de origen al hacer clic", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        fireEvent.click(screen.getByRole("combobox", { name: /de/i }));
        expect(screen.getByRole("listbox", { name: "Idiomas de origen" })).toBeTruthy();
    });

    it("abre el dropdown de destino al hacer clic", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        fireEvent.click(screen.getByRole("combobox", { name: /a/i }));
        expect(screen.getByRole("listbox", { name: "Idiomas de destino" })).toBeTruthy();
    });

    it("llama a onCambiar cuando se elige un idioma", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        fireEvent.click(screen.getByRole("combobox", { name: /de/i }));
        fireEvent.click(screen.getByText("Português"));
        expect(onCambiar).toHaveBeenCalledWith({ origen: "pt", destino: "en" });
    });

    it("intercambia los idiomas al pulsar el botón", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        fireEvent.click(screen.getByRole("button", { name: "Intercambiar idiomas" }));
        expect(onCambiar).toHaveBeenCalledWith({ origen: "en", destino: "es" });
    });

    it("el botón de intercambiar está deshabilitado cuando falta un idioma", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={null} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        const btnIntercambiar = screen.getByRole("button", { name: "Intercambiar idiomas" });
        expect(btnIntercambiar).toBeDisabled();
    });

    it("muestra 'Detectar idioma' como primera opción en origen", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        fireEvent.click(screen.getByRole("combobox", { name: /de/i }));
        expect(screen.getByText("Detectar idioma")).toBeTruthy();
    });

    it("busca idiomas por nombre en el dropdown", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        fireEvent.click(screen.getByRole("combobox", { name: /de/i }));
        const inputBusqueda = screen.getByPlaceholderText("Buscar idioma origen");
        fireEvent.change(inputBusqueda, { target: { value: "franc" } });
        expect(screen.queryByText("Français")).toBeTruthy();
    });

    it("busca idiomas por código en el dropdown", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        fireEvent.click(screen.getByRole("combobox", { name: /de/i }));
        const inputBusqueda = screen.getByPlaceholderText("Buscar idioma origen");
        fireEvent.change(inputBusqueda, { target: { value: "de" } });
        expect(screen.queryByText("Deutsch")).toBeTruthy();
    });

    describe("insignia de estado", () => {
        it("muestra 'Sin internet' cuando el modelo está instalado", () => {
            const onCambiar = vi.fn();
            render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={["Xenova/opus-mt-es-en"]} />);

            fireEvent.click(screen.getByRole("combobox", { name: /a/i }));
            const opcion = screen.getByText("English").closest('[role="option"]');
            expect(opcion?.textContent).toContain("Sin internet");
        });

        it("muestra 'Con descarga' cuando el modelo existe pero no está instalado", () => {
            const onCambiar = vi.fn();
            render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados=[] />);

            fireEvent.click(screen.getByRole("combobox", { name: /a/i }));
            const opcion = screen.getByText("English").closest('[role="option"]');
            expect(opcion?.textContent).toContain("Con descarga");
        });

        it("muestra 'Solo con internet' para pares sin modelo local", () => {
            const onCambiar = vi.fn();
            render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "fr" }} onCambiar={onCambiar} instalados=[] />);

            fireEvent.click(screen.getByRole("combobox", { name: /a/i }));
            const opcion = screen.getByText("Français").closest('[role="option"]');
            expect(opcion?.textContent).toContain("Solo con internet");
        });
    });

    it("respeta ancho máximo de 360px", () => {
        const onCambiar = vi.fn();
        const { container } = render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        const wrapper = container.querySelector('[data-testid="selector-par"]');
        expect(wrapper?.classList).toContain("max-w-[360px]");
    });

    it("respeta altura mínima de 44px para los botones", () => {
        const onCambiar = vi.fn();
        render(<SelectorPar idiomas={idiomasMock} par={{ origen: "es", destino: "en" }} onCambiar={onCambiar} instalados={INSTALADOS_EJEMPLO} />);
        
        const btnOrigen = screen.getByRole("combobox", { name: /de/i });
        expect(btnOrigen).toHaveClass("min-h-[44px]");
    });
});