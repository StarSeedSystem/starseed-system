import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929) · Huella regenerativa: cuatro ciclos con dato REAL
// (sol y lluvia captables, bienes compartidos en uso, dones en la Red), cada
// uno con su fuente; «sin dato» nunca se convierte en un cero inventado.
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
let lugar: any = { location: { lat: 40.4, lon: -3.7, name: "Madrid" } };
vi.mock("@/modules/weather/context/weather-location-context", () => ({ useWeatherLocationOpcional: () => lugar }));
let recursos: any[] = [];
vi.mock("@/lib/governance/political", () => ({ loadCommonsResources: async () => ({ list: recursos, degraded: false }) }));
let posts: any[] = [];
vi.mock("@/utils/supabase/client", () => {
    const c: any = { select: () => c, order: () => c, limit: () => c, eq: () => c, then: (ok: any, ko: any) => Promise.resolve({ data: posts, error: null }).then(ok, ko) };
    return { createClient: () => ({ from: () => c }) };
});
const cielo = { daily: { time: ["2026-09-29", "2026-09-30"], shortwave_radiation_sum: [18, 18], precipitation_sum: [2, 3], sunshine_duration: [36000, 36000] } };
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => cielo }));

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { __reiniciarCacheB } from "../../gen2/_paquete-b/cache-compartida";
import { RegenTracerWidget, ciclos } from "../regen-tracer-widget";

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento: "#10b981", acento2: "#7c5cff", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    lugar = { location: { lat: 40.4, lon: -3.7, name: "Madrid" } };
    recursos = [{ id: "r1", name: "Taladro", type: "Herramienta", status: "En uso", updatedAt: "" }, { id: "r2", name: "Escalera", type: "Herramienta", status: "Disponible", updatedAt: "" }];
    posts = [{ id: "a", author_name: "Ana", created_at: new Date().toISOString(), titulo: "#don Semillas", cuerpo: "" }];
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("ciclos (puros)", () => {
    it("calcula cada ciclo y deja «sin dato» donde no hay fuente", () => {
        const l = ciclos({ cielo: { dias: [{ fecha: "a", solKwh: 5, lluviaL: 10, solHoras: 8 }], lugar: "" }, procomun: null, red: null, paneles: 10, tejado: 50 });
        expect(l.find((c) => c.id === "sol")?.valor).toBeCloseTo(9, 6);
        expect(l.find((c) => c.id === "agua")?.valor).toBeCloseTo(400, 6);
        expect(l.find((c) => c.id === "comun")?.valor).toBeNull();
        expect(l.find((c) => c.id === "don")?.valor).toBeNull();
    });
});

describe("Huella regenerativa", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("dibuja los ciclos reales en %s", async (clase) => {
        render(enMarco(clase, <RegenTracerWidget />));
        expect((await screen.findAllByLabelText(/Sol captable: 18 kWh \/ semana; Lluvia captable: 200 L \/ semana; Bienes compartidos en uso: 1 de 2 recursos; Dones en circulación: 1 en la Red/)).length).toBeGreaterThan(0);
    });
    it("sin lugar, el sol y la lluvia quedan sin dato (nunca cero)", async () => {
        lugar = null;
        render(enMarco("l", <RegenTracerWidget />));
        expect((await screen.findAllByText("sin dato")).length).toBe(2);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it("un cero medido es un cero (no un vacío), y sin ninguna fuente sí hay vacío honesto", async () => {
        lugar = null;
        recursos = [];
        posts = [];
        render(enMarco("m", <RegenTracerWidget />));
        expect((await screen.findAllByLabelText(/Bienes compartidos en uso: 0 de 0 recursos; Dones en circulación: 0 en la Red/)).length).toBeGreaterThan(0);
    });
});
