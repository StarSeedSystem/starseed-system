/**
 * LLA1108E · el caso real del 08-11: la Mac llama a la tableta y el ÚNICO enlace es Bluetooth directo (BLE).
 * Dos `MotorLlamada` reales hablan por `abrirCanalLlamadaPorTransporte` sobre un transporte simulado de solo
 * BLE (con acuse, sin Supabase ni enlaces WebRTC). La tableta contesta con el evento nativo
 * `llamada-nativa://contestar` (el mismo `enlazarMotores` de producción) y la Mac tiene que verlo al instante:
 * «Contestada · conectando audio…», sin esperar a que el audio conecte. También: nunca quedarse en «conectando».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Identidad } from "@/lib/llamadas/identidad";
import type { ConexionCanal } from "@/lib/llamadas/senalizacion";
import { fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";
import { fabricaCodecsSimples } from "@/lib/llamadas/voz-datos/sesion";
import { enlazarMotores } from "@/lib/llamadas/nativa/puente-llamada-nativa";
import type { PuenteLlamadaNativa } from "@/lib/llamadas/nativa/puente-llamada-nativa";

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

/** La tableta: un timbre que suena, y los motores que ve el puente nativo (el de producción, `enlazarMotores`). */
function tableta(crear: () => Motor) {
    let motor: Motor | null = null;
    const oyentes = new Set<() => void>();
    const avisar = () => oyentes.forEach((cb) => cb());
    const llamadas: string[] = [];
    const puente: PuenteLlamadaNativa = {
        disponible: true,
        capacidades: async () => ({ disponible: true }) as never,
        iniciar: async (l) => {
            llamadas.push(`iniciar:${l.id}`);
            return true;
        },
        estado: async (id, e) => {
            llamadas.push(`estado:${id}:${e}`);
            return true;
        },
        rutaAudio: async () => true,
        proximidad: async () => true,
        permiso: async () => ({ disponible: true }) as never,
        alEvento: async () => () => undefined,
    };
    const enlace = enlazarMotores({
        puente,
        motores: {
            directa: {
                leer: () => ({ fase: "inactiva", id: null, nombre: "", video: false, micro: true, entrante: false }),
                suscribir: () => () => undefined,
                contestar: async () => undefined,
                rechazar: () => undefined,
                colgar: () => undefined,
                alternarMicro: () => undefined,
            },
            sistema: {
                leer: () => ({
                    activa: motor ? { sesionId: "s1", tipo: "voz", titulo: "A", esCreador: false, fase: motor.estado().fase, micro: motor.estado().micro } : null,
                    timbres: motor ? [] : [{ sesionId: "s1", tipo: "voz", nombre: "A" }],
                    micro: motor?.estado().micro ?? true,
                }),
                suscribir: (cb) => {
                    oyentes.add(cb);
                    return () => {
                        oyentes.delete(cb);
                    };
                },
                // Igual que `aceptarTimbre`: crea el motor de la llamada y entra.
                contestar: async () => {
                    motor = crear();
                    motor.suscribir(avisar);
                    motor.entrar();
                    avisar();
                },
                rechazar: async () => undefined,
                colgar: () => motor?.colgar(),
                alternarMicro: async () => undefined,
            },
        },
    });
    return { enlace, llamadas, motor: () => motor };
}

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

