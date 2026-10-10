import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcularRitmo, curvaDelDia, leerRegistroDia, nombreRuta, rutaTopDe, sumarRutas, RUTAS_GUARDADAS } from "../ritmo";
import { CLAVE_DIA, crearGuardian, type Guardian } from "../guardian";
import { almacenMemoria } from "../pruebas-ayudas";

const P = 8_000;
const MEDIANOCHE = Date.parse("2026-10-10T00:00:00Z");
const h = (horas: number) => MEDIANOCHE + horas * 3_600_000;

describe("calcularRitmo (la curva del día de un aparato)", () => {
    it("la curva reparte el presupuesto por horas con 3 h de holgura", () => {
        expect(curvaDelDia(P, h(0))).toBe(1_000);
        expect(curvaDelDia(P, h(12))).toBe(5_000);
        expect(curvaDelDia(P, h(23))).toBe(P);
    });

    it("normal por debajo de la curva; ahorro ×2 por encima; ×4 cerca del final o muy por encima", () => {
        expect(calcularRitmo({ hoy: 900, enLaHora: 200, presupuestoDia: P, ahora: h(0) }).nivel).toBe(0);
        expect(calcularRitmo({ hoy: 1_100, enLaHora: 200, presupuestoDia: P, ahora: h(0) })).toMatchObject({ nivel: 1, factor: 2 });
        expect(calcularRitmo({ hoy: 1_600, enLaHora: 200, presupuestoDia: P, ahora: h(0) })).toMatchObject({ nivel: 2, factor: 4 });
        expect(calcularRitmo({ hoy: 6_900, enLaHora: 100, presupuestoDia: P, ahora: h(22) }).nivel).toBe(2);
        expect(calcularRitmo({ hoy: P, enLaHora: 0, presupuestoDia: P, ahora: h(22) }).nivel).toBe(3);
    });

    it("una ráfaga dentro de la hora también baja el ritmo aunque el día vaya bien", () => {
        // Medido el 10-10: 2.370 peticiones en la hora 4 UTC desde las pestañas de la Mac.
        expect(calcularRitmo({ hoy: 2_000, enLaHora: 1_100, presupuestoDia: P, ahora: h(12) }).nivel).toBe(1);
        expect(calcularRitmo({ hoy: 2_500, enLaHora: 2_370, presupuestoDia: P, ahora: h(12) }).nivel).toBe(2);
    });

    it("el 10-10 real: con el ritmo, la Mac habría estado en ahorro desde la madrugada, no en pausa a mediodía", () => {
        // Las pestañas de los agentes llevaban ~4.500 a las 04:00 UTC.
        const r = calcularRitmo({ hoy: 4_500, enLaHora: 2_370, presupuestoDia: P, ahora: h(4) });
        expect(r.nivel).toBe(2);
        expect(r.factor).toBe(4);
    });
});

describe("registro del día y rutas", () => {
    it("lee el formato viejo {d, n} sin romperse", () => {
        expect(leerRegistroDia(JSON.stringify({ d: 20736, n: 8929 }))).toMatchObject({ d: 20736, n: 8929, r: {} });
        expect(leerRegistroDia("no-json")).toBeNull();
        expect(leerRegistroDia(null)).toBeNull();
    });

    it("suma rutas de varias pestañas y guarda solo las que más gastan", () => {
        const a: Record<string, number> = {};
        for (let i = 0; i < 30; i++) a[`/rest/v1/t${i}`] = i + 1;
        const s = sumarRutas(a, { "/rest/v1/t0": 100 });
        expect(Object.keys(s)).toHaveLength(RUTAS_GUARDADAS);
        expect(s["/rest/v1/t0"]).toBe(101);
    });

    it("la ruta que más gastó, con nombre de persona", () => {
        const dia = Math.floor(h(20) / 86_400_000);
        const top = rutaTopDe({ d: dia, n: 9000, r: { "/rest/v1/rpc/merge_user_prefs": 2664, "/rest/v1/neuron_devices": 2596 } }, h(20));
        expect(top).toMatchObject({ n: 2664, nombre: "guardado de tus preferencias" });
        expect(nombreRuta("/rest/v1/tabla_rara")).toBe("tabla rara");
        expect(rutaTopDe({ d: dia - 1, n: 1, r: { x: 1 } }, h(20))).toBeNull();
    });
});

