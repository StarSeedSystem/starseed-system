// @vitest-environment jsdom
/**
 * Pestaña «Neuronas» (MSJ1107A): neuronas agrupadas por cerebro, envío con la pastilla de vía
 * medida y su detalle, y los ajustes de medio de cada chat. Neuronas, cerebros y enlaces simulados.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lo que no es de esta pantalla: el tema del diálogo y el nivel de movimiento.
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }),
}));
vi.mock("@/hooks/use-nivel-movimiento", () => ({ useNivelMovimiento: () => "minimo" }));
vi.mock("@/lib/neurons/neurons", () => ({
    thisDeviceId: () => "mac",
    listNeurons: async () => [
        { id: "mac", name: "Mac de Alex", kind: "laptop", online: true, isThisDevice: true, capabilities: {}, permissions: {} },
        { id: "tab", name: "Tablet Android", kind: "tablet", online: true, isThisDevice: false, capabilities: {}, permissions: {} },
        { id: "a1", name: "Servidor A1", kind: "server", online: false, isThisDevice: false, capabilities: {}, permissions: {} },
    ],
}));
vi.mock("@/lib/brains/brains", () => ({
    listarCerebros: async () => ({ ok: true, brains: [{ id: "c1", name: "Cerebro StarSeed", scope: "account", scope_ref: null, owner: "yo", servers: [] }] }),
}));
vi.mock("@/lib/cerebros/compartidos", () => ({ listarCerebrosCompartidos: async () => ({ ok: true, brains: [] }) }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "yo" }));
vi.mock("@/lib/sync/realtime-sync", () => ({ onAccountBroadcast: () => () => undefined, sendAccountBroadcast: async () => undefined }));
vi.mock("@/lib/mensajeria/medios/enviar", async (original) => ({
    ...(await original<typeof import("@/lib/mensajeria/medios/enviar")>()),
    candidatosMalla: vi.fn(async () => [
        { enlaceId: "cuenta:tab", medio: "wifi-local", etiqueta: "Tablet Android", abierto: true, llega: true, rttMs: 9, ruta: "misma-red-local" },
    ]),
    enviarPorPasoMalla: vi.fn(async () => ({
        ok: true,
        confirmado: true,
        detalle: "entregado y confirmado",
        via: {
            medio: "wifi-local",
            direccion: "sale",
            enlace: "Tablet Android",
            ruta: "misma-red-local",
            latenciaMs: 12,
            latenciaFuente: "acuse",
            confirmado: true,
            confirmadoPor: "destino",
        },
    })),
}));

import { PanelNeuronas } from "../panel-neuronas";

beforeEach(() => {
    localStorage.clear();
});
afterEach(() => cleanup());

describe("PanelNeuronas", () => {
    it("agrupa por cerebro, envía por el medio permitido y enseña por dónde viajó con lo medido", async () => {
        render(<PanelNeuronas esMovil={false} enfocado={false} onAlternarEnfoque={() => undefined} />);
        const lista = await screen.findByTestId("lista-neuronas");
        expect(await within(lista).findByText("Cerebro StarSeed")).toBeTruthy();
        expect(within(lista).getByText("Tablet Android")).toBeTruthy();
        expect(within(lista).getByText("Servidor A1")).toBeTruthy();
        // Esta neurona no sale como chat: se dice dónde estás.
        expect(within(lista).queryByText("Mac de Alex")).toBeNull();
        expect(screen.getByText(/Estás en «Mac de Alex»/)).toBeTruthy();

        // En escritorio se abre sola la primera (en línea primero).
        const caja = await screen.findByLabelText("Mensaje a Tablet Android");
        fireEvent.change(caja, { target: { value: "¿Me oyes sin internet?" } });
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

        const pastilla = await screen.findByRole("button", { name: /Por dónde viajó: Mesh · Wi-Fi local · 12 ms ✓/ });
        fireEvent.click(pastilla);
        expect(pastilla.getAttribute("aria-expanded")).toBe("true");
        // El título del detalle y la fila «Medio».
        expect(await screen.findAllByText("Wi-Fi local (P2P)")).toHaveLength(2);
        expect(screen.getByText("12 ms (ida y vuelta con acuse)")).toBeTruthy();
        expect(screen.getByText("El otro aparato confirmó la llegada")).toBeTruthy();
        expect(screen.getByText("Misma red local")).toBeTruthy();
    });

    it("cada chat abre sus ajustes de medio: «Automático» por defecto y «Solo métodos elegidos» configurable", async () => {
        render(<PanelNeuronas esMovil={false} enfocado={false} onAlternarEnfoque={() => undefined} />);
        fireEvent.click(await screen.findByRole("button", { name: /Medio de transmisión de este chat: Automático/ }));
        const interruptor = await screen.findByRole("switch", { name: "Usar los ajustes generales" });
        expect(interruptor.getAttribute("aria-checked")).toBe("true");
        fireEvent.click(interruptor);
        fireEvent.click(await screen.findByRole("radio", { name: "Solo métodos elegidos" }));
        // Todos los medios de una neurona quedan elegidos para empezar; se puede quitar uno.
        const lora = await screen.findByRole("checkbox", { name: /Radio LoRa \(Meshtastic\) \(elegido\)/ });
        fireEvent.click(lora);
        expect(screen.getByRole("checkbox", { name: "Radio LoRa (Meshtastic)" }).getAttribute("aria-checked")).toBe("false");
        const guardado = JSON.parse(localStorage.getItem("starseed.mensajeria.medios.v1") ?? "{}");
        expect(guardado.porChat["neurona:n:tab"]).toMatchObject({ modo: "elegidos", siNinguno: "esperar" });
        expect(guardado.porChat["neurona:n:tab"].elegidos).not.toContain("lora");
    });
});
