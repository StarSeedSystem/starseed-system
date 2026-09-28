// @vitest-environment jsdom
/**
 * AjustesHiloPanel (C2) escribe SIEMPRE a través de `useAjustesMensajeria()` (C7): apodo,
 * silencio, interruptores, etiquetas de correo y «volver a los ajustes generales».
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    cambiarHilo: vi.fn(),
    restablecerHilo: vi.fn(),
    hilos: {} as Record<string, Record<string, unknown>>,
}));

vi.mock("@/lib/mensajeria/ajustes-store", async () => {
    const { AJUSTES_DEFECTO } = await vi.importActual<typeof import("@/lib/mensajeria/ajustes-tipos")>("@/lib/mensajeria/ajustes-tipos");
    return {
        useAjustesMensajeria: () => {
            const ajustes = { ...AJUSTES_DEFECTO, hilos: api.hilos };
            const hilo = (api.hilos.h1 ?? {}) as { apodo?: string; confirmacionesLectura?: boolean; etiquetas?: string[] };
            return {
                listo: true,
                ajustes,
                cambiar: vi.fn(),
                cambiarHilo: api.cambiarHilo,
                restablecerHilo: api.restablecerHilo,
                restablecerTodo: vi.fn(),
                efectivos: () => ({
                    apariencia: AJUSTES_DEFECTO.chats.apariencia,
                    notificaciones: AJUSTES_DEFECTO.notificaciones.mensajes,
                    silenciado: false,
                    confirmacionesLectura: hilo.confirmacionesLectura ?? true,
                    vistaPreviaEnlaces: true,
                    cargarMultimedia: "siempre",
                    enviarConEnter: true,
                    fijado: false,
                    archivado: false,
                    restringido: false,
                    vaciadoEn: null,
                    apodo: hilo.apodo ?? null,
                }),
            };
        },
    };
});
vi.mock("@/lib/mensajeria/ajustes", () => ({
    OPCIONES_SILENCIO: [
        { id: "1h", etiqueta: "1 hora", hasta: (a: Date) => new Date(a.getTime() + 3_600_000).toISOString() },
        { id: "siempre", etiqueta: "Siempre", hasta: () => "siempre" },
    ],
    fondoCss: () => "transparent",
    tamanoLetraPx: () => 15,
}));
const confirmar = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmar, usePrompt: () => async () => null }));
vi.mock("@/lib/files/os-files", () => ({ uploadFile: vi.fn(async () => ({ ok: false, error: "sin red" })) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import { AjustesHiloPanel } from "@/components/messages/info/ajustes-hilo";

beforeEach(() => {
    api.hilos = {};
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("AjustesHiloPanel", () => {
    it("guarda el apodo del chat al salir del campo", () => {
        render(<AjustesHiloPanel hiloId="h1" tipo="dm" />);
        const campo = screen.getByLabelText("Apodo de este chat");
        fireEvent.change(campo, { target: { value: "  Mamá " } });
        fireEvent.blur(campo);
        expect(api.cambiarHilo).toHaveBeenCalledWith("h1", { apodo: "Mamá" });
    });

    it("apaga las confirmaciones de lectura solo para este chat", () => {
        render(<AjustesHiloPanel hiloId="h1" tipo="dm" />);
        fireEvent.click(screen.getByRole("switch", { name: "Confirmaciones de lectura" }));
        expect(api.cambiarHilo).toHaveBeenCalledWith("h1", { confirmacionesLectura: false });
    });

    it("silencia con una de las opciones y escribe la fecha en las notificaciones del hilo", () => {
        render(<AjustesHiloPanel hiloId="h1" tipo="grupo" />);
        fireEvent.click(screen.getByRole("radio", { name: "1 hora" }));
        const [id, cambios] = api.cambiarHilo.mock.calls.at(-1)!;
        expect(id).toBe("h1");
        const hasta = (cambios as { notificaciones: { silencioHasta: string } }).notificaciones.silencioHasta;
        expect(new Date(hasta).getTime()).toBeGreaterThan(Date.now());
    });

    it("marca lo heredado y deja de marcarlo cuando el chat tiene su propio valor", () => {
        const { unmount } = render(<AjustesHiloPanel hiloId="h1" tipo="dm" />);
        expect(screen.getAllByText(/hereda de los ajustes generales/).length).toBeGreaterThan(3);
        unmount();
        api.hilos = { h1: { apodo: "Mamá", confirmacionesLectura: false } };
        render(<AjustesHiloPanel hiloId="h1" tipo="dm" />);
        const fila = screen.getByText("Confirmaciones de lectura");
        expect(fila.textContent).not.toMatch(/hereda/);
        expect((screen.getByLabelText("Apodo de este chat") as HTMLInputElement).value).toBe("Mamá");
    });

    it("vuelve a los ajustes generales tras confirmar", async () => {
        render(<AjustesHiloPanel hiloId="h1" tipo="dm" />);
        fireEvent.click(screen.getByRole("button", { name: /Volver a los ajustes generales/ }));
        await waitFor(() => expect(api.restablecerHilo).toHaveBeenCalledWith("h1"));
        expect(confirmar).toHaveBeenCalled();
    });

    it("en un correo enseña etiquetas y no las opciones propias de los chats", () => {
        render(<AjustesHiloPanel hiloId="h1" tipo="correo" />);
        expect(screen.getByText("Etiquetas")).toBeTruthy();
        expect(screen.queryByText("Restringir")).toBeNull();
        expect(screen.queryByLabelText("Apodo de este chat")).toBeNull();
        expect(screen.queryByText("Color de mis burbujas")).toBeNull();
        expect(screen.getByText("Tamaño de letra")).toBeTruthy();
        const campo = screen.getByLabelText("Nueva etiqueta");
        fireEvent.change(campo, { target: { value: "Facturas" } });
        fireEvent.keyDown(campo, { key: "Enter" });
        expect(api.cambiarHilo).toHaveBeenCalledWith("h1", { etiquetas: ["Facturas"] });
    });
});
