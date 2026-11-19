/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapaIdioma } from "../capa-idioma";
import { CLAVE_IDIOMA_NEURONA, elegirIdioma } from "@/lib/idiomas/estado";

const espera = vi.hoisted(() => {
    let resolver: (() => void) | null = null;
    let llamadas = 0;
    return {
        cuandoEsSeguroTraducir: () => {
            llamadas++;
            return new Promise<void>((r) => { resolver = () => r(); });
        },
        resolver: () => { const r = resolver; resolver = null; r?.(); },
        llamadas: () => llamadas,
        reiniciar: () => { resolver = null; llamadas = 0; },
    };
});

vi.mock("@/lib/idiomas/hidratacion", () => ({
    cuandoEsSeguroTraducir: espera.cuandoEsSeguroTraducir,
    entornoDelNavegador: () => ({
        readyState: () => "complete",
        alCargar: () => () => {},
        esperarReposo: () => () => {},
    }),
}));

const elegir = (codigo: string): void => {
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo }));
};

const ponerBoton = (): HTMLButtonElement => {
    document.body.innerHTML = "<button>Guardar</button>";
    return document.body.querySelector("button")!;
};

beforeEach(() => {
    cleanup();
    espera.reiniciar();
    localStorage.clear();
    document.body.innerHTML = "";
    document.documentElement.setAttribute("lang", "es");
    document.documentElement.setAttribute("dir", "ltr");
    vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("CapaIdioma · espera a la hidratación", () => {
    it("con idioma guardado el texto sigue en español hasta que la espera resuelve", async () => {
        elegir("en");
        const boton = ponerBoton();

        render(<CapaIdioma />);

        expect(espera.llamadas()).toBe(1);
        expect(boton.textContent).toBe("Guardar");

        await act(async () => { espera.resolver(); });
        await waitFor(() => expect(boton.textContent).toBe("Save"));
    });

    it("si se desmonta durante la espera no se aplica nada", async () => {
        elegir("en");
        const boton = ponerBoton();

        const { unmount } = render(<CapaIdioma />);
        expect(espera.llamadas()).toBe(1);

        unmount();
        await act(async () => { espera.resolver(); });

        expect(boton.textContent).toBe("Guardar");
        expect(document.documentElement.lang).toBe("es");
    });

    it("una elección durante la espera no la reinicia y aplica la última", async () => {
        elegir("en");
        const boton = ponerBoton();

        render(<CapaIdioma />);
        expect(espera.llamadas()).toBe(1);

        act(() => { elegirIdioma("fr"); });
        expect(espera.llamadas()).toBe(1);
        expect(boton.textContent).toBe("Guardar");

        await act(async () => { espera.resolver(); });
        await waitFor(() => expect(boton.textContent).toBe("Enregistrer"));
    });
});
