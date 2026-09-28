/**
 * Registro de canales de las llamadas. El cliente de Supabase de mentira reproduce las dos
 * trampas de realtime-js: `channel(tema)` devuelve el canal existente del mismo tema, y
 * `removeChannel` solo lo quita de la lista cuando el servidor confirma la salida.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Cb = (...a: unknown[]) => void;

class CanalFalso {
    oyentes: { tipo: string; filtro: { event?: string }; cb: Cb }[] = [];
    alSuscribir: ((estado: string) => void) | null = null;
    suscripciones = 0;
    enviados: unknown[] = [];
    tracks: unknown[] = [];
    untracks = 0;
    estadoPresencia: Record<string, unknown[]> = {};
    constructor(public topic: string, public params: { config?: { presence?: { key?: string } } }) {}
    on(tipo: string, filtro: { event?: string }, cb: Cb) {
        this.oyentes.push({ tipo, filtro, cb });
        return this;
    }
    subscribe(cb: (estado: string) => void) {
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

const h = vi.hoisted(() => ({ lista: [] as unknown[], creados: [] as unknown[], salidas: [] as (() => void)[] }));

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        channel(tema: string, params: { config?: { presence?: { key?: string } } }) {
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
});

afterEach(() => {
    __reiniciarCanales();
    delete (globalThis as unknown as { window?: unknown }).window;
});

describe("canal de una llamada", () => {
    it("encola lo que se envía antes de estar dentro y lo manda al suscribirse, con la presencia", () => {
        const c = abrirCanalLlamada("s1", { clave: "yo:1" })!;
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
        const c = abrirCanalLlamada("s2", { clave: "yo:1" })!;
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
        const tarjeta = abrirCanalLlamada("s3")!;
        const presTarjeta = vi.fn();
        tarjeta.onPresencia(presTarjeta);
        expect(creados()).toHaveLength(1);
        const viejo = creados()[0];
        expect(viejo.params.config?.presence?.key).toMatch(/^obs-/);

        const motor = abrirCanalLlamada("s3", { clave: "yo:1" })!;
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
        const a = abrirCanalLlamada("s4", { clave: "yo:1" })!;
        creados()[0].conectar();
        a.soltar();
        const b = abrirCanalLlamada("s4", { clave: "yo:1" })!;
        expect(b).not.toBeNull();
        expect(creados()).toHaveLength(1); // esperando al cierre
        await confirmarSalidas();
        expect(creados()).toHaveLength(2);
        expect(creados()[1].suscripciones).toBe(1);
        b.soltar();
    });
});
