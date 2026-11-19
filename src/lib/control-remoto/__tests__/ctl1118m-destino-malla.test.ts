/**
 * CTL1118M · quien manda sin WebRTC (o con la negociación caída) trae la pantalla por la malla: un cuadro en vuelo, repintado en su lienzo,
 * con la vía real y los cuadros/s en la instantánea y las líneas control-fuente en el registro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, type CanalDestinoLike, type DepsDestino, type PeerDestinoLike } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";
import { PARTE_CUADRO_MAX, partirCuadro } from "../cuadro-malla";
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
    fallar() { this.connectionState = "failed"; this.onconnectionstatechange?.(); }
}

const TOKEN = "a".repeat(32);
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
const CAPS = { entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true } };
const JPEG = Uint8Array.from({ length: PARTE_CUADRO_MAX + 50 }, (_, i) => (i * 5) & 255);

let peer: Peer;
let lineas: string[];
let pedidos: { nombre: string; args: Record<string, unknown> }[];
let enVuelo: number;
let maxEnVuelo: number;
let numero: number;
let pintados: { ancho: number; alto: number; bytes: number }[];
let liberado: boolean;
let camino: "directo" | "capa";
let hayWebRtc: boolean;
let falloSenal: boolean;
let respPartes: Record<string, unknown>[] = [];

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
                    return ok({ nuevo: true, ancho: 640, alto: 360, ...partirCuadro(JPEG, numero)[0] });
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
                pintar: async (j, ancho, alto) => { pintados.push({ ancho, alto, bytes: j.length }); return true; },
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
    respPartes = (await trocear("v=0\r\nrespuesta", "respuesta", "negociacion1")).map((p) => ({ ...p }));
    vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("CTL1118M · pantalla por la malla (destino)", () => {
    it("sin WebRTC: va por la malla desde el principio, reensambla las partes, pinta y dice la vía", async () => {
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);
        const s = d.instantanea();
        expect(s.via).toBe("malla");
        expect(s.enlace).toBe("directo:red-local");
        expect(s.estado).toBe("en-vivo");
        expect(pintados[0]).toEqual({ ancho: 640, alto: 360, bytes: JPEG.length });
        expect(pedidos.some((p) => p.nombre === "pantalla-senal")).toBe(false); // ni siquiera se negocia
        expect(pedidos.filter((p) => p.nombre === "pantalla-cuadro" && p.args.pide === 1).length).toBeGreaterThan(0);
        expect(lineas.some((l) => /^control-fuente paso=via via=malla enlace=directo:red-local cuadros-s=sin-medir causa=sin-webrtc$/.test(l))).toBe(true);
        await d.cerrar("fin", false);
        expect(liberado).toBe(true);
    });
    it("un solo cuadro en vuelo, y con cuadros nuevos mide cuadros/s", async () => {
        const d = montar();
        await d.iniciar();
        for (let i = 0; i < 40; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(60);
        }
        expect(maxEnVuelo).toBe(1);
        expect(pintados.length).toBeGreaterThan(5);
        expect(d.instantanea().fps).toBeGreaterThan(0);
        await d.cerrar("fin", false);
    });
    it("por un camino que no es directo pide el nivel mínimo", async () => {
        camino = "capa";
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(200);
        const p0 = pedidos.find((p) => p.nombre === "pantalla-cuadro" && p.args.pide === 0);
        expect(p0?.args.nivel).toBe(3);
        await d.cerrar("fin", false);
    });
    it("con WebRTC, si la negociación falla, pasa a la malla (sin-oferta)", async () => {
        hayWebRtc = true;
        falloSenal = true;
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);
        expect(d.instantanea().via).toBe("malla");
        expect(lineas.some((l) => l.includes("causa=sin-oferta"))).toBe(true);
        await d.cerrar("fin", false);
    });
    it("con WebRTC que no conecta en 12 s, pasa a la malla y suelta el par", async () => {
        hayWebRtc = true;
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(d.instantanea().via ?? "webrtc").not.toBe("malla");
        await vi.advanceTimersByTimeAsync(8_000);
        expect(d.instantanea().via).toBe("malla");
        expect(peer.cerrada).toBe(true);
        expect(lineas.some((l) => l.includes("causa=ice-sin-conexion"))).toBe(true);
        await d.cerrar("fin", false);
    });
    it("con WebRTC que falla después, pasa a la malla (ice-fallido)", async () => {
        hayWebRtc = true;
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(100);
        peer.fallar();
        await vi.advanceTimersByTimeAsync(300);
        expect(d.instantanea().via).toBe("malla");
        expect(lineas.some((l) => l.includes("causa=ice-fallido"))).toBe(true);
        await d.cerrar("fin", false);
    });
});