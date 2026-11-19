/**
 * RST1116A · la petición de fuente llega a lo nativo y se devuelve la fuente real
 * Con invocador simulado: si se pide "proyeccion" la orden lleva fuente; si no, no la lleva.
 * La fuente que se guarda y se devuelve SIEMPRE es la que contesta lo nativo (r.fuente), nunca la pedida.
 * Si se pidió proyeccion y lo nativo contesta otra cosa, el resultado lleva fuente_pedida: "proyeccion" además de la real.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type SesionViva } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = (sobre: unknown = { v: 1, carga: "c", firma: "f" }) => ({ sobre, sesion: { token: SESION.token, nivel: "controlar" } });
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));

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
        crearPeer: () => { throw new Error("sin peer"); },
        crearPintor: () => ({ async pintar() { return true; }, pista: () => ({}), flujo: () => ({}), liberar: () => {} }),
        sesionViva: () => viva,
        recibirSobre: async (s) => {
            recibidos.push(s);
            return { tipo: "respuesta", nonce: String((s as { n?: string }).n ?? ""), ok: true, motivo: "ok" } as RespuestaOrden;
        },
        esperar: (ms) => pausa(Math.min(ms, 3)),
        ahora: () => ahora,
        anotar: () => undefined,
    } satisfies DepsOrigen);
}

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

const n = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);

describe("RST1116A · la fuente pedida llega a lo nativo", () => {
    it("con fuente: \"proyeccion\" la orden lleva fuente: \"proyeccion\"", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        const args = n("control_pantalla_iniciar")[0].args;
        expect(args).toHaveProperty("fuente", "proyeccion");
        expect(r.ok).toBe(true);
    });

    it("sin fuente (o \"auto\") la orden NO lleva el campo fuente", async () => {
        for (const args of [{}, { fuente: "auto" }]) {
            llamadas = [];
            const r = (await origen.ejecutar("pantalla-iniciar", args, ctx())) as Record<string, unknown>;
            const a = n("control_pantalla_iniciar")[0].args;
            expect(a).not.toHaveProperty("fuente");
            expect(r.ok).toBe(true);
        }
    });
});

describe("RST1116A · la respuesta dice la fuente REAL que contestó lo nativo", () => {
    it("si lo nativo contesta accesibilidad, el resultado dice fuente: \"accesibilidad\" y fuente_pedida: \"proyeccion\"", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r.fuente).toBe("accesibilidad");
        expect(r.fuente_pedida).toBe("proyeccion");
    });

    it("si lo nativo contesta proyeccion, el resultado dice fuente: \"proyeccion\" (sin fuente_pedida)", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r.fuente).toBe("proyeccion");
        expect("fuente_pedida" in r).toBe(false);
    });

    it("si no se pidió proyeccion, no hay fuente_pedida aunque lo nativo diga accesibilidad", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "accesibilidad", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", {}, ctx())) as Record<string, unknown>;
        expect(r.fuente).toBe("accesibilidad");
        expect("fuente_pedida" in r).toBe(false);
    });
});