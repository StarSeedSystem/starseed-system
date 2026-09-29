import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929): Metabolismo Oikos con el cielo REAL (Open-Meteo,
// simulado aquí) y estimaciones con supuestos a la vista; Árbol del mérito
// con las insignias reales y el criterio del motor (solo cuentan las avaladas).
// ════════════════════════════════════════════════════════════════

if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
    });
}
vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { widgets: { marco: "libre" }, animations: { enabled: false } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
let sesion: { uid: string | null; ready: boolean } = { uid: "u1", ready: true };
vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => sesion }));
let lugar: any = { location: { lat: 40.4168, lon: -3.7038, name: "Madrid" } };
vi.mock("@/modules/weather/context/weather-location-context", () => ({ useWeatherLocationOpcional: () => lugar }));

type Fila = Record<string, any>;
let tablas: Record<string, Fila[]> = {};
vi.mock("@/utils/supabase/client", () => {
    function consulta(tabla: string) {
        let filas = [...(tablas[tabla] ?? [])];
        const c: any = {
            select: () => c, order: () => c, limit: () => c,
            eq: (col: string, v: unknown) => { filas = filas.filter((f) => !(col in f) || f[col] === v); return c; },
            in: (col: string, vs: unknown[]) => { filas = filas.filter((f) => !(col in f) || vs.includes(f[col])); return c; },
            then: (ok: any, ko: any) => Promise.resolve({ data: filas, error: null }).then(ok, ko),
        };
        return c;
    }
    return { createClient: () => ({ from: (t: string) => consulta(t) }) };
});

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { __reiniciarCacheB } from "../_paquete-b/cache-compartida";
import { aguaTejado, energiaPaneles, leerRespuestaOikos } from "../_paquete-b/datos-oikos";
import { multiplicador, resumenAreas } from "../_paquete-b/datos-merito";
import { OikosMetabolismWidget } from "../oikos-metabolism-widget";
import { SkillTreeWidget, puntoRama } from "../skill-tree-widget";

const respuestaCielo = {
    daily: {
        time: ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],
        shortwave_radiation_sum: [18, 14.4, 9, 20, 21.6, 7.2, 12],
        precipitation_sum: [0, 2.5, 12, 0, 0, 20, 1],
        sunshine_duration: [36000, 28800, 10800, 39600, 40000, 3600, 20000],
    },
};
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => respuestaCielo }));

