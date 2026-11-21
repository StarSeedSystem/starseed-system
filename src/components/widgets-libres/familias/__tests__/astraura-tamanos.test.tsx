import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import type { ClaseDispositivo, ClaseTamano } from "@/lib/widgets/forma/tamanos";

let clase: ClaseTamano = "m";
let dispositivo: ClaseDispositivo = "escritorio";
let chat: { role: "user" | "aurora"; text: string; ts: number }[] = [];

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children?: ReactNode }) => <a href={String(href)}>{children}</a>,
}));
vi.mock("@/components/widgets-libres/widget-libre", () => ({
    WidgetLibre: ({ children }: { children: ReactNode | ((c: { clase: string; ancho: number; alto: number }) => ReactNode) }) => (
        <div data-testid="widget-libre">{typeof children === "function" ? children({ clase: "m", ancho: 260, alto: 260 }) : children}</div>
    ),
}));
vi.mock("../inicio-piezas", () => ({
    Accion: ({ children, onClick, "aria-label": ariaLabel }: { children?: ReactNode; onClick?: () => void; "aria-label"?: string }) => (
        <button type="button" aria-label={ariaLabel} onClick={onClick}>{children}</button>
    ),
    escalaTipo: (d: string) => (d === "tv" ? 1.25 : d === "xr" ? 1.15 : 1),
    esTactil: (d: string) => d === "movil" || d === "tablet" || d === "tv" || d === "xr",
    haceCuanto: () => "hace 1m",
    useClaseForzada: () => clase,
    useDispositivo: () => dispositivo,
    useEnPantalla: () => [{ current: null }, true],
}));
vi.mock("@/lib/widgets/forma/nivel-dispositivo", () => ({
    useNivelRender: () => "normal", nivelRender: () => "normal",
    presupuesto: () => ({ parallax: false, particulas: 0, inclinacionMax: 0, duracionEntradaMs: 0, halo: "suave" }),
}));
vi.mock("@/components/protomolecula/protomolecula-ligera", () => ({
    ProtomoleculaLigera: ({ estado }: { estado: string }) => (
        <svg data-testid="protomolecula-ligera" data-estado={estado} data-forma={estado === "error" ? "semilla" : estado} />
    ),
}));
vi.mock("@/lib/aurora/aurora-chat-log", () => ({
    readAuroraChatEntries: () => chat, AURORA_CHATLOG_CHANGE_EVENT: "x", AURORA_CHATLOG_KEY: "k",
}));

interface Puente {
    speaking: boolean; listening: boolean; actionStatus: string; error: boolean; supported: boolean; enabled: boolean;
    getState: () => Puente; subscribe: (cb: () => void) => () => void; start: () => void; stop: () => void;
}
let puente: Puente;
function crearPuente(extra: Partial<Puente> = {}): Puente {
    const p = { speaking: false, listening: false, actionStatus: "", error: false, supported: true, enabled: true, ...extra } as Puente;
    p.getState = () => ({ ...p });
    p.subscribe = (cb) => { cb(); return () => {}; };
    p.start = vi.fn(); p.stop = vi.fn();
    return p;
}

beforeEach(() => { clase = "m"; dispositivo = "escritorio"; chat = []; puente = crearPuente(); (window as unknown as { STARSEED_AURORA?: Puente }).STARSEED_AURORA = puente; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); (window as unknown as { STARSEED_AURORA?: Puente }).STARSEED_AURORA = undefined; });

import { AstrauraLibreProto } from "../astraura-libre-proto";

const widgetCon = (d: string) => ({ settings: { astrauraDiseno: d } }) as unknown as DashboardWidget;
async function pintar(widget?: DashboardWidget) { const r = render(<AstrauraLibreProto widget={widget} />); await act(async () => { await Promise.resolve(); }); return r; }
const marca = (c: HTMLElement, d: string) => c.querySelector(`[data-diseno="${d}"]`);
function sinDuplicados() {
    const n = screen.getAllByRole("button").map((el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    expect(new Set(n).size).toBe(n.length);
}

describe("Astraura por tamaño y diseño", () => {
    it.each(["micro", "s"] as ClaseTamano[])("compacto %s: Mínimo, sin hilo ni sugerencias, y avisa del degradado", async (c) => {
        clase = c; chat = [{ role: "user", text: "¿Qué tal?", ts: 1 }, { role: "aurora", text: "Todo en calma en la malla.", ts: 2 }];
        const { container } = await pintar(widgetCon("acciones"));
        expect(marca(container, "minimo")).toBeTruthy();
        expect(screen.queryByRole("group", { name: "Atajos para empezar rápido" })).toBeNull();
        sinDuplicados();
        fireEvent.click(screen.getByRole("button", { name: /Diseño/i }));
        expect(screen.getAllByRole("status").map((n) => n.textContent ?? "").some((t) => /Este tamaño es pequeño/.test(t))).toBe(true);
    });
    it.each(["m", "panoramico"] as ClaseTamano[])("medio %s: Conversación con chat y Acciones sin él", async (c) => {
        clase = c; chat = [{ role: "user", text: "¿Qué tal?", ts: 1 }, { role: "aurora", text: "Todo en calma en la malla.", ts: 2 }];
        let r = await pintar();
        expect(marca(r.container, "conversacion")).toBeTruthy();
        expect(r.container.querySelector('[aria-label="Última conversación"]')).toBeTruthy();
        sinDuplicados();
        cleanup(); chat = [];
        r = await pintar();
        expect(marca(r.container, "acciones")).toBeTruthy();
        expect(screen.getByRole("group", { name: "Atajos para empezar rápido" })).toBeTruthy();
    });
    it.each(["l", "xl", "torre"] as ClaseTamano[])("grande %s: Conversación o Acciones, y Voz en tableta con voz", async (c) => {
        clase = c; chat = [];
        let r = await pintar();
        expect(marca(r.container, "acciones")).toBeTruthy();
        sinDuplicados();
        cleanup(); chat = [{ role: "aurora", text: "Hola.", ts: 2 }];
        r = await pintar();
        expect(marca(r.container, "conversacion")).toBeTruthy();
        sinDuplicados();
        cleanup(); dispositivo = "tablet"; chat = [];
        r = await pintar();
        expect(marca(r.container, "voz")).toBeTruthy();
        expect(screen.getByRole("button", { name: /^Hablar con Astraura \(/ })).toBeTruthy();
    });
    it.each(["minimo", "conversacion", "acciones", "voz"])("elección explícita %s en clase grande deja su marca", async (d) => {
        clase = "l"; chat = [{ role: "aurora", text: "Hola.", ts: 2 }];
        const { container } = await pintar(widgetCon(d));
        expect(marca(container, d)).toBeTruthy();
        sinDuplicados();
    });
    it("error del puente se anuncia y la forma pasa a semilla", async () => {
        clase = "l"; chat = []; puente = crearPuente({ error: true });
        (window as unknown as { STARSEED_AURORA?: Puente }).STARSEED_AURORA = puente;
        await pintar();
        expect(screen.getAllByRole("status").map((n) => n.textContent ?? "").some((t) => /Algo falló|Astraura tuvo un problema/.test(t))).toBe(true);
        expect(screen.getAllByTestId("protomolecula-ligera").some((f) => f.getAttribute("data-forma") === "semilla")).toBe(true);
    });
});