describe("el guardián aplica el ritmo", () => {
    let g: Guardian | null = null;
    beforeEach(() => {
        vi.useFakeTimers({ now: new Date("2026-10-10T04:00:00Z") });
    });
    afterEach(() => {
        g?.cerrar();
        g = null;
        vi.useRealTimers();
    });

    it("comparte entre pestañas las rutas del día y la hora, y sube de nivel antes de la pausa", async () => {
        const almacen = almacenMemoria();
        const red = vi.fn(async () => new Response("[]", { status: 200 }));
        g = crearGuardian({ red, almacen, avisar: () => undefined });
        // Otra pestaña ya dejó 4.400 peticiones hoy (1.000 de ellas en esta hora).
        almacen.setItem(CLAVE_DIA, JSON.stringify({ d: Math.floor(Date.now() / 86_400_000), n: 4_400, h: Math.floor(Date.now() / 3_600_000), nh: 1_000, r: { "/rest/v1/neuron_devices": 3_000 } }));
        for (let i = 0; i < 20; i++) await g.fetch(`https://p.supabase.co/rest/v1/rpc/merge_user_prefs?i=${i}`, { method: "POST", body: "{}" });
        await vi.advanceTimersByTimeAsync(6_000); // volcado
        const reg = leerRegistroDia(almacen.getItem(CLAVE_DIA));
        expect(reg?.n).toBe(4_420);
        expect(reg?.nh).toBe(1_020);
        expect(reg?.r?.["/rest/v1/neuron_devices"]).toBe(3_000);
        expect(reg?.r?.["/rest/v1/rpc/merge_user_prefs"]).toBe(20);
        // A las 04:00 UTC la curva es 2.333: 4.420 es más de 1,5× → ahorro fuerte, todavía sin pausa.
        await g.fetch("https://p.supabase.co/rest/v1/x", { method: "POST", body: "{}" });
        expect(g.leerRitmo()).toMatchObject({ nivel: 2, factor: 4 });
        expect(g.leerAviso()).toMatchObject({ nivelRitmo: 2, diaAgotado: false });
        const c = g.leerContadores();
        expect(c.rutasHoy["/rest/v1/neuron_devices"]).toBe(3_000);
    });

    it("con ritmo ×4, las lecturas no esenciales se rellenan a 15/min; las escrituras no esperan", async () => {
        const almacen = almacenMemoria();
        almacen.setItem(CLAVE_DIA, JSON.stringify({ d: Math.floor(Date.now() / 86_400_000), n: 7_000 }));
        const red = vi.fn(async () => new Response("[]", { status: 200 }));
        g = crearGuardian({ red, almacen, avisar: () => undefined });
        // Una salida recalcula el nivel (7.000 ≥ 85 % de 8.000).
        await g.fetch("https://p.supabase.co/rest/v1/w", { method: "POST", body: "{}" });
        expect(g.leerRitmo().nivel).toBe(2);
        // Agota la ráfaga con lecturas distintas y mide cuántas salen en un minuto más.
        const lecturas: Promise<Response>[] = [];
        for (let i = 0; i < 80; i++) lecturas.push(g.fetch(`https://p.supabase.co/rest/v1/t?i=${i}`));
        await vi.advanceTimersByTimeAsync(0);
        const trasRafaga = red.mock.calls.length;
        await vi.advanceTimersByTimeAsync(55_000);
        const enUnMinuto = red.mock.calls.length - trasRafaga;
        expect(enUnMinuto).toBeLessThanOrEqual(16);
        // Una escritura sale al momento aunque haya cola.
        const antes = red.mock.calls.length;
        await g.fetch("https://p.supabase.co/rest/v1/w2", { method: "POST", body: "{}" });
        expect(red.mock.calls.length).toBe(antes + 1);
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        await Promise.allSettled(lecturas);
    });
});
