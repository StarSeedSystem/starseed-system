/**
 * CTL1117F · una orden que no vuelve nunca no deja la ventana sin lecturas: el carril sigue a los LIMITE_CARRIL_MS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITE_CARRIL_MS, PantallaDestino, REFRESCO_APARATO_MS, type CanalDestinoLike, type DepsDestino, type PeerDestinoLike } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";
import { trocear } from "../senal-partes";

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
    canal = new Canal();
    addTransceiver() { return {}; }
    createDataChannel() { return this.canal; }
    async createOffer() { return { type: "offer", sdp: "v=0\r\noferta" }; }
    async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
    async setRemoteDescription() { /* nada */ }
    async getStats() { return { forEach: () => undefined }; }
    close() { /* nada */ }
    conectar() { this.connectionState = "connected"; this.onconnectionstatechange?.(); }
}
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
let lecturas = 0;
let colgar = false;
let resp: Record<string, unknown>[] = [];
let peerG: Peer;

function montar(): PantallaDestino {
    const peer = new Peer();
    peerG = peer;
    const deps: DepsDestino = {
        mandar: async (nombre, args) => {
            if (nombre === "leer-aparato") {
                lecturas++;
                if (colgar) return new Promise<RespuestaOrden>(() => undefined); // no vuelve nunca
                return ok({ aparato: { brillo: 0.4 } });
            }
            if (nombre === "abrir-sesion") return ok({ sesion: "a".repeat(32), nivel: "controlar", caduca: new Date(Date.now() + 3 * 60_000).toISOString() });
            if (nombre === "pantalla-iniciar") return ok({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0, capacidades: { entrada: { gestos: true, max_dedos: 10, teclas: [], volumen: false, brillo: false, texto: false } } });
            if (nombre === "pantalla-senal") {
                if (typeof args.pide === "number") return ok({ ...resp[args.pide], neg: args.neg, i: args.pide });
                if (typeof args.neg === "string") return (args.i as number) === (args.n as number) - 1 ? ok({ lista: true, n: resp.length, total: 20, sha: "0".repeat(16) }) : ok({ recibida: args.i });
                return ok({ candidatos: 1 });
            }
            return ok();
        },
        firmar: async (nombre, _a, o) => ({ sobre: { v: 1, carga: nombre, nonce: "nonce-" + nombre, nivel: o.nivel }, nonce: "nonce-" + nombre }),
        iceServers: async () => [],
        crearPeer: () => peer,
        flujoDe: (p) => ({ pista: p }) as unknown as MediaStream,
        ahora: () => Date.now(),
    };
    const d = new PantallaDestino("tableta", deps);
    return d;
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
    lecturas = 0;
    colgar = false;
    resp = (await trocear("v=0\r\nrespuesta", "respuesta", "negociacion1")).map((p) => ({ ...p }));
});
afterEach(() => vi.useRealTimers());

describe("CTL1117F · el carril de la ventana no se queda colgado", () => {
    it("una lectura que no vuelve ocupa el carril como mucho LIMITE_CARRIL_MS; después la ventana vuelve a leer", async () => {
        const d = montar();
        await d.iniciar();
        peerG.conectar();
        await vi.advanceTimersByTimeAsync(10);
        const antes = lecturas;
        colgar = true;
        await vi.advanceTimersByTimeAsync(REFRESCO_APARATO_MS + 100); // la lectura que cuelga
        const colgadas = lecturas;
        expect(colgadas).toBeGreaterThan(antes);
        await vi.advanceTimersByTimeAsync(LIMITE_CARRIL_MS - REFRESCO_APARATO_MS); // el carril sigue ocupado hasta el límite
        const alLimite = lecturas;
        colgar = false;
        await vi.advanceTimersByTimeAsync(2 * REFRESCO_APARATO_MS + LIMITE_CARRIL_MS);
        expect(lecturas, "después del límite el carril vuelve a dejar pasar lecturas").toBeGreaterThan(alLimite);
        d.cerrar("prueba", false);
    });

    it("el límite es mayor que la espera de una orden normal (15 s) y menor que la caducidad por inactividad (2 min)", () => {
        expect(LIMITE_CARRIL_MS).toBeGreaterThan(15_000);
        expect(LIMITE_CARRIL_MS).toBeLessThan(120_000 / 4);
    });
});
