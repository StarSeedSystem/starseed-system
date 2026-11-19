/** @vitest-environment jsdom */
/**
 * HAL1116A · `CapaIdioma` no reescribe el texto hasta que el documento está hidratado.
 * La espera de HAL04 se simula con una promesa que la prueba resuelve a mano: así se comprueba
 * qué pasa antes, durante y después, sin depender de `requestIdleCallback` ni del reloj real.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { esperas } = vi.hoisted(() => ({ esperas: [] as Array<() => void> }));

vi.mock("@/lib/idiomas/hidratacion", () => ({
    cuandoEsSeguroTraducir: () => new Promise<void>((resolver) => { esperas.push(resolver); }),
    entornoDelNavegador: () => ({ readyState: () => "complete", alCargar: () => () => {}, esperarReposo: () => () => {} }),
}));

import { CapaIdioma } from "../capa-idioma";
import { CLAVE_IDIOMA_NEURONA, EVENTO_IDIOMA } from "@/lib/idiomas/estado";

const marca = (): HTMLElement => {
    const el = document.getElementById("marca");
    if (!el) throw new Error("falta la marca de la prueba");
    return el;
};

const guardar = (codigo: string): void => {
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo }));
};

beforeEach(() => {
    localStorage.clear();
    esperas.length = 0;
    document.body.innerHTML = '<p id="marca">Guardar</p>';
    document.documentElement.setAttribute("lang", "es");
    vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.innerHTML = "";
});

describe("CapaIdioma · hidratación", () => {
    it("con `en` guardado el texto sigue en español hasta que la espera resuelve", async () => {
        guardar("en");
        render(<CapaIdioma />);
        await act(async () => {});

        expect(esperas.length).toBeGreaterThan(0);
        expect(marca().textContent).toBe("Guardar");

        await act(async () => { esperas[0](); });
        expect(marca().textContent).toBe("Save");
    });

    it("si el componente se desmonta durante la espera no se aplica nada", async () => {
        guardar("en");
        const { unmount } = render(<CapaIdioma />);
        await act(async () => {});

        expect(esperas.length).toBeGreaterThan(0);
        unmount();

        await act(async () => { esperas[0](); });
        expect(marca().textContent).toBe("Guardar");
        expect(document.documentElement.getAttribute("lang")).toBe("es");
    });

    it("una elección durante la espera aplica la última", async () => {
        guardar("en");
        render(<CapaIdioma />);
        await act(async () => {});

        guardar("fr");
        await act(async () => {
            window.dispatchEvent(new CustomEvent(EVENTO_IDIOMA, { detail: { codigo: "fr" } }));
        });
        expect(esperas.length).toBeGreaterThanOrEqual(2);

        await act(async () => { for (const resolver of [...esperas]) resolver(); });
        expect(marca().textContent).toBe("Enregistrer");
    });
});
