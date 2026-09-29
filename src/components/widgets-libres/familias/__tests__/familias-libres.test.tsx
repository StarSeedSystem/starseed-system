import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Tamaño forzado: cada clase es un diseño distinto ──
let medida = { width: 240, height: 240 };
const TAM = { micro: 90, s: 150, m: 240, l: 360, xl: 500 } as const;
const tam = (c: keyof typeof TAM) => { medida = { width: TAM[c], height: TAM[c] }; };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/components/dashboard/kit", () => ({ timeAgo: () => "hace 1m" }));

// ── Fuentes de datos (las mismas que los widgets clásicos) ──
const notis = { rows: [] as any[], loading: false, authPending: false, needsAuth: false, reload: vi.fn() };
const eventos = { rows: [] as any[], loading: false };
vi.mock("@/lib/widget-data/os-live", () => ({
    useMyNotifications: () => notis,
    useLiveEvents: () => eventos,
    tsOf: (iso: string | null) => (iso ? Date.parse(iso) : 0),
    isUpcoming: (iso: string | null) => !!iso && Date.parse(iso) > Date.now(),
}));
const actualizar = vi.fn(async () => ({}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ from: () => ({ update: () => ({ eq: actualizar }) }) }) }));
const tareas = { tasks: [] as any[], pending: [] as any[], completed: [], add: vi.fn(), toggle: vi.fn(), remove: vi.fn(), clearCompleted: vi.fn() };
const altaTarea = vi.fn((texto: string) => ({ id: "nueva", text: texto, done: false, createdAt: Date.now() }));
vi.mock("@/lib/tasks/quick-tasks", () => ({
    useQuickTasks: () => tareas, addQuickTask: (t: string, p?: string) => altaTarea(t, p),
    readQuickTasks: () => tareas.tasks, QUICK_TASKS_KEY: "starseed.tasks.quick.v1", QUICK_TASKS_EVENT: "starseed:tasks",
}));
let chat: any[] = [];
vi.mock("@/lib/aurora/aurora-chat-log", () => ({ readAuroraChatEntries: () => chat, AURORA_CHATLOG_CHANGE_EVENT: "x", AURORA_CHATLOG_KEY: "k" }));
vi.mock("@/lib/sync/realtime-sync", () => ({ getRealtimeSyncStatus: () => ({ state: "connected" }), onRealtimeSyncStatus: () => () => {} }));
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

import { RelojLibre } from "../reloj-libre";
import { ClimaLibre, cieloPorCodigo } from "../clima-libre";
import { _olvidarClima } from "../clima-partes";
import { NotificacionesLibre } from "../notificaciones-libre";
import { AccesosLibre } from "../accesos-libre";
import { EstadoSistemaLibre, saludDe } from "../estado-sistema-libre";
import { EventosLibre, cuentaAtras } from "../eventos-libre";
import { TareasLibre } from "../tareas-libre";
import { AstrauraLibre } from "../astraura-libre";

