/**
 * CON1010 (2026-10-10): el latido del puente de Hermione leía `neuron_devices` (50 filas con
 * capacidades) cada 20 s en cada pestaña, visible u oculta — 3.099 peticiones el 10-10, la ruta
 * más pesada del día. Con el código anterior estas pruebas fallan (30 lecturas propias en 10 min);
 * con el arreglo, la neurona se elige sobre la lista compartida y la pestaña oculta no late.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn((_tabla: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "eq"]) q[m] = () => q;
    (q as { then: unknown }).then = (r: (v: unknown) => void) => r({ data: [], error: null });
    return q;
});
const listNeurons = vi.fn(async () => [
    {
        id: "mac",
        name: "Mac",
        kind: "server",
        capabilities: { bridge: { mode: "external-hermes", endpoint: "http://localhost:8787/x" } },
        permissions: { agent: true },
        last_seen_at: new Date(Date.now() - 6 * 60_000).toISOString(),
        online: true,
        isThisDevice: false,
    },
]);

vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ from }) }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: () => listNeurons() }));
vi.mock("@/lib/realtime/realtime", () => ({ onTableChange: () => () => undefined }));

import {
    HERMIONE_LATIDO_MS,
    elegirNeuronaHermione,
    getHermioneNeuron,
    watchHermioneBridge,
} from "../hermione-bridge";

function visibilidad(estado: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado });
}

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-10T20:00:00Z") });
    from.mockClear();
    listNeurons.mockClear();
    visibilidad("visible");
});
afterEach(() => {
    vi.useRealTimers();
});

describe("puente de Hermione sin sondeo propio de neuron_devices", () => {
    it("diez minutos con la pestaña a la vista: cero lecturas propias de neuron_devices", async () => {
        const parar = watchHermioneBridge({ userId: "u1" });
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        const propias = from.mock.calls.filter(([t]) => t === "neuron_devices").length;
        expect(propias).toBe(0);
        // La lista compartida se consulta como mucho una vez por latido (y ella decide si sale a la red).
        expect(listNeurons.mock.calls.length).toBeLessThanOrEqual(Math.ceil((10 * 60_000) / HERMIONE_LATIDO_MS) + 1);
        parar();
    });

    it("con la pestaña oculta el latido no hace nada", async () => {
        const parar = watchHermioneBridge({ userId: "u1" });
        await vi.advanceTimersByTimeAsync(1_000);
        listNeurons.mockClear();
        visibilidad("hidden");
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(listNeurons).not.toHaveBeenCalled();
        expect(from).not.toHaveBeenCalled();
        parar();
    });

    it("getHermioneNeuron elige sobre la lista compartida (online por la ventana del registro, 12 min)", async () => {
        const n = await getHermioneNeuron();
        expect(n?.neuronId).toBe("mac");
        // Vista hace 6 min: con la ventana vieja de 3 min salía «offline» aunque el latido es cada 5.
        expect(n?.online).toBe(true);
        expect(from).not.toHaveBeenCalled();
    });

    it("elegirNeuronaHermione respeta el permiso de agente y prefiere la que está en línea", () => {
        const ahora = Date.parse("2026-10-10T20:00:00Z");
        const base = { capabilities: { hermesInstalled: true, bridgeEndpoint: "http://h/x" } };
        const filas = [
            { id: "vieja", ...base, last_seen_at: "2026-10-10T18:00:00Z" },
            { id: "vetada", ...base, permissions: { agent: false }, last_seen_at: "2026-10-10T19:59:00Z" },
            { id: "viva", ...base, last_seen_at: "2026-10-10T19:55:00Z" },
        ];
        expect(elegirNeuronaHermione(filas, ahora)?.neuronId).toBe("viva");
        expect(elegirNeuronaHermione([filas[0]], ahora)).toMatchObject({ neuronId: "vieja", online: false });
        expect(elegirNeuronaHermione([{ id: "sin", capabilities: {} }], ahora)).toBeNull();
    });
});
