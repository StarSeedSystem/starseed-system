/**
 * ICE1114S · Prueba 42, llamada 3 (tableta llamando): ICE nunca conectó. Dos motores con una RTCPeerConnection falsa ESTRICTA
 * (cada descripción trae su `a=ice-ufrag`, cada candidato su generación y `addIceCandidate` rechaza lo que no es de la
 * descripción remota vigente, como Chromium) y un canal en memoria donde las descripciones tardan más que los candidatos
 * (el SDP de ~2,7 kB por Bluetooth o el servidor, y los candidatos por el otro canal).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaPresencia, SenalLlamada } from "@/lib/llamadas/tipos";
import { decidirReintentoIce, esperaReintentoIce, type EntradaReintentoIce } from "@/lib/llamadas/carriles";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";

/* ─────────────────────── Canal de señalización en memoria ─────────────────────── */

type Conn = {
    /** Tema del canal (las señales y la presencia solo viajan dentro del mismo tema). */
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

function repartirPresencia(sesion: string) {
    const lista = conns()
        .filter((c) => c.sesion === sesion && c.meta && !c.suelta)
        .map((c) => c.meta!)
        .sort((a, b) => a.unido - b.unido);
    for (const c of conns().filter((x) => x.sesion === sesion && !x.suelta)) {
        queueMicrotask(() => c.oyP.forEach((cb) => cb(lista)));
    }
}

/** El servidor deniega un tema: los canales abiertos en él pasan a «denegado». */
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
                    if (otro !== c && otro.sesion === sesion && !otro.suelta) {
                        const entrega = () => otro.oyS.forEach((cb) => cb(s));
                        // Las descripciones (SDP de varios kB, por el canal lento) llegan después de los candidatos.
                        if (s.tipo === "senal" && s.desc) setTimeout(entrega, 300);
                        else queueMicrotask(entrega);
                    }
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

vi.mock("@/lib/llamadas/identidad", () => ({
    clavePestana: (base: string) => `${base}:t`,
}));

vi.mock("@/lib/llamadas/ice", async (original) => ({
    ...(await original<typeof import("@/lib/llamadas/ice")>()),
    servidoresIce: () => [{ urls: "stun:x" }],
}));

/* ─────────────────────── RTCPeerConnection estricta ─────────────────────── */

let pcs: PCFalsa[] = [];
let contador = 0;

class Emisor {
    replaceTrack = vi.fn(async (p: PistaFalsa | null) => {
        this.track = p;
    });
    constructor(public track: PistaFalsa | null) {}
}

class PCFalsa {
    id = ++contador;
    signalingState: RTCSignalingState = "stable";
    iceConnectionState: RTCIceConnectionState = "new";
    connectionState: RTCPeerConnectionState = "new";
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    emisores: Emisor[] = [];
    /** Candidatos aceptados, con la generación remota a la que pertenecían. */
    aceptados: RTCIceCandidateInit[] = [];
    rechazados = 0;
    reinicios = 0;
    generacion = 0;
    onicecandidate: ((ev: unknown) => void) | null = null;
    ontrack: ((ev: unknown) => void) | null = null;
    onnegotiationneeded: (() => void) | null = null;
    oniceconnectionstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    private negociando = false;
    constructor(public config: RTCConfiguration) {
        pcs.push(this);
    }
    private ufragLocal() {
        return `u${this.id}g${this.generacion}`;
    }
    private necesitaNegociar() {
        if (this.negociando) return;
        this.negociando = true;
        queueMicrotask(() => {
            this.negociando = false;
            if (this.signalingState === "stable") this.onnegotiationneeded?.();
        });
    }
    addTrack(p: PistaFalsa) {
        const e = new Emisor(p);
        this.emisores.push(e);
        this.necesitaNegociar();
        return e;
    }
    private sdp(tipo: string) {
        return `v=0\r\n${tipo}\r\na=ice-ufrag:${this.ufragLocal()}\r\na=ice-pwd:x\r\n`;
    }
    async setLocalDescription(d?: RTCSessionDescriptionInit) {
        await Promise.resolve();
        if (d?.type === "rollback") {
            this.signalingState = "stable";
            this.localDescription = null;
            return;
        }
        const tipo = this.signalingState === "have-remote-offer" ? "answer" : "offer";
        if (tipo === "offer") this.generacion = this.generacion || 1;
        else this.generacion = Math.max(this.generacion, 1);
        this.localDescription = { type: tipo, sdp: this.sdp(tipo) };
        this.signalingState = tipo === "answer" ? "stable" : "have-local-offer";
        // El navegador junta candidatos al fijar la descripción local y los entrega en la generación vigente.
        const ufrag = this.ufragLocal();
        setTimeout(() => {
            for (const n of [1, 2]) this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `candidate:${n} 1 udp 1 10.0.0.${this.id}.${n} 5000 typ host`, sdpMid: "0", usernameFragment: ufrag }) } });
            this.onicecandidate?.({ candidate: null });
        }, 0);
    }
    async setRemoteDescription(d: RTCSessionDescriptionInit) {
        await Promise.resolve();
        if (d.type === "offer") {
            if (this.signalingState === "have-local-offer") throw new Error("glare sin rollback");
            this.signalingState = "have-remote-offer";
        } else {
            this.signalingState = "stable";
        }
        this.remoteDescription = d;
        const pista = new PistaFalsa("audio");
        this.ontrack?.({ track: pista, streams: [new StreamFalso([pista])] });
    }
    async addIceCandidate(c: RTCIceCandidateInit) {
        if (!this.remoteDescription) throw new Error("sin descripción remota");
        const vigente = /a=ice-ufrag:(\S+)/.exec(this.remoteDescription.sdp ?? "")?.[1];
        if (c.usernameFragment && c.usernameFragment !== vigente) {
            this.rechazados += 1;
            throw new Error("OperationError: ufrag no coincide con la descripción remota");
        }
        this.aceptados.push(c);
        // Conecta con candidatos del otro de la generación vigente.
        if (this.iceConnectionState !== "connected") this.fijarIce("connected");
    }
    restartIce() {
        this.reinicios += 1;
        this.generacion += 1;
        this.necesitaNegociar();
    }
    async getStats() {
        return new Map();
    }
    close() {}
    fijarIce(estado: RTCIceConnectionState) {
        this.iceConnectionState = estado;
        this.oniceconnectionstatechange?.();
    }
}

