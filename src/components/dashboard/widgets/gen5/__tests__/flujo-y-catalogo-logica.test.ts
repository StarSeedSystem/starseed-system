// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    anotar, duracionTexto, entradaDe, leerRegistro, minutosCortos, minutosHoy, minutosPorDia, nuevaSesion, pausar,
    progreso, racha, reanudar, reloj, restante, terminada, type EntradaFlujo,
} from "../flow-director-partes";
import { aEpoch, analizarKp, analizarMeteo, escalaG, horasDesde } from "../_catalogo/meteo";
import { _vaciarCompartidos, estaFresco, leerCompartido, obtenerCompartido, TTL_MINIMO_MS } from "../_catalogo/recurso";

const MIN = 60_000;

describe("Director de flujo · sesiones", () => {
    it("cuenta con marcas absolutas: pausar congela y reanudar descuenta la pausa", () => {
        const t0 = 1_000_000;
        let s = nuevaSesion("enfoque", 25, t0, { id: "a", texto: "Escribir" });
        expect(restante(s, t0 + 5 * MIN)).toBe(20 * MIN);
        s = pausar(s, t0 + 5 * MIN);
        expect(restante(s, t0 + 60 * MIN)).toBe(20 * MIN);
        s = reanudar(s, t0 + 10 * MIN);
        expect(restante(s, t0 + 15 * MIN)).toBe(15 * MIN);
        expect(progreso(s, t0 + 15 * MIN)).toBeCloseTo(0.4, 5);
        expect(terminada(s, t0 + 29 * MIN)).toBe(false);
        expect(terminada(s, t0 + 31 * MIN)).toBe(true);
    });
    it("anota el enfoque (con su tarea) y nunca los descansos ni lo de menos de un minuto", () => {
        const s = nuevaSesion("enfoque", 25, 0, { id: "a", texto: "Escribir" });
        expect(entradaDe(s, 30_000)).toBeNull();
        const e = entradaDe(s, 10 * MIN)!;
        expect(e.minutos).toBe(10);
        expect(e.completa).toBe(false);
        expect(e.tarea).toBe("Escribir");
        expect(entradaDe(s, 40 * MIN)!.completa).toBe(true);
        expect(entradaDe(nuevaSesion("descanso", 5, 0), 5 * MIN)).toBeNull();
    });
    it("formatea el reloj y las duraciones", () => {
        expect(reloj(25 * MIN)).toBe("25:00");
        expect(reloj(65 * MIN + 1000)).toBe("1:05:01");
        expect(duracionTexto(40)).toBe("40 min");
        expect(duracionTexto(85)).toBe("1 h 25 min");
        expect(minutosCortos(40)).toBe("40′");
        expect(minutosCortos(125)).toBe("2h05");
        expect(minutosCortos(120)).toBe("2h");
    });
    it("suma el día, la semana y la racha", () => {
        const hoy = new Date(2026, 8, 29, 12, 0).getTime();
        const dia = (d: number, h: number, min: number): EntradaFlujo => {
            const ini = new Date(2026, 8, 29 - d, h, 0).getTime();
            return { inicio: ini, fin: ini + min * MIN, minutos: min, completa: true };
        };
        const reg = [dia(0, 9, 25), dia(0, 10, 50), dia(1, 9, 25), dia(2, 9, 25), dia(4, 9, 90)];
        expect(minutosHoy(reg, hoy)).toBe(75);
        const semana = minutosPorDia(reg, hoy, 7);
        expect(semana).toHaveLength(7);
        expect(semana[6].minutos).toBe(75);
        expect(semana[2].minutos).toBe(90);
        expect(racha(reg, hoy)).toBe(3);
    });
});

describe("Director de flujo · almacén local", () => {
    beforeEach(() => { localStorage.clear(); });
    it("no duplica una sesión anotada dos veces (dos instancias del widget)", () => {
        const e: EntradaFlujo = { inicio: Date.now() - 25 * MIN, fin: Date.now(), minutos: 25, completa: true };
        anotar(e);
        anotar(e);
        expect(leerRegistro()).toHaveLength(1);
    });
});

