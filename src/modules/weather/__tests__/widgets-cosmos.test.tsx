import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextoMarco, type ContextoMarcoUnificado } from "@/components/dashboard/kit/contexto-marco";
import { ESPACIADO_MARCO } from "@/components/widgets-libres/marco-unificado";
import { disenoDe } from "@/components/widgets-libres/familias/comun";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { respuestaPara } from "../__pruebas__/fixtures";
import { fuenteAurora, fuenteEscalas, fuenteKp, fuenteMagnetometro, fuentePlasma, fuenteSol, fuenteVientoResumen } from "../datos/noaa";
import { titularCosmos } from "../datos/interpretar";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: any) => <a href={String(href)} {...r}>{children}</a> }));

import { KpIndexWidget, maximosPorDia } from "../components/widgets/space/space-weather-kp-index-widget";
import { XRayFlareWidget } from "../components/widgets/space/space-weather-flare-widget";
import { MagnetometerWidget, variacionCampo } from "../components/widgets/space/space-weather-magnetometer-widget";
import { SpaceEnergySchumannWidget } from "../components/widgets/space/space-energy-schumann-widget";
import { SpaceEnergySolarWidget } from "../components/widgets/solar/space-energy-solar-widget";
import { SolarWindWidget } from "../components/widgets/space/space-weather-solar-wind-widget";
import { horasDoradas } from "../components/widgets/terrestrial/weather-astronomy-widget";
import { SpaceWeatherWidget } from "@/components/dashboard/widgets/space/space-weather-widget";
import { SpaceWeatherApp } from "@/components/dashboard/widgets/space/space-weather-app";

function marco(clase: ClaseTamano): ContextoMarcoUnificado {
    const { base, horizontal } = disenoDe(clase);
    return { acento: "#34d399", acento2: "#a78bfa", clase, base, horizontal, espaciado: ESPACIADO_MARCO[base] };
}
const pintar = (el: React.ReactElement, clase: ClaseTamano) => render(<ContextoMarco.Provider value={marco(clase)}>{el}</ContextoMarco.Provider>);

