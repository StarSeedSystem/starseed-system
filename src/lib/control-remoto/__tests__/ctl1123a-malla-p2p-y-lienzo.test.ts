import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decidirViaPantalla } from "../canal";
import { UMBRALES_MALLA_DIRECTO, partirCuadro } from "../cuadro-malla";
import { PantallaDestino, depsReales, type DepsDestino, type PeerDestinoLike } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";

const TOKEN = "b".repeat(32);
const CAPS = { entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: false, brillo: false, texto: true } };
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });

describe("CTL1123A · vía directa sin WebRTC del aparato, pausa local y lienzo sin captureStream", () => {
    const origRtc = globalThis.RTCPeerConnection;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-23T08:00:00Z"));
        (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = function () {
            return {};
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = origRtc;
        vi.restoreAllMocks();
    });

    it("decidirViaPantalla pasa directo a malla si el aparato controlado anuncia webrtc=false", async () => {
        const r = await decidirViaPantalla(null, { webrtc: false });
        expect(r.via).toBe("malla");
        expect(r.razon).toContain("no tiene WebRTC");
    });

    it("PantallaDestino salta directo a malla con webrtc:false y sobrevive a multiples rechazo:pausa-local", async () => {
        const pedidos: string[] = [];
        const pintados: number[] = [];
        let cuadrosIdx = 0;
        let respuestaCuadro: () => RespuestaOrden = () => ({
            tipo: "respuesta",
            nonce: "n",
            ok: false,
            motivo: "pausa-local",
        });

        const deps: DepsDestino = {
            mandar: async (nombre, args) => {
                pedidos.push(nombre);
                if (nombre === "abrir-sesion") {
                    return ok({ sesion: TOKEN, nivel: "controlar", caduca: new Date(Date.now() + 3 * 60_000).toISOString() });
                }
                if (nombre === "pantalla-iniciar") {
                    return ok({ ok: true, fuente: "accesibilidad", ancho: 1280, alto: 720, giro: 0, webrtc: false, capacidades: CAPS });
                }
                if (nombre === "pantalla-cuadro") {
                    if (Number(args.pide) > 0) return ok(partirCuadro(new Uint8Array(600), Number(args.num))[Number(args.pide)]);
                    return respuestaCuadro();
                }
                return ok({ aparato: {} });
            },
            firmar: async () => null,
            iceServers: async () => [],
            crearPeer: () => ({}) as unknown as PeerDestinoLike,
            flujoDe: () => null,
            ahora: () => Date.now(),
            malla: {
                hayWebRtc: () => true,
                crearLienzo: () => ({
                    pintar: async (_jpeg, _w, _h) => {
                        pintados.push(++cuadrosIdx);
                        return true;
                    },
                    flujo: () => null,
                    liberar: () => undefined,
                }),
                enlace: () => ({ camino: "directo", medio: "red-local" }),
                esperar: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 20))),
            },
        };

        const d = new PantallaDestino("maggabox", deps);
        await d.iniciar();
        expect(pedidos).not.toContain("pantalla-senal");
        expect(d.instantanea().via).toBe("malla");

        // 7 rechazos consecutivos por pausa-local NO deben cerrar la sesión (umbral de fallos = 5).
        await vi.advanceTimersByTimeAsync(160);
        expect(pedidos.filter((p) => p === "pantalla-cuadro").length).toBeGreaterThanOrEqual(6);
        expect(d.instantanea().estado).toBe("pausa-local");

        // Al volver los cuadros (respetando desde como pantalla-origen.ts), recupera a en-vivo y pinta sin reabrir sesión.
        let ultimoNum = 0;
        respuestaCuadro = () => {
            if (ultimoNum >= 10) return ok({ nuevo: false, numero: 10 });
            ultimoNum = 10;
            return ok({ nuevo: true, ancho: 1280, alto: 720, ...partirCuadro(new Uint8Array(600), 10)[0] });
        };
        await vi.advanceTimersByTimeAsync(100);
        expect(pintados.length).toBeGreaterThanOrEqual(1);
        expect(d.instantanea().estado).toBe("en-vivo");
        await d.cerrar("fin", false);
    });

    it("UMBRALES_MALLA_DIRECTO es mas tolerante en red local directa", () => {
        expect(UMBRALES_MALLA_DIRECTO.alto).toBeGreaterThanOrEqual(500);
        expect(UMBRALES_MALLA_DIRECTO.bajo).toBeGreaterThanOrEqual(180);
    });

    it("crearLienzo de depsReales nunca invoca canvas.captureStream y devuelve flujo null", () => {
        const captureStreamSpy = vi.fn();
        const canvasFalso = {
            width: 0,
            height: 0,
            captureStream: captureStreamSpy,
            getContext: () => ({ drawImage: vi.fn() }),
        } as unknown as HTMLCanvasElement;
        const g = globalThis as { document?: unknown };
        const docOrig = g.document;
        g.document = { createElement: () => canvasFalso };
        try {
            const deps = depsReales("neurona-test");
            const lienzo = deps.malla!.crearLienzo();
            expect(captureStreamSpy).not.toHaveBeenCalled();
            expect(lienzo.flujo()).toBeNull();
            expect(lienzo.elemento?.()).toBe(canvasFalso);
            lienzo.liberar();
            expect(canvasFalso.width).toBe(0);
            expect(canvasFalso.height).toBe(0);
        } finally {
            g.document = docOrig;
        }
    });
});
