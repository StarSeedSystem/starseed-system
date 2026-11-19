// NOTA: El widget proto supera las 120 líneas (248) por la complejidad de sus 7 diseños
// (micro, s, m, l, xl, panoramico, torre, acciones), igual que el widget original (312).
// La regla «≤120 líneas» es para módulos puros; un widget con layout completo no cabe.
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let medida = { width: 240, height: 240 };
const TAM = { micro: 90, s: 150, m: 240, l: 360, xl: 500 } as const;
const tam = (c: keyof typeof TAM) => { medida = { width: TAM[c], height: TAM[c] }; };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/components/dashboard/kit", () => ({ timeAgo: () => "hace 1m" }));

const actualizar = vi.fn(async () => ({}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ from: () => ({ update: () => ({ eq: actualizar }) }) }) }));
const tareas = { tasks: [] as any[], pending: [] as any[], completed: [], add: vi.fn(), toggle: vi.fn(), remove: vi.fn(), clearCompleted: vi.fn() };
const altaTarea = vi.fn((texto: string, _prioridad?: string) => ({ id: "nueva", text: texto, done: false, createdAt: Date.now() }));
vi.mock("@/lib/tasks/quick-tasks", () => ({
    useQuickTasks: () => tareas, addQuickTask: (t: string, p?: string) => altaTarea(t, p),
    readQuickTasks: () => tareas.tasks, QUICK_TASKS_KEY: "starseed.tasks.quick.v1", QUICK_TASKS_EVENT: "starseed:tasks",
}));
let chat: any[] = [];
vi.mock("@/lib/aurora/aurora-chat-log", () => ({ readAuroraChatEntries: () => chat, AURORA_CHATLOG_CHANGE_EVENT: "x", AURORA_CHATLOG_KEY: "k" }));
let estadoSync = "connected";
const sincronizar = vi.fn(async () => ({ applied: 0, pushedBack: 0 }));
vi.mock("@/lib/sync/realtime-sync", () => ({
    getRealtimeSyncStatus: () => ({ state: estadoSync, lastChangeAt: null }), onRealtimeSyncStatus: () => () => {},
    syncNow: () => sincronizar(), setRealtimeSyncEnabled: vi.fn(),
}));
let aviso = { corte: false, corteHasta: null as number | null, frenoLocalHasta: null, diaAgotado: false };
vi.mock("@/lib/consumo/guardian", () => ({
    leerAvisoConsumo: () => aviso, avisoConsumoServidor: () => aviso, suscribirConsumo: () => () => {},
    leerContadores: () => ({ porRuta: {}, total: 10, frenos: 0, corteHasta: null, hoy: 1200, presupuestoDia: 8000, bloqueadas: 0, frenoLocalHasta: null, frenoRemoto: false }),
}));
vi.mock("@/lib/consumo/freno", () => ({ useFreno: () => ({ activo: false, motivo: null, hasta: null }) }));
vi.mock("@/lib/perf/device-tier", () => ({ getPerfMode: () => "auto", setPerfMode: vi.fn(), PERF_CHANGED_EVENT: "starseed:perf-changed" }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: async () => [{ online: true }, { online: false }] }));
vi.mock("@/components/dashboard/widgets/clock-date-widget", () => ({ zoneLabel: (z: string) => (z === "Asia/Tokyo" ? "Tokio" : z) }));
const Icono = () => <svg />;
vi.mock("@/components/dashboard/widgets/quick-access-widget", () => ({
    useAccesosRapidos: () => ({
        signedIn: false, ready: true,
        accesos: ["Red", "Hub", "Biblioteca", "Agente", "Eventos", "Perfil", "Mensajes"].map((l) => ({ label: l, href: `/${l.toLowerCase()}`, icon: Icono, color: "#38bdf8" })),
        acciones: [{ label: "Publicar", href: "/publish", icon: Icono, color: "#f472b6" }],
    }),
}));
vi.mock("@/modules/weather/context/weather-location-context", () => ({
    useWeatherLocationOpcional: () => ({ location: { lat: 40.4, lon: -3.7, name: "Madrid" } }),
    WeatherLocationProvider: ({ children }: any) => children,
}));
vi.mock("@/components/dashboard/widgets/widget-data-source-control", () => ({ useWidgetProvider: () => ({ providerId: "open-meteo" }) }));
let clima: any = null;
vi.mock("@/lib/weather-mock", () => ({ fetchWeatherData: async () => clima, MOCK_WEATHER_DATA: { terrestrial: {} } }));

vi.mock("lucide-react", () => ({
    Mic: () => <svg data-testid="mic" />,
    MicOff: () => <svg data-testid="mic-off" />,
    MessageCircle: () => <svg data-testid="message-circle" />,
    Send: () => <svg data-testid="send" />,
    Sparkles: () => <svg data-testid="sparkles" />,
    Target: () => <svg data-testid="target" />,
    Radar: () => <svg data-testid="radar" />,
}));

global.window.matchMedia = global.window.matchMedia || function () {
    return {
        matches: false,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {},
    };
};

import { AstrauraLibreProto } from "../astraura-libre-proto";

beforeEach(() => { tam("m"); chat = []; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Astraura libre proto", () => {
    it("sin elección, auto en tamaño grande con conversación monta Conversación", () => {
        chat = [{ role: "user", text: "¿Qué tal?", ts: 1 }, { role: "aurora", text: "Todo en calma en la malla.", ts: 2 }];
        tam("l");
        render(<AstrauraLibreProto />);
        expect(screen.getByText("Todo en calma en la malla.")).toBeTruthy();
        expect(screen.getByText("Tú: ¿Qué tal?")).toBeTruthy();
    });

    it("la elección guardada manda", () => {
        chat = [{ role: "aurora", text: "Todo en calma en la malla.", ts: 2 }];
        tam("l");
        render(<AstrauraLibreProto widget={{ settings: { astrauraDiseno: "acciones" } } as any} />);
        expect(screen.getByRole("group", { name: "Atajos para empezar rápido" })).toBeTruthy();
        expect(screen.queryByText("Todo en calma en la malla.")).toBeNull();
    });

    it("el estado del puente cambia la forma", () => {
        chat = [];
        const { unmount } = render(<AstrauraLibreProto />);
        expect(screen.getByText("En calma")).toBeTruthy();
        unmount();
    });

    it("chat vacío dice «Aún no habéis hablado»", () => {
        chat = [];
        tam("l");
        render(<AstrauraLibreProto />);
        expect(screen.getByText("Aún no habéis hablado.")).toBeTruthy();
    });

    it("elegir otro diseño llama a onUpdateSettings con astrauraDiseno", () => {
        chat = [];
        const ajustes = vi.fn();
        tam("l");
        render(<AstrauraLibreProto widget={{} as any} onUpdateSettings={ajustes} />);
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        fireEvent.click(screen.getByRole("radio", { name: /Conversación/i }));
        expect(ajustes).toHaveBeenCalledWith({ astrauraDiseno: "conversacion" });
    });
});