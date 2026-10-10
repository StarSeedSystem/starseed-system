import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GETUSER_VIGENCIA_MS, ahorrarAuth, type AuthAhorrable } from "../auth-ahorro";

type Oyente = (evento: string, sesion: { user?: { id?: string } | null } | null) => void | Promise<void>;

/** Un cliente de Auth falso con lo justo: getUser a la «red» y un emisor de eventos. */
function authFalsa(uid: string | null = "u1") {
    const oyentes = new Set<Oyente>();
    let cuenta = uid;
    const red = vi.fn(async (jwt?: string) => {
        void jwt;
        return { data: { user: cuenta ? { id: cuenta, user_metadata: { n: 1 } } : null }, error: null };
    });
    const auth: AuthAhorrable & { emitir(ev: string, id?: string | null): void; cambiarCuenta(id: string | null): void } = {
        getUser: red,
        onAuthStateChange(cb: Oyente) {
            oyentes.add(cb);
            return { data: { subscription: { unsubscribe: () => oyentes.delete(cb) } } };
        },
        emitir(ev: string, id: string | null = cuenta) {
            for (const o of Array.from(oyentes)) void o(ev, id ? { user: { id } } : null);
        },
        cambiarCuenta(id: string | null) {
            cuenta = id;
        },
    };
    return { auth, red };
}

beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-10T20:00:00Z") });
});
afterEach(() => {
    vi.useRealTimers();
});

describe("getUser() compartido", () => {
    it("21 llamadas al cargar una página = 1 petición (medido: 21 en /metagenesis)", async () => {
        const { auth, red } = authFalsa();
        ahorrarAuth(auth);
        const respuestas = await Promise.all(Array.from({ length: 21 }, () => auth.getUser()));
        expect(red).toHaveBeenCalledTimes(1);
        expect(respuestas.every((r) => r.data?.user?.id === "u1")).toBe(true);
        // Y en serie, dentro de la vigencia, tampoco sale a la red.
        for (let i = 0; i < 5; i++) await auth.getUser();
        expect(red).toHaveBeenCalledTimes(1);
    });

    it("caduca a los 60 s y vuelve a preguntar una vez", async () => {
        const { auth, red } = authFalsa();
        ahorrarAuth(auth);
        await auth.getUser();
        vi.advanceTimersByTime(GETUSER_VIGENCIA_MS + 1);
        await auth.getUser();
        await auth.getUser();
        expect(red).toHaveBeenCalledTimes(2);
    });

    it("getUser(jwt) siempre va a la red (verificar un token concreto)", async () => {
        const { auth, red } = authFalsa();
        ahorrarAuth(auth);
        await auth.getUser("token-a");
        await auth.getUser("token-a");
        expect(red).toHaveBeenCalledTimes(2);
    });

    it("cambiar de cuenta o salir invalida la respuesta guardada", async () => {
        const { auth, red } = authFalsa("u1");
        ahorrarAuth(auth);
        expect((await auth.getUser()).data?.user?.id).toBe("u1");
        auth.cambiarCuenta("u2");
        auth.emitir("SIGNED_IN", "u2");
        expect((await auth.getUser()).data?.user?.id).toBe("u2");
        auth.cambiarCuenta(null);
        auth.emitir("SIGNED_OUT", null);
        expect((await auth.getUser()).data?.user ?? null).toBeNull();
        expect(red).toHaveBeenCalledTimes(3);
    });

    it("un error no se guarda: la siguiente llamada vuelve a preguntar", async () => {
        const { auth, red } = authFalsa();
        red.mockResolvedValueOnce({ data: { user: null }, error: { message: "sin red" } } as never);
        ahorrarAuth(auth);
        const a = await auth.getUser();
        expect(a.error).toBeTruthy();
        await auth.getUser();
        expect(red).toHaveBeenCalledTimes(2);
    });

    it("cada llamador recibe su copia (tocar data.user no cambia la de los demás)", async () => {
        const { auth } = authFalsa();
        ahorrarAuth(auth);
        const a = await auth.getUser();
        (a.data!.user as { id?: string }).id = "manipulado";
        const b = await auth.getUser();
        expect(b.data?.user?.id).toBe("u1");
    });
});

describe("onAuthStateChange sin ecos", () => {
    it("el SIGNED_IN que emite cada vuelta a la pestaña no relanza el arranque de nadie", () => {
        const { auth } = authFalsa("u1");
        ahorrarAuth(auth);
        const visto: string[] = [];
        auth.onAuthStateChange((ev) => {
            visto.push(ev);
        });
        auth.emitir("INITIAL_SESSION", "u1");
        // Cinco vueltas a la pestaña = cinco ecos de la misma cuenta.
        for (let i = 0; i < 5; i++) auth.emitir("SIGNED_IN", "u1");
        auth.emitir("TOKEN_REFRESHED", "u1");
        expect(visto).toEqual(["INITIAL_SESSION", "TOKEN_REFRESHED"]);
    });

    it("un inicio de sesión de verdad sí llega (de nadie a alguien y entre cuentas)", () => {
        const { auth } = authFalsa(null);
        const stats = ahorrarAuth(auth);
        const visto: string[] = [];
        auth.onAuthStateChange((ev, s) => {
            visto.push(`${ev}:${s?.user?.id ?? "-"}`);
        });
        auth.emitir("INITIAL_SESSION", null);
        auth.emitir("SIGNED_IN", "u1");
        auth.emitir("SIGNED_IN", "u1");
        auth.emitir("SIGNED_IN", "u2");
        auth.emitir("SIGNED_OUT", null);
        auth.emitir("SIGNED_IN", "u2");
        expect(visto).toEqual(["INITIAL_SESSION:-", "SIGNED_IN:u1", "SIGNED_IN:u2", "SIGNED_OUT:-", "SIGNED_IN:u2"]);
        expect(stats?.ecosSilenciados).toBe(1);
    });

    it("el primer evento de un oyente nuevo siempre pasa, aunque sea SIGNED_IN", () => {
        const { auth } = authFalsa("u1");
        ahorrarAuth(auth);
        const visto: string[] = [];
        auth.onAuthStateChange((ev) => {
            visto.push(ev);
        });
        auth.emitir("SIGNED_IN", "u1");
        expect(visto).toEqual(["SIGNED_IN"]);
    });

    it("es idempotente: envolver dos veces no duplica el filtro ni las estadísticas", async () => {
        const { auth, red } = authFalsa();
        const a = ahorrarAuth(auth);
        const b = ahorrarAuth(auth);
        expect(a).toBe(b);
        await Promise.all([auth.getUser(), auth.getUser()]);
        expect(red).toHaveBeenCalledTimes(1);
        expect(a?.pedidas).toBe(2);
        expect(a?.aLaRed).toBe(1);
    });

    it("sin cliente o con un cliente raro no hace nada", () => {
        expect(ahorrarAuth(null)).toBeNull();
        expect(ahorrarAuth({} as unknown as AuthAhorrable)).toBeNull();
    });
});
