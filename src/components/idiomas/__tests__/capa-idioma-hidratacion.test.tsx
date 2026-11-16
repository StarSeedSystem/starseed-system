import { render, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CapaIdioma } from "@/components/idiomas/capa-idioma";

vi.mock("@/lib/idiomas/hidratacion", () => {
    const original = vi.importActual("@/lib/idiomas/hidratacion");
    return {
        ...original,
        cuandoEsSeguroTraducir: () => new Promise<void>(res => setTimeout(res, 100)),
    };
});

const idiomaEfectivoMock = vi.fn();
idiomaEfectivoMock
    .mockReturnValueOnce({ codigo: "es" })
    .mockReturnValueOnce({ codigo: "en" });

vi.mock("@/lib/idiomas/estado", () => {
    const original = vi.importActual("@/lib/idiomas/estado");
    return {
        ...original,
        idiomaEfectivo: idiomaEfectivoMock,
        CLAVE_IDIOMA_NEURONA: "CLAVE_IDIOMA_NEURONA",
        EVENTO_IDIOMA: "starseed:idioma",
    };
});

beforeEach(() => cleanup());

describe("CapaIdioma hydration", () => {
    it("applies language after safe wait and updates if language changes during wait", async () => {
        vi.useFakeTimers();
        const { unmount } = render(
            <div>
                <CapaIdioma />
                <p id="msg">Hola</p>
            </div>,
        );
        vi.advanceTimersByTime(200);
        await Promise.resolve();
        expect(document.documentElement.lang).toBe("en");
        unmount();
    });

    it("does nothing if component unmounted before safe wait resolves", async () => {
        vi.useFakeTimers();
        const { unmount } = render(
            <div>
                <CapaIdioma />
                <p id="msg">Hola</p>
            </div>,
        );
        unmount();
        vi.advanceTimersByTime(200);
        await Promise.resolve();
        expect(document.documentElement.lang).not.toBe("en");
    });
});
