// @vitest-environment jsdom
/**
 * Panel e indicador de capas de conciencia 1.58 (Ola 365 · CC4). El hook y el catálogo
 * van mockeados: aquí se prueba la interfaz, no la salud real de las capas.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { EstadoCapasVivo } from "@/lib/astraura/use-estado-capas";

const h = vi.hoisted(() => ({
    cambiar: vi.fn(),
    cambiarCapa: vi.fn(),
    activo: true,
    nivelador: 80,
}));

vi.mock("@/lib/astraura/use-estado-capas", () => ({
    useEstadoCapas: (): EstadoCapasVivo => {
        const activo = h.activo;
        return {
            preferencia: { activo, capas: { local: true, mesh: true, nube: true, colectiva: true }, nivelador: h.nivelador, especifico: null },
            salud: {},
            estados: activo
                ? { local: "sincronizada", mesh: "activa", nube: "sin-senal", colectiva: "sincronizada" }
                : { local: "apagada", mesh: "apagada", nube: "apagada", colectiva: "apagada" },
            resumen: activo
                ? { modo: "capas", encendidas: 4, sincronizadas: 2, etiqueta: "1.58 · 4/4 capas" }
                : { modo: "enrutador", encendidas: 0, sincronizadas: 0, etiqueta: "Enrutador libre" },
            cambiar: h.cambiar,
            cambiarCapa: h.cambiarCapa,
        };
    },
}));
vi.mock("@/ai/astraura/unified-intelligence", () => ({
    getUnifiedCatalog: () => [
        { id: "openrouter-free", label: "OpenRouter gratis", tier: "free-key", models: [{ id: "qwen/qwen3:free", label: "Qwen 3" }] },
        { id: "de-pago", label: "De pago", tier: "paid", models: [{ id: "caro", label: "Caro" }] },
    ],
}));

import { IndicadorCapas } from "@/components/astraura/capas/indicador-capas";
import { PanelCapas } from "@/components/astraura/capas/panel-capas";

beforeAll(() => {
    // Radix (slider/popper) mide con ResizeObserver, que jsdom no trae.
    globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

beforeEach(() => {
    h.cambiar.mockReset();
    h.cambiarCapa.mockReset();
    h.activo = true;
    h.nivelador = 80;
});

describe("IndicadorCapas", () => {
    it("muestra la etiqueta y un punto por capa", () => {
        render(<IndicadorCapas />);
        expect(screen.getByText("1.58 · 4/4 capas")).toBeTruthy();
        expect(screen.getByTestId("puntos-capas").children).toHaveLength(4);
    });

    it("al pulsarlo abre el panel de capas", () => {
        render(<IndicadorCapas />);
        expect(screen.queryByTestId("panel-capas")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Capas de conciencia de Astraura 1.58" }));
        expect(screen.getByTestId("panel-capas")).toBeTruthy();
    });

    it("con el maestro apagado dice «Enrutador libre»", () => {
        h.activo = false;
        render(<IndicadorCapas />);
        expect(screen.getByText("Enrutador libre")).toBeTruthy();
    });
});

describe("PanelCapas", () => {
    it("el interruptor maestro apaga el modo 1.58", () => {
        render(<PanelCapas />);
        fireEvent.click(screen.getByRole("switch", { name: "Modo Astraura 1.58" }));
        expect(h.cambiar).toHaveBeenCalledWith({ activo: false });
    });

    it("el interruptor de la capa Nube la apaga", () => {
        render(<PanelCapas />);
        fireEvent.click(screen.getByRole("switch", { name: "Capa Nube" }));
        expect(h.cambiarCapa).toHaveBeenCalledWith("nube", false);
    });

    it("con el maestro apagado las capas no se pueden tocar y explica el enrutador", () => {
        h.activo = false;
        render(<PanelCapas />);
        for (const nombre of ["Local", "Mesh", "Nube", "Colectiva"]) {
            expect((screen.getByRole("switch", { name: `Capa ${nombre}` }) as HTMLButtonElement).disabled).toBe(true);
        }
        expect(screen.getByText(/enrutador automático con las APIs y modelos gratuitos/)).toBeTruthy();
    });

    it("con el nivelador en 50 aparece el selector de modelo, solo con fuentes gratuitas", () => {
        h.nivelador = 50;
        render(<PanelCapas />);
        const selector = screen.getByRole("combobox", { name: "Modelo específico" });
        expect(screen.queryByText("Caro")).toBeNull();
        fireEvent.change(selector, { target: { value: "openrouter-free::qwen/qwen3:free" } });
        expect(h.cambiar).toHaveBeenCalledWith({ especifico: { fuente: "openrouter-free", modelo: "qwen/qwen3:free" } });
    });

    it("con el nivelador por defecto (80) resalta «Capas 1.58» y no enseña el selector", () => {
        render(<PanelCapas />);
        expect(screen.queryByRole("combobox", { name: "Modelo específico" })).toBeNull();
        expect(screen.getByText("Capas 1.58").getAttribute("data-activo")).toBe("true");
        expect(screen.getByText(/se unirá a Oracle próximamente/)).toBeTruthy();
    });
});
