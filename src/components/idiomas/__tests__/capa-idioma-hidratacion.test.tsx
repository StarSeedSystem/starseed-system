/** @vitest-environment jsdom */
/**
 * HAL1116A · La capa de idioma no reescribe el cuerpo hasta que el documento está hidratado.
 * Se simula `cuandoEsSeguroTraducir` para controlar el instante exacto de la espera: mientras
 * la promesa no resuelve, el texto español debe seguir intacto; si el componente se desmonta
 * durante la espera no se aplica nada; y una elección hecha durante la espera no se pierde.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
    pendientes: [] as Array<() => void>,
    llamadas: 0,
}));

vi.mock("@/lib/idiomas/hidratacion", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/idiomas/hidratacion")>();
    return {
        ...real,
        cuandoEsSeguroTraducir: (): Promise<void> => {
            control.llamadas += 1;
            return new Promise<void>((resolver) => { control.pendientes.push(resolver); });
        },
    };
});

import { CapaIdioma } from "../capa-idioma";
import { CLAVE_IDIOMA_NEURONA, elegirIdioma } from "@/lib/idiomas/estado";

function textoDelCuerpo(): string | null | undefined {
    return document.getElementById("texto-prueba")?.textContent;
}

async function asentar(veces = 12): Promise<void> {
    for (let i = 0; i < veces; i += 1) {
        await act(async () => { await Promise.resolve(); });
    }
}

async function resolverEspera(): Promise<void> {
    const pendientes = control.pendientes.splice(0);
    await act(async () => { for (const resolver of pendientes) resolver(); });
    await asentar();
}

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    control.pendientes = [];
    control.llamadas = 0;
    document.body.innerHTML = '<p id="texto-prueba">Guardar</p>';
    localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));
});

afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.useRealTimers();
});

describe("capa de idioma · espera a la hidratación", () => {
    it("con idioma guardado `en` el texto sigue en español hasta que la promesa resuelve", async () => {
        render(<CapaIdioma />);
        await asentar();

        expect(control.llamadas).toBe(1);
        expect(textoDelCuerpo()).toBe("Guardar");

        await resolverEspera();
        expect(textoDelCuerpo()).toBe("Save");
    });

    it("si el componente se desmonta durante la espera no se aplica nada", async () => {
        const { unmount } = render(<CapaIdioma />);
        await asentar();

        unmount();
        await resolverEspera();

        expect(textoDelCuerpo()).toBe("Guardar");
        expect(document.documentElement.getAttribute("lang")).not.toBe("en");
    });

    it("un cambio de idioma durante la espera aplica el último", async () => {
        render(<CapaIdioma />);
        await asentar();
        expect(textoDelCuerpo()).toBe("Guardar");

        act(() => { elegirIdioma("fr"); });
        await asentar();

        expect(textoDelCuerpo()).toBe("Guardar");
        expect(control.llamadas).toBe(1);

        await resolverEspera();
        expect(textoDelCuerpo()).toBe("Enregistrer");
    });
});
