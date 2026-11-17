/**
 * CTL1117A · lo que pasa en la ventana (lado que manda): S1/S2/S4 (una sesión compartida), S6 («repetida»: orden de
 * emisión y reenvío), S9 (avisos que se quitan al cumplirse algo) y S3 (hora máxima a la vista).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PantallaDestino, REINTENTO_LIMITE_MS, type CanalDestinoLike, type DepsDestino, type PeerDestinoLike } from "../pantalla-destino";
import { RegistroSesiones } from "../registro-sesiones";
import type { RespuestaOrden } from "../orden";
import { trocear } from "../senal-partes";
import { latidoDeCuadros } from "../pantalla-origen";

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

describe("S1/S2/S4 · dos ventanas de la misma neurona comparten UNA sesión", () => {
    it("la segunda no manda otra `abrir-sesion`; al cerrar la primera NO se manda `cerrar-sesion`; al cerrar la última sí, con su token", async () => {
        const reg = new RegistroSesiones();
        const a = montar(reg);
        await enVivo(a);
        const b = montar(reg);
        await b.iniciar();
        expect(enviadas.filter((e) => e.nombre === "abrir-sesion")).toHaveLength(1);
        await a.cerrar("cerrada-por-la-persona");
        expect(enviadas.some((e) => e.nombre === "cerrar-sesion")).toBe(false);
        await b.cerrar("cerrada-por-la-persona");
        expect(enviadas.filter((e) => e.nombre === "cerrar-sesion")).toEqual([{ nombre: "cerrar-sesion", sesion: TOKEN }]);
    });

    it("la hora máxima del aparato queda en la instantánea (para la cuenta atrás)", async () => {
        const a = montar(new RegistroSesiones());
        await enVivo(a);
        expect(a.instantanea().caduca).toBe(Date.now() + 3 * 60_000);
    });
});

describe("S6 · «repetida»", () => {
    it("una lectura lenta por el relé no se cruza con la entrada: la tecla se firma DESPUÉS de que la lectura salió y volvió", async () => {
        const a = montar(new RegistroSesiones());
        await enVivo(a);
        demoras["leer-aparato"] = 600;
        await vi.advanceTimersByTimeAsync(5000); // empieza la lectura de los 5 s
        a.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(2000);
        const i = eventos.lastIndexOf("firmar:tecla");
        expect(i).toBeGreaterThan(eventos.lastIndexOf("mandar:leer-aparato"));
        expect(i).toBeGreaterThan(eventos.lastIndexOf("respuesta:leer-aparato"));
    });

    it("«repetida» no se pierde: la orden de la persona se manda otra vez UNA vez (otro seq) y sin avisar de nada", async () => {
        const a = montar(new RegistroSesiones());
        await enVivo(a);
        a.enviar({ tipo: "tecla", cual: "inicio" });
        await vi.advanceTimersByTimeAsync(50);
        expect(peer.canal.enviados).toHaveLength(1);
        responder(peer.canal.enviados[0].nonce, { motivo: "repetida" });
        await vi.advanceTimersByTimeAsync(50);
        expect(peer.canal.enviados).toHaveLength(2);
        expect(a.instantanea().motivo).toBeUndefined();
        responder(peer.canal.enviados[1].nonce, { motivo: "repetida" }); // la segunda vez ya no se insiste: se dice
        await vi.advanceTimersByTimeAsync(50);
        expect(peer.canal.enviados).toHaveLength(2);
        expect(a.instantanea().motivo).toBe("repetida");
    });

    it("«limite» también se reenvía una vez, pasado un momento", async () => {
        const a = montar(new RegistroSesiones());
        await enVivo(a);
        a.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(50);
        responder(peer.canal.enviados[0].nonce, { motivo: "limite" });
        await vi.advanceTimersByTimeAsync(REINTENTO_LIMITE_MS + 100);
        expect(peer.canal.enviados).toHaveLength(2);
    });
});

describe("S9 · avisos", () => {
    it("un aviso de una orden rechazada («regla-g») se quita en cuanto la siguiente orden se cumple", async () => {
        const a = montar(new RegistroSesiones());
        await enVivo(a);
        a.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(50);
        responder(peer.canal.enviados[0].nonce, { motivo: "regla-g" });
        expect(a.instantanea()).toMatchObject({ estado: "en-vivo", motivo: "regla-g" });
        a.enviar({ tipo: "tecla", cual: "inicio" });
        await vi.advanceTimersByTimeAsync(50);
        responder(peer.canal.enviados[1].nonce, { ok: true, motivo: "ok" });
        expect(a.instantanea().motivo).toBeUndefined();
    });

    it("«sin-sesion» cierra la ventana con su motivo y olvida la sesión para no reutilizarla", async () => {
        const reg = new RegistroSesiones();
        const a = montar(reg);
        await enVivo(a);
        a.enviar({ tipo: "tecla", cual: "atras" });
        await vi.advanceTimersByTimeAsync(50);
        responder(peer.canal.enviados[0].nonce, { motivo: "sin-sesion" });
        await vi.advanceTimersByTimeAsync(50);
        expect(a.instantanea()).toMatchObject({ estado: "cerrada", motivo: "sin-sesion" });
        expect(reg.tokenDe("tableta")).toBeNull();
    });
});

describe("S8 · latido de cuadros", () => {
    it("con la pantalla quieta se vuelve a pedir el último cuadro cada ≤2 s; pintar lo retrasa; parar lo detiene", () => {
        let t = 0;
        const pedir = vi.fn();
        const l = latidoDeCuadros(pedir, () => t, 1500);
        for (let s = 0; s < 6; s++) {
            t += 500;
            vi.advanceTimersByTime(500);
        }
        expect(pedir.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(pedir.mock.calls.length).toBeLessThanOrEqual(3);
        const n = pedir.mock.calls.length;
        t += 400;
        l.tocado(); // llegó un cuadro de verdad: el latido espera
        vi.advanceTimersByTime(400);
        expect(pedir.mock.calls.length).toBe(n);
        l.parar();
        t += 5000;
        vi.advanceTimersByTime(5000);
        expect(pedir.mock.calls.length).toBe(n);
    });
});
