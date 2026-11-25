/**
 * CTL1124D · Mac controla Linux por la malla: los cuadros llegan «ok» y la ventana queda negra.
 *
 * El medidor de cuadros/s y la resolución deben contar los cuadros de la malla aunque el lienzo
 * no pueda pintarlos. Y una numeración que se reinicia (p. ej. al pasar a «proyección») no puede
 * dejar la ventana esperando para siempre un cuadro que ya no llegará.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, type CanalDestinoLike, type DepsDestino, type PeerDestinoLike } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";
import { nivelParaCuadroGrande, partirCuadro, resincronizarDesde } from "../cuadro-malla";

vi.mock("../canal", () => ({
    comprobarWebRtcUtilizable: vi.fn(),
    decidirViaPantalla: vi.fn(),
}));

const { decidirViaPantalla } = await import("../canal");
const decidirMock = decidirViaPantalla as unknown as import("vitest").Mock<() => Promise<{ via: "malla"; razon: string }>>;

class Canal implements CanalDestinoLike {
    readyState = "open";
    onopen: (() => void) | null = null;
    onmessage: CanalDestinoLike["onmessage"] = null;
    onclose: (() => void) | null = null;
    send() { /* nada */ }
    close() { this.readyState = "closed"; }
}

class Peer implements PeerDestinoLike {
    localDescription: { sdp?: string } | null = null;
    connectionState = "new";
    onicecandidate: PeerDestinoLike["onicecandidate"] = null;
    ontrack: PeerDestinoLike["ontrack"] = null;
    onconnectionstatechange: (() => void) | null = null;
    cerrada = false;
    canal = new Canal();
    addTransceiver() { return {}; }
    createDataChannel() { return this.canal; }
    async createOffer() { return { type: "offer", sdp: "v=0\r\noferta" }; }
    async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
    async setRemoteDescription() { /* nada */ }
    async getStats() { return { forEach: () => undefined }; }
    close() { this.cerrada = true; }
}

const TOKEN = "a".repeat(32);
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
const CAPS = { entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true } };
const JPEG = Uint8Array.from({ length: 3000 }, (_, i) => (i * 7) & 255);

let peer: Peer;
let lineas: string[];
let pedidos: { nombre: string; args: Record<string, unknown> }[];
let numero: number;
let pintados: { ancho: number; alto: number; ok: boolean }[];
let pintarFalla: boolean;
let reseteoPendiente: boolean;
let grande: boolean;

function montar(): PantallaDestino {
    return new PantallaDestino("maggabox", deps());
}

function deps(): DepsDestino {
    return {
        mandar: async (nombre, args) => {
            pedidos.push({ nombre, args });
            if (nombre === "pantalla-cuadro") {
                const desde = Number(args.desde);
                if (Number(args.pide) === 0) {
                    if (reseteoPendiente) {
                        if (desde > 0) return ok({ nuevo: false, numero: 0 });
                        reseteoPendiente = false;
                        numero = 1;
                    }
                    if (grande) {
                        if (Number(args.nivel) === 0) return ok({ nuevo: false, numero: 0, motivo: "grande" });
                        grande = false;
                        numero = Math.max(numero, 1);
                    }
                    if (numero <= desde) return ok({ nuevo: false, numero });
                    return ok({ nuevo: true, ancho: 640, alto: 360, ...partirCuadro(JPEG, numero)[0] });
                }
                return ok(partirCuadro(JPEG, Number(args.num))[Number(args.pide)]);
            }
            if (nombre === "abrir-sesion") return ok({ sesion: TOKEN, nivel: "controlar", caduca: new Date(Date.now() + 3 * 60_000).toISOString() });
            if (nombre === "pantalla-iniciar") return ok({ ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });
            return ok({ aparato: {} });
        },
        firmar: async () => null,
        iceServers: async () => [],
        crearPeer: () => peer,
        flujoDe: () => null,
        ahora: () => Date.now(),
        anotar: (l) => void lineas.push(l),
        malla: {
            hayWebRtc: () => false,
            crearLienzo: () => ({
                pintar: async (_j, ancho, alto) => {
                    const bien = !pintarFalla;
                    pintados.push({ ancho, alto, ok: bien });
                    return bien;
                },
                flujo: () => ({ lienzo: true }),
                liberar: () => undefined,
            }),
            enlace: () => ({ camino: "directo", medio: "red-local" }),
            esperar: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
        },
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T22:38:40Z"));
    peer = new Peer();
    lineas = [];
    pedidos = [];
    numero = 1;
    pintados = [];
    pintarFalla = false;
    reseteoPendiente = false;
    grande = false;
    decidirMock.mockResolvedValue({ via: "malla", razon: "sin webrtc" });
    vi.clearAllMocks();
});