let falla = false;
beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("starseed_weather_location", JSON.stringify({ lat: 60.17, lon: 24.94, name: "Helsinki" }));
    for (const f of [fuenteAurora, fuenteEscalas, fuenteKp, fuenteMagnetometro, fuentePlasma, fuenteSol, fuenteVientoResumen]) f._vaciar();
    falla = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (falla) throw new Error("red caída");
        return { ok: true, status: 200, json: async () => respuestaPara(String(url)) };
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Clima espacial · un diseño por tamaño con datos de NOAA", () => {
    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as const)("Kp en %s", async (clase) => {
        pintar(<KpIndexWidget />, clase);
        if (clase === "micro") expect(await screen.findByRole("img", { name: /Índice Kp 3\.3/ })).toBeInTheDocument();
        else expect(await screen.findByRole("img", { name: /Índice Kp 3,3: Sin tormenta/ })).toBeInTheDocument();
        if (clase === "l" || clase === "xl") expect(screen.getByRole("img", { name: /Kp de las últimas/ })).toBeInTheDocument();
        if (clase === "xl") expect(await screen.findByRole("img", { name: /Óvalo auroral del hemisferio norte/ })).toBeInTheDocument();
    });

    it.each(["s", "m", "l", "xl"] as const)("llamaradas en %s", async (clase) => {
        pintar(<XRayFlareWidget />, clase);
        expect(await screen.findByRole("img", { name: /Rayos X ahora: clase B3\.2/ })).toBeInTheDocument();
        if (clase === "l" || clase === "xl") expect(screen.getByRole("img", { name: /1 de clase X|0 de clase X, 1 M y 1 C/ })).toBeInTheDocument();
    });

    it.each(["s", "m", "l"] as const)("viento solar en %s", async (clase) => {
        pintar(<SpaceEnergySolarWidget />, clase);
        expect((await screen.findAllByText("512")).length).toBeGreaterThan(0);
        if (clase !== "s") expect(screen.getByRole("img", { name: /Viento solar a 512 km\/s/ })).toBeInTheDocument();
    });

    it("la variante heredada del viento solar es el mismo widget real", async () => {
        pintar(<SolarWindWidget />, "m");
        expect((await screen.findAllByText("512")).length).toBeGreaterThan(0);
    });

    it.each(["s", "m", "l"] as const)("magnetómetro en %s", async (clase) => {
        pintar(<MagnetometerWidget />, clase);
        expect((await screen.findAllByText(/^Hp/)).length).toBeGreaterThan(0);
        if (clase !== "s") expect(screen.getByRole("img", { name: /Componente Hp del campo magnético/ })).toBeInTheDocument();
    });

    it.each(["micro", "s", "m", "l"] as const)("Schumann en %s dice que es referencia", async (clase) => {
        pintar(<SpaceEnergySchumannWidget />, clase);
        expect((await screen.findAllByText(/7,83/)).length).toBeGreaterThan(0);
        if (clase === "m" || clase === "l") expect(screen.getByText(/no hay una fuente abierta que la mida en vivo/)).toBeInTheDocument();
        if (clase === "l") expect(screen.getByRole("link", { name: /observatorio de Tomsk/ })).toHaveAttribute("rel", "noopener noreferrer");
    });

    it.each(["micro", "s", "m", "l", "xl", "panoramico", "torre"] as const)("panel de clima espacial en %s", async (clase) => {
        pintar(<SpaceWeatherWidget />, clase);
        if (clase === "micro") expect(await screen.findByRole("img", { name: /Clima espacial: Tranquilo/ })).toBeInTheDocument();
        else expect((await screen.findAllByText(/Tranquilo: sin tormentas/)).length).toBeGreaterThan(0);
        if (clase === "l") {
            fireEvent.click(screen.getByRole("tab", { name: /Radiación/ }));
            expect(await screen.findByText(/Rayos X B3\.2/)).toBeInTheDocument();
            fireEvent.click(screen.getByRole("tab", { name: /Aurora/ }));
            expect(await screen.findByText(/Aurora sobre Helsinki/)).toBeInTheDocument();
        }
    });

    it("si NOAA falla, lo dice y ofrece reintentar", async () => {
        falla = true;
        pintar(<KpIndexWidget />, "m");
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
        cleanup();
        pintar(<SpaceWeatherWidget />, "m");
        expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    });

    it("la vista app reúne todos los instrumentos con una sola petición por fuente", async () => {
        render(<SpaceWeatherApp />);
        for (const nombre of ["Panel de clima espacial", "Índice Kp", "Viento solar", "Llamaradas solares", "Magnetómetro", "Resonancia Schumann"]) {
            expect(screen.getByRole("region", { name: nombre })).toBeInTheDocument();
        }
        await screen.findAllByRole("img", { name: /Índice Kp/ });
        const llamadas = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([u]) => String(u).includes("k-index-forecast"));
        expect(llamadas.length).toBeLessThanOrEqual(1);
    });

    it("varios widgets del cosmos comparten una sola petición de Kp", async () => {
        pintar(<><KpIndexWidget /><SpaceWeatherWidget /><MagnetometerWidget /></>, "m");
        await screen.findAllByRole("img", { name: /Índice Kp/ });
        const llamadas = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([u]) => String(u).includes("k-index-forecast"));
        expect(llamadas).toHaveLength(1);
    });
});

describe("Clima espacial · lógica pura", () => {
    it("titular: lo peor manda y se dice en claro", () => {
        expect(titularCosmos({ g: 0, r: 0, s: 0, kp: 2, claseRayos: "B1.0", maxPrevistoKp: 3 }).severidad).toBe("calma");
        expect(titularCosmos({ g: 2, r: 0, s: 0, kp: 6.3, claseRayos: null, maxPrevistoKp: null }).texto).toMatch(/G2 · Moderada.*54°/);
        expect(titularCosmos({ g: 0, r: 1, s: 0, kp: 2, claseRayos: "M1.4", maxPrevistoKp: null }).texto).toMatch(/R1.*M1\.4/);
        expect(titularCosmos({ g: 0, r: 0, s: 0, kp: 2, claseRayos: null, maxPrevistoKp: 5.7 }).texto).toMatch(/se espera tormenta G1/);
    });
    it("máximos de Kp por día y variación del campo", () => {
        const t = Date.parse("2026-09-29T12:00:00Z");
        const d = maximosPorDia([{ t, kp: 2, tipo: "previsto" }, { t: t + 3_600_000 * 3, kp: 4, tipo: "previsto" }, { t: t + 86_400_000, kp: 5.3, tipo: "previsto" }], () => "x");
        expect(d.map((x) => x.kp)).toEqual([4, 5.3]);
        expect(variacionCampo([90, 95, 100])?.texto).toBe("variación pequeña");
        expect(variacionCampo([60, 130])?.texto).toBe("variación grande");
        expect(variacionCampo([1])).toBeNull();
    });
    it("horas doradas alrededor del orto y el ocaso", () => {
        const h = horasDoradas(new Date("2026-09-29T12:00:00Z"), 39.47, -0.38);
        expect(h.manana).not.toBeNull();
        expect(h.tarde).not.toBeNull();
        expect(h.manana![1]).toBeGreaterThan(h.manana![0]);
        expect(horasDoradas(new Date("2026-06-21T12:00:00Z"), 80, 0).manana).toBeNull();
    });
});
