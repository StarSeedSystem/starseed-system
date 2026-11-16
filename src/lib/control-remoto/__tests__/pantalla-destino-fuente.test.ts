/**
 * RST1116A · la petición de fuente llega a la orden «pantalla-iniciar» y la instantánea dice la fuente real.
 * Pruebas puras de validación y del cableado en PantallaDestino.
 */
import { describe, expect, it } from "vitest";
import { validarPantallaIniciar } from "../niveles";
import { PantallaDestino, type DepsDestino, type InstantaneaPantalla } from "../pantalla-destino";
import type { RespuestaOrden } from "../orden";

const TOKEN = "a".repeat(32);
const CAPS = { entrada: { gestos: true, max_dedos: 10, teclas: ["atras", "inicio"], volumen: true, brillo: true, texto: true } };

function crearFalsos() {
    let enviadas: { nombre: string; args: Record<string, unknown>; nivel: string; sesion: unknown }[] = [];
    let guion: Record<string, (args: Record<string, unknown>) => RespuestaOrden> = {};
    const ok = (resultado?: unknown): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: true, motivo: "ok", resultado });
    const no = (motivo: string): RespuestaOrden => ({ tipo: "respuesta", nonce: "n", ok: false, motivo });

    class PeerFalso {
        localDescription: { sdp?: string } | null = null;
        connectionState = "new";
        onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null = null;
        ontrack: ((e: { track: unknown; streams?: unknown[] }) => void) | null = null;
        onconnectionstatechange: (() => void) | null = null;
        transceptores: unknown[] = [];
        canal: { readyState: string; onmessage: ((e: { data: unknown }) => void) | null; send: (d: string) => void; close: () => void } = {
            readyState: "open",
            onmessage: null,
            send: () => {},
            close: () => {},
        };
        remota: { type: string; sdp: string } | null = null;
        cerrada = false;
        decodificados = 0;
        addTransceiver(t: string, init: { direction: string }) { this.transceptores.push([t, init]); return {}; }
        createDataChannel() { return this.canal; }
        async createOffer() { return { type: "offer", sdp: "v=0\r\noferta" }; }
        async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
        async setRemoteDescription(d: { type: string; sdp: string }) { this.remota = d; }
        async getStats() {
            const filas = [{ type: "inbound-rtp", kind: "video", framesDecoded: this.decodificados }, { type: "candidate-pair", nominated: true, currentRoundTripTime: 0.04 }];
            return { forEach: (cb: (v: Record<string, unknown>) => void) => filas.forEach(cb) };
        }
        close() { this.cerrada = true; }
        conectar() { this.connectionState = "connected"; this.onconnectionstatechange?.(); }
    }

    const deps: DepsDestino = {
        mandar: async (nombre, args, o) => {
            enviadas.push({ nombre, args, nivel: o.nivel, sesion: o.sesion });
            return (guion[nombre] ?? (() => ok()))(args);
        },
        firmar: async () => null,
        iceServers: async () => [],
        crearPeer: () => new PeerFalso(),
        flujoDe: () => null,
        ahora: () => Date.now(),
        anotar: () => {},
    };

    return { deps, enviadas, guion, ok, no };
}

describe("RST1116A · validarPantallaIniciar acepta fuente", () => {
    it("acepta { fuente: \"proyeccion\" }", () => {
        const r = validarPantallaIniciar({ fuente: "proyeccion" });
        expect(r).toEqual({ fuente: "proyeccion" });
    });
    it("acepta { fuente: \"auto\" }", () => {
        const r = validarPantallaIniciar({ fuente: "auto" });
        expect(r).toEqual({ fuente: "auto" });
    });
    it("acepta { lado: 800, fuente: \"proyeccion\" }", () => {
        const r = validarPantallaIniciar({ lado: 800, fuente: "proyeccion" });
        expect(r).toEqual({ lado: 800, fuente: "proyeccion" });
    });
    it("rechaza { fuente: \"otra\" }", () => {
        const r = validarPantallaIniciar({ fuente: "otra" });
        expect(r).toBeNull();
    });
    it("rechaza { fuente: 1 }", () => {
        const r = validarPantallaIniciar({ fuente: 1 });
        expect(r).toBeNull();
    });
    it("rechaza { fuente: \"accesibilidad\" }", () => {
        const r = validarPantallaIniciar({ fuente: "accesibilidad" });
        expect(r).toBeNull();
    });
    it("rechaza claves extra", () => {
        const r = validarPantallaIniciar({ fuente: "proyeccion", extra: true });
        expect(r).toBeNull();
    });
});

