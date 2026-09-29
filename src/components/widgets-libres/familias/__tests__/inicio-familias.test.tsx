/**
 * Los ocho widgets del inicio en s, m y l (tamaño forzado por el MarcoUnificado, como cuando el
 * coordinador los envuelva): sin romperse, con su estado vacío honesto y sus etiquetas.
 */
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

const PX: Record<string, [number, number]> = { s: [160, 160], m: [260, 260], l: [570, 325] };
let medida = { width: 260, height: 260 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/components/dashboard/kit", () => ({ timeAgo: () => "hace 1m" }));
const notis = { rows: [] as any[], loading: false, authPending: false, needsAuth: false, reload: vi.fn() };
const eventos = { rows: [] as any[], loading: false };
vi.mock("@/lib/widget-data/os-live", () => ({
    useMyNotifications: () => notis, useLiveEvents: () => eventos,
    tsOf: (iso: string | null) => (iso ? Date.parse(iso) : 0), isUpcoming: (iso: string | null) => !!iso && Date.parse(iso) > Date.now(),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({}) }) }) }) }));
const tareas = { tasks: [] as any[], pending: [] as any[], completed: [], add: vi.fn(), toggle: vi.fn(), remove: vi.fn(), clearCompleted: vi.fn() };
vi.mock("@/lib/tasks/quick-tasks", () => ({
    useQuickTasks: () => tareas, addQuickTask: vi.fn(), readQuickTasks: () => tareas.tasks, QUICK_TASKS_KEY: "k", QUICK_TASKS_EVENT: "e",
}));
let chat: any[] = [];
vi.mock("@/lib/aurora/aurora-chat-log", () => ({ readAuroraChatEntries: () => chat, AURORA_CHATLOG_CHANGE_EVENT: "x", AURORA_CHATLOG_KEY: "k" }));
let auroraLista = false;
const preguntar = vi.fn(async (_opciones?: unknown) => auroraLista);
vi.mock("@/lib/aurora/open-aurora", () => ({ openAurora: (o: unknown) => preguntar(o), getAuroraBridge: () => null }));
vi.mock("@/lib/sync/realtime-sync", () => ({ getRealtimeSyncStatus: () => ({ state: "connected", lastChangeAt: null }), onRealtimeSyncStatus: () => () => {}, syncNow: vi.fn(), setRealtimeSyncEnabled: vi.fn() }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: async () => [{ online: true }] }));
vi.mock("@/lib/consumo/guardian", () => {
    const aviso = { corte: false, corteHasta: null, frenoLocalHasta: null, diaAgotado: false };
    return { leerAvisoConsumo: () => aviso, avisoConsumoServidor: () => aviso, suscribirConsumo: () => () => {}, leerContadores: () => ({ hoy: 10, presupuestoDia: 8000, frenoRemoto: false }) };
});
vi.mock("@/lib/consumo/freno", () => ({ useFreno: () => ({ activo: false, motivo: null, hasta: null }) }));
vi.mock("@/lib/perf/device-tier", () => ({ getPerfMode: () => "auto", setPerfMode: vi.fn(), PERF_CHANGED_EVENT: "p" }));
vi.mock("@/components/dashboard/widgets/clock-date-widget", () => ({ zoneLabel: (z: string) => z }));
const Icono = () => <svg />;
vi.mock("@/components/dashboard/widgets/quick-access-widget", () => ({
    useAccesosRapidos: () => ({
        signedIn: true, ready: true,
        accesos: ["Red", "Hub", "Biblioteca", "Agente", "Eventos", "Perfil", "Mensajes"].map((l) => ({ label: l, href: `/${l.toLowerCase()}`, icon: Icono, color: "#38bdf8" })),
        acciones: [{ label: "Publicar", href: "/publish", icon: Icono, color: "#f472b6" }],
    }),
}));
let ubicacion: any = { location: { lat: 40.4, lon: -3.7, name: "Madrid" }, requestGeolocation: vi.fn(async () => {}) };
vi.mock("@/modules/weather/context/weather-location-context", () => ({ useWeatherLocationOpcional: () => ubicacion, WeatherLocationProvider: ({ children }: any) => children }));
vi.mock("@/components/dashboard/widgets/widget-data-source-control", () => ({ useWidgetProvider: () => ({ providerId: "open-meteo" }) }));
let clima: any = null;
vi.mock("@/lib/weather-mock", () => ({ fetchWeatherData: async () => clima, MOCK_WEATHER_DATA: { terrestrial: {} } }));

import { RelojLibre } from "../reloj-libre";
import { ClimaLibre } from "../clima-libre";
import { _olvidarClima } from "../clima-partes";
import { NotificacionesLibre } from "../notificaciones-libre";
import { AccesosLibre } from "../accesos-libre";
import { EstadoSistemaLibre } from "../estado-sistema-libre";
import { EventosLibre } from "../eventos-libre";
import { TareasLibre } from "../tareas-libre";
import { AstrauraLibre } from "../astraura-libre";

