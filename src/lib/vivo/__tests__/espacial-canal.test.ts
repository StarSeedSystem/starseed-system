// @vitest-environment jsdom
/**
 * Canal de la escena: UNA fila filtrada por id (nunca la tabla entera), presencia con la clave
 * de la pestaña, eventos de broadcast propios, y cierre limpio (untrack + removeChannel).
 */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    canales: [] as Array<{
        tema: string;
        config: unknown;
        on: Array<{ tipo: string; filtro: Record<string, unknown> }>;
        cb: Map<string, (p: unknown) => void>;
        estado: ((s: string) => void) | null;
        enviados: unknown[];
        tracks: unknown[];
        untrack: ReturnType<typeof vi.fn>;
    }>,
    removidos: 0,
}));

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        getChannels: () => [],
        channel: (tema: string, config: unknown) => {
            const c = {
                tema,
                config,
                on: [] as Array<{ tipo: string; filtro: Record<string, unknown> }>,
                cb: new Map<string, (p: unknown) => void>(),
                estado: null as ((s: string) => void) | null,
                enviados: [] as unknown[],
                tracks: [] as unknown[],
                untrack: vi.fn(async () => undefined),
            };
            h.canales.push(c);
            const api = {
                topic: `realtime:${tema}`,
                on(tipo: string, filtro: Record<string, unknown>, cb: (p: unknown) => void) {
                    c.on.push({ tipo, filtro });
                    c.cb.set(`${tipo}:${String(filtro.event)}`, cb);
                    return api;
                },
                subscribe(fn: (s: string) => void) {
                    c.estado = fn;
                    return api;
                },
                send: (m: unknown) => {
                    c.enviados.push(m);
                    return Promise.resolve("ok");
                },
                track: (m: unknown) => {
                    c.tracks.push(m);
                    return Promise.resolve("ok");
                },
                untrack: c.untrack,
                presenceState: () => ({ "ana:1": [{ nombre: "Ana" }] }),
            };
            return api;
        },
        removeChannel: () => {
            h.removidos += 1;
            return Promise.resolve("ok");
        },
    }),
}));

import { abrirCanalEscena, temaEscena } from "@/lib/vivo/espacial/canal";

describe("canal de escena", () => {
    it("vigila SOLO la fila de su escena y usa la clave de la pestaña en la presencia", () => {
        const con = abrirCanalEscena(temaEscena("esc-1"), "yo:tab", "esc-1")!;
        const c = h.canales[0];
        expect(c.tema).toBe("escena3d:esc-1");
        expect(c.config).toEqual({ config: { presence: { key: "yo:tab" }, broadcast: { self: false, ack: false } } });
        const pg = c.on.filter((o) => o.tipo === "postgres_changes");
        expect(pg).toHaveLength(1);
        expect(pg[0].filtro).toMatchObject({ table: "os_spaces", filter: "id=eq.esc-1", event: "UPDATE" });
        expect(c.on.filter((o) => o.tipo === "broadcast").map((o) => o.filtro.event)).toEqual(["pose", "cambios", "arrastre", "pedir-estado", "estado"]);

        // Antes de suscribirse: las poses se descartan, los cambios se encolan.
        con.enviar("pose", { de: "yo:tab" });
        con.enviar("cambios", { de: "yo:tab", objetos: [] });
        con.publicarPresencia({ nombre: "Yo" });
        const suscritos: boolean[] = [];
        con.onSuscrito((ok) => suscritos.push(ok));
        const presencias: unknown[] = [];
        con.onPresencia((e) => presencias.push(e));
        c.estado?.("SUBSCRIBED");
        expect(suscritos).toEqual([true]);
        expect(c.tracks).toEqual([{ nombre: "Yo" }]);
        expect(c.enviados).toEqual([{ type: "broadcast", event: "cambios", payload: { de: "yo:tab", objetos: [] } }]);

        c.cb.get("presence:sync")?.({});
        expect(presencias).toEqual([{ "ana:1": [{ nombre: "Ana" }] }]);

        const filas: unknown[] = [];
        con.onFila((f) => filas.push(f));
        c.cb.get("postgres_changes:UPDATE")?.({ new: { rev: 7, doc: { tipo: "escena3d" }, title: "T", access: "invite" } });
        expect(filas).toEqual([{ rev: 7, doc: { tipo: "escena3d" }, titulo: "T", acceso: "invite" }]);

        con.cerrar();
        expect(c.untrack).toHaveBeenCalled();
        expect(h.removidos).toBe(1);
        // Tras cerrar, nada sale.
        con.enviar("cambios", { de: "yo:tab" });
        expect(c.enviados).toHaveLength(1);
    });

    it("la sala de una llamada no escucha ninguna tabla", () => {
        abrirCanalEscena("escena3d:llamada:abc12345", "yo:tab", null);
        const c = h.canales[h.canales.length - 1];
        expect(c.on.some((o) => o.tipo === "postgres_changes")).toBe(false);
    });
});