describe("Open-Meteo · análisis puro", () => {
    it("convierte la hora local del modelo a epoch real con el desfase", () => {
        expect(aEpoch("2026-09-29T14:00", 7200)).toBe(Date.UTC(2026, 8, 29, 12, 0));
        expect(aEpoch(null, 0)).toBeNull();
    });
    it("lee actual, horas y días, y exige lo mínimo", () => {
        const m = analizarMeteo({
            utc_offset_seconds: 0, timezone: "UTC",
            current: { temperature_2m: 21, apparent_temperature: 20, relative_humidity_2m: 40, precipitation: 0, weather_code: 1, cloud_cover: 30, wind_speed_10m: 12, shortwave_radiation: 540, is_day: 1 },
            hourly: { time: ["2026-09-29T10:00", "2026-09-29T11:00"], temperature_2m: [18, 19], precipitation_probability: [10, 60], shortwave_radiation: [300, 500], is_day: [1, 1] },
            daily: { time: ["2026-09-29"], sunrise: ["2026-09-29T07:00"], sunset: ["2026-09-29T19:00"], shortwave_radiation_sum: [14.2] },
        });
        expect(m.ahora.radiacion).toBe(540);
        expect(m.horas[1].probLluvia).toBe(60);
        expect(m.dias[0].radiacionSuma).toBe(14.2);
        expect(m.dias[0].orto).toBe(Date.UTC(2026, 8, 29, 7));
        expect(horasDesde(m, Date.UTC(2026, 8, 29, 10, 30), 5)).toHaveLength(2);
        expect(() => analizarMeteo({})).toThrow();
    });
});

describe("NOAA Kp · análisis puro", () => {
    const ahora = Date.UTC(2026, 8, 29, 12);
    it("acepta la lista de objetos y separa lo observado de lo previsto", () => {
        const k = analizarKp([
            { time_tag: "2026-09-29T06:00:00", kp: 2.33, observed: "observed" },
            { time_tag: "2026-09-29T09:00:00", kp: 3, observed: "estimated" },
            { time_tag: "2026-09-30T00:00:00", kp: 5.67, observed: "predicted" },
            { time_tag: "2026-09-30T03:00:00", kp: 4, observed: "predicted" },
        ], ahora);
        expect(k.actual?.kp).toBe(3);
        expect(k.actual?.tipo).toBe("estimado");
        expect(k.maxPrevisto?.kp).toBe(5.67);
    });
    it("acepta el formato antiguo de filas con cabecera", () => {
        const k = analizarKp([["time_tag", "kp", "observed", "noaa_scale"], ["2026-09-29 09:00:00", "4.00", "observed", null]], ahora);
        expect(k.actual?.kp).toBe(4);
    });
    it("sin datos, error (nunca un Kp inventado)", () => {
        expect(() => analizarKp([], ahora)).toThrow();
        expect(escalaG(5.3).g).toBe(1);
        expect(escalaG(2).texto).toMatch(/calma/);
    });
});

describe("Recursos compartidos · una petición por clave", () => {
    beforeEach(() => { localStorage.clear(); _vaciarCompartidos(); });
    afterEach(() => { vi.useRealTimers(); });
    it("deduplica en vuelo y respeta la caducidad mínima", async () => {
        const cargar = vi.fn(async () => ({ v: 1 }));
        const [a, b] = await Promise.all([obtenerCompartido("x", 1000, cargar), obtenerCompartido("x", 1000, cargar)]);
        expect(a).toEqual({ v: 1 });
        expect(b).toEqual({ v: 1 });
        expect(cargar).toHaveBeenCalledTimes(1);
        await obtenerCompartido("x", 1000, cargar);
        expect(cargar).toHaveBeenCalledTimes(1);
        expect(estaFresco(leerCompartido("x"), 1000)).toBe(true);
        expect(estaFresco(leerCompartido("x"), 1000, Date.now() + TTL_MINIMO_MS + 1)).toBe(false);
    });
    it("sobrevive a la recarga (localStorage) y un fallo no borra lo último bueno", async () => {
        await obtenerCompartido("y", TTL_MINIMO_MS, async () => 7);
        _vaciarCompartidos();
        expect(leerCompartido<number>("y")?.datos).toBe(7);
        await expect(obtenerCompartido("y", TTL_MINIMO_MS, async () => { throw new Error("caída"); }, { forzar: true })).rejects.toThrow();
        expect(leerCompartido<number>("y")?.datos).toBe(7);
    });
});
