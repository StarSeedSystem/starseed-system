/**
 * CTL1117E · la ventana que mandó con una sesión vieja reintenta UNA vez con la nueva del registro compartido.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, REINTENTO_LIMITE_MS, type CanalDestinoLike, type DepsDestino, type PeerDestinoLike } from "../pantalla-destino";
import { RegistroSesiones } from "../registro-sesiones";
import type { RespuestaOrden } from "../orden";
import { trocear } from "../senal-partes";

class Canal implements CanalDestinoLike {
    readyState = "open";
    onopen: (() => void) | null = null;
    onmessage: CanalDestinoLike["onmessage"] = null;
    onclose: (() => void) | null = null;
    enviados: { carga: string; nonce: string }[] = [];
    send(d: string) { const o = JSON.parse(d); this.enviados.push({ carga: o.carga, nonce: o.nonce }); }
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

const TOKEN = "a".repeat(32);
const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
const CAPS = { entrada: { gestos: true, max_dedos: 10, teclas: ["atras", "inicio"], volumen: true, brillo: true, texto: true } };
let peer: Peer;
let eventos: string[];
let enviadas: { nombre: string; sesion?: string | null }[];
let guion: Record<string, () => RespuestaOrden>;
let demoras: Record<string, number>;
let firmadas = 0;
let respPartes: Record<string, unknown>[] = [];

function montar(registro?: RegistroSesiones, neurona = "tableta") {
    const deps: DepsDestino = {
        registro,
        mandar: async (nombre, args, o) => {
            enviadas.push({ nombre, sesion: o.sesion });
            eventos.push(`mandar:${nombre}`);
            if (demoras[nombre]) await new Promise((r) => setTimeout(r, demoras[nombre]));
            eventos.push(`respuesta:${nombre}`);
            if (nombre === "pantalla-senal") {
                if (typeof args.pide === "number") return ok({ ...respPartes[args.pide], neg: args.neg, i: args.pide });
                if (typeof args.neg === "string") return (args.i as number) === (args.n as number) - 1 ? ok({ lista: true, n: respPartes.length, total: 20, sha: "0".repeat(16) }) : ok({ recibida: args.i });
                return ok({ candidatos: 1 });
            }
            return (guion[nombre] ?? (() => ok()))();
        },
        firmar: async (nombre, _args, o) => {
            firmadas++;
            eventos.push(`firmar:${nombre}`);
            return { sobre: { v: 1, carga: nombre, nonce: `nonce-${firmadas}`, nivel: o.nivel }, nonce: `nonce-${firmadas}` };
        },
        iceServers: async () => [],
        crearPeer: () => peer,
        flujoDe: (p) => ({ pista: p }) as unknown as MediaStream,
        ahora: () => Date.now(),
    };
    return new PantallaDestino(neurona, deps);
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
    peer = new Peer();
    eventos = [];
    enviadas = [];
    demoras = {};
    firmadas = 0;
    respPartes = (await trocear("v=0\r\nrespuesta", "respuesta", "negociacion1")).map((p) => ({ ...p }));
    guion = {
        "abrir-sesion": () => ok({ sesion: TOKEN, nivel: "controlar", caduca: new Date(Date.now() + 3 * 60_000).toISOString() }),
        "pantalla-iniciar": () => ok({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS }),
        "leer-aparato": () => ok({ aparato: { brillo: 0.4 } }),
    };
});
afterEach(() => vi.useRealTimers());

async function enVivo(d: PantallaDestino) {
    await d.iniciar();
    peer.conectar();
    await vi.advanceTimersByTimeAsync(0);
    expect(d.instantanea().estado).toBe("en-vivo");
}
const responder = (nonce: string, r: Partial<RespuestaOrden>) => peer.canal.onmessage!({ data: JSON.stringify({ tipo: "respuesta", nonce, ok: false, motivo: "x", ...r }) });


const NUEVO = "b".repeat(32);

describe("CTL1117E · sesión vieja caducada, nueva ya viva (o abriéndose)", () => {
    it("reintenta UNA vez con la sesión nueva y no se da por cerrada", async () => {
        const reg = new RegistroSesiones();
        const a = montar(reg);
        let primera = true;
        guion["pantalla-iniciar"] = () => {
            if (primera) {
                primera = false;
                // 0,3 s después de la respuesta caducada, el banco abre la sesión nueva por el MISMO registro.
                reg.olvidar("tableta"); void reg.abrir("tableta", async () => { await new Promise((r) => setTimeout(r, 300)); return ok({ sesion: NUEVO, nivel: "controlar", caduca: new Date(Date.now() + 3 * 60_000).toISOString() }); }, { nivel: "controlar" });
                return { tipo: "respuesta", nonce: "n", ok: false, motivo: "sesion-caducada" };
            }
            return ok({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });
        };
        const p = a.iniciar();
        await vi.advanceTimersByTimeAsync(1000);
        await p;
        peer.conectar();
        await vi.advanceTimersByTimeAsync(0);
        const ini = enviadas.filter((e) => e.nombre === "pantalla-iniciar");
        expect(ini.map((e) => e.sesion)).toEqual([TOKEN, NUEVO]);
        expect(a.instantanea().estado).not.toBe("cerrada");
    });

    it("sin sesión más nueva se cierra como siempre, y el reintento es uno solo", async () => {
        const reg = new RegistroSesiones();
        const a = montar(reg);
        guion["pantalla-iniciar"] = () => ({ tipo: "respuesta", nonce: "n", ok: false, motivo: "sesion-caducada" });
        await a.iniciar();
        await vi.advanceTimersByTimeAsync(10);
        expect(enviadas.filter((e) => e.nombre === "pantalla-iniciar")).toHaveLength(1);
        expect(a.instantanea().estado).toBe("cerrada");
        expect(a.instantanea().motivo).toBe("sesion-caducada");
    });

    it("si la nueva también caduca, no hay un segundo reintento (cierra)", async () => {
        const reg = new RegistroSesiones();
        const a = montar(reg);
        guion["pantalla-iniciar"] = () => {
            reg.olvidar("tableta"); void reg.abrir("tableta", async () => ok({ sesion: NUEVO, nivel: "controlar", caduca: new Date(Date.now() + 3 * 60_000).toISOString() }), { nivel: "controlar" });
            return { tipo: "respuesta", nonce: "n", ok: false, motivo: "sesion-caducada" };
        };
        const p = a.iniciar();
        await vi.advanceTimersByTimeAsync(1000);
        await p;
        expect(enviadas.filter((e) => e.nombre === "pantalla-iniciar")).toHaveLength(2);
        expect(a.instantanea().estado).toBe("cerrada");
    });
});
