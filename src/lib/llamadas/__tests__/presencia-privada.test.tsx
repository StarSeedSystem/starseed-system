// @vitest-environment jsdom
/**
 * Los que solo MIRAN (tarjeta de llamada, contador «N dentro» de una app en vivo) también van por
 * canales privados: tema correcto, `private: true`, token del enlace público cuando se llega por
 * él, y si el servidor deniega → «no se sabe» (null) sin reintentar en bucle.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Cb = (...a: unknown[]) => void;

class CanalFalso {
    oyentes: { tipo: string; cb: Cb }[] = [];
    alSuscribir: ((estado: string, err?: unknown) => void) | null = null;
    estadoPresencia: Record<string, unknown[]> = {};
    tracks: unknown[] = [];
    constructor(public topic: string, public params: { config?: { private?: boolean; presence?: { key?: string } } }) {}
    on(tipo: string, _f: unknown, cb: Cb) {
        this.oyentes.push({ tipo, cb });
        return this;
    }
    subscribe(cb: (estado: string, err?: unknown) => void) {
        this.alSuscribir = cb;
        return this;
    }
    presenceState() {
        return this.estadoPresencia;
    }
    track(m: unknown) {
        this.tracks.push(m);
        return Promise.resolve("ok");
    }
    untrack() {
        return Promise.resolve("ok");
    }
    send() {
        return Promise.resolve("ok");
    }
    sincronizar(estado: Record<string, unknown[]>) {
        this.estadoPresencia = estado;
        for (const o of this.oyentes) if (o.tipo === "presence") o.cb();
    }
}

const h = vi.hoisted(() => ({
    canales: [] as unknown[],
    quitados: [] as unknown[],
    fila: null as null | { modo: string; token_publico: string | null },
}));

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        channel(tema: string, params: { config?: { private?: boolean } }) {
            const existente = (h.canales as CanalFalso[]).find((c) => c.topic === `realtime:${tema}` && !h.quitados.includes(c));
            if (existente) return existente;
            const c = new CanalFalso(`realtime:${tema}`, params);
            h.canales.push(c);
            return c;
        },
        getChannels: () => (h.canales as CanalFalso[]).filter((c) => !h.quitados.includes(c)),
        removeChannel(c: CanalFalso) {
            h.quitados.push(c);
            return Promise.resolve("ok");
        },
        auth: { getSession: async () => ({ data: { session: { user: { id: "yo" } } } }) },
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: h.fila, error: null }),
                }),
            }),
        }),
    }),
}));

import { usePresentesSesion } from "@/lib/mensajeria/sesiones-vivas";
import { usePresentesLlamada } from "@/lib/llamadas/use-presencia";
import { __reiniciarResolverTema } from "@/lib/llamadas/resolver-tema";
import { __reiniciarCanales } from "@/lib/llamadas/senalizacion";

const ID = "3f1c2a9e-7b1d-4c3e-9f00-1234567890ab";
const ID2 = "4f1c2a9e-7b1d-4c3e-9f00-1234567890ab";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

function canales(): CanalFalso[] {
    return h.canales as CanalFalso[];
}

async function esperar(n = 10) {
    for (let i = 0; i < n; i++) await act(async () => Promise.resolve());
}

beforeEach(() => {
    h.canales = [];
    h.quitados = [];
    h.fila = { modo: "chat", token_publico: null };
    __reiniciarResolverTema();
    window.history.replaceState(null, "", "/");
});

afterEach(() => {
    cleanup();
    __reiniciarCanales();
});

describe("contador de una app en vivo (vivo:<id>)", () => {
    it("escucha en el canal PRIVADO de miembros y cuenta personas distintas", async () => {
        const { result } = renderHook(() => usePresentesSesion(ID, true));
        await esperar();
        expect(canales()).toHaveLength(1);
        const c = canales()[0];
        expect(c.topic).toBe(`realtime:vivo:${ID}`);
        expect(c.params.config?.private).toBe(true);
        act(() => c.alSuscribir?.("SUBSCRIBED"));
        act(() => c.sincronizar({ a: [{ uid: "ana" }], b: [{ uid: "ana" }], c: [{ uid: "bea" }] }));
        expect(result.current).toBe(2);
    });

    it("con enlace público vigente usa el tema con token (misma sala que los invitados)", async () => {
        h.fila = { modo: "publico", token_publico: TOKEN };
        renderHook(() => usePresentesSesion(ID2, true));
        await esperar();
        expect(canales()[0].topic).toBe(`realtime:vivo:${ID2}:${TOKEN}`);
    });

    it("en la página del enlace público toma el token de la URL", async () => {
        h.fila = null;
        window.history.replaceState(null, "", `/vivo/${ID}?t=${TOKEN}`);
        renderHook(() => usePresentesSesion(ID, true));
        await esperar();
        expect(canales()[0].topic).toBe(`realtime:vivo:${ID}:${TOKEN}`);
    });

    it("si el servidor deniega: null, se quita el canal y al volver a mirar no se reintenta", async () => {
        const primero = renderHook(() => usePresentesSesion(ID, true));
        await esperar();
        const c = canales()[0];
        act(() => c.alSuscribir?.("CHANNEL_ERROR", new Error("Unauthorized: You do not have permissions to read from this Channel topic")));
        expect(primero.result.current).toBeNull();
        expect(h.quitados).toContain(c);
        primero.unmount();
        const segundo = renderHook(() => usePresentesSesion(ID, true));
        await esperar();
        expect(segundo.result.current).toBeNull();
        expect(canales()).toHaveLength(1); // ningún canal nuevo
    });
});

describe("tarjeta de llamada (llamada:<id>)", () => {
    it("mira por el canal privado y, si se deniega, queda en «no se sabe»", async () => {
        const { result } = renderHook(() => usePresentesLlamada(ID, true));
        await esperar();
        const c = canales()[0];
        expect(c.topic).toBe(`realtime:llamada:${ID}`);
        expect(c.params.config?.private).toBe(true);
        act(() => c.alSuscribir?.("SUBSCRIBED"));
        act(() => c.sincronizar({ "ana:1": [{ uid: "ana", nombre: "Ana", unido: 1 }] }));
        expect(result.current?.map((p) => p.id)).toEqual(["ana:1"]);
        act(() => c.alSuscribir?.("CHANNEL_ERROR", new Error("Unauthorized")));
        expect(result.current).toBeNull();
    });

    it("con el token del enlace mira en el tema público", async () => {
        renderHook(() => usePresentesLlamada(ID2, true, TOKEN));
        await esperar();
        expect(canales()[0].topic).toBe(`realtime:llamada:${ID2}:${TOKEN}`);
    });
});
