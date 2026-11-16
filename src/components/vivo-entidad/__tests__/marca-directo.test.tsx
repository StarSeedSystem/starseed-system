import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { MarcaDirecto } from "../marca-directo";

beforeAll(() => {
    window.matchMedia ??= ((q: string) => ({
        matches: false,
        media: q,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        onchange: null,
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

describe("MarcaDirecto", () => {
    test("directo true muestra punto rojo y EN VIVO con contador", () => {
        render(<MarcaDirecto directo={true} personas={3} />);
        const marca = screen.getByRole("status");
        expect(marca).toBeInTheDocument();
        expect(marca).toHaveTextContent(/EN VIVO · 3/);
        expect(marca).toHaveAttribute("aria-label", "En directo, 3 personas");
        expect(marca).toHaveAttribute("title", "En directo, 3 personas");
        const punto = marca.querySelector('[data-punto="vivo"]');
        expect(punto).toBeInTheDocument();
        expect(punto!.className).toMatch(/punto/);
    });

    test("directo false sin personas no muestra nada", () => {
        render(<MarcaDirecto directo={false} personas={null} />);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    test("directo false con personas no muestra nada", () => {
        render(<MarcaDirecto directo={false} personas={5} />);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    test("directo null muestra punto gris y sin datos, nunca EN VIVO", () => {
        render(<MarcaDirecto directo={null} personas={null} />);
        const marca = screen.getByRole("status");
        expect(marca).toBeInTheDocument();
        expect(marca).toHaveTextContent(/sin datos/i);
        expect(marca).not.toHaveTextContent(/EN VIVO/i);
        expect(marca).toHaveAttribute("aria-label", "Sin datos de directo");
        expect(marca).toHaveAttribute("title", "Sin datos de directo");
        const punto = marca.querySelector('[data-punto="desconocido"]');
        expect(punto).toBeInTheDocument();
        expect(punto!.className).toMatch(/punto/);
    });

    test("directo null con personas sigue mostrando sin datos", () => {
        render(<MarcaDirecto directo={null} personas={7} />);
        const marca = screen.getByRole("status");
        expect(marca).toHaveTextContent(/sin datos/i);
        expect(marca).not.toHaveTextContent(/EN VIVO/i);
    });

    test("compacto true reduce el tamaño", () => {
        render(<MarcaDirecto directo={true} personas={2} compacto />);
        const marca = screen.getByRole("status");
        expect(marca.className).toMatch(/compacto/);
    });

    test("respeta prefers-reduced-motion sin animaciones", () => {
        const originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockReturnValue({
            matches: true,
            media: "(prefers-reduced-motion: reduce)",
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            onchange: null,
            dispatchEvent: vi.fn(),
        });

        render(<MarcaDirecto directo={true} personas={1} />);
        const marca = screen.getByRole("status");
        expect(marca.className).toMatch(/sinAnimacion/);

        window.matchMedia = originalMatchMedia;
    });
});