afterEach(() => vi.useRealTimers());

describe("CTL1124D · medir la malla aunque el lienzo no pinte", () => {
    it("si pintar falla, la resolución, los cuadros/s y la calidad cuentan igual", async () => {
        pintarFalla = true;
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(100);
        for (let i = 0; i < 40; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(60);
        }
        const s = d.instantanea();
        expect(s.via).toBe("malla");
        expect(s.estado).toBe("en-vivo");
        expect(s.pantalla).toEqual({ ancho: 640, alto: 360, giro: 0 });
        expect(s.fps).toBeGreaterThan(0);
        expect(s.calidad).not.toBeNull();
        expect(s.calidad?.fps).toBeGreaterThan(0);
        expect(s.calidad?.resolucion).toEqual({ ancho: 640, alto: 360 });
        expect(s.calidad?.codec).toBe("jpeg");
        expect(pintados.length).toBeGreaterThan(0);
        expect(pintados.every((p) => p.ok === false)).toBe(true);
        await d.cerrar("fin", false);
    });

    it("con el lienzo sano se mide igual (sin regresión)", async () => {
        const d = montar();
        await d.iniciar();
        for (let i = 0; i < 40; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(60);
        }
        const s = d.instantanea();
        expect(s.fps).toBeGreaterThan(0);
        expect(s.pantalla).toEqual({ ancho: 640, alto: 360, giro: 0 });
        expect(s.calidad?.fps).toBeGreaterThan(0);
        expect(s.calidad?.resolucion).toEqual({ ancho: 640, alto: 360 });
        expect(pintados.every((p) => p.ok === true)).toBe(true);
        await d.cerrar("fin", false);
    });

    it("reintentar el MISMO cuadro no lo cuenta como varios", async () => {
        pintarFalla = true;
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(2_000);
        expect(pintados.length).toBeGreaterThan(1);
        expect(d.instantanea().calidad?.cuadrosEnVentana).toBe(1);
        await d.cerrar("fin", false);
    });
});

describe("CTL1124D · respuestas vacías de la malla", () => {
    it("si el aparato reinicia la numeración (pasa a proyección), vuelve a pedir desde cero", async () => {
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(200);
        reseteoPendiente = true;
        await vi.advanceTimersByTimeAsync(1_000);
        expect(pedidos.some((p) => p.nombre === "pantalla-cuadro" && p.args.pide === 0 && p.args.desde === 0)).toBe(true);
        expect(lineas.some((l) => /^control-fuente paso=resync via=malla desde=0$/.test(l))).toBe(true);
        expect(pintados.length).toBeGreaterThan(1);
        expect(d.instantanea().estado).toBe("en-vivo");
        await d.cerrar("fin", false);
    });

    it("si el cuadro no cabe, pide un nivel menor en vez de esperar en silencio", async () => {
        grande = true;
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(1_500);
        expect(pedidos.some((p) => p.nombre === "pantalla-cuadro" && p.args.pide === 0 && p.args.nivel === 1)).toBe(true);
        expect(pintados.length).toBeGreaterThan(0);
        expect(d.instantanea().estado).toBe("en-vivo");
        await d.cerrar("fin", false);
    });
});

describe("CTL1124D · decisiones puras de la malla", () => {
    it("solo re-sincroniza cuando el número del aparato va por detrás", () => {
        expect(resincronizarDesde(5, { nuevo: false, numero: 2 })).toBe(2);
        expect(resincronizarDesde(5, { nuevo: false, numero: 5 })).toBeNull();
        expect(resincronizarDesde(0, { nuevo: false, numero: 0 })).toBeNull();
        expect(resincronizarDesde(5, { nuevo: true, numero: 2 })).toBeNull();
        expect(resincronizarDesde(5, { nuevo: false, numero: -1 })).toBeNull();
        expect(resincronizarDesde(5, null)).toBeNull();
    });

    it("solo baja un nivel cuando el cuadro es «grande» y aún queda margen", () => {
        expect(nivelParaCuadroGrande(0, { nuevo: false, motivo: "grande" })).toBe(1);
        expect(nivelParaCuadroGrande(1, { nuevo: false, motivo: "grande" })).toBe(2);
        expect(nivelParaCuadroGrande(3, { nuevo: false, motivo: "grande" })).toBeNull();
        expect(nivelParaCuadroGrande(0, { nuevo: false })).toBeNull();
        expect(nivelParaCuadroGrande(0, { nuevo: true, motivo: "grande" })).toBeNull();
        expect(nivelParaCuadroGrande(0, undefined)).toBeNull();
    });
});
