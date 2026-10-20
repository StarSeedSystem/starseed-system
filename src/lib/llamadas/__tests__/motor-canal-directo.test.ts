/**
 * MotorLlamada con canales DIRECTOS (enlaces locales, sin Supabase): `canalesDirectos` abre una
 * `ConexionCanal` por enlace y convive con el canal privado. Cubre: entrar solo con directos, par
 * creado al llegar la presencia, ruta de cada señal en estrella, directos + privado a la vez,
 * techo de 7 enlaces, fábrica rota, error honesto sin canal alguno, aviso de enlace caído, rechazo
 * de un directo, el límite de canales privados (que no expulsa al directo), el aviso de fallo de
 * ICE propio del enlace y, de punta a punta, dos motores hablando por el canal real de enlace local.
 *
 * Sin `any` ni `@ts-ignore`: todo se comprueba por lo que el motor hace (canales soltados, señales
 * enviadas, estado publicado), no mirando sus campos privados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import type { ConexionCanal, EstadoCanal } from "@/lib/llamadas/senalizacion";
import type { Identidad } from "@/lib/llamadas/identidad";
import type { MetaPresencia, SenalLlamada } from "@/lib/llamadas/tipos";

/* ─────────────────────────── Conexión de canal de mentira ─────────────────────────── */

type SenalDirigida = Extract<SenalLlamada, { tipo: "senal" }>;

interface ConexionFalsa extends ConexionCanal {
    publicadas: MetaPresencia[];
    enviadas: SenalLlamada[];
    soltada: boolean;
    /** Lo que «llega» desde el otro lado del canal. */
    llega: {
        presencia(lista: MetaPresencia[]): void;
        senal(s: SenalLlamada): void;
        suscrito(ok: boolean): void;
        estado(e: EstadoCanal): void;
    };
}

function crearConexion(tema: string, sesionId = "s1"): ConexionFalsa {
    const oyP = new Set<(p: MetaPresencia[]) => void>();
    const oyS = new Set<(s: SenalLlamada) => void>();
    const oyOk = new Set<(ok: boolean) => void>();
    const oyE = new Set<(e: EstadoCanal) => void>();
    let lista: MetaPresencia[] = [];
    let dentro = true;
    let estado: EstadoCanal = "dentro";
    const c: ConexionFalsa = {
        sesionId,
        tema,
        publicadas: [],
        enviadas: [],
        soltada: false,
        clave: () => "falsa",
        suscrito: () => dentro,
        estado: () => estado,
        presencia: () => lista,
        onPresencia(cb) {
            oyP.add(cb);
            return () => {
                oyP.delete(cb);
            };
        },
        onSenal(cb) {
            oyS.add(cb);
            return () => {
                oyS.delete(cb);
            };
        },
        onSuscrito(cb) {
            oyOk.add(cb);
            return () => {
                oyOk.delete(cb);
            };
        },
        onEstado(cb) {
            oyE.add(cb);
            return () => {
                oyE.delete(cb);
            };
        },
        enviar(s) {
            c.enviadas.push(s);
        },
        publicar(m) {
            c.publicadas.push(m);
        },
        retirar() {
            /* sin efecto en la prueba */
        },
        soltar() {
            c.soltada = true;
        },
        llega: {
            presencia(l) {
                lista = l;
                oyP.forEach((cb) => cb(l));
            },
            senal(s) {
                oyS.forEach((cb) => cb(s));
            },
            suscrito(ok) {
                dentro = ok;
                oyOk.forEach((cb) => cb(ok));
            },
            estado(e) {
                estado = e;
                if (e === "denegado") dentro = false;
                oyE.forEach((cb) => cb(e));
            },
        },
    };
    return c;
}

/** Estado compartido con el doble de `senalizacion` (canales privados de Supabase). */
const h = vi.hoisted(() => ({ privados: [] as unknown[], privadoDisponible: true }));

function privados(): ConexionFalsa[] {
    return h.privados as ConexionFalsa[];
}