function enMarco(clase: ClaseTamano, ui: React.ReactElement, acento = "#10b981") {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento, acento2: "#7c5cff", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    sesion = { uid: "u1", ready: true };
    lugar = { location: { lat: 40.4168, lon: -3.7038, name: "Madrid" } };
    vi.stubGlobal("fetch", fetchMock);
    tablas = {
        badges: [
            { id: "b1", code: "asamblea", name: "Facilitadora de asambleas", description: "Ha facilitado 5 asambleas", area: "politica" },
            { id: "b2", code: "mediacion", name: "Mediación restaurativa", description: null, area: "politica" },
            { id: "b3", code: "mentora", name: "Mentora", description: null, area: "educacion" },
            { id: "b4", code: "cuidados", name: "Cuidados comunes", description: null, area: null },
        ],
        profiles: [{ id: "pf1", user_id: "u1" }],
        profile_badges: [
            { profile_id: "pf1", badge_id: "b1", awarded_at: new Date().toISOString(), awarded_by: "ana" },
            { profile_id: "pf1", badge_id: "b4", awarded_at: new Date().toISOString(), awarded_by: "u1" },
        ],
    };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("Oikos (puros)", () => {
    it("convierte la respuesta de Open-Meteo y estima captaciones", () => {
        const dias = leerRespuestaOikos(respuestaCielo);
        expect(dias).toHaveLength(7);
        expect(dias[0].solKwh).toBeCloseTo(5, 6);
        expect(dias[0].solHoras).toBe(10);
        expect(dias[2].lluviaL).toBe(12);
        expect(energiaPaneles(5, 10)).toBeCloseTo(9, 6);
        expect(aguaTejado(12, 50)).toBeCloseTo(480, 6);
        expect(leerRespuestaOikos(null)).toEqual([]);
    });
});

describe("Metabolismo Oikos", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("muestra el sol real de hoy en %s", async (clase) => {
        render(enMarco(clase, <OikosMetabolismWidget />));
        await waitFor(() => expect(screen.getAllByText(/^5$/).length).toBeGreaterThan(0));
    });
    it("una sola petición al cielo aunque haya dos widgets y estimación editable en l", async () => {
        render(enMarco("l", <><OikosMetabolismWidget /><OikosMetabolismWidget /></>));
        await waitFor(() => expect(screen.getAllByText(/Tu captación estimada/).length).toBe(2));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const paneles = screen.getAllByLabelText(/Paneles/)[0];
        fireEvent.change(paneles, { target: { value: "20" } });
        expect(screen.getAllByText(/≈ 18 kWh/).length).toBeGreaterThan(0);
    });
    it("vacío honesto sin ubicación: elegirla en el Clima", async () => {
        lugar = null;
        render(enMarco("m", <OikosMetabolismWidget />));
        expect(await screen.findByText("¿Dónde está tu Oikos?")).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it("error honesto si el servicio del cielo no responde", async () => {
        fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) }) as any);
        render(enMarco("m", <OikosMetabolismWidget />));
        expect(await screen.findByText("El servicio del cielo no responde ahora.")).toBeInTheDocument();
    });
});

describe("Mérito (puros)", () => {
    it("solo cuentan las insignias avaladas por otra persona, con tope ×2", () => {
        const mias = [
            { area: "politica" as const, avalada: true },
            { area: "general" as const, avalada: false },
            { area: "general" as const, avalada: true },
        ];
        expect(multiplicador(mias, "politica")).toBe(2);
        expect(multiplicador(mias, "cultura")).toBe(1.5);
        expect(multiplicador([], "politica")).toBe(1);
        const r = resumenAreas({ catalogo: [{ id: "a", codigo: "a", nombre: "A", descripcion: null, area: "politica" }], mias: [] });
        expect(r.find((x) => x.area === "politica")).toMatchObject({ tienes: 0, hay: 1, mult: 1 });
        const p = puntoRama("politica", 1);
        expect(p.x).toBeCloseTo(26, 6);
    });
});

describe("Árbol del mérito", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("dibuja tu árbol real en %s", async (clase) => {
        render(enMarco(clase, <SkillTreeWidget />, "#7c5cff"));
        expect((await screen.findAllByLabelText(/Tienes 2 de 4 insignias; 1 avaladas/)).length).toBeGreaterThan(0);
    });
    it("en l muestra el peso de mérito real y tus últimas insignias", async () => {
        render(enMarco("l", <SkillTreeWidget />, "#7c5cff"));
        expect(await screen.findByRole("list", { name: "Insignias y peso de mérito por área" })).toBeInTheDocument();
        expect(screen.getByText("×1,5")).toBeInTheDocument();
        expect(screen.getByText("Facilitadora de asambleas")).toBeInTheDocument();
        expect(screen.getByText("Mis insignias").closest("a")).toHaveAttribute("href", "/insignias");
    });
    it("sin sesión: el catálogo sin encender y «Entra para ver tu mérito»", async () => {
        sesion = { uid: null, ready: true };
        render(enMarco("m", <SkillTreeWidget />, "#7c5cff"));
        expect(await screen.findByText("Entra para ver tu mérito")).toBeInTheDocument();
    });
    it("catálogo vacío: vacío honesto", async () => {
        tablas.badges = [];
        render(enMarco("m", <SkillTreeWidget />, "#7c5cff"));
        expect(await screen.findByText("Aún no hay insignias en el catálogo")).toBeInTheDocument();
    });
});
