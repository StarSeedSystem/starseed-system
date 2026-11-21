import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let medida = { width: 240, height: 240 };
const TAM = { micro: 90, s: 150, m: 240, l: 360, xl: 500 } as const;
const tam = (c: keyof typeof TAM) => { medida = { width: TAM[c], height: TAM[c] }; };

vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("@/components/widgets-libres/widget-libre", () => ({
    WidgetLibre: ({ children }: { children: React.ReactNode | ((c: { clase: string; ancho: number; alto: number }) => React.ReactNode) }) => {
        const w = medida.width;
        const clase = w <= 110 ? "micro" : w <= 170 ? "s" : w <= 280 ? "m" : w <= 420 ? "l" : "xl";
        return <div data-testid="widget-libre">{typeof children === "function" ? children({ clase, ancho: medida.width, alto: medida.height }) : children}</div>;
    },
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
    ClipboardList: () => <svg data-testid="clipboard-list" />,
    CalendarCheck: () => <svg data-testid="calendar-check" />,
}));

vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
    useNivelRender: () => "normal",
    nivelRender: () => "normal",
    leerSenalesDispositivo: () => ({ nucleos: 8, memoriaGB: 16, movimientoReducido: false, ahorroDatos: false, bateriaBaja: false, enXR: false }),
    conModoDelSistema: (n: string) => n,
    presupuesto: () => ({ parallax: true, particulas: 6, inclinacionMax: 5, duracionEntradaMs: 280, halo: "suave" }),
}));

vi.mock("@/components/protomolecula/protomolecula-ligera", () => ({
    ProtomoleculaLigera: ({ estado, tam }: { estado: string; tam: number }) => (
        <svg data-testid="protomolecula-ligera" data-estado={estado} width={tam} height={tam} />
    ),
}));

vi.mock("@/lib/widgets/astraura/estado-forma", () => ({
    EstadoAsistente: "calma" as const,
    formaDeEstado: (e: string) => "icosaedro",
    paletaDeEstado: () => "astraura",
    ritmoDeEstado: () => ({ giroS: 55, respiraS: 13 }),
    derivarEstado: (s: any, ultimaMs: number | null, ahoraMs: number) => {
        if (s?.error) return "error";
        if (s?.speaking) return "hablando";
        if (s?.listening) return "escuchando";
        if (s?.actionStatus && /error|fall(o|ó)|fail/i.test(s.actionStatus)) return "error";
        if (s?.actionStatus && /pens|procesa|think/i.test(s.actionStatus)) return "pensando";
        if (ultimaMs !== null && ahoraMs - ultimaMs < 60_000) return "hablando";
        return "calma";
    },
    textoDeEstado: (e: string) => {
        switch (e) {
            case "calma": return "En calma";
            case "escuchando": return "Escuchando…";
            case "pensando": return "Pensando…";
            case "hablando": return "Hablando";
            case "error": return "Algo falló";
            default: return "En calma";
        }
    },
    frasePantallaLectora: (e: string) => `Astraura está ${e === "calma" ? "en calma" : e}`,
}));

vi.mock("@/lib/widgets/astraura/disenos", () => {
    const DISENOS = {
        minimo: { nombre: "Mínimo", sirvePara: "Solo la forma" },
        conversacion: { nombre: "Conversación", sirvePara: "El último intercambio" },
        acciones: { nombre: "Acciones", sirvePara: "Atajos para empezar rápido" },
        voz: { nombre: "Voz", sirvePara: "Botón enorme de hablar" },
    };
    const tamanoDe = (clase: string) => {
        if (clase === "micro" || clase === "s") return "compacto";
        if (clase === "m" || clase === "panoramico") return "medio";
        return "grande";
    };
    const disenoValido = (x: unknown) => {
        if (typeof x === "string" && ["minimo", "conversacion", "acciones", "voz", "auto"].includes(x)) return x;
        return "auto";
    };
    const resolverDiseno = (eleccion: string, ctx: any) => {
        const valida = disenoValido(eleccion);
        if (valida !== "auto") {
            if (ctx.tamano === "compacto" && valida !== "minimo") return { diseno: "minimo", degradado: true };
            return { diseno: valida, degradado: false };
        }
        if (ctx.tamano === "compacto") return { diseno: "minimo", degradado: false };
        if (ctx.tamano === "medio") return { diseno: ctx.hayConversacion ? "conversacion" : "acciones", degradado: false };
        if (ctx.tactil && ctx.hayVoz) return { diseno: "voz", degradado: false };
        if (ctx.hayConversacion) return { diseno: "conversacion", degradado: false };
        return { diseno: "acciones", degradado: false };
    };
    return {
        DISENOS,
        tamanoDe,
        disenoValido,
        resolverDiseno,
    };
});

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

