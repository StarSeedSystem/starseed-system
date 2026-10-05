import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AvisoAutocuracion } from "../aviso-autocuracion";
import { CLAVE_RECARGA, EVENTO } from "@/lib/mando/autocuracion-pagina";

afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
});

describe("AvisoAutocuracion", () => {
    it("dice que el Mando se desatascó solo y por qué", () => {
        render(<AvisoAutocuracion />);
        act(() => {
            window.dispatchEvent(new CustomEvent(EVENTO, { detail: { remedio: "reiniciar-guardia", porque: "40 lecturas fallidas seguidas" } }));
        });
        expect(screen.getByTestId("aviso-autocuracion").textContent).toContain("se ha desatascado solo");
        expect(screen.getByRole("status").textContent).toContain("40 lecturas fallidas");
    });

    it("tras una recarga automática reciente, explica por qué se recargó", () => {
        window.sessionStorage.setItem(CLAVE_RECARGA, JSON.stringify({ t: Date.now(), porque: "seguía atascada" }));
        render(<AvisoAutocuracion />);
        expect(screen.getByRole("status").textContent).toContain("se recargó solo");
    });

    it("sin nada que contar no pinta nada", () => {
        const { container } = render(<AvisoAutocuracion />);
        expect(container.textContent).toBe("");
    });
});