async function esperar(vueltas = 30) {
    for (let i = 0; i < vueltas; i++) await new Promise((r) => setTimeout(r, 0));
}

const { MotorLlamada } = await import("@/lib/llamadas/motor");

function yo(base: string) {
    return { base, uid: base, nombre: base.toUpperCase(), avatar: null, invitado: false };
}

let lineas: string[] = [];
beforeEach(() => {
    lineas = [];
    fijarSumideroDiagnostico((l) => lineas.push(`${l.hito} ${l.detalle}`));
    pcs = [];
    h.conns.length = 0;
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCFalsa;
});

afterEach(() => {
    fijarSumideroDiagnostico(null);
    vi.useRealTimers();
    delete (globalThis as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});


const OPC = { intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 };

/** Dos motores 1:1 contestados («a:t» descortés, «b:t» cortés). */
async function dosContestados(sesionId: string) {
    const a = new MotorLlamada({ sesionId, yo: yo("a"), colgarAlQuedarSolo: true, ...OPC });
    const b = new MotorLlamada({ sesionId, yo: yo("b"), colgarAlQuedarSolo: true, ...OPC });
    await a.prepararMedios({ audio: true, video: false });
    await b.prepararMedios({ audio: true, video: false });
    a.entrar();
    b.entrar();
    await esperar();
    expect(a.estado().fase).toBe("en-curso");
    expect(b.estado().fase).toBe("en-curso");
    return { a, b };
}


const asentar = (ms = 700) => new Promise((r) => setTimeout(r, ms));
type Interno = { pares: Map<string, { pc: PCFalsa }>; reiniciarIce(par: unknown): void };

describe("ICE1114S · candidatos de una generación nueva que llegan antes que su oferta", () => {
    it("la primera negociación conecta en los dos lados (tableta y Mac)", async () => {
        const { a, b } = await dosContestados("s-i-1");
        await asentar();
        expect(pcs.length).toBe(2);
        expect(pcs.every((p) => p.iceConnectionState === "connected")).toBe(true);
        a.colgar();
        b.colgar();
    });

    it("tras un reinicio de ICE, los candidatos de la generación nueva (llegados antes que su oferta) se aplican", async () => {
        const { a, b } = await dosContestados("s-i-2");
        await asentar();
        const ia = a as unknown as Interno;
        const pcA = ia.pares.get("b:t")!.pc;
        const pcB = (b as unknown as Interno).pares.get("a:t")!.pc;
        ia.reiniciarIce(ia.pares.get("b:t"));
        await asentar();
        const nueva = `u${pcA.id}g${pcA.generacion}`;
        expect(pcA.generacion).toBeGreaterThan(1);
        // Lo que vio el otro lado: candidatos de la generación nueva aceptados (antes: rechazados y tirados).
        expect(pcB.aceptados.some((c) => c.usernameFragment === nueva)).toBe(true);
        a.colgar();
        b.colgar();
    });

    it("el registro dice cuántos candidatos se enviaron, recibieron y esperan, y cada cambio de estado de ICE", async () => {
        const { a, b } = await dosContestados("s-i-3");
        await asentar();
        const l = lineas.filter((x) => /ice candidatos enviados=\d+ recibidos=\d+ en-espera=\d+ descartados=\d+ tipos=/.test(x));
        expect(l.some((x) => /ice=connected/.test(x))).toBe(true);
        expect(l.some((x) => /tx-host:2/.test(x))).toBe(true);
        expect(l.some((x) => /recibidos=[1-9]/.test(x))).toBe(true);
        a.colgar();
        b.colgar();
    });
});
