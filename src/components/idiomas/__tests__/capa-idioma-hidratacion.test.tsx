/** @vitest-environment jsdom */
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { CapaIdioma } from "../capa-idioma";
import { CLAVE_IDIOMA_NEURONA, EVENTO_IDIOMA } from "@/lib/idiomas/estado";
import { IDIOMA_FUENTE } from "@/lib/idiomas/idiomas";
import { crearCatalogo, type Catalogo } from "@/lib/idiomas/catalogo";

const TEXTO_ES = "Hola, soy una fuente.";
const TEXTO_EN = "Hello, I'm a font.";
const TEXTO_FR = "Bonjour, je suis une police.";

const catEn = crearCatalogo({ codigo: "en", revisado: false, entradas: { [TEXTO_ES]: TEXTO_EN } });
const catFr = crearCatalogo({ codigo: "fr", revisado: false, entradas: { [TEXTO_ES]: TEXTO_FR } });

vi.mock("@/lib/idiomas/catalogos/cargar", () => ({
    cargarCatalogo: vi.fn(async (codigo: string) => {
        if (codigo === "en") return catEn;
        if (codigo === "fr") return catFr;
        return null;
    }),
}));

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `<div>${TEXTO_ES}</div>`;
    document.documentElement.setAttribute("lang", IDIOMA_FUENTE);
    document.documentElement.setAttribute("dir", "ltr");
    document.documentElement.removeAttribute("data-idioma-pendiente");
    vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("CapaIdioma – hidratación", () => {
    it("el texto del cuerpo sigue en español hasta que la promesa resuelve y entonces cambia", async () => {
        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));

        const { unmount } = render(<CapaIdioma />);

        expect(document.body.textContent).toBe(TEXTO_ES);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1600);
        });

        expect(document.body.textContent).toBe(TEXTO_EN);
        expect(document.documentElement.getAttribute("lang")).toBe("en");

        unmount();
    });

    it("si el componente se desmonta durante la espera no se aplica nada", async () => {
        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));

        const { unmount } = render(<CapaIdioma />);

        unmount();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1600);
        });

        expect(document.body.textContent).toBe(TEXTO_ES);
        expect(document.documentElement.getAttribute("lang")).toBe(IDIOMA_FUENTE);
    });

    it("un cambio de idioma durante la espera aplica el último", async () => {
        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "en" }));

        const { unmount } = render(<CapaIdioma />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });

        localStorage.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: "fr" }));
        window.dispatchEvent(new CustomEvent(EVENTO_IDIOMA, { detail: { codigo: "fr" } }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1600);
        });

        expect(document.body.textContent).toBe(TEXTO_FR);
        expect(document.documentElement.getAttribute("lang")).toBe("fr");

        unmount();
    });
});