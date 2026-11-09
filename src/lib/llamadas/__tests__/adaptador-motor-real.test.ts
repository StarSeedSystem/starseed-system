/**
 * LLA1108G · DOS `MotorLlamada` REALES (el arnés de LLA1108E: transporte universal, sin Supabase) con el adaptador de la
 * superficie en cada extremo. Prueba que los mensajes de aplicación cruzan de verdad el canal de la llamada:
 * cambio de tipo con la señal para que el otro lado siga, chat, aviso de grabación con acuse y Astraura con la
 * misma respuesta en las dos neuronas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Identidad } from "@/lib/llamadas/identidad";
import type { ConexionCanal } from "@/lib/llamadas/senalizacion";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";
import { fabricaCodecsSimples } from "@/lib/llamadas/voz-datos/sesion";
import { AdaptadorMotor } from "@/lib/llamadas/superficie/adaptador-motor";
import { ENTORNO_ESCRITORIO } from "@/lib/llamadas/superficie/__tests__/motor-falso";

/** Sin internet: ningún canal privado de Supabase. */
vi.mock("@/lib/llamadas/senalizacion", () => ({
    abrirCanalLlamada: () => null,
}));

/* ─────────────────────────────── Medios y entorno falsos ─────────────────────────────── */

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
    listarDispositivos: vi.fn(async () => ({ microfonos: [], camaras: [], altavoces: [] })),
    pararStream: vi.fn((s: StreamFalso | null) => s?.getTracks().forEach((t) => t.stop())),
}));

vi.mock("@/lib/llamadas/identidad", () => ({
    clavePestana: (base: string) => `${base}:t`,
}));

/* ─────────────────────────── RTCPeerConnection de mentira ─────────────────────────── */

let pcs: PCFalsa[] = [];

class PCFalsa {
    signalingState: RTCSignalingState = "stable";
    iceConnectionState: RTCIceConnectionState = "new";
    connectionState: RTCPeerConnectionState = "new";
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    pistas: PistaFalsa[] = [];
    private n = 0;
    private negociando = false;
    onicecandidate: ((ev: unknown) => void) | null = null;
    ontrack: ((ev: unknown) => void) | null = null;
    onnegotiationneeded: (() => void) | null = null;
    oniceconnectionstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    constructor(public config: RTCConfiguration) {
        pcs.push(this);
    }
    addTrack(p: PistaFalsa) {
        this.pistas.push(p);
        if (!this.negociando) {
            this.negociando = true;
            queueMicrotask(() => {
                this.negociando = false;
                if (this.signalingState === "stable") this.onnegotiationneeded?.();
            });
        }
        return { track: p, replaceTrack: vi.fn(async () => undefined) };
    }
    async setLocalDescription(d?: RTCSessionDescriptionInit) {
        await Promise.resolve();
        if (d?.type === "rollback") {
            this.signalingState = "stable";
            this.localDescription = null;
            return;
        }
        if (this.signalingState === "have-remote-offer") {
            this.localDescription = { type: "answer", sdp: `respuesta-${++this.n}` };
            this.signalingState = "stable";
        } else {
            this.localDescription = { type: "offer", sdp: `oferta-${++this.n}` };
            this.signalingState = "have-local-offer";
        }
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
    }
    async addIceCandidate() {
        /* sin efecto */
    }
    restartIce() {
        /* sin efecto */
    }
    async getStats() {
        return new Map();
    }
    close() {
        /* sin efecto */
    }
    fijarIce(estado: RTCIceConnectionState) {
        this.iceConnectionState = estado;
        this.oniceconnectionstatechange?.();
    }
}


const { MotorLlamada } = await import("@/lib/llamadas/motor");
const { abrirCanalLlamadaPorTransporte } = await import("@/lib/llamadas/canal-enlace-transporte");
const { TEXTO_CONTESTADA_CONECTANDO, MOTIVO_SIN_AUDIO } = await import("@/lib/llamadas/voz-datos/decision");
type DepsCanal = Parameters<typeof abrirCanalLlamadaPorTransporte>[3];
type Motor = InstanceType<typeof MotorLlamada>;

/* ─────────────────────────────────── Ayudas ─────────────────────────────────── */

