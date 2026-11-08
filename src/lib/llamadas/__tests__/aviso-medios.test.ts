// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * MIC1108A · El aviso de un fallo de medios lleva «Abrir ajustes» cuando la app sabe abrirlos, y el
 * botón llama a `medios_abrir_ajustes` con el medio. Sin ajustes, un aviso normal.
 */

const h = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.error } }));

import { avisarFalloMedios, ETIQUETA_ABRIR_AJUSTES } from "@/lib/llamadas/aviso-medios";

const ventana = () => window as unknown as { __TAURI__?: unknown };

afterEach(() => {
    h.error.mockReset();
    delete ventana().__TAURI__;
});

describe("avisarFalloMedios", () => {
    it("sin ajustes: solo el motivo", () => {
        avisarFalloMedios("No encontramos ningún micrófono en este dispositivo.", null);
        expect(h.error).toHaveBeenCalledWith("No encontramos ningún micrófono en este dispositivo.");
    });

    it("con ajustes: «Abrir ajustes» abre los del sistema para ese medio", async () => {
        const invoke = vi.fn(async () => true);
        ventana().__TAURI__ = { core: { invoke } };
        avisarFalloMedios("macOS no deja a StarSeed usar el micrófono.", "microfono");
        const [motivo, opciones] = h.error.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
        expect(motivo).toMatch(/macOS no deja/);
        expect(opciones.action.label).toBe(ETIQUETA_ABRIR_AJUSTES);
        opciones.action.onClick();
        await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("medios_abrir_ajustes", { tipo: "microfono" }));
        expect(h.error).toHaveBeenCalledTimes(1);
    });

    it("si la app no puede abrirlos, lo dice", async () => {
        ventana().__TAURI__ = { core: { invoke: vi.fn(async () => Promise.reject("Este sistema no tiene una pantalla de ajustes que la app sepa abrir.")) } };
        avisarFalloMedios("x", "pantalla");
        const opciones = h.error.mock.calls[0][1] as { action: { onClick: () => void } };
        opciones.action.onClick();
        await vi.waitFor(() => expect(h.error).toHaveBeenCalledTimes(2));
        expect(h.error.mock.calls[1][0]).toMatch(/no tiene una pantalla de ajustes/);
    });
});
