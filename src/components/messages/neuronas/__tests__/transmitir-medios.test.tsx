// @vitest-environment jsdom
/**
 * GRP1107A · «Transmitir en vivo» de un chat de neurona: además de texto, voz, vídeo y pantalla por
 * canal de datos. La pantalla se pide en el mismo gesto; se ve la vía y el ritmo medido; «Terminar»
 * para la transmisión. Motores simulados.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversacionNeurona } from "@/lib/mensajeria/neuronas/agrupar";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/mensajeria/neuronas/archivos-neurona", () => ({ useArchivoVivo: () => null }));
vi.mock("@/lib/mensajeria/neuronas/llamadas-neurona", () => ({
    pedirPantalla: vi.fn(() => Promise.resolve(null)),
    llamarANeurona: vi.fn(),
    llamarEnChatMalla: vi.fn(),
}));
vi.mock("@/lib/mensajeria/neuronas/flujos-neurona", () => ({ useFlujoNeurona: () => null, abrirFlujoNeurona: vi.fn(), cerrarFlujoNeurona: vi.fn() }));

const h = vi.hoisted(() => {
    const oyentes = new Set<(e: unknown) => void>();
    const estado = { id: "f1", tipo: "video", activa: true, ritmo: {}, segmentos: 3, descartados: 0, via: "Tablet · 12 ms", texto: "≈ 300 kbps · tope medido 600 kbps · 3 segmentos" };
    const control = {
        id: "f1",
        estado: () => estado,
        suscribir: (cb: (e: unknown) => void) => {
            oyentes.add(cb);
            return () => oyentes.delete(cb);
        },
        parar: vi.fn(),
    };
    return { control, transmitir: vi.fn(async () => ({ ok: true, control })) };
});
vi.mock("@/lib/mensajeria/neuronas/transmision-medios", () => ({ transmitirMedios: h.transmitir, crearReproductorMedios: () => () => undefined }));

import { toast } from "sonner";
import * as llamadas from "@/lib/mensajeria/neuronas/llamadas-neurona";
import { PanelTransmitir } from "@/components/messages/neuronas/datos-hilo";

const conv: ConversacionNeurona = { clave: "c:ana", nombre: "Neurona de Ana", destino: { uid: "u-ana" }, detalle: "", propia: false, enLinea: true };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Transmitir en vivo: voz, vídeo y pantalla por canal de datos", () => {
    it("texto por defecto; se elige vídeo, empieza y enseña la vía y el ritmo; «Terminar» la para", async () => {
        const cerrar = vi.fn();
        render(<PanelTransmitir conversacion={conv} onCerrar={cerrar} />);
        expect(screen.getByTestId("panel-transmitir")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Vídeo/ }));
        expect(screen.getByTestId("transmitir-medios").textContent).toMatch(/canal de DATOS/);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Empezar a transmitir/ }));
        });
        await waitFor(() => expect(h.transmitir).toHaveBeenCalledWith(expect.objectContaining({ conversacion: conv, tipo: "video" })));
        expect(screen.getByRole("status").textContent).toBe("En vivo · Tablet · 12 ms · ≈ 300 kbps · tope medido 600 kbps · 3 segmentos");
        fireEvent.click(screen.getByRole("button", { name: /Terminar/ }));
        expect(h.control.parar).toHaveBeenCalled();
        expect(cerrar).toHaveBeenCalled();
    });

    it("pantalla: se pide en el mismo gesto; si no se puede, lo dice", async () => {
        h.transmitir.mockResolvedValueOnce({ ok: false, motivo: "No se eligió ninguna pantalla, ventana ni pestaña para compartir." } as never);
        render(<PanelTransmitir conversacion={conv} onCerrar={() => undefined} />);
        fireEvent.click(screen.getByRole("button", { name: /Pantalla/ }));
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Empezar a transmitir/ }));
        });
        expect(llamadas.pedirPantalla).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No se eligió ninguna pantalla, ventana ni pestaña para compartir."));
    });
});
