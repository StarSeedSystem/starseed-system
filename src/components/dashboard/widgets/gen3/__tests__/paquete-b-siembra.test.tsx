import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929) · Soberanía alimentaria: el tiempo REAL del lugar
// (Open-Meteo, simulado aquí) cruzado con reglas de siembra a la vista.
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
let lugar: any = { location: { lat: 40.4168, lon: -3.7038, name: "Madrid" } };
vi.mock("@/modules/weather/context/weather-location-context", () => ({ useWeatherLocationOpcional: () => lugar }));

const dias = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
function respuesta(suelo: number, minima: number, maxima: number) {
    return {
        daily: { time: dias, temperature_2m_min: dias.map(() => minima), temperature_2m_max: dias.map(() => maxima), precipitation_sum: dias.map((_, i) => (i === 2 ? 6 : 0)) },
        hourly: { time: dias.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`)), soil_temperature_6cm: dias.flatMap(() => Array.from({ length: 24 }, () => suelo)) },
    };
}
let cuerpo: any = respuesta(12, 6, 24);
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => cuerpo }));

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { __reiniciarCacheB } from "../../gen2/_paquete-b/cache-compartida";
import { consejos, leerRespuestaSiembra, resumenSemana } from "../../gen2/_paquete-b/datos-siembra";
import { FoodOracleWidget } from "../food-oracle-widget";

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento: "#10b981", acento2: "#7c5cff", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

beforeEach(() => {
    __reiniciarCacheB();
    try { window.localStorage.clear(); } catch { /* */ }
    lugar = { location: { lat: 40.4168, lon: -3.7038, name: "Madrid" } };
    cuerpo = respuesta(12, 6, 24);
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("siembra (puros)", () => {
    it("promedia el suelo por día y decide con motivo", () => {
        const d = leerRespuestaSiembra(respuesta(12, 6, 24));
        expect(d).toHaveLength(7);
        expect(d[0].sueloC).toBe(12);
        const s = resumenSemana(d);
        expect(s).toMatchObject({ sueloMedio: 12, minima: 6, maxima: 24, diaHelada: null, lluvia: 6 });
        const c = consejos(s);
        expect(c.find((x) => x.cultivo.nombre === "Lechuga")).toMatchObject({ veredicto: "ahora" });
        expect(c.find((x) => x.cultivo.nombre === "Tomate")).toMatchObject({ veredicto: "esperar", motivo: "noches de 6°: necesita ≥ 8°" });
        expect(c.find((x) => x.cultivo.nombre === "Maíz")).toMatchObject({ veredicto: "ahora" });
        const helada = consejos(resumenSemana(leerRespuestaSiembra(respuesta(3, -2, 12))));
        expect(helada.find((x) => x.cultivo.nombre === "Calabacín")?.motivo).toMatch(/noches de -2°/);
        expect(leerRespuestaSiembra(null)).toEqual([]);
    });
});

describe("Soberanía alimentaria", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("aconseja con el tiempo real en %s", async (clase) => {
        render(enMarco(clase, <FoodOracleWidget />));
        // En micro el rótulo que no cabe se retira y la frase entera va en el nombre del glifo.
        await waitFor(() => expect(screen.queryAllByText(/Lechuga|para sembrar/).length + screen.queryAllByRole("img", { name: /Lechuga|sembrar/ }).length).toBeGreaterThan(0));
    });
    it("en l cambia de grupo y explica el motivo", async () => {
        render(enMarco("l", <FoodOracleWidget />));
        fireEvent.click(await screen.findByRole("radio", { name: /Espera/ }));
        expect(screen.getAllByText(/noches de 6°: necesita ≥ 8°/).length).toBeGreaterThan(1);
    });
    it("vacío honesto sin ubicación y error si el tiempo no responde", async () => {
        lugar = null;
        const { unmount } = render(enMarco("m", <FoodOracleWidget />));
        expect(await screen.findByText("¿Dónde está tu huerta?")).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
        lugar = { location: { lat: 1, lon: 1, name: "Otro" } };
        fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) }) as any);
        render(enMarco("m", <FoodOracleWidget />));
        expect(await screen.findByText("El servicio del tiempo no responde ahora.")).toBeInTheDocument();
    });
});
