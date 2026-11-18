/**
 * PAN1115J · el lado que manda: negociación, estados, límite de 60 por segundo, fusión de gestos,
 * trozos que caben en la orden firmada, canal de datos o de control, y cada condición de cierre.
 * Con falsos de la conexión y del canal de órdenes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, adelgazar, capacidadesDeNativo, fundirGestos, partirGesto, type CanalDestinoLike, type DepsDestino, type EntradaControl, type PeerDestinoLike } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";
import { trocear } from "../senal-partes";

type Gesto = Extract<EntradaControl, { tipo: "gesto" }>;
const pt = (x: number, dt = 5): [number, number, number] => [x, 0.5, dt];
const gesto = (puntos: [number, number, number][], sigue = true, id = 0): Gesto => ({ tipo: "gesto", dedos: [{ id, puntos }], sigue });

class CanalFalso implements CanalDestinoLike {
    readyState = "open";
    onopen: (() => void) | null = null;
    onmessage: CanalDestinoLike["onmessage"] = null;
    onclose: (() => void) | null = null;
    enviados: { t: number; obj: { carga: string } }[] = [];
    cerrado = false;
    constructor(private ahora: () => number) {}
    send(d: string) { this.enviados.push({ t: this.ahora(), obj: JSON.parse(d) }); }
    close() { this.cerrado = true; this.readyState = "closed"; }
}
class PeerFalso implements PeerDestinoLike {
    localDescription: { sdp?: string } | null = null;
    connectionState = "new";
    onicecandidate: PeerDestinoLike["onicecandidate"] = null;
    ontrack: PeerDestinoLike["ontrack"] = null;
    onconnectionstatechange: (() => void) | null = null;
    transceptores: unknown[] = [];
    canal!: CanalFalso;
    remota: { type: string; sdp: string } | null = null;
    cerrada = false;
    decodificados = 0;
    constructor(private ahora: () => number) {}
    addTransceiver(t: string, init: { direction: string }) { this.transceptores.push([t, init]); return {}; }
    createDataChannel() { this.canal = new CanalFalso(this.ahora); return this.canal; }
    async createOffer() { return { type: "offer", sdp: "v=0\r\noferta" }; }
    async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
    async setRemoteDescription(d: { type: string; sdp: string }) { this.remota = d; }
    async getStats() {
        const filas = [{ type: "inbound-rtp", kind: "video", framesDecoded: this.decodificados }, { type: "candidate-pair", nominated: true, currentRoundTripTime: 0.04 }];
        return { forEach: (cb: (v: Record<string, unknown>) => void) => filas.forEach(cb) };
    }
    close() { this.cerrada = true; }
    conectar() { this.connectionState = "connected"; this.onconnectionstatechange?.(); }
}

const TOKEN = "a".repeat(32);
let peer: PeerFalso;
let enviadas: { nombre: string; args: Record<string, unknown>; nivel: string; sesion: unknown }[];
let guion: Record<string, (args: Record<string, unknown>) => RespuestaOrden>;
let firmadas: number;
let firmando: Promise<void> | null;
let destino: PantallaDestino;
let respPartes: Record<string, unknown>[] = [];
let lineas: string[] = [];
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
const no = (motivo: string): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: false, motivo });

function montar() {
    const deps: DepsDestino = {
        mandar: async (nombre, args, o) => {
            enviadas.push({ nombre, args, nivel: o.nivel, sesion: o.sesion });
            return (guion[nombre] ?? (() => ok()))(args);
        },
        firmar: async (nombre, args, o) => {
            if (firmando) await firmando;
            firmadas++;
            return { sobre: { v: 1, carga: `${nombre}:${JSON.stringify(args)}`, firma: "f", nivel: o.nivel }, nonce: `nonce-${firmadas}` };
        },
        iceServers: async () => [],
        crearPeer: () => peer,
        anotar: (l) => lineas.push(l),
        flujoDe: (p) => ({ pista: p }) as unknown as MediaStream,
        ahora: () => Date.now(),
    };
    destino = new PantallaDestino("neurona-tableta", deps);
}

const CAPS = { entrada: { gestos: true, max_dedos: 10, teclas: ["atras", "inicio"], volumen: true, brillo: true, texto: true } };

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T10:00:00Z"));
    peer = new PeerFalso(() => Date.now());
    lineas = [];
    respPartes = (await trocear("v=0\r\nrespuesta", "respuesta", "negociacion1")).map((p) => ({ ...p }));
    enviadas = [];
    firmadas = 0;
    firmando = null;
    guion = {
        "abrir-sesion": () => ok({ sesion: TOKEN, nivel: "controlar" }),
        "pantalla-iniciar": () => ok({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 90, capacidades: CAPS }),
        "pantalla-senal": (a) => {
            if (typeof a.pide === "number") return ok({ ...respPartes[a.pide], neg: a.neg, i: a.pide });
            if (typeof a.neg === "string") return (a.i as number) === (a.n as number) - 1 ? ok({ lista: true, n: respPartes.length, total: 20, sha: "0".repeat(16) }) : ok({ recibida: a.i });
            return ok({ candidatos: 1 });
        },
        "leer-aparato": () => ok({ aparato: { brillo: 0.4, bateria: 0.9 } }),
    };
    montar();
});
afterEach(() => {
    vi.useRealTimers();
});

async function enVivo() {
    await destino.iniciar();
    peer.conectar();
    await vi.advanceTimersByTimeAsync(0);
    expect(destino.instantanea().estado).toBe("en-vivo");
}
const nombres = () => enviadas.map((e) => e.nombre);

describe("negociación y estados", () => {
    it("abre la sesión, pide la pantalla, manda la oferta, pone la respuesta y pasa a en-vivo al conectar", async () => {
        const avisos: string[] = [];
        destino.suscribir(() => avisos.push(destino.instantanea().estado));
        await destino.iniciar();
        expect(nombres().slice(0, 3)).toEqual(["abrir-sesion", "pantalla-iniciar", "pantalla-senal"]);
        expect(enviadas[0]).toMatchObject({ nivel: "controlar" });
        expect(enviadas[1]).toMatchObject({ nivel: "ver", sesion: TOKEN });
        expect(enviadas[2].args).toMatchObject({ tipo: "oferta", i: 0, n: 1, total: 11, datos: "v=0\r\noferta" });
        expect(peer.remota).toEqual({ type: "answer", sdp: "v=0\r\nrespuesta" });
        expect(peer.transceptores).toEqual([["video", { direction: "recvonly" }]]); // el vídeo es la m-line 0
        expect(destino.instantanea()).toMatchObject({ estado: "conectando", nivel: "controlar", pantalla: { ancho: 800, alto: 1280, giro: 0 }, capacidades: { gestos: true, maxDedos: 10, teclas: ["atras", "inicio"] } });
        peer.conectar();
        expect(destino.instantanea().estado).toBe("en-vivo");
        expect(avisos).toContain("en-vivo");
    });
    it("la pista que llega se enseña como flujo", async () => {
        await destino.iniciar();
        peer.ontrack!({ track: "pista-1" });
        expect(destino.instantanea().flujo).toEqual({ pista: "pista-1" });
    });
    it("los candidatos locales salen en lotes por la orden de señal, de a ocho como mucho, y no antes de la respuesta", async () => {
        await destino.iniciar();
        for (let i = 0; i < 10; i++) peer.onicecandidate!({ candidate: { candidate: `candidate:${i} 1 udp 1 1.1.1.1 1 typ host` } });
        peer.onicecandidate!({ candidate: null });
        await vi.advanceTimersByTimeAsync(400);
        const lotes = enviadas.filter((e) => e.nombre === "pantalla-senal" && e.args.candidatos);
        expect(lotes.length).toBeGreaterThan(0);
        for (const l of lotes) expect((l.args.candidatos as string[]).length).toBeLessThanOrEqual(8);
        expect(lotes.flatMap((l) => l.args.candidatos as string[])).toHaveLength(10);
    });
    it("si solo se concede «ver», la sesión queda en «ver», sin capacidades de entrada", async () => {
        guion["abrir-sesion"] = (a) => ok({ sesion: TOKEN, nivel: "ver" });
        await destino.iniciar();
        expect(destino.instantanea()).toMatchObject({ nivel: "ver", capacidades: { gestos: false, teclas: [], texto: false } });
        peer.conectar();
        expect(destino.enviar({ tipo: "tecla", cual: "atras" })).toBe(false);
    });
    it("si pedir «controlar» se rechaza por nivel, reintenta con «ver»", async () => {
        let veces = 0;
        guion["abrir-sesion"] = () => (++veces === 1 ? no("nivel") : ok({ sesion: TOKEN, nivel: "ver" }));
        await destino.iniciar();
        expect(enviadas.filter((e) => e.nombre === "abrir-sesion").map((e) => e.nivel)).toEqual(["controlar", "ver"]);
        expect(destino.instantanea().nivel).toBe("ver");
    });
    it("el permiso apagado del otro aparato cierra con su motivo", async () => {
        guion["abrir-sesion"] = () => no("permiso-apagado");
        await destino.iniciar();
        expect(destino.instantanea()).toMatchObject({ estado: "cerrada", motivo: "permiso-apagado" });
    });
    it("si el aparato no tiene pantalla, queda «sin-pantalla» con lo que falta y la sesión sigue abierta", async () => {
        guion["pantalla-iniciar"] = () => ok({ ok: false, motivo: "sin-servicio", falta: ["servicio-accesibilidad"] });
        await destino.iniciar();
        expect(destino.instantanea()).toMatchObject({ estado: "sin-pantalla", motivo: "servicio-accesibilidad" });
        expect(nombres()).not.toContain("pantalla-senal");
        expect(nombres()).not.toContain("cerrar-sesion");
        await vi.advanceTimersByTimeAsync(5100);
        expect(nombres()).toContain("leer-aparato"); // sigue leyendo, no se queda mudo
    });
    it("sin conexión en 25 s se cierra diciendo por qué", async () => {
        await destino.iniciar();
        await vi.advanceTimersByTimeAsync(25_100);
        expect(destino.instantanea()).toMatchObject({ estado: "cerrada", motivo: "sin-conexion" });
    });
    it("el estado dice desde cuándo", async () => {
        await destino.iniciar();
        const t0 = destino.instantanea().desde;
        await vi.advanceTimersByTimeAsync(3000);
        peer.conectar();
        expect(destino.instantanea().desde).toBeGreaterThan(t0);
    });
    it("capacidades: solo con «controlar» y sin inventar nada", () => {
        expect(capacidadesDeNativo(CAPS, "ver").gestos).toBe(false);
        expect(capacidadesDeNativo(null, "controlar").teclas).toEqual([]);
        expect(capacidadesDeNativo({ entrada: { gestos: true, max_dedos: 99 } }, "controlar")).toMatchObject({ gestos: true, maxDedos: 10, volumen: false });
    });
});

describe("aparato, latencia y cuadros", () => {
    it("lee el aparato al empezar y cada 5 s mientras vive", async () => {
        await enVivo();
        expect(destino.instantanea().aparato).toMatchObject({ brillo: 0.4 });
        const antes = enviadas.filter((e) => e.nombre === "leer-aparato").length;
        guion["leer-aparato"] = () => ok({ aparato: { brillo: 0.8 } });
        await vi.advanceTimersByTimeAsync(5100);
        expect(enviadas.filter((e) => e.nombre === "leer-aparato").length).toBe(antes + 1);
        expect(destino.instantanea().aparato).toMatchObject({ brillo: 0.8 });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(enviadas.filter((e) => e.nombre === "leer-aparato").length).toBe(antes + 3);
    });
    it("fps y latencia salen de las medidas de la conexión", async () => {
        await enVivo();
        await vi.advanceTimersByTimeAsync(1000);
        peer.decodificados = 30;
        await vi.advanceTimersByTimeAsync(1000);
        expect(destino.instantanea().fps).toBeCloseTo(30, 0);
        expect(destino.instantanea().latenciaMs).toBe(40);
    });
    it("si dejan de llegar cuadros no se enseña como vivo: «sin-pantalla» (y vuelve cuando llegan)", async () => {
        await enVivo();
        await vi.advanceTimersByTimeAsync(5000);
        expect(destino.instantanea()).toMatchObject({ estado: "sin-pantalla", motivo: "sin-cuadros" });
        peer.decodificados += 20;
        await vi.advanceTimersByTimeAsync(1000);
        expect(destino.instantanea().estado).toBe("en-vivo");
    });
});

describe("entrada: validación local", () => {
    it("no manda antes de estar en vivo ni lo que no tiene la forma ni lo que el aparato no sabe hacer", async () => {
        expect(destino.enviar({ tipo: "tecla", cual: "atras" })).toBe(false);
        await enVivo();
        expect(destino.enviar({ tipo: "tecla", cual: "atras" })).toBe(true);
        expect(destino.enviar({ tipo: "tecla", cual: "apagar" })).toBe(false);
        expect(destino.enviar({ tipo: "tecla", cual: "captura" })).toBe(false); // el aparato no la declara
        expect(destino.enviar({ tipo: "brillo", nivel: 2 })).toBe(false);
        expect(destino.enviar({ tipo: "texto", texto: "a".repeat(513) })).toBe(false);
        expect(destino.enviar({ tipo: "gesto", dedos: [], sigue: false })).toBe(false);
        expect(destino.enviar({ tipo: "otra" } as unknown as EntradaControl)).toBe(false);
        expect(destino.enviar(null as unknown as EntradaControl)).toBe(false);
    });
    it("quita los dedos que el aparato no admite en vez de perder la orden", async () => {
        guion["pantalla-iniciar"] = () => ok({ ok: true, ancho: 1, alto: 1, giro: 0, capacidades: { entrada: { ...CAPS.entrada, max_dedos: 2 } } });
        await enVivo();
        const dedos = [0, 1, 2, 3].map((id) => ({ id, puntos: [pt(0.1)] }));
        expect(destino.enviar({ tipo: "gesto", dedos, sigue: false })).toBe(true);
        await vi.advanceTimersByTimeAsync(50);
        const sobre = peer.canal.enviados[0].obj as unknown as { carga: string };
        expect(JSON.parse(sobre.carga.slice(sobre.carga.indexOf(":") + 1)).dedos).toHaveLength(2);
    });
});

describe("límite de 60 por segundo", () => {
    it("200 teclas seguidas salen a no más de 60 en cualquier ventana de un segundo", async () => {
        await enVivo();
        for (let i = 0; i < 200; i++) destino.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(5000);
        const t = peer.canal.enviados.map((e) => e.t);
        expect(t).toHaveLength(200);
        for (let i = 0; i + 60 < t.length; i++) expect(t[i + 60] - t[i]).toBeGreaterThanOrEqual(1000);
    });
    it("la cola tiene tope y no crece sin fin", async () => {
        await enVivo();
        let aceptadas = 0;
        for (let i = 0; i < 1000; i++) if (destino.enviar({ tipo: "tecla", cual: "atras" })) aceptadas++;
        expect(aceptadas).toBeLessThan(1000);
        expect(destino.enCola()).toBeLessThanOrEqual(256);
    });
});

describe("fusión de gestos", () => {
    it("los gestos que esperan turno se juntan si llevan los mismos dedos: cada dedo conserva sus puntos", async () => {
        await enVivo();
        let suelta!: () => void;
        firmando = new Promise<void>((r) => (suelta = r));
        destino.enviar({ tipo: "tecla", cual: "atras" }); // ocupa el envío mientras firma
        await vi.advanceTimersByTimeAsync(0);
        destino.enviar({ tipo: "gesto", dedos: [{ id: 0, puntos: [pt(0.1)] }, { id: 1, puntos: [pt(0.9)] }], sigue: true });
        destino.enviar({ tipo: "gesto", dedos: [{ id: 1, puntos: [pt(0.8)] }, { id: 0, puntos: [pt(0.2)] }], sigue: true });
        destino.enviar({ tipo: "gesto", dedos: [{ id: 0, puntos: [pt(0.3)] }, { id: 1, puntos: [pt(0.7)] }], sigue: true });
        expect(destino.enCola()).toBe(1);
        firmando = null;
        suelta();
        await vi.advanceTimersByTimeAsync(100);
        const g = peer.canal.enviados.map((e) => e.obj.carga).find((c) => c.startsWith("gesto:"))!;
        const args = JSON.parse(g.slice(6)) as { dedos: { id: number; puntos: number[][] }[]; sigue: boolean };
        expect(args.dedos.map((d) => d.id)).toEqual([0, 1]);
        expect(args.dedos[0].puntos.map((p) => p[0])).toEqual([0.1, 0.2, 0.3]);
        expect(args.dedos[1].puntos.map((p) => p[0])).toEqual([0.9, 0.8, 0.7]);
    });
    it("UNI1115M · un gesto que no nombra un dedo (lo levanta) no se funde con el anterior", async () => {
        await enVivo();
        firmando = new Promise<void>(() => undefined);
        destino.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(0);
        destino.enviar({ tipo: "gesto", dedos: [{ id: 0, puntos: [pt(0.1)] }, { id: 1, puntos: [pt(0.9)] }], sigue: true });
        destino.enviar({ tipo: "gesto", dedos: [{ id: 1, puntos: [pt(0.8)] }], sigue: true });
        expect(destino.enCola()).toBe(2);
    });
    it("UNI1115M · partirGesto nombra todos los dedos en cada trozo (un dedo sin puntos repite el último, dt 0)", () => {
        const muchos: [number, number, number][] = Array.from({ length: 60 }, (_, i) => [0.5, i / 100, 8]);
        const trozos = partirGesto({ tipo: "gesto", dedos: [{ id: 0, puntos: muchos }, { id: 1, puntos: [[0.2, 0.2, 0]] }], sigue: true }, 400);
        expect(trozos.length).toBeGreaterThan(1);
        for (const t of trozos) expect(t.dedos.map((d) => d.id)).toEqual([0, 1]);
        expect(trozos[trozos.length - 1].dedos[1].puntos).toEqual([[0.2, 0.2, 0]]);
    });
    it("un gesto que terminó (sigue:false) no se funde con el siguiente", () => {
        const a = gesto([pt(0.1)], false);
        // fundirGestos es puro; la cola solo funde si el anterior «sigue»: se comprueba arriba por enCola
        expect(fundirGestos(a, gesto([pt(0.2)], true)).sigue).toBe(true);
    });
    it("la cola no funde tras un gesto que terminó", async () => {
        await enVivo();
        firmando = new Promise<void>(() => undefined);
        destino.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(0);
        destino.enviar(gesto([pt(0.1)], false));
        destino.enviar(gesto([pt(0.2)], true));
        expect(destino.enCola()).toBe(2);
    });
    it("al pasar de 64 puntos adelgaza conservando el primero, el último y el tiempo", () => {
        const muchos = Array.from({ length: 200 }, (_, i) => pt(i / 200, 4));
        const f = adelgazar(muchos);
        expect(f).toHaveLength(64);
        expect(f[0][0]).toBe(0);
        expect(f[63][0]).toBeCloseTo(199 / 200, 5);
        expect(f.reduce((s, p) => s + p[2], 0)).toBe(800); // el tiempo total no se pierde
        const g = fundirGestos(gesto(muchos.slice(0, 60)), gesto(muchos.slice(60, 120)));
        expect(g.dedos[0].puntos.length).toBeLessThanOrEqual(64);
    });
    it("volumen y brillo: lo último que pidió la persona sustituye a lo que esperaba turno", async () => {
        await enVivo();
        firmando = new Promise<void>(() => undefined);
        destino.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(0);
        destino.enviar({ tipo: "volumen", flujo: "multimedia", nivel: 0.1 });
        destino.enviar({ tipo: "volumen", flujo: "multimedia", nivel: 0.2 });
        destino.enviar({ tipo: "volumen", flujo: "timbre", nivel: 0.9 });
        destino.enviar({ tipo: "brillo", nivel: 0.3 });
        destino.enviar({ tipo: "brillo", nivel: 0.4 });
        expect(destino.enCola()).toBe(3);
    });
});

describe("gestos grandes: caben en la orden firmada", () => {
    it("10 dedos de 64 puntos se parten en trozos de menos de 2600 bytes, todos «siguen» menos el último, sin perder puntos", () => {
        const dedos = Array.from({ length: 10 }, (_, id) => ({ id, puntos: Array.from({ length: 64 }, (_, i) => [0.123456 + i / 1000, 0.654321, 16] as [number, number, number]) }));
        const trozos = partirGesto({ tipo: "gesto", dedos, sigue: false });
        expect(trozos.length).toBeGreaterThan(1);
        for (const t of trozos) expect(JSON.stringify({ dedos: t.dedos, sigue: t.sigue }).length).toBeLessThanOrEqual(2600);
        expect(trozos.slice(0, -1).every((t) => t.sigue)).toBe(true);
        expect(trozos.at(-1)!.sigue).toBe(false);
        for (let id = 0; id < 10; id++) expect(trozos.flatMap((t) => t.dedos.filter((d) => d.id === id).flatMap((d) => d.puntos))).toHaveLength(64);
    });
    it("un gesto pequeño va entero", () => {
        const g = gesto([pt(0.1), pt(0.2)], false);
        expect(partirGesto(g)).toEqual([g]);
    });
});

describe("por dónde sale la entrada", () => {
    it("por el canal de datos de la conexión cuando está abierto (firmada, sin sellar)", async () => {
        await enVivo();
        destino.enviar({ tipo: "texto", texto: "hola" });
        await vi.advanceTimersByTimeAsync(50);
        expect(peer.canal.enviados).toHaveLength(1);
        expect(enviadas.some((e) => e.nombre === "texto")).toBe(false);
    });
    it("por el canal de control cuando el de datos no está abierto, con la sesión y el nivel de «controlar»", async () => {
        await enVivo();
        peer.canal.readyState = "connecting";
        destino.enviar({ tipo: "tecla", cual: "inicio" });
        await vi.advanceTimersByTimeAsync(50);
        expect(peer.canal.enviados).toHaveLength(0);
        expect(enviadas.at(-1)).toMatchObject({ nombre: "tecla", args: { cual: "inicio" }, nivel: "controlar", sesion: TOKEN });
    });
    it("si firmar para el canal de datos falla, sale por el de control", async () => {
        await enVivo();
        (destino as unknown as { d: DepsDestino }).d.firmar = async () => null;
        destino.enviar({ tipo: "tecla", cual: "inicio" });
        await vi.advanceTimersByTimeAsync(50);
        expect(enviadas.at(-1)?.nombre).toBe("tecla");
    });
    it("sale en orden aunque llegue de golpe", async () => {
        await enVivo();
        for (const c of ["atras", "inicio", "atras", "inicio"]) destino.enviar({ tipo: "tecla", cual: c });
        await vi.advanceTimersByTimeAsync(200);
        expect(peer.canal.enviados.map((e) => e.obj.carga.split('"')[3])).toEqual(["atras", "inicio", "atras", "inicio"]);
    });
});

describe("respuestas del otro aparato", () => {
    const responder = (nonce: string, r: Partial<RespuestaOrden>) => peer.canal.onmessage!({ data: JSON.stringify({ tipo: "respuesta", nonce, ok: false, motivo: "x", ...r }) });
    it("pausa-local: pasa a «pausa-local» y vuelve a «en-vivo» a los 3 s", async () => {
        await enVivo();
        destino.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(50);
        responder("nonce-1", { motivo: "pausa-local" });
        expect(destino.instantanea()).toMatchObject({ estado: "pausa-local", motivo: "pausa-local" });
        await vi.advanceTimersByTimeAsync(3300);
        expect(destino.instantanea().estado).toBe("en-vivo");
    });
    it("una orden cumplida durante la pausa la quita", async () => {
        await enVivo();
        destino.enviar({ tipo: "tecla", cual: "atras" });
        destino.enviar({ tipo: "tecla", cual: "inicio" });
        await vi.advanceTimersByTimeAsync(100);
        responder("nonce-1", { motivo: "pausa-local" });
        responder("nonce-2", { ok: true, motivo: "ok" });
        expect(destino.instantanea().estado).toBe("en-vivo");
    });
    it("CTL1117J · S1: la pausa no cierra ni reabre nada: «En pausa» → en vivo con la misma sesión, y la entrada vuelve a salir", async () => {
        await enVivo();
        destino.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(50);
        const antes = nombres().length;
        responder("nonce-1", { motivo: "pausa-local" });
        expect(destino.instantanea().estado).toBe("pausa-local");
        destino.enviar({ tipo: "tecla", cual: "inicio" }); // durante la pausa la entrada se acepta (lo nativo la sostiene)
        await vi.advanceTimersByTimeAsync(3400);
        expect(destino.instantanea().estado).toBe("en-vivo");
        destino.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(50);
        expect(nombres().slice(antes)).not.toContain("abrir-sesion");
        expect(nombres()).not.toContain("cerrar-sesion");
        expect(nombres()).not.toContain("pantalla-parar");
        expect(destino.instantanea().estado).not.toBe("cerrada");
    });
    it("regla-g se dice como motivo sin cerrar nada, y se quita sola", async () => {
        await enVivo();
        destino.enviar({ tipo: "texto", texto: "x" });
        await vi.advanceTimersByTimeAsync(50);
        responder("nonce-1", { motivo: "regla-g" });
        expect(destino.instantanea()).toMatchObject({ estado: "en-vivo", motivo: "regla-g" });
        await vi.advanceTimersByTimeAsync(3400);
        expect(destino.instantanea().motivo).toBeUndefined();
    });
    it("un rechazo por el canal de control se trata igual", async () => {
        await enVivo();
        peer.canal.readyState = "connecting";
        guion["tecla"] = () => no("pausa-local");
        destino.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(50);
        expect(destino.instantanea().estado).toBe("pausa-local");
    });
    it("lo que no se pidió, mal formado o de otro nonce se ignora", async () => {
        await enVivo();
        peer.canal.onmessage!({ data: "no json" });
        peer.canal.onmessage!({ data: JSON.stringify({ tipo: "respuesta", nonce: "ajeno", ok: false, motivo: "sesion-caducada" }) });
        peer.canal.onmessage!({ data: 5 });
        expect(destino.instantanea().estado).toBe("en-vivo");
    });
});

describe("cierres", () => {
    for (const motivo of ["sesion-caducada", "sin-sesion", "parada-nativa", "a-mano", "no-autorizado", "permiso-apagado", "sin-indicador-nativo"]) {
        it(`el otro aparato dice «${motivo}»: se cierra sin volver a llamarle`, async () => {
            await enVivo();
            destino.enviar({ tipo: "tecla", cual: "atras" });
            await vi.advanceTimersByTimeAsync(50);
            peer.canal.onmessage!({ data: JSON.stringify({ tipo: "respuesta", nonce: "nonce-1", ok: false, motivo }) });
            await vi.advanceTimersByTimeAsync(10);
            expect(destino.instantanea()).toMatchObject({ estado: "cerrada", motivo, flujo: null });
            expect(nombres()).not.toContain("cerrar-sesion");
            expect(peer.cerrada).toBe(true);
        });
    }
    it("la conexión falla: se cierra con su motivo", async () => {
        await enVivo();
        peer.connectionState = "failed";
        peer.onconnectionstatechange!();
        await vi.advanceTimersByTimeAsync(10);
        expect(destino.instantanea()).toMatchObject({ estado: "cerrada", motivo: "conexion-perdida" });
    });
    it("cerrar a mano para la pantalla y la sesión del otro lado, suelta todo y no deja cola ni relojes", async () => {
        await enVivo();
        firmando = new Promise<void>(() => undefined);
        destino.enviar({ tipo: "tecla", cual: "atras" });
        destino.enviar({ tipo: "tecla", cual: "inicio" });
        await destino.cerrar("cerrada-por-la-persona");
        expect(nombres().slice(-2)).toEqual(["pantalla-parar", "cerrar-sesion"]);
        expect(peer.cerrada).toBe(true);
        expect(peer.canal.cerrado).toBe(true);
        expect(destino.enCola()).toBe(0);
        expect(destino.enviar({ tipo: "tecla", cual: "atras" })).toBe(false);
        const n = enviadas.length;
        await vi.advanceTimersByTimeAsync(20_000);
        expect(enviadas.length).toBe(n); // ya no lee el aparato ni mide
        await destino.cerrar("otra"); // idempotente
        expect(nombres().filter((x) => x === "cerrar-sesion")).toHaveLength(1);
    });
    it("si la negociación falla se cierra, no se queda «conectando» para siempre", async () => {
        guion["pantalla-senal"] = () => no("sin-pantalla");
        await destino.iniciar();
        expect(destino.instantanea()).toMatchObject({ estado: "cerrada", motivo: "senal-oferta-aparato-sin-pantalla" });
    });
});

describe("UNI1115M · costura e: los cuadros llegan derechos", () => {
    it("el giro de lo nativo no gira la ventana (siempre 0) y una tableta que se gira cambia la proporción, no el giro", async () => {
        const g = guion as unknown as Record<string, () => unknown>;
        await enVivo();
        expect(destino.instantanea().pantalla?.giro).toBe(0);
        expect(destino.instantanea().pantalla).toMatchObject({ ancho: 800, alto: 1280 });
        g["leer-aparato"] = () => ok({ aparato: { pantalla: { ancho: 1280, alto: 800, giro: 90, encendida: true, bloqueada: false } } });
        await vi.advanceTimersByTimeAsync(5200);
        expect(destino.instantanea().pantalla).toEqual({ ancho: 1280, alto: 800, giro: 0 });
    });
});