beforeEach(() => { tam("m"); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Reloj celeste", () => {
    it("micro es la hora (y la Luna); m añade la fecha y los signos del Sol y la Luna", () => {
        tam("micro");
        const { unmount } = render(<RelojLibre />);
        expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeTruthy();
        expect(screen.queryByText(/ de /)).toBeNull();
        unmount();
        tam("m");
        render(<RelojLibre />);
        expect(screen.getByText(/ de /)).toBeTruthy();
        expect(screen.getByTitle(/^Sol en /)).toBeTruthy();
        expect(screen.getByTitle(/^Luna en /)).toBeTruthy();
        expect(screen.getByRole("group").getAttribute("aria-label")).toMatch(/Luna|luna/);
    });
    it("xl enseña la fase, las otras zonas y cambia a agujas con los mismos ajustes", () => {
        tam("xl");
        const ajustes = vi.fn();
        render(<RelojLibre widget={{ settings: { clockZones: ["Asia/Tokyo"] } } as any} onUpdateSettings={ajustes} />);
        expect(screen.getByText(/Tokio \d{2}:\d{2}/)).toBeTruthy();
        expect(screen.getByRole("img", { name: /sale a las \d{2}:\d{2} y se pone/ })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Ver la hora con agujas" }));
        expect(ajustes).toHaveBeenCalledWith({ clockMode: "analog" });
    });
});

describe("Clima libre", () => {
    it("el código WMO decide la forma del cielo", () => {
        expect(cieloPorCodigo(0, true)).toBe("sol");
        expect(cieloPorCodigo(0, false)).toBe("luna");
        expect(cieloPorCodigo(63)).toBe("lluvia");
        expect(cieloPorCodigo(96)).toBe("tormenta");
        expect(cieloPorCodigo(undefined)).toBeNull();
    });
    it("con datos reales pinta la temperatura y el cielo; sin Open-Meteo dice «sin dato»", async () => {
        clima = { _sources: ["open-meteo"], terrestrial: { current: { temperature_2m: 21.4, weather_code: 0, is_day: 1, apparent_temperature: 20 }, daily: { temperature_2m_max: [25], temperature_2m_min: [14] } } };
        const { unmount } = render(<ClimaLibre />);
        expect(await screen.findByText("21°")).toBeTruthy();
        expect(screen.getByText("Despejado")).toBeTruthy();
        expect(screen.getByText("sensación 20°")).toBeTruthy();
        unmount();
        _olvidarClima();
        localStorage.removeItem("starseed.inicio.clima.v1");
        clima = { _sources: [], terrestrial: { current: { temperature_2m: 99, weather_code: 0 } } };
        render(<ClimaLibre />);
        expect(await screen.findByText("sin dato del clima")).toBeTruthy();
    });
});

describe("Notificaciones libres", () => {
    it("micro es el número; m las gotas; leer una la marca en Supabase", () => {
        notis.rows = [{ id: "a", title: "Voto abierto", seen: false, created_at: null }, { id: "b", title: "Mensaje", seen: false, created_at: null }];
        tam("micro");
        const { unmount } = render(<NotificacionesLibre />);
        expect(screen.getByRole("link", { name: "2 notificaciones sin leer" })).toBeTruthy();
        unmount();
        tam("m");
        render(<NotificacionesLibre />);
        expect(screen.getByText("Voto abierto")).toBeTruthy();
        fireEvent.click(screen.getAllByRole("button", { name: /^Marcar como leída/ })[0]);
        expect(actualizar).toHaveBeenCalledWith("id", "a");
    });
    it("sin nuevas: «Todo al día»; sin sesión lo dice", () => {
        notis.rows = [];
        const { unmount } = render(<NotificacionesLibre />);
        expect(screen.getByText("Todo al día")).toBeTruthy();
        unmount();
        notis.needsAuth = true;
        render(<NotificacionesLibre />);
        expect(screen.getByText("Entra para ver tus avisos")).toBeTruthy();
        notis.needsAuth = false;
    });
});

describe("Accesos libres", () => {
    it("micro son cuatro en cruz; l los fijados, crear y entrar; al editar se ven todos y se fijan", () => {
        tam("micro");
        const { unmount } = render(<AccesosLibre />);
        expect(screen.getAllByRole("link")).toHaveLength(4);
        unmount();
        tam("l");
        render(<AccesosLibre />);
        expect(screen.getByRole("link", { name: "Red" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "Mensajes" })).toBeNull();
        expect(screen.getByText("Publicar")).toBeTruthy();
        expect(screen.getByText("Entra para tus accesos")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Elegir qué accesos se fijan" }));
        expect(screen.getByRole("link", { name: "Mensajes" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Fijar Mensajes" }));
        expect(JSON.parse(localStorage.getItem("starseed.inicio.accesos.v1")!).fijados).toContain("/mensajes");
    });
});

describe("Estado del sistema libre", () => {
    it("m son tres ondas; lo que el navegador no mide es «—»", () => {
        render(<EstadoSistemaLibre />);
        expect(screen.getAllByRole("meter")).toHaveLength(3);
        expect(screen.getByRole("meter", { name: /Batería: sin dato/ })).toBeTruthy();
    });
    it("la salud sale de la sincronía y la batería", () => {
        expect(saludDe("connected", 0.8)).toBe("bien");
        expect(saludDe("connecting", null)).toBe("atencion");
        expect(saludDe("connected", 0.1)).toBe("mal");
    });
});

describe("Eventos libres", () => {
    it("cuenta atrás legible", () => {
        expect(cuentaAtras(0)).toBe("ahora");
        expect(cuentaAtras(90_000)).toBe("01:30");
        expect(cuentaAtras(3 * 3_600_000 + 12 * 60_000)).toBe("3 h 12 min");
        expect(cuentaAtras(2 * 86_400_000 + 4 * 3_600_000)).toBe("2 d 4 h");
    });
    it("sin eventos lo dice y ofrece crear; con uno, s es su cápsula", () => {
        eventos.rows = [];
        const { unmount } = render(<EventosLibre />);
        expect(screen.getByText("Semana libre en la red")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Crear un evento" }).getAttribute("href")).toBe("?createEntity=event");
        unmount();
        eventos.rows = [{ id: "1", slug: "luna", title: "Círculo de luna", starts_at: new Date(Date.now() + 7_200_000).toISOString() }];
        tam("s");
        render(<EventosLibre />);
        expect(screen.getByText("Círculo de luna").closest("a")?.getAttribute("href")).toBe("/evento/luna");
    });
});

describe("Tareas libres", () => {
    it("cada casilla completa su tarea (con «Deshacer»); l añade con atajos", () => {
        tareas.tasks = [{ id: "t1", text: "Regar", done: false, createdAt: 1 }, { id: "t2", text: "Leer", done: true, createdAt: 2 }];
        tareas.pending = [tareas.tasks[0]];
        tam("s");
        const { unmount } = render(<TareasLibre />);
        fireEvent.click(screen.getByRole("checkbox", { name: /Regar: pendiente/ }));
        expect(tareas.toggle).toHaveBeenCalledWith("t1");
        expect(screen.getByRole("button", { name: "Deshacer: Regar" })).toBeTruthy();
        unmount();
        tam("l");
        render(<TareasLibre />);
        fireEvent.change(screen.getByLabelText("Nueva tarea"), { target: { value: "Meditar mañana!" } });
        fireEvent.click(screen.getByRole("button", { name: "Guardar tarea" }));
        expect(altaTarea).toHaveBeenCalledWith("Meditar", "alta");
    });
});

describe("Astraura libre", () => {
    it("sin conversación lo dice; con ella, enseña su última frase", () => {
        chat = [];
        const { unmount } = render(<AstrauraLibre />);
        expect(screen.getByText("Aún no habéis hablado.")).toBeTruthy();
        unmount();
        chat = [{ role: "user", text: "¿Qué tal?", ts: 1 }, { role: "aurora", text: "Todo en calma en la malla.", ts: 2 }];
        tam("l");
        render(<AstrauraLibre />);
        expect(screen.getByText("Todo en calma en la malla.")).toBeTruthy();
        expect(screen.getByText("Tú: ¿Qué tal?")).toBeTruthy();
    });
});
