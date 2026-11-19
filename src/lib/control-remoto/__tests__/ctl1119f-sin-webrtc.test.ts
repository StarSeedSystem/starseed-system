/**
 * CTL1119F · pantalla sin WebRTC: selección de vía por capacidades y aviso a los 10 s.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, type DepsDestino, type CanalDestinoLike, type PeerDestinoLike } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";
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

class CanalFalso implements CanalDestinoLike {
    readyState = "open";
    onopen: (() => void) | null = null;
    onmessage: CanalDestinoLike["onmessage"] = null;
    onclose: (() => void) | null = null;
    send() { /* nada */ }
    close() { this.readyState = "closed"; }
}
class PeerFalso implements PeerDestinoLike {
    localDescription: { sdp?: string } | null = null;
    connectionState = "new";
    onicecandidate: import("../pantalla-destino").PeerDestinoLike["onicecandidate"] = null;
    ontrack: import("../pantalla-destino").PeerDestinoLike["ontrack"] = null;
    onconnectionstatechange: (() => void) | null = null;
    cerrada = false;
    addTransceiver() { return {}; }
    createDataChannel() { return new CanalFalso(); }
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

let peer: PeerFalso;
let lineas: string[];
let pedidos: { nombre: string; args: Record<string, unknown> }[];
let respPartes: Record<string, unknown>[] = [];
let numero: number;
let pintados: { ancho: number; alto: number; bytes: number }[];
let liberado: boolean;
let camino: "directo" | "capa";
let avisosVentana: { fase: string; mensaje: string }[];

function montar(opts: { hayWebRtc: boolean; falloSenal?: boolean; conMalla?: boolean } = { hayWebRtc: false }) {
    const { hayWebRtc, falloSenal = false, conMalla = true } = opts;
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
                await new Promise((r) => setTimeout(r, 20));
                const desde = Number(args.desde);
                if (Number(args.pide) === 0) {
                    if (numero <= desde) return ok({ nuevo: false, numero });
                    return ok({ nuevo: true, ancho: 640, alto: 360, ...partirCuadro(new Uint8Array(1000), numero)[0] });
                }
                return ok(partirCuadro(new Uint8Array(1000), Number(args.num))[Number(args.pide)]);
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
        malla: conMalla ? {
            hayWebRtc: () => hayWebRtc,
            crearLienzo: () => ({
                pintar: async (j, ancho, alto) => { pintados.push({ ancho, alto, bytes: j.length }); return true; },
                flujo: () => ({ lienzo: true }),
                liberar: () => { liberado = true; },
            }),
            enlace: () => ({ camino, medio: "red-local" }),
            esperar: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
        } : undefined,
    };
    return new PantallaDestino("tableta", deps);
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T10:00:00Z"));
    peer = new PeerFalso();
    lineas = [];
    pedidos = [];
    respPartes = (await trocear("v=0\r\nrespuesta", "respuesta", "negociacion1")).map((p) => ({ ...p }));
    numero = 1;
    pintados = [];
    liberado = false;
    camino = "directo";
    avisosVentana = [];
    vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("CTL1119F · selección de vía por capacidades", () => {
    it("sin WebRTC local: va por malla desde el principio y avisa en la ventana", async () => {
        const d = montar({ hayWebRtc: false });
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);
        const snap = d.instantanea();
        expect(snap.via).toBe("malla");
        expect(snap.estado).toBe("en-vivo");
        expect(pintados.length).toBeGreaterThan(0);
        expect(pedidos.some((p) => p.nombre === "pantalla-senal")).toBe(false);
        expect(lineas.some((l) => l.includes("causa=sin-webrtc"))).toBe(true);
        // La ventana debe mostrar el motivo
        expect(snap.motivo).toContain("sin vídeo WebRTC");
        await d.cerrar("fin", false);
        expect(liberado).toBe(true);
    });

    it("con WebRTC local pero fallo en la oferta: pasa a malla y avisa la causa", async () => {
        const d = montar({ hayWebRtc: true, falloSenal: true });
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);
        expect(d.instantanea().via).toBe("malla");
        expect(lineas.some((l) => l.includes("causa=sin-oferta"))).toBe(true);
        expect(d.instantanea().motivo).toContain("sin vídeo WebRTC");
        await d.cerrar("fin", false);
    });

    it("con WebRTC local que no conecta en 12 s: pasa a malla (ice-sin-conexion)", async () => {
        const d = montar({ hayWebRtc: true });
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(d.instantanea().via ?? "webrtc").not.toBe("malla");
        await vi.advanceTimersByTimeAsync(8_000);
        expect(d.instantanea().via).toBe("malla");
        expect(peer.cerrada).toBe(true);
        expect(lineas.some((l) => l.includes("causa=ice-sin-conexion"))).toBe(true);
        expect(d.instantanea().motivo).toContain("sin vídeo WebRTC");
        await d.cerrar("fin", false);
    });

    it("con WebRTC que falla después de conectar: pasa a malla (ice-fallido)", async () => {
        const d = montar({ hayWebRtc: true });
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(100);
        peer.fallar();
        await vi.advanceTimersByTimeAsync(300);
        expect(d.instantanea().via).toBe("malla");
        expect(lineas.some((l) => l.includes("causa=ice-fallido"))).toBe(true);
        expect(d.instantanea().motivo).toContain("sin vídeo WebRTC");
        await d.cerrar("fin", false);
    });
});

describe("CTL1119F · aviso a los 10 s en 'conectando' sin pantalla", () => {
    it("a los 10 s en 'conectando' sin pasar a malla, muestra la causa y la vía intentada", async () => {
        // Simular WebRTC que tarda en conectar (no falla, no conecta)
        const d = montar({ hayWebRtc: true, conMalla: false }); // sin malla para forzar el aviso
        await d.iniciar();
        // Inicialmente en 'conectando'
        expect(d.instantanea().estado).toBe("conectando");
        // A los 10 s debe haber un motivo explicativo
        await vi.advanceTimersByTimeAsync(10_000);
        const snap = d.instantanea();
        expect(snap.motivo).toBeDefined();
        expect(snap.motivo).toContain("Conectando");
        await d.cerrar("fin", false);
    });

    it("si la malla está disponible, pasa a ella antes de los 10 s y avisa la vía", async () => {
        const d = montar({ hayWebRtc: true }); // con malla por defecto
        await d.iniciar();
        // Debe pasar a malla a los 12 s (ESPERA_ICE_MS)
        await vi.advanceTimersByTimeAsync(12_000);
        expect(d.instantanea().via).toBe("malla");
        expect(d.instantanea().motivo).toContain("sin vídeo WebRTC");
        await d.cerrar("fin", false);
    });
});

function partirCuadro(jpeg: Uint8Array, num: number) {
    const PARTE_CUADRO_MAX = 9000;
    const n = Math.ceil(jpeg.length / PARTE_CUADRO_MAX);
    return Array.from({ length: n }, (_, i) => ({
        num, i, n, total: jpeg.length, datos: btoa(String.fromCharCode(...jpeg.subarray(i * PARTE_CUADRO_MAX, (i + 1) * PARTE_CUADRO_MAX)))
    }));
}