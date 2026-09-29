import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B · familia económica (Ola 0929): Cartera y Pulso económico con
// la Bolsa de la Semilla y la cartera REALES (Supabase simulado aquí), una
// sola lectura compartida, un diseño por tamaño y la beta dicha en voz alta.
// ════════════════════════════════════════════════════════════════

if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
    });
}

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { widgets: { marco: "libre" }, animations: { enabled: false } } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/lib/consumo/freno", () => ({ frenoActivo: () => false }));
let sesion: { uid: string | null; ready: boolean } = { uid: "u1", ready: true };
vi.mock("@/lib/widget-data/os-live", () => ({ useCurrentUid: () => sesion }));

type Fila = Record<string, any>;
let tablas: Record<string, Fila[]> = {};
let fallar: Set<string> = new Set();
const pedidas: string[] = [];
vi.mock("@/utils/supabase/client", () => {
    function consulta(tabla: string) {
        pedidas.push(tabla);
        let filas = [...(tablas[tabla] ?? [])];
        const respuesta = (unica: boolean) => Promise.resolve(
            fallar.has(tabla) ? { data: null, error: { message: "402" } } : { data: unica ? filas[0] ?? null : filas, error: null },
        );
        const c: any = {
            select: () => c, order: () => c, limit: () => c,
            eq: (col: string, v: unknown) => { filas = filas.filter((f) => !(col in f) || f[col] === v); return c; },
            maybeSingle: () => ({ then: (ok: any, ko: any) => respuesta(true).then(ok, ko) }),
            then: (ok: any, ko: any) => respuesta(false).then(ok, ko),
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
import { compacto, composicion, estadisticas, gramosDe, valorCartera, variacion } from "../_paquete-b/datos-economia";
import { CarteraStarseedWidget } from "../../cartera-starseed";
import { EconomicOverviewWidget } from "../../economic-overview-widget";

const dia = (i: number) => `2026-09-${String(i).padStart(2, "0")}`;
function semilla() {
    tablas = {
        seed_market: Array.from({ length: 28 }, (_, i) => ({ day: dia(28 - i), seed_eur: 1 + (28 - i) * 0.01 })),
        grain_types: [
            { id: "cafe", name: "Café", color: "#b45309", seeds_per_100g: 12 },
            { id: "cacao", name: "Cacao", color: "#7c2d12", seeds_per_100g: 20 },
        ],
        wallets: [{ user_id: "u1", semillas: 1500, granos: { cafe: 200, Cacao: 50 } }],
        economy_ledger: [
            { user_id: "u1", kind: "don", seeds: 40, name: "Don de la asamblea", ts: new Date(Date.now() - 3_600_000).toISOString() },
            { user_id: "u1", kind: "cafe", seeds: -12, name: "Café en el Café StarSeed", ts: new Date(Date.now() - 7_200_000).toISOString() },
        ],
    };
}

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento: "#10b981", acento2: "#7c5cff", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    sesion = { uid: "u1", ready: true };
    fallar = new Set();
    pedidas.length = 0;
    semilla();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("datos económicos (puros)", () => {
    const granos = [{ id: "cafe", nombre: "Café", color: "#b45309", semillasPor100g: 12 }, { id: "cacao", nombre: "Cacao", color: "#7c2d12", semillasPor100g: 20 }];
    it("lee gramos por id o por nombre y compone la cartera", () => {
        expect(gramosDe({ Cacao: 50 }, granos[1])).toBe(50);
        const c = composicion({ cafe: 200, Cacao: 50 }, granos);
        expect(c.map((f) => f.grano.id)).toEqual(["cafe", "cacao"]);
        expect(c[0].semillas).toBe(24);
        expect(c[0].pct + c[1].pct).toBeCloseTo(1, 6);
        expect(valorCartera(100, { cafe: 100 }, granos, 2)).toBe(224);
        expect(valorCartera(100, {}, granos, null)).toBeNull();
    });
    it("variación, estadísticas y formato compacto", () => {
        const serie = [1, 1.1, 1.21].map((eur, i) => ({ dia: dia(i + 1), eur }));
        expect(variacion(serie, 1)).toBeCloseTo(10, 6);
        expect(variacion(serie, 30)).toBeCloseTo(21, 6);
        const e = estadisticas(serie)!;
        expect(e.min).toBe(1);
        expect(e.max).toBe(1.21);
        expect(e.volatilidad).toBeCloseTo(0, 6);
        expect(compacto(12_345)).toBe("12,3 k");
        expect(compacto(980)).toBe("980");
    });
});

describe("Cartera StarSeed", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("pinta tu saldo real en %s", async (clase) => {
        render(enMarco(clase, <CarteraStarseedWidget />));
        await waitFor(() => expect(screen.getAllByText(/^1500$|^1\.500$/).length).toBeGreaterThan(0));
    });
    it("en l trae composición en granos, movimientos y la beta dicha", async () => {
        render(enMarco("l", <CarteraStarseedWidget />));
        expect(await screen.findByRole("list", { name: "Últimos movimientos" })).toBeInTheDocument();
        expect(screen.getByText("Don de la asamblea")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /Composición: Café/ })).toBeInTheDocument();
        expect(screen.getAllByLabelText(/Beta simulada/).length).toBeGreaterThan(0);
    });
    it("la bolsa se pide UNA vez aunque Cartera y Pulso estén juntos", async () => {
        render(enMarco("m", <><CarteraStarseedWidget /><EconomicOverviewWidget /></>));
        await waitFor(() => expect(screen.getAllByText(/Beta simulada/).length).toBeGreaterThan(0));
        expect(pedidas.filter((t) => t === "seed_market")).toHaveLength(1);
    });
    it("sin sesión: la bolsa pública y «Entra para ver tu cartera»", async () => {
        sesion = { uid: null, ready: true };
        render(enMarco("m", <CarteraStarseedWidget />));
        expect((await screen.findByText("Entra para ver tu cartera")).closest("a")).toHaveAttribute("href", "/login");
        expect(screen.getByText("La Semilla hoy")).toBeInTheDocument();
    });
    it("cartera vacía: existe a 0 y se dice cómo se abre", async () => {
        tablas.wallets = [];
        tablas.economy_ledger = [];
        render(enMarco("l", <CarteraStarseedWidget />));
        expect(await screen.findByText("Tu cartera se abre al recibir tus primeras semillas.")).toBeInTheDocument();
        expect(screen.getByText("Sin movimientos todavía.")).toBeInTheDocument();
    });
    it("error honesto si no se puede leer nada", async () => {
        fallar = new Set(["seed_market", "grain_types", "wallets", "economy_ledger"]);
        render(enMarco("m", <CarteraStarseedWidget />));
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });
});

describe("Pulso económico", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("muestra el precio real de la Semilla en %s", async (clase) => {
        render(enMarco(clase, <EconomicOverviewWidget />));
        await waitFor(() => expect(screen.getAllByText(/1,28/).length).toBeGreaterThan(0));
    });
    it("en xl la calculadora convierte gramos en semillas y euros", async () => {
        render(enMarco("xl", <EconomicOverviewWidget />));
        const gramos = await screen.findByLabelText("Gramos");
        fireEvent.change(gramos, { target: { value: "500" } });
        expect(screen.getByRole("status")).toHaveTextContent("= 60 semillas");
        fireEvent.change(screen.getByLabelText("Grano"), { target: { value: "cacao" } });
        expect(screen.getByRole("status")).toHaveTextContent("= 100 semillas");
    });
    it("en l cambia de periodo", async () => {
        render(enMarco("l", <EconomicOverviewWidget />));
        fireEvent.click(await screen.findByRole("radio", { name: "7 d" }));
        expect(screen.getByRole("radio", { name: "7 d" })).toHaveAttribute("aria-checked", "true");
    });
    it("vacío honesto sin cotizaciones ni granos", async () => {
        tablas.seed_market = [];
        tablas.grain_types = [];
        render(enMarco("m", <EconomicOverviewWidget />));
        expect(await screen.findByText("La Bolsa aún no tiene cotizaciones")).toBeInTheDocument();
    });
});
