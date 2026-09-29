import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "../pruebas/prueba-marco";

preparaDom();

const estado = vi.hoisted(() => ({ refrescos: 0, cercanas: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "yo" }));
vi.mock("@/components/mesh/signals-radar", () => ({ SignalsRadar: () => <div data-testid="radar-senales" /> }));
vi.mock("@/ai/astraura/mesh", () => ({
    useMeshState: () => ({ status: "idle", region: "EU_868", nodes: [], wifiHealth: { score: 0.9 }, self: undefined }),
    useNearbyBeacons: () => estado.cercanas,
    useDeliveryReceipts: () => [],
    describeBands: () => [
        { id: "lora", label: "Radio LoRa · malla P2P", kind: "radio", active: false, detail: "Sin radio conectado", metrics: [], quick: [] },
        { id: "server", label: "Servidor · nube pública", kind: "internet", active: true, detail: "Alcance global", metrics: [{ key: "Estado", value: "Red externa sana" }], quick: [] },
        { id: "relay", label: "Puente cifrado · relé", kind: "bridge", active: false, detail: "Sin clave", metrics: [], quick: [] },
        { id: "ble", label: "Bluetooth / BLE", kind: "bridge", active: false, detail: "Disponible", metrics: [], quick: [] },
    ],
    hasRelayKey: () => false,
    applyModemPreset: async () => true,
    recommendPreset: () => ({ presetKey: "LONG_FAST" }),
    getActiveModemPreset: () => "UNSET",
    refreshNearbyNow: () => { estado.refrescos += 1; },
    transmit: async () => ({}),
}));

import { InternetRadarWidget } from "../../internet-radar-widget";

afterEach(() => cleanup());

describe("Radar de Internet · datos de la malla por tamaño", () => {
    it("micro: el anillo de bandas con su resumen accesible", async () => {
        render(<EnMarco clase="micro"><InternetRadarWidget /></EnMarco>);
        expect(await screen.findByRole("link", { name: /1 de 4 bandas activas/ })).toHaveAttribute("href", "/red-mesh");
    });

    it("m: anillo + bandas, sin sondear por su cuenta", async () => {
        render(<EnMarco clase="m"><InternetRadarWidget /></EnMarco>);
        expect(await screen.findByRole("list", { name: "Bandas" })).toBeInTheDocument();
        expect(estado.refrescos).toBe(0);
    });

    it("l: radar de señales, vacío honesto de «Cerca» y búsqueda solo al pulsar", async () => {
        render(<EnMarco clase="l"><InternetRadarWidget /></EnMarco>);
        expect(await screen.findByTestId("radar-senales")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Cerca/ }));
        expect(screen.getByText("Ningún faro cercano por ahora.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Buscar ahora" }));
        expect(estado.refrescos).toBe(1);
    });

    it("panorámico: las bandas en mosaico", async () => {
        render(<EnMarco clase="panoramico"><InternetRadarWidget /></EnMarco>);
        expect(await screen.findByRole("list", { name: "Bandas y antenas" })).toBeInTheDocument();
    });
});
