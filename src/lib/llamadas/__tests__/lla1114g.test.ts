/**
 * LLA1114G · Prueba 42 (14-11, Mac ↔ tableta): la llamada acabó sola al volver el Wi-Fi («La otra persona ha colgado.» en las
 * dos puntas sin que nadie colgara), WebRTC se reintentó por una ruta que no existía y, con la tableta llamando, nunca conectó.
 * Mismos dobles que `motor.test.ts` (RTCPeerConnection falsa con los estados de señalización reales, canal en memoria).
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

/* ─────────────────────── RTCPeerConnection de mentira ─────────────────────── */

let pcs: PCFalsa[] = [];

class Emisor {
    replaceTrack = vi.fn(async (p: PistaFalsa | null) => {
        this.track = p;
    });
    constructor(public track: PistaFalsa | null) {}
}

class PCFalsa {
    signalingState: RTCSignalingState = "stable";
    iceConnectionState: RTCIceConnectionState = "new";
    connectionState: RTCPeerConnectionState = "new";
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    emisores: Emisor[] = [];
    candidatos: RTCIceCandidateInit[] = [];
    rollbacks = 0;
    reinicios = 0;
    cerrada = false;
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
    async setLocalDescription(d?: RTCSessionDescriptionInit) {
        await Promise.resolve();
        if (d?.type === "rollback") {
            this.rollbacks += 1;
            this.signalingState = "stable";
            this.localDescription = null;
            return;
        }
        if (this.signalingState === "have-remote-offer") {
            this.localDescription = { type: "answer", sdp: `answer-${++this.n}` };
            this.signalingState = "stable";
        } else {
            this.localDescription = { type: "offer", sdp: `offer-${++this.n}${this.emisores.some((e) => e.track?.kind === "video") ? "-video" : ""}` };
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
        const pista = new PistaFalsa("audio");
        this.ontrack?.({ track: pista, streams: [new StreamFalso([pista])] });
    }
    async addIceCandidate(c: RTCIceCandidateInit) {
        if (!this.remoteDescription) throw new Error("sin descripción remota");
        this.candidatos.push(c);
    }
    restartIce() {
        this.reinicios += 1;
        this.necesitaNegociar(); // como en el navegador: restartIce() lanza «negotiationneeded»
    }
    async getStats() {
        return new Map();
    }
    close() {
        this.cerrada = true;
    }
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

/** El servidor deja de ver al otro (Wi-Fi caído) o lo vuelve a ver, sin que nadie mande «colgar». */
function presenciaDe(clave: string, hay: boolean, meta?: MetaPresencia) {
    const c = conns().find((x) => x.clave === clave)!;
    if (hay) c.meta = meta ?? c.meta;
    else {
        meta = c.meta ?? undefined;
        c.meta = null;
    }
    repartirPresencia(c.sesion);
    return meta;
}

describe("A · una llamada no acaba sola", () => {
    it("la presencia del otro se vacía SIN «colgar» y vuelve a los pocos segundos: la llamada sigue y nada dice que colgaron", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
        const { a, b } = await dosContestados("s-g-a1");
        const meta = presenciaDe("b:t", false);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(a.estado().fase).not.toBe("terminada");
        presenciaDe("b:t", true, meta);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(a.estado().fase).toBe("en-curso");
        expect(lineas.some((l) => /^fin /.test(l))).toBe(false);
        a.colgar();
        b.colgar();
    });

    it("la presencia del otro no vuelve: se acaba tras la espera, SIN decir que colgó, y el registro dice origen y vía", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
        const { a, b } = await dosContestados("s-g-a2");
        presenciaDe("b:t", false);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(a.estado().fase).not.toBe("terminada");
        await vi.advanceTimersByTimeAsync(80_000);
        const e = a.estado();
        expect(e.fase).toBe("terminada");
        expect(e.motivoFin).toBe("Se perdió el contacto con la otra persona.");
        expect(e.motivoFin).not.toMatch(/colgado/);
        expect(lineas.find((l) => /^fin /.test(l))).toMatch(/origen=presencia-perdida via=\S+/);
        b.colgar();
    });

    it("un «colgar» de quien está en la llamada acaba al momento y el registro dice quién y por dónde", async () => {
        const { a, b } = await dosContestados("s-g-a3");
        b.colgar();
        await esperar();
        expect(a.estado().fase).toBe("terminada");
        expect(a.estado().motivoFin).toBe("La otra persona ha colgado.");
        expect(lineas.find((l) => /^fin .*motivo="La otra persona/.test(l))).toMatch(/origen=par:b:t via=servidor/);
    });

    it("un «colgar» de quien nunca estuvo en esta llamada (rezagado) se ignora y se anota", async () => {
        const { a, b } = await dosContestados("s-g-a4");
        const c = conns().find((x) => x.clave === "a:t")!;
        c.oyS.forEach((cb) => cb({ tipo: "colgar", de: "otro-de-antes:t" }));
        await esperar();
        expect(a.estado().fase).toBe("en-curso");
        expect(lineas.some((l) => /^colgar-ignorado de=otro-de-antes:t .*no-es-de-esta-llamada/.test(l))).toBe(true);
        a.colgar();
        b.colgar();
    });
});

/* ───────── B · ningún reintento de WebRTC sin una ruta que lleve tráfico ───────── */

const ent = (o: Partial<EntradaReintentoIce>): EntradaReintentoIce => ({
    ahora: 0, ip: true, antes: true, conTrafico: true, fuente: "local:0y5a3c", fuenteAnterior: "local:0y5a3c",
    conexion: "reconectando", intentos: 0, ultimoIntento: -Infinity, vigilaRed: true, senalRedDesde: null, ...o,
});

describe("B · reintentos de ICE", () => {
    /** Repite lo que hacía el motor cada segundo en la prueba 42 (22:25:03–22:25:21): la ruta «viva» pasa de «local» a «nativo» sin llegar a faltar. */
    function repetir(vigilaRed: boolean, senales: number[] = []) {
        let intentos = 0;
        let ultimo = -Infinity;
        let fuenteAnterior: string | null = null;
        let senalRedDesde: number | null = null;
        const hechos: number[] = [];
        for (let t = 0; t <= 20_000; t += 1_000) {
            if (senales.includes(t)) senalRedDesde = t;
            const fuente = t < 10_000 ? "local:0y5a3c" : "nativo";
            const d = decidirReintentoIce(ent({ ahora: t, antes: t === 0 ? false : true, fuente, fuenteAnterior, intentos, ultimoIntento: ultimo, vigilaRed, senalRedDesde }));
            if (d.reintentar) {
                hechos.push(t);
                intentos = d.n;
                ultimo = t;
                fuenteAnterior = fuente;
            }
        }
        return hechos;
    }

    it("sin aviso de red nuevo, un intento que no conectó no se repite por reloj ni por un cambio de fuente (antes: 4 en 16 s)", () => {
        expect(repetir(false).length).toBeGreaterThanOrEqual(3); // lo de antes, para el aparato que no avisa de la red
        expect(repetir(true)).toEqual([0]);
    });

    it("con un aviso de cambio de red posterior al último intento, se reintenta una vez; sin otro aviso, no más", () => {
        expect(repetir(true, [7_000])).toEqual([0, 7_000]);
        expect(repetir(true, [7_000, 15_000])).toEqual([0, 7_000, 15_000]);
    });

    it("la ruta que desaparece y vuelve sigue siendo una ruta nueva; sin tráfico no se reintenta nunca", () => {
        expect(decidirReintentoIce(ent({ ahora: 5_000, antes: false, ultimoIntento: 1_000, intentos: 1 }))).toMatchObject({ reintentar: true, motivo: "ruta-nueva" });
        expect(decidirReintentoIce(ent({ ahora: 5_000, antes: false, conTrafico: false }))).toEqual({ reintentar: false, motivo: "sin-trafico" });
        expect(decidirReintentoIce(ent({ ahora: 60_000, ultimoIntento: 1_000, intentos: 1, senalRedDesde: 500 }))).toEqual({ reintentar: false, motivo: "espera-senal" });
        expect(esperaReintentoIce(1)).toBe(6_000);
    });
});

/* ───────── C · las ofertas que se cruzan se resuelven llame quien llame ───────── */

describe("C · glare con dos pares, el cortés llamando y el descortés llegando tarde", () => {
    for (const quien of ["descortés llama (Mac)", "cortés llama (tableta)"] as const) {
        it(`${quien}: entra uno, espera, entra el otro y las dos ofertas salen a la vez → una sola cede y las dos acaban en «stable» con descripciones cruzadas`, async () => {
            const llamaCortes = quien.startsWith("cortés");
            const a = new MotorLlamada({ sesionId: "s-g-c", yo: yo("a"), colgarAlQuedarSolo: true, ...OPC });
            const b = new MotorLlamada({ sesionId: "s-g-c", yo: yo("b"), colgarAlQuedarSolo: true, ...OPC });
            await a.prepararMedios({ audio: true, video: true });
            await b.prepararMedios({ audio: true, video: true });
            const [primero, segundo] = llamaCortes ? [b, a] : [a, b];
            primero.entrar();
            await esperar(10);
            segundo.entrar();
            await esperar();
            expect(pcs).toHaveLength(2);
            for (const pc of pcs) {
                expect(pc.signalingState).toBe("stable");
                expect(pc.remoteDescription).not.toBeNull();
                expect(pc.localDescription).not.toBeNull();
            }
            // Lo que uno tiene como local, el otro lo tiene como remoto (sin descripciones sueltas).
            expect(pcs[0].localDescription?.sdp).toBe(pcs[1].remoteDescription?.sdp);
            expect(pcs[1].localDescription?.sdp).toBe(pcs[0].remoteDescription?.sdp);
            expect(pcs.filter((pc) => pc.rollbacks > 0)).toHaveLength(1);
            a.colgar();
            b.colgar();
        });
    }
});

describe("C · reinicio de ICE en los dos lados a la vez (los reintentos de la prueba 42)", () => {
    for (const quienEntraPrimero of ["a", "b"] as const) {
        it(`entra primero «${quienEntraPrimero}»; los dos reinician ICE a la vez y la negociación acaba estable y cruzada`, async () => {
            const a = new MotorLlamada({ sesionId: "s-g-c2", yo: yo("a"), colgarAlQuedarSolo: true, ...OPC });
            const b = new MotorLlamada({ sesionId: "s-g-c2", yo: yo("b"), colgarAlQuedarSolo: true, ...OPC });
            await a.prepararMedios({ audio: true, video: true });
            await b.prepararMedios({ audio: true, video: true });
            (quienEntraPrimero === "a" ? a : b).entrar();
            await esperar(10);
            (quienEntraPrimero === "a" ? b : a).entrar();
            await esperar();
            const antes = pcs.map((pc) => pc.localDescription?.sdp);
            for (const pc of pcs) pc.restartIce();
            await esperar(60);
            for (const pc of pcs) {
                expect(pc.signalingState).toBe("stable");
                expect(pc.reinicios).toBeGreaterThan(0);
            }
            expect(pcs[0].localDescription?.sdp).toBe(pcs[1].remoteDescription?.sdp);
            expect(pcs[1].localDescription?.sdp).toBe(pcs[0].remoteDescription?.sdp);
            // Alguna oferta nueva salió (el reinicio llegó a negociarse), y ninguna se quedó sin respuesta.
            expect(pcs.map((pc) => pc.localDescription?.sdp)).not.toEqual(antes);
            const ofertasEnLog = lineas.filter((l) => /^negociacion .*oferta-enviada/.test(l)).length;
            expect(ofertasEnLog).toBeLessThan(12);
            a.colgar();
            b.colgar();
        });
    }
});
