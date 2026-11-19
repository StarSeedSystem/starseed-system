/**
 * RST1116A · pruebas de la petición de fuente (proyección) en pantalla-iniciar:
 * - si se pide "proyeccion", se pasa a lo nativo; si no, no se manda (igual que hoy)
 * - lo que se devuelve y guarda es lo que CONTESTA lo nativo (r.fuente)
 * - si se pidió proyeccion y lo nativo contesta otra cosa, el resultado lleva fuente_pedida: "proyeccion"
 */
import { beforeEach, describe, expect, it } from "vitest";
import { OrigenPantalla, type DepsOrigen, type SesionViva, type PeerLike, type Pintor } from "../pantalla-origen";
import type { RespuestaOrden } from "../orden";

const SESION: SesionViva = { token: "a".repeat(32), de: "h".repeat(64), nivel: "controlar" };
const ctx = (nivel = "controlar", sobre: unknown = { v: 1, carga: "c", firma: "f" }) => ({ sobre, sesion: { token: SESION.token, nivel } });
const pausa = (ms = 2) => new Promise<void>((r) => setTimeout(r, ms));
async function hasta(c: () => boolean, ms = 1500) {
    const t0 = Date.now();
    while (!c()) {
        if (Date.now() - t0 > ms) throw new Error("no llegó a cumplirse");
        await pausa(2);
    }
}

class PeerFalso implements PeerLike {
    iceGatheringState = "complete";
    localDescription: { type?: string; sdp?: string } | null = null;
    connectionState = "new";
    onicegatheringstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    ondatachannel: import("../pantalla-origen").PeerLike["ondatachannel"] = null;
    pistas: unknown[] = [];
    remota: { type: string; sdp: string } | null = null;
    candidatos: { candidate: string; sdpMLineIndex?: number }[] = [];
    cerrada = false;
    addTrack(p: unknown) { this.pistas.push(p); return {}; }
    async setRemoteDescription(d: { type: string; sdp: string }) { this.remota = d; }
    async createAnswer() { return { type: "answer", sdp: "v=0\r\nrespuesta" }; }
    async setLocalDescription(d?: unknown) { this.localDescription = d as { sdp?: string }; }
    async addIceCandidate(c: { candidate: string; sdpMLineIndex?: number }) { this.candidatos.push(c); }
    close() { this.cerrada = true; }
}

class PintorFalso implements Pintor {
    pintados: { ancho: number; alto: number; bytes: number }[] = [];
    enCurso = 0;
    maxEnCurso = 0;
    liberado = false;
    resultado = true;
    async pintar(j: Uint8Array, ancho: number, alto: number) {
        this.enCurso++;
        this.maxEnCurso = Math.max(this.maxEnCurso, this.enCurso);
        await pausa(3);
        this.enCurso--;
        this.pintados.push({ ancho, alto, bytes: j.length });
        return this.resultado;
    }
    pista() { return { pista: true }; }
    flujo() { return { flujo: true }; }
    liberar() { this.liberado = true; }
}

let llamadas: { cmd: string; args?: Record<string, unknown> }[];
let respuestas: Record<string, unknown>;
let viva: SesionViva | null;
let peer: PeerFalso;
let pintor: PintorFalso;
let ahora: number;
let recibidos: unknown[];
let origen: OrigenPantalla;

function montar(sinInvocar = false) {
    origen = new OrigenPantalla({
        invocar: sinInvocar
            ? null
            : async (cmd, args) => {
                  llamadas.push({ cmd, args });
                  if (cmd in respuestas) {
                      const r = respuestas[cmd];
                      if (r instanceof Error) throw r;
                      return r;
                  }
                  return { ok: true };
              },
        iceServers: async () => [{ urls: "stun:x" }],
        crearPeer: () => peer,
        crearPintor: () => pintor,
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
    peer = new PeerFalso();
    pintor = new PintorFalso();
    ahora = 1_000_000;
    recibidos = [];
    montar();
});

const n = (cmd: string) => llamadas.filter((l) => l.cmd === cmd);

describe("RST1116A · pantalla-iniciar con petición de fuente", () => {
    it("sin fuente (o auto) no manda fuente a lo nativo (igual que hoy)", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000 }, ctx())) as Record<string, unknown>;
        const args = n("control_pantalla_iniciar")[0].args;
        expect(args).not.toHaveProperty("fuente"); // no se manda "auto"
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect(r).not.toHaveProperty("fuente_pedida");
        await origen.parar("fin");
    });

    it("con fuente: 'proyeccion' la pasa a lo nativo como 'proyeccion'", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        const args = n("control_pantalla_iniciar")[0].args;
        expect(args).toEqual({ sesion: SESION.token, lado_max: 1000, calidad: 60, fuente: "proyeccion" });
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" }); // lo nativo contestó accesibilidad
        expect(r).toMatchObject({ fuente_pedida: "proyeccion" }); // se pidió proyección pero no se concedió
        await origen.parar("fin");
    });

    it("si lo nativo contesta proyeccion, el resultado dice proyeccion (sin fuente_pedida)", async () => {
        respuestas.control_pantalla_iniciar = { ok: true, fuente: "proyeccion", ancho: 800, alto: 1280, giro: 0 };
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "proyeccion" }, ctx())) as Record<string, unknown>;
        expect(r).toMatchObject({ ok: true, fuente: "proyeccion" });
        expect(r).not.toHaveProperty("fuente_pedida");
        await origen.parar("fin");
    });

    it("con fuente: 'auto' no manda fuente a lo nativo", async () => {
        const r = (await origen.ejecutar("pantalla-iniciar", { lado: 1000, fuente: "auto" }, ctx())) as Record<string, unknown>;
        const args = n("control_pantalla_iniciar")[0].args;
        expect(args).not.toHaveProperty("fuente");
        expect(r).toMatchObject({ ok: true, fuente: "accesibilidad" });
        expect(r).not.toHaveProperty("fuente_pedida");
        await origen.parar("fin");
    });
});