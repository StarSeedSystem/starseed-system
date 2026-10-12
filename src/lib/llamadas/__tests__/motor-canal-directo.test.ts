import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaPresencia } from "@/lib/llamadas/tipos";

/* ─────────────────────────────── Medios falsos ─────────────────────────────── */

class PistaFalsa {
    enabled = true;
    readyState = "live";
    muted = false;
    stop = vi.fn(() => {
        this.readyState = "ended";
    });
    onended: (() => void) | null = null;
    onmute: (() => void) | null = null;
    onunmute: (() => void) | null = null;
    constructor(public kind: "audio" | "video") {}
    getSettings() {
        return { deviceId: `${this.kind}-1` };
    }
}

class StreamFalso {
    id = `s-${Math.random().toString(36).slice(2, 8)}`;
    constructor(public pistas: PistaFalsa[] = []) {}
    getTracks() {
        return this.pistas;
    }
    getAudioTracks() {
        return this.pistas.filter((p) => p.kind === "audio");
    }
    getVideoTracks() {
        return this.pistas.filter((p) => p.kind === "video");
    }
    addTrack(p: PistaFalsa) {
        if (!this.pistas.includes(p)) this.pistas.push(p);
    }
    removeTrack(p: PistaFalsa) {
        this.pistas = this.pistas.filter((x) => x !== p);
    }
}

vi.mock("@/lib/llamadas/medios", () => ({
    obtenerMedios: vi.fn(async (p: { audio: boolean; video: boolean }) => ({
        stream: new StreamFalso([...(p.audio ? [new PistaFalsa("audio")] : []), ...(p.video ? [new PistaFalsa("video")] : [])]),
        error: null,
        aviso: null,
    })),
    obtenerPista: vi.fn(async (tipo: "audio" | "video") => ({ pista: new PistaFalsa(tipo), error: null })),
    obtenerPantalla: vi.fn(async () => ({ pista: new PistaFalsa("video"), error: null })),
    listarDispositivos: vi.fn(async () => ({ microfonos: [{ id: "audio-1", nombre: "Micro" }], camaras: [], altavoces: [] })),
    pararStream: vi.fn((s: StreamFalso | null) => s?.getTracks().forEach((t) => t.stop())),
}));

/* ─────────────────────────────── ICE falso ─────────────────────────────── */

vi.mock("@/lib/llamadas/ice", async (original) => ({
    ...(await original<typeof import("@/lib/llamadas/ice")>()),
    servidoresIce: () => [{ urls: "stun:x" }],
}));

/* ─────────────────────────────── Identidad falsa ─────────────────────────────── */

vi.mock("@/lib/llamadas/identidad", () => ({
    clavePestana: (base: string) => `${base}:t`,
}));

/* ─────────────────────────────── Signaling falso ─────────────────────────────── */

type Conn = {
    sesion: string;
    clave: string;
    meta: MetaPresencia | null;
    oyP: Set<(p: MetaPresencia[]) => void>;
    oyS: Set<(s: any) => void>;
    oyE: Set<(e: string) => void>;
    enviadas: any[];
    suelta: boolean;
    denegado: boolean;
};

const h = vi.hoisted(() => ({ conns: [] as unknown[] }));

function conns(): Conn[] {
    return h.conns as Conn[];
}

function repartirPresencia(sesion: string) {
    const lista = conns()
        .filter((c) => c.sesion === sesion && c.meta && !c.suelta)
        .map((c) => c.meta!)
        .sort((a, b) => a.unido - b.unido);
    for (const c of conns().filter((x) => x.sesion === sesion && !x.suelta)) {
        queueMicrotask(() => c.oyP.forEach((cb) => cb(lista)));
    }
}

function denegarTema(tema: string) {
    for (const c of conns().filter((x) => x.sesion === tema && !x.suelta)) {
        c.denegado = true;
        c.oyE.forEach((cb) => cb("denegado"));
    }
}