async function esperar(vueltas = 30) {
    for (let i = 0; i < vueltas; i++) await new Promise((r) => setTimeout(r, 0));
}

function yo(base: string): Identidad {
    return { base, uid: base, nombre: base.toUpperCase(), avatar: null, invitado: false };
}

/** Un transporte de SOLO Bluetooth entre dos neuronas: con acuse (`ok`), asíncrono y que se puede cortar. */
function redBle() {
    const oyentes: Record<string, Set<(m: { cuerpo: unknown; origen: { tipo: string } }) => void>> = { neuronA: new Set(), neuronB: new Set() };
    const estado = { arriba: true, enviados: 0 };
    const lado = (mio: "neuronA" | "neuronB", otro: "neuronA" | "neuronB"): DepsCanal => ({
        enviar: async (_neurona, cuerpo) => {
            if (!estado.arriba) return { ok: false };
            estado.enviados++;
            const copia: unknown = JSON.parse(JSON.stringify(cuerpo));
            queueMicrotask(() => oyentes[otro].forEach((cb) => cb({ cuerpo: copia, origen: { tipo: "ble" } })));
            return { ok: true, via: "ble" };
        },
        alRecibir: (cb) => {
            oyentes[mio].add(cb);
            return () => {
                oyentes[mio].delete(cb);
            };
        },
        hayEnlace: () => estado.arriba,
        yo: () => mio,
        esperar: async () => undefined,
    });
    return { estado, mac: lado("neuronA", "neuronB"), tableta: lado("neuronB", "neuronA") };
}

const vozDatos = () => ({
    transporteHacia: () => null,
    hayRutaIp: () => false,
    crearAudio: () => null,
    codecs: () => fabricaCodecsSimples(),
    neurona: null,
});


const motores: Motor[] = [];
const hitos: string[] = [];

function nuevoMotor(base: string, canal: ConexionCanal): Motor {
    const m = new MotorLlamada({
        sesionId: "s1",
        yo: yo(base),
        canalesDirectos: () => [canal],
        vozDatos: vozDatos(),
        intervaloNivelMs: 60_000,
        intervaloStatsMs: 60_000,
    });
    motores.push(m);
    return m;
}

beforeEach(() => {
    pcs = [];
    hitos.length = 0;
    fijarSumideroDiagnostico((l) => hitos.push(`${l.hito}${l.detalle ? ` ${l.detalle}` : ""}`));
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCFalsa;
});

