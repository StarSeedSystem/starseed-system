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

import { EnMarco, MEDIDAS } from "../../gen5/_catalogo/prueba-marco";
import { _vaciarCompartidos } from "../../gen5/_catalogo/recurso";
import { analizarMeteo } from "../../gen5/_catalogo/meteo";
import { OraclePredictWidget } from "../oracle-predict-widget";
import { analizarEscalas, destacado, lluviaRestoDeHoy, presagios } from "../oracle-predict-partes";

const AHORA = Date.parse("2026-09-29T12:00:00Z");
function meteo() {
    const dias = ["2026-09-29", "2026-09-30", "2026-10-01"];
    const time: string[] = [], prob: number[] = [];
    dias.forEach((f) => { for (let h = 0; h < 24; h++) { time.push(`${f}T${String(h).padStart(2, "0")}:00`); prob.push(f === dias[0] && h === 18 ? 55 : 5); } });
    return {
        timezone: "UTC", utc_offset_seconds: 0, current: { temperature_2m: 20 },
        hourly: { time, precipitation_probability: prob },
        daily: { time: dias, precipitation_probability_max: [55, 80, 20] },
    };
}
const ESCALAS = { "0": {}, "1": { DateStamp: "2026-09-30", R: { MinorProb: "35", MajorProb: "5" }, S: { Prob: "10" }, G: { Scale: "0" } }, "2": { R: { MinorProb: "25" }, S: { Prob: "1" } }, "3": { R: { MinorProb: null }, S: { Prob: "" } } };
const KP = [["time_tag", "kp", "observed", "noaa_scale"], ["2026-09-29 09:00:00", "2.33", "observed", null], ["2026-09-30 00:00:00", "5.33", "predicted", "G1"], ["2026-09-30 03:00:00", "3.00", "predicted", null]];

const caidas = new Set<string>();
const pedidas: string[] = [];
function pintar(clase: ClaseTamano) {
    medida = MEDIDAS[clase];
    return render(<EnMarco clase={clase}><OraclePredictWidget /></EnMarco>);
}
beforeEach(() => {
    localStorage.clear();
    _vaciarCompartidos();
    ubicacion = null;
    caidas.clear();
    pedidas.length = 0;
    vi.spyOn(Date, "now").mockReturnValue(AHORA);
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
        const url = String(u);
        pedidas.push(url);
        const clave = url.includes("open-meteo") ? "meteo" : url.includes("noaa-scales") ? "escalas" : "kp";
        if (caidas.has(clave)) return new Response("x", { status: 503 });
        return new Response(JSON.stringify(clave === "meteo" ? meteo() : clave === "escalas" ? ESCALAS : KP), { status: 200 });
    }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TODAS: ClaseTamano[] = ["micro", "s", "m", "l", "xl", "panoramico", "torre"];

describe("Oráculo de Probabilidades", () => {
    it.each(TODAS)("(%s) solo probabilidades reales, con su fuente y horizonte", async (clase) => {
        ubicacion = { location: { lat: 40.4, lon: -3.7, name: "Madrid" } };
        pintar(clase);
        await screen.findByRole("region", { name: /Lloverá lo que queda de hoy 55 % \(resto del día, Open-Meteo\); Lloverá mañana 80 %.*Apagón de radio por el Sol \(R1\+\) 35 % \(3 días, NOAA SWPC\); Tormenta de radiación solar \(S1\+\) 10 %.*Tormenta geomagnética \(auroras\) G1 prevista \(Kp 5,3\)/ });
    });

    it("sin ubicación sigue con el cielo y el Sol, y lo que falla lo dice", async () => {
        caidas.add("escalas");
        pintar("xl");
        await screen.findByRole("region", { name: /Tormenta geomagnética \(auroras\) G1 prevista.*Sin datos de: escalas solares/ });
        expect(pedidas.some((u) => u.includes("open-meteo"))).toBe(false);
        expect(screen.getByRole("link", { name: /Preguntar a Aurora/ }).getAttribute("href")).toBe("/agent");
    });

    it("si todas las fuentes caen, error honesto con reintento", async () => {
        ubicacion = { location: { lat: 40.4, lon: -3.7, name: "Madrid" } };
        ["meteo", "escalas", "kp"].forEach((c) => caidas.add(c));
        pintar("l");
        expect(await screen.findByRole("region", { name: /error, ninguna fuente respondió/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Reintentar/ })).toBeTruthy();
    });
});

describe("Oráculo · lógica", () => {
    it("lee las escalas de NOAA y descarta lo vacío", () => {
        const e = analizarEscalas(ESCALAS);
        expect(e).toHaveLength(3);
        expect(e[0]).toMatchObject({ radioMenor: 35, radioMayor: 5, radiacion: 10, g: 0 });
        expect(e[2]).toMatchObject({ radioMenor: null, radiacion: null });
        expect(() => analizarEscalas({ "0": {} })).toThrow();
    });
    it("calcula la lluvia de lo que queda de hoy y elige el presagio más probable", () => {
        const m = analizarMeteo({ ...meteo(), current: { temperature_2m: 20 } });
        expect(lluviaRestoDeHoy(m, AHORA)).toBe(0.55);
        expect(lluviaRestoDeHoy(m, Date.parse("2026-09-29T23:30:00Z"))).toBe(0.05);
        expect(lluviaRestoDeHoy({ ...m, horas: m.horas.slice(0, 12) }, AHORA)).toBeNull();
        const ps = presagios(m, analizarEscalas(ESCALAS), null, AHORA);
        expect(ps.map((p) => p.id)).toEqual(["lluvia-hoy", "lluvia-manana", "lluvia-pasado", "radio", "radiacion"]);
        expect(destacado(ps)!.id).toBe("lluvia-manana");
        expect(presagios(null, null, null, AHORA)).toEqual([]);
    });
});