vi.mock("@/lib/llamadas/senalizacion", () => ({
    abrirCanalLlamada: (sesionId: string, opciones: { clave?: string | null; tema?: string | null } = {}) => {
        const sesion = opciones.tema ?? sesionId;
        const c: Conn = {
            sesion,
            clave: opciones.clave ?? "obs",
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
            onSenal: (cb: (s: any) => void) => {
                c.oyS.add(cb);
                return () => c.oyS.delete(cb);
            },
            onSuscrito: () => () => undefined,
            onEstado: (cb: (e: string) => void) => {
                c.oyE.add(cb);
                return () => c.oyE.delete(cb);
            },
            enviar: (s: any) => {
                if (c.denegado || c.suelta) return;
                c.enviadas.push(s);
                for (const otro of conns()) {
                    if (otro !== c && otro.sesion === sesion && !otro.suelta) queueMicrotask(() => otro.oyS.forEach((cb) => cb(s)));
                }
            },
            publicar: (meta: MetaPresencia) => {
                c.meta = meta;
                repartirPresencia(sesion);
            },
            retirar: () => {
                c.meta = null;
                repartirPresencia(sesion);
            },
            soltar: () => {
                c.suelta = true;
                repartirPresencia(sesion);
            },
        };
    },
}));

/* ─────────────────────────────── Esperar ─────────────────────────────── */

async function esperar(vueltas = 30) {
    for (let i = 0; i < vueltas; i++) await new Promise((r) => setTimeout(r, 0));
}

/* ─────────────────────────────── Canal directo falso ─────────────────────────────── */

function crearConexionFalsa(tema?: string) {
    const conexion: any = {
        directo: true,
        publicar: vi.fn((meta: MetaPresencia) => {
            // Guardamos la meta publicada para que el test pueda verificarla
            conexion.metaPublicada = meta;
        }),
    };
    if (tema) {
        conexion.tema = tema;
    }
    return conexion;
}

/* ─────────────────────────────── Opciones base ─────────────────────────────── */

const OPCIONES_BASE = {
    sesionId: "llamada:test",
    yo: { base: "test", uid: "test", nombre: "Test", avatar: null, invitado: false },
};

/* ─────────────────────────────── RTCPeerConnection falso ─────────────────────────────── */

let pcs: any[] = [];

class PCFalsa {
    signalingState: RTCSignalingState = "stable";
    iceConnectionState: RTCIceConnectionState = "new";
    connectionState: RTCPeerConnectionState = "new";
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    constructor(public config: RTCConfiguration) {
        pcs.push(this);
    }
    // We don't need to implement all methods for these tests, but we need to have the constructor called.
    // The test only checks that the constructor was called with certain arguments.
}

/* ─────────────────────────────── Setup ─────────────────────────────── */

beforeEach(() => {
    pcs = [];
    h.conns.length = 0;
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCFalsa;
});

afterEach(() => {
    delete (globalThis as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});

/* ─────────────────────────────── Importar MotorLlamada ─────────────────────────────── */

const { MotorLlamada } = await import("@/lib/llamadas/motor");

/* ─────────────────────────────── Tests ─────────────────────────────── */

describe("MotorLlamada con canales directos", () => {
    it("devuelve true cuando entrar() usa canales directos", async () => {
        const canalDirecto = crearConexionFalsa();

        const opciones: OpcionesMotor = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones);

        const resultado = motor.entrar();
        expect(resultado).toBe(true);
        await esperar();
        expect(motor.estado().fase).toBe("esperando");
        expect((motor as any).canales.length).toBe(1);
        expect((motor as any).canales[0].directo).toBe(true);
    });

    it("cuando un canal directo publica presencia, el motor crea su par", async () => {
        const canalDirecto = crearConexionFalsa();

        const opciones: OpcionesMotor = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones);
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
        const opciones: OpcionesMotor = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [crearConexionFalsa("llamada:test-sesion-directo")],
        };
        const motor = new MotorLlamada(opciones);
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