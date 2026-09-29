import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLAVE_FRENO, FRENO_CADA_MS, FRENO_INACTIVO, crearFreno, frenoActivo, type EstadoFreno, type FilaFreno, type Freno } from "../freno";
import { almacenMemoria, hubCanales } from "../pruebas-ayudas";

const vaciar = () => vi.advanceTimersByTimeAsync(0);

function liderManual(inicial: boolean) {
    let lider = inicial;
    const oyentes = new Set<(l: boolean) => void>();
    return {
        esLider: () => lider,
        alCambiarLider: (cb: (l: boolean) => void) => {
            oyentes.add(cb);
            return () => oyentes.delete(cb);
        },
        fijar(l: boolean) {
            lider = l;
            for (const o of oyentes) o(l);
        },
    };
}

let creados: Freno[] = [];
function freno(op: Parameters<typeof crearFreno>[0]): Freno {
    const f = crearFreno(op);
    creados.push(f);
    return f;
}

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z") });
});
afterEach(() => {
    for (const f of creados) f.detener();
    creados = [];
    vi.useRealTimers();
});

describe("freno remoto", () => {
    it("la líder lee 1 vez al arrancar y luego cada 10 min, no antes", async () => {
        const leerFila = vi.fn(async (): Promise<FilaFreno> => ({ activo: false }));
        const l = liderManual(true);
        const f = freno({ leerFila, ...l, almacen: almacenMemoria() });
        f.iniciar();
        await vaciar();
        expect(leerFila).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(FRENO_CADA_MS - 1000);
        expect(leerFila).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(leerFila).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(FRENO_CADA_MS * 3);
        expect(leerFila).toHaveBeenCalledTimes(5);
    });

    it("una seguidora nunca lee: recibe el estado de la líder por el canal", async () => {
        const hub = hubCanales();
        const almacen = almacenMemoria();
        const fila: FilaFreno = { activo: true, motivo: "Presupuesto diario superado", hasta: "2026-09-30T00:00:00Z" };
        const leerLider = vi.fn(async () => fila);
        const leerSeguidora = vi.fn(async () => fila);
        const cambios: EstadoFreno[] = [];
        const seguidora = freno({ leerFila: leerSeguidora, ...liderManual(false), crearCanal: hub.crear, almacen, alCambiar: (e) => cambios.push(e) });
        seguidora.iniciar();
        const lider = freno({ leerFila: leerLider, ...liderManual(true), crearCanal: hub.crear, almacen });
        lider.iniciar();
        // El canal entrega en un turno posterior (un 0 ms dentro de un turno de reloj falso cuenta 1 ms).
        await vi.advanceTimersByTimeAsync(10);

        expect(leerLider).toHaveBeenCalledTimes(1);
        expect(leerSeguidora).not.toHaveBeenCalled();
        expect(seguidora.activo()).toBe(true);
        expect(seguidora.estado()).toEqual({ activo: true, motivo: "Presupuesto diario superado", hasta: "2026-09-30T00:00:00Z" });
        expect(cambios).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(FRENO_CADA_MS * 2);
        expect(leerSeguidora).not.toHaveBeenCalled();
    });

    it("la instantánea es el MISMO objeto mientras la fila no cambia", async () => {
        const leerFila = vi.fn(async (): Promise<FilaFreno> => ({ activo: true, motivo: "m", hasta: null }));
        const f = freno({ leerFila, ...liderManual(true) });
        expect(f.estado()).toBe(FRENO_INACTIVO);
        f.iniciar();
        await vaciar();
        const e1 = f.estado();
        expect(e1.activo).toBe(true);
        expect(f.estado()).toBe(e1);
        await vi.advanceTimersByTimeAsync(FRENO_CADA_MS); // misma fila otra vez
        expect(leerFila).toHaveBeenCalledTimes(2);
        expect(f.estado()).toBe(e1);
    });

    it("una recarga no vuelve a preguntar antes de 10 min desde la última lectura", async () => {
        const almacen = almacenMemoria();
        almacen.setItem(CLAVE_FRENO, JSON.stringify({ fila: { activo: false }, leidoEn: Date.now() - 4 * 60_000 }));
        const leerFila = vi.fn(async (): Promise<FilaFreno> => ({ activo: false }));
        const f = freno({ leerFila, ...liderManual(true), almacen });
        f.iniciar();
        await vaciar();
        expect(leerFila).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(6 * 60_000);
        expect(leerFila).toHaveBeenCalledTimes(1);
    });

    it("al pasar a líder más tarde, lee si su dato está viejo", async () => {
        const leerFila = vi.fn(async (): Promise<FilaFreno> => ({ activo: false }));
        const l = liderManual(false);
        const f = freno({ leerFila, ...l });
        f.iniciar();
        await vi.advanceTimersByTimeAsync(FRENO_CADA_MS * 2);
        expect(leerFila).not.toHaveBeenCalled();
        l.fijar(true);
        await vaciar();
        expect(leerFila).toHaveBeenCalledTimes(1);
        l.fijar(false);
        await vi.advanceTimersByTimeAsync(FRENO_CADA_MS * 2);
        expect(leerFila).toHaveBeenCalledTimes(1);
    });

    it("se suelta solo al llegar `hasta`, sin volver a leer", async () => {
        const leerFila = vi.fn(async (): Promise<FilaFreno> => ({ activo: true, motivo: null, hasta: "2026-09-29T10:05:00Z" }));
        const f = freno({ leerFila, ...liderManual(true) });
        f.iniciar();
        await vaciar();
        expect(f.activo()).toBe(true);
        await vi.advanceTimersByTimeAsync(5 * 60_000 + 100);
        expect(f.activo()).toBe(false);
        expect(leerFila).toHaveBeenCalledTimes(1);
    });

    it("si la tabla aún no existe (lectura fallida), sigue inactivo y no reintenta en bucle", async () => {
        const leerFila = vi.fn(async (): Promise<FilaFreno | null> => null);
        const f = freno({ leerFila, ...liderManual(true) });
        f.iniciar();
        await vi.advanceTimersByTimeAsync(FRENO_CADA_MS - 1);
        expect(leerFila).toHaveBeenCalledTimes(1);
        expect(f.activo()).toBe(false);
    });

    it("sin ventana (SSR/Node), frenoActivo() es false y no lee nada", () => {
        expect(typeof window).toBe("undefined");
        expect(frenoActivo()).toBe(false);
    });
});
