import { describe, expect, it, vi } from "vitest";
import { crearAlmacenMemoria } from "../almacen";
import { CLAVE_BANDEJA_V1, CLAVE_RESPALDO } from "../migracion";
import { crearPersistencia } from "../persistencia-bandeja";
import { anadirMensaje, BANDEJA_VACIA, leerBandeja, type EstadoBandeja } from "@/lib/mensajeria/neuronas/bandeja";

/* El arranque del buzón: hidrata desde la clave vieja, escribe solo diferencias y cae a localStorage si falla. */

const msg = (id: string, at: number, extra = {}) => ({ id, clave: "dm:h", dir: "sale" as const, texto: id, at, estado: "confirmado" as const, ...extra });

function ls(inicial: Record<string, string>) {
    const m = new Map(Object.entries(inicial));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("persistencia de la bandeja", () => {
    it("hidrata migrando la clave vieja, escribe diferencias y deja una lápida al quitar", async () => {
        const vieja = { v: 1, conv: { "dm:h": { mensajes: [msg("a", 1), msg("b", 2)], leidoHasta: 2 } }, vias: {} };
        const almacenLs = ls({ [CLAVE_BANDEJA_V1]: JSON.stringify(vieja) });
        const alm = crearAlmacenMemoria();
        let reemplazo: EstadoBandeja | null = null;
        const p = crearPersistencia({ ls: almacenLs, escribirLs: vi.fn(), alReemplazar: (e) => (reemplazo = e), abrir: async () => alm });
        const vivo = leerBandeja(JSON.stringify(vieja));
        await p.hidratar(() => vivo);
        expect(p.activo()).toBe(true);
        expect(reemplazo!.conv["dm:h"].mensajes.map((m) => m.id)).toEqual(["a", "b"]);
        expect(almacenLs.m.get(CLAVE_RESPALDO)).toBe(JSON.stringify(vieja));

        const nuevo = anadirMensaje(vivo, msg("c", 3));
        p.guardar(vivo, nuevo);
        await new Promise((r) => setTimeout(r, 60));
        expect((await alm.todos()).map((r) => r.id).sort()).toEqual(["a", "b", "c"]);

        p.enterrar("dm:h", "a");
        await new Promise((r) => setTimeout(r, 20));
        expect((await alm.obtener("a"))!.lapida).toBe(true);
    });

    it("sin almacén (IndexedDB no abre) no se activa y el buzón sigue con localStorage", async () => {
        const p = crearPersistencia({ ls: null, escribirLs: vi.fn(), alReemplazar: vi.fn(), abrir: async () => Promise.reject(new Error("no")) });
        expect(await p.hidratar(() => BANDEJA_VACIA)).toBeNull();
        expect(p.activo()).toBe(false);
    });

    it("si el almacén falla al escribir, la bandeja entera vuelve a localStorage", async () => {
        const alm = crearAlmacenMemoria();
        const escribirLs = vi.fn();
        const p = crearPersistencia({ ls: ls({}), escribirLs, alReemplazar: vi.fn(), abrir: async () => alm });
        await p.hidratar(() => BANDEJA_VACIA);
        alm.poner = async () => Promise.reject(new Error("cuota"));
        const nuevo = anadirMensaje(BANDEJA_VACIA, msg("z", 5));
        p.guardar(BANDEJA_VACIA, nuevo);
        await new Promise((r) => setTimeout(r, 80));
        expect(escribirLs).toHaveBeenCalledWith(nuevo);
        expect(p.activo()).toBe(false);
    });
});
