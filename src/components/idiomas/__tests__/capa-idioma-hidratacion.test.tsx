/** @vitest-environment jsdom */
/**
 * HAL1116A · La capa de idioma espera a que el documento esté hidratado antes de traducir por
 * primera vez; una elección nueva durante la espera no se pierde y un desmontaje no aplica nada.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapaIdioma } from "../capa-idioma";
import { CLAVE_IDIOMA_NEURONA, EVENTO_IDIOMA } from "@/lib/idiomas/estado";

const hidratacion = vi.hoisted(() => ({
    llamadas: 0,
    resolver: null as null | (() => void),
}));

vi.mock("@/lib/idiomas/hidratacion", () => ({
    entornoDelNavegador: () => ({
        readyState: () => "complete",
        alCargar: (f: () => void) => { f(); return () => {}; },
        esperarReposo: (f: () => void) => { f(); return () => {}; },
    }),
    cuandoEsSeguroTraducir: () => {
        hidratacion.llamadas += 1;
        return new Promise<void>((resolver) => { hidratacion.resolver = () => resolver(); });
    },
}));

vi.mock("@/lib/idiomas/catalogos/cargar", async () => {
    const { crearCatalogo } = await import("@/lib/idiomas/catalogo");
    const catalogos: Record<string, Record<string, string>> = {
        en: { Guardar: "Save", Idioma: "Language", Inicio: "Home" },
        fr: { Guardar: "Enregistrer", Idioma: "Langue", Inicio: "Météo et rappels" },
    };
    return {
        cargarCatalogo: async (codigo: string) => {
            const entradas = catalogos[codigo];
            return entradas ? crearCatalogo({ codigo, revisado: true, entradas }) : null;
        },
    };
});

const guardarIdioma = (codigo: string): void => {
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo }));
};

const resolverHidratacion = async (): Promise<void> => {
    hidratacion.resolver?.();
    await act(async () => {
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
};

beforeEach(() => {
    localStorage.clear();
    hidratacion.llamadas = 0;
    hidratacion.resolver = null;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    document.body.textContent = "Guardar";
    document.documentElement.setAttribute("lang", "es");
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.textContent = "";
    document.documentElement.removeAttribute("dir");
});

describe("CapaIdioma · hidratación", () => {
    it("espera a la hidratación antes de traducir por primera vez", async () => {
        guardarIdioma("en");
        render(<CapaIdioma />);
        await act(async () => { await Promise.resolve(); });

        expect(document.body.textContent).toBe("Guardar");
        expect(document.documentElement.getAttribute("lang")).toBe("es");
        expect(hidratacion.llamadas).toBe(1);

        await resolverHidratacion();

        expect(document.body.textContent).toBe("Save");
        expect(document.documentElement.getAttribute("lang")).toBe("en");
    });

    it("no aplica nada si el componente se desmonta durante la espera", async () => {
        guardarIdioma("en");
        const { unmount } = render(<CapaIdioma />);
        await act(async () => { await Promise.resolve(); });
        unmount();

        await resolverHidratacion();

        expect(document.body.textContent).toBe("Guardar");
        expect(document.documentElement.getAttribute("lang")).toBe("es");
    });

    it("un cambio de idioma durante la espera aplica el último", async () => {
        guardarIdioma("en");
        render(<CapaIdioma />);
        await act(async () => { await Promise.resolve(); });

        guardarIdioma("fr");
        act(() => {
            window.dispatchEvent(new CustomEvent(EVENTO_IDIOMA, { detail: { codigo: "fr" } }));
        });

        await resolverHidratacion();

        expect(document.body.textContent).toBe("Enregistrer");
        expect(document.documentElement.getAttribute("lang")).toBe("fr");
    });
});
