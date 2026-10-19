import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { MetaPresencia, SenalLlamada } from "@/lib/llamadas/tipos";
import type { ConexionCanal } from "@/lib/llamadas/senalizacion";

/* ─────────────────────── Canal de señalización falsa ─────────────────────── */

type Conn = {
    sesion: string;
    clave: string;
    meta: MetaPresencia | null;
    oyP: Set<(p: MetaPresencia[]) => void>;
    oyS: Set<(s: SenalLlamada) => void>;
    oyE: Set<(e: string) => void>;
    enviadas: SenalLlamada[];
    suelta: boolean;
    denegado: boolean;
};

const h = vi.hoisted(() => ({ conns: [] as unknown[], iceFallo: false }));

function conns(): Conn[] {
    return h.conns as Conn[];
}

function crearConexionFalsa(sesionId: string = "llamada:test-sesion-directo"): ConexionCanal {
    const sesion = sesionId;
    const clave = sesionId.replace(/[^:]/g, "") + "-t";
    const c: Conn = {
        sesion,
        clave,
        meta: null,
        oyP: new Set(),
        oyS: new Set(),
        oyE: new Set(),
        enviadas: [],
        suelta: false,
        denegado: false,
    };
    (h.conns as Conn[]).push(c);
    return {
        sesionId,
        tema: sesion,
        clave: () => c.clave,
        suscrito: () => !c.denegado,
        estado: () => (c.denegado ? "denegado" : "dentro"),
        presencia: () => [],
        onPresencia: (cb: (p: MetaPresencia[]) => void) => {
            c.oyP.add(cb);
            return () => c.oyP.delete(cb);
        },
        onSenal: (cb: (s: SenalLlamada) => void) => {
            c.oyS.add(cb);
            return () => c.oyS.delete(cb);
        },
        onSuscrito: () => () => undefined,
        onEstado: (cb: (e: string) => void) => {
            c.oyE.add(cb);
            return () => c.oyE.delete(cb);
        },
        enviar: (s: SenalLlamada) => {
            if (c.denegado || c.suelta) return;
            c.enviadas.push(s);
            for (const otro of conns()) {
                if (otro !== c && otro.sesion === sesion && !otro.suelta) queueMicrotask(() => otro.oyS.forEach((cb) => cb(s)));
            }
        },
        publicar: (meta: MetaPresencia) => {
            c.meta = meta;
            // Repartición simple
            for (const otro of conns()) {
                if (otro !== c && !otro.suelta) queueMicrotask(() => otro.oyP.forEach((cb) => cb([c.meta!])));
            }
        },
        retirar: () => {
            c.meta = null;
            for (const otro of conns()) {
                if (otro !== c && !otro.suelta) queueMicrotask(() => otro.oyP.forEach((cb) => cb([])));
            }
        },
        soltar: () => {
            c.suelta = true;
            for (const otro of conns()) {
                if (otro !== c && !otro.suelta) queueMicrotask(() => otro.oyP.forEach((cb) => cb([])));
            }
        },
    };
}

/* ───────────────────────────── MotorLlamada ───────────────────────────── */

const { MotorLlamada } = await import("@/lib/llamadas/motor");

const OPCIONES_BASE = {
    sesionId: "s1",
    yo: { base: "test", uid: "test-uid", nombre: "Test", avatar: null, invitado: false },
    intervaloNivelMs: 60_000,
    intervaloStatsMs: 60_000,
};

beforeEach(() => {
    h.conns.length = 0;
});

describe("MotorLlamada (canales directos)", () => {
    it("devuelve true cuando entrar() usa canales directos", async () => {
        const canalDirecto = crearConexionFalsa();

        const opciones: typeof OPCIONES_BASE & { canalesDirectos: () => ConexionCanal[] } = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones as any);
        await motor.prepararMedios({ audio: true, video: false });
        motor.entrar();

        const resultado = motor.entrar();

        expect(resultado).toBe(true);
        expect(motor.estado().fase).toBe("esperando");
        expect(motor.canales.length).toBe(1);
        expect(motor.canales[0].directo).toBe(true);
    });

    it("cuando un canal directo publica presencia, el motor crea su par", async () => {
        const canalDirecto = crearConexionFalsa();

        const opciones: typeof OPCIONES_BASE & { canalesDirectos: () => ConexionCanal[] } = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones as any);
        await motor.prepararMedios({ audio: true, video: false });
        motor.entrar();

        canalDirecto.publicar({
            id: "person-2",
            uid: "person-2-uid",
            nombre: "Person 2",
            avatar: null,
            invitado: false,
            micro: true,
            camara: false,
            pantalla: false,
            unido: 123,
        });

        const participantes = motor.estado().participantes;
        expect(participantes.some((p) => p.id === "person-2")).toBe(true);
        expect(motor.pares.has("person-2")).toBe(true);
        expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith(
            expect.objectContaining({ iceServers: expect.any(Array) })
        );
    });

    it("revisarCanal nunca suelta el canal directo", async () => {
        const canalSupabase = crearConexionFalsa("llamada:test-sesion-supabase");

        vi.mock("@/lib/llamadas/senalizacion", async (importOriginal) => {
            const original = await importOriginal();
            return {
                ...original as any,
                abrirCanalLlamada: vi.fn((id, opts) => {
                    if (opts.clave === "test-clave-supabase") {
                        return canalSupabase;
                    }
                    return null;
                }),
            };
        });

        const opciones: typeof OPCIONES_BASE & { canalesDirectos: () => ConexionCanal[] } = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [crearConexionFalsa("llamada:test-sesion-directo")],
        };
        const motor = new MotorLlamada(opciones as any);
        await motor.prepararMedios({ audio: true, video: false });
        motor.entrar();

        const antes = motor.canales.length;
        expect(motor.canales.some((c) => c.directo)).toBe(true);
        expect(motor.canales.some((c) => !c.directo)).toBe(true);

        motor.revisarCanal(false);

        const despues = motor.canales.length;
        expect(despues).toBe(antes);
        expect(motor.canales.some((c) => c.directo)).toBe(true);
    });
});