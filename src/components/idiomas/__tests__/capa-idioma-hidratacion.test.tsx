import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { CapaIdioma } from "../capa-idioma";

vi.mock("@/lib/idiomas/hidratacion", () => ({
    cuandoEsSeguroTraducir: vi.fn(),
    entornoDelNavegador: vi.fn(),
}));

vi.mock("@/lib/idiomas/estado", () => ({
    idiomaEfectivo: vi.fn(),
    EVENTO_IDIOMA: "starseed:idioma",
    CLAVE_IDIOMA_NEURONA: "starseed.idioma.neurona",
}));

vi.mock("@/lib/idiomas/capa", () => ({
    iniciarCapa: vi.fn(),
    fijarDocumento: vi.fn(),
    CapaActiva: {} as any,
}));

vi.mock("@/lib/idiomas/catalogos/cargar", () => ({
    cargarCatalogo: vi.fn(),
}));

vi.mock("@/lib/idiomas/idiomas", () => ({
    IDIOMA_FUENTE: "es",
}));

import { cuandoEsSeguroTraducir } from "@/lib/idiomas/hidratacion";
import { idiomaEfectivo } from "@/lib/idiomas/estado";
import { iniciarCapa, fijarDocumento } from "@/lib/idiomas/capa";
import { cargarCatalogo } from "@/lib/idiomas/catalogos/cargar";

describe("CapaIdioma · hidratación", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        (idiomaEfectivo as any).mockReturnValue({ codigo: "es" });
        (cargarCatalogo as any).mockResolvedValue({ hola: "Hello" });
        (iniciarCapa as any).mockReturnValue({ cambiar: vi.fn(), parar: vi.fn() });
        (fijarDocumento as any).mockImplementation(() => {});
        (cuandoEsSeguroTraducir as any).mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("mantiene el texto en español hasta que la promesa de hidratación resuelve y entonces cambia a inglés", async () => {
        let resolveHidratacion: () => void;
        const promesaHidratacion = new Promise<void>((resolve) => {
            resolveHidratacion = resolve;
        });
        (cuandoEsSeguroTraducir as any).mockReturnValue(promesaHidratacion);
        (idiomaEfectivo as any).mockReturnValue({ codigo: "en" });

        render(<CapaIdioma />);

        expect(iniciarCapa).not.toHaveBeenCalled();

        await act(async () => {
            resolveHidratacion!();
            await vi.runAllTimersAsync();
        });

        expect(iniciarCapa).toHaveBeenCalled();
        const [, , aplicado] = (iniciarCapa as any).mock.calls[0];
        expect(aplicado).toBe("en");
    });

    it("no aplica nada si el componente se desmonta durante la espera", async () => {
        let resolveHidratacion: () => void;
        const promesaHidratacion = new Promise<void>((resolve) => {
            resolveHidratacion = resolve;
        });
        (cuandoEsSeguroTraducir as any).mockReturnValue(promesaHidratacion);
        (idiomaEfectivo as any).mockReturnValue({ codigo: "en" });

        const { unmount } = render(<CapaIdioma />);

        unmount();

        await act(async () => {
            resolveHidratacion!();
            await vi.runAllTimersAsync();
        });

        expect(iniciarCapa).not.toHaveBeenCalled();
    });

    it("aplica el último idioma si hay un cambio durante la espera", async () => {
        let resolveHidratacion: () => void;
        const promesaHidratacion = new Promise<void>((resolve) => {
            resolveHidratacion = resolve;
        });
        (cuandoEsSeguroTraducir as any).mockReturnValue(promesaHidratacion);
        (idiomaEfectivo as any).mockReturnValue({ codigo: "fr" });

        render(<CapaIdioma />);

        window.dispatchEvent(new Event("starseed:idioma"));

        await act(async () => {
            resolveHidratacion!();
            await vi.runAllTimersAsync();
        });

        expect(iniciarCapa).toHaveBeenCalled();
        const [, , aplicado] = (iniciarCapa as any).mock.calls[0];
        expect(aplicado).toBe("fr");
    });
});