vi.mock("@/lib/llamadas/senalizacion", () => ({
    abrirCanalLlamada: (sesionId: string, opciones: { clave?: string | null; tema?: string | null } = {}) => {
        if (!h.privadoDisponible) return null;
        const c = crearConexion(opciones.tema ?? `llamada:${sesionId}`, sesionId);
        h.privados.push(c);
        return c;
    },
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
const { abrirCanalLlamadaPorEnlace } = await import("@/lib/llamadas/canal-enlace-local");
type Motor = InstanceType<typeof MotorLlamada>;
type OpcionesMotor = ConstructorParameters<typeof MotorLlamada>[0];

/* ─────────────────────────────────── Ayudas ─────────────────────────────────── */

async function esperar(vueltas = 30) {
    for (let i = 0; i < vueltas; i++) await new Promise((r) => setTimeout(r, 0));
}

function yo(base: string, extra: Partial<Identidad> = {}): Identidad {
    return { base, uid: base, nombre: base.toUpperCase(), avatar: null, invitado: false, ...extra };
}

function meta(id: string, extra: Partial<MetaPresencia> = {}): MetaPresencia {
    return { id, uid: id, nombre: id, avatar: null, invitado: false, micro: false, camara: false, pantalla: false, unido: 1, ...extra };
}

/** Las señales dirigidas (ofertas, respuestas, candidatos) que el motor mandó por una conexión. */
function dirigidas(c: ConexionFalsa): SenalDirigida[] {
    return c.enviadas.flatMap((s) => (s.tipo === "senal" ? [s] : []));
}

const motores: Motor[] = [];

/** Crea un motor de «a» con los intervalos apagados; se cuelga solo al acabar la prueba. */
function nuevo(opciones: Partial<OpcionesMotor> = {}): Motor {
    const m = new MotorLlamada({ sesionId: "s1", yo: yo("a"), intervaloNivelMs: 60_000, intervaloStatsMs: 60_000, ...opciones });
    motores.push(m);
    return m;
}

beforeEach(() => {
    pcs = [];
    h.privados.length = 0;
    h.privadoDisponible = true;
    (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = PCFalsa;
});

afterEach(() => {
    for (const m of motores.splice(0)) m.colgar();
    delete (globalThis as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection;
});

/* ─────────────────────────────────── Pruebas ─────────────────────────────────── */

describe("MotorLlamada · canales directos", () => {
    it("entrar() con solo enlaces directos no abre el canal privado y publica mi presencia por ellos", async () => {
        const d = crearConexion("directo:s1");
        const m = nuevo({ canalesDirectos: () => [d] });

        expect(m.entrar()).toBe(true);
        await esperar();

        expect(privados()).toHaveLength(0);
        expect(d.publicadas[d.publicadas.length - 1]).toMatchObject({ id: "a:t", nombre: "A" });
        expect(m.estado().fase).toBe("esperando");
    });

    it("cuando el enlace trae la presencia de otra persona, el motor crea su par con los ICE que le dieron", async () => {
        const d = crearConexion("directo:s1");
        const m = nuevo({ canalesDirectos: () => [d], iceServers: [], hayTurn: false });
        m.entrar();
        await esperar();

        d.llega.presencia([meta("a:t"), meta("b:t", { nombre: "Bea" })]);
        await esperar();

        expect(pcs).toHaveLength(1);
        expect(pcs[0].config).toEqual({ iceServers: [] });
        const e = m.estado();
        expect(e.fase).toBe("en-curso");
        expect(e.participantes.map((p) => p.id)).toEqual(["a:t", "b:t"]);
        expect(e.participantes[1].nombre).toBe("Bea");
    });

    it("con dos enlaces, cada señal dirigida sale solo por el enlace de su destinatario y colgar avisa por los dos", async () => {
        const d1 = crearConexion("directo:s1");
        const d2 = crearConexion("directo:s1");
        const m = nuevo({ canalesDirectos: () => [d1, d2], iceServers: [] });
        m.entrar();
        d1.llega.presencia([meta("a:t"), meta("b:t")]);
        d2.llega.presencia([meta("a:t"), meta("c:t")]);
        await esperar();
        expect(pcs).toHaveLength(2);

        d1.llega.senal({ tipo: "senal", de: "b:t", para: "a:t", desc: { type: "offer", sdp: "oferta-de-b" } });
        d2.llega.senal({ tipo: "senal", de: "c:t", para: "a:t", desc: { type: "offer", sdp: "oferta-de-c" } });
        await esperar();

        expect(dirigidas(d1).map((s) => [s.para, s.desc?.type])).toEqual([["b:t", "answer"]]);
        expect(dirigidas(d2).map((s) => [s.para, s.desc?.type])).toEqual([["c:t", "answer"]]);

        m.colgar();
        for (const d of [d1, d2]) {
            expect(d.enviadas.some((s) => s.tipo === "colgar")).toBe(true);
            expect(d.soltada).toBe(true);
        }
    });

    it("un enlace directo y el canal privado a la vez: la presencia es la unión de los dos", async () => {
        const d = crearConexion("directo:s1");
        const m = nuevo({ tema: "llamada:s1", canalesDirectos: () => [d] });
        m.entrar();
        await esperar();
        expect(privados()).toHaveLength(1);
        expect(privados()[0].tema).toBe("llamada:s1");

        d.llega.presencia([meta("a:t"), meta("b:t")]);
        privados()[0].llega.presencia([meta("a:t"), meta("c:t"), meta("b:t")]);
        await esperar();

        // «b» está por los dos caminos y cuenta una sola vez.
        expect(m.estado().participantes.map((p) => p.id)).toEqual(["a:t", "b:t", "c:t"]);
    });

    it("más de 7 enlaces no caben: se usan 7 y el resto se suelta sin engancharse", () => {
        const todos = Array.from({ length: 9 }, () => crearConexion("directo:s1"));
        const m = nuevo({ canalesDirectos: () => todos });

        expect(m.entrar()).toBe(true);

        expect(todos.slice(0, 7).every((d) => !d.soltada && d.publicadas.length > 0)).toBe(true);
        expect(todos.slice(7).every((d) => d.soltada && d.publicadas.length === 0)).toBe(true);
    });

    it("una fábrica de enlaces que lanza no tumba la llamada: sigue por el canal privado", async () => {
        const m = nuevo({
            canalesDirectos: () => {
                throw new Error("el registro de enlaces falló");
            },
        });

        expect(m.entrar()).toBe(true);
        await esperar();

        expect(privados()).toHaveLength(1);
        expect(m.estado().fase).toBe("esperando");
    });

    it("sin ningún canal posible, entrar() falla y lo dice con honestidad", async () => {
        h.privadoDisponible = false;
        const sinEnlaces = nuevo({ canalesDirectos: () => [] });
        expect(sinEnlaces.entrar()).toBe(false);
        await esperar(3);
        expect(sinEnlaces.estado().fase).toBe("error");
        expect(sinEnlaces.estado().motivoFin).toMatch(/Vincular sin internet/);

        // Sin la opción, el mensaje de siempre habla del servidor.
        const sinOpcion = nuevo();
        expect(sinOpcion.entrar()).toBe(false);
        await esperar(3);
        expect(sinOpcion.estado().motivoFin).toMatch(/servidor de la llamada/);
    });

    it("si solo hay enlaces y se cae el único, avisa del enlace; con servidor, solo avisa si caen los dos", async () => {
        const d = crearConexion("directo:s1");
        const soloEnlace = nuevo({ canalesDirectos: () => [d] });
        soloEnlace.entrar();
        await esperar();
        expect(soloEnlace.estado().aviso).toBeNull();

        d.llega.suscrito(false);
        await esperar(3);
        expect(soloEnlace.estado().aviso).toMatch(/enlace directo/);
        d.llega.suscrito(true);
        await esperar(3);
        expect(soloEnlace.estado().aviso).toBeNull();

        const e = crearConexion("directo:s1");
        const mixto = nuevo({ tema: "llamada:s1", canalesDirectos: () => [e] });
        mixto.entrar();
        await esperar();
        e.llega.suscrito(false);
        await esperar(3);
        expect(mixto.estado().aviso).toBeNull(); // el servidor sigue dentro
        privados()[0].llega.suscrito(false);
        await esperar(3);
        expect(mixto.estado().aviso).toMatch(/servidor de la llamada/);
    });

    it("si un enlace directo se niega: con otro canal sigue con aviso; sin ninguno, termina diciéndolo", async () => {
        const d1 = crearConexion("directo:s1");
        const d2 = crearConexion("directo:s1");
        const m = nuevo({ canalesDirectos: () => [d1, d2] });
        m.entrar();
        await esperar();

        d1.llega.estado("denegado");
        await esperar(3);
        expect(d1.soltada).toBe(true);
        expect(d2.soltada).toBe(false);
        expect(m.estado().fase).not.toBe("error");
        expect(m.estado().aviso).toMatch(/Un enlace directo ya no admite/);

        d2.llega.estado("denegado");
        await esperar(3);
        expect(m.estado().fase).toBe("error");
        expect(m.estado().motivoFin).toMatch(/enlace directo/);
        expect(m.estado().motivoFin).not.toMatch(/canal privado/);
    });

    it("el tope de canales privados no expulsa al enlace directo, ni aunque sea el más antiguo", async () => {
        const d = crearConexion("directo:s1");
        const temas = [null, "llamada:s1:t1", "llamada:s1:t2", "llamada:s1:t3"];
        let vuelta = 0;
        const m = nuevo({
            tema: "llamada:s1:t0",
            canalesDirectos: () => [d],
            resolverTema: async () => temas[vuelta++] ?? null,
        });
        m.entrar();
        await esperar();

        // Sin respuesta del servidor (null) no cambia nada.
        expect(await m.revisarCanal(false)).toBe(false);
        expect(privados()).toHaveLength(1);

        // t1 y t2 se suman (ya hay 3 privados: t0, t1, t2); t3 obliga a soltar el privado más viejo.
        expect(await m.revisarCanal(false)).toBe(true);
        expect(await m.revisarCanal(false)).toBe(true);
        expect(privados().map((p) => p.soltada)).toEqual([false, false, false]);
        expect(await m.revisarCanal(false)).toBe(true);

        expect(privados().map((p) => p.tema)).toEqual(["llamada:s1:t0", "llamada:s1:t1", "llamada:s1:t2", "llamada:s1:t3"]);
        expect(privados().map((p) => p.soltada)).toEqual([true, false, false, false]);
        expect(d.soltada).toBe(false);
    });

    it("si ICE falla por un enlace directo, el aviso habla de la misma red y no de un servidor TURN", async () => {
        const d = crearConexion("directo:s1");
        const porEnlace = nuevo({ canalesDirectos: () => [d], iceServers: [], hayTurn: false });
        porEnlace.entrar();
        d.llega.presencia([meta("a:t"), meta("b:t", { nombre: "Bea" })]);
        await esperar();
        // Tres reinicios de ICE y a la cuarta se rinde.
        for (let i = 0; i < 4; i++) pcs[0].fijarIce("failed");
        await esperar(3);
        const aviso = porEnlace.estado().aviso ?? "";
        expect(aviso).toMatch(/Bea por el enlace directo/);
        expect(aviso).toMatch(/misma red/);
        expect(aviso).not.toMatch(/retransmisión/);

        // Por el canal privado (control), el aviso de siempre.
        const porServidor = nuevo({ tema: "llamada:s1", hayTurn: false });
        porServidor.entrar();
        privados()[0].llega.presencia([meta("a:t"), meta("c:t", { nombre: "Carlos" })]);
        await esperar();
        for (let i = 0; i < 4; i++) pcs[1].fijarIce("failed");
        await esperar(3);
        expect(porServidor.estado().aviso).toMatch(/retransmisión/);
    });
});

/* ───────────── De punta a punta: dos motores por el canal real de enlace local ───────────── */

/** Dos extremos de un enlace local que se entregan los mensajes de forma asíncrona. */
function parDeEnlaces(): [EnlaceLocalVivo, EnlaceLocalVivo] {
    type Cb = (data: string | ArrayBuffer) => void;
    const oyentes: [Set<Cb>, Set<Cb>] = [new Set(), new Set()];
    const extremo = (id: string, yo: 0 | 1): EnlaceLocalVivo => ({
        id,
        par: {} as EnlaceLocalVivo["par"],
        desde: 0,
        abierto: () => true,
        rttMs: () => null,
        ruta: () => null,
        capacidadKbps: () => null,
        enviar: (texto) => {
            queueMicrotask(() => oyentes[1 - yo].forEach((cb) => cb(texto)));
            return true;
        },
        enviarBinario: () => true,
        bufferedAmount: () => 0,
        alMensaje: (cb) => {
            oyentes[yo].add(cb);
            return () => {
                oyentes[yo].delete(cb);
            };
        },
        ponerPistas: async () => true,
        alFlujoRemoto: () => () => undefined,
        cerrar: () => undefined,
    });
    return [extremo("local:a", 0), extremo("local:b", 1)];
}

describe("MotorLlamada · dos aparatos por el canal real de enlace local", () => {
    /** «a» y «b» con un enlace local entre los dos y sin servidores ICE (misma red). */
    function pareja(identidadB: Partial<Identidad> = {}) {
        const [ea, eb] = parDeEnlaces();
        const sinServidores = { iceServers: [] as RTCIceServer[], hayTurn: false };
        const a = nuevo({ ...sinServidores, yo: yo("a", { nombre: "Ana" }), canalesDirectos: () => [abrirCanalLlamadaPorEnlace(ea, "s1", "a:t")] });
        const b = nuevo({ ...sinServidores, yo: yo("b", { nombre: "Bea", ...identidadB }), canalesDirectos: () => [abrirCanalLlamadaPorEnlace(eb, "s1", "b:t")] });
        return { a, b };
    }

    it("se ven, negocian aunque las ofertas se crucen y no se fían de los datos del otro lado", async () => {
        // El avatar de «b» es hostil: lo que sale de su aparato se sanea al llegar al de «a».
        const { a, b } = pareja({ avatar: "javascript:alert(1)" });
        await a.prepararMedios({ audio: true, video: false });
        await b.prepararMedios({ audio: true, video: false });
        expect(a.entrar()).toBe(true);
        expect(b.entrar()).toBe(true);
        await esperar();

        expect(privados()).toHaveLength(0);
        expect(pcs).toHaveLength(2);
        for (const pc of pcs) {
            expect(pc.config).toEqual({ iceServers: [] });
            expect(pc.signalingState).toBe("stable");
            expect(pc.remoteDescription).not.toBeNull();
        }

        for (const pc of pcs) pc.fijarIce("connected");
        await esperar(5);
        const verDeA = a.estado();
        expect(verDeA.fase).toBe("en-curso");
        expect(verDeA.participantes.map((p) => p.id)).toEqual(["a:t", "b:t"]);
        expect(verDeA.participantes[1]).toMatchObject({ nombre: "Bea", avatar: null, conexion: "conectado" });
        expect(b.estado().participantes[1]).toMatchObject({ nombre: "Ana", conexion: "conectado" });
    });

    it("quien entra tarde conecta enseguida, sin esperar al latido de 10 s del enlace", async () => {
        const { a, b } = pareja();
        await a.prepararMedios({ audio: true, video: false });
        await b.prepararMedios({ audio: true, video: false });
        a.entrar();
        await esperar(); // «a» lleva un rato sola en la sala
        expect(pcs).toHaveLength(0);

        b.entrar();
        await esperar();

        expect(pcs).toHaveLength(2);
        expect(a.estado().fase).toBe("en-curso");
        expect(b.estado().fase).toBe("en-curso");
    });
});
