/** @vitest-environment jsdom */
/**
 * HAL1116A · La capa de idioma espera a que el documento esté hidratado antes de reescribir el
 * texto por PRIMERA vez; una elección nueva durante la espera no se pierde.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapaIdioma } from "../capa-idioma";
import { cargarCatalogo, _limpiarCache } from "@/lib/idiomas/catalogos/cargar";
import { CLAVE_IDIOMA_NEURONA, EVENTO_IDIOMA } from "@/lib/idiomas/estado";

const { espera } = vi.hoisted(() => ({ espera: vi.fn() }));

vi.mock("@/lib/idiomas/hidratacion", () => ({
    cuandoEsSeguroTraducir: espera,
    entornoDelNavegador: () => ({}),
}));

function diferida(): { promesa: Promise<void>; resolver: () => void } {
    let resolver: () => void = () => {};
    const promesa = new Promise<void>((r) => { resolver = () => r(); });
    return { promesa, resolver };
}

async function asentar(): Promise<void> {
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
}

function guardar(codigo: string): void {
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo }));
}

beforeEach(async () => {
    _limpiarCache();
    await cargarCatalogo("en");
    await cargarCatalogo("pt");
    localStorage.clear();
    document.body.innerHTML = "";
    document.documentElement.setAttribute("lang", "es");
    document.documentElement.removeAttribute("dir");
    espera.mockReset();
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    _limpiarCache();
    document.body.innerHTML = "";
});

describe("capa de idioma · hidratación", () => {
    it("con idioma guardado espera a la hidratación y solo entonces traduce el cuerpo", async () => {
        guardar("en");
        document.body.innerHTML = "<p>Guardar</p>";
        const { promesa, resolver } = diferida();
        espera.mockReturnValue(promesa);

        render(<CapaIdioma />);
        await asentar();
        expect(document.body.textContent).toContain("Guardar");
        expect(document.documentElement.getAttribute("lang")).not.toBe("en");

        await act(async () => { resolver(); });
        await asentar();
        expect(document.body.textContent).toContain("Save");
        expect(document.documentElement.getAttribute("lang")).toBe("en");
    });

    it("si se desmonta durante la espera no aplica nada", async () => {
        guardar("en");
        document.body.innerHTML = "<p>Guardar</p>";
        const { promesa, resolver } = diferida();
        espera.mockReturnValue(promesa);

        const { unmount } = render(<CapaIdioma />);
        unmount();
        await act(async () => { resolver(); });
        await asentar();
        expect(document.body.textContent).toContain("Guardar");
        expect(document.body.textContent).not.toContain("Save");
        expect(document.documentElement.getAttribute("lang")).toBe("es");
    });

    it("un cambio de idioma durante la espera aplica el último elegido", async () => {
        guardar("en");
        document.body.innerHTML = "<p>Guardar</p>";
        const { promesa, resolver } = diferida();
        espera.mockReturnValue(promesa);

        render(<CapaIdioma />);
        act(() => {
            guardar("pt");
            window.dispatchEvent(new CustomEvent(EVENTO_IDIOMA));
        });
        await asentar();
        expect(document.body.textContent).toContain("Guardar");

        await act(async () => { resolver(); });
        await asentar();
        expect(document.body.textContent).toContain("Salvar");
        expect(document.documentElement.getAttribute("lang")).toBe("pt");
    });
});
