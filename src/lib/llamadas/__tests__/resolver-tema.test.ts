/**
 * Qué canal privado toca: token en mano → tema público; si no, lo que diga la fila de la sesión
 * (enlace público vigente → tema con su token, para compartir sala con los invitados). Sin red
 * o sin la migración → tema de miembros (el servidor decidirá y la interfaz lo dirá).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    respuestas: [] as { data: unknown; error: unknown }[],
    consultas: [] as { tabla: string; columnas: string; id: unknown }[],
}));

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from(tabla: string) {
            const q = { tabla, columnas: "", id: null as unknown };
            return {
                select(columnas: string) {
                    q.columnas = columnas;
                    return {
                        eq(_col: string, v: unknown) {
                            q.id = v;
                            return {
                                async maybeSingle() {
                                    h.consultas.push(q);
                                    const r = h.respuestas.shift();
                                    if (!r) throw new Error("sin red");
                                    return r;
                                },
                            };
                        },
                    };
                },
            };
        },
    }),
}));

import {
    __reiniciarResolverTema,
    marcarTemaDenegado,
    olvidarTemaSesion,
    prepararAuthRealtime,
    resolverTemaSesion,
    temaDenegadoReciente,
    tokenDeLaUrl,
} from "@/lib/llamadas/resolver-tema";

const ID = "3f1c2a9e-7b1d-4c3e-9f00-1234567890ab";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

beforeEach(() => {
    __reiniciarResolverTema();
    h.respuestas = [];
    h.consultas = [];
});

describe("resolverTemaSesion", () => {
    it("con el token del enlace: tema público, sin preguntar a nadie", async () => {
        expect(await resolverTemaSesion("llamada", ID, { token: TOKEN })).toBe(`llamada:${ID}:${TOKEN}`);
        expect(h.consultas).toHaveLength(0);
    });

    it("miembro de una sesión con enlace público: el tema con su token (misma sala que los invitados)", async () => {
        h.respuestas.push({ data: { modo: "publico", token_publico: TOKEN }, error: null });
        expect(await resolverTemaSesion("llamada", ID)).toBe(`llamada:${ID}:${TOKEN}`);
        expect(h.consultas[0]).toEqual({ tabla: "os_sesiones_vivas", columnas: "modo, token_publico", id: ID });
    });

    it("sesión solo del chat: tema de miembros", async () => {
        h.respuestas.push({ data: { modo: "chat", token_publico: null }, error: null });
        expect(await resolverTemaSesion("vivo", ID)).toBe(`vivo:${ID}`);
    });

    it("sin la migración, sin permiso o sin red: tema de miembros (nunca un canal público inventado)", async () => {
        h.respuestas.push({ data: null, error: { code: "42P01", message: "relation does not exist" } });
        expect(await resolverTemaSesion("llamada", ID)).toBe(`llamada:${ID}`);
        olvidarTemaSesion("llamada", ID);
        expect(await resolverTemaSesion("llamada", ID)).toBe(`llamada:${ID}`); // lanza «sin red»
    });

    it("guarda la respuesta un rato y `fresco` la vuelve a pedir", async () => {
        h.respuestas.push({ data: { modo: "chat" }, error: null });
        await resolverTemaSesion("llamada", ID);
        await resolverTemaSesion("llamada", ID);
        expect(h.consultas).toHaveLength(1);
        h.respuestas.push({ data: { modo: "publico", token_publico: TOKEN }, error: null });
        expect(await resolverTemaSesion("llamada", ID, { fresco: true })).toBe(`llamada:${ID}:${TOKEN}`);
        expect(h.consultas).toHaveLength(2);
    });

    it("un id que no es uuid no resuelve nada", async () => {
        expect(await resolverTemaSesion("llamada", "s1")).toBeNull();
        expect(h.consultas).toHaveLength(0);
    });
});

describe("denegaciones recordadas", () => {
    it("los observadores no reintentan un tema denegado durante 5 minutos", () => {
        const t0 = 1_000_000;
        marcarTemaDenegado("llamada:x", t0);
        expect(temaDenegadoReciente("llamada:x", t0 + 60_000)).toBe(true);
        expect(temaDenegadoReciente("llamada:x", t0 + 5 * 60_000)).toBe(false);
        expect(temaDenegadoReciente("llamada:y", t0)).toBe(false);
    });
});

describe("tokenDeLaUrl", () => {
    it("solo en la página de ESA sesión, y solo si parece un token", () => {
        expect(tokenDeLaUrl(ID, { pathname: `/vivo/${ID}`, search: `?t=${TOKEN}` })).toBe(TOKEN);
        expect(tokenDeLaUrl(ID, { pathname: `/llamada/${ID}`, search: `?t=${TOKEN}&x=1` })).toBe(TOKEN);
        expect(tokenDeLaUrl(ID, { pathname: `/pizarra`, search: `?t=${TOKEN}` })).toBeNull();
        expect(tokenDeLaUrl(ID, { pathname: `/vivo/otra`, search: `?t=${TOKEN}` })).toBeNull();
        expect(tokenDeLaUrl(ID, { pathname: `/vivo/${ID}`, search: `?t=corto` })).toBeNull();
        expect(tokenDeLaUrl(ID, null)).toBeNull();
    });
});

describe("prepararAuthRealtime", () => {
    it("pide a realtime-js el JWT actual antes de unirse; sin soporte devuelve null", async () => {
        const setAuth = vi.fn(async () => undefined);
        const p = prepararAuthRealtime({ realtime: { setAuth } });
        expect(p).not.toBeNull();
        await p;
        expect(setAuth).toHaveBeenCalledWith();
        expect(prepararAuthRealtime({})).toBeNull();
        expect(prepararAuthRealtime(null)).toBeNull();
    });

    it("nunca rechaza aunque setAuth falle", async () => {
        const p = prepararAuthRealtime({ realtime: { setAuth: () => Promise.reject(new Error("x")) } });
        await expect(p).resolves.toBeUndefined();
    });
});
