/**
 * PAN1115J · pruebas de la petición de fuente (proyección) en pantalla-iniciar.
 * Con falsos de la costura 1 (Tauri) para el lado controlado.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = (nivel = "controlar", sobre: unknown = { v: 1, carga: "c", firma: "f" }) => ({ sobre, sesion: { token: SESION.token, de: SESION.de, nivel } });
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));
async function hasta(c: () => boolean, ms = 1500) {
    const t0 = Date.now();
    while (!c()) {
        if (Date.now() - t0 > ms) throw new Error("no llegó a cumplirse");
        await pausa(2);
    }
}

let llamadas: { cmd: string; args?: Record<string, unknown> }[];
let respuestas: Record<string, unknown>;
let viva: SesionViva | null;
let ahora: number;
let recibidos: unknown[];
let origen: OrigenPantalla;

function montar() {
    origen = new OrigenPantalla({
        invocar: async (cmd, args) => {
            llamadas.push({ cmd, args });
            if (cmd in respuestas) {
                const r = respuestas[cmd];
                if (r instanceof Error) throw r;
                return r;
            }
            return { ok: true };
        },
        iceServers: async () => [{ urls: "stun:x" }],
        crearPeer: () => ({ iceGatheringState: "complete", localDescription: null, connectionState: "new", onicegatheringstatechange: null, onconnectionstatechange: null, ondatachannel: null, addTrack: () => {}, setRemoteDescription: async () => {}, createAnswer: async () => ({ type: "answer", sdp: "v=0\r\nrespuesta" }), setLocalDescription: async () => {}, addIceCandidate: async () => {}, close: () => {} }),
        crearPintor: () => ({ async pintar() { return true; }, pista: () => {}, flujo: () => {}, liberar: () => {} }),
        sesionViva: () => viva,
        recibirSobre: async (s) => { recibidos.push(s); return { tipo: "respuesta", nonce: String((s as { n?: string }).n ?? ""), ok: true, motivo: "ok" } as RespuestaOrden; },
        esperar: (ms) => pausa(Math.min(ms, 3)),
        ahora: () => ahora,
        anotar: () => undefined,
    } satisfies DepsOrigen);
}

const n = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);

beforeEach(() => {
    llamadas = [];
    respuestas = {
        control_pantalla_iniciar: { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 },
        control_capacidades: { pantalla: { accesibilidad: true, proyeccion: false, sin_preguntar: true }, entrada: { gestos: true, max_dedos: 10, teclas: ["atras"], volumen: true, brillo: true, texto: true }, falta: [] },
        control_estado_aparato: { brillo: 0.5, bateria: 0.8 },
        control_entrada: { ok: true },
    };
    viva = { ...SESION };
    ahora = 1_000_000;
    recibidos = [];
    montar();
});

describe("pantalla-iniciar con fuente", () => {
    it("sin fuente en args pasa 'auto' a lo nativo", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000 }, ctx())) as Record<string, unknown>;
        expect(n("control_pantalla_iniciar")[0].args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "auto" });
        expect(r.fuente).toBe("accesibilidad");
        expect(r.fuente_pedida).toBeUndefined();
        await origen.parar("fin");
    });

    it("con fuente: 'auto' pasa 'auto' a lo nativo", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "auto" }, ctx())) as Record<string, unknown>;
        expect(n("control_pantalla_iniciar")[0].args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "auto" });
        expect(r.fuente).toBe("accesibilidad");
        expect(r.fuente_pedida).toBeUndefined();
        await origen.parar("fin");
    });

    it("con fuente: 'proyeccion' pide 'auto' al nativo y marca fuente_pedida", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        const iniciarCalls = n("control_pantalla_iniciar");
        expect(iniciarCalls[0]?.args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "auto" });
        expect(r.fuente).toBe("accesibilidad");
        expect(r.fuente_pedida).toBe("proyeccion");
        await origen.parar("fin");
    });

    it("si lo nativo concede proyección, devuelve proyección sin fuente_pedida", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        const iniciarCalls = n("control_pantalla_iniciar");
        expect(iniciarCalls[0]?.args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "auto" });
        expect(r.fuente).toBe("proyeccion");
        expect(r.fuente_pedida).toBeUndefined();
        await origen.parar("fin");
    });

    it("si lo nativo falla, devuelve el error y no arranca", async () => {
        respuestas.control_pantalla_iniciar = { ok: false, motivo: "sin-servicio", falta: ["servicio-accesibilidad"] };
        const r = await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx());
        expect(r).toEqual({ ok: false, motivo: "sin-servicio", falta: ["servicio-accesibilidad"] });
        expect(origen.enMarcha()).toBe(false);
    });
});