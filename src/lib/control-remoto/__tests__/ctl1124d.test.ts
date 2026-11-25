/**
 * CTL1124D · el medidor de cuadros/s y la resolución deben contar también los cuadros por la malla,
 * aunque el lienzo falle al pintar (p. ej. Mac/WebKit sin GStreamer).
 * Regresión: con .63 los cuadros llegan «ok» pero la ventana queda negra y control-calidad dice fps=0 resolucion=desconocida.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, type DepsDestino } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";
import { partirCuadro } from "../cuadro-malla";
import { trocear } from "../senal-partes";

const TOKEN = "a".repeat(32);
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
const CAPS = { entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true } };
const JPEG = new Uint8Array(1000).fill(42);

let peer: { cerrada: boolean; connectionState: string; onconnectionstatechange: (() => void) | null; close: () => void };
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
        firmar: async (_nombre, _a, _o) => null,
        iceServers: async () => [],
        crearPeer: () => peer,
        flujoDe: () => null,
        ahora: () => Date.now(),
        anotar: (l) => void lineas.push(l),
        malla: {
            hayWebRtc: () => hayWebRtc,
            crearLienzo: () => ({
                pintar: async (_j: Uint8Array, ancho: number, alto: number) => {
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
    peer = { cerrada: false, connectionState: "new", onconnectionstatechange: null, close() { this.cerrada = true; } };
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

describe("CTL1124D · calidad de malla aunque el lienzo falle", () => {
    it("si pintar falla, los cuadros siguen contándose para fps y resolución", async () => {
        pintarFalla = true; // Simula Mac/WebKit sin GStreamer: el lienzo no pinta pero los cuadros llegan
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(100);

        // Pedir varios cuadros (avanzar > 1.5s para que se calcule fps y calidad)
        for (let i = 0; i < 30; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(60);
        }

        // Aunque pintar falle, la instantánea debe mostrar fps > 0 y resolución
        const snap = d.instantanea();
        expect(snap.fps).toBeGreaterThan(0);
        expect(snap.pantalla).toEqual({ ancho: 640, alto: 360, giro: 0 });
        expect(snap.calidad?.fps).toBeGreaterThan(0);
        expect(snap.calidad?.resolucion).toEqual({ ancho: 640, alto: 360 });
        expect(snap.calidad?.codec).toBe("jpeg");

        // Verificar que los cuadros se intentaron pintar pero fallaron
        expect(pintados.every((p) => p.ok === false)).toBe(true);
        expect(pintados.length).toBeGreaterThan(0);

        await d.cerrar("fin", false);
        expect(liberado).toBe(true);
    });

    it("si pintar funciona, los cuadros se cuentan igual (sin regresión)", async () => {
        pintarFalla = false;
        const d = montar();
        await d.iniciar();
        await vi.advanceTimersByTimeAsync(100);

        for (let i = 0; i < 30; i++) {
            numero += 1;
            await vi.advanceTimersByTimeAsync(60);
        }

        const snap = d.instantanea();
        expect(snap.fps).toBeGreaterThan(0);
        expect(snap.pantalla).toEqual({ ancho: 640, alto: 360, giro: 0 });
        expect(snap.calidad?.fps).toBeGreaterThan(0);
        expect(snap.calidad?.resolucion).toEqual({ ancho: 640, alto: 360 });

        expect(pintados.every((p) => p.ok === true)).toBe(true);
        await d.cerrar("fin", false);
    });
});