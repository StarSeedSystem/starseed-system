/**
 * «Neurona nueva» → «¿Es esta una neurona que ya configuraste?» (2026-09-29).
 * Si la cuenta ya tiene otras neuronas, lo primero es preguntar; «Es otra neurona» sigue con el
 * asistente de siempre y «Usar su configuración» adopta esa neurona y recarga.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const est = vi.hoisted(() => ({
    neuronas: [] as Array<Record<string, unknown>>,
    fallaLista: false,
    borrados: [] as string[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }),
}));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: () => ({ delete: () => ({ eq: async (_c: string, id: string) => (est.borrados.push(id), { error: null }) }) }),
    }),
}));
vi.mock("@/lib/neurons/neurons", () => ({
    NEURON_PREFS_KEY: "starseed.neurons.prefs.v1",
    thisDeviceId: () => "neurona-propia-nueva",
    listNeurons: async () => {
        if (est.fallaLista) throw new Error("sin red");
        return est.neuronas;
    },
    permissionsFor: () => ({ compute: true, storage: true, sync: true, agent: true, senses: true, wake: true }),
    settingsFor: () => ({}),
    setPermission: vi.fn(),
    setNeuronSettings: vi.fn(),
    setNeuronName: vi.fn(),
}));
vi.mock("@/lib/brains/brains", () => ({ listBrains: async () => [] }));
vi.mock("@/lib/onboarding/onboarding", () => ({ saveOnboarding: async () => null }));
vi.mock("@/lib/onboarding/neuron-recommend", () => ({
    detectar: async () => ({ so: "macOS", arch: "arm", nucleos: 8, ramGB: 8 }),
    recomendar: () => ({ modelo: "bitnet-2b", conciencia: "semilla", razones: ["Este equipo mueve bien el modelo local."] }),
}));
vi.mock("@/lib/perf/fondo-vivo", () => ({ guardarPreferenciaFondo: vi.fn() }));
vi.mock("@/components/inicio/preferencias-arranque", () => ({ PreferenciasArranque: () => null }));
vi.mock("../agent-recommendation", () => ({ default: () => null }));

import { NeuronSetup } from "../neuron-setup";

const ahora = Date.now();
const iso = (haceMin: number) => new Date(ahora - haceMin * 60_000).toISOString();

function montar(extra: Partial<React.ComponentProps<typeof NeuronSetup>> = {}) {
    const onClose = vi.fn();
    const onPosponer = vi.fn();
    const recargar = vi.fn();
    render(<NeuronSetup onClose={onClose} onPosponer={onPosponer} recargar={recargar} {...extra} />);
    return { onClose, onPosponer, recargar };
}

beforeEach(() => {
    est.neuronas = [];
    est.fallaLista = false;
    est.borrados = [];
    window.localStorage.clear();
    window.localStorage.setItem("starseed.neuron.device-id", "neurona-propia-nueva");
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (q: string) => ({
            matches: q.includes("reduced-motion"),
            media: q,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
        }),
    });
});

afterEach(() => cleanup());

const PROPIA = { id: "neurona-propia-nueva", name: "Neurona macOS", isThisDevice: true, created_at: new Date().toISOString(), last_seen_at: iso(0), capabilities: {} };
const MAC = { id: "neurona-mac-de-alex", name: "Mac de Alex", last_seen_at: iso(45), capabilities: { platform: "macOS", browser: "Chrome" } };
const MOVIL = { id: "neurona-movil-de-alex", name: "Móvil de Alex", last_seen_at: iso(60 * 30), capabilities: { platform: "Android" } };

describe("NeuronSetup · adopción de una neurona conocida", () => {
    it("sin otras neuronas en la cuenta va directo al asistente de siempre", async () => {
        est.neuronas = [PROPIA];
        montar();
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
        expect(screen.queryByTestId("adoptar-neurona")).toBeNull();
    });

    it("con otras neuronas pregunta primero «¿Es esta una neurona que ya configuraste?» y las lista", async () => {
        est.neuronas = [PROPIA, MOVIL, MAC];
        montar();
        await screen.findByRole("heading", { name: "¿Es esta una neurona que ya configuraste?" });
        const lista = screen.getByRole("list", { name: "Neuronas de tu cuenta" });
        const filas = Array.from(lista.querySelectorAll("li")).map((li) => li.textContent ?? "");
        expect(filas).toHaveLength(2); // nunca ofrece a este mismo dispositivo
        expect(filas[0]).toContain("Mac de Alex"); // la vista más recientemente, primero
        expect(filas[0]).toContain("macOS · Chrome");
        expect(filas[0]).toContain("visto hace 45 min");
        expect(filas[1]).toContain("Móvil de Alex");
        expect(filas[1]).toContain("Android");
        expect(filas[1]).toContain("visto hace 1 día");
        expect(screen.getAllByRole("button", { name: /Usar la configuración de/ })).toHaveLength(2);
    });

    it("«Es otra neurona» sigue con el asistente normal", async () => {
        est.neuronas = [PROPIA, MAC];
        const { recargar } = montar();
        await screen.findByRole("heading", { name: "¿Es esta una neurona que ya configuraste?" });
        fireEvent.click(screen.getByRole("button", { name: "Es otra neurona" }));
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
        expect(recargar).not.toHaveBeenCalled();
        expect(window.localStorage.getItem("starseed.neuron.device-id")).toBe("neurona-propia-nueva");
    });

    it("«Usar su configuración» adopta esa neurona, la deja configurada, limpia la fila duplicada y recarga", async () => {
        est.neuronas = [PROPIA, MAC];
        const { recargar } = montar();
        await screen.findByRole("heading", { name: "¿Es esta una neurona que ya configuraste?" });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Usar la configuración de Mac de Alex" }));
        });
        await waitFor(() => expect(recargar).toHaveBeenCalledTimes(1));
        expect(window.localStorage.getItem("starseed.neuron.device-id")).toBe("neurona-mac-de-alex");
        expect(window.localStorage.getItem("starseed.neuron.setup.v1")).toBe("1");
        expect(est.borrados).toEqual(["neurona-propia-nueva"]); // nació ahora y sin nada suyo
        // El alias por origen queda escrito.
        const alias = JSON.parse(window.localStorage.getItem("starseed.device.alias.v1")!);
        expect(alias.neurona).toMatchObject({ adoptada: "neurona-mac-de-alex", propia: "neurona-propia-nueva" });
        // Los otros dos ids NO se tocan (eco de sync y TOFU de la malla).
        expect(window.localStorage.getItem("starseed.device.id")).toBeNull();
    });

    it("una fila propia que NO nació en este arranque no se borra", async () => {
        est.neuronas = [{ ...PROPIA, created_at: "2026-01-01T00:00:00Z" }, MAC];
        const { recargar } = montar();
        await screen.findByRole("heading", { name: "¿Es esta una neurona que ya configuraste?" });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Usar la configuración de Mac de Alex" }));
        });
        await waitFor(() => expect(recargar).toHaveBeenCalled());
        expect(est.borrados).toEqual([]);
    });

    it("«Más tarde» pospone (por la vía de siempre) sin adoptar nada", async () => {
        est.neuronas = [PROPIA, MAC];
        const { onPosponer, recargar } = montar();
        await screen.findByRole("heading", { name: "¿Es esta una neurona que ya configuraste?" });
        fireEvent.click(screen.getByRole("button", { name: "Más tarde" }));
        expect(onPosponer).toHaveBeenCalledTimes(1);
        expect(recargar).not.toHaveBeenCalled();
        expect(window.localStorage.getItem("starseed.neuron.device-id")).toBe("neurona-propia-nueva");
    });

    it("si la lista de neuronas falla, no bloquea: sigue con el asistente", async () => {
        est.fallaLista = true;
        montar();
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
        expect(screen.queryByTestId("adoptar-neurona")).toBeNull();
    });

    it("si adoptar falla (almacenamiento bloqueado) avisa y deja seguir", async () => {
        est.neuronas = [PROPIA, { ...MAC, id: "id-invalido!!" }];
        const { recargar } = montar();
        await screen.findByRole("heading", { name: "¿Es esta una neurona que ya configuraste?" });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Usar la configuración de/ }));
        });
        expect(await screen.findByRole("alert")).toBeTruthy();
        expect(recargar).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Es otra neurona" }));
        await screen.findByRole("heading", { name: "Nueva neurona en tu cuenta" });
    });
});