const marco = (clase: ClaseTamano): ContextoMarcoUnificado => ({
    acento: "#7c5cff", acento2: "#23d5ab", clase, base: clase as any, horizontal: false,
    espaciado: { cabecera: "", cuerpo: "", pie: "", icono: "", iconoSvg: "", radio: 20 },
});
function enMarco(ui: React.ReactElement, clase: "s" | "m" | "l") {
    medida = { width: PX[clase][0], height: PX[clase][1] };
    return render(<ContextoMarco.Provider value={marco(clase)}>{ui}</ContextoMarco.Provider>);
}
const diseno = (c: HTMLElement) => c.querySelector("[data-diseno]")?.getAttribute("data-diseno") ?? "";
const TAMANOS = ["s", "m", "l"] as const;

beforeEach(() => { localStorage.clear(); _olvidarClima(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Reloj celeste en s/m/l", () => {
    it.each(TAMANOS)("%s: su propio diseño, la hora y la descripción del cielo", (t) => {
        const { container } = enMarco(<RelojLibre />, t);
        expect(diseno(container)).toMatch(t === "l" ? /^l-carta/ : new RegExp(`^${t}`));
        expect(screen.getAllByText(/^\d{2}:\d{2}$/).length).toBeGreaterThan(0);
        expect(screen.getByRole("group").getAttribute("aria-label")).toMatch(/Sol en .*Luna en/);
        if (t === "l") expect(screen.getByText(/Sol en .* \d+°/, { selector: ".sr-only" })).toBeTruthy();
    });
    it("con la ubicación de fábrica se dice y se ofrece la propia; sin ubicación, no hay ascendente", () => {
        enMarco(<RelojLibre />, "l");
        expect(screen.getByRole("button", { name: /Usar mi ubicación/ })).toBeTruthy();
        cleanup();
        ubicacion = null;
        enMarco(<RelojLibre />, "l");
        expect(screen.getByText(/Sin ubicación: sin ascendente/)).toBeTruthy();
        ubicacion = { location: { lat: 40.4, lon: -3.7, name: "Madrid" }, requestGeolocation: vi.fn(async () => {}) };
    });
});

describe("Clima en s/m/l", () => {
    it.each(TAMANOS)("%s: sin dato real lo dice y ofrece reintentar", async (t) => {
        clima = { _sources: [] };
        enMarco(<ClimaLibre />, t);
        expect(await screen.findByText("sin dato del clima")).toBeTruthy();
        expect(screen.getByRole("button", { name: /Reintentar/ })).toBeTruthy();
    });
    it("l: temperatura, próximas horas y aviso de lluvia", async () => {
        clima = { _sources: ["open-meteo"], terrestrial: {
            current: { temperature_2m: 18, weather_code: 61, is_day: 1, apparent_temperature: 17 },
            daily: { temperature_2m_max: [20], temperature_2m_min: [11] },
            hourly: { time: ["13:00", "14:00", "15:00"], temperature_2m: [18, 19, 17], precipitation_probability: [20, 70, 40] },
        } };
        enMarco(<ClimaLibre />, "l");
        expect((await screen.findAllByText("18°")).length).toBeGreaterThan(0);
        expect(screen.getByText("Lluvia probable a las 14:00 (70 %)")).toBeTruthy();
        expect(screen.getByRole("img", { name: /Próximas 3 horas/ })).toBeTruthy();
    });
});

describe("Notificaciones en s/m/l", () => {
    it.each(TAMANOS)("%s: sin avisos, «Todo al día»", (t) => {
        notis.rows = [];
        enMarco(<NotificacionesLibre />, t);
        expect(screen.getByText("Todo al día")).toBeTruthy();
    });
    it("l: lo importante primero, filtro por fuente y posponer", () => {
        notis.rows = [
            { id: "a", kind: null, title: "Ana reaccionó", seen: false, created_at: new Date().toISOString(), link: null, body: null },
            { id: "b", kind: "otp", title: "Nuevo acceso a tu cuenta", seen: false, created_at: new Date(Date.now() - 3_600_000).toISOString(), link: "/seguridad", body: null },
        ];
        enMarco(<NotificacionesLibre />, "l");
        const leer = screen.getAllByRole("button", { name: /^Marcar como leída/ });
        expect(leer[0].getAttribute("aria-label")).toContain("Nuevo acceso");
        expect(screen.getByRole("tab", { name: /Seguridad 1/ })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Posponer «Ana reaccionó»" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Una hora" }));
        expect(Object.keys(JSON.parse(localStorage.getItem("starseed.inicio.notis.pospuestas.v1")!))).toEqual(["a"]);
        expect(screen.getByRole("button", { name: /1 pospuesta/ })).toBeTruthy();
        notis.rows = [];
    });
});

