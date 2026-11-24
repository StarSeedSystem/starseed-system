/**
 * CTL1124D · regresión: los cuadros por la malla llegan «ok» pero la ventana queda negra
 * (fps=0, resolución=desconocida) porque el destino no pinta/mide cuando falla el pintado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, type DepsDestino } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";
import { partirCuadro } from "../cuadro-malla";
import { trocear } from "../senal-partes";
import type { CapacidadesNativas } from "../nativo";

vi.mock("../canal", () => ({
    comprobarWebRtcUtilizable: vi.fn(),
    decidirViaPantalla: vi.fn(),
}));

const { comprobarWebRtcUtilizable, decidirViaPantalla } = await import("../canal");

type ComprobarWebRtcUtilizable = () => Promise<{ usable: boolean; faltaWebRtc?: string; detalle?: string }>;
type DecidirViaPantalla = (capsControlador: Awaited<ReturnType<typeof import("../nativo").capacidadesNativas>> | null, _capsControlado: unknown) => Promise<{ via: "webrtc" | "malla"; razon: string }>;

const comprobarWebRtcUtilizableMock = comprobarWebRtcUtilizable as unknown as import("vitest").Mock<ComprobarWebRtcUtilizable>;
const decidirViaPantallaMock = decidirViaPantalla as unknown as import("vitest").Mock<DecidirViaPantalla>;

class Canal {
    readyState = "open";
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    send() { /* nada */ }
    close() { this.readyState = "closed"; }
}

class Peer {
    localDescription: { sdp?: string } | null = null;
    connectionState = "new";
    onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null = null;
    ontrack: ((e: { track: unknown; streams?: unknown[] }) => void) | null = null;
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
    fallar() { this.connectionState = "failed"; this.onconnectionstatechange?.(); }
}

const TOKEN = "a".repeat(32);
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
const CAPS = { entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true } };
const JPEG = Uint8Array.from({ length: 5000 }, (_, i) => (i * 5) & 255);

let peer: Peer;
let lineas: string[];
let pedidos: { nombre: string; args: Record<string, unknown> }[];
let enVuelo: number;
let maxEnVuelo: number;
let numero: number;
let pintados: { ancho: number; alto: number; bytes: number; ok: boolean }[];
let liberado: boolean;
let camino: "directo" | "capa";
let hayWebRtc: boolean;
let falloSenal: boolean;
let respPartes: Record<string, unknown>[] = [];
let pintarFalla: boolean;

