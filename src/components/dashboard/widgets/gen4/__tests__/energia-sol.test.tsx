import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

let medida = { width: 380, height: 325 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
let ubicacion: any = null;
vi.mock("@/modules/weather/context/weather-location-context", () => ({ useWeatherLocationOpcional: () => ubicacion }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => null, usuarioActual: async () => null }));
vi.mock("@/lib/governance/political", () => ({ loadCommonsResources: async () => ({ list: [{ id: "e1", name: "Batería", type: "Energía", status: "Disponible" }], degraded: false }) }));

import { EnMarco, MEDIDAS } from "../../gen5/_catalogo/prueba-marco";
import { _vaciarCompartidos } from "../../gen5/_catalogo/recurso";
import { EnergyGridWidget } from "../energy-grid-widget";
import { cambioPct, diaSolar, franjaDe, kwhPorKwp } from "../energy-grid-partes";
import { analizarMeteo } from "../../gen5/_catalogo/meteo";

/** Open-Meteo sintético en UTC: sol de 8 a 20 h, con el pico hacia las 14 h; mañana más nublado. */
function respuesta() {
    const time: string[] = [], rad: number[] = [];
    const dias = ["2026-09-29", "2026-09-30", "2026-10-01"];
    dias.forEach((f, k) => {
        for (let h = 0; h < 24; h++) {
            time.push(`${f}T${String(h).padStart(2, "0")}:00`);
            const x = (h - 8) / 12;
            rad.push(x > 0 && x < 1 ? Math.round(Math.sin(Math.PI * x) * (k === 1 ? 500 : 800)) : 0);
        }
    });
    const n = time.length;
    return {
        timezone: "UTC", utc_offset_seconds: 0,
        current: { temperature_2m: 20, shortwave_radiation: 600, weather_code: 1, is_day: 1 },
        hourly: { time, shortwave_radiation: rad, temperature_2m: Array(n).fill(20), is_day: Array(n).fill(1) },
        daily: { time: dias, sunrise: dias.map((f) => `${f}T07:50`), sunset: dias.map((f) => `${f}T19:45`), shortwave_radiation_sum: [22.5, 14.4, 20] },
    };
}

const pedidas: string[] = [];
let caida = false;
function pintar(clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase}><EnergyGridWidget /></EnMarco>);
}

beforeEach(() => {
    localStorage.clear();
    _vaciarCompartidos();
    ubicacion = null;
    caida = false;
    pedidas.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
        pedidas.push(String(u));
        return caida ? new Response("x", { status: 503 }) : new Response(JSON.stringify(respuesta()), { status: 200 });
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("Energía del Sol", () => {
    it.each(TODAS)("sin ubicación (%s) lo dice y no pide nada", (clase) => {
        pintar(clase);
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/sin ubicación/);
        expect(pedidas).toHaveLength(0);
    });

    it.each(TODAS)("a mediodía (%s) enseña la energía de hoy y la franja de abundancia en curso", async (clase) => {
        ubicacion = { location: { lat: 40.4, lon: -3.7, name: "Madrid" } };
        vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-29T12:30:00Z"));
        pintar(clase);
        const r = await screen.findByRole("region", { name: /hoy 5,0 kWh por cada kWp de paneles \(estimación\), franja de abundancia 10:00–17:00 \(ahora\)\. Mañana 3,2 kWh/ });
        expect(r).toBeTruthy();
        expect(pedidas).toHaveLength(1);
        expect(pedidas[0]).toContain("shortwave_radiation");
    });

    it("pasada la puesta de sol enseña la de mañana", async () => {
        ubicacion = { location: { lat: 40.4, lon: -3.7, name: "Madrid" } };
        vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-29T21:00:00Z"));
        pintar("xl");
        await screen.findByRole("region", { name: /mañana 3,2 kWh .*\. Hoy fueron 5,0 kWh/ });
        expect(screen.getByText("Franja de mañana")).toBeTruthy();
        expect(await screen.findByText(/Procomún: 1 recurso de energía, 1 libre/)).toBeTruthy();
    });

    it("si la fuente del tiempo cae, lo dice (error) y deja reintentar", async () => {
        ubicacion = { location: { lat: 40.4, lon: -3.7, name: "Madrid" } };
        caida = true;
        pintar("l");
        expect(await screen.findByRole("region", { name: /error/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Reintentar/ })).toBeTruthy();
    });
});

describe("Energía del Sol · lógica", () => {
    it("convierte MJ/m² en kWh por kWp con el rendimiento", () => {
        expect(kwhPorKwp(18)).toBeCloseTo(4, 5);
        expect(kwhPorKwp(-3)).toBe(0);
        expect(cambioPct(4, 5)).toBe(25);
        expect(cambioPct(0, 5)).toBeNull();
    });
    it("recorta el día a las horas con luz y halla la franja alrededor del pico", () => {
        const m = analizarMeteo(respuesta());
        const d = diaSolar(m, 0)!;
        expect(d.fecha).toBe("2026-09-29");
        expect(d.puntos[0].w).toBe(0);
        expect(d.puntos[d.puntos.length - 1].w).toBe(0);
        expect(d.puntos.filter((p) => p.w > 0)).toHaveLength(11);
        expect(new Date(d.pico!.t).toISOString()).toBe("2026-09-29T14:00:00.000Z");
        expect(new Date(d.franja!.desde).toISOString()).toBe("2026-09-29T10:00:00.000Z");
        expect(new Date(d.franja!.hasta).toISOString()).toBe("2026-09-29T17:00:00.000Z");
        expect(franjaDe([], null)).toBeNull();
        expect(diaSolar(m, 7)).toBeNull();
    });
});