describe("Accesos en s/m/l", () => {
    it.each([["s", 4], ["m", 6], ["l", 6]] as const)("%s: %i fijados", (t, n) => {
        enMarco(<AccesosLibre />, t);
        expect(screen.getAllByRole("link").filter((a) => ["Red", "Hub", "Biblioteca", "Agente", "Eventos", "Perfil"].includes(a.getAttribute("aria-label") ?? ""))).toHaveLength(n);
    });
    it("abrir uno lo apunta como reciente", () => {
        enMarco(<AccesosLibre />, "l");
        fireEvent.click(screen.getByRole("link", { name: "Biblioteca" }));
        expect(JSON.parse(localStorage.getItem("starseed.inicio.accesos.v1")!).uso["/biblioteca"].n).toBe(1);
        expect(screen.getByRole("link", { name: /^Biblioteca\s*ahora/ })).toBeTruthy();
    });
});

describe("Estado del sistema en s/m/l", () => {
    it.each(TAMANOS)("%s: el anillo de salud con cada señal", async (t) => {
        enMarco(<EstadoSistemaLibre />, t);
        expect((await screen.findByRole("img", { name: /Salud de esta neurona/ })).getAttribute("aria-label")).toMatch(/Red .*Sincronía .*Consumo/);
    });
});

describe("Eventos en s/m/l", () => {
    it.each(TAMANOS)("%s: sin eventos lo dice y ofrece crear", (t) => {
        eventos.rows = [];
        enMarco(<EventosLibre />, t);
        expect(screen.getByText("Semana libre en la red")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Crear un evento" }).getAttribute("href")).toBe("?createEntity=event");
    });
    it("l: el próximo con su cuenta atrás; tocar un día filtra la agenda", () => {
        const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
        eventos.rows = [
            { id: "1", slug: "luna", title: "Círculo de luna", kind: "ritual", starts_at: en(2), location: "Huerto", attendee_count: 12 },
            { id: "2", slug: "asamblea", title: "Asamblea", kind: "asamblea", starts_at: en(50), location: null, attendee_count: null },
        ];
        enMarco(<EventosLibre />, "l");
        expect(screen.getByRole("img", { name: /^Faltan/ })).toBeTruthy();
        expect(screen.getByText("12 van")).toBeTruthy();
        const diaAsamblea = new Date(Date.now() + 50 * 3_600_000).toLocaleDateString("es-ES", { weekday: "long", day: "numeric" });
        const dia = screen.getByRole("button", { name: `${diaAsamblea}: 1 evento` });
        fireEvent.click(dia);
        expect(dia.getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByText("Asamblea")).toBeTruthy();
        eventos.rows = [];
    });
});

describe("Tareas en s/m/l", () => {
    it.each(TAMANOS)("%s: sin tareas lo dice y deja añadir", (t) => {
        tareas.tasks = [];
        enMarco(<TareasLibre />, t);
        expect(screen.getAllByText(/Nada pendiente/).length).toBeGreaterThan(0);
        if (t === "s") fireEvent.click(screen.getByRole("button", { name: "Añadir tarea" }));
        expect(screen.getByLabelText("Nueva tarea")).toBeTruthy();
    });
    it("l: pestañas, fechas y el menú de cada tarea", () => {
        const hoy = new Date();
        const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
        tareas.tasks = [{ id: "t1", text: "Regar", done: false, createdAt: 1, vence: iso }, { id: "t2", text: "Leer", done: true, createdAt: 2, doneAt: Date.now() }];
        enMarco(<TareasLibre />, "l");
        expect(screen.getByRole("tab", { name: "Hoy 1" })).toBeTruthy();
        expect(screen.getByText("Hoy", { selector: "span" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Fecha y opciones de «Regar»" }));
        expect(screen.getByRole("menuitem", { name: "Para mañana" })).toBeTruthy();
        fireEvent.click(screen.getByRole("menuitem", { name: "Borrar" }));
        expect(tareas.remove).toHaveBeenCalledWith("t1");
        fireEvent.click(screen.getByRole("tab", { name: "Hechas 1" }));
        expect(screen.getByRole("checkbox", { name: /Leer: hecha/ })).toBeTruthy();
        tareas.tasks = [];
    });
});

describe("Astraura en s/m/l", () => {
    it.each(TAMANOS)("%s: sin conversación lo dice; el orbe abre el chat", (t) => {
        chat = [];
        enMarco(<AstrauraLibre />, t);
        expect(screen.getAllByText(/Aún no habéis hablado/).length).toBeGreaterThan(0);
        expect(screen.getAllByRole("button", { name: /Abrir el chat de Astraura/ }).length).toBeGreaterThan(0);
    });
    it("preguntar: si Astraura no está despierta la pregunta no se pierde; si lo está, se envía", async () => {
        chat = [];
        auroraLista = false;
        enMarco(<AstrauraLibre />, "m");
        fireEvent.change(screen.getByLabelText("Pregunta para Astraura"), { target: { value: "¿Qué hay hoy?" } });
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar a Astraura" })); });
        expect(preguntar).toHaveBeenCalledWith({ prompt: "¿Qué hay hoy?", reveal: true });
        expect(screen.getByText(/aún no está despierta/)).toBeTruthy();
        expect((screen.getByLabelText("Pregunta para Astraura") as HTMLInputElement).value).toBe("¿Qué hay hoy?");
        auroraLista = true;
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar a Astraura" })); });
        expect(screen.getByText(/Enviado/)).toBeTruthy();
    });
});