function montar() {
    comprobarWebRtcUtilizableMock.mockResolvedValue(
        hayWebRtc ? { usable: true } : { usable: false, faltaWebRtc: "webrtc-linux", detalle: "faltan elementos de GStreamer" }
    );
    decidirViaPantallaMock.mockImplementation(async (_capsControlador: Awaited<ReturnType<typeof import("../nativo").capacidadesNativas>> | null, _capsControlado: unknown) => {
        const { usable, faltaWebRtc, detalle } = await comprobarWebRtcUtilizable();
        if (usable) return { via: "webrtc" as const, razon: "WebRTC disponible en el controlador" };
        const causa = faltaWebRtc === "webrtc-linux" ? `Linux sin WebRTC (${detalle})` : "WebRTC no disponible";
        return { via: "malla" as const, razon: `Pantalla por cuadros: ${causa}` };
    });

    const deps: DepsDestino = {
        mandar: async (nombre, args) => {
            pedidos.push({ nombre, args });
            if (nombre === "pantalla-cuadro") {
                enVuelo++;
                maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
                await new Promise((r) => setTimeout(r, 20));
                enVuelo--;
                const desde = Number(args.desde);
                if (Number(args.pide) === 0) {
                    if (numero <= desde) return ok({ nuevo: false, numero });
                    const partes = partirCuadro(JPEG, numero);
                    return ok({ nuevo: true, ancho: 640, alto: 360, ...partes[0] });
                }
                return ok(partirCuadro(JPEG, Number(args.num))[Number(args.pide)]);
            }
            if (nombre === "abrir-sesion") return ok({ sesion: TOKEN, nivel: "controlar", caduca: new Date(Date.now() + 3 * 60_000).toISOString() });
            if (nombre === "pantalla-iniciar") return ok({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });
            if (nombre === "pantalla-senal") {
                if (falloSenal) return { tipo: "respuesta", nonce: "n", ok: false, motivo: "argumentos" };
                if (typeof args.pide === "number") return ok({ ...respPartes[args.pide], neg: args.neg, i: args.pide });
                if (typeof args.neg === "string") return (args.i as number) === (args.n as number) - 1 ? ok({ lista: true, n: respPartes.length, total: 20, sha: "0".repeat(16) }) : ok({ recibida: args.i });
                return ok({ candidatos: 1 });
            }
            return ok({ aparato: { brillo: 0.4 } });
        },
        firmar: async (nombre, _a, o) => ({ sobre: { v: 1, carga: nombre, nonce: `n-${pedidos.length}`, nivel: o.nivel }, nonce: `n-${pedidos.length}` }),
        iceServers: async () => [],
        crearPeer: () => peer,
        flujoDe: (p) => ({ pista: p }) as unknown as MediaStream,
        ahora: () => Date.now(),
        anotar: (l) => void lineas.push(l),
        malla: {
            hayWebRtc: () => hayWebRtc,
            crearLienzo: () => ({
                pintar: async (_j, ancho, alto) => {
                    const ok = !pintarFalla;
                    pintados.push({ ancho, alto, bytes: JPEG.length, ok });
                    return ok;
                },
                flujo: () => ({ lienzo: true }),
                liberar: () => { liberado = true; },
            }),
            enlace: () => ({ camino, medio: "red-local" }),
            esperar: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
        },
    };
    return new PantallaDestino("tableta", deps);
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T10:00:00Z"));
    peer = new Peer();
    lineas = [];
    pedidos = [];
    enVuelo = 0;
    maxEnVuelo = 0;
    numero = 1;
    pintados = [];
    liberado = false;
    camino = "directo";
    hayWebRtc = false;
    falloSenal = false;
    pintarFalla = false;
    respPartes = (await trocear("v=0\r\nrespuesta", "respuesta", "negociacion1")).map((p) => ({ ...p }));
    vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("CTL1124D · regresión: cuadros malla llegan ok pero no se miden si pintar falla", () => {
    it("con pintar OK: mide fps, resolución y calidad", async () => {
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);
        for (let i = 0; i < 20; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(60);
        }
        const s = d.instantanea();
        expect(s.via).toBe("malla");
        expect(s.estado).toBe("en-vivo");
        expect(s.fps).toBeGreaterThan(0);
        expect(s.pantalla).toEqual({ ancho: 640, alto: 360, giro: 0 });
        expect(s.calidad).not.toBeNull();
        expect(s.calidad!.fps).toBeGreaterThan(0);
        expect(s.calidad!.resolucion).toEqual({ ancho: 640, alto: 360 });
        expect(pintados.every((p) => p.ok)).toBe(true);
        await d.cerrar("fin", false);
    });

    it("con pintar FALLO: los cuadros llegan ok, se miden fps/resolución/calidad, pero el lienzo no se pinta", async () => {
        pintarFalla = true; // Simula fallo de pintado (ej. createImageBitmap no disponible)
        const d = montan();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);
        for (let i = 0; i < 20; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(60);
        }
        const s = d.instantanea();
        // La orden pantalla-cuadro devuelve ok (cuadros recibidos)
        expect(pedidos.filter((p) => p.nombre === "pantalla-cuadro" && p.args.pide === 0).length).toBeGreaterThan(0);
        // Pero el pintado falla
        expect(pintados.every((p) => !p.ok)).toBe(true);
        // AUN ASÍ: la calidad (calcularMetricas) debe medir los cuadros recibidos
        expect(s.calidad).not.toBeNull();
        expect(s.calidad!.fps).toBeGreaterThan(0);
        expect(s.calidad!.resolucion).toEqual({ ancho: 640, alto: 360 });
        expect(s.pantalla).toEqual({ ancho: 640, alto: 360, giro: 0 });
        // El estado debe ser en-vivo porque llegan cuadros
        expect(s.estado).toBe("en-vivo");
        // El fps local (s.fps) puede ser 0 porque solo cuenta pintados, pero calidad.fps > 0
        await d.cerrar("fin", false);
    });
});

function montan() {
    return montar();
}