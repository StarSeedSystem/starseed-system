// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Oyente = (evento: string, sesion: { user?: { id: string } | null } | null) => void;

const estado = vi.hoisted(() => ({
    sesion: null as { user: { id: string } } | null,
    oyentes: [] as Oyente[],
    cliente: null as unknown,
}));

const getSession = vi.fn(async () => ({ data: { session: estado.sesion } }));
const getUser = vi.fn(async () => ({ data: { user: estado.sesion?.user ?? null }, error: null }));
const onAuthStateChange = vi.fn((cb: Oyente) => {
    estado.oyentes.push(cb);
    return { data: { subscription: { unsubscribe: () => undefined } } };
});

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => estado.cliente,
}));

import { _reiniciarUsuarioParaPruebas, uidActual, uidEnCache, usuarioActual, usuarioVerificado, VERIFICAR_CADA_MS } from "../usuario";

function emitir(evento: string, id: string | null) {
    for (const o of estado.oyentes) o(evento, id ? { user: { id } } : null);
}

beforeEach(() => {
    estado.sesion = { user: { id: "u1" } };
    estado.oyentes = [];
    estado.cliente = { auth: { getSession, getUser, onAuthStateChange } };
    getSession.mockClear();
    getUser.mockClear();
    onAuthStateChange.mockClear();
    _reiniciarUsuarioParaPruebas();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("usuarioActual / uidActual", () => {
    it("lee la sesión local una vez y después sirve la caché, sin getUser (sin red)", async () => {
        expect(uidEnCache()).toBeUndefined();
        expect(await uidActual()).toBe("u1");
        expect(await uidActual()).toBe("u1");
        expect((await usuarioActual())?.id).toBe("u1");
        expect(getSession).toHaveBeenCalledTimes(1);
        expect(getUser).not.toHaveBeenCalled();
        expect(uidEnCache()).toBe("u1");
    });

    it("las llamadas simultáneas comparten una sola lectura", async () => {
        const [a, b, c] = await Promise.all([uidActual(), uidActual(), usuarioActual()]);
        expect([a, b, c?.id]).toEqual(["u1", "u1", "u1"]);
        expect(getSession).toHaveBeenCalledTimes(1);
    });

    it("la caché se invalida con los cambios de sesión (salir, entrar con otra cuenta)", async () => {
        expect(await uidActual()).toBe("u1");
        emitir("SIGNED_OUT", null);
        expect(await uidActual()).toBeNull();
        emitir("SIGNED_IN", "u2");
        expect(await uidActual()).toBe("u2");
        emitir("TOKEN_REFRESHED", "u2");
        expect(await uidActual()).toBe("u2");
        expect(getSession).toHaveBeenCalledTimes(1);
    });

    it("si llega un evento mientras se lee la sesión, manda el evento", async () => {
        let soltar: (() => void) | null = null;
        getSession.mockImplementationOnce(
            () =>
                new Promise((res) => {
                    soltar = () => res({ data: { session: { user: { id: "viejo" } } } });
                }),
        );
        const p = uidActual();
        await Promise.resolve();
        emitir("SIGNED_IN", "nuevo");
        (soltar as unknown as () => void)();
        expect(await p).toBe("nuevo");
        expect(await uidActual()).toBe("nuevo");
    });

    it("sin sesión devuelve null y nunca lanza", async () => {
        estado.sesion = null;
        expect(await uidActual()).toBeNull();
        getSession.mockRejectedValueOnce(new Error("roto"));
        _reiniciarUsuarioParaPruebas();
        expect(await uidActual()).toBeNull();
    });

    it("compatibilidad: un cliente simulado sin getSession usa getUser, sin caché", async () => {
        estado.cliente = { auth: { getUser } };
        expect(await uidActual()).toBe("u1");
        expect(await uidActual()).toBe("u1");
        expect(getUser).toHaveBeenCalledTimes(2);
    });
});

describe("usuarioVerificado", () => {
    it("pregunta al servidor como mucho una vez cada 10 min", async () => {
        vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z") });
        expect((await usuarioVerificado())?.id).toBe("u1");
        expect((await usuarioVerificado())?.id).toBe("u1");
        expect(getUser).toHaveBeenCalledTimes(1);
        vi.setSystemTime(Date.now() + VERIFICAR_CADA_MS + 1);
        await usuarioVerificado();
        expect(getUser).toHaveBeenCalledTimes(2);
    });

    it("sin sesión no gasta ninguna petición", async () => {
        estado.sesion = null;
        expect(await usuarioVerificado()).toBeNull();
        expect(getUser).not.toHaveBeenCalled();
    });
});
