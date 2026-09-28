/**
 * Registro de canales de las llamadas. El cliente de Supabase de mentira reproduce las dos
 * trampas de realtime-js: `channel(tema)` devuelve el canal existente del mismo tema, y
 * `removeChannel` solo lo quita de la lista cuando el servidor confirma la salida.
 * Además: los canales son PRIVADOS, y si el servidor deniega la entrada se dice y se para.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Cb = (...a: unknown[]) => void;

class CanalFalso {
    oyentes: { tipo: string; filtro: { event?: string }; cb: Cb }[] = [];
    alSuscribir: ((estado: string, err?: unknown) => void) | null = null;
    suscripciones = 0;
    enviados: unknown[] = [];
    tracks: unknown[] = [];
    untracks = 0;
    estadoPresencia: Record<string, unknown[]> = {};
    constructor(public topic: string, public params: { config?: { presence?: { key?: string }; private?: boolean } }) {}
    on(tipo: string, filtro: { event?: string }, cb: Cb) {
        this.oyentes.push({ tipo, filtro, cb });
        return this;
    }
    subscribe(cb: (estado: string, err?: unknown) => void) {
        this.suscripciones += 1;
        if (this.suscripciones > 1) throw new Error("tried to subscribe multiple times");
        this.alSuscribir = cb;
        return this;
    }
    send(m: unknown) {
        this.enviados.push(m);
        return Promise.resolve("ok");
    }
    track(m: unknown) {
        this.tracks.push(m);
        return Promise.resolve("ok");
    }
    untrack() {
        this.untracks += 1;
        return Promise.resolve("ok");
    }
    presenceState() {
        return this.estadoPresencia;
    }
    // Ayudas de la prueba
    conectar() {
        this.alSuscribir?.("SUBSCRIBED");
    }
    sincronizar(estado: Record<string, unknown[]>) {
        this.estadoPresencia = estado;
        for (const o of this.oyentes) if (o.tipo === "presence") o.cb();
    }
    difundir(payload: unknown) {
        for (const o of this.oyentes) if (o.tipo === "broadcast") o.cb({ payload });
    }
}

const h = vi.hoisted(() => ({
    lista: [] as unknown[],
    creados: [] as unknown[],
    salidas: [] as (() => void)[],
    /** Si se fija, el cliente tiene `realtime.setAuth` y resuelve cuando la prueba quiera. */
    auth: null as null | { llamadas: number; soltar: (() => void)[] },
}));

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        get realtime() {
            const a = h.auth;
            if (!a) return undefined;
            return {
                setAuth: () => {
                    a.llamadas += 1;
                    return new Promise<void>((ok) => a.soltar.push(ok));
                },
            };
        },
        channel(tema: string, params: { config?: { presence?: { key?: string }; private?: boolean } }) {
            const existente = (h.lista as CanalFalso[]).find((c) => c.topic === `realtime:${tema}`);
            if (existente) return existente;
            const c = new CanalFalso(`realtime:${tema}`, params);
            h.lista.push(c);
            h.creados.push(c);
            return c;
        },
        getChannels() {
            return h.lista as CanalFalso[];
        },
        removeChannel(c: CanalFalso) {
            // Se va de la lista cuando «el servidor confirma» (lo decide la prueba).
            return new Promise<string>((ok) => {
                h.salidas.push(() => {
                    h.lista = (h.lista as CanalFalso[]).filter((x) => x !== c);
                    ok("ok");
                });
            });
        },
    }),
}));

import { __reiniciarCanales, abrirCanalLlamada } from "@/lib/llamadas/senalizacion";
import { __reiniciarResolverTema, temaDenegadoReciente } from "@/lib/llamadas/resolver-tema";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const S4 = "44444444-4444-4444-8444-444444444444";
const S5 = "55555555-5555-4555-8555-555555555555";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

function creados(): CanalFalso[] {
    return h.creados as CanalFalso[];
}

async function confirmarSalidas() {
    for (const s of h.salidas.splice(0)) s();
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
    (globalThis as unknown as { window?: unknown }).window = globalThis;
    h.lista = [];
    h.creados = [];
    h.salidas = [];
    h.auth = null;
    __reiniciarResolverTema();
});

