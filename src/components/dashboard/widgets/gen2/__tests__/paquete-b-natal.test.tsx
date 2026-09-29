import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ════════════════════════════════════════════════════════════════
// Paquete B (Ola 0929) · Carta natal REAL: posiciones, Ascendente y Medio
// Cielo por tiempo sidéreo, casas iguales, aspectos y tránsitos; sin datos,
// el cielo de ahora y un formulario que guarda solo en este dispositivo.
// ════════════════════════════════════════════════════════════════

if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
    });
}
vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { widgets: { marco: "libre" }, animations: { enabled: false } } }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));
vi.mock("@/modules/weather/context/weather-location-context", () => ({
    useWeatherLocationOpcional: () => ({ location: { lat: 40.4168, lon: -3.7038, name: "Madrid", timezone: "Europe/Madrid" } }),
}));
const buscarLugares = vi.fn(async () => [{ name: "Sevilla", country: "España", lat: 37.39, lon: -5.99, timezone: "Europe/Madrid" }]);
vi.mock("@/lib/geocoding", () => ({ searchPlaces: (q: string, n: number) => buscarLugares(q, n) }));

import { ContextoMarco } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { angulos, aspectos, calcularCarta, instanteNacimiento, separacion, validarNacimiento } from "../_paquete-b/datos-natal";
import { NatalChartWidget } from "../natal-chart-widget";

function enMarco(clase: ClaseTamano, ui: React.ReactElement) {
    const { base, horizontal } = disenoDe(clase);
    return <ContextoMarco.Provider value={{ acento: "#818cf8", acento2: "#23d5ab", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] }}>{ui}</ContextoMarco.Provider>;
}

const MADRID = { nombre: "Madrid", lat: 40.4168, lon: -3.7038, zona: "Europe/Madrid" };

beforeEach(() => { try { window.localStorage.clear(); } catch { /* */ } });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("carta natal (puros)", () => {
    it("convierte la hora local del lugar a UTC con su horario de verano", () => {
        expect(instanteNacimiento({ fecha: "1990-06-15", hora: "12:00", lugar: MADRID })?.toISOString()).toBe("1990-06-15T10:00:00.000Z");
        expect(instanteNacimiento({ fecha: "1990-01-15", hora: "12:00", lugar: MADRID })?.toISOString()).toBe("1990-01-15T11:00:00.000Z");
        expect(instanteNacimiento({ fecha: "no", hora: null, lugar: null })).toBeNull();
    });
    it("calcula Ascendente y Medio Cielo por tiempo sidéreo (1 ene 2000, 12 UT, Greenwich)", () => {
        const { asc, mc } = angulos(new Date(Date.UTC(2000, 0, 1, 12)), 51.48, 0);
        expect(Math.floor(asc / 30)).toBe(0);            // Aries
        expect(asc).toBeGreaterThan(20);
        expect(asc).toBeLessThan(28);
        expect(Math.floor(mc / 30)).toBe(9);             // Capricornio
    });
    it("sin hora no hay Ascendente ni casas; con hora y lugar, sí", () => {
        const sin = calcularCarta({ fecha: "1990-06-15", hora: null, lugar: MADRID })!;
        expect(sin.sinHora).toBe(true);
        expect(sin.asc).toBeNull();
        expect(sin.cuerpos).toHaveLength(7);
        expect(sin.cuerpos.find((c) => c.cuerpo === "Sol")?.signo).toBe("Géminis");
        const con = calcularCarta({ fecha: "1990-06-15", hora: "08:30", lugar: MADRID })!;
        expect(con.cuerpos.map((c) => c.cuerpo)).toContain("Ascendente");
        expect(con.cuerpos.find((c) => c.cuerpo === "Sol")?.casa).toBeGreaterThanOrEqual(1);
    });
    it("encuentra aspectos por separación y valida el formulario", () => {
        expect(separacion(350, 10)).toBe(20);
        const a = { cuerpo: "Sol" as const, simbolo: "☉", lon: 10, signo: "Aries", indiceSigno: 0, grado: 10, casa: null };
        const b = { ...a, cuerpo: "Luna" as const, lon: 131 };
        expect(aspectos([a], [b])[0]).toMatchObject({ tipo: "trígono" });
        expect(validarNacimiento({ fecha: "2999-01-01" })).toMatch(/futura/);
        expect(validarNacimiento({ fecha: "1990-06-15", hora: "8.30" })).toMatch(/HH:MM/);
        expect(validarNacimiento({ fecha: "1990-06-15", hora: "08:30" })).toBeNull();
    });
});

describe("Carta natal", () => {
    it("sin datos: el cielo de ahora y el formulario guarda en este dispositivo", async () => {
        render(enMarco("l", <NatalChartWidget />));
        fireEvent.click(await screen.findByRole("button", { name: /Añadir mi nacimiento/ }));
        fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "1990-06-15" } });
        fireEvent.change(screen.getByLabelText(/Hora/), { target: { value: "08:30" } });
        fireEvent.change(screen.getByLabelText("Buscar lugar"), { target: { value: "Sevilla" } });
        fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
        fireEvent.click(await screen.findByRole("button", { name: "Sevilla, España" }));
        fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
        expect(await screen.findByRole("list", { name: "Tus tres pilares" })).toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem("starseed.carta-natal.v1")!)).toMatchObject({ fecha: "1990-06-15", hora: "08:30", lugar: { nombre: "Sevilla, España" } });
        expect(screen.getByText("Ascendente")).toBeInTheDocument();
    });
    it("error del formulario: una fecha futura no se guarda", async () => {
        render(enMarco("m", <NatalChartWidget />));
        fireEvent.click(await screen.findByRole("button", { name: /Añadir mi nacimiento/ }));
        fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2999-01-01" } });
        fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
        expect(await screen.findByRole("alert")).toHaveTextContent(/futura/);
        expect(localStorage.getItem("starseed.carta-natal.v1")).toBeNull();
    });
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as ClaseTamano[])("pinta tu carta real en %s", async (clase) => {
        localStorage.setItem("starseed.carta-natal.v1", JSON.stringify({ fecha: "1990-06-15", hora: null, lugar: MADRID }));
        render(enMarco(clase, <NatalChartWidget />));
        await waitFor(() => expect(screen.getAllByLabelText(/Sol en Géminis/).length).toBeGreaterThan(0));
    });
    it("en xl trae la tabla de posiciones y puede borrar tus datos", async () => {
        localStorage.setItem("starseed.carta-natal.v1", JSON.stringify({ fecha: "1990-06-15", hora: "08:30", lugar: MADRID }));
        render(enMarco("xl", <NatalChartWidget />));
        expect(await screen.findByRole("table", { name: "Posiciones natales" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Editar nacimiento/ }));
        fireEvent.click(await screen.findByRole("button", { name: /Borrar mis datos/ }));
        expect(localStorage.getItem("starseed.carta-natal.v1")).toBeNull();
        expect((await screen.findAllByText("El cielo de ahora")).length).toBeGreaterThan(0);
    });
});
