import { describe, it, expect } from "vitest";
import type { MetaPresencia, SenalLlamada } from "@/lib/llamadas/tipos";

/* ───────────────────────────── Canal directo falso ─────────────────────────────── */

function crearConexionFalsa(override: Partial<{ id: string; tema: string }> = {}): {
    id: string;
    publicar: (meta: any) => void;
    estado: () => string;
    directo: boolean;
    onPresencia: (cb: (p: MetaPresencia[]) => void) => () => void;
    onSenal: (cb: (s: SenalLlamada) => void) => () => void;
    onSuscrito: () => () => undefined;
    onEstado: (cb: (e: string) => void) => () => void;
    publicar: (meta: any) => void;
} {
    const id = override.id ?? `test-${Math.random().toString(36).slice(2, 8)}`;
    let tema = override.tema ?? `llamada:${id}`;
    let directo = true;
    const meta: MetaPresencia = {
        id: "test-uid",
        uid: "test-uid",
        nombre: "Test Person",
        avatar: null,
        invitado: false,
        micro: true,
        camara: false,
        pantalla: false,
        unido: Date.now(),
    };
    const published: MetaPresencia[] = [meta];
    return {
        id,
        publicar: () => {
            // noop in test
        },
        estado: () => directo ? "dentro" : "error",
        directo,
        onPresencia: () => () => {},
        onSenal: () => () => {},
        onSuscrito: () => () => undefined,
        onEstado: () => () => undefined,
    };
}

/* ─────────────────────── RTCPeerConnection falso ─────────────────────── */

class PCFalsa {
    signalingState: RTCSignalingState = "stable";
    iceConnectionState: RTCIceConnectionState = "new";
    connectionState: RTCPeerConnectionState = "new";
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    emisores: any[] = [];
    candidatos: any[] = [];
    rollbacks = 0;
    reinicios = 0;
    cerrada = false;
    private n = 0;
    private negociando = false;
    onicecandidate: ((ev: unknown) => void) | null = null;
    ontrack: ((ev: unknown) => void) | null;
    onnegotiationneeded: (() => void) | null;
    oniceconnectionstatechange: (() => void) | null;
    onconnectionstatechange: (() => void) | null;
    constructor(public config: RTCConfiguration) {}
    private necesitaNegociar() {
        if (this.negociando) return;
        this.negociando = false;
        queueMicrotask(() => {
            this.negociando = false;
            if (this.signalingState === "stable") this.onnegotiationneeded?.();
        });
    }
    addTrack(p: any) {
        const e = { replaceTrack: () => {} };
        this.emisores.push(e);
        this.necesitaNegociar();
        return e;
    }
    async setLocalDescription(d?: any) {
        await Promise.resolve();
        if (d?.type === "rollback") {
            this.rollbacks += 1;
            this.signalingState = "stable";
            this.localDescription = null;
            return;
        }
        if (this.signalingState === "have-local-offer") {
            this.localDescription = { type: "answer", sdp: `answer-${++this.n}` };
            this.signalingState = "stable";
        } else {
            this.localDescription = { type: "offer", sdp: `offer-${++this.n}` };
            this.signalingState = "have-local-offer";
        }
    }
    async setRemoteDescription(d: any) {
        await Promise.resolve();
        if (d.type === "offer") {
            if (this.signalingState === "have-local-offer") throw new Error("glare sin rollback");
            this.signalingState = "have-remote-offer";
        } else {
            this.signalingState = "stable";
        }
        this.remoteDescription = d;
    }
    addIceCandidate(c: any) {
        this.candidatos.push(c);
    }
    restartIce() {
        this.reinicios += 1;
    }
    async getStats() {
        return new Map();
    }
    close() {
        this.cerrada = true;
    }
    fijarIce(estado: any) {
        this.iceConnectionState = estado;
    }
}

let pcs: PCFalsa[] = [];
(globalThis as unknown as { RTCPeerConnection: new () => PCFalsa }).RTCPeerConnection = PCFalsa;

async function esperar(vueltas = 30) {
    for (let i = 0; i < vueltas; i++) await new Promise((r) => setTimeout(r, 0));
}

const { MotorLlamada } = await import("@/lib/llamadas/motor");

function yo(base: string) {
    return { base, uid: base, nombre: base.toUpperCase(), avatar: null, invitado: false };
}

/* ───────────────────────────── Tests ───────────────────────────── */

describe("MotorLlamada - canales directos", () => {
    it("devuelve true cuando entrar() usa canales directos", async () => {
        const canalDirecto = crearConexionFalsa();
        const opciones: any = {
            sesionId: "test1",
            yo: yo("a"),
            intervaloNivelMs: 60_000,
            intervaloStatsMs: 60_000,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones as any);
        const resultado = motor.entrar();
        expect(resultado).toBe(true);
        await esperar();
        expect(motor.estado().fase).toBe("esperando");
        expect((motor as any).canales.length).toBe(1);
        expect((motor as any).canales[0].directo).toBe(true);
    });

    it("cuando un canal directo publica presencia, el motor crea su par", async () => {
        const canalDirecto = crearConexionFalsa();
        const opciones: any = {
            sesionId: "test2",
            yo: yo("a"),
            intervaloNivelMs: 60_000,
            intervaloStatsMs: 60_000,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones as any);
        motor.entrar();
        await esperar();

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
        await esperar();

        const participantes = motor.estado().participantes;
        expect(participantes.some((p) => p.id === "person-2")).toBe(true);
        expect((motor as any).pares.has("person-2")).toBe(true);
        expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith(
            expect.objectContaining({ iceServers: expect.any(Array) })
        );
    });

    it("revisarCanal nunca suelta el canal directo", async () => {
        const opciones: any = {
            sesionId: "test3",
            yo: yo("a"),
            intervaloNivelMs: 60_000,
            intervaloStatsMs: 60_000,
            canalesDirectos: () => [crearConexionFalsa("llamada:test-sesion-directo")],
        };
        const motor = new MotorLlamada(opciones as any);
        motor.entrar();
        await esperar();

        const antes = (motor as any).canales.length;
        expect((motor as any).canales.some((c: any) => c.directo)).toBe(true);

        await motor.revisarCanal(false);
        await esperar();

        const despues = (motor as any).canales.length;
        expect(despues).toBe(antes);
        expect((motor as any).canales.some((c: any) => c.directo)).toBe(true);
    });
});