afterEach(() => {
    __reiniciarCanales();
    delete (globalThis as unknown as { window?: unknown }).window;
});

describe("canal de una llamada", () => {
    it("encola lo que se envía antes de estar dentro y lo manda al suscribirse, con la presencia", () => {
        const c = abrirCanalLlamada(S1, { clave: "yo:1" })!;
        const canal = creados()[0];
        expect(canal.params.config?.presence?.key).toBe("yo:1");
        c.enviar({ tipo: "colgar", de: "yo:1" });
        c.publicar({ id: "yo:1", uid: "yo", nombre: "Yo", avatar: null, invitado: false, micro: true, camara: false, pantalla: false, unido: 1 });
        expect(canal.enviados).toHaveLength(0);
        const suscrito = vi.fn();
        c.onSuscrito(suscrito);
        canal.conectar();
        expect(canal.enviados).toEqual([{ type: "broadcast", event: "llamada", payload: { tipo: "colgar", de: "yo:1" } }]);
        expect(canal.tracks).toHaveLength(1);
        expect(suscrito).toHaveBeenCalledWith(true);
        // Una reconexión vuelve a publicar la presencia.
        canal.alSuscribir?.("SUBSCRIBED");
        expect(canal.tracks).toHaveLength(2);
        c.soltar();
    });

    it("sanea la presencia y las señales que llegan", () => {
        const c = abrirCanalLlamada(S2, { clave: "yo:1" })!;
        const canal = creados()[0];
        canal.conectar();
        const presencia = vi.fn();
        const senal = vi.fn();
        c.onPresencia(presencia);
        c.onSenal(senal);
        canal.sincronizar({ "ana:1": [{ uid: "ana", nombre: "Ana", unido: 3, avatar: "javascript:x" }] });
        expect(presencia).toHaveBeenCalledWith([expect.objectContaining({ id: "ana:1", nombre: "Ana", avatar: null })]);
        canal.difundir({ tipo: "senal", de: "ana:1", para: "yo:1", ice: [{ candidate: "c" }] });
        canal.difundir({ tipo: "inventada", de: "x" });
        expect(senal).toHaveBeenCalledTimes(1);
        c.soltar();
    });

    it("observadores y participante comparten canal; el participante lo recrea con su clave", async () => {
        const tarjeta = abrirCanalLlamada(S3)!;
        const presTarjeta = vi.fn();
        tarjeta.onPresencia(presTarjeta);
        expect(creados()).toHaveLength(1);
        const viejo = creados()[0];
        expect(viejo.params.config?.presence?.key).toMatch(/^obs-/);

        const motor = abrirCanalLlamada(S3, { clave: "yo:1" })!;
        // Aún no hay canal nuevo: espera a que el viejo termine de irse.
        expect(creados()).toHaveLength(1);
        await confirmarSalidas();
        expect(creados()).toHaveLength(2);
        const nuevo = creados()[1];
        expect(nuevo.params.config?.presence?.key).toBe("yo:1");
        expect(nuevo.suscripciones).toBe(1);

        // El oyente de la tarjeta sigue recibiendo en el canal nuevo.
        nuevo.conectar();
        nuevo.sincronizar({ "yo:1": [{ uid: "yo", nombre: "Yo", unido: 1 }] });
        expect(presTarjeta).toHaveBeenLastCalledWith([expect.objectContaining({ id: "yo:1" })]);

        // Soltar la tarjeta no cierra el canal del motor.
        tarjeta.soltar();
        expect(h.salidas).toHaveLength(0);
        motor.retirar();
        expect(nuevo.untracks).toBe(1);
        motor.soltar();
        expect(h.salidas).toHaveLength(1);
    });

    it("volver a entrar justo después de colgar no reutiliza el canal a medio cerrar", async () => {
        const a = abrirCanalLlamada(S4, { clave: "yo:1" })!;
        creados()[0].conectar();
        a.soltar();
        const b = abrirCanalLlamada(S4, { clave: "yo:1" })!;
        expect(b).not.toBeNull();
        expect(creados()).toHaveLength(1); // esperando al cierre
        await confirmarSalidas();
        expect(creados()).toHaveLength(2);
        expect(creados()[1].suscripciones).toBe(1);
        b.soltar();
    });
});

