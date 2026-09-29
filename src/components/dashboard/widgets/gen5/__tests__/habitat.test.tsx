import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

let medida = { width: 380, height: 325 };
vi.mock("@/components/dashboard/kit/use-element-size", () => ({
    useElementSize: () => ({ ref: { current: null }, size: { ...medida, tier: "regular", vTier: "regular", landscape: true } }),
}));
let ubicacion: any = null;
vi.mock("@/modules/weather/context/weather-location-context", () => ({ useWeatherLocationOpcional: () => ubicacion }));

import { EnMarco, MEDIDAS } from "../_catalogo/prueba-marco";
import { _vaciarCompartidos } from "../_catalogo/recurso";
import { HabitatCoreWidget } from "../habitat-core-widget";
import { analizarHa, consejoVentilar, haListo, luzAhora, luzPara, CLAVE_HA } from "../habitat-core-partes";

const HA = [
    { entity_id: "sensor.salon_temperatura", state: "21.4", attributes: { friendly_name: "Salón", device_class: "temperature", unit_of_measurement: "°C" } },
    { entity_id: "sensor.salon_humedad", state: "48", attributes: { friendly_name: "Humedad", device_class: "humidity" } },
    { entity_id: "sensor.roto", state: "unavailable", attributes: { device_class: "temperature" } },
    { entity_id: "light.salon", state: "on", attributes: { friendly_name: "Lámpara" } },
    { entity_id: "light.cocina", state: "off", attributes: {} },
    { entity_id: "switch.riego", state: "off", attributes: { friendly_name: "Riego" } },
    { entity_id: "automation.x", state: "on" },
];
function meteo() {
    const base = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    const time = Array.from({ length: 6 }, (_, k) => new Date(base + (k - 1) * 3_600_000).toISOString().slice(0, 16));
    return { timezone: "UTC", utc_offset_seconds: 0, current: { temperature_2m: 18, relative_humidity_2m: 55, wind_speed_10m: 8, precipitation: 0 }, hourly: { time, precipitation_probability: time.map(() => 5), temperature_2m: time.map(() => 18) }, daily: { time: [] } };
}

let haStatus = 200;
const pedidas: { url: string; auth?: string }[] = [];
function pintar(clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase}><HabitatCoreWidget /></EnMarco>);
}
beforeEach(() => {
    localStorage.clear();
    _vaciarCompartidos();
    ubicacion = { location: { lat: 40.42, lon: -3.7, name: "Madrid" } };
    haStatus = 200;
    pedidas.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (u: string, o?: RequestInit) => {
        const url = String(u);
        pedidas.push({ url, auth: (o?.headers as Record<string, string> | undefined)?.Authorization });
        if (url.includes("open-meteo")) return new Response(JSON.stringify(meteo()), { status: 200 });
        return new Response(JSON.stringify(HA), { status: haStatus });
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("Núcleo del Hábitat", () => {
    it.each(TODAS)("(%s) sin Home Assistant no inventa habitaciones: luz y aire reales", async (clase) => {
        pintar(clase);
        await screen.findByRole("region", { name: /Luz para ahora: .* K.*Buen momento para ventilar: Fuera 18 °C y 55 % de humedad.*Casa: Home Assistant sin conectar/ });
        expect(pedidas.every((p) => p.url.includes("open-meteo"))).toBe(true);
    });

    it("con tu Home Assistant lee (solo GET) temperaturas y luces con tu llave", async () => {
        localStorage.setItem(CLAVE_HA, JSON.stringify({ enabled: true, url: "http://casa.local:8123/", token: "llave" }));
        pintar("xl");
        await screen.findByRole("region", { name: /Casa: Salón 21\.4 °C, 1 de 2 luces encendidas/ });
        const ha = pedidas.find((p) => p.url.includes("casa.local"))!;
        expect(ha.url).toBe("http://casa.local:8123/api/states");
        expect(ha.auth).toBe("Bearer llave");
        expect(screen.getByText("Salón")).toBeTruthy();
    });

    it("si Home Assistant rechaza la llave, lo dice (error)", async () => {
        localStorage.setItem(CLAVE_HA, JSON.stringify({ enabled: true, url: "http://casa.local:8123", token: "mala" }));
        haStatus = 401;
        pintar("xl");
        expect(await screen.findByText(/rechazó el token \(401\)/)).toBeTruthy();
    });

    it("sin ubicación lo dice y no pide el tiempo", () => {
        ubicacion = null;
        pintar("l");
        expect(screen.getByRole("region").getAttribute("aria-label")).toMatch(/Sin ubicación: vacío/);
        expect(pedidas).toHaveLength(0);
    });
});

describe("Hábitat · lógica", () => {
    it("pide la luz según la altura del Sol", () => {
        expect(luzPara(40).kelvin).toBe(5000);
        expect(luzPara(10).kelvin).toBe(4000);
        expect(luzPara(0).fase).toBe("dorada");
        expect(luzPara(-8).fase).toBe("crepusculo");
        expect(luzPara(-30).fase).toBe("noche");
        const r = luzAhora(new Date("2026-06-21T12:00:00Z"), 40.42, -3.7);
        expect(r.luz.fase).toBe("dia");
        expect(r.cambio!.en.getTime()).toBeGreaterThan(Date.parse("2026-06-21T12:00:00Z"));
    });
    it("aconseja ventilar con el tiempo de fuera", () => {
        const f = (o: Partial<{ temp: number; humedad: number; viento: number; lluvia: number }>) => ({ temp: 20, humedad: 50, viento: 5, lluvia: 0, ...o });
        expect(consejoVentilar(f({}), 0).abrir).toBe(true);
        expect(consejoVentilar(f({ lluvia: 0.4 }), 0).razon).toBe("Está lloviendo fuera");
        expect(consejoVentilar(f({}), 70).abrir).toBe(false);
        expect(consejoVentilar(f({ temp: 31 }), 0).abrir).toBe(false);
        expect(consejoVentilar(f({ temp: 4 }), 0).corto).toBe("Ventila 5 min");
        expect(consejoVentilar(f({ humedad: 92 }), 0).abrir).toBe(false);
    });
    it("lee los estados de Home Assistant y valida la conexión", () => {
        const h = analizarHa(HA);
        expect(h.temperaturas).toHaveLength(1);
        expect(h.humedades[0].valor).toBe(48);
        expect(h.luces.map((x) => x.encendido)).toEqual([true, false]);
        expect(h.enchufes).toHaveLength(1);
        expect(h.entidades).toBe(7);
        expect(() => analizarHa({})).toThrow();
        expect(haListo({ enabled: true, url: "http://x", token: "t" })).toBe(true);
        expect(haListo({ enabled: true, url: "javascript:alert(1)", token: "t" })).toBe(false);
        expect(haListo({ enabled: false, url: "http://x", token: "t" })).toBe(false);
    });
});