describe("Llamada con solo Bluetooth directo (caso real 08-11)", () => {
    it("la tableta contesta con el evento nativo y la Mac ve «Contestada · conectando audio…» sin que el audio conecte", async () => {
        const red = redBle();
        const canalMac = abrirCanalLlamadaPorTransporte("neuronB", "s1", "a:t", red.mac);
        const canalTab = abrirCanalLlamadaPorTransporte("neuronA", "s1", "b:t", red.tableta);
        const mac = nuevoMotor("a", canalMac);
        const tab = tableta(() => nuevoMotor("b", canalTab));

        expect(mac.entrar()).toBe(true);
        await esperar();
        // La Mac espera: nadie ha contestado, y el sistema no se queda mudo.
        expect(mac.estado().contestada).toBe(false);
        expect(mac.estado().fase).toBe("esperando");

        // Contestar en la tableta = el evento `llamada-nativa://contestar` con el id de la sesión.
        tab.enlace.alEvento("contestar", { id: "s1", valor: null });
        await tab.enlace.esperar();
        await esperar();

        const e = mac.estado();
        expect(e.contestada).toBe(true);
        expect(e.participantes.map((p) => p.id)).toEqual(["a:t", "b:t"]);
        expect(e.estadoAudio).toBe(TEXTO_CONTESTADA_CONECTANDO);
        expect(e.estadoAudio).toBe("Contestada · conectando audio…");
        // El audio aún no suena (no hay ICE por Bluetooth): la Mac no finge que sí.
        expect(e.medio).toBeNull();
        // La tableta (callee) también ve a la Mac.
        expect(tab.motor()?.estado().participantes.map((p) => p.id)).toContain("a:t");

        // Quedan los hitos para leerlos en enlaces.log.
        expect(hitos.some((h) => h.startsWith("senal-enviada"))).toBe(true);
        expect(hitos.some((h) => h.startsWith("senal-recibida"))).toBe(true);
        expect(hitos.some((h) => h.startsWith("contestada"))).toBe(true);
        expect(red.estado.enviados).toBeGreaterThan(0);
    });

    it("sin audio a los 15 s la llamada acaba con un motivo claro en los DOS extremos y se puede reintentar", async () => {
        vi.useFakeTimers();
        const red = redBle();
        const canalMac = abrirCanalLlamadaPorTransporte("neuronB", "s1", "a:t", red.mac);
        const canalTab = abrirCanalLlamadaPorTransporte("neuronA", "s1", "b:t", red.tableta);
        const mac = nuevoMotor("a", canalMac);
        const tab = tableta(() => nuevoMotor("b", canalTab));

        mac.entrar();
        await vi.advanceTimersByTimeAsync(200);
        tab.enlace.alEvento("contestar", { id: "s1", valor: null });
        await vi.advanceTimersByTimeAsync(1000);
        expect(mac.estado().estadoAudio).toBe(TEXTO_CONTESTADA_CONECTANDO);
        expect(mac.estado().fase).not.toBe("error");

        await vi.advanceTimersByTimeAsync(16_000);

        for (const m of [mac.estado(), tab.motor()?.estado()]) {
            expect(m?.fase).toBe("error");
            expect(m?.motivoFin).toBe(MOTIVO_SIN_AUDIO);
            expect(m?.puedeReintentar).toBe(true);
        }
        expect(hitos.some((h) => h.startsWith("fallo"))).toBe(true);
    });
});

describe("Canal de señalización por el transporte universal", () => {
    const meta = { id: "a:t", uid: "a", nombre: "A", avatar: null, invitado: false, micro: true, camara: false, pantalla: false, unido: 1 };

    it("si ningún enlace lleva la señal, reintenta hasta que sale (acuse)", async () => {
        let intentos = 0;
        const deps: DepsCanal = {
            enviar: async () => {
                intentos++;
                return { ok: intentos >= 3, via: "ble" };
            },
            alRecibir: () => () => undefined,
            hayEnlace: () => true,
            yo: () => "neuronA",
            esperar: async () => undefined,
        };
        const canal = abrirCanalLlamadaPorTransporte("neuronB", "s1", "a:t", deps);
        canal.publicar(meta);
        await esperar();
        expect(intentos).toBe(3);
        canal.soltar();
    });

    it("solo atiende a la neurona a la que se llama y a orígenes con consentimiento", async () => {
        let entrega: (m: { cuerpo: unknown; origen: { tipo: string } }) => void = () => undefined;
        const deps: DepsCanal = {
            enviar: async () => ({ ok: true, via: "ble" }),
            alRecibir: (cb) => {
                entrega = cb;
                return () => undefined;
            },
            hayEnlace: () => true,
            yo: () => "neuronA",
        };
        const canal = abrirCanalLlamadaPorTransporte("neuronB", "s1", "a:t", deps);
        const vistas: number[] = [];
        canal.onPresencia((l) => vistas.push(l.length));
        const pres = (dn: string, id = "b:t") => ({ t: "llc.pres", s: "s1", dn, meta: { ...meta, id, uid: "b", nombre: "B" } });

        entrega({ cuerpo: pres("neuronX"), origen: { tipo: "ble" } }); // otra neurona
        entrega({ cuerpo: pres("neuronB"), origen: { tipo: "desconocido" } }); // origen no admitido
        await esperar(2);
        expect(vistas).toEqual([]);

        entrega({ cuerpo: pres("neuronB"), origen: { tipo: "ble" } });
        await esperar(2);
        expect(canal.presencia().map((p) => p.id)).toEqual(["b:t"]);
        canal.soltar();
    });
});