describe("canal PRIVADO y denegaciones", () => {
    it("se abre como privado, con el tema de miembros por defecto o el tema público que se le pase", () => {
        const a = abrirCanalLlamada(S5, { clave: "yo:1" })!;
        expect(a.tema).toBe(`llamada:${S5}`);
        expect(creados()[0].topic).toBe(`realtime:llamada:${S5}`);
        expect(creados()[0].params.config?.private).toBe(true);
        const b = abrirCanalLlamada(S5, { clave: "yo:1", tema: `llamada:${S5}:${TOKEN}` })!;
        expect(b.tema).toBe(`llamada:${S5}:${TOKEN}`);
        expect(creados()).toHaveLength(2);
        expect(creados()[1].params.config?.private).toBe(true);
        a.soltar();
        b.soltar();
    });

    it("no abre el canal de OTRA sesión ni temas mal formados", () => {
        expect(abrirCanalLlamada(S1, { tema: `llamada:${S2}` })).toBeNull();
        expect(abrirCanalLlamada(S1, { tema: `vivo:${S1}` })).toBeNull();
        expect(abrirCanalLlamada("no-uuid")).toBeNull();
        expect(abrirCanalLlamada(S1, { tema: `llamada:${S1}:corto` })).toBeNull();
        expect(creados()).toHaveLength(0);
    });

    it("si el servidor deniega (política ausente o sin permiso): estado «denegado», se cierra y no se reintenta", () => {
        const c = abrirCanalLlamada(S1, { clave: "yo:1" })!;
        const canal = creados()[0];
        const estados: string[] = [];
        const suscrito = vi.fn();
        c.onEstado((e) => estados.push(e));
        c.onSuscrito(suscrito);
        canal.alSuscribir?.("CHANNEL_ERROR", new Error('"Unauthorized: You do not have permissions to read from this Channel topic: llamada:x"'));
        expect(c.estado()).toBe("denegado");
        expect(estados).toContain("denegado");
        expect(suscrito).toHaveBeenLastCalledWith(false);
        // Se pide al cliente que lo quite (para cortar los reintentos de realtime-js).
        expect(h.salidas).toHaveLength(1);
        // Lo que se envíe después no se encola para siempre.
        c.enviar({ tipo: "colgar", de: "yo:1" });
        expect(canal.enviados).toHaveLength(0);
        // Los observadores recuerdan la denegación un rato.
        expect(temaDenegadoReciente(`llamada:${S1}`)).toBe(true);
        c.soltar();
    });

    it("un fallo de red NO es una denegación: reconectando y realtime-js reintenta solo", () => {
        const c = abrirCanalLlamada(S2, { clave: "yo:1" })!;
        const canal = creados()[0];
        canal.conectar();
        expect(c.estado()).toBe("dentro");
        canal.alSuscribir?.("CHANNEL_ERROR", { type: "error" });
        expect(c.estado()).toBe("reconectando");
        expect(h.salidas).toHaveLength(0);
        canal.conectar();
        expect(c.estado()).toBe("dentro");
        c.soltar();
    });

    it("tres rechazos seguidos de otro tipo cuentan como denegación", () => {
        const c = abrirCanalLlamada(S3, { clave: "yo:1" })!;
        const canal = creados()[0];
        canal.alSuscribir?.("CHANNEL_ERROR", new Error("TooManyChannels"));
        canal.alSuscribir?.("CHANNEL_ERROR", new Error("TooManyChannels"));
        expect(c.estado()).toBe("reconectando");
        canal.alSuscribir?.("CHANNEL_ERROR", new Error("TooManyChannels"));
        expect(c.estado()).toBe("denegado");
        c.soltar();
    });

    it("espera a que el socket tenga el JWT de la sesión antes de unirse", async () => {
        h.auth = { llamadas: 0, soltar: [] };
        const c = abrirCanalLlamada(S4, { clave: "yo:1" })!;
        expect(c).not.toBeNull();
        expect(h.auth.llamadas).toBe(1);
        expect(creados()).toHaveLength(0);
        h.auth.soltar.forEach((ok) => ok());
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(creados()).toHaveLength(1);
        expect(creados()[0].suscripciones).toBe(1);
        c.soltar();
    });
});