describe("RST1116A · PantallaDestino manda fuente en la orden", () => {
    it("con fuente \"proyeccion\" manda { fuente: \"proyeccion\" }", async () => {
        const { deps, enviadas, guion, ok } = crearFalsos();
        guion["abrir-sesion"] = () => ok({ sesion: TOKEN, nivel: "ver" });
        guion["pantalla-iniciar"] = () => ok({ ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });

        const destino = new PantallaDestino("neurona-tableta", deps, { fuente: "proyeccion" });
        await destino.iniciar();

        const orden = enviadas.find((e) => e.nombre === "pantalla-iniciar");
        expect(orden).toBeDefined();
        expect(orden!.args).toEqual({ fuente: "proyeccion" });
    });

    it("con fuente \"auto\" no manda el campo fuente", async () => {
        const { deps, enviadas, guion, ok } = crearFalsos();
        guion["abrir-sesion"] = () => ok({ sesion: TOKEN, nivel: "ver" });
        guion["pantalla-iniciar"] = () => ok({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });

        const destino = new PantallaDestino("neurona-tableta", deps, { fuente: "auto" });
        await destino.iniciar();

        const orden = enviadas.find((e) => e.nombre === "pantalla-iniciar");
        expect(orden).toBeDefined();
        expect(orden!.args).toEqual({});
    });

    it("sin opción fuente (por defecto) no manda el campo", async () => {
        const { deps, enviadas, guion, ok } = crearFalsos();
        guion["abrir-sesion"] = () => ok({ sesion: TOKEN, nivel: "ver" });
        guion["pantalla-iniciar"] = () => ok({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });

        const destino = new PantallaDestino("neurona-tableta", deps);
        await destino.iniciar();

        const orden = enviadas.find((e) => e.nombre === "pantalla-iniciar");
        expect(orden).toBeDefined();
        expect(orden!.args).toEqual({});
    });
});

describe("RST1116A · InstantaneaPantalla refleja la fuente real", () => {
    it("fuente \"proyeccion\" en el resultado → instantánea.fuente = \"proyeccion\"", async () => {
        const { deps, guion, ok } = crearFalsos();
        guion["abrir-sesion"] = () => ok({ sesion: TOKEN, nivel: "ver" });
        guion["pantalla-iniciar"] = () => ok({ ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });

        const destino = new PantallaDestino("neurona-tableta", deps);
        await destino.iniciar();

        expect(destino.instantanea().fuente).toBe("proyeccion");
    });

    it("fuente \"accesibilidad\" en el resultado → instantánea.fuente = \"accesibilidad\"", async () => {
        const { deps, guion, ok } = crearFalsos();
        guion["abrir-sesion"] = () => ok({ sesion: TOKEN, nivel: "ver" });
        guion["pantalla-iniciar"] = () => ok({ ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });

        const destino = new PantallaDestino("neurona-tableta", deps);
        await destino.iniciar();

        expect(destino.instantanea().fuente).toBe("accesibilidad");
    });

    it("fuente basura en el resultado → instantánea no tiene fuente", async () => {
        const { deps, guion, ok } = crearFalsos();
        guion["abrir-sesion"] = () => ok({ sesion: TOKEN, nivel: "ver" });
        guion["pantalla-iniciar"] = () => ok({ ok: true, fuente: "rara", ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });

        const destino = new PantallaDestino("neurona-tableta", deps);
        await destino.iniciar();

        expect(destino.instantanea().fuente).toBeUndefined();
    });

    it("sin fuente en el resultado → instantánea no tiene fuente", async () => {
        const { deps, guion, ok } = crearFalsos();
        guion["abrir-sesion"] = () => ok({ sesion: TOKEN, nivel: "ver" });
        guion["pantalla-iniciar"] = () => ok({ ok: true, ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });

        const destino = new PantallaDestino("neurona-tableta", deps);
        await destino.iniciar();

        expect(destino.instantanea().fuente).toBeUndefined();
    });

    it("fuente null en el resultado → instantánea no tiene fuente", async () => {
        const { deps, guion, ok } = crearFalsos();
        guion["abrir-sesion"] = () => ok({ sesion: TOKEN, nivel: "ver" });
        guion["pantalla-iniciar"] = () => ok({ ok: true, fuente: null, ancho: 800, alto: 1280, giro: 0, capacidades: CAPS });

        const destino = new PantallaDestino("neurona-tableta", deps);
        await destino.iniciar();

        expect(destino.instantanea().fuente).toBeUndefined();
    });
});