/**
 * CTL1124D · regresión: los cuadros llegan «ok» por la malla pero la ventana queda negra
 * y el medidor de calidad muestra fps=0, resolución=desconocida.
 *
 * La Mac manda órdenes a Maggabox (vía malla, sin WebRTC). La Maggabox contesta
 * 36 `pantalla-cuadro` con resultado=ok en 77 s, pero:
 * - La instantánea sigue con `pantalla: null` o `{ancho:0,alto:0}` → «Pantalla: sin determinar»
 * - `calidad.fps` sigue en 0 → «Cuadros/s —»
 * - `calidad.resolucion` sigue null → «resolucion=desconocida»
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, type DepsDestino, type CanalDestinoLike, type PeerDestinoLike } from "../pantalla-destino";
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
let fallosPintar = 0;

function montar(opts?: { fuente?: "auto" | "proyeccion"; webrtcAparato?: boolean; anchoInicial?: number; altoInicial?: number }) {
    const fuente = opts?.fuente ?? "auto";
    const webrtcAparato = opts?.webrtcAparato ?? false;
    const anchoInicial = opts?.anchoInicial ?? 800;
    const altoInicial = opts?.altoInicial ?? 1280;

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
            if (nombre === "pantalla-iniciar") {
                // Simula la respuesta real: con fuente "proyeccion" el aparato puede no devolver ancho/alto
                // hasta que la proyección está activa. En la regresión, venía sin ancho/alto.
                const resp: Record<string, unknown> = {
                    ok: true,
                    fuente: fuente === "proyeccion" ? "proyeccion" : "accesibilidad",
                    capacidades: CAPS,
                    webrtc: webrtcAparato,
                };
                if (anchoInicial > 0 && altoInicial > 0) {
                    resp.ancho = anchoInicial;
                    resp.alto = altoInicial;
                    resp.giro = 0;
                }
                return ok(resp);
            }
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
                pintar: async (j, ancho, alto) => {
                    if (fallosPintar > 0) { fallosPintar -= 1; return false; }
                    pintados.push({ ancho, alto, bytes: j.length });
                    return true;
                },
                flujo: () => ({ lienzo: true }),
                liberar: () => { liberado = true; },
            }),
            enlace: () => ({ camino, medio: "red-local" }),
            esperar: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
        },
    };
    return new PantallaDestino("tableta", deps, fuente);
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T22:38:40Z"));
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
    fallosPintar = 0;
    respPartes = (await trocear("v=0\r\nrespuesta", "respuesta", "negociacion1")).map((p) => ({ ...p }));
    vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("CTL1124D · regresión: cuadros por malla pero ventana negra y calidad en cero", () => {
    it("con fuente 'proyeccion' y sin ancho/alto inicial, la ventana recibe cuadros, los pinta y actualiza calidad", async () => {
        // Simula el escenario real: fuente=proyeccion, aparato sin WebRTC, respuesta inicial SIN ancho/alto
        const d = montar({ fuente: "proyeccion", webrtcAparato: false, anchoInicial: 0, altoInicial: 0 });
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);

        // La pantalla debería estar en "en-vivo" vía malla
        let s = d.instantanea();
        expect(s.via).toBe("malla");
        expect(s.enlace).toBe("directo:red-local");
        expect(s.estado).toBe("en-vivo");

        // Pero en la regresión, pantalla seguia siendo {ancho:0,alto:0} o null
        // y calidad.fps = 0, calidad.resolucion = null
        expect(s.pantalla).not.toBeNull();
        expect(s.pantalla?.ancho).toBeGreaterThan(0);
        expect(s.pantalla?.alto).toBeGreaterThan(0);

        // Avanza tiempo para que lleguen varios cuadros y actualizarCalidad se ejecute (cada 1.5s)
        for (let i = 0; i < 30; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(80);
        }

        s = d.instantanea();
        // La calidad debe reflejar los cuadros recibidos por la malla
        expect(s.calidad).toBeDefined();
        expect(s.calidad?.fps).toBeGreaterThan(0);
        expect(s.calidad?.resolucion).not.toBeNull();
        expect(s.calidad?.resolucion?.ancho).toBeGreaterThan(0);
        expect(s.calidad?.resolucion?.alto).toBeGreaterThan(0);
        expect(s.calidad?.medio).toBe("red-local");

        await d.cerrar("fin", false);
        expect(liberado).toBe(true);
    });

    it("con fuente 'auto' y ancho/alto inicial, la calidad cuenta cuadros malla correctamente", async () => {
        const d = montar({ fuente: "auto", webrtcAparato: false, anchoInicial: 800, altoInicial: 1280 });
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);

        for (let i = 0; i < 20; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(60);
        }

        const s = d.instantanea();
        expect(s.calidad).toBeDefined();
        expect(s.calidad?.fps).toBeGreaterThan(0);
        expect(s.calidad?.resolucion?.ancho).toBe(640); // el ancho de los cuadros que llegan
        expect(s.calidad?.resolucion?.alto).toBe(360);
        expect(s.calidad?.codec).toBe("jpeg");

        await d.cerrar("fin", false);
    });

    it("el registro control-fuente dice la vía real y los cuadros/s medidos también para malla", async () => {
        const d = montar({ fuente: "proyeccion", webrtcAparato: false, anchoInicial: 0, altoInicial: 0 });
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(300);

        // Avanza más de 5s para que se emita la línea periódica con cuadros/s medidos
        for (let i = 0; i < 80; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(80);
        }

        // Debe haber líneas de control-fuente con via=malla y cuadros-s > 0
        const lineasVia = lineas.filter((l) => l.startsWith("control-fuente paso=via via=malla"));
        expect(lineasVia.length).toBeGreaterThan(0);
        const ultima = lineasVia[lineasVia.length - 1];
        expect(ultima).toMatch(/cuadros-s=\d+/);
        expect(ultima).not.toMatch(/cuadros-s=sin-medir/);

        await d.cerrar("fin", false);
    });
});