type PuenteFalso = {
    speaking: boolean;
    listening: boolean;
    actionStatus: string;
    error?: boolean;
    supported: boolean;
    enabled: boolean;
    getState: ReturnType<typeof vi.fn<() => PuenteFalso>>;
    subscribe: ReturnType<typeof vi.fn<(cb: () => void) => () => void>>;
    start: ReturnType<typeof vi.fn<() => void>>;
    stop: ReturnType<typeof vi.fn<() => void>>;
    _notificar: () => void;
};

let notificarActual: (() => void) | null = null;

function crearPuenteFalso(estadoInicial: Partial<Omit<PuenteFalso, "getState" | "subscribe" | "start" | "stop" | "_notificar">> = {}): PuenteFalso {
    const getState = vi.fn<() => PuenteFalso>();
    const subscribe = vi.fn<(cb: () => void) => () => void>();
    const start = vi.fn<() => void>();
    const stop = vi.fn<() => void>();

    let estado: PuenteFalso = {
        speaking: false,
        listening: false,
        actionStatus: "",
        error: false,
        supported: true,
        enabled: true,
        ...estadoInicial,
        getState,
        subscribe,
        start,
        stop,
        _notificar: () => { notificarActual?.(); },
    };

    getState.mockReturnValue(estado);
    subscribe.mockImplementation((cb) => {
        notificarActual = cb;
        cb();
        return vi.fn();
    });

    return estado;
}

beforeEach(() => {
    vi.useFakeTimers();
    notificarActual = null;
    tam("m");
    chat = [];
    window.localStorage.clear();
    // @ts-expect-error - test setup
    window.STARSEED_AURORA = undefined;
});

afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
    notificarActual = null;
    // @ts-expect-error - test cleanup
    window.STARSEED_AURORA = undefined;
});

import { AstrauraLibreProto } from "../astraura-libre-proto";

describe("Astraura libre proto", () => {
    it("sin elección, auto en tamaño grande con conversación monta Conversación", async () => {
        const puente = crearPuenteFalso();
        // @ts-expect-error - test setup
        window.STARSEED_AURORA = puente;

        chat = [{ role: "user", text: "¿Qué tal?", ts: 1 }, { role: "aurora", text: "Todo en calma en la malla.", ts: 2 }];
        tam("l");

        render(<AstrauraLibreProto />);
        await act(async () => { await vi.runAllTimersAsync(); });

        expect(screen.getByText("Todo en calma en la malla.")).toBeTruthy();
        expect(screen.getByText("Tú: ¿Qué tal?")).toBeTruthy();
    });

    it("la elección guardada manda", async () => {
        const puente = crearPuenteFalso();
        // @ts-expect-error - test setup
        window.STARSEED_AURORA = puente;

        chat = [{ role: "aurora", text: "Todo en calma en la malla.", ts: 2 }];
        tam("l");

        render(<AstrauraLibreProto widget={{ settings: { astrauraDiseno: "acciones" } } as any} />);
        await act(async () => { await vi.runAllTimersAsync(); });

        expect(screen.getByRole("group", { name: "Atajos para empezar rápido" })).toBeTruthy();
        expect(screen.queryByText("Todo en calma en la malla.")).toBeNull();
    });

    it("el estado del puente cambia la forma", async () => {
        const puente = crearPuenteFalso();
        // @ts-expect-error - test setup
        window.STARSEED_AURORA = puente;

        chat = [];
        tam("l");

        render(<AstrauraLibreProto />);
        await act(async () => { await vi.runAllTimersAsync(); });

        expect(screen.getByText("En calma")).toBeTruthy();

        await act(async () => {
            puente.speaking = false;
            puente.listening = true;
            puente.getState.mockReturnValue(puente);
            puente._notificar();
        });

        expect(screen.getByText("Escuchando…")).toBeTruthy();

        await act(async () => {
            puente.speaking = true;
            puente.listening = false;
            puente.getState.mockReturnValue(puente);
            puente._notificar();
        });

        expect(screen.getByText("Hablando")).toBeTruthy();
    });

    it("chat vacío dice «Aún no habéis hablado»", async () => {
        const puente = crearPuenteFalso();
        // @ts-expect-error - test setup
        window.STARSEED_AURORA = puente;

        chat = [];
        tam("l");

        render(<AstrauraLibreProto />);
        await act(async () => { await vi.runAllTimersAsync(); });

        expect(screen.getByText(/Aún no habéis hablado/)).toBeTruthy();
    });

    it("elegir otro diseño llama a onUpdateSettings con astrauraDiseno", async () => {
        const puente = crearPuenteFalso();
        // @ts-expect-error - test setup
        window.STARSEED_AURORA = puente;

        chat = [];
        const ajustes = vi.fn();
        tam("l");

        render(<AstrauraLibreProto widget={{} as any} onUpdateSettings={ajustes} />);
        await act(async () => { await vi.runAllTimersAsync(); });

        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        fireEvent.click(screen.getByRole("radio", { name: /Conversación/i }));

        expect(ajustes).toHaveBeenCalledWith({ astrauraDiseno: "conversacion" });
    });
});