afterEach(() => {
    for (const m of motores.splice(0)) m.colgar();
    fijarSumideroDiagnostico(null);
    vi.useRealTimers();
    delete (globalThis as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});


/* ─────────────────────────────────── Pruebas ─────────────────────────────────── */

async function dosNeuronas() {
    const red = redBle();
    const a = nuevoMotor("a", abrirCanalLlamadaPorTransporte("neuronB", "s1", "a:t", red.mac));
    const b = nuevoMotor("b", abrirCanalLlamadaPorTransporte("neuronA", "s1", "b:t", red.tableta));
    a.entrar();
    b.entrar();
    await esperar();
    const mk = (m: Motor, titulo: string, over: Record<string, unknown> = {}) =>
        new AdaptadorMotor(m, { titulo, unoAUno: true, entorno: () => ENTORNO_ESCRITORIO, esperaAckMs: 200, ...over } as never);
    return { red, a, b, mk };
}

describe("la superficie sobre DOS motores reales", () => {
    it("los dos se ven en curso y el adaptador del motor real da la vista conectada", async () => {
        const { a, b, mk } = await dosNeuronas();
        const A = mk(a, "Beto");
        const B = mk(b, "Ana");
        expect(A.vista().estado).toBe("conectada");
        expect(B.vista().estado).toBe("conectada");
        expect(A.vista().participantes?.map((p) => p.nombre)).toEqual(["A", "B"]);
        expect(A.vista().nombre).toBe("B");
    });

    it("cambiar de tipo sin colgar: la otra superficie recibe la señal y sigue (chip + tipo vídeo)", async () => {
        const { a, b, mk } = await dosNeuronas();
        const A = mk(a, "Beto");
        const B = mk(b, "Ana");
        await A.cambiarTipo("video");
        await esperar();
        expect(a.cerrada).toBe(false);
        expect(a.estado().camara).toBe(true);
        expect(B.vista().chip).toMatch(/A pasa a vídeo/);
        expect(B.vista().tipo).toBe("video");
        expect(A.vista().tipo).toBe("video");
        await A.cambiarTipo("voz");
        await esperar();
        expect(B.vista().tipo).toBe("voz");
        expect(b.cerrada).toBe(false);
    });

    it("el chat y las reacciones cruzan el canal real", async () => {
        const { a, b, mk } = await dosNeuronas();
        const A = mk(a, "Beto");
        const B = mk(b, "Ana");
        A.acciones.enviarChat?.("hola desde A");
        B.acciones.reaccionar?.("👏");
        await esperar();
        expect(B.vista().chat?.map((m) => m.texto)).toEqual(["hola desde A"]);
        expect(A.vista().reacciones?.map((r) => r.emoji)).toEqual(["👏"]);
    });

    it("grabación: el aviso cruza el canal, B acusa y A graba; B ve el indicador. Sin acuse (B no escucha) NO graba", async () => {
        class Gr {
            static n = 0;
            static isTypeSupported = () => true;
            state = "recording";
            mimeType = "audio/webm";
            ondataavailable: ((e: { data: Blob }) => void) | null = null;
            onstop: (() => void) | null = null;
            constructor() {
                Gr.n++;
            }
            start() {}
            stop() {
                this.state = "inactive";
                this.onstop?.();
            }
        }
        const gr = { ctor: Gr as never, mezcla: () => ({ stream: {} as MediaStream, anadir() {}, cerrar() {} }), guardar: async () => null };
        const { a, b, mk } = await dosNeuronas();
        const A = mk(a, "Beto", { grabacion: gr, esperaAckMs: 150 });
        // B todavía sin adaptador: nadie acusa → falla cerrado.
        await A.acciones.iniciarGrabacion?.();
        expect(Gr.n).toBe(0);
        expect(A.vista().grabacion?.fase).toBe("apagada");
        expect(A.vista().aviso).toMatch(/no llegó a todos/);
        const B = mk(b, "Ana");
        await A.acciones.iniciarGrabacion?.();
        await esperar();
        expect(Gr.n).toBe(1);
        expect(A.vista().grabacion?.fase).toBe("grabando");
        expect(Object.values(B.vista().grabacion?.graban ?? {}).map((x) => x.nombre)).toEqual(["A"]);
    });

    it("Astraura: pregunta en A, UNA respuesta, y las dos neuronas muestran lo mismo", async () => {
        const { a, b, mk } = await dosNeuronas();
        const ajustes = { voz: null, tono: "cercano" as const, velocidad: 1 };
        const dA = { capaz: true, local: false, responder: vi.fn(async () => "Son las nueve."), hablar: vi.fn(), ajustes: () => ajustes };
        const dB = { capaz: true, local: false, responder: vi.fn(async () => "otra"), hablar: vi.fn(), ajustes: () => ajustes };
        const A = mk(a, "Beto", { astraura: dA });
        const B = mk(b, "Ana", { astraura: dB });
        A.acciones.alternarAstraura?.();
        B.acciones.alternarAstraura?.();
        await esperar();
        await A.acciones.preguntarAstraura?.("¿hora?");
        await esperar();
        expect(dA.responder).toHaveBeenCalledTimes(1);
        expect(dB.responder).not.toHaveBeenCalled();
        expect(A.vista().astraura?.respuestas.map((r) => r.texto)).toEqual(["Son las nueve."]);
        expect(B.vista().astraura?.respuestas.map((r) => r.texto)).toEqual(["Son las nueve."]);
        expect(B.vista().astraura?.respuestas[0].id).toBe(A.vista().astraura?.respuestas[0].id);
    });

    it("terminar para todos cruza el canal real (con 2 personas colgar ya termina; aquí se fuerza un fin-todos del primero)", async () => {
        const { a, b, mk } = await dosNeuronas();
        mk(b, "Ana");
        a.enviarApp({ k: "fin-todos", motivo: "Fin para todos." });
        await esperar();
        expect(b.cerrada).toBe(true);
        expect(b.estado().motivoFin).toBe("Fin para todos.");
    });
});
