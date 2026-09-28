/**
 * MotorLlamada con dobles: RTCPeerConnection de mentira (estados de señalización reales del
 * patrón perfect negotiation), canal de señalización en memoria y medios falsos. Cubre:
 * conexión entre dos pares con ofertas cruzadas (glare), plazas (8 máx.), silenciar, encender
 * cámara con renegociación, reinicio de ICE y rendición honesta sin TURN, y colgar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaPresencia, SenalLlamada } from "@/lib/llamadas/tipos";

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

beforeEach(() => {
    pcs = [];
    h.conns.length = 0;
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCFalsa;
});

afterEach(() => {
    delete (globalThis as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});

describe("MotorLlamada", () => {
    it("dos personas se conectan aunque sus ofertas se crucen (perfect negotiation)", async () => {
        const a = new MotorLlamada({ sesionId: "s1", yo: yo("a"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        const b = new MotorLlamada({ sesionId: "s1", yo: yo("b"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await a.prepararMedios({ audio: true, video: false });
        await b.prepararMedios({ audio: true, video: false });
        expect(a.entrar()).toBe(true);
        expect(b.entrar()).toBe(true);
        await esperar();

        expect(pcs).toHaveLength(2);
        for (const pc of pcs) {
            expect(pc.signalingState).toBe("stable");
            expect(pc.remoteDescription).not.toBeNull();
            expect(pc.emisores.some((e) => e.track?.kind === "audio")).toBe(true);
        }
        // Solo el cortés («b:t» > «a:t») cedió su oferta.
        const pcDeB = pcs.find((pc) => pc.rollbacks > 0);
        expect(pcs.filter((pc) => pc.rollbacks > 0)).toHaveLength(1);
        expect(pcDeB).toBeDefined();

        for (const pc of pcs) pc.fijarIce("connected");
        await esperar(5);
        const ea = a.estado();
        expect(ea.fase).toBe("en-curso");
        expect(ea.contestada).toBe(true);
        expect(ea.inicio).not.toBeNull();
        expect(ea.participantes.map((p) => p.id)).toEqual(["a:t", "b:t"]);
        expect(ea.participantes[1]).toMatchObject({ nombre: "B", conexion: "conectado", micro: true });
        expect(ea.participantes[1].stream).not.toBeNull();

        a.colgar();
        b.colgar();
    });

    it("silenciar y encender la cámara: sin renegociar lo primero, renegociando lo segundo", async () => {
        const a = new MotorLlamada({ sesionId: "s2", yo: yo("a"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        const b = new MotorLlamada({ sesionId: "s2", yo: yo("b"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await a.prepararMedios({ audio: true, video: false });
        await b.prepararMedios({ audio: true, video: false });
        a.entrar();
        b.entrar();
        await esperar();

        expect(await a.alternarMicro()).toBeNull();
        await esperar(5);
        expect(a.estado().micro).toBe(false);
        // Los demás lo ven por la presencia.
        expect(b.estado().participantes.find((p) => p.id === "a:t")?.micro).toBe(false);

        const conA = conns().find((c) => c.clave === "a:t")!;
        const ofertasAntes = conA.enviadas.filter((s) => s.tipo === "senal" && s.desc?.type === "offer").length;
        expect(await a.alternarCamara()).toBeNull();
        await esperar();
        const ofertas = conA.enviadas.filter((s) => s.tipo === "senal" && s.desc?.type === "offer");
        expect(ofertas.length).toBeGreaterThan(ofertasAntes);
        expect(a.estado().camara).toBe(true);
        expect(b.estado().participantes.find((p) => p.id === "a:t")?.camara).toBe(true);

        // Apagar la cámara no renegocia: el emisor se queda sin pista.
        const pcA = pcs.find((pc) => pc.emisores.some((e) => e.track?.kind === "video"))!;
        expect(await a.alternarCamara()).toBeNull();
        const emisorVideo = pcA.emisores.find((e) => e.replaceTrack.mock.calls.length > 0);
        expect(emisorVideo?.replaceTrack).toHaveBeenCalledWith(null);
        a.colgar();
        b.colgar();
    });

    it("con 8 personas dentro, la novena recibe un aviso amable y no conecta", async () => {
        for (let i = 0; i < 8; i++) {
            const m = new MotorLlamada({ sesionId: "s3", yo: yo(`p${i}`), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
            await m.prepararMedios({ audio: false, video: false });
            m.entrar();
            await esperar(3);
        }
        await esperar();
        const noveno = new MotorLlamada({ sesionId: "s3", yo: yo("zz"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await noveno.prepararMedios({ audio: false, video: false });
        noveno.entrar();
        await esperar();
        const e = noveno.estado();
        expect(e.fase).toBe("llena");
        expect(e.motivoFin).toMatch(/8 personas/);
        expect(noveno.cerrada).toBe(true);
    });

    it("si ICE falla reinicia hasta 3 veces y después lo dice con honestidad", async () => {
        const a = new MotorLlamada({ sesionId: "s4", yo: yo("a"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        const b = new MotorLlamada({ sesionId: "s4", yo: yo("b"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await a.prepararMedios({ audio: true, video: false });
        await b.prepararMedios({ audio: true, video: false });
        a.entrar();
        b.entrar();
        await esperar();
        const pcA = pcs[0];
        for (let i = 0; i < 3; i++) pcA.fijarIce("failed");
        await esperar(3);
        expect(pcA.reinicios).toBe(3);
        const remoto = () => {
            const quien = a.estado().participantes.find((p) => !p.yo) ?? b.estado().participantes.find((p) => !p.yo);
            return quien?.conexion;
        };
        expect(remoto()).toBe("reconectando");
        pcA.fijarIce("failed");
        await esperar(3);
        const estados = [a.estado(), b.estado()];
        const conAviso = estados.find((e) => e.aviso);
        expect(conAviso?.aviso).toMatch(/Sin servidor de retransmisión: en redes muy cerradas puede no conectar/);
        a.colgar();
        b.colgar();
    });

    it("colgar avisa, libera micro y cámara, y en un 1:1 la otra persona cuelga sola", async () => {
        const a = new MotorLlamada({ sesionId: "s5", yo: yo("a"), colgarAlQuedarSolo: true, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        const b = new MotorLlamada({ sesionId: "s5", yo: yo("b"), colgarAlQuedarSolo: true, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await a.prepararMedios({ audio: true, video: true });
        await b.prepararMedios({ audio: true, video: false });
        a.entrar();
        b.entrar();
        await esperar();
        expect(b.estado().fase).toBe("en-curso");

        const pistasA = (a.estado().participantes[0].stream as unknown as StreamFalso).getTracks();
        const resumen = a.colgar();
        expect(resumen.contestada).toBe(true);
        expect(resumen.otrosDentro).toBe(1);
        await esperar();
        expect(a.estado().fase).toBe("terminada");
        expect(pistasA.every((p) => p.stop.mock.calls.length > 0)).toBe(true);
        expect(conns().find((c) => c.clave === "a:t")?.enviadas.some((s) => s.tipo === "colgar")).toBe(true);
        expect(conns().find((c) => c.clave === "a:t")?.suelta).toBe(true);

        const eb = b.estado();
        expect(eb.fase).toBe("terminada");
        expect(eb.motivoFin).toMatch(/ha colgado/);
        expect(pcs.every((pc) => pc.cerrada)).toBe(true);
    });

    it("un rechazo del timbre llega al que llama", async () => {
        const a = new MotorLlamada({ sesionId: "s6", yo: yo("a"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await a.prepararMedios({ audio: true, video: false });
        a.entrar();
        await esperar(3);
        const { abrirCanalLlamada } = await import("@/lib/llamadas/senalizacion");
        const obs = abrirCanalLlamada("s6");
        obs?.enviar({ tipo: "rechazo", de: "b:t", uid: "b", nombre: "Bea" });
        await esperar(3);
        expect(a.estado().rechazos).toEqual([{ uid: "b", nombre: "Bea" }]);
        expect(a.estado().contestada).toBe(false);
        a.colgar();
    });

    it("con TURN disponible, un fallo de conexión NO culpa a la falta de retransmisión", async () => {
        const turn = [{ urls: "turn:t.example.org:3478", username: "u", credential: "c" }];
        const a = new MotorLlamada({ sesionId: "s7", yo: yo("a"), iceServers: turn, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        const b = new MotorLlamada({ sesionId: "s7", yo: yo("b"), iceServers: turn, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await a.prepararMedios({ audio: true, video: false });
        await b.prepararMedios({ audio: true, video: false });
        a.entrar();
        b.entrar();
        await esperar();
        expect(pcs[0].config.iceServers).toEqual(turn);
        for (let i = 0; i < 4; i++) pcs[0].fijarIce("failed");
        await esperar(3);
        const aviso = [a.estado(), b.estado()].find((e) => e.aviso)?.aviso ?? "";
        expect(aviso).toMatch(/No se pudo conectar/);
        expect(aviso).not.toMatch(/retransmisión/);
        a.colgar();
        b.colgar();
    });

    it("si el servidor deniega el canal privado, la llamada termina diciéndolo (sin canal público)", async () => {
        const a = new MotorLlamada({ sesionId: "s8", yo: yo("a"), tema: "llamada:s8", intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await a.prepararMedios({ audio: true, video: false });
        expect(a.entrar()).toBe(true);
        await esperar(3);
        denegarTema("llamada:s8");
        await esperar(3);
        const e = a.estado();
        expect(e.fase).toBe("error");
        expect(e.motivoFin).toMatch(/canal privado/);
        expect(e.motivoFin).toMatch(/no se usa un canal público/);
        expect(a.cerrada).toBe(true);
        // Solo se intentó el canal privado pedido: ningún otro tema.
        expect(new Set(conns().map((c) => c.sesion))).toEqual(new Set(["llamada:s8"]));
    });

    it("enlace público a mitad de llamada: se suma el canal nuevo, se avisa y el invitado ve a todos", async () => {
        const BASE = "llamada:s9";
        const PUB = "llamada:s9:tokentokentokentoken";
        let temaServidor = BASE;
        const resolver = async () => temaServidor;
        const a = new MotorLlamada({ sesionId: "s9", yo: yo("a"), tema: BASE, resolverTema: resolver, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        const b = new MotorLlamada({ sesionId: "s9", yo: yo("b"), tema: BASE, resolverTema: resolver, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await a.prepararMedios({ audio: true, video: false });
        await b.prepararMedios({ audio: true, video: false });
        a.entrar();
        b.entrar();
        await esperar();
        expect(pcs).toHaveLength(2);

        // La creadora hace público el enlace y revisa el canal.
        temaServidor = PUB;
        expect(await a.revisarCanal()).toBe(true);
        await esperar();
        // Avisó de la mudanza por el canal viejo (sin token en el mensaje)…
        const avisos = conns().find((c) => c.clave === "a:t" && c.sesion === BASE)!.enviadas.filter((s) => s.tipo === "mudanza");
        expect(avisos).toEqual([{ tipo: "mudanza", de: "a:t" }]);
        // …y las dos siguen también en el viejo (nadie se queda fuera).
        expect(conns().filter((c) => c.sesion === BASE && !c.suelta).map((c) => c.clave).sort()).toEqual(["a:t", "b:t"]);
        expect(conns().filter((c) => c.sesion === PUB && !c.suelta).map((c) => c.clave).sort()).toEqual(["a:t", "b:t"]);

        // Llega un invitado por el enlace público: solo conoce el tema con token.
        const g = new MotorLlamada({ sesionId: "s9", yo: { base: "inv-1", uid: null, nombre: "Invitada", avatar: null, invitado: true }, tema: PUB, intervaloNivelMs: 60_000, intervaloStatsMs: 60_000 });
        await g.prepararMedios({ audio: true, video: false });
        g.entrar();
        await esperar(40);
        expect(g.estado().participantes.map((p) => p.id).sort()).toEqual(["a:t", "b:t", "inv-1:t"]);
        expect(a.estado().participantes.map((p) => p.id).sort()).toEqual(["a:t", "b:t", "inv-1:t"]);
        // Malla completa entre tres: 3 pares × 2 extremos, todos negociados.
        expect(pcs).toHaveLength(6);
        for (const pc of pcs) expect(pc.remoteDescription).not.toBeNull();
        // A y B siguen con UNA sola conexión entre ellas (la presencia doble no duplica pares).
        expect(a.estado().participantes.filter((p) => p.id === "b:t")).toHaveLength(1);

        a.colgar();
        b.colgar();
        g.colgar();
        await esperar(3);
        expect(conns().every((c) => c.suelta)).toBe(true);
